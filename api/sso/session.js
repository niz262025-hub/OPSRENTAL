import { createHmac, timingSafeEqual, createPrivateKey, createHash, randomBytes, sign } from "node:crypto";
import { centralOrigin } from './central-origin.js';
const cookieName = "__Host-opsrental-session";
export function parseCookie(req) {
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
    return data.sid;
  } catch { return null; }
}
function canonicalJson(obj) { return JSON.stringify(Object.fromEntries(Object.entries(obj).sort(([a],[b])=>a.localeCompare(b)))); }
export async function checkEntitlement(sid) {
  const privateKey = process.env.MYOPS_APP_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing signing key");
  const path = "/api/app/entitlement";
  const body = { session_id: sid, product: "opsrental", activity: false, sensitive: false };
  const timestamp = String(Date.now()), nonce = randomBytes(24).toString("base64url");
  const digest = createHash("sha256").update(canonicalJson(body)).digest("hex");
  const message = `POST\n${path}\nopsrental\ncurrent\n${timestamp}\n${nonce}\n${digest}`;
  const signature = sign(null, Buffer.from(message), createPrivateKey(privateKey)).toString("base64url");
  const response = await fetch(centralOrigin() + path, {
    method: "POST", headers: { "content-type": "application/json", "x-myops-app-id": "opsrental",
      "x-myops-key-version": "current", "x-myops-timestamp": timestamp,
      "x-myops-nonce": nonce, "x-myops-signature": signature },
    body: canonicalJson(body), signal: AbortSignal.timeout(8000), redirect: 'error'
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.entitled === true && result.session_active === true;
}
export default async function handler(req,res) {
  res.setHeader("Cache-Control","private, no-store");
  if (req.method !== "GET") return res.status(405).json({ error:"Method not allowed" });
  const sid = parseCookie(req);
  if (!sid) return res.status(401).json({ authenticated:false });
  try {
    if (!(await checkEntitlement(sid))) return res.status(403).json({ authenticated:false });
    return res.status(200).json({ authenticated:true, product:"opsrental" });
  } catch {
    return res.status(503).json({ authenticated:false, error:"Central session verification unavailable" });
  }
}
