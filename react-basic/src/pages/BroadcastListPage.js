// src/pages/BroadcastListPage.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Container, Grid, IconButton, Tab, Tabs, TextField,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Stack, Pagination, CircularProgress
} from '@mui/material';
import { Search as SearchIcon, SwapVert as SortIcon } from '@mui/icons-material';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';

import {
  getFirestore, collection, query, where, orderBy, limit, getDocs,
  startAfter, doc, getDoc
} from 'firebase/firestore';

const TAB_LABELS = ['Scheduled', 'Drafts', 'Sent', 'Failed'];
const STATUS_MAP = {
  Scheduled: 'scheduled',
  Drafts: 'draft',
  Sent: 'sent',
  Failed: 'failed',
};
const rowsPerPage = 10;

function fmt(ts) {
  if (!ts) return '-';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return '-';
  }
}

// สร้างข้อความ preview สั้นๆ จาก messages[] ที่มาจาก BroadcastPage.js
function previewMessage(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '-';
  const t = messages.find(m => m?.type === 'text')?.text || '';
  return t || '(messages)';
}

export default function BroadcastListPage() {
  const navigate = useNavigate();
  const { tenantId: outletTenantId } = useOutletContext() || {};
  const [searchParams] = useSearchParams();
  const tenantFromUrl = searchParams.get('tenant') || '';
  const tenantId = tenantFromUrl || outletTenantId || '';

  // ถ้าไม่มี tenant → ไม่ดึงข้อมูล แต่ยังเข้าหน้าได้ (โหมด guest/ยังไม่เลือก OA)
  useEffect(() => {
    // no-op (ให้ effect ด้านล่างเป็นคนตัดสินใจว่าจะยิง query หรือไม่)
  }, [tenantId]);

  // UI state
  const [tab, setTab] = useState(0);
  const [qId, setQId] = useState('');
  const [qDate, setQDate] = useState('');
  const [qTime, setQTime] = useState('');
  const [orderByKey, setOrderByKey] = useState('updated'); // 'time' | 'updated'
  const [order, setOrder] = useState('desc'); // 'asc' | 'desc'
  const [page, setPage] = useState(1);

  // Data state
  const [rows, setRows] = useState([]);
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageCursors, setPageCursors] = useState([]); // last doc snapshot ของแต่ละหน้า
  const [hasMore, setHasMore] = useState(true);

  const db = getFirestore();
  const orderField = orderByKey === 'time' ? 'scheduledAt' : 'updatedAt';
  const orderDir = order === 'asc' ? 'asc' : 'desc';

  // รีเซ็ตเมื่อเปลี่ยน criteria
  useEffect(() => {
    setRows([]);
    setPage(1);
    setPageCursors([]);
    setHasMore(true);
    setErrMsg('');
  }, [tab, qId, qDate, qTime, orderByKey, order, tenantId]);

  useEffect(() => {
    if (!tenantId) {
      // ไม่มี OA ก็เคลียร์ตาราง/หยุดโหลด เงียบ ๆ
      setRows([]);
      setHasMore(false);
      setLoading(false);
      setErrMsg('');
      return;
    }
    const run = async () => {
      setLoading(true);
      try {
        console.log('[BroadcastList] tenantId =', tenantId);
        const statusValue = STATUS_MAP[TAB_LABELS[tab]];
        const colRef = collection(db, 'tenants', tenantId, 'broadcasts');

        // ค้นหาแบบระบุ id
        if (qId.trim()) {
          // 1) ลอง docId ตรงๆ
          const dref = doc(db, 'tenants', tenantId, 'broadcasts', qId.trim());
          const dsnap = await getDoc(dref);
          if (dsnap.exists()) {
            const d = dsnap.data();
            if (d.status === statusValue) {
              setRows([{
                id: dsnap.id,
                message: previewMessage(d.messages),
                target: d.targetSummary || '-',
                scheduledAt: d.scheduledAt || null,
                updatedAt: d.updatedAt || null,
              }]);
            } else {
              setRows([]);
            }
            setHasMore(false);
            setLoading(false);
            return;
          }
          // 2) ไม่เจอ docId: ค้น field `id` เท่ากับ qId
          const qy = query(
            colRef,
            where('status', '==', statusValue),
            where('id', '==', qId.trim()),
            orderBy(orderField, orderDir),
            limit(rowsPerPage)
          );
          const snap = await getDocs(qy);
          const list = snap.docs.map(s => {
            const d = s.data();
            return {
              id: s.id,
              message: previewMessage(d.messages),
              target: d.targetSummary || '-',
              scheduledAt: d.scheduledAt || null,
              updatedAt: d.updatedAt || null,
            };
          });
          setRows(list);
          setHasMore(false);
          setLoading(false);
          return;
        }

        // กรองช่วงเวลาจาก date/time (กับ scheduledAt เท่านั้น)
        const cons = [where('status', '==', statusValue)];
        let effectiveOrderField = orderField;
        let effectiveOrderDir = orderDir;

        if (qDate) {
          const startBase = new Date(qDate + 'T00:00:00');
          let start = startBase;
          let end = new Date(startBase);
          end.setDate(end.getDate() + 1);

          if (qTime) {
            const [hh, mm] = qTime.split(':').map(Number);
            start = new Date(qDate);
            start.setHours(hh || 0, mm || 0, 0, 0);
            end = new Date(start);
            end.setMinutes(end.getMinutes() + 1);
          }
          // ต้อง orderBy field เดียวกับที่ทำ range
          cons.push(where('scheduledAt', '>=', start));
          cons.push(where('scheduledAt', '<', end));
          effectiveOrderField = 'scheduledAt';
          // รักษาทิศเดิม
        }

        // สร้าง query base + order + limit
        let base = query(
          colRef,
          ...cons,
          orderBy(effectiveOrderField, effectiveOrderDir),
          limit(rowsPerPage)
        );

        // ทำ pagination ถึงหน้าที่ต้องการ (ค่อยๆ ไล่เพื่อเก็บ cursor)
        let localRows = [];
        let localCursors = [];
        let last = null;

        // ใช้ cursor ที่มีแล้ว ถ้ายังไม่ถึงหน้าที่ร้องขอค่อยยิงเพิ่ม
        const needPage = Math.max(1, page);
        let loadedPages = 0;

        // ถ้าข้ามหน้าแรก ให้ไล่ยิงเก็บ cursor ทีละหน้า
        while (loadedPages < needPage) {
          let qRun = base;
          if (last) qRun = query(base, startAfter(last));
          const snap = await getDocs(qRun);

          const list = snap.docs.map(s => {
            const d = s.data();
            return {
              id: s.id,
              message: previewMessage(d.messages),
              target: d.targetSummary || '-',
              scheduledAt: d.scheduledAt || null,
              updatedAt: d.updatedAt || null,
            };
          });

          if (loadedPages + 1 === needPage) {
            localRows = list;
          }
          last = snap.docs[snap.docs.length - 1] || null;
          if (last) localCursors.push(last);
          if (list.length < rowsPerPage) {
            // หมดหน้าแล้ว
            setHasMore(false);
            // ถ้าผู้ใช้กดไปหน้าว่าง ให้ดึงกลับหน้าสุดท้ายที่มี
            if (list.length === 0 && page > 1) {
              setPage(Math.max(1, loadedPages)); // กลับหน้าก่อนหน้า
            }
            break;
          }
          loadedPages += 1;
        }

        setRows(localRows);
        setPageCursors(localCursors);
      } catch (e) {
        console.error(e);
        console.error('[BroadcastList] query error:', e);
        // failed-precondition มักเป็น index ไม่ครบ
        if (e?.code === 'failed-precondition') {
          setErrMsg('ขาด Firestore composite index สำหรับ (status + ' +
            (orderByKey === 'time' ? 'scheduledAt' : 'updatedAt') +
            '). เข้า Firestore Console แล้วสร้าง index ตามลิงก์ที่ error แนะนำ หรือสร้างคู่ต่อไปนี้: ' +
            '[status ASC, updatedAt DESC] และ [status ASC, scheduledAt DESC]');
        } else if (e?.code === 'permission-denied') {
          setErrMsg('ไม่ได้รับสิทธิ์อ่านคอลเลกชันนี้ (permission-denied). ตรวจ rules ให้สมาชิก tenant อ่านได้');
        } else {
          setErrMsg(String(e?.message || e));
        }
        setRows([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [tenantId, tab, qId, qDate, qTime, orderByKey, order, page, db]);

  const totalPages = useMemo(() => (hasMore ? page + 1 : Math.max(1, page)), [hasMore, page]);

  const toggleSort = (key) => {
    if (key === 'time') {
      if (orderByKey !== 'time') {
        setOrderByKey('time'); setOrder('desc'); return;
      }
    } else {
      if (orderByKey !== 'updated') {
        setOrderByKey('updated'); setOrder('desc'); return;
      }
    }
    setOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const currentTabLabel = TAB_LABELS[tab];

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="h4" fontWeight="bold">Broadcast</Typography>
        <Button
          variant="contained"
          sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
          onClick={() => navigate(`/homepage/broadcast/new?tenant=${tenantId}`)}

        >
          + New broadcast
        </Button>
      </Stack>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => { setTab(v); setPage(1); }}
        sx={{ mb: 2 }}
      >
        {TAB_LABELS.map(label => <Tab key={label} label={label} />)}
      </Tabs>

      {/* Filters */}
      <Grid container spacing={1} justifyContent="flex-end" alignItems="center" sx={{ mb: 1 }}>
        <Grid item xs={12} sm="auto">
          <TextField size="small" placeholder="id" value={qId} onChange={e=>setQId(e.target.value)} />
        </Grid>
        <Grid item xs={12} sm="auto">
          <TextField size="small" type="date" value={qDate} onChange={e=>setQDate(e.target.value)} />
        </Grid>
        <Grid item xs={12} sm="auto">
          <TextField size="small" type="time" value={qTime} onChange={e=>setQTime(e.target.value)} />
        </Grid>
        <Grid item xs={12} sm="auto">
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
            onClick={() => setPage(1)}
          >
            Search
          </Button>
        </Grid>
      </Grid>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#eeeeee' }}>
              <TableCell sx={{ width: 160 }}>ID</TableCell>
              <TableCell>Message</TableCell>
              <TableCell sx={{ width: 220 }}>Target</TableCell>
              <TableCell sx={{ width: 210 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  Broadcast time
                  <IconButton size="small" onClick={() => toggleSort('time')}>
                    <SortIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
              <TableCell sx={{ width: 180 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  Updated on
                  <IconButton size="small" onClick={() => toggleSort('updated')}>
                    <SortIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
                    <CircularProgress size={20} />
                    <span>Loading…</span>
                  </Stack>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  {tenantId
                    ? (errMsg ? <span style={{color:'#d32f2f'}}>{errMsg}</span> : 'No data')
                    : 'เลือก OA เพื่อดูรายการ broadcast (ยังไม่ต้อง Login ก็เข้าหน้านี้ได้)'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map(row => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/homepage/broadcast/new?tenant=${tenantId}&draft=${row.id}`)}
                >
                  <TableCell>{row.id}</TableCell>
                  <TableCell>{row.message}</TableCell>
                  <TableCell>{row.target}</TableCell>
                  <TableCell>{fmt(row.scheduledAt)}</TableCell>
                  <TableCell>{fmt(row.updatedAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
        <Pagination
          count={totalPages}
          page={page}
          onChange={(_, p) => setPage(p)}
          color="primary"
          showFirstButton
          showLastButton
        />
      </Box>

      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Showing: {TAB_LABELS[tab]} | Order by: {orderByKey === 'time' ? 'scheduledAt' : 'updatedAt'} ({order})
        </Typography>
      </Box>
    </Container>
  );
}
