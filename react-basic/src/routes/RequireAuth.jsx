import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { CircularProgress, Box } from '@mui/material';

function isLineWebView() {
  const ua = (navigator.userAgent || '').toLowerCase();
  return ua.includes(' line/'); // LINE iOS/Android WebView
}

// mt อยู่ใน URL ไหม (รองรับทั้งแบบใหม่ query และแบบเก่า hash)
function hasMagicTokenInUrl() {
  const q = new URLSearchParams(window.location.search);
  if (q.get('mt')) return true;
  const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  return !!h.get('token') || !!h.get('mt');
}

// เพิ่ง auth เสร็จในไม่กี่วินาทีที่ผ่านมาไหม
function authedRecently(ms = 8000) {
  const t = Number(sessionStorage.getItem('__AUTHGATE_DONE_AT') || 0);
  return t > 0 && Date.now() - t < ms;
}

export default function RequireAuth({ children }) {
  const loc = useLocation();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(() => auth.currentUser || null);

  // กัน redirect ซ้ำ
  const redirectingRef = useRef(false);

  // ผ่อนผันบน LINE (กัน race ที่ iOS)
  const [grace, setGrace] = useState(() => isLineWebView() ? 4000 : 0);

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
    });
    return () => off();
  }, []);

  useEffect(() => {
    if (!isLineWebView()) return;
    if (!grace) return;
    const t = setTimeout(() => setGrace(0), grace);
    return () => clearTimeout(t);
  }, [grace]);

  const next = useMemo(() => {
    const p = loc.pathname + (loc.search || '');
    return encodeURIComponent(p || '/');
  }, [loc.pathname, loc.search]);

  const showSpinner = (
    <Box sx={{ p: 3, display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
      <span>กำลังตรวจสอบสิทธิ์…</span>
    </Box>
  );

  // รอสถานะ Firebase
  if (!ready) return showSpinner;

  // มีผู้ใช้แล้ว → ผ่าน
  if (user) return children || <Outlet />;

  // ยังไม่ล็อกอิน: ให้ผ่อนผันถ้า…
  // - มี mt ใน URL
  // - หรือ AuthGate กำลัง/เพิ่งทำงาน
  // - หรือเพิ่ง auth เสร็จในไม่กี่วินาที
  if (
    hasMagicTokenInUrl() ||
    window.__AUTHGATE_BUSY ||
    window.__AUTHGATE_SEEN_MT ||
    sessionStorage.getItem('__authed') === '1' ||
    authedRecently() ||
    // ถ้า index.js กำลังล้าง service worker/caches ให้ค้างสปินเนอร์รอ
    sessionStorage.getItem('__nosw_busy') === '1'
  ) {
    return showSpinner;
  }

  // หมดช่วงผ่อนผัน → ไปเริ่มล็อกอิน LINE
  if (!redirectingRef.current) {
    redirectingRef.current = true;
    return <Navigate to={`/auth/line/start?next=${next}&to=accounts`} replace />;
  }
  return null;
}
