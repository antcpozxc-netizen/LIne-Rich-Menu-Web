// index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';

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


// อื่นๆ
import GreetingMessagePage from './pages/GreetingMessagePage';
import RichMenusPage from './pages/RichMenusPage';
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
      {/* Landing / หน้าเริ่มต้น -> มีปุ่มเริ่มต้นที่เรียก LINE Login */}
      <Route path="/" element={<App />} />

      {/* เส้นทางที่ต้องล็อกอินก่อน */}
      <Route element={<RequireAuth />}>
        <Route path="/accounts" element={<AccountsPage />} />

        {/* HomePage = Layout + Outlet */}
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
          {/* Others */}
          <Route path="greeting-message" element={<GreetingMessagePage />} />
          <Route path="rich-menus" element={<RichMenusPage />} />
          <Route path="template-rich-menus" element={<TemplateRichMenusPage />} />
          <Route path="friends" element={<FriendsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

