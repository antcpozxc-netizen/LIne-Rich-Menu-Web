import { useEffect } from 'react';
import { onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';

/** อนุญาตเฉพาะเส้นทางภายในเว็บ (กัน open redirect) + รองรับ HashRouter */
function sanitizeNext(raw) {
  if (!raw) return '/';
  try {
    // รองรับทั้ง "/app/..", "app/..", "#/app/.."
    const s = String(raw).trim();

    // hash-router (#/...) → คืนค่าพร้อม hash
    if (s.startsWith('#/')) return s;

    // path ปกติ → ต้องขึ้นต้นด้วย /
    if (s.startsWith('/')) return s;

    return '/';
  } catch {
    return '/';
  }
}

export default function AuthGate() {
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const token = hash.get('token');          // Firebase custom token
      const rawNext = hash.get('next') || '/';
      const to = hash.get('to');                // "accounts" | undefined
      const next = sanitizeNext(rawNext);

      console.log('[AuthGate] token?', !!token, 'next=', next, 'rawHash=', window.location.hash);

      if (!token) return;

      try {
        await signInWithCustomToken(auth, token);
        // 👉 รอให้ auth ติดจริงก่อน
        await new Promise((resolve, reject) => {
          let done = false;
          unsub = onAuthStateChanged(
            auth,
            (u) => {
              if (!done && u) {
                done = true;
                resolve();
              }
            },
            reject
          );
          // กันเงียบ: time-out 3s ยังไงก็ไปต่อ
          setTimeout(() => {
            if (!done) resolve();
          }, 3000);
        });
      } catch (e) {
        console.error('signInWithCustomToken error:', e);
        // ล้าง hash ทิ้งเพื่อกันค้างบน URL
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      } finally {
        try { unsub(); } catch {}
      }

      // ล้าง fragment ออกจาก URL (กัน loop และสวยงาม)
      window.history.replaceState(null, '', window.location.pathname + window.location.search);

      // กำหนดปลายทาง:
      // - ถ้ามี to=accounts → ไปหน้าเลือก OA พร้อม next ต่อ
      // - ไม่งั้นไป next ตรง ๆ
      const target = to === 'accounts'
        ? `/accounts?next=${encodeURIComponent(next)}`
        : next;

      // ถ้าเป็น HashRouter (target เริ่มด้วย "#/") → ใช้ location.hash
      if (target.startsWith('#/')) {
        if (window.location.hash !== target) window.location.hash = target;
        return;
      }

      // BrowserRouter ปกติ
      const current = window.location.pathname + window.location.search;
      if (target !== current) window.location.replace(target);
    })();

    return () => { try { unsub(); } catch {} };
  }, []);

  return null;
}
