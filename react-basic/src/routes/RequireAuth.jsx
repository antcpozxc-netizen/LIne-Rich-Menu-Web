import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useLocation } from 'react-router-dom';
import { auth } from '../firebase';

/**
 * ใช้ครอบเพจ/route ที่ต้องการให้ล็อกอิน
 * - ถ้ามี user → render children
 * - ถ้าไม่มี → เด้งไป LINE Login พร้อม next เป็น path ภายในปัจจุบัน
 */
export default function RequireAuth({ children }) {
  const loc = useLocation();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
    });
    return () => off();
  }, []);

  if (!ready) return null;
  if (user) return children;

  // สร้าง next ที่ปลอดภัย (internal path เท่านั้น)
  const next = (loc.pathname || '/') + (loc.search || '');
  const safeNext = next.startsWith('/') ? next : '/';

  // ส่งไปเริ่ม LINE Login
  window.location.href = `/auth/line/start?next=${encodeURIComponent(safeNext)}`;
  return null;
}
