// src/pages/TaskAssignmentSettingsPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Paper, Stack, Typography, Switch, FormControlLabel,
  Button, Alert, Divider, TextField, Link, Grid,
  Card, CardContent, Box, Tooltip, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  ImageList, ImageListItem, useMediaQuery, useTheme
} from '@mui/material';

import { getAuth, onAuthStateChanged } from 'firebase/auth';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { useNavigate } from 'react-router-dom';

// ---------- ตัวอย่างรูป (Option B: import จาก src/assets) ----------
import registerImg1      from '../assets/examples/register.jpg';
import registerImg2      from '../assets/examples/register2.jpg';
import assignImg1        from '../assets/examples/assign-message1.jpg';
import assignImg2        from '../assets/examples/assign-message2.jpg';
import tasksImg1         from '../assets/examples/tasks-update1.jpg';
import tasksImg2         from '../assets/examples/tasks-update2.jpg';
import tasksImg3         from '../assets/examples/tasks-update3.jpg';
import manageUsersImg1   from '../assets/examples/manage-users-card1.jpg';
import manageUsersImg2   from '../assets/examples/manage-users-card2.jpg';
import manageUsersImg3   from '../assets/examples/manage-users-card3.jpg';
import manageUsersImg4   from '../assets/examples/manage-users-card4.jpg';
import manageUsersImg5   from '../assets/examples/manage-users-card5.jpg';




// ---------- utils ----------
function getActiveTenantId() {
  return localStorage.getItem('activeTenantId') || '';
}
async function authHeader() {
  const u = getAuth().currentUser;
  const t = u ? await u.getIdToken() : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const DEFAULT_IMAGES = {
  prereg: '/static/Menu_for_non_register.png',
  main:   '/static/Rich_menu_for_registered.png',
};

// ปาร์ส JSON แบบปลอดภัย — ถ้าตอบไม่ใช่ JSON จะคืน { ok:false, error:... }
async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (ct.includes('application/json')) {
    try { return JSON.parse(text); } catch { /* ดร็อปไปใช้ข้อความดิบ */ }
  }
  return { ok: false, error: text || res.statusText || `HTTP ${res.status}` };
}


