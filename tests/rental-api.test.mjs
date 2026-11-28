import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,generateKeyPairSync} from "node:crypto";
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

test("trial creates use only the transactional RPC on the isolated Preview",async()=>{
 const previousEnv={...process.env},originalFetch=globalThis.fetch;
 const {privateKey}=generateKeyPairSync('ed25519');
 Object.assign(process.env,{
  VERCEL_ENV:'preview',
  MYOPS_API_ORIGIN:'https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app',
  MYOPS_RENTAL_SUPABASE_URL:'https://wengxxiqwtosirealghx.supabase.co',
  MYOPS_RENTAL_SERVICE_ROLE_KEY:'synthetic',
  MYOPS_RENTAL_SESSION_SECRET:'synthetic-secret-12345678901234567890',
  MYOPS_APP_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}).toString()
 });
 delete process.env.MYOPS_RENTAL_TRIAL_MUTATION_UAT;
 const body=Buffer.from(JSON.stringify({sid,exp:Date.now()+60000})).toString('base64url');
 const mac=createHmac('sha256',process.env.MYOPS_RENTAL_SESSION_SECRET).update(body).digest('base64url');
 const org='00000000-0000-4000-8000-000000000001',operation='00000000-0000-4000-8000-000000000002';
 const headers={cookie:`__Host-opsrental-session=${body}.${mac}`,origin:'https://rental.example',host:'rental.example'};
 let calls=0, result={item:{id:operation}};
 globalThis.fetch=async(url,opts)=>{
  const path=new URL(url).pathname;
  if(path==='/api/app/entitlement')return Response.json({entitled:true,session_active:true,access_mode:'trial'});
  assert.equal(path,'/rest/v1/rpc/myops_rental_trial_create');
  assert.deepEqual(JSON.parse(opts.body),{p_session:sid,p_org:org,p_operation:operation,p_kind:'properties',p_input:{name:'Synthetic'}});
  calls++;
  return Response.json(result);
 };
 async function request(method='POST'){
  const res=response();
  await write({method,headers,query:{resource:'properties',organization_id:org},body:{name:'Synthetic'}},res);
  return res.statusCode;
 }
 try{
  assert.equal(await request(),403);
  process.env.MYOPS_RENTAL_TRIAL_MUTATION_UAT='true';
  assert.equal(await request('PATCH'),403);
  assert.equal(await request(),400);
  headers['idempotency-key']=operation;
  assert.equal(await request(),201);
  result={error:'trial_limit_reached'};
  assert.equal(await request(),429);
  assert.equal(calls,2);
 }finally{process.env=previousEnv;globalThis.fetch=originalFetch;}
});
