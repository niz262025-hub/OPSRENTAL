import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,generateKeyPairSync} from 'node:crypto';
import handler from '../api/rental/documents.js';
const sid='00000000-0000-4000-8000-000000000001', user='00000000-0000-4000-8000-000000000002', org='00000000-0000-4000-8000-000000000003', prop='00000000-0000-4000-8000-000000000004';
const response=()=>({setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this},send(v){this.body=v;return this}});
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
  return {ok:true,json:async()=>rows};};
 const upload=async(content,type='application/pdf',organization_id=org,property_id=prop)=>{const res=response();await handler({method:'POST',headers,query:{organization_id,action:'upload'},body:{property_id,filename:'test.pdf',mime_type:type,content_base64:Buffer.from(content).toString('base64')}},res);return res};
 try{assert.equal((await upload('fake')).code,400);assert.equal(storageWrites,0);assert.equal((await upload('%PDF-synthetic','application/pdf',prop)).code,403);publicBucket=true;assert.equal((await upload('%PDF-synthetic')).code,503);assert.equal(storageWrites,0);publicBucket=false;assert.equal((await upload('%PDF-synthetic')).code,201);assert.equal(storageWrites,1);revoked=true;assert.equal((await upload('%PDF-synthetic')).code,403);process.env.MYOPS_RENTAL_ACCESS_DISABLED='true';assert.equal((await upload('%PDF-synthetic')).code,503);}finally{globalThis.fetch=fetch0;process.env=old;}
});
