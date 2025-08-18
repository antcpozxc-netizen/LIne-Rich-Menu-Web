// src/pages/RichMessageListPage.js
import React, { useMemo, useState } from 'react';
import {
  Box, Button, Container, Grid, IconButton, Menu, MenuItem,
  Paper, TextField, Typography, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Pagination, InputAdornment
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  MoreHoriz as MoreIcon,
  CalendarMonth as CalendarIcon,
  SwapVert as SortIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

// localStorage helpers
const KEY = 'richMessages';
const readAll = () => JSON.parse(localStorage.getItem(KEY) || '[]');
const writeAll = (rows) => localStorage.setItem(KEY, JSON.stringify(rows));

// ---- helpers สำหรับแสดงผล ----
const previewUrlOf = (row) =>
  row?.image ||
  row?.imagemap?.urls?.[700] ||
  row?.imagemap?.urls?.['700'] ||
  null;

// ดึงลิงก์หลักจาก areas (ถ้าไม่เคยเซฟ actionLabel/actionUrl)
const primaryActionOf = (row) => {
  if (row?.actionUrl) {
    return { label: row.actionLabel || row.actionUrl, url: row.actionUrl };
  }
  const a = (row?.areas || []).find(x => x?.type !== 'message' && x?.url);
  if (a?.url) return { label: a.label || 'Open link', url: a.url };
  return null;
};

export default function RichMessageListPage() {
  const navigate = useNavigate();

  // filters
  const [qId, setQId] = useState('');
  const [qName, setQName] = useState('');
  const [qFrom, setQFrom] = useState('');
  const [qTo, setQTo] = useState('');

  // sort + page
  const [order, setOrder] = useState('desc'); // 'asc' | 'desc'
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  // menu state
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuRow, setMenuRow] = useState(null);
  const openMenu = Boolean(anchorEl);

  // trigger re-render after duplicate/delete
  const [rev, setRev] = useState(0);

  const data = useMemo(() => {
    let rows = readAll();

    if (qId.trim()) rows = rows.filter(r => String(r.id).toLowerCase().includes(qId.trim().toLowerCase()));
    if (qName.trim()) rows = rows.filter(r => (r.name || '').toLowerCase().includes(qName.trim().toLowerCase()));
    if (qFrom) rows = rows.filter(r => (r.createdAt || '') >= `${qFrom} 00:00`);
    if (qTo) rows = rows.filter(r => (r.createdAt || '') <= `${qTo} 23:59`);

    rows.sort((a, b) =>
      order === 'asc'
        ? String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
        : String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    return rows;
  }, [qId, qName, qFrom, qTo, order, rev]);

  const totalPages = Math.max(1, Math.ceil(data.length / rowsPerPage));
  const paged = data.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const clearFilters = () => {
    setQId(''); setQName(''); setQFrom(''); setQTo(''); setPage(1);
  };

  const handleMenuOpen = (e, row) => {
    setAnchorEl(e.currentTarget);
    setMenuRow(row);
  };
  const handleMenuClose = () => { setAnchorEl(null); setMenuRow(null); };

  const doDuplicate = () => {
    const list = readAll();
    const src = list.find(r => r.id === menuRow?.id);
    if (!src) return handleMenuClose();
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = 'RM-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    copy.name = copy.name ? copy.name + ' (copy)' : 'Untitled (copy)';
    copy.createdAt = new Date().toISOString().replace('T',' ').slice(0,16);
    delete copy.updatedAt;
    list.unshift(copy);
    writeAll(list);
    handleMenuClose();
    setRev(x => x + 1);
  };

  const doDelete = () => {
    if (!window.confirm('Delete this Rich message?')) return;
    const list = readAll().filter(r => r.id !== menuRow?.id);
    writeAll(list);
    handleMenuClose();
    setRev(x => x + 1);
  };

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4" fontWeight="bold">Rich messages</Typography>
        <Button
          variant="contained"
          onClick={() => navigate('/homepage/rich-message/new')}
          sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
        >
          Create new
        </Button>
      </Stack>

      {/* Filter bar */}
      <Grid container spacing={1} alignItems="center" mb={1}>
        <Grid item xs={12} md="auto">
          <TextField
            size="small"
            placeholder="ID"
            value={qId}
            onChange={(e) => setQId(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} md="auto">
          <TextField
            size="small"
            type="date"
            value={qFrom}
            onChange={(e) => setQFrom(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <CalendarIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Grid>
        <Grid item xs={12} md="auto">
          <TextField
            size="small"
            type="date"
            value={qTo}
            onChange={(e) => setQTo(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} md="auto" flexGrow={1}>
          <TextField
            fullWidth
            size="small"
            placeholder="Item name"
            value={qName}
            onChange={(e) => setQName(e.target.value)}
          />
        </Grid>
        <Grid item xs="auto">
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={() => setPage(1)}
            sx={{ bgcolor: '#66bb6a', '&:hover': { bgcolor: '#57aa5b' } }}
          >
            Search
          </Button>
        </Grid>
        <Grid item xs="auto">
          <Button variant="outlined" startIcon={<ClearIcon />} onClick={clearFilters}>
            Clear
          </Button>
        </Grid>
      </Grid>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 160 }}>ID</TableCell>
              <TableCell sx={{ width: 160 }}>Image</TableCell>
              <TableCell>Item name</TableCell>
              <TableCell>Action</TableCell>
              <TableCell sx={{ width: 210 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  Date created
                  <IconButton size="small" onClick={() => setOrder(p => (p === 'asc' ? 'desc' : 'asc'))}>
                    <SortIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
              <TableCell align="right" sx={{ width: 56 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  No data
                </TableCell>
              </TableRow>
            ) : (
              paged.map(row => {
                const img = previewUrlOf(row);
                const act = primaryActionOf(row);
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Button variant="text" onClick={() => navigate(`/homepage/rich-message/${row.id}`)}>
                        {row.id}
                      </Button>
                    </TableCell>
                    <TableCell>
                      {img ? (
                        <img
                          src={img}
                          alt={row.name || ''}
                          style={{ width: 120, height: 60, objectFit: 'cover', borderRadius: 4 }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.innerHTML = '<span style="color:#888">—</span>'; }}
                        />
                      ) : (
                        <span style={{ color: '#888' }}>—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="text" onClick={() => navigate(`/homepage/rich-message/${row.id}`)}>
                        {row.name || 'Untitled'}
                      </Button>
                    </TableCell>
                    <TableCell>
                      {act?.url ? (
                        <a href={act.url} target="_blank" rel="noreferrer">
                          {act.label || act.url}
                        </a>
                      ) : (
                        <span style={{ color: '#888' }}>—</span>
                      )}
                    </TableCell>
                    <TableCell>{row.createdAt || '-'}</TableCell>
                    <TableCell align="right">
                      <IconButton onClick={(e) => handleMenuOpen(e, row)}>
                        <MoreIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
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

      {/* Row menu */}
      <Menu anchorEl={anchorEl} open={openMenu} onClose={handleMenuClose}>
        <MenuItem onClick={() => { handleMenuClose(); navigate(`/homepage/rich-message/${menuRow?.id}`); }}>
          View / Edit
        </MenuItem>
        <MenuItem onClick={doDuplicate}>
          Duplicate
        </MenuItem>
        <MenuItem onClick={doDelete}>
          Delete
        </MenuItem>
      </Menu>
    </Container>
  );
}
