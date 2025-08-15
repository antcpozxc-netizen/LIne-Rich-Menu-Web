// src/components/AuthGate.jsx
import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function AuthGate({ children, fallback }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // รับ custom token จาก fragment: #token=...
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('token');
    if (token) {
      signInWithCustomToken(auth, token)
        .catch(err => console.error('signInWithCustomToken error:', err))
        .finally(() => {
          // เคลียร์ fragment ไม่ให้ token ค้างอยู่ใน URL
          history.replaceState(null, '', window.location.pathname + window.location.search);
        });
    } else {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      setReady(true);
    });
  }, []);

  if (!ready) return <div style={{ padding: 16 }}>Loading...</div>;
  if (!user) return fallback || <div style={{ padding: 16 }}>กรุณาเข้าสู่ระบบ</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {user.photoURL && (
          <img
            src={user.photoURL}
            alt=""
            width={28}
            height={28}
            style={{ borderRadius: 999 }}
          />
        )}
        <span>{user.displayName || user.uid}</span>
        <button onClick={() => signOut(auth)} style={{ marginLeft: 'auto' }}>
          Sign out
        </button>
      </div>
      {children}
    </div>
  );
}
