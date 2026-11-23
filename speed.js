/* Internet speed test: ping, jitter, download and upload.
 *
 * Runs against Cloudflare's public speed-test servers, and only after the visitor
 * presses Start. Results are measured in the browser. The only thing stored is a
 * short list of recent results on this device. */
(function () {
    "use strict";

    var BASE = "https://speed.cloudflare.com";
    var HISTORY_KEY = "tools:speed-history";
    var MAX_HISTORY = 8;

    var CONFIG = {
        full: {
            ping: 10,
            download: { ms: 8000, skip: 1500, streams: 4, cap: 300e6, chunk: 25e6 },
            upload: { ms: 6000, skip: 1200, streams: 3, cap: 100e6, chunk: 4 * 1024 * 1024 },
        },
        quick: {
            ping: 6,
            download: { ms: 4000, skip: 1000, streams: 3, cap: 30e6, chunk: 10e6 },
            upload: { ms: 3000, skip: 800, streams: 2, cap: 12e6, chunk: 2 * 1024 * 1024 },
        },
    };

    function $(id) { return document.getElementById(id); }

    var startBtn = $("start");
    var cancelBtn = $("cancel");
    var quick = $("quick");
    var message = $("speed-message");
    var phaseLabel = $("phase-label");
    var phases = $("phases");
    var gaugeFill = $("gauge-fill");
    var gaugeNumber = $("gauge-number");
    var gaugeUnit = $("gauge-unit");
    var results = $("results");
    var verdict = $("verdict");
    var canDo = $("can-do");
    var copyBtn = $("copy");
    var historyBox = $("history");
    var historyList = $("history-list");
    var clearHistoryBtn = $("clear-history");

    var controller = null;
    var running = false;
    var last = null;

    // People who turned on Data Saver start with the shorter test
    if (navigator.connection && navigator.connection.saveData) quick.checked = true;

    /* ---------- Helpers ---------- */

    function rand() { return Math.random().toString(36).slice(2); }

    function setGauge(mbps, unit) {
        // Logarithmic, so both 5 Mbps and 500 Mbps move the needle visibly
        var frac = Math.min(1, Math.log10(1 + Math.max(0, mbps)) / 3);
        gaugeFill.style.strokeDashoffset = String(100 * (1 - frac));
        gaugeNumber.textContent = mbps >= 100 ? String(Math.round(mbps)) : mbps.toFixed(1);
        gaugeUnit.textContent = unit || "Mbps";
    }

    function setPhase(name, label) {
        phases.querySelectorAll("li").forEach(function (li) {
            var order = ["latency", "download", "upload"];
            var idx = order.indexOf(li.dataset.phase);
            var cur = order.indexOf(name);
            li.classList.toggle("is-active", li.dataset.phase === name);
            li.classList.toggle("is-done", cur === -1 ? name === "done" : idx < cur);
        });
        phaseLabel.textContent = label;
    }

    function showMessage(text) { message.textContent = text || ""; }

    function median(values) {
        var s = values.slice().sort(function (a, b) { return a - b; });
        var m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    /* Speed over the most recent second, for the live gauge */
    function recentMbps(samples) {
        if (samples.length < 2) return 0;
        var now = samples[samples.length - 1];
        var then = samples[0];
        for (var i = samples.length - 1; i >= 0; i--) {
            if (now[0] - samples[i][0] >= 1000) { then = samples[i]; break; }
        }
        var dt = (now[0] - then[0]) / 1000;
        return dt > 0 ? ((now[1] - then[1]) * 8) / dt / 1e6 : 0;
    }

    /* Final speed: ignore the ramp-up at the start, average the rest */
    function finalMbps(samples, skip) {
        if (samples.length < 2) return 0;
        var end = samples[samples.length - 1];
        var begin = samples[0];
        for (var i = 0; i < samples.length; i++) {
            if (samples[i][0] >= skip) { begin = samples[i]; break; }
        }
        if (end[0] - begin[0] < 500) begin = samples[0]; // too short to skip anything
        var dt = (end[0] - begin[0]) / 1000;
        return dt > 0 ? ((end[1] - begin[1]) * 8) / dt / 1e6 : 0;
    }

    /* ---------- Ping and jitter ---------- */

    async function measurePing(count, signal) {
        var times = [];
        for (var i = 0; i < count + 1; i++) {
            var t0 = performance.now();
            var res = await fetch(BASE + "/__down?bytes=0&_=" + rand(), { cache: "no-store", signal: signal });
            await res.arrayBuffer();
            var dt = performance.now() - t0;
            if (i > 0) times.push(dt); // the first one pays for the connection set-up
            setGauge(dt, "ms");
        }
        var jitter = 0;
        for (var j = 1; j < times.length; j++) jitter += Math.abs(times[j] - times[j - 1]);
        return { ping: median(times), jitter: times.length > 1 ? jitter / (times.length - 1) : 0 };
    }

    /* ---------- Download ---------- */

    async function measureDownload(cfg, signal) {
        var start = performance.now();
        var total = 0;
        var samples = [[0, 0]];
        var inner = new AbortController();
        var onAbort = function () { inner.abort(); };
        signal.addEventListener("abort", onAbort);

        async function stream() {
            while (!inner.signal.aborted && performance.now() - start < cfg.ms && total < cfg.cap) {
                try {
                    var res = await fetch(BASE + "/__down?bytes=" + cfg.chunk + "&_=" + rand(), { cache: "no-store", signal: inner.signal });
                    if (!res.ok) throw new Error("http");
                    var reader = res.body.getReader();
                    for (;;) {
                        var step = await reader.read();
                        if (step.done) break;
                        total += step.value.length;
                    }
                } catch (e) {
                    if (inner.signal.aborted) return;
                    throw e;
                }
            }
        }

        var ticker = setInterval(function () {
            var t = performance.now() - start;
            samples.push([t, total]);
            setGauge(recentMbps(samples));
            if (t >= cfg.ms || total >= cfg.cap) inner.abort();
        }, 100);

        try {
            var workers = [];
            for (var i = 0; i < cfg.streams; i++) workers.push(stream());
            await Promise.all(workers);
        } finally {
            clearInterval(ticker);
            signal.removeEventListener("abort", onAbort);
        }

        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        samples.push([performance.now() - start, total]);
        if (!total) throw new Error("no data");
        return finalMbps(samples, cfg.skip);
    }

    /* ---------- Upload ---------- */

    function measureUpload(cfg, signal) {
        return new Promise(function (resolve, reject) {
            var payload = new Blob([new Uint8Array(cfg.chunk)]);
            var start = performance.now();
            var sent = 0;
            var inflight = new Map();
            var samples = [[0, 0]];
            var finished = false;

            function totalNow() {
                var n = sent;
                inflight.forEach(function (loaded) { n += loaded; });
                return n;
            }

            function finish(error) {
                if (finished) return;
                finished = true;
                clearInterval(ticker);
                signal.removeEventListener("abort", onAbort);
                inflight.forEach(function (_, xhr) { xhr.abort(); });
                if (error) return reject(error);

                samples.push([performance.now() - start, totalNow()]);
                if (!totalNow()) return reject(new Error("no data"));
                resolve(finalMbps(samples, cfg.skip));
            }

            function onAbort() { finish(new DOMException("Aborted", "AbortError")); }
            signal.addEventListener("abort", onAbort);

            function launch() {
                if (finished) return;
                var xhr = new XMLHttpRequest();
                xhr.open("POST", BASE + "/__up?_=" + rand());
                inflight.set(xhr, 0);
                xhr.upload.onprogress = function (e) { inflight.set(xhr, e.loaded); };
                xhr.onload = function () {
                    if (xhr.status >= 400) return finish(new Error("http"));
                    sent += payload.size;
                    inflight.delete(xhr);
                    if (!finished && performance.now() - start < cfg.ms && totalNow() < cfg.cap) launch();
                };
                xhr.onerror = function () { finish(new Error("network")); };
                xhr.send(payload);
            }

            var ticker = setInterval(function () {
                var t = performance.now() - start;
                samples.push([t, totalNow()]);
                setGauge(recentMbps(samples));
                if (t >= cfg.ms || totalNow() >= cfg.cap) finish();
            }, 100);

            for (var i = 0; i < cfg.streams; i++) launch();
        });
    }

    /* ---------- Results ---------- */

    function fmt(value, digits) {
        return value >= 100 ? String(Math.round(value)) : value.toFixed(digits);
    }

    function showResults(r) {
        results.hidden = false;
        $("r-download").textContent = fmt(r.download, 1);
        $("r-upload").textContent = fmt(r.upload, 1);
        $("r-ping").textContent = String(Math.round(r.ping));
        $("r-jitter").textContent = r.jitter < 10 ? r.jitter.toFixed(1) : String(Math.round(r.jitter));

        var checks = [
            { ok: r.download >= 3 && r.upload >= 2, label: "Video calls" },
            { ok: r.download >= 5, label: "HD streaming" },
            { ok: r.download >= 25, label: "4K streaming" },
            { ok: r.ping <= 60 && r.jitter <= 20, label: "Online gaming" },
        ];
        canDo.innerHTML = "";
        checks.forEach(function (c) {
            var li = document.createElement("li");
            li.className = c.ok ? "yes" : "no";
            var mark = document.createElement("span");
            mark.className = "mark";
            mark.setAttribute("aria-hidden", "true");
            mark.textContent = c.ok ? "✓" : "✕";
            var text = document.createElement("span");
            text.textContent = c.label + (c.ok ? "" : " may struggle");
            li.append(mark, text);
            canDo.appendChild(li);
        });
        verdict.hidden = false;
    }

    function loadHistory() {
        try {
            var list = JSON.parse(localStorage.getItem(HISTORY_KEY));
            return Array.isArray(list) ? list : [];
        } catch (e) { return []; }
    }

    function saveHistory(list) {
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY))); } catch (e) { /* ignore */ }
    }

    function renderHistory() {
        var list = loadHistory().filter(function (h) {
            return h && Number.isFinite(h.t) && Number.isFinite(h.download) && Number.isFinite(h.upload) && Number.isFinite(h.ping);
        });
        historyBox.hidden = list.length === 0;
        historyList.innerHTML = "";

        list.forEach(function (h) {
            var li = document.createElement("li");
            var when = document.createElement("span");
            when.className = "h-when";
            when.textContent = new Date(h.t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
            var nums = document.createElement("span");
            nums.className = "h-nums";
            nums.textContent = "↓ " + fmt(h.download, 1) + "  ↑ " + fmt(h.upload, 1) + " Mbps  ·  " + Math.round(h.ping) + " ms";
            li.append(when, nums);
            historyList.appendChild(li);
        });
    }

    /* ---------- Running the test ---------- */

    function setRunning(on) {
        running = on;
        startBtn.hidden = on;
        cancelBtn.hidden = !on;
        quick.disabled = on;
    }

    async function runTest() {
        if (running) return;
        showMessage("");

        if (navigator.onLine === false) {
            showMessage("You’re offline. Connect to the internet and try again.");
            return;
        }

        var cfg = quick.checked ? CONFIG.quick : CONFIG.full;
        controller = new AbortController();
        var signal = controller.signal;

        setRunning(true);
        results.hidden = true;
        setGauge(0);

        try {
            setPhase("latency", "Checking ping…");
            var p = await measurePing(cfg.ping, signal);

            setPhase("download", "Testing download…");
            setGauge(0);
            var down = await measureDownload(cfg.download, signal);
            setGauge(down);

            setPhase("upload", "Testing upload…");
            setGauge(0);
            var up = await measureUpload(cfg.upload, signal);

            last = { t: Date.now(), download: down, upload: up, ping: p.ping, jitter: p.jitter };
            setPhase("done", "Done");
            setGauge(down);
            showResults(last);

            var list = loadHistory();
            list.unshift(last);
            saveHistory(list);
            renderHistory();
        } catch (error) {
            if (error && error.name === "AbortError") {
                setPhase("", "Test stopped.");
            } else {
                setPhase("", "The test couldn’t finish.");
                showMessage("We couldn’t reach the speed test servers. Check your connection, or turn off any ad blocker or VPN for this page, and try again.");
            }
            setGauge(0);
        } finally {
            controller = null;
            setRunning(false);
            startBtn.textContent = last ? "Test again" : "Start test";
        }
    }

    startBtn.addEventListener("click", runTest);
    cancelBtn.addEventListener("click", function () { if (controller) controller.abort(); });

    copyBtn.addEventListener("click", async function () {
        if (!last) return;
        var text = "ImageSearch speed test: Download " + fmt(last.download, 1) + " Mbps, Upload " + fmt(last.upload, 1) +
            " Mbps, Ping " + Math.round(last.ping) + " ms, Jitter " + (last.jitter < 10 ? last.jitter.toFixed(1) : Math.round(last.jitter)) + " ms";
        try {
            await navigator.clipboard.writeText(text);
            copyBtn.textContent = "Copied";
        } catch (e) {
            copyBtn.textContent = "Couldn’t copy";
        }
        setTimeout(function () { copyBtn.textContent = "Copy results"; }, 1800);
    });

    clearHistoryBtn.addEventListener("click", function () {
        saveHistory([]);
        renderHistory();
    });

    renderHistory();
    setGauge(0);
})();
