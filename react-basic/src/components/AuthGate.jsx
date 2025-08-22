import { useEffect } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';

/** อนุญาตเฉพาะเส้นทางภายในเว็บ (กัน open redirect) */
function sanitizeNext(raw) {
  if (!raw) return '/';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    // คืนค่าเป็น path + query + hash ของภายในเท่านั้น
    return url.pathname + url.search + url.hash;
  } catch {
    // กรณีส่งมาเป็น path เฉย ๆ เช่น "/accounts?x=1"
    return String(raw).startsWith('/') ? raw : '/';
  }
}

export default function AuthGate() {
  useEffect(() => {
    (async () => {
      // ตัวอย่าง URL: https://app/#token=...&next=/accounts&to=accounts
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const token = hash.get('token');      // Firebase custom token
      console.log('[AuthGate] token?', !!token, 'rawHash=', window.location.hash);
      const rawNext = hash.get('next') || '/';
      const to = hash.get('to');            // "accounts" | undefined
      const next = sanitizeNext(rawNext);

      if (!token) return; // ไม่ทำอะไรถ้าไม่มี token

      try {
        await signInWithCustomToken(auth, token);
      } catch (e) {
        console.error('signInWithCustomToken error:', e);
        // ล้าง hash ทิ้งเพื่อกันค้างบน URL
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }

      // ล้าง fragment ออกจาก URL (กัน loop และสวยงาม)
      window.history.replaceState(null, '', window.location.pathname + window.location.search);

      // กำหนดปลายทาง:
      // - ถ้ามี to=accounts → ไปหน้าเลือก OA พร้อม next ต่อ
      // - ไม่งั้นไป next ตรง ๆ
      const target = to === 'accounts'
        ? `/accounts?next=${encodeURIComponent(next)}`
        : next;

      // กัน redirect ซ้ำกับ path ปัจจุบัน
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (target !== current) {
        window.location.replace(target);
      }
    })();
  }, []);

  return null;
}
