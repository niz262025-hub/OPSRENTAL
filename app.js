export const MYOPS_URL = 'https://www.myops.com.my';
export const MASTER_APP_ID = 'myops-master';
export const DEFAULT_TENANT = 'tenant-1001';
export const AUTH_STORAGE_KEY = 'myops-auth-state';

export class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(String(key), String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

export function getStorage() {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }

  if (!globalThis.__OPSRENTAL_MEMORY_STORAGE__) {
    globalThis.__OPSRENTAL_MEMORY_STORAGE__ = new MemoryStorage();
  }

  return globalThis.__OPSRENTAL_MEMORY_STORAGE__;
}

export function readSessionState(storage = getStorage()) {
  const raw = storage.getItem(AUTH_STORAGE_KEY) ?? '{}';

  try {
    const value = JSON.parse(raw);
    return {
      appSessions: value.appSessions ?? {},
      expiresAt: value.expiresAt ?? 0,
    };
  } catch {
    return { appSessions: {}, expiresAt: 0 };
  }
}

export function writeSessionState(state, storage = getStorage()) {
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function clearAllSessions(storage = getStorage()) {
  const state = readSessionState(storage);
  state.appSessions = {};
  state.expiresAt = Date.now();
  writeSessionState(state, storage);
  return state;
}

export function setSession(appId, options = {}, storage = getStorage()) {
  const state = readSessionState(storage);
  const session = {
    userRole: options.userRole ?? 'admin',
    tenantId: options.tenantId ?? DEFAULT_TENANT,
    expiresAt: options.expiresAt ?? Date.now() + 60 * 60 * 1000,
  };

  state.appSessions[appId] = session;
  writeSessionState(state, storage);
  return session;
}

export function getSession(appId, storage = getStorage()) {
  const state = readSessionState(storage);
  return state.appSessions[appId] ?? null;
}

export function isMasterApp(appId) {
  return appId === MASTER_APP_ID;
}

export function isSatelliteApp(appId) {
  return Boolean(appId) && !isMasterApp(appId);
}

export function createSafeRedirect(path) {
  if (!path || /^\/\//.test(path) || /^javascript:/i.test(path)) {
    return '/login';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

export function requireSession({
  appId = 'opsrental',
  route = '/admin/dashboard',
  userRole = 'admin',
  tenantId = DEFAULT_TENANT,
  storage = getStorage(),
} = {}) {
  const active = getSession(appId, storage);

  if (!active || active.expiresAt <= Date.now()) {
    return {
      allowed: false,
      redirect: createSafeRedirect('/login'),
      reason: 'missing-or-expired-session',
    };
  }

  if (active.userRole !== userRole) {
    return {
      allowed: false,
      redirect: createSafeRedirect('/login'),
      reason: 'role-mismatch',
    };
  }

  if (tenantId && active.tenantId && active.tenantId !== tenantId) {
    return {
      allowed: false,
      redirect: createSafeRedirect('/login'),
      reason: 'tenant-mismatch',
    };
  }

  if (route.includes('/admin') && active.userRole !== 'admin') {
    return {
      allowed: false,
      redirect: createSafeRedirect('/customer'),
      reason: 'admin-route-for-customer',
    };
  }

  if (route.includes('/customer') && active.userRole !== 'customer') {
    return {
      allowed: false,
      redirect: createSafeRedirect('/admin'),
      reason: 'customer-route-for-admin',
    };
  }

  return { allowed: true, redirect: null, reason: 'ok' };
}

export function getNavigation(appId = 'opsrental', route = '/admin/dashboard') {
  const items = [];

  if (isSatelliteApp(appId)) {
    items.push({
      label: 'Back to MYOPS',
      href: MYOPS_URL,
      className: 'myops-link',
      target: '_blank',
      rel: 'noopener noreferrer',
      action: 'myops',
    });
  }

  if (isMasterApp(appId)) {
    items.push({
      label: 'Logout',
      action: 'logout',
      className: 'logout-button',
    });
  }

  return items;
}

export function logoutFromMaster({ redirectTo = '/login' } = {}) {
  clearAllSessions();
  const safeRedirect = createSafeRedirect(redirectTo);

  if (typeof globalThis !== 'undefined' && globalThis.location) {
    globalThis.location.href = safeRedirect;
  }

  return { allowed: false, redirect: safeRedirect };
}

export function mountApp({
  appId = 'opsrental',
  route = '/admin/dashboard',
  userRole = 'admin',
  tenantId = DEFAULT_TENANT,
} = {}) {
  const validation = requireSession({ appId, route, userRole, tenantId });

  if (!validation.allowed) {
    return { redirect: validation.redirect, appId, route, nav: [] };
  }

  const nav = getNavigation(appId, route);

  if (typeof document === 'undefined') {
    return { redirect: null, appId, route, nav };
  }

  const app = document.getElementById('app');
  if (!app) {
    return { redirect: null, appId, route, nav };
  }

  const sectionTitle = isMasterApp(appId) ? 'MYOPS Master' : `OpsRental ${userRole}`;
  const panelCopy = isMasterApp(appId)
    ? 'Central application controls and cross-app logout.'
    : `${route.includes('/admin') ? 'Admin' : 'Customer'} dashboard with tenant-scoped access.`;

  app.innerHTML = `
    <header class="topbar">
      <nav class="nav" aria-label="Primary navigation">
        ${nav
          .map((item) => {
            if (item.action === 'logout') {
              return `<button class="nav-action ${item.className}" type="button" data-action="logout">Logout</button>`;
            }

            return `<a class="nav-action ${item.className}" href="${item.href}" target="${item.target ?? '_self'}" rel="${item.rel ?? ''}">${item.label}</a>`;
          })
          .join('')}
      </nav>
    </header>
    <main class="layout">
      <aside class="sidebar">
        <h2>${sectionTitle}</h2>
        <nav class="menu" aria-label="Section navigation">
          <a class="${route.includes('/admin') ? 'active' : ''}" href="/admin/dashboard">Admin dashboard</a>
          <a class="${route.includes('/customer') ? 'active' : ''}" href="/customer/dashboard">Customer dashboard</a>
        </nav>
      </aside>
      <section class="panel">
        <h1>${sectionTitle}</h1>
        <p>${panelCopy}</p>
        <div class="meta">
          <span>Role: ${userRole}</span>
          <span>Tenant: ${tenantId}</span>
          <span>Route: ${route}</span>
        </div>
      </section>
    </main>
  `;

  const logoutButton = app.querySelector('[data-action="logout"]');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      logoutFromMaster({ redirectTo: '/login' });
    });
  }

  return { redirect: null, appId, route, nav };
}

export default {
  MYOPS_URL,
  MASTER_APP_ID,
  DEFAULT_TENANT,
  AUTH_STORAGE_KEY,
  MemoryStorage,
  getStorage,
  readSessionState,
  writeSessionState,
  clearAllSessions,
  setSession,
  getSession,
  isMasterApp,
  isSatelliteApp,
  createSafeRedirect,
  requireSession,
  getNavigation,
  logoutFromMaster,
  mountApp,
};
