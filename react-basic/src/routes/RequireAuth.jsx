// src/routes/RequireAuth.jsx
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

export default function RequireAuth() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // เส้นทางปัจจุบัน (รวม query) สำหรับส่งกลับหลังล็อกอิน
  const currentPathQ = useMemo(() => {
    const p = location.pathname + location.search;
    return p || '/';
  }, [location.pathname, location.search]);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
      console.log('[RequireAuth] auth state:', !!u, 'path=', currentPathQ);
    });
  }, [currentPathQ]);

  if (!ready) {
    return (
      <div style={{ padding: 24 }}>
        <b>Checking sign-in…</b>
      </div>
    );
  }

  // ถ้ายังไม่ได้ล็อกอิน → เด้งไป LINE Login พร้อม next และ to=accounts
  if (!user) {
    const url = new URL('/auth/line/start', window.location.origin);
    url.searchParams.set('next', currentPathQ);   // กลับมาที่เดิมหลังล็อกอิน
    url.searchParams.set('to', 'accounts');       // ให้ AuthGate พาเข้า /accounts เสมอ
    console.log('[RequireAuth] redirecting to LINE login:', url.toString());
    window.location.replace(url.toString());
    return <div style={{ padding: 24 }}>Redirecting to LINE Login…</div>;
  }

  // ผ่านแล้ว → แสดงหน้าลูก
  return <Outlet />;
}
