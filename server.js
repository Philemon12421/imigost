/* Short-link server. No packages to install: run `node server.js`.
 *
 *   /                 -> the image search page
 *   /links.html       -> the link page builder
 *   /ama              -> the public page that belongs to "ama"
 *   POST /api/pages   -> create or update a page
 *   GET  /api/pages/x -> read a page
 *
 * Pages are saved in data/pages.json next to this file.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { cleanProfile, SLUG_PATTERN } = require("./core.js");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "pages.json");
const MAX_BODY = 128 * 1024; // a profile photo is up to about 60 KB of text
const MIN_SLUG = 3;

/* Names that would clash with real files or routes */
const RESERVED = new Set([
    "api", "index", "links", "profile", "image", "core", "builder", "server",
    "offline", "manifest", "tools", "crop", "convert", "speed", "favicon", "icons", "consent", "pwa", "site", "sw", "robots",
    "admin", "static", "assets", "login", "signup", "help", "about", "terms", "privacy",
]);

/* Only these files are ever served from disk */
const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
};

const FILES = [
    "index.html", "links.html", "profile.html", "offline.html",
    "tools.html", "crop.html", "convert.html", "speed.html",
    "image.css", "links.css", "site.css", "tools.css",
    "core.js", "image.js", "builder.js", "consent.js", "pwa.js", "sw.js",
    "tools.js", "crop.js", "convert.js", "speed.js",
    "manifest.webmanifest", "favicon.svg",
    "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
    "icons/apple-touch-icon.png", "icons/favicon-32.png",
];

const STATIC_FILES = { "/": ["index.html", TYPES[".html"]] };
FILES.forEach((file) => {
    STATIC_FILES["/" + file] = [file, TYPES[path.extname(file)]];
});

/* ---------- Storage ---------- */

let pages = {};

function loadPages() {
    try {
        pages = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
        pages = {};
    }
}

function savePages() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(pages));
    fs.renameSync(tmp, DATA_FILE); // swap in one step so a crash never leaves a half-written file
}

const hashKey = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");

function keyMatches(page, key) {
    if (!key) return false;
    const a = Buffer.from(page.keyHash, "hex");
    const b = Buffer.from(hashKey(key), "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- Simple rate limit: 30 saves per 10 minutes per address ---------- */

const hits = new Map();

function limited(ip) {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > 30;
}

/* ---------- Helpers ---------- */

function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
    res.writeHead(status, {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        ...extra,
    });
    res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(new Error("too large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function sendFile(res, file, type, status = 200) {
    fs.readFile(path.join(__dirname, file), (err, data) => {
        if (err) return send(res, 404, "Not found", "text/plain; charset=utf-8");
        const cache = file.startsWith("icons/") ? "public, max-age=86400" : "no-cache";
        send(res, status, data, type, { "Cache-Control": cache });
    });
}

/* ---------- API ---------- */

async function handleApi(req, res, pathname) {
    // Health check, so the browser can tell this server apart from plain file hosting
    if (pathname === "/api/health") return send(res, 200, { ok: true });

    // Read one page
    const match = pathname.match(/^\/api\/pages\/([a-z0-9-]+)$/);
    if (match && req.method === "GET") {
        const page = pages[match[1]];
        if (!page) return send(res, 404, { ok: false, error: "not_found" }, undefined, { "Cache-Control": "no-store" });
        return send(res, 200, { ok: true, profile: page.profile }, undefined, { "Cache-Control": "no-store" });
    }

    // Create or update a page
    if (pathname === "/api/pages" && req.method === "POST") {
        const ip = req.socket.remoteAddress || "unknown";
        if (limited(ip)) return send(res, 429, { ok: false, error: "slow_down" });

        let profile;
        try {
            profile = cleanProfile(JSON.parse(await readBody(req)));
        } catch {
            return send(res, 400, { ok: false, error: "bad_request" });
        }

        if (!profile || !profile.name.trim()) return send(res, 400, { ok: false, error: "name_required" });
        if (!profile.links.length) return send(res, 400, { ok: false, error: "links_required" });

        const slug = profile.slug;
        if (slug.length < MIN_SLUG || !SLUG_PATTERN.test(slug)) return send(res, 400, { ok: false, error: "bad_slug" });
        if (RESERVED.has(slug)) return send(res, 409, { ok: false, error: "taken" });

        const existing = pages[slug];
        const key = req.headers["x-edit-key"];

        if (existing) {
            // Only the person who created the page can change it
            if (!keyMatches(existing, key)) return send(res, 409, { ok: false, error: "taken" });
            existing.profile = profile;
            existing.updated = Date.now();
            savePages();
            return send(res, 200, { ok: true, slug });
        }

        const editKey = crypto.randomBytes(24).toString("hex");
        pages[slug] = { profile, keyHash: hashKey(editKey), created: Date.now(), updated: Date.now() };
        savePages();
        return send(res, 201, { ok: true, slug, editKey });
    }

    return send(res, 404, { ok: false, error: "not_found" });
}

/* ---------- Server ---------- */

const server = http.createServer(async (req, res) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
        return send(res, 400, "Bad request", "text/plain; charset=utf-8");
    }

    try {
        if (pathname.startsWith("/api/")) return await handleApi(req, res, pathname);

        if (req.method !== "GET" && req.method !== "HEAD") {
            return send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
        }

        if (STATIC_FILES[pathname]) {
            const [file, type] = STATIC_FILES[pathname];
            return sendFile(res, file, type);
        }

        // A short link such as /ama: show the profile page (404 status if the name is unknown)
        const slug = pathname.replace(/^\/|\/$/g, "").toLowerCase();
        if (SLUG_PATTERN.test(slug) && slug.length <= 30) {
            return sendFile(res, "profile.html", "text/html; charset=utf-8", pages[slug] ? 200 : 404);
        }

        return send(res, 404, "Not found", "text/plain; charset=utf-8");
    } catch (error) {
        console.error(error);
        return send(res, 500, { ok: false, error: "server_error" });
    }
});

loadPages();
server.listen(PORT, () => {
    console.log(`Running at http://localhost:${PORT}`);
});
