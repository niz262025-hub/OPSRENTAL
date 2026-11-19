import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TENANT,
  MemoryStorage,
  clearAllSessions,
  getNavigation,
  getSession,
  readSessionState,
  requireSession,
  setSession,
} from './app.js';

test('satellite apps include Back to MYOPS and no local Logout control', () => {
  const nav = getNavigation('opsrental', '/admin/dashboard');

  assert.deepEqual(nav.map((entry) => entry.label), ['Back to MYOPS']);
  assert.equal(nav.some((entry) => entry.label === 'Logout'), false);
  assert.equal(nav[0].href, 'https://www.myops.com.my');
});

test('master app exposes logout and global invalidation clears every app session', () => {
  const storage = new MemoryStorage();

  setSession('myops-master', { userRole: 'admin', tenantId: 'tenant-1001', expiresAt: Date.now() + 5_000 }, storage);
  setSession('opsrental', { userRole: 'admin', tenantId: 'tenant-1001', expiresAt: Date.now() + 5_000 }, storage);

  const masterNav = getNavigation('myops-master', '/admin/dashboard');

  assert.deepEqual(masterNav.map((entry) => entry.label), ['Logout']);

  clearAllSessions(storage);

  const state = readSessionState(storage);
  assert.deepEqual(state.appSessions, {});
  assert.equal(getSession('myops-master', storage), null);
  assert.equal(getSession('opsrental', storage), null);
});

test('expired sessions and tenant mismatch redirect to a safe login page', () => {
  const storage = new MemoryStorage();

  setSession('opsrental', {
    userRole: 'admin',
    tenantId: DEFAULT_TENANT,
    expiresAt: Date.now() - 1,
  }, storage);

  const expired = requireSession({ appId: 'opsrental', route: '/admin/dashboard', userRole: 'admin', tenantId: DEFAULT_TENANT });
  assert.equal(expired.allowed, false);
  assert.equal(expired.redirect, '/login');

  setSession('opsrental', {
    userRole: 'customer',
    tenantId: 'tenant-999',
    expiresAt: Date.now() + 60_000,
  }, storage);

  const tenantMismatch = requireSession({
    appId: 'opsrental',
    route: '/customer/dashboard',
    userRole: 'customer',
    tenantId: DEFAULT_TENANT,
  });

  assert.equal(tenantMismatch.allowed, false);
  assert.equal(tenantMismatch.redirect, '/login');
});

test('admin and customer roles keep route access consistent with tenant scope', () => {
  const storage = new MemoryStorage();

  setSession('opsrental', {
    userRole: 'admin',
    tenantId: DEFAULT_TENANT,
    expiresAt: Date.now() + 60_000,
  }, storage);

  const adminAllowed = requireSession({
    appId: 'opsrental',
    route: '/admin/dashboard',
    userRole: 'admin',
    tenantId: DEFAULT_TENANT,
    storage,
  });

  assert.equal(adminAllowed.allowed, true);

  setSession('opsrental', {
    userRole: 'customer',
    tenantId: DEFAULT_TENANT,
    expiresAt: Date.now() + 60_000,
  }, storage);

  const customerAllowed = requireSession({
    appId: 'opsrental',
    route: '/customer/dashboard',
    userRole: 'customer',
    tenantId: DEFAULT_TENANT,
    storage,
  });

  assert.equal(customerAllowed.allowed, true);
});
