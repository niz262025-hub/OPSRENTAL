import test from "node:test";
import assert from "node:assert/strict";
import { completeRentalCallback } from "../src/myops-callback.js";

function client({ userId = "11111111-1111-4111-8111-111111111111", membership = true } = {}) {
  const organizationId = "22222222-2222-4222-8222-222222222222";
  return {
    organizationId,
    supabase: {
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
      from(table) {
        assert.equal(table, "myops_memberships");
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: membership ? { organization_id: organizationId, status: "active" } : null, error: null }; }
        };
      }
    }
  };
}
test("callback rejects missing auth", async () => {
  await assert.rejects(completeRentalCallback(client({userId:null})), /login required/);
});
test("callback rejects missing organization membership", async () => {
  await assert.rejects(completeRentalCallback(client({membership:false})), /access denied/);
});
test("callback requires a real Supabase client", async () => {
  await assert.rejects(completeRentalCallback({supabase:null,organizationId:"a"}), /Missing authenticated/);
});
