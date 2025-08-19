// src/pages/RichMenusPage.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Card, CardContent, Container, Grid,
  MenuItem, Radio, RadioGroup, Select, Stack,
  TextField, Typography, Dialog, DialogTitle, DialogContent,
  DialogActions, Paper, FormControlLabel, Snackbar, Chip
} from '@mui/material';
import {
  Save as SaveIcon,
  SaveAlt as SaveAltIcon,
  Image as ImageIcon,
  CropSquare as AreaIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

// ============================= Consts =============================
const STORAGE_KEY = 'richMenuDraft';

// -------- Template presets (6×4 grid)
const TEMPLATES = [
  // Large
  { id: 'lg-1x1-1x1-1x1-1x1-1x1-1x1', label: 'Large • 6 blocks (2×2 × 6)', size: 'large',
    preview: [[0,0,2,2],[2,0,2,2],[4,0,2,2],[0,2,2,2],[2,2,2,2],[4,2,2,2]] },
  { id: 'lg-3+3+full', label: 'Large • 3 blocks (3×2,3×2,6×2)', size: 'large',
    preview: [[0,0,3,2],[3,0,3,2],[0,2,6,2]] },
  { id: 'lg-2+2+2', label: 'Large • 3 blocks (2×4 × 3)', size: 'large',
    preview: [[0,0,2,4],[2,0,2,4],[4,0,2,4]] },
  { id: 'lg-4+2', label: 'Large • 2 blocks (4×4,2×4)', size: 'large',
    preview: [[0,0,4,4],[4,0,2,4]] },
  { id: 'lg-2+4', label: 'Large • 2 blocks (2×4,4×4)', size: 'large',
    preview: [[0,0,2,4],[2,0,4,4]] },
  { id: 'lg-1', label: 'Large • 1 block (full)', size: 'large',
    preview: [[0,0,6,4]] },

  // Compact
  { id: 'cp-3+3+3+3', label: 'Compact • 4 blocks (3×2 × 4)', size: 'compact',
    preview: [[0,0,3,2],[3,0,3,2],[0,2,3,2],[3,2,3,2]] },
  { id: 'cp-2+2+2', label: 'Compact • 3 blocks (2×4 × 3)', size: 'compact',
    preview: [[0,0,2,4],[2,0,2,4],[4,0,2,4]] },
  { id: 'cp-4+2', label: 'Compact • 2 blocks (4×4,2×4)', size: 'compact',
    preview: [[0,0,4,4],[4,0,2,4]] },
  { id: 'cp-2+4', label: 'Compact • 2 blocks (2×4,4×4)', size: 'compact',
    preview: [[0,0,2,4],[2,0,4,4]] },
  { id: 'cp-1', label: 'Compact • 1 block (full)', size: 'compact',
    preview: [[0,0,6,4]] },
];

// -------- Action choices
const ACTION_OPTIONS = ['Select', 'Link', 'Text', 'QnA', 'Live Chat', 'No action'];

// ---- utilities
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const pctClamp = (n) => Math.round(clamp(Number(n) || 0, 0, 100) * 100) / 100;

const readDraft = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } };
// eslint-disable-next-line no-unused-vars
const writeDraft = (obj) => localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));

