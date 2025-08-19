// src/routes/RequireAdmin.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import useAuthClaims from '../lib/useAuthClaims';

export default function RequireAdmin() {
  const { isAdmin, loading } = useAuthClaims();
  if (loading) return null; // หรือสปินเนอร์ก็ได้
  return isAdmin ? <Outlet /> : <Navigate to="/homepage" replace />;
}
