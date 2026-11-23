/* Cookie and storage consent.
 *
 * Load this in <head> so saved choices apply before the page paints.
 *
 *   Essential (always on)  saves the link-page draft and edit keys and recent speed-test
 *                          results on this device, remembers this choice, and lets the
 *                          app work offline.
 *   Fonts (optional)       loads Google Fonts, which sends the visitor's IP address to Google.
 *
 * Add your own optional features (analytics, for example) by calling
 * Consent.onChange() and only starting them when Consent.get() === "all".
 */
(function () {
    "use strict";

    var KEY = "consent:v1";
    var FONT_ID = "consent-fonts";
    var FONT_URL =
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700" +
        "&family=Instrument+Sans:wght@400;500;600&family=Fraunces:opsz,wght@9..144,600;9..144,700" +
        "&family=Space+Mono:wght@400;700&family=Nunito:wght@600;800&family=Caveat:wght@600;700&display=swap";

    var listeners = [];
    var banner = null;

    /* ---------- Saved choice ---------- */

    function read() {
        try {
            var saved = JSON.parse(localStorage.getItem(KEY));
            if (saved && (saved.choice === "all" || saved.choice === "essential")) return saved.choice;
        } catch (e) { /* storage blocked: treat as no choice yet */ }
        return null;
    }

    function write(choice) {
        try {
            localStorage.setItem(KEY, JSON.stringify({ choice: choice, date: new Date().toISOString() }));
        } catch (e) { /* ignore */ }
    }

    /* ---------- What each choice switches on ---------- */

    function applyFonts(on) {
        var existing = document.getElementById(FONT_ID);

        if (on && !existing) {
            ["https://fonts.googleapis.com", "https://fonts.gstatic.com"].forEach(function (href, i) {
                var pre = document.createElement("link");
                pre.rel = "preconnect";
                pre.href = href;
                if (i === 1) pre.crossOrigin = "anonymous";
                pre.setAttribute("data-consent", "fonts");
                document.head.appendChild(pre);
            });
            var link = document.createElement("link");
            link.id = FONT_ID;
            link.rel = "stylesheet";
            link.href = FONT_URL;
            document.head.appendChild(link);
        }

        if (!on && existing) {
            existing.remove();
            document.querySelectorAll('link[data-consent="fonts"]').forEach(function (el) { el.remove(); });
        }
    }

    function apply(choice) {
        applyFonts(choice === "all");
    }

    // Returning visitors: apply immediately, before the page renders
    apply(read());

    /* ---------- Banner ---------- */

    function buildBanner() {
        var el = document.createElement("section");
        el.className = "consent";
        el.setAttribute("role", "region");
        el.setAttribute("aria-labelledby", "consent-title");
        el.hidden = true;
        // Static text only: nothing from the visitor or the network goes in here
        el.innerHTML =
            '<h2 id="consent-title" tabindex="-1">Your privacy</h2>' +
            "<p>We store a few things on your device so the site works. With your OK we also load fonts from Google, " +
            "which shares your IP address with them.</p>" +
            "<details>" +
            "<summary>What’s stored?</summary>" +
            "<ul>" +
            "<li><strong>Essential</strong> (always on): your link-page draft and edit keys, recent speed-test results, this choice, and saved pages for offline use.</li>" +
            "<li><strong>Fonts</strong> (optional): Google Fonts, for the site’s typefaces.</li>" +
            "<li>Photos come from Unsplash, because that’s what the search shows.</li>" +
            "</ul>" +
            "</details>" +
            '<div class="consent-actions">' +
            '<button type="button" class="consent-btn consent-essential" data-choice="essential">Essential only</button>' +
            '<button type="button" class="consent-btn consent-all" data-choice="all">Accept all</button>' +
            "</div>";

        el.addEventListener("click", function (event) {
            var btn = event.target.closest("[data-choice]");
            if (btn) set(btn.getAttribute("data-choice"));
        });

        document.body.appendChild(el);
        return el;
    }

    function show(moveFocus) {
        if (!banner) banner = buildBanner();

        var current = read();
        banner.querySelectorAll("[data-choice]").forEach(function (btn) {
            btn.setAttribute("aria-pressed", String(btn.getAttribute("data-choice") === current));
        });

        banner.hidden = false;
        if (moveFocus) banner.querySelector("#consent-title").focus();
    }

    function hide() {
        if (banner) banner.hidden = true;
    }

    function set(choice) {
        if (choice !== "all" && choice !== "essential") return;
        write(choice);
        apply(choice);
        hide();
        listeners.forEach(function (fn) { try { fn(choice); } catch (e) { /* a bad listener must not break others */ } });
    }

    function init() {
        if (!read()) show(false);

        // Any element with data-consent-open reopens the banner
        document.addEventListener("click", function (event) {
            if (event.target.closest("[data-consent-open]")) show(true);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    /* ---------- Public API ---------- */

    window.Consent = {
        get: read,
        set: set,
        open: function () { show(true); },
        onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); },
    };
})();
