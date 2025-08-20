import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Card, CardActionArea, CardContent, Chip, Container, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, Stack, TextField, Typography, Tooltip
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Image as ImageIcon } from '@mui/icons-material';
import { auth, storage } from '../firebase';
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate, useOutletContext } from 'react-router-dom';

// ====== helpers ======
async function authedFetch(url, opts={}) {
  const token = await auth.currentUser?.getIdToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}), Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...opts, headers });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt || res.statusText);
  return txt ? JSON.parse(txt) : {};
}

const pct = (n) => Math.round(Math.max(0, Math.min(100, Number(n)||0)) * 100) / 100;

// ====== Minimal Action Editor ======
function ActionEditor({ idx, action, onChange }) {
  return (
    <Stack spacing={1} sx={{ p:1.5, border:'1px solid #eee', borderRadius:1, mb:1 }}>
      <Typography variant="subtitle2">Block {idx+1}</Typography>
      <TextField select SelectProps={{native:true}} label="Type" size="small"
        value={action.type||'Link'} onChange={(e)=>onChange({ ...action, type:e.target.value })} sx={{maxWidth:220}}>
        <option>Link</option><option>Text</option><option>No action</option>
      </TextField>
      {action.type==='Link' && (
        <Stack direction="row" spacing={1}>
          <TextField label="URL" size="small" value={action.url||''} onChange={(e)=>onChange({...action,url:e.target.value})} fullWidth/>
          <TextField label="Label" size="small" value={action.label||''} onChange={(e)=>onChange({...action,label:e.target.value.slice(0,20)})} sx={{maxWidth:220}}/>
        </Stack>
      )}
      {action.type==='Text' && (
        <TextField label="Message" size="small" value={action.text||''} onChange={(e)=>onChange({...action,text:e.target.value.slice(0,300)})} fullWidth/>
      )}
      {action.type==='No action' && <Typography variant="caption" color="text.secondary">—</Typography>}
    </Stack>
  );
}

