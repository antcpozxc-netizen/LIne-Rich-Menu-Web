import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Box, Container, Typography, Grid, List, ListItemButton, ListItemText,
  Paper, Table, TableHead, TableRow, TableCell, TableBody, TextField,
  Stack, Select, MenuItem, Chip, IconButton, Tooltip, TableContainer,
  ListItemAvatar, Avatar, TableSortLabel, Snackbar, Alert
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckIcon from '@mui/icons-material/Check';
import { listUsers, listTasks, updateTaskStatus, exportTasksCsv } from '../api/client';
import Button from '@mui/material/Button';

// ---- utils ----
function parseDeadline(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]||'00'}:${m[5]||'00'}:00`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
const fmt = (d) => !d ? '' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(d);

function StatusChip({ value }) {
  const v = String(value || 'pending').toLowerCase();
  const color = v === 'done' ? 'success' : v === 'doing' ? 'info' : 'default';
  return <Chip size="small" label={v} color={color} />;
}

// generic compare for all columns
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
  // task_detail / detail / status / note / task_id
  const A = (get(a, by) || get(a, 'task_' + by) || '').toString();
  const B = (get(b, by) || get(b, 'task_' + by) || '').toString();
  return A.localeCompare(B, 'th');
}
const shortId = (s='') => String(s).slice(-6); // เอาหลัง 6 ตัวไว้พอจำได้

export default function TasksPage() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [activeUser, setActiveUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState(''); // '', 'pending', 'doing', 'done'
  const [busy, setBusy] = useState(false);

  // sorting
  const [orderBy, setOrderBy] = useState('updated_date');
  const [order, setOrder] = useState('desc'); // 'asc' | 'desc'

  // feedback
  const [snack, setSnack] = useState({ open:false, msg:'', sev:'success' });
  const prevRef = useRef(null);

  // โหลดผู้ใช้ทั้งหมดครั้งเดียว
  useEffect(() => { listUsers().then(j => setUsers(j.users || [])); }, []);

  // เหลือเฉพาะ role=user และเรียงตามชื่อจริง (fallback username)
  const userRows = useMemo(() => {
    const onlyUsers = (users || []).filter(
      u => String(u.role || 'user').toLowerCase() === 'user'
    );
    return [...onlyUsers].sort((a, b) =>
      (a.real_name || a.username || '').localeCompare(
        b.real_name || b.username || '',
        'th'
      )
    );
  }, [users]);

  // เลือกคนแรกให้อัตโนมัติทันทีที่มีข้อมูล
  useEffect(() => {
    if (!activeUser && userRows.length) setActiveUser(userRows[0]);
  }, [userRows, activeUser]);

  // ค้นหา
  const filteredUsers = useMemo(() => {
    if (!q) return userRows;
    const ql = q.toLowerCase().trim();
    return userRows.filter(u =>
      (`${u.user_id} ${u.username} ${u.real_name}`.toLowerCase()).includes(ql)
    );
  }, [userRows, q]);

  // โหลด tasks ของผู้ใช้/สถานะที่เลือก
  const load = async () => {
    if (!activeUser) return setTasks([]);
    const id = activeUser.user_id;
    const name = (activeUser.real_name || activeUser.username || '').trim();
    const j = await listTasks({ assignee_id: id, assignee_name: name, status });
    setTasks(j.tasks || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [activeUser, status]);

  // นับสถานะ
  const counts = useMemo(() => {
    const c = { pending:0, doing:0, done:0 };
    for (const t of tasks) c[String(t.status || 'pending').toLowerCase()]++;
    return c;
  }, [tasks]);

  // เปลี่ยนสถานะงาน — optimistic update
  const act = async (taskId, toStatus) => {
    prevRef.current = tasks;
    setBusy(true);
    setTasks(prev => prev.map(t => t.task_id === taskId ? { ...t, status: toStatus } : t));
    try {
      await updateTaskStatus(taskId, toStatus);
      setSnack({ open:true, msg:'อัปเดตสำเร็จ', sev:'success' });
      await load(); // sync ใหม่
    } catch (e) {
      setTasks(prevRef.current || []);
      setSnack({ open:true, msg:'อัปเดตไม่สำเร็จ', sev:'error' });
    } finally {
      setBusy(false);
    }
  };

  // sort ทุกคอลัมน์
  const sortedTasks = useMemo(() => {
    const arr = [...tasks];
    arr.sort((a,b)=> (order==='asc'?1:-1) * cmp(a,b,orderBy));
    return arr;
  }, [tasks, order, orderBy]);

  const onSort = (by) => {
    if (orderBy===by) setOrder(order==='asc'?'desc':'asc');
    else { setOrderBy(by); setOrder('asc'); }
  };

  return (
    <Container sx={{ pb: 6 }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 2, textAlign: 'center' }}>
        Tasks by User
      </Typography>

      <Grid container spacing={2}>
        {/* Left: รายชื่อผู้ใช้ (role=user) */}
        <Grid item xs={12} md={3}>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
            <TextField
              fullWidth size="small"
              label="ค้นหาผู้ใช้ (ตัวกรองเพิ่มเติม)"
              value={q} onChange={(e)=>setQ(e.target.value)}
              sx={{ mb: 1 }}
            />
            <List dense sx={{ maxHeight: { xs: 360, md: 520 }, overflow: 'auto' }}>
              {filteredUsers.map(u=>(
                <ListItemButton
                  key={u.user_id}
                  selected={activeUser?.user_id===u.user_id}
                  onClick={()=>setActiveUser(u)}
                >
                  <ListItemAvatar>
                    <Avatar src={`/api/profile/${encodeURIComponent(u.user_id)}/photo`} />
                  </ListItemAvatar>
                  <ListItemText
                    primaryTypographyProps={{ noWrap:true }}
                    secondaryTypographyProps={{ noWrap:true }}
                    primary={u.real_name || u.username || u.user_id}
                    secondary={u.user_id}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Right: ตารางงาน */}
        <Grid item xs={12} md={9}>
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ px:2, py:1.5, display:'flex', alignItems:'center', gap:1, flexWrap:'wrap' }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow:1 }}>
                {activeUser ? `Tasks of ${activeUser.real_name || activeUser.username || activeUser.user_id}` : 'เลือกผู้ใช้จากด้านซ้าย'}
              </Typography>
              <Select size="small" value={status} onChange={(e)=>setStatus(e.target.value)}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="pending">pending</MenuItem>
                <MenuItem value="doing">doing</MenuItem>
                <MenuItem value="done">done</MenuItem>
              </Select>
              <Button
                size="small"
                variant="outlined"
                onClick={()=> activeUser && exportTasksCsv({
                  assignee_id: activeUser.user_id,
                  assignee_name: activeUser.real_name || activeUser.username || ''
                })}
                disabled={!activeUser}
              >
                Export CSV
              </Button>
              <Tooltip title="Refresh">
                <span><IconButton onClick={load} disabled={!activeUser}><RefreshIcon/></IconButton></span>
              </Tooltip>
            </Box>

            <Stack direction="row" spacing={1} sx={{ px:2, pb:1 }}>
              <Chip size="small" label={`pending: ${counts.pending}`} />
              <Chip size="small" color="info" label={`doing: ${counts.doing}`} />
              <Chip size="small" color="success" label={`done: ${counts.done}`} />
            </Stack>

            <TableContainer sx={{ maxHeight: { xs: 420, md: 560 } }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {[
                      ['task_id', 'task_id', { nowrap:true }],
                      ['detail', 'detail', {}],
                      ['assigner', 'assigner_name', { nowrap:true }],   // << เพิ่มบรรทัดนี้
                      ['status', 'status', { nowrap:true }],
                      ['deadline', 'deadline', { nowrap:true }],
                      ['note', 'note', { hideXs:true }],
                      ['updated_date', 'updated_date', { hideSm:true, nowrap:true }],
                    ].map(([label, key, opt])=>(
                      <TableCell
                        key={key}
                        sx={{
                          whiteSpace: opt?.nowrap ? 'nowrap' : 'normal',
                          display: opt?.hideXs ? { xs:'none', sm:'table-cell' } :
                                   opt?.hideSm ? { xs:'none', md:'table-cell' } : 'table-cell'
                        }}
                        sortDirection={orderBy===key?order:false}
                      >
                        <TableSortLabel
                          active={orderBy===key}
                          direction={orderBy===key?order:'asc'}
                          onClick={()=>onSort(key)}
                        >
                          {label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                    <TableCell align="right" sx={{ whiteSpace:'nowrap' }}>action</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {sortedTasks.map(t=>(
                    <TableRow key={t.task_id || Math.random()} hover>
                      <TableCell sx={{ whiteSpace:'nowrap' }}>{t.task_id}</TableCell>
                      <TableCell>{t.task_detail || t.detail || ''}</TableCell>
                      {/* assigner (ผู้สั่งงาน) */}
                      <TableCell sx={{ whiteSpace:'nowrap' }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Avatar
                            sx={{ width:24, height:24 }}
                            src={t.assigner_id ? `/api/profile/${encodeURIComponent(t.assigner_id)}/photo` : undefined}
                          />
                          <span>{t.assigner_name || (t.assigner_id ? `#${shortId(t.assigner_id)}` : '-')}</span>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ whiteSpace:'nowrap' }}><StatusChip value={t.status} /></TableCell>
                      <TableCell sx={{ whiteSpace:'nowrap' }}>{fmt(parseDeadline(t.deadline))}</TableCell>
                      <TableCell sx={{ display:{ xs:'none', sm:'table-cell' } }}>{t.note || ''}</TableCell>
                      <TableCell sx={{ display:{ xs:'none', md:'table-cell' } }}>
                        {fmt(new Date(t.updated_date || t.updated_at || t.created_date))}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="กำลังทำ">
                            <span>
                              <IconButton size="small" onClick={()=>act(t.task_id, 'doing')} disabled={busy}>
                                <PlayArrowIcon/>
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="เสร็จแล้ว">
                            <span>
                              <IconButton size="small" onClick={()=>act(t.task_id, 'done')} disabled={busy}>
                                <CheckIcon/>
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}

                  {activeUser && tasks.length===0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py:3, color:'text.secondary' }}>
                        No tasks
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      <Snackbar open={snack.open} autoHideDuration={2000} onClose={()=>setSnack(s=>({...s, open:false}))}>
        <Alert severity={snack.sev} sx={{ width: '100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Container>
  );
}
