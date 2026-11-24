const ACCESS_KEY = "M6TJBtHgrKtH5e4PKgrzfNDTV3fQJK1VDTHdZnjZQRc"; // https://unsplash.com/developers
const PER_PAGE = 12;
const UTM = "?utm_source=image_search&utm_medium=referral";

const form = document.getElementById("search-form");
const searchBox = document.getElementById("search-box");
const searchResult = document.getElementById("search-result");
const showMoreBtn = document.getElementById("show-more-btn");
const statusEl = document.getElementById("status");
const titleEl = document.getElementById("results-title");
const captionEl = document.getElementById("results-caption");
const suggestions = document.querySelectorAll(".suggestion");

const lightbox = document.getElementById("lightbox");
const lbImage = document.getElementById("lb-image");
const lbAuthor = document.getElementById("lb-author");
const lbSource = document.getElementById("lb-source");
const lbPrev = document.getElementById("lb-prev");
const lbNext = document.getElementById("lb-next");
const lbClose = document.getElementById("lb-close");

/* A long placeholder gets cut off on phones, so use a short one there */
const narrowScreen = window.matchMedia("(max-width: 520px)");

function setPlaceholder() {
    searchBox.placeholder = narrowScreen.matches ? "Search photos" : "Try “foggy mountains” or “blue door”";
}

setPlaceholder();
narrowScreen.addEventListener("change", setPlaceholder);

let keyword = "";
let page = 1;
let hasMore = false;
let loading = false;
let photos = [];
let currentIndex = 0;

/* ---------- Helpers ---------- */

function setStatus(title, text) {
    if (!title) {
        statusEl.hidden = true;
        statusEl.innerHTML = "";
        return;
    }
    statusEl.hidden = false;
    statusEl.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = title;
    statusEl.append(strong, text || "");
}

/* ---------- Masonry grid ---------- */
/* Each photo goes into the shortest column and stays there, so tapping
   "Show more" never makes photos you've already seen jump around. */

let gridCols = [];
let gridItems = []; // every element in the order it was added

function wantedColumns() {
    if (window.innerWidth <= 700) return 2;
    const width = searchResult.clientWidth || window.innerWidth;
    return Math.max(2, Math.min(4, Math.floor((width + 20) / 320)));
}

function buildColumns() {
    searchResult.innerHTML = "";
    gridCols = [];
    for (let i = 0; i < wantedColumns(); i++) {
        const col = document.createElement("div");
        col.className = "grid-col";
        searchResult.appendChild(col);
        gridCols.push(col);
    }
}

function resetGrid() {
    gridItems = [];
    buildColumns();
}

function placeInShortest(el) {
    let target = gridCols[0];
    gridCols.forEach((col) => {
        if (col.offsetHeight < target.offsetHeight) target = col;
    });
    target.appendChild(el);
}

function addToGrid(el) {
    gridItems.push(el);
    placeInShortest(el);
}

function removeFromGrid(el) {
    gridItems = gridItems.filter((item) => item !== el);
    el.remove();
}

/* Rotating the phone or resizing the window can change the column count */
let resizeTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (gridItems.length && wantedColumns() !== gridCols.length) {
            buildColumns();
            gridItems.forEach(placeInShortest);
        }
    }, 150);
});

function showSkeletons() {
    resetGrid();
    const heights = [260, 340, 220, 300, 380, 240, 320, 280, 360];
    heights.forEach((h) => {
        const el = document.createElement("div");
        el.className = "skeleton";
        el.style.height = h + "px";
        addToGrid(el);
    });
}

let moreSkeletons = [];

function addMoreSkeletons() {
    [300, 240, 340].forEach((h) => {
        const el = document.createElement("div");
        el.className = "skeleton";
        el.style.height = h + "px";
        addToGrid(el);
        moreSkeletons.push(el);
    });
}

function removeMoreSkeletons() {
    moreSkeletons.forEach((el) => removeFromGrid(el));
    moreSkeletons = [];
}

function buildUrl() {
    const params = new URLSearchParams({
        page,
        per_page: PER_PAGE,
        client_id: ACCESS_KEY,
    });
    if (keyword) {
        params.set("query", keyword);
        return `https://api.unsplash.com/search/photos?${params}`;
    }
    params.set("order_by", "popular");
    return `https://api.unsplash.com/photos?${params}`;
}

/* ---------- Fetch + render ---------- */

