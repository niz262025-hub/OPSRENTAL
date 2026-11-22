import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import handler from '../api/sso/session.js';

test('only explicit same-origin Preview activity touches a live entitled session', async () => {
  const previousEnv = process.env;
  const previousFetch = globalThis.fetch;
  const secret = 'fixture-key-'.repeat(4);
  const { privateKey } = generateKeyPairSync('ed25519');
  process.env = { ...previousEnv, VERCEL_ENV: 'preview', MYOPS_RENTAL_ACTIVITY_PREVIEW: 'true',
    MYOPS_RENTAL_SESSION_SECRET: secret, MYOPS_RENTAL_ACCESS_DISABLED: 'false',
    MYOPS_API_ORIGIN: 'https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app',
    MYOPS_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const body = Buffer.from(JSON.stringify({ sid: '11111111-1111-4111-8111-111111111111', exp: Date.now()+60000 })).toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  const headers = { host: 'example.test', origin: 'https://example.test', 'sec-fetch-site': 'same-origin',
    cookie: `__Host-opsrental-session=${body}.${mac}` };
  const activities = [];
  let active = true;
  let mode = 'paid';
  globalThis.fetch = async (_url, req) => {
    activities.push(JSON.parse(req.body).activity);
    return { ok: true, json: async () => ({ entitled: active, session_active: active, access_mode: mode }) };
  };
  async function request(method, extra = {}) {
    const res = { setHeader() {}, status(code) { this.code = code; return this; },
      json(value) { this.value = value; return this; } };
    await handler({ method, headers: { ...headers, ...extra } }, res);
    return res;
  }
  try {
    assert.equal((await request('POST', { origin: 'https://other.test' })).code, 403);
    assert.equal((await request('POST', { cookie: '' })).code, 401);
    assert.deepEqual(activities, []);
    assert.equal((await request('GET')).value.activity_enabled, true);
    assert.equal((await request('POST')).code, 200);
    assert.deepEqual(activities.splice(0), [false, false, true]);
    active = false;
    assert.equal((await request('POST')).code, 403);
    assert.deepEqual(activities.splice(0), [false]);
    active = true;
    mode = 'trial';
    assert.equal((await request('POST')).code, 403);
    assert.deepEqual(activities.splice(0), [false]);
    process.env.VERCEL_ENV = 'production';
    assert.equal((await request('POST')).code, 405);
    assert.deepEqual(activities, []);
  } finally {
    process.env = previousEnv;
    globalThis.fetch = previousFetch;
  }
});
