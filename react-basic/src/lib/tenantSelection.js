// src/lib/tenantSelection.js
export function clearActiveTenantSelection() {
  try {
    localStorage.removeItem('activeTenantId');
  } catch {}
  // ลบ ?tenant ออกจาก URL ปัจจุบัน (ไม่ reload หน้า)
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('tenant');
    window.history.replaceState(null, '', url.pathname + (url.search || ''));
  } catch {}
}