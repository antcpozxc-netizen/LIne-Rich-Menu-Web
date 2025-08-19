// src/pages/AdminTemplatesPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Card, CardContent, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, Stack, TextField, Typography, Chip, MenuItem, Tooltip
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon, Image as ImageIcon } from '@mui/icons-material';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';

const CATEGORIES = [
  'ร้านอาหาร / คาเฟ่','บริการทั่วไป','แหล่งท่องเที่ยว / E-Commerce','โรงแรม / รีสอร์ท',
  'อสังหาฯ/งานบริการ','ค้าปลีก / บริการทั่วไป','โรงเรียน / สถาบัน','คลินิก / โรงพยาบาล','ยานยนต์ / รถยนต์'
];

const EMPTY = {
  title: '',
  category: CATEGORIES[0],
  size: 'large',                 // large | compact
  chatBarText: 'Menu',
  defaultBehavior: 'shown',      // shown | collapsed
  imageUrl: '',
  thumbUrl: '',
  blocks: 3,
  areas: [],                     // [{xPct,yPct,wPct,hPct, action:{...}}]
  enabled: true,
};

export default function AdminTemplatesPage() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const fileRef = useRef(null);

  // load list
  useEffect(() => {
    (async () => {
      const qy = query(collection(db, 'richmenu_templates'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(qy);
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    })();
  }, []);

  const startCreate = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };
  const startEdit = (row) => { setEditingId(row.id); setForm({ ...EMPTY, ...row }); setOpen(true); };

  const uploadImage = async (file) => {
    const r = sref(storage, `public/templates/${Date.now()}-${file.name.replace(/\s+/g,'-')}`);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    setForm(f => ({ ...f, imageUrl: url, thumbUrl: url }));
  };

  const save = async () => {
    const data = {
      ...form,
      blocks: Number(form.blocks) || 1,
      updatedAt: serverTimestamp(),
      createdAt: form.createdAt || serverTimestamp(),
    };
    if (editingId) {
      await updateDoc(doc(db, 'richmenu_templates', editingId), data);
      setItems(list => list.map(x => x.id === editingId ? { ...x, ...data } : x));
    } else {
      const ref = await addDoc(collection(db, 'richmenu_templates'), data);
      setItems(list => [{ id: ref.id, ...data }, ...list]);
    }
    setOpen(false);
  };

  const remove = async (id) => {
    if (!window.confirm('ลบ template นี้หรือไม่?')) return;
    await deleteDoc(doc(db, 'richmenu_templates', id));
    setItems(list => list.filter(x => x.id !== id));
  };

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight="bold">Admin: Rich Menu Templates</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={startCreate}>New template</Button>
      </Stack>

      <Grid container spacing={2}>
        {items.map((t) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={t.id}>
            <Card variant="outlined">
              {/* preview canvas — fixed box, รูปจะถูก contain ให้เห็นเต็มกรอบ */}
              <Box sx={{ position:'relative', width:'100%', pt: t.size==='compact' ? '33.7%' : '67.4%', bgcolor:'#f5f5f5' }}>
                <Box component="img" src={t.thumbUrl || t.imageUrl} alt={t.title}
                  sx={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain' }}/>
              </Box>
              <CardContent>
                <Stack direction="row" spacing={1} sx={{ mb: .5 }} alignItems="center">
                  <Chip size="small" label={t.size} />
                  <Chip size="small" label={`${t.blocks||0} blocks`} variant="outlined" />
                  {t.enabled ? <Chip size="small" label="enabled" color="success" /> : <Chip size="small" label="disabled" />}
                </Stack>
                <Typography variant="subtitle2" noWrap>{t.title || '(Untitled)'}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>{t.category}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" onClick={() => startEdit(t)} startIcon={<EditIcon />}>Edit</Button>
                  <Button size="small" color="error" onClick={() => remove(t.id)} startIcon={<DeleteIcon />}>Delete</Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingId ? 'Edit template' : 'New template'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              <TextField label="Title" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value.slice(0,60)}))} fullWidth/>
              <TextField label="Blocks" type="number" value={form.blocks} onChange={e=>setForm(f=>({...f,blocks:e.target.value}))} sx={{width:140}}/>
            </Stack>

            <Stack direction="row" spacing={2}>
              <TextField select label="Category" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} fullWidth>
                {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
              <TextField select label="Size" value={form.size} onChange={e=>setForm(f=>({...f,size:e.target.value}))} sx={{width:180}}>
                <MenuItem value="large">Large</MenuItem>
                <MenuItem value="compact">Compact</MenuItem>
              </TextField>
            </Stack>

            <Stack direction="row" spacing={2}>
              <TextField label="Chat bar label" value={form.chatBarText} onChange={e=>setForm(f=>({...f,chatBarText:e.target.value.slice(0,14)}))}/>
              <TextField select label="Behavior" value={form.defaultBehavior} onChange={e=>setForm(f=>({...f,defaultBehavior:e.target.value}))} sx={{width:180}}>
                <MenuItem value="shown">Shown</MenuItem>
                <MenuItem value="collapsed">Collapsed</MenuItem>
              </TextField>
              <TextField select label="Enabled" value={form.enabled ? 'yes' : 'no'} onChange={e=>setForm(f=>({...f,enabled: e.target.value==='yes'}))} sx={{width:160}}>
                <MenuItem value="yes">Yes</MenuItem>
                <MenuItem value="no">No</MenuItem>
              </TextField>
            </Stack>

            <Stack direction="row" spacing={2} alignItems="center">
              <Button startIcon={<ImageIcon />} variant="outlined" onClick={()=>fileRef.current?.click()}>Upload image</Button>
              <input ref={fileRef} type="file" hidden accept="image/*"
                     onChange={(e)=> e.target.files?.[0] && uploadImage(e.target.files[0])}/>
              <Typography variant="body2" color="text.secondary">
                {form.imageUrl ? 'Image selected' : 'No image'}
              </Typography>
            </Stack>

            {/* เก็บ areas เป็น JSON ไปก่อน (reuse editor จากหน้าสร้างได้ภายหลัง) */}
            <TextField
              label="Areas JSON (xPct/yPct/wPct/hPct + action)"
              value={JSON.stringify(form.areas || [], null, 2)}
              onChange={(e)=> { try { setForm(f=>({...f, areas: JSON.parse(e.target.value)})); } catch {} }}
              multiline minRows={8}
              helperText="ใช้โครงสร้างเดียวกับหน้าสร้าง Rich menu"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
