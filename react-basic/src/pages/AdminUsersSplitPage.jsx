// src/pages/AdminUsersSplitPage.jsx
import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Chip, Select, MenuItem, IconButton, Divider, Tooltip,
  Snackbar, Alert, Button, Stack, TextField, CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DownloadIcon from '@mui/icons-material/Download';
import useMe from '../hooks/useMe';
import { listUsers, setUserRole, setUserStatus, deleteUser, updateUserProfile } from '../api/client';

// ---------- helpers / constants ----------
const ROLE_RANK = { user: 1, admin: 2, supervisor: 3, developer: 4 };
const ORDERED_ROLES = ['developer', 'supervisor', 'admin', 'user'];

const colSx = {
  id:      { width:{ xs:130, sm:220 }, maxWidth:260, whiteSpace:'nowrap' },
  username:{ width:{ xs:120, md:160 }, whiteSpace:'nowrap' },
  name:    { minWidth:{ xs:180, md:240 }, whiteSpace:'nowrap' }, // ปรับได้อีกถ้าต้องการ
  role:    { width:{ xs:150, md:200 }, whiteSpace:'nowrap', pr:{ xs:2, md:5 } },
  status:  { width:{ xs:140, md:180 }, whiteSpace:'nowrap', pl:{ xs:1.5, md:3 } },
  action:  { width:{ xs:64,  md:90 },  textAlign:'center', whiteSpace:'nowrap' },
  updated: { width:{ xs:0,   md:220 }, display:{ xs:'none', md:'table-cell' }, whiteSpace:'nowrap' },
};

function roleColor(r) {
  return r === 'developer' ? 'secondary'
       : r === 'admin' || r === 'supervisor' ? 'primary'
       : 'default';
}
const cmp = (a,b,by) => (String(a?.[by] ?? '')).localeCompare(String(b?.[by] ?? ''), 'th');

// ---------- presentational components (ยกออกมานอกคอมโพเนนต์หลัก) ----------

