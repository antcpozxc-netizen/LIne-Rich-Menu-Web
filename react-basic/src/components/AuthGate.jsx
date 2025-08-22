// src/components/AuthGate.jsx
import { useEffect } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';

function getParams() {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const q = new URLSearchParams(window.location.search);
  // merge: #param ชนะ ?param
  const all = new URLSearchParams(q.toString());
  for (const [k, v] of h.entries()) all.set(k, v);
  return all;
}

function sanitizeNext(rawNext) {
  const def = '/';
  if (!rawNext) return def;
  try {
    // รับเฉพาะเส้นทางในโดเมนเดียวกัน ป้องกัน open-redirect
    const u = new URL(rawNext, window.location.origin);
    if (u.origin !== window.location.origin) return def;
    // กันลูป ถ้า next คือหน้า finish เอง ให้กลับบ้าน
    if (u.pathname.startsWith('/auth/line/finish')) return def;
    return u.pathname + u.search + u.hash;
  } catch {
    return def;
  }
}

export default function AuthGate() {
  useEffect(() => {
    (async () => {
      const p    = getParams();
      const token = p.get('token') || '';
      const next  = sanitizeNext(p.get('next')) || '/';
      const to    = (p.get('to') || '').toLowerCase(); // 'accounts' ได้

      try {
        if (token) {
          await signInWithCustomToken(auth, token);
          sessionStorage.setItem('auth:last', String(Date.now())); // กัน refresh ซ้ำ
        }
      } catch (e) {
        console.error('signInWithCustomToken error:', e);
      } finally {
        // ล้างทั้ง hash และ query ออกให้สะอาด
        window.history.replaceState(null, '', window.location.pathname);
        // ไปต่อ
        if (to === 'accounts') {
          window.location.replace(`/accounts?next=${encodeURIComponent(next)}`);
        } else {
          window.location.replace(next);
        }
      }
    })();
  }, []);

  return null; // ไม่แสดง UI ใด ๆ
}
