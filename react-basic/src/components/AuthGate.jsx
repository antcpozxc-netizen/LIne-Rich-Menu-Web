// src/components/AuthGate.jsx
import { useEffect } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';

export default function AuthGate() {
  useEffect(() => {
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const token = hash.get('token');
      const next  = hash.get('next') || '/';
      const to    = hash.get('to'); // "accounts" เพื่อเด้งไปเลือก OA

      try {
        if (token) await signInWithCustomToken(auth, token);
      } catch (e) {
        console.error('signInWithCustomToken error:', e);
      } finally {
        // ล้าง fragment ออกจาก URL (แก้ ESLint: ใช้ window.history)
        window.history.replaceState(null, '', window.location.pathname + window.location.search);

        // redirect เฉพาะกรณีมี token (กัน loop)
        if (token) {
          if (to === 'accounts') {
            window.location.replace(`/accounts?next=${encodeURIComponent(next)}`);
          } else {
            window.location.replace(next);
          }
        }
      }
    })();
  }, []);

  return null;
}
