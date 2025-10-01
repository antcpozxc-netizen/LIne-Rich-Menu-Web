// index.js

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import AuthGate from './components/AuthGate';

// Guards
import RequireAdmin from './routes/RequireAdmin';
import RequireAuth from './routes/RequireAuth';

// Admin (legacy/main site)
import AdminTemplatesPage from './pages/AdminTemplatesPage';
import AdminTemplateEditorPage from './pages/AdminTemplateEditorPage';
import AdminUsersPage from './pages/AdminUsersPage';

import AccountsPage from './pages/AccountsPage';
import HomePageMain from './pages/HomePageMain';
import DashboardHome from './pages/DashboardHome';

// Broadcast
import BroadcastListPage from './pages/BroadcastListPage';
import BroadcastPage from './pages/BroadcastPage';
import RedirectBroadcastIdToNew from './routes/RedirectBroadcastIdToNew';

// Rich Message
import RichMessageListPage from './pages/RichMessageListPage';
import RichMessageCreatePage from './pages/RichMessageCreatePage';
import RichMessageDetailPage from './pages/RichMessageDetailPage';

// Rich Menus
import RichMenusPage from './pages/RichMenusPage';
import RichMenusListPage from './pages/RichMenusListPage';

// Others
import GreetingMessagePage from './pages/GreetingMessagePage';
import TemplateRichMenusPage from './pages/TemplateRichMenusPage';
import LiveChatPage from './pages/LiveChatPage';
import TipssPage from './pages/TipsPage';

import TaskAssignmentSettingsPage from './pages/TaskAssignmentSettingsPage';

// ========= Magic Link zone (แยก namespace) =========
import HomePage from './pages/HomePage';
import OnboardingPage from './pages/OnboardingPage';
import TasksPage from './pages/TasksPage';
import AdminUsersSplitPage from './pages/AdminUsersSplitPage';
import UsersAdminPage from './pages/UsersAdminPage';

// >>> Header/Theme ใช้เฉพาะโซน /app/**
import AppHeader from './components/AppHeader';
import { ThemeProvider, createTheme, CssBaseline, Container } from '@mui/material';

const theme = createTheme({
  palette: {
    primary: { main: '#06C755' },   // LINE green
    secondary: { main: '#00B900' },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: 'none', borderRadius: 12 } } },
    MuiCard:   { styleOverrides: { root: { borderRadius: 16 } } },
  },
});

// Layout นี้จะใช้เฉพาะโซน /app/** เท่านั้น
function MagicLayout() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppHeader />
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Outlet />
      </Container>
    </ThemeProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    {/* ✅ ดัก #token ทุกหน้า (กิน token จาก /auth/magic) */}
    <AuthGate />

    <Routes>
      {/* Public landing (ไม่มี AppHeader) */}
      <Route path="/" element={<App />} />

      {/* PUBLIC: ให้ guest เข้า /homepage/** ได้ (ไม่มี AppHeader) */}
      <Route path="/homepage" element={<HomePageMain />}>
        <Route index element={<DashboardHome />} />
        {/* Broadcast */}
        <Route path="broadcast" element={<BroadcastListPage />} />
        <Route path="broadcast/new" element={<BroadcastPage />} />
        <Route path="broadcast/:id" element={<RedirectBroadcastIdToNew />} />
        {/* Rich Message */}
        <Route path="rich-message" element={<RichMessageListPage />} />
        <Route path="rich-message/new" element={<RichMessageCreatePage />} />
        <Route path="rich-message/:id" element={<RichMessageDetailPage />} />
        {/* Rich Menus */}
        <Route path="rich-menus/new" element={<RichMenusPage />} />
        <Route path="rich-menus" element={<RichMenusListPage />} />
        <Route path="template-rich-menus" element={<TemplateRichMenusPage />} />
        {/* Others */}
        <Route path="greeting-message" element={<GreetingMessagePage />} />
        <Route path="tips" element={<TipssPage />} />
        <Route path="live-chat" element={<LiveChatPage />} />
        <Route path="settings/taskbot" element={<TaskAssignmentSettingsPage />} />

        {/* Admin (ต้องล็อกอิน + admin เท่านั้น) */}
        <Route element={<RequireAuth />}>
          <Route element={<RequireAdmin />}>
            <Route path="admin/templates" element={<AdminTemplatesPage />} />
            <Route path="admin/templates/new" element={<AdminTemplateEditorPage />} />
            <Route path="admin/templates/:id" element={<AdminTemplateEditorPage />} />
            <Route path="admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Route>

      {/* /accounts ต้องล็อกอิน (ไม่มี AppHeader) */}
      <Route element={<RequireAuth />}>
        <Route path="/accounts" element={<AccountsPage />} />
      </Route>

      {/* ========= Magic Link zone (/app/**) — มี AppHeader ========= */}
      <Route element={<RequireAuth />}>
        <Route element={<MagicLayout />}>
          {/* Dashboard ภายใน */}
          <Route path="/app" element={<HomePage />} />
          {/* สมัคร/ตั้งค่าเริ่มต้น */}// เปิดหน้า Admin/จัดการผู้ใช้งาน จาก OA
          <Route path="/app/onboarding" element={<OnboardingPage />} />
          {/* งาน/หน้าฟังก์ชันหลัก */}
          <Route path="/app/tasks" element={<TasksPage />} />
          {/* ส่วนแอดมินสำหรับโซนนี้ */}
          <Route element={<RequireAdmin />}>
            <Route path="/app/admin/users-split" element={<AdminUsersSplitPage />} />
            <Route path="/app/admin/users" element={<UsersAdminPage />} />
          </Route>
        </Route>
      </Route>

      {/* 404 → กลับหน้าแรก */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);
