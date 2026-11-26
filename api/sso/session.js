import { rentalAccessDisabled } from '../rental/authorization.js';
import { createHmac, timingSafeEqual, createPrivateKey, createHash, randomBytes, sign } from "node:crypto";
import { authenticateMyopsPreview, myopsBrokerRequest } from './myops-origin.js';
const cookieName = "__Host-opsrental-session";
export function boundOrganizationEnabled() { return process.env.VERCEL_ENV === 'preview' && process.env.MYOPS_RENTAL_ORGANIZATION_BOUND === 'true'; }
export function parseSession(req) {
  const value = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  const [body, mac, extra] = (value || "").split(".");
  const secret = process.env.MYOPS_RENTAL_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32 || extra !== undefined || !body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!/^[0-9a-f-]{36}$/i.test(data.sid) || !Number.isSafeInteger(data.exp) || data.exp <= Date.now()) return null;
    if (boundOrganizationEnabled() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.org || '')) return null;
    return { sid: data.sid, org: data.org?.toLowerCase() ?? null };
  } catch { return null; }
}
export function parseCookie(req) { return parseSession(req)?.sid ?? null; }
export function organizationMatches(session, organizationId) {
  return !boundOrganizationEnabled() || (session?.org && typeof organizationId === 'string' && session.org === organizationId.toLowerCase());
}
function canonicalJson(obj) { return JSON.stringify(Object.fromEntries(Object.entries(obj).sort(([a],[b])=>a.localeCompare(b)))); }
async function entitlementResponse(sid, organizationId, activity = false) {
  const privateKey = process.env.MYOPS_APP_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing signing key");
  const path = "/api/app/entitlement";
  const body = { session_id: sid, product: "opsrental", activity, sensitive: false,
    ...(organizationId ? { organization_id: organizationId } : {}) };
  const timestamp = String(Date.now()), nonce = randomBytes(24).toString("base64url");
  const digest = createHash("sha256").update(canonicalJson(body)).digest("hex");
  const message = `POST\n${path}\nopsrental\ncurrent\n${timestamp}\n${nonce}\n${digest}`;
  const signature = sign(null, Buffer.from(message), createPrivateKey(privateKey)).toString("base64url");
  const request = await authenticateMyopsPreview(myopsBrokerRequest(path, { "content-type": "application/json", "x-myops-app-id": "opsrental",
      "x-myops-key-version": "current", "x-myops-timestamp": timestamp,
      "x-myops-nonce": nonce, "x-myops-signature": signature }));
  const response = await fetch(request.url, {
    method: "POST", headers: request.headers, body: canonicalJson(body),
    redirect: request.redirect, signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  return response.json();
}
export async function currentEntitlementMode(sid, organizationId = null) {
  if (boundOrganizationEnabled() && !organizationId) return null;
  const result = await entitlementResponse(sid, boundOrganizationEnabled() ? organizationId : null);
  if (result?.entitled !== true || result.session_active !== true) return null;
  if (boundOrganizationEnabled() && result.organization_id !== organizationId) return null;
  return result.access_mode ?? 'paid';
}
export async function checkEntitlement(sid, organizationId = null) {
  // General access remains closed to trial sessions while isolated mutations are tested.
  const mode = await currentEntitlementMode(sid, organizationId);
  return mode !== null && mode !== 'trial';
}
export async function checkScopedAdmin(sid, organizationId) {
  const result = await entitlementResponse(sid, organizationId);
  return result?.entitled === true && result.session_active === true &&
    result.access_mode === 'admin' && result.organization_id === organizationId;
}
function previewActivityEnabled() {
  return process.env.VERCEL_ENV === 'preview' && process.env.MYOPS_RENTAL_ACTIVITY_PREVIEW === 'true';
}
export default async function handler(req,res) {
  res.setHeader("Cache-Control","private, no-store");
  if (rentalAccessDisabled()) return res.status(503).json({error:"Rental access temporarily disabled"});
  const activity = req.method === "POST";
  if (req.method !== "GET" && (!activity || !previewActivityEnabled())) {
    return res.status(405).json({ error:"Method not allowed" });
  }
  if (activity && (req.headers.origin !== `https://${req.headers.host}`
      || req.headers['sec-fetch-site'] !== 'same-origin')) {
    return res.status(403).json({ authenticated:false });
  }
  const session = parseSession(req), sid = session?.sid;
  if (!sid) return res.status(401).json({ authenticated:false });
  try {
    if (!(await checkEntitlement(sid, session.org))) return res.status(403).json({ authenticated:false });
    if (activity) {
      const touched = await entitlementResponse(sid, boundOrganizationEnabled() ? session.org : undefined, true);
      if (touched?.entitled !== true || touched.session_active !== true || touched.access_mode === 'trial' || (boundOrganizationEnabled() && touched.organization_id !== session.org)) {
        return res.status(403).json({ authenticated:false });
      }
    }
    return res.status(200).json({ authenticated:true, product:"opsrental",
      ...(previewActivityEnabled() ? { activity_enabled: true } : {}) });
  } catch {
    return res.status(503).json({ authenticated:false, error:"Central session verification unavailable" });
  }
}
