// src/pages/AccountsPage.js
import React, { useEffect, useRef, useState } from 'react';
import {
  AppBar, Toolbar, Typography, Button, Container, Table, TableBody,
  TableCell, TableHead, TableRow, Avatar, Box, IconButton, Dialog,
  DialogTitle, DialogContent, TextField, DialogActions, List, ListItem,
  ListItemAvatar, ListItemText, ListItemSecondaryAction, Tooltip, Divider,
  Chip, Alert
} from '@mui/material';

import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import AddIcon from '@mui/icons-material/Add';
import GroupIcon from '@mui/icons-material/Group';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';

import { useNavigate, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import {
  collection, doc, onSnapshot, query, where, orderBy,
  getDoc, getDocs, startAt, endAt, limit
} from 'firebase/firestore';
import { fullLogout } from '../lib/authx';

// -------- utils --------
const normalizeUid = (input) => {
  const s = (input || '').trim();
  if (!s) return null;

  // line:Uxxxx....
  const m1 = /^line:([Uu])([0-9a-f]{32})$/i.exec(s);
  if (m1) {
    return `line:U${m1[2].toLowerCase()}`; // force 'U' + lowercase hex
  }

  // Uxxxx...
  const m2 = /^([Uu])([0-9a-f]{32})$/i.exec(s);
  if (m2) {
    return `line:U${m2[2].toLowerCase()}`;
  }

  return null;
};

// แค่เช็คว่า normalize ได้ไหมก็พอ
const uidLooksValid = (input) => !!normalizeUid(input);

// อนุญาตเฉพาะเส้นทางภายใน (กัน open redirect)
function sanitizeNext(raw) {
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '';
    return url.pathname + url.search; // ไม่ต้องเอา hash กลับ
  } catch {
    return String(raw).startsWith('/') ? raw : '';
  }
}

