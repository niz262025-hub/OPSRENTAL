import test from 'node:test';
import assert from 'node:assert/strict';
import { myopsOrigin } from '../api/sso/myops-origin.js';

const staging = 'https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app';
test('production uses only the canonical production broker', () => {
  assert.equal(myopsOrigin({ VERCEL_ENV: 'production' }), 'https://www.myops.com.my');
  assert.throws(() => myopsOrigin({ VERCEL_ENV: 'production', MYOPS_API_ORIGIN: staging }));
});
test('preview fails closed unless the approved staging broker is configured', () => {
  assert.throws(() => myopsOrigin({ VERCEL_ENV: 'preview' }));
  assert.throws(() => myopsOrigin({ VERCEL_ENV: 'preview', MYOPS_API_ORIGIN: 'https://www.myops.com.my' }));
  assert.throws(() => myopsOrigin({ VERCEL_ENV: 'preview', MYOPS_API_ORIGIN: 'https://evil.example' }));
  assert.equal(myopsOrigin({ VERCEL_ENV: 'preview', MYOPS_API_ORIGIN: staging + '/' }), staging);
});

test('Central #105 is trusted as an exact staging broker origin', () => {
  const origin = 'https://southerndotcom-website-git-fix-stagi-3dae88-mohd-syaiful-nizam1.vercel.app';
  assert.equal(myopsOrigin({ VERCEL_ENV: 'preview', MYOPS_API_ORIGIN: origin }), origin);
  assert.throws(() => myopsOrigin({ VERCEL_ENV: 'preview', MYOPS_API_ORIGIN: origin + '.example' }));
  assert.throws(() => myopsOrigin({ VERCEL_ENV: 'production', MYOPS_API_ORIGIN: origin }));
});
