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
        setState({ loading: false, ok: role === 'admin' });
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
