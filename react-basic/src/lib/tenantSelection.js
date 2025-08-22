// src/lib/tenantSelection.js
export function clearActiveTenantSelection() {
  try {
    localStorage.removeItem('activeTenantId');
  } catch {}
  // ตัด ?tenant= ออกจาก URL ปัจจุบัน
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('tenant');
    window.history.replaceState(null, '', url.pathname + url.search);
  } catch {}
}
