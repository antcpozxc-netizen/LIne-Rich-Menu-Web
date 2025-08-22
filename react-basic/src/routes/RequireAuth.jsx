// src/routes/RequireAuth.jsx
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useLocation, Navigate } from 'react-router-dom';
import { auth } from '../firebase';

export default function RequireAuth({ children }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  // ✅ hook ต้องอยู่นอกเงื่อนไขเสมอ
  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
    return () => off();
  }, []);

  // รอเช็คสถานะก่อน
  if (!ready) return null; // หรือ spinner ก็ได้

  // ยังไม่ล็อกอิน → ส่งไปหน้า login พร้อม next กลับหน้าเดิม
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // ล็อกอินแล้ว → ผ่าน
  return children;
}
