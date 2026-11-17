import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify, createHash } from "node:crypto";
import handler, { signedRequest, canonicalJson } from "../api/sso/redeem.js";
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
