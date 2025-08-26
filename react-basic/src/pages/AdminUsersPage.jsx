// src/pages/AdminUsersPage.jsx
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Stack, Chip, Select, MenuItem, Button, Alert
} from '@mui/material';
import { auth } from '../firebase';

export default function AdminUsersPage() {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(null);
  const [err, setErr] = useState('');

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

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="h5" fontWeight={700}>Administrator management</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        จัดการบทบาท: developer / headAdmin / admin / user
      </Typography>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      <Paper variant="outlined">
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>isAdmin</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(u => {
                const role = u.role || (u.isAdmin ? 'admin' : 'user');
                const color =
                  role === 'developer' ? 'secondary' :
                  role === 'headAdmin' ? 'error' :
                  role === 'admin' ? 'primary' : 'default';

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
                    <TableCell><Chip size="small" label={role} color={color}/></TableCell>
                    <TableCell>{u.isAdmin ? 'true' : 'false'}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Select
                          size="small"
                          value={role}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          disabled={saving?.startsWith(u.id + ':')}
                        >
                          <MenuItem value="user">user</MenuItem>
                          <MenuItem value="admin">admin</MenuItem>
                          <MenuItem value="headAdmin">headAdmin</MenuItem>
                          <MenuItem value="developer">developer</MenuItem>
                        </Select>
                        <Button variant="outlined" size="small" onClick={() => changeRole(u.id, 'user')}
                                disabled={saving?.startsWith(u.id + ':')}>Set user</Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
}
