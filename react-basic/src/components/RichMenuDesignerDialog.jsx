import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, Typography, TextField, IconButton, Paper,
  Select, MenuItem, Slider, Tooltip, Chip, useMediaQuery, Divider,
  ToggleButton, ToggleButtonGroup
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import VerticalAlignCenterIcon from '@mui/icons-material/VerticalAlignCenter';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';

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

/* ---------- sticker sets (by category) ---------- */
/* ไอคอนเป็น SVG อย่างง่ายแบบ data URL ให้โหลดเร็วและคมชัดทุกขนาด */
const C = encodeURIComponent;
const mk = (svg) => `data:image/svg+xml;utf8,${svg}`;
const ico = {
  plate: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="96" fill="%23FFC107"/><rect x="70" y="120" width="116" height="18" rx="9" fill="%23fff"/></svg>`),
  coffee: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="40" y="96" width="176" height="80" rx="10" fill="%235D4037"/><rect x="176" y="70" width="24" height="56" rx="10" fill="%235D4037"/><rect x="56" y="112" width="144" height="48" rx="6" fill="%23A1887F"/></svg>`),
  tshirt: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M64 64l32-24h64l32 24-24 24v104H88V88z" fill="%23E91E63"/></svg>`),
  bag: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="48" y="96" width="160" height="112" rx="16" fill="%239C27B0"/><path d="M88 96a40 40 0 0 1 80 0" stroke="%23fff" stroke-width="12" fill="none"/></svg>`),
  plane: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M16 144l224-80-96 96 24 64-32-40-56 24 24-56z" fill="%2300ACC1"/></svg>`),
  palm: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 80c-32-48-96-16-96-16s64 8 80 32c-64-8-96 48-96 48s80-24 112-8V240h24V136c32-16 112 8 112 8s-32-56-96-48c16-24 80-32 80-32s-64-32-96 16z" fill="%234CAF50"/></svg>`),
  house: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M32 128l96-72 96 72v96H32z" fill="%23FF7043"/><rect x="96" y="160" width="64" height="64" fill="%23fff"/></svg>`),
  bldg: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="48" y="48" width="160" height="160" rx="8" fill="%233F51B5"/><g fill="%23fff"><rect x="72" y="72" width="32" height="24"/><rect x="120" y="72" width="32" height="24"/><rect x="72" y="112" width="32" height="24"/><rect x="120" y="112" width="32" height="24"/></g></svg>`),
  bell: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 224c16 0 28-8 32-24H96c4 16 16 24 32 24zm80-64c0-56-24-80-64-88V64a16 16 0 0 0-32 0v8c-40 8-64 32-64 88l-16 16h208z" fill="%23FFB300"/></svg>`),
  mega: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M32 176l64-16 96-96 32 32-96 96-16 64-24-40-40-24z" fill="%23F4511E"/></svg>`),
  heart: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 226s-92-54-92-122c0-27 21-48 48-48 20 0 34 10 44 24 10-14 24-24 44-24 27 0 48 21 48 48 0 68-92 122-92 122z" fill="%23E53935"/></svg>`),
  leaf: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M224 64C96 48 48 176 48 176s128 48 160-80c0 96-64 144-64 144s128-48 80-176z" fill="%234CAF50"/></svg>`),
  cap: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M16 120l112-40 112 40-112 40z" fill="%23009688"/><rect x="56" y="160" width="144" height="32" fill="%23009688"/></svg>`),
  book: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M56 48h96a24 24 0 0 1 24 24v136a24 24 0 0 0-24-24H56z" fill="%233F51B5"/><rect x="128" y="48" width="72" height="160" fill="%235C6BC0"/></svg>`),
  wrench: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M224 64l-48 48-24-8-72 72 24 24 72-72-8-24z" fill="%239E9D24"/></svg>`),
  clock: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="96" fill="%2360738B"/><path d="M128 72v56l48 32" stroke="%23fff" stroke-width="16" fill="none"/></svg>`),
  cross: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="40" y="104" width="176" height="48" fill="%23D32F2F"/><rect x="104" y="40" width="48" height="176" fill="%23D32F2F"/></svg>`),
  stetho: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M80 64v64a48 48 0 0 0 96 0V64" stroke="%23009688" stroke-width="16" fill="none"/><circle cx="192" cy="64" r="16" fill="%23009688"/></svg>`),
  car: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M48 144l24-56h112l24 56v40H48z" fill="%230E88F2"/><circle cx="80" cy="192" r="16" fill="%23033E8C"/><circle cx="176" cy="192" r="16" fill="%23033E8C"/></svg>`),
  wheel: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="96" fill="%23033E8C"/><circle cx="128" cy="128" r="40" fill="%23fff"/></svg>`),
  cart: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M40 64h24l20 96h96l20-64H92" fill="none" stroke="%233F51B5" stroke-width="16"/><circle cx="112" cy="192" r="16" fill="%233F51B5"/><circle cx="176" cy="192" r="16" fill="%233F51B5"/></svg>`),
  box: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M48 96l80-32 80 32v96l-80 32-80-32z" fill="%23A1887F"/><path d="M128 64v160" stroke="%23755C4A" stroke-width="12"/></svg>`),
  star: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><polygon points="128,20 158,98 240,98 172,146 198,228 128,178 58,228 84,146 16,98 98,98" fill="%23FFC107"/></svg>`),
  chat: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M32 48h192c13 0 24 11 24 24v88c0 13-11 24-24 24H112l-56 40v-40H32c-13 0-24-11-24-24V72c0-13 11-24 24-24z" fill="%2334A853"/></svg>`),
};

