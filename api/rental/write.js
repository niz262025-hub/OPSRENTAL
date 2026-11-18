import {parseCookie,checkEntitlement} from "../sso/session.js";
const names={properties:"rental_properties",leases:"rental_leases",payments:"rental_payments",tickets:"rental_tickets"};
const fields={
 properties:["name","address","unit_label","parking_spaces"],
 leases:["property_id","tenant_user_id","monthly_rent","currency","start_date","end_date","status","parking_spaces"],
 payments:["lease_id","amount","due_date","paid_at","status","reference"],
 tickets:["lease_id","title","description","status"]
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function query(table, filters={},method="GET",body) {
 const base=process.env.MYOPS_RENTAL_SUPABASE_URL,key=process.env.MYOPS_RENTAL_SERVICE_ROLE_KEY;
 if(!base||!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(base)||!key)throw Error("config");
 const url=new URL("/rest/v1/"+table,base);url.searchParams.set("select","*");
 for(const [k,v] of Object.entries(filters))url.searchParams.set(k,"eq."+v);
 const response=await fetch(url,{method,headers:{apikey:key,Authorization:"Bearer "+key,"content-type":"application/json",Prefer:"return=representation"},body:body?JSON.stringify(body):undefined,cache:"no-store",signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error("db");return response.json();
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","private, no-store");
 if(!["POST","PATCH"].includes(req.method))return res.status(405).json({error:"Method not allowed"});
 const origin=req.headers.origin,host=req.headers.host;
 if(!origin||!host)return res.status(403).json({error:"Same-origin request required"});
 try { const u=new URL(origin);if(u.protocol!=="https:"||u.host!==host||u.username||u.password)return res.status(403).json({error:"Origin denied"}); }catch{return res.status(403).json({error:"Origin denied"});}
 const table=names[req.query?.resource],resource=req.query?.resource,org=req.query?.organization_id;
 if(!table||typeof org!=="string"||!uuid.test(org))return res.status(400).json({error:"Invalid resource or organization"});
 const sid=parseCookie(req);
 if(!sid)return res.status(401).json({error:"Login required"});
 try{
  if(!(await checkEntitlement(sid)))return res.status(403).json({error:"Subscription denied"});
  const sessions=await query("myops_app_sessions",{id:sid,app_id:"opsrental"});
  const session=sessions.find(s=>s.revoked_at===null&&s.product_slug==="opsrental");
  if(!session||!uuid.test(session.user_id))return res.status(403).json({error:"Invalid session"});
  const membership=await query("myops_memberships",{user_id:session.user_id,organization_id:org,status:"active"});
  if(!membership.some(m=>["owner","admin","manager"].includes(m.role)))return res.status(403).json({error:"Manager role required"});
  const input=req.body;
  if(!input||typeof input!=="object"||Array.isArray(input)||!Object.keys(input).length||Object.keys(input).some(k=>!fields[resource].includes(k)))return res.status(400).json({error:"Invalid fields"});
  for(const k of ["property_id","lease_id","tenant_user_id"])if(k in input&&!uuid.test(input[k]))return res.status(400).json({error:"Invalid reference"});
  if(req.method==="POST"){
   if(resource==="leases"&&!input.property_id)return res.status(400).json({error:"Property required"});
   if(["payments","tickets"].includes(resource)&&!input.lease_id)return res.status(400).json({error:"Lease required"});
  }
  if(input.property_id&&!(await query("rental_properties",{id:input.property_id,organization_id:org})).length)return res.status(403).json({error:"Property not in organization"});
  if(input.lease_id&&!(await query("rental_leases",{id:input.lease_id,organization_id:org})).length)return res.status(403).json({error:"Lease not in organization"});
  if(req.method==="POST"){
   const record={...input,organization_id:org};
   if(["properties","tickets"].includes(resource))record.created_by=session.user_id;
   const rows=await query(table,{},"POST",record);
   return res.status(201).json({item:rows[0]});
  }
  const id=req.query?.id;
  if(typeof id!=="string"||!uuid.test(id))return res.status(400).json({error:"Record ID required"});
  if(!(await query(table,{id,organization_id:org})).length)return res.status(404).json({error:"Not found"});
  const rows=await query(table,{id,organization_id:org},"PATCH",input);
  return res.status(200).json({item:rows[0]});
 }catch{return res.status(503).json({error:"Rental backend unavailable"});}
}
