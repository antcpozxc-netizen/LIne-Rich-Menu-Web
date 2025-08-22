// index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import {
  BrowserRouter, Routes, Route, Navigate, useParams, useLocation
} from 'react-router-dom';

// Guards
import RequireAdmin from './routes/RequireAdmin';
import RequireAuth from './routes/RequireAuth';

// Admin
import AdminTemplatesPage from './pages/AdminTemplatesPage';
import AdminTemplateEditorPage from './pages/AdminTemplateEditorPage';

import AccountsPage from './pages/AccountsPage';
import HomePage from './pages/HomePage';
import DashboardHome from './pages/DashboardHome';

// Broadcast
import BroadcastListPage from './pages/BroadcastListPage';
import BroadcastPage from './pages/BroadcastPage';

// Rich Message
import RichMessageListPage from './pages/RichMessageListPage';
import RichMessageCreatePage from './pages/RichMessageCreatePage';
import RichMessageDetailPage from './pages/RichMessageDetailPage';

// Rich Menus
import RichMenusPage from './pages/RichMenusPage';
import RichMenusListPage from './pages/RichMenusListPage';

// อื่นๆ
import GreetingMessagePage from './pages/GreetingMessagePage';
import TemplateRichMenusPage from './pages/TemplateRichMenusPage';
import LiveChatPage from './pages/LiveChatPage';
import FriendsPage from './pages/FriendsPage';

function RedirectBroadcastIdToNew() {
  const { id } = useParams();
  const { search } = useLocation();
  const sp = new URLSearchParams(search);
  const tenant = sp.get('tenant') || '';

  const qs = new URLSearchParams();
  if (tenant) qs.set('tenant', tenant);
  if (id) qs.set('draft', id);

  const q = qs.toString();
  const to = q ? `/homepage/broadcast/new?${q}` : `/homepage/broadcast/new`;
  return <Navigate to={to} replace />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <Routes>
      {/* เข้าหน้า Home ทันที (ยังเก็บ landing ไว้ที่ /welcome) */}
      <Route path="/" element={<Navigate to="/homepage" replace />} />
      <Route path="/welcome" element={<App />} />

      {/* HomePage “ไม่ต้องล็อกอิน” */}
      <Route path="/homepage" element={<HomePage />}>
        <Route index element={<DashboardHome />} />

        {/* ✅ โหมด Guest: ตัวสร้าง Rich Menu ที่ไม่ต้องล็อกอิน */}
        <Route path="guest/rich-menus" element={<RichMenusPage />} />

        {/* ✅ ส่วนที่ “ต้องล็อกอิน” ค่อยครอบด้วย RequireAuth ภายใน /homepage */}
        <Route element={<RequireAuth />}>
          {/* Broadcast */}
          <Route path="broadcast" element={<BroadcastListPage />} />
          <Route path="broadcast/new" element={<BroadcastPage />} />
          <Route path="broadcast/:id" element={<RedirectBroadcastIdToNew />} />

          {/* Rich Message */}
          <Route path="rich-message" element={<RichMessageListPage />} />
          <Route path="rich-message/new" element={<RichMessageCreatePage />} />
          <Route path="rich-message/:id" element={<RichMessageDetailPage />} />

          {/* Rich Menus (ผูกกับ Tenant) */}
          <Route path="rich-menus/new" element={<RichMenusPage />} />
          <Route path="rich-menus" element={<RichMenusListPage />} />
          <Route path="template-rich-menus" element={<TemplateRichMenusPage />} />

          {/* Others */}
          <Route path="greeting-message" element={<GreetingMessagePage />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="live-chat" element={<LiveChatPage />} />

          {/* Admin (ใต้ home layout) */}
          <Route element={<RequireAdmin />}>
            <Route path="admin/templates" element={<AdminTemplatesPage />} />
            <Route path="admin/templates/new" element={<AdminTemplateEditorPage />} />
            <Route path="admin/templates/:id" element={<AdminTemplateEditorPage />} />
          </Route>
        </Route>
      </Route>

      {/* Accounts ต้องล็อกอิน */}
      <Route element={<RequireAuth />}>
        <Route path="/accounts" element={<AccountsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/homepage" replace />} />
    </Routes>
  </BrowserRouter>
);
