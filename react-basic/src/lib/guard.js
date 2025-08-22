// src/lib/guard.js
export function loginRedirect(next) {
  const n = encodeURIComponent(next || (location.pathname + location.search));
  location.href = `/auth/line/start?next=${n}`;
}

export function guardedNavigate(navigate, to, { user, tenantId, requireTenant = true } = {}) {
  const next = location.pathname + location.search;
  if (!user) return loginRedirect(next);
  if (requireTenant && !tenantId) return navigate('/accounts', { replace: true });
  return navigate(to);
}

export function guardedAction(action, { user, tenantId, requireTenant = true } = {}) {
  const next = location.pathname + location.search;
  if (!user) return loginRedirect(next);
  if (requireTenant && !tenantId) return (window.location.href = '/accounts');
  return action();
}
