// src/components/RichMessageEditor.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Paper, Stack, TextField, Typography,
  Grid, IconButton, Divider, Select, MenuItem
} from '@mui/material';
import {
  Upload as UploadIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useOutletContext } from 'react-router-dom';
import { ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { uploadImagemapVariants, areasToImagemapActions } from '../lib/lineImagemap';

// ------ utils ------
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const pctClamp = (n) => Math.round(clamp(Number(n) || 0, 0, 100) * 100) / 100;
const genAreaId = () => 'A' + Math.random().toString(36).slice(2, 8);

// สำหรับ cursor ให้ตรงกับแต่ละ handle
const handleCursor = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

export default function RichMessageEditor({
  mode = 'create',
  initialData = { name: '', image: '', areas: [] },
  onSave,
  onDelete,
  onDuplicate,
}) {
  const { tenantId } = useOutletContext() || {};

  const [name, setName] = useState(initialData.name || '');
  const [image, setImage] = useState(
    // เผื่อกรณีเดิมเคยเซฟไว้ใน imagemap.urls[700]
    initialData.image || initialData.imagemap?.urls?.[700] || ''
  );
  const [imageFile, setImageFile] = useState(null); // ใช้ตอน Publish ทำ 5 ไซซ์
  const [areas, setAreas] = useState(
    (initialData.areas || []).map(a => ({
      id: a.id || genAreaId(),
      label: a.label || '',
      type: a.type || 'uri', // 'uri' | 'message'
      url: a.url || '',
      text: a.text || '',
      x: a.x ?? 5,
      y: a.y ?? 5,
      w: a.w ?? 30,
      h: a.h ?? 20,
    }))
  );
  const [selectedId, setSelectedId] = useState(areas[0]?.id || null);

  // refs + overlay size
  const fileRef = useRef(null);
  const overlayRef = useRef(null);
  const [overlaySize, setOverlaySize] = useState({ w: 1, h: 1 }); // px

  // drag/resize state
  const [drag, setDrag] = useState(null);

  // ---- overlay size tracking ----
  const recalcOverlay = () => {
    const el = overlayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setOverlaySize({ w: Math.max(rect.width, 1), h: Math.max(rect.height, 1) });
  };

  useEffect(() => {
    recalcOverlay();
    window.addEventListener('resize', recalcOverlay);
    return () => window.removeEventListener('resize', recalcOverlay);
  }, []);

  useEffect(() => {
    const t = setTimeout(recalcOverlay, 50);
    return () => clearTimeout(t);
  }, [image]);

  // เลือกอัตโนมัติถ้าเพิ่งเพิ่ม area ใหม่
  useEffect(() => {
    if (areas.length && !areas.find(a => a.id === selectedId)) {
      setSelectedId(areas[areas.length - 1].id);
    }
  }, [areas, selectedId]);

  const selected = useMemo(
    () => areas.find(a => a.id === selectedId) || null,
    [areas, selectedId]
  );

  // ---- image upload ----
  const pickFile = () => fileRef.current?.click();
  const uploadImage = async (file) => {
    if (!file) return;
    setImageFile(file); // เก็บไฟล์ไว้ใช้ตอน publish

    const tenant = tenantId || 'default';
    const safe = file.name.replace(/\s+/g, '-');
    const path = `tenants/${tenant}/rich-images/${Date.now()}-${safe}`;
    const r = sref(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    setImage(url);
    setTimeout(recalcOverlay, 30);
  };

  // ดาวน์โหลด URL → File (ใช้กรณีไม่ได้อัปโหลดไฟล์)
  const urlToFile = async (url) => {
    if (!url) throw new Error('ยังไม่ได้ระบุ URL รูปภาพ');
    // ต้องเป็น "download URL" ของ Firebase (มี alt=media …)
    const needsAlt = /firebasestorage\.googleapis\.com\/v0\//.test(url) && !/[?&]alt=media/.test(url);
    const u = needsAlt ? url + (url.includes('?') ? '&' : '?') + 'alt=media' : url;
    try {
      const res = await fetch(u, { credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const blob = await res.blob();
      const type = blob.type || 'image/jpeg';
      const ext = type.includes('png') ? 'png' : 'jpg';
      return new File([blob], `source.${ext}`, { type });
    } catch (e) {
      // แจ้งผู้ใช้ให้ใช้ปุ่ม Upload หรือใส่ URL แบบ getDownloadURL เท่านั้น
      throw new Error('โหลดรูปจาก URL ไม่ได้ (กรุณาใช้ปุ่ม Upload หรือวาง download URL ของ Firebase ที่ลงท้ายด้วย alt=media&token=...)');
    }
  };

  // ---- area CRUD ----
  const handleAddArea = () => {
    const a = { id: genAreaId(), label: '', type: 'uri', url: '', text: '', x: 5, y: 5, w: 30, h: 20 };
    setAreas(prev => [...prev, a]);
    setSelectedId(a.id);
  };
  const handleRemoveArea = (id) => {
    setAreas(prev => prev.filter(a => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const updateArea = (id, patch) => {
    setAreas(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
  };

  // ---- drag / resize logic ----
  const MIN_W = 4;   // %
  const MIN_H = 4;   // %

  const startMove = (id, e) => {
    e.stopPropagation();
    if (!overlayRef.current) return;
    const a = areas.find(x => x.id === id);
    if (!a) return;
    const rect = overlayRef.current.getBoundingClientRect();
    setDrag({
      id,
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      startRect: { x: a.x, y: a.y, w: a.w, h: a.h },
      box: { w: rect.width, h: rect.height },
    });
    setSelectedId(id);
  };

  const startResize = (id, handle, e) => {
    e.stopPropagation();
    if (!overlayRef.current) return;
    const a = areas.find(x => x.id === id);
    if (!a) return;
    const rect = overlayRef.current.getBoundingClientRect();
    setDrag({
      id,
      mode: 'resize',
      handle, // 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'
      startX: e.clientX,
      startY: e.clientY,
      startRect: { x: a.x, y: a.y, w: a.w, h: a.h },
      box: { w: rect.width, h: rect.height },
    });
    setSelectedId(id);
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e) => {
      const dxPx = e.clientX - drag.startX;
      const dyPx = e.clientY - drag.startY;
      const dxPct = (dxPx / drag.box.w) * 100;
      const dyPct = (dyPx / drag.box.h) * 100;

      if (drag.mode === 'move') {
        let nx = pctClamp(drag.startRect.x + dxPct);
        let ny = pctClamp(drag.startRect.y + dyPct);
        nx = clamp(nx, 0, 100 - drag.startRect.w);
        ny = clamp(ny, 0, 100 - drag.startRect.h);
        updateArea(drag.id, { x: nx, y: ny });
      } else {
        const s = drag.startRect;
        let x = s.x, y = s.y, w = s.w, h = s.h;
        const has = (k) => drag.handle.includes(k);
        if (has('e')) w = clamp(s.w + dxPct, MIN_W, 100 - s.x);
        if (has('s')) h = clamp(s.h + dyPct, MIN_H, 100 - s.y);
        if (has('w')) {
          const nx = clamp(s.x + dxPct, 0, s.x + s.w - MIN_W);
          w = clamp(s.w - (nx - s.x), MIN_W, 100);
          x = nx;
        }
        if (has('n')) {
          const ny = clamp(s.y + dyPct, 0, s.y + s.h - MIN_H);
          h = clamp(s.h - (ny - s.y), MIN_H, 100);
          y = ny;
        }
        x = clamp(x, 0, 100 - w);
        y = clamp(y, 0, 100 - h);
        updateArea(drag.id, { x: pctClamp(x), y: pctClamp(y), w: pctClamp(w), h: pctClamp(h) });
      }
    };

    const onUp = () => setDrag(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag]); // eslint-disable-line

  // ---- Save (เก็บข้อมูลพื้นฐาน) ----
  const doSave = () => {
    if (!name.trim()) return alert('กรุณาตั้งชื่อ');
    if (!image) return alert('กรุณาเลือกรูปภาพ');
    const payload = {
      name: name.trim(),
      image,
      areas: areas.map(a => ({
        id: a.id,
        label: a.label || '',
        type: a.type || 'uri',
        url: a.url || '',
        text: a.text || '',
        x: pctClamp(a.x),
        y: pctClamp(a.y),
        w: pctClamp(a.w),
        h: pctClamp(a.h),
      })),
    };
    onSave?.(payload);
  };

  // ---- Publish -> LINE Imagemap ----
  const doPublishImagemap = async () => {
    if (!name.trim()) return alert('กรุณาตั้งชื่อ');
    if (!image && !imageFile) return alert('กรุณาเลือกรูปภาพก่อน');

    try {
      // มีไฟล์ก็ใช้เลย, ถ้าไม่มีไฟล์จะดึงจาก URL มาทำเป็นไฟล์
      const srcFile = imageFile || await urlToFile(image);

      const richId = initialData.id || ('RM-' + Math.random().toString(36).slice(2, 8).toUpperCase());

      // อัปโหลด 5 ขนาดลงโฟลเดอร์ imagemaps/<id>
      // ✅ helper เวอร์ชันใหม่: รับ object และคืน { baseUrl, baseSize, urls }
      const { baseUrl, baseSize, urls } = await uploadImagemapVariants({
        bucketBaseDir: `imagemaps/${richId}`,
        file: srcFile,
        // mime: 'image/jpeg', // (ถ้าต้องการกำหนด)
      });

      // สร้าง actions (แปลง % -> px ภายใน helper)
      const actions = areasToImagemapActions(
        areas.map(a => ({
          type: a.type === 'message' ? 'message' : 'uri',
          url: a.url,
          text: a.text,
          label: a.label,
          x: a.x, y: a.y, w: a.w, h: a.h, // เป็น %
        })),
        baseSize.width,
        baseSize.height
      );

      // รวม payload ส่งกลับให้ parent
      const payload = {
        id: richId,
        name: name.trim(),

        // ใช้รูปขนาด 700px ที่เป็น public URL สำหรับแสดงพรีวิว/ลิสต์/พิกเกอร์
        image: urls?.[700] || image,

        areas: areas.map(a => ({
          id: a.id,
          label: a.label || '',
          type: a.type || 'uri',
          url: a.url || '',
          text: a.text || '',
          x: pctClamp(a.x),
          y: pctClamp(a.y),
          w: pctClamp(a.w),
          h: pctClamp(a.h),
        })),

        // เก็บข้อมูลที่ต้องใช้ส่ง LINE API และ URL ของทุกรุ่นไว้ด้วย
        imagemap: {
          baseUrl,
          altText: name.trim(),
          baseSize,   // { width: 1040, height: ... }
          actions,    // [{ type, linkUri?/text, area:{x,y,width,height} }]
          urls,       // { 240,300,460,700,1040 } -> public URLs
        },
      };

      onSave?.(payload);
      alert('Publish สำเร็จ!\n' + (urls?.[700] || baseUrl));
    } catch (err) {
      console.error(err);
      alert('Publish ไม่สำเร็จ: ' + (err?.message || err));
    }
  };


  // ---- render ----
  return (
    <Box sx={{ p: 2 }}>
      {/* Action bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5" fontWeight="bold">
          {mode === 'edit' ? 'Edit rich message' : 'Create rich message'}
        </Typography>
        <Stack direction="row" spacing={1}>
          {onDuplicate && (
            <Button variant="outlined" startIcon={<CopyIcon />} onClick={onDuplicate}>
              Duplicate
            </Button>
          )}
          {onDelete && (
            <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="outlined" onClick={doSave}>Save</Button>
          <Button variant="contained" onClick={doPublishImagemap}>
            Publish to Imagemap
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        {/* Left: meta + image */}
        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack spacing={2}>
              <TextField
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  fullWidth
                  label="Image URL"
                  placeholder="https://..."
                  value={image}
                  onChange={(e) => { setImage(e.target.value); setImageFile(null); }}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => uploadImage(e.target.files?.[0])}
                />
                <Button variant="outlined" startIcon={<UploadIcon />} onClick={pickFile}>
                  Upload
                </Button>
              </Stack>

              <Typography variant="body2" color="text.secondary">
                Tip: พื้นที่กดคำนวณเป็นเปอร์เซ็นต์ของรูป (Left/Top/Width/Height) และลาก/ย่อ–ขยายได้
              </Typography>
              <Typography variant="caption" color="text.secondary">
                * แนะนำให้อัปโหลดรูป (ปุ่ม Upload) เพื่อคุณภาพไฟล์ตอนสร้าง 5 ขนาด; ถ้าใส่ URL อย่างเดียว ระบบจะดาวน์โหลดมาให้
              </Typography>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview (Drag / Resize)</Typography>

            <Box
              ref={overlayRef}
              sx={{
                position: 'relative',
                borderRadius: 1,
                overflow: 'hidden',
                border: '1px dashed #ccc',
                background: '#fafafa',
                maxWidth: 720,
                userSelect: drag ? 'none' : 'auto',
              }}
              onMouseDown={() => setSelectedId(null)}
            >
              {image ? (
                <img
                  src={image}
                  alt=""
                  style={{ width: '100%', display: 'block' }}
                  onLoad={recalcOverlay}
                />
              ) : (
                <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>No image</Box>
              )}

              {/* areas overlay */}
              {!!image && areas.map(a => {
                const isSel = a.id === selectedId;
                return (
                  <Box
                    key={a.id}
                    onMouseDown={(e) => startMove(a.id, e)}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(a.id); }}
                    sx={{
                      position: 'absolute',
                      left: `${pctClamp(a.x)}%`,
                      top: `${pctClamp(a.y)}%`,
                      width: `${pctClamp(a.w)}%`,
                      height: `${pctClamp(a.h)}%`,
                      border: '2px solid',
                      borderColor: isSel ? '#2e7d32' : 'rgba(46,125,50,.55)',
                      background: isSel ? 'rgba(102,187,106,.15)' : 'rgba(102,187,106,.08)',
                      cursor: 'move',
                    }}
                    title={a.label || a.url || a.id}
                  >
                    {/* resize handles */}
                    {['nw','n','ne','e','se','s','sw','w'].map(h => (
                      <Box
                        key={h}
                        onMouseDown={(e) => startResize(a.id, h, e)}
                        sx={{
                          position: 'absolute',
                          width: 10,
                          height: 10,
                          bgcolor: isSel ? '#2e7d32' : '#66bb6a',
                          borderRadius: '2px',
                          cursor: handleCursor[h] || 'pointer',
                          ...(h === 'nw' && { left: -5, top: -5 }),
                          ...(h === 'n'  && { left: 'calc(50% - 5px)', top: -5 }),
                          ...(h === 'ne' && { right: -5, top: -5 }),
                          ...(h === 'e'  && { right: -5, top: 'calc(50% - 5px)' }),
                          ...(h === 'se' && { right: -5, bottom: -5 }),
                          ...(h === 's'  && { left: 'calc(50% - 5px)', bottom: -5 }),
                          ...(h === 'sw' && { left: -5, bottom: -5 }),
                          ...(h === 'w'  && { left: -5, top: 'calc(50% - 5px)' }),
                        }}
                      />
                    ))}
                  </Box>
                );
              })}
            </Box>
          </Paper>
        </Grid>

        {/* Right: areas editor */}
        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle1">Tap areas</Typography>
              <Button onClick={handleAddArea}>+ Add area</Button>
            </Stack>

            {areas.length === 0 ? (
              <Typography color="text.secondary">ยังไม่มีพื้นที่กด</Typography>
            ) : (
              <Stack spacing={2}>
                {areas.map((a, idx) => (
                  <Box key={a.id} sx={{ p: 1.5, border: '1px solid #eee', borderRadius: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography
                        onClick={() => setSelectedId(a.id)}
                        sx={{
                          fontWeight: a.id === selectedId ? 700 : 500,
                          cursor: 'pointer',
                          flex: 1,
                        }}
                      >
                        Area #{idx + 1} {a.label ? `- ${a.label}` : ''}
                      </Typography>
                      <IconButton size="small" color="error" onClick={() => handleRemoveArea(a.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>

                    <Divider sx={{ my: 1 }} />

                    <Grid container spacing={1}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Label (optional)"
                          value={a.label || ''}
                          onChange={(e) => updateArea(a.id, { label: e.target.value })}
                        />
                      </Grid>

                      <Grid item xs={12} sm={6}>
                        <Select
                          fullWidth
                          size="small"
                          value={a.type || 'uri'}
                          onChange={(e) => updateArea(a.id, { type: e.target.value })}
                        >
                          <MenuItem value="uri">Open URL</MenuItem>
                          <MenuItem value="message">Send message</MenuItem>
                        </Select>
                      </Grid>

                      {a.type === 'message' ? (
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            label="Message text"
                            placeholder="ข้อความที่จะส่ง"
                            value={a.text || ''}
                            onChange={(e) => updateArea(a.id, { text: e.target.value })}
                          />
                        </Grid>
                      ) : (
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            label="URL"
                            placeholder="https://example.com"
                            value={a.url || ''}
                            onChange={(e) => updateArea(a.id, { url: e.target.value })}
                          />
                        </Grid>
                      )}

                      <Grid item xs={6} sm={3}>
                        <TextField
                          label="Left %"
                          type="number"
                          inputProps={{ step: '0.1' }}
                          value={a.x}
                          onChange={(e) => updateArea(a.id, { x: pctClamp(e.target.value) })}
                        />
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <TextField
                          label="Top %"
                          type="number"
                          inputProps={{ step: '0.1' }}
                          value={a.y}
                          onChange={(e) => updateArea(a.id, { y: pctClamp(e.target.value) })}
                        />
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <TextField
                          label="Width %"
                          type="number"
                          inputProps={{ step: '0.1' }}
                          value={a.w}
                          onChange={(e) => updateArea(a.id, { w: pctClamp(e.target.value) })}
                        />
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <TextField
                          label="Height %"
                          type="number"
                          inputProps={{ step: '0.1' }}
                          value={a.h}
                          onChange={(e) => updateArea(a.id, { h: pctClamp(e.target.value) })}
                        />
                      </Grid>
                    </Grid>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Notes</Typography>
            <Typography variant="body2" color="text.secondary">
              • ลากที่กล่องเพื่อย้าย | ลาก “จุดสี่มุม + สี่ด้าน” เพื่อย่อ/ขยาย <br/>
              • ระบบคุมไม่ให้กล่องหลุดขอบรูป และคงค่าเป็นเปอร์เซ็นต์เพื่อสเกลอัตโนมัติ <br/>
              • เวลา “Publish to Imagemap” แนะนำให้อัปโหลดรูปจากไฟล์เพื่อคุณภาพ, แต่ถ้าให้ URL อย่างเดียว ระบบจะดาวน์โหลดมาเป็นไฟล์ให้อัตโนมัติ
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
