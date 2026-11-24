(function () {
    "use strict";

    var input = document.getElementById("site");
    var status = document.getElementById("status");

    function show(text, isError) {
        status.textContent = text;
        status.classList.toggle("error", Boolean(isError));
    }

    chrome.storage.sync.get("siteUrl").then(function (stored) {
        input.value = normalizeSite(stored.siteUrl) || DEFAULT_SITE;
    });

    document.getElementById("save").addEventListener("click", async function () {
        var clean = normalizeSite(input.value);
        if (!clean) {
            show("Enter a full address that starts with https://", true);
            return;
        }
        await chrome.storage.sync.set({ siteUrl: clean });
        input.value = clean;
        show("Saved.");
    });

    document.getElementById("reset").addEventListener("click", async function () {
        await chrome.storage.sync.remove("siteUrl");
        input.value = DEFAULT_SITE;
        show("Back to the default site.");
    });
})();
