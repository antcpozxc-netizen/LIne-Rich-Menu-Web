// src/pages/AdminTemplateEditorPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Card, Container, Divider, Grid, Stack, TextField, Typography,
  IconButton, Tooltip, Chip, Paper, Autocomplete
} from '@mui/material';
import { Save as SaveIcon, ArrowBack as BackIcon, Image as ImageIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { auth, storage } from '../firebase';
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CATEGORY_OPTIONS } from '../constants/categories';

// fetch helper
async function authedFetch(url, opts = {}) {
  const token = await auth.currentUser?.getIdToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}), Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...opts, headers });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt || res.statusText);
  return txt ? JSON.parse(txt) : {};
}

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const pct = (n) => Math.round(Math.max(0, Math.min(100, Number(n)||0)) * 100) / 100;

// action editor (inline)
function ActionEditor({ action, onChange }) {
  return (
    <Stack spacing={1}>
      <TextField select size="small" label="Type" value={action?.type || 'Link'}
                 onChange={(e)=>onChange({ ...(action||{}), type:e.target.value })}
                 SelectProps={{ native:true }}>
        <option>Link</option><option>Text</option><option>No action</option>
      </TextField>

      {(action?.type==='Link') && (
        <Stack direction="row" spacing={1}>
          <TextField size="small" label="URL" value={action.url||''} onChange={(e)=>onChange({ ...action, url:e.target.value })} fullWidth/>
          <TextField size="small" label="Label" value={action.label||''}
                     onChange={(e)=>onChange({ ...action, label:(e.target.value||'').slice(0,20) })} sx={{maxWidth:200}}/>
        </Stack>
      )}

      {(action?.type==='Text') && (
        <TextField size="small" label="Message" value={action.text||''}
                   onChange={(e)=>onChange({ ...action, text:(e.target.value||'').slice(0,300) })}
                   fullWidth />
      )}
    </Stack>
  );
}

