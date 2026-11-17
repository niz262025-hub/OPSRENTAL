/* OpsRental central-login readiness gate.
 * The MYOPS central login uses server-managed sessions. Never infer authorization
 * from localStorage, query strings, a user-supplied email, or an unverified JWT.
 * A trusted server-side session bridge must implement GET /api/myops/session.
 */
async function verifyMyopsSession(fetchImpl = fetch) {
  const response = await fetchImpl("/api/myops/session", {
    method: "GET", credentials: "include", cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("MYOPS session unavailable");
  const payload = await response.json();
  if (payload?.authenticated !== true ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(payload.organization_id || "") ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(payload.user_id || "")) {
    throw new Error("MYOPS identity or organization not verified");
  }
  return { userId: payload.user_id, organizationId: payload.organization_id, role: payload.role };
}
if (typeof module !== "undefined") module.exports = { verifyMyopsSession };
