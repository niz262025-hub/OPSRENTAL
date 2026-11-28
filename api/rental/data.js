import { organizationEntitled, rentalAccessDisabled } from './authorization.js';
import { parseSession, organizationMatches, boundOrganizationEnabled, checkEntitlement, checkScopedAdmin } from "../sso/session.js";
import { rentalDatabaseUrl } from './db-config.js';
const tables = Object.freeze({
  properties: "rental_properties", leases: "rental_leases",
  payments: "rental_payments", tickets: "rental_tickets",
  documents: "rental_documents"
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function db(table, filters) {
  const base = rentalDatabaseUrl();
  const key = process.env.MYOPS_RENTAL_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Database not configured");
  const url = new URL("/rest/v1/" + table, base);
  url.searchParams.set("select", "*");
  for (const [k,v] of Object.entries(filters)) url.searchParams.set(k, "eq." + v);
  url.searchParams.set("limit", "250");
  const response = await fetch(url, { headers: { apikey:key, Authorization:"Bearer " + key }, cache:"no-store", redirect:"error", signal:AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Database request failed");
  return response.json();
}
export default async function handler(req,res) {
  res.setHeader("Cache-Control","private, no-store");
  if (rentalAccessDisabled()) return res.status(503).json({error:"Rental access temporarily disabled"});
  if (req.method !== "GET") return res.status(405).json({error:"Method not allowed"});
  const table = tables[req.query?.resource];
  if (!table) return res.status(400).json({error:"Unknown resource"});
  const claims = parseSession(req), sid = claims?.sid;
  if (!sid) return res.status(401).json({error:"MYOPS session required"});
  try {
    if (!(await checkEntitlement(sid, claims.org))) return res.status(403).json({error:"Subscription or session denied"});
    const sessions = await db("myops_app_sessions", { id:sid, app_id:"opsrental" });
    const session = sessions.find(x=>x.revoked_at === null && x.product_slug === "opsrental");
    if (!session || !UUID.test(session.user_id)) return res.status(403).json({error:"Session denied"});
    const memberships = await db("myops_memberships", { user_id:session.user_id, status:"active" });
    const requestedOrg = req.query?.organization_id;
    if (typeof requestedOrg !== "string" || !UUID.test(requestedOrg)) return res.status(400).json({error:"Organization required"});
    if (!organizationMatches(claims, requestedOrg) || (boundOrganizationEnabled() && session.organization_id !== claims.org)) return res.status(403).json({error:"Organization denied"});
    const member = memberships.find(m=>m.organization_id === requestedOrg);
    const manager = member && ["owner","admin","manager"].includes(member.role);
    if (!manager && table === "rental_documents") return res.status(403).json({error:"Not authorized"});
    if (!manager && !member) return res.status(403).json({error:"Not a member"});
    if (!((await organizationEntitled(db, session.user_id, requestedOrg) || await checkScopedAdmin(sid, requestedOrg)))) return res.status(403).json({error:"Organization entitlement denied"});
    // Tenant access must be narrowed by an assigned lease, never by membership alone.
    let records = await db(table, {organization_id:requestedOrg});
    if (!manager) {
      const leases = await db("rental_leases", {organization_id:requestedOrg,tenant_user_id:session.user_id});
      const leaseIds = new Set(leases.map(x=>x.id));
      if (table === "rental_leases") records = leases;
      else if (table === "rental_properties") records = records.filter(x=>leases.some(l=>l.property_id===x.id));
      else records = records.filter(x=>leaseIds.has(x.lease_id));
    }
    return res.status(200).json({items:records});
  } catch {
    return res.status(503).json({error:"Rental data temporarily unavailable"});
  }
}
