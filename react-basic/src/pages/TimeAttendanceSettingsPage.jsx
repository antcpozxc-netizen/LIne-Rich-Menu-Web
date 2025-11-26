// src/pages/TimeAttendanceSettingsPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Paper, Stack, Typography, Switch, FormControlLabel,
  Button, Alert, Divider, TextField, Grid, Box, Chip,
  Card, CardContent, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  ImageList, ImageListItem,
  useMediaQuery, useTheme,
} from '@mui/material';

import SettingsIcon from '@mui/icons-material/Settings';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { getAuth } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

function useQuery() { return new URLSearchParams(window.location.search); }

async function authHeader() {
  const u = getAuth().currentUser;
  const t = u ? await u.getIdToken() : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function safeJson(res) {
  const txt = await res.text();
  try { return { ok: true, data: JSON.parse(txt) }; }
  catch (e) { return { ok: false, error: txt || String(e) }; }
}

// preview ดีฟอลต์
const ADMIN_PREVIEW = '/static/hr_menu_admin.png';
const USER_PREVIEW  = '/static/ta_menu_user.png';

export default function TimeAttendanceSettingsPage() {
  const q = useQuery();
  const tenantId = q.get('tenant') || '';
  const navigate = useNavigate();

  const theme = useTheme();
  const mdUp  = useMediaQuery(theme.breakpoints.up('md'));
  const lgUp  = useMediaQuery(theme.breakpoints.up('lg'));
  const xlUp  = useMediaQuery(theme.breakpoints.up('xl'));
  const pickerCols      = xlUp ? 6 : lgUp ? 5 : mdUp ? 4 : 2;
  const pickerRowHeight = mdUp ? 180 : 140;

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // ฟิลด์หลัก
  const [enabled, setEnabled] = useState(false);
  const [appsSheetId, setAppsSheetId] = useState('');
  const canEnable = (appsSheetId || '').trim().length > 0;

  // รายการ Rich menu ของ OA นี้
  const [richMenus, setRichMenus] = useState([]);

  // id/doc ของเมนูที่เลือก
  const [adminRichMenuDoc, setAdminRichMenuDoc] = useState('');
  const [userRichMenuDoc, setUserRichMenuDoc]   = useState('');

  const [pickerOpen, setPickerOpen]   = useState(false);
  const [pickerFor, setPickerFor]     = useState(null); // 'admin' | 'user'
  const [pickerValue, setPickerValue] = useState('');

  const webhookUrl = useMemo(
    () => `${window.location.origin.replace(/\/$/, '')}/webhook/line`,
    []
  );

  // path สำหรับ redirect กลับจากหน้า RichMenusPage
  const redirectPath   = tenantId
    ? `/homepage/settings/attendance?tenant=${encodeURIComponent(tenantId)}`
    : '/homepage/settings/attendance';

  // ===== โหลด config + รายการ Rich menu =====
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tenantId) { setMsg({ type: 'info', text: 'กรุณาเลือก OA (tenant) ก่อน' }); return; }
      setLoading(true); setMsg(null);
      try {
        const h = await authHeader();

        // 1) config attendance
        const r1 = await fetch(`/api/tenants/${tenantId}/integrations/attendance`, { headers: h });
        const j1 = await safeJson(r1);
        if (!alive) return;

        if (r1.status === 401 || r1.status === 403) {
          setMsg({ type: 'info', text: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
        } else if (j1.ok && j1.data?.ok) {
          const d = j1.data.data || {};
          setEnabled(!!d.enabled);
          setAppsSheetId(d.appsSheetId || '');

          // รองรับหลายชื่อฟิลด์ (Id/Doc)
          const adminId = d.adminRichMenuDoc || d.adminRichMenuId || d.adminRichMenu || '';
          const userId  = d.userRichMenuDoc  || d.userRichMenuId  || d.userRichMenu  || '';
          setAdminRichMenuDoc(adminId);
          setUserRichMenuDoc(userId);
        } else {
          setMsg({ type: 'warning', text: j1.data?.error || j1.error || 'โหลดการตั้งค่าไม่สำเร็จ' });
        }

        // 2) รายการเมนู (ready → fallback all)
        const r2 = await fetch(`/api/tenants/${tenantId}/richmenus?status=ready`, { headers: h });
        const j2 = await safeJson(r2);
        if (!r2.ok || j2.ok === false) {
          const rAll = await fetch(`/api/tenants/${tenantId}/richmenus`, { headers: h });
          const jAll = await safeJson(rAll);
          setRichMenus(Array.isArray(jAll?.data) ? jAll.data : []);
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
  }, [tenantId]);

  // ===== Auto-refresh รายการเมนูเมื่อกลับโฟกัสแท็บ (หลัง Save draft แล้ว redirect กลับมา) =====
  useEffect(() => {
    if (!tenantId) return;
    const onFocus = () => {
      (async () => {
        try {
          const h = await authHeader();
          const r2 = await fetch(`/api/tenants/${tenantId}/richmenus?status=ready`, { headers: h });
          const j2 = await safeJson(r2);
          if (!r2.ok || j2.ok === false) {
            const rAll = await fetch(`/api/tenants/${tenantId}/richmenus`, { headers: h });
            const jAll = await safeJson(rAll);
            setRichMenus(Array.isArray(jAll?.data) ? jAll.data : []);
          } else {
            setRichMenus(Array.isArray(j2.data) ? j2.data : []);
          }
        } catch {}
      })();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [tenantId]);

  // ===== helpers =====
  const enableAttendance = async (h) => {
    const res = await fetch(`/api/tenants/${tenantId}/integrations/attendance/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify({}),
    });
    return safeJson(res);
  };
  const disableAttendance = async (h) => {
    const res = await fetch(`/api/tenants/${tenantId}/integrations/attendance/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify({}),
    });
    return safeJson(res);
  };

  // ===== Save settings (รองรับชื่อฟิลด์ได้ทั้ง Doc/Id) =====
  const saveSettings = async (nextEnabled = enabled) => {
    const h = await authHeader();
    const payload = {
      enabled: nextEnabled,
      appsSheetId: (appsSheetId || '').trim(),

      // ส่งทั้งสองแบบ เพื่อความเข้ากันได้กับ backend
      adminRichMenuDoc: adminRichMenuDoc || '',
      userRichMenuDoc:  userRichMenuDoc  || '',
      adminRichMenuId:  adminRichMenuDoc || '',
      userRichMenuId:   userRichMenuDoc  || '',

      // เผื่อ backend อยากใช้รูป preview
      adminMenuImageUrl: ADMIN_PREVIEW,
      userMenuImageUrl:  USER_PREVIEW,
    };
    const r = await fetch(`/api/tenants/${tenantId}/integrations/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify(payload),
    });
    const j = await safeJson(r);
    if (!r.ok || !j.ok) {
      throw new Error(j.data?.error || j.error || `บันทึกไม่สำเร็จ (HTTP ${r.status})`);
    }
    return { h };
  };

  // Toggle enable/disable
  const onToggleEnabled = async (e) => {
    const next = e.target.checked;
    if (next && !canEnable) {
      setMsg({ type:'warning', text:'กรุณาใส่ Google Sheet ID ก่อนเปิดใช้งาน' });
      setEnabled(false);
      return;
    }
    setEnabled(next);
    setLoading(true); setMsg(null);
    try {
      const { h } = await saveSettings(next);
      if (next) {
        const en = await enableAttendance(h);
        if (!(en.ok && en.data?.ok)) throw new Error(en.data?.error || en.error || 'Enable Attendance ไม่สำเร็จ');
        setMsg({ type:'success', text:'เปิดใช้งานและตั้งค่า Rich Menu สำเร็จ ✅' });
      } else {
        const di = await disableAttendance(h);
        if (!(di.ok && di.data?.ok)) throw new Error(di.data?.error || di.error || 'Disable Attendance ไม่สำเร็จ');
        setMsg({ type:'success', text:'ปิดใช้งานและล้าง Rich Menu ของ OA แล้ว ✅' });
      }
    } catch (err) {
      setEnabled(!next); // rollback
      setMsg({ type:'error', text:String(err?.message || err) });
    } finally {
      setLoading(false);
    }
  };

  // Save only
  const onSaveOnly = async () => {
    if (!tenantId) return;
    setLoading(true); setMsg(null);
    try {
      await saveSettings(enabled);
      if (enabled) {
        // re-apply rich menu ให้ชัวร์
        const h = await authHeader();
        const en = await enableAttendance(h);
        if (!(en.ok && en.data?.ok)) {
          setMsg({ type:'warning', text:'บันทึกแล้ว แต่ซิงก์ Rich Menu ไม่สำเร็จ' });
          return;
        }
      }
      setMsg({ type:'success', text:'บันทึกแล้ว ✅' });
    } catch (err) {
      setMsg({ type:'error', text:String(err?.message || err) });
    } finally {
      setLoading(false);
    }
  };

  const menuById = (id) =>
    richMenus.find(m => (m.id || m.menuId) === id) || null;

  const menuOptionLabel = (id, fallback = 'ใช้เมนู default ที่ระบบสร้างให้') => {
    const m = menuById(id);
    if (!m) return fallback;
    const bits = [];
    bits.push(m.title || m.name || '(no title)');
    if (m.kind) bits.push(m.kind);
    if (m.size) bits.push(m.size);
    return bits.join(' • ');
  };

  const openPicker = (kind) => {
    setPickerFor(kind);
    setPickerValue(kind === 'admin' ? (adminRichMenuDoc || '') : (userRichMenuDoc || ''));
    setPickerOpen(true);
  };
  const closePicker = () => {
    setPickerOpen(false);
    setPickerFor(null);
    setPickerValue('');
  };
  const handlePickerApply = () => {
    if (!pickerFor || !pickerValue) return closePicker();
    if (pickerFor === 'admin') setAdminRichMenuDoc(pickerValue);
    if (pickerFor === 'user')  setUserRichMenuDoc(pickerValue);
    closePicker();
  };

  // เปิดหน้า RichMenusPage แบบ attendance (admin/user)
  const startEdit = async (which /* 'admin' | 'user' */) => {
    if (!tenantId) return;

    const pref = which === 'admin' ? 'ta_admin' : 'ta_user';
    const back = encodeURIComponent(redirectPath);
    const base = `/homepage/rich-menus/new?tenant=${tenantId}&app=attendance&prefill=${pref}&redirect=${back}`;

    try {
      const h = await authHeader();
      const docId = which === 'admin' ? (adminRichMenuDoc || null) : (userRichMenuDoc || null);

      const res = await fetch(`/api/tenants/${tenantId}/richmenus/start-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ docId, kind: which, app: 'attendance' }),
      });

      let j = null; try { j = await res.json(); } catch {}
      const realId = j?.draftId || j?.id || j?.docId || j?.data?.id || j?.data?.docId;
      const guest  = j?.guestDraft;

      if (realId)      navigate(`${base}&draft=${encodeURIComponent(realId)}`, { replace: false });
      else if (guest)  navigate(`${base}&guestDraft=${encodeURIComponent(guest)}`, { replace: false });
      else             navigate(base, { replace: false });
    } catch {
      navigate(base, { replace: false });
    }
  };

  return (
    <Paper sx={{ p:3, my:3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb:2 }}>
        <SettingsIcon />
        <Typography variant="h6" fontWeight={700}>Time Attendance — Settings</Typography>
        <Chip label={tenantId ? `Tenant: ${tenantId}` : 'No tenant'} size="small" />
      </Stack>

      {msg && <Alert severity={msg.type} sx={{ mb:2 }}>{msg.text}</Alert>}

      <Grid container spacing={2}>
        {/* Left */}
        <Grid item xs={12} md={6}>
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={onToggleEnabled}
                disabled={loading || !canEnable}
              />
            }
            label="เปิดใช้งานระบบ Time Attendance"
          />
          <Divider sx={{ my:2 }} />

          <Typography fontWeight={700} sx={{ mb:1 }}>Google Sheet</Typography>
          <TextField
            label="Google Sheet ID (employees / time_entries)"
            placeholder="1A2B3C... (ถ้าเว้นว่างจะอ้างอิงค่าใน Apps Script)"
            fullWidth
            value={appsSheetId}
            onChange={e=>setAppsSheetId(e.target.value)}
          />

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt:2 }}>
            <InfoOutlinedIcon fontSize="small" />
            <Typography variant="body2" color="text.secondary">
              สามารถแยกชีตพนักงาน/เวลาเป็นคนละชีตได้ โดยส่งค่าใน Apps Script เหมือนกับ Task Bot
            </Typography>
          </Stack>

          <Button variant="contained" sx={{ mt:3 }} onClick={onSaveOnly} disabled={loading}>
            {loading ? 'Saving…' : 'Save Settings'}
          </Button>
        </Grid>

        {/* Right */}
        <Grid item xs={12} md={6}>
          {/* Rich menu สำหรับ OA นี้ */}
          <Paper variant="outlined" sx={{ p:2, mb:2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <MenuOpenIcon fontSize="small" />
              <Typography variant="subtitle1" fontWeight={600}>
                Rich menu สำหรับ OA นี้
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              เลือกเมนูสำหรับ <b>Admin</b> และ <b>User</b> ของ Time Attendance —
              เมื่อกด <b>Enable</b> ระบบจะตั้งค่าให้ OA นี้โดยอัตโนมัติ
            </Typography>

            <Stack direction="row" spacing={2} sx={{ overflowX:'auto', pb:1 }}>
              {/* Admin card */}
              <Card variant="outlined" sx={{ minWidth: 320, maxWidth: 360 }}>
                <CardContent>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2" fontWeight="bold">
                        Admin (owner/admin/payroll)
                      </Typography>
                      <Tooltip title="เมนูสำหรับผู้ดูแลระบบ / HR / Payroll">
                        <InfoOutlinedIcon fontSize="small" color="action" />
                      </Tooltip>
                    </Stack>

                    <Box sx={{ border:'1px solid #e0e0e0', borderRadius:1, overflow:'hidden' }}>
                      <img
                        src={(menuById(adminRichMenuDoc)?.imageUrl) || ADMIN_PREVIEW}
                        alt="admin-richmenu"
                        style={{ width:'100%', display:'block', height:140, objectFit:'cover' }}
                      />
                    </Box>

                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Button size="small" variant="outlined" onClick={() => openPicker('admin')}>
                        เปลี่ยนเมนู…
                      </Button>
                      <Button size="small" variant="text" onClick={() => startEdit('admin')}>
                        ไปที่หน้าสร้าง/แก้ไข
                      </Button>
                      {adminRichMenuDoc
                        ? <Chip size="small" label={menuOptionLabel(adminRichMenuDoc, 'ใช้เมนู default (Admin)')} />
                        : <Chip size="small" label="ใช้เมนู default (Admin)" variant="outlined" />
                      }
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              {/* User card */}
              <Card variant="outlined" sx={{ minWidth: 320, maxWidth: 360 }}>
                <CardContent>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2" fontWeight="bold">
                        User (พนักงานทั่วไป)
                      </Typography>
                      <Tooltip title="เมนูสำหรับพนักงานที่ลงทะเบียนแล้ว">
                        <InfoOutlinedIcon fontSize="small" color="action" />
                      </Tooltip>
                    </Stack>

                    <Box sx={{ border:'1px solid #e0e0e0', borderRadius:1, overflow:'hidden' }}>
                      <img
                        src={(menuById(userRichMenuDoc)?.imageUrl) || USER_PREVIEW}
                        alt="user-richmenu"
                        style={{ width:'100%', display:'block', height:140, objectFit:'cover' }}
                      />
                    </Box>

                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Button size="small" variant="outlined" onClick={() => openPicker('user')}>
                        เปลี่ยนเมนู…
                      </Button>
                      <Button size="small" variant="text" onClick={() => startEdit('user')}>
                        ไปที่หน้าสร้าง/แก้ไข
                      </Button>
                      {userRichMenuDoc
                        ? <Chip size="small" label={menuOptionLabel(userRichMenuDoc, 'ใช้เมนู default (User)')} />
                        : <Chip size="small" label="ใช้เมนู default (User)" variant="outlined" />
                      }
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>

            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              หมายเหตุ: ถ้าไม่เลือกอะไร ระบบจะใช้เมนู default ที่ Time Attendance สร้างให้
            </Typography>
          </Paper>

          {/* Dialog เลือก Rich menu */}
          <Dialog open={pickerOpen} onClose={closePicker} fullWidth maxWidth="lg">
            <DialogTitle>
              เลือกเมนูสำหรับ {pickerFor === 'admin' ? 'Admin' : pickerFor === 'user' ? 'User' : ''}
            </DialogTitle>
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
                        style={{
                          width:'100%',
                          height: pickerRowHeight,
                          objectFit:'cover',
                          borderRadius:8,
                          border:'1px solid #e0e0e0',
                        }}
                      />
                      <Typography variant="caption" sx={{ display:'block', mt: .5 }}>
                        {menuOptionLabel(id, '')}
                      </Typography>
                      {pickerValue === id && (
                        <Chip size="small" color="success" label="เลือกแล้ว" sx={{ mt:.5 }} />
                      )}
                    </ImageListItem>
                  );
                })}
                {!richMenus.length && (
                  <Typography variant="body2" color="text.secondary">
                    ยังไม่มี Rich menu ใน OA นี้ — ไปสร้างจากปุ่ม “ไปที่หน้าสร้าง/แก้ไข”
                  </Typography>
                )}
              </ImageList>
            </DialogContent>
            <DialogActions>
              <Button onClick={closePicker}>ยกเลิก</Button>
              <Button onClick={handlePickerApply} disabled={!pickerValue} variant="contained">
                ใช้เมนูนี้
              </Button>
            </DialogActions>
          </Dialog>

          <Divider sx={{ my:2 }} />

          {/* LINE Webhook */}
          <Typography fontWeight={700}>LINE Webhook</Typography>
          <Typography variant="body2" sx={{ mt:1 }}>
            ตั้งค่า <b>Webhook URL</b> ใน LINE OA เป็น:
          </Typography>
          <Box
            sx={{
              p:1,
              bgcolor:'#f8f9fa',
              border:'1px dashed #cfd8dc',
              borderRadius:1,
              fontFamily:'monospace'
            }}
          >
            {webhookUrl}
          </Box>
          <Typography variant="body2" sx={{ mt:1 }} color="text.secondary">
            เปิด <i>Messaging API → Webhook URL</i> แล้วกด <b>Save</b> จากนั้นเปิด <i>Use webhook</i>
          </Typography>
        </Grid>
      </Grid>
    </Paper>
  );
}
