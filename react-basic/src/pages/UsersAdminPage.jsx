// src/pages/UsersAdminPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Stack, Button, IconButton, Tooltip,
  Select, MenuItem, TextField, Snackbar, Alert
} from '@mui/material';
import TableSortLabel from '@mui/material/TableSortLabel';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import useMe from '../hooks/useMe';
import { listTasks, exportTasksCsv } from '../api/client';

// --- helpers ---
function parseDeadline(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4] || '00'}:${m[5] || '00'}:00`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
const fmtDT = (d) =>
  !d ? '' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(d);

function cmp(a, b, by) {
  const get = (o, k) => (o?.[k] ?? '');
  if (by === 'deadline') {
    const da = parseDeadline(get(a, 'deadline')), db = parseDeadline(get(b, 'deadline'));
    return (da?.getTime() || 0) - (db?.getTime() || 0);
  }
  if (by === 'updated_date' || by === 'updated_at' || by === 'created_date') {
    const da = new Date(get(a, 'updated_date') || get(a, 'updated_at') || get(a, 'created_date'));
    const db = new Date(get(b, 'updated_date') || get(b, 'updated_at') || get(b, 'created_date'));
    return (da?.getTime() || 0) - (db?.getTime() || 0);
  }
  const A = (get(a, by) || get(a, 'task_' + by) || '').toString();
  const B = (get(b, by) || get(b, 'task_' + by) || '').toString();
  return A.localeCompare(B, 'th');
}

export default function UsersAdminPage() {
  const { data: me } = useMe();
  const myUid = me?.user?.uid || me?.user?.user_id || '';

  const [busy, setBusy] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });

  // filters
  const [status, setStatus] = useState(''); // '', 'pending', 'doing', 'done'
  const [from, setFrom] = useState('');     // yyyy-mm-dd
  const [to, setTo] = useState('');         // yyyy-mm-dd
  const [q, setQ] = useState('');           // client-side search

  // data
  const [rows, setRows] = useState([]);

  // sorting
  const [orderBy, setOrderBy] = useState('updated_date');
  const [order, setOrder] = useState('desc');

  const load = async () => {
    if (!myUid) return;
    setBusy(true);
    try {
      const j = await listTasks({
        assigner_id: myUid,
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setRows(j.tasks || []);
      setRefreshedAt(new Date());
    } catch {
      setSnack({ open: true, msg: 'โหลดรายการไม่สำเร็จ', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [myUid, status, from, to]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter((t) =>
      `${t.task_id} ${t.assignee_name} ${t.task_detail || t.detail} ${t.status}`
        .toLowerCase()
        .includes(ql)
    );
  }, [rows, q]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => (order === 'asc' ? 1 : -1) * cmp(a, b, orderBy));
    return arr;
  }, [filtered, order, orderBy]);

  const onSort = (by) => {
    if (orderBy === by) setOrder(order === 'asc' ? 'desc' : 'asc');
    else { setOrderBy(by); setOrder('asc'); }
  };

  return (
    <Container sx={{ pb: 6 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
          <Typography variant="h5" fontWeight={800}>My assigned tasks</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            {refreshedAt && (
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                อัปเดตล่าสุด {new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(refreshedAt)}
              </Typography>
            )}
            <Tooltip title="Refresh">
              <span><IconButton onClick={load} disabled={busy}><RefreshIcon /></IconButton></span>
            </Tooltip>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() =>
                exportTasksCsv({
                  assigner_id: myUid,
                  status: status || undefined,
                  from: from || undefined,
                  to: to || undefined,
                })
              }
              disabled={!myUid}
            >
              Export CSV
            </Button>
          </Stack>
        </Stack>

        {/* Filters */}
        <Box sx={{ mt: 2, display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, auto) 1fr' }, alignItems: 'center' }}>
          <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="">สถานะ: ทั้งหมด</MenuItem>
            <MenuItem value="pending">pending</MenuItem>
            <MenuItem value="doing">doing</MenuItem>
            <MenuItem value="done">done</MenuItem>
          </Select>
          <TextField
            size="small" type="date" label="จากวันที่" InputLabelProps={{ shrink: true }}
            value={from} onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            size="small" type="date" label="ถึงวันที่" InputLabelProps={{ shrink: true }}
            value={to} onChange={(e) => setTo(e.target.value)}
          />
          <TextField
            size="small" placeholder="ค้นหา (task / ผู้รับงาน / รายละเอียด)"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
        <TableContainer sx={{ maxHeight: { xs: 460, md: 560 } }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {[
                  ['task_id', 'task_id', { nowrap: true }],
                  ['assignee_name', 'assignee_name', {}],
                  ['detail', 'detail', {}],
                  ['status', 'status', { nowrap: true }],
                  ['deadline', 'deadline', { nowrap: true }],
                  ['updated_date', 'updated_date', { hideSm: true, nowrap: true }],
                ].map(([label, key, opt]) => (
                  <TableCell
                    key={key}
                    sx={{
                      whiteSpace: opt?.nowrap ? 'nowrap' : 'normal',
                      display: opt?.hideSm ? { xs: 'none', md: 'table-cell' } : 'table-cell'
                    }}
                    sortDirection={orderBy === key ? order : false}
                  >
                    <TableSortLabel
                      active={orderBy === key}
                      direction={orderBy === key ? order : 'asc'}
                      onClick={() => onSort(key)}
                    >
                      {label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((t) => (
                <TableRow key={t.task_id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{t.task_id}</TableCell>
                  <TableCell>{t.assignee_name}</TableCell>
                  <TableCell>{t.task_detail || t.detail || ''}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{t.status}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {fmtDT(parseDeadline(t.deadline))}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {fmtDT(new Date(t.updated_date || t.updated_at || t.created_date))}
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    ไม่มีรายการ
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Snackbar open={snack.open} autoHideDuration={2000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert severity={snack.sev} sx={{ width: '100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Container>
  );
}
