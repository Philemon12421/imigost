/* Service worker: makes the site installable and usable offline.
 * Bump VERSION whenever you change any site file, so visitors get the update. */

const VERSION = "v5";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;

const PRECACHE = [
    "./",
    "index.html",
    "links.html",
    "profile.html",
    "tools.html",
    "crop.html",
    "convert.html",
    "speed.html",
    "extension.html",
    "offline.html",
    "image.css",
    "links.css",
    "site.css",
    "tools.css",
    "core.js",
    "image.js",
    "builder.js",
    "tools.js",
    "crop.js",
    "convert.js",
    "speed.js",
    "consent.js",
    "pwa.js",
    "manifest.webmanifest",
    "favicon.svg",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/apple-touch-icon.png",
    "icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) =>
            // Add files one by one so a single missing file doesn't block the install
            Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
        )
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

/* Try the network first and keep a copy; fall back to the saved copy */
async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw error;
    }
}

/* Pages: network first, then a saved copy, then the offline page */
async function handleNavigation(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // ignoreSearch lets profile.html?u=name find the saved profile.html
        const cached = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));
        return cached || (await caches.match("offline.html"));
    }
}

/* Files of the site: show the saved copy straight away, refresh it in the background */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);

    const refresh = fetch(request)
        .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);

    return cached || (await refresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Never touch other sites (Unsplash, Google Fonts): let the browser handle them
    if (url.origin !== self.location.origin) return;

    // Saved link pages can be read offline once they've been opened; nothing else from the API is kept
    if (url.pathname.startsWith("/api/")) {
        if (/^\/api\/pages\/[a-z0-9-]+$/.test(url.pathname)) {
            event.respondWith(networkFirst(request, PAGE_CACHE));
        }
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(handleNavigation(request));
        return;
    }

    event.respondWith(staleWhileRevalidate(request));
});
