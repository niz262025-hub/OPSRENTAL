import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,generateKeyPairSync} from 'node:crypto';
import read from '../api/rental/data.js';
import write from '../api/rental/write.js';

const sid='00000000-0000-4000-8000-000000000001', user='00000000-0000-4000-8000-000000000002', orgA='00000000-0000-4000-8000-000000000003', orgB='00000000-0000-4000-8000-000000000004', property='00000000-0000-4000-8000-000000000005';
function response(){return {statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}}}

test('API requires active central session and membership, and rejects foreign property links', async () => {
 const old={...process.env}, originalFetch=globalThis.fetch;
 const {privateKey}=generateKeyPairSync('ed25519');
 Object.assign(process.env,{VERCEL_ENV:'preview',MYOPS_API_ORIGIN:'https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app', MYOPS_RENTAL_SUPABASE_URL:'https://wengxxiqwtosirealghx.supabase.co',MYOPS_RENTAL_SERVICE_ROLE_KEY:'synthetic-key',MYOPS_RENTAL_SESSION_SECRET:'synthetic-secret-12345678901234567890',MYOPS_APP_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}).toString()});
 const body=Buffer.from(JSON.stringify({sid,exp:Date.now()+60000})).toString('base64url');
 const mac=createHmac('sha256',process.env.MYOPS_RENTAL_SESSION_SECRET).update(body).digest('base64url');
 const headers={cookie:`__Host-opsrental-session=${body}.${mac}`,origin:'https://rental.example',host:'rental.example'};
 let revoked=false, entitled=true, active=true, extraMembership=false, adminScope=null, accessMode='paid', role='manager', writes=[], boundOrg=null;
 globalThis.fetch=async (url,options={})=>{
  const u=new URL(url);
  if(u.pathname==='/api/app/entitlement'){ const request=JSON.parse(options.body); return {ok:true,json:async()=>({entitled,session_active:!revoked,access_mode:accessMode,...(boundOrg ? {organization_id:boundOrg} : {}),...(request.organization_id && adminScope ? {access_mode:'admin',organization_id:adminScope} : {})})}; }
  const table=u.pathname.split('/').pop();
  let rows=[];
  if(table==='myops_app_sessions')rows=[{id:sid,user_id:user,product_slug:'opsrental',organization_id:boundOrg,revoked_at:revoked?'2026-01-01':null}];
  if(table==='myops_memberships'&&active){ rows=[{user_id:user,organization_id:orgA,status:'active',role}]; if(extraMembership)rows.push({user_id:user,organization_id:orgB,status:'active',role:'manager'}); if(u.searchParams.get('organization_id'))rows=rows.filter(m=>u.searchParams.get('organization_id')===`eq.${m.organization_id}`); }
  if(table==='myops_app_grants') rows=[{user_id:user,organization_id:orgA,product_slug:'opsrental'}];
  if(table==='myops_subscriptions') rows=[{organization_id:orgA,personal_user_id:null,status:'active',product_slug:'opsrental',current_period_end:null}];
  if(table==='rental_properties')rows=u.searchParams.get('organization_id')===`eq.${orgA}`?[{id:property,organization_id:orgA}]:[];
  if(options.method==='DELETE'){writes.push({table,method:options.method,filters:Object.fromEntries(u.searchParams)});return {ok:true,json:async()=>u.searchParams.get('organization_id')===`eq.${orgA}`?[{id:property}]:[]};}
  if(options.method==='POST'||options.method==='PATCH'){writes.push({table,method:options.method,body:JSON.parse(options.body)});return {ok:true,json:async()=>[JSON.parse(options.body)]};}
  return {ok:true,json:async()=>rows};
 };
 const get=async(org)=>{const res=response();await read({method:'GET',headers,query:{resource:'properties',organization_id:org}},res);return res};
 const post=async(org,input,resource='properties')=>{const res=response();await write({method:'POST',headers,query:{resource,organization_id:org},body:input},res);return res};
 try {
  assert.equal((await get(orgA)).statusCode,200);
  assert.equal((await get(orgB)).statusCode,403);
  assert.equal((await post(orgA,{name:'Synthetic',address:'Test'})).statusCode,201);
  assert.equal(writes[0].body.organization_id,orgA);
  assert.equal((await post(orgB,{name:'Foreign'})).statusCode,403);
  extraMembership=true;
  assert.equal((await post(orgB,{property_id:property,tenant_user_id:user,monthly_rent:1,start_date:'2026-01-01'},'leases')).statusCode,403);
  role='owner'; adminScope=orgB; assert.equal((await get(orgB)).statusCode,200);
  adminScope=orgA; assert.equal((await get(orgB)).statusCode,403);
  adminScope=null; extraMembership=false; role='manager';
  const del=async(org)=>{const res=response();await write({method:'DELETE',headers,query:{resource:'properties',organization_id:org,id:property}},res);return res};
  assert.equal((await del(orgA)).statusCode,403);
  role='owner';assert.equal((await del(orgA)).statusCode,200);
  assert.equal(writes[1].filters.organization_id,`eq.${orgA}`);
  assert.equal((await del(orgB)).statusCode,403);
  active=false;assert.equal((await get(orgA)).statusCode,403);active=true;
  entitled=false;assert.equal((await get(orgA)).statusCode,403);entitled=true;
  accessMode='trial'; assert.equal((await get(orgA)).statusCode,403); assert.equal((await post(orgA,{name:'Blocked trial'})).statusCode,403); accessMode='paid';
  revoked=true;assert.equal((await get(orgA)).statusCode,403);
  assert.equal(writes.length,2);
  revoked=false; role='owner'; extraMembership=true; boundOrg=orgA;
  process.env.MYOPS_RENTAL_ORGANIZATION_BOUND='true';
  const scoped=Buffer.from(JSON.stringify({sid,org:orgA,exp:Date.now()+60000})).toString('base64url');
  const scopedMac=createHmac('sha256',process.env.MYOPS_RENTAL_SESSION_SECRET).update(scoped).digest('base64url');
  headers.cookie=`__Host-opsrental-session=${scoped}.${scopedMac}`;
  assert.equal((await get(orgA)).statusCode,200);
  assert.equal((await get(orgB)).statusCode,403);
  assert.equal((await post(orgB,{name:'Wrong organization'})).statusCode,403);
  boundOrg=orgB; assert.equal((await get(orgA)).statusCode,403);
  assert.equal(writes.length,2);

 } finally {globalThis.fetch=originalFetch;process.env=old;}
});
