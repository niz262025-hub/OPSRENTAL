import { createPrivateKey, randomBytes, createHash, sign } from "node:crypto";
const TICKET = /^[A-Za-z0-9_-]{43}$/;
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}
function signedRequest(ticket, privateKey, clock = Date.now, nonceFactory = () => randomBytes(24).toString("base64url")) {
  if (!TICKET.test(ticket)) throw new Error("invalid_ticket");
  const body = { ticket };
  const timestamp = String(clock());
  const nonce = nonceFactory();
  const path = "/api/app/redeem";
  const digest = createHash("sha256").update(canonicalJson(body)).digest("hex");
  const message = `POST\n${path}\nopsrental\ncurrent\n${timestamp}\n${nonce}\n${digest}`;
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("invalid_key");
  const signature = sign(null, Buffer.from(message), key).toString("base64url");
  return { body, headers: { "content-type": "application/json", "x-myops-app-id": "opsrental", "x-myops-key-version": "current", "x-myops-timestamp": timestamp, "x-myops-nonce": nonce, "x-myops-signature": signature } };
}
export { signedRequest, canonicalJson };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && new URL(origin).host !== host) return res.status(403).json({ error: "Origin denied" });
  const ticket = req.body?.ticket;
  if (typeof ticket !== "string" || !TICKET.test(ticket) || Object.keys(req.body || {}).length !== 1) return res.status(400).json({ error: "Invalid ticket" });
  if (!process.env.MYOPS_APP_PRIVATE_KEY) return res.status(503).json({ error: "SSO signing not configured" });
  try {
    const signed = signedRequest(ticket, process.env.MYOPS_APP_PRIVATE_KEY);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let upstream;
    try {
      upstream = await fetch("https://www.myops.com.my/api/app/redeem", {
        method: "POST", headers: signed.headers, body: JSON.stringify(signed.body), signal: controller.signal
      });
    } finally { clearTimeout(timeout); }
    if (!upstream.ok) return res.status(upstream.status === 401 || upstream.status === 403 ? upstream.status : 503).json({ error: "MYOPS ticket rejected or unavailable" });
    const payload = await upstream.json();
    if (payload.product !== "opsrental" || !payload.session_id || !payload.user_ref) throw new Error("invalid_response");
    // This proves central app entitlement only. It is NOT a Supabase Auth session.
    // Never expose a service-role token or treat user_ref as a database user ID.
    return res.status(200).json({ verified: true, product: payload.product, session_id: payload.session_id, user_ref: payload.user_ref, idle_seconds: payload.idle_seconds });
  } catch { return res.status(503).json({ error: "SSO redemption unavailable" }); }
}
