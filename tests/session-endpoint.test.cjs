const test = require("node:test");
const assert = require("node:assert/strict");
test("session endpoint never issues an unverified identity", async () => {
 const { default: handler } = await import("../api/myops/session.js");
 const headers = {};
 const response = { statusCode:200, setHeader(k,v){headers[k]=v;}, status(code){this.statusCode=code;return this;}, json(body){this.body=body;return this;} };
 await handler({method:"GET"},response);
 assert.equal(response.statusCode,503);
 assert.equal(response.body.authenticated,false);
 assert.equal(headers["Cache-Control"],"no-store");
});
test("session endpoint rejects unexpected methods", async () => {
 const { default: handler } = await import("../api/myops/session.js");
 const response = {setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
 await handler({method:"POST"},response);
 assert.equal(response.statusCode,405);
});
