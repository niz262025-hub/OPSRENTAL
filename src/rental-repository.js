// OpsRental: authenticated Supabase data adapter for MYOPS Central Auth.
// No service-role key or user-selected tenant ID is trusted.
// This module deliberately fails closed until a verified MYOPS session is supplied.
export function createRentalRepository({ supabase, organizationId, userId }) {
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(organizationId || "") ||
      !/^[0-9a-f-]{36}$/i.test(userId || "")) {
    throw new Error("Verified MYOPS identity and organization are required");
  }
  const tables = {
    properties: "rental_properties", leases: "rental_leases",
    payments: "rental_payments", tickets: "rental_tickets",
    documents: "rental_documents"
  };
  async function assertSession() {
    const { data, error } = await supabase.auth.getUser();
    if (error || data?.user?.id !== userId) throw new Error("MYOPS session expired or identity mismatch");
    const membership = await supabase.from("myops_memberships")
      .select("organization_id,status").eq("organization_id", organizationId)
      .eq("user_id", userId).eq("status", "active").maybeSingle();
    if (membership.error || !membership.data) throw new Error("No active MYOPS organization membership");
  }
  function tableFor(collection) {
    if (!Object.hasOwn(tables, collection)) throw new Error("Unknown rental collection");
    return tables[collection];
  }
  async function list(collection) {
    await assertSession();
    const { data, error } = await supabase.from(tableFor(collection))
      .select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }
  async function create(collection, payload) {
    await assertSession();
    if (!["properties", "leases", "payments", "tickets", "documents"].includes(collection)) throw new Error("Invalid collection");
    const clean = { ...payload };
    delete clean.id; delete clean.organization_id; delete clean.created_at;
    if (collection === "properties") clean.created_by = userId;
    if (collection === "tickets") clean.created_by = userId;
    if (collection === "documents") clean.uploaded_by = userId;
    const { data, error } = await supabase.from(tableFor(collection))
      .insert({ ...clean, organization_id: organizationId }).select().single();
    if (error) throw error;
    return data;
  }
  async function update(collection, id, changes) {
    await assertSession();
    if (!/^[0-9a-f-]{36}$/i.test(id || "")) throw new Error("Invalid record ID");
    const clean = { ...changes };
    for (const key of ["id","organization_id","created_by","uploaded_by","created_at","tenant_user_id","property_id","lease_id"]) delete clean[key];
    const { data, error } = await supabase.from(tableFor(collection))
      .update(clean).eq("id", id).eq("organization_id", organizationId).select().single();
    if (error) throw error;
    return data;
  }
  return Object.freeze({ list, create, update, assertSession });
}
