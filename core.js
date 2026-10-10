(function (root) {
  "use strict";
  const ACTION_TEXT = /^(?:next(?:\s+page)?|submit(?:\s+task)?|continue|finish(?:\s+task)?|send|generate|save|done|back|previous|prev|skip|report|feedback|cancel|close|delete|upload|confirm|approve|reject|start|retry|try again|sign in|log in|logout|remove|reset|clear)(?:\s|$)/i;
  function defaultSelectionIndexes(count, maxImages) {
    const maximum = Number.isInteger(maxImages) && maxImages > 0 ? maxImages : 6;
    if (!Number.isInteger(count) || count < 2 || count > maximum) return [];
    return Array.from({ length: count }, (_, index) => index);
  }
  function isSafeSelectionTarget(target, imageElement, allowClickableCard) {
    if (!target) return false;
    const tag = String(target.tagName || "").toLowerCase();
    const type = String(target.type || (target.getAttribute && target.getAttribute("type")) || "").toLowerCase();
    const role = String((target.getAttribute && target.getAttribute("role")) || "").toLowerCase();
    const label = String((target.getAttribute && (target.getAttribute("aria-label") || target.getAttribute("title") || target.getAttribute("name"))) || "").replace(/\s+/g, " ").trim();
    const text = String(target.innerText || target.textContent || "").replace(/\s+/g, " ").trim();
    const actionText = (label + " " + text).trim();
    if (tag === "button" && type !== "button") return false;
    if (tag === "a") return false;
    if (type === "submit" || type === "reset") return false;
    if (ACTION_TEXT.test(label) || ACTION_TEXT.test(text)) return false;
    if (/(?:^|\b)(?:submit|next page|continue to|finish task|send response|skip task|cancel task|delete|remove|report)(?:\b|$)/i.test(actionText)) return false;
    if (tag === "input" && (type === "radio" || type === "checkbox")) return true;
    if (tag === "label") {
      const controlType = String((target.control && target.control.type) || "").toLowerCase();
      return controlType === "radio" || controlType === "checkbox" ||
        Boolean(target.querySelector && target.querySelector("input[type='radio'],input[type='checkbox']"));
    }
    if (role === "radio" || role === "option") return true;
    if ((target.hasAttribute && target.hasAttribute("aria-checked")) ||
        (target.hasAttribute && target.hasAttribute("aria-selected")) ||
        (target.hasAttribute && target.hasAttribute("aria-pressed"))) return true;
    if (tag === "img") return false;
    const containsImage = Boolean(target.querySelector && target.querySelector("img")) ||
      Boolean(imageElement && target.contains && target.contains(imageElement));
    if (!containsImage) return false;
    if (tag === "button" || role === "button") {
      return /\b(select|choose|pick|image|candidate|option|variant)\b/i.test(actionText) ||
        (label.length === 0 && text.length <= 80);
    }
    return Boolean(allowClickableCard);
  }
  function normalizeReason(reason, maxLength) {
    const limit = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : 2000;
    return String(reason || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }
  function extractFeedbackSnippets(texts, limit, maxLength) {
    const maxItems = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 10) : 6;
    const maxChars = Number.isInteger(maxLength) && maxLength >= 50 ? maxLength : 900;
    const terms = /\b(correct|incorrect|not correct|wrong|better|best|because|feedback|should have|you chose|you selected|preferred|right image|reason|the ideal image|the best candidate|answer key|ideal answer)\b/i;
    const seen = new Set();
    const matches = [];
    for (const raw of (Array.isArray(texts) ? texts : [])) {
      const text = normalizeReason(raw, maxChars);
      if (text.length < 20 || !terms.test(text) || seen.has(text)) continue;
      seen.add(text);
      let score = 1;
      if (/\b(correct|incorrect|wrong|you chose|you selected|should have|the best candidate|answer key|ideal answer)\b/i.test(text)) score += 3;
      if (/\b(because|reason|feedback|preferred)\b/i.test(text)) score += 2;
      matches.push({ text, score });
    }
    matches.sort((a, b) => b.score - a.score || a.text.length - b.text.length);
    return matches.slice(0, maxItems).map((item) => item.text);
  }
  root.BICCore = Object.freeze({ defaultSelectionIndexes, isSafeSelectionTarget, normalizeReason, extractFeedbackSnippets });
})(typeof globalThis !== "undefined" ? globalThis : this);
