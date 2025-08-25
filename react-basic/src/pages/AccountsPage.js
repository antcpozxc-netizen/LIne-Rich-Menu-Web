// src/pages/AccountsPage.js
import React, { useEffect, useRef, useState } from 'react';
import {
  AppBar, Toolbar, Typography, Button, Container, Table, TableBody,
  TableCell, TableHead, TableRow, Avatar, Box, IconButton, Dialog,
  DialogTitle, DialogContent, TextField, DialogActions, List, ListItem,
  ListItemAvatar, ListItemText, ListItemSecondaryAction, Tooltip, Divider,
  Chip, Alert, Link as MuiLink,Card, CardContent, CardMedia 
} from '@mui/material';

import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import AddIcon from '@mui/icons-material/Add';
import GroupIcon from '@mui/icons-material/Group';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { useNavigate, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import {
  collection, doc, onSnapshot, query, where, orderBy,
  getDoc, getDocs, startAt, endAt, limit
} from 'firebase/firestore';
import { fullLogout } from '../lib/authx';


import imgOA_Create   from '../assets/oa_create_new.png';
import imgOA_Form     from '../assets/oa_form.png';
import imgOA_Done     from '../assets/oa_done.png';
import imgOA_List     from '../assets/oa_list.png';
import imgOA_Settings from '../assets/oa_settings.png';
import imgOA_Enable   from '../assets/oa_enable_messaging_api.png';
import imgOA_Provider from '../assets/oa_choose_provider.png';
import imgOA_OK       from '../assets/oa_ok.png';
import imgOA_Check_id from '../assets/oa_check_id.png';


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

  // เพิ่ม state สำหรับ Dialog "วิธีหา Channel ID/Secret"
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

      // ตรวจสอบเบื้องต้นให้ใส่ครบ
      if (!channelId || !channelSecret) {
        alert('กรุณากรอก Channel ID และ Channel secret ให้ครบ');
        setSaving(false);
        return;
      }

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
        if (norm) {
          const snap = await getDoc(doc(db, 'users', norm));
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
            <strong>วิธีกรอก LINE OA</strong> — ไปที่ <em>LINE Developers Console → Providers → เลือก Channel (Messaging API)</em> <br />
            ที่แท็บ <em>Basic settings</em> จะมี <strong>Channel ID</strong> และที่แท็บ <em>Messaging API</em> จะมี <strong>Channel secret</strong> <br />
            จากนั้นกด <strong>Add LINE OA</strong> แล้ววางค่า 2 ช่องนี้เพื่อเชื่อมต่อ
          </Alert>
        </Box>

        {/* Extra tips (Helpful) */}
        <Box sx={{ mb: 3 }}>
          <Alert severity="success">
            <b>ทิป:</b> หลังเชื่อมต่อสำเร็จ ระบบจะดึงข้อมูล OA ให้ และถ้าเคยเชื่อมแล้วจะทำ <i>dedupe</i> ให้อัตโนมัติ (ไม่สร้างซ้ำแต่จะอัปเดตข้อมูล/โทเค็นล่าสุด) <br />
            ถ้าคุณยังไม่เปิดใช้งาน Messaging API ใน Channel หรือไม่มีสิทธิ์ดูค่า <em>Channel secret</em> กรุณาให้แอดมินของ Provider เพิ่มสิทธิ์ให้ก่อน
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
              <TableCell sx={{ fontWeight: 'bold', width: 260 }}>Actions</TableCell>
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
                  <Button
                    size="small"
                    variant="outlined"
                    href={`https://page.line.me/${t.basicId || ''}`}
                    target="_blank"
                    rel="noreferrer"
                    sx={{ mr: 1 }}
                    disabled={!t.basicId}
                  >
                    View OA
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
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
            helperText="ค่าตัวเลขจาก LINE Developers › Basic settings"
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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="text"
              onClick={() => setOpenHowTo(true)}
              sx={{ justifySelf: 'start', textTransform: 'none' }}
            >
              ดูวิธีหา Channel ID/Secret
            </Button>
            <MuiLink
              href="https://developers.line.biz/en/"
              target="_blank"
              rel="noreferrer"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: .5 }}
            >
              เปิด LINE Developers Console <OpenInNewIcon fontSize="small" />
            </MuiLink>
          </Box>

          <Alert severity="warning" sx={{ mt: 1 }}>
            <b>ย้ำ:</b> ต้องเป็น Channel ที่เปิดใช้ <em>Messaging API</em> แล้ว และบัญชีคุณมีสิทธิ์เข้าถึงค่า <em>Channel secret</em>
          </Alert>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpenAdd(false)} disabled={saving}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleAddOA} disabled={saving || !channelId || !channelSecret}>
            {saving ? 'กำลังบันทึก...' : 'เชื่อมต่อ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: 3) การเชื่อมต่อ LINE OA (Channel ID / Channel secret) — ข้อ B */}
      <Dialog open={openHowTo} onClose={() => setOpenHowTo(false)} fullWidth maxWidth="md">
        <DialogTitle>3) การเชื่อมต่อ LINE OA (Channel ID / Channel secret) — ข้อ B</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>

          {/* B1: Create new OA */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                B1) เข้าสู่ LINE Official Account Manager แล้วกด “Create new”
              </Typography>
              <Typography variant="body2" color="text.secondary">
                สร้างบัญชี LINE OA ใหม่ หากยังไม่มี (กรอกข้อมูลชื่อ ประเภท ธุรกิจ ฯลฯ ให้ครบ)
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Create} alt="Create new Official Account"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
            <Box sx={{ px: 2, py: 1, fontSize: 12, color: 'text.secondary' }}>
              ตัวอย่าง: หน้าสร้าง OA ใหม่
            </Box>
          </Card>

          {/* B2: Fill form */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                B2) กรอกรายละเอียดให้ครบถ้วน
              </Typography>
              <Typography variant="body2" color="text.secondary">
                ตรวจสอบชื่อ รูปภาพ และข้อมูลธุรกิจให้ถูกต้องก่อนดำเนินการต่อ
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Form} alt="OA Form"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B3: Complete */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                B3) ตรวจสอบข้อมูลและกด “เสร็จสิ้น”
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Done} alt="Complete OA"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B4: Back to list */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                B4) กลับไปเลือก Account ที่สร้างจากรายการ (List)
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_List} alt="OA List"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B5: Settings */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                B5) กด “Settings” มุมขวาบนของ OA
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Settings} alt="OA Settings"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B6: Enable Messaging API */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                B6) ไปที่หัวข้อ “Messaging API” และกด “Enable Messaging API”
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Enable} alt="Enable Messaging API"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B7: Choose provider */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                B7) เลือก Provider ที่ต้องการหรือสร้าง Provider ใหม่
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Provider} alt="Choose Provider"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B8: Confirm */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                B8) กด “OK”
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_OK} alt="Confirm OK"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card> 

          {/* B9: Read Channel ID/Secret */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                B9) ดูค่า Channel ID / Channel secret
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Check_id} alt="Confirm OK"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* ใช้กับระบบเราอย่างไร */}
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                ใช้ค่าเหล่านี้กับระบบเราอย่างไร?
              </Typography>
              <Typography variant="body2" color="text.secondary">
                เปิดหน้า <b>Accounts</b> → กด <b>Add LINE OA</b> → วาง <em>Channel ID</em> และ <em>Channel secret</em> แล้วกดเชื่อมต่อ
                (หากเคยเชื่อมแล้ว ระบบจะอัปเดตโทเค็น/ข้อมูลล่าสุดให้โดยไม่สร้างซ้ำ)
              </Typography>
              <Box sx={{ mt: 1 }}>
                <MuiLink href="https://developers.line.biz/en/" target="_blank" rel="noreferrer">
                  เปิด LINE Developers Console <OpenInNewIcon fontSize="inherit" />
                </MuiLink>
              </Box>
            </CardContent>
          </Card>

          <Alert severity="info">
            <b>หมายเหตุ:</b> ถ้าคุณไม่เห็น <em>Channel secret</em> ให้ตรวจสิทธิ์ใน Provider/Project และยืนยันว่า Channel เป็นประเภท <b>Messaging API</b>
            (ไม่ใช่ LINE Login อย่างเดียว)
          </Alert>
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
