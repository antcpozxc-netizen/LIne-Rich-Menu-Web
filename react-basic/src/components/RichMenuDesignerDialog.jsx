// src/components/RichMenuDesignerDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, Typography, TextField, IconButton, Paper,
  Select, MenuItem, Slider, Tooltip, Chip, useMediaQuery, Divider,
  ToggleButton, ToggleButtonGroup, Popover
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import VerticalAlignCenterIcon from '@mui/icons-material/VerticalAlignCenter';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddIcon from '@mui/icons-material/Add';
import PhotoIcon from '@mui/icons-material/Photo';
import TextFieldsIcon from '@mui/icons-material/TextFields';

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

/* ---------- stickers (data URLs, เร็ว/คม) ---------- */
const mk = (svg) => `data:image/svg+xml;utf8,${svg}`;

const ico = {
  calendar: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="32" y="56" width="192" height="168" rx="12" fill="%2342A5F5"/><rect x="32" y="56" width="192" height="36" fill="%232877D7"/><path d="M72 40v32M184 40v32" stroke="%23fff" stroke-width="12"/><path d="M72 128l28 28 56-56" stroke="%23fff" stroke-width="16" fill="none"/></svg>`),
  pin: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 232s88-96 88-144a88 88 0 1 0-176 0c0 48 88 144 88 144z" fill="%23E53935"/><circle cx="128" cy="104" r="28" fill="%23fff"/></svg>`),
  chat: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M32 48h192c13 0 24 11 24 24v88c0 13-11 24-24 24H112l-56 40v-40H32c-13 0-24-11-24-24V72c0-13 11-24 24-24z" fill="%2334A853"/></svg>`),
  phone: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M72 40l48 24-16 32c16 32 40 56 72 72l32-16 24 48-32 16c-72-16-128-72-144-144z" fill="%2327AE60"/></svg>`),
  cart: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M40 64h24l20 96h96l20-64H92" fill="none" stroke="%233F51B5" stroke-width="16"/><circle cx="112" cy="192" r="16" fill="%233F51B5"/><circle cx="176" cy="192" r="16" fill="%233F51B5"/></svg>`),
  utensils: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="72" y="32" width="16" height="192" fill="%239E9E9E"/><rect x="104" y="32" width="16" height="192" fill="%239E9E9E"/><path d="M168 32h16v96c0 18-16 18-16 0z" fill="%239E9E9E"/></svg>`),
  plate: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="96" fill="%23FFC107"/><rect x="70" y="120" width="116" height="18" rx="9" fill="%23fff"/></svg>`),
  ticket: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="32" y="88" width="192" height="80" rx="12" fill="%23F57C00"/><circle cx="48" cy="128" r="12" fill="%23fff"/><circle cx="208" cy="128" r="12" fill="%23fff"/><rect x="96" y="108" width="64" height="8" fill="%23fff"/><rect x="96" y="132" width="64" height="8" fill="%23fff"/></svg>`),
  qr: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="%23000"/><rect x="12" y="12" width="232" height="232" fill="%23fff"/><rect x="32" y="32" width="56" height="56"/><rect x="168" y="32" width="56" height="56"/><rect x="32" y="168" width="56" height="56"/><rect x="120" y="120" width="24" height="24"/><rect x="152" y="152" width="40" height="16"/></svg>`),
  rider: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="72" cy="192" r="20" fill="%232196F3"/><circle cx="184" cy="192" r="20" fill="%232196F3"/><path d="M56 192h80l24-72h48" stroke="%232196F3" stroke-width="12" fill="none"/><rect x="160" y="96" width="56" height="40" rx="6" fill="%2342A5F5"/></svg>`),
  map: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><polygon points="64,48 128,72 192,48 192,208 128,184 64,208" fill="%234CAF50"/><polyline points="64,48 64,208 128,184 128,72 192,48 192,208" fill="none" stroke="%232E7D32" stroke-width="6"/></svg>`),
  live: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="24" y="80" width="208" height="96" rx="14" fill="%23D32F2F"/><polygon points="116,112 156,128 116,144" fill="%23fff"/><rect x="36" y="92" width="56" height="16" rx="8" fill="%23fff"/></svg>`),
  clock: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="96" fill="%2360738B"/><path d="M128 72v56l48 32" stroke="%23fff" stroke-width="16" fill="none"/></svg>`),
  bell: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M128 224c16 0 28-8 32-24H96c4 16 16 24 32 24zm80-64c0-56-24-80-64-88V64a16 16 0 0 0-32 0v8c-40 8-64 32-64 88l-16 16h208z" fill="%23FFB300"/></svg>`),
  home: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M32 128l96-72 96 72v96H32z" fill="%23FF7043"/><rect x="96" y="160" width="64" height="64" fill="%23fff"/></svg>`),
  star: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><polygon points="128,20 158,98 240,98 172,146 198,228 128,178 58,228 84,146 16,98 98,98" fill="%23FFC107"/></svg>`),

  // เพิ่มไอคอนเฉพาะงาน Rich Menu
  hotel: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="32" y="64" width="192" height="128" rx="12" fill="%2367B7DC"/><rect x="56" y="112" width="144" height="40" rx="8" fill="%23fff"/><circle cx="88" cy="132" r="10" fill="%2367B7DC"/></svg>`),
  coupon: mk(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect x="32" y="88" width="192" height="80" rx="16" fill="%23FF7043"/><path d="M88 120l80 16" stroke="%23fff" stroke-width="12"/><text x="56" y="140" font-size="24" fill="%23fff">%</text></svg>`),
};

const STICKERS = [
  { label: 'Calendar / นัดหมาย', url: ico.calendar },
  { label: 'Pin / สถานที่', url: ico.pin },
  { label: 'Live chat', url: ico.chat },
  { label: 'Call', url: ico.phone },
  { label: 'Order', url: ico.cart },
  { label: 'Food', url: ico.utensils },
  { label: 'Plate', url: ico.plate },
  { label: 'Coupon', url: ico.coupon },
  { label: 'QR', url: ico.qr },
  { label: 'Rider', url: ico.rider },
  { label: 'Map', url: ico.map },
  { label: 'Live', url: ico.live },
  { label: 'Clock / เวลา', url: ico.clock },
  { label: 'Bell / แจ้งเตือน', url: ico.bell },
  { label: 'Hotel / Booking', url: ico.hotel },
  { label: 'Home', url: ico.home },
  { label: 'Star', url: ico.star },
];

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

  const [zoom, setZoom] = useState(100);
  const zoomFactor = Math.max(40, Math.min(160, zoom)) / 100;

  // layer factories
  const newText = () => ({
    id: 'L' + Math.random().toString(36).slice(2),
    type: 'text',
    text: 'ข้อความ',
    color: '#000000',
    fontSize: 22,
    fontWeight: 600,
    fontFamily: FONT_OPTIONS[0].family,
    shadow: { color: 'rgba(0,0,0,.25)', blur: 6, x: 0, y: 2 },
    posMode: 'grid', // 'grid' | 'free'
    align: 'center',
    vAlign: 'center',
    pos: { x: 50, y: 50 }, // free
  });
  const newSticker = (img=null) => ({
    id: 'L' + Math.random().toString(36).slice(2),
    type: 'sticker',
    img,
    scale: 1,
    posMode: 'grid',
    anchor: 'center', // center|topLeft|topRight|bottomLeft|bottomRight
    pos: { x: 50, y: 50 }, // free
  });
  const newImage = (img=null) => ({
    id: 'L' + Math.random().toString(36).slice(2),
    type: 'image',
    img,
    fit: 'cover', // cover | contain
    opacity: 1,
  });

  const defaultCfg = () => ({
    padding: 8,
    fillColor: '#f6f6f6',
    layers: [ newText() ],
  });

  const [configs, setConfigs] = useState(() => (areas || []).map(defaultCfg));
  useEffect(() => { setConfigs((areas || []).map(defaultCfg)); }, [areas?.length]);

  // selection
  const [selIdx, setSelIdx] = useState(0);
  const cfg = configs[selIdx] || defaultCfg();
  const [selLayerIdx, setSelLayerIdx] = useState(0);
  useEffect(() => {
    if (selLayerIdx > (cfg.layers.length - 1)) setSelLayerIdx(Math.max(0, cfg.layers.length - 1));
  }, [selIdx, cfg.layers.length, selLayerIdx]);
  const curLayer = cfg.layers[selLayerIdx];

  // history (safe)
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const pushHistory = (next) => {
    const cur = JSON.stringify(configs);
    const nxt = JSON.stringify(next);
    if (cur === nxt) return;
    setHistory((h) => [...h, cur].slice(-100));
    setFuture([]);
    setConfigs(next);
  };

  const canvasRef = useRef(null);

  function findCellIndexByPoint(px, py) {
    const i = cells.findIndex((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
    return i >= 0 ? i : 0;
  }

  /* --------- drawing ---------- */
  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0,0,cvs.width,cvs.height);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,cvs.width,cvs.height);

    if (!cells.length) {
      // ไม่มี areas → แสดงข้อความแนะนำแทน “จอขาว”
      ctx.fillStyle = '#90a4ae';
      ctx.font = `600 18px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ยังไม่มีบล็อกในเทมเพลต — กรุณาปิดหน้าต่างนี้แล้วเลือก Template ก่อน', cvs.width/2, cvs.height/2);
      return;
    }

    cells.forEach((cell, idx) => {
      const c = configs[idx] || defaultCfg();
      const padding = c.padding || 0;
      const tx = cell.x + padding, ty = cell.y + padding;
      const tw = cell.w - padding*2, th = cell.h - padding*2;

      // block background
      if (c.fillColor) { ctx.fillStyle = c.fillColor; ctx.fillRect(cell.x, cell.y, cell.w, cell.h); }

      // draw layers in order
      (c.layers || []).forEach((L) => {
        if (L.hidden) return;
        if (L.type === 'image' && L.img) {
          const img = L.img;
          let dw, dh, dx, dy;
          if (L.fit === 'contain') {
            const r = Math.min(tw / img.width, th / img.height);
            dw = Math.round(img.width * r); dh = Math.round(img.height * r);
          } else {
            const r = Math.max(tw / img.width, th / img.height);
            dw = Math.round(img.width * r); dh = Math.round(img.height * r);
          }
          dx = tx + Math.round((tw - dw)/2); dy = ty + Math.round((th - dh)/2);
          if (L.opacity !== 1) { ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, L.opacity)); }
          ctx.drawImage(img, dx, dy, dw, dh);
          if (L.opacity !== 1) ctx.restore();
        }

        if (L.type === 'sticker' && L.img) {
          const img = L.img;
          const base = Math.min(tw, th) * (L.scale || 1);
          let dx = tx + Math.round((tw - base)/2), dy = ty + Math.round((th - base)/2);
          if (L.posMode === 'free') {
            const cx = tx + (L.pos?.x ?? 50) * tw / 100;
            const cy = ty + (L.pos?.y ?? 50) * th / 100;
            dx = Math.round(cx - base/2); dy = Math.round(cy - base/2);
          } else {
            if (L.anchor === 'topLeft') { dx = tx; dy = ty; }
            if (L.anchor === 'topRight') { dx = tx + tw - base; dy = ty; }
            if (L.anchor === 'bottomLeft') { dx = tx; dy = ty + th - base; }
            if (L.anchor === 'bottomRight') { dx = tx + tw - base; dy = ty + th - base; }
          }
          ctx.drawImage(img, dx, dy, base, base);
        }

        if (L.type === 'text' && (L.text || '').trim()) {
          ctx.fillStyle = L.color || '#000';
          ctx.font = `${L.fontWeight || 400} ${L.fontSize || 22}px ${L.fontFamily || 'system-ui'}`;
          ctx.textAlign = (L.align || 'center'); ctx.textBaseline = 'alphabetic';

          let x = tx + tw/2, y = ty + th/2;
          if (L.posMode === 'grid') {
            if (L.align === 'left')  x = tx;
            if (L.align === 'right') x = tx + tw;
            if (L.vAlign === 'top') y = ty + (L.fontSize || 22);
            if (L.vAlign === 'bottom') y = ty + th - 6;
          } else {
            x = tx + (L.pos?.x ?? 50) * tw / 100;
            y = ty + (L.pos?.y ?? 50) * th / 100;
          }

          const lines = String(L.text).split(/\n/);
          const lh = Math.round((L.fontSize || 22) * 1.25);

          ctx.shadowColor = L.shadow?.color || 'rgba(0,0,0,.25)';
          ctx.shadowBlur = L.shadow?.blur ?? 6;
          ctx.shadowOffsetX = L.shadow?.x ?? 0;
          ctx.shadowOffsetY = L.shadow?.y ?? 2;

          if (lines.length === 1) ctx.fillText(lines[0], Math.round(x), Math.round(y));
          else {
            const startY = Math.round(y - ((lines.length-1) * lh)/2);
            lines.forEach((ln, i) => ctx.fillText(ln, Math.round(x), startY + i*lh));
          }

          ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        }
      });

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
  }, [cells, configs, selIdx]);

  // update helpers
  const setCfg = (updater) => {
    const next = configs.map((c,i)=> i===selIdx ? updater(c) : c);
    pushHistory(next);
  };
  const updateLayer = (partial) => {
    setCfg((c) => {
      const layers = c.layers.map((L,i)=> i===selLayerIdx ? { ...L, ...partial } : L);
      return { ...c, layers };
    });
  };

  // add layers
  const addTextLayer = () => setCfg(c => ({ ...c, layers: [...c.layers, newText()] }));
  const addStickerLayerFromUrl = async (url) => {
    const img = await new Promise((resolve) => { const im = new Image(); im.onload = ()=>resolve(im); im.src = url; });
    setCfg(c => ({ ...c, layers: [...c.layers, newSticker(img)] }));
  };
  const addImageLayerFromFile = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      setCfg(c => ({ ...c, layers: [...c.layers, newImage(im)] }));
    };
    im.src = url;
  };

  // layer list ops
  const moveLayer = (dir) => {
    setCfg(c => {
      const layers = [...c.layers];
      const i = selLayerIdx;
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= layers.length) return c;
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...c, layers };
    });
    setSelLayerIdx((i)=> Math.max(0, Math.min(cfg.layers.length-1, dir==='up'? i-1:i+1)));
  };
  const toggleLayer = () => updateLayer({ hidden: !curLayer?.hidden });
  const deleteLayer = () => {
    setCfg(c => ({ ...c, layers: c.layers.filter((_,i)=> i!==selLayerIdx) }));
    setSelLayerIdx((i)=> Math.max(0, i-1));
  };
  const copyLayer = () => {
    if (!curLayer) return;
    const cloned = JSON.parse(JSON.stringify({ ...curLayer, id: 'L' + Math.random().toString(36).slice(2) }));
    if (cloned.type === 'image' || cloned.type === 'sticker') {
      // อ้างอิง object เดิม (เพียงพอสำหรับงานนี้)
      cloned.img = curLayer.img;
    }
    setCfg(c => ({ ...c, layers: [...c.layers, cloned] }));
    setSelLayerIdx(cfg.layers.length);
  };

  // image fit update
  const updateImageFit = (fit) => updateLayer({ fit });

  // text auto-fit
  function measureMultiline(ctx, text, fontPx, fontWeight, fontFamily) {
    const lines = (text||'').split(/\n/);
    ctx.font = `${fontWeight || 400} ${fontPx}px ${fontFamily || 'system-ui'}`;
    const widths = lines.map(l => ctx.measureText(l).width);
    const maxW = Math.max(0, ...widths);
    const totalH = Math.round(fontPx * 1.25 * lines.length);
    return { maxW, totalH };
  }
  function autoFitText() {
    if (!curLayer || curLayer.type !== 'text') return;
    const cvs = canvasRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const cell = cells[selIdx];
    const padding = cfg.padding || 0;
    const tw = cell.w - padding*2, th = cell.h - padding*2;
    let fontPx = curLayer.fontSize || 22;
    for (let i=0;i<60;i++) {
      const { maxW, totalH } = measureMultiline(ctx, curLayer.text, fontPx, curLayer.fontWeight, curLayer.fontFamily);
      if (maxW <= tw*0.95 && totalH <= th*0.95) break;
      fontPx -= 1; if (fontPx < 10) break;
    }
    updateLayer({ fontSize: fontPx });
  }

  /* --------- drag (free) ---------- */
  const [drag, setDrag] = useState(null);
  function canvasToLocal(e, cvs) {
    const r = cvs.getBoundingClientRect();
    const x = (e.clientX - r.left) * (cvs.width / r.width);
    const y = (e.clientY - r.top) * (cvs.height / r.height);
    return { x, y };
  }
  function handleDown(e) {
    const cvs = canvasRef.current; if (!cvs) return;
    const { x, y } = canvasToLocal(e, cvs);
    // เลือกบล็อก
    const idx = findCellIndexByPoint(x, y);
    if (idx !== selIdx) { setSelIdx(idx); return; }

    // ลากเฉพาะ text/sticker ที่ posMode=free
    const L = curLayer;
    if (!L || (L.type !== 'text' && L.type !== 'sticker') || L.posMode !== 'free') return;
    setDrag({ offsetX: 0, offsetY: 0 });
  }
  function handleMove(e) {
    if (!drag) return;
    const cvs = canvasRef.current; if (!cvs) return;
    const { x, y } = canvasToLocal(e, cvs);
    const L = curLayer;
    if (!L) return;

    const cell = cells[selIdx]; const padding = cfg.padding || 0;
    const tx = cell.x + padding, ty = cell.y + padding;
    const tw = cell.w - padding*2, th = cell.h - padding*2;

    const px = Math.min(100, Math.max(0, ((x - tx) / tw) * 100));
    const py = Math.min(100, Math.max(0, ((y - ty) / th) * 100));
    updateLayer({ pos: { x: Math.round(px), y: Math.round(py) } });
  }

  /* --------- export (JPEG) ---------- */
  async function exportImage() {
    const cvs = document.createElement('canvas');
    cvs.width = EXPORT_W; cvs.height = EXPORT_H;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,cvs.width,cvs.height);

    (areas || []).forEach((a, idx) => {
      const rect = pctToPxRect(a, EXPORT_W, EXPORT_H);
      const c = configs[idx] || defaultCfg();
      const padding = Math.round((c.padding || 0) * SCALE);
      const tx = rect.x + padding, ty = rect.y + padding;
      const tw = rect.w - padding*2, th = rect.h - padding*2;

      // block bg
      if (c.fillColor) { ctx.fillStyle = c.fillColor; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }

      // layers
      (c.layers || []).forEach((L) => {
        if (L.hidden) return;

        if (L.type === 'image' && L.img) {
          const img = L.img;
          let dw, dh, dx, dy;
          if (L.fit === 'contain') {
            const r = Math.min(tw / img.width, th / img.height);
            dw = Math.round(img.width * r); dh = Math.round(img.height * r);
          } else {
            const r = Math.max(tw / img.width, th / img.height);
            dw = Math.round(img.width * r); dh = Math.round(img.height * r);
          }
          dx = tx + Math.round((tw - dw)/2); dy = ty + Math.round((th - dh)/2);
          if (L.opacity !== 1) { ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, L.opacity)); }
          ctx.drawImage(img, dx, dy, dw, dh);
          if (L.opacity !== 1) ctx.restore();
        }

        if (L.type === 'sticker' && L.img) {
          const img = L.img;
          const base = Math.min(tw, th) * (L.scale || 1);
          let dx = tx + Math.round((tw - base)/2), dy = ty + Math.round((th - base)/2);
          if (L.posMode === 'free') {
            const cx = tx + (L.pos?.x ?? 50) * tw / 100;
            const cy = ty + (L.pos?.y ?? 50) * th / 100;
            dx = Math.round(cx - base/2); dy = Math.round(cy - base/2);
          } else {
            if (L.anchor === 'topLeft') { dx = tx; dy = ty; }
            if (L.anchor === 'topRight') { dx = tx + tw - base; dy = ty; }
            if (L.anchor === 'bottomLeft') { dx = tx; dy = ty + th - base; }
            if (L.anchor === 'bottomRight') { dx = tx + tw - base; dy = ty + th - base; }
          }
          ctx.drawImage(img, dx, dy, base, base);
        }

        if (L.type === 'text' && (L.text || '').trim()) {
          const fontPx = Math.round((L.fontSize || 22) * SCALE);
          ctx.fillStyle = L.color || '#000';
          ctx.font = `${L.fontWeight || 400} ${fontPx}px ${L.fontFamily || 'system-ui'}`;
          ctx.textAlign = (L.align || 'center'); ctx.textBaseline = 'alphabetic';

          let x = tx + tw/2, y = ty + th/2;
          if (L.posMode === 'grid') {
            if (L.align === 'left')  x = tx;
            if (L.align === 'right') x = tx + tw;
            if (L.vAlign === 'top') y = ty + fontPx;
            if (L.vAlign === 'bottom') y = ty + th - Math.round(fontPx*0.25);
          } else {
            x = tx + (L.pos?.x ?? 50) * tw / 100;
            y = ty + (L.pos?.y ?? 50) * th / 100;
          }

          ctx.shadowColor = L.shadow?.color || 'rgba(0,0,0,.25)';
          ctx.shadowBlur = Math.round((L.shadow?.blur ?? 6) * SCALE);
          ctx.shadowOffsetX = Math.round((L.shadow?.x ?? 0) * SCALE);
          ctx.shadowOffsetY = Math.round((L.shadow?.y ?? 2) * SCALE);

          const lines = String(L.text).split(/\n/), lh = Math.round(fontPx * 1.25);
          if (lines.length === 1) ctx.fillText(lines[0], Math.round(x), Math.round(y));
          else {
            const startY = Math.round(y - ((lines.length-1) * lh)/2);
            lines.forEach((ln, i) => ctx.fillText(ln, Math.round(x), startY + i*lh));
          }

          ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        }
      });
    });

    const blob = await new Promise(r => cvs.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) return;
    const file = new File([blob], `richmenu-designed.jpg`, { type: 'image/jpeg' });
    if (onExport) await onExport(file);
  }

  const fullScreen = useMediaQuery('(max-width:1200px)');

  // Sticker picker (popover)
  const [stickerAnchor, setStickerAnchor] = useState(null);
  const openSticker = Boolean(stickerAnchor);
  const handleOpenSticker = (e) => setStickerAnchor(e.currentTarget);
  const handleCloseSticker = () => setStickerAnchor(null);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        Design menu image (Layers)
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" onClick={()=>{
            if (!history.length) return;
            try {
              const prev = JSON.parse(history[history.length-1]);
              setHistory(h=>h.slice(0,-1));
              setFuture(f=>[JSON.stringify(configs), ...f]);
              setConfigs(prev);
              // normalize selection after undo
              setSelLayerIdx(0);
            } catch {}
          }}>UNDO</Button>
          <Button size="small" onClick={()=>{
            if (!future.length) return;
            try {
              const next = JSON.parse(future[0]);
              setFuture(f=>f.slice(1));
              setHistory(h=>[...h, JSON.stringify(configs)]);
              setConfigs(next);
              setSelLayerIdx(0);
            } catch {}
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
          <Stack spacing={1.5} sx={{ width: 520, minWidth: 520, overflow: 'auto', pr: .5 }}>
            {/* Block selector */}
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle2">Block</Typography>
                <Stack direction="row" spacing={1} sx={{ ml: 1 }}>
                  {cells.map((c, idx) => (
                    <Button key={idx} variant={selIdx===idx?'contained':'outlined'} size="small" onClick={() => { setSelIdx(idx); setSelLayerIdx(0); }}>
                      #{idx+1}
                    </Button>
                  ))}
                </Stack>
                <Box sx={{ flex: 1 }} />
                <Button size="small" color="warning" onClick={()=>{
                  setCfg(()=> defaultCfg());
                  setSelLayerIdx(0);
                }}>RESET BLOCK</Button>
              </Stack>
            </Paper>

            {/* Layers */}
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Layers</Typography>
                <Box sx={{ flex: 1 }} />
                <Button size="small" startIcon={<TextFieldsIcon />} onClick={addTextLayer}>Add text</Button>
                <Button size="small" startIcon={<AddIcon />} onClick={handleOpenSticker}>Add sticker</Button>
                <Button size="small" startIcon={<PhotoIcon />} component="label">
                  Add image
                  <input type="file" accept="image/*" hidden onChange={(e)=> addImageLayerFromFile(e.target.files?.[0])} />
                </Button>
              </Stack>

              <Stack spacing={1}>
                {cfg.layers.map((L, i) => (
                  <Stack key={L.id} direction="row" alignItems="center" spacing={1} sx={{
                    p: .75, border: '1px solid ' + (i===selLayerIdx?'#1976d2':'rgba(0,0,0,.12)'),
                    borderRadius: 1, bgcolor: i===selLayerIdx?'rgba(25,118,210,.06)':'#fff', cursor:'pointer'
                  }}
                    onClick={()=>setSelLayerIdx(i)}
                  >
                    <Chip size="small" label={L.type} color={L.type==='text'?'primary':(L.type==='sticker'?'success':'default')} />
                    <Typography variant="body2" sx={{ flex:1 }} noWrap>
                      {L.type==='text' ? (L.text || '(text)') : (L.type==='sticker' ? '(sticker)' : '(image)')}
                    </Typography>
                    <IconButton size="small" onClick={(e)=>{ e.stopPropagation(); moveLayer('up'); }}><ArrowUpwardIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={(e)=>{ e.stopPropagation(); moveLayer('down'); }}><ArrowDownwardIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={(e)=>{ e.stopPropagation(); copyLayer(); }}><ContentCopyIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={(e)=>{ e.stopPropagation(); toggleLayer(); }}>
                      {L.hidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" color="error" onClick={(e)=>{ e.stopPropagation(); deleteLayer(); }}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                ))}
                {cfg.layers.length === 0 && (
                  <Box sx={{ color:'text.secondary', fontSize: 14, p:.5 }}>No layers — เพิ่มด้วยปุ่ม Add text / Add sticker / Add image</Box>
                )}
              </Stack>
            </Paper>

            {/* Block appearance */}
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="caption" sx={{ display:'block', mb:.5 }}>Block background</Typography>
              <ColorInput label="Block color" value={cfg.fillColor} onChange={(v)=> setCfg(c=>({ ...c, fillColor:v }))} />
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap:'wrap' }}>
                {['#ffffff','#000000','#66bb6a','#43a047','#1e88e5','#fbc02d','#e53935','#8e24aa','#ff7043','#455a64']
                  .map(c => <Chip key={c} size="small" label="" onClick={()=>setCfg(s=>({ ...s, fillColor:c }))} sx={{ bgcolor:c, border:'1px solid rgba(0,0,0,.1)' }} />)}
              </Stack>
              <TextField label="Padding" size="small" type="number" inputProps={{ min:0, max:60 }}
                value={cfg.padding} onChange={(e)=> setCfg(c=>({ ...c, padding:Number(e.target.value||0) }))} sx={{ mt:1, width: 140 }} />
            </Paper>

            {/* Layer properties */}
            {curLayer && (
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Layer properties</Typography>

                {curLayer.type === 'text' && (
                  <>
                    <TextField label="Text" size="small" multiline minRows={2}
                      value={curLayer.text || ''} onChange={(e) => updateLayer({ text:e.target.value })} sx={{ mb: 1, width:'100%' }} />

                    <Stack direction="row" spacing={1} sx={{ mb:1 }}>
                      <Select
                        size="small"
                        value={FONT_OPTIONS.find(f => f.family === curLayer.fontFamily)?.label || FONT_OPTIONS[0].label}
                        onChange={(e) => {
                          const selected = FONT_OPTIONS.find(f => f.label === e.target.value) || FONT_OPTIONS[0];
                          if (selected.gf) ensureGoogleFontLoaded(selected.gf);
                          updateLayer({ fontFamily: selected.family });
                        }}
                        sx={{ flex: 1 }}
                      >
                        {FONT_OPTIONS.map(f => <MenuItem key={f.label} value={f.label}>{f.label}</MenuItem>)}
                      </Select>
                      <TextField label="Font size" size="small" type="number" inputProps={{ min: 10, max: 120 }}
                        value={curLayer.fontSize || 22} onChange={(e) => updateLayer({ fontSize:Number(e.target.value||22) })} sx={{ width: 140 }} />
                      <Select size="small" value={curLayer.fontWeight || 400} onChange={(e) => updateLayer({ fontWeight:Number(e.target.value) })} sx={{ width: 140 }}>
                        <MenuItem value={400}>Regular</MenuItem>
                        <MenuItem value={600}>SemiBold</MenuItem>
                        <MenuItem value={700}>Bold</MenuItem>
                      </Select>
                    </Stack>

                    <ColorInput label="Text color" value={curLayer.color || '#000000'} onChange={(v)=>updateLayer({ color:v })} sx={{ mb:1 }} />

                    <Stack direction="row" spacing={1} sx={{ mb:1, alignItems:'center', flexWrap:'wrap' }}>
                      <Select size="small" value={curLayer.posMode || 'grid'} onChange={(e)=>updateLayer({ posMode:e.target.value })}>
                        <MenuItem value="grid">Grid position</MenuItem>
                        <MenuItem value="free">Free position</MenuItem>
                      </Select>

                      {curLayer.posMode === 'grid' ? (
                        <>
                          <ToggleButtonGroup exclusive size="small"
                            value={curLayer.align || 'center'}
                            onChange={(_, v)=> v && updateLayer({ align:v })}
                          >
                            <ToggleButton value="left"><FormatAlignLeftIcon fontSize="small" /></ToggleButton>
                            <ToggleButton value="center"><FormatAlignCenterIcon fontSize="small" /></ToggleButton>
                            <ToggleButton value="right"><FormatAlignRightIcon fontSize="small" /></ToggleButton>
                          </ToggleButtonGroup>

                          <ToggleButtonGroup exclusive size="small"
                            value={curLayer.vAlign || 'center'}
                            onChange={(_, v)=> v && updateLayer({ vAlign:v })}
                          >
                            <ToggleButton value="top"><VerticalAlignTopIcon fontSize="small" /></ToggleButton>
                            <ToggleButton value="center"><VerticalAlignCenterIcon fontSize="small" /></ToggleButton>
                            <ToggleButton value="bottom"><VerticalAlignBottomIcon fontSize="small" /></ToggleButton>
                          </ToggleButtonGroup>
                        </>
                      ) : (
                        <>
                          <TextField size="small" label="X%" type="number"
                            value={curLayer.pos?.x ?? 50} onChange={(e)=>updateLayer({ pos:{...curLayer.pos, x:Number(e.target.value||0)} })}/>
                          <TextField size="small" label="Y%" type="number"
                            value={curLayer.pos?.y ?? 50} onChange={(e)=>updateLayer({ pos:{...curLayer.pos, y:Number(e.target.value||0)} })}/>
                          <Typography variant="caption">* สามารถลากที่แคนวาสได้</Typography>
                        </>
                      )}

                      <Button size="small" onClick={autoFitText}>AUTO-FIT TEXT</Button>
                    </Stack>

                    <Typography variant="caption" sx={{ display:'block', mb:.5 }}>Text shadow</Typography>
                    <ColorInput label="Color" value={curLayer.shadow?.color || 'rgba(0,0,0,.25)'} onChange={(v)=>updateLayer({ shadow: { ...(curLayer.shadow||{}), color:v } })} />
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: .5 }}>
                      <Box sx={{ minWidth: 100 }}>
                        <Typography variant="caption">Blur</Typography>
                        <Slider size="small" min={0} max={24} value={curLayer.shadow?.blur ?? 6}
                          onChange={(_, v)=>updateLayer({ shadow: { ...(curLayer.shadow||{}), blur: Array.isArray(v)?v[0]:v } })}/>
                      </Box>
                      <Box sx={{ minWidth: 120 }}>
                        <Typography variant="caption">Offset X</Typography>
                        <Slider size="small" min={-20} max={20} value={curLayer.shadow?.x ?? 0}
                          onChange={(_, v)=>updateLayer({ shadow: { ...(curLayer.shadow||{}), x: Array.isArray(v)?v[0]:v } })}/>
                      </Box>
                      <Box sx={{ minWidth: 120 }}>
                        <Typography variant="caption">Offset Y</Typography>
                        <Slider size="small" min={-20} max={20} value={curLayer.shadow?.y ?? 2}
                          onChange={(_, v)=>updateLayer({ shadow: { ...(curLayer.shadow||{}), y: Array.isArray(v)?v[0]:v } })}/>
                      </Box>
                    </Stack>
                  </>
                )}

                {curLayer?.type === 'sticker' && (
                  <>
                    <Stack direction="row" spacing={1} sx={{ mb:1 }}>
                      <Select size="small" value={curLayer.posMode || 'grid'} onChange={(e)=>updateLayer({ posMode:e.target.value })}>
                        <MenuItem value="grid">Grid position</MenuItem>
                        <MenuItem value="free">Free position</MenuItem>
                      </Select>
                      {curLayer.posMode === 'grid' ? (
                        <Select size="small" value={curLayer.anchor || 'center'} onChange={(e)=>updateLayer({ anchor:e.target.value })}>
                          <MenuItem value="center">Center</MenuItem>
                          <MenuItem value="topLeft">Top-left</MenuItem>
                          <MenuItem value="topRight">Top-right</MenuItem>
                          <MenuItem value="bottomLeft">Bottom-left</MenuItem>
                          <MenuItem value="bottomRight">Bottom-right</MenuItem>
                        </Select>
                      ) : (
                        <>
                          <TextField size="small" label="X%" type="number"
                            value={curLayer.pos?.x ?? 50} onChange={(e)=>updateLayer({ pos:{...curLayer.pos, x:Number(e.target.value||0)} })}/>
                          <TextField size="small" label="Y%" type="number"
                            value={curLayer.pos?.y ?? 50} onChange={(e)=>updateLayer({ pos:{...curLayer.pos, y:Number(e.target.value||0)} })}/>
                          <Typography variant="caption">* ลากบนแคนวาสได้</Typography>
                        </>
                      )}
                    </Stack>
                    <Box sx={{ px:1, minWidth: 240, mb:1 }}>
                      <Typography variant="caption">Size</Typography>
                      <Slider size="small" value={(curLayer.scale||1)*100}
                        onChange={(_, v) => updateLayer({ scale: (Array.isArray(v)?v[0]:v) / 100 })}
                        min={40} max={220} />
                    </Box>

                    <Typography variant="caption" sx={{ display:'block', mb:.5 }}>Sticker palette</Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap:'wrap' }}>
                      {STICKERS.map((s, i) => (
                        <Tooltip key={i} title={s.label}>
                          <IconButton size="small" onClick={() => addStickerLayerFromUrl(s.url)}>
                            <img src={s.url} alt={s.label} width={24} height={24} />
                          </IconButton>
                        </Tooltip>
                      ))}
                    </Stack>
                    <Typography variant="caption" sx={{ mt: .5, color:'text.secondary' }}>
                      * คลิกไอคอนเพื่อเพิ่มสติ๊กเกอร์เป็นเลเยอร์ใหม่ (เพิ่มได้หลายอัน)
                    </Typography>
                  </>
                )}

                {curLayer?.type === 'image' && (
                  <>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
                      <Button component="label" variant="outlined" size="small">
                        Replace image
                        <input type="file" accept="image/*" hidden onChange={(e)=> addImageLayerFromFile(e.target.files?.[0])} />
                      </Button>
                      <Select size="small" value={curLayer.fit || 'cover'} onChange={(e)=>updateImageFit(e.target.value)}>
                        <MenuItem value="contain">Contain</MenuItem>
                        <MenuItem value="cover">Cover</MenuItem>
                      </Select>
                      <Box sx={{ minWidth: 160 }}>
                        <Typography variant="caption">Opacity</Typography>
                        <Slider size="small" min={10} max={100} value={Math.round((curLayer.opacity ?? 1)*100)}
                          onChange={(_, v)=>updateLayer({ opacity: (Array.isArray(v)?v[0]:v) / 100 })}/>
                      </Box>
                    </Stack>
                    <Typography variant="caption" sx={{ color:'text.secondary' }}>
                      * รูปแบบ “Cover” จะพยายามเติมเต็มช่องเสมอ (แก้ปัญหามีช่องว่าง)
                    </Typography>
                  </>
                )}
              </Paper>
            )}
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>CANCEL</Button>
        <Button variant="contained" onClick={exportImage}>EXPORT IMAGE</Button>
      </DialogActions>

      {/* Sticker picker popover */}
      <Popover
        open={openSticker}
        anchorEl={stickerAnchor}
        onClose={handleCloseSticker}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.25, maxWidth: 360 }}>
          <Typography variant="caption" sx={{ ml: .5, color:'text.secondary' }}>เลือกสติ๊กเกอร์</Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap:'wrap', mt: .5 }}>
            {STICKERS.map((s, i) => (
              <Tooltip key={i} title={s.label}>
                <IconButton size="small" onClick={() => { addStickerLayerFromUrl(s.url); handleCloseSticker(); }}>
                  <img src={s.url} alt={s.label} width={28} height={28} />
                </IconButton>
              </Tooltip>
            ))}
          </Stack>
        </Box>
      </Popover>
    </Dialog>
  );
}
