import { rentalDatabaseUrl } from './db-config.js';


export function trialMutationPreviewEnabled() {
  return process.env.VERCEL_ENV === 'preview' && process.env.MYOPS_RENTAL_TRIAL_MUTATION_UAT === 'true';
}

export async function trialMutation(rpc, args, res) {
  const key = process.env.MYOPS_RENTAL_SERVICE_ROLE_KEY;
  if (!trialMutationPreviewEnabled() || !key) throw new Error('Trial mutation unavailable');
  const response = await fetch(new URL('/rest/v1/rpc/' + rpc, rentalDatabaseUrl()), {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (response.ok && result && typeof result === "object" && !Array.isArray(result) && result.error !== 'trial_limit_reached') return result;
  if (result?.error === 'trial_limit_reached') res.status(429).json({ error: 'Trial limit reached' });
  else if (result?.code === '42501') res.status(403).json({ error: 'Trial access denied' });
  else if (result?.code === '23505') res.status(409).json({ error: 'Operation ID already used' });
  else if (['22023', '23502', '23503', '23514'].includes(result?.code)) {
    res.status(400).json({ error: 'Invalid trial operation' });
  } else throw new Error('Trial mutation unavailable');
  return null;
}
