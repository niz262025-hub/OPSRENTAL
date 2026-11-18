const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../rental-api.js"),"utf8");
const browserModule = { exports: {} };
vm.runInNewContext(source, {module:browserModule}, {filename:"rental-api.js"});
const { createRentalRepository } = browserModule.exports;
const ORG = "12345678-1234-1234-1234-123456789abc";
function client() {
  const calls = [];
  const chain = {
    select(...args) { calls.push(["select",...args]); return this; },
    eq(...args) { calls.push(["eq",...args]); return this; },
    insert(...args) { calls.push(["insert",...args]); return this; },
    update(...args) { calls.push(["update",...args]); return this; },
    single() { calls.push(["single"]); return this; },
    then(resolve) { resolve({ data: [{ id: "ok" }], error: null }); }
  };
  return { calls, from(name) { calls.push(["from",name]); return chain; } };
}
test("requires an authenticated client and organization", () => {
  assert.throws(() => createRentalRepository(null,ORG));
  assert.throws(() => createRentalRepository(client(),"invalid"));
});
test("scopes reads by organization", async () => {
  const c=client(); await createRentalRepository(c,ORG).list("properties");
  assert.deepEqual(c.calls[0],["from","rental_properties"]);
  assert.ok(c.calls.some(x=>x[0]==="eq"&&x[1]==="organization_id"&&x[2]===ORG));
});
test("prevents overriding organization on create", async () => {
  const c=client(); await createRentalRepository(c,ORG).create("tickets",{organization_id:"other",title:"Tap"});
  assert.equal(c.calls.find(x=>x[0]==="insert")[1].organization_id,ORG);
});
test("blocks protected foreign keys and tenant reassignment", async () => {
  const c=client(); const repo=createRentalRepository(c,ORG);
  assert.throws(() => repo.update("leases","lease1",{tenant_user_id:"someone"}),/No editable fields/);
  assert.throws(() => repo.create("documents",{filename:"test"}),/private storage/);
});
