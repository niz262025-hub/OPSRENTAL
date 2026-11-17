import { createRentalRepository } from "./rental-repository.js";

// The MYOPS SSO callback must initialize window.MYOPS_RENTAL_CONTEXT with
// { supabase: authenticatedSupabaseClient, organizationId, userId }.
// No token, service-role key or organization ID is accepted from query strings.
const status = document.getElementById("connection-status");
const workspace = document.getElementById("connected-workspace");
const ctx = window.MYOPS_RENTAL_CONTEXT;
let repository;
function errorText(error) { return error?.message || "Unknown error"; }
function showError(error) { status.textContent = "Access unavailable: " + errorText(error); workspace.hidden = true; }
function addText(parent, tag, text) {
  const node = document.createElement(tag);
  node.textContent = String(text ?? "");
  parent.append(node);
}
async function refresh() {
  await repository.assertSession();
  const [properties, leases, payments, tickets, documents] = await Promise.all(
    ["properties","leases","payments","tickets","documents"].map(name => repository.list(name))
  );
  for (const [name, records, format] of [
    ["properties",properties,record => record.name + " — " + record.address],
    ["leases",leases,record => record.property_id + " · " + record.monthly_rent + " " + record.currency],
    ["payments",payments,record => record.amount + " · " + record.status],
    ["tickets",tickets,record => record.title + " · " + record.status],
    ["documents",documents,record => record.filename]
  ]) {
    const target = document.getElementById(name + "-list");
    target.replaceChildren();
    if (!records.length) addText(target,"p","No records yet.");
    for (const record of records) addText(target,"p",format(record));
  }
  status.textContent = "Connected to MYOPS — authenticated organization workspace.";
  workspace.hidden = false;
}
try {
  if (!ctx?.supabase || !ctx?.organizationId || !ctx?.userId)
    throw new Error("MYOPS SSO session not initialized. Open through MYOPS.");
  repository = createRentalRepository(ctx);
  await refresh();
} catch (error) { showError(error); }
document.getElementById("create-property").addEventListener("submit", async event => {
  event.preventDefault();
  if (!repository) return;
  const form = event.currentTarget;
  const values = new FormData(form);
  try {
    await repository.create("properties",{
      name:String(values.get("name") || "").trim(),
      address:String(values.get("address") || "").trim(),
      parking_spaces:0
    });
    form.reset();
    await refresh();
  } catch(error) { showError(error); }
});
