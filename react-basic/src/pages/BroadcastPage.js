// src/pages/BroadcastPage.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Container, Divider, FormControl, FormControlLabel, FormHelperText,
  Grid, IconButton, InputAdornment, MenuItem, Paper, Radio, RadioGroup,
  Select, Stack, TextField, Tooltip, Typography, Chip
} from '@mui/material';
import {
  Save as SaveIcon,
  Send as SendIcon,
  Schedule as ScheduleIcon,
  Image as ImageIcon,
  InsertEmoticon as InsertEmoticonIcon,
  AttachFile as AttachFileIcon,
  Link as LinkIcon,
  ContentCopy as ContentCopyIcon,
  Close as CloseIcon,
  TextFormat as TextFormatIcon,
  PhotoSizeSelectLarge as RichIcon
} from '@mui/icons-material';
import { useNavigate, useOutletContext, useSearchParams, useParams } from 'react-router-dom';
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../firebase';
import RichMessagePicker from '../components/RichMessagePicker';

// ----------------- Constants -----------------
const MAX_CHARS = 500;
const MAX_MESSAGES = 5;

const timezoneOptions = [
  { label: 'UTC −12:00', value: '-12:00' },
  { label: 'UTC −08:00', value: '-08:00' },
  { label: 'UTC −05:00', value: '-05:00' },
  { label: 'UTC +00:00', value: '+00:00' },
  { label: 'UTC +07:00', value: '+07:00' }, // TH default
  { label: 'UTC +08:00', value: '+08:00' },
  { label: 'UTC +09:00', value: '+09:00' },
];

