// src/pages/GreetingMessagePage.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Card, CardContent, Checkbox, Chip, Container, 
  FormControlLabel, Grid, Menu, MenuItem, Snackbar, Stack, 
  TextField, Typography, Tabs, Tab
} from '@mui/material';
import {
  InsertEmoticon as EmojiIcon,
  Image as ImageIcon,
  RestartAlt as ResetIcon,
  Save as SaveIcon,
  Send as SendIcon,
  MoreVert as MoreIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const MAX_CHARS = 500;
const KEY = 'greetingMessage';

const readData = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
};
const writeData = (obj) => localStorage.setItem(KEY, JSON.stringify(obj));

export default function GreetingMessagePage() {
  const navigate = useNavigate();

  // state
  const [enabled, setEnabled] = useState(true);
  const [onlyFirstTime, setOnlyFirstTime] = useState(true);
  const [text, setText] = useState('สวัสดี {displayName} ขอบคุณที่เพิ่มเราเป็นเพื่อน 😊');
  const [image, setImage] = useState('');
  const [snack, setSnack] = useState('');
  const [previewTab, setPreviewTab] = useState(1); // 0=Chat screen, 1=Chat list (เหมือนในภาพ)
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

  const handlePickImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(f);
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

  const onSendTest = () => {
    console.log('Send test greeting:', { enabled, onlyFirstTime, text, image });
    setSnack('Sent test (mock)');
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

              {/* image preview inside editor (optional) */}
              {image && (
                <Box sx={{ mt: 1, border: '1px dashed #ccc', p: 1, borderRadius: 1 }}>
                  <img src={image} alt="greeting" style={{ width: '100%', borderRadius: 4 }} />
                </Box>
              )}

              {/* Add block + bottom buttons */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <Button variant="outlined">+ Add</Button>
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
                        {text.replace('{displayName}', 'คุณลูกค้า').replace('{accountName}', 'Test Web')}
                      </Typography>
                      {image && <Box sx={{ mt: 1 }}><img src={image} alt="preview" style={{ width: '100%', borderRadius: 4 }} /></Box>}
                    </Box>
                  </Box>
                ) : (
                  // Chat list (แสดงตัวอย่างข้อความย่อ)
                  <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">
                      Test Web — สวัสดี คุณ{' '}<strong>display name</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {text.replace('{displayName}', 'User’s display name').replace('{accountName}', 'Test Web').slice(0, 80)}…
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

      <Snackbar open={!!snack} autoHideDuration={2000} onClose={() => setSnack('')} message={snack} />
    </Container>
  );
}
