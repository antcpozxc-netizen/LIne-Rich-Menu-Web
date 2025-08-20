// src/routes/RequireAdmin.jsx
import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function RequireAdmin() {
  const [state, setState] = useState({ loading: true, ok: false });
  const location = useLocation();

  useEffect(() => {
    const off = onAuthStateChanged(auth, async (u) => {
      if (!u) return setState({ loading: false, ok: false });
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        const role = snap.get('role');
        const isAdminFlag = !!snap.get('isAdmin');
        // เผื่อใช้ custom claims ด้วย
        const token = await u.getIdTokenResult(true).catch(() => null);
        const claimAdmin = !!token?.claims?.admin;
        setState({ loading: false, ok: role === 'admin' || isAdminFlag || claimAdmin });
      } catch {
        setState({ loading: false, ok: false });
      }
    });
    return () => off();
  }, []);

  if (state.loading) return <div style={{ padding: 16 }}>Loading...</div>;
  if (!state.ok) return <Navigate to="/" replace state={{ from: location }} />;
  return <Outlet />;
}
