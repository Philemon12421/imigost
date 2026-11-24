# ImageSearch Toolkit (browser extension)

A small Chrome extension that goes with the ImageSearch site. It works in Chrome, Edge, Brave and Opera (anything Chromium-based, Manifest V3).

## What it does

| Where you right-click | Menu item | What happens |
| --- | --- | --- |
| An image | Crop for social media | Opens the crop tool with that image already loaded |
| An image | Compress, resize or convert | Opens the converter with that image already loaded |
| A page | Add this page to my link page | Opens the link page builder with the page added |
| A link | Add this link to my link page | Same, for the link |
| Selected text | Search photos for "…" | Opens photo search for it |

The toolbar button opens a popup with a search box, an "add this page" button and quick links to each tool.

## Install (for people using it)

Send them to the **Get the Chrome extension** button in the site footer. It opens `extension.html`, which has the download and the steps. In short:

1. Download `imagesearch-toolkit.zip` and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the `imagesearch-toolkit` folder.

## Pointing it at your own site

The default address is set at the top of `imagesearch-toolkit/config.js`:

```js
const DEFAULT_SITE = "https://imigost.vercel.app";
```

Change it before you build the ZIP, or let each person change it in the extension's **Settings** (it accepts `https://` addresses, and `http://localhost` for testing).

## How it works

- Right-clicking an image makes the background script open the tool in a new tab and fetch the image itself. Because the extension has access to all sites, it can fetch images a normal web page could not. For images it can't reach (such as `blob:` images), it asks the page to read them instead.
- It then puts the image into the tool page's file box and fires a `change` event, exactly as if the person had picked the file. The tool does the rest, so nothing on the site needed a special "extension mode".
- Adding a link opens `links.html?add=<address>&title=<title>`. The builder reads that, adds the link and removes the parameters from the address bar. Searching opens `index.html?q=<text>`.
- Images over 15 MB are refused. If an image can't be fetched, the tool still opens and tells the person what happened.

## Permissions

| Permission | Why |
| --- | --- |
| `host_permissions: <all_urls>` | To fetch the one image you right-click, and to place it into your tool tab |
| `contextMenus` | The right-click items |
| `scripting` | Putting the image into the tool page |
| `storage` | Remembering your site address |

No analytics. Nothing is sent anywhere except from your browser to your own site's tabs.

## Building the ZIP

The ZIP must contain one top-level folder, so it unzips into something people can select in Chrome. From the `extension` folder:

```bash
zip -r imagesearch-toolkit.zip imagesearch-toolkit
```

Raise `"version"` in `imagesearch-toolkit/manifest.json` first when you ship an update, and update the version shown in `extension.html`.

## Putting it on the Chrome Web Store later

Loading unpacked is fine for friends and early users. For one-click installs you can publish the same folder to the Chrome Web Store (one-time developer fee, plus a review). Because it asks for access to all sites, expect to explain that in the store listing.