export default function AdminTemplateEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();                 // undefined = new
  const [sp]   = useSearchParams();

  const [form, setForm] = useState({
    title:'', size:'large', imageUrl:'', chatBarText:'Menu',
    category:'', tags:'', note:'', areas:[]
  });
  const [loading, setLoading] = useState(!!id);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

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
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // upload
  const fileRef = useRef(null);
  const uploadImage = async (file) => {
    try {
      const path = `public/admin-templates/${Date.now()}-${file.name.replace(/\s+/g,'-')}`;
      const r = sref(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setForm(f => ({ ...f, imageUrl: url }));
    } catch (e) {
      alert('อัปโหลดรูปไม่สำเร็จ: ' + (e?.message || e));
    }
  };

  // preview sizing
  const previewWidth  = 900;              // px (left panel)
  const baseW = 2500;
  const baseH = form.size === 'compact' ? 843 : 1686;
  const previewHeight = Math.round(previewWidth * baseH / baseW);

  // drag move
  const overlayRef = useRef(null);
  const dragRef = useRef(null);
  const onMouseDown = (i, e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    dragRef.current = {
      i, startX: e.clientX, startY: e.clientY, boxW: rect.width, boxH: rect.height,
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
    const nx = clamp01((Number(s.xPct)||0) + dx);
    const ny = clamp01((Number(s.yPct)||0) + dy);
    setForm(f => {
      const A = [...f.areas];
      A[d.i] = { ...A[d.i], xPct: nx, yPct: ny };
      return { ...f, areas: A };
    });
  };
  const onMouseUp = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  const addArea = () => setForm(f => ({
    ...f,
    areas: [...f.areas, { xPct:.05, yPct:.05, wPct:.4, hPct:.2, action:{ type:'Link' } }]
  }));
  const removeArea = (idx) =>
    setForm(f => ({ ...f, areas: f.areas.filter((_,i)=>i!==idx) }));

  const save = async () => {
    if (!form.imageUrl) return alert('กรุณาอัปโหลดรูปเมนู');
    setSaving(true);
    try {
      const payload = {
        ...form,
        tags: (form.tags || '').split(',').map(s => s.trim()).filter(Boolean),
      };
      if (id) {
        await authedFetch(`/api/admin/templates/${id}`, { method:'PUT', body: JSON.stringify(payload) });
      } else {
        await authedFetch('/api/admin/templates', { method:'POST', body: JSON.stringify(payload) });
      }
      navigate(`/homepage/admin/templates${sp.get('tenant') ? `?tenant=${sp.get('tenant')}` : ''}`, { replace: true });
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Container sx={{ py: 3 }}>Loading…</Container>;
  if (error)   return <Container sx={{ py: 3, color:'error.main' }}>เปิดเทมเพลตไม่ได้: {error}</Container>;

  return (
    <Container sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Button startIcon={<BackIcon/>} onClick={() => navigate(-1)}>Back</Button>
        <Typography variant="h5" fontWeight="bold">
          {id ? 'Edit Template' : 'Create Template'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<SaveIcon/>} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Stack>

      <Grid container spacing={2}>
        {/* LEFT: Preview */}
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ p:2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography fontWeight="bold">Preview</Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small" select label="Size" value={form.size}
                  SelectProps={{ native:true }}
                  onChange={(e)=>setForm(f=>({ ...f, size:e.target.value }))}
                  sx={{ width: 160 }}
                >
                  <option value="large">large (2500×1686)</option>
                  <option value="compact">compact (2500×843)</option>
                </TextField>
                <Button variant="outlined" startIcon={<ImageIcon/>} onClick={()=>fileRef.current?.click()}>
                  {form.imageUrl ? 'Change image' : 'Upload image'}
                </Button>
                <input hidden ref={fileRef} type="file" accept="image/*"
                       onChange={(e)=> e.target.files?.[0] && uploadImage(e.target.files[0])}/>
              </Stack>
            </Stack>

            <Box
              ref={overlayRef}
              sx={{
                width: '100%',
                maxWidth: previewWidth,
                height: previewHeight,
                mx: 'auto',
                bgcolor: '#f7f7f7',
                border: '1px dashed #ccc',
                borderRadius: 1,
                position: 'relative',
                backgroundImage: form.imageUrl ? `url(${form.imageUrl})` : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                backgroundSize: 'contain'
              }}
            >
              {!form.imageUrl && (
                <Stack alignItems="center" justifyContent="center" sx={{ position:'absolute', inset:0, color:'#888' }}>
                  <Typography>No image</Typography>
                </Stack>
              )}

              {form.areas.map((a,i)=>(
                <Box key={i}
                     onMouseDown={(e)=>onMouseDown(i,e)}
                     onClick={()=>setSelectedIndex(i)}
                     title={`Block ${i+1}`}
                     sx={{
                       position: 'absolute',
                       left: `${pct(a.xPct*100)}%`,
                       top:  `${pct(a.yPct*100)}%`,
                       width:`${pct((a.wPct||.4)*100)}%`,
                       height:`${pct((a.hPct||.2)*100)}%`,
                       border: `2px solid ${selectedIndex===i?'#2e7d32':'rgba(46,125,50,.7)'}`,
                       bgcolor: selectedIndex===i?'rgba(102,187,106,.18)':'rgba(102,187,106,.12)',
                       cursor:'move'
                     }}/>
              ))}
            </Box>

            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button onClick={addArea}>Add area</Button>
              {!!form.areas.length && (
                <Button color="error" onClick={()=>removeArea(selectedIndex)} startIcon={<DeleteIcon/>}>
                  Remove selected
                </Button>
              )}
            </Stack>
          </Paper>
        </Grid>

        {/* RIGHT: Form */}
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p:2 }}>
            <Typography fontWeight="bold" sx={{ mb: 1 }}>Details</Typography>

            <Stack spacing={1.5}>
              <TextField label="Title" value={form.title}
                         onChange={(e)=>setForm(f=>({ ...f, title:e.target.value }))}
                         fullWidth/>

              <TextField label="Chat bar label" value={form.chatBarText}
                         onChange={(e)=>setForm(f=>({ ...f, chatBarText:(e.target.value||'').slice(0,14) }))}
                         fullWidth/>

              <Autocomplete
                options={CATEGORY_OPTIONS}
                freeSolo
                value={form.category || null}
                onChange={(_, v)=>setForm(f=>({ ...f, category:v || '' }))}
                onInputChange={(_, v)=>setForm(f=>({ ...f, category:v || '' }))}
                renderInput={(params)=><TextField {...params} label="Category" />}
              />

              <TextField label="Tags (comma)" value={form.tags}
                         onChange={(e)=>setForm(f=>({ ...f, tags:e.target.value }))}
                         fullWidth/>

              <TextField label="Note" value={form.note}
                         onChange={(e)=>setForm(f=>({ ...f, note:e.target.value }))}
                         fullWidth multiline/>

              <Divider sx={{ my: 1 }} />

              <Typography fontWeight="bold">Action (Block {form.areas.length ? (selectedIndex+1) : '-'})</Typography>
              {form.areas.length ? (
                <ActionEditor
                  action={form.areas[selectedIndex]?.action || { type:'Link' }}
                  onChange={(next)=>setForm(f=>{
                    const A=[...f.areas]; A[selectedIndex] = { ...A[selectedIndex], action: next };
                    return { ...f, areas:A };
                  })}
                />
              ) : (
                <Typography variant="body2" color="text.secondary">ยังไม่มีพื้นที่ — กด “Add area” ทางซ้าย</Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
