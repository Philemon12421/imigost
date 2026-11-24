/* Shared by the background script, the popup and the options page.
 *
 * DEFAULT_SITE is the address of your ImageSearch site. People can also change it
 * in the extension's Options, so a fork or a local copy works without editing code. */
const DEFAULT_SITE = "https://imigost.vercel.app";

/* Accepts https addresses (and http only for localhost). Returns "https://host/path" or null. */
function normalizeSite(value) {
    try {
        const u = new URL(String(value || "").trim());
        const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
        if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
        return u.origin + u.pathname.replace(/\/+$/, "");
    } catch (e) {
        return null;
    }
}

async function getSite() {
    const stored = await chrome.storage.sync.get("siteUrl");
    return normalizeSite(stored.siteUrl) || DEFAULT_SITE;
}

/* Builds an address like https://site/crop.html?add=... */
function sitePage(base, page, params) {
    const url = new URL(base + "/" + page);
    Object.keys(params || {}).forEach(function (key) {
        url.searchParams.set(key, params[key]);
    });
    return url.toString();
}

function cleanTitle(text) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, 60);
}