const IdCell = memo(function IdCell({ id, copyId }) {
  return (
    <Box sx={{ display:'flex', alignItems:'center', gap:1, ...colSx.id }}>
      <Box sx={{ overflow:'hidden', textOverflow:'ellipsis' }}>{id}</Box>
      <Tooltip title="คัดลอก user_id">
        <span>
          <IconButton size="small" onClick={()=>copyId(id)}>
            <ContentCopyIcon fontSize="inherit" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
});

const TableBlock = memo(function TableBlock(props) {
  const {
    title, items, onSort, canEditProfile, canEditRoleStatus, getAllowedRoles, doRole, doStatus,
    editingId, draftUsername, draftName, setDraftUsername, setDraftName,
    saveEdit, cancelEdit, startEdit, copyId, busy
  } = props;

  // IME guard (ไทย/ญี่ปุ่น ฯลฯ)
  const [isComposing, setIsComposing] = useState(false);
  const usernameRef = useRef(null);
  const nameRef     = useRef(null);

  return (
    <Paper variant="outlined" sx={{ mb: 3, borderRadius: 3, overflow:'hidden' }}>
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
      </Box>
      <Divider />
      <TableContainer sx={{ overflowX:'auto', maxHeight:{ xs:420, md:560 } }}>
        <Table
          size="small"
          stickyHeader
          sx={{
            tableLayout: 'auto',
            '& td, & th': { px: { xs: 1, sm: 2 }, fontSize: { xs: 13, sm: 14 } }
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={colSx.id}      onClick={()=>onSort('user_id')}    >user_id</TableCell>
              <TableCell sx={colSx.username} onClick={()=>onSort('username')}  >username</TableCell>
              <TableCell sx={colSx.name}     onClick={()=>onSort('real_name')} >name</TableCell>
              <TableCell sx={colSx.role}>role</TableCell>
              <TableCell sx={colSx.status}>status</TableCell>
              <TableCell sx={colSx.updated}  onClick={()=>onSort('updated_at')}>updated_at</TableCell>
              <TableCell sx={colSx.action} align="center">action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {items.map(u => {
              const r = String(u.role||'user').toLowerCase();
              const editableProfile   = canEditProfile(u);
              const editableRoleState = canEditRoleStatus(u);

              return (
                <TableRow key={u.user_id} hover>
                  <TableCell sx={colSx.id}><IdCell id={u.user_id} copyId={copyId} /></TableCell>

                  {/* username */}
                  <TableCell sx={colSx.username}>
                    {editingId === u.user_id ? (
                      <TextField
                        size="small"
                        value={draftUsername}
                        disabled={!editableProfile || busy}
                        onChange={(e)=>setDraftUsername(e.target.value)}
                        onMouseDown={(e)=>e.stopPropagation()}
                        inputRef={usernameRef}
                        onCompositionStart={()=>setIsComposing(true)}
                        onCompositionEnd={()=>setIsComposing(false)}
                        onKeyDown={(e)=>{
                          if (!isComposing && e.key === 'Enter') saveEdit(u);
                          if (!isComposing && e.key === 'Escape') cancelEdit();
                          e.stopPropagation();
                        }}
                        inputProps={{ style:{ padding: '6px 8px' } }}
                        sx={{ width:{ xs:140, md:180 } }}
                      />
                    ) : (
                      <Box sx={{ whiteSpace:'nowrap' }}>{u.username || '-'}</Box>
                    )}
                  </TableCell>

                  {/* name */}
                  <TableCell sx={colSx.name}>
                    {editingId === u.user_id ? (
                      <TextField
                        size="small"
                        value={draftName}
                        disabled={!editableProfile || busy}
                        onChange={(e)=>setDraftName(e.target.value)}
                        onMouseDown={(e)=>e.stopPropagation()}
                        inputRef={nameRef}
                        onCompositionStart={()=>setIsComposing(true)}
                        onCompositionEnd={()=>setIsComposing(false)}
                        onKeyDown={(e)=>{
                          if (!isComposing && e.key === 'Enter') saveEdit(u);
                          if (!isComposing && e.key === 'Escape') cancelEdit();
                          e.stopPropagation();
                        }}
                        inputProps={{ style:{ padding: '6px 8px' } }}
                        sx={{ width:{ xs:220, md:300 } }}
                      />
                    ) : (
                      <Box sx={{ whiteSpace:'nowrap' }}>{u.real_name || '-'}</Box>
                    )}
                  </TableCell>

                  {/* role (select + chip ข้างๆ) */}
                  <TableCell sx={{ ...colSx.role, overflow:'hidden' }}>
                    <Box sx={{ display:'flex', alignItems:'center', gap:1, flexWrap:'nowrap' }}>
                      <Select
                        size="small"
                        value={r}
                        disabled={!editableRoleState || busy}
                        sx={{ minWidth:{ xs:118, sm:132 }, '& .MuiSelect-select':{ py:0.5 } }}
                        onChange={(e)=>doRole(u, e.target.value)}
                      >
                        {getAllowedRoles(r).map(v => (<MenuItem key={v} value={v}>{v}</MenuItem>))}
                      </Select>
                      <Chip
                        size="small"
                        label={r}
                        color={roleColor(r)}
                        sx={{ display:{ xs:'none', sm:'inline-flex' }, flexShrink:0 }}
                      />
                    </Box>
                  </TableCell>

                  {/* status */}
                  <TableCell sx={colSx.status}>
                    <Select
                      size="small"
                      value={u.status || 'Active'}
                      disabled={!editableProfile || busy}
                      onChange={(e)=>doStatus(u, e.target.value)}
                      sx={{ minWidth:{ xs:110, sm:120 }, '& .MuiSelect-select': { py:0.5 } }}
                    >
                      <MenuItem value="Active">Active</MenuItem>
                      <MenuItem value="Inactive">Inactive</MenuItem>
                    </Select>
                  </TableCell>

                  {/* updated */}
                  <TableCell sx={colSx.updated}>{u.updated_at || ''}</TableCell>

                  {/* action */}
                  <TableCell sx={colSx.action} align="center">
                    {editableProfile && editingId !== u.user_id && (
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Button size="small" variant="outlined" disabled={busy} onClick={()=>startEdit(u)}>แก้ไข</Button>
                        <Tooltip title="ตั้งเป็น Inactive">
                          <span>
                            <IconButton color="error" disabled={busy || !editableRoleState}
                              onClick={()=>props.setConfirm({ user_id: u.user_id, name: u.real_name || u.username || u.user_id })}>
                              <DeleteIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    )}
                    {editableProfile && editingId === u.user_id && (
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Button size="small" variant="contained" disabled={busy} onClick={()=>saveEdit(u)}>บันทึก</Button>
                        <Button size="small" variant="text" disabled={busy} onClick={cancelEdit}>ยกเลิก</Button>
                      </Stack>
                    )}
                    {!editableProfile && (
                      <Tooltip title={`ห้ามแก้ไขผู้ใช้ระดับเท่ากัน/สูงกว่า • myId=${myId || '-'} • rowId=${normalizeId(u?.user_id) || '-'}`}>
                        <span><Button size="small" disabled>แก้ไข</Button></span>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py:3, color:'text.secondary' }}>
                  No users
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
});

// ---------- main component ----------
export default function AdminUsersSplitPage() {
  const { data } = useMe();
  const myRole = (data?.user?.role || 'user').toLowerCase();
  const myRank = ROLE_RANK[myRole] || 0;
  const normalizeId = (id) => String(id || '').trim().replace(/^line:/,'');  // helper ใช้ซ้ำ
  const myId   = normalizeId(
     data?.session?.uid ||          // จากคุกกี้เซสชันฝั่งเซิร์ฟเวอร์
    data?.user?.user_id || ''      // เผื่อ hook คืน user_id มาด้วย
  );
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { user_id, name }
  const [snack, setSnack] = useState({ open:false, msg:'', sev:'success' });
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [working, setWorking] = useState({ on:false, msg:'' });

  // ---- export CSV (all users in one file) ----
  const toCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`; // escape "
  const handleExportCsv = () => {
    try {
      const headers = ['user_id','username','real_name','role','status','updated_at'];
      const lines = [headers.join(',')].concat(
        sorted.map(u => headers.map(h => toCsv(u?.[h])).join(','))
      );
      const csv = '\uFEFF' + lines.join('\r\n'); // BOM + CRLF
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const ts = new Date();
      const name = `users_${ts.toISOString().slice(0,19).replace(/[:T]/g,'')}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setSnack({ open:true, msg:'ส่งออก CSV ไม่สำเร็จ', sev:'error' });
    }
  };

  // sort state (ใช้ร่วมกันทั้ง 3 ตาราง)
  const [orderBy, setOrderBy] = useState('updated_at');
  const [order, setOrder] = useState('desc');

  // roles ที่อนุญาตให้เลือกได้ (<= ตัวเองถ้า developer, อื่นๆ < ตัวเอง)
  const roleChoices = useMemo(() => {
    return ORDERED_ROLES.filter(r => {
      const rk = ROLE_RANK[r] || 0;
      return myRole === 'developer' ? rk <= myRank : rk < myRank;
    });
  }, [myRole, myRank]);

  const load = async () => {
    setBusy(true);
    try {
      const j = await listUsers();
      setRows([...(j.users || [])]);
      setRefreshedAt(new Date());
    } catch (e) {
      setSnack({ open:true, msg:'โหลดรายชื่อไม่สำเร็จ', sev:'error' });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { load().catch(console.error); }, []);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a,b)=> (order==='asc'?1:-1) * cmp(a,b,orderBy));
    return arr;
  }, [rows, order, orderBy]);

  const { devRows, mgrRows, userRows } = useMemo(() => {
    const dev = [], mgr = [], usr = [];
    for (const u of sorted) {
      const r = (String(u.role || 'user')).toLowerCase();
      if (r === 'developer') dev.push(u);
      else if (r === 'admin' || r === 'supervisor') mgr.push(u);
      else usr.push(u);
    }
    return { devRows: dev, mgrRows: mgr, userRows: usr };
  }, [sorted]);

  // โปรไฟล์ (username / real_name): อนุญาตเสมอถ้าเป็น "เจ้าของ record" หรือผู้มีสิทธิ์สูงกว่า
  const isSelfRow = (u) => {
    const uidFromRow = normalizeId(u?.user_id);
    // ตรง user_id คือชัวร์สุด
    if (uidFromRow && uidFromRow === myId) return true;
    // Fallback: บางชีตเก่ามี row แต่ user_id ยังไม่ตรง ให้ยอมเฉพาะกรณี username/name ตรงกับคนล็อกอิน
    const meName = String(data?.user?.real_name || '').trim();
    const meUser = String(data?.user?.username || '').trim();
    return (!!u && (
      (meUser && String(u.username || '').trim() === meUser) ||
      (meName && String(u.real_name || '').trim() === meName)
    ));
  };
  const canEditProfile = (u) =>
    isSelfRow(u) ||
    ((ROLE_RANK[String(u?.role||'user')] || 0) < myRank);

  // role/status: ยึดกฎเดิม — ต้อง “สูงกว่า” เท่านั้น (ห้ามแก้ของตัวเองถ้า rank เท่ากัน)
  const canEditRoleStatus = (u) =>
    ((ROLE_RANK[String(u?.role||'user')] || 0) < myRank);

  const getAllowedRoles = (targetRole) => {
    const target = String(targetRole || 'user');
    let list = ORDERED_ROLES.filter(r => (ROLE_RANK[r] || 0) <= myRank);
    const targetRk = ROLE_RANK[target] || 0;
    if (targetRk >= myRank) list = Array.from(new Set([target, ...list]));
    return list;
  };

  // ---- actions ----
  const doRole = async (u, role) => {
    const targetRank = ROLE_RANK[String(u.role||'user').toLowerCase()] || 0;
    const newRank    = ROLE_RANK[String(role||'user').toLowerCase()] || 0;
    if (targetRank >= myRank || newRank > myRank) {
      setSnack({ open:true, msg:'คุณไม่มีสิทธิ์เปลี่ยนสิทธิ์นี้', sev:'error' });
      return;
    }
    setBusy(true); setWorking({ on:true, msg:'กำลังเปลี่ยนสิทธิ์...' });
    try {
      await setUserRole(u.user_id, role);
      setSnack({ open:true, msg:'อัปเดตบทบาทแล้ว', sev:'success' });
      await load();
    } catch {
      setSnack({ open:true, msg:'เปลี่ยนบทบาทไม่สำเร็จ', sev:'error' });
    } finally {
      setBusy(false); setWorking({ on:false, msg:'' });
    }
  };

  const doStatus = async (u, status) => {
    setBusy(true); setWorking({ on:true, msg:'กำลังเปลี่ยนสถานะ...' });
    try {
      await setUserStatus(u.user_id, status);
      setSnack({ open:true, msg:'อัปเดตสถานะแล้ว', sev:'success' });
      await load();
    } catch {
      setSnack({ open:true, msg:'อัปเดตสถานะไม่สำเร็จ', sev:'error' });
    } finally {
      setBusy(false); setWorking({ on:false, msg:'' });
    }
  };

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await deleteUser(confirm.user_id);
      setSnack({ open:true, msg:'ตั้งเป็น Inactive แล้ว', sev:'success' });
      setConfirm(null);
      await load();
    } catch {
      setSnack({ open:true, msg:'ลบไม่สำเร็จ', sev:'error' });
      setBusy(false);
    }
  };

  const copyId = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      setSnack({ open:true, msg:'คัดลอก user_id แล้ว', sev:'success' });
    } catch {
      setSnack({ open:true, msg:'คัดลอกไม่สำเร็จ', sev:'error' });
    }
  };

  const onSort = (by)=>{
    if (orderBy===by) setOrder(order==='asc' ? 'desc':'asc');
    else { setOrderBy(by); setOrder('asc'); }
  };

  // --- inline edit state & handlers ---
  const [editingId, setEditingId] = useState(null);
  const [draftUsername, setDraftUsername] = useState('');
  const [draftName, setDraftName] = useState('');

  const startEdit = (u) => {
    if (!u) return;
    setEditingId(u.user_id);
    setDraftUsername(u.username || '');
    setDraftName(u.real_name || '');
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraftUsername(''); setDraftName('');
  };
  const saveEdit = async (u) => {
    if (!u) return;
    setBusy(true); setWorking({ on:true, msg:'กำลังบันทึกโปรไฟล์...' });
    try {
      await updateUserProfile(u.user_id, { username: draftUsername, real_name: draftName });
      setSnack({ open:true, msg:'อัปเดตโปรไฟล์แล้ว', sev:'success' });
      cancelEdit();
      await load();
    } catch {
      setSnack({ open:true, msg:'อัปเดตโปรไฟล์ไม่สำเร็จ', sev:'error' });
    } finally {
      setBusy(false); setWorking({ on:false, msg:'' });
    }
  };

  return (
    <Container sx={{ pb: 6 }}>
      {/* header + refresh */}
      <Box sx={{ my:2, display:'flex', alignItems:'center', justifyContent:'space-between', gap:1, flexWrap:'wrap' }}>
        <Typography variant="h5" fontWeight={800}>Administrator management</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="ส่งออกผู้ใช้ทั้งหมดเป็น CSV"> 
            <span> 
              <Button 
                size="small" 
                variant="outlined" 
                startIcon={<DownloadIcon />} 
                onClick={handleExportCsv} 
                disabled={!rows.length || busy} 
              > 
                ส่งออก CSV 
              </Button> 
            </span> 
          </Tooltip>
          <Button size="small" variant="outlined" onClick={()=>navigate('/app/admin/users')}>
            ดูงานที่ฉันสั่ง
          </Button>
          {working.on && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">{working.msg}</Typography>
            </Stack>
          )}
          {refreshedAt && (
            <Typography variant="caption" color="text.secondary" sx={{ display:{ xs:'none', sm:'block' } }}>
              อัปเดตล่าสุด {new Intl.DateTimeFormat('th-TH',{ dateStyle:'short', timeStyle:'short'}).format(refreshedAt)}
            </Typography>
          )}
          <Tooltip title="Refresh">
            <span><IconButton onClick={load} disabled={busy}><RefreshIcon/></IconButton></span>
          </Tooltip>
        </Stack>
      </Box>

      <TableBlock
        title="Developers"
        items={devRows}
        onSort={onSort}
        canEditProfile={canEditProfile}
        canEditRoleStatus={canEditRoleStatus}
        getAllowedRoles={(targetRole)=>{
          const targetRk = ROLE_RANK[String(targetRole||'user')]||0;
          let list = ORDERED_ROLES.filter(r => (ROLE_RANK[r]||0) <= myRank);
          if (targetRk >= myRank) list = Array.from(new Set([String(targetRole||'user'), ...list]));
          return list;
        }}
        doRole={doRole}
        doStatus={doStatus}
        editingId={editingId}
        draftUsername={draftUsername}
        draftName={draftName}
        setDraftUsername={setDraftUsername}
        setDraftName={setDraftName}
        saveEdit={saveEdit}
        cancelEdit={cancelEdit}
        startEdit={startEdit}
        copyId={copyId}
        busy={busy}
        setConfirm={setConfirm}
      />

      <TableBlock
        title="Admins & Supervisors"
        items={mgrRows}
        onSort={onSort}
        canEditProfile={canEditProfile}
        canEditRoleStatus={canEditRoleStatus}
        getAllowedRoles={(targetRole)=>{
          const targetRk = ROLE_RANK[String(targetRole||'user')]||0;
          let list = ORDERED_ROLES.filter(r => (ROLE_RANK[r]||0) <= myRank);
          if (targetRk >= myRank) list = Array.from(new Set([String(targetRole||'user'), ...list]));
          return list;
        }}
        doRole={doRole}
        doStatus={doStatus}
        editingId={editingId}
        draftUsername={draftUsername}
        draftName={draftName}
        setDraftUsername={setDraftUsername}
        setDraftName={setDraftName}
        saveEdit={saveEdit}
        cancelEdit={cancelEdit}
        startEdit={startEdit}
        copyId={copyId}
        busy={busy}
        setConfirm={setConfirm}
      />

      <TableBlock
        title="Users"
        items={userRows}
        onSort={onSort}
        canEditProfile={canEditProfile}
        canEditRoleStatus={canEditRoleStatus}
        getAllowedRoles={(targetRole)=>{
          const targetRk = ROLE_RANK[String(targetRole||'user')]||0;
          let list = ORDERED_ROLES.filter(r => (ROLE_RANK[r]||0) <= myRank);
          if (targetRk >= myRank) list = Array.from(new Set([String(targetRole||'user'), ...list]));
          return list;
        }}
        doRole={doRole}
        doStatus={doStatus}
        editingId={editingId}
        draftUsername={draftUsername}
        draftName={draftName}
        setDraftUsername={setDraftUsername}
        setDraftName={setDraftName}
        saveEdit={saveEdit}
        cancelEdit={cancelEdit}
        startEdit={startEdit}
        copyId={copyId}
        busy={busy}
        setConfirm={setConfirm}
      />

      <Dialog open={!!confirm} onClose={()=>setConfirm(null)}>
        <DialogTitle>ยืนยันการลบผู้ใช้</DialogTitle>
        <DialogContent>
          ต้องการลบผู้ใช้ <b>{confirm?.name}</b> ใช่ไหม? (ระบบจะตั้งสถานะเป็น Inactive)
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setConfirm(null)}>ยกเลิก</Button>
          <Button color="error" variant="contained" onClick={doDelete}>ลบ</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={2000} onClose={()=>setSnack(s=>({...s, open:false}))}>
        <Alert severity={snack.sev} sx={{ width:'100%' }}>{snack.msg}</Alert>
      </Snackbar>
    </Container>
  );
}
