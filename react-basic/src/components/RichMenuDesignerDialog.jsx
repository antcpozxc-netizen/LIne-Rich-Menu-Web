// src/components/RichMenuDesignerDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, Typography, TextField, IconButton, Paper,
  Select, MenuItem, Slider, Tooltip, Chip, useMediaQuery
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/* ---------- helpers ---------- */
function pctToPxRect(cellPct, width, height) {
  const x = Math.round((cellPct.x / 100) * width);
  const y = Math.round((cellPct.y / 100) * height);
  const w = Math.round((cellPct.w / 100) * width);
  const h = Math.round((cellPct.h / 100) * height);
  return { x, y, w, h };
}

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

// Stickers (SVG data url)
const STICKERS = [
  { name: 'Star',  url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><polygon points="128,16 158,98 244,98 174,150 198,236 128,184 58,236 82,150 12,98 98,98" fill="%23FFC107"/></svg>' },
  { name: 'Heart', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 226s-92-54-92-122c0-27 21-48 48-48 20 0 34 10 44 24 10-14 24-24 44-24 27 0 48 21 48 48 0 68-92 122-92 122z" fill="%23E53935"/></svg>' },
  { name: 'Chat',  url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M32 48h192c13 0 24 11 24 24v88c0 13-11 24-24 24H112l-56 40v-40H32c-13 0-24-11-24-24V72c0-13 11-24 24-24z" fill="%2334A853"/></svg>' },
  { name: 'Phone', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M176 16h-96c-18 0-32 14-32 32v160c0 18 14 32 32 32h96c18 0 32-14 32-32V48c0-18-14-32-32-32zm-16 200h-64v-8h64v8zm16-32H96V48h80v136z" fill="%2300BCD4"/></svg>' },
  { name: 'Cart',  url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M40 48h24l20 96h96l20-64H92" fill="none" stroke="%233F51B5" stroke-width="16"/><circle cx="112" cy="192" r="16" fill="%233F51B5"/><circle cx="176" cy="192" r="16" fill="%233F51B5"/></svg>' },
  { name: 'Pin',   url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 240s80-92 80-144c0-44-36-80-80-80s-80 36-80 80c0 52 80 144 80 144z" fill="%23D81B60"/><circle cx="128" cy="96" r="28" fill="%23fff"/></svg>' },
];

function loadSticker(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = url;
  });
}

/* ---------- tiny controls ---------- */
function ColorInput({ label, value, onChange, sx }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={sx}>
      <Box component="input" type="color" value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{ width: 42, height: 42, p: 0, border: '1px solid #cfd8dc', borderRadius: 1, bgcolor:'#fff' }} />
      <TextField label={label} size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 160 }} />
    </Stack>
  );
}
const SWATCHES = ['#ffffff','#000000','#66bb6a','#43a047','#1e88e5','#fbc02d','#e53935','#8e24aa','#ff7043','#455a64'];