export default function BroadcastPage() {
  // ----- Router / Outlet -----
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: idFromPath } = useParams();
  const editingId = searchParams.get('draft') || idFromPath || null;

  // ----- Tenant from layout -----
  const { tenantId } = useOutletContext() || {};
  useEffect(() => {
    if (!tenantId) {
      alert('กรุณาเลือก OA ก่อน');
      navigate('/accounts', { replace: true });
    }
  }, [tenantId, navigate]);

  // ----- Form states -----
  const [recipient, setRecipient] = useState('all'); // 'all' | 'target'
  const [sendType, setSendType] = useState('now');   // 'now' | 'schedule'
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [tz, setTz] = useState('+07:00');

  // blocks: text | image | file | link | rich
  const [blocks, setBlocks] = useState([{ id: 1, type: 'text', value: '' }]);

  // ----- UI states -----
  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // picker
  const [richPickerOpen, setRichPickerOpen] = useState(false);
  const [richTargetBlockId, setRichTargetBlockId] = useState(null);

  // ----- Helpers -----
  const filePickersRef = useRef({});

  const isBlockFilled = (b) =>
    (b.type === 'text'  && b.value?.trim()) ||
    (b.type === 'image' && b.url) ||
    (b.type === 'file'  && b.url) ||
    (b.type === 'link'  && b.url) ||
    (b.type === 'rich'  && (b.rich?.imagemap || b.rich?.image));

  const canSend = useMemo(() => {
    const hasSomething = blocks.some(isBlockFilled);
    const validSchedule = sendType === 'now' || (date && time);
    return hasSomething && validSchedule;
  }, [blocks, sendType, date, time]);

  const nextId = () => (blocks.at(-1)?.id || 0) + 1;

  const addBlock = () => setBlocks(prev => [...prev, { id: nextId(), type: 'text', value: '' }]);
  const removeBlock = (id) => setBlocks(prev => prev.filter(b => b.id !== id));
  const updateBlock = (id, newValue) =>
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, value: String(newValue).slice(0, MAX_CHARS) } : b)));
  const insertEmoji = (id, emoji = '😀') =>
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, value: (b.value || '') + ' ' + emoji } : b)));

  const setBlockType = (id, type) =>
    setBlocks(prev => prev.map(b => (b.id === id ? { id: b.id, type, value: '', url: '', previewUrl: '', fileName: '', label: '', rich: null } : b)));

  const pickFile = (key) => filePickersRef.current[key]?.click();

  const uploadToStorage = async (file, folder) => {
    const safeName = file.name.replace(/\s+/g, '-');
    const path = `tenants/${tenantId}/${folder}/${Date.now()}-${safeName}`;
    const r = sref(storage, path);
    await uploadBytes(r, file);
    return getDownloadURL(r);
  };

  const onChooseFile = async (id, kind, e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const folder = kind === 'image' ? 'images' : 'files';
      const url = await uploadToStorage(f, folder);
      if (kind === 'image') {
        setBlocks(prev => prev.map(b => (b.id === id ? { ...b, type: 'image', url, previewUrl: url } : b)));
      } else {
        setBlocks(prev => prev.map(b => (b.id === id ? { ...b, type: 'file', url, fileName: f.name } : b)));
      }
    } catch (err) {
      console.error(err);
      alert('อัปโหลดไม่สำเร็จ: ' + (err?.message || err));
    } finally {
      e.target.value = '';
    }
  };

  // ----- Rich message picker handlers -----
  const openRichPickerFor = (blockId) => {
    setRichTargetBlockId(blockId);
    setRichPickerOpen(true);
  };
  const handleRichPicked = (item) => {
    const normalized = {
      ...item,
      image:
        item.image ||
        item.imagemap?.urls?.[700] ||
        item.imagemap?.urls?.[300] ||
        item.imagemap?.urls?.[1040] ||
        item.image, // เผื่อไว้
    };

    setBlocks(prev => prev.map(b => (
      b.id === richTargetBlockId
        ? { ...b, type: 'rich', rich: normalized }
        : b
    )));
    setRichPickerOpen(false);
    setRichTargetBlockId(null);
  };


  // ----- Transformers -----
  const richToImagemapMessage = (r) => ({
    type: 'imagemap',
    baseUrl: r.imagemap.baseUrl,
    altText: r.imagemap.altText || r.name || 'Imagemap',
    baseSize: r.imagemap.baseSize,     // { width, height }
    actions: r.imagemap.actions,       // [{ type:'uri'|'message', linkUri?/text, area:{x,y,width,height} }]
  });

  const richBlockToMessages = (b) => {
    const r = b.rich;
    if (!r) return [];

    // 🚀 ใช้ imagemap จริง ถ้า publish แล้ว
    if (r.imagemap && r.imagemap.baseUrl && r.imagemap.baseSize && Array.isArray(r.imagemap.actions)) {
      return [richToImagemapMessage(r)];
    }

    // ↩️ fallback: รูป + สรุปลิงก์เป็นข้อความ
    const out = [];
    if (r.image) {
      out.push({ type: 'image', originalContentUrl: r.image, previewImageUrl: r.image });
    }
    const links = (r.areas || []).filter(a => a?.url).map((a, i) => `• ${a.label || `Link ${i + 1}`}: ${a.url}`);
    if (links.length) out.push({ type: 'text', text: links.join('\n') });
    return out;
  };

  const toLineMessages = () => {
    const out = [];

    for (const b of blocks) {
      if (b.type === 'text' && b.value?.trim()) {
        out.push({ type: 'text', text: b.value.trim() });
      }
      if (b.type === 'image' && b.url) {
        out.push({
          type: 'image',
          originalContentUrl: b.url,
          previewImageUrl: b.previewUrl || b.url
        });
      }
      if (b.type === 'file' && b.url) {
        out.push({ type: 'text', text: `${b.fileName || 'Download'}: ${b.url}` });
      }
      if (b.type === 'link' && b.url) {
        out.push({ type: 'text', text: `${b.label ? b.label + ': ' : ''}${b.url}` });
      }
      if (b.type === 'rich' && b.rich) {
        out.push(...richBlockToMessages(b));
      }
      if (out.length >= MAX_MESSAGES) break;
    }

    return out.slice(0, MAX_MESSAGES);
  };

  const buildScheduledAtISO = () => {
    if (sendType !== 'schedule') return null;
    if (!date || !time || !tz) return null;
    const isoLocalWithOffset = `${date}T${time}:00${tz}`;
    const when = new Date(isoLocalWithOffset);
    if (Number.isNaN(when.getTime())) return null;
    return when.toISOString(); // UTC ISO
  };

  const targetSummary = useMemo(
    () => (recipient === 'all' ? 'All friends' : 'Targeting'),
    [recipient]
  );

  const authHeader = async () => {
    if (!auth.currentUser) throw new Error('ยังไม่พบผู้ใช้ที่ล็อกอิน');
    const idToken = await auth.currentUser.getIdToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    };
  };

  // ----------------- Actions -----------------
  const onSaveDraft = async () => {
    try {
      setSavingDraft(true);
      const messages = toLineMessages();
      if (messages.length === 0) return alert('กรุณาพิมพ์ข้อความหรือแนบอย่างน้อย 1 บล็อค');
      if (!tenantId) return alert('ไม่พบ tenantId');

      const scheduledAtISO = buildScheduledAtISO();
      const headers = await authHeader();

      const url = editingId
        ? `/api/tenants/${tenantId}/broadcast/draft/${editingId}`
        : `/api/tenants/${tenantId}/broadcast/draft`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({
          recipient,
          messages,
          targetSummary,
          schedule: scheduledAtISO ? { at: scheduledAtISO, tz } : null,
          composer: blocks, // เก็บของจริงไว้เปิดมาแก้ได้
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'draft_failed');

      alert(
        scheduledAtISO
          ? (editingId ? 'อัปเดตกำหนดเวลาแล้ว' : 'บันทึกกำหนดเวลาสำเร็จ')
          : (editingId ? 'อัปเดตดราฟท์แล้ว' : 'บันทึกดราฟท์สำเร็จ')
      );
      navigate(`/homepage/broadcast?tenant=${tenantId}`);
    } catch (e) {
      console.error(e);
      alert('บันทึกไม่สำเร็จ: ' + (e?.message || e));
    } finally {
      setSavingDraft(false);
    }
  };

  const onSendTest = async () => {
    try {
      setSendingTest(true);
      const messages = toLineMessages();
      if (messages.length === 0) return alert('กรุณาพิมพ์ข้อความหรือแนบอย่างน้อย 1 บล็อค');
      if (!tenantId) return alert('ไม่พบ tenantId');

      const headers = await authHeader();
      const res = await fetch(`/api/tenants/${tenantId}/broadcast/test`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'send_test_failed');

      alert('ส่งข้อความทดสอบสำเร็จ (push ให้ผู้ส่ง)');
    } catch (e) {
      console.error(e);
      alert('ส่งทดสอบไม่สำเร็จ: ' + e.message);
    } finally {
      setSendingTest(false);
    }
  };

  const onSubmit = async () => {
    try {
      setSubmitting(true);

      const messages = toLineMessages();
      if (messages.length === 0) return alert('กรุณาพิมพ์ข้อความหรือแนบอย่างน้อย 1 บล็อค');
      if (!tenantId) return alert('ไม่พบ tenantId');

      const headers = await authHeader();

      if (sendType === 'now') {
        const res = await fetch(`/api/tenants/${tenantId}/broadcast`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            recipient,
            sendType: 'now',
            messages,
            targetSummary,
            composer: blocks,
          })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'broadcast_failed');
        alert('ส่ง Broadcast สำเร็จ');
        navigate(`/homepage/broadcast?tenant=${tenantId}`);
        return;
      }

      // schedule
      const scheduledAtISO = buildScheduledAtISO();
      if (!scheduledAtISO) return alert('กรุณาเลือกวันที่/เวลา/เขตเวลาให้ครบ');

      const url = editingId
        ? `/api/tenants/${tenantId}/broadcast/draft/${editingId}`
        : `/api/tenants/${tenantId}/broadcast/draft`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({
          recipient,
          messages,
          targetSummary,
          schedule: { at: scheduledAtISO, tz },
          composer: blocks,
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'schedule_failed');

      alert(editingId ? 'อัปเดตกำหนดเวลาแล้ว' : 'ตั้งเวลาส่งสำเร็จ');
      navigate(`/homepage/broadcast?tenant=${tenantId}`);
    } catch (e) {
      console.error(e);
      alert('ส่งไม่สำเร็จ: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------- Load draft for editing -----------------
  useEffect(() => {
    (async () => {
      if (!tenantId || !editingId) return;
      try {
        const headers = await authHeader();
        const res = await fetch(`/api/tenants/${tenantId}/broadcasts/${editingId}`, { headers });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'load_failed');

        setRecipient(j.recipient || 'all');

        // ใช้ composer เป็นหลัก
        if (Array.isArray(j.composer) && j.composer.length) {
          setBlocks(j.composer.map((blk, i) => ({ id: i + 1, ...blk })));
        } else {
          // fallback จาก messages (รองรับ text + image)
          const msgs = Array.isArray(j.messages) ? j.messages : [];
          const images = msgs
            .filter(m => m.type === 'image' && m.originalContentUrl)
            .map((m, i) => ({ id: i + 1, type: 'image', url: m.originalContentUrl, previewUrl: m.previewImageUrl || m.originalContentUrl }));
          const texts = msgs
            .filter(m => m.type === 'text' && typeof m.text === 'string')
            .map((m, i) => ({ id: images.length + i + 1, type: 'text', value: m.text }));
          const merged = [...images, ...texts];
          setBlocks(merged.length ? merged : [{ id: 1, type: 'text', value: '' }]);
        }

        if (j.status === 'scheduled' && j.scheduledAtISO) {
          const d = new Date(j.scheduledAtISO);
          const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
          setDate(isoLocal.slice(0, 10));
          setTime(isoLocal.slice(11, 16));
          setSendType('schedule');
          setTz(j.tz || '+07:00');
        } else {
          setSendType('now');
        }
      } catch (e) {
        console.error('[load draft]', e);
        alert('โหลด Draft ไม่สำเร็จ: ' + e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, editingId]);

  // ----------------- Render -----------------
  return (
    <Container sx={{ py: 4 }}>
      {/* Header buttons */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h4" fontWeight="bold">Broadcast</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            startIcon={<SaveIcon />}
            variant="contained"
            disabled={savingDraft || submitting}
            sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
            onClick={onSaveDraft}
          >
            {sendType === 'schedule' ? (savingDraft ? 'saving…' : 'save schedule') : (savingDraft ? 'saving…' : 'save draft')}
          </Button>
          <Button
            startIcon={<SendIcon />}
            variant="contained"
            disabled={sendingTest || submitting}
            sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
            onClick={onSendTest}
          >
            {sendingTest ? 'testing…' : 'send test'}
          </Button>
        </Stack>
      </Stack>

      {/* Recipients */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: .5 }}>Recipients</Typography>
        <FormControl>
          <RadioGroup row value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            <FormControlLabel value="all" control={<Radio />} label="All friends" />
            <FormControlLabel value="target" control={<Radio />} label="Targeting" />
          </RadioGroup>
          <FormHelperText sx={{ ml: 0, color: 'text.secondary' }}>
            You can narrow down your friends into smaller groups based on demographics or past actions. This can make your broadcasts more effective.
          </FormHelperText>
        </FormControl>
      </Box>

      {/* Broadcast time */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: .5 }}>Broadcast time</Typography>
        <FormControl>
          <RadioGroup value={sendType} onChange={(e) => setSendType(e.target.value)}>
            <FormControlLabel value="now" control={<Radio />} label="Send now" />
            <FormControlLabel
              value="schedule"
              control={<Radio />}
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    sx={{ width: 170 }}
                    disabled={sendType !== 'schedule'}
                    InputProps={{ startAdornment: <InputAdornment position="start"><ScheduleIcon fontSize="small" /></InputAdornment> }}
                  />
                  <TextField
                    size="small"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    sx={{ width: 120 }}
                    disabled={sendType !== 'schedule'}
                  />
                  <Select
                    size="small"
                    value={tz}
                    onChange={(e) => setTz(e.target.value)}
                    sx={{ minWidth: 120 }}
                    disabled={sendType !== 'schedule'}
                  >
                    {timezoneOptions.map(z => (
                      <MenuItem key={z.value} value={z.value}>
                        UTC {z.value}
                      </MenuItem>
                    ))}
                  </Select>
                </Stack>
              }
            />
          </RadioGroup>
        </FormControl>
      </Box>

      {/* Composer blocks */}
      <Stack spacing={2}>
        {blocks.map((b, idx) => (
          <Paper key={b.id} variant="outlined" sx={{ p: 1.5 }}>
            {/* Toolbar */}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, px: .5 }}>
              <Tooltip title="Text"><IconButton size="small" onClick={() => setBlockType(b.id, 'text')}><TextFormatIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Image"><IconButton size="small" onClick={() => pickFile(`image-${b.id}`)}><ImageIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="File"><IconButton size="small" onClick={() => pickFile(`file-${b.id}`)}><AttachFileIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Link"><IconButton size="small" onClick={() => setBlockType(b.id, 'link')}><LinkIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Rich">
                <IconButton size="small" onClick={() => { setBlockType(b.id, 'rich'); openRichPickerFor(b.id); }}>
                  <RichIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Duplicate">
                <IconButton size="small" onClick={() => setBlocks(prev => {
                  const copy = { ...b, id: nextId() };
                  return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
                })}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Remove block">
                <span><IconButton size="small" disabled={blocks.length === 1} onClick={() => removeBlock(b.id)}><CloseIcon fontSize="small" /></IconButton></span>
              </Tooltip>
            </Stack>

            {/* Hidden file pickers */}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              ref={el => (filePickersRef.current[`image-${b.id}`] = el)}
              onChange={(e) => onChooseFile(b.id, 'image', e)}
            />
            <input
              type="file"
              style={{ display: 'none' }}
              ref={el => (filePickersRef.current[`file-${b.id}`] = el)}
              onChange={(e) => onChooseFile(b.id, 'file', e)}
            />

            {/* Block bodies */}
            {b.type === 'text' && (
              <>
                <TextField
                  placeholder="Enter text"
                  multiline
                  minRows={5}
                  value={b.value || ''}
                  onChange={(e) => updateBlock(b.id, e.target.value)}
                  fullWidth
                  inputProps={{ maxLength: MAX_CHARS }}
                />
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: .5 }}>
                  <Button size="small" startIcon={<InsertEmoticonIcon />} onClick={() => insertEmoji(b.id, '😀')} sx={{ textTransform: 'none' }}>
                    Emoji
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    {(b.value || '').length}/{MAX_CHARS}
                  </Typography>
                </Stack>
              </>
            )}

            {b.type === 'image' && (
              <Box sx={{ p: 1 }}>
                {b.url ? (
                  <img src={b.previewUrl || b.url} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />
                ) : (
                  <Typography color="text.secondary">ยังไม่มีรูป (กดไอคอนรูปเพื่ออัปโหลด)</Typography>
                )}
              </Box>
            )}

            {b.type === 'file' && (
              <Box sx={{ p: 1 }}>
                {b.url ? (
                  <a href={b.url} target="_blank" rel="noreferrer">{b.fileName || 'Open file'}</a>
                ) : (
                  <Typography color="text.secondary">ยังไม่มีไฟล์ (กดไอคอนคลิปเพื่ออัปโหลด)</Typography>
                )}
              </Box>
            )}

            {b.type === 'link' && (
              <Stack spacing={1}>
                <TextField
                  label="Label (optional)"
                  size="small"
                  value={b.label || ''}
                  onChange={(e) => setBlocks(prev => prev.map(x => x.id === b.id ? { ...x, label: e.target.value } : x))}
                />
                <TextField
                  label="URL"
                  size="small"
                  placeholder="https://example.com"
                  value={b.url || ''}
                  onChange={(e) => setBlocks(prev => prev.map(x => x.id === b.id ? { ...x, url: e.target.value } : x))}
                />
              </Stack>
            )}

            {b.type === 'rich' && (
              <Box sx={{ p: 1 }}>
                {!b.rich ? (
                  <Typography color="text.secondary">ยังไม่ได้เลือก Rich message (กดไอคอน Rich เพื่อเลือก)</Typography>
                ) : (
                  <>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="subtitle2">{b.rich.name || '(Untitled)'}</Typography>
                      {b.rich.imagemap
                        ? <Chip size="small" color="success" label="Imagemap ready" />
                        : <Chip size="small" color="warning" label="Not published (send as image+links)" />}
                    </Stack>

                    {(() => {
                      const img =
                        b.rich?.image ||
                        b.rich?.imagemap?.urls?.[700] ||
                        b.rich?.imagemap?.urls?.[300] ||
                        b.rich?.imagemap?.urls?.[1040] ||
                        '';

                      return (
                        <Box sx={{ position: 'relative', borderRadius: 1, overflow: 'hidden', border: '1px dashed #ccc', background:'#f6f6f6' }}>
                          {img ? (
                            <img
                              src={img}
                              alt=""
                              style={{ width: '100%', display: 'block' }}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>No image</Box>
                          )}

                          {(b.rich.areas || []).map((a, i) => (
                            <Box
                              key={i}
                              sx={{
                                position: 'absolute',
                                left: `${a.x}%`, top: `${a.y}%`,
                                width: `${a.w}%`, height: `${a.h}%`,
                                border: '2px solid rgba(46,125,50,.8)',
                                background: 'rgba(102,187,106,.12)',
                              }}
                              title={a.label || a.url}
                            />
                          ))}
                        </Box>
                      );
                    })()}

                  </>
                )}
              </Box>
            )}
          </Paper>
        ))}
      </Stack>

      {/* Footer buttons */}
      <Grid container alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
        <Grid item><Button variant="outlined" onClick={addBlock}>+ Add</Button></Grid>
        <Grid item>
          <Button
            variant="contained"
            size="large"
            endIcon={<SendIcon />}
            disabled={!canSend || submitting || savingDraft}
            onClick={onSubmit}
            sx={{ bgcolor: '#66bb6a', px: 4, '&:hover': { bgcolor: '#57aa5b' } }}
          >
            {submitting ? (sendType === 'now' ? 'sending…' : 'scheduling…') : 'send'}
          </Button>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />
      <Button variant="text" onClick={() => navigate(-1)}>Back</Button>

      {/* Rich picker */}
      <RichMessagePicker open={richPickerOpen} onClose={() => setRichPickerOpen(false)} onSelect={handleRichPicked} />
    </Container>
  );
}
