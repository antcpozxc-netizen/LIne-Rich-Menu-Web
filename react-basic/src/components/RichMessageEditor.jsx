// src/components/RichMessageEditor.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Container, Grid, IconButton, Paper, Stack, TextField, Typography
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';

/**
 * RichMessageEditor
 * - โชว์อัปโหลดรูป + ฟอร์มแก้ไข action areas + พรีวิว
 * props:
 *  - mode: 'create' | 'edit'
 *  - initialData: { id?: string, name?: string, image?: string, areas?: [{id,label,url,x,y,w,h}] }
 *  - onSave(data)
 *  - onDelete?()
 *  - onDuplicate?()
 */
export default function RichMessageEditor({
  mode = 'create',
  initialData = { name: '', image: '', areas: [] },
  onSave,
  onDelete,
  onDuplicate,
}) {
  const [name, setName] = useState(initialData.name || '');
  const [image, setImage] = useState(initialData.image || '');
  const [areas, setAreas] = useState(initialData.areas?.length ? initialData.areas : [
    // ตัวอย่างแรก (ว่าง)
  ]);

  useEffect(() => {
    setName(initialData.name || '');
    setImage(initialData.image || '');
    setAreas(initialData.areas?.length ? initialData.areas : []);
  }, [initialData]);

  const fileInputRef = useRef(null);

  const addArea = () => {
    const nextId = (areas.at(-1)?.id || 0) + 1;
    setAreas(prev => [...prev, { id: nextId, label: '', url: '', x: 10, y: 10, w: 30, h: 20 }]);
  };
  const removeArea = (id) => setAreas(prev => prev.filter(a => a.id !== id));
  const updateArea = (id, patch) =>
    setAreas(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));

  const pickImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(f);
  };

  const valid = useMemo(() => name.trim() && image && areas.every(a =>
    a.label.trim() && a.url.trim() && [a.x,a.y,a.w,a.h].every(n => Number.isFinite(+n))
  ), [name, image, areas]);

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h4" fontWeight="bold">
          {mode === 'edit' ? 'Edit rich message' : 'Create rich message'}
        </Typography>
        <Stack direction="row" spacing={1}>
          {mode === 'edit' && onDuplicate && (
            <Button variant="outlined" onClick={onDuplicate}>Duplicate</Button>
          )}
          {mode === 'edit' && onDelete && (
            <Button color="error" variant="outlined" onClick={onDelete}>Delete</Button>
          )}
          <Button
            variant="contained"
            disabled={!valid}
            onClick={() => onSave?.({ ...initialData, name, image, areas })}
            sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
          >
            Save
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        {/* LEFT: form */}
        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack spacing={1.5}>
              <TextField
                label="Item name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="outlined" onClick={() => fileInputRef.current?.click()}>
                  Upload image
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={pickImage}
                />
                <Typography variant="body2" color="text.secondary">
                  JPG/PNG recomended (ratio as you like)
                </Typography>
              </Stack>
              {image && (
                <Box sx={{ border: '1px dashed #ccc', p: 1, borderRadius: 1 }}>
                  <img src={image} alt="preview" style={{ width: '100%', borderRadius: 4 }} />
                </Box>
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle1" fontWeight="bold">Action areas</Typography>
              <Button startIcon={<AddIcon />} onClick={addArea}>Add area</Button>
            </Stack>

            {areas.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No areas yet. Click “Add area”.
              </Typography>
            )}

            <Stack spacing={1.5}>
              {areas.map(a => (
                <Paper key={a.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                    <TextField
                      label="Label"
                      size="small"
                      value={a.label}
                      onChange={(e) => updateArea(a.id, { label: e.target.value })}
                      sx={{ flex: 1 }}
                    />
                    <IconButton color="error" onClick={() => removeArea(a.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </Stack>
                  <TextField
                    label="Action URL"
                    size="small"
                    value={a.url}
                    onChange={(e) => updateArea(a.id, { url: e.target.value })}
                    fullWidth
                    sx={{ mb: 1 }}
                  />
                  <Grid container spacing={1}>
                    {(['x','y','w','h']).map(k => (
                      <Grid key={k} item xs={3}>
                        <TextField
                          label={k.toUpperCase()}
                          size="small"
                          type="number"
                          value={a[k]}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(100, Number(e.target.value)));
                            updateArea(a.id, { [k]: v });
                          }}
                          InputProps={{ endAdornment: <span style={{ marginLeft: 6 }}>%</span> }}
                          fullWidth
                        />
                      </Grid>
                    ))}
                  </Grid>
                  <Typography variant="caption" color="text.secondary">
                    Coordinates are percentages relative to image width/height.
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid>

        {/* RIGHT: live preview */}
        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Preview</Typography>
            {!image ? (
              <Box sx={{
                height: 360, border: '1px dashed #ccc', borderRadius: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary'
              }}>
                Upload an image to preview
              </Box>
            ) : (
              <Box sx={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
                {/* keep aspect by letting image be the size basis */}
                <img src={image} alt="preview" style={{ width: '100%', display: 'block', borderRadius: 4 }} />
                {/* overlays */}
                {areas.map(a => (
                  <Box
                    key={a.id}
                    title={`${a.label} → ${a.url}`}
                    sx={{
                      position: 'absolute',
                      left: `${a.x}%`,
                      top: `${a.y}%`,
                      width: `${a.w}%`,
                      height: `${a.h}%`,
                      border: '2px dashed rgba(76,175,80,0.9)',
                      borderRadius: '6px',
                      boxShadow: 'inset 0 0 0 9999px rgba(76,175,80,0.12)',
                      pointerEvents: 'none',
                    }}
                  />
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
