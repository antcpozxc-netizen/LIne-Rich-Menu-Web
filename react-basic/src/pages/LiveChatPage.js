import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Card, CardContent, CardHeader, List, ListItemButton, ListItemAvatar,
  Avatar, ListItemText, Divider, Typography, Stack, TextField, IconButton,
  Button, Alert, CircularProgress
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useOutletContext, useLocation } from 'react-router-dom';
import { useAuthx } from '../lib/authx';

export default function LiveChatPage() {
  const { tenantId } = useOutletContext() || {};
  const { isAuthed, ensureLogin, getBearer } = useAuthx();
  const loc = useLocation();

  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null); // userId
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const canUse = isAuthed && !!tenantId;

  // โหลดรายการห้อง
  useEffect(() => {
    if (!canUse) { setSessions([]); setActive(null); return; }
    let stop = false;
    (async () => {
      setLoading(true);
      const token = await getBearer();
      const r = await fetch(`/api/tenants/${tenantId}/live`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (!stop) setSessions(Array.isArray(j.items) ? j.items : []);
      setLoading(false);
    })();
    return () => { stop = true; };
  }, [canUse, tenantId, getBearer]);

  // โหลดข้อความ
  useEffect(() => {
    if (!canUse || !active) { setMsgs([]); return; }
    let stop = false;
    (async () => {
      const token = await getBearer();
      const r = await fetch(`/api/tenants/${tenantId}/live/${encodeURIComponent(active)}/messages?limit=200`,
        { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (!stop) setMsgs(Array.isArray(j.items) ? j.items : []);
    })();
    return () => { stop = true; };
  }, [canUse, tenantId, active, getBearer]);

  const activeUser = useMemo(() => sessions.find(s => s.userId === active) || null, [sessions, active]);

  const send = async () => {
    if (!text.trim()) return;
    await ensureLogin(loc.pathname + loc.search);
    const token = await getBearer();
    await fetch(`/api/tenants/${tenantId}/live/${encodeURIComponent(active)}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text })
    });
    setText('');
    // reload
    const r = await fetch(`/api/tenants/${tenantId}/live/${encodeURIComponent(active)}/messages?limit=200`,
      { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    setMsgs(Array.isArray(j.items) ? j.items : []);
  };

  return (
    <Stack spacing={2}>
      {!isAuthed && (
        <Alert severity="info">โหมด Guest — ต้อง Login และเลือก OA ก่อนจึงจะใช้งาน Live Chat ได้</Alert>
      )}
      {!tenantId && isAuthed && (
        <Alert severity="warning">ยังไม่ได้เลือก OA</Alert>
      )}

      <Card>
        <CardHeader title="Live Chat" />
        <CardContent>
          {!canUse ? (
            <Typography color="text.secondary">Login + เลือก OA เพื่อใช้งาน</Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 2 }}>
              {/* Left: sessions */}
              <Box sx={{ borderRight: '1px solid #eee', pr: 2, minHeight: 420 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">Sessions</Typography>
                  {loading && <CircularProgress size={16} />}
                </Stack>
                <List dense sx={{ overflowY: 'auto', maxHeight: 520 }}>
                  {sessions.map(s => (
                    <React.Fragment key={s.userId}>
                      <ListItemButton selected={active === s.userId} onClick={() => setActive(s.userId)}>
                        <ListItemAvatar>
                          <Avatar src={s?.userProfile?.pictureUrl || undefined}>
                            {!s?.userProfile?.pictureUrl && ((s?.userProfile?.displayName || 'U')[0])}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={s?.userProfile?.displayName || s.userId}
                          secondary={s?.lastMessagePreview || ''}
                        />
                      </ListItemButton>
                      <Divider />
                    </React.Fragment>
                  ))}
                  {sessions.length === 0 && <Typography sx={{ p: 2, color: 'text.secondary' }}>ไม่มีการสนทนา</Typography>}
                </List>
              </Box>

              {/* Right: messages */}
              <Box sx={{
                display: 'flex', flexDirection: 'column', minHeight: 420, borderRadius: 1,
                background: '#fafafa', border: '1px solid #eee',
              }}>
                <Box sx={{ p: 2, borderBottom: '1px solid #eee' }}>
                  {activeUser ? (
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Avatar src={activeUser?.userProfile?.pictureUrl || undefined} />
                      <Box>
                        <Typography fontWeight={600}>{activeUser?.userProfile?.displayName || activeUser?.userId}</Typography>
                        <Typography variant="caption" color="text.secondary">{activeUser?.userId}</Typography>
                      </Box>
                    </Stack>
                  ) : (
                    <Typography color="text.secondary">เลือกผู้สนทนาด้านซ้าย</Typography>
                  )}
                </Box>

                <Box sx={{ flex: 1, p: 2, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {msgs.map(m => (
                    <Bubble key={m.id} from={m.from} text={m.text} />
                  ))}
                  {msgs.length === 0 && active && (
                    <Typography sx={{ color: 'text.secondary' }}>ยังไม่มีข้อความ</Typography>
                  )}
                </Box>

                <Box sx={{ p: 1, borderTop: '1px solid #eee', display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    placeholder="พิมพ์ข้อความ..."
                    fullWidth
                    disabled={!active}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <IconButton color="primary" disabled={!active || !text.trim()} onClick={send}>
                    <SendIcon />
                  </IconButton>
                </Box>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

function Bubble({ from, text }) {
  const mine = from === 'agent';
  return (
    <Box sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <Box sx={{
        bgcolor: mine ? '#c8e6c9' : '#fff',
        border: '1px solid #e0e0e0',
        px: 1.25, py: .75, borderRadius: 1.5, maxWidth: '75%',
        boxShadow: '0 1px 1px rgba(0,0,0,.04)'
      }}>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{text}</Typography>
      </Box>
    </Box>
  );
}
