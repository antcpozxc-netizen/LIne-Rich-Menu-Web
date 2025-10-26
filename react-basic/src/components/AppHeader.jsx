// src/components/AppHeader.jsx
import React, { useMemo, useEffect, useState } from 'react';
import { AppBar, Toolbar, Typography, Avatar, Chip, Button, Stack } from '@mui/material';
import { getAuth, onIdTokenChanged } from 'firebase/auth';
import { useLocation } from 'react-router-dom';

export default function AppHeader() {
  const auth = getAuth();
  const user = auth.currentUser;
  const location = useLocation();

  // === state สำหรับแสดงบนแถบ ===
  const [roleLabel, setRoleLabel] = useState('user');
  const [nameFromClaims, setNameFromClaims] = useState('');
  const [picFromClaims, setPicFromClaims] = useState('');

  // ใช้ซ่อนปุ่มย้อนกลับเฉพาะหน้า TARegister
  const isTARegister = location.pathname === '/app/attendance/register';

  // helper: แปลง uid ของ Firebase (มาจาก custom token "uid":"line:Uxxxx")
  const lineUserId = useMemo(() => {
    const raw = user?.uid || '';
    return raw.startsWith('line:') ? raw.slice(5) : raw;
  }, [user?.uid]);

  useEffect(() => {
    let first = true;
    const resolveRole = (claims = {}) =>
      String(
        claims.role ||
        (claims.dev && 'developer') ||
        (claims.head && 'headAdmin') ||
        (claims.admin && 'admin') ||
        'user'
      );

    const off = onIdTokenChanged(auth, async (u) => {
      if (!u) {
        setRoleLabel('user');
        setNameFromClaims('');
        setPicFromClaims('');
        return;
      }

      // force refresh รอบแรกเท่านั้น กัน iOS กระตุก
      const tr = await u.getIdTokenResult(first).catch(() => null);
      first = false;
      const claims = tr?.claims || {};
      setRoleLabel(resolveRole(claims));
      setNameFromClaims(claims?.name || claims?.username || '');

      // 1) ถ้ามีรูปใน claims หรือ provider → ใช้ก่อน
      const candidate =
        claims?.picture ||
        u.photoURL ||
        u.providerData?.[0]?.photoURL ||
        '';

      if (candidate) {
        setPicFromClaims(candidate);
        return;
      }

      // 2) ถ้าไม่มีรูป ให้ลองยิงไป LINE profile proxy ของเรา
      //    tenant เอาจาก custom-claims.tenant (เราเซ็ตไว้ตอนออก token)
      const tenant = claims?.tenant;
      if (!tenant || !lineUserId) {
        // ถ้าไม่มีก็จบ ไม่ต้องยิง
        return;
      }

      try {
        console.debug('[AppHeader] fetch LINE profile', { tenant, lineUserId });
        const r = await fetch(
          `/api/tenants/${encodeURIComponent(tenant)}/line/profile?userId=${encodeURIComponent(lineUserId)}`
        );
        if (r.ok) {
          const j = await r.json();
          if (j?.ok && j?.profile?.pictureUrl) {
            setPicFromClaims(j.profile.pictureUrl);
          }
        } else {
          console.warn('[AppHeader] profile fetch not ok', r.status);
        }
      } catch (e) {
        console.error('[AppHeader] profile fetch error', e);
      }

      // 3) เผื่อ role จาก session ฝั่ง server
      try {
        const r = await fetch('/api/session/me');
        if (r.ok) {
          const j = await r.json();
          if (j?.user?.role) setRoleLabel(String(j.user.role));
        }
      } catch {}
    });

    return () => off();
  }, [auth, lineUserId]);

  const displayName = useMemo(
    () => nameFromClaims || user?.displayName || user?.providerData?.[0]?.displayName || 'Guest',
    [nameFromClaims, user]
  );

  const avatarSrc = picFromClaims || user?.photoURL || undefined;

  const onBack = () => {
    if (document.referrer && document.referrer.startsWith(window.location.origin)) {
      window.history.back();
    } else {
      window.location.href = '/app';
    }
  };

  return (
    <AppBar elevation={0} position="static" sx={{ backgroundColor: '#06C755', mb: 2 }}>
      <Toolbar sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography
          variant="h6"
          sx={{ fontWeight: 800, flexGrow: 1, cursor: 'pointer' }}
          onClick={() => (window.location.href = '/app')}
        >
          LINE Task Assignment
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" label={roleLabel} color="default" />
          {displayName && <Typography variant="body2">{displayName}</Typography>}
          <Avatar src={avatarSrc}>
            {(displayName?.trim()?.[0] || 'U').toUpperCase()}
          </Avatar>

          {!isTARegister && (
            <Button
              variant="outlined"
              size="small"
              sx={{ ml: 1, color: '#fff', borderColor: 'rgba(255,255,255,.6)' }}
              onClick={onBack}
            >
              ย้อนกลับ
            </Button>
          )}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
