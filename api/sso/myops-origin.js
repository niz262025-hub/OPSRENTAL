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
