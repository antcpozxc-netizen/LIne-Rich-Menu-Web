// src/lib/useAuthClaims.js
import { useEffect, useState } from 'react';
import { auth } from '../firebase';

/** ดึง custom claims (เช่น admin) จาก Firebase ID token */
export default function useAuthClaims() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const off = auth.onIdTokenChanged(async (user) => {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      try {
        const res = await user.getIdTokenResult(true);
        setIsAdmin(!!res.claims.admin);
      } finally {
        setLoading(false);
      }
    });
    return () => off();
  }, []);

  return { isAdmin, loading };
}
