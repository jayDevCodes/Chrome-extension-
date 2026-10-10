(() => {
  "use strict";

  const API_BASE = "http://127.0.0.1:8765";
  const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
  const MAX_IMAGES = 6;

  const $ = (id) => document.getElementById(id);
  const state = {
    tabId: null,
    pageTitle: "",
    candidates: [],
    requestCandidates: [],
    result: null,
    profiles: [],
    feedbackSaved: false
  };

  function setStatus(message, kind) {
    const badge = $("serviceBadge");
    badge.textContent = message;
    badge.className = "status-badge " + (kind || "checking");
  }

  function showError(message) {
    $("errorBox").textContent = message;
    $("errorBox").hidden = false;
    $("noticeBox").hidden = true;
  }

  function clearError() {
    $("errorBox").textContent = "";
    $("errorBox").hidden = true;
  }

  function showNotice(message) {
    $("noticeBox").textContent = message;
    $("noticeBox").hidden = false;
    $("errorBox").hidden = true;
  }

  function clearNotice() {
    $("noticeBox").textContent = "";
    $("noticeBox").hidden = true;
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  async function parseResponse(response) {
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) {
      const detail = typeof payload.detail === "string" ? payload.detail : "Request failed with HTTP " + response.status + ".";
      throw new Error(detail);
    }
    return payload;
  }

  async function checkLocalService() {
    setStatus("Checking local AI…", "checking");
    try {
      const response = await fetch(API_BASE + "/api/health", { method: "GET", cache: "no-store" });
      const health = await parseResponse(response);
      setStatus("Local service online", "online");
      if (health.model && health.model.loaded === false) {
        showNotice("The local API is running. The vision model loads when you start your first analysis; its first use may take longer.");
      }
      if (!state.profiles.length) await loadProfiles();
      return true;
    } catch (_) {
      setStatus("Local AI offline", "offline");
      showNotice("Start Best-Image on this Mac first. Its local API should be available at http://127.0.0.1:8765. Your prompt and images stay on your computer.");
      return false;
    }
  }

  async function loadProfiles() {
    try {
      const response = await fetch(API_BASE + "/api/profiles", { cache: "no-store" });
      const payload = await parseResponse(response);
      if (!Array.isArray(payload.profiles)) return;
      state.profiles = payload.profiles;
      const select = $("profileSelect");
      const previous = select.value;
      select.replaceChildren();
      state.profiles.forEach((profile) => addOption(select, profile.id, profile.label));
      if (state.profiles.some((profile) => profile.id === previous)) select.value = previous;
      else if (state.profiles.some((profile) => profile.id === "prompt_accuracy")) select.value = "prompt_accuracy";
    } catch (_) {
      // Keep the built-in profiles as a usable fallback if the service is restarting.
    }
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length || typeof tabs[0].id !== "number") throw new Error("Open the webpage with image candidates, then scan it again.");
    return tabs[0];
  }

  async function ensureContentScript(tabId) {
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content.js"] });
  }

  async function sendTabMessage(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (_) {
      await ensureContentScript(tabId);
      return await chrome.tabs.sendMessage(tabId, message);
    }
  }

  function selectedCandidates() {
    return state.candidates.filter((candidate) => candidate.selected);
  }

  function updateSelectedSummary() {
    const count = selectedCandidates().length;
    const total = state.candidates.length;
    $("scanSummary").textContent = total
      ? total + " candidate image" + (total === 1 ? "" : "s") + " found · " + count + " selected"
      : "No candidate images found yet.";
    $("analyzeButton").disabled = count < 2 || count > MAX_IMAGES;
  }

  function hostLabel(source) {
    try {
      if (source.startsWith("data:")) return "Embedded image";
      const url = new URL(source);
      return url.hostname + (url.port ? ":" + url.port : "");
    } catch (_) {
      return "Page-local image";
    }
  }

  function renderCandidateList() {
    const list = $("candidateList");
    list.replaceChildren();
    if (!state.candidates.length) {
      list.appendChild(make("p", "muted small", "No suitable images found. Try scrolling the page to load the images and scan again, or use another page."));
      updateSelectedSummary();
      return;
    }

    state.candidates.forEach((candidate, index) => {
      const card = make("label", "candidate-card" + (candidate.selected ? " is-selected" : ""));
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(candidate.selected);
      checkbox.setAttribute("aria-label", "Select candidate " + (index + 1));
      const preview = document.createElement("img");
      preview.className = "candidate-thumb";
      preview.alt = candidate.description || ("Candidate " + (index + 1));
      preview.loading = "lazy";
      preview.referrerPolicy = "no-referrer";
      preview.src = candidate.src;
      preview.addEventListener("error", () => {
        preview.removeAttribute("src");
        preview.alt = "Preview unavailable";
      }, { once: true });
      const copy = make("span", "candidate-copy");
      const name = make("span", "candidate-name", "Image " + (index + 1) + (candidate.description ? " · " + candidate.description.slice(0, 64) : ""));
      const meta = make("span", "candidate-meta", candidate.width + " × " + candidate.height + " px · " + hostLabel(candidate.src) + (candidate.selectable ? " · selection control detected" : ""));
      copy.append(name, meta);
      card.append(checkbox, preview, copy);
      checkbox.addEventListener("change", () => {
        const chosen = selectedCandidates().length;
        if (checkbox.checked && chosen >= MAX_IMAGES) {
          checkbox.checked = false;
          showError("The evaluator accepts at most six images per comparison.");
          return;
        }
        clearError();
        candidate.selected = checkbox.checked;
        card.classList.toggle("is-selected", checkbox.checked);
        updateSelectedSummary();
      });
      list.appendChild(card);
    });
    updateSelectedSummary();
  }

  async function scanPage() {
    clearError();
    clearNotice();
    $("scanButton").disabled = true;
    $("scanButton").textContent = "Scanning…";
    try {
      const tab = await getActiveTab();
      await ensureContentScript(tab.id);
      const payload = await sendTabMessage(tab.id, { type: "BIC_SCAN" });
      if (!payload || !payload.ok) throw new Error((payload && payload.message) || "Could not scan this page.");
      state.tabId = tab.id;
      state.pageTitle = payload.title || "";
      state.candidates = (payload.candidates || []).map((candidate, index) => Object.assign({}, candidate, {
        selected: index < Math.min(6, (payload.candidates || []).length)
      }));
      $("resultsSection").hidden = true;
      $("selectionStatus").textContent = "";
      $("feedbackStatus").textContent = "";
      state.result = null;
      state.requestCandidates = [];
      state.feedbackSaved = false;
      if (payload.prompt && !$("promptInput").value.trim()) $("promptInput").value = payload.prompt;
      if (!state.candidates.length) {
        showNotice("I couldn't find large visible image elements on this page. Scroll until the candidates appear, try scanning again, or use the extension's local-file fallback after choosing page candidates.");
      } else {
        showNotice("Review the prompt and checked cards before analyzing. Page scan results are temporary and are not saved.");
      }
      renderCandidateList();
    } catch (error) {
      showError("Scan failed: " + (error.message || "unknown error") + " Some Chrome pages (such as chrome:// pages) cannot be scanned.");
    } finally {
      $("scanButton").disabled = false;
      $("scanButton").textContent = "Scan this page";
    }
  }

  function permissionPatterns(candidates) {
    const patterns = new Set();
    candidates.forEach((candidate) => {
      try {
        const url = new URL(candidate.src);
        if (url.protocol === "http:" || url.protocol === "https:") patterns.add(url.origin + "/*");
      } catch (_) {}
    });
    return Array.from(patterns);
  }

  async function askImagePermissions(candidates) {
    const patterns = permissionPatterns(candidates);
    if (!patterns.length) return true;
    try {
      return await chrome.permissions.request({ origins: patterns });
    } catch (error) {
      throw new Error("Chrome could not grant access to the selected image host. Use the local-file fallback if downloads are blocked.");
    }
  }

  async function capturePageLocalImage(candidate) {
    if (state.tabId === null) throw new Error("Scan the page again before analyzing its images.");
    const result = await sendTabMessage(state.tabId, { type: "BIC_CAPTURE_LOCAL_IMAGE", id: candidate.id });
    if (!result || !result.ok || !result.dataUrl) throw new Error((result && result.message) || "The page-local image could not be read.");
    const response = await fetch(result.dataUrl);
    return await response.blob();
  }

  function mimeFromUrl(source) {
    try {
      const pathname = new URL(source).pathname.toLowerCase();
      if (pathname.endsWith(".png")) return "image/png";
      if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
      if (pathname.endsWith(".webp")) return "image/webp";
      if (pathname.endsWith(".gif")) return "image/gif";
      if (pathname.endsWith(".avif")) return "image/avif";
      if (pathname.endsWith(".bmp")) return "image/bmp";
    } catch (_) {}
    const dataMatch = /^data:(image\/[a-z0-9.+-]+)/i.exec(source);
    return dataMatch ? dataMatch[1].toLowerCase() : "";
  }

  async function convertToSupportedImage(blob, source) {
    if (!blob || !blob.size) throw new Error("This candidate returned an empty image.");
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("One selected image exceeds Best-Image's 15 MB limit.");
    let mime = (blob.type || "").split(";")[0].toLowerCase();
    if (!mime || mime === "application/octet-stream") mime = mimeFromUrl(source);
    if (["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      return new Blob([blob], { type: mime });
    }
    if (!mime.startsWith("image/") || mime === "image/svg+xml") {
      throw new Error("A selected URL did not return a supported raster image. Use the local-file fallback for that candidate.");
    }
    try {
      const bitmap = await createImageBitmap(blob);
      if (bitmap.width * bitmap.height > 25000000) {
        bitmap.close();
        throw new Error("One selected image is over the 25-megapixel limit.");
      }
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        bitmap.close();
        throw new Error("Could not prepare this image for the evaluator.");
      }
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const converted = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not convert this image to PNG.")), "image/png");
      });
      canvas.width = 1;
      canvas.height = 1;
      if (converted.size > MAX_IMAGE_BYTES) throw new Error("The converted image exceeds Best-Image's 15 MB limit.");
      return converted;
    } catch (error) {
      if (error && error.message) throw error;
      throw new Error("The selected image format could not be converted. Use a PNG, JPEG, or WebP file instead.");
    }
  }

  async function downloadCandidate(candidate) {
    let blob;
    if (/^(blob:|data:image\/)/i.test(candidate.src)) {
      blob = await capturePageLocalImage(candidate);
    } else {
      const response = await fetch(candidate.src, { credentials: "include", cache: "force-cache" });
      if (!response.ok) throw new Error("Image " + (state.candidates.indexOf(candidate) + 1) + " could not be downloaded (HTTP " + response.status + "). Try local-file fallback.");
      blob = await response.blob();
    }
    return await convertToSupportedImage(blob, candidate.src);
  }

  function fileExtension(blob) {
    const type = (blob.type || "").toLowerCase();
    if (type === "image/jpeg") return "jpg";
    if (type === "image/webp") return "webp";
    return "png";
  }

  async function buildUploadBlobs(candidates, replacements) {
    const blobs = [];
    let totalBytes = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      const source = replacements.length ? replacements[index] : await downloadCandidate(candidates[index]);
      const blob = await convertToSupportedImage(source, candidates[index].src);
      totalBytes += blob.size;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error("The selected images exceed Best-Image's combined 40 MB upload limit.");
      blobs.push(blob);
      $("scanSummary").textContent = "Preparing images… " + (index + 1) + " of " + candidates.length;
    }
    return blobs;
  }

  function getErrorMessage(error) {
    return error && error.message ? error.message : "An unexpected error occurred.";
  }

  async function analyze() {
    clearError();
    clearNotice();
    $("selectionStatus").textContent = "";
    $("feedbackStatus").textContent = "";
    const prompt = $("promptInput").value.trim();
    const candidates = selectedCandidates();
    const replacements = Array.from($("replacementFiles").files || []);
    if (!prompt) {
      showError("Enter or scan the exact prompt before analyzing.");
      $("promptInput").focus();
      return;
    }
    if (candidates.length < 2 || candidates.length > MAX_IMAGES) {
      showError("Select between two and six candidate cards.");
      return;
    }
    if (replacements.length && replacements.length !== candidates.length) {
      showError("Choose exactly " + candidates.length + " fallback files, in the same order as the checked cards, or clear the file picker.");
      return;
    }
    if (replacements.some((file) => file.size > MAX_IMAGE_BYTES)) {
      showError("One fallback file exceeds Best-Image's 15 MB per-image limit.");
      return;
    }
    if (replacements.length && replacements.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
      showError("The fallback files exceed Best-Image's combined 40 MB upload limit.");
      return;
    }

    // Request optional host access while this click still carries user activation.
    const permissionPromise = replacements.length ? Promise.resolve(true) : askImagePermissions(candidates);
    $("analyzeButton").disabled = true;
    $("analyzeButton").textContent = "Preparing images…";
    try {
      const granted = await permissionPromise;
      if (!granted && !replacements.length) {
        throw new Error("Image access was not granted. You can retry and approve the requested image-host permission, or select fallback files.");
      }
      if (!await serviceReachable()) {
        throw new Error("Best-Image is not responding at 127.0.0.1:8765. Start the local API and try again.");
      }
      const blobs = await buildUploadBlobs(candidates, replacements);
      const form = new FormData();
      form.set("prompt", prompt);
      form.set("profile", $("profileSelect").value || "prompt_accuracy");
      blobs.forEach((blob, index) => {
        form.append("images", new File([blob], "candidate-" + (index + 1) + "." + fileExtension(blob), { type: blob.type }));
      });

      $("analyzeButton").textContent = "Analyzing locally…";
      showNotice("Comparing the images locally. The first run may take longer while the vision model loads.");
      const response = await fetch(API_BASE + "/api/analyze", { method: "POST", body: form });
      const result = await parseResponse(response);
      if (!Array.isArray(result.ranking) || typeof result.winner_index !== "number") throw new Error("The evaluator returned an unexpected response.");
      state.result = result;
      state.requestCandidates = candidates.slice();
      state.feedbackSaved = false;
      renderResults(result);
      $("resultsSection").hidden = false;
      $("resultsSection").scrollIntoView({ behavior: "smooth", block: "start" });
      $("feedbackStatus").textContent = "";
      showNotice("Ranking complete. Review the limitations and inspect the proposed winner on the page before submitting anything.");
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      $("analyzeButton").disabled = selectedCandidates().length < 2 || selectedCandidates().length > MAX_IMAGES;
      $("analyzeButton").textContent = "Analyze locally";
      updateSelectedSummary();
    }
  }

  async function serviceReachable() {
    try {
      const response = await fetch(API_BASE + "/api/health", { cache: "no-store" });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  function renderResults(result) {
    const selectedForRequest = state.requestCandidates;
    const rankingList = $("rankingList");
    rankingList.replaceChildren();
    const winner = result.ranking.find((item) => item.index === result.winner_index) || result.ranking[0];
    const winnerCandidate = selectedForRequest[result.winner_index];
    const gap = typeof result.winner_gap === "number" ? result.winner_gap.toFixed(1) : "—";
    const summary = $("winnerSummary");
    summary.replaceChildren();
    summary.appendChild(make("strong", "", "Recommended: Image " + (result.winner_index + 1)));
    summary.appendChild(make("p", "", "Score " + (winner ? winner.score : "—") + " / 100 · " + gap + "-point gap to the next candidate. This is a comparative signal, not a probability of being correct."));
    if (winnerCandidate && winnerCandidate.description) {
      summary.appendChild(make("p", "", winnerCandidate.description));
    }

    result.ranking.forEach((item) => {
      const candidate = selectedForRequest[item.index];
      const card = make("article", "ranking-card" + (item.index === result.winner_index ? " top" : ""));
      const titleRow = make("div", "ranking-title-row");
      titleRow.appendChild(make("span", "rank-number", String(item.rank || "")));
      titleRow.appendChild(make("span", "rank-label", "Image " + (item.index + 1) + (candidate && candidate.description ? " · " + candidate.description.slice(0, 45) : "")));
      titleRow.appendChild(make("span", "rank-score", Number(item.score).toFixed(1)));
      card.appendChild(titleRow);

      const criteria = item.criteria || {};
      Object.keys(criteria).forEach((key) => {
        const criterion = criteria[key];
        const row = make("div", "criteria-row");
        const left = make("div", "");
        left.appendChild(make("span", "criteria-label", criterion.label || key));
        const meter = make("div", "meter");
        const fill = make("div", "meter-fill");
        fill.style.width = Math.max(0, Math.min(100, Number(criterion.score) || 0)) + "%";
        meter.appendChild(fill);
        left.appendChild(meter);
        row.append(left, make("span", "criteria-score", Number(criterion.score).toFixed(0)));
        card.appendChild(row);
      });

      if (Array.isArray(item.reasons) && item.reasons.length) {
        const reasons = make("ul", "reason-list");
        item.reasons.forEach((reason) => reasons.appendChild(make("li", "", reason)));
        card.appendChild(reasons);
      }
      rankingList.appendChild(card);
    });

    const warnings = $("warningsList");
    warnings.replaceChildren();
    const notes = Array.isArray(result.warnings) ? result.warnings : [];
    notes.forEach((warning) => warnings.appendChild(make("p", "", typeof warning === "string" ? warning : JSON.stringify(warning))));
    if (!notes.length) warnings.appendChild(make("p", "", result.score_semantics || "Scores are comparative heuristics, not calibrated probabilities."));
    if (winner && winner.winner_summary) warnings.appendChild(make("p", "", winner.winner_summary));

    const preferred = $("preferredCandidate");
    preferred.replaceChildren();
    selectedForRequest.forEach((candidate, index) => {
      const title = "Image " + (index + 1) + (candidate.description ? " · " + candidate.description.slice(0, 45) : "");
      addOption(preferred, String(index), title);
    });
    preferred.value = String(result.winner_index);
    $("selectWinnerButton").disabled = !winnerCandidate || !winnerCandidate.id || state.tabId === null;
    $("acceptAiButton").disabled = false;
    $("saveFeedbackButton").disabled = false;
  }

  async function selectWinnerOnPage() {
    clearError();
    if (!state.result) return;
    const candidate = state.requestCandidates[state.result.winner_index];
    if (!candidate || !candidate.id) {
      showError("This winner does not map to a scanned page image. Scan the page again.");
      return;
    }
    try {
      const tab = await getActiveTab();
      if (tab.id !== state.tabId) {
        throw new Error("You changed tabs after scanning. Return to the original webpage and scan it again.");
      }
      const response = await sendTabMessage(tab.id, { type: "BIC_SELECT", id: candidate.id });
      if (!response || !response.ok) throw new Error((response && response.message) || "Could not select the winner.");
      $("selectionStatus").textContent = response.message;
      $("selectionStatus").style.color = response.verified ? "var(--green)" : "#805b12";
      if (!response.verified) showNotice(response.message);
    } catch (error) {
      showError(getErrorMessage(error));
    }
  }

  async function saveFeedback(preferredIndex) {
    clearError();
    if (!state.result || state.feedbackSaved) {
      if (state.feedbackSaved) $("feedbackStatus").textContent = "Feedback for this comparison has already been saved.";
      return;
    }
    const numericIndex = Number(preferredIndex);
    if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= state.requestCandidates.length) {
      showError("Select one of the compared images as your preference.");
      return;
    }
    $("acceptAiButton").disabled = true;
    $("saveFeedbackButton").disabled = true;
    try {
      const response = await fetch(API_BASE + "/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: state.result.task_id, preferred_index: numericIndex })
      });
      const feedback = await parseResponse(response);
      state.feedbackSaved = true;
      $("feedbackStatus").textContent = "Saved locally · " + (feedback.feedback_count || 0) + " reviewed comparison(s). " + ((feedback.personalization && feedback.personalization.message) || feedback.message || "");
      showNotice("Your preference was saved in the local feedback database. It will influence future comparisons when enough informative feedback exists.");
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      $("acceptAiButton").disabled = state.feedbackSaved;
      $("saveFeedbackButton").disabled = state.feedbackSaved;
    }
  }

  $("refreshConnection").addEventListener("click", async () => {
    clearError();
    clearNotice();
    await checkLocalService();
  });
  $("scanButton").addEventListener("click", scanPage);
  $("analyzeButton").addEventListener("click", analyze);
  $("selectWinnerButton").addEventListener("click", selectWinnerOnPage);
  $("acceptAiButton").addEventListener("click", () => {
    if (state.result) saveFeedback(state.result.winner_index);
  });
  $("saveFeedbackButton").addEventListener("click", () => saveFeedback($("preferredCandidate").value));

  checkLocalService();
})();