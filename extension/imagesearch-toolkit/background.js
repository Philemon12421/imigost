/* ImageSearch Toolkit: background service worker.
 *
 * What it does:
 *  - Right-click an image  -> opens the crop or convert tool with that image already loaded
 *  - Right-click a page    -> adds it to your link page
 *  - Right-click a link    -> adds that link to your link page
 *  - Select text, right-click -> searches photos for it
 *
 * Photos are fetched by your browser and handed to a tab of your own site.
 * Nothing is uploaded and nothing is collected. */

importScripts("config.js");

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const MENU = {
    crop: "is-crop",
    convert: "is-convert",
    search: "is-search",
    page: "is-page",
    link: "is-link",
};

const MIME_TO_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/bmp": "bmp" };
const EXT_TO_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp" };

/* ---------- Menus ---------- */

chrome.runtime.onInstalled.addListener(function () {
    chrome.contextMenus.removeAll(function () {
        chrome.contextMenus.create({ id: MENU.crop, title: "Crop for social media", contexts: ["image"] });
        chrome.contextMenus.create({ id: MENU.convert, title: "Compress, resize or convert", contexts: ["image"] });
        chrome.contextMenus.create({ id: MENU.search, title: "Search photos for “%s”", contexts: ["selection"] });
        chrome.contextMenus.create({ id: MENU.page, title: "Add this page to my link page", contexts: ["page"] });
        chrome.contextMenus.create({ id: MENU.link, title: "Add this link to my link page", contexts: ["link"] });
    });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
    switch (info.menuItemId) {
        case MENU.crop: return handleImage(info.srcUrl, tab, "crop.html");
        case MENU.convert: return handleImage(info.srcUrl, tab, "convert.html");
        case MENU.search: return handleSearch(info.selectionText);
        case MENU.page: return handleAddLink(info.pageUrl || (tab && tab.url), tab && tab.title);
        case MENU.link: return handleAddLink(info.linkUrl, info.selectionText);
    }
});

/* ---------- Small helpers ---------- */

/* A red "!" on the toolbar icon for a few seconds, for things that can't be done */
function flagProblem(text) {
    chrome.action.setBadgeBackgroundColor({ color: "#c4321f" });
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setTitle({ title: text });
    setTimeout(function () {
        chrome.action.setBadgeText({ text: "" });
        chrome.action.setTitle({ title: "ImageSearch Toolkit" });
    }, 6000);
}

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function fileNameFor(url, type) {
    let name = "image";
    if (!/^data:|^blob:/i.test(url)) {
        try {
            const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
            if (last) name = last;
        } catch (e) { /* keep the default */ }
    }
    name = name.replace(/\.[^.]+$/, "").replace(/[^\w\-. ]+/g, "").trim().slice(0, 60) || "image";
    return name + "." + (MIME_TO_EXT[type] || "png");
}

/* ---------- Getting the image ---------- */

/* Runs inside the web page, for images the background script can't reach by itself
   (blob: addresses, or images that need the page's login). Returns a data: address. */
async function readInPage(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    return await new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error("read")); };
        reader.readAsDataURL(blob);
    });
}

async function fetchImage(url, tab) {
    if (!/^(https?|data|blob):/i.test(String(url || ""))) {
        throw new Error("This kind of image can’t be copied.");
    }

    let type = "";
    let b64 = "";

    try {
        if (/^blob:/i.test(url)) throw new Error("blob");
        const res = await fetch(url, { credentials: "omit" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();
        if (blob.size > MAX_IMAGE_BYTES) throw new Error("size");
        type = blob.type;
        b64 = toBase64(await blob.arrayBuffer());
    } catch (firstError) {
        if (firstError.message === "size") throw new Error("That image is larger than 15 MB.");
        if (!tab || tab.id === undefined) throw new Error("We couldn’t get that image.");

        try {
            const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readInPage, args: [url] });
            const dataUrl = result && result.result;
            const match = /^data:([^;,]*)[^,]*;base64,(.*)$/.exec(dataUrl || "");
            if (!match) throw new Error("read");
            type = match[1];
            b64 = match[2];
        } catch (secondError) {
            throw new Error("We couldn’t get that image. The website may block it.");
        }
    }

    if (!/^image\//.test(type)) {
        const ext = (String(url).split("?")[0].match(/\.([a-z0-9]+)$/i) || [])[1];
        type = EXT_TO_MIME[(ext || "").toLowerCase()] || "";
    }
    if (!MIME_TO_EXT[type]) throw new Error("That image type isn’t supported. Try a JPG, PNG, WebP, GIF or AVIF image.");
    if ((b64.length * 3) / 4 > MAX_IMAGE_BYTES) throw new Error("That image is larger than 15 MB.");

    return { name: fileNameFor(url, type), type: type, b64: b64 };
}

/* ---------- Handing it to the tool page ---------- */

/* Waits until the new tab has finished loading the site (not just the blank first page) */
function waitForSite(tabId, origin) {
    return new Promise(function (resolve) {
        let finished = false;

        function done() {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolve();
        }

        function check() {
            chrome.tabs.get(tabId).then(function (tab) {
                if (tab.status === "complete" && String(tab.url || "").indexOf(origin) === 0) done();
            }).catch(done);
        }

        function onUpdated(id, change) {
            if (id === tabId && change.status === "complete") check();
        }

        const timeout = setTimeout(done, 20000);
        chrome.tabs.onUpdated.addListener(onUpdated);
        check();
    });
}

/* Runs inside the tool page: puts the image in the page's file box, exactly as if the
   person had chosen it. The tool's own code takes it from there. */
function deliverToPage(payload, errorText) {
    const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    return (async function () {
        for (let i = 0; i < 60 && !document.getElementById("file-input"); i++) await wait(100);
        const input = document.getElementById("file-input");
        const note = document.getElementById("drop-message");
        if (!input) return false;

        if (!payload) {
            if (note) note.textContent = (errorText || "We couldn’t get that image.") + " You can save it and drop it here instead.";
            return false;
        }

        const binary = atob(payload.b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], payload.name, { type: payload.type }));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    })();
}

async function handleImage(srcUrl, tab, page) {
    const site = await getSite();
    const origin = new URL(site).origin;
    const target = await chrome.tabs.create({ url: sitePage(site, page), active: true });

    let payload = null;
    let errorText = "";
    try {
        payload = await fetchImage(srcUrl, tab);
    } catch (error) {
        errorText = error.message;
    }

    await waitForSite(target.id, origin);
    try {
        await chrome.scripting.executeScript({ target: { tabId: target.id }, func: deliverToPage, args: [payload, errorText] });
    } catch (error) {
        flagProblem("Couldn’t send the image to your site. Check the site address in Options.");
    }
}

/* ---------- Link page and search ---------- */

async function handleAddLink(url, title) {
    if (!/^https?:\/\//i.test(String(url || ""))) {
        flagProblem("Only web pages can be added to your link page.");
        return;
    }
    const site = await getSite();
    await chrome.tabs.create({ url: sitePage(site, "links.html", { add: url, title: cleanTitle(title) }), active: true });
}

async function handleSearch(text) {
    const q = String(text || "").replace(/\s+/g, " ").trim().slice(0, 100);
    if (!q) return;
    const site = await getSite();
    await chrome.tabs.create({ url: sitePage(site, "index.html", { q: q }), active: true });
}