// ====== Editor dialog ======
function TemplateEditor({ open, onClose, initial }) {
  const fileRef = useRef(null);
  const [form, setForm] = useState(initial || { title:'', size:'large', imageUrl:'', chatBarText:'Menu', category:'', tags:'', note:'', areas:[] });
  const [drag, setDrag] = useState(null);
  const overlayRef = useRef(null);

  useEffect(()=> setForm(initial || { title:'', size:'large', imageUrl:'', chatBarText:'Menu', category:'', tags:'', note:'', areas:[] }), [initial]);

  const uploadImage = async (file) => {
    const targetH = form.size === 'compact' ? 843 : 1686;
    // อัปโหลดไฟล์ดิบ (เวอร์ชันเร็ว) — ถ้าต้องการ resize ใช้ util จากหน้า RichMenusPage
    const r = sref(storage, `public/admin-templates/${Date.now()}-${file.name.replace(/\s+/g,'-')}`);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    setForm(f=>({ ...f, imageUrl:url }));
  };

  const addArea = () => setForm(f=>({ ...f, areas:[...f.areas, { xPct:.05, yPct:.05, wPct:.4, hPct:.2, action:{ type:'Link'} }] }));
  const removeArea = (idx) => setForm(f=>({ ...f, areas:f.areas.filter((_,i)=>i!==idx) }));

  const startMove = (idx, e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    setDrag({ idx, startX:e.clientX, startY:e.clientY, box:{w:rect.width,h:rect.height}, start:form.areas[idx] });
  };
  useEffect(()=>{
    if(!drag) return;
    const onMove = (e)=>{
      const dx = ((e.clientX-drag.startX)/drag.box.w)*100;
      const dy = ((e.clientY-drag.startY)/drag.box.h)*100;
      const s = drag.start;
      const nx = pct((s.xPct*100 + dx))/100;
      const ny = pct((s.yPct*100 + dy))/100;
      setForm(f=>{
        const A = [...f.areas];
        A[drag.idx] = { ...A[drag.idx], xPct:nx, yPct:ny };
        return { ...f, areas:A };
      });
    };
    const onUp = ()=>setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  },[drag]);

  const onSave = async () => {
    const payload = { ...form, tags:(form.tags||'').split(',').map(s=>s.trim()).filter(Boolean) };
    if (initial?.id) await authedFetch(`/api/admin/templates/${initial.id}`, { method:'PUT', body: JSON.stringify(payload) });
    else await authedFetch('/api/admin/templates', { method:'POST', body: JSON.stringify(payload) });
    onClose(true);
  };

  return (
    <Dialog open={open} onClose={()=>onClose(false)} maxWidth="md" fullWidth>
      <DialogTitle>{initial?.id ? 'Edit template' : 'New template'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TextField label="Title" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} fullWidth/>
            <TextField label="Size (large|compact)" value={form.size} onChange={e=>setForm(f=>({...f,size:e.target.value}))} sx={{maxWidth:200}}/>
            <TextField label="Chat bar" value={form.chatBarText} onChange={e=>setForm(f=>({...f,chatBarText:e.target.value.slice(0,14)}))} sx={{maxWidth:200}}/>
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Category" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} fullWidth/>
            <TextField label="Tags (comma)" value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} fullWidth/>
          </Stack>
          <TextField label="Note" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} fullWidth multiline/>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" startIcon={<ImageIcon/>} onClick={()=>fileRef.current?.click()}>Upload image</Button>
            <input ref={fileRef} type="file" hidden accept="image/*" onChange={(e)=> e.target.files?.[0] && uploadImage(e.target.files[0])}/>
            <Typography variant="body2" color="text.secondary">{form.imageUrl ? 'Image selected' : 'No image'}</Typography>
          </Stack>

          {/* Preview + overlay (fixed-in-box) */}
          <Box ref={overlayRef} sx={{
            width:'100%', maxWidth:620, mx:'auto',
            height: form.size==='compact' ? 169*2 : 338*2,
            bgcolor:'#fafafa', border:'1px dashed #ccc', borderRadius:1,
            backgroundImage: form.imageUrl ? `url(${form.imageUrl})` : 'none',
            backgroundRepeat:'no-repeat', backgroundPosition:'center', backgroundSize:'contain',
            position:'relative',
          }}>
            {form.areas.map((a, i)=>(
              <Box key={i}
                onMouseDown={(e)=>startMove(i,e)}
                sx={{
                  position:'absolute',
                  left:`${pct(a.xPct*100)}%`, top:`${pct(a.yPct*100)}%`,
                  width:`${pct(a.wPct*100||40)}%`, height:`${pct(a.hPct*100||20)}%`,
                  border:'2px solid rgba(46,125,50,.9)', bgcolor:'rgba(102,187,106,.15)', cursor:'move'
                }}
                title={`Block ${i+1}`}
              />
            ))}
          </Box>

          <Stack direction="row" spacing={1}>
            <Button onClick={addArea}>Add area</Button>
          </Stack>

          {/* Simple action list */}
          <Box>
            <Typography variant="subtitle2" sx={{mb:1}}>Actions</Typography>
            {form.areas.map((a, i)=>(
              <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                <ActionEditor
                  idx={i}
                  action={a.action || { type:'Link' }}
                  onChange={(next)=> setForm(f=>{ const A=[...f.areas]; A[i] = { ...A[i], action: next }; return { ...f, areas: A }; })}
                />
                <Button color="error" onClick={()=>removeArea(i)}>Remove</Button>
              </Stack>
            ))}
            {form.areas.length===0 && <Typography variant="body2" color="text.secondary">ยังไม่มีพื้นที่ คลิก “Add area”</Typography>}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>onClose(false)}>Cancel</Button>
        <Button variant="contained" onClick={onSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AdminTemplatesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const j = await authedFetch('/api/admin/templates');
    setItems(j.items || []);
  };
  useEffect(()=>{ load(); }, []);

  const onDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    await authedFetch(`/api/admin/templates/${id}`, { method:'DELETE' });
    load();
  };

  const onUse = (t) => {
    // พรีฟิลล์ไปหน้า create
    const tenantId = new URLSearchParams(location.search).get('tenant') || '';
    navigate(`/homepage/rich-menus/new?tenant=${tenantId}`, {
      state: {
        prefill: {
          size: t.size,
          imageUrl: t.imageUrl,
          chatBarText: t.chatBarText,
          areas: t.areas,
          title: t.title,
        }
      }
    });
  };

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:2}}>
        <Typography variant="h5" fontWeight="bold">Admin: Rich Menu Templates</Typography>
        <Button variant="contained" onClick={()=>{ setEditing(null); setOpen(true); }}>+ New Template</Button>
      </Stack>

      <Grid container spacing={2}>
        {items.map(t => (
          <Grid item key={t.id} xs={12} sm={6} md={4} lg={3}>
            <Card variant="outlined">
              <CardActionArea onClick={()=>{ setEditing(t); setOpen(true); }}>
                <Box sx={{
                  height: 160,
                  backgroundImage: t.imageUrl ? `url(${t.imageUrl})` : 'none',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  backgroundSize: 'contain', // fixed-in-box
                  bgcolor: '#f5f5f5'
                }}/>
              </CardActionArea>
              <CardContent sx={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <Box sx={{minWidth:0}}>
                  <Typography variant="subtitle2" noWrap>{t.title || '(Untitled)'}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label={t.size || 'large'} />
                    {t.category && <Chip size="small" variant="outlined" label={t.category} />}
                  </Stack>
                </Box>
                <Box>
                  <Tooltip title="Use this template">
                    <IconButton color="success" onClick={()=>onUse(t)}>▶</IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton onClick={()=>{ setEditing(t); setOpen(true); }}><EditIcon/></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton color="error" onClick={()=>onDelete(t.id)}><DeleteIcon/></IconButton>
                  </Tooltip>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
        {items.length === 0 && (
          <Box sx={{ color:'text.secondary', p:4 }}>No templates yet.</Box>
        )}
      </Grid>

      <TemplateEditor open={open} onClose={(changed)=>{ setOpen(false); if (changed) load(); }} initial={editing}/>
    </Container>
  );
}
