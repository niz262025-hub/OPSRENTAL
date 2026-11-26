const productionOrigin = 'https://www.myops.com.my';
const stagingOrigin = 'https://southerndotcom-website-git-staging-p-9ff219-mohd-syaiful-nizam1.vercel.app';

export function centralOrigin(env = process.env) {
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === 'staging/production-baseline') {
    if (env.MYOPS_API_ORIGIN !== stagingOrigin || env.MYOPS_RENTAL_SUPABASE_URL !== 'https://wengxxiqwtosirealghx.supabase.co') {
      throw new Error('Isolated staging configuration required');
    }
    return stagingOrigin;
  }
  return productionOrigin;
}
