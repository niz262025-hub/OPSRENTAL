import test from 'node:test';
import assert from 'node:assert/strict';
import { rentalDatabaseUrl } from '../api/rental/db-config.js';

test('preview refuses production, unknown, and malformed database URLs', () => {
  for (const url of ['https://uhuukcztdifvpjuopdea.supabase.co','https://other.supabase.co','https://wengxxiqwtosirealghx.supabase.co.evil.test','']) {
    assert.throws(() => rentalDatabaseUrl({ VERCEL_ENV:'preview', MYOPS_RENTAL_SUPABASE_URL:url }));
  }
  assert.equal(rentalDatabaseUrl({ VERCEL_ENV:'preview', MYOPS_RENTAL_SUPABASE_URL:'https://wengxxiqwtosirealghx.supabase.co' }), 'https://wengxxiqwtosirealghx.supabase.co');
});
test('production preserves its configured valid project URL', () => {
  assert.equal(rentalDatabaseUrl({ VERCEL_ENV:'production', MYOPS_RENTAL_SUPABASE_URL:'https://uhuukcztdifvpjuopdea.supabase.co' }), 'https://uhuukcztdifvpjuopdea.supabase.co');
});
