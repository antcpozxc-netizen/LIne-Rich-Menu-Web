// src/pages/TimeAttendanceSettingsPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Paper, Stack, Typography, Switch, FormControlLabel,
  Button, Alert, Divider, TextField, Grid, Box, Chip
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { getAuth } from 'firebase/auth';

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

// แค่ตัวอย่าง preview รูป (ถ้าไม่มีใน /public/static ให้เปลี่ยน path หรือถอดรูปออกได้)
const ADMIN_PREVIEW = '/static/hr_menu_admin.png';
const USER_PREVIEW  = '/static/ta_menu_user.png';

export default function TimeAttendanceSettingsPage() {
  const q = useQuery();
  const tenantId = q.get('tenant') || '';

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // เหลือแค่ 2 ฟิลด์หลัก
  const [enabled, setEnabled] = useState(false);
  const [appsSheetId, setAppsSheetId] = useState('');
  const canEnable = (appsSheetId || '').trim().length > 0;

  const webhookUrl = useMemo(
    () => `${window.location.origin.replace(/\/$/, '')}/webhook/line`,
    []
  );

  // โหลดค่าเดิม
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tenantId) { setMsg({ type:'info', text:'กรุณาเลือก OA (tenant) ก่อน' }); return; }
      setLoading(true); setMsg(null);
      try {
        const h = await authHeader();
        const r = await fetch(`/api/tenants/${tenantId}/integrations/attendance`, { headers: h });
        const j = await safeJson(r);
        if (!alive) return;

        if (r.status === 401 || r.status === 403) {
          setMsg({ type:'info', text:'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
        } else if (j.ok && j.data?.ok) {
          const d = j.data.data || {};
          setEnabled(!!d.enabled);
          setAppsSheetId(d.appsSheetId || '');
        } else {
          setMsg({ type:'warning', text: j.data?.error || j.error || 'โหลดการตั้งค่าไม่สำเร็จ' });
        }
      } catch (e) {
        setMsg({ type:'error', text: String(e) });
      } finally {
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tenantId]);

  // helpers
  const enableAttendance = async (h) => {
    const res = await fetch(`/api/tenants/${tenantId}/integrations/attendance/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify({})
    });
    return safeJson(res);
  };
  const disableAttendance = async (h) => {
    const res = await fetch(`/api/tenants/${tenantId}/integrations/attendance/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify({})
    });
    return safeJson(res);
  };

  // Save (บันทึกเฉพาะ appsSheetId + enabled flag — ค่าอื่นไม่มีแล้ว)
  const saveSettings = async (nextEnabled = enabled) => {
    const h = await authHeader();
    const payload = {
      enabled: nextEnabled,
      appsSheetId: (appsSheetId || '').trim(),
      // เก็บรูป preview ไว้ด้วย เผื่อ server อยากใช้
      adminMenuImageUrl: ADMIN_PREVIEW,
      userMenuImageUrl:  USER_PREVIEW
    };
    const r = await fetch(`/api/tenants/${tenantId}/integrations/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify(payload)
    });
    const j = await safeJson(r);
    if (!r.ok || !j.ok || !j.data?.ok) {
      throw new Error(j.data?.error || j.error || `บันทึกไม่สำเร็จ (HTTP ${r.status})`);
    }
    return { h };
  };

  // Toggle enable/disable
  const onToggleEnabled = async (e) => {
    const next = e.target.checked;
    // ต้องมี Sheet ID ก่อนเท่านั้นถึงจะเปิดได้
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
        setMsg({ type:'success', text:'เปิดใช้งานและตั้งค่า Rich Menu (Default = User) สำเร็จ ✅' });
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
            label="เปิดใช้งานระบบ Time Attendance (จะสร้าง/อัปโหลด Rich Menu ให้โดยอัตโนมัติ)"
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
          <Typography fontWeight={700}>Rich Menu (Preview)</Typography>
          <Divider sx={{ my:1 }} />
          <Stack direction="row" spacing={2} sx={{ mb: 1, flexWrap: 'nowrap', overflowX: 'auto' }}>
            <Box sx={{ minWidth: 260 }}>
              <Typography variant="body2" sx={{ mb:0.5 }}>Admin (owner/admin/payroll)</Typography>
              <Box sx={{ border:'1px solid #e0e0e0', borderRadius:1, overflow:'hidden', width: 240 }}>
                <img src={ADMIN_PREVIEW} alt="Admin rich menu" style={{ width:240, height:162, objectFit:'cover', display:'block' }} />
              </Box>
            </Box>
            <Box sx={{ minWidth: 260 }}>
              <Typography variant="body2" sx={{ mb:0.5 }}>User (พนักงานทั่วไป)</Typography>
              <Box sx={{ border:'1px solid #e0e0e0', borderRadius:1, overflow:'hidden', width: 240 }}>
                <img src={USER_PREVIEW} alt="User rich menu" style={{ width:240, height:162, objectFit:'cover', display:'block' }} />
              </Box>
            </Box>
          </Stack>

          <Divider sx={{ my:2 }} />
          <Typography fontWeight={700}>LINE Webhook</Typography>
          <Typography variant="body2" sx={{ mt:1 }}>ตั้งค่า <b>Webhook URL</b> ใน LINE OA เป็น:</Typography>
          <Box sx={{ p:1, bgcolor:'#f8f9fa', border:'1px dashed #cfd8dc', borderRadius:1, fontFamily:'monospace' }}>
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