async function loadPhotos() {
    if (loading) return;

    if (ACCESS_KEY === "YOUR_UNSPLASH_ACCESS_KEY") {
        resetGrid();
        setStatus("Add your Unsplash access key", "Open image.js and replace YOUR_UNSPLASH_ACCESS_KEY with your key.");
        return;
    }

    loading = true;
    searchResult.setAttribute("aria-busy", "true");
    setStatus("");

    if (page === 1) {
        photos = [];
        showMoreBtn.style.display = "none";
        showSkeletons();
        captionEl.textContent = "";
    } else {
        showMoreBtn.disabled = true;
        showMoreBtn.textContent = "Loading...";
        addMoreSkeletons();
    }

    try {
        const response = await fetch(buildUrl());

        if (response.status === 403 || response.status === 429) {
            throw new Error("rate");
        }
        if (!response.ok) throw new Error(`Request failed (${response.status})`);

        const data = await response.json();
        const results = keyword ? data.results : data;

        if (page === 1) resetGrid();

        if (results.length === 0 && page === 1) {
            setStatus(`No photos found for “${keyword}”`, "Check the spelling or try a broader word, like “forest” instead of “pine forest”.");
            hasMore = false;
        } else {
            results.forEach((photo) => {
                photos.push(photo);
                addToGrid(createTile(photo, photos.length - 1));
            });

            hasMore = keyword ? page < data.total_pages : results.length === PER_PAGE;

            if (keyword && page === 1) {
                captionEl.textContent = `${data.total.toLocaleString()} photos`;
            }
        }
    } catch (error) {
        console.error(error);
        if (page === 1) resetGrid();
        hasMore = false;

        if (error.message === "rate") {
            setStatus("Request limit reached", "Unsplash allows a limited number of requests per hour. Try again later.");
        } else if (page === 1) {
            setStatus("Couldn’t load photos", "Check your connection and search again.");
        } else {
            setStatus("Couldn’t load more photos", "Check your connection and try again.");
            hasMore = true;
            page--;
        }
    } finally {
        loading = false;
        removeMoreSkeletons();
        searchResult.setAttribute("aria-busy", "false");
        showMoreBtn.disabled = false;
        showMoreBtn.textContent = "Show more photos";
        showMoreBtn.style.display = hasMore ? "block" : "none";
    }
}

function createTile(photo, index) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.style.aspectRatio = `${photo.width} / ${photo.height}`;
    if (photo.color) tile.style.background = photo.color;
    tile.setAttribute("aria-label", `Open photo by ${photo.user.name}`);

    const img = document.createElement("img");
    img.src = photo.urls.small;
    img.alt = photo.alt_description || photo.description || keyword || "Photo";
    img.loading = "lazy";
    img.addEventListener("load", () => img.classList.add("loaded"));
    if (img.complete) img.classList.add("loaded");

    const credit = document.createElement("span");
    credit.className = "tile-credit";
    credit.textContent = photo.user.name;

    tile.append(img, credit);
    tile.addEventListener("click", () => openLightbox(index));
    return tile;
}

function startSearch(term) {
    keyword = term.trim();
    page = 1;
    titleEl.textContent = keyword ? `Results for “${keyword}”` : "Popular right now";
    loadPhotos();
    if (keyword) {
        document.querySelector(".results-heading").scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

/* ---------- Lightbox ---------- */

function openLightbox(index) {
    currentIndex = index;
    renderLightbox();
    if (!lightbox.open) lightbox.showModal();
}

function renderLightbox() {
    const photo = photos[currentIndex];
    lbImage.src = photo.urls.regular;
    lbImage.alt = photo.alt_description || photo.description || keyword || "Photo";
    lbAuthor.textContent = photo.user.name;
    lbAuthor.href = photo.user.links.html + UTM;
    lbSource.href = photo.links.html + UTM;
    lbPrev.hidden = currentIndex === 0;
    lbNext.hidden = currentIndex === photos.length - 1 && !hasMore;
}

async function step(direction) {
    const next = currentIndex + direction;
    if (next < 0) return;

    if (next >= photos.length) {
        if (!hasMore || loading) return;
        page++;
        await loadPhotos();
        if (next >= photos.length) return;
    }
    currentIndex = next;
    renderLightbox();
}

lbPrev.addEventListener("click", () => step(-1));
lbNext.addEventListener("click", () => step(1));
lbClose.addEventListener("click", () => lightbox.close());

// Click on the dark backdrop closes the viewer
lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) lightbox.close();
});

lightbox.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
});

/* ---------- Events ---------- */

form.addEventListener("submit", (e) => {
    e.preventDefault();
    startSearch(searchBox.value);
});

showMoreBtn.addEventListener("click", () => {
    page++;
    loadPhotos();
});

suggestions.forEach((chip) => {
    chip.addEventListener("click", () => {
        searchBox.value = chip.textContent;
        startSearch(chip.textContent);
    });
});

// Show popular photos on first load
// Opened from the browser extension with ?q=... : search for it straight away
const initialQuery = (new URLSearchParams(location.search).get("q") || "").trim().slice(0, 100);
if (initialQuery) {
    searchBox.value = initialQuery;
    startSearch(initialQuery);
} else {
    startSearch("");
}
