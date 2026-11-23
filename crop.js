/* Crop a photo to the right size for social media.
 * Drag to move, pinch / scroll / slider to zoom. Everything happens in the browser. */
(function () {
    "use strict";

    var PRESETS = [
        { id: "instagram-square", name: "Instagram post", note: "Square", w: 1080, h: 1080 },
        { id: "instagram-portrait", name: "Instagram portrait", note: "4:5", w: 1080, h: 1350 },
        { id: "story", name: "Story, Reel, TikTok", note: "9:16", w: 1080, h: 1920 },
        { id: "youtube-thumbnail", name: "YouTube thumbnail", note: "16:9", w: 1280, h: 720 },
        { id: "x-post", name: "X post", note: "16:9", w: 1600, h: 900 },
        { id: "x-header", name: "X header", note: "3:1", w: 1500, h: 500 },
        { id: "linkedin-banner", name: "LinkedIn banner", note: "4:1", w: 1584, h: 396 },
        { id: "facebook-cover", name: "Facebook cover", note: "", w: 820, h: 312 },
        { id: "pinterest-pin", name: "Pinterest pin", note: "2:3", w: 1000, h: 1500 },
        { id: "profile-picture", name: "Profile picture", note: "Square", w: 800, h: 800 },
        { id: "custom", name: "Custom size", note: "Your own", w: 1080, h: 1080, custom: true },
    ];

    var MAX_WORKING = 4000; // longest side kept in memory, plenty for any preset
    var MAX_BYTES = 40 * 1024 * 1024;
    var MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

    function $(id) { return document.getElementById(id); }

    var dropSection = $("drop-section");
    var dropzone = $("dropzone");
    var fileInput = $("file-input");
    var dropMessage = $("drop-message");
    var workspace = $("workspace");
    var stage = $("stage");
    var canvas = $("crop-canvas");
    var ctx = canvas.getContext("2d");
    var zoomInput = $("zoom");
    var rotateBtn = $("rotate-left");
    var gridBtn = $("grid-toggle");
    var presetGrid = $("preset-grid");
    var customBox = $("custom-size");
    var customW = $("custom-w");
    var customH = $("custom-h");
    var formatBox = $("format");
    var qualityField = $("quality-field");
    var qualityInput = $("quality");
    var qualityValue = $("quality-value");
    var info = $("crop-info");
    var downloadBtn = $("download");
    var replaceBtn = $("replace");
    var message = $("crop-message");

    var img = null;            // { canvas, w, h, fit, name, origW, origH }
    var preset = PRESETS[0];
    var outW = preset.w;
    var outH = preset.h;
    var zoom = 1;
    var cx = 0, cy = 0;        // where the middle of the photo sits inside the frame
    var fw = 0, fh = 0, dpr = 1;
    var showGrid = false;
    var format = "jpeg";

    /* ---------- Geometry ---------- */

    function baseScale() { return Math.max(fw / img.w, fh / img.h); } // "cover": no empty edges
    function scale() { return baseScale() * zoom; }

    function clampPosition() {
        var s = scale();
        var hw = (img.w * s) / 2;
        var hh = (img.h * s) / 2;
        cx = Math.min(hw, Math.max(fw - hw, cx));
        cy = Math.min(hh, Math.max(fh - hh, cy));
    }

    function resetView() {
        zoom = 1;
        zoomInput.value = "1";
        cx = fw / 2;
        cy = fh / 2;
    }

    function zoomAt(nextZoom, px, py) {
        var before = scale();
        zoom = Math.min(5, Math.max(1, nextZoom));
        var after = scale();
        cx = px + (cx - px) * (after / before);
        cy = py + (cy - py) * (after / before);
        clampPosition();
        zoomInput.value = String(zoom);
        draw();
        updateInfo();
    }

    /* ---------- Drawing ---------- */

    function draw() {
        if (!img) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, fw, fh);
        ctx.imageSmoothingQuality = "high";

        var s = scale();
        var hw = (img.w * s) / 2;
        var hh = (img.h * s) / 2;
        ctx.drawImage(img.canvas, cx - hw, cy - hh, hw * 2, hh * 2);

        if (showGrid) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(255,255,255,0.75)";
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = 2;
            ctx.beginPath();
            for (var i = 1; i < 3; i++) {
                ctx.moveTo((fw * i) / 3, 0);
                ctx.lineTo((fw * i) / 3, fh);
                ctx.moveTo(0, (fh * i) / 3);
                ctx.lineTo(fw, (fh * i) / 3);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    /* Sizes the crop frame to the chosen shape and fits it on screen */
    function layoutStage(keepView) {
        if (!img) return;
        var rx = fw ? cx / fw : 0.5;
        var ry = fh ? cy / fh : 0.5;

        var wrap = stage.parentElement;
        var availW = Math.max(160, wrap.clientWidth - 32);
        var maxH = Math.max(260, Math.min(window.innerHeight * 0.68, 680));
        var aspect = outW / outH;

        var w = availW;
        var h = w / aspect;
        if (h > maxH) { h = maxH; w = h * aspect; }

        fw = Math.max(40, Math.round(w));
        fh = Math.max(40, Math.round(h));
        dpr = window.devicePixelRatio || 1;

        stage.style.width = fw + "px";
        stage.style.height = fh + "px";
        canvas.width = Math.round(fw * dpr);
        canvas.height = Math.round(fh * dpr);
        canvas.style.width = fw + "px";
        canvas.style.height = fh + "px";

        if (keepView) {
            cx = rx * fw;
            cy = ry * fh;
            clampPosition();
        } else {
            resetView();
        }
        draw();
        updateInfo();
    }

    function updateInfo() {
        if (!img) return;
        // Output pixels drawn for every pixel of the original photo
        var s = (scale() * (outW / fw)) / img.fit;
        var enlarged = s > 1.02;
        info.classList.toggle("warn", enlarged);
        info.innerHTML = "<strong>" + outW + " × " + outH + " px</strong><br>" +
            (enlarged
                ? "Your photo is smaller than this, so it gets enlarged and may look soft."
                : "Your photo: " + img.origW + " × " + img.origH + " px");
    }

    /* ---------- Loading a photo ---------- */

    function showMessage(el, text, ok) {
        el.textContent = text;
        el.classList.toggle("ok", Boolean(ok));
    }

    async function loadFile(file) {
        showMessage(dropMessage, "");
        showMessage(message, "");

        if (!Tools.isImage(file)) {
            showMessage(dropMessage, "That file isn’t a supported image. Try a JPG, PNG, WebP, GIF or AVIF photo.");
            return;
        }
        if (file.size > MAX_BYTES) {
            showMessage(dropMessage, "That photo is larger than 40 MB. Try a smaller one.");
            return;
        }

        try {
            var bitmap = await Tools.readBitmap(file);
            var size = Tools.sizeOf(bitmap);
            if (!size.w || !size.h) throw new Error("empty");

            var fit = Math.min(1, MAX_WORKING / Math.max(size.w, size.h));
            var c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(size.w * fit));
            c.height = Math.max(1, Math.round(size.h * fit));
            var cctx = c.getContext("2d");
            cctx.imageSmoothingQuality = "high";
            cctx.drawImage(bitmap, 0, 0, c.width, c.height);
            if (bitmap.close) bitmap.close();

            img = { canvas: c, w: c.width, h: c.height, fit: fit, name: file.name, origW: size.w, origH: size.h };
        } catch (error) {
            showMessage(dropMessage, "We couldn’t open that photo. Try a different one.");
            return;
        }

        dropSection.hidden = true;
        workspace.hidden = false;
        fw = 0; fh = 0;
        layoutStage(false);
        stage.focus({ preventScroll: true });
    }

    function onFiles(files) {
        var file = files.find(Tools.isImage) || files[0];
        if (file) loadFile(file);
    }

    /* ---------- Moving and zooming ---------- */

    var pointers = new Map();
    var lastDist = 0;

    stage.addEventListener("pointerdown", function (e) {
        stage.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        stage.classList.add("is-grabbing");
        if (pointers.size === 2) {
            var pts = Array.from(pointers.values());
            lastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        }
    });

    stage.addEventListener("pointermove", function (e) {
        if (!img || !pointers.has(e.pointerId)) return;
        var prev = pointers.get(e.pointerId);
        var cur = { x: e.clientX, y: e.clientY };
        pointers.set(e.pointerId, cur);

        if (pointers.size === 1) {
            cx += cur.x - prev.x;
            cy += cur.y - prev.y;
            clampPosition();
            draw();
        } else if (pointers.size === 2) {
            var pts = Array.from(pointers.values());
            var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            if (lastDist) {
                var rect = stage.getBoundingClientRect();
                var mx = (pts[0].x + pts[1].x) / 2 - rect.left;
                var my = (pts[0].y + pts[1].y) / 2 - rect.top;
                zoomAt(zoom * (dist / lastDist), mx, my);
            }
            lastDist = dist;
        }
    });

    function endPointer(e) {
        pointers.delete(e.pointerId);
        lastDist = 0;
        if (!pointers.size) stage.classList.remove("is-grabbing");
    }
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);

    stage.addEventListener("wheel", function (e) {
        if (!img) return;
        e.preventDefault();
        var rect = stage.getBoundingClientRect();
        zoomAt(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    stage.addEventListener("keydown", function (e) {
        if (!img) return;
        var step = e.shiftKey ? 40 : 10;
        var handled = true;

        if (e.key === "ArrowLeft") cx -= step;
        else if (e.key === "ArrowRight") cx += step;
        else if (e.key === "ArrowUp") cy -= step;
        else if (e.key === "ArrowDown") cy += step;
        else if (e.key === "+" || e.key === "=") { zoomAt(zoom * 1.1, fw / 2, fh / 2); return e.preventDefault(); }
        else if (e.key === "-" || e.key === "_") { zoomAt(zoom / 1.1, fw / 2, fh / 2); return e.preventDefault(); }
        else handled = false;

        if (handled) {
            e.preventDefault();
            clampPosition();
            draw();
        }
    });

    zoomInput.addEventListener("input", function () {
        zoomAt(parseFloat(zoomInput.value), fw / 2, fh / 2);
    });

    /* ---------- Controls ---------- */

    rotateBtn.addEventListener("click", function () {
        if (!img) return;
        var c = document.createElement("canvas");
        c.width = img.h;
        c.height = img.w;
        var x = c.getContext("2d");
        x.translate(c.width / 2, c.height / 2);
        x.rotate(-Math.PI / 2);
        x.drawImage(img.canvas, -img.w / 2, -img.h / 2);
        img.canvas = c;
        var t = img.w; img.w = img.h; img.h = t;
        t = img.origW; img.origW = img.origH; img.origH = t;
        resetView();
        draw();
        updateInfo();
    });

    gridBtn.addEventListener("click", function () {
        showGrid = !showGrid;
        gridBtn.setAttribute("aria-pressed", String(showGrid));
        draw();
    });

    function buildPresets() {
        PRESETS.forEach(function (p) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "preset";
            btn.dataset.id = p.id;
            btn.setAttribute("aria-pressed", String(p === preset));

            var name = document.createElement("span");
            name.className = "preset-name";
            name.textContent = p.name;
            var size = document.createElement("span");
            size.className = "preset-size";
            size.textContent = p.custom ? p.note : p.w + " × " + p.h + (p.note ? " · " + p.note : "");
            btn.append(name, size);

            btn.addEventListener("click", function () { choosePreset(p); });
            presetGrid.appendChild(btn);
        });
    }

    function choosePreset(p) {
        preset = p;
        presetGrid.querySelectorAll(".preset").forEach(function (b) {
            b.setAttribute("aria-pressed", String(b.dataset.id === p.id));
        });
        customBox.hidden = !p.custom;
        if (p.custom) {
            applyCustom(false);
        } else {
            outW = p.w;
            outH = p.h;
        }
        showMessage(message, "");
        layoutStage(false);
    }

    function validSize(v) { return Number.isFinite(v) && v >= 50 && v <= 6000; }

    function applyCustom(relayout) {
        var w = parseInt(customW.value, 10);
        var h = parseInt(customH.value, 10);
        if (validSize(w) && validSize(h)) {
            outW = w;
            outH = h;
            if (relayout) layoutStage(false);
        }
    }

    customW.addEventListener("input", function () { applyCustom(true); });
    customH.addEventListener("input", function () { applyCustom(true); });
    [customW, customH].forEach(function (el) {
        el.addEventListener("change", function () {
            var v = parseInt(el.value, 10);
            el.value = String(Math.min(6000, Math.max(50, Number.isFinite(v) ? v : 1080)));
            applyCustom(true);
        });
    });

    /* ---------- Saving ---------- */

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
        qualityField.hidden = format === "png";
    });

    qualityInput.addEventListener("input", function () {
        qualityValue.textContent = qualityInput.value + "%";
    });

    downloadBtn.addEventListener("click", async function () {
        if (!img) return;
        showMessage(message, "");
        downloadBtn.disabled = true;
        downloadBtn.textContent = "Preparing...";

        try {
            var out = document.createElement("canvas");
            out.width = outW;
            out.height = outH;
            var o = out.getContext("2d");
            o.imageSmoothingQuality = "high";
            if (format === "jpeg") {
                o.fillStyle = "#ffffff"; // JPG can't be see-through
                o.fillRect(0, 0, outW, outH);
            }

            var f = outW / fw;
            var s = scale() * f;
            var hw = (img.w * s) / 2;
            var hh = (img.h * s) / 2;
            o.drawImage(img.canvas, cx * f - hw, cy * f - hh, hw * 2, hh * 2);

            var blob = await Tools.canvasToBlob(out, MIME[format], parseInt(qualityInput.value, 10) / 100);
            if (!blob) throw new Error("empty");

            var ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
            Tools.download(blob, Tools.baseName(img.name) + "-" + preset.id + "." + ext);
            showMessage(message, "Saved " + outW + " × " + outH + " px · " + Tools.formatBytes(blob.size) + (blob.type !== MIME[format] ? " (this browser saved it as PNG)" : ""), true);
        } catch (error) {
            showMessage(message, "Something went wrong while saving. Try a smaller size.");
        } finally {
            downloadBtn.disabled = false;
            downloadBtn.textContent = "Download";
        }
    });

    replaceBtn.addEventListener("click", function () { fileInput.click(); });

    /* ---------- Start ---------- */

    Tools.setupDropzone(dropzone, fileInput, onFiles);

    // Dropping a photo anywhere on the page works, and never navigates away to the file
    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("drop", function (e) {
        if (e.target.closest && e.target.closest("#dropzone")) return; // already handled
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { layoutStage(true); }, 120);
    });

    buildPresets();
})();
