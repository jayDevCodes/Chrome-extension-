const test = require("node:test");
const assert = require("node:assert/strict");
require("../core.js");
const core = globalThis.BICCore;

test("only auto-selects a small, unambiguous candidate set", () => {
  assert.deepEqual(core.defaultSelectionIndexes(2, 6), [0, 1]);
  assert.deepEqual(core.defaultSelectionIndexes(6, 6), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(core.defaultSelectionIndexes(1, 6), []);
  assert.deepEqual(core.defaultSelectionIndexes(7, 6), []);
});

test("does not click dangerous navigation or submit controls", () => {
  assert.equal(core.isSafeSelectionTarget({ tagName: "BUTTON", type: "submit", innerText: "Select image", getAttribute: () => null }, {}), false);
  assert.equal(core.isSafeSelectionTarget({ tagName: "A", type: "", innerText: "Image 2", getAttribute: () => null, querySelector: () => ({ tagName: "IMG" }) }, {}), false);
  assert.equal(core.isSafeSelectionTarget({ tagName: "BUTTON", type: "button", innerText: "Next", getAttribute: () => null, querySelector: () => null }, {}), false);
  assert.equal(core.isSafeSelectionTarget({ tagName: "BUTTON", type: "button", innerText: "Select image", getAttribute: () => null, querySelector: (selector) => selector === "img" ? ({ tagName: "IMG" }) : null, contains: () => true }, {}), true);
});

test("does not treat a bare image or generic wrapper as a selection control", () => {
  const image = { tagName: "IMG", type: "", innerText: "", getAttribute: () => null };
  const wrapper = {
    tagName: "DIV", type: "", innerText: "", textContent: "",
    getAttribute: () => null,
    hasAttribute: () => false,
    querySelector: (selector) => selector === "img" ? ({ tagName: "IMG" }) : null,
    contains: () => true
  };
  assert.equal(core.isSafeSelectionTarget(image, image), false);
  assert.equal(core.isSafeSelectionTarget(wrapper, image), false);
  assert.equal(core.isSafeSelectionTarget(wrapper, image, true), true);
  const wrapperWithAction = {
    tagName: "DIV", type: "", innerText: "", textContent: "",
    getAttribute: () => null,
    hasAttribute: () => false,
    querySelector: (selector) => selector === "img" ? ({ tagName: "IMG" }) :
      selector.includes("button") ? ({ tagName: "BUTTON", innerText: "Next" }) : null,
    contains: () => true
  };
  assert.equal(core.isSafeSelectionTarget(wrapperWithAction, image, true), false);
});

test("accepts explicit image selection controls", () => {
  assert.equal(core.isSafeSelectionTarget({ tagName: "INPUT", type: "radio", getAttribute: () => null }, {}), true);
  assert.equal(core.isSafeSelectionTarget({ tagName: "DIV", type: "", innerText: "", getAttribute: (name) => name === "role" ? "radio" : null }, {}), true);
});

test("allows local-file-only comparisons when webpage candidates are not readable", () => {
  const plan = core.planAnalysisCandidates([], 3, 6);
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, "files");
  assert.equal(plan.candidates.length, 3);
  assert.equal(plan.candidates[0].id, null);
  assert.equal(core.planAnalysisCandidates([], 1, 6).ok, false);
});

test("enforces fallback file count when page candidates are selected", () => {
  const candidates = [{ id: "one" }, { id: "two" }];
  assert.equal(core.planAnalysisCandidates(candidates, 0, 6).mode, "page");
  assert.equal(core.planAnalysisCandidates(candidates, 2, 6).ok, true);
  assert.equal(core.planAnalysisCandidates(candidates, 3, 6).ok, false);
});

test("normalizes and bounds feedback reason text", () => {
  assert.equal(core.normalizeReason("  Image   two is better  because it matches.  "), "Image two is better because it matches.");
  assert.equal(core.normalizeReason("x".repeat(2500), 2000).length, 2000);
});

test("extracts likely feedback text and ignores unrelated copy", () => {
  const results = core.extractFeedbackSnippets([
    "Welcome to the next part of the task.",
    "Image 2 is the correct choice because the prompt asks for three red bicycles, but Image 1 has two.",
    "This is a long irrelevant paragraph about the application."
  ]);
  assert.equal(results.length, 1);
  assert.match(results[0], /three red bicycles/);
});
