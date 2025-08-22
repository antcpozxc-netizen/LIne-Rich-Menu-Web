// src/routes/RequireAuth.jsx
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useLocation } from 'react-router-dom';
import { auth } from '../firebase';

export default function RequireAuth({ children }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
    return () => off();
  }, []);

  if (!ready) return null;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    // ไปที่ backend เพื่อเริ่ม LINE Login
    window.location.href = `/auth/line/start?next=${next}`;
    return null;
  }

  return children;
}
