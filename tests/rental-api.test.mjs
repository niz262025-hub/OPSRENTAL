import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import write from "../api/rental/write.js";
import read from "../api/rental/data.js";
import session,{parseCookie} from "../api/sso/session.js";
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};}
const sid="123e4567-e89b-42d3-a456-426614174000";
test("signed cookie verifies, rejects tampering and expiry",()=>{
 process.env.MYOPS_RENTAL_SESSION_SECRET="test-only-secret-not-for-production-123456";
 const body=Buffer.from(JSON.stringify({sid,exp:Date.now()+10000})).toString("base64url");
 const mac=createHmac("sha256",process.env.MYOPS_RENTAL_SESSION_SECRET).update(body).digest("base64url");
 assert.equal(parseCookie({headers:{cookie:"__Host-opsrental-session="+body+"."+mac}}),sid);
 assert.equal(parseCookie({headers:{cookie:"__Host-opsrental-session="+body+"."+mac+"x"}}),null);
 const expired=Buffer.from(JSON.stringify({sid,exp:Date.now()-1})).toString("base64url");
 const signature=createHmac("sha256",process.env.MYOPS_RENTAL_SESSION_SECRET).update(expired).digest("base64url");
 assert.equal(parseCookie({headers:{cookie:"__Host-opsrental-session="+expired+"."+signature}}),null);
});
test("write requires HTTPS same origin",async()=>{
 const res=response();await write({method:"POST",headers:{origin:"https://attacker.example",host:"rental.example"}},res);
 assert.equal(res.statusCode,403);
});
test("write rejects unauthenticated mutation",async()=>{
 const res=response();await write({method:"POST",headers:{origin:"https://rental.example",host:"rental.example"},query:{resource:"properties",organization_id:sid},body:{name:"Test"}},res);
 assert.equal(res.statusCode,401);
});
test("read rejects unauthenticated data access",async()=>{
 const res=response();await read({method:"GET",headers:{},query:{resource:"properties",organization_id:sid}},res);
 assert.equal(res.statusCode,401);
});
test("session rejects absent cookie",async()=>{
 const res=response();await session({method:"GET",headers:{}},res);
 assert.equal(res.statusCode,401);
});
