// src/components/LineSignInButton.jsx
import React from 'react';

export default function LineSignInButton({ tenantId }) {
  const start = () => {
    const u = new URL('/auth/line/start', window.location.origin);
    if (tenantId) u.searchParams.set('tenantId', tenantId);
    window.location.href = u.toString();
  };
  return (
    <button onClick={start} style={{ padding: '8px 12px' }}>
      Sign in with LINE
    </button>
  );
}
