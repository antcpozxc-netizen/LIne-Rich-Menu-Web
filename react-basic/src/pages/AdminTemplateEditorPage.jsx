// src/pages/AdminTemplateEditorPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Container, Divider, Grid, Stack, TextField, Typography,
  Chip, Paper, Autocomplete, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Save as SaveIcon, ArrowBack as BackIcon, Image as ImageIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { auth, storage } from '../firebase';
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CATEGORY_OPTIONS } from '../constants/categories';

// helper
async function authedFetch(url, opts = {}) {
  const token = await auth.currentUser?.getIdToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}), Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...opts, headers });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt || res.statusText);
  return txt ? JSON.parse(txt) : {};
}

async function drawToSize(file, targetW, targetH, mime='image/jpeg') {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    // cover: ขยายจนเต็มแล้วครอปส่วนเกิน
    const scale = Math.max(targetW / img.width, targetH / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    const dx = (targetW - dw) / 2, dy = (targetH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    return await new Promise(r => canvas.toBlob(r, mime, 0.9));
  } finally { URL.revokeObjectURL(url); }
}
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const pct = (n) => Math.round(Math.max(0, Math.min(100, Number(n) || 0)) * 100) / 100;

const makeAreasFromTpl = (tpl) =>
  tpl.preview.map(([x,y,w,h]) => ({
    xPct: x/6, yPct: y/4, wPct: w/6, hPct: h/4,
    action: { type: 'Link' },
  }));

// ---------- Preset templates ----------
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

function TemplateModal({ open, onClose, value, onApply }) {
  const [selected, setSelected] = useState(value?.id || TEMPLATES[0].id);
  useEffect(() => { if (value?.id) setSelected(value.id); }, [value]);

  const Thumb = ({ t }) => {
    const isSel = selected === t.id;
    const isCompact = t.size === 'compact';
    // สัดส่วนคร่าว ๆ ให้ดูคล้ายตัวอย่าง
    const pt = isCompact ? '33%' : '45%';

    return (
      <Paper
        variant="outlined"
        onClick={() => setSelected(t.id)}
        sx={{
          p: 1,
          cursor: 'pointer',
          borderRadius: 2,
          outline: isSel ? '2px solid #66bb6a' : 'none',
        }}
      >
        <Box sx={{ fontSize: 12, color: 'text.secondary', mb: 0.5 }}>
          {t.label}
        </Box>
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            pt,                          // รักษาสัดส่วน
            bgcolor: '#f1f3f4',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          {/* วาดเส้นบาง ๆ ให้เหมือน wireframe */}
          {t.preview.map((cell, i) => {
            const [x, y, w, h] = cell;
            const left = (x / 6) * 100;
            const top = (y / 4) * 100;
            const width = (w / 6) * 100;
            const height = (h / 4) * 100;
            return (
              <Box
                key={i}
                sx={{
                  position: 'absolute',
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  border: '1px solid #cfd8dc',   // เส้นบาง สีเทาอ่อน
                  background: 'rgba(0,0,0,0.02)', // เติมนิด ๆ ให้เห็นแยกบล็อก
                  borderRadius: 0.5,
                }}
              />
            );
          })}
        </Box>
      </Paper>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Select a template</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Large</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          A larger menu for displaying more items.
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {TEMPLATES.filter(t => t.size === 'large').map(t => (
            <Grid item xs={12} sm={6} md={3} key={t.id}>
              <Thumb t={t} />
            </Grid>
          ))}
        </Grid>

        <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Compact</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          A less obtrusive menu to be used together with chat functions.
        </Typography>
        <Grid container spacing={2}>
          {TEMPLATES.filter(t => t.size === 'compact').map(t => (
            <Grid item xs={12} sm={6} md={3} key={t.id}>
              <Thumb t={t} />
            </Grid>
          ))}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button
          variant="contained"
          onClick={() => onApply(TEMPLATES.find(x => x.id === selected) || TEMPLATES[0])}
          sx={{ bgcolor: '#43a047', '&:hover': { bgcolor: '#388e3c' } }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}


// inline action editor
function ActionEditor({ action, onChange }) {
  return (
    <Stack spacing={1}>
      <TextField
        select
        size="small"
        label="Type"
        value={action?.type || 'Link'}
        onChange={(e) => onChange({ ...(action || {}), type: e.target.value })}
        SelectProps={{ native: true }}
      >
        <option>Link</option><option>Text</option><option>No action</option>
      </TextField>

      {(action?.type === 'Link') && (
        <Stack direction="row" spacing={1}>
          <TextField size="small" label="URL" value={action.url || ''} onChange={(e) => onChange({ ...action, url: e.target.value })} fullWidth />
          <TextField size="small" label="Label" value={action.label || ''} onChange={(e) => onChange({ ...action, label: (e.target.value || '').slice(0, 20) })} sx={{ maxWidth: 200 }} />
        </Stack>
      )}

      {(action?.type === 'Text') && (
        <TextField size="small" label="Message" value={action.text || ''} onChange={(e) => onChange({ ...action, text: (e.target.value || '').slice(0, 300) })} fullWidth />
      )}
    </Stack>
  );
}

export default function AdminTemplateEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [sp]   = useSearchParams();

  const [form, setForm] = useState({
    title: '', size: 'large', imageUrl: '', chatBarText: 'Menu',
    category: '', tags: '', note: '', areas: []
  });
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // template picker
  const [tplOpen, setTplOpen] = useState(false);
  const [tplValue, setTplValue] = useState(TEMPLATES.find(t => t.id === 'lg-3+3+full') || TEMPLATES[0]);

  const applyTemplate = (tpl) => {
    setTplValue(tpl);
    const areas = tpl.preview.map(([x,y,w,h]) => ({
        xPct: x/6, yPct: y/4, wPct: w/6, hPct: h/4,
        action: { type: 'Link' }                    // ใส่ action เริ่มต้น
    }));
    setForm(f => ({ ...f, size: tpl.size, areas }));
    setSelectedIndex(0);
  };



  // เมื่อเปลี่ยน size จาก dropdown ให้ sync ค่า template ที่โชว์ใน modal ด้วย
  useEffect(() => {
    const firstOfSize = TEMPLATES.find(t => t.size === form.size);
    if (firstOfSize && firstOfSize.id !== tplValue.id) setTplValue(firstOfSize);
  }, [form.size]); // eslint-disable-line

  // load when editing
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const j = await authedFetch(`/api/admin/templates/${id}`);
        setForm({
          title: j.title || '',
          size: j.size || 'large',
          imageUrl: j.imageUrl || '',
          chatBarText: j.chatBarText || 'Menu',
          category: j.category || '',
          tags: Array.isArray(j.tags) ? j.tags.join(', ') : (j.tags || ''),
          note: j.note || '',
          areas: Array.isArray(j.areas) ? j.areas : []
        });
      } catch (e) { setError(e?.message || String(e)); }
      finally { setLoading(false); }
    })();
  }, [id]);

  // upload
  const fileRef = useRef(null);
  const uploadImage = async (file) => {
    try {
        // เดาสัดส่วนรูป
        let nearest = 'large';
        const urlObj = URL.createObjectURL(file);
        await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const ratio = img.height / img.width;     // ~0.337=compact, ~0.674=large
            nearest = Math.abs(ratio - 0.337) < Math.abs(ratio - 0.674) ? 'compact' : 'large';
            URL.revokeObjectURL(urlObj);
            resolve();
        };
        img.src = urlObj;
        });

        // ตั้งเทมเพลต/พื้นที่ตามขนาดนั้น
        const tpl = TEMPLATES.find(t => t.size === nearest) || TEMPLATES[0];
        setTplValue(tpl);
        setForm(f => ({ ...f, size: nearest, areas: makeAreasFromTpl(tpl) }));
        setSelectedIndex(0);

        // แปลง & อัปโหลดตาม spec
        const targetH = (nearest === 'compact') ? 843 : 1686;
        const blob = await drawToSize(file, 2500, targetH, 'image/jpeg');
        const safe = `${Date.now()}-${file.name.replace(/\s+/g,'-').replace(/\.[^.]+$/, '')}.jpg`;
        const r = sref(storage, `public/admin-templates/${safe}`);
        await uploadBytes(r, blob, { contentType: 'image/jpeg' });
        const url = await getDownloadURL(r);
        setForm(f => ({ ...f, imageUrl: url }));
    } catch (e) {
        alert('อัปโหลดรูปไม่สำเร็จ: ' + (e?.message || e));
    }
    };


  const previewWidth = 900;
  const baseW = 2500;
  const effectiveSize = form.size || tplValue.size;   // ใช้จาก state/เทมเพลต
  const baseH = effectiveSize === 'compact' ? 843 : 1686;
  const previewHeight = Math.round(previewWidth * baseH / baseW);

  // drag & resize
  const MIN_W = 0.05, MIN_H = 0.05; // 5%
  const overlayRef = useRef(null);
  const dragRef = useRef(null);

  const startMove = (i, e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    dragRef.current = {
      i, mode: 'move',
      startX: e.clientX, startY: e.clientY,
      boxW: rect.width, boxH: rect.height,
      start: form.areas[i]
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const startResize = (i, handle, e) => {
    e.stopPropagation();
    const rect = overlayRef.current.getBoundingClientRect();
    dragRef.current = {
      i, mode: 'resize', handle,
      startX: e.clientX, startY: e.clientY,
      boxW: rect.width, boxH: rect.height,
      start: form.areas[i]
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const dx = ((e.clientX - d.startX) / d.boxW);
    const dy = ((e.clientY - d.startY) / d.boxH);
    const s  = d.start;

    if (d.mode === 'move') {
      let nx = clamp01((Number(s.xPct)||0) + dx);
      let ny = clamp01((Number(s.yPct)||0) + dy);
      nx = Math.max(0, Math.min(nx, 1 - (s.wPct||0)));
      ny = Math.max(0, Math.min(ny, 1 - (s.hPct||0)));
      setForm(f => {
        const A = [...f.areas];
        A[d.i] = { ...A[d.i], xPct: nx, yPct: ny };
        return { ...f, areas: A };
      });
    } else {
      let { xPct:x, yPct:y, wPct:w=0.4, hPct:h=0.2 } = s;
      const has = (k) => d.handle.includes(k);

      if (has('e')) w = Math.max(MIN_W, Math.min(1 - x, (s.wPct||0) + dx));
      if (has('s')) h = Math.max(MIN_H, Math.min(1 - y, (s.hPct||0) + dy));
      if (has('w')) { const nx = clamp01(x + dx); const nw = (s.wPct||0) - (nx - x); x = nx; w = Math.max(MIN_W, nw); }
      if (has('n')) { const ny = clamp01(y + dy); const nh = (s.hPct||0) - (ny - y); y = ny; h = Math.max(MIN_H, nh); }

      // keep in bounds
      x = Math.max(0, Math.min(x, 1 - w));
      y = Math.max(0, Math.min(y, 1 - h));

      setForm(f => {
        const A = [...f.areas];
        A[d.i] = { ...A[d.i], xPct:x, yPct:y, wPct:w, hPct:h };
        return { ...f, areas: A };
      });
    }
  };

  const onMouseUp = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  const addArea = () => setForm(f => ({
    ...f,
    areas: [...f.areas, { xPct: .05, yPct: .05, wPct: .4, hPct: .2, action: { type: 'Link' } }]
  }));
  const removeArea = (idx) =>
    setForm(f => ({ ...f, areas: f.areas.filter((_, i) => i !== idx) }));

  const save = async () => {
    if (!form.imageUrl) return alert('กรุณาอัปโหลดรูปเมนู');
    setSaving(true);
    try {
      const payload = { ...form, tags: (form.tags || '').split(',').map(s => s.trim()).filter(Boolean) };
      if (id) await authedFetch(`/api/admin/templates/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else    await authedFetch('/api/admin/templates', { method: 'POST', body: JSON.stringify(payload) });
      navigate(`/homepage/admin/templates${sp.get('tenant') ? `?tenant=${sp.get('tenant')}` : ''}`, { replace: true });
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + (e?.message || e)); }
    finally { setSaving(false); }
  };

  if (loading) return <Container sx={{ py: 3 }}>Loading…</Container>;
  if (error)   return <Container sx={{ py: 3, color: 'error.main' }}>เปิดเทมเพลตไม่ได้: {error}</Container>;

  return (
    <Container sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)}>Back</Button>
        <Typography variant="h5" fontWeight="bold">{id ? 'Edit Template' : 'Create Template'}</Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Stack>

      <Grid container spacing={2}>
        {/* LEFT: Preview */}
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography fontWeight="bold">Preview</Typography>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={() => setTplOpen(true)}>Template</Button>
                <Button variant="outlined" startIcon={<ImageIcon />} onClick={() => fileRef.current?.click()}>
                  {form.imageUrl ? 'Change image' : 'Upload image'}
                </Button>
                <input hidden ref={fileRef} type="file" accept="image/*"
                  onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              </Stack>
            </Stack>

            <Box
              ref={overlayRef}
              sx={{
                width: '100%', maxWidth: 900, height: previewHeight, mx: 'auto',
                bgcolor: '#f7f7f7', border: '1px dashed #ccc', borderRadius: 1,
                position: 'relative'
              }}
              onMouseDown={() => setSelectedIndex(0)}
            >
              {form.imageUrl ? (
                <img
                  src={form.imageUrl}
                  alt=""
                  style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    objectFit:'contain',         
                    pointerEvents: 'none'        // ไม่บังการลาก area
                  }}
                />
              ) : (
                <Stack alignItems="center" justifyContent="center"
                       style={{position:'absolute', inset:0, color:'#888'}}>
                  <Typography>No image</Typography>
                </Stack>
              )}
              {!form.imageUrl && (
                <Stack alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0, color: '#888' }}>
                  <Typography>No image</Typography>
                </Stack>
              )}

              {form.areas.map((a, i) => {
                const sel = selectedIndex === i;
                return (
                  <Box
                    key={i}
                    onMouseDown={(e) => { setSelectedIndex(i); startMove(i, e); }}
                    onClick={(e) => { e.stopPropagation(); setSelectedIndex(i); }}
                    title={`Block ${i + 1}`}
                    sx={{
                      position: 'absolute',
                      left: `${pct((a.xPct||0)*100)}%`,
                      top:  `${pct((a.yPct||0)*100)}%`,
                      width:`${pct(((a.wPct??.4)*100))}%`,
                      height:`${pct(((a.hPct??.2)*100))}%`,
                      border: `2px solid ${sel ? '#2e7d32' : 'rgba(46,125,50,.7)'}`,
                      bgcolor: sel ? 'rgba(102,187,106,.18)' : 'rgba(102,187,106,.12)',
                      cursor:'move'
                    }}
                  >
                    <Chip size="small" label={`Block ${i+1}`} sx={{ position:'absolute', left:4, top:4 }} />
                    <Chip size="small" variant="outlined" label={a.action?.type || 'Link'} sx={{ position:'absolute', left:4, bottom:4 }} />

                    {['nw','n','ne','e','se','s','sw','w'].map((h) => (
                      <Box key={h} onMouseDown={(e) => startResize(i, h, e)}
                        sx={{
                          position:'absolute', width:10, height:10,
                          bgcolor: sel ? '#2e7d32' : '#66bb6a', borderRadius:'2px',
                          ...(h==='nw' && { left:-5, top:-5 }),
                          ...(h==='n'  && { left:'calc(50% - 5px)', top:-5 }),
                          ...(h==='ne' && { right:-5, top:-5 }),
                          ...(h==='e'  && { right:-5, top:'calc(50% - 5px)' }),
                          ...(h==='se' && { right:-5, bottom:-5 }),
                          ...(h==='s'  && { left:'calc(50% - 5px)', bottom:-5 }),
                          ...(h==='sw' && { left:-5, bottom:-5 }),
                          ...(h==='w'  && { left:-5, top:'calc(50% - 5px)' }),
                          cursor: (h==='n' || h==='s') ? 'ns-resize'
                                 : (h==='e' || h==='w') ? 'ew-resize'
                                 : (h==='ne' || h==='sw') ? 'nesw-resize' : 'nwse-resize'
                        }}
                      />
                    ))}
                  </Box>
                );
              })}
            </Box>

            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button onClick={() => applyTemplate(tplValue)}>Reset to template</Button>
              {!!form.areas.length && (
                <Button color="error" onClick={() => removeArea(selectedIndex)} startIcon={<DeleteIcon />}>
                  Remove selected
                </Button>
              )}
              <Button onClick={() => addArea()}>Add area</Button>
            </Stack>
          </Paper>
        </Grid>

        {/* RIGHT: Details & Action editor */}
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight="bold" sx={{ mb: 1 }}>Details</Typography>

            <Stack spacing={1.5}>
              <TextField label="Title" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} fullWidth />
              <TextField label="Chat bar label" value={form.chatBarText} onChange={(e) => setForm(f => ({ ...f, chatBarText: (e.target.value || '').slice(0, 14) }))} fullWidth />

              <Autocomplete
                options={CATEGORY_OPTIONS}
                freeSolo
                value={form.category || null}
                onChange={(_, v) => setForm(f => ({ ...f, category: v || '' }))}
                onInputChange={(_, v) => setForm(f => ({ ...f, category: v || '' }))}
                renderInput={(params) => <TextField {...params} label="Category" />}
              />

              <TextField label="Tags (comma)" value={form.tags} onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))} fullWidth />
              <TextField label="Note" value={form.note} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))} fullWidth multiline />

              <Divider sx={{ my: 1 }} />

              <Typography fontWeight="bold" sx={{ mb: 1 }}>Actions</Typography>
              {form.areas.length ? (
                <Stack spacing={1.5}>
                  {form.areas.map((a, i) => (
                    <Paper key={i} variant="outlined" sx={{ p: 1.5, borderColor: i===selectedIndex ? '#66bb6a' : undefined }}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                        <Chip size="small" label={`Block ${i+1}`} />
                        <Box sx={{ flex: 1 }} />
                        {/* คลิกเพื่อเลือกบล็อกในแคนวาสได้ด้วย */}
                        <Button size="small" onClick={() => setSelectedIndex(i)}>Select</Button>
                        </Stack>
                        <ActionEditor
                        action={a.action || { type: 'Link' }}
                        onChange={(next) => setForm(f => {
                            const A = [...f.areas];
                            A[i] = { ...A[i], action: next };
                            return { ...f, areas: A };
                        })}
                        />
                    </Paper>
                    ))}
                </Stack>
                ) : (
                <Typography variant="body2" color="text.secondary">ยังไม่มีพื้นที่ — กด “Add area” ทางซ้าย</Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <TemplateModal open={tplOpen} onClose={() => setTplOpen(false)} value={tplValue}
        onApply={(tpl) => { setTplOpen(false); applyTemplate(tpl); }} />
    </Container>
  );
}
