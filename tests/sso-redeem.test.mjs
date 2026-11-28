import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify, createHash } from "node:crypto";
import handler, { signedRequest, canonicalJson } from "../api/sso/redeem.js";
import { myopsBrokerRequest } from "../api/sso/myops-origin.js";
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const pem=privateKey.export({type:"pkcs8",format:"pem"});
const ticket="A".repeat(43);
function response(){return {statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
test("signature verifies with matching Ed25519 key",()=>{
 const signed=signedRequest(ticket,pem,()=>1795000000000,()=>"N".repeat(24));
 const h=signed.headers;
 const message=`POST\n/api/app/redeem\nopsrental\ncurrent\n${h["x-myops-timestamp"]}\n${h["x-myops-nonce"]}\n${createHash("sha256").update(canonicalJson(signed.body)).digest("hex")}`;
 assert.equal(verify(null,Buffer.from(message),publicKey,Buffer.from(h["x-myops-signature"],"base64url")),true);
});
test("reject malformed ticket",()=>assert.throws(()=>signedRequest("bad",pem),/invalid_ticket/));
test("reject GET",async()=>{const res=response();await handler({method:"GET",headers:{}},res);assert.equal(res.statusCode,405)});
test("reject malformed POST",async()=>{const res=response();await handler({method:"POST",headers:{host:"example.com"},body:{ticket:"bad"}},res);assert.equal(res.statusCode,400)});
test("reject cross-origin POST",async()=>{const res=response();await handler({method:"POST",headers:{host:"example.com",origin:"https://evil.example"},body:{ticket}},res);assert.equal(res.statusCode,403)});
test("reject missing backend key",async()=>{const prev=process.env.MYOPS_APP_PRIVATE_KEY;delete process.env.MYOPS_APP_PRIVATE_KEY;try{const res=response();await handler({method:"POST",headers:{host:"example.com"},body:{ticket}},res);assert.equal(res.statusCode,503)}finally{if(prev!==undefined)process.env.MYOPS_APP_PRIVATE_KEY=prev}});

test("reject malformed Origin without throwing",async()=>{const res=response();await handler({method:"POST",headers:{host:"example.com",origin:"%%%not-a-url"},body:{ticket}},res);assert.equal(res.statusCode,403)});

test("Central bypass is confined to approved Preview broker requests", () => {
 const origin = "https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app";
 const env = { VERCEL_ENV: "preview", MYOPS_API_ORIGIN: origin, MYOPS_CENTRAL_PREVIEW_BYPASS_SECRET: "synthetic-test-value" };
 for (const path of ["/api/app/redeem", "/api/app/entitlement"]) {
  const request = myopsBrokerRequest(path, { "x-myops-app-id": "opsrental" }, env);
  assert.equal(request.url, origin + path);
  assert.equal(request.redirect, "error");
  assert.equal(request.headers["x-vercel-protection-bypass"], env.MYOPS_CENTRAL_PREVIEW_BYPASS_SECRET);
  assert.equal(request.headers["x-myops-app-id"], "opsrental");
 }
 assert.throws(() => myopsBrokerRequest("/api/app/redeem", {}, { ...env, MYOPS_API_ORIGIN: "https://unapproved.example" }));
 assert.throws(() => myopsBrokerRequest("/login", {}, env));
 const production = myopsBrokerRequest("/api/app/redeem", {}, { ...env, VERCEL_ENV: "production", MYOPS_API_ORIGIN: "" });
 assert.equal(production.headers["x-vercel-protection-bypass"], undefined);
});
