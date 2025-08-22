import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

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
import FriendsPage from './pages/FriendsPage';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <Routes>
      {/* Public landing */}
      <Route path="/" element={<App />} />

      {/* ✅ Public workspace (guest เข้าได้) */}
      <Route path="/homepage" element={<HomePage />}>
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
        <Route path="friends" element={<FriendsPage />} />
        <Route path="live-chat" element={<LiveChatPage />} />

        {/* Admin (ยังตรวจสิทธิ์ในหน้าเดิม) */}
        <Route element={<RequireAdmin />}>
          <Route path="admin/templates" element={<AdminTemplatesPage />} />
          <Route path="admin/templates/new" element={<AdminTemplateEditorPage />} />
          <Route path="admin/templates/:id" element={<AdminTemplateEditorPage />} />
        </Route>
      </Route>

      {/* ✅ Protected เฉพาะ accounts */}
      <Route element={<RequireAuth />}>
        <Route path="/accounts" element={<AccountsPage />} />
      </Route>

      {/* fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);