const STICKER_CATS = {
  'ร้านอาหาร / คาเฟ่': [ico.plate, ico.coffee],
  'แฟชั่น / สินค้าทั่วไป': [ico.tshirt, ico.bag],
  'ท่องเที่ยว / รีสอร์ต': [ico.plane, ico.palm],
  'อสังหาริมทรัพย์': [ico.house, ico.bldg],
  'ข่าว / อัปเดต / บริการร้าน': [ico.bell, ico.mega],
  'สุขภาพ / ความงาม': [ico.heart, ico.leaf],
  'การศึกษา / สถาบัน': [ico.cap, ico.book],
  'ไลฟ์สไตล์ / บริการ': [ico.wrench, ico.clock],
  'คลินิก / โรงพยาบาล': [ico.cross, ico.stetho],
  'ยานยนต์ / รถยนต์': [ico.car, ico.wheel],
  'E-Commerce': [ico.cart, ico.box],
  'อื่น ๆ': [ico.star, ico.chat],
};

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

/* ---------- component ---------- */
export default function RichMenuDesignerDialog({
  open,
  onClose,
  templateSize = 'large',
  areas = [],           // [{id, x, y, w, h}] (percent)
  onExport,             // async (file) => {}
}) {
  // Preview canvas constants
  const CANVAS_W = 1000;
  const EXPORT_W = 2500;
  const EXPORT_H = templateSize === 'compact' ? 843 : 1686;
  const CANVAS_H = Math.round((EXPORT_H / EXPORT_W) * CANVAS_W);
  const SCALE = EXPORT_W / CANVAS_W;

  const cells = useMemo(() => (areas || []).map(a => ({ id: a.id, ...pctToPxRect(a, CANVAS_W, CANVAS_H) })), [areas]);

  const [bgColor] = useState('#ffffff'); // canvas fixed = white
  const [zoom, setZoom] = useState(100);
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
    imageFit: 'cover',          // default → เติมเต็มช่อง
    sticker: null,
    stickerScale: 1,
    stickerPos: 'center',
    positionMode: 'grid',       // 'grid' | 'free'
    textPos: { x: 50, y: 50 },
    stickerPosFree: { x: 50, y: 50 },
    dragTarget: 'text',
  });

  const [configs, setConfigs] = useState(() => (areas || []).map(defaultCfg));
  useEffect(() => { setConfigs((areas || []).map(defaultCfg)); }, [areas?.length]);

  const canvasRef = useRef(null);

  /* --------- history: undo/redo ---------- */
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const pushHistory = (next) => {
    const cur = JSON.stringify(configs);
    const nxt = JSON.stringify(next);
    if (cur === nxt) return;
    setHistory((h) => [...h, cur].slice(-100)); // cap 100 steps
    setFuture([]);
    setConfigs(next);
  };

  // selection + click-to-select from preview
  const [selIdx, setSelIdx] = useState(0);
  const cfg = configs[selIdx] || {};

  function findCellIndexByPoint(px, py) {
    const i = cells.findIndex((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
    return i >= 0 ? i : 0;
  }

  /* --------- draw preview ---------- */
  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0,0,cvs.width,cvs.height);
    ctx.fillStyle = bgColor; ctx.fillRect(0,0,cvs.width,cvs.height);

    cells.forEach((cell, idx) => {
      const cg = configs[idx] || {};
      const padding = cg.padding || 0;
      const tx = cell.x + padding, ty = cell.y + padding;
      const tw = cell.w - padding*2, th = cell.h - padding*2;

      if (cg.fillColor) { ctx.fillStyle = cg.fillColor; ctx.fillRect(cell.x, cell.y, cell.w, cell.h); }

      if (cg.image) {
        const img = cg.image;
        let dw, dh, dx, dy;
        if (cg.imageFit === 'contain') {
          const r = Math.min(tw / img.width, th / img.height);
          dw = Math.round(img.width * r); dh = Math.round(img.height * r);
        } else {
          const r = Math.max(tw / img.width, th / img.height);
          dw = Math.round(img.width * r); dh = Math.round(img.height * r);
        }
        dx = tx + Math.round((tw - dw) / 2);
        dy = ty + Math.round((th - dh) / 2);
        ctx.drawImage(img, dx, dy, dw, dh);
      }

      if (cg.sticker) {
        const img = cg.sticker;
        const base = Math.min(tw, th) * (cg.stickerScale || 1);
        let dx = tx + Math.round((tw - base)/2);
        let dy = ty + Math.round((th - base)/2);
        if (cg.positionMode === 'free') {
          const cx = tx + (cg.stickerPosFree?.x ?? 50) * tw / 100;
          const cy = ty + (cg.stickerPosFree?.y ?? 50) * th / 100;
          dx = Math.round(cx - base/2); dy = Math.round(cy - base/2);
        } else {
          if (cg.stickerPos === 'topLeft') { dx = tx; dy = ty; }
          if (cg.stickerPos === 'topRight') { dx = tx + tw - base; dy = ty; }
          if (cg.stickerPos === 'bottomLeft') { dx = tx; dy = ty + th - base; }
          if (cg.stickerPos === 'bottomRight') { dx = tx + tw - base; dy = ty + th - base; }
        }
        ctx.drawImage(img, dx, dy, base, base);
      }

      const t = (cg.text || '').trim();
      if (t) {
        ctx.fillStyle = cg.textColor || '#000';
        ctx.font = `${cg.fontWeight || 400} ${cg.fontSize || 22}px ${cg.fontFamily || 'system-ui'}`;
        ctx.textAlign = (cg.align || 'center'); ctx.textBaseline = 'alphabetic';

        let x = tx + tw/2, y = ty + th/2;
        if (cg.positionMode === 'grid') {
          if (cg.align === 'left')  x = tx;
          if (cg.align === 'right') x = tx + tw;
          if (cg.vAlign === 'top') y = ty + (cg.fontSize || 22);
          if (cg.vAlign === 'bottom') y = ty + th - 6;
        } else {
          x = tx + (cg.textPos?.x ?? 50) * tw / 100;
          y = ty + (cg.textPos?.y ?? 50) * th / 100;
        }

        const lines = t.split(/\n/), lh = Math.round((cg.fontSize || 22) * 1.25);

        ctx.shadowColor = cg.textShadow?.color || 'rgba(0,0,0,.25)';
        ctx.shadowBlur = cg.textShadow?.blur ?? 6;
        ctx.shadowOffsetX = cg.textShadow?.x ?? 0;
        ctx.shadowOffsetY = cg.textShadow?.y ?? 2;

        if (lines.length === 1) ctx.fillText(lines[0], Math.round(x), Math.round(y));
        else {
          const startY = Math.round(y - ((lines.length-1) * lh)/2);
          lines.forEach((ln, i) => ctx.fillText(ln, Math.round(x), startY + i*lh));
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      }

      // outline + block tag
      ctx.lineWidth = (idx === selIdx) ? 2 : 1;
      ctx.strokeStyle = (idx === selIdx) ? '#1976d2' : 'rgba(0,0,0,.12)';
      ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);

      // tag #n
      ctx.fillStyle = (idx === selIdx) ? '#1976d2' : 'rgba(0,0,0,.55)';
      ctx.fillRect(cell.x + 6, cell.y + 6, 26, 18);
      ctx.fillStyle = '#fff';
      ctx.font = `600 12px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${idx+1}`, cell.x + 6 + 13, cell.y + 6 + 9);
    });
  }, [cells, configs, bgColor, selIdx]);

  // update helper
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

  // stickers
  const [stCat, setStCat] = useState(Object.keys(STICKER_CATS)[0]);
  async function onPickSticker(url) {
    const img = await new Promise((resolve) => { const im = new Image(); im.onload = ()=>resolve(im); im.src = url; });
    const next = configs.map((c,i)=> i===selIdx ? { ...c, sticker: img } : c);
    pushHistory(next);
  }

  // export (JPEG fixed)
  async function exportImage() {
    const cvs = document.createElement('canvas');
    cvs.width = EXPORT_W; cvs.height = EXPORT_H;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,cvs.width,cvs.height);

    (areas || []).forEach((a, idx) => {
      const rect = pctToPxRect(a, EXPORT_W, EXPORT_H);
      const c = configs[idx] || {};
      const padding = Math.round((c.padding || 0) * SCALE);
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
        const fontPx = Math.round((c.fontSize || 22) * SCALE);
        ctx.fillStyle = c.textColor || '#000';
        ctx.font = `${c.fontWeight || 400} ${fontPx}px ${c.fontFamily || 'system-ui'}`;
        ctx.textAlign = (c.align || 'center'); ctx.textBaseline = 'alphabetic';

        let x = tx + tw/2, y = ty + th/2;
        if (c.positionMode === 'grid') {
          if (c.align === 'left')  x = tx;
          if (c.align === 'right') x = tx + tw;
          if (c.vAlign === 'top') y = ty + fontPx;
          if (c.vAlign === 'bottom') y = ty + th - Math.round(fontPx*0.25);
        } else {
          x = tx + (c.textPos?.x ?? 50) * tw / 100;
          y = ty + (c.textPos?.y ?? 50) * th / 100;
        }

        ctx.shadowColor = c.textShadow?.color || 'rgba(0,0,0,.25)';
        ctx.shadowBlur = Math.round((c.textShadow?.blur ?? 6) * SCALE);
        ctx.shadowOffsetX = Math.round((c.textShadow?.x ?? 0) * SCALE);
        ctx.shadowOffsetY = Math.round((c.textShadow?.y ?? 2) * SCALE);

        const lines = t.split(/\n/), lh = Math.round(fontPx * 1.25);
        if (lines.length === 1) ctx.fillText(lines[0], Math.round(x), Math.round(y));
        else {
          const startY = Math.round(y - ((lines.length-1) * lh)/2);
          lines.forEach((ln, i) => ctx.fillText(ln, Math.round(x), startY + i*lh));
        }
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      }
    });

    const blob = await new Promise(r => cvs.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) return;
    const file = new File([blob], `richmenu-designed.jpg`, { type: 'image/jpeg' });
    if (onExport) await onExport(file);
  }

  // measure & auto-fit
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

  /* --------- dragging (free) + click selection ---------- */
  const [drag, setDrag] = useState(null); // { type:'text'|'sticker', offsetX, offsetY }
  function canvasToLocal(e, cvs) {
    const r = cvs.getBoundingClientRect();
    const x = (e.clientX - r.left) * (cvs.width / r.width);
    const y = (e.clientY - r.top) * (cvs.height / r.height);
    return { x, y };
  }
  function handleDown(e) {
    const cvs = canvasRef.current; if (!cvs) return;
    const { x, y } = canvasToLocal(e, cvs);

    // คลิกเลือกบล็อกก่อน
    const idx = findCellIndexByPoint(x, y);
    if (idx !== selIdx) { setSelIdx(idx); return; }

    const c = configs[selIdx];
    if (!c || c.positionMode !== 'free') return;

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
          }}>UNDO</Button>
          <Button size="small" onClick={()=>{
            if (!future.length) return;
            const next = JSON.parse(future[0]);
            setFuture(f=>f.slice(1));
            setHistory(h=>[...h, JSON.stringify(configs)]);
            setConfigs(next);
          }}>REDO</Button>
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
              <Button size="small" onClick={()=>setZoom(90)}>FIT</Button>
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
            {/* Block selector */}
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
                <Button size="small" color="warning" onClick={()=>pushHistory(configs.map((c,i)=>i===selIdx? defaultCfg():c))}>RESET BLOCK</Button>
              </Stack>

              <Divider sx={{ my: 1 }} />

              {/* Text */}
              <Typography variant="caption" sx={{ mb:.5, display:'block' }}>Text</Typography>
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

              {/* grid vs free + align icons */}
              <Stack direction="row" spacing={1} sx={{ mb:1, alignItems:'center', flexWrap:'wrap' }}>
                <Select size="small" value={cfg.positionMode || 'grid'} onChange={(e)=>update({ positionMode:e.target.value })}>
                  <MenuItem value="grid">Grid position</MenuItem>
                  <MenuItem value="free">Free position</MenuItem>
                </Select>

                {cfg.positionMode === 'grid' ? (
                  <>
                    <ToggleButtonGroup exclusive size="small"
                      value={cfg.align || 'center'}
                      onChange={(_, v)=> v && update({ align:v })}
                    >
                      <ToggleButton value="left"><FormatAlignLeftIcon fontSize="small" /></ToggleButton>
                      <ToggleButton value="center"><FormatAlignCenterIcon fontSize="small" /></ToggleButton>
                      <ToggleButton value="right"><FormatAlignRightIcon fontSize="small" /></ToggleButton>
                    </ToggleButtonGroup>

                    <ToggleButtonGroup exclusive size="small"
                      value={cfg.vAlign || 'center'}
                      onChange={(_, v)=> v && update({ vAlign:v })}
                    >
                      <ToggleButton value="top"><VerticalAlignTopIcon fontSize="small" /></ToggleButton>
                      <ToggleButton value="center"><VerticalAlignCenterIcon fontSize="small" /></ToggleButton>
                      <ToggleButton value="bottom"><VerticalAlignBottomIcon fontSize="small" /></ToggleButton>
                    </ToggleButtonGroup>
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

                <Button size="small" onClick={autoFitText}>AUTO-FIT TEXT</Button>
              </Stack>

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

              <Divider sx={{ my: 1 }} />

              {/* Block background + image */}
              <Typography variant="caption" sx={{ display:'block', mb:.5 }}>Block background</Typography>
              <ColorInput label="Block color" value={cfg.fillColor || '#f6f6f6'} onChange={(v)=>update({ fillColor:v })} />
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap:'wrap' }}>
                {['#ffffff','#000000','#66bb6a','#43a047','#1e88e5','#fbc02d','#e53935','#8e24aa','#ff7043','#455a64']
                  .map(c => <Chip key={c} size="small" label="" onClick={()=>update({ fillColor:c })} sx={{ bgcolor:c, border:'1px solid rgba(0,0,0,.1)' }} />)}
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button component="label" variant="outlined" size="small">
                  Upload image
                  <input type="file" accept="image/*" hidden onChange={(e)=> onPickImage(selIdx, e.target.files?.[0])} />
                </Button>
                <Select size="small" value={cfg.imageFit || 'cover'} onChange={(e) => update({ imageFit:e.target.value })}>
                  <MenuItem value="contain">Contain</MenuItem>
                  <MenuItem value="cover">Cover</MenuItem>
                </Select>
              </Stack>

              <Divider sx={{ my: 1 }} />

              {/* Stickers by category */}
              <Typography variant="caption" sx={{ display:'block', mb:.5 }}>Stickers</Typography>
              <Stack direction="row" spacing={1} sx={{ mb:1 }}>
                <Select size="small" value={stCat} onChange={(e)=>setStCat(e.target.value)} sx={{ flex: 1 }}>
                  {Object.keys(STICKER_CATS).map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                </Select>
                {cfg.sticker && <Button size="small" onClick={() => update({ sticker:null })}>CLEAR</Button>}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ flexWrap:'wrap' }}>
                {STICKER_CATS[stCat].map((url, i) => (
                  <Tooltip key={i} title={stCat}>
                    <IconButton size="small" onClick={() => onPickSticker(url)}>
                      <img src={url} alt="" width={24} height={24} />
                    </IconButton>
                  </Tooltip>
                ))}
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
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>CANCEL</Button>
        <Button variant="contained" onClick={exportImage}>EXPORT IMAGE</Button>
      </DialogActions>
    </Dialog>
  );
}
