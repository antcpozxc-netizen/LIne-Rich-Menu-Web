// src/pages/LiveChatPage.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Card, CardContent, Divider, Stack, Typography,
  List, ListItemButton, ListItemText, TextField, Button, Chip
} from '@mui/material';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { auth } from '../firebase';

export default function LiveChatPage() {
  const { tenantId } = useOutletContext() || {};
  const [sp] = useSearchParams();
  const t = tenantId || sp.get('tenant');

  const [rooms, setRooms] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  // helper: fetch with idToken
  const authedFetch = async (url, init = {}) => {
    const idToken = await auth.currentUser.getIdToken();
    return fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        ...(init.headers || {})
      }
    });
  };

  // poll รายการห้องทุก 5 วิ
  useEffect(() => {
    if (!t) return;
    let stop = false;

    const load = async () => {
      try {
        const r = await authedFetch(`/api/tenants/${t}/live`);
        const j = await r.json();
        if (!stop && j.ok) {
          setRooms(j.items || []);
          if (!activeId && (j.items || []).length) setActiveId(j.items[0].id);
        }
      } catch {}
    };

    load();
    const iv = setInterval(load, 5000);
    return () => { stop = true; clearInterval(iv); };
  }, [t, activeId]);

  // poll ข้อความห้องที่เลือกทุก 1.5 วิ
  useEffect(() => {
    if (!t || !activeId) { setMsgs([]); return; }
    let stop = false;

    const loadMsgs = async () => {
      try {
        const r = await authedFetch(`/api/tenants/${t}/live/${activeId}/messages?limit=200`);
        const j = await r.json();
        if (!stop && j.ok) {
          setMsgs(j.items || []);
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
        }
      } catch {}
    };

    loadMsgs();
    const iv = setInterval(loadMsgs, 1500);
    return () => { stop = true; clearInterval(iv); };
  }, [t, activeId]);

  const activeRoom = useMemo(
    () => rooms.find(r => r.id === activeId) || null, [rooms, activeId]
  );

  const send = async () => {
    const text = input.trim();
    if (!text || !t || !activeId) return;
    await authedFetch(`/api/tenants/${t}/live/${activeId}/send`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    setInput('');
  };

  const closeRoom = async () => {
    if (!t || !activeId) return;
    await authedFetch(`/api/tenants/${t}/live/${activeId}/close`, { method: 'POST' });
  };

  if (!t) return <Box>กรุณาเลือก OA ก่อน</Box>;

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
                        <span>{r.userProfile?.displayName || r.id}</span>
                        <Chip
                          size="small"
                          label={r.lastMessageFrom === 'user' ? 'new' : (r.status || 'open')}
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
                {activeRoom.userProfile?.displayName || activeRoom.id}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Stack spacing={1.2}>
                {msgs.map(m => (
                  <Box key={m.id} sx={{
                    alignSelf: m.from === 'agent' ? 'flex-end' : 'flex-start',
                    bgcolor: m.from === 'agent' ? '#e8f5e9' : '#f1f1f1',
                    p: 1, borderRadius: 1.5, maxWidth: '70%'
                  }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.text}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(m.createdAt?.seconds ? m.createdAt.seconds * 1000 : Date.now()).toLocaleString()}
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
