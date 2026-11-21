// Broker entitlement is product-wide; it does not identify the entitled
// organization. Check the selected organization separately before privileged
// service-role queries. Unknown or incomplete entitlement state fails closed.
export async function organizationEntitled(lookup, userId, organizationId, now = Date.now()) {
  const [grants, subscriptions, lifetime] = await Promise.all([
    lookup('myops_app_grants', {user_id:userId, organization_id:organizationId, product_slug:'opsrental'}),
    lookup('myops_subscriptions', {organization_id:organizationId}),
    lookup('myops_lifetime_entitlements', {user_id:userId}),
  ]);
  if (![grants, subscriptions, lifetime].every(Array.isArray)) return false;
  if (lifetime.some(x => x.user_id === userId && x.status === 'active' && x.scope === 'all_apps')) return true;
  const grant = grants.some(x => x.user_id === userId && x.organization_id === organizationId && x.product_slug === 'opsrental');
  return grant && subscriptions.some(x => x.organization_id === organizationId && !x.personal_user_id && x.status === 'active' &&
    (x.is_complete_bundle === true || x.product_slug === 'opsrental') &&
    (!x.current_period_end || Date.parse(x.current_period_end) > now));
}
export function rentalAccessDisabled(env = process.env) { return env.MYOPS_RENTAL_ACCESS_DISABLED === 'true'; }
