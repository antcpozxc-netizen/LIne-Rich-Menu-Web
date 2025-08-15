// src/pages/HomePage.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppBar, Toolbar, Typography, Box, Avatar, Drawer, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, Collapse, Button,
  Tabs, Tab, Divider, IconButton, Dialog, DialogTitle, DialogContent,
  ListItemAvatar, ListItemSecondaryAction, Tooltip, Chip
} from '@mui/material';
import {
  ExpandLess, ExpandMore, Send as SendIcon, Image as ImageIcon,
  Chat as ChatIcon, TableChart as TableChartIcon,
  Logout as LogoutIcon, Menu as MenuIcon, Group as GroupIcon, SwapHoriz as SwapIcon
} from '@mui/icons-material';

import { useNavigate, useLocation, useSearchParams, Outlet } from 'react-router-dom';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, doc, getDoc, onSnapshot, query, where
} from 'firebase/firestore';

const drawerWidthExpanded = 240;
const drawerWidthCollapsed = 60;

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // UI toggles
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [richMessageOpen, setRichMessageOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatScreenOpen, setChatScreenOpen] = useState(false);

  // auth + user profile (สั้น ๆ เอาเฉพาะ auth user)
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  
  // --- profile from Firestore ---
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(ref, (snap) => setProfile(snap.data() || null));
    return () => unsub();
  }, [user]);

  // OA active
  const [activeTenantId, setActiveTenantId] = useState(null);
  const [tenant, setTenant] = useState(null);

  // list OA ที่ฉันเข้าถึง (owner หรือ member)
  const [myTenants, setMyTenants] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // --- Auth guard ---
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
      if (!u) navigate('/', { replace: true });
    });
  }, [navigate]);

  // --- subscribe โปรไฟล์จาก Firestore: users/{uid} ---
  useEffect(() => {
    if (!user) { setProfile(null); return; }
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(ref, (snap) => setProfile(snap.data() || null));
    return () => unsub();
  }, [user]);

  // --- อ่าน tenantId จาก URL, ถ้าไม่มีลองเอาจาก localStorage ---
  useEffect(() => {
    if (!ready) return;
    const tFromUrl = searchParams.get('tenant');
    if (tFromUrl) {
      setActiveTenantId(tFromUrl);
      localStorage.setItem('activeTenantId', tFromUrl);
      return;
    }
    const tFromLocal = localStorage.getItem('activeTenantId');
    if (tFromLocal) {
      // sync กลับขึ้น URL ให้สวย
      setSearchParams({ tenant: tFromLocal }, { replace: true });
      setActiveTenantId(tFromLocal);
      return;
    }
    // ไม่มีทั้งคู่ -> กลับหน้า accounts ให้ผู้ใช้เลือก OA
    navigate('/accounts', { replace: true });
  }, [ready, searchParams, setSearchParams, navigate]);

  // --- subscribe tenant doc ---
  useEffect(() => {
    if (!activeTenantId) return;
    const ref = doc(db, 'tenants', activeTenantId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setTenant(null);
        return;
      }
      setTenant({ id: snap.id, ...snap.data() });
    }, (err) => {
      console.error('[tenant:onSnapshot] error', err);
      setTenant(null);
    });
    return () => unsub();
  }, [activeTenantId]);

  // --- load OA list ที่ฉันเข้าถึง (owner หรือ member) สำหรับ dialog switch ---
  useEffect(() => {
    if (!user) return;
    const acc = { owner: [], member: [] };
    const unsubs = [];
    unsubs.push(onSnapshot(query(collection(db, 'tenants'), where('ownerUid', '==', user.uid)), (snap) => {
      acc.owner = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyTenants(mergeUnique(acc.owner, acc.member));
    }));
    unsubs.push(onSnapshot(query(collection(db, 'tenants'), where('members', 'array-contains', user.uid)), (snap) => {
      acc.member = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyTenants(mergeUnique(acc.owner, acc.member));
    }));
    return () => unsubs.forEach(u => u());
  }, [user]);

  const mergeUnique = (a, b) => {
    const m = new Map();
    [...a, ...b].forEach(x => m.set(x.id, x));
    return Array.from(m.values()).sort((x, y) => (x.displayName || '').localeCompare(y.displayName || ''));
  };

  // Tabs
  const tabValue = location.pathname.includes('/homepage/insight') ? 1 : 0;
  const handleTabChange = (_, newValue) => {
    if (newValue === 0) navigate('/homepage' + (activeTenantId ? `?tenant=${activeTenantId}` : ''));
    if (newValue === 1) navigate('/homepage/insight' + (activeTenantId ? `?tenant=${activeTenantId}` : ''));
  };

  // เลือก OA ใหม่
  const switchTenant = (t) => {
    setPickerOpen(false);
    if (!t?.id) return;
    localStorage.setItem('activeTenantId', t.id);
    setSearchParams({ tenant: t.id }, { replace: true });
    setActiveTenantId(t.id);
  };

  const logout = () => signOut(auth).then(() => navigate('/', { replace: true }));

  // ===== Derived values for AppBar (แสดงรูป/ชื่อ/LINE userId) =====
  const userDisplayName =
    profile?.displayName ||
    user?.displayName ||
    user?.providerData?.[0]?.displayName ||
    (user?.uid ? `User ${user.uid.slice(-6)}` : 'User');

  const userPhotoURL =
    profile?.photoURL ||
    user?.photoURL ||
    user?.providerData?.[0]?.photoURL || '';

  const userLineId = profile?.line?.userId || null;
  
  if (!ready) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Top Navbar */}
      <AppBar
        position="fixed"
        sx={{ backgroundColor: '#66bb6a', zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton color="inherit" edge="start" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h6"
              sx={{ fontWeight: 'bold', cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              Line Rich Menus Web
            </Typography>
          </Box>

          {/* Right: OA + User + Switch + Logout */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* OA info */}
            {tenant ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1.5, borderRight: '1px solid rgba(255,255,255,.3)' }}>
                <Avatar src={tenant.pictureUrl || undefined} sx={{ bgcolor: '#2e7d32' }}>
                  {!tenant.pictureUrl && (tenant.displayName?.[0] || 'O')}
                </Avatar>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography sx={{ color: '#fff', fontWeight: 600, lineHeight: 1.1 }}>
                    {tenant.displayName || 'OA'}
                  </Typography>
                  {tenant.basicId && (
                    <Typography sx={{ color: '#e8f5e9', fontSize: 12, lineHeight: 1.1 }}>
                      {tenant.basicId}
                    </Typography>
                  )}
                </Box>
                <Button
                  onClick={() => setPickerOpen(true)}
                  variant="outlined"
                  size="small"
                  startIcon={<SwapIcon />}
                  sx={{ color: '#fff', borderColor: '#fff', textTransform: 'none', ml: 1 }}
                >
                  Switch OA
                </Button>
              </Box>
            ) : (
              <Button variant="outlined" size="small" onClick={() => setPickerOpen(true)} sx={{ color: '#fff', borderColor: '#fff' }}>
                Select OA
              </Button>
            )}

            {/* Current user */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar src={userPhotoURL || undefined} alt={userDisplayName} sx={{ bgcolor: '#004d40' }}>
                {!userPhotoURL && (userDisplayName?.[0] || 'U')}
              </Avatar>
              <Box sx={{ display: 'flex', flexDirection: 'column', maxWidth: 220 }}>
                <Typography sx={{ color: '#fff', fontWeight: 600, lineHeight: 1.1 }} noWrap>
                  {userDisplayName}
                </Typography>
                {userLineId && (
                  <Typography sx={{ color: '#e8f5e9', fontSize: 12, lineHeight: 1.1 }} noWrap>
                    LINE: {userLineId}
                  </Typography>
                )}
              </Box>
            </Box>

            <Button
              variant="contained"
              color="error"
              startIcon={<LogoutIcon />}
              onClick={logout}
            >
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: sidebarOpen ? drawerWidthExpanded : drawerWidthCollapsed,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: sidebarOpen ? drawerWidthExpanded : drawerWidthCollapsed,
            boxSizing: 'border-box',
            backgroundColor: '#f7f7f7',
            transition: 'width 0.3s',
            overflowX: 'hidden',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <List>
            {/* Broadcast */}
            <ListItem disablePadding>
              <ListItemButton onClick={() => setBroadcastOpen(!broadcastOpen)}>
                <ListItemIcon><SendIcon /></ListItemIcon>
                {sidebarOpen && <ListItemText primary="Broadcast" />}
                {sidebarOpen && (broadcastOpen ? <ExpandLess /> : <ExpandMore />)}
              </ListItemButton>
            </ListItem>
            <Collapse in={broadcastOpen && sidebarOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/broadcast?tenant=${activeTenantId || ''}`)}>
                  <ListItemText primary="Broadcast List" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/broadcast/new?tenant=${activeTenantId || ''}`)}>
                  <ListItemText primary="New Broadcast" />
                </ListItemButton>
              </List>
            </Collapse>

            {/* Rich Message */}
            <ListItem disablePadding>
              <ListItemButton onClick={() => setRichMessageOpen(!richMessageOpen)}>
                <ListItemIcon><ImageIcon /></ListItemIcon>
                {sidebarOpen && <ListItemText primary="Rich Message" />}
                {sidebarOpen && (richMessageOpen ? <ExpandLess /> : <ExpandMore />)}
              </ListItemButton>
            </ListItem>
            <Collapse in={richMessageOpen && sidebarOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/rich-message?tenant=${activeTenantId || ''}`)}>
                  <ListItemText primary="rich message List" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/rich-message/new?tenant=${activeTenantId || ''}`)}>
                  <ListItemText primary="new rich message" />
                </ListItemButton>
              </List>
            </Collapse>

            {/* Chat Screen */}
            <ListItem disablePadding>
              <ListItemButton onClick={() => setChatScreenOpen(!chatScreenOpen)}>
                <ListItemIcon><ChatIcon /></ListItemIcon>
                {sidebarOpen && <ListItemText primary="Chat Screen" />}
                {sidebarOpen && (chatScreenOpen ? <ExpandLess /> : <ExpandMore />)}
              </ListItemButton>
            </ListItem>
            <Collapse in={chatScreenOpen && sidebarOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/greeting-message?tenant=${activeTenantId || ''}`)}>
                  <ListItemText primary="Greeting Message" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/rich-menus?tenant=${activeTenantId || ''}`)}>
                  <ListItemText primary="Rich Menus" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/template-rich-menus?tenant=${activeTenantId || ''}`)}>
                  <ListItemText primary="Template Rich Menus" />
                </ListItemButton>
              </List>
            </Collapse>

            {/* Friends */}
            <ListItem disablePadding>
              <ListItemButton onClick={() => navigate(`/homepage/friends?tenant=${activeTenantId || ''}`)}>
                <ListItemIcon><TableChartIcon /></ListItemIcon>
                {sidebarOpen && <ListItemText primary="Friends" />}
              </ListItemButton>
            </ListItem>
          </List>

          <Divider />
          <Box sx={{ mt: 'auto', p: 2 }}>
            <Button
              variant="contained"
              color="error"
              startIcon={<LogoutIcon />}
              fullWidth={sidebarOpen}
              onClick={logout}
            >
              {sidebarOpen ? 'Log out' : ''}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, bgcolor: '#fff', minHeight: '100vh' }}>
        <Toolbar />
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Home" />
          <Tab label="Insight" />
        </Tabs>
        <Box sx={{ p: 3 }}>
          {/* ส่ง context ให้เพจย่อย */}
          <Outlet context={{ tenantId: activeTenantId, tenant }} />
        </Box>
      </Box>

      {/* Dialog: เลือก OA */}
      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>เลือก LINE OA ของคุณ</DialogTitle>
        <DialogContent dividers>
          <List dense>
            {myTenants.map((t) => (
              <ListItem key={t.id} secondaryAction={
                <Button size="small" variant="outlined" onClick={() => switchTenant(t)}>
                  ใช้ตัวนี้
                </Button>
              }>
                <ListItemAvatar>
                  <Avatar src={t.pictureUrl || undefined}>{!t.pictureUrl && (t.displayName?.[0] || 'O')}</Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                      <span>{t.displayName || 'OA'}</span>
                      {t.ownerUid === user?.uid ? <Chip size="small" label="Owner" /> : <Chip size="small" variant="outlined" label="Member" />}
                    </Box>
                  }
                  secondary={t.basicId || t.channelId}
                />
              </ListItem>
            ))}
            {myTenants.length === 0 && (
              <Box sx={{ color:'#777', p: 1 }}>
                ยังไม่มี OA ที่เข้าถึงได้ — กลับไปเพิ่มจากหน้า Accounts ก่อน
              </Box>
            )}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
