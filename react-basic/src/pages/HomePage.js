// src/pages/HomePage.js
import React, { useEffect, useState } from 'react';
import {
  AppBar, Toolbar, Typography, Box, Avatar, Drawer, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, Collapse, Button,
  Tab, Divider, IconButton, Dialog, DialogTitle, DialogContent,
  ListItemAvatar, Chip, Tabs, Tooltip
} from '@mui/material';
import {
  ExpandLess, ExpandMore, Send as SendIcon, Image as ImageIcon,
  Chat as ChatIcon,
  Logout as LogoutIcon, Login as LoginIcon, Menu as MenuIcon, SwapHoriz as SwapIcon,
  AdminPanelSettings as AdminIcon, HelpOutline as HelpIcon
} from '@mui/icons-material';

import { useNavigate, useLocation, useSearchParams, Outlet } from 'react-router-dom';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import GuestGate from '../components/GuestGate';
import { loginWithLine, fullLogout } from '../lib/authx';
import useAuthClaims  from '../lib/useAuthClaims';

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

  // auth + profile
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
      return onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
      if (!u) {
        // ผู้ใช้หลุด/ออก -> ลืม OA ที่เลือกไว้
        try { localStorage.removeItem('activeTenantId'); } catch {}
      }
    });
  }, []);

  // claims/admin (เผื่อมี)
  // claims/admin (เผื่อมี)
  useEffect(() => {
    let unsub = () => {};
    setIsAdmin(false);

    if (user) {
      unsub = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
        const p = snap.data() || {};
        setProfile(p);

        // ดึง custom claims มาดูด้วย
        let claimsAdmin = false;
        try {
          const idt = await auth.currentUser.getIdTokenResult(true);
          claimsAdmin = !!idt.claims?.admin;
        } catch {}

        // ตรวจครบทั้ง 3 เงื่อนไข
        const ok = !!p.isAdmin || p.role === 'admin' || claimsAdmin;
        setIsAdmin(ok);
      });
    } else {
      setProfile(null);
      setIsAdmin(false);
    }
    return () => unsub();
  }, [user]);


  // OA active
  const [activeTenantId, setActiveTenantId] = useState(null);
  const [tenant, setTenant] = useState(null);

  // ใช้ custom claims สำหรับสิทธิ์ฝั่งเมนู
  const { isAdmin: claimsAdmin, isHead, isDev } = useAuthClaims();

  // เมื่อมีพารามิเตอร์ tenant ก็จำไว้ใน localStorage (ทั้ง guest และ user ใช้ได้เหมือนกัน)
  useEffect(() => {
    const tFromUrl = searchParams.get('tenant');
    if (tFromUrl) {
      setActiveTenantId(tFromUrl);
      localStorage.setItem('activeTenantId', tFromUrl);
      return;
    }
    const tFromLocal = localStorage.getItem('activeTenantId');
    if (tFromLocal) {
      setActiveTenantId(tFromLocal);
      setSearchParams({ tenant: tFromLocal }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // subscribe tenant doc (ถ้ามี id)
  useEffect(() => {
    if (!activeTenantId) { setTenant(null); return; }
    const ref = doc(db, 'tenants', activeTenantId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) { setTenant(null); return; }
      setTenant({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [activeTenantId]);

  // list OA ของฉัน (เฉพาะตอนล็อกอิน)
  const [myTenants, setMyTenants] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (!user) { setMyTenants([]); return; }
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
    return () => unsubs.forEach(fn => fn());
  }, [user]);

  const mergeUnique = (a, b) => {
    const m = new Map();
    [...a, ...b].forEach(x => m.set(x.id, x));
    return Array.from(m.values()).sort((x, y) => (x.displayName || '').localeCompare(y.displayName || ''));
  };

  // Tabs: ตัด Insight ออก → เหลือแท็บเดียว
  const tabValue = 0;
  const handleTabChange = () => {};

  const tenantQuery = activeTenantId ? `?tenant=${activeTenantId}` : '';
  const allowAdminMenu = isAdmin || claimsAdmin || isHead || isDev;


  const switchTenant = (t) => {
    setPickerOpen(false);
    if (!t?.id) return;
    localStorage.setItem('activeTenantId', t.id);
    setSearchParams({ tenant: t.id }, { replace: true });
    setActiveTenantId(t.id);
  };

  
  const logout = async () => {
    await fullLogout('/');
  };

  const userDisplayName =
    profile?.displayName ||
    user?.displayName ||
    user?.providerData?.[0]?.displayName ||
    (user?.uid ? `User ${user.uid.slice(-6)}` : 'Guest');

  const userPhotoURL =
    profile?.photoURL ||
    user?.photoURL ||
    user?.providerData?.[0]?.photoURL || '';

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
            >
              Line Rich Menus Web
            </Typography>
          </Box>

          {/* Right: Tips + OA + User + Switch + Login/Logout */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              startIcon={<HelpIcon />}
              variant="outlined"
              size="small"
              onClick={() => navigate(`/homepage/tips${activeTenantId ? `?tenant=${activeTenantId}` : ''}`)}
              sx={{ color: '#fff', borderColor: '#fff', textTransform: 'none' }}
            >
              Tips : คู่มือการใช้งาน
            </Button>
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
                  {typeof (tenant?.friendsCount ?? tenant?.stats?.friends) !== 'undefined' && (
                    <Typography sx={{ color: '#e8f5e9', fontSize: 12, lineHeight: 1.1 }}>
                      Friends: {tenant.friendsCount ?? tenant.stats?.friends}
                    </Typography>
                  )}
                </Box>
                {user ? (
                  <Button
                    onClick={() => navigate(`/accounts?next=${encodeURIComponent(location.pathname + location.search)}`)}
                    variant="outlined"
                    size="small"
                    startIcon={<SwapIcon />}
                    sx={{ color: '#fff', borderColor: '#fff', textTransform: 'none', ml: 1 }}
                  >
                    Switch OA
                  </Button>
                ) : (
                  <Tooltip title="ต้อง Login ก่อนจึงจะเลือก OA ได้">
                    <span>
                      <Button disabled variant="outlined" size="small" sx={{ color: '#fff', borderColor: '#fff', textTransform: 'none', ml: 1 }}>
                        Switch OA
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </Box>
            ) : (
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  if (user) {
                    navigate(`/accounts?next=${encodeURIComponent(location.pathname + location.search)}`);
                  } else {
                    const afterLogin = `/accounts?next=${encodeURIComponent(location.pathname + location.search)}`;
                    loginWithLine(afterLogin);
                  }
                }}
                sx={{ color: '#fff', borderColor: '#fff' }}
              >
                {user ? 'Select OA' : 'Login to Select OA'}
              </Button>
            )}

            {/* Current user */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar src={userPhotoURL || undefined} alt={userDisplayName} sx={{ bgcolor: '#004d40' }}>
                {!userPhotoURL && (userDisplayName?.[0] || 'U')}
              </Avatar>
              <Box sx={{ display: 'flex', flexDirection: 'column', maxWidth: 220 }}>
                <Typography sx={{ color: '#fff', fontWeight: 600, lineHeight: 1.1 }} noWrap>
                  {user ? userDisplayName : 'Guest'}
                </Typography>
              </Box>
            </Box>

            {user ? (
              <Button
                variant="contained"
                color="error"
                startIcon={<LogoutIcon />}
                onClick={logout}
              >
                Logout
              </Button>
            ) : (
              <Button
                variant="contained"
                color="inherit"
                startIcon={<LoginIcon />}
                onClick={() => loginWithLine(location.pathname + location.search)}
              >
                Login
              </Button>
            )}
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
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/broadcast${activeTenantId ? `?tenant=${activeTenantId}` : ''}`)}>
                  <ListItemText primary="Broadcast List" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/broadcast/new${activeTenantId ? `?tenant=${activeTenantId}` : ''}`)}>
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
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/rich-message${activeTenantId ? `?tenant=${activeTenantId}` : ''}`)}>
                  <ListItemText primary="Rich Message List" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/rich-message/new${activeTenantId ? `?tenant=${activeTenantId}` : ''}`)}>
                  <ListItemText primary="New Rich Message" />
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
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/greeting-message${activeTenantId ? `?tenant=${activeTenantId}` : ''}`)}>
                  <ListItemText primary="Greeting Message" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/rich-menus${activeTenantId ? `?tenant=${activeTenantId}` : ''}`)}>
                  <ListItemText primary="Rich Menus" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/template-rich-menus${activeTenantId ? `?tenant=${activeTenantId}` : ''}`)}>
                  <ListItemText primary="Template Rich Menus" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate(`/homepage/live-chat${activeTenantId ? `?tenant=${activeTenantId}` : ''}`)}>
                  <ListItemText primary="Live Chat" />
                </ListItemButton>
              </List>
            </Collapse>

            {/* Admin group */}
            {allowAdminMenu && (
              <>
                <Divider sx={{ my: 1 }} />
                <ListItem disablePadding>
                  <ListItemButton onClick={() => navigate(`/homepage/admin/templates${tenantQuery}`)}>
                    <ListItemIcon><AdminIcon /></ListItemIcon>
                    {sidebarOpen && <ListItemText primary="Add Template Rich Menus" />}
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton onClick={() => navigate(`/homepage/admin/users${tenantQuery}`)}>
                    <ListItemIcon><AdminIcon /></ListItemIcon>
                    {sidebarOpen && <ListItemText primary="Administrator management" />}
                  </ListItemButton>
                </ListItem>
              </>
            )}
          </List>

          <Divider />
          <Box sx={{ mt: 'auto', p: 2 }}>
            {user ? (
              <Button
                variant="contained"
                color="error"
                startIcon={<LogoutIcon />}
                fullWidth={sidebarOpen}
                onClick={logout}
              >
                {sidebarOpen ? 'Log out' : ''}
              </Button>
            ) : (
              <Button
                variant="contained"
                startIcon={<LoginIcon />}
                fullWidth={sidebarOpen}
                onClick={() => loginWithLine(window.location.pathname + window.location.search)}
              >
                {sidebarOpen ? 'Login' : ''}
              </Button>
            )}
          </Box>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, bgcolor: '#fff', minHeight: '100vh' }}>
        <Toolbar />
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab
            label="Home"
            onClick={() => navigate(`/homepage${activeTenantId ? `?tenant=${activeTenantId}` : ''}`)}
          />
        </Tabs>

        {/* แถบแจ้ง Guest Mode */}
        <Box sx={{ p: 2 }}>
          <GuestGate
            visible={!user}
            nextPath={location.pathname + location.search}
          />
        </Box>

        <Box sx={{ p: 3, pt: 0 }}>
          <Outlet context={{ tenantId: activeTenantId, tenant }} />
        </Box>
      </Box>

      {/* Dialog: เลือก OA */}
      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>เลือก LINE OA ของคุณ</DialogTitle>
        <DialogContent dividers>
          <List dense>
            {myTenants.map((t) => (
              <ListItem
                key={t.id}
                secondaryAction={
                  <Button size="small" variant="outlined" onClick={() => switchTenant(t)}>
                    ใช้ตัวนี้
                  </Button>
                }
              >
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
                ยังไม่มี OA ที่เข้าถึงได้ — ไปที่ “Accounts” เพื่อเชื่อม OA หลังจาก Login
              </Box>
            )}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
