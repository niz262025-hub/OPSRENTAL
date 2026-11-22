import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,generateKeyPairSync} from 'node:crypto';
import handler from '../api/rental/documents.js';
const sid='00000000-0000-4000-8000-000000000001', user='00000000-0000-4000-8000-000000000002', org='00000000-0000-4000-8000-000000000003', prop='00000000-0000-4000-8000-000000000004';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this},send(v){this.body=v;return this}});
test('document API checks signatures, organization, session and private bucket before storage',async()=>{
 const old={...process.env}, fetch0=globalThis.fetch; const {privateKey}=generateKeyPairSync('ed25519');
 Object.assign(process.env,{VERCEL_ENV:'preview',MYOPS_API_ORIGIN:'https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app',MYOPS_RENTAL_SUPABASE_URL:'https://wengxxiqwtosirealghx.supabase.co',MYOPS_RENTAL_SERVICE_ROLE_KEY:'test',MYOPS_RENTAL_SESSION_SECRET:'synthetic-secret-12345678901234567890',MYOPS_APP_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}).toString()});
 const body=Buffer.from(JSON.stringify({sid,exp:Date.now()+60000})).toString('base64url'); const mac=createHmac('sha256',process.env.MYOPS_RENTAL_SESSION_SECRET).update(body).digest('base64url');
 const headers={cookie:`__Host-opsrental-session=${body}.${mac}`,origin:'https://rental.example',host:'rental.example'}; let revoked=false,publicBucket=false,storageWrites=0;
 globalThis.fetch=async(url,opt={})=>{const u=new URL(url), table=u.pathname.split('/').pop(); let rows=[];
  if(u.pathname==='/api/app/entitlement')return {ok:true,json:async()=>({entitled:true,session_active:!revoked})};
  if(u.pathname==='/storage/v1/bucket/opsrental-private')return {ok:true,json:async()=>({id:'opsrental-private',public:publicBucket})};
  if(u.pathname.startsWith('/storage/')){storageWrites++;return {ok:true,json:async()=>({})};}
  if(table==='myops_app_sessions')rows=[{user_id:user,revoked_at:null,product_slug:'opsrental'}];
  if(table==='myops_memberships'&&u.searchParams.get('organization_id')===`eq.${org}`)rows=[{role:'owner'}];
  if(table==='myops_app_grants')rows=[{user_id:user,organization_id:org,product_slug:'opsrental'}];
  if(table==='myops_subscriptions')rows=[{organization_id:org,status:'active',product_slug:'opsrental',personal_user_id:null}];
  if(table==='rental_properties'&&u.searchParams.get('id')===`eq.${prop}`)rows=[{id:prop}];
  if(table==='rental_documents'&&opt.method==='POST')rows=[JSON.parse(opt.body)];
  if(table==='rental_documents'&&opt.method==='PATCH')rows=[{...JSON.parse(opt.body)}];
  return {ok:true,json:async()=>rows};};
 const upload=async(content,type='application/pdf',organization_id=org,property_id=prop)=>{const res=response();await handler({method:'POST',headers,query:{organization_id,action:'upload'},body:{property_id,filename:'test.pdf',mime_type:type,content_base64:Buffer.from(content).toString('base64')}},res);return res};
 try{assert.equal((await upload('fake')).code,400);assert.equal(storageWrites,0);assert.equal((await upload('%PDF-synthetic','application/pdf',prop)).code,403);publicBucket=true;assert.equal((await upload('%PDF-synthetic')).code,503);assert.equal(storageWrites,0);publicBucket=false;assert.equal((await upload('%PDF-synthetic')).code,201);assert.equal(storageWrites,1);revoked=true;assert.equal((await upload('%PDF-synthetic')).code,403);process.env.MYOPS_RENTAL_ACCESS_DISABLED='true';assert.equal((await upload('%PDF-synthetic')).code,503);}finally{globalThis.fetch=fetch0;process.env=old;}
});

