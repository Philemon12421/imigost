(function () {
    "use strict";

    var form = document.getElementById("search-form");
    var query = document.getElementById("q");
    var addBtn = document.getElementById("add-page");
    var addSub = document.getElementById("add-sub");
    var message = document.getElementById("message");
    var currentTab = null;

    function show(text, isError) {
        message.textContent = text || "";
        message.classList.toggle("error", Boolean(isError));
    }

    async function open(page, params) {
        var site = await getSite();
        await chrome.tabs.create({ url: sitePage(site, page, params), active: true });
        window.close();
    }

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        var q = query.value.replace(/\s+/g, " ").trim().slice(0, 100);
        if (q) open("index.html", { q: q });
    });

    document.querySelectorAll("[data-page]").forEach(function (link) {
        link.addEventListener("click", function (event) {
            event.preventDefault();
            open(link.dataset.page);
        });
    });

    addBtn.addEventListener("click", function () {
        if (!currentTab) return;
        open("links.html", { add: currentTab.url, title: cleanTitle(currentTab.title) });
    });

    document.getElementById("open-options").addEventListener("click", function (event) {
        event.preventDefault();
        chrome.runtime.openOptionsPage();
        window.close();
    });

    chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
        currentTab = tabs[0];
        if (currentTab && /^https?:\/\//i.test(currentTab.url || "")) {
            addSub.textContent = cleanTitle(currentTab.title) || currentTab.url;
        } else {
            addBtn.disabled = true;
            addSub.textContent = "Open a website first";
        }
    });

    query.focus();
})();
