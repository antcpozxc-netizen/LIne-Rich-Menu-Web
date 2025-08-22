import { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

const currentPath = () => window.location.pathname + window.location.search + window.location.hash;

export function loginWithLine(nextPath = currentPath()) {
  const url = new URL('/auth/line/start', window.location.origin);
  if (nextPath) url.searchParams.set('next', nextPath);
  window.location.href = url.toString();
}

export function useAuthx() {
  const [user, setUser] = useState(() => auth.currentUser); // เร็วขึ้นนิด
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
      loginWithLine(nextPath || currentPath());
      throw new Error('login_required'); // ให้ caller try/catch แล้ว return เงียบ ๆ
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
