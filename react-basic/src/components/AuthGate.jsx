import { useEffect } from 'react';
import { onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';

function sanitizeNext(raw) {
  if (!raw) return '/';
  try {
    const s = String(raw).trim();
    if (s.startsWith('#/')) return s;   // HashRouter
    if (s.startsWith('/')) return s;    // BrowserRouter
    return '/';
  } catch { return '/'; }
}

function readTokenAndNext() {
  const q = new URLSearchParams(window.location.search);
  const mt   = q.get('mt');
  const next = q.get('next');
  const to   = q.get('to');
  if (mt) return { token: mt, next: sanitizeNext(next || '/'), to: to || undefined, from: 'query' };

  const hash  = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  const token = hash.get('token');
  const hNext = sanitizeNext(hash.get('next') || '/');
  const hTo   = hash.get('to') || undefined;
  if (token) return { token, next: hNext, to: hTo, from: 'hash' };

  return { token: null, next: '/', to: undefined, from: 'none' };
}

export default function AuthGate() {
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const { token, next, from } = readTokenAndNext();

      if (!token) return;

      // แจ้งให้ RequireAuth รู้ว่าเรากำลังจัดการ mt อยู่
      window.__AUTHGATE_SEEN_MT = true;
      window.__AUTHGATE_BUSY = true;

      try {
        await signInWithCustomToken(auth, token);

        // รอ onAuthStateChanged ยิงอย่างน้อย 1 ครั้ง (กัน timing iOS)
        await new Promise((resolve) => {
          let fired = false;
          unsub = onAuthStateChanged(auth, (u) => {
            if (!fired && u) { fired = true; resolve(); }
          });
          // iOS LINE ช้าบ่อย: ขยายเป็น 5000ms
          setTimeout(() => { if (!fired) resolve(); }, 5000);
        });

        // บอกว่าเพิ่ง auth สำเร็จ (ให้ RequireAuth ผ่อนผันต่ออีกนิด)
        const now = Date.now();
        sessionStorage.setItem('__authed', '1');
        sessionStorage.setItem('__AUTHGATE_DONE_AT', String(now));
        await new Promise(r => setTimeout(r, 120));
      } catch (e) {
        console.error('[AuthGate] signInWithCustomToken error:', e);
        // เคลียร์ query/hash ทิ้งเพื่อกันวนลูป
        window.history.replaceState(null, '', window.location.pathname);
        return;
      } finally {
        try { unsub(); } catch {}
        window.__AUTHGATE_BUSY = false;
      }

      // เคลียร์ query/hash แล้วค่อยไป next
      window.history.replaceState(null, '', window.location.pathname);

      if (next.startsWith('#/')) {
        if (window.location.hash !== next) window.location.hash = next;
        return;
      }

      const current = window.location.pathname + window.location.search;
      if (next !== current) {
        window.location.replace(next);
      }
    })();

    return () => { try { unsub(); } catch {} };
  }, []);

  return null;
}
