// src/pages/TimeAttendanceSettingsPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Paper, Stack, Typography, Switch, FormControlLabel,
  Button, Alert, Divider, TextField, Grid, Box, Chip,
  Card, CardContent, Tooltip, Tabs, Tab, Accordion,
  AccordionSummary, AccordionDetails,
  Dialog, DialogContent, DialogActions,
  ImageList, ImageListItem, useMediaQuery, useTheme
} from '@mui/material';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';

import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

// ------------ utils ------------
function getActiveTenantId() {
  return localStorage.getItem('activeTenantId') || '';
}
async function authHeader() {
  const u = getAuth().currentUser;
  const t = u ? await u.getIdToken() : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (ct.includes('application/json')) {
    try { return JSON.parse(text); } catch {}
  }
  return { ok:false, error: text || res.statusText || `HTTP ${res.status}` };
}

// preview ดีฟอลต์
const ADMIN_PREVIEW = '/static/hr_menu_admin.png';
const USER_PREVIEW  = '/static/ta_menu_user.png';
const sheetIdHelp   = '/static/google-sheet-id-help.png';

// ====== Reusable small components ======
function SectionHint({ children }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>
      {children}
    </Typography>
  );
}

// รูป (thumbnail) พร้อม caption สั้นๆ
function Thumb({ src, alt, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        cursor:'zoom-in',
        border:'1px solid #e5e7eb',
        borderRadius:1,
        overflow:'hidden',
        bgcolor:'#fff',
        '&:hover': { boxShadow:2 }
      }}
    >
      <Box
        component="img"
        src={encodeURI(src)}
        alt={alt}
        loading="lazy"
        sx={{ width:'100%', height:160, objectFit:'cover', display:'block' }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ p:.75, display:'block', textAlign:'center' }}>
        {alt}
      </Typography>
    </Box>
  );
}

// แกลเลอรีแบบย่อ + ปุ่มดูทั้งหมด
function Gallery({ items = [], onOpenAll, onOpenSingle }) {
  const preview = items.slice(0, 2);
  return (
    <Grid container spacing={1.5}>
      {preview.map((it, i) => (
        <Grid key={i} item xs={12} sm={6}>
          <Thumb src={it.src} alt={it.caption || it.alt} onClick={() => onOpenSingle(it)} />
        </Grid>
      ))}
      {items.length > 2 && (
        <Grid item xs={12}>
          <Button size="small" onClick={onOpenAll}>ดูทั้งหมด {items.length} รูป</Button>
        </Grid>
      )}
    </Grid>
  );
}

