const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("OpsRental branding is visible", () => {
  assert.match(html, /OpsRental/);
  assert.doesNotMatch(html, /Haven — Rental management/);
});

test("browser-only data is explicitly labeled development-only", () => {
  assert.match(html, /Development preview only/);
  assert.match(html, /Do not enter real tenant/);
});

test("rental frontend uses authenticated MYOPS API instead of localStorage", () => {
  assert.match(app, /\/api\/rental\/organizations/);
  assert.match(app, /\/api\/rental\/data/);
  assert.match(app, /\/api\/rental\/write/);
  assert.doesNotMatch(app, /localStorage\s*\./);
});

test("core prototype UI remains accessible", () => {
  for (const id of ["dashboard", "properties", "tenancies", "payments", "maintenance"]) {
    assert.match(html, new RegExp('data-view="' + id + '"'));
  }
});
