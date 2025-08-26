// src/lib/useAuthClaims.js
import { useEffect, useState } from 'react';
import { auth } from '../firebase';

export default function useAuthClaims() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHead, setIsHead] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const off = auth.onIdTokenChanged(async (user) => {
      if (!user) {
        setIsAdmin(false); setIsHead(false); setIsDev(false);
        setLoading(false);
        return;
      }
      try {
        const res = await user.getIdTokenResult(true);
        setIsDev(!!res.claims.dev);
        setIsHead(!!res.claims.head);
        setIsAdmin(!!res.claims.admin); // รวม dev/head ด้วย
      } finally {
        setLoading(false);
      }
    });
    return () => off();
  }, []);

  return { isAdmin, isHead, isDev, loading };
}
