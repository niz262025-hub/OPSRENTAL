// OpsRental SSO callback bootstrap.
// MYOPS central login uses signed app tickets; this static app MUST NOT
// exchange an unsigned URL userId/organizationId for a session.
// A verified server-side ticket redemption endpoint must establish an
// authenticated Supabase session before this callback can open the workspace.
import { createRentalRepository } from "./rental-repository.js";

export async function completeRentalCallback({ supabase, organizationId }) {
  if (!supabase?.auth?.getUser) throw new Error("Missing authenticated Supabase client");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) throw new Error("MYOPS login required");
  const userId = userData.user.id;
  const { data: membership, error: membershipError } = await supabase
    .from("myops_memberships").select("organization_id,status")
    .eq("organization_id", organizationId).eq("user_id", userId)
    .eq("status", "active").maybeSingle();
  if (membershipError || !membership) throw new Error("MYOPS organization access denied");
  const repository = createRentalRepository({ supabase, organizationId, userId });
  await repository.assertSession();
  return Object.freeze({ supabase, organizationId, userId, repository });
}
