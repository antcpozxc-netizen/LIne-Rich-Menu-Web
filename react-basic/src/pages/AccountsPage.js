// src/pages/AccountsPage.js
import React, { useEffect, useRef, useState } from 'react';
import {
  AppBar, Toolbar, Typography, Button, Container, Table, TableBody,
  TableCell, TableHead, TableRow, Avatar, Box, IconButton, Dialog,
  DialogTitle, DialogContent, TextField, DialogActions, List, ListItem,
  ListItemAvatar, ListItemText, ListItemSecondaryAction, Tooltip, Divider,
  Chip, Alert, Link as MuiLink, Card, CardContent
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

// -------- ใช้รูปจากโฟลเดอร์ public/assets --------
const PUB = process.env.PUBLIC_URL || '';
const IMG = {
  create:   `${PUB}/assets/oa_create_new.png`,
  form:     `${PUB}/assets/oa_form.png`,
  done:     `${PUB}/assets/oa_done.png`,
  list:     `${PUB}/assets/oa_list.png`,
  settings: `${PUB}/assets/oa_settings.png`,
  enable:   `${PUB}/assets/oa_enable_messaging_api.png`,
  provider: `${PUB}/assets/oa_choose_provider.png`,
  ok:       `${PUB}/assets/oa_ok.png`,
  check:    `${PUB}/assets/oa_check_id.png`,
};

// -------- utils --------
const normalizeUid = (input) => {
  const s = (input || '').trim();
  if (!s) return null;
  const m1 = /^line:([Uu])([0-9a-f]{32})$/i.exec(s);
  if (m1) return `line:U${m1[2].toLowerCase()}`;
  const m2 = /^([Uu])([0-9a-f]{32})$/i.exec(s);
  if (m2) return `line:U${m2[2].toLowerCase()}`;
  return null;
};
const uidLooksValid = (input) => !!normalizeUid(input);

function sanitizeNext(raw) {
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '';
    return url.pathname + url.search;
  } catch {
    return String(raw).startsWith('/') ? raw : '';
  }
}

// === ใช้ <img> ตรง ๆ เพื่อบังคับ eager load ===
function ImgStep({ src, alt, caption }) {
  return (
    <Box sx={{ borderTop: '1px solid #eee', bgcolor: '#fafafa' }}>
      <img
        src={src}
        alt={alt}
        loading="eager"
        decoding="sync"
        referrerPolicy="no-referrer"
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          maxHeight: 520,
          objectFit: 'contain'
        }}
      />
      {caption && (
        <Box sx={{ px: 2, py: 1, fontSize: 12, color: 'text.secondary' }}>
          {caption}
        </Box>
      )}
    </Box>
  );
}

