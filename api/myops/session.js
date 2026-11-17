/* This endpoint deliberately fails closed.
 * MYOPS uses signed server-side app tickets via /api/app/redeem and
 * /api/app/entitlement, not a browser-trusted identity object.
 * Do not return authenticated:true until the signed app-ticket handshake,
 * session revocation, and organization membership are verified server-side.
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  return res.status(503).json({ authenticated: false, error: "myops_sso_bridge_not_configured" });
}
