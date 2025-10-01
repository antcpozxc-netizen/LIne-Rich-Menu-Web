// src/routes/RequireAdmin.jsx
import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

const ALLOW = new Set(['developer', 'admin', 'supervisor', 'headadmin']);

export default function RequireAdmin() {
  const [state, setState] = useState({ loading: true, ok: false, reason: '' });

  useEffect(() => {
    const off = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setState({ loading: false, ok: false, reason: 'no_user' });
        return;
      }
      try {
        // 1) อ่าน custom claims จาก Firebase ID token
        const tokenRes = await u.getIdTokenResult(true).catch(() => null);
        const claims = tokenRes?.claims || {};
        const claimRole = String(claims.role || '').trim().toLowerCase(); // ← role ที่เราส่งมาจาก /auth/magic
        const claimAdmin = !!claims.admin;             // เผื่อของเดิม
        const claimHead  = !!claims.head || !!claims.headadmin;
        const claimDev   = !!claims.dev;

        // 2) (เสริม) อ่าน doc users/{uid} ถ้ามี เพื่อเช็กสถานะ/role สำรอง
        let docRole = '';
        let docStatus = 'Active';
        try {
          const snap = await getDoc(doc(db, 'users', u.uid));
          if (snap.exists()) {
            docRole   = String(snap.get('role') || '').trim().toLowerCase();
            docStatus = String(snap.get('status') || 'Active').trim();
          }
        } catch {
          // อ่านไม่ได้ก็ข้าม (ไม่ให้ล้ม)
        }

        // 3) ตัดสินใจสิทธิ์
        const role = (claimRole || docRole || 'user').toLowerCase();
        const allowed =
          ALLOW.has(role) ||
          claimDev || claimHead || claimAdmin;

        // ถ้ามีเอกสาร users/{uid} และสถานะไม่ Active ให้บล็อก
        const active = (docRole ? docStatus === 'Active' : true);

        setState({
          loading: false,
          ok: allowed && active,
          reason: allowed ? (active ? '' : 'inactive') : 'forbidden'
        });
      } catch {
        setState({ loading: false, ok: false, reason: 'error' });
      }
    });
    return () => off();
  }, []);

  // ระหว่างรอ auth/claims → ห้ามรีไดเรกต์
  if (state.loading) return <div style={{ padding: 16 }}>กำลังตรวจสอบสิทธิ์…</div>;

  // ไม่โอเค → แสดงข้อความแทนการเด้งออก (กัน loop และไม่กระทบหน้าอื่น)
  if (!state.ok) {
    return (
      <div style={{ padding: 24 }}>
        <h3>ไม่มีสิทธิ์เข้าถึง</h3>
        {state.reason === 'inactive'
          ? <p>บัญชีของคุณไม่ได้อยู่ในสถานะ Active โปรดติดต่อผู้ดูแลระบบ</p>
          : <p>โปรดติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์</p>}
      </div>
    );
  }

  // ผ่าน → แสดงหน้าลูก (เช่น AdminUsersSplitPage)
  return <Outlet />;
}
