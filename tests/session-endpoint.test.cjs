const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync(require("node:path").join(__dirname,"../api/myops/session.js"),"utf8");
test("unconfigured central SSO endpoint fails closed", () => {
 assert.match(source,/status\(503\)/);
 assert.match(source,/authenticated:\s*false/);
 assert.doesNotMatch(source,/authenticated:\s*true/);
 assert.match(source,/Cache-Control/);
});
test("rejects non-GET requests", () => {
 assert.match(source,/req\.method\s*!==\s*"GET"/);
 assert.match(source,/status\(405\)/);
});
