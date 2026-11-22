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
async function req(method,action,{id,token,organization_id=org,...payload}={}){const res=response();await handler({method,headers,query:{organization_id,action,...(id?{id}:{}),...(token?{token}:{})},body:payload},res);return res;}
const file={property_id:property,filename:'synthetic.txt',mime_type:'text/plain',content_base64:Buffer.from('synthetic storage check').toString('base64')};

test('disposable real private Storage and Postgres integration', {timeout:180000},async()=>{
 try{
  const bucket=await admin('/storage/v1/bucket',{method:'POST',body:JSON.stringify({id:'opsrental-private',name:'opsrental-private',public:false})});assert.ok(bucket.ok,'create private bucket');
  let r=await req('POST','upload',file);assert.equal(r.code,201,'upload');const id=r.body.item.id;
  r=await req('GET','list');assert.equal(r.code,200);assert.ok(r.body.items.some(x=>x.id===id));
  const noAuth=await fetch(new URL('/storage/v1/object/public/opsrental-private/'+org+'/'+id,local));assert.ok(!noAuth.ok,'anonymous object denied');
  r=await req('GET','download',{id});assert.equal(r.code,200);assert.equal(createHash('sha256').update(r.body).digest('hex'),createHash('sha256').update(Buffer.from(file.content_base64,'base64')).digest('hex'));
  const proxy=await req('GET','view',{id});assert.equal(proxy.code,200);assert.match(proxy.headers['Cache-Control'],/private, no-store/);assert.equal(proxy.headers['X-Content-Type-Options'],'nosniff');assert.match(proxy.headers['Content-Security-Policy'],/sandbox/);
  r=await req('GET','signed-url',{id});assert.equal(r.code,200);assert.equal(r.body.expires_in,60);
  assert.ok(r.body.url.startsWith('/api/rental/documents?'));assert.ok(!r.body.url.includes('supabase.co'));
  const signed=new URL(r.body.url,'https://rental.example'),token=signed.searchParams.get('token');
  const signedView=await req('GET','signed-view',{id,token});assert.equal(signedView.code,200);
  assert.match(signedView.headers['Cache-Control'],/private, no-store/);assert.equal(signedView.headers['X-Content-Type-Options'],'nosniff');assert.match(signedView.headers['Content-Security-Policy'],/sandbox/);
  assert.equal(createHash('sha256').update(signedView.body).digest('hex'),createHash('sha256').update(Buffer.from(file.content_base64,'base64')).digest('hex'));
  assert.equal((await req('GET','signed-view',{id,token:token+'x'})).code,403);
  assert.equal((await req('GET','signed-view',{id,token,organization_id:foreign})).code,403);
  const savedCookie=headers.cookie;delete headers.cookie;assert.equal((await req('GET','signed-view',{id,token})).code,401);headers.cookie=savedCookie;
  const otherSid='00000000-0000-4000-8000-000000000007';
  const sessionInsert=await admin('/rest/v1/myops_app_sessions',{method:'POST',body:JSON.stringify({id:otherSid,app_id:'opsrental',product_slug:'opsrental',user_id:user,revoked_at:null})});assert.ok(sessionInsert.ok);
  const otherBody=Buffer.from(JSON.stringify({sid:otherSid,exp:Date.now()+600000})).toString('base64url');const otherMac=createHmac('sha256',process.env.MYOPS_RENTAL_SESSION_SECRET).update(otherBody).digest('base64url');headers.cookie=`__Host-opsrental-session=${otherBody}.${otherMac}`;
  assert.equal((await req('GET','signed-view',{id,token})).code,403);headers.cookie=savedCookie;
  const rawSigned=await admin('/storage/v1/object/sign/opsrental-private/'+org+'/'+id,{method:'POST',body:JSON.stringify({expiresIn:60})});assert.ok(rawSigned.ok);
  const raw=(await rawSigned.json()).signedURL;const rawPath=raw.startsWith('/storage/v1/')?raw:'/storage/v1'+raw;
  const direct=await fetch(new URL(rawPath,local));assert.ok(direct.ok);
  console.log('Direct Storage cache-control:',direct.headers.get('cache-control')??'(absent)','expires:',direct.headers.get('expires')??'(absent)');
  assert.equal((await req('GET','signed-url',{id,organization_id:foreign})).code,403);
  const foreignDocument = { id, organization_id: foreign };
  assert.equal((await req('GET', 'view', foreignDocument)).code, 403);
  assert.equal((await req('DELETE', 'delete', foreignDocument)).code, 403);
  const ownerList = await req('GET', 'list');
  assert.ok(ownerList.body.items.some(item => item.id === id && item.state === 'ready'));
  const ownerView = await req('GET', 'view', { id });
  assert.equal(ownerView.code, 200);


  await admin('/rest/v1/myops_memberships?user_id=eq.'+user,{method:'PATCH',body:JSON.stringify({role:'tenant'})});assert.equal((await req('GET','view',{id})).code,403);assert.equal((await req('GET','download',{id})).code,403);
  await admin('/rest/v1/myops_memberships?user_id=eq.'+user,{method:'PATCH',body:JSON.stringify({role:'owner'})});
  await admin('/rest/v1/myops_app_sessions?id=eq.'+sid,{method:'PATCH',body:JSON.stringify({revoked_at:new Date().toISOString()})});assert.equal((await req('GET','view',{id})).code,403);assert.equal((await req('GET','signed-view',{id,token})).code,403);assert.equal((await req('GET','download',{id})).code,403);
  await admin('/rest/v1/myops_app_sessions?id=eq.'+sid,{method:'PATCH',body:JSON.stringify({revoked_at:null})});process.env.MYOPS_RENTAL_ACCESS_DISABLED='true';assert.equal((await req('GET','signed-view',{id,token})).code,503);assert.equal((await req('GET','download',{id})).code,503);delete process.env.MYOPS_RENTAL_ACCESS_DISABLED;
  const leaseUpload=await req('POST','upload',{...file,property_id:undefined,lease_id:lease});assert.equal(leaseUpload.code,201,'tenancy upload');assert.equal((await req('GET','signed-view',{id:leaseUpload.body.item.id,token})).code,403);
  assert.equal((await req('POST','upload',{...file,mime_type:'application/pdf'})).code,400);
  assert.equal((await req('POST','upload',{...file,content_base64:Buffer.alloc(3*1024*1024+1).toString('base64')})).code,413);
  failUpload=true;assert.equal((await req('POST','upload',file)).code,503);r=await req('GET','list');const pending=r.body.items.find(x=>x.state==='pending');assert.ok(pending,'pending row retained on timeout');
  await admin('/rest/v1/rental_documents?id=eq.'+pending.id,{method:'PATCH',body:JSON.stringify({created_at:'2020-01-01T00:00:00Z'})});assert.equal((await req('DELETE','delete',{id:pending.id})).code,200,'cleanup retry');
  await new Promise(resolve=>setTimeout(resolve,62000));assert.equal((await req('GET','signed-view',{id,token})).code,403,'application signed URL expired');assert.ok(!(await fetch(new URL(rawPath,local))).ok,'separate Storage signed URL expired at origin');
  assert.equal((await req('DELETE','delete',{id})).code,200);r=await req('GET','list');assert.ok(!r.body.items.some(x=>x.id===id));
  const after=await admin('/storage/v1/object/authenticated/opsrental-private/'+org+'/'+id);assert.ok(!after.ok,'object removed');
  assert.match(signedView.headers['Cache-Control'],/private, no-store/,'signed view must send restrictive cache-control');
 } finally {globalThis.fetch=originalFetch;}
});
