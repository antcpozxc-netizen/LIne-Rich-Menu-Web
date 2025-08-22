// src/routes/RedirectBroadcastIdToNew.js
import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

export default function RedirectBroadcastIdToNew() {
  const { id } = useParams();
  const { search } = useLocation();

  const sp = new URLSearchParams(search);
  const tenant = sp.get('tenant') || '';

  const qs = new URLSearchParams();
  if (tenant) qs.set('tenant', tenant);
  if (id) qs.set('draft', id);

  const to = `/homepage/broadcast/new${qs.toString() ? `?${qs.toString()}` : ''}`;
  return <Navigate to={to} replace />;
}