export default function AccountsPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const nextParam = sanitizeNext(sp.get('next') || '');

  // ---------- เมื่อเลือก OA ----------
  const openTenant = (t) => {
    if (!t?.id) return;

    // จำ OA ไว้
    localStorage.setItem('activeTenantId', t.id);

    // ปลายทาง: ถ้า next ว่าง หรือเป็น "/" → ให้ไป /homepage
    const baseNext = (!nextParam || nextParam === '/') ? '/homepage' : nextParam;

    // แนบ tenant เข้า query
    const url = new URL(baseNext, window.location.origin);
    url.searchParams.set('tenant', t.id);

    navigate(url.pathname + url.search, { replace: true });
  };

  // auth + profile
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);

  // tenants (LINE OA) ของผู้ใช้
  const [tenants, setTenants] = useState([]);

  // dialog: เชื่อมต่อ OA
  const [openAdd, setOpenAdd] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [saving, setSaving] = useState(false);

  // dialog: จัดการสมาชิก
  const [openMembers, setOpenMembers] = useState(false);
  const [activeTenant, setActiveTenant] = useState(null);  // {id,...}
  const [membersProfiles, setMembersProfiles] = useState([]); // [{uid,displayName,photoURL}]
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]); // [{uid,displayName,photoURL}]
  const searchDebounce = useRef(null);

  // เพิ่ม state ด้านบน component states
  const [openHowTo, setOpenHowTo] = useState(false);

  // ---- เฝ้าดูสถานะผู้ใช้ ----
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
      if (!u) navigate('/', { replace: true });
    });
  }, [navigate]);

  // ---- subscribe โปรไฟล์จาก Firestore: users/{uid} ----
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(ref, (snap) => setProfile(snap.data() || null));
    return () => unsub();
  }, [user]);

  // ---- subscribe รายการ OA ของผู้ใช้ ----
  useEffect(() => {
    if (!user) return;

    const acc = { owner: [], member: [] };
    const unsubs = [];

    const qOwner = query(collection(db, 'tenants'), where('ownerUid', '==', user.uid));
    const qMember = query(collection(db, 'tenants'), where('members', 'array-contains', user.uid));

    unsubs.push(onSnapshot(qOwner, (snap) => {
      acc.owner = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTenants(mergeUnique(acc.owner, acc.member));
    }));
    unsubs.push(onSnapshot(qMember, (snap) => {
      acc.member = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTenants(mergeUnique(acc.owner, acc.member));
    }));

    return () => unsubs.forEach(u => u());
  }, [user]);

  const mergeUnique = (a, b) => {
    const m = new Map();
    [...a, ...b].forEach(x => m.set(x.id, x));
    return Array.from(m.values()).sort((x, y) => (x.displayName || '').localeCompare(y.displayName || ''));
  };

  // ---- ออกจากระบบ ----
  const handleSignOut = async () => {
    await fullLogout('/');
  };

  // ---- เชื่อมต่อ OA: เรียก backend /api/tenants ----
  const handleAddOA = async () => {
    try {
      setSaving(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ channelId, channelSecret }),
      });
      const text = await res.text();
      let json = {};
      try { json = JSON.parse(text); } catch { json = { error: text }; }
      if (!res.ok) throw new Error(json.detail || json.error || 'add failed');
      if (json.deduped) alert('OA นี้ถูกเชื่อมไว้แล้ว อัปเดตข้อมูล/โทเค็นล่าสุดให้เรียบร้อย ✅');

      setOpenAdd(false);
      setChannelId('');
      setChannelSecret('');
    } catch (e) {
      alert('เพิ่ม OA ไม่สำเร็จ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ---- เปิด Dialog สมาชิก ----
  const openMembersDialog = async (tenant) => {
    setActiveTenant(tenant);
    setOpenMembers(true);
    await reloadMembers(tenant);
  };

  // โหลดโปรไฟล์สมาชิกจาก users/{uid}
  const reloadMembers = async (tenant) => {
    if (!tenant) return;
    try {
      setLoadingMembers(true);
      const uids = Array.isArray(tenant.members) ? tenant.members : [tenant.ownerUid].filter(Boolean);
      const uniqueUids = Array.from(new Set([tenant.ownerUid, ...uids].filter(Boolean)));
      const items = [];
      for (const uid of uniqueUids) {
        const snap = await getDoc(doc(db, 'users', uid));
        const d = snap.exists() ? snap.data() : {};
        items.push({
          uid,
          displayName: d.displayName || uid,
          photoURL: d.photoURL || (d.line && d.line.pictureUrl) || ''
        });
      }
      setMembersProfiles(items);
    } finally {
      setLoadingMembers(false);
    }
  };

  // ---- ค้นหาผู้ใช้เพื่อเพิ่ม ----
  useEffect(() => {
    if (!openMembers) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      doSearch(searchText).catch(() => {});
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, openMembers]);

  const doSearch = async (qstr) => {
    if (!openMembers) return;
    const q = (qstr || '').trim();
    if (!q) { setSearchResults([]); return; }

    setSearching(true);
    try {
      // 1) ถ้าเป็น UID/Line userId → หาแบบตรงตัว
      if (uidLooksValid(q)) {
        const norm = normalizeUid(q);
        console.log('[doSearch] input=', q, 'normalized=', norm);
        if (norm) {
          const snap = await getDoc(doc(db, 'users', norm));
          console.log('[doSearch] snap.exists=', snap.exists());
          if (snap.exists()) {
            const d = snap.data();
            setSearchResults([{
              uid: snap.id,
              displayName: d.displayName || snap.id,
              photoURL: d.photoURL || (d.line && d.line.pictureUrl) || ''
            }]);
            return;
          }
        }
      }
      // 2) ไม่ใช่ UID → prefix search ด้วย displayName
      const qq = query(
        collection(db, 'users'),
        orderBy('displayName'),
        startAt(q),
        endAt(q + '\uf8ff'),
        limit(10)
      );
      const s = await getDocs(qq);
      setSearchResults(
        s.docs.map(d => {
          const v = d.data();
          return {
            uid: d.id,
            displayName: v.displayName || d.id,
            photoURL: v.photoURL || (v.line && v.line.pictureUrl) || ''
          };
        })
      );
    } finally {
      setSearching(false);
    }
  };

  const isOwnerOf = (t) => user && t && t.ownerUid === user.uid;

  const addMember = async (memberUid) => {
    if (!activeTenant) return;
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/tenants/${activeTenant.id}/members:add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ memberUid })
      });
      const text = await res.text();
      let json = {}; try { json = JSON.parse(text); } catch { json = { error: text }; }
      if (!res.ok) throw new Error(json.detail || json.error || 'add member failed');

      await reloadMembers(activeTenant);
      alert('เพิ่มสมาชิกสำเร็จ');
    } catch (e) {
      alert('เพิ่มสมาชิกไม่สำเร็จ: ' + e.message);
    }
  };

  const removeMember = async (memberUid) => {
    if (!activeTenant) return;
    if (memberUid === activeTenant.ownerUid) {
      alert('ไม่สามารถลบ Owner ได้'); return;
    }
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/tenants/${activeTenant.id}/members:remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ memberUid })
      });
      const text = await res.text();
      let json = {}; try { json = JSON.parse(text); } catch { json = { error: text }; }
      if (!res.ok) throw new Error(json.detail || json.error || 'remove member failed');

      await reloadMembers(activeTenant);
      alert('ลบสมาชิกสำเร็จ');
    } catch (e) {
      alert('ลบสมาชิกไม่สำเร็จ: ' + e.message);
    }
  };

  const displayName =
    profile?.displayName ||
    user?.displayName ||
    user?.providerData?.[0]?.displayName ||
    (user?.uid ? `User ${user.uid.slice(-6)}` : 'UserName');

  const photoURL =
    profile?.photoURL ||
    user?.photoURL ||
    user?.providerData?.[0]?.photoURL ||
    '';

  const initial = (displayName || 'U').charAt(0).toUpperCase();

  if (!ready) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Top bar */}
      <AppBar position="fixed" sx={{ backgroundColor: '#66bb6a', boxShadow: 'none', px: 2 }}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton edge="start" sx={{ color: '#fff' }} aria-label="menu">
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h6"
              sx={{ fontWeight: 'bold', color: '#fff', cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              Line Rich Menus Web
            </Typography>
          </Box>

          {user && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Button
                startIcon={<AddIcon />}
                onClick={() => setOpenAdd(true)}
                sx={{ color: '#fff', textTransform: 'none' }}
              >
                Add LINE OA
              </Button>

              <Tooltip title={`UID: ${user.uid}`}>
                <IconButton
                  onClick={() => navigator.clipboard.writeText(user.uid)}
                  sx={{ color: '#fff' }}
                >
                  <ContentCopyIcon />
                </IconButton>
              </Tooltip>

              <Avatar
                src={photoURL || undefined}
                alt={displayName}
                sx={{ width: 36, height: 36, bgcolor: '#004d40', fontWeight: 700 }}
              >
                {!photoURL && initial}
              </Avatar>
              <Box sx={{ display: 'flex', flexDirection: 'column', maxWidth: 180 }}>
                <Typography sx={{ color: '#fff', fontWeight: 600 }} noWrap>
                  {displayName}
                </Typography>
                {profile?.line?.userId && (
                  <Typography sx={{ color: '#e8f5e9', fontSize: 11 }} noWrap>
                    LINE: {profile.line.userId}
                  </Typography>
                )}
              </Box>

              <Button
                variant="outlined"
                size="small"
                startIcon={<LogoutIcon />}
                onClick={handleSignOut}
                sx={{
                  color: '#fff',
                  borderColor: '#fff',
                  textTransform: 'none',
                  '&:hover': { borderColor: '#e0f2f1', backgroundColor: 'rgba(255,255,255,.08)' },
                }}
              >
                Logout
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* Page Content */}
      <Container sx={{ pt: 12 }}>
        {/* Tips: การกรอก LINE OA */}
        <Box sx={{ mb: 2 }}>
          <Alert severity="info">
            <strong>วิธีกรอก LINE OA</strong> — ไปที่ <em>LINE Developers Console → Providers → เลือก Channel (Messaging API)</em> <br/>
            ที่แท็บ <em>Basic settings</em> จะมี <strong>Channel ID</strong> และที่แท็บ <em>Messaging API</em> จะมี <strong>Channel secret</strong> <br/>
            จากนั้นกด <strong>Add LINE OA</strong> แล้ววางค่า 2 ช่องนี้เพื่อเชื่อมต่อ
          </Alert>
        </Box>
        <Typography variant="h4" gutterBottom>Accounts</Typography>

        <Table>
          <TableHead sx={{ backgroundColor: '#e8f5e9' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>LINE OA</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Basic ID</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Chat Mode</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Mark as Read</TableCell>
              <TableCell sx={{ fontWeight: 'bold', width: 220 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id} hover sx={{ '&:hover': { backgroundColor: '#f1f8e9' } }}>
                <TableCell onClick={() => openTenant(t)} sx={{ cursor: 'pointer' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar src={t.pictureUrl || undefined} sx={{ bgcolor: '#66bb6a' }}>
                      {!t.pictureUrl && (t.displayName?.[0] || 'O')}
                    </Avatar>
                    <Box>
                      <Typography>{t.displayName || 'OA'}</Typography>
                      <Box sx={{ display: 'flex', gap: .5, mt: .5 }}>
                        {t.ownerUid === user?.uid ? <Chip size="small" label="Owner" /> : <Chip size="small" label="Member" variant="outlined" />}
                      </Box>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>{t.basicId || '-'}</TableCell>
                <TableCell>{t.chatMode || '-'}</TableCell>
                <TableCell>{t.markAsReadMode || '-'}</TableCell>
                <TableCell>
                  <Button
                    startIcon={<GroupIcon />}
                    onClick={() => openMembersDialog(t)}
                    variant="outlined"
                    size="small"
                    sx={{ mr: 1 }}
                    disabled={t.ownerUid !== user?.uid}
                  >
                    Members
                  </Button>
                  <Button size="small" onClick={() => openTenant(t)}>
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {tenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} sx={{ color: '#777' }}>
                  ยังไม่มี OA — กด “Add LINE OA” เพื่อเชื่อมต่อ
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Container>

      {/* Dialog: เพิ่ม OA */}
      <Dialog open={openAdd} onClose={() => !saving && setOpenAdd(false)} fullWidth maxWidth="sm">
        <DialogTitle>เชื่อมต่อ LINE OA</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: 2 }}>
          <TextField
            label="Channel ID (Messaging API)"
            placeholder="เช่น 1651234567"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value.trim())}
            fullWidth
            helperText="ตัวเลขจาก LINE Developers › Basic settings"
          />
          <TextField
            label="Channel Secret"
            placeholder="เช่น 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o"
            value={channelSecret}
            onChange={(e) => setChannelSecret(e.target.value.trim())}
            fullWidth
            type="password"
            helperText="คีย์ลับจาก LINE Developers › Messaging API"
          />
          <Button
            variant="text"
            onClick={() => setOpenHowTo(true)}
            sx={{ justifySelf: 'start', textTransform: 'none' }}
          >
            ดูวิธีหา Channel ID/Secret
          </Button>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpenAdd(false)} disabled={saving}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleAddOA} disabled={saving || !channelId || !channelSecret}>
            {saving ? 'กำลังบันทึก...' : 'เชื่อมต่อ'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Dialog: วิธีหา Channel ID/Secret */}
      <Dialog open={openHowTo} onClose={() => setOpenHowTo(false)} fullWidth maxWidth="sm">
        <DialogTitle>วิธีหา Channel ID / Channel secret</DialogTitle>
        <DialogContent dividers>
          <List dense>
            <ListItem>
              <ListItemText
                primary="1) เปิด LINE Developers Console"
                secondary="ไปที่ Providers แล้วเลือก Channel ที่เป็น Messaging API"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="2) Channel ID"
                secondary="อยู่ในแท็บ Basic settings"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="3) Channel secret"
                secondary="อยู่ในแท็บ Messaging API"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="4) นำ 2 ค่านี้มาวางในหน้า Add LINE OA"
                secondary="ระบบจะเชื่อมต่อ OA ให้และเพิ่มเข้าในรายการของคุณ"
              />
            </ListItem>
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenHowTo(false)}>ปิด</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: จัดการสมาชิก */}
      <Dialog open={openMembers} onClose={() => setOpenMembers(false)} fullWidth maxWidth="md">
        <DialogTitle>จัดการสมาชิก {activeTenant?.displayName ? `— ${activeTenant.displayName}` : ''}</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label="ค้นหาจากชื่อ หรือวาง UID (line:U... / U...)"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              fullWidth
              InputProps={{ endAdornment: <SearchIcon /> }}
            />
            <Tooltip title={`คัดลอก UID ของฉัน: ${user?.uid || ''}`}>
              <Button startIcon={<ContentCopyIcon />} onClick={() => navigator.clipboard.writeText(user?.uid || '')} variant="outlined">
                คัดลอก UID ของฉัน
              </Button>
            </Tooltip>
          </Box>

          {/* Search results */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              ผลลัพธ์การค้นหา {searching ? '(กำลังค้นหา...)' : ''}
            </Typography>
            <List dense>
              {searchResults.map((u) => (
                <ListItem key={u.uid}>
                  <ListItemAvatar>
                    <Avatar src={u.photoURL || undefined}>{!u.photoURL && (u.displayName?.[0] || 'U')}</Avatar>
                  </ListItemAvatar>
                  <ListItemText primary={u.displayName} secondary={u.uid} />
                  <ListItemSecondaryAction>
                    <Button startIcon={<PersonAddIcon />} size="small" variant="contained" onClick={() => addMember(u.uid)} disabled={activeTenant?.ownerUid !== user?.uid}>
                      เพิ่ม
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
              {searchResults.length === 0 && (
                <Typography sx={{ color: '#777', ml: 2, my: 1 }}>พิมพ์อย่างน้อย 1–2 ตัวอักษรเพื่อค้นหา หรือวาง UID ตรง ๆ</Typography>
              )}
            </List>
          </Box>

          <Divider />

          {/* Current members */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              สมาชิกปัจจุบัน {loadingMembers ? '(กำลังโหลด...)' : ''}
            </Typography>
            <List dense>
              {membersProfiles.map((m) => (
                <ListItem key={m.uid}>
                  <ListItemAvatar>
                    <Avatar src={m.photoURL || undefined}>{!m.photoURL && (m.displayName?.[0] || 'U')}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span>{m.displayName}</span>
                        {m.uid === activeTenant?.ownerUid && <Chip size="small" label="Owner" />}
                      </Box>
                    }
                    secondary={m.uid}
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title={m.uid === activeTenant?.ownerUid ? 'Owner ลบไม่ได้' : 'ลบสมาชิก'}>
                      <span>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => removeMember(m.uid)}
                          disabled={activeTenant?.ownerUid !== user?.uid || m.uid === activeTenant?.ownerUid}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
              {membersProfiles.length === 0 && (
                <Typography sx={{ color: '#777', ml: 2, my: 1 }}>ยังไม่มีสมาชิก</Typography>
              )}
            </List>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenMembers(false)}>ปิด</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
