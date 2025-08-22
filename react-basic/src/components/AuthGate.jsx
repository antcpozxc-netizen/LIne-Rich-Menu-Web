// src/components/AuthGate.jsx
import { useEffect } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';

function sanitizeNext(raw) {
  // อนุญาตเฉพาะ path ของโดเมนเรา (กัน open-redirect)
  try {
    if (!raw) return '/';
    // ถ้าเป็น absolute URL และ origin ไม่ตรง ให้ปัดทิ้ง
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    // คืนเฉพาะ pathname+search+hash (ไม่ต้องมี origin)
    return url.pathname + url.search + url.hash;
  } catch {
    // ถ้า parse ไม่ได้ (เช่นใส่สตริงมั่ว) ก็กลับบ้าน
    return '/';
  }
}

export default function AuthGate() {
  useEffect(() => {
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const token = hash.get('token');
      const next  = sanitizeNext(hash.get('next') || '/');
      const to    = hash.get('to');       // "accounts" เพื่อเด้งไปเลือก OA
      const err   = hash.get('error');    // ถ้ามี error จาก backend

      // ถ้า callback พร้อม error ให้ log ไว้ง่าย ๆ
      if (err) console.error('LINE login error:', err);

      // ถ้าไม่มี token (เช่นผู้ใช้ reload หน้านี้เฉย ๆ) — ไม่ต้องทำอะไรเลย
      if (!token) return;

      try {
        await signInWithCustomToken(auth, token);
      } catch (e) {
        console.error('signInWithCustomToken error:', e);
        // ออกจาก hash แต่คงอยู่ที่หน้าเดิม เพื่อให้ dev ดู error ได้
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }

      // ล้าง fragment ออกจาก URL เสมอหลังจัดการเสร็จ
      window.history.replaceState(null, '', window.location.pathname + window.location.search);

      // ตัดสินใจปลายทาง
      const target = to === 'accounts'
        ? `/accounts?next=${encodeURIComponent(next)}`
        : next;

      // กัน loop: ถ้า target เท่ากับที่เราอยู่แล้ว ไม่ต้อง redirect
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (target !== current) {
        window.location.replace(target);
      }
    })();
  }, []);

  return null;
}
