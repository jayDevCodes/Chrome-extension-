const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "sidepanel.html"), "utf8");
const js = fs.readFileSync(path.join(root, "sidepanel.js"), "utf8");

test("all static side-panel element references resolve to an HTML id", () => {
  const ids = new Set(Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), match => match[1]));
  const references = new Set(Array.from(js.matchAll(/\$\(["']([^"']+)["']\)/g), match => match[1]));
  const missing = Array.from(references).filter(id => !ids.has(id));
  assert.deepEqual(missing, [], "Missing side-panel elements: " + missing.join(", "));
});

test("feedback review is backed by extension-local storage", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.ok(manifest.permissions.includes("storage"));
  assert.match(js, /bestImagePendingReviews/);
  assert.match(js, /chrome\.storage\.local\.set/);
});

test("candidate image fetch does not forward website cookies", () => {
  assert.match(js, /fetch\(candidate\.src, \{ credentials: "omit"/);
});