export default function TaskAssignmentSettingsPage() {
  const tid = useMemo(() => getActiveTenantId(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState(null);

  // ✨ สถานะล็อกอิน (ใช้กันพลาดตอน Enable)
  const [authed, setAuthed] = useState(!!getAuth().currentUser);
  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (u) => setAuthed(!!u));
    return unsub;
  }, []);
  const canEnable = authed && !!(getAuth().currentUser) && !!(String(localStorage.getItem('activeTenantId') || '').trim());

  // ค่า config หลัก
  const [enabled, setEnabled] = useState(false);
  const [appsSheetId, setAppsSheetId] = useState('');
  const [verifiedAt, setVerifiedAt] = useState(null);

  // รายการ Rich menus และตัวเลือกก่อน/หลังลงทะเบียน
  const [richMenus, setRichMenus] = useState([]);
  const [preRichMenuId, setPreRichMenuId] = useState('');
  const [postRichMenuId, setPostRichMenuId] = useState('');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState(null); // 'prereg' | 'main'
  const [pickerValue, setPickerValue] = useState('');

  const navigate = useNavigate();

  // — responsive breakpoints สำหรับ Dialog เลือกเมนู —
  const theme = useTheme();
  const mdUp  = useMediaQuery(theme.breakpoints.up('md'));
  const lgUp  = useMediaQuery(theme.breakpoints.up('lg'));
  const xlUp  = useMediaQuery(theme.breakpoints.up('xl'));

  // === Lightbox viewer ===
  const [viewer, setViewer] = useState({ open: false, src: '', alt: '' });
  const openViewer  = useCallback((src, alt='preview') => setViewer({ open: true, src, alt }), []);
  const closeViewer = useCallback(() => setViewer(v => ({ ...v, open: false })), []);

  // === ตะแกรงรูปย่อยในแต่ละการ์ด ===
  const ThumbGrid = useCallback(({ images = [] }) => (
    <ImageList cols={mdUp ? 2 : 1} rowHeight={160} gap={8} sx={{ mt: 1 }}>
      {images.map((src, i) => (
        <ImageListItem key={i} onClick={() => openViewer(src)} sx={{ cursor: 'zoom-in' }}>
          <img
            src={src}
            alt={`example-${i + 1}`}
            loading="lazy"
            style={{
              width: '100%',
              height: 160,
              objectFit: 'cover',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              border: '1px solid #e0e0e0'
            }}
          />
        </ImageListItem>
      ))}
    </ImageList>
  ), [mdUp, openViewer]);

  // จำนวนคอลัมน์ + ความสูงแถวของรูปใน dialog (responsive)
  const pickerCols      = xlUp ? 6 : lgUp ? 5 : mdUp ? 4 : 2;
  const pickerRowHeight = mdUp ? 180 : 140;

  // เปิด dialog เลือกเมนู — พรีเซ็ตค่าเดิมให้ผู้ใช้เห็นทันที
  const openPicker = useCallback((forKind) => {
    setPickerFor(forKind);
    setPickerValue(forKind === 'prereg' ? (preRichMenuId || '') : (postRichMenuId || ''));
    setPickerOpen(true);
  }, [preRichMenuId, postRichMenuId]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerFor(null);
    setPickerValue('');
  }, []);

  const handlePickerApply = useCallback(() => {
    if (!pickerFor || !pickerValue) return closePicker();
    if (pickerFor === 'prereg') setPreRichMenuId(pickerValue);
    if (pickerFor === 'main')   setPostRichMenuId(pickerValue);
    closePicker();
  }, [pickerFor, pickerValue, closePicker, setPreRichMenuId, setPostRichMenuId]);

  // โหลดค่าปัจจุบัน + รายการเมนู
  useEffect(() => {
    let alive = true;
    if (!tid) {
      setLoading(false);
      setMsg({
        type:'info',
        text:'ยังไม่ได้เลือก OA — กดปุ่ม LOGIN TO SELECT OA ที่มุมขวาบนก่อนใช้งาน'
      });
      return () => { alive = false; };
    }
    (async () => {
      try {
        setLoading(true);
        setMsg(null);
        const h = await authHeader();

        // 1) โหลด integration settings
        const r1 = await fetch(`/api/tenants/${tid}/integrations/taskbot`, { headers: h });
        const j1 = await safeJson(r1);
        if (!alive) return;

        if (r1.status === 401 || r1.status === 403) {
          setMsg({ type:'info', text:'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
        } else if (j1.ok) {
          const d = j1.data || {};
          setEnabled(!!d.enabled);
          setAppsSheetId(d.appsSheetId || '');
          // รองรับ timestamp
          const ts = d.verifiedAt && (d.verifiedAt._seconds ? new Date(d.verifiedAt._seconds * 1000) : null);
          setVerifiedAt(ts ? 'ล่าสุด: ' + ts.toLocaleString() : null);

          // อ่านค่า rich menu ที่บันทึกไว้ (ถ้ามี)
          setPreRichMenuId(d.preRichMenuId || '');
          setPostRichMenuId(d.postRichMenuId || '');
        } else {
          setMsg({ type:'error', text: j1.error || `โหลดค่าไม่สำเร็จ (HTTP ${r1.status})` });
        }

        // 2) โหลดรายการ Rich menu ที่พร้อมใช้งาน
        const r2 = await fetch(`/api/tenants/${tid}/richmenus?status=ready`, { headers: h });
        const j2 = await safeJson(r2);
        if (!r2.ok || j2.ok === false) {
          // บางแบ็กเอนด์อาจยังไม่รองรับ status filter — ดึงทั้งหมด
          const rAll = await fetch(`/api/tenants/${tid}/richmenus`, { headers: h });
          const jAll = await safeJson(rAll);
          if (jAll?.ok && Array.isArray(jAll.data)) {
            setRichMenus(jAll.data);
          } else {
            setRichMenus([]);
          }
        } else {
          setRichMenus(Array.isArray(j2.data) ? j2.data : []);
        }

      } catch (e) {
        if (alive) setMsg({ type: 'error', text: String(e) });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tid]);

  // บันทึกค่า (รวม pre/post menu)
  const onSave = async () => {
    try {
      setSaving(true);
      setMsg(null);
      const h = await authHeader();

      // บันทึก config
      const body = { enabled, appsSheetId, preRichMenuId, postRichMenuId };
      const r = await fetch(`/api/tenants/${tid}/integrations/taskbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify(body),
      });
      const j = await safeJson(r);
      if (!r.ok || !j.ok) {
        setMsg({ type:'error', text: j.error || `บันทึกไม่สำเร็จ (HTTP ${r.status})` });
        return;
      }
      setMsg({ type: 'success', text: 'บันทึกแล้ว ✅' });

      // ถ้าเปิดใช้งาน → apply (ให้สร้าง preset อัตโนมัติได้)
      if (enabled) {
        const r2 = await fetch(`/api/tenants/${tid}/integrations/taskbot/apply-richmenus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...h },
          body: JSON.stringify({
            preRichMenuId: preRichMenuId || null,
            postRichMenuId: postRichMenuId || null,
            ensurePreset: true,
          }),
        });
        const j2 = await safeJson(r2);
        if (r2.ok && j2?.ok) {
          if (j2.preRichMenuId && !preRichMenuId) setPreRichMenuId(j2.preRichMenuId);
          if (j2.postRichMenuId && !postRichMenuId) setPostRichMenuId(j2.postRichMenuId);
          setMsg({ type: 'success', text: 'บันทึก & Apply Rich menus เรียบร้อย ✅' });
        } else {
          setMsg({ type: 'error', text: j2?.error || 'Apply ไม่สำเร็จ' });
        }
      }
    } catch (e) {
      setMsg({ type: 'error', text: String(e) });
    } finally {
      setSaving(false);
    }
  };

  // Verify: ให้ server ใช้ .env ติดต่อ Apps Script
  const onVerify = async () => {
    try {
      setVerifying(true);
      setMsg(null);
      const h = await authHeader();
      const r = await fetch(`/api/tenants/${tid}/integrations/taskbot/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({}),
      });
      const j = await safeJson(r);
      if (r.ok && j.ok) {
        setVerifiedAt('ล่าสุด: ' + new Date().toLocaleString());
        setMsg({ type: 'success', text: 'เชื่อม Apps Script ได้ ✅' });
      } else {
        setMsg({ type: 'error', text: j.error || 'เชื่อมไม่สำเร็จ' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: String(e) });
    } finally {
      setVerifying(false);
    }
  };

  const menuById = (id) => richMenus.find(m => (m.id || m.menuId) === id) || null;
  const menuOptionLabel = (m) => {
    if (!m) return '(no title)';
    const bits = [];
    bits.push(m.title || '(no title)');
    if (m.kind) bits.push(m.kind);
    if (m.size) bits.push(m.size);
    return bits.join(' • ');
  };

  const startEdit = async (which /* 'prereg' | 'main' */) => {
    try {
      const h = await authHeader();

      // ถ้าเคยเลือกไว้แล้วจะส่ง docId ไปด้วย เพื่อขอแก้ไขเอกสารเดิม
      const docId = (which === 'prereg') ? (preRichMenuId || null) : (postRichMenuId || null);

      const res = await fetch(`/api/tenants/${tid}/richmenus/start-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ docId, kind: which }),
      });

      const j = await safeJson(res);
      const back = encodeURIComponent('/homepage/task-assign-settings');

      // ถ้า API ใช้ไม่ได้/ตอบไม่ ok → เปิด editor โหมดพรีฟิลให้ไปก่อน
      if (!res.ok || j?.ok === false) {
        navigate(
          `/homepage/rich-menus/new?tenant=${tid}&prefill=${which}&redirect=${back}`,
          { replace: false }
        );
        return;
      }

      // รับหลายรูปแบบ field ที่ backend อาจส่งมา
      const realId =
        j?.draftId || j?.id || j?.docId || j?.data?.id || j?.data?.docId;
      const guest = j?.guestDraft;

      if (realId) {
        // มีเอกสารจริงแล้ว → ไปโหมดแก้ไข
        navigate(
          `/homepage/rich-menus/new?tenant=${tid}&draft=${encodeURIComponent(realId)}&prefill=${which}&redirect=${back}`,
          { replace: false }
        );
      } else if (guest) {
        // โหมด guest draft → ไปพร้อม guestDraft
        navigate(
          `/homepage/rich-menus/new?tenant=${tid}&guestDraft=${encodeURIComponent(guest)}&prefill=${which}&redirect=${back}`,
          { replace: false }
        );
      } else {
        // กันพลาดสุดท้าย
        navigate(
          `/homepage/rich-menus/new?tenant=${tid}&prefill=${which}&redirect=${back}`,
          { replace: false }
        );
      }
    } catch (e) {
      // fallback สุดท้าย: เปิดโหมดพรีฟิล
      const back = encodeURIComponent('/homepage/task-assign-settings');
      navigate(
        `/homepage/rich-menus/new?tenant=${tid}&prefill=${which}&redirect=${back}`,
        { replace: false }
      );
      setMsg({ type: 'warning', text: 'เปิดตัวแก้ไขแบบพรีฟิล (start-edit ใช้งานไม่ได้)' });
      console.error('[startEdit] error:', e);
    }
  };

  // ====== UI ======
  return (
    <Stack spacing={2} sx={{ p: { xs:2, md:3 }, maxWidth: 1100 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <SettingsIcon fontSize="small" />
        <Typography variant="h5">Task Assignment</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        หน้านี้ตั้งค่าเฉพาะ Google Sheet และ Rich menu ของ OA นี้เท่านั้น
        (Apps Script URL / Shared Key ตั้งที่ฝั่งเซิร์ฟเวอร์ผ่านไฟล์ <code>.env</code>)
      </Typography>

      {msg && <Alert severity={msg.type}>{msg.text}</Alert>}

      {/* Enable */}
      <Paper variant="outlined" sx={{ p:2 }}>
        <Stack spacing={1}>
          {!authed && (
            <Alert severity="info">
              คุณยังไม่ได้เข้าสู่ระบบ — ให้พิมพ์ <b>จัดการผู้ใช้งาน</b> ใน LINE แล้วกดปุ่ม “เข้าสู่ระบบ” เพื่อเปิดเว็บด้วย magic link
            </Alert>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={async (e) => {
                  const next = e.target.checked;
                  const prev = enabled;

                  // ✅ กันพลาด: ต้องล็อกอินและต้องกรอก Google Sheet ID ก่อนเปิดใช้
                  if (next) {
                    if (!authed) {
                      setMsg({ type: 'warning', text: 'กรุณาเข้าสู่ระบบก่อนเปิดใช้งาน' });
                      setEnabled(prev);
                      return;
                    }
                    if (!String(appsSheetId || '').trim()) {
                      setMsg({ type: 'warning', text: 'กรุณากรอก Google Sheet ID ก่อนเปิดใช้งาน' });
                      setEnabled(prev);
                      return;
                    }
                    if (!verifiedAt) {
                      setMsg({type:'warning', text:'กรุณา Verify กับ Google Apps Script ก่อนเปิดใช้งาน'});
                      setEnabled(prev);
                      return;
                    }
                  }

                  try {
                    const h = await authHeader();

                    if (next) {
                      // (1) Bootstrap
                      const r1 = await fetch(`/api/tenants/${tid}/integrations/taskbot/bootstrap`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...h },
                        body: JSON.stringify({ preRichMenuId, postRichMenuId }),
                      });
                      const j1 = await safeJson(r1);
                      if (!j1?.ok) throw new Error(j1?.error || 'bootstrap_failed');

                      const preId  = j1.preRichMenuId  || preRichMenuId  || 'PREREG';
                      const postId = j1.postRichMenuId || postRichMenuId || 'MAIN';
                      if (j1.preRichMenuId)  setPreRichMenuId(j1.preRichMenuId);
                      if (j1.postRichMenuId) setPostRichMenuId(j1.postRichMenuId);

                      // (2) Apply
                      const r2 = await fetch(`/api/tenants/${tid}/integrations/taskbot/apply-richmenus`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...h },
                        body: JSON.stringify({
                          preRichMenuId: preId,
                          postRichMenuId: postId,
                          ensurePreset: true,
                        }),
                      });
                      const j2 = await r2.json();
                      if (!j2?.ok) throw new Error(j2?.error || 'apply_failed');

                      setEnabled(true);
                      setMsg({ type: 'success', text: 'Enabled + Apply rich menus เรียบร้อย ✅' });
                    } else {
                      // Disable
                      const r = await fetch(`/api/tenants/${tid}/integrations/taskbot/disable`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...h },
                        body: JSON.stringify({}),
                      });
                      const j = await r.json();
                      if (!j?.ok) throw new Error(j?.error || 'disable_failed');

                      setEnabled(false);
                      setMsg({ type: 'success', text: 'Disabled และยกเลิก Default ของ OA แล้ว' });
                    }
                  } catch (err) {
                    setEnabled(prev);
                    setMsg({ type: 'error', text: String(err?.message || err) });
                    console.error('[taskbot] toggle error:', err);
                  }
                }}
                disabled={loading || !authed || !String(appsSheetId || '').trim()}
              />
            }
            label={enabled ? 'Enabled' : 'Disabled'}
          />

          {/* เงื่อนไขเปิดใช้งาน */}
          <Typography variant="caption" color="text.secondary">
            เงื่อนไขการเปิดใช้งาน: ต้อง <b>เข้าสู่ระบบ</b> และกรอก <b>Google Sheet ID</b> ให้เรียบร้อย
          </Typography>
        </Stack>
      </Paper>

      {/* Google Sheet 1:1 */}
      <Paper variant="outlined" sx={{ p:2 }}>
        <Typography variant="subtitle1" sx={{ mb:1 }}>Google Sheet (1:1 ต่อ OA)</Typography>
        <Divider sx={{ mb:2 }} />
        <Stack spacing={2}>
          <TextField
            label="Google Sheet ID (ของ OA นี้)"
            fullWidth
            value={appsSheetId}
            onChange={e => setAppsSheetId(e.target.value.trim())}
            placeholder="เช่น 1AbCDefGhIJkLMNoPQRstuVWxyz1234567890"
            helperText="คัดลอก ID ระหว่าง /d/ และ /edit จากลิงก์ของสเปรดชีต"
          />
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" onClick={onVerify} disabled={verifying || loading}>
              Verify Connection
            </Button>
            {verifiedAt && <Typography variant="caption" color="text.secondary">{verifiedAt}</Typography>}
          </Stack>

          <Divider />
          <Stack spacing={0.5}>
            <Typography variant="body2"><strong>วิธีหาค่า Google Sheet ID</strong></Typography>
            <Typography variant="body2">
              1) เปิดสเปรดชีตใน Google Sheets แล้วดูที่ URL เช่น&nbsp;
              <em>https://docs.google.com/spreadsheets/d/<b>1AbCDef…XYZ</b>/edit#gid=0</em>
            </Typography>
            <Typography variant="body2">2) คัดลอกเฉพาะข้อความระหว่าง <code>/d/</code> กับ <code>/edit</code></Typography>
            <Typography variant="body2">3) วางลงในช่อง “Google Sheet ID” แล้วกด Save</Typography>
            <Typography variant="body2">4) กด Verify เพื่อตรวจการเชื่อมต่อ</Typography>
            <Typography variant="body2" sx={{ mt:1 }}>
              หมายเหตุ : ตั้งค่า Share Google Sheet เป็น Anyone with the link = "Editor"
            </Typography>
          </Stack>
        </Stack>

        {/* ปุ่ม Save */}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={onSave} disabled={saving || loading}>
            Save
          </Button>
        </Stack>
      </Paper>

      {/* Rich menu สำหรับ OA นี้ */}
      <Paper variant="outlined" sx={{ p:2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <MenuOpenIcon fontSize="small" />
          <Typography variant="subtitle1">Rich menu สำหรับ OA นี้</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          เลือกเมนู <b>ก่อนลงทะเบียน (prereg)</b> และ <b>หลังลงทะเบียน (main)</b> — เมื่อกด <b>Enable</b> ระบบจะตั้งค่าให้ OA โดยอัตโนมัติ
        </Typography>

        <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 1 }}>
          {/* PRE-REG */}
          <Card variant="outlined" sx={{ minWidth: 320, maxWidth: 360 }}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2" fontWeight="bold">ก่อนลงทะเบียน (prereg)</Typography>
                  <Tooltip title="เมนูที่จะแสดงกับผู้ใช้ที่ยังไม่ได้ลงทะเบียน">
                    <InfoOutlinedIcon fontSize="small" color="action" />
                  </Tooltip>
                </Stack>

                <Box sx={{ border:'1px solid #e0e0e0', borderRadius:1, overflow:'hidden' }}>
                  <img
                    src={(menuById(preRichMenuId)?.imageUrl) || DEFAULT_IMAGES.prereg}
                    alt="pre-richmenu"
                    onClick={() => openViewer((menuById(preRichMenuId)?.imageUrl) || DEFAULT_IMAGES.prereg, 'pre-richmenu')}
                    style={{ width:'100%', display:'block', height: 140, objectFit:'cover', cursor: 'zoom-in' }}
                  />
                </Box>

                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button size="small" variant="outlined" onClick={() => openPicker('prereg')}>
                    เปลี่ยนเมนู…
                  </Button>
                  <Button size="small" variant="text" onClick={() => startEdit('prereg')}>
                    ไปที่หน้าสร้าง/แก้ไข
                  </Button>
                  {preRichMenuId
                    ? <Chip size="small" label={menuOptionLabel(menuById(preRichMenuId))} />
                    : <Chip size="small" label="ใช้ preset (prereg)" variant="outlined" />
                  }
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {/* MAIN */}
          <Card variant="outlined" sx={{ minWidth: 320, maxWidth: 360 }}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2" fontWeight="bold">หลังลงทะเบียน (main)</Typography>
                  <Tooltip title="เมนูหลักของผู้ใช้ที่ลงทะเบียนแล้ว">
                    <InfoOutlinedIcon fontSize="small" color="action" />
                  </Tooltip>
                </Stack>

                <Box sx={{ border:'1px solid #e0e0e0', borderRadius:1, overflow:'hidden' }}>
                  <img
                    src={(menuById(postRichMenuId)?.imageUrl) || DEFAULT_IMAGES.main}
                    alt="post-richmenu"
                    onClick={() => openViewer((menuById(postRichMenuId)?.imageUrl) || DEFAULT_IMAGES.main, 'post-richmenu')}
                    style={{ width:'100%', display:'block', height: 140, objectFit:'cover', cursor: 'zoom-in' }}
                  />
                </Box>

                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button size="small" variant="outlined" onClick={() => openPicker('main')}>
                    เปลี่ยนเมนู…
                  </Button>
                  <Button size="small" variant="text" onClick={() => startEdit('main')}>
                    ไปที่หน้าสร้าง/แก้ไข
                  </Button>
                  {postRichMenuId
                    ? <Chip size="small" label={menuOptionLabel(menuById(postRichMenuId))} />
                    : <Chip size="small" label="ใช้ preset (main)" variant="outlined" />
                  }
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        {/* ปุ่มบันทึก */}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={onSave} disabled={saving || loading}>
            {enabled ? 'Save & Apply' : 'Save'}
          </Button>
        </Stack>
      </Paper>

      {/* คำแนะนำ/คำสั่งของ Task Assignment Bot */}
      <Paper variant="outlined" sx={{ p:2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <PlaylistAddCheckIcon fontSize="small" />
          <Typography variant="subtitle1">วิธีใช้งาน & คำสั่งหลัก</Typography>
        </Stack>
        <Divider sx={{ mb: 2 }} />

        <Grid container spacing={2}>
          {/* กลุ่ม 1: เริ่มต้น / ลงทะเบียน */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>เริ่มต้น / ลงทะเบียน</Typography>
                <Stack spacing={0.5}>
                  <Typography variant="body2">• พิมพ์ <b>ลงทะเบียน</b> เพื่อเปิดฟอร์มครั้งแรก</Typography>
                  <Typography variant="body2">• กรอก <i>ชื่อจริง</i>, <i>ชื่อเล่น (username)</i>, <i>ตำแหน่ง</i> เพื่อผูกกับ LINE ของคุณ</Typography>
                  <Typography variant="body2">• ถ้าเคยลงทะเบียนแล้ว ระบบจะแจ้งข้อมูลปัจจุบัน และมีตัวเลือก <b>แก้ข้อมูล</b></Typography>
                </Stack>
                <ThumbGrid images={[registerImg1, registerImg2]} />
              </CardContent>
            </Card>
          </Grid>

          {/* กลุ่ม 2: สั่งงาน */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: .5 }}>สั่งงาน (พิมพ์ในแชท)</Typography>
                <Stack spacing={0.5}>
                  <Typography variant="body2">• <code>@po ปรับรายงาน พรุ่งนี้ 09:00</code></Typography>
                  <Typography variant="body2">• <code>@test ขอทำป้ายหน้าร้าน ก่อนบ่าย 3</code> (ตีความเวลาเป็น 15:00 ของวันนี้)</Typography>
                  <Typography variant="body2">• <code>@po ทำ rich menu วันนี้ ด่วน</code> (ติดแท็ก [URGENT])</Typography>
                  <Typography variant="caption" color="text.secondary">
                    เคล็ดลับ: ไม่ใส่เวลา → ใช้ 17:30 อัตโนมัติ, คำว่า “ก่อนบ่าย 3” → 15:00 วันนี้
                  </Typography>
                </Stack>
                <ThumbGrid images={[assignImg1, assignImg2]} />
              </CardContent>
            </Card>
          </Grid>

          {/* กลุ่ม 3: ดูงาน & อัปเดตงาน */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>ดูงานของฉัน / อัปเดตงาน</Typography>
                <Stack spacing={0.5}>
                  <Typography variant="body2">• <code>ดูงานค้างทั้งหมด</code> — งานสถานะ pending/doing</Typography>
                  <Typography variant="body2">• <code>งานของฉันวันนี้</code> — งานที่กำหนดส่ง “วันนี้”</Typography>
                  <Typography variant="body2">• <code>ดูงานที่ฉันสั่ง</code> — งานที่ฉันเป็นผู้สั่ง</Typography>
                </Stack>
                <Divider sx={{ my:1 }} />
                <Stack spacing={0.5}>
                  <Typography variant="body2">• เสร็จงาน: <code>done &lt;TASK_ID&gt;</code></Typography>
                  <Typography variant="body2">• กำลังทำ: <code>กำลังดำเนินการ &lt;TASK_ID&gt;</code></Typography>
                  <Typography variant="body2">• แก้กำหนดส่ง: <code>แก้กำหนดส่ง &lt;TASK_ID&gt; พรุ่งนี้ 10:00</code></Typography>
                  <Typography variant="body2">• เพิ่มโน้ต: <code>เพิ่มโน้ต &lt;TASK_ID&gt; ข้อความ...</code></Typography>
                </Stack>
                <ThumbGrid images={[tasksImg1, tasksImg2, tasksImg3]} />
              </CardContent>
            </Card>
          </Grid>

          {/* กลุ่ม 4: หน้าเว็บ “จัดการผู้ใช้งาน” (magic link) */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>หน้าเว็บ “จัดการผู้ใช้งาน”</Typography>
                <Stack spacing={0.5}>
                  <Typography variant="body2">• ในแชท พิมพ์ <b>จัดการผู้ใช้งาน</b> → บอทส่งการ์ดที่มีปุ่ม “เข้าสู่ระบบ”</Typography>
                  <Typography variant="body2">• กดปุ่ม → เปิดเว็บด้วย <i>magic link</i> (อายุ ~2 ชม.) โดยไม่ต้องกรอกรหัสผ่าน</Typography>
                  <Typography variant="body2">• หน้า Home แสดง “สวัสดี @username” และบทบาทของคุณ</Typography>
                  <Typography variant="body2">• ไปที่ <b>Users (แบ่งตาม role)</b> เพื่อจัดการสิทธิ์/รายชื่อ</Typography>
                  <Typography variant="caption" color="text.secondary">
                    เคล็ดลับ: ถ้ามองไม่เห็นเมนูล่าสุด ให้แอดมินกด Enable/Apply อีกรอบ ระบบจะ reset เมนูสำหรับผู้กดให้อัตโนมัติ
                  </Typography>
                </Stack>
                <ThumbGrid images={[manageUsersImg1, manageUsersImg2, manageUsersImg3, manageUsersImg4, manageUsersImg5]} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Stack spacing={1} sx={{ mt: 2 }}>
          <Typography variant="body2">
            เอกสารแนะนำ: <Link href="/homepage/rich-menus" target="_blank" rel="noreferrer">Rich menu manager</Link> •{' '}
            <Link href="https://support.google.com/a/users/answer/9308871?hl=th" target="_blank" rel="noreferrer">การแชร์ไฟล์ Google</Link>
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            หมายเหตุ: 1 OA ต่อ 1 Google Sheet — เพื่อแยกข้อมูลให้เป็นสัดส่วน หากใช้หลาย OA ให้ตั้งค่า Sheet ID แยกกันในหน้านี้
          </Typography>
        </Stack>
      </Paper>

      {/* 📌 สรุปคำสั่งทั้งหมด */}
      <Paper variant="outlined" sx={{ p:2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>สรุปคำสั่งทั้งหมด</Typography>
        <Divider sx={{ mb:2 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold">ลงทะเบียน / จัดการบัญชี</Typography>
                <Box sx={{ fontFamily:'monospace', whiteSpace:'pre-line', mt: 1 }}>
{`ลงทะเบียน
ลงทะเบียน <username> <ชื่อจริง> <role>
จัดการผู้ใช้งาน
ติดต่อแอดมิน`}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display:'block', mt:1 }}>
                  * ถ้าเคยลงทะเบียนแล้ว พิมพ์ “ลงทะเบียน” อีกครั้ง ระบบจะแจ้งชื่อและบทบาทที่บันทึกไว้
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold">สั่งงาน (แบบพรีวิวก่อนยืนยัน)</Typography>
                <Box sx={{ fontFamily:'monospace', whiteSpace:'pre-line', mt: 1 }}>
{`@<username> รายละเอียดงาน [เส้นตาย/โน้ตแบบภาษาคน]
ยืนยันมอบหมาย [TMP_xxx]
ยกเลิกมอบหมาย [TMP_xxx]`}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display:'block', mt:1 }}>
                  ตัวอย่าง: <code>@po ทำรายงาน พรุ่งนี้ 09:00</code> • <code>@test ทำป้ายหน้าร้าน ก่อนบ่าย 3</code>
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold">ดูงานของฉัน</Typography>
                <Box sx={{ fontFamily:'monospace', whiteSpace:'pre-line', mt: 1 }}>
{`ดูงานค้างทั้งหมด
งานของฉันวันนี้
ดูงานที่ฉันสั่ง`}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold">อัปเดตงาน</Typography>
                <Box sx={{ fontFamily:'monospace', whiteSpace:'pre-line', mt: 1 }}>
{`done <TASK_ID>
กำลังดำเนินการ <TASK_ID>
แก้กำหนดส่ง <TASK_ID> <เวลา/ภาษาคน>
เพิ่มโน้ต <TASK_ID> <ข้อความ>`}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Lightbox แสดงภาพใหญ่ */}
      <Dialog open={viewer.open} onClose={closeViewer} maxWidth="md" fullWidth>
        <Box sx={{ p:0 }}>
          <Box
            component="img"
            src={viewer.src}
            alt={viewer.alt}
            sx={{ width:'100%', height:'auto', display:'block' }}
          />
        </Box>
      </Dialog>

      {/* Dialog เลือก Rich menu */}
      <Dialog open={pickerOpen} onClose={closePicker} fullWidth maxWidth="lg">
        <DialogTitle>เลือกเมนูสำหรับ {pickerFor === 'prereg' ? 'ก่อนลงทะเบียน' : 'หลังลงทะเบียน'}</DialogTitle>
        <DialogContent dividers>
          <ImageList cols={pickerCols} rowHeight={pickerRowHeight} gap={12}>
            {richMenus.map((m) => {
              const id = m.id || m.menuId;
              const fallback = pickerFor === 'prereg' ? DEFAULT_IMAGES.prereg : DEFAULT_IMAGES.main;
              return (
                <ImageListItem
                  key={id}
                  onClick={() => setPickerValue(id)}
                  style={{ cursor:'pointer' }}
                >
                  <img
                    src={m.imageUrl || fallback}
                    alt={m.title || id}
                    loading="lazy"
                    style={{
                      width:'100%',
                      height: pickerRowHeight,
                      objectFit:'cover',
                      borderRadius: 8,
                      border: '1px solid #e0e0e0'
                    }}
                  />
                  <Typography variant="caption" sx={{ display:'block', mt: .5 }}>
                    {menuOptionLabel(m)}
                  </Typography>
                  {pickerValue === id && (
                    <Chip size="small" color="success" label="เลือกแล้ว" sx={{ mt: .5 }} />
                  )}
                </ImageListItem>
              );
            })}
            {!richMenus.length && (
              <Typography variant="body2" color="text.secondary">
                ยังไม่มีเมนูใน OA นี้ — ไปสร้างจากปุ่ม “ไปที่หน้าสร้าง/แก้ไข”
              </Typography>
            )}
          </ImageList>
        </DialogContent>
        <DialogActions>
          <Button onClick={closePicker}>ยกเลิก</Button>
          <Button onClick={handlePickerApply} disabled={!pickerValue} variant="contained">ใช้เมนูนี้</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
