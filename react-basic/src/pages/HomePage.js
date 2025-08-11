import React, { useState } from 'react';
import {
  AppBar, Toolbar, Typography, Box, Avatar, Drawer, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, Collapse, Button,
  Tabs, Tab, Divider, IconButton
} from '@mui/material';
import {
  ExpandLess, ExpandMore, Send as SendIcon, Image as ImageIcon,
  Chat as ChatIcon, TableChart as TableChartIcon,
  Logout as LogoutIcon, Menu as MenuIcon
} from '@mui/icons-material';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';

const drawerWidthExpanded = 240;
const drawerWidthCollapsed = 60;

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [richMessageOpen, setRichMessageOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatScreenOpen, setChatScreenOpen] = useState(false);

  // sync tab กับ URL: /homepage = Home (index), /homepage/insight = Insight
  const tabValue = location.pathname.includes('/homepage/insight') ? 1 : 0;

  const handleTabChange = (_, newValue) => {
    if (newValue === 0) navigate('/homepage');          // DashboardHome (index route)
    if (newValue === 1) navigate('/homepage/insight');  // Insight
  };

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Top Navbar */}
      <AppBar
        position="fixed"
        sx={{
          backgroundColor: '#66bb6a',
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
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

          {/* Right: Profile */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: '#004d40' }}>U</Avatar>
            <Typography sx={{ color: '#fff' }}>UserName</Typography>
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
            {/* Broadcast menu (กดแล้วไปที่ /homepage/broadcast) */}
            <ListItem disablePadding>
              <ListItemButton onClick={() => setBroadcastOpen(!broadcastOpen)}>
                <ListItemIcon><SendIcon /></ListItemIcon>
                {sidebarOpen && <ListItemText primary="Broadcast" />}
                {sidebarOpen && (broadcastOpen ? <ExpandLess /> : <ExpandMore />)}
              </ListItemButton>
            </ListItem>
            <Collapse in={broadcastOpen && sidebarOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate('/homepage/broadcast')}>
                  <ListItemText primary="Broadcast List" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate('/homepage/broadcast/new')}>
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
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate('/homepage/rich-message')}>
                  <ListItemText primary="rich message List" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate('/homepage/rich-message/new')}>
                  <ListItemText primary="new rich message" />
                </ListItemButton>
              </List>
            </Collapse>

            {/* Chat Screen (ตัวอย่าง) */}
            <ListItem disablePadding>
              <ListItemButton onClick={() => setChatScreenOpen(!chatScreenOpen)}>
                <ListItemIcon><ChatIcon /></ListItemIcon>
                {sidebarOpen && <ListItemText primary="Chat Screen" />}
                {sidebarOpen && (chatScreenOpen ? <ExpandLess /> : <ExpandMore />)}
              </ListItemButton>
            </ListItem>
            <Collapse in={chatScreenOpen && sidebarOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate('/homepage/greeting-message')}>
                  <ListItemText primary="Greeting Message" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate('/homepage/rich-menus')}>
                  <ListItemText primary="Rich Menus" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} onClick={() => navigate('/homepage/template-rich-menus')}>
                  <ListItemText primary="Template Rich Menus" />
                </ListItemButton>
              </List>
            </Collapse>

            {/* Friends */}
            <ListItem disablePadding>
              <ListItemButton onClick={() => navigate('/homepage/friends')}>
                <ListItemIcon><TableChartIcon /></ListItemIcon>
                {sidebarOpen && <ListItemText primary="Friends" />}
              </ListItemButton>
            </ListItem>
          </List>

          <Divider />
          <Box sx={{ mt: 'auto', p: 2 }}>
            <Button variant="contained" color="error" startIcon={<LogoutIcon />} fullWidth={sidebarOpen}>
              {sidebarOpen ? 'Log out' : ''}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Main Content (พื้นที่วงกลมแดง) */}
      <Box component="main" sx={{ flexGrow: 1, bgcolor: '#fff', minHeight: '100vh' }}>
        <Toolbar />
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Home" />
          <Tab label="Insight" />
        </Tabs>
        <Box sx={{ p: 3 }}>
          {/* children ของ /homepage/* จะถูก render ตรงนี้ */}
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
