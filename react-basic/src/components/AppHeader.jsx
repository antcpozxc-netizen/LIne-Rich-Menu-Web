// src/components/AppHeader.jsx
import React, { useMemo, useEffect, useState } from 'react';
import { AppBar, Toolbar, Typography, Avatar, Chip, Button, Stack } from '@mui/material';
import { getAuth, onIdTokenChanged } from 'firebase/auth';

export default function AppHeader() {
  const auth = getAuth();
  const user = auth.currentUser;

  // อ่าน claims จาก ID token
  const [roleLabel, setRoleLabel] = useState('user');
  const [nameFromClaims, setNameFromClaims] = useState('');
  const [picFromClaims, setPicFromClaims] = useState('');

  useEffect(() => {
    // ฟังก์ชันช่วย map ทั้งแบบ role=string และแบบ boolean claims เดิม
    const resolveRole = (claims = {}) =>
      String(
        claims.role ||
        (claims.dev && 'developer') ||
        (claims.head && 'headAdmin') ||
        (claims.admin && 'admin') ||
        'user'
      );

    // อัปเดตทุกครั้งที่ ID token เปลี่ยน และบังคับรีเฟรชครั้งแรก
    const off = onIdTokenChanged(auth, async (u) => {
      if (!u) { setRoleLabel('user'); return; }
      const tr = await u.getIdTokenResult(true).catch(() => null); // ← force refresh
      setRoleLabel(resolveRole(tr?.claims || {}));
      setNameFromClaims(tr?.claims?.name || tr?.claims?.username || '');
      setPicFromClaims(tr?.claims?.picture || '');

      // fallback เพิ่มความชัวร์จาก session cookie ของเซิร์ฟเวอร์
      try {
        const r = await fetch('/api/session/me');
        if (r.ok) {
          const j = await r.json();
          if (j?.user?.role) setRoleLabel(String(j.user.role));
        }
      } catch {}
    });
    return () => off();
  }, [auth]);


  const displayName = useMemo(
    () => nameFromClaims || user?.displayName || user?.providerData?.[0]?.displayName || 'Guest',
    [nameFromClaims, user]
  );

  const avatarSrc = user?.photoURL || picFromClaims || undefined;

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
          {user && (
            <>
              <Typography variant="body2">{displayName}</Typography>
              <Avatar src={avatarSrc}>
                {(displayName?.trim()?.[0] || 'U').toUpperCase()}
              </Avatar>
            </>
          )}
          <Button
            variant="outlined"
            size="small"
            sx={{ ml: 1, color: '#fff', borderColor: 'rgba(255,255,255,.6)' }}
            onClick={onBack}
          >
            ย้อนกลับ
          </Button>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
