// src/routes/RequireAuth.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

const REDIRECT_GUARD_KEY = 'auth_redirect_guard_ts';
const THROTTLE_MS = 5000;

function sanitizeInternalPath(raw) {
  if (!raw) return '/homepage';
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return '/homepage';
    const p = u.pathname + u.search;
    return p === '/' ? '/homepage' : p;
  } catch {
    const p = String(raw || '/');
    return p === '/' ? '/homepage' : (p.startsWith('/') ? p : '/homepage');
  }
}

export default function RequireAuth() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const redirectingRef = useRef(false);

  const currentPathQ = useMemo(() => {
    const p = location.pathname + location.search;
    return sanitizeInternalPath(p || '/homepage');
  }, [location.pathname, location.search]);

  const hasMagicToken =
    typeof window !== 'undefined' &&
    /(^|[&#?])token=/.test(String(window.location.hash || ''));

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
      // ดีบักถ้าจำเป็น:
      // console.log('[RequireAuth]', { path: location.pathname, hasToken: hasMagicToken, hasUser: !!u });
    });
    return () => off();
  }, [location.pathname, hasMagicToken]);

  if (!ready) {
    return <div style={{ padding: 16 }}>กำลังตรวจสอบการเข้าสู่ระบบ…</div>;
  }

  if (!user) {
    // ระหว่าง AuthGate กิน #token → แสดง Loader กันหน้าขาว
    if (hasMagicToken) {
      return <div style={{ padding: 16 }}>กำลังเข้าสู่ระบบ…</div>;
    }

    // กัน redirect รัว (คง logic เดิม)
    if (redirectingRef.current) return null;
    const last = Number(sessionStorage.getItem(REDIRECT_GUARD_KEY) || 0);
    const now = Date.now();
    if (now - last < THROTTLE_MS) return null;

    redirectingRef.current = true;
    sessionStorage.setItem(REDIRECT_GUARD_KEY, String(now));

    const url = new URL('/auth/line/start', window.location.origin);
    url.searchParams.set('next', currentPathQ);
    url.searchParams.set('to', 'accounts');
    window.location.replace(url.toString());

    // แสดงข้อความคั่นระหว่าง redirect (กันหน้าขาว)
    return <div style={{ padding: 16 }}>กำลังพาไปล็อกอิน LINE…</div>;
  }


  return <Outlet />;
}