/* ---------- component ---------- */
export default function RichMenuDesignerDialog({
  open,
  onClose,
  templateSize = 'large',
  areas = [],           // [{id, x, y, w, h}] (percent)
  onExport,             // async (file) => {}
}) {
  const CANVAS_W = 1000;
  const EXPORT_W = 2500;
  const EXPORT_H = templateSize === 'compact' ? 843 : 1686;
  const CANVAS_H = Math.round((EXPORT_H / EXPORT_W) * CANVAS_W);

  const cells = useMemo(() => (areas || []).map(a => ({ id: a.id, ...pctToPxRect(a, CANVAS_W, CANVAS_H) })), [areas]);

  const [bgColor, setBgColor] = useState('#ffffff');
  const [zoom, setZoom] = useState(100);      // preview zoom %
  const zoomFactor = Math.max(40, Math.min(160, zoom)) / 100;

  // block configs
  const defaultCfg = () => ({
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
    // stickers
    sticker: null,
    stickerScale: 1,
    stickerPos: 'center',
    // free-position
    positionMode: 'grid',            // 'grid' | 'free'
    textPos: { x: 50, y: 50 },       // percent in content rect
    stickerPosFree: { x: 50, y: 50 },
    dragTarget: 'text',              // 'text' | 'sticker'
  });

  const [configs, setConfigs] = useState(() => (areas || []).map(defaultCfg));
  useEffect(() => { setConfigs((areas || []).map(defaultCfg)); }, [areas?.length]);

  const canvasRef = useRef(null);

  // history for undo/redo
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const pushHistory = (next) => { setHistory(h => [...h, JSON.stringify(configs)]); setFuture([]); setConfigs(next); };

  // preview draw
  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0,0,cvs.width,cvs.height);
    ctx.fillStyle = bgColor || '#fff';
    ctx.fillRect(0,0,cvs.width,cvs.height);

    cells.forEach((cell, idx) => {
      const cfg = configs[idx] || {};
      const padding = cfg.padding || 0;
      const tx = cell.x + padding, ty = cell.y + padding;
      const tw = cell.w - padding*2, th = cell.h - padding*2;

      // fill
      if (cfg.fillColor) { ctx.fillStyle = cfg.fillColor; ctx.fillRect(cell.x, cell.y, cell.w, cell.h); }

      // image
      if (cfg.image) {
        const img = cfg.image;
        let dw, dh, dx, dy;
        if (cfg.imageFit === 'contain') {
          const r = Math.min(tw / img.width, th / img.height);
          dw = Math.round(img.width * r); dh = Math.round(img.height * r);
        } else { // cover
          const r = Math.max(tw / img.width, th / img.height);
          dw = Math.round(img.width * r); dh = Math.round(img.height * r);
        }
        dx = tx + Math.round((tw - dw) / 2);
        dy = ty + Math.round((th - dh) / 2);
        ctx.drawImage(img, dx, dy, dw, dh);
      }

      // sticker
      if (cfg.sticker) {
        const img = cfg.sticker;
        const base = Math.min(tw, th) * (cfg.stickerScale || 1);
        let dx = tx + Math.round((tw - base)/2);
        let dy = ty + Math.round((th - base)/2);
        if (cfg.positionMode === 'free') {
          const cx = tx + (cfg.stickerPosFree?.x ?? 50) * tw / 100;
          const cy = ty + (cfg.stickerPosFree?.y ?? 50) * th / 100;
          dx = Math.round(cx - base/2); dy = Math.round(cy - base/2);
        } else {
          if (cfg.stickerPos === 'topLeft') { dx = tx; dy = ty; }
          if (cfg.stickerPos === 'topRight') { dx = tx + tw - base; dy = ty; }
          if (cfg.stickerPos === 'bottomLeft') { dx = tx; dy = ty + th - base; }
          if (cfg.stickerPos === 'bottomRight') { dx = tx + tw - base; dy = ty + th - base; }
        }
        ctx.drawImage(img, dx, dy, base, base);
      }

      // text
      const t = (cfg.text || '').trim();
      if (t) {
        ctx.fillStyle = cfg.textColor || '#000';
        ctx.font = `${cfg.fontWeight || 400} ${cfg.fontSize || 22}px ${cfg.fontFamily || 'system-ui'}`;
        ctx.textAlign = (cfg.align || 'center'); ctx.textBaseline = 'alphabetic';

        let x = tx + tw/2, y = ty + th/2;
        if (cfg.positionMode === 'grid') {
          if (cfg.align === 'left')  x = tx;
          if (cfg.align === 'right') x = tx + tw;
          if (cfg.vAlign === 'top')      y = ty + (cfg.fontSize || 22);
          if (cfg.vAlign === 'bottom')   y = ty + th - 6;
        } else {
          x = tx + (cfg.textPos?.x ?? 50) * tw / 100;
          y = ty + (cfg.textPos?.y ?? 50) * th / 100;
        }

        const lines = t.split(/\n/), lh = Math.round((cfg.fontSize || 22) * 1.25);

        ctx.shadowColor = cfg.textShadow?.color || 'rgba(0,0,0,.25)';
        ctx.shadowBlur = cfg.textShadow?.blur ?? 6;
        ctx.shadowOffsetX = cfg.textShadow?.x ?? 0;
        ctx.shadowOffsetY = cfg.textShadow?.y ?? 2;

        if (lines.length === 1) ctx.fillText(lines[0], Math.round(x), Math.round(y));
        else {
          const startY = Math.round(y - ((lines.length-1) * lh)/2);
          lines.forEach((ln, i) => ctx.fillText(ln, Math.round(x), startY + i*lh));
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      }

      // outline
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
      ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
    });
  }, [cells, configs, bgColor]);

  // selection
  const [selIdx, setSelIdx] = useState(0);
  const cfg = configs[selIdx] || {};

  // update with history
  const update = (partial) => {
    const next = configs.map((c,i)=> i===selIdx ? { ...c, ...partial } : c);
    pushHistory(next);
  };

  // image pick
  async function onPickImage(idx, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const next = configs.map((c,i)=> i===idx ? { ...c, image: img } : c);
      pushHistory(next);
    };
    img.src = url;
  }
  async function onPickSticker(url) {
    const img = await loadSticker(url);
    const next = configs.map((c,i)=> i===selIdx ? { ...c, sticker: img } : c);
    pushHistory(next);
  }

  // export options
  const [exportFmt, setExportFmt] = useState('jpeg');  // 'jpeg' | 'png'
  const [quality, setQuality] = useState(90);          // 10..100

  async function exportImage() {
    const cvs = document.createElement('canvas');
    cvs.width = EXPORT_W; cvs.height = EXPORT_H;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = bgColor || '#fff'; ctx.fillRect(0,0,cvs.width,cvs.height);

    (areas || []).forEach((a, idx) => {
      const rect = pctToPxRect(a, EXPORT_W, EXPORT_H);
      const c = configs[idx] || {};
      const padding = c.padding || 0;
      const tx = rect.x + padding, ty = rect.y + padding;
      const tw = rect.w - padding*2, th = rect.h - padding*2;

      if (c.fillColor) { ctx.fillStyle = c.fillColor; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
      if (c.image) {
        const img = c.image;
        let dw, dh, dx, dy;
        if (c.imageFit === 'contain') {
          const r = Math.min(tw / img.width, th / img.height);
          dw = Math.round(img.width * r); dh = Math.round(img.height * r);
        } else {
          const r = Math.max(tw / img.width, th / img.height);
          dw = Math.round(img.width * r); dh = Math.round(img.height * r);
        }
        dx = tx + Math.round((tw - dw)/2); dy = ty + Math.round((th - dh)/2);
        ctx.drawImage(img, dx, dy, dw, dh);
      }
      if (c.sticker) {
        const img = c.sticker;
        const base = Math.min(tw, th) * (c.stickerScale || 1);
        let dx = tx + Math.round((tw - base)/2), dy = ty + Math.round((th - base)/2);
        if (c.positionMode === 'free') {
          const cx = tx + (c.stickerPosFree?.x ?? 50) * tw / 100;
          const cy = ty + (c.stickerPosFree?.y ?? 50) * th / 100;
          dx = Math.round(cx - base/2); dy = Math.round(cy - base/2);
        } else {
          if (c.stickerPos === 'topLeft') { dx = tx; dy = ty; }
          if (c.stickerPos === 'topRight') { dx = tx + tw - base; dy = ty; }
          if (c.stickerPos === 'bottomLeft') { dx = tx; dy = ty + th - base; }
          if (c.stickerPos === 'bottomRight') { dx = tx + tw - base; dy = ty + th - base; }
        }
        ctx.drawImage(img, dx, dy, base, base);
      }
      const t = (c.text || '').trim();
      if (t) {
        ctx.fillStyle = c.textColor || '#000';
        const fontPx = c.fontSize || 22;
        ctx.font = `${c.fontWeight || 400} ${fontPx}px ${c.fontFamily || 'system-ui'}`;
        ctx.textAlign = (c.align || 'center'); ctx.textBaseline = 'alphabetic';

        let x = tx + tw/2, y = ty + th/2;
        if (c.positionMode === 'grid') {
          if (c.align === 'left')  x = tx;
          if (c.align === 'right') x = tx + tw;
          if (c.vAlign === 'top')      y = ty + fontPx;
          if (c.vAlign === 'bottom')   y = ty + th - Math.round(fontPx*0.25);
        } else {
          x = tx + (c.textPos?.x ?? 50) * tw / 100;
          y = ty + (c.textPos?.y ?? 50) * th / 100;
        }

        ctx.shadowColor = c.textShadow?.color || 'rgba(0,0,0,.25)';
        ctx.shadowBlur = Math.round(c.textShadow?.blur ?? 6);
        ctx.shadowOffsetX = Math.round(c.textShadow?.x ?? 0);
        ctx.shadowOffsetY = Math.round(c.textShadow?.y ?? 2);

        const lines = t.split(/\n/), lh = Math.round(fontPx * 1.25);
        if (lines.length === 1) ctx.fillText(lines[0], Math.round(x), Math.round(y));
        else {
          const startY = Math.round(y - ((lines.length-1) * lh)/2);
          lines.forEach((ln, i) => ctx.fillText(ln, Math.round(x), startY + i*lh));
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      }
    });

    const mime = exportFmt === 'png' ? 'image/png' : 'image/jpeg';
    const q = exportFmt === 'png' ? undefined : Math.max(0.1, Math.min(1, quality/100));
    const blob = await new Promise(r => cvs.toBlob(r, mime, q));
    if (!blob) return;
    const ext = exportFmt === 'png' ? 'png' : 'jpg';
    const file = new File([blob], `richmenu-designed.${ext}`, { type: mime });
    if (onExport) await onExport(file);
  }

  // helpers: measure text & autofit
  function measureMultiline(ctx, text, fontPx) {
    const lines = (text||'').split(/\n/);
    const widths = lines.map(l => ctx.measureText(l).width);
    const maxW = Math.max(0, ...widths);
    const totalH = Math.round(fontPx * 1.25 * lines.length);
    return { maxW, totalH };
  }
  function autoFitText() {
    const cvs = canvasRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const c = configs[selIdx]; if (!c) return;

    const cell = cells[selIdx]; const padding = c.padding || 0;
    const tw = cell.w - padding*2, th = cell.h - padding*2;
    let fontPx = c.fontSize || 22;

    for (let i=0;i<60;i++) {
      ctx.font = `${c.fontWeight||400} ${fontPx}px ${c.fontFamily||'system-ui'}`;
      const { maxW, totalH } = measureMultiline(ctx, c.text, fontPx);
      if (maxW <= tw*0.95 && totalH <= th*0.95) break;
      fontPx -= 1; if (fontPx < 10) break;
    }
    update({ fontSize: fontPx });
  }

  // drag (free position)
  const [drag, setDrag] = useState(null); // { type:'text'|'sticker', offsetX, offsetY }
  function canvasToLocal(e, cvs) {
    const r = cvs.getBoundingClientRect();
    const x = (e.clientX - r.left) * (cvs.width / r.width);
    const y = (e.clientY - r.top) * (cvs.height / r.height);
    return { x, y };
  }
  function handleDown(e) {
    const c = configs[selIdx]; if (!c || c.positionMode !== 'free') return;
    const cvs = canvasRef.current; if (!cvs) return;
    const { x, y } = canvasToLocal(e, cvs);
    const cell = cells[selIdx]; const padding = c.padding || 0;
    const tx = cell.x + padding, ty = cell.y + padding;
    const tw = cell.w - padding*2, th = cell.h - padding*2;

    if (c.dragTarget === 'sticker' && c.sticker) {
      const base = Math.min(tw, th) * (c.stickerScale || 1);
      const cx = tx + (c.stickerPosFree?.x ?? 50) * tw / 100;
      const cy = ty + (c.stickerPosFree?.y ?? 50) * th / 100;
      if (x >= cx-base/2 && x <= cx+base/2 && y >= cy-base/2 && y <= cy+base/2) {
        setDrag({ type:'sticker', offsetX: x - cx, offsetY: y - cy });
        return;
      }
    }
    setDrag({ type:'text', offsetX: 0, offsetY: 0 });
  }
  function handleMove(e) {
    if (!drag) return;
    const cvs = canvasRef.current; if (!cvs) return;
    const { x, y } = canvasToLocal(e, cvs);
    setConfigs(prev => {
      const n=[...prev]; const c={...n[selIdx]};
      const cell = cells[selIdx]; const padding = c.padding || 0;
      const tx = cell.x + padding, ty = cell.y + padding;
      const tw = cell.w - padding*2, th = cell.h - padding*2;

      if (drag.type === 'text') {
        const px = Math.min(100, Math.max(0, ((x - tx) / tw) * 100));
        const py = Math.min(100, Math.max(0, ((y - ty) / th) * 100));
        c.textPos = { x: Math.round(px), y: Math.round(py) };
      } else {
        const cx = x - drag.offsetX, cy = y - drag.offsetY;
        const px = Math.min(100, Math.max(0, ((cx - tx) / tw) * 100));
        const py = Math.min(100, Math.max(0, ((cy - ty) / th) * 100));
        c.stickerPosFree = { x: Math.round(px), y: Math.round(py) };
      }
      n[selIdx] = c; return n;
    });
  }

  // UI helpers
  const applyToAll = () => {
    const c = configs[selIdx]; if (!c) return;
    const next = configs.map((_,i)=> i===selIdx ? c : { ...c });
    pushHistory(next);
  };
  const resetBlock = () => pushHistory(configs.map((c,i)=> i===selIdx ? defaultCfg() : c));

  const fullScreen = useMediaQuery('(max-width:1200px)');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        Design menu image
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" onClick={()=>{
            if (!history.length) return;
            const prev = JSON.parse(history[history.length-1]);
            setHistory(h=>h.slice(0,-1));
            setFuture(f=>[JSON.stringify(configs), ...f]);
            setConfigs(prev);
          }}>Undo</Button>
          <Button size="small" onClick={()=>{
            if (!future.length) return;
            const next = JSON.parse(future[0]);
            setFuture(f=>f.slice(1));
            setHistory(h=>[...h, JSON.stringify(configs)]);
            setConfigs(next);
          }}>Redo</Button>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ height: fullScreen ? '100dvh' : '78vh', overflow:'hidden', p: 1.5 }}>
        <Stack direction="row" spacing={2} sx={{ height:'100%' }}>
          {/* LEFT: Preview */}
          <Paper variant="outlined" sx={{ flex: 1, p: 1.5, display:'flex', flexDirection:'column', minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Preview</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption">Zoom</Typography>
              <Slider value={zoom} min={40} max={160} step={10} onChange={(_, v)=>setZoom(Array.isArray(v)?v[0]:v)} sx={{ width: 140 }} />
              <Button size="small" onClick={()=>setZoom(100)}>100%</Button>
              <Button size="small" onClick={()=>setZoom(90)}>Fit</Button>
            </Stack>

            <Box sx={{ flex:1, overflow:'auto', display:'grid', placeItems:'center', bgcolor:'#f6f8f9', borderRadius:1 }}>
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                onMouseDown={handleDown}
                onMouseMove={handleMove}
                onMouseUp={()=>setDrag(null)}
                onMouseLeave={()=>setDrag(null)}
                style={{
                  width: CANVAS_W * zoomFactor,
                  height: CANVAS_H * zoomFactor,
                  background: '#fff',
                  borderRadius: 6,
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)'
                }}
              />
            </Box>
          </Paper>

          {/* RIGHT: Controls */}
          <Stack spacing={1.5} sx={{ width: 480, minWidth: 480, overflow: 'auto', pr: .5 }}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" gutterBottom>Background</Typography>
              <ColorInput label="Background color" value={bgColor} onChange={setBgColor} />
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap:'wrap' }}>
                {SWATCHES.map(c => <Chip key={c} size="small" label="" onClick={()=>setBgColor(c)} sx={{ bgcolor:c, border:'1px solid rgba(0,0,0,.1)' }} />)}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Block</Typography>
                <Stack direction="row" spacing={1} sx={{ ml: 1 }}>
                  {cells.map((c, idx) => (
                    <Button key={idx} variant={selIdx===idx?'contained':'outlined'} size="small" onClick={() => setSelIdx(idx)}>
                      #{idx+1}
                    </Button>
                  ))}
                </Stack>
                <Box sx={{ flex: 1 }} />
                <Button size="small" onClick={applyToAll}>Apply to all</Button>
                <Button size="small" color="warning" onClick={resetBlock}>Reset block</Button>
              </Stack>

              <TextField label="Text" size="small" multiline minRows={2}
                value={cfg.text || ''} onChange={(e) => update({ text:e.target.value })} sx={{ mb: 1 }} />

              <Stack direction="row" spacing={1} sx={{ mb:1 }}>
                <Select
                  size="small"
                  value={FONT_OPTIONS.find(f => f.family === cfg.fontFamily)?.label || FONT_OPTIONS[0].label}
                  onChange={(e) => {
                    const selected = FONT_OPTIONS.find(f => f.label === e.target.value) || FONT_OPTIONS[0];
                    if (selected.gf) ensureGoogleFontLoaded(selected.gf);
                    update({ fontFamily: selected.family });
                  }}
                  sx={{ flex: 1 }}
                >
                  {FONT_OPTIONS.map(f => <MenuItem key={f.label} value={f.label}>{f.label}</MenuItem>)}
                </Select>
                <TextField label="Font size" size="small" type="number" inputProps={{ min: 10, max: 120 }}
                  value={cfg.fontSize || 22} onChange={(e) => update({ fontSize:Number(e.target.value||22) })} sx={{ width: 140 }} />
                <Select size="small" value={cfg.fontWeight || 400} onChange={(e) => update({ fontWeight:Number(e.target.value) })} sx={{ width: 140 }}>
                  <MenuItem value={400}>Regular</MenuItem>
                  <MenuItem value={600}>SemiBold</MenuItem>
                  <MenuItem value={700}>Bold</MenuItem>
                </Select>
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mb:1 }}>
                <ColorInput label="Text color" value={cfg.textColor || '#000000'} onChange={(v)=>update({ textColor:v })} />
              </Stack>

              {/* grid vs free */}
              <Stack direction="row" spacing={1} sx={{ mb:1 }}>
                <Select size="small" value={cfg.positionMode || 'grid'} onChange={(e)=>update({ positionMode:e.target.value })}>
                  <MenuItem value="grid">Grid position</MenuItem>
                  <MenuItem value="free">Free position</MenuItem>
                </Select>
                {cfg.positionMode === 'grid' ? (
                  <>
                    <Select size="small" value={cfg.align || 'center'} onChange={(e) => update({ align:e.target.value })}>
                      <MenuItem value="left">Align left</MenuItem>
                      <MenuItem value="center">Align center</MenuItem>
                      <MenuItem value="right">Align right</MenuItem>
                    </Select>
                    <Select size="small" value={cfg.vAlign || 'center'} onChange={(e) => update({ vAlign:e.target.value })}>
                      <MenuItem value="top">Top</MenuItem>
                      <MenuItem value="center">Middle</MenuItem>
                      <MenuItem value="bottom">Bottom</MenuItem>
                    </Select>
                  </>
                ) : (
                  <>
                    <Select size="small" value={cfg.dragTarget || 'text'} onChange={(e)=>update({ dragTarget:e.target.value })}>
                      <MenuItem value="text">Move text</MenuItem>
                      <MenuItem value="sticker">Move sticker</MenuItem>
                    </Select>
                    <TextField size="small" label="Text X%" type="number"
                      value={cfg.textPos?.x ?? 50} onChange={(e)=>update({ textPos:{...cfg.textPos, x:Number(e.target.value||0)} })}/>
                    <TextField size="small" label="Text Y%" type="number"
                      value={cfg.textPos?.y ?? 50} onChange={(e)=>update({ textPos:{...cfg.textPos, y:Number(e.target.value||0)} })}/>
                  </>
                )}
                <TextField label="Padding" size="small" type="number" inputProps={{ min:0, max:60 }}
                  value={cfg.padding || 8} onChange={(e) => update({ padding:Number(e.target.value||0) })} sx={{ width: 120 }}
                />
                <Button size="small" onClick={autoFitText}>Auto-fit text</Button>
              </Stack>

              {/* shadow */}
              <Typography variant="caption" sx={{ display:'block', mb:.5 }}>Text shadow</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <ColorInput label="Color" value={cfg.textShadow?.color || 'rgba(0,0,0,.25)'} onChange={(v)=>update({ textShadow: { ...(cfg.textShadow||{}), color:v } })} />
              </Stack>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: .5 }}>
                <Box sx={{ minWidth: 100 }}>
                  <Typography variant="caption">Blur</Typography>
                  <Slider size="small" min={0} max={24} value={cfg.textShadow?.blur ?? 6}
                    onChange={(_, v)=>update({ textShadow: { ...(cfg.textShadow||{}), blur: Array.isArray(v)?v[0]:v } })}/>
                </Box>
                <Box sx={{ minWidth: 120 }}>
                  <Typography variant="caption">Offset X</Typography>
                  <Slider size="small" min={-20} max={20} value={cfg.textShadow?.x ?? 0}
                    onChange={(_, v)=>update({ textShadow: { ...(cfg.textShadow||{}), x: Array.isArray(v)?v[0]:v } })}/>
                </Box>
                <Box sx={{ minWidth: 120 }}>
                  <Typography variant="caption">Offset Y</Typography>
                  <Slider size="small" min={-20} max={20} value={cfg.textShadow?.y ?? 2}
                    onChange={(_, v)=>update({ textShadow: { ...(cfg.textShadow||{}), y: Array.isArray(v)?v[0]:v } })}/>
                </Box>
              </Stack>

              {/* block color & image */}
              <ColorInput label="Block color" value={cfg.fillColor || '#f6f6f6'} onChange={(v)=>update({ fillColor:v })} sx={{ mt: 1 }} />
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap:'wrap' }}>
                {SWATCHES.map(c => <Chip key={c} size="small" label="" onClick={()=>update({ fillColor:c })} sx={{ bgcolor:c, border:'1px solid rgba(0,0,0,.1)' }} />)}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button component="label" variant="outlined" size="small">
                  Upload image
                  <input type="file" accept="image/*" hidden onChange={(e)=> onPickImage(selIdx, e.target.files?.[0])} />
                </Button>
                <Select size="small" value={cfg.imageFit || 'contain'} onChange={(e) => update({ imageFit:e.target.value })}>
                  <MenuItem value="contain">Contain</MenuItem>
                  <MenuItem value="cover">Cover</MenuItem>
                </Select>
              </Stack>

              {/* stickers */}
              <Typography variant="caption" sx={{ mt:1, display:'block' }}>Stickers</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap:'wrap' }}>
                {STICKERS.map(s => (
                  <Tooltip key={s.name} title={s.name}>
                    <IconButton size="small" onClick={() => onPickSticker(s.url)}>
                      <img src={s.url} alt={s.name} width={24} height={24} />
                    </IconButton>
                  </Tooltip>
                ))}
                {cfg.sticker && <Button size="small" onClick={() => update({ sticker:null })}>Clear</Button>}
              </Stack>
              {cfg.sticker && (
                <Stack direction="row" spacing={1} sx={{ mt:1 }}>
                  {cfg.positionMode === 'grid' ? (
                    <Select size="small" value={cfg.stickerPos || 'center'} onChange={(e) => update({ stickerPos:e.target.value })}>
                      <MenuItem value="center">Center</MenuItem>
                      <MenuItem value="topLeft">Top-left</MenuItem>
                      <MenuItem value="topRight">Top-right</MenuItem>
                      <MenuItem value="bottomLeft">Bottom-left</MenuItem>
                      <MenuItem value="bottomRight">Bottom-right</MenuItem>
                    </Select>
                  ) : (
                    <Typography variant="caption" sx={{ display:'flex', alignItems:'center' }}>Drag on canvas</Typography>
                  )}
                  <Box sx={{ px:1, minWidth: 220 }}>
                    <Typography variant="caption">Size</Typography>
                    <Slider size="small" value={(cfg.stickerScale||1)*100}
                      onChange={(_, v) => update({ stickerScale: (Array.isArray(v)?v[0]:v) / 100 })}
                      min={40} max={200} />
                  </Box>
                </Stack>
              )}
            </Paper>

            {/* Export options */}
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" gutterBottom>Export</Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Select size="small" value={exportFmt} onChange={(e)=>setExportFmt(e.target.value)}>
                  <MenuItem value="jpeg">JPEG</MenuItem>
                  <MenuItem value="png">PNG</MenuItem>
                </Select>
                {exportFmt === 'jpeg' && (
                  <>
                    <Typography variant="caption">Quality</Typography>
                    <Slider size="small" value={quality} min={10} max={100} step={5}
                      onChange={(_,v)=>setQuality(Array.isArray(v)?v[0]:v)} sx={{ width: 160 }}/>
                  </>
                )}
              </Stack>
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
