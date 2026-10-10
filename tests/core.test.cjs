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
  assert.equal(core.isSafeSelectionTarget({ tagName: "BUTTON", type: "button", innerText: "Next", getAttribute: () => null, querySelector: () => ({}) }, {}), false);
  assert.equal(core.isSafeSelectionTarget({ tagName: "BUTTON", type: "button", innerText: "Select image", getAttribute: () => null, querySelector: () => ({}) }, {}), true);
});

test("accepts explicit image selection controls", () => {
  assert.equal(core.isSafeSelectionTarget({ tagName: "INPUT", type: "radio", getAttribute: () => null }, {}), true);
  assert.equal(core.isSafeSelectionTarget({ tagName: "DIV", type: "", innerText: "", getAttribute: (name) => name === "role" ? "radio" : null }, {}), true);
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
