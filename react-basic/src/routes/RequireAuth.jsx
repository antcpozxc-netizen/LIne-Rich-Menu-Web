// src/routes/RequireAuth.jsx
import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

export default function RequireAuth() {
  const [user, setUser] = useState(undefined); // undefined = กำลังเช็ค
  const location = useLocation();

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <div style={{ padding: 16 }}>Loading...</div>;
  if (!user) return <Navigate to="/" replace state={{ from: location }} />;
  return <Outlet />;
}
