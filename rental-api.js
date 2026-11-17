/* OpsRental database adapter. Supply an authenticated Supabase client from MYOPS SSO.
   Never place a service_role key in the browser. All access is enforced by RLS. */
const TABLES = Object.freeze({
  properties: "rental_properties",
  leases: "rental_leases",
  payments: "rental_payments",
  tickets: "rental_tickets",
  documents: "rental_documents"
});
function createRentalRepository(supabase, organizationId) {
  if (!supabase || typeof supabase.from !== "function") throw new Error("Authenticated Supabase client required");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(organizationId || "")) throw new Error("Valid organization required");
  async function run(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  function table(kind) {
    if (!Object.hasOwn(TABLES, kind)) throw new Error("Unknown OpsRental resource");
    return supabase.from(TABLES[kind]);
  }
  return Object.freeze({
    list(kind) {
      return run(table(kind).select("*").eq("organization_id", organizationId));
    },
    create(kind, record) {
      if (kind === "documents") throw new Error("Document uploads require a private storage workflow");
      if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Invalid record");
      const { id, organization_id, ...safe } = record;
      return run(table(kind).insert({ ...safe, organization_id: organizationId }).select().single());
    },
    update(kind, id, changes) {
      if (kind === "documents") throw new Error("Document updates require a private storage workflow");
      if (!id || !changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Invalid update");
      const { id: ignoredId, organization_id, created_by, uploaded_by, tenant_user_id, property_id, lease_id, ...safe } = changes;
      if (!Object.keys(safe).length) throw new Error("No editable fields");
      return run(table(kind).update(safe).eq("id", id).eq("organization_id", organizationId).select().single());
    }
  });
}
if (typeof module !== "undefined") module.exports = { createRentalRepository, TABLES };
