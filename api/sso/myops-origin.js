const PRODUCTION = 'https://www.myops.com.my';
const STAGING = 'https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app';
const CENTRAL_105 = 'https://southerndotcom-website-git-fix-stagi-3dae88-mohd-syaiful-nizam1.vercel.app';

// Preview must never send tickets or session checks to the production broker.
export function myopsOrigin(env = process.env) {
  const configured = (env.MYOPS_API_ORIGIN || '').replace(/\/$/, '');
  if (env.VERCEL_ENV === 'production') {
    if (configured && configured !== PRODUCTION) throw new Error('Invalid production MYOPS origin');
    return PRODUCTION;
  }
  if (configured !== STAGING && configured !== CENTRAL_105) throw new Error('Staging MYOPS origin not configured');
  return configured;
}

// Only the signed server-to-server requests use the Central Preview credential.
export function myopsBrokerRequest(path, signedHeaders, env = process.env) {
  if (path !== '/api/app/redeem' && path !== '/api/app/entitlement') {
    throw new Error('Unknown MYOPS broker endpoint');
  }
  const origin = myopsOrigin(env);
  const headers = { ...signedHeaders };
  if (env.VERCEL_ENV === 'preview' && origin === STAGING && env.MYOPS_CENTRAL_PREVIEW_BYPASS_SECRET) {
    headers['x-vercel-protection-bypass'] = env.MYOPS_CENTRAL_PREVIEW_BYPASS_SECRET;
  }
  return { url: origin + path, headers, redirect: 'error' };
}

export async function authenticateMyopsPreview(request, env = process.env, transport = fetch) {
  const share = env.MYOPS_STAGING_SHARE_TOKEN;
  if (env.VERCEL_ENV !== 'preview' || new URL(request.url).origin !== CENTRAL_105 || !share) return request;
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(share)) throw new Error('Invalid MYOPS Preview configuration');
  const bootstrapUrl = new URL(request.url);
  bootstrapUrl.searchParams.set('_vercel_share', share);
  const bootstrap = await transport(bootstrapUrl.href, {
    method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8000)
  });
  const location = bootstrap.headers.get('location');
  const cookie = bootstrap.headers.getSetCookie().find(value => value.startsWith('_vercel_jwt='))?.split(';')[0];
  if (![302, 303, 307, 308].includes(bootstrap.status) || !location
    || new URL(location, bootstrapUrl).href !== request.url || !cookie || !/^_vercel_jwt=[A-Za-z0-9._-]+$/.test(cookie)) {
    throw new Error('MYOPS Preview authentication rejected');
  }
  return { ...request, headers: { ...request.headers, Cookie: cookie } };
}
