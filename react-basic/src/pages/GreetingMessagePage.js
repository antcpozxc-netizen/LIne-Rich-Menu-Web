// src/pages/GreetingMessagePage.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, Container,
  FormControlLabel, Grid, Snackbar, Stack, Switch,
  TextField, Typography, Tabs, Tab, Alert
} from '@mui/material';
import {
  InsertEmoticon as EmojiIcon,
  Image as ImageIcon,
  RestartAlt as ResetIcon,
  Save as SaveIcon,
  Send as SendIcon,
  CloudDone as CloudDoneIcon
} from '@mui/icons-material';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage, db } from '../firebase';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuthx, loginWithLine } from '../lib/authx';

const MAX_CHARS = 500;
const KEY = 'greetingMessage';

const readData = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const writeData = (obj) => localStorage.setItem(KEY, JSON.stringify(obj));
const isDataUrl = (u='') => typeof u === 'string' && u.startsWith('data:');
const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl).split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(b64); const len = bin.length; const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

export default function GreetingMessagePage() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { tenantId } = useOutletContext() || {};
  const { isAuthed, ensureLogin, getBearer } = useAuthx();

  // state
  const [enabled, setEnabled] = useState(true);
  const [onlyFirstTime, setOnlyFirstTime] = useState(true);
  const [text, setText] = useState('สวัสดี {displayName} ขอบคุณที่เพิ่มเราเป็นเพื่อน 😊');
  const [image, setImage] = useState('');             // URL or data URL
  const [snack, setSnack] = useState('');
  const [previewTab, setPreviewTab] = useState(1);    // 0=Chat screen, 1=Chat list
  const fileRef = useRef(null);

  useEffect(() => {
    const s = readData();
    if (typeof s.enabled === 'boolean') setEnabled(s.enabled);
    if (typeof s.onlyFirstTime === 'boolean') setOnlyFirstTime(s.onlyFirstTime);
    if (typeof s.text === 'string') setText(s.text);
    if (typeof s.image === 'string') setImage(s.image);
  }, []);

  const canSave = useMemo(() => text.trim().length > 0 && text.length <= MAX_CHARS, [text]);

  // ---------- helpers ----------
  const ensureImageOnServer = async () => {
    if (!image) return '';
    if (!isDataUrl(image)) return image; // already a remote URL
    if (!tenantId) throw new Error('กรุณาเลือก OA ก่อน');

    const blob = dataUrlToBlob(image);
    const safeName = `greeting-${Date.now()}.jpg`;
    const path = `tenants/${tenantId}/greeting/${safeName}`;
    const r = sref(storage, path);
    await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg' });
    return await getDownloadURL(r);
  };

  const insertAtCursor = (snippet) => setText((t) => (t + (t.endsWith(' ') ? '' : ' ') + snippet).slice(0, MAX_CHARS));

  const onSaveLocal = () => {
    writeData({ enabled, onlyFirstTime, text, image });
    setSnack('Saved locally (guest)');
  };

  const onReset = () => {
    setEnabled(true);
    setOnlyFirstTime(true);
    setText('สวัสดี {displayName} ขอบคุณที่เพิ่มเราเป็นเพื่อน 😊');
    setImage('');
    setSnack('Reset to default');
  };

  // ตัวอย่างแทนตัวแปร (พรีวิว)
  const renderVars = (s) =>
    s.replaceAll('{displayName}', 'คุณลูกค้า')
     .replaceAll('{accountName}', 'Test Web');

  const buildMessages = (imgUrl) => {
    const msgs = [];
    if (imgUrl) msgs.push({ type: 'image', originalContentUrl: imgUrl, previewImageUrl: imgUrl });
    if (text.trim()) msgs.push({ type: 'text', text: renderVars(text.trim()) });
    return msgs.slice(0, 5);
  };

  const onPickImage = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (isAuthed && tenantId) {
        // อัปขึ้น Storage ทันทีถ้าล็อกอิน + มี OA
        const safeName = f.name.replace(/\s+/g, '-');
        const r = sref(storage, `tenants/${tenantId}/greeting/${Date.now()}-${safeName}`);
        await uploadBytes(r, f);
        const url = await getDownloadURL(r);
        setImage(url);
        setSnack('Uploaded image');
      } else {
        // guest: เก็บเป็น data URL ไว้ก่อน
        const dataUrl = await fileToDataUrl(f);
        setImage(String(dataUrl));
        setSnack('เลือกภาพแล้ว (จะอัปโหลดเมื่อ Login)');
      }
    } catch (err) {
      console.error(err);
      setSnack('อัปโหลดรูปไม่สำเร็จ');
    } finally {
      e.target.value = '';
    }
  };

  const onSaveToOA = async () => {
    try {
      await ensureLogin(loc.pathname + loc.search);
      if (!tenantId) return setSnack('กรุณาเลือก OA ก่อน (มุมขวาบน)');

      const imgUrl = image ? await ensureImageOnServer() : '';
      await setDoc(doc(db, 'tenants', tenantId, 'settings', 'greeting'), {
        enabled: !!enabled,
        onlyFirstTime: !!onlyFirstTime,
        text: String(text || ''),
        image: String(imgUrl || ''),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid,
      }, { merge: true });

      setSnack('บันทึกขึ้น OA แล้ว');
    } catch (e) {
      console.error(e);
      setSnack(e?.message || 'บันทึกไม่สำเร็จ');
    }
  };

  const onSendTest = async () => {
    try {
      await ensureLogin(loc.pathname + loc.search);
      if (!tenantId) return setSnack('กรุณาเลือก OA ก่อน');

      const imgUrl = image ? await ensureImageOnServer() : '';
      const messages = buildMessages(imgUrl);
      if (!messages.length) return setSnack('กรุณาใส่ข้อความหรือรูปอย่างน้อย 1 อย่าง');

      const token = await getBearer();
      const res = await fetch(`/api/tenants/${tenantId}/broadcast/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'send_test_failed');

      setSnack('ส่งข้อความทดสอบสำเร็จ');
    } catch (e) {
      console.error(e);
      setSnack(e?.message || 'ส่งทดสอบไม่สำเร็จ');
    }
  };

  return (
    <Container sx={{ py: 3 }}>
      {!isAuthed && <Alert severity="info" sx={{ mb: 2 }}>โหมด Guest — เซฟไว้ในเครื่องได้ กด “Save to OA / Send test” จะให้คุณ Login ก่อน</Alert>}

      {/* Header bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h4" fontWeight="bold">Greeting message</Typography>
          <Chip size="small" label="Tips" color="default" />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            ระบบจะส่งข้อความนี้อัตโนมัติเมื่อผู้ใช้เพิ่มเพื่อน (follow)
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <FormControlLabel
            control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
            label="Enabled"
          />
          <Button
            variant="contained"
            startIcon={<CloudDoneIcon />}
            onClick={onSaveToOA}
            sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
          >
            Save to OA
          </Button>
          {!isAuthed && (
            <Button variant="outlined" onClick={() => loginWithLine(loc.pathname + loc.search)}>Login</Button>
          )}
        </Stack>
      </Stack>

      {/* Sending restrictions */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
            Sending restrictions
          </Typography>
          <FormControlLabel
            control={<Switch checked={onlyFirstTime} onChange={(e) => setOnlyFirstTime(e.target.checked)} />}
            label="Only send for first-time friends"
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            เปิดเพื่อกันการส่งซ้ำหากผู้ใช้เคยบล็อกแล้วปลดบล็อก
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
              </Stack>

              {/* Toolbar */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Button size="small" variant="outlined" startIcon={<EmojiIcon />} onClick={() => setText((t) => (t + ' 😊').slice(0, MAX_CHARS))}>Emoji</Button>
                <Button size="small" variant="outlined" startIcon={<ImageIcon />} onClick={() => fileRef.current?.click()}>Image</Button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
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

              {/* image preview */}
              {image && (
                <Box sx={{ mt: 1, border: '1px dashed #ccc', p: 1, borderRadius: 1 }}>
                  <img src={image} alt="greeting" style={{ width: '100%', borderRadius: 4 }} />
                  {isDataUrl(image) && <Typography variant="caption" color="text.secondary">* จะอัปโหลดเมื่อกด Save to OA / Send test</Typography>}
                </Box>
              )}

              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <Button variant="outlined" startIcon={<ResetIcon />} onClick={onReset}>Reset</Button>
              </Stack>
            </CardContent>
          </Card>

          {/* Bottom centered Save (local) */}
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              disabled={!canSave}
              onClick={onSaveLocal}
              sx={{ bgcolor: '#66bb6a', px: 4, '&:hover': { bgcolor: '#57aa5b' } }}
            >
              Save (local)
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
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ alignSelf: 'flex-start', bgcolor: '#e8f5e9', borderRadius: 2, p: 1.2, maxWidth: '90%' }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {renderVars(text)}
                      </Typography>
                      {image && <Box sx={{ mt: 1 }}><img src={image} alt="preview" style={{ width: '100%', borderRadius: 4 }} /></Box>}
                    </Box>
                  </Box>
                ) : (
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
