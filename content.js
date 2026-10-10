(() => {
  "use strict";

  const GLOBAL_KEY = "__bestImageCompanionContentV1";
  if (globalThis[GLOBAL_KEY]) return;

  const state = {
    candidates: new Map(),
    scanNumber: 0,
    lastHighlighted: null
  };

  const MIN_SIDE = 72;
  const MIN_AREA = 10000;
  const MAX_CANDIDATES = 40;

  function visible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 1 && rect.height >= 1;
  }

  function imageSourceAllowed(source) {
    if (!source || typeof source !== "string") return false;
    if (/\.svg(?:[?#]|$)/i.test(source) || /^data:image\/svg/i.test(source)) return false;
    return /^(https?:\/\/|blob:|data:image\/(?:png|jpe?g|webp|gif|bmp|avif|heic))/i.test(source);
  }

  function descriptorText(element) {
    const own = element.getAttribute("aria-label") || element.getAttribute("alt") || element.getAttribute("title");
    if (own && own.trim()) return own.trim().slice(0, 160);

    let holder = element;
    for (let depth = 0; holder && depth < 4; depth += 1, holder = holder.parentElement) {
      const label = holder.getAttribute && (holder.getAttribute("aria-label") || holder.getAttribute("title"));
      if (label && label.trim()) return label.trim().slice(0, 160);
      const text = holder.innerText;
      if (text && text.trim().length > 0 && text.trim().length <= 180) return text.trim().replace(/\s+/g, " ").slice(0, 160);
    }
    return "";
  }

  function findSelectionTarget(element) {
    let current = element;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      if (globalThis.BICCore && globalThis.BICCore.isSafeSelectionTarget(current, element)) {
        return { target: current, selectable: true };
      }
      if (current !== element) {
        const style = getComputedStyle(current);
        const rect = current.getBoundingClientRect();
        if (style.cursor === "pointer" && rect.width >= 70 && rect.height >= 60 &&
            globalThis.BICCore && globalThis.BICCore.isSafeSelectionTarget(current, element, true)) {
          return { target: current, selectable: true };
        }
      }
    }
    return { target: element, selectable: false };
  }

  function findPrompt() {
    const inputs = Array.from(document.querySelectorAll("textarea, input:not([type]), input[type='text'], input[type='search'], [contenteditable='true']"))
      .filter(visible)
      .map((element) => {
        const labelText = element.labels ? Array.from(element.labels).map((label) => label.innerText || "").join(" ") : "";
        const meta = [
          labelText,
          element.getAttribute("placeholder") || "",
          element.getAttribute("aria-label") || "",
          element.getAttribute("name") || "",
          element.id || ""
        ].join(" ").toLowerCase();
        let score = 0;
        if (/\bprompt\b/.test(meta)) score += 5;
        if (/\bdescribe\b|\bdescription\b|\bwhat.*image\b/.test(meta)) score += 3;
        if (/\binstruction\b/.test(meta)) score += 2;
        if (/\bnegative prompt\b/.test(meta)) score -= 3;
        const value = element.isContentEditable ? (element.innerText || "") : (element.value || "");
        if (value.trim().length > 10) score += 1;
        return { value: value.trim(), score, tag: element.tagName.toLowerCase() };
      })
      .filter((item) => item.value);

    inputs.sort((a, b) => b.score - a.score);
    if (inputs.length && inputs[0].score >= 1) return inputs[0].value.slice(0, 2000);
    const textareas = inputs.filter((item) => item.tag === "textarea");
    if (textareas.length === 1) return textareas[0].value.slice(0, 2000);
    return "";
  }

  function addCandidate(element, source, kind, rect) {
    if (!imageSourceAllowed(source)) return;
    if (state.candidates.size >= MAX_CANDIDATES) return;
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width < MIN_SIDE || height < MIN_SIDE || width * height < MIN_AREA) return;
    if (state.candidates.size && Array.from(state.candidates.values()).some((entry) => entry.src === source)) return;

    const id = "bic-" + state.scanNumber + "-" + (state.candidates.size + 1);
    const selection = findSelectionTarget(element);
    const candidate = {
      id,
      element,
      target: selection.target,
      selectable: selection.selectable,
      src: source,
      kind,
      width,
      height,
      description: descriptorText(element)
    };
    state.candidates.set(id, candidate);
  }

  function scan() {
    state.scanNumber += 1;
    state.candidates.clear();
    const pageImages = Array.from(document.images);
    pageImages.forEach((img) => {
      if (!visible(img)) return;
      const rect = img.getBoundingClientRect();
      const source = img.currentSrc || img.src || "";
      addCandidate(img, source, "image", rect);
    });

    if (state.candidates.size < MAX_CANDIDATES) {
      const backgroundNodes = Array.from(document.querySelectorAll("button, [role='radio'], [role='option'], figure, article, div"))
        .filter(visible);
      backgroundNodes.forEach((node) => {
          if (state.candidates.size >= MAX_CANDIDATES) return;
          if (node.querySelector("img")) return;
          const rect = node.getBoundingClientRect();
          if (rect.width < MIN_SIDE || rect.height < MIN_SIDE || rect.width * rect.height < MIN_AREA) return;
          const background = getComputedStyle(node).backgroundImage || "";
          const match = background.match(/url\((?:"|')?(.*?)(?:"|')?\)/i);
          if (match && match[1]) addCandidate(node, match[1], "background", rect);
        });
    }

    const candidates = Array.from(state.candidates.values()).map((item) => ({
      id: item.id,
      src: item.src,
      kind: item.kind,
      width: item.width,
      height: item.height,
      description: item.description,
      selectable: item.selectable
    }));

    return {
      ok: true,
      title: document.title || "",
      url: location.href,
      prompt: findPrompt(),
      candidates
    };
  }

  function ensureHighlightStyle() {
    if (document.getElementById("best-image-companion-highlight-style")) return;
    const style = document.createElement("style");
    style.id = "best-image-companion-highlight-style";
    style.textContent = "[data-best-image-companion-selected='true']{outline:3px solid #7c3aed!important;outline-offset:4px!important;box-shadow:0 0 0 6px rgba(124,58,237,.18)!important;scroll-margin:35vh!important}";
    (document.documentElement || document.head).appendChild(style);
  }

  async function selectCandidate(id) {
    const candidate = state.candidates.get(id);
    if (!candidate || !candidate.element || !candidate.element.isConnected) {
      return { ok: false, message: "This page changed after scanning. Scan again to refresh the image mapping." };
    }

    if (state.lastHighlighted && state.lastHighlighted.isConnected) {
      state.lastHighlighted.removeAttribute("data-best-image-companion-selected");
    }

    const target = candidate.target && candidate.target.isConnected ? candidate.target : candidate.element;
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    ensureHighlightStyle();
    target.setAttribute("data-best-image-companion-selected", "true");
    state.lastHighlighted = target;

    let attemptedClick = false;
    let verified = false;
    let radio = null;
    if (target.matches && target.matches("input[type='radio']")) radio = target;
    if (!radio && target.querySelector) radio = target.querySelector("input[type='radio']");
    if (!radio && target.closest) {
      const label = target.closest("label");
      if (label && label.control && label.control.type === "radio") radio = label.control;
    }

    if (radio) {
      if (!radio.checked) radio.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      verified = Boolean(radio.checked);
      attemptedClick = true;
    } else if (candidate.selectable) {
      target.click();
      attemptedClick = true;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const attrs = [
        target.getAttribute("aria-checked"),
        target.getAttribute("aria-pressed"),
        target.getAttribute("data-state")
      ].map((value) => (value || "").toLowerCase());
      verified = attrs.some((value) => value === "true" || value === "checked" || value === "on" || value === "active");
      if (target.getAttribute("role") === "radio" && target.getAttribute("aria-checked") === "true") verified = true;
    }

    if (verified) {
      return { ok: true, verified: true, attemptedClick, message: "The page reports that this candidate is selected. Check it once before submitting the task." };
    }
    return {
      ok: true,
      verified: false,
      attemptedClick,
      message: "I highlighted and scrolled to the winning image, but could not verify the page's selected state. Check the highlighted card and click it manually if it is not selected."
    };
  }


  function extractFeedbackText() {
    const selectors = [
      "[role='alert']", "[role='status']", "[aria-live='polite']",
      "main p", "main li", "article p", "article li", "section p", "section li",
      "p", "li", "blockquote"
    ];
    const elements = Array.from(document.querySelectorAll(selectors.join(","))).filter(visible);
    const snippets = globalThis.BICCore
      ? globalThis.BICCore.extractFeedbackSnippets(elements.map((element) => element.innerText || element.textContent || ""), 6, 900)
      : [];
    const chosen = snippets.map((item) => "• " + item);
    return { ok: true, text: chosen.join("\n").slice(0, 3200), count: chosen.length };
  }

  async function captureLocalImage(id) {
    const candidate = state.candidates.get(id);
    if (!candidate || !candidate.src || !/^(blob:|data:image\/)/i.test(candidate.src)) {
      return { ok: false, message: "This image is not a page-local blob or data URL." };
    }
    const response = await fetch(candidate.src);
    if (!response.ok) throw new Error("Could not read the image from the page.");
    const blob = await response.blob();
    if (blob.size > 15 * 1024 * 1024) throw new Error("Image exceeds the 15 MB per-image limit.");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ ok: true, dataUrl: reader.result, type: blob.type, size: blob.size });
      reader.onerror = () => reject(new Error("Could not convert this page-local image."));
      reader.readAsDataURL(blob);
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    if (message.type === "BIC_SCAN") {
      try {
        sendResponse(scan());
      } catch (error) {
        sendResponse({ ok: false, message: error.message || "The scan failed." });
      }
      return false;
    }
    if (message.type === "BIC_SELECT") {
      selectCandidate(message.id)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, message: error.message || "Could not select the image." }));
      return true;
    }
    if (message.type === "BIC_CAPTURE_LOCAL_IMAGE") {
      captureLocalImage(message.id)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, message: error.message || "Could not read the image." }));
      return true;
    }
    if (message.type === "BIC_EXTRACT_FEEDBACK") {
      try {
        sendResponse(extractFeedbackText());
      } catch (error) {
        sendResponse({ ok: false, message: error.message || "Could not read feedback text from the page." });
      }
      return false;
    }
    return false;
  });

  globalThis[GLOBAL_KEY] = state;
})();