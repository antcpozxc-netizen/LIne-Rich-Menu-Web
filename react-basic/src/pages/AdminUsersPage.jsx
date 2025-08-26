// src/pages/AdminUsersPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Stack, Chip, Select, MenuItem, Button, Alert, IconButton, Divider
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { auth } from '../firebase';
import useAuthClaims from '../lib/useAuthClaims';

function roleOf(u) {
  return u.role || (u.isAdmin ? 'admin' : 'user');
}
function roleColor(role) {
  return role === 'developer' ? 'secondary'
       : role === 'headAdmin' ? 'error'
       : role === 'admin' ? 'primary'
       : 'default';
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(null);
  const [err, setErr] = useState('');
  const me = auth.currentUser?.uid || null;
  const { isDev } = useAuthClaims(); // ใช้เพื่อตัดสินใจแสดงปุ่มลบ

  async function load() {
    setErr('');
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const r = await fetch('/api/admin/users', { headers: { Authorization: 'Bearer ' + idToken } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'load_failed');
      setRows(j.items || []);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }
  useEffect(() => { load(); }, []);

  async function changeRole(uid, role) {
    // ป้องกัน dev ลดขั้นตัวเอง (รวมถึงกด SET USER)
    if (uid === me && role !== 'developer') {
      alert('Developer ไม่สามารถเปลี่ยนบทบาทของตัวเองได้');
      return;
    }
    try {
      setSaving(uid + ':' + role);
      const idToken = await auth.currentUser?.getIdToken();
      const r = await fetch('/api/admin/users/' + encodeURIComponent(uid) + '/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({ role }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'update_failed');
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setSaving(null);
    }
  }

  async function deleteUser(uid, displayName) {
    if (!isDev) return; // เฉพาะ dev เท่านั้น
    if (uid === me) {
      alert('ไม่สามารถลบบัญชีของตัวเองได้');
      return;
    }
    const ok = window.confirm(`ต้องการลบผู้ใช้ "${displayName || uid}" จริงหรือไม่?`);
    if (!ok) return;
    try {
      setSaving('del:' + uid);
      const idToken = await auth.currentUser?.getIdToken();
      const r = await fetch('/api/admin/users/' + encodeURIComponent(uid), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + idToken },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'delete_failed');
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setSaving(null);
    }
  }

  // แบ่งกลุ่มข้อมูลเป็น 3 ตาราง
  const { devRows, adminRows, userRows } = useMemo(() => {
    const dev = [], ad = [], us = [];
    for (const u of rows) {
      const r = roleOf(u);
      if (r === 'developer') dev.push(u);
      else if (r === 'headAdmin' || r === 'admin') ad.push(u);
      else us.push(u);
    }
    return { devRows: dev, adminRows: ad, userRows: us };
  }, [rows]);

  function TableBlock({ title, items }) {
    return (
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
        </Box>
        <Divider />
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>isAdmin</TableCell>
                <TableCell width={320}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map(u => {
                const role = roleOf(u);
                const isSelf = u.id === me;
                const disableSelect = saving?.startsWith(u.id + ':') || (isSelf && role === 'developer'); // dev แก้ตัวเองไม่ได้
                const disableSetUser = saving?.startsWith(u.id + ':') || (isSelf && role === 'developer');
                const canDelete = isDev && !isSelf; // dev ลบทุกคน ยกเว้นตัวเอง

                return (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {u.photoURL && <img src={u.photoURL} alt="" width={28} height={28} style={{borderRadius: 999}} />}
                        <Box>
                          <Typography variant="subtitle2">{u.displayName || u.id}</Typography>
                          <Typography variant="caption" color="text.secondary">{u.id}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell><Chip size="small" label={role} color={roleColor(role)} /></TableCell>
                    <TableCell>{u.isAdmin ? 'true' : 'false'}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Select
                          size="small"
                          value={role}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          disabled={disableSelect}
                        >
                          {/* เรียงตามความต้องการ */}
                          <MenuItem value="user">user</MenuItem>
                          <MenuItem value="admin">admin</MenuItem>
                          <MenuItem value="headAdmin">headAdmin</MenuItem>
                          <MenuItem value="developer">developer</MenuItem>
                        </Select>

                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => changeRole(u.id, 'user')}
                          disabled={disableSetUser}
                        >
                          SET USER
                        </Button>

                        {isDev && (
                          <IconButton
                            aria-label="delete user"
                            size="small"
                            onClick={() => deleteUser(u.id, u.displayName)}
                            disabled={!canDelete || saving === 'del:' + u.id}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No users in this group.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  }

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="h5" fontWeight={700}>Administrator management</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        จัดการบทบาท: developer / headAdmin / admin / user
      </Typography>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      <TableBlock title="Developers" items={devRows} />
      <TableBlock title="Head admins & Admins" items={adminRows} />
      <TableBlock title="Users" items={userRows} />
    </Container>
  );
}