test('partial failures retain metadata for retry and incomplete files cannot be signed',async()=>{
 const old={...process.env},original=globalThis.fetch,{privateKey}=generateKeyPairSync('ed25519');
 Object.assign(process.env,{VERCEL_ENV:'preview',MYOPS_API_ORIGIN:'https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app',MYOPS_RENTAL_SUPABASE_URL:'https://wengxxiqwtosirealghx.supabase.co',MYOPS_RENTAL_SERVICE_ROLE_KEY:'test',MYOPS_RENTAL_SESSION_SECRET:'synthetic-secret-12345678901234567890',MYOPS_APP_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}).toString()});
 const body=Buffer.from(JSON.stringify({sid,exp:Date.now()+60000})).toString('base64url'),mac=createHmac('sha256',process.env.MYOPS_RENTAL_SESSION_SECRET).update(body).digest('base64url');
 const headers={cookie:`__Host-opsrental-session=${body}.${mac}`,origin:'https://rental.example',host:'rental.example'};
 let doc=null, bucketMissing=false, failUpload=false,failDelete=false,failMetadataDelete=false,failMetadataInsert=false,failDownload=false,role='owner', revoked=false, signCalls=0,storageUploads=0, uploadHeaders=null, signedExpires=null;
 const ok=payload=>({ok:true,json:async()=>payload});
 globalThis.fetch=async(url,opt={})=>{const u=new URL(url),t=u.pathname.split('/').pop(),method=opt.method||'GET';
  if(u.pathname==='/api/app/entitlement')return ok({entitled:true,session_active:!revoked});
  if(u.pathname==='/storage/v1/bucket/opsrental-private')return bucketMissing?{ok:false,status:404}:ok({id:'opsrental-private',public:false});
  if(u.pathname.startsWith('/storage/v1/object/sign/')){signCalls++;signedExpires=JSON.parse(opt.body).expiresIn;return ok({signedURL:'/object/sign/opsrental-private/'+doc.storage_path+'?token=test'});}
  if(u.pathname.startsWith('/storage/v1/object/authenticated/'))return failDownload?{ok:false,status:500}:{ok:true,arrayBuffer:async()=>Buffer.from('%PDF-example')};
  if(u.pathname==='/storage/v1/object/opsrental-private'&&method==='DELETE')return failDelete?{ok:false,status:500}:ok([]);
  if(u.pathname.startsWith('/storage/v1/object/opsrental-private/')&&method==='POST'){storageUploads++;uploadHeaders=opt.headers;return failUpload?{ok:false,status:500}:ok({});}
  if(t==='myops_app_sessions')return ok([{user_id:user,revoked_at:null,product_slug:'opsrental'}]);
  if(t==='myops_memberships')return ok(u.searchParams.get('organization_id')===`eq.${org}`?[{role}]:[]);
  if(t==='myops_app_grants')return ok([{user_id:user,organization_id:org,product_slug:'opsrental'}]);
  if(t==='myops_subscriptions')return ok([{organization_id:org,status:'active',product_slug:'opsrental',personal_user_id:null}]);
  if(t==='rental_properties')return ok([{id:prop}]);
  if(t==='rental_documents'){
   if(method==='POST'){if(failMetadataInsert)return {ok:false,status:500};doc={...JSON.parse(opt.body),created_at:new Date(Date.now()-180000).toISOString()};return ok([doc]);}
   if(method==='PATCH'){if(!doc||u.searchParams.get('state')!=='eq.'+doc.state)return ok([]);doc={...doc,...JSON.parse(opt.body)};return ok([doc]);}
   if(method==='DELETE'){if(failMetadataDelete)return {ok:false,status:500};const d=doc;doc=null;return ok([d]);}
   return ok(doc?[doc]:[]);
  } return ok([]);
 };
 const req=async(method,action,payload={},id)=>{const res=response();await handler({method,headers,query:{organization_id:org,action,...(id?{id}:{})},body:payload},res);return res};
 const file={property_id:prop,filename:'test.pdf',mime_type:'application/pdf',content_base64:Buffer.from('%PDF-example').toString('base64')};
 try{
  assert.ok([400,413].includes((await req('POST','upload',{...file,content_base64:Buffer.alloc(3*1024*1024+1).toString('base64')})).code));
  failMetadataInsert=true;assert.equal((await req('POST','upload',file)).code,503);assert.equal(storageUploads,0);failMetadataInsert=false;
  bucketMissing=true;assert.equal((await req('POST','upload',file)).code,503);assert.equal(doc,null);assert.equal(storageUploads,0);bucketMissing=false;
  failUpload=true;assert.equal((await req('POST','upload',file)).code,503);assert.equal(doc.state,'pending');
  assert.equal((await req('GET','signed-url',{},doc.id)).code,409);assert.equal(signCalls,0);
  failUpload=false;failDelete=true;assert.equal((await req('DELETE','delete',{},doc.id)).code,503);assert.equal(doc.state,'deleting');
  assert.equal((await req('GET','signed-url',{},doc.id)).code,409);assert.equal(signCalls,0);
  failDelete=false;failMetadataDelete=true;assert.equal((await req('DELETE','delete',{},doc.id)).code,503);assert.equal(doc.state,'deleting');
  failMetadataDelete=false;assert.equal((await req('DELETE','delete',{},doc.id)).code,200);assert.equal(doc,null);
  assert.equal((await req('POST','upload',file)).code,201);assert.equal(doc.state,'ready');const signed=await req('GET','signed-url',{},doc.id);assert.equal(signed.code,200);assert.equal(signed.body.expires_in,60);assert.equal(signCalls,0);assert.match(signed.body.url,/^\/api\/rental\/documents\?/);assert.ok(!signed.body.url.includes('supabase.co')); assert.equal(uploadHeaders['cache-control'],'max-age=0, no-store');assert.equal(signed.headers['Cache-Control'],'private, no-store');
  failDownload=true;assert.equal((await req('GET','download',{},doc.id)).code,503);assert.equal(doc.state,'ready');failDownload=false;assert.equal((await req('GET','download',{},doc.id)).code,200);const safeView=await req('GET','view',{},doc.id);assert.equal(safeView.code,200);assert.equal(safeView.headers['Cache-Control'],'private, no-store');assert.equal(safeView.headers['Content-Type'],'application/pdf');assert.match(safeView.headers['Content-Security-Policy'],/sandbox/);
  role='tenant';assert.equal((await req('GET','view',{},doc.id)).code,403);assert.equal((await req('GET','signed-url',{},doc.id)).code,403);role='owner';revoked=true;assert.equal((await req('GET','view',{},doc.id)).code,403);assert.equal((await req('GET','signed-url',{},doc.id)).code,403);revoked=false;
  const foreign=response();await handler({method:'GET',headers,query:{organization_id:prop,action:'signed-url',id:doc.id}},foreign);assert.equal(foreign.code,403);
  process.env.MYOPS_RENTAL_ACCESS_DISABLED='true';assert.equal((await req('GET','download',{},doc.id)).code,503);
 }finally{globalThis.fetch=original;process.env=old;}
});

