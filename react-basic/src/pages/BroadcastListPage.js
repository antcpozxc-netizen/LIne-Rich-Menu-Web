import React, { useMemo, useState } from 'react';
import {
  Box, Button, Container, Grid, IconButton, Tab, Tabs, TextField,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Stack, Pagination
} from '@mui/material';

import { Search as SearchIcon, SwapVert as SortIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const mock = [
  { id: 'BRD-0001', message: 'Promo A', target: 'All friends', time: '2025-08-08 16:00', updated: '2025-08-01 10:30', status: 'Scheduled' },
  { id: 'BRD-0002', message: 'New feature', target: 'Segment: VIP', time: '-', updated: '2025-07-29 09:05', status: 'Drafts' },
  { id: 'BRD-0003', message: 'Flash sale', target: 'All friends', time: '2025-07-21 14:00', updated: '2025-07-21 14:01', status: 'Sent' },
  { id: 'BRD-0004', message: 'Reminder', target: 'Segment: Dormant', time: '2025-07-20 12:00', updated: '2025-07-20 12:10', status: 'Failed' },
];

const tabs = ['Scheduled', 'Drafts', 'Sent', 'Failed'];

export default function BroadcastListPage() {
  const navigate = useNavigate();

  // UI state
  const [tab, setTab] = useState(0);
  const [qId, setQId] = useState('');
  const [qDate, setQDate] = useState('');
  const [qTime, setQTime] = useState('');
  const [orderBy, setOrderBy] = useState('updated'); // 'time' | 'updated'
  const [order, setOrder] = useState('desc'); // 'asc' | 'desc'
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  const data = useMemo(() => {
    // filter by tab
    let rows = mock.filter(r => r.status === tabs[tab]);

    // filter by id/date/time (อย่างง่าย)
    if (qId.trim()) rows = rows.filter(r => r.id.toLowerCase().includes(qId.trim().toLowerCase()));
    if (qDate) rows = rows.filter(r => (r.time || '').startsWith(qDate));
    if (qTime) rows = rows.filter(r => (r.time || '').includes(` ${qTime}`));

    // sort
    rows.sort((a, b) => {
      const av = a[orderBy] || '';
      const bv = b[orderBy] || '';
      return order === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return rows;
  }, [tab, qId, qDate, qTime, orderBy, order]);

  const totalPages = Math.max(1, Math.ceil(data.length / rowsPerPage));
  const paged = data.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const toggleSort = (key) => {
    if (orderBy === key) {
      setOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(key);
      setOrder('desc');
    }
  };

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="h4" fontWeight="bold">Broadcast</Typography>
        <Button variant="contained" sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
                onClick={() => navigate('/homepage/broadcast/new')}>
          + New broadcast
        </Button>
      </Stack>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(1); }} sx={{ mb: 2 }}>
        {tabs.map(label => <Tab key={label} label={label} />)}
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
          <Button variant="contained" startIcon={<SearchIcon />}
                  sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
                  onClick={() => setPage(1)}>
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
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  No data
                </TableCell>
              </TableRow>
            ) : (
              paged.map(row => (
                <TableRow key={row.id} hover sx={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/homepage/broadcast/${row.id}`)}>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>{row.message}</TableCell>
                  <TableCell>{row.target}</TableCell>
                  <TableCell>{row.time}</TableCell>
                  <TableCell>{row.updated}</TableCell>
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
    </Container>
  );
}
