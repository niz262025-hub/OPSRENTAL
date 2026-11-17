const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../myops-session.js"),"utf8");
const exportsForBrowser = { exports: {} };
vm.runInNewContext(source, { module: exportsForBrowser }, {filename:"myops-session.js"});
const { verifyMyopsSession } = exportsForBrowser.exports;
const id = "12345678-1234-1234-1234-123456789abc";
test("rejects missing central SSO bridge", async () => {
 await assert.rejects(verifyMyopsSession(async () => ({ok:false})),/unavailable/);
});
test("rejects forged organization and unauthenticated sessions", async () => {
 await assert.rejects(verifyMyopsSession(async () => ({ok:true,json:async()=>({authenticated:false,organization_id:id,user_id:id})})),/not verified/);
 await assert.rejects(verifyMyopsSession(async () => ({ok:true,json:async()=>({authenticated:true,organization_id:"x",user_id:id})})),/not verified/);
});
test("accepts only server-verified identity shape", async () => {
 const session=await verifyMyopsSession(async (url,opts) => {
  assert.equal(url,"/api/myops/session"); assert.equal(opts.credentials,"include");
  return {ok:true,json:async()=>({authenticated:true,organization_id:id,user_id:id,role:"manager"})};
 });
 assert.equal(session.organizationId,id);
});
