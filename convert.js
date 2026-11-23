/* Compress, resize and convert photos. Many at once, with a ZIP download.
 * Everything happens in the browser. */
(function () {
    "use strict";

    var MAX_FILES = 30;
    var MAX_BYTES = 25 * 1024 * 1024;
    var MAX_SOURCE_PIXELS = 100 * 1000 * 1000;
    var MAX_OUTPUT_PIXELS = 16 * 1000 * 1000; // stays under the limit of phone browsers
    var MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    var EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

    function $(id) { return document.getElementById(id); }

    var dropzone = $("dropzone");
    var fileInput = $("file-input");
    var dropMessage = $("drop-message");
    var workspace = $("workspace");
    var summary = $("summary");
    var downloadAllBtn = $("download-all");
    var clearBtn = $("clear");
    var fileList = $("file-list");
    var formatBox = $("format");
    var formatHelp = $("format-help");
    var qualityField = $("quality-field");
    var qualityInput = $("quality");
    var qualityValue = $("quality-value");
    var resizeMode = $("resize-mode");
    var fitFields = $("fit-fields");
    var maxW = $("max-w");
    var maxH = $("max-h");
    var percentField = $("percent-field");
    var percentInput = $("percent");
    var percentValue = $("percent-value");
    var noEnlargeRow = $("no-enlarge-row");
    var noEnlarge = $("no-enlarge");
    var bgField = $("bg-field");
    var bgColor = $("bg-color");

    var items = [];
    var nextId = 1;
    var run = 0;
    var processing = false;
    var format = "jpeg";
    var timer = null;

    var FORMAT_HELP = {
        jpeg: "Best for photos. Gives the smallest files.",
        webp: "Smaller than JPG at the same look. Works in all modern browsers and apps.",
        png: "Lossless, so files stay large. Best for logos, graphics and screenshots.",
    };

    /* ---------- Settings ---------- */

    function num(value) {
        var n = parseInt(value, 10);
        return Number.isFinite(n) && n > 0 ? n : Infinity;
    }

    function readSettings() {
        return {
            format: format,
            quality: parseInt(qualityInput.value, 10),
            mode: resizeMode.value,
            maxW: num(maxW.value),
            maxH: num(maxH.value),
            percent: parseInt(percentInput.value, 10),
            noEnlarge: noEnlarge.checked,
            bg: bgColor.value,
        };
    }

    function syncControls() {
        qualityField.hidden = format === "png";
        bgField.hidden = format !== "jpeg";
        fitFields.hidden = resizeMode.value !== "fit";
        noEnlargeRow.hidden = resizeMode.value !== "fit";
        percentField.hidden = resizeMode.value !== "percent";
        formatHelp.textContent = FORMAT_HELP[format];
        qualityValue.textContent = qualityInput.value + "%";
        percentValue.textContent = percentInput.value + "%";
    }

    function scheduleProcess() {
        syncControls();
        clearTimeout(timer);
        timer = setTimeout(processAll, 350);
    }

    if (!Tools.supportsWebP) {
        var webpBtn = formatBox.querySelector('[data-format="webp"]');
        webpBtn.disabled = true;
        webpBtn.title = "This browser can’t save WebP";
    }

    formatBox.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-format]");
        if (!btn || btn.disabled) return;
        format = btn.dataset.format;
        formatBox.querySelectorAll("[data-format]").forEach(function (b) {
            b.setAttribute("aria-pressed", String(b === btn));
        });
        scheduleProcess();
    });

    [qualityInput, resizeMode, maxW, maxH, percentInput, noEnlarge, bgColor].forEach(function (el) {
        el.addEventListener("input", scheduleProcess);
        el.addEventListener("change", scheduleProcess);
    });

    /* ---------- Converting one photo ---------- */

    /* Shrinks in halves first. It looks much better than one big jump. */
    function resample(source, sw, sh, tw, th, bg) {
        var cur = source, cw = sw, ch = sh;

        while (cw / 2 >= tw && ch / 2 >= th) {
            var nw = Math.max(tw, Math.floor(cw / 2));
            var nh = Math.max(th, Math.floor(ch / 2));
            var step = document.createElement("canvas");
            step.width = nw;
            step.height = nh;
            var sctx = step.getContext("2d");
            sctx.imageSmoothingQuality = "high";
            sctx.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
            if (cur !== source) { cur.width = 0; cur.height = 0; }
            cur = step; cw = nw; ch = nh;
        }

        var out = document.createElement("canvas");
        out.width = tw;
        out.height = th;
        var o = out.getContext("2d");
        o.imageSmoothingQuality = "high";
        if (bg) { o.fillStyle = bg; o.fillRect(0, 0, tw, th); }
        o.drawImage(cur, 0, 0, cw, ch, 0, 0, tw, th);
        if (cur !== source) { cur.width = 0; cur.height = 0; }
        return out;
    }

    async function convertOne(file, s) {
        var bitmap = await Tools.readBitmap(file);
        try {
            var size = Tools.sizeOf(bitmap);
            var sw = size.w, sh = size.h;
            if (!sw || !sh) throw new Error("decode");
            if (sw * sh > MAX_SOURCE_PIXELS) throw new Error("source");

            var ratio = 1;
            if (s.mode === "fit") {
                ratio = Math.min(s.maxW / sw, s.maxH / sh);
                if (!Number.isFinite(ratio)) ratio = 1;
                if (s.noEnlarge) ratio = Math.min(ratio, 1);
            } else if (s.mode === "percent") {
                ratio = s.percent / 100;
            }

            var tw = Math.max(1, Math.round(sw * ratio));
            var th = Math.max(1, Math.round(sh * ratio));
            if (tw * th > MAX_OUTPUT_PIXELS) throw new Error("output");

            var mime = MIME[s.format];
            var canvas = resample(bitmap, sw, sh, tw, th, s.format === "jpeg" ? s.bg : null);
            var blob = await Tools.canvasToBlob(canvas, mime, s.quality / 100);
            canvas.width = 0;
            canvas.height = 0;
            if (!blob) throw new Error("encode");

            return { blob: blob, srcW: sw, srcH: sh, w: tw, h: th };
        } finally {
            if (bitmap.close) bitmap.close();
        }
    }

    var ERRORS = {
        decode: "We couldn’t open this photo.",
        source: "This photo is too large to process here.",
        output: "The result would be too large for this device. Pick a smaller size.",
        encode: "We couldn’t save this photo in that format.",
    };

    function outputName(item, type) {
        var ext = EXT[type] || "png";
        var original = (item.file.name.match(/\.([^.]+)$/) || [])[1];
        var sameFormat = original && original.toLowerCase().replace("jpeg", "jpg") === ext;
        return Tools.baseName(item.file.name) + (sameFormat ? "-min" : "") + "." + ext;
    }

    /* ---------- Processing everything ---------- */

    async function processAll() {
        if (!items.length) { updateSummary(); return; }

        var myRun = ++run;
        var s = readSettings();

        items.forEach(function (item) {
            item.status = "queued";
            item.blob = null;
            item.error = "";
            if (item.resultUrl) { URL.revokeObjectURL(item.resultUrl); item.resultUrl = null; }
            renderItem(item);
        });
        processing = true;
        updateSummary();

        var snapshot = items.slice();
        for (var i = 0; i < snapshot.length; i++) {
            var item = snapshot[i];
            if (run !== myRun) return;           // settings changed: a newer run took over
            if (items.indexOf(item) === -1) continue; // removed while waiting

            item.status = "working";
            renderItem(item);
            updateSummary();

            try {
                var r = await convertOne(item.file, s);
                if (run !== myRun) return;
                item.blob = r.blob;
                item.srcW = r.srcW; item.srcH = r.srcH;
                item.w = r.w; item.h = r.h;
                item.outName = outputName(item, r.blob.type);
                item.resultUrl = URL.createObjectURL(r.blob);
                item.status = "done";
            } catch (error) {
                if (run !== myRun) return;
                item.status = "error";
                item.error = ERRORS[error.message] || "Something went wrong with this photo.";
            }
            renderItem(item);
            updateSummary();
        }

        if (run === myRun) {
            processing = false;
            updateSummary();
        }
    }

    /* ---------- Showing the list ---------- */

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function renderItem(item) {
        var li = item.el;
        if (!li) {
            li = el("li", "file-item");
            li.dataset.id = String(item.id);
            item.el = li;
            fileList.appendChild(li);
        }
        li.innerHTML = "";

        var thumb = el("img", "file-thumb");
        thumb.alt = "";
        thumb.src = item.resultUrl || item.thumb;

        var info = el("div", "file-info");
        var name = el("div", "file-name", item.status === "done" ? item.outName : item.file.name);
        name.title = name.textContent;
        var meta = el("div", "file-meta");

        if (item.status === "done") {
            var saved = 1 - item.blob.size / item.file.size;
            meta.append(
                Tools.formatBytes(item.file.size), el("span", "arrow", "→"), Tools.formatBytes(item.blob.size)
            );
            var badge = el("span", saved >= 0 ? "badge-save" : "badge-save bigger",
                (saved >= 0 ? "−" : "+") + Math.abs(Math.round(saved * 100)) + "%");
            meta.appendChild(badge);
            meta.appendChild(el("div", "", item.srcW + " × " + item.srcH + (item.w !== item.srcW ? " → " + item.w + " × " + item.h : "") + " px"));
        } else if (item.status === "error") {
            meta.appendChild(el("div", "file-error", item.error));
        } else {
            meta.append(Tools.formatBytes(item.file.size) + " · ", el("span", "sk sk-line"));
        }
        info.append(name, meta);

        var actions = el("div", "file-actions");
        if (item.status === "done") {
            var dl = el("button", "btn-secondary btn-small", "Download");
            dl.type = "button";
            dl.dataset.act = "download";
            actions.appendChild(dl);
        }
        var rm = el("button", "icon-btn");
        rm.type = "button";
        rm.dataset.act = "remove";
        rm.setAttribute("aria-label", "Remove " + item.file.name);
        rm.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        actions.appendChild(rm);

        li.append(thumb, info, actions);
    }

    function updateSummary() {
        var done = items.filter(function (i) { return i.status === "done"; });
        var failed = items.filter(function (i) { return i.status === "error"; });
        var finished = done.length + failed.length;

        downloadAllBtn.disabled = done.length === 0;
        downloadAllBtn.textContent = done.length > 1 ? "Download all (ZIP)" : "Download";
        summary.textContent = "";

        if (!items.length) return;

        if (processing && finished < items.length) {
            summary.textContent = "Working on photo " + Math.min(finished + 1, items.length) + " of " + items.length + "…";
            return;
        }

        var before = done.reduce(function (n, i) { return n + i.file.size; }, 0);
        var after = done.reduce(function (n, i) { return n + i.blob.size; }, 0);
        var strong = el("strong", "", done.length + (done.length === 1 ? " photo" : " photos"));
        summary.appendChild(strong);

        if (done.length) {
            var saved = 1 - after / before;
            summary.append(" · " + Tools.formatBytes(before) + " → " + Tools.formatBytes(after) +
                (saved >= 0 ? " · saved " + Math.round(saved * 100) + "%" : " · " + Math.abs(Math.round(saved * 100)) + "% larger"));
        }
        if (failed.length) summary.append(" · " + failed.length + " couldn’t be processed");
    }

    /* ---------- Adding and removing ---------- */

    function addFiles(files) {
        dropMessage.textContent = "";
        var notes = [];

        var images = files.filter(Tools.isImage);
        if (images.length < files.length) notes.push((files.length - images.length) + " file(s) skipped because they aren’t supported images.");

        var small = images.filter(function (f) { return f.size <= MAX_BYTES; });
        if (small.length < images.length) notes.push((images.length - small.length) + " photo(s) skipped because they’re over 25 MB.");

        var room = MAX_FILES - items.length;
        if (small.length > room) {
            notes.push("Only " + MAX_FILES + " photos at a time. The rest were skipped.");
            small = small.slice(0, Math.max(0, room));
        }

        small.forEach(function (file) {
            var item = { id: nextId++, file: file, status: "queued", thumb: URL.createObjectURL(file) };
            items.push(item);
            renderItem(item);
        });

        dropMessage.textContent = notes.join(" ");
        if (!small.length) return;

        workspace.hidden = false;
        dropzone.classList.add("is-compact");
        syncControls();
        clearTimeout(timer);
        timer = setTimeout(processAll, 50);
    }

    function removeItem(item) {
        var index = items.indexOf(item);
        if (index === -1) return;
        items.splice(index, 1);
        URL.revokeObjectURL(item.thumb);
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
        if (item.el) item.el.remove();

        if (!items.length) {
            run++;
            processing = false;
            workspace.hidden = true;
            dropzone.classList.remove("is-compact");
        }
        updateSummary();
    }

    fileList.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-act]");
        if (!btn) return;
        var li = btn.closest(".file-item");
        var item = items.find(function (i) { return String(i.id) === li.dataset.id; });
        if (!item) return;

        if (btn.dataset.act === "download" && item.blob) Tools.download(item.blob, item.outName);
        if (btn.dataset.act === "remove") removeItem(item);
    });

    clearBtn.addEventListener("click", function () {
        items.slice().forEach(removeItem);
        dropMessage.textContent = "";
    });

    downloadAllBtn.addEventListener("click", async function () {
        var done = items.filter(function (i) { return i.status === "done"; });
        if (!done.length) return;

        if (done.length === 1) {
            Tools.download(done[0].blob, done[0].outName);
            return;
        }

        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = "Making ZIP...";
        try {
            var used = {};
            var files = done.map(function (item) {
                var name = item.outName;
                if (used[name]) {
                    var dot = name.lastIndexOf(".");
                    name = name.slice(0, dot) + " (" + (++used[item.outName]) + ")" + name.slice(dot);
                } else {
                    used[name] = 1;
                }
                return { name: name, blob: item.blob };
            });
            Tools.download(await Tools.makeZip(files), "imagesearch-photos.zip");
        } finally {
            updateSummary();
        }
    });

    /* ---------- Start ---------- */

    Tools.setupDropzone(dropzone, fileInput, addFiles);

    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("drop", function (e) {
        if (e.target.closest && e.target.closest("#dropzone")) return;
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
    });

    syncControls();
})();
