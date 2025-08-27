// src/components/RichMenuDesignerDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, Typography, TextField, IconButton, InputAdornment, Paper,
  Select, MenuItem, Slider, Tooltip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/* ---------- helpers ---------- */
function pctToPxRect(cellPct, width, height) {
  const x = Math.round((cellPct.x / 100) * width);
  const y = Math.round((cellPct.y / 100) * height);
  const w = Math.round((cellPct.w / 100) * width);
  const h = Math.round((cellPct.h / 100) * height);
  return {x, y, w, h};
}

// ฟอนต์ยอดนิยม (รองรับไทย) — โหลดผ่าน Google Fonts อัตโนมัติเมื่อเลือก
const FONT_OPTIONS = [
  { label: 'System (default)', family: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif', gf: null },
  { label: 'Kanit', family: '"Kanit", sans-serif', gf: 'Kanit:wght@400;600;700' },
  { label: 'Sarabun', family: '"Sarabun", sans-serif', gf: 'Sarabun:wght@400;600;700' },
  { label: 'Prompt', family: '"Prompt", sans-serif', gf: 'Prompt:wght@400;600;700' },
  { label: 'Noto Sans Thai', family: '"Noto Sans Thai", sans-serif', gf: 'Noto+Sans+Thai:wght@400;600;700' },
  { label: 'Mitr', family: '"Mitr", sans-serif', gf: 'Mitr:wght@400;600;700' },
  { label: 'Inter', family: '"Inter", sans-serif', gf: 'Inter:wght@400;600;700' },
];

function ensureGoogleFontLoaded(gf) {
  if (!gf) return;
  const id = 'gf-' + gf.replace(/[^\w-]/g, '');
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${gf}&display=swap`;
  document.head.appendChild(link);
}

// สติ๊กเกอร์ชุดสำเร็จ (SVG data URL)
const STICKERS = [
  { name: 'Star', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><polygon points="128,16 158,98 244,98 174,150 198,236 128,184 58,236 82,150 12,98 98,98" fill="%23FFC107"/></svg>' },
  { name: 'Heart', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 226s-92-54-92-122c0-27 21-48 48-48 20 0 34 10 44 24 10-14 24-24 44-24 27 0 48 21 48 48 0 68-92 122-92 122z" fill="%23E53935"/></svg>' },
  { name: 'Chat', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M32 48h192c13 0 24 11 24 24v88c0 13-11 24-24 24H112l-56 40v-40H32c-13 0-24-11-24-24V72c0-13 11-24 24-24z" fill="%2334A853"/></svg>' },
  { name: 'Phone', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M176 16h-96c-18 0-32 14-32 32v160c0 18 14 32 32 32h96c18 0 32-14 32-32V48c0-18-14-32-32-32zm-16 200h-64v-8h64v8zm16-32H96V48h80v136z" fill="%2300BCD4"/></svg>' },
  { name: 'Cart', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M40 48h24l20 96h96l20-64H92" fill="none" stroke="%233F51B5" stroke-width="16"/><circle cx="112" cy="192" r="16" fill="%233F51B5"/><circle cx="176" cy="192" r="16" fill="%233F51B5"/></svg>' },
  { name: 'Pin', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 240s80-92 80-144c0-44-36-80-80-80s-80 36-80 80c0 52 80 144 80 144z" fill="%23D81B60"/><circle cx="128" cy="96" r="28" fill="%23fff"/></svg>' },
];

// โหลดสติ๊กเกอร์เป็น Image
function loadSticker(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = url;
  });
}

/* ---------- component ---------- */
export default function RichMenuDesignerDialog({
  open,
  onClose,
  templateSize = 'large',
  areas = [],           // [{id, x, y, w, h}] (หน่วย %)
  onExport,             // async (file) => {}
}) {
  const CANVAS_W = 1000;
  const EXPORT_W = 2500;
  const EXPORT_H = templateSize === 'compact' ? 843 : 1686;
  const CANVAS_H = Math.round((EXPORT_H / EXPORT_W) * CANVAS_W);

  const cells = useMemo(() => {
    return (areas || []).map(a => ({ id: a.id, ...pctToPxRect(a, CANVAS_W, CANVAS_H) }));
  }, [areas, CANVAS_W, CANVAS_H]);

  const [bgColor, setBgColor] = useState('#ffffff');

  // ค่าเริ่มต้นต่อบล็อก
  const [configs, setConfigs] = useState(() =>
    (areas || []).map(() => ({
      text: '',
      textColor: '#000000',
      fontSize: 22,
      fontWeight: 600,
      fontFamily: FONT_OPTIONS[0].family,
      textShadow: { color: 'rgba(0,0,0,.25)', blur: 6, x: 0, y: 2 },
      align: 'center',
      vAlign: 'center',
      padding: 8,
      fillColor: '#f6f6f6',
      image: null,
      imageFit: 'contain',
      // สติ๊กเกอร์ทับ
      sticker: null,          // Image
      stickerScale: 1,        // 0.5 - 2
      stickerPos: 'center',   // center/topLeft/topRight/bottomLeft/bottomRight
    }))
  );
  useEffect(() => {
    setConfigs((areas || []).map(() => ({
      text: '', textColor: '#000000', fontSize: 22, fontWeight: 600, fontFamily: FONT_OPTIONS[0].family,
      textShadow: { color: 'rgba(0,0,0,.25)', blur: 6, x: 0, y: 2 },
      align: 'center', vAlign: 'center', padding: 8,
      fillColor: '#f6f6f6', image: null, imageFit: 'contain',
      sticker: null, stickerScale: 1, stickerPos: 'center',
    })));
  }, [areas?.length]);

  const canvasRef = useRef(null);

  // วาดพรีวิว
  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0,0,cvs.width,cvs.height);
    ctx.fillStyle = bgColor || '#fff';
    ctx.fillRect(0,0,cvs.width,cvs.height);

    cells.forEach((cell, idx) => {
      const cfg = configs[idx] || {};
      // block fill
      if (cfg.fillColor) {
        ctx.fillStyle = cfg.fillColor;
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
      }
      // block image
      if (cfg.image) {
        const img = cfg.image;
        const padding = cfg.padding || 0;
        const tx = cell.x + padding, ty = cell.y + padding;
        const tw = cell.w - padding*2, th = cell.h - padding*2;
        let dw = tw, dh = th;
        if (cfg.imageFit === 'contain') {
          const r = Math.min(tw / img.width, th / img.height);
          dw = Math.round(img.width * r); dh = Math.round(img.height * r);
        } else {
          const r = Math.max(tw / img.width, th / img.height);
          dw = Math.round(img.width * r); dh = Math.round(img.height * r);
        }
        const dx = tx + Math.round((tw - dw) / 2);
        const dy = ty + Math.round((th - dh) / 2);
        ctx.drawImage(img, dx, dy, dw, dh);
      }
      // sticker overlay
      if (cfg.sticker) {
        const img = cfg.sticker;
        const padding = cfg.padding || 0;
        const tx = cell.x + padding, ty = cell.y + padding;
        const tw = cell.w - padding*2, th = cell.h - padding*2;
        const base = Math.min(tw, th) * (cfg.stickerScale || 1);
        const dw = Math.round(base), dh = Math.round(base);
        let dx = tx + Math.round((tw - dw)/2);
        let dy = ty + Math.round((th - dh)/2);
        if (cfg.stickerPos === 'topLeft') { dx = tx; dy = ty; }
        if (cfg.stickerPos === 'topRight') { dx = tx + tw - dw; dy = ty; }
        if (cfg.stickerPos === 'bottomLeft') { dx = tx; dy = ty + th - dh; }
        if (cfg.stickerPos === 'bottomRight') { dx = tx + tw - dw; dy = ty + th - dh; }
        ctx.drawImage(img, dx, dy, dw, dh);
      }
      // text with shadow
      const t = (cfg.text || '').trim();
      if (t) {
        ctx.fillStyle = cfg.textColor || '#000';
        ctx.font = `${cfg.fontWeight || 400} ${cfg.fontSize || 22}px ${cfg.fontFamily || 'system-ui'}`;
        ctx.textAlign = (cfg.align || 'center'); ctx.textBaseline = 'alphabetic';
        const padding = cfg.padding || 0;
        const tx = cell.x + padding, ty = cell.y + padding;
        const tw = cell.w - padding*2, th = cell.h - padding*2;
        let x = tx + tw/2; if (cfg.align === 'left') x = tx; if (cfg.align === 'right') x = tx + tw;
        let y = ty + th/2; if (cfg.vAlign === 'top') y = ty + (cfg.fontSize || 22); if (cfg.vAlign === 'bottom') y = ty + th - 6;
        const lines = t.split(/\n/), lh = Math.round((cfg.fontSize || 22) * 1.25);

        // shadow
        ctx.shadowColor = cfg.textShadow?.color || 'rgba(0,0,0,.25)';
        ctx.shadowBlur = cfg.textShadow?.blur ?? 6;
        ctx.shadowOffsetX = cfg.textShadow?.x ?? 0;
        ctx.shadowOffsetY = cfg.textShadow?.y ?? 2;

        if (lines.length === 1) ctx.fillText(lines[0], Math.round(x), Math.round(y));
        else {
          const startY = Math.round(y - ((lines.length-1) * lh)/2);
          lines.forEach((ln, i) => ctx.fillText(ln, Math.round(x), startY + i*lh));
        }

        // reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // outline cell
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
      ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
    });
  }, [cells, configs, bgColor]);

  // ใช้ index ของบล็อคตัวเดียวทั่วไฟล์
  const [selIdx, setSelIdx] = useState(0);

  async function onPickImage(idx, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setConfigs(prev => { const next=[...prev]; next[idx] = { ...next[idx], image: img }; return next; });
    };
    img.src = url;
  }

  async function onPickSticker(url) {
    const img = await loadSticker(url);
    setConfigs(prev => { const n=[...prev]; n[selIdx] = { ...n[selIdx], sticker: img }; return n; });
  }

  async function exportImage() {
    const cvs = document.createElement('canvas');
    cvs.width = EXPORT_W; cvs.height = EXPORT_H;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = bgColor || '#fff'; ctx.fillRect(0,0,cvs.width,cvs.height);

    (areas || []).forEach((a, idx) => {
      const rect = pctToPxRect(a, EXPORT_W, EXPORT_H);
      const cfg = configs[idx] || {};
      // fill
      if (cfg.fillColor) { ctx.fillStyle = cfg.fillColor; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
      // image
      if (cfg.image) {
        const img = cfg.image;
        const scale = EXPORT_W / 1000; // อ้างจาก CANVAS_W
        const padding = Math.round((cfg.padding || 0) * scale);
        const tx = rect.x + padding,  ty = rect.y + padding;
        const tw = rect.w - padding*2, th = rect.h - padding*2;
        let dw = tw, dh = th;
        if (cfg.imageFit === 'contain') {
          const r = Math.min(tw / img.width, th / img.height);
          dw = Math.round(img.width * r); dh = Math.round(img.height * r);
        } else {
          const r = Math.max(tw / img.width, th / img.height);
          dw = Math.round(img.width * r); dh = Math.round(img.height * r);
        }
        const dx = tx + Math.round((tw - dw)/2);
        const dy = ty + Math.round((th - dh)/2);
        ctx.drawImage(img, dx, dy, dw, dh);
      }
      // sticker
      if (cfg.sticker) {
        const img = cfg.sticker;
        const scale = EXPORT_W / 1000;
        const padding = Math.round((cfg.padding || 0) * scale);
        const tx = rect.x + padding, ty = rect.y + padding;
        const tw = rect.w - padding*2, th = rect.h - padding*2;
        const base = Math.min(tw, th) * (cfg.stickerScale || 1);
        const dw = Math.round(base), dh = Math.round(base);
        let dx = tx + Math.round((tw - dw)/2);
        let dy = ty + Math.round((th - dh)/2);
        if (cfg.stickerPos === 'topLeft') { dx = tx; dy = ty; }
        if (cfg.stickerPos === 'topRight') { dx = tx + tw - dw; dy = ty; }
        if (cfg.stickerPos === 'bottomLeft') { dx = tx; dy = ty + th - dh; }
        if (cfg.stickerPos === 'bottomRight') { dx = tx + tw - dw; dy = ty + th - dh; }
        ctx.drawImage(img, dx, dy, dw, dh);
      }
      // text + shadow
      const t = (cfg.text || '').trim();
      if (t) {
        const scale = EXPORT_W / 1000;
        const fontPx = Math.round((cfg.fontSize || 22) * scale);
        ctx.fillStyle = cfg.textColor || '#000';
        ctx.font = `${cfg.fontWeight || 400} ${fontPx}px ${cfg.fontFamily || 'system-ui'}`;
        ctx.textAlign = (cfg.align || 'center'); ctx.textBaseline = 'alphabetic';
        const padding = Math.round((cfg.padding || 0) * scale);
        const tx = rect.x + padding, ty = rect.y + padding;
        const tw = rect.w - padding*2, th = rect.h - padding*2;
        let x = tx + tw/2; if (cfg.align === 'left') x = tx; if (cfg.align === 'right') x = tx + tw;
        let y = ty + th/2; if (cfg.vAlign === 'top') y = ty + fontPx; if (cfg.vAlign === 'bottom') y = ty + th - Math.round(fontPx*0.25);

        // shadow
        ctx.shadowColor = cfg.textShadow?.color || 'rgba(0,0,0,.25)';
        ctx.shadowBlur = Math.round(cfg.textShadow?.blur ?? 6);
        ctx.shadowOffsetX = Math.round(cfg.textShadow?.x ?? 0);
        ctx.shadowOffsetY = Math.round(cfg.textShadow?.y ?? 2);

        const lines = t.split(/\n/), lh = Math.round(fontPx * 1.25);
        if (lines.length === 1) ctx.fillText(lines[0], Math.round(x), Math.round(y));
        else {
          const startY = Math.round(y - ((lines.length-1) * lh)/2);
          lines.forEach((ln, i) => ctx.fillText(ln, Math.round(x), startY + i*lh));
        }

        // reset
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      }
    });

    const blob = await new Promise(r => cvs.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) return;
    const file = new File([blob], 'richmenu-designed.jpg', { type: 'image/jpeg' });
    if (onExport) await onExport(file);
  }

  // UI handlers
  const cfg = configs[selIdx] || {};

  function update(partial) {
    setConfigs(prev => { const n=[...prev]; n[selIdx] = { ...n[selIdx], ...partial }; return n; });
  }

  // โหลดฟอนต์เมื่อเปลี่ยนเป็น Google Fonts
  function onChangeFont(family, gf) {
    if (gf) ensureGoogleFontLoaded(gf);
    update({ fontFamily: family });
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        Design menu image
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack direction="row" spacing={2}>
          {/* Preview */}
          <Box>
            <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
              style={{ background:'#fff', borderRadius: 6, boxShadow:'inset 0 0 0 1px rgba(0,0,0,.08)' }} />
          </Box>

          {/* Controls */}
          <Stack spacing={1.5} sx={{ minWidth: 360 }}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" gutterBottom>Background</Typography>
              <TextField
                label="Background color"
                size="small"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                InputProps={{ startAdornment:<InputAdornment position="start">#</InputAdornment> }}
                placeholder="#ffffff"
              />
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" gutterBottom>Block</Typography>

              {/* เลือกบล็อค */}
              <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap:'wrap' }}>
                {cells.map((c, idx) => (
                  <Button key={idx} variant={selIdx===idx?'contained':'outlined'} size="small" onClick={() => setSelIdx(idx)}>
                    #{idx+1}
                  </Button>
                ))}
              </Stack>

              {/* ข้อความ */}
              <TextField
                label="Text"
                size="small"
                multiline
                minRows={2}
                value={cfg.text || ''}
                onChange={(e) => update({ text:e.target.value })}
                sx={{ mb: 1 }}
              />

              {/* ฟอนต์ */}
              <Stack direction="row" spacing={1} sx={{ mb:1 }}>
                <Select
                  size="small"
                  value={FONT_OPTIONS.find(f => f.family === cfg.fontFamily)?.label || FONT_OPTIONS[0].label}
                  onChange={(e) => {
                    const selected = FONT_OPTIONS.find(f => f.label === e.target.value) || FONT_OPTIONS[0];
                    onChangeFont(selected.family, selected.gf);
                  }}
                  sx={{ flex: 1 }}
                >
                  {FONT_OPTIONS.map(f => <MenuItem key={f.label} value={f.label}>{f.label}</MenuItem>)}
                </Select>
                <TextField
                  label="Font size"
                  size="small"
                  type="number"
                  inputProps={{ min: 10, max: 120 }}
                  value={cfg.fontSize || 22}
                  onChange={(e) => update({ fontSize:Number(e.target.value||22) })}
                  sx={{ width: 140 }}
                />
              </Stack>

              <Stack direction="row" spacing={1}>
                <TextField
                  label="Text color"
                  size="small"
                  value={cfg.textColor || '#000000'}
                  onChange={(e) => update({ textColor:e.target.value })}
                />
                <Select
                  size="small"
                  value={cfg.fontWeight || 400}
                  onChange={(e) => update({ fontWeight:Number(e.target.value) })}
                  sx={{ width: 140 }}
                >
                  <MenuItem value={400}>Regular</MenuItem>
                  <MenuItem value={600}>SemiBold</MenuItem>
                  <MenuItem value={700}>Bold</MenuItem>
                </Select>
              </Stack>

              {/* จัดวาง */}
              <Stack direction="row" spacing={1} sx={{ mt:1 }}>
                <Select
                  size="small"
                  value={cfg.align || 'center'}
                  onChange={(e) => update({ align:e.target.value })}
                >
                  <MenuItem value="left">Align left</MenuItem>
                  <MenuItem value="center">Align center</MenuItem>
                  <MenuItem value="right">Align right</MenuItem>
                </Select>
                <Select
                  size="small"
                  value={cfg.vAlign || 'center'}
                  onChange={(e) => update({ vAlign:e.target.value })}
                >
                  <MenuItem value="top">Top</MenuItem>
                  <MenuItem value="center">Middle</MenuItem>
                  <MenuItem value="bottom">Bottom</MenuItem>
                </Select>
              </Stack>

              {/* เงา (Text shadow) */}
              <Typography variant="caption" sx={{ mt:1, display:'block' }}>Text shadow</Typography>
              <Stack direction="row" spacing={1} sx={{ mt:0.5 }}>
                <TextField
                  label="Color"
                  size="small"
                  value={cfg.textShadow?.color || 'rgba(0,0,0,.25)'}
                  onChange={(e) => update({ textShadow: { ...(cfg.textShadow||{}), color:e.target.value } })}
                />
                <TextField
                  label="Blur"
                  size="small" type="number"
                  value={cfg.textShadow?.blur ?? 6}
                  onChange={(e) => update({ textShadow: { ...(cfg.textShadow||{}), blur:Number(e.target.value||0) } })}
                  sx={{ width: 100 }}
                />
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt:0.5 }}>
                <TextField
                  label="Offset X"
                  size="small" type="number"
                  value={cfg.textShadow?.x ?? 0}
                  onChange={(e) => update({ textShadow: { ...(cfg.textShadow||{}), x:Number(e.target.value||0) } })}
                  sx={{ width: 120 }}
                />
                <TextField
                  label="Offset Y"
                  size="small" type="number"
                  value={cfg.textShadow?.y ?? 2}
                  onChange={(e) => update({ textShadow: { ...(cfg.textShadow||{}), y:Number(e.target.value||0) } })}
                  sx={{ width: 120 }}
                />
              </Stack>

              {/* สีพื้น/รูปในบล็อก */}
              <TextField
                label="Block color"
                size="small"
                value={cfg.fillColor || '#f6f6f6'}
                onChange={(e) => update({ fillColor:e.target.value })}
                sx={{ mt: 1 }}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button component="label" variant="outlined" size="small">
                  Upload image
                  <input type="file" accept="image/*" hidden onChange={(e)=> onPickImage(selIdx, e.target.files?.[0])} />
                </Button>
                <Select
                  size="small"
                  value={cfg.imageFit || 'contain'}
                  onChange={(e) => update({ imageFit:e.target.value })}
                >
                  <MenuItem value="contain">Contain</MenuItem>
                  <MenuItem value="cover">Cover</MenuItem>
                </Select>
                <TextField
                  label="Padding"
                  size="small" type="number" inputProps={{ min:0, max:60 }}
                  value={cfg.padding || 8}
                  onChange={(e) => update({ padding:Number(e.target.value||0) })}
                />
              </Stack>

              {/* สติ๊กเกอร์ */}
              <Typography variant="caption" sx={{ mt:1, display:'block' }}>Stickers</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap:'wrap' }}>
                {STICKERS.map(s => (
                  <Tooltip key={s.name} title={s.name}>
                    <IconButton size="small" onClick={() => onPickSticker(s.url)}>
                      <img src={s.url} alt={s.name} width={24} height={24} />
                    </IconButton>
                  </Tooltip>
                ))}
                {cfg.sticker && (
                  <Button size="small" onClick={() => update({ sticker:null })}>Clear</Button>
                )}
              </Stack>
              {cfg.sticker && (
                <Stack direction="row" spacing={1} sx={{ mt:1 }}>
                  <Select
                    size="small"
                    value={cfg.stickerPos || 'center'}
                    onChange={(e) => update({ stickerPos:e.target.value })}
                  >
                    <MenuItem value="center">Center</MenuItem>
                    <MenuItem value="topLeft">Top-left</MenuItem>
                    <MenuItem value="topRight">Top-right</MenuItem>
                    <MenuItem value="bottomLeft">Bottom-left</MenuItem>
                    <MenuItem value="bottomRight">Bottom-right</MenuItem>
                  </Select>
                  <Box sx={{ px:1, minWidth: 180 }}>
                    <Typography variant="caption">Size</Typography>
                    <Slider
                      size="small"
                      value={cfg.stickerScale*100}
                      onChange={(_, v) => update({ stickerScale: (Array.isArray(v)?v[0]:v) / 100 })}
                      min={40} max={200}
                    />
                  </Box>
                </Stack>
              )}
            </Paper>
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={exportImage}>Export image</Button>
      </DialogActions>
    </Dialog>
  );
}
