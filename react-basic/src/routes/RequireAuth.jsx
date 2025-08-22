// src/routes/RequireAuth.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

const REDIRECT_GUARD_KEY = 'auth_redirect_guard_ts';
const THROTTLE_MS = 5000;

/** อนุญาตเฉพาะเส้นทางภายในเว็บ (กัน open redirect) */
function sanitizeInternalPath(raw) {
  if (!raw) return '/homepage';
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return '/homepage';
    const pathq = u.pathname + u.search;
    // ถ้าเป็นหน้าแรก ให้เปลี่ยนเป็น /homepage เพื่อไม่ย้อนกลับไปแลนดิ้ง
    return pathq === '/' ? '/homepage' : pathq;
  } catch {
    // raw เป็น path ตรง ๆ
    const p = String(raw);
    if (!p.startsWith('/')) return '/homepage';
    return p === '/' ? '/homepage' : p;
  }
}

export default function RequireAuth() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const redirectingRef = useRef(false);

  // เส้นทางปัจจุบัน (รวม query) สำหรับส่งกลับหลังล็อกอิน
  const currentPathQ = useMemo(() => {
    const p = location.pathname + location.search;
    return sanitizeInternalPath(p || '/homepage');
  }, [location.pathname, location.search]);

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
      // console.log('[RequireAuth] state:', !!u, 'next=', currentPathQ);
    });
    return () => off();
  }, [currentPathQ]);

  if (!ready) return null;

  if (!user) {
    // กัน redirect รัวๆ: throttle ด้วย sessionStorage + ref
    if (redirectingRef.current) return null;
    const last = Number(sessionStorage.getItem(REDIRECT_GUARD_KEY) || 0);
    const now = Date.now();
    if (now - last < THROTTLE_MS) return null;

    redirectingRef.current = true;
    sessionStorage.setItem(REDIRECT_GUARD_KEY, String(now));

    // ส่งไป LINE Login: ให้ AuthGate พาเข้า /accounts เสมอ แล้วค่อยเด้งกลับ next
    const url = new URL('/auth/line/start', window.location.origin);
    url.searchParams.set('next', currentPathQ); // กลับมาหน้าก่อนล็อกอิน (ยกเว้น / -> /homepage)
    url.searchParams.set('to', 'accounts');

    // ใช้ replace เพื่อลดประวัติใน back stack
    window.location.replace(url.toString());
    return null;
  }

  return <Outlet />;
}
