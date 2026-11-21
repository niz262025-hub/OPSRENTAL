// The staging proposal targets the isolated central-auth branch; never allow a
// preview to send a service-role key or a data request to a production project.
export function rentalDatabaseUrl(env = process.env) {
  const base = env.MYOPS_RENTAL_SUPABASE_URL;
  if (!base || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(base)) throw new Error('Database not configured');
  if (env.VERCEL_ENV !== 'production' && base.replace(/\/$/, '') !== 'https://wengxxiqwtosirealghx.supabase.co') {
    throw new Error('Isolated staging database required');
  }
  return base;
}
