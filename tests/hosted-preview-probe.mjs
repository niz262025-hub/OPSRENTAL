import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const target = new URL('https://opsrental-staging-et3z6toq6-mohd-syaiful-nizam1.vercel.app/api/rental/documents');
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!secret) throw new Error('Existing scoped Preview automation secret is unavailable.');

const central = 'https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app';
const fixtures = ['A', 'B'].map(label => ({
  label,
  email: process.env[`OPSRENTAL_UAT_ORG_${label}_EMAIL`],
  password: process.env[`OPSRENTAL_UAT_ORG_${label}_PASSWORD`],
}));

async function authenticatedLaunch(browser, fixture) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await context.route(url => url.origin === target.origin, async route => {
      const response = await route.fetch({
        headers: { ...route.request().headers(), 'x-vercel-protection-bypass': secret },
        maxRedirects: 0,
      });
      await route.fulfill({ response });
    });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin !== target.origin) return;
      const path = ['/launch', '/api/sso/redeem', '/api/sso/session', '/api/rental/documents'].includes(url.pathname)
        ? url.pathname : 'other';
      console.log(JSON.stringify({ context: fixture.label, path, status: response.status(),
        redirectHop: !!response.request().redirectedFrom(), serviceWorker: response.fromServiceWorker() }));
    });
    const centralProtection = process.env.OPSRENTAL_UAT_CENTRAL_PREVIEW_SECRET;
    console.log(JSON.stringify({ context: fixture.label, centralProtectionConfigured: Boolean(centralProtection) }));
    const headers = { origin: central, 'content-type': 'application/json',
      ...(centralProtection ? { 'x-vercel-protection-bypass': centralProtection } : {}) };
    async function authRequest(action, payload) {
      const response = await context.request.post(central + '/api/auth', {
        headers, data: { action, ...payload }, maxRedirects: 0,
      });
      let outcome = 'ok';
      if (!response.ok()) {
        const body = await response.json().catch(() => null);
        if (body?.error === 'Invalid credentials or email not confirmed.') {
          outcome = 'application_login_rejected';
        } else if (response.status() === 401 && body?.message === 'Protected by Vercel Authentication') {
          outcome = 'vercel_deployment_protection_denied';
        } else if (response.status() === 401 && !body) {
          outcome = 'non_json_unauthorized';
        } else {
          outcome = 'request_rejected';
        }
      }
      console.log(JSON.stringify({ context: fixture.label, action, status: response.status(), outcome }));
      assert.equal(response.status(), 200);
      return response;
    }
    await authRequest('session', { activity: false });
    await authRequest('login', { email: fixture.email, password: fixture.password });
    const launch = await authRequest('launch', { product: 'opsrental' });
    const destination = new URL((await launch.json()).next);
    assert.ok(destination.origin === target.origin && destination.pathname === '/launch' && !destination.search);
    const session = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.origin === target.origin && url.pathname === '/api/sso/session';
    });
    const [, verified] = await Promise.all([page.goto(destination.href), session]);
    assert.equal(verified.status(), 200);
    const result = await verified.json();
    assert.ok(result.authenticated === true && result.product === 'opsrental');
    console.log(`${fixture.label}: authenticated Central launch verified`);
  } catch {
    throw new Error(`${fixture.label}: authenticated launch failed; see status-only evidence`);
  } finally {
    await context.unrouteAll({ behavior: 'wait' });
    await context.close();
  }
}

async function probe(browser, label) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await context.route(target.toString(), async route => {
      const response = await route.fetch({
        headers: { ...route.request().headers(), 'x-vercel-protection-bypass': secret },
        maxRedirects: 0,
      });
      await route.fulfill({ response });
    });
    page.on('response', response => {
      const url = new URL(response.url());
      console.log(JSON.stringify({
        context: label, layer: url.origin === target.origin ? 'preview' : 'external',
        status: response.status(), redirectHop: !!response.request().redirectedFrom(),
        serviceWorker: response.fromServiceWorker(),
      }));
    });
    const response = await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
    assert.equal(response?.url(), target.toString());
    assert.equal(response.status(), 401);
    assert.deepEqual(await response.json(), { error: 'MYOPS session required' });
    console.log(`${label}: application-level signed-out denial verified`);
  } finally {
    await context.unrouteAll({ behavior: 'wait' });
    await context.close();
  }
}

const browser = await chromium.launch();
try {
  await Promise.all([probe(browser, 'A'), probe(browser, 'B')]);
  if (fixtures.every(fixture => fixture.email && fixture.password)) {
    assert.ok(fixtures[0].email.toLowerCase() !== fixtures[1].email.toLowerCase());
    const results = await Promise.allSettled(fixtures.map(fixture => authenticatedLaunch(browser, fixture)));
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') console.error(`${fixtures[index].label}: authenticated checks failed`);
    }
    assert.ok(results.every(result => result.status === 'fulfilled'));
  } else {
    console.log('BLOCKED: Missing approved Org A/B staging sign-in secrets.');
  }
} catch {
  console.error('Protected Preview probe failed. Check the sanitized HTTP evidence above.');
  process.exitCode = 1;
} finally {
  await browser.close();
}
