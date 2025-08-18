// src/pages/GreetingMessagePage.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Card, CardContent, Checkbox, Chip, Container,
  FormControlLabel, Grid, Menu, MenuItem, Snackbar, Stack,
  TextField, Typography, Tabs, Tab, Switch
} from '@mui/material';
import {
  InsertEmoticon as EmojiIcon,
  Image as ImageIcon,
  RestartAlt as ResetIcon,
  Save as SaveIcon,
  Send as SendIcon,
  MoreVert as MoreIcon
} from '@mui/icons-material';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../firebase';

const MAX_CHARS = 500;
const KEY = 'greetingMessage';

const readData = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
};
const writeData = (obj) => localStorage.setItem(KEY, JSON.stringify(obj));

export default function GreetingMessagePage() {
  const navigate = useNavigate();
  const { tenantId } = useOutletContext() || {};

  // state
  const [enabled, setEnabled] = useState(true);
  const [onlyFirstTime, setOnlyFirstTime] = useState(true);
  const [text, setText] = useState('สวัสดี {displayName} ขอบคุณที่เพิ่มเราเป็นเพื่อน 😊');
  const [image, setImage] = useState('');             // public URL (ถ้ามี)
  const [snack, setSnack] = useState('');
  const [previewTab, setPreviewTab] = useState(1);    // 0=Chat screen, 1=Chat list
  const fileRef = useRef(null);

  // variable menu
  const [anchorEl, setAnchorEl] = useState(null);
  const openVarMenu = Boolean(anchorEl);

  useEffect(() => {
    const s = readData();
    if (typeof s.enabled === 'boolean') setEnabled(s.enabled);
    if (typeof s.onlyFirstTime === 'boolean') setOnlyFirstTime(s.onlyFirstTime);
    if (typeof s.text === 'string') setText(s.text);
    if (typeof s.image === 'string') setImage(s.image);
  }, []);

  const canSave = useMemo(() => text.trim().length > 0 && text.length <= MAX_CHARS, [text]);

  // -------- helpers --------
  const authHeader = async () => {
    if (!auth.currentUser) throw new Error('ยังไม่พบผู้ใช้ที่ล็อกอิน');
    const idToken = await auth.currentUser.getIdToken();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` };
  };

  const uploadToStorage = async (file) => {
    if (!tenantId) throw new Error('ไม่พบ tenantId');
    const safeName = file.name.replace(/\s+/g, '-');
    const path = `tenants/${tenantId}/greeting/${Date.now()}-${safeName}`;
    const r = sref(storage, path);
    await uploadBytes(r, file);
    return getDownloadURL(r);
  };

  const handlePickImage = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = await uploadToStorage(f);
      setImage(url);
      setSnack('Uploaded image');
    } catch (err) {
      console.error(err);
      setSnack('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      e.target.value = '';
    }
  };

  const insertAtCursor = (snippet) => {
    setText((t) => (t + (t.endsWith(' ') ? '' : ' ') + snippet).slice(0, MAX_CHARS));
    setAnchorEl(null);
  };

  const onSave = () => {
    writeData({ enabled, onlyFirstTime, text, image });
    setSnack('Saved changes');
  };

  const onReset = () => {
    setEnabled(true);
    setOnlyFirstTime(true);
    setText('สวัสดี {displayName} ขอบคุณที่เพิ่มเราเป็นเพื่อน 😊');
    setImage('');
    setSnack('Reset to default');
  };

  // สร้างข้อความตัวอย่างทดแทนตัวแปร (ใช้สำหรับพรีวิว/ส่ง test เท่านั้น)
  const renderVars = (s) =>
    s.replaceAll('{displayName}', 'คุณลูกค้า')
     .replaceAll('{accountName}', 'Test Web');

  const buildLineMessages = () => {
    const msgs = [];
    if (image) msgs.push({ type: 'image', originalContentUrl: image, previewImageUrl: image });
    if (text.trim()) msgs.push({ type: 'text', text: renderVars(text.trim()) });
    return msgs.slice(0, 5);
  };

  const onSendTest = async () => {
    try {
      if (!tenantId) return alert('กรุณาเลือก OA ก่อน (Switch OA ที่มุมขวาบน)');
      const messages = buildLineMessages();
      if (messages.length === 0) return alert('กรุณาใส่ข้อความหรือรูปอย่างน้อย 1 อย่าง');

      const headers = await authHeader();
      const res = await fetch(`/api/tenants/${tenantId}/broadcast/test`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'send_test_failed');

      setSnack('ส่งข้อความทดสอบสำเร็จ');
    } catch (e) {
      console.error(e);
      setSnack('ส่งทดสอบไม่สำเร็จ');
    }
  };

  return (
    <Container sx={{ py: 3 }}>
      {/* Header bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h4" fontWeight="bold">Greeting message</Typography>
          <Chip size="small" label="Tips" color="default" />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            This message will be sent automatically to users when they add you as a friend.
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <FormControlLabel
            control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
            label="Enabled"
          />
          <Button variant="outlined">Insights</Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={!canSave}
            onClick={onSave}
            sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
          >
            Save changes
          </Button>
        </Stack>
      </Stack>

      {/* Sending restrictions */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
            Sending restrictions
          </Typography>
          <FormControlLabel
            control={<Checkbox checked={onlyFirstTime} onChange={(e) => setOnlyFirstTime(e.target.checked)} />}
            label="Only send for first-time friends"
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Turn on this setting to prevent this message from reappearing for friends who unblocked your account.
          </Typography>
        </CardContent>
      </Card>

      <Grid container spacing={2} alignItems="flex-start">
        {/* LEFT: Message content */}
        <Grid item xs={12} md={8}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">Message content</Typography>
                <Button size="small" variant="outlined">Templates</Button>
              </Stack>

              {/* Toolbar */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Button size="small" variant="outlined" startIcon={<EmojiIcon />} onClick={() => setText((t) => (t + ' 😊').slice(0, MAX_CHARS))}>Emoji</Button>
                <Button size="small" variant="outlined" startIcon={<MoreIcon />} onClick={(e) => setAnchorEl(e.currentTarget)}>Variables</Button>
                <Menu anchorEl={anchorEl} open={openVarMenu} onClose={() => setAnchorEl(null)}>
                  <MenuItem onClick={() => insertAtCursor('{displayName}')}>{'{displayName}'} — ชื่อผู้ใช้</MenuItem>
                  <MenuItem onClick={() => insertAtCursor('{accountName}')}>{'{accountName}'} — Account name</MenuItem>
                </Menu>
                <Button size="small" variant="outlined" startIcon={<ImageIcon />} onClick={() => fileRef.current?.click()}>Image</Button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePickImage} />
              </Stack>

              {/* Text area */}
              <TextField
                placeholder="พิมพ์ข้อความต้อนรับ..."
                multiline
                minRows={10}
                fullWidth
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                helperText={`${text.length}/${MAX_CHARS}`}
              />

              {/* image preview inside editor */}
              {image && (
                <Box sx={{ mt: 1, border: '1px dashed #ccc', p: 1, borderRadius: 1 }}>
                  <img src={image} alt="greeting" style={{ width: '100%', borderRadius: 4 }} />
                </Box>
              )}

              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <Button variant="outlined" disabled>+ Add</Button>
              </Stack>
            </CardContent>
          </Card>

          {/* Bottom centered Save */}
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              disabled={!canSave}
              onClick={onSave}
              sx={{ bgcolor: '#66bb6a', px: 4, '&:hover': { bgcolor: '#57aa5b' } }}
            >
              Save changes
            </Button>
          </Box>
        </Grid>

        {/* RIGHT: Preview pane */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Preview</Typography>
              <Tabs value={previewTab} onChange={(_, v) => setPreviewTab(v)} sx={{ mb: 1 }}>
                <Tab label="Chat screen" />
                <Tab label="Chat list" />
              </Tabs>

              <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 2, bgcolor: previewTab === 1 ? '#f5f7fb' : 'transparent' }}>
                {previewTab === 0 ? (
                  // Chat screen
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ alignSelf: 'flex-start', bgcolor: '#e8f5e9', borderRadius: 2, p: 1.2, maxWidth: '90%' }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {renderVars(text)}
                      </Typography>
                      {image && <Box sx={{ mt: 1 }}><img src={image} alt="preview" style={{ width: '100%', borderRadius: 4 }} /></Box>}
                    </Box>
                  </Box>
                ) : (
                  // Chat list (excerpt)
                  <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">
                      Test Web — สวัสดี คุณ <strong>display name</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {renderVars(text).slice(0, 80)}…
                    </Typography>
                  </Stack>
                )}
              </Box>

              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button variant="outlined" startIcon={<ResetIcon />} onClick={onReset}>Reset</Button>
                <Button variant="contained" startIcon={<SendIcon />} onClick={onSendTest}>Send test</Button>
                <Button variant="outlined" onClick={() => navigate('/homepage')}>Back</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={!!snack} autoHideDuration={2200} onClose={() => setSnack('')} message={snack} />
    </Container>
  );
}
