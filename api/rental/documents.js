import { organizationEntitled, rentalAccessDisabled } from './authorization.js';
import { parseCookie, checkEntitlement } from '../sso/session.js';
import { rentalDatabaseUrl } from './db-config.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX=5*1024*1024;
const MIME=new Set(['application/pdf','image/png','image/jpeg','text/plain']);
const bucket='opsrental-private';
function config(){const base=rentalDatabaseUrl(),key=process.env.MYOPS_RENTAL_SERVICE_ROLE_KEY;if(!key)throw Error('Configuration missing');return {base,key};}
async function call(path,method='GET',body,headers={}) {
 const {base,key}=config();
 const response=await fetch(new URL(path,base),{method,headers:{apikey:key,Authorization:'Bearer '+key,...headers},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Backend operation failed: '+response.status);
 return response;
}
async function rows(table,filters={},method='GET',payload){
 const q=new URLSearchParams({select:'*'});for(const [k,v] of Object.entries(filters))q.set(k,'eq.'+v);
 const r=await call('/rest/v1/'+table+'?'+q,method,payload===undefined?undefined:JSON.stringify(payload),{'content-type':'application/json',Prefer:'return=representation'});
 return r.json();
}
function deny(res,status,message){return res.status(status).json({error:message});}
function sameOrigin(req){try{const u=new URL(req.headers.origin);return u.protocol==='https:'&&u.host===req.headers.host&&!u.username&&!u.password;}catch{return false;}}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(rentalAccessDisabled())return deny(res,503,'Rental access disabled');
 if(!['GET','POST','DELETE'].includes(req.method))return deny(res,405,'Method not allowed');
 if(req.method!=='GET'&&!sameOrigin(req))return deny(res,403,'Same-origin required');
 const sid=parseCookie(req),org=req.query?.organization_id;
 if(!sid)return deny(res,401,'MYOPS session required');
 if(typeof org!=='string'||!UUID.test(org))return deny(res,400,'Valid organization required');
 try{
  if(!(await checkEntitlement(sid)))return deny(res,403,'Session entitlement denied');
  const sessions=await rows('myops_app_sessions',{id:sid,app_id:'opsrental'});
  const session=sessions.find(s=>s.revoked_at===null&&s.product_slug==='opsrental'&&UUID.test(s.user_id));
  if(!session)return deny(res,403,'Session revoked or invalid');
  const membership=await rows('myops_memberships',{user_id:session.user_id,organization_id:org,status:'active'});
  const role=membership[0]?.role;
  if(!['owner','admin','manager'].includes(role))return deny(res,403,'Document manager access required');
  if(!(await organizationEntitled(rows,session.user_id,org)))return deny(res,403,'Organization entitlement denied');
  const id=req.query?.id,action=req.query?.action||'list';
  if(req.method==='GET'&&action==='list'){
   const docs=await rows('rental_documents',{organization_id:org});
   return res.status(200).json({items:docs.map(d=>({id:d.id,filename:d.filename,lease_id:d.lease_id,created_at:d.created_at}))});
  }
  if(req.method==='POST'&&action==='upload'){
   const {lease_id,filename,mime_type,content_base64}=req.body||{};
   if(!UUID.test(lease_id||'')||typeof filename!=='string'||filename.length>180||!filename.trim()||/[\\/\x00-\x1f]/.test(filename)||!MIME.has(mime_type)||typeof content_base64!=='string'||content_base64.length>Math.ceil(MAX*4/3)+8||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content_base64))return deny(res,400,'Invalid file');
   const bytes=Buffer.from(content_base64,'base64');
   if(!bytes.length||bytes.length>MAX)return deny(res,413,'File size exceeds 5 MB');
   if(!(await rows('rental_leases',{id:lease_id,organization_id:org})).length)return deny(res,403,'Lease not in organization');
   const fileId=crypto.randomUUID(),path=org+'/'+fileId;
   await call('/storage/v1/object/'+bucket+'/'+path,'POST',bytes,{'content-type':mime_type,'x-upsert':'false'});
   try{
    const saved=await rows('rental_documents',{},'POST',{id:fileId,organization_id:org,lease_id,uploaded_by:session.user_id,filename,storage_path:path});
    return res.status(201).json({item:{id:saved[0].id,filename:saved[0].filename,lease_id:saved[0].lease_id}});
   }catch(e){await call('/storage/v1/object/'+bucket+'/'+path,'DELETE').catch(()=>{});throw e;}
  }
  if(!UUID.test(id||''))return deny(res,400,'Document ID required');
  const docs=await rows('rental_documents',{id,organization_id:org});
  if(!docs.length)return deny(res,404,'Document not found');
  const doc=docs[0];
  if(!doc.storage_path.startsWith(org+'/'))return deny(res,403,'Invalid storage ownership');
  if(req.method==='GET'&&action==='signed-url'){
   const r=await call('/storage/v1/object/sign/'+bucket+'/'+doc.storage_path,'POST',JSON.stringify({expiresIn:60}),{'content-type':'application/json'});
   const signed=await r.json();
   if(!signed.signedURL)return deny(res,503,'Signed URL unavailable');
   return res.status(200).json({url:new URL(signed.signedURL,config().base).toString(),expires_in:60});
  }
  if(req.method==='GET'&&action==='download'){
   const r=await call('/storage/v1/object/authenticated/'+bucket+'/'+doc.storage_path);
   const bytes=Buffer.from(await r.arrayBuffer());
   res.setHeader('Content-Type','application/octet-stream');
   res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(doc.filename));
   return res.status(200).send(bytes);
  }
  if(req.method==='DELETE'&&action==='delete'){
   if(!['owner','admin'].includes(role))return deny(res,403,'Owner or administrator required');
   await call('/storage/v1/object/'+bucket+'/'+doc.storage_path,'DELETE');
   await rows('rental_documents',{id,organization_id:org},'DELETE');
   return res.status(200).json({deleted:true});
  }
  return deny(res,400,'Unsupported document operation');
 }catch{return deny(res,503,'Document service unavailable');}
}
