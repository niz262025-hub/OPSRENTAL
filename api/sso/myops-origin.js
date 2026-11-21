const PRODUCTION = 'https://www.myops.com.my';
const STAGING = 'https://southerndotcom-website-git-feat-myop-ca0019-mohd-syaiful-nizam1.vercel.app';

// Preview must never send tickets or session checks to the production broker.
export function myopsOrigin(env = process.env) {
  const configured = (env.MYOPS_API_ORIGIN || '').replace(/\/$/, '');
  if (env.VERCEL_ENV === 'production') {
    if (configured && configured !== PRODUCTION) throw new Error('Invalid production MYOPS origin');
    return PRODUCTION;
  }
  if (configured !== STAGING) throw new Error('Staging MYOPS origin not configured');
  return STAGING;
}
