// Actual local PostgreSQL/PostgREST and Supabase Storage; central broker is simulated.
// Every outbound request is intercepted and constrained to loopback.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash,generateKeyPairSync} from 'node:crypto';
import handler from '../../api/rental/documents.js';

const local=new URL(process.env.API_URL || ''), key=process.env.SERVICE_ROLE_KEY;
if(local.protocol!=='http:' || !['127.0.0.1','localhost'].includes(local.hostname) || !key) throw Error('Local API and synthetic service key required');
const originalFetch=globalThis.fetch;
const sid='00000000-0000-4000-8000-000000000001', user='00000000-0000-4000-8000-000000000002', org='00000000-0000-4000-8000-000000000003', property='00000000-0000-4000-8000-000000000004', lease='00000000-0000-4000-8000-000000000005', foreign='00000000-0000-4000-8000-000000000006';
const fakeBase='https://wengxxiqwtosirealghx.supabase.co', broker='https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app';
const {privateKey}=generateKeyPairSync('ed25519');
Object.assign(process.env,{VERCEL_ENV:'preview',MYOPS_API_ORIGIN:broker,MYOPS_RENTAL_SUPABASE_URL:fakeBase,MYOPS_RENTAL_SERVICE_ROLE_KEY:key,MYOPS_RENTAL_SESSION_SECRET:'synthetic-local-only-12345678901234567890',MYOPS_APP_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}).toString()});
const body=Buffer.from(JSON.stringify({sid,exp:Date.now()+600000})).toString('base64url'),mac=createHmac('sha256',process.env.MYOPS_RENTAL_SESSION_SECRET).update(body).digest('base64url');
const headers={cookie:`__Host-opsrental-session=${body}.${mac}`,origin:'https://rental.example',host:'rental.example'};
let failUpload=false;
globalThis.fetch=async(input,opts={})=>{
 const u=new URL(input);
 if(u.origin===broker && u.pathname==='/api/app/entitlement')return Response.json({entitled:true,session_active:true});
 if(u.origin!==fakeBase && u.origin!==local.origin)throw Error('External network blocked in UAT');
 if(failUpload && u.pathname.startsWith('/storage/v1/object/opsrental-private/') && opts.method==='POST'){failUpload=false;throw Error('synthetic upload timeout');}
 return originalFetch(new URL(u.pathname+u.search,local),opts);
};
const adminHeaders={apikey:key,Authorization:'Bearer '+key,'content-type':'application/json',Prefer:'return=representation'};
async function admin(path,options={}) {return fetch(new URL(path,local),{...options,headers:{...adminHeaders,...options.headers}});}
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this},send(v){this.body=v;return this}});
async function req(method,action,{id,organization_id=org,...payload}={}){const res=response();await handler({method,headers,query:{organization_id,action,...(id?{id}:{})},body:payload},res);return res;}
const file={property_id:property,filename:'synthetic.txt',mime_type:'text/plain',content_base64:Buffer.from('synthetic storage check').toString('base64')};

test('disposable real private Storage and Postgres integration', {timeout:180000},async()=>{
 try{
  const bucket=await admin('/storage/v1/bucket',{method:'POST',body:JSON.stringify({id:'opsrental-private',name:'opsrental-private',public:false})});assert.ok(bucket.ok,'create private bucket');
  let r=await req('POST','upload',file);assert.equal(r.code,201,'upload');const id=r.body.item.id;
  r=await req('GET','list');assert.equal(r.code,200);assert.ok(r.body.items.some(x=>x.id===id));
  const noAuth=await fetch(new URL('/storage/v1/object/public/opsrental-private/'+org+'/'+id,local));assert.ok(!noAuth.ok,'anonymous object denied');
  r=await req('GET','download',{id});assert.equal(r.code,200);assert.equal(createHash('sha256').update(r.body).digest('hex'),createHash('sha256').update(Buffer.from(file.content_base64,'base64')).digest('hex'));
  r=await req('GET','signed-url',{id});assert.equal(r.code,200);assert.equal(r.body.expires_in,60);const signed=r.body.url;
  const view=await fetch(signed);assert.equal(view.status,200);assert.equal(createHash('sha256').update(Buffer.from(await view.arrayBuffer())).digest('hex'),createHash('sha256').update(Buffer.from(file.content_base64,'base64')).digest('hex'));
  const cache=view.headers.get('cache-control');
  assert.equal((await req('GET','signed-url',{id,organization_id:foreign})).code,403);
  await admin('/rest/v1/myops_memberships?user_id=eq.'+user,{method:'PATCH',body:JSON.stringify({role:'tenant'})});assert.equal((await req('GET','download',{id})).code,403);
  await admin('/rest/v1/myops_memberships?user_id=eq.'+user,{method:'PATCH',body:JSON.stringify({role:'owner'})});
  await admin('/rest/v1/myops_app_sessions?id=eq.'+sid,{method:'PATCH',body:JSON.stringify({revoked_at:new Date().toISOString()})});assert.equal((await req('GET','download',{id})).code,403);
  await admin('/rest/v1/myops_app_sessions?id=eq.'+sid,{method:'PATCH',body:JSON.stringify({revoked_at:null})});process.env.MYOPS_RENTAL_ACCESS_DISABLED='true';assert.equal((await req('GET','download',{id})).code,503);delete process.env.MYOPS_RENTAL_ACCESS_DISABLED;
  assert.equal((await req('POST','upload',{...file,property_id:undefined,lease_id:lease})).code,201,'tenancy upload');
  assert.equal((await req('POST','upload',{...file,mime_type:'application/pdf'})).code,400);
  assert.equal((await req('POST','upload',{...file,content_base64:Buffer.alloc(3*1024*1024+1).toString('base64')})).code,413);
  failUpload=true;assert.equal((await req('POST','upload',file)).code,503);r=await req('GET','list');const pending=r.body.items.find(x=>x.state==='pending');assert.ok(pending,'pending row retained on timeout');
  await admin('/rest/v1/rental_documents?id=eq.'+pending.id,{method:'PATCH',body:JSON.stringify({created_at:'2020-01-01T00:00:00Z'})});assert.equal((await req('DELETE','delete',{id:pending.id})).code,200,'cleanup retry');
  await new Promise(resolve=>setTimeout(resolve,62000));const expired=await fetch(signed);assert.ok(!expired.ok,'signed URL expired at storage origin');
  assert.equal((await req('DELETE','delete',{id})).code,200);r=await req('GET','list');assert.ok(!r.body.items.some(x=>x.id===id));
  const after=await admin('/storage/v1/object/authenticated/opsrental-private/'+org+'/'+id);assert.ok(!after.ok,'object removed');
  assert.ok(cache && /(?:no-store|no-cache|max-age=0)/i.test(cache),'signed view must send restrictive cache-control');
 } finally {globalThis.fetch=originalFetch;}
});
