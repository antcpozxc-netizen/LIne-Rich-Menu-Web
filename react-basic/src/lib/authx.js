import { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

export function loginWithLine(nextPath = window.location.pathname + window.location.search) {
  const url = new URL('/auth/line/start', window.location.origin);
  if (nextPath) url.searchParams.set('next', nextPath);
  window.location.href = url.toString();
}

export function useAuthx() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
    });
  }, []);

  const isAuthed = !!user;

  const ensureLogin = useCallback(async (nextPath) => {
    if (!auth.currentUser) {
      loginWithLine(nextPath);
      // โยน error เพื่อหยุด flow ด้านหน้า (ปุ่มกด ฯลฯ)
      throw new Error('login_required');
    }
    return true;
  }, []);

  const getBearer = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return null;
    return await u.getIdToken();
  }, []);

  return { user, ready, isAuthed, ensureLogin, getBearer };
}
