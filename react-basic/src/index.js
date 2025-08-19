// index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';

// Admin
import RequireAdmin from './routes/RequireAdmin';
import AdminTemplatesPage from './pages/AdminTemplatesPage';

import AccountsPage from './pages/AccountsPage';
import HomePage from './pages/HomePage';          // Layout
import DashboardHome from './pages/DashboardHome';// หน้า Home ในกรอบแดง
import InsightPage from './pages/InsightPage';    // แท็บ Insight

// Broadcast
import BroadcastListPage from './pages/BroadcastListPage';
import BroadcastPage from './pages/BroadcastPage'; // ตัวสร้างใหม่ (composer)

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

import FriendsPage from './pages/FriendsPage';

import RequireAuth from './routes/RequireAuth';

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
      {/* Public */}
      <Route path="/" element={<App />} />

      {/* ต้องล็อกอินก่อนทุกอย่างในบล็อกนี้ */}
      <Route element={<RequireAuth />}>
        <Route path="/accounts" element={<AccountsPage />} />

        {/* Layout หลัก */}
        <Route path="/homepage" element={<HomePage />}>
          <Route index element={<DashboardHome />} />
          <Route path="insight" element={<InsightPage />} />
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
          <Route path="friends" element={<FriendsPage />} />
        </Route>

        {/* ต้องล็อกอิน + เป็นแอดมิน */}
        <Route element={<RequireAdmin />}>
          <Route path="/admin/templates" element={<AdminTemplatesPage />} />
        </Route>
      </Route>

      {/* 404 → กลับหน้าแรก */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

