// src/pages/RichMenusListPage.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Container, Tab, Tabs, Paper, Stack,
  Typography, IconButton, Tooltip, Chip
} from '@mui/material';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { Add as AddIcon, OpenInNew as OpenIcon } from '@mui/icons-material';

function periodText(item) {
  const from =
    item?.scheduleFrom?.toDate?.() || (item?.schedule?.from ? new Date(item.schedule.from) : null);
  const to =
    item?.scheduleTo?.toDate?.() || (item?.schedule?.to ? new Date(item.schedule.to) : null);
  const fmt = (d) => (d ? d.toLocaleString() : '-');
  if (from || to) return `${fmt(from)} - ${fmt(to)}`;
  return '—';
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

  // แท็บ "Scheduled/Active" = ready ที่มีช่วงเวลา
  const scheduledActive = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status === 'ready' &&
          (r.scheduleFrom || r.scheduleTo || (r.schedule && (r.schedule.from || r.schedule.to)))
      ),
    [rows]
  );

  // แท็บ "Ready" = ready ที่ไม่มีช่วงเวลา
  const readyList = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status === 'ready' && !(r.scheduleFrom || r.scheduleTo || r.schedule)
      ),
    [rows]
  );

  const data = tab === 'active' ? scheduledActive : readyList;

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
                sx={{ p: 1, borderBottom: '1px solid #eee' }}
              >
                <Box
                  component="img"
                  src={item.imageUrl}
                  alt=""
                  sx={{
                    width: 180,
                    height: 108,
                    objectFit: 'cover',
                    borderRadius: 1,
                    bgcolor: '#fafafa'
                  }}
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

                <Tooltip title="Open">
                  <IconButton
                    onClick={() =>
                      navigate(`/homepage/rich-menus/new?tenant=${tenant}&draft=${item.id}`)
                    }
                  >
                    <OpenIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))
          )}
        </Box>
      </Paper>
    </Container>
  );
}