export default function AccountsPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const nextParam = sanitizeNext(sp.get('next') || '');

  // ---------- เมื่อเลือก OA ----------
  const openTenant = (t) => {
    if (!t?.id) return;
    localStorage.setItem('activeTenantId', t.id);
    const baseNext = (!nextParam || nextParam === '/') ? '/homepage' : nextParam;
    const url = new URL(baseNext, window.location.origin);
    url.searchParams.set('tenant', t.id);
    navigate(url.pathname + url.search, { replace: true });
  };

  // auth + profile
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);

  // tenants
  const [tenants, setTenants] = useState([]);

  // dialog: เชื่อมต่อ OA
  const [openAdd, setOpenAdd] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [saving, setSaving] = useState(false);

  // dialog: จัดการสมาชิก
  const [openMembers, setOpenMembers] = useState(false);
  const [activeTenant, setActiveTenant] = useState(null);
  const [membersProfiles, setMembersProfiles] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const searchDebounce = useRef(null);

  // dialog: วิธีการหา / เชื่อมต่อ (B1–B9)
  const [openHowTo, setOpenHowTo] = useState(false);

  // ---- เฝ้าดูสถานะผู้ใช้ ----
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
      if (!u) navigate('/', { replace: true });
    });
  }, [navigate]);

  // ---- subscribe โปรไฟล์ ----
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(ref, (snap) => setProfile(snap.data() || null));
    return () => unsub();
  }, [user]);

  // ---- subscribe รายการ OA ----
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

  // ---- เชื่อมต่อ OA ----
  const handleAddOA = async () => {
    try {
      setSaving(true);
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

  // ---- สมาชิก ----
  const openMembersDialog = async (tenant) => {
    setActiveTenant(tenant);
    setOpenMembers(true);
    await reloadMembers(tenant);
  };

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

  useEffect(() => {
    if (!openMembers) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      doSearch(searchText).catch(() => {});
    }, 350);
  }, [searchText, openMembers]);

  const doSearch = async (qstr) => {
    if (!openMembers) return;
    const q = (qstr || '').trim();
    if (!q) { setSearchResults([]); return; }

    setSearching(true);
    try {
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
              <Button startIcon={<AddIcon />} onClick={() => setOpenAdd(true)} sx={{ color: '#fff', textTransform: 'none' }}>
                Add LINE OA
              </Button>

              <Tooltip title={`UID: ${user.uid}`}>
                <IconButton onClick={() => navigator.clipboard.writeText(user.uid)} sx={{ color: '#fff' }}>
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
                <Typography sx={{ color: '#fff', fontWeight: 600 }} noWrap>{displayName}</Typography>
                {profile?.line?.userId && (
                  <Typography sx={{ color: '#e8f5e9', fontSize: 11 }} noWrap>
                    LINE: {profile.line.userId}
                  </Typography>
                )}
              </Box>

              <Button
                variant="outlined" size="small" startIcon={<LogoutIcon />} onClick={handleSignOut}
                sx={{
                  color: '#fff', borderColor: '#fff', textTransform: 'none',
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
        <Box sx={{ mb: 2 }}>
          <Alert severity="info">
            <strong>วิธีกรอก LINE OA</strong> — ไปที่ <em>LINE Developers Console → Providers → เลือก Channel (Messaging API)</em> <br/>
            แท็บ <em>Basic settings</em>: <strong>Channel ID</strong> • แท็บ <em>Messaging API</em>: <strong>Channel secret</strong>
          </Alert>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Alert severity="success">
            <b>ทิป:</b> ถ้าเชื่อม OA เดิมซ้ำ ระบบจะ <i>dedupe</i> และอัปเดตโทเค็น/ข้อมูลล่าสุดให้อัตโนมัติ
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
                    startIcon={<GroupIcon />} onClick={() => openMembersDialog(t)}
                    variant="outlined" size="small" sx={{ mr: 1 }} disabled={t.ownerUid !== user?.uid}
                  >
                    Members
                  </Button>
                  <Button size="small" onClick={() => openTenant(t)}>Open</Button>
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
            label="Channel ID (Messaging API)" placeholder="เช่น 1651234567"
            value={channelId} onChange={(e) => setChannelId(e.target.value.trim())}
            fullWidth inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
            helperText="ค่าตัวเลขจาก LINE Developers › Basic settings"
          />
          <TextField
            label="Channel Secret" placeholder="เช่น 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o"
            value={channelSecret} onChange={(e) => setChannelSecret(e.target.value.trim())}
            fullWidth type="password" helperText="คีย์ลับจาก LINE Developers › Messaging API"
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="text" onClick={() => setOpenHowTo(true)} sx={{ textTransform: 'none' }}>
              ดูวิธีหา Channel ID/Secret
            </Button>
            <MuiLink href="https://developers.line.biz/en/" target="_blank" rel="noreferrer"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: .5 }}>
              เปิด LINE Developers Console <OpenInNewIcon fontSize="small" />
            </MuiLink>
          </Box>

          <Alert severity="warning" sx={{ mt: 1 }}>
            <b>ย้ำ:</b> ต้องเป็น Channel ที่เปิดใช้ <em>Messaging API</em> แล้ว และบัญชีคุณมีสิทธิ์เห็น <em>Channel secret</em>
          </Alert>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpenAdd(false)} disabled={saving}>ยกเลิก</Button>
          <Button variant="contained" onClick={handleAddOA} disabled={saving || !channelId || !channelSecret}>
            {saving ? 'กำลังบันทึก...' : 'เชื่อมต่อ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: 3) การเชื่อมต่อ LINE OA — ข้อ B */}
      <Dialog open={openHowTo} onClose={() => setOpenHowTo(false)} fullWidth maxWidth="md">
        <DialogTitle>Tips : การเชื่อมต่อ LINE OA (Channel ID / Channel secret)</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
          {/* B1 */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                1) เข้าสู่ LINE Official Account Manager แล้วกด “Create new”
              </Typography>
              <Typography variant="body2" color="text.secondary">
                สร้างบัญชี LINE OA ใหม่ หากยังไม่มี (กรอกข้อมูลชื่อ ประเภท ธุรกิจ ฯลฯ ให้ครบ)
              </Typography>
            </CardContent>
            <ImgStep src={IMG.create} alt="Create new Official Account" caption="ตัวอย่าง: หน้าสร้าง OA ใหม่" />
          </Card>

          {/* B2 */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>2) กรอกรายละเอียดให้ครบถ้วน</Typography>
              <Typography variant="body2" color="text.secondary">ตรวจสอบชื่อ รูปภาพ และข้อมูลธุรกิจให้ถูกต้องก่อนดำเนินการต่อ</Typography>
            </CardContent>
            <ImgStep src={IMG.form} alt="OA Form" />
          </Card>

          {/* B3 */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>3) ตรวจสอบข้อมูลและกด “เสร็จสิ้น”</Typography>
            </CardContent>
            <ImgStep src={IMG.done} alt="Complete OA" />
          </Card>

          {/* B4 */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>4) กลับไปเลือก Account ที่สร้างจากรายการ (List)</Typography>
            </CardContent>
            <ImgStep src={IMG.list} alt="OA List" />
          </Card>

          {/* B5 */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>5) กด “Settings” มุมขวาบนของ OA</Typography>
            </CardContent>
            <ImgStep src={IMG.settings} alt="OA Settings" />
          </Card>

          {/* B6 */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>6) ไปที่หัวข้อ “Messaging API” และกด “Enable Messaging API”</Typography>
            </CardContent>
            <ImgStep src={IMG.enable} alt="Enable Messaging API" />
          </Card>

          {/* B7 */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>7) เลือก Provider ที่ต้องการหรือสร้าง Provider ใหม่</Typography>
            </CardContent>
            <ImgStep src={IMG.provider} alt="Choose Provider" />
          </Card>

          {/* B8 */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>8) กด “OK”</Typography>
            </CardContent>
            <ImgStep src={IMG.ok} alt="Confirm OK" />
          </Card>

          {/* B9 */}
          <Card variant="outlined">
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>9) ดูค่า Channel ID / Channel secret</Typography>
              <Typography variant="body2" color="text.secondary">
                - แท็บ <b>Basic settings</b>: ดู <b>Channel ID</b><br/>
                - แท็บ <b>Messaging API</b>: เลื่อนลงเพื่อดู <b>Channel secret</b>
              </Typography>
            </CardContent>
            <ImgStep src={IMG.check} alt="Channel ID / Channel secret" />
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>ใช้ค่าเหล่านี้กับระบบเราอย่างไร?</Typography>
              <Typography variant="body2" color="text.secondary">
                เปิด <b>Accounts</b> → กด <b>Add LINE OA</b> → วาง <em>Channel ID</em> และ <em>Channel secret</em> แล้วเชื่อมต่อ
                (ถ้าเคยเชื่อมแล้ว ระบบจะอัปเดตข้อมูล/โทเค็นล่าสุดให้ ไม่สร้างซ้ำ)
              </Typography>
              <Box sx={{ mt: 1 }}>
                <MuiLink href="https://developers.line.biz/en/" target="_blank" rel="noreferrer">
                  เปิด LINE Developers Console <OpenInNewIcon fontSize="inherit" />
                </MuiLink>
              </Box>
            </CardContent>
          </Card>

          <Alert severity="info">
            <b>หมายเหตุ:</b> ถ้าไม่เห็น <em>Channel secret</em> ให้ตรวจสิทธิ์ใน Provider/Project และยืนยันว่า Channel เป็น <b>Messaging API</b>
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
                          edge="end" size="small"
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
