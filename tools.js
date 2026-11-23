/* Shared helpers for the photo tools.
 * Everything here runs in the browser. Photos are never uploaded anywhere. */
const Tools = (function () {
    "use strict";

    const ACCEPTED = /^image\/(jpeg|png|webp|gif|bmp|avif)$/;
    const ACCEPTED_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

    function isImage(file) {
        return ACCEPTED.test(file.type) || (!file.type && ACCEPTED_EXT.test(file.name));
    }

    function formatBytes(n) {
        if (n < 1024) return n + " B";
        if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
        return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 2 : 1) + " MB";
    }

    function baseName(name) {
        return String(name || "photo").replace(/\.[^.]+$/, "").replace(/[^\w\-. ]+/g, "").trim().slice(0, 60) || "photo";
    }

    function loadViaImage(file) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
            img.src = url;
        });
    }

    /* Decodes a photo. "from-image" applies the phone's rotation so portraits aren't sideways. */
    async function readBitmap(file) {
        try {
            return await createImageBitmap(file, { imageOrientation: "from-image" });
        } catch (e) {
            return loadViaImage(file);
        }
    }

    function sizeOf(bitmap) {
        return { w: bitmap.naturalWidth || bitmap.width, h: bitmap.naturalHeight || bitmap.height };
    }

    function canvasToBlob(canvas, type, quality) {
        return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
    }

    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }

    /* Safari can't save WebP from a canvas, so check before offering it */
    const supportsWebP = (function () {
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        return c.toDataURL("image/webp").indexOf("data:image/webp") === 0;
    })();

    /* Wires a drop zone: click, keyboard, drag and drop, and pasting an image */
    function setupDropzone(zone, input, onFiles) {
        const pick = zone.querySelector("[data-pick]");
        if (pick) pick.addEventListener("click", function () { input.click(); });

        input.addEventListener("change", function () {
            if (input.files.length) onFiles(Array.from(input.files));
            input.value = "";
        });

        ["dragenter", "dragover"].forEach(function (type) {
            zone.addEventListener(type, function (e) { e.preventDefault(); zone.classList.add("is-dragging"); });
        });
        ["dragleave", "drop"].forEach(function (type) {
            zone.addEventListener(type, function () { zone.classList.remove("is-dragging"); });
        });
        zone.addEventListener("drop", function (e) {
            e.preventDefault();
            if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
        });

        document.addEventListener("paste", function (e) {
            const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
            if (files.length) onFiles(files);
        });
    }

    /* ---------- Minimal ZIP writer (no compression, photos are already compressed) ---------- */

    const CRC_TABLE = (function () {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(bytes) {
        let c = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    }

    async function makeZip(files) {
        const enc = new TextEncoder();
        const now = new Date();
        const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

        const parts = [];
        const central = [];
        let offset = 0;

        for (const file of files) {
            const data = new Uint8Array(await file.blob.arrayBuffer());
            const name = enc.encode(file.name);
            const crc = crc32(data);

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0x0800, true); // names are UTF-8
            local.setUint16(8, 0, true);      // stored
            local.setUint16(10, dosTime, true);
            local.setUint16(12, dosDate, true);
            local.setUint32(14, crc, true);
            local.setUint32(18, data.length, true);
            local.setUint32(22, data.length, true);
            local.setUint16(26, name.length, true);
            local.setUint16(28, 0, true);
            parts.push(local.buffer, name, data);

            const entry = new DataView(new ArrayBuffer(46));
            entry.setUint32(0, 0x02014b50, true);
            entry.setUint16(4, 20, true);
            entry.setUint16(6, 20, true);
            entry.setUint16(8, 0x0800, true);
            entry.setUint16(10, 0, true);
            entry.setUint16(12, dosTime, true);
            entry.setUint16(14, dosDate, true);
            entry.setUint32(16, crc, true);
            entry.setUint32(20, data.length, true);
            entry.setUint32(24, data.length, true);
            entry.setUint16(28, name.length, true);
            entry.setUint32(42, offset, true);
            central.push(entry.buffer, name);

            offset += 30 + name.length + data.length;
        }

        const centralSize = central.reduce(function (sum, p) { return sum + (p.byteLength !== undefined ? p.byteLength : p.length); }, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, centralSize, true);
        end.setUint32(16, offset, true);

        return new Blob(parts.concat(central, [end.buffer]), { type: "application/zip" });
    }

    return {
        isImage: isImage,
        formatBytes: formatBytes,
        baseName: baseName,
        readBitmap: readBitmap,
        sizeOf: sizeOf,
        canvasToBlob: canvasToBlob,
        download: download,
        supportsWebP: supportsWebP,
        setupDropzone: setupDropzone,
        makeZip: makeZip,
    };
})();