test('isolated trial upload retries an uncertain immutable write and finalizes once', async()=>{
 const old={...process.env}, original=globalThis.fetch, {privateKey}=generateKeyPairSync('ed25519');
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
 const documentId='00000000-0000-4000-8000-000000000005';
 const headers={cookie:`__Host-opsrental-session=${body}.${mac}`,origin:'https://rental.example',host:'rental.example','idempotency-key':documentId};
 const path=org+'/'+documentId, content='%PDF-synthetic';
 const file={property_id:prop,filename:'file.pdf',mime_type:'application/pdf',content_base64:Buffer.from(content).toString('base64')};
 let stored=null, readsUnavailable=true, completed=false, writes=0, finalized=0;
 globalThis.fetch=async (url,opts={})=>{
  const p=new URL(url).pathname;
  if(p==='/api/app/entitlement')return Response.json({entitled:true,session_active:true,access_mode:'trial'});
  if(p.endsWith('/myops_app_sessions'))return Response.json([{user_id:user,revoked_at:null,product_slug:'opsrental'}]);
  if(p.endsWith('/myops_memberships'))return Response.json([{role:'owner'}]);
  if(p.endsWith('/rental_properties'))return Response.json([{id:prop}]);
  if(p.endsWith('/bucket/opsrental-private'))return Response.json({id:'opsrental-private',public:false});
  if(p.endsWith('/rpc/myops_rental_trial_upload')){
   const args=JSON.parse(opts.body);
   assert.equal(args.p_operation,documentId);
   assert.equal(args.p_org,org);
   if(args.p_finalize){assert.equal(stored.toString(),content);finalized++;completed=true;}
   if(completed)return Response.json({status:'completed',item:{id:documentId}});
   return Response.json({status:'uploading',document_id:documentId,storage_path:path});
  }
  if(p==='/storage/v1/object/opsrental-private/'+path){
   assert.equal(opts.headers['x-upsert'],'false');
   if(stored)return new Response(null,{status:409});
   writes++;
   stored=opts.body;
   throw Error('Response lost after Storage committed');
  }
  if(p==='/storage/v1/object/authenticated/opsrental-private/'+path) {
   return readsUnavailable?new Response(null,{status:503}):new Response(stored);
  }
  assert.fail('Unexpected request '+p);
 };
 const request=async()=>{
  const res=response();
  await handler({method:'POST',headers,query:{action:'upload',organization_id:org},body:file},res);
  return res;
 };
 try{
  assert.equal((await request()).code,403);
  assert.equal(writes,0);
  process.env.MYOPS_RENTAL_TRIAL_MUTATION_UAT='true';
  assert.equal((await request()).code,503);
  assert.equal(writes,1);
  assert.equal(finalized,0);
  readsUnavailable=false;
  assert.equal((await request()).code,201);
  assert.equal((await request()).code,200);
  assert.equal(writes,1);
  assert.equal(finalized,1);
 }finally{globalThis.fetch=original;process.env=old;}
});
