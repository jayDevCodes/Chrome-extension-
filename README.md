# Best-Image Companion

A local-first Chrome Manifest V3 side-panel extension that connects a webpage's image candidates to the [Best-Image](https://github.com/jayDevCodes/Best-Image) evaluator running on your computer.

## What it does

1. Scan the current page for visible image candidates and a likely prompt field.
2. Review the scan, enter or correct the prompt, and choose 2–6 candidates.
3. Ask the local Best-Image API to rank the selected images.
4. Review the winning score, criterion breakdown, and limitations.
5. Click **Select winner on page** to try selecting/highlighting the corresponding original image.
6. Send your preference back to the local evaluator so its feedback learner can improve future rankings.

The extension does not auto-submit forms or complete tasks on your behalf. You review the winner and perform any final submission yourself. The prompt and candidate image bytes are sent only to the local Best-Image service at `127.0.0.1`; there is no extension analytics or remote inference service.

## Requirements

- Google Chrome 116 or newer (the extension opens its side panel with `chrome.sidePanel.open()`).
- The Best-Image API running locally at `http://127.0.0.1:8765`.
- First-time Best-Image setup/model download completed as described in that repository's README.

## Run Best-Image

Follow the setup instructions in [Best-Image README](https://github.com/jayDevCodes/Best-Image#quick-start-macos--apple-silicon). Once its local server is running, verify `http://127.0.0.1:8765/api/health` opens successfully.

## Install the extension (unpacked)

1. Download this repository using GitHub's **Code → Download ZIP**, then extract it, or clone it:
   ```bash
   git clone https://github.com/jayDevCodes/Chrome-extension-.git
   ```
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and choose the extracted/cloned `Chrome-extension-` folder (the folder containing `manifest.json`).
5. Open the webpage with the generated images and click the extension's toolbar icon to open the side panel.

This is an unpacked developer extension, not a published Chrome Web Store package.

## Typical workflow

- Click **Scan this page**.
- Verify the extracted prompt and check the 2–6 image cards you want to compare.
- If necessary, edit the prompt manually.
- Choose a scoring profile and click **Analyze locally**.
- Review the ranked recommendation and use **Select winner on page**. If the site uses a custom selection mechanism the extension cannot identify, it will highlight/scroll to the image and ask you to click it yourself.
- Submit feedback using **AI pick is right** or choose the candidate you actually prefer.

## Permissions and privacy

- `activeTab` and `scripting` are used only when you explicitly scan or select on the current tab.
- Optional host access is requested for the origins of selected remote images only when you analyze them. This is needed to download image bytes into the local evaluator; Chrome displays its own permission prompt when access is needed.
- The extension keeps scan results and prompt text in side-panel memory. It does not persist prompts, image content, or browsing history.
- Candidate images may be temporarily fetched by the extension and POSTed to `http://127.0.0.1:8765/api/analyze`. The evaluator processes uploads in memory and does not save the image files by default.
- If a site's image URL cannot be fetched (for example a page-local `blob:` URL or protected image), the extension can use the optional local-file fallback: select files in the same order as the checked candidate cards.
- Never expose the local Best-Image server to the public internet.

## Current limitations

This is a generic DOM scanner, not a site-specific integration. Some platforms render images in canvas, use inaccessible URLs, or have custom selection controls; those cases may require manual file upload, a manual click, or a future site adapter. The evaluator's ranking is a comparative heuristic, not a guarantee that the image is correct. Text in images, exact object counts, fine spatial relationships, and subtle defects need human review.

## Development checks

The GitHub Actions workflow checks JavaScript syntax and validates `manifest.json` on each push and pull request.

## License

MIT. See `LICENSE`.
