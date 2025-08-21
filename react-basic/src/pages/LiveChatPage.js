// src/pages/LiveChatPage.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Card, CardContent, Divider, Stack, Typography,
  List, ListItemButton, ListItemText, TextField, Button, Chip
} from '@mui/material';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  collection, onSnapshot, orderBy, query, where, limit
} from 'firebase/firestore';

export default function LiveChatPage() {
  const { tenantId } = useOutletContext() || {};
  const [sp] = useSearchParams();
  const t = tenantId || sp.get('tenant');

  const [rooms, setRooms] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  // ✅ ดึงรายการห้องจาก Firestore ตามโครงใหม่: tenants/{t}/liveSessions
  useEffect(() => {
    if (!t) return;
    const col = collection(db, 'tenants', t, 'liveSessions');
    const q = query(col, where('status', '==', 'open'), orderBy('lastActiveAt', 'desc'), limit(100));
    const off = onSnapshot(q, (snap) => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRooms(arr);
      if (!activeId && arr.length) setActiveId(arr[0].id);
    });
    return () => off();
  }, [t, activeId]);

  // ✅ subscribe ข้อความ: tenants/{t}/liveSessions/{userId}/messages (orderBy createdAt)
  useEffect(() => {
    if (!t || !activeId) { setMsgs([]); return; }
    const col = collection(db, 'tenants', t, 'liveSessions', activeId, 'messages');
    const q = query(col, orderBy('createdAt', 'asc'));
    const off = onSnapshot(q, (snap) => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    });
    return () => off();
  }, [t, activeId]);

  const activeRoom = useMemo(() => rooms.find(r => r.id === activeId) || null, [rooms, activeId]);

  // ✅ ใช้ REST ชุดใหม่ในการส่งข้อความ
  const send = async () => {
    const text = input.trim();
    if (!text || !t || !activeId) return;
    const idToken = await auth.currentUser.getIdToken();
    await fetch(`/api/tenants/${t}/live/${activeId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ text }),
    });
    setInput('');
  };

  // ✅ ปิดห้องด้วย REST ใหม่
  const closeRoom = async () => {
    if (!t || !activeId) return;
    const idToken = await auth.currentUser.getIdToken();
    await fetch(`/api/tenants/${t}/live/${activeId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
  };

  if (!t) return <Box sx={{ p: 2 }}>กรุณาเลือก OA ก่อน</Box>;

  const humanTime = (ts) => {
    try {
      const ms = ts?.seconds ? ts.seconds * 1000 : (ts?.toMillis?.() ? ts.toMillis() : Date.now());
      return new Date(ms).toLocaleString();
    } catch { return ''; }
  };

  return (
    <Stack direction="row" spacing={2}>
      {/* LEFT: room list */}
      <Card sx={{ width: 320, height: '70vh', overflow: 'hidden' }}>
        <CardContent sx={{ p: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 1.5, borderBottom: '1px solid #eee' }}>
            <Typography fontWeight={700}>Live chat</Typography>
            <Typography variant="caption" color="text.secondary">สถานะ: open</Typography>
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <List dense>
              {rooms.map(r => (
                <ListItemButton key={r.id} selected={r.id === activeId} onClick={() => setActiveId(r.id)}>
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <span>{r.userProfile?.displayName || r.userId || r.id}</span>
                        <Chip
                          size="small"
                          label={r.lastMessageFrom === 'user' ? 'new' : r.status}
                          color={r.lastMessageFrom === 'user' ? 'warning' : 'default'}
                        />
                      </Stack>
                    }
                    secondary={(r.lastMessagePreview || '').slice(0, 60)}
                  />
                </ListItemButton>
              ))}
              {!rooms.length && <Box sx={{ p: 2, color: 'text.secondary' }}>ยังไม่มีห้องสนทนา</Box>}
            </List>
          </Box>
        </CardContent>
      </Card>

      {/* RIGHT: chat window */}
      <Card sx={{ flex: 1, height: '70vh', display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ flex: 1, overflowY: 'auto' }}>
          {activeRoom ? (
            <>
              <Typography fontWeight={700}>
                {activeRoom.userProfile?.displayName || activeRoom.userId || activeRoom.id}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Stack spacing={1.2}>
                {msgs.map(m => (
                  <Box
                    key={m.id}
                    sx={{
                      alignSelf: m.from === 'agent' ? 'flex-end' : 'flex-start',
                      bgcolor: m.from === 'agent' ? '#e8f5e9' : '#f1f1f1',
                      p: 1, borderRadius: 1.5, maxWidth: '70%',
                    }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.text}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {humanTime(m.createdAt)}
                    </Typography>
                  </Box>
                ))}
                <div ref={bottomRef} />
              </Stack>
            </>
          ) : (
            <Typography color="text.secondary">เลือกห้องจากด้านซ้าย</Typography>
          )}
        </CardContent>

        <Divider />
        <Stack direction="row" spacing={1} sx={{ p: 1 }}>
          <TextField
            fullWidth size="small"
            placeholder="พิมพ์ข้อความถึงลูกค้า…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => (e.key === 'Enter' ? send() : null)}
          />
          <Button variant="contained" onClick={send} disabled={!activeRoom}>ส่ง</Button>
          <Button color="error" onClick={closeRoom} disabled={!activeRoom}>ปิดห้อง</Button>
        </Stack>
      </Card>
    </Stack>
  );
}
