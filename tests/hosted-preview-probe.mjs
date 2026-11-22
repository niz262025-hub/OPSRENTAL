import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const target = new URL('https://opsrental-staging-et3z6toq6-mohd-syaiful-nizam1.vercel.app/api/rental/documents');
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!secret) throw new Error('Existing scoped Preview automation secret is unavailable.');

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
    await context.close();
  }
}

const browser = await chromium.launch();
try {
  await Promise.all([probe(browser, 'A'), probe(browser, 'B')]);
  console.log('Authenticated tests blocked pending approved staging fixture sign-in.');
} catch {
  console.error('Protected Preview probe failed. Check the sanitized HTTP evidence above.');
  process.exitCode = 1;
} finally {
  await browser.close();
}
