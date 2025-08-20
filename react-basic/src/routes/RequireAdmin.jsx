import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export default function RequireAdmin() {
  const [state, setState] = useState({ user: undefined, admin: undefined });
  const location = useLocation();

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      if (!u) return setState({ user: null, admin: false });
      const ref = doc(db, 'users', u.uid);
      const unsub = onSnapshot(ref, (snap) => {
        setState({ user: u, admin: !!snap.get('isAdmin') });
      });
      return () => unsub();
    });
    return () => off();
  }, []);

  if (state.user === undefined || state.admin === undefined) return <div style={{padding:16}}>Loading…</div>;
  if (!state.user) return <Navigate to="/" replace state={{ from: location }} />;
  if (!state.admin) return <Navigate to="/homepage" replace />;
  return <Outlet />;
}
