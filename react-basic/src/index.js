// src/index.js  — Clean (no LIFF), split Task Bot vs Time Attendance, ready for Magic Link
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import AuthGate from './components/AuthGate';

// Guards
import RequireAdmin from './routes/RequireAdmin';
import RequireAuth from './routes/RequireAuth';

// Pages (common / homepage)
import AdminTemplatesPage from './pages/AdminTemplatesPage';
import AdminTemplateEditorPage from './pages/AdminTemplateEditorPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AccountsPage from './pages/AccountsPage';
import HomePageMain from './pages/HomePageMain';
import DashboardHome from './pages/DashboardHome';
import BroadcastListPage from './pages/BroadcastListPage';
import BroadcastPage from './pages/BroadcastPage';
import RedirectBroadcastIdToNew from './routes/RedirectBroadcastIdToNew';
import RichMessageListPage from './pages/RichMessageListPage';
import RichMessageCreatePage from './pages/RichMessageCreatePage';
import RichMessageDetailPage from './pages/RichMessageDetailPage';
import RichMenusPage from './pages/RichMenusPage';
import RichMenusListPage from './pages/RichMenusListPage';
import GreetingMessagePage from './pages/GreetingMessagePage';
import TemplateRichMenusPage from './pages/TemplateRichMenusPage';
import LiveChatPage from './pages/LiveChatPage';
import TipssPage from './pages/TipsPage';
import TaskAssignmentSettingsPage from './pages/TaskAssignmentSettingsPage';
import TimeAttendanceSettingsPage from './pages/TimeAttendanceSettingsPage';


// === Time Attendance (Non-LIFF) ===
import TASettingPage from './pages/TASettingPage';
import TARegisterPage from './pages/TARegisterPage';


// ===== Task Assignment / Bot (Magic Link zone) =====
import HomePage from './pages/HomePage';
import OnboardingPage from './pages/OnboardingPage';
import TasksPage from './pages/TasksPage';
import AdminUsersSplitPage from './pages/AdminUsersSplitPage';
import UsersAdminPage from './pages/UsersAdminPage';

// UI layout for /app/**
import AppHeader from './components/AppHeader';
import { ThemeProvider, createTheme, CssBaseline, Container } from '@mui/material';

const theme = createTheme({
  palette: {
    primary:   { main: '#06C755' },
    secondary: { main: '#00B900' },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: 'none', borderRadius: 12 } } },
    MuiCard:   { styleOverrides: { root: { borderRadius: 16 } } },
  },
});

// === Layout สำหรับโซน /app/**
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

// ... (import ทั้งหมดของไฟล์ index.js ด้านบนเหมือนเดิม)

// [LINE iOS fix] ปิด Service Worker + ลบ cache อัตโนมัติเมื่อเปิดผ่าน LINE WebView
(async () => {
  try {
    const ua = (navigator.userAgent || '').toLowerCase();
    if (!/ line\//.test(ua)) return;               // ทำเฉพาะที่เปิดจากแอป LINE

    // กันทำซ้ำในรอบเดียวกันของหน้า
    if (sessionStorage.getItem('__nosw_done') === '1') return;
    sessionStorage.setItem('__nosw_done', '1');
    sessionStorage.setItem('__nosw_busy', '1');

    if ('serviceWorker' in navigator) {
      // 1) ถอนทะเบียน SW ทั้งหมด
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => {})));

      // 2) ลบ cache ทั้งหมดที่ SW เคยสร้าง
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));

      // 3) ถ้ายังมี controller คุมอยู่ ให้รีโหลดหนึ่งครั้งเพื่อหลุดจาก SW เก่า
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!sessionStorage.getItem('__sw_reloaded')) {
            sessionStorage.setItem('__sw_reloaded', '1');
            window.location.reload();
          }
        });
        // เผื่อบางเครื่องไม่ยิง event ให้รีโหลดสำรอง
        setTimeout(() => {
          if (!sessionStorage.getItem('__sw_reloaded')) {
            sessionStorage.setItem('__sw_reloaded', '1');
            window.location.reload();
          }
        }, 300);
      }
    }
    // รอระบบนิ่งก่อนค่อยปลดธง busy (กัน RequireAuth รีไดเรกต์ทับ)
    setTimeout(() => { sessionStorage.removeItem('__nosw_busy'); }, 400);
  } catch {
  } finally {
    // เผื่อกรณี throw ก่อน setTimeout ด้านบน
    if (sessionStorage.getItem('__nosw_busy') === '1') {
      setTimeout(() => { sessionStorage.removeItem('__nosw_busy'); }, 500);
    }
  }  
})();


const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <BrowserRouter>
    <AuthGate />

    <Routes>
      {/* Landing */}
      <Route path="/" element={<App />} />

      {/* Public homepage zone */}
      <Route path="/homepage" element={<HomePageMain />}>
        <Route index element={<DashboardHome />} />
        <Route path="broadcast" element={<BroadcastListPage />} />
        <Route path="broadcast/new" element={<BroadcastPage />} />
        <Route path="broadcast/:id" element={<RedirectBroadcastIdToNew />} />
        <Route path="rich-message" element={<RichMessageListPage />} />
        <Route path="rich-message/new" element={<RichMessageCreatePage />} />
        <Route path="rich-message/:id" element={<RichMessageDetailPage />} />
        <Route path="rich-menus/new" element={<RichMenusPage />} />
        <Route path="rich-menus" element={<RichMenusListPage />} />
        <Route path="template-rich-menus" element={<TemplateRichMenusPage />} />
        <Route path="greeting-message" element={<GreetingMessagePage />} />
        <Route path="tips" element={<TipssPage />} />
        <Route path="live-chat" element={<LiveChatPage />} />
        <Route path="settings/taskbot" element={<TaskAssignmentSettingsPage />} />
        {/* สำหรับ backward-compat: หน้า settings/attendance (จะเช็คสิทธิ์ด้านในเพจ) */}
        <Route path="settings/attendance" element={<TimeAttendanceSettingsPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<RequireAdmin />}>
            <Route path="admin/templates" element={<AdminTemplatesPage />} />
            <Route path="admin/templates/new" element={<AdminTemplateEditorPage />} />
            <Route path="admin/templates/:id" element={<AdminTemplateEditorPage />} />
            <Route path="admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Route>

      {/* /accounts */}
      <Route element={<RequireAuth />}>
        <Route path="/accounts" element={<AccountsPage />} />
      </Route>

      {/* ===== Magic link zone ===== */}
      <Route element={<RequireAuth />}>
        <Route element={<MagicLayout />}>
          {/* --- Task Assignment / Bot --- */}
          <Route path="/app" element={<HomePage />} />
          <Route path="/app/onboarding" element={<OnboardingPage />} />
          <Route path="/app/tasks" element={<TasksPage />} />
        
          <Route path="/app/admin/users-split" element={<AdminUsersSplitPage />} />
          <Route path="/app/admin/users" element={<UsersAdminPage />} />
          

          {/* --- Time Attendance (Non-LIFF) --- */}
          <Route path="/app/attendance/register" element={<TARegisterPage />} />
          <Route path="/app/attendance/settings" element={<TASettingPage />} />
          
        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

// แจ้งว่า React mount แล้ว (เผื่อ component ฝั่งคุณใช้)
window.__REACT_ROOT_MOUNTED = true;
