// src/pages/TARegisterPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Stack, Typography, TextField, Button, Paper, Grid, Alert,
  Divider, IconButton, LinearProgress, useMediaQuery,
  FormControlLabel, Checkbox, FormControl, InputLabel, Select, MenuItem,
  Accordion, AccordionSummary, AccordionDetails, Chip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTheme } from '@mui/material/styles';
import CollectionsIcon from '@mui/icons-material/Collections';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

/* ========== Utils ========== */
function useQuery() { return new URLSearchParams(window.location.search); }

function isValidThaiId(id) {
  const s = String(id || '').replace(/\D/g, '');
  if (s.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(s[i], 10) * (13 - i);
  const d13 = (11 - (sum % 11)) % 10;
  return d13 === parseInt(s[12], 10);
}

const TH_BANKS = [
  { code: 'KBANK', name: 'กสิกรไทย' },
  { code: 'SCB',   name: 'ไทยพาณิชย์' },
  { code: 'KTB',   name: 'กรุงไทย' },
  { code: 'BAY',   name: 'กรุงศรีอยุธยา' },
  { code: 'BBL',   name: 'กรุงเทพ' },
];

const todayYMD = () => new Date().toISOString().slice(0,10);


// helper: ค่าฟอร์มเริ่มต้น
const makeInitialForm = () => ({
  nationalId: '', fullName: '', idAddress: '',
  phone: '', currentAddress: '', sameAsIdAddress: false,
  birthDate: '', gender: '', jobTitle: '',
  bankName: '', bankAccount: '',
  registerDate: todayYMD(),
});


/* ========== PAGE ========== */
export default function TARegisterPage() {
  const q = useQuery();
  const tenantFromQs = q.get('tenant') || '';
  const uidFromQs    = q.get('uid') || q.get('lineUserId') || '';

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [tenantId, setTenantId] = useState(tenantFromQs);
  const [lineUserId, setLineUserId] = useState(uidFromQs);
  const [mode, setMode] = useState('register');

  const [form, setForm] = useState(makeInitialForm());

  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null);
  const [imgDataUrl, setImgDataUrl] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);

  // เก็บ raw จาก API (ใส่ใน Debug accordion)
  const [ocrDebug, setOcrDebug] = useState(null);

  // ใช้สำหรับยกเลิก/เพิกเฉย OCR รอบเก่าเมื่อกดเคลียร์
  const ocrRunIdRef = useRef(0);

  // preload session
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let r = await fetch('/api/session/me').catch(() => null);
        if (!r || !r.ok) r = await fetch('/api/auth/session').catch(() => null);
        if (!r) return;
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        const u = j.user || j;
        if (u?.uid) setLineUserId(p => p || u.uid);
        if (u?.tenant) setTenantId(p => p || u.tenant);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  // load profile
  useEffect(() => {
    (async () => {
      if (!tenantId || !lineUserId) return;
      setLoading(true);
      try {
        const url = `/api/tenants/${encodeURIComponent(tenantId)}/attendance/profile?lineUserId=${encodeURIComponent(lineUserId)}`;
        const r = await fetch(url);
        const j = await r.json();

        if (j?.ok && j?.data) {
          // เติมค่าลง form ตามฟิลด์ที่มี + 
          const toYMD = (v) => {
            if (!v) return '';
            const s = String(v);
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            const d = new Date(s.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$2/$1/$3')); // รองรับ DD/MM/YYYY
            return isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
          };

          setForm(s => {
            const merged = { ...s, ...j.data };
            merged.nationalId = String(merged.nationalId || '').replace(/\D/g, '');
            merged.sameAsIdAddress = !!merged.idAddress && !!merged.currentAddress && merged.idAddress === merged.currentAddress;

            // ✅ บังคับรูปแบบวัน
            merged.birthDate    = toYMD(merged.birthDate);
            merged.registerDate = toYMD(merged.registerDate) || todayYMD();
            return merged;

          });

          setMode('update'); // สลับเป็นโหมดแก้ไข
        }
      } catch {
        // เงียบ ๆ พอ — ไม่มีข้อมูลถือเป็นลงทะเบียนใหม่
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId, lineUserId]);

  const setF = (k) => (e) => {
    const v = e?.target?.type === 'checkbox' ? !!e.target.checked : e.target.value;
    setForm(s => {
      const next = { ...s, [k]: v };
      if (k === 'sameAsIdAddress' && v) next.currentAddress = s.idAddress || '';
      return next;
    });
  };
  useEffect(() => {
    if (form.sameAsIdAddress) setForm(s => ({ ...s, currentAddress: s.idAddress || '' }));
  }, [form.idAddress, form.sameAsIdAddress]);

  async function onSave() {
    if (!tenantId || !lineUserId) {
      setMsg({ type: 'warning', text: 'ขาดข้อมูล tenantId หรือ lineUserId — กรุณาเปิดจากปุ่ม “ลงทะเบียนเข้าใช้งาน” ในแชท' });
      return;
    }
    const nid = String(form.nationalId || '').replace(/\D/g,'');

    // ผ่อนกฎ: ถ้าใส่มาแต่ยังไม่ผ่านสูตร → เตือน แต่ "ไม่ return"
    if (nid && !isValidThaiId(nid)) {
      setMsg({ type: 'info', text: 'บันทึกแล้วนะ แต่เลขบัตรดูยังไม่ครบ/ไม่ถูกต้อง (แก้ทีหลังได้)' });
    }

    setSaving(true); setMsg(null);
    try {
      const url = `/api/tenants/${encodeURIComponent(tenantId)}/attendance/profile`;
      const body = {
        lineUserId,
        profile: {
          ...form,
          nationalId: nid,
          registerDate: form.registerDate || todayYMD(),   // กันค่าว่าง
        }
      };
      const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j?.ok) { setMode('update'); setMsg({ type:'success', text:'บันทึกข้อมูลเรียบร้อย ✅' }); }
      else setMsg({ type:'error', text: j?.error || 'บันทึกไม่สำเร็จ' });
    } catch {
      setMsg({ type:'error', text:'ผิดพลาดในการบันทึกข้อมูล' });
    } finally {
      setSaving(false);
    }
  }

  /* ====== เรียก IAPP ผ่าน backend ====== */
  async function callIappApi(file) {
    const fd = new FormData();
    // field name ต้องตรงกับ multer.single('file') บน server
    fd.append('file', file);
    const r = await fetch('/api/ocr/iapp', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    const data = j?.data || j || {};
    return {
      nationalId: data.nationalId || '',
      fullName:   data.fullName   || '',
      idAddress:  data.idAddress  || '',
      birthDate:  data.birthDate  || '',
      raw: data.raw || null,
    };
  }

  function onPickImage(file) {
    if (!file) return;

    // ป้องกันไฟล์แปลก/ใหญ่เกิน
    const MAX = 8 * 1024 * 1024; // ~8MB
    if (file.size > MAX) {
      setMsg({ type:'warning', text:'ไฟล์ใหญ่เกินไป (จำกัด ~8MB) โปรดเลือกรูปใหม่' });
      return;
    }
    if (!/^image\//i.test(file.type)) {
      setMsg({ type:'warning', text:'ไฟล์ไม่ใช่รูปภาพ โปรดเลือกรูปใหม่' });
      return;
    }

    // preview เร็ว ๆ ด้วย object URL
    const objectUrl = URL.createObjectURL(file);
    setImgDataUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return objectUrl;
    });

    // เริ่ม OCR — จับรอบงานไว้เพื่อยกเลิกเมื่อมีการ clear
    const rid = ++ocrRunIdRef.current;
    setOcrDebug(null);
    setOcrBusy(true);
    setMsg({ type: 'info', text: 'กำลังอ่านข้อมูลจาก IAPP OCR…' });

    (async () => {
      try {
        const info = await callIappApi(file);
        if (rid !== ocrRunIdRef.current) return;

        // เก็บ debug (รวม upstream ถ้ามี)
        setOcrDebug(info.raw || {
          rawNid: info.nationalId || '',
          rawName: info.fullName || '',
          rawBirth: info.birthDate || '',
          rawAddr: info.idAddress || '',
        });
        if (rid !== ocrRunIdRef.current) return;

        // เติมเฉพาะช่องที่หาได้
        setForm(s => {
          if (rid !== ocrRunIdRef.current) return s;
          return {
            ...s,
            nationalId: info.nationalId || s.nationalId,
            fullName:   info.fullName   || s.fullName,
            idAddress:  info.idAddress  || s.idAddress,
            birthDate:  info.birthDate  || s.birthDate,
            ...(s.sameAsIdAddress ? { currentAddress: info.idAddress || s.idAddress || s.currentAddress } : {})
          };
        });
        if (rid !== ocrRunIdRef.current) return;

        const got = ['nationalId','fullName','birthDate','idAddress'].filter(k => !!info[k]).length;
        if (got >= 3) setMsg({ type:'success', text:'อ่านข้อมูลจากบัตรแล้ว (IAPP) ✅' });
        else if (got >= 1) setMsg({ type:'info', text:'อ่านได้บางส่วน — โปรดกรอกส่วนที่ขาดต่อเอง' });
        else setMsg({ type:'warning', text:'ยังจับข้อมูลหลักไม่ได้ — ลองรูปให้คม/สว่างขึ้น หรือวางบัตรให้ตรง' });
      } catch (e) {
        if (rid !== ocrRunIdRef.current) return;
        console.warn('IAPP OCR error', e);
        setMsg({ type:'error', text:`อ่านบัตรไม่สำเร็จ: ${e.message || e}` });
      } finally {
        if (rid === ocrRunIdRef.current) setOcrBusy(false);
      }
    })();
  }

  // ล้าง object URL เมื่อคอมโพเนนต์ unmount หรือภาพใหม่มาแทน
  useEffect(() => {
    return () => { if (imgDataUrl) URL.revokeObjectURL(imgDataUrl); };
  }, [imgDataUrl]);

  // ล้างทั้งหมด (ฟอร์ม/รูป/OCR)
  function onClearAll() {
    // ยกเลิกงาน OCR ที่กำลังวิ่งอยู่
    ocrRunIdRef.current++;

    // ล้างข้อความแจ้งเตือน
    setMsg(null);

    // ล้างฟอร์มกลับค่าเริ่มต้น (คง tenantId/lineUserId/mode เดิมไว้)
    setForm(makeInitialForm());

    // ล้างผล debug และสถานะ OCR
    setOcrDebug(null);
    setOcrBusy(false);

    // ล้างพรีวิวรูป + คืน URL เก่า
    setImgDataUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  }

  const missingCore = !tenantId || !lineUserId;

  return (
    <Box sx={{ p: { xs: 1.5, md: 0 } }}>
      <Stack spacing={0.5} sx={{ mb: 1.5 }}>
        <Typography variant="h6" fontWeight={800}>
          {mode === 'update' ? 'แก้ไขโปรไฟล์เข้างาน' : 'ลงทะเบียนเข้าใช้งาน'}
        </Typography>
        {/* ซ่อนการแสดงค่า tenant/lineUserId ตามที่ขอ */}
        {/* <Typography variant="body2" color="text.secondary">
          tenant: {tenantId || '—'} | lineUserId: {lineUserId || '—'}
        </Typography> */}
      </Stack>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {msg && <Alert severity={msg.type} sx={{ mb: 2 }}>{msg.text}</Alert>}
      {missingCore && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          กรุณาเปิดหน้านี้ผ่านปุ่ม “ลงทะเบียนเข้าใช้งาน” ใน LINE แชท เพื่อแนบ tenant/lineUserId อัตโนมัติ
        </Alert>
      )}

      <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" fontWeight={700}>แนบรูปบัตรประชาชน</Typography>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<CollectionsIcon />}
              component="label"
              size={isMobile ? 'medium' : 'small'}
            >
              เลือกรูปจากเครื่อง
              <input
                id="file-picker"
                hidden
                accept="image/*"
                type="file"
                onChange={(e) => onPickImage(e.target.files?.[0])}
              />
            </Button>

            {imgDataUrl && (
              <IconButton
                aria-label="clear"
                onClick={() => {
                  // ถ้าต้องการให้ปุ่มไอคอนล้างเฉพาะรูป ให้คงโค้ดนี้
                  // ถ้าต้องให้ล้างทั้งหมด ให้เปลี่ยนเป็น onClearAll();
                  if (imgDataUrl) URL.revokeObjectURL(imgDataUrl);
                  setImgDataUrl('');
                  setOcrDebug(null);
                }}
              >
                <DeleteOutlineIcon />
              </IconButton>
            )}
          </Stack>

          {ocrBusy && <LinearProgress />}

          {imgDataUrl && (
            <Box sx={{ mt: 1, width: '100%', maxWidth: 440, border: '1px solid #eee', borderRadius: 1, overflow: 'hidden' }}>
              <img src={imgDataUrl} alt="preview" style={{ width: '100%', display: 'block' }} />
            </Box>
          )}

          {/* Debug Panel */}
          {ocrDebug && (
            <Accordion sx={{ mt: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2">ผลที่อ่านได้ (Debug)</Typography>
                  <Chip size="small" label={`NID: ${form.nationalId ? '✓' : '–'}`} />
                  <Chip size="small" label={`ชื่อ: ${form.fullName ? '✓' : '–'}`} />
                  <Chip size="small" label={`เกิด: ${form.birthDate ? '✓' : '–'}`} />
                  <Chip size="small" label={`ที่อยู่: ${form.idAddress ? '✓' : '–'}`} />
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="caption" sx={{ whiteSpace:'pre-wrap', display:'block' }}>
                  {typeof ocrDebug === 'object'
                    ? JSON.stringify(ocrDebug, null, 2)
                    : String(ocrDebug)}
                </Typography>
              </AccordionDetails>
            </Accordion>
          )}

          <Divider sx={{ my: 1 }} />

          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="เลขบัตรประชาชน"
                value={form.nationalId}
                onChange={setF('nationalId')}
                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 13 }}
                helperText={
                  form.nationalId
                    ? (isValidThaiId(form.nationalId) ? '✓ ดูโอเค' : 'ใส่ได้ภายหลัง ไม่จำเป็นต้องครบตอนนี้')
                    : 'ใส่ภายหลังได้ (ไม่บังคับ)'
                }
                error={false}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="ชื่อ - นามสกุล" value={form.fullName} onChange={setF('fullName')} />
            </Grid>

            <Grid item xs={12}>
              <TextField fullWidth size="small" label="ที่อยู่ตามบัตร" value={form.idAddress} onChange={setF('idAddress')} />
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={<Checkbox checked={form.sameAsIdAddress} onChange={setF('sameAsIdAddress')} />}
                label="ที่อยู่ปัจจุบันเหมือนที่อยู่ในบัตร"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField fullWidth size="small" label="ที่อยู่ปัจจุบัน" value={form.currentAddress} onChange={setF('currentAddress')} />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="เบอร์โทร" value={form.phone} onChange={setF('phone')} inputProps={{ inputMode: 'tel' }} />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" type="date" label="วันเกิด" InputLabelProps={{ shrink: true }} value={form.birthDate} onChange={setF('birthDate')} />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="gender-label">เพศ</InputLabel>
                <Select labelId="gender-label" label="เพศ" value={form.gender} onChange={setF('gender')}>
                  <MenuItem value=""><em>—</em></MenuItem>
                  <MenuItem value="male">ชาย</MenuItem>
                  <MenuItem value="female">หญิง</MenuItem>
                  <MenuItem value="other">อื่น ๆ</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="ตำแหน่งงาน" value={form.jobTitle} onChange={setF('jobTitle')} />
            </Grid>

            {/* ใส่ต่อจาก Grid item jobTitle เดิม */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="วันที่ลงทะเบียน"
                InputLabelProps={{ shrink: true }}
                value={form.registerDate}
                onChange={setF('registerDate')}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel id="bank-label">ธนาคาร</InputLabel>
                <Select labelId="bank-label" label="ธนาคาร" value={form.bankName} onChange={setF('bankName')}>
                  <MenuItem value=""><em>—</em></MenuItem>
                  {TH_BANKS.map(b => <MenuItem key={b.code} value={b.name}>{b.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="เลขที่บัญชี" value={form.bankAccount} onChange={setF('bankAccount')} inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }} />
            </Grid>
          </Grid>

          <Stack direction="row" spacing={1} sx={{ pt: .5 }}>
            <Button variant="contained" onClick={onSave} disabled={saving || missingCore}>
              {saving ? 'กำลังบันทึก…' : (mode === 'update' ? 'บันทึกการเปลี่ยนแปลง' : 'ลงทะเบียน')}
            </Button>
            <Button variant="outlined" onClick={onClearAll}>
              ล้างแบบฟอร์ม/รูป/OCR
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
