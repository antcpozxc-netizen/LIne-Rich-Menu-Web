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
      if (!u) {
        setState({ loading: false, ok: false });
        return;
      }
      try {
        // อ่านข้อมูลผู้ใช้จาก Firestore (role / isAdmin flag)
        const snap = await getDoc(doc(db, 'users', u.uid));
        const role = snap.get('role');            // 'developer' | 'headAdmin' | 'admin' | 'user'
        const isAdminFlag = !!snap.get('isAdmin'); // เพื่อรองรับของเดิม

        // อ่าน custom claims จาก token (admin/head/dev)
        const token = await u.getIdTokenResult(true).catch(() => null);
        const claimAdmin = !!token?.claims?.admin;
        const claimHead  = !!token?.claims?.head;
        const claimDev   = !!token?.claims?.dev;

        // ✅ ให้ dev/head/admin ผ่าน (ทั้งจาก claims และจาก doc.role)
        const ok =
          claimDev || claimHead || claimAdmin ||
          role === 'developer' || role === 'headAdmin' || role === 'admin' ||
          isAdminFlag;

        setState({ loading: false, ok });
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
