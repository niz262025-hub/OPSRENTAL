import { trialMutation, trialMutationPreviewEnabled } from './trial.js';
import { organizationEntitled, rentalAccessDisabled } from './authorization.js';
import { parseSession, organizationMatches, boundOrganizationEnabled, currentEntitlementMode, checkScopedAdmin } from '../sso/session.js';
import { rentalDatabaseUrl } from './db-config.js';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Base64 and JSON must fit within Vercel's request limit.
const MAX=3*1024*1024;
export const config = { api: { bodyParser: { sizeLimit: '4.25mb' } } };
function validSignature(bytes, type) {
 if (type === 'application/pdf') return bytes.subarray(0,5).equals(Buffer.from('%PDF-'));
 if (type === 'image/png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if (type === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217;
 if (type === 'text/plain') { try { const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); return !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text); } catch { return false; } }
 return false;
}
const MIME=new Set(['application/pdf','image/png','image/jpeg','text/plain']);
const bucket='opsrental-private';
function backendConfig(){const base=rentalDatabaseUrl(),key=process.env.MYOPS_RENTAL_SERVICE_ROLE_KEY;if(!key)throw Error('Configuration missing');return {base,key};}
async function call(path,method='GET',body,headers={}) {
 const {base,key}=backendConfig();
 const response=await fetch(new URL(path,base),{method,headers:{apikey:key,Authorization:'Bearer '+key,...headers},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Backend operation failed: '+response.status);
 return response;
}
async function removeObject(path){ return call('/storage/v1/object/'+bucket,'DELETE',JSON.stringify({prefixes:[path]}),{'content-type':'application/json'}); }
async function rows(table,filters={},method='GET',payload){
 const q=new URLSearchParams({select:'*'});for(const [k,v] of Object.entries(filters))q.set(k,'eq.'+v);
 const r=await call('/rest/v1/'+table+'?'+q,method,payload===undefined?undefined:JSON.stringify(payload),{'content-type':'application/json',Prefer:'return=representation'});
 return r.json();
}
function tokenMac(body){
 const secret=process.env.MYOPS_RENTAL_SESSION_SECRET;
 if(!secret||Buffer.byteLength(secret)<32)throw Error('Signing secret unavailable');
 return createHmac('sha256',secret).update('opsrental-document-view-v1.').update(body).digest();
}
function issueToken(id,org,sid){
 const body=Buffer.from(JSON.stringify({id,org,sid,exp:Date.now()+60000})).toString('base64url');
 return body+'.'+tokenMac(body).toString('base64url');
}
function verifyToken(token,id,org,sid){
 if(typeof token!=='string'||token.length>1024||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return false;
 const [body,mac]=token.split('.'),expected=tokenMac(body),actual=Buffer.from(mac,'base64url');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;
 try{const value=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));return value.id===id&&value.org===org&&value.sid===sid&&Number.isSafeInteger(value.exp)&&value.exp>Date.now()&&value.exp<=Date.now()+60000;}catch{return false;}
}
function deny(res,status,message){return res.status(status).json({error:message});}
function sameOrigin(req){try{const u=new URL(req.headers.origin);return u.protocol==='https:'&&u.host===req.headers.host&&!u.username&&!u.password;}catch{return false;}}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 if(rentalAccessDisabled())return deny(res,503,'Rental access disabled');
 if(!['GET','POST','DELETE'].includes(req.method))return deny(res,405,'Method not allowed');
 if(req.method!=='GET'&&!sameOrigin(req))return deny(res,403,'Same-origin required');
 const claims=parseSession(req),sid=claims?.sid,org=req.query?.organization_id;
 if(!sid)return deny(res,401,'MYOPS session required');
 if(typeof org!=='string'||!UUID.test(org))return deny(res,400,'Valid organization required');
 if(!organizationMatches(claims,org))return deny(res,403,'Organization denied');
 try{
  const mode=await currentEntitlementMode(sid,claims.org);
  const action=req.query?.action||'list';
  if(!mode || (mode==='trial' && (!trialMutationPreviewEnabled() || req.method!=='POST' || action!=='upload'))) {
   return deny(res,403,'Session entitlement denied');
  }
  const sessions=await rows('myops_app_sessions',{id:sid,app_id:'opsrental'});
  const session=sessions.find(s=>s.revoked_at===null&&s.product_slug==='opsrental'&&UUID.test(s.user_id));
  if(!session)return deny(res,403,'Session revoked or invalid');
  if(boundOrganizationEnabled()&&session.organization_id!==claims.org)return deny(res,403,'Organization denied');
  const membership=await rows('myops_memberships',{user_id:session.user_id,organization_id:org,status:'active'});
  const role=membership[0]?.role;
  if(!['owner','admin','manager'].includes(role))return deny(res,403,'Document manager access required');
  if(mode!=='trial' && !(await organizationEntitled(rows,session.user_id,org) || await checkScopedAdmin(sid,org)))return deny(res,403,'Organization entitlement denied');
  const id=req.query?.id;
  if(req.method==='GET'&&action==='list'){
   const docs=await rows('rental_documents',{organization_id:org});
   return res.status(200).json({items:docs.map(d=>({id:d.id,filename:d.filename,lease_id:d.lease_id,property_id:d.property_id,state:d.state,created_at:d.created_at}))});
  }
  if(req.method==='POST'&&action==='upload'){
   const {lease_id,property_id,filename,mime_type,content_base64}=req.body||{};
   if((!UUID.test(lease_id||'') === !UUID.test(property_id||''))||typeof filename!=='string'||filename.length>180||!filename.trim()||/[\\/\x00-\x1f]/.test(filename)||!MIME.has(mime_type)||typeof content_base64!=='string')return deny(res,400,'Invalid file');
   if(content_base64.length>Math.ceil(MAX/3)*4)return deny(res,413,'File size exceeds 3 MB');
   // Avoid a repeated-group regexp, which can overflow the stack on valid large uploads.
   if(content_base64.length%4!==0 || /[^A-Za-z0-9+/=]/.test(content_base64))return deny(res,400,'Invalid file');
   const bytes=Buffer.from(content_base64,'base64');
   if(bytes.toString('base64')!==content_base64)return deny(res,400,'Invalid file');
   if(!bytes.length||bytes.length>MAX)return deny(res,413,'File size exceeds 3 MB');
   if(!validSignature(bytes,mime_type))return deny(res,400,'File content does not match its type');
   const target = lease_id ? ['rental_leases',lease_id] : ['rental_properties',property_id];
   if(!(await rows(target[0],{id:target[1],organization_id:org})).length)return deny(res,403,'Association not in organization');
   const bucketInfo=await (await call('/storage/v1/bucket/'+bucket)).json();
   if(bucketInfo.id!==bucket || bucketInfo.public!==false)return deny(res,503,'Private storage unavailable');
   if(mode==='trial'){
    const operation=req.headers['idempotency-key'];
    if(typeof operation!=='string'||!UUID.test(operation))return deny(res,400,'Idempotency key required');
    const digest=createHash('sha256').update(bytes).digest('hex');
    const args={p_session:sid,p_org:org,p_operation:operation,p_filename:filename,
     p_property:property_id||null,p_lease:lease_id||null,p_sha256:digest};
    const reserve=await trialMutation('myops_rental_trial_upload',args,res);
    if(!reserve)return;
    if(reserve.status==='completed' && UUID.test(reserve.item?.id||'')){
     return res.status(200).json({item:{id:reserve.item.id,filename,lease_id:lease_id||null,property_id:property_id||null}});
    }
    const fileId=reserve.document_id,path=org+'/'+fileId;
    if(reserve.status!=='uploading'||!UUID.test(fileId||'')||reserve.storage_path!==path)throw Error('Invalid trial reservation');
    // No upserts. After an uncertain upload, compare the immutable object
    // before finalizing the original reservation.
    try {await call('/storage/v1/object/'+bucket+'/'+path,'POST',bytes,{'content-type':mime_type,'x-upsert':'false','cache-control':'max-age=0, no-store'});}
    catch { /* Storage can commit even when its response is lost. */ }
    const stored=await call('/storage/v1/object/authenticated/'+bucket+'/'+path);
    const storedDigest=createHash('sha256').update(Buffer.from(await stored.arrayBuffer())).digest('hex');
    if(storedDigest!==digest)throw Error('Trial document content mismatch');
    const completed=await trialMutation('myops_rental_trial_upload',{...args,p_finalize:true},res);
    if(!completed)return;
    if(completed.status!=='completed'||completed.item?.id!==fileId)throw Error('Trial upload not completed');
    return res.status(completed.replayed?200:201).json({item:{id:fileId,filename,lease_id:lease_id||null,property_id:property_id||null}});
   }
   const fileId=crypto.randomUUID(),path=org+'/'+fileId;
   // Reserve metadata first: a failed or uncertain Storage call remains traceable.
   const saved=await rows('rental_documents',{},'POST',{id:fileId,organization_id:org,lease_id:lease_id||null,property_id:property_id||null,uploaded_by:session.user_id,filename,storage_path:path,state:'pending'});
   if(saved.length!==1)throw Error('Metadata reservation failed');
   await call('/storage/v1/object/'+bucket+'/'+path,'POST',bytes,{'content-type':mime_type,'x-upsert':'false','cache-control':'max-age=0, no-store'});
   const ready=await rows('rental_documents',{id:fileId,organization_id:org,state:'pending'},'PATCH',{state:'ready'});
   if(ready.length!==1)throw Error('Metadata finalization failed');
   return res.status(201).json({item:{id:fileId,filename,lease_id:lease_id||null,property_id:property_id||null}});
  }
  if(!UUID.test(id||''))return deny(res,400,'Document ID required');
  const docs=await rows('rental_documents',{id,organization_id:org});
  if(!docs.length)return deny(res,404,'Document not found');
  const doc=docs[0];
  const bucketInfo=await (await call('/storage/v1/bucket/'+bucket)).json();
  if(bucketInfo.id!==bucket || bucketInfo.public!==false)return deny(res,503,'Private storage unavailable');
  if(doc.storage_path !== org+'/'+doc.id)return deny(res,403,'Invalid storage ownership');
  if(req.method==='GET'&&doc.state!=='ready')return deny(res,409,'Document is not available');
  if(req.method==='GET'&&action==='signed-url'){
   const token=issueToken(id,org,sid);
   const params=new URLSearchParams({organization_id:org,id,action:'signed-view',token});
   return res.status(200).json({url:'/api/rental/documents?'+params.toString(),expires_in:60});
  }
  if(req.method==='GET'&&action==='signed-view'&&!verifyToken(req.query?.token,id,org,sid))return deny(res,403,'Invalid or expired document link');
  if(req.method==='GET'&&['view','download','signed-view'].includes(action)){
   const r=await call('/storage/v1/object/authenticated/'+bucket+'/'+doc.storage_path);
   const bytes=Buffer.from(await r.arrayBuffer());
   // Determine inline type from validated bytes, not a client supplied filename.
   const safeType=['application/pdf','image/png','image/jpeg','text/plain'].find(type=>validSignature(bytes,type));
   if(action!=='download'&&!safeType)return deny(res,415,'Document cannot be displayed safely');
   res.setHeader('Content-Type',action!=='download'?safeType:'application/octet-stream');
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'");
   res.setHeader('Content-Disposition',(action!=='download'?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(doc.filename));
   return res.status(200).send(bytes);
  }
  if(req.method==='DELETE'&&action==='delete'){
   if(!['owner','admin'].includes(role))return deny(res,403,'Owner or administrator required');
   if(doc.state==='pending' && (!Number.isFinite(Date.parse(doc.created_at)) || Date.now()-Date.parse(doc.created_at)<120000))return deny(res,409,'Upload may still be in progress');
   if(!['pending','ready','deleting'].includes(doc.state))return deny(res,409,'Invalid document state');
   if(doc.state!=='deleting'){
    const marked=await rows('rental_documents',{id,organization_id:org,state:doc.state},'PATCH',{state:'deleting'});
    if(marked.length!==1)return deny(res,409,'Document changed, retry');
   }
   await removeObject(doc.storage_path);
   const removed=await rows('rental_documents',{id,organization_id:org,state:'deleting'},'DELETE');
   if(removed.length!==1)throw Error('Metadata deletion failed');
   return res.status(200).json({deleted:true});
  }
  return deny(res,400,'Unsupported document operation');
 }catch{return deny(res,503,'Document service unavailable');}
}
