import { organizationEntitled, rentalAccessDisabled } from './authorization.js';
import {parseCookie,checkEntitlement} from "../sso/session.js";
import {rentalDatabaseUrl} from './db-config.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function lookup(table,filters){
 const base=rentalDatabaseUrl(),key=process.env.MYOPS_RENTAL_SERVICE_ROLE_KEY;
 if(!key)throw Error("Configuration unavailable");
 const url=new URL("/rest/v1/"+table,base);url.searchParams.set("select","*");
 for(const [k,v] of Object.entries(filters))url.searchParams.set(k,"eq."+v);
 const r=await fetch(url,{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error("Database unavailable");return r.json();
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","private, no-store");
  if (rentalAccessDisabled()) return res.status(503).json({error:"Rental access temporarily disabled"});
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 const sid=parseCookie(req);
 if(!sid)return res.status(401).json({error:"Login required"});
 try{
  if(!(await checkEntitlement(sid)))return res.status(403).json({error:"Subscription denied"});
  const sessions=await lookup("myops_app_sessions",{id:sid,app_id:"opsrental"});
  const session=sessions.find(s=>s.revoked_at===null&&s.product_slug==="opsrental");
  if(!session||!uuid.test(session.user_id))return res.status(403).json({error:"Invalid session"});
  const memberships=await lookup("myops_memberships",{user_id:session.user_id,status:"active"});
  const checks=await Promise.all(memberships.map(async m=>({member:m,allowed:uuid.test(m.organization_id) && await organizationEntitled(lookup,session.user_id,m.organization_id)})));
  return res.status(200).json({organizations:checks.filter(x=>x.allowed).map(({member:m})=>({organization_id:m.organization_id,role:m.role}))});
 }catch{return res.status(503).json({error:"Organization lookup unavailable"});}
}
