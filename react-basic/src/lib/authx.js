// src/lib/authx.js
import { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { clearActiveTenantSelection } from './tenantSelection';

const currentPath = () => window.location.pathname + window.location.search + window.location.hash;

export function loginWithLine(nextPath = currentPath()) {
  const url = new URL('/auth/line/start', window.location.origin);
  if (nextPath) url.searchParams.set('next', nextPath);
  window.location.href = url.toString();
}

// ✅ เพิ่มฟังก์ชันนี้
export async function fullLogout(redirectTo = '/') {
  try {
    // 1) Firebase sign out
    await signOut(auth);
  } catch {}

  try {
    // 2) ล้างการเลือก OA
    clearActiveTenantSelection();
  } catch {}

  try {
    // 3) ล้าง localStorage เฉพาะคีย์ที่เกี่ยวข้อง (กันข้อมูลเก่าค้าง)
    const KEYS = [
      'activeTenantId',
      'guest:broadcast:new',
      'richMessages',
      'greetingMessage',
      'richMenuDraft',
    ];
    KEYS.forEach(k => localStorage.removeItem(k));
  } catch {}

  try {
    // 4) ล้าง session guard ของ RequireAuth (ป้องกัน throttle แปลกๆ หลังออก)
    sessionStorage.removeItem('auth_redirect_guard_ts');
  } catch {}

  try {
    // 5) เคลียร์ IndexedDB ที่ Firebase ใช้เก็บ session
    if (window.indexedDB) {
      // ชื่อฐานของ Firebase Web SDK
      const DB_NAMES = ['firebaseLocalStorageDb'];
      await Promise.all(DB_NAMES.map(name =>
        new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        })
      ));
    }
  } catch {}

  // 6) Reload แบบ replace เพื่อล้าง in-memory state ให้หมด
  window.location.replace(redirectTo || '/');
}

export function useAuthx() {
  const [user, setUser] = useState(() => auth.currentUser);
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