// ========= main =========
export default function TimeAttendanceSettingsPage() {
  const tid = useMemo(() => getActiveTenantId(), []);
  const navigate = useNavigate();

  // auth
  const [authed, setAuthed] = useState(!!getAuth().currentUser);
  useEffect(() => onAuthStateChanged(getAuth(), (u) => setAuthed(!!u)), []);

  const theme = useTheme();
  const mdUp  = useMediaQuery(theme.breakpoints.up('md'));
  const lgUp  = useMediaQuery(theme.breakpoints.up('lg'));
  const xlUp  = useMediaQuery(theme.breakpoints.up('xl'));
  const pickerCols      = xlUp ? 6 : lgUp ? 5 : mdUp ? 4 : 2;
  const pickerRowHeight = mdUp ? 180 : 140;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState(null);

  // settings
  const [enabled, setEnabled] = useState(false);
  const [appsSheetId, setAppsSheetId] = useState('');
  const [appsSheetIdSaved, setAppsSheetIdSaved] = useState('');
  const dirtySheet = useMemo(
    () => (appsSheetId || '').trim() !== (appsSheetIdSaved || '').trim(),
    [appsSheetId, appsSheetIdSaved]
  );
  const [verifiedAt, setVerifiedAt] = useState(null);

  // rich menu
  const [richMenus, setRichMenus] = useState([]);
  const [adminRichMenuId, setAdminRichMenuId] = useState('');
  const [userRichMenuId,  setUserRichMenuId]  = useState('');

  // picker + image viewer
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);
  const [pickerValue, setPickerValue] = useState('');

  const [viewer, setViewer] = useState({ open:false, src:'', alt:'' });
  const openViewer  = useCallback((src, alt='') => setViewer({ open:true, src, alt }), []);
  const closeViewer = useCallback(() => setViewer(v => ({ ...v, open:false })), []);

  // gallery dialog (for “ดูทั้งหมด”)
  const [gallery, setGallery] = useState({ open:false, items:[], title:'' });
  const openGallery = (title, items) => setGallery({ open:true, items, title });
  const closeGallery = () => setGallery(g => ({ ...g, open:false }));

  // ===== load config =====
  useEffect(() => {
    let alive = true;
    if (!tid) {
      setLoading(false);
      setMsg({ type:'info', text:'ยังไม่ได้เลือก OA — กด LOGIN TO SELECT OA ที่ด้านบนก่อนใช้งาน' });
      return () => { alive = false; };
    }
    (async () => {
      try {
        setLoading(true);
        setMsg(null);
        const h = await authHeader();

        const r1 = await fetch(`/api/tenants/${tid}/integrations/attendance`, { headers: h });
        const j1 = await safeJson(r1);
        if (!alive) return;
        if (r1.status === 401 || r1.status === 403) {
          setMsg({ type: 'info', text: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
        } else if (j1?.ok) {
          const d = j1.data || {};
          setEnabled(!!d.enabled);
          setAppsSheetId(d.appsSheetId || '');
          setAppsSheetIdSaved(d.appsSheetId || '');
          // verifiedAt
          let vAt = null; const v = d.verifiedAt;
          if (v) {
            if (v._seconds) vAt = new Date(v._seconds * 1000);
            else if (typeof v === 'number') vAt = new Date(v);
            else if (typeof v === 'string') { const t = new Date(v); if (!isNaN(t)) vAt = t; }
          }
          setVerifiedAt(vAt ? ('ล่าสุด: ' + vAt.toLocaleString()) : null);
          // menu ids
          const adminId = d.adminRichMenuDoc || d.adminRichMenuId || d.adminRichMenu || '';
          const userId  = d.userRichMenuDoc  || d.userRichMenuId  || d.userRichMenu  || '';
          setAdminRichMenuId(adminId);
          setUserRichMenuId(userId);
        } else {
          setMsg({ type:'warning', text: j1?.error || `โหลดการตั้งค่าไม่สำเร็จ (HTTP ${r1.status})` });
        }

        // list menus
        const r2 = await fetch(`/api/tenants/${tid}/richmenus?status=ready`, { headers: h });
        const j2 = await safeJson(r2);
        let items = Array.isArray(j2?.data) ? j2.data : [];
        if (!items.length) {
          const rAll = await fetch(`/api/tenants/${tid}/richmenus`, { headers: h });
          const jAll = await safeJson(rAll);
          items = Array.isArray(jAll?.data) ? jAll.data : [];
        }
        if (alive) setRichMenus(items);
      } catch (e) {
        if (alive) setMsg({ type: 'error', text: String(e) });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tid]);

  // helpers
  const menuById = (id) => richMenus.find(m => (m.id || m.menuId) === id) || null;
  const menuOptionLabel = (m) => {
    if (!m) return '(no title)';
    const bits = [];
    bits.push(m.title || m.name || '(no title)');
    if (m.kind) bits.push(m.kind);
    if (m.size) bits.push(m.size);
    return bits.join(' • ');
  };

  const openPicker = useCallback((which) => {
    setPickerFor(which);
    setPickerValue(which === 'admin' ? (adminRichMenuId || '') : (userRichMenuId || ''));
    setPickerOpen(true);
  }, [adminRichMenuId, userRichMenuId]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerFor(null);
    setPickerValue('');
  }, []);

  const handlePickerApply = useCallback(() => {
    if (!pickerFor || !pickerValue) return closePicker();
    if (pickerFor === 'admin') setAdminRichMenuId(pickerValue);
    if (pickerFor === 'user')  setUserRichMenuId(pickerValue);
    closePicker();
  }, [pickerFor, pickerValue, closePicker]);

  const startEdit = useCallback(async (which) => {
    try {
      const h = await authHeader();
      const docId = which === 'admin' ? (adminRichMenuId || null) : (userRichMenuId || null);
      const prefill = which === 'admin' ? 'ta_admin' : 'ta_user';
      const back = encodeURIComponent('/homepage/settings/attendance');

      const res = await fetch(`/api/tenants/${tid}/richmenus/start-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ docId, kind: which, app: 'attendance' }),
      });
      const j = await safeJson(res);
      const realId = j?.draftId || j?.id || j?.docId || j?.data?.id || j?.data?.docId;
      const guest  = j?.guestDraft;

      if (realId) {
        navigate(`/homepage/rich-menus/new?tenant=${tid}&draft=${encodeURIComponent(realId)}&prefill=${prefill}&redirect=${back}`);
      } else if (guest) {
        navigate(`/homepage/rich-menus/new?tenant=${tid}&guestDraft=${encodeURIComponent(guest)}&prefill=${prefill}&redirect=${back}`);
      } else {
        navigate(`/homepage/rich-menus/new?tenant=${tid}&prefill=${prefill}&redirect=${back}`);
      }
    } catch (e) {
      const back = encodeURIComponent('/homepage/settings/attendance');
      navigate(`/homepage/rich-menus/new?tenant=${tid}&prefill=${which === 'admin' ? 'ta_admin' : 'ta_user'}&redirect=${back}`);
      setMsg({ type:'warning', text:'เปิดตัวแก้ไขแบบพรีฟิล (start-edit ใช้งานไม่ได้)' });
    }
  }, [tid, adminRichMenuId, userRichMenuId, navigate]);

  // verify / save / toggle
  const onVerify = async () => {
    try {
      if (!String(appsSheetId || '').trim()) return setMsg({ type:'warning', text:'กรุณากรอก และ Save Google Sheet ID ก่อน Verify' });
      if (dirtySheet) return setMsg({ type:'warning', text:'คุณแก้ไข Google Sheet ID แล้ว ยังไม่ได้กด Save' });
      setVerifying(true); setMsg(null);
      const h = await authHeader();
      const r = await fetch(`/api/tenants/${tid}/integrations/attendance/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ sheetId: (appsSheetId || '').trim() })
      });
      const j = await safeJson(r);
      if (r.ok && j?.ok) {
        setVerifiedAt('ล่าสุด: ' + new Date().toLocaleString());
        setMsg({ type:'success', text:'เชื่อม Apps Script ได้ ✅' });
      } else setMsg({ type:'error', text: j?.error || 'เชื่อมไม่สำเร็จ' });
    } catch (e) {
      setMsg({ type:'error', text:String(e) });
    } finally { setVerifying(false); }
  };

  const onSave = async (applyAfter = false) => {
    try {
      setSaving(true); setMsg(null);
      const h = await authHeader();
      const body = {
        enabled, appsSheetId,
        adminRichMenuDoc: adminRichMenuId || '',
        userRichMenuDoc:  userRichMenuId  || '',
        adminRichMenuId:  adminRichMenuId || '',
        userRichMenuId:   userRichMenuId  || ''
      };
      const r = await fetch(`/api/tenants/${tid}/integrations/attendance`, {
        method:'POST', headers:{ 'Content-Type':'application/json', ...h }, body: JSON.stringify(body)
      });
      const j = await safeJson(r);
      if (!r.ok || j?.ok === false) return setMsg({ type:'error', text: j?.error || `บันทึกไม่สำเร็จ (HTTP ${r.status})` });
      setAppsSheetIdSaved((appsSheetId || '').trim());
      setMsg({ type:'success', text:'บันทึกแล้ว ✅' });

      if (applyAfter && enabled) {
        const r2 = await fetch(`/api/tenants/${tid}/integrations/attendance/apply-richmenus`, {
          method:'POST', headers:{ 'Content-Type':'application/json', ...h },
          body: JSON.stringify({ adminRichMenuId: adminRichMenuId || null, userRichMenuId: userRichMenuId || null, ensurePreset: true })
        });
        const j2 = await safeJson(r2);
        if (r2.ok && j2?.ok) setMsg({ type:'success', text:'บันทึก & Apply Rich menus เรียบร้อย ✅' });
        else {
          const en = await fetch(`/api/tenants/${tid}/integrations/attendance/enable`, {
            method:'POST', headers:{ 'Content-Type':'application/json', ...h }, body: JSON.stringify({})
          });
          const jEn = await safeJson(en);
          if (en.ok && jEn?.ok) setMsg({ type:'success', text:'บันทึกแล้ว และซิงก์ Rich menus ให้เรียบร้อย ✅' });
          else setMsg({ type:'warning', text: j2?.error || 'Apply ไม่สำเร็จ' });
        }
      }
    } catch (e) {
      setMsg({ type:'error', text:String(e) });
    } finally { setSaving(false); }
  };

  const onToggleEnabled = async (e) => {
    const next = e.target.checked, prev = enabled;
    if (next) {
      if (!authed)           { setMsg({ type:'warning', text:'กรุณาเข้าสู่ระบบก่อนเปิดใช้งาน' }); setEnabled(prev); return; }
      if (!String(appsSheetId || '').trim()) { setMsg({ type:'warning', text:'กรุณาเพิ่ม Google Sheet ID แล้วกด Save ก่อนเปิดใช้งาน' }); setEnabled(prev); return; }
      if (dirtySheet)        { setMsg({ type:'warning', text:'คุณแก้ไข Google Sheet ID แล้ว ยังไม่ได้กด Save' }); setEnabled(prev); return; }
      if (!verifiedAt)       { setMsg({ type:'warning', text:'กรุณา Verify กับ Google Apps Script ให้สำเร็จก่อนเปิดใช้งาน' }); setEnabled(prev); return; }
    }
    try {
      setEnabled(next);
      const h = await authHeader();
      await onSave(false);
      if (next) {
        const en = await fetch(`/api/tenants/${tid}/integrations/attendance/enable`, {
          method:'POST', headers:{ 'Content-Type':'application/json', ...h }, body: JSON.stringify({})
        });
        const j = await safeJson(en);
        if (!(en.ok && j?.ok)) throw new Error(j?.error || 'Enable Attendance ไม่สำเร็จ');
        setMsg({ type:'success', text:'Enabled + Apply Rich menus เรียบร้อย ✅' });
      } else {
        const di = await fetch(`/api/tenants/${tid}/integrations/attendance/disable`, {
          method:'POST', headers:{ 'Content-Type':'application/json', ...h }, body: JSON.stringify({})
        });
        const j = await safeJson(di);
        if (!(di.ok && j?.ok)) throw new Error(j?.error || 'Disable Attendance ไม่สำเร็จ');
        setMsg({ type:'success', text:'Disabled และยกเลิก Default ของ OA แล้ว' });
      }
    } catch (err) {
      setEnabled(prev);
      setMsg({ type:'error', text:String(err?.message || err) });
    }
  };

  // ========= data for galleries (User/Admin) =========
  const userSections = [
    {
      title: 'ลงทะเบียนเข้าใช้งาน',
      desc: 'กรอกข้อมูลพื้นฐาน/บัญชีธนาคาร',
      items: [
        { src:'/static/TA_User/ลงทะเบียนเข้าใช้งาน_1.jpg', caption:'คำสั่ง ลงทะเบียนเข้าใช้งาน' },
        { src:'/static/TA_User/ลงทะเบียนเข้าใช้งาน_2.jpg', caption:'หน้าลงทะเบียนเข้าใช้งาน' },
      ]
    },
    {
      title: 'ลงเวลาเข้างาน',
      desc: 'เปิดหน้าลงเวลาเข้าทำงาน แล้วกดยืนยัน',
      items: [
        { src:'/static/TA_User/ลงเวลาเข้างาน_1.jpg', caption:'คำสั่ง ลงเวลาเข้างาน' },
        { src:'/static/TA_User/ลงเวลาเข้างาน_2.jpg', caption:'หน้าลงเวลาเข้างาน' },
      ]
    },
    {
      title: 'ลงเวลาออก',
      desc: 'ก่อนกลับให้กด “ลงเวลาออกงาน”',
      items: [
        { src:'/static/TA_User/ลงเวลาออก_1.jpg', caption:'คำสั่ง ลงเวลาออก' },
        { src:'/static/TA_User/ลงเวลาออก_2.jpg', caption:'หน้าลงเวลาออก' },
      ]
    },
    {
      title: 'ลางาน',
      desc: 'เลือกวัน/ชั่วโมง พร้อมเหตุผล',
      items: [
        { src:'/static/TA_User/ขอลางาน_1.jpg', caption:'คำสั่ง ลางาน' },
        { src:'/static/TA_User/ขอลางาน_2.jpg', caption:'หน้าลางาน' },
      ]
    },
    {
      title: 'ช่วยเหลือ',
      desc: 'ดูคำสั่ง/ลิงก์ใช้งาน',
      items: [
        { src:'/static/TA_Admin/ช่วยเหลือ_user.jpg', caption:'ช่วยเหลือ (ผู้ใช้งาน)' },
      ]
    },
  ];

  const adminSections = [
    {
      title: 'หน้าตั้งค่า',
      desc: 'ตั้งค่าระบบเบื้องต้นของผู้ดูแล',
      items: [{ src:'/static/TA_Admin/หน้าตั้งค่า.jpg', caption:'หน้าตั้งค่า' }]
    },
    {
      title: 'ตั้งค่าผู้ใช้งาน',
      desc: 'แก้ไขข้อมูลผู้ใช้ / ค่าจ้าง / เวลาเข้างาน',
      items: [
        { src:'/static/TA_Admin/ตั้งค่า_1.jpg', caption:'คำสั่ง ตั้งค่าผู้ใช้งาน' },
        { src:'/static/TA_Admin/ตั้งค่า_2.jpg', caption:'หน้าตั้งค่าผู้ใช้งาน' },
        { src:'/static/TA_Admin/ตั้งค่า_3.jpg', caption:'ตั้งค่าข้อมูลผู้ใช้งาน' },
        { src:'/static/TA_Admin/ตั้งค่า_4.jpg', caption:'ตั้งค่าค่าจ้างและเวลาการทำงาน' },
      ]
    },
    {
      title: 'บันทึกการทำงาน',
      desc: 'ดู/ตรวจแก้ IN-OUT รายวัน',
      items: [
        { src:'/static/TA_Admin/บันทึกการทำงาน_1.jpg', caption:'คำสั่ง บันทึกการทำงาน' },
        { src:'/static/TA_Admin/บันทึกการทำงาน_2.jpg', caption:'หน้าบันทึกการทำงาน' },
        { src:'/static/TA_Admin/บันทึกการทำงาน_3.jpg', caption:'รายละเอียดบันทึกการทำงาน' },
      ]
    },
    {
      title: 'ทำเงินเดือน',
      desc: 'เลือกงวด, รันยอด, ปรับรายการ, ทำเครื่องหมายจ่าย',
      items: [
        { src:'/static/TA_Admin/ทำเงินเดือน_1.jpg',   caption:'คำสั่ง ทำเงินเดือน' },
        { src:'/static/TA_Admin/ทำเงินเดือน_1.1.jpg', caption:'ทำเงินเดือน: ส่วนการคำนวณ' },
        { src:'/static/TA_Admin/ทำเงินเดือน_1.2.jpg', caption:'ทำเงินเดือน: กดทำงวดเงินเดือน' },
        { src:'/static/TA_Admin/ทำเงินเดือน_1.3.jpg', caption:'แจ้งเตือนงวดและรายละเอียด' },
        { src:'/static/TA_Admin/แจ้งเตือนทำเงินเดือน.jpg', caption:'แจ้งเตือนทำเงินเดือน' },
        { src:'/static/TA_Admin/ทำเงินเดือน_2.jpg',   caption:'ตั้งค่ากลุ่มงวด เพื่อแจ้งเตือน' },
        { src:'/static/TA_Admin/ทำเงินเดือน_3.jpg',   caption:'ดูรายการงวดเงินเดือนที่ทำ' },
        { src:'/static/TA_Admin/ทำเงินเดือน_3.1.jpg', caption:'จ่ายเงินตามรูปแบบที่ตั้ง' },
      ]
    },
    {
      title: 'รายงาน',
      desc: 'สรุปชั่วโมง/วันทำงาน/ลางาน/รายจ่าย',
      items: [
        { src:'/static/TA_Admin/รายงาน_1.jpg', caption:'คำสั่ง รายงาน' },
        { src:'/static/TA_Admin/รายงาน_2.jpg', caption:'รายงานตามเดือนที่เลือก' },
      ]
    },
    {
      title: 'ช่วยเหลือ Admin',
      desc: 'เมนูช่วยเหลือ / รีเซ็ตเมนู / เมนู admin',
      items: [{ src:'/static/TA_Admin/ช่วยเหลือ_admin.jpg', caption:'ช่วยเหลือ admin' }]
    },
  ];

  // ========= UI =========
  const [tab, setTab] = useState(0);

  return (
    <Stack spacing={2} sx={{ p:{ xs:2, md:3 }, maxWidth:1100, mx:'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <SettingsIcon fontSize="small" />
        <Typography variant="h5">Time Attendance</Typography>
      </Stack>

      {/* ภาพรวมสั้น ๆ */}
      <Paper variant="outlined" sx={{ p:2 }}>
        <Stack spacing={0.75}>
          <Typography variant="subtitle1" fontWeight={700}>ภาพรวมการทำงาน</Typography>
          <Typography variant="body2" color="text.secondary">
            ระบบลงเวลา/ลางาน/สรุปการทำงาน ผูกกับ Google Sheets ของ OA นี้ และสลับ Rich menu แยกสำหรับ <b>Admin</b> กับ <b>User</b>
          </Typography>
        </Stack>
      </Paper>

      <Typography variant="body2" color="text.secondary">
        หน้านี้ตั้งค่าเฉพาะ Google Sheet และ Rich menu ของ OA นี้เท่านั้น (Apps Script URL / Shared Key ตั้งที่ฝั่งเซิร์ฟเวอร์)
      </Typography>

      {/* Enable */}
      <Paper variant="outlined" sx={{ p:2 }}>
        <Stack spacing={1}>
          {!authed && (
            <Alert severity="info">
              คุณยังไม่ได้เข้าสู่ระบบ — ให้พิมพ์ <b>จัดการผู้ใช้งาน</b> ใน LINE แล้วกด “เข้าสู่ระบบ” เพื่อเปิดเว็บด้วย magic link
            </Alert>
          )}
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={onToggleEnabled}
                disabled={loading || !authed || !String(appsSheetId || '').trim() || dirtySheet || !verifiedAt}
              />
            }
            label={enabled ? 'Enabled' : 'Disabled'}
          />
          {!String(appsSheetId || '').trim() && (
            <Typography variant="caption" color="error" display="block">
              กรุณาเพิ่ม Google Sheet ID แล้วกด Save
            </Typography>
          )}
          {dirtySheet && <Typography variant="caption" color="error" display="block">คุณแก้ไข Google Sheet ID แล้ว ยังไม่ได้กด Save</Typography>}
          {!dirtySheet && !!String(appsSheetId || '').trim() && !verifiedAt && (
            <Typography variant="caption" color="warning.main" display="block">
              ใส่ Google Sheet ID แล้ว โปรดกด Verify Connection ให้สำเร็จก่อนเปิดใช้งาน
            </Typography>
          )}
          <SectionHint>เงื่อนไขการเปิดใช้งาน: ต้องเข้าสู่ระบบ, ใส่และกด Save Google Sheet ID แล้ว และ Verify สำเร็จ</SectionHint>
        </Stack>
      </Paper>

      {msg && <Alert severity={msg.type}>{msg.text}</Alert>}

      {/* Webhook */}
      <Paper variant="outlined" sx={{ p:2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <InfoOutlinedIcon fontSize="small" />
          <Typography variant="subtitle1" fontWeight={600}>ตั้งค่า LINE Webhook</Typography>
        </Stack>
        <Typography variant="body2" sx={{ mt:1 }}>ตั้งค่า Webhook URL เป็น:</Typography>
        <Box sx={{ p:1, bgcolor:'#f8f9fa', border:'1px dashed #cfd8dc', borderRadius:1 }}>
          <code>https://lineoa.superhr.biz/webhook/line</code>
        </Box>
        <SectionHint>1) กรอก URL แล้วกด Save  •  2) เปิด Webhook และ Chat  •  3) กลับมาหน้านี้แล้วกด Verify Connection</SectionHint>
      </Paper>

      {/* Google Sheet + Verify */}
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
            <Button variant="outlined" onClick={onVerify} disabled={verifying || loading}>Verify Connection</Button>
            {verifiedAt && <Typography variant="caption" color="text.secondary">{verifiedAt}</Typography>}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => onSave(false)} disabled={saving || loading}>Save</Button>
          </Stack>
        </Stack>
        <Box sx={{ mt:2 }}>
          <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>ตัวอย่างตำแหน่งของ Google Sheet ID</Typography>
          <Box
            component="img"
            src={sheetIdHelp}
            alt="ตัวอย่างตำแหน่ง Google Sheet ID"
            onClick={() => openViewer(sheetIdHelp, 'ตัวอย่างตำแหน่ง Google Sheet ID')}
            sx={{ width:'100%', maxHeight:360, objectFit:'contain', borderRadius:2, border:'1px solid #e0e0e0', cursor:'zoom-in', bgcolor:'#fafafa' }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: .5, display:'block' }}>คลิกที่รูปเพื่อขยายดู</Typography>
          <Typography variant="body2">1) สร้าง Google Sheet เปล่าขึ้นมา 1 อัน และตั้งค่าสิทธิ์เป็น Anyone with the link : editor</Typography>
          <Typography variant="body2">
            2) เปิดสเปรดชีตใน Google Sheets แล้วดูที่ URL เช่น&nbsp;<em>https://docs.google.com/spreadsheets/d/<b>1AbCDef…XYZ</b>/edit#gid=0</em>
          </Typography>
          <Typography variant="body2">3) คัดลอกเฉพาะข้อความระหว่าง <code>/d/</code> กับ <code>/edit</code></Typography>
          <Typography variant="body2">4) วางลงในช่อง “Google Sheet ID” แล้วกด Save</Typography>
          <Typography variant="body2">5) กด Verify เพื่อตรวจการเชื่อมต่อ</Typography>
          <Typography variant="body2" sx={{ mt:1 }}>
            หมายเหตุ : header ของ Sheet ระบบจะตั้งค่าให้เองอัตโนมัติเมื่อใช้งาน
          </Typography>
        </Box>
      </Paper>

      {/* Rich menu สำหรับ OA นี้ */}
      <Paper variant="outlined" sx={{ p:2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <MenuOpenIcon fontSize="small" />
          <Typography variant="subtitle1">Rich menu สำหรับ OA นี้</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          เลือกเมนูสำหรับ <b>Admin</b> และ <b>User</b> — เมื่อกด <b>Enable</b> ระบบจะตั้งค่าให้ OA โดยอัตโนมัติ
        </Typography>

        <Stack direction="row" spacing={2} sx={{ overflowX:'auto', pb:1 }}>
          {/* Admin */}
          <Card variant="outlined" sx={{ minWidth: 320, maxWidth: 360 }}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2" fontWeight="bold">Admin (owner/admin)</Typography>
                  <Tooltip title="เมนูสำหรับผู้ดูแลระบบ / HR / Payroll">
                    <InfoOutlinedIcon fontSize="small" color="action" />
                  </Tooltip>
                </Stack>
                <Box sx={{ border:'1px solid #e0e0e0', borderRadius:1, overflow:'hidden' }}>
                  <Box
                    component="img"
                    src={(menuById(adminRichMenuId)?.imageUrl) || ADMIN_PREVIEW}
                    alt="admin-richmenu"
                    onClick={() => openViewer((menuById(adminRichMenuId)?.imageUrl) || ADMIN_PREVIEW, 'Rich menu: Admin')}
                    sx={{ width:'100%', height:140, objectFit:'cover', display:'block', cursor:'zoom-in' }}
                  />
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button size="small" variant="outlined" onClick={() => openPicker('admin')}>เปลี่ยนเมนู…</Button>
                  <Button size="small" variant="text" onClick={() => startEdit('admin')}>ไปที่หน้าสร้าง/แก้ไข</Button>
                  <Button size="small" variant="text" onClick={() => setAdminRichMenuId('')}>ใช้เมนู default</Button>
                  {adminRichMenuId
                    ? <Chip size="small" label={menuOptionLabel(menuById(adminRichMenuId))} />
                    : <Chip size="small" label="ใช้ preset (Admin)" variant="outlined" />
                  }
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {/* User */}
          <Card variant="outlined" sx={{ minWidth: 320, maxWidth: 360 }}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2" fontWeight="bold">User (พนักงานทั่วไป)</Typography>
                  <Tooltip title="เมนูสำหรับพนักงานที่ลงทะเบียนแล้ว">
                    <InfoOutlinedIcon fontSize="small" color="action" />
                  </Tooltip>
                </Stack>
                <Box sx={{ border:'1px solid #e0e0e0', borderRadius:1, overflow:'hidden' }}>
                  <Box
                    component="img"
                    src={(menuById(userRichMenuId)?.imageUrl) || USER_PREVIEW}
                    alt="user-richmenu"
                    onClick={() => openViewer((menuById(userRichMenuId)?.imageUrl) || USER_PREVIEW, 'Rich menu: User')}
                    sx={{ width:'100%', height:140, objectFit:'cover', display:'block', cursor:'zoom-in' }}
                  />
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button size="small" variant="outlined" onClick={() => openPicker('user')}>เปลี่ยนเมนู…</Button>
                  <Button size="small" variant="text" onClick={() => startEdit('user')}>ไปที่หน้าสร้าง/แก้ไข</Button>
                  <Button size="small" variant="text" onClick={() => setUserRichMenuId('')}>ใช้เมนู default</Button>
                  {userRichMenuId
                    ? <Chip size="small" label={menuOptionLabel(menuById(userRichMenuId))} />
                    : <Chip size="small" label="ใช้ preset (User)" variant="outlined" />
                  }
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => onSave(true)} disabled={saving || loading}>
            {enabled ? 'Save & Apply' : 'Save'}
          </Button>
        </Stack>
      </Paper>

      {/* ================== วิธีใช้งาน & คำสั่งหลัก ================== */}
      <Paper variant="outlined" sx={{ p:2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb:1 }}>
          วิธีใช้งาน & คำสั่งหลัก
        </Typography>

        {/* Tabs: User / Admin */}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb:1 }} variant="scrollable" scrollButtons="auto">
          <Tab label="ผู้ใช้งาน (User)" />
          <Tab label="ผู้ดูแล (Owner/Admin)" />
        </Tabs>

        {/* Tab Panels */}
        {tab === 0 && (
          <Stack spacing={1}>
            {userSections.map((sec, idx) => (
              <Accordion key={idx} disableGutters defaultExpanded={idx === 0}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack>
                    <Typography fontWeight={700}>{sec.title}</Typography>
                    <SectionHint>{sec.desc}</SectionHint>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Gallery
                    items={sec.items}
                    onOpenAll={() => openGallery(sec.title, sec.items)}
                    onOpenSingle={(it) => openViewer(it.src, it.caption)}
                  />
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={1}>
            {adminSections.map((sec, idx) => (
              <Accordion key={idx} disableGutters defaultExpanded={idx < 2}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack>
                    <Typography fontWeight={700}>{sec.title}</Typography>
                    <SectionHint>{sec.desc}</SectionHint>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Gallery
                    items={sec.items}
                    onOpenAll={() => openGallery(sec.title, sec.items)}
                    onOpenSingle={(it) => openViewer(it.src, it.caption)}
                  />
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        )}
      </Paper>

      {/* Lightbox (single image) */}
      <Dialog open={viewer.open} onClose={closeViewer} maxWidth="lg" fullWidth>
        <DialogContent sx={{ p:0, bgcolor:'#000' }}>
          <Box component="img" src={viewer.src} alt={viewer.alt}
               sx={{ width:'100%', display:'block', maxHeight:'80vh', objectFit:'contain' }} />
          <Typography variant="body2" sx={{ p:1.5, color:'#e5e7eb', bgcolor:'#0f172a' }}>
            {viewer.alt || 'รูปภาพ'}
          </Typography>
        </DialogContent>
        <DialogActions><Button onClick={closeViewer}>ปิด</Button></DialogActions>
      </Dialog>

      {/* Gallery Dialog (ดูทั้งหมด) */}
      <Dialog open={gallery.open} onClose={closeGallery} maxWidth="lg" fullWidth>
        <DialogContent sx={{ pt:2 }}>
          <Typography variant="h6" sx={{ mb:2 }}>{gallery.title}</Typography>
          <Grid container spacing={1.5}>
            {gallery.items.map((it, i) => (
              <Grid key={i} item xs={12} sm={6} md={4}>
                <Thumb src={it.src} alt={it.caption} onClick={() => openViewer(it.src, it.caption)} />
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions><Button onClick={closeGallery}>ปิด</Button></DialogActions>
      </Dialog>

      {/* Dialog เลือก Rich menu */}
      <Dialog open={pickerOpen} onClose={closePicker} fullWidth maxWidth="lg">
        <DialogContent dividers>
          <ImageList cols={pickerCols} rowHeight={pickerRowHeight} gap={12}>
            {richMenus.map((m) => {
              const id = m.id || m.menuId;
              const fallback = pickerFor === 'admin' ? ADMIN_PREVIEW : USER_PREVIEW;
              return (
                <ImageListItem key={id} onClick={() => setPickerValue(id)} style={{ cursor:'pointer' }}>
                  <img
                    src={m.imageUrl || fallback}
                    alt={m.title || id}
                    loading="lazy"
                    style={{ width:'100%', height: pickerRowHeight, objectFit:'cover', borderRadius:8, border:'1px solid #e0e0e0' }}
                  />
                  <Typography variant="caption" sx={{ display:'block', mt:.5 }}>
                    {menuOptionLabel(m)}
                  </Typography>
                  {pickerValue === id && <Chip size="small" color="success" label="เลือกแล้ว" sx={{ mt:.5 }} />}
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
