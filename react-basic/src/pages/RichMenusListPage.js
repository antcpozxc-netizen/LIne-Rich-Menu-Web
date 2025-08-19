// src/pages/RichMenusListPage.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Container, Tab, Tabs, Paper, Stack,
  Typography, IconButton, Tooltip, Chip
} from '@mui/material';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Add as AddIcon, OpenInNew as OpenIcon, Delete as DeleteIcon } from '@mui/icons-material';

function periodText(item) {
  const from =
    item?.scheduleFrom?.toDate?.() || (item?.schedule?.from ? new Date(item.schedule.from) : null);
  const to =
    item?.scheduleTo?.toDate?.() || (item?.schedule?.to ? new Date(item.schedule.to) : null);
  const fmt = (d) => (d ? d.toLocaleString() : '-');
  if (from || to) return `${fmt(from)} - ${fmt(to)}`;
  return '—';
}

async function authHeader() {
  if (!auth.currentUser) throw new Error('ยังไม่พบผู้ใช้ที่ล็อกอิน');
  const idToken = await auth.currentUser.getIdToken();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` };
}

export default function RichMenusListPage() {
  const { tenantId } = useOutletContext() || {};
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const tenant = sp.get('tenant') || '';

  const [tab, setTab] = useState('active');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!tenantId) return;
    const col = collection(db, 'tenants', tenantId, 'richmenus');
    const q = query(col, orderBy('createdAt', 'desc'));
    const off = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRows(arr);
    });
    return () => off();
  }, [tenantId]);

  const scheduledActive = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status === 'ready' &&
          (r.scheduleFrom || r.scheduleTo || (r.schedule && (r.schedule.from || r.schedule.to)))
      ),
    [rows]
  );

  const readyList = useMemo(
    () => rows.filter((r) => r.status === 'ready' && !(r.scheduleFrom || r.scheduleTo || r.schedule)),
    [rows]
  );

  const data = tab === 'active' ? scheduledActive : readyList;

  async function deleteMenu(docId) {
    try {
      if (!tenantId) return alert('กรุณาเลือก OA ก่อน');
      if (!window.confirm('ลบ rich menu นี้หรือไม่?')) return;
      const headers = await authHeader();
      const r = await fetch(`/api/tenants/${tenantId}/richmenus/${docId}`, { method: 'DELETE', headers });
      if (!r.ok) {
        const t = await r.text();
        alert('ลบไม่สำเร็จ: ' + (t || r.status));
      }
    } catch (e) {
      alert('ลบไม่สำเร็จ: ' + (e?.message || e));
    }
  }

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4" fontWeight="bold">Rich menus</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate(`/homepage/rich-menus/new?tenant=${tenant}`)}
        >
          Create new
        </Button>
      </Stack>

      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1 }}>
          <Tab value="active" label="Scheduled/Active" />
          <Tab value="ready" label="Ready" />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {data.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Typography>No menus shown.</Typography>
            </Box>
          ) : (
            data.map((item) => (
              <Stack
                key={item.id}
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ p: 1, borderBottom: '1px solid #eee', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                onClick={() => navigate(`/homepage/rich-menus/new?tenant=${tenant}&draft=${item.id}`)}
              >
                <Box
                  component="img"
                  src={item.imageUrl}
                  alt=""
                  sx={{ width: 180, height: 108, objectFit: 'cover', borderRadius: 1, bgcolor: '#fafafa' }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" noWrap fontWeight="bold">
                    {item.title || '(Untitled)'}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label={item.size || 'large'} />
                    <Typography variant="body2" color="text.secondary">
                      Display period: {periodText(item)}
                    </Typography>
                  </Stack>
                </Box>

                {/* ปุ่มด้านขวา: เปิด/ลบ (กดแล้วไม่ให้ทริกเกอร์ onClick แถว) */}
                <Stack direction="row" spacing={1} onClick={(e) => e.stopPropagation()}>
                  <Tooltip title="Open">
                    <IconButton onClick={() => navigate(`/homepage/rich-menus/new?tenant=${tenant}&draft=${item.id}`)}>
                      <OpenIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton color="error" onClick={() => deleteMenu(item.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            ))
          )}
        </Box>
      </Paper>
    </Container>
  );
}