// Convert local file to 2500x(1686|843) JPEG <= ~1MB (สำหรับอัปโหลดจริง)
async function drawToSize(file, targetW, targetH, mime='image/jpeg') {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    const scale = Math.max(targetW / img.width, targetH / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    const dx = (targetW - dw) / 2, dy = (targetH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);

    const qualities = [0.9, 0.8, 0.75, 0.7, 0.65, 0.6];
    for (const q of qualities) {
      const blob = await new Promise(r => canvas.toBlob(r, mime, q));
      if (!blob) continue;
      if (blob.size <= 1024 * 1024) return blob;
      if (q === qualities[qualities.length - 1]) return blob;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ============================= Action Editor =============================
function ActionEditor({ idx, action, onChange }) {
  const update = (patch) => onChange({ ...action, ...patch });

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" fontWeight="bold">Block {idx + 1}</Typography>
        <Box sx={{ flex: 1 }} />
        <Select size="small" value={action.type} onChange={(e) => update({ type: e.target.value })} sx={{ minWidth: 220 }}>
          {ACTION_OPTIONS.map((opt) => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
        </Select>
      </Stack>

      {action.type === 'Link' && (
        <Stack spacing={1}>
          <TextField label="URL" value={action.url || ''} onChange={(e) => update({ url: e.target.value })} />
          <TextField label="Label (≤20)" value={action.label || ''} onChange={(e) => update({ label: (e.target.value || '').slice(0, 20) })} />
          <Typography variant="caption" color="text.secondary">จะถูกส่งเป็น <Chip size="small" label="URI action" /> ใน LINE</Typography>
        </Stack>
      )}

      {action.type === 'Text' && (
        <Stack spacing={1}>
          <TextField fullWidth label="Message text" value={action.text || ''} onChange={(e) => update({ text: (e.target.value || '').slice(0, 300) })} />
          <Typography variant="caption" color="text.secondary">จะถูกส่งเป็น <Chip size="small" label="Message" /> ให้ผู้ใช้</Typography>
        </Stack>
      )}

      {action.type === 'QnA' && (
        <Stack spacing={1}>
          <TextField label="QnA key / id" value={action.qnaKey || ''} onChange={(e) => update({ qnaKey: e.target.value })} />
          <TextField label="Display text (optional)" value={action.displayText || ''} onChange={(e) => update({ displayText: (e.target.value || '').slice(0, 300) })} />
          <Typography variant="caption" color="text.secondary">
            จะส่งเป็น <Chip size="small" label="postback" /> data: <code>{`qna:${action.qnaKey || '...'}`}</code>
          </Typography>
        </Stack>
      )}

      {action.type === 'Live Chat' && (
        <Stack spacing={1}>
          <TextField label="Message to trigger live chat" value={action.liveText ?? '#live'} onChange={(e) => update({ liveText: e.target.value })} />
          <Typography variant="caption" color="text.secondary">ค่าดีฟอลต์คือ <code>#live</code></Typography>
        </Stack>
      )}

      {action.type === 'No action' && (
        <Typography variant="body2" color="text.secondary">บล็อกนี้จะไม่ทำอะไร</Typography>
      )}
    </Paper>
  );
}

// ============================= Template Picker =============================
function TemplateModal({ open, onClose, value, onApply }) {
  const [selected, setSelected] = useState(value?.id || TEMPLATES[0].id);
  useEffect(() => { if (value?.id) setSelected(value.id); }, [value]);

  const renderTile = (t) => (
    <Grid item xs={12} sm={6} md={4} key={t.id}>
      <Paper
        variant="outlined"
        onClick={() => setSelected(t.id)}
        sx={{ p: 1, cursor: 'pointer', outline: selected === t.id ? '2px solid #66bb6a' : 'none', borderRadius: 2 }}
      >
        <Typography variant="subtitle2" sx={{ mb: .5 }}>{t.label}</Typography>
        <Box sx={{ position: 'relative', width: '100%', pt: '66%', bgcolor: '#f5f5f5', borderRadius: 1, overflow: 'hidden' }}>
          {t.preview.map((cell, i) => {
            const [x, y, w, h] = cell;
            const left = (x / 6) * 100, top = (y / 4) * 100, width = (w / 6) * 100, height = (h / 4) * 100;
            return (
              <Box key={i} sx={{
                position: 'absolute', left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`,
                border: '2px solid rgba(76,175,80,.9)', background: 'rgba(76,175,80,.15)', borderRadius: 1,
              }} />
            );
          })}
        </Box>
      </Paper>
    </Grid>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Select a template</DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Large</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {TEMPLATES.filter(t => t.size === 'large').map(renderTile)}
        </Grid>

        <Typography variant="subtitle1" sx={{ mb: 1 }}>Compact</Typography>
        <Grid container spacing={2}>
          {TEMPLATES.filter(t => t.size === 'compact').map(renderTile)}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => onApply(TEMPLATES.find(x => x.id === selected) || TEMPLATES[0])}
          sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================= Page =============================
export default function RichMenusPage() {
  const { tenantId } = useOutletContext() || {};
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const draftId = sp.get('draft') || '';

  const [snack, setSnack] = useState('');
  const [templateOpen, setTemplateOpen] = useState(false);

  // ค่าเริ่มต้น: title ว่าง
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState(TEMPLATES.find(t => t.id === 'lg-3+3+full') || TEMPLATES[0]);

  const [image, setImage] = useState('');
  const [menuBarLabel, setMenuBarLabel] = useState('Menu');
  const [behavior, setBehavior] = useState('shown');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // areas
  const gridToAreas = (cells) =>
    cells.map((c, i) => {
      const [x, y, w, h] = c;
      return {
        id: `A${i + 1}`,
        x: pctClamp((x / 6) * 100),
        y: pctClamp((y / 4) * 100),
        w: pctClamp((w / 6) * 100),
        h: pctClamp((h / 4) * 100),
      };
    });

  const _tpl0 = TEMPLATES.find(t => t.id === 'lg-3+3+full') || TEMPLATES[0];
  const [areas, setAreas] = useState(() => gridToAreas(_tpl0.preview));
  const [actions, setActions] = useState(() => Array.from({ length: _tpl0.preview.length }, () => ({ type: 'Select' })));

  // overlay & drag
  const overlayRef = useRef(null);
  const [selected, setSelected] = useState('A1');
  const [drag, setDrag] = useState(null);
  const MIN_W = 5, MIN_H = 5;

  // file upload
  const fileRef = useRef(null);

  // --- helper: ISO/Timestamp -> datetime-local string
  const toInputLocal = (v) => {
    if (!v) return '';
    let d = v;
    if (v?.toDate) d = v.toDate();
    if (typeof v === 'string') d = new Date(v);
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // โหลด “รายละเอียดจาก Firestore” เมื่อมี ?draft= และมี tenantId
  useEffect(() => {
    const run = async () => {
      if (!tenantId || !draftId) return;
      try {
        const snap = await getDoc(doc(db, 'tenants', tenantId, 'richmenus', draftId));
        if (!snap.exists()) return;
        const data = snap.data() || {};

        // ขนาดเมนู / template (เดาเลย์เอาต์จากจำนวนพื้นที่เดิมไม่ได้ จึงคงพื้นที่เดิมไว้)
        setTemplate((prev) => (prev.size === data.size ? prev : (TEMPLATES.find(t => t.size === data.size) || prev)));

        setTitle(data.title || '');
        setImage(data.imageUrl || '');
        setMenuBarLabel(data.chatBarText || 'Menu');
        setBehavior(data.defaultBehavior || 'shown');

        // areas & actions
        const areasIn = Array.isArray(data.areas) ? data.areas : [];
        const areasPct = areasIn.map((a, i) => ({
          id: `A${i+1}`,
          x: pctClamp((Number(a.xPct)||0)*100),
          y: pctClamp((Number(a.yPct)||0)*100),
          w: pctClamp((Number(a.wPct)||0)*100),
          h: pctClamp((Number(a.hPct)||0)*100),
        }));
        setAreas(areasPct);
        setActions(areasIn.map((a)=>a.action || { type:'Select' }));

        // schedule
        setPeriodFrom(toInputLocal(data.scheduleFrom || data.schedule?.from));
        setPeriodTo(toInputLocal(data.scheduleTo || data.schedule?.to));
      } catch (e) {
        console.warn('load draft failed', e);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, draftId]);

  // โหลดดราฟท์จาก localStorage (กรณีสร้างใหม่)
  useEffect(() => {
    if (draftId) return; // มี draft -> ข้าม
    const d = readDraft();
    if (d?.title) setTitle(d.title);
    if (d?.menuBarLabel != null) setMenuBarLabel(d.menuBarLabel);
    if (d?.behavior) setBehavior(d.behavior);
    if (Array.isArray(d?.areas) && d.areas.length) setAreas(d.areas);
    if (Array.isArray(d?.actions) && d.actions.length) setActions(d.actions);
    if (d?.image) setImage(d.image);
    if (d?.templateId) {
      const found = TEMPLATES.find(t => t.id === d.templateId);
      if (found) setTemplate(found);
    }
    if (d?.periodFrom) setPeriodFrom(d.periodFrom);
    if (d?.periodTo) setPeriodTo(d.periodTo);
  }, [draftId]);

  const canSave = useMemo(() => title.trim().length > 0 && !!image, [title, image]);

  const applyTemplate = (tpl) => {
    setTemplate(tpl);
    const nextAreas = gridToAreas(tpl.preview);
    setAreas(nextAreas);
    setActions((prev) => {
      const base = prev.concat(Array.from({ length: Math.max(0, nextAreas.length - prev.length) }, () => ({ type: 'Select' })));
      return base.slice(0, nextAreas.length);
    });
    setSelected(nextAreas[0]?.id || null);
  };

  const uploadImage = async (file) => {
    if (!tenantId) { setSnack('กรุณาเลือก OA ก่อน'); return; }
    const targetH = template.size === 'compact' ? 843 : 1686;
    try {
      const blob = await drawToSize(file, 2500, targetH, 'image/jpeg');
      if (!blob) { setSnack('แปลงรูปไม่สำเร็จ'); return; }
      const base = (file.name || 'menu').replace(/\.[^.]+$/, '');
      const safeName = `${base.replace(/\s+/g, '-')}.jpg`;
      const r = sref(storage, `tenants/${tenantId}/rich-menus/${Date.now()}-${safeName}`);
      await uploadBytes(r, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(r);
      setImage(url);
      setSnack(`อัปโหลดรูปสำเร็จ (${Math.round(blob.size/1024)} KB)`);
    } catch (e) {
      console.error(e);
      setSnack('อัปโหลดรูปไม่สำเร็จ');
    }
  };

  const updateArea = (id, patch) => setAreas(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  const addArea = () => {
    const id = `A${areas.length + 1}`;
    setAreas(prev => [...prev, { id, x: 5, y: 5, w: 40, h: 20 }]);
    setActions(prev => [...prev, { type: 'Select' }]);
    setSelected(id);
  };
  const removeArea = (id) => {
    const idx = areas.findIndex(a => a.id === id);
    setAreas(prev => prev.filter(a => a.id !== id));
    setActions(prev => prev.filter((_, i) => i !== idx));
    if (selected === id) setSelected(null);
  };

  const startMove = (id, e) => {
    e.stopPropagation();
    const a = areas.find(x => x.id === id); if (!a) return;
    const rect = overlayRef.current.getBoundingClientRect();
    setDrag({
      id, mode: 'move', startX: e.clientX, startY: e.clientY,
      startRect: { x: a.x, y: a.y, w: a.w, h: a.h },
      box: { w: rect.width, h: rect.height },
    });
    setSelected(id);
  };
  const startResize = (id, handle, e) => {
    e.stopPropagation();
    const a = areas.find(x => x.id === id); if (!a) return;
    const rect = overlayRef.current.getBoundingClientRect();
    setDrag({
      id, mode: 'resize', handle,
      startX: e.clientX, startY: e.clientY,
      startRect: { x: a.x, y: a.y, w: a.w, h: a.h },
      box: { w: rect.width, h: rect.height },
    });
    setSelected(id);
  };
  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const dxPct = ((e.clientX - drag.startX) / drag.box.w) * 100;
      const dyPct = ((e.clientY - drag.startY) / drag.box.h) * 100;
      if (drag.mode === 'move') {
        let nx = pctClamp(drag.startRect.x + dxPct);
        let ny = pctClamp(drag.startRect.y + dyPct);
        nx = clamp(nx, 0, 100 - drag.startRect.w);
        ny = clamp(ny, 0, 100 - drag.startRect.h);
        updateArea(drag.id, { x: nx, y: ny });
      } else {
        const s = drag.startRect;
        let { x, y, w, h } = s;
        const has = (k) => drag.handle.includes(k);
        if (has('e')) w = clamp(s.w + dxPct, MIN_W, 100 - s.x);
        if (has('s')) h = clamp(s.h + dyPct, MIN_H, 100 - s.y);
        if (has('w')) { const nx = clamp(s.x + dxPct, 0, s.x + s.w - MIN_W); w = clamp(s.w - (nx - s.x), MIN_W, 100); x = nx; }
        if (has('n')) { const ny = clamp(s.y + dyPct, 0, s.y + s.h - MIN_H); h = clamp(s.h - (ny - s.y), MIN_H, 100); y = ny; }
        x = clamp(x, 0, 100 - w); y = clamp(y, 0, 100 - h);
        updateArea(drag.id, { x: pctClamp(x), y: pctClamp(y), w: pctClamp(w), h: pctClamp(h) });
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag]); // eslint-disable-line

  // ============================= Save / API =============================
  const authHeader = async () => {
    if (!auth.currentUser) throw new Error('ยังไม่พบผู้ใช้ที่ล็อกอิน');
    const idToken = await auth.currentUser.getIdToken();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` };
  };

  const normalizeImageUrl = (u) => {
    try {
      if (String(u).startsWith('data:')) throw new Error('กรุณาอัปโหลดภาพขึ้น Storage ให้ได้ URL ก่อน');
      const url = new URL(u);
      const host = url.hostname;
      const isFirebaseDl =
        host.includes('firebasestorage.googleapis.com') ||
        host.includes('storage.googleapis.com') ||
        host.includes('firebasestorage.app');
      if (isFirebaseDl && !url.searchParams.has('alt')) url.searchParams.set('alt', 'media');
      return url.toString();
    } catch { return u; }
  };

  const toNormalized = (a, i) => {
    const act = actions[i] || { type: 'No action' };
    return {
      xPct: pctClamp(a.x) / 100,
      yPct: pctClamp(a.y) / 100,
      wPct: pctClamp(a.w) / 100,
      hPct: pctClamp(a.h) / 100,
      action: act,
    };
  };

  const buildPayload = (includeSchedule = false) => ({
    title,
    size: template.size,
    imageUrl: normalizeImageUrl(image),
    chatBarText: menuBarLabel || 'Menu',
    defaultBehavior: behavior,
    areas: areas.map(toNormalized),
    schedule: includeSchedule && periodFrom
      ? {
          from: new Date(periodFrom).toISOString(),
          to: periodTo ? new Date(periodTo).toISOString() : null,
        }
      : null,
  });

  const onSaveDraft = async () => {
    try {
      if (!tenantId) return alert('กรุณาเลือก OA ก่อน');
      if (!image)   return alert('กรุณาอัปโหลดรูปเมนู');
      const headers = await authHeader();
      const res = await fetch(`/api/tenants/${tenantId}/richmenus`, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildPayload(false)),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || 'save failed');
      setSnack('Saved as Ready');
      navigate(`/homepage/rich-menus?tenant=${tenantId || ''}`);
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + (e?.message || e));
    }
  };

  // Save = ถ้าไม่มีช่วงเวลา -> Active เดี๋ยวนี้ (call /set-default)
  const onSaveReady = async () => {
    try {
      if (!tenantId) return alert('กรุณาเลือก OA ก่อน');
      if (!image)   return alert('กรุณาอัปโหลดรูปเมนู');

      const headers = await authHeader();
      const hasSchedule = !!periodFrom;

      const res = await fetch(`/api/tenants/${tenantId}/richmenus`, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildPayload(hasSchedule)),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || 'save failed');
      const json = JSON.parse(text || '{}');

      if (!hasSchedule && json?.richMenuId) {
        await fetch(`/api/tenants/${tenantId}/richmenus/set-default`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ richMenuId: json.richMenuId })
        }).catch(()=>{});
        setSnack('Saved & Activated');
      } else {
        setSnack(hasSchedule ? 'Saved as Scheduled' : 'Saved');
      }
      navigate(`/homepage/rich-menus?tenant=${tenantId || ''}`);
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + (e?.message || e));
    }
  };

  // ============================= Render =============================
  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="outlined" onClick={() => navigate(`/homepage/rich-menus?tenant=${tenantId || ''}`)}>
            Back to list
          </Button>
          <Typography variant="h4" fontWeight="bold">Rich menu</Typography>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<SaveAltIcon />} onClick={onSaveDraft}>Save draft</Button>
          <Button variant="contained" startIcon={<SaveIcon />} disabled={!canSave} onClick={onSaveReady}
            sx={{ bgcolor: "#66bb6a", "&:hover": { bgcolor: "#57aa5b" } }}>
            Save
          </Button>
        </Stack>
      </Stack>

      {/* Main settings */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Title (for management)"
                fullWidth
                value={title}
                onChange={(e) => setTitle((e.target.value || "").slice(0, 30))}
                helperText={`${title.length}/30`}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ height: "100%" }}>
                <TextField
                  label="Chat bar label"
                  size="small"
                  value={menuBarLabel}
                  onChange={(e) => setMenuBarLabel((e.target.value || "").slice(0, 14))}
                  helperText={`${menuBarLabel.length}/14`}
                />
                <RadioGroup row value={behavior} onChange={(e) => setBehavior(e.target.value)}>
                  <FormControlLabel value="shown" control={<Radio />} label="Shown" />
                  <FormControlLabel value="collapsed" control={<Radio />} label="Collapsed" />
                </RadioGroup>
              </Stack>
            </Grid>

            {/* Display period */}
            <Grid item xs={12} md={6}>
              <Stack direction="row" spacing={2}>
                <TextField label="Display from" type="datetime-local" size="small"
                  value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)}
                  sx={{ minWidth: 220 }} InputLabelProps={{ shrink: true }} />
                <TextField label="to" type="datetime-local" size="small"
                  value={periodTo} onChange={(e) => setPeriodTo(e.target.value)}
                  sx={{ minWidth: 220 }} InputLabelProps={{ shrink: true }} />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                ถ้าเว้นว่าง ระบบจะสร้างเป็น Ready โดยไม่มีตารางเวลา (ไม่ตั้ง default อัตโนมัติ)
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2} alignItems="flex-start">
        {/* LEFT: preview + image + overlay */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">Menu image & areas</Typography>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => applyTemplate(template)}>Reset to template</Button>
                  <Button variant="outlined" onClick={() => setTemplateOpen(true)}>Template</Button>
                  <Button variant="outlined" startIcon={<ImageIcon />} onClick={() => fileRef.current?.click()}>Change</Button>
                  <input ref={fileRef} type="file" accept="image/*" hidden
                    onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
                </Stack>
              </Stack>

              <Box
                ref={overlayRef}
                sx={{
                  position: "relative",
                  border: "1px dashed #ccc",
                  borderRadius: 1,
                  overflow: "hidden",
                  background: "#fafafa",
                  aspectRatio: template.size === "compact" ? "2500 / 843" : "2500 / 1686",
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseDown={() => setSelected(null)}
              >
                {image ? (
                  <img src={image} alt="" style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }} />
                ) : (
                  <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "text.secondary" }}>
                    <Typography>No image</Typography>
                  </Box>
                )}

                {areas.map((a, idx) => {
                  const isSel = a.id === selected;
                  return (
                    <Box
                      key={a.id}
                      onMouseDown={(e) => startMove(a.id, e)}
                      onClick={(e) => { e.stopPropagation(); setSelected(a.id); }}
                      sx={{
                        position: "absolute",
                        left: `${pctClamp(a.x)}%`, top: `${pctClamp(a.y)}%`,
                        width: `${pctClamp(a.w)}%`, height: `${pctClamp(a.h)}%`,
                        border: "2px solid", borderColor: isSel ? "#2e7d32" : "rgba(46,125,50,.5)",
                        background: isSel ? "rgba(102,187,106,.15)" : "rgba(102,187,106,.08)",
                        cursor: "move",
                      }}
                      title={`Block ${idx + 1}`}
                    >
                      {["nw","n","ne","e","se","s","sw","w"].map((h) => (
                        <Box key={h} onMouseDown={(e) => startResize(a.id, h, e)}
                          sx={{
                            position: "absolute", width: 10, height: 10,
                            bgcolor: isSel ? "#2e7d32" : "#66bb6a", borderRadius: "2px",
                            ...(h === "nw" && { left: -5, top: -5 }),
                            ...(h === "n"  && { left: "calc(50% - 5px)", top: -5 }),
                            ...(h === "ne" && { right: -5, top: -5 }),
                            ...(h === "e"  && { right: -5, top: "calc(50% - 5px)" }),
                            ...(h === "se" && { right: -5, bottom: -5 }),
                            ...(h === "s"  && { left: "calc(50% - 5px)", bottom: -5 }),
                            ...(h === "sw" && { left: -5, bottom: -5 }),
                            ...(h === "w"  && { left: -5, top: "calc(50% - 5px)" }),
                          }}
                        />
                      ))}
                    </Box>
                  );
                })}
              </Box>

              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button startIcon={<AreaIcon />} onClick={addArea}>Add area</Button>
                {selected && (
                  <Button color="error" startIcon={<DeleteIcon />} onClick={() => removeArea(selected)}>
                    Remove selected
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* RIGHT: actions per block */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Actions</Typography>
              {areas.map((a, i) => (
                <ActionEditor
                  key={a.id}
                  idx={i}
                  action={actions[i] || { type: "Select" }}
                  onChange={(next) => setActions((prev) => prev.map((p, idx) => (idx === i ? next : p)))}
                />
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <TemplateModal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        value={template}
        onApply={(tpl) => { setTemplateOpen(false); applyTemplate(tpl); setSnack("Template applied"); }}
      />

      <Snackbar open={!!snack} autoHideDuration={2200} onClose={() => setSnack("")} message={snack} />
    </Container>
  );
}
