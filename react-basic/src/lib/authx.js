// src/lib/authx.js
import { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { clearActiveTenantSelection } from './tenantSelection';

const currentPath = () => window.location.pathname + window.location.search + window.location.hash;

// เพิ่มตัวเลือก force/to เพื่อควบคุมพฤติกรรมการล็อกอินกับ LINE
export function loginWithLine(nextPath = currentPath(), opts = {}) {
  const { force = true, to = 'accounts' } = opts; // ตั้งค่าเริ่มต้นให้ใช้งานทั่วไปได้เลย
  const url = new URL('/auth/line/start', window.location.origin);
  if (nextPath) url.searchParams.set('next', nextPath);
  if (to)       url.searchParams.set('to', to);
  if (force)    url.searchParams.set('force', '1'); // บังคับเลือกบัญชี/รี-auth ทุกครั้ง
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
      // ลบฐานของ Firebase ให้ครบ (กัน token/session ค้าง)
      const DB_NAMES = [
        'firebaseLocalStorageDb',
        'firebase-installations-database',
        'firebase-heartbeat-database',
      ];
      await Promise.all(DB_NAMES.map(name =>
        new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        })
      ));
    }
  } catch {}

  // 5.1) (เลือกได้) ล้าง Cache Storage กรณีเป็น PWA/มี Service Worker
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
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
      // เวลา ensure ให้บังคับเลือกบัญชี เพื่อกันดึง session เก่า
      loginWithLine(nextPath || currentPath(), { force: true, to: 'accounts' });
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
