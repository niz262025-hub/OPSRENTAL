import test from 'node:test';
import assert from 'node:assert/strict';
import { centralOrigin } from '../api/sso/central-origin.js';

const env = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'staging/production-baseline', MYOPS_API_ORIGIN: 'https://southerndotcom-website-git-staging-p-9ff219-mohd-syaiful-nizam1.vercel.app', MYOPS_RENTAL_SUPABASE_URL: 'https://wengxxiqwtosirealghx.supabase.co' };
test('isolated baseline Preview selects only the approved Central and database', () => {
  assert.equal(centralOrigin(env), env.MYOPS_API_ORIGIN);
  for (const change of [{ MYOPS_API_ORIGIN: 'https://www.myops.com.my' }, { MYOPS_API_ORIGIN: 'https://evil.example' }, { MYOPS_RENTAL_SUPABASE_URL: 'https://uhuukcztdifvpjuopdea.supabase.co' }, { MYOPS_API_ORIGIN: '' }])
    assert.throws(() => centralOrigin({ ...env, ...change }), /Isolated staging/);
});
test('production and other branches retain existing Central routing', () => {
  assert.equal(centralOrigin({ ...env, VERCEL_ENV: 'production' }), 'https://www.myops.com.my');
  assert.equal(centralOrigin({ ...env, VERCEL_GIT_COMMIT_REF: 'other' }), 'https://www.myops.com.my');
});
