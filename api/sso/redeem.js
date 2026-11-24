import { rentalAccessDisabled } from '../rental/authorization.js';
import { createPrivateKey, randomBytes, createHash, sign, createHmac } from "node:crypto";
import { myopsBrokerRequest } from './myops-origin.js';
import { boundOrganizationEnabled } from './session.js';
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
  if (rentalAccessDisabled()) return res.status(503).json({error:"Rental access temporarily disabled"});
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (!["https:", "http:"].includes(parsedOrigin.protocol) || parsedOrigin.host !== host || parsedOrigin.username || parsedOrigin.password) {
        return res.status(403).json({ error: "Origin denied" });
      }
    } catch {
      return res.status(403).json({ error: "Origin denied" });
    }
  }
  const ticket = req.body?.ticket;
  if (typeof ticket !== "string" || !TICKET.test(ticket) || Object.keys(req.body || {}).length !== 1) return res.status(400).json({ error: "Invalid ticket" });
  if (!process.env.MYOPS_APP_PRIVATE_KEY) return res.status(503).json({ error: "SSO signing not configured" });
  try {
    const signed = signedRequest(ticket, process.env.MYOPS_APP_PRIVATE_KEY);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let upstream;
    try {
      const request = myopsBrokerRequest("/api/app/redeem", signed.headers);
      upstream = await fetch(request.url, {
        method: "POST", headers: request.headers, body: JSON.stringify(signed.body), redirect: request.redirect, signal: controller.signal
      });
    } finally { clearTimeout(timeout); }
    if (!upstream.ok) return res.status(upstream.status === 401 || upstream.status === 403 ? upstream.status : 503).json({ error: "MYOPS ticket rejected or unavailable" });
    const payload = await upstream.json();
    if (payload.product !== "opsrental" || !payload.session_id || !payload.user_ref) throw new Error("invalid_response");
    if (boundOrganizationEnabled() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.organization_id || '')) throw new Error('invalid_organization');
    // Bind the one-time MYOPS ticket to an opaque, HttpOnly app session.
    // The session is rechecked against MYOPS on every protected request.
    const secret = process.env.MYOPS_RENTAL_SESSION_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32 || !/^[0-9a-f-]{36}$/i.test(payload.session_id)) {
      return res.status(503).json({ error: "Session configuration unavailable" });
    }
    const body = Buffer.from(JSON.stringify({ sid: payload.session_id, exp: Date.now() + 12 * 3600000, ...(boundOrganizationEnabled() ? { org: payload.organization_id.toLowerCase() } : {}) })).toString("base64url");
    const mac = createHmac("sha256", secret).update(body).digest("base64url");
    res.setHeader("Set-Cookie", `__Host-opsrental-session=${body}.${mac}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
    return res.status(200).json({ verified: true, product: "opsrental", next: "/" });
  } catch { return res.status(503).json({ error: "SSO redemption unavailable" }); }
}
