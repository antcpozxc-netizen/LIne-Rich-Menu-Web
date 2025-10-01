// src/api/client.js
const j = async (res) => {
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new Error(isJson ? (body.error || body.message || res.statusText) : body);
  return body;
};

// ----- Users -----
export async function listUsers() {
  const res = await fetch('/api/users', { credentials: 'include' });
  return j(res);
}
export async function setUserRole(user_id, role) {
  const res = await fetch(`/api/users/${encodeURIComponent(user_id)}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ role })
  });
  return j(res);
}
export async function setUserStatus(user_id, status) {
  const res = await fetch(`/api/users/${encodeURIComponent(user_id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status })
  });
  return j(res);
}
export async function deleteUser(user_id) { // ตีความเป็น set inactive
  const res = await fetch(`/api/users/${encodeURIComponent(user_id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status: 'Inactive' })
  });
  return j(res);
}
export async function updateUserProfile(user_id, { username, real_name }) {
  const res = await fetch(`/api/users/${encodeURIComponent(user_id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, real_name })
  });
  return j(res);
}

// ----- Tasks -----
export async function listTasks(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => (v!=null && v!=='') && q.append(k, v));
  const res = await fetch(`/api/tasks?${q.toString()}`, { credentials: 'include' });
  return j(res);
}
export async function updateTaskStatus(task_id, status) {
  const res = await fetch(`/api/tasks/${encodeURIComponent(task_id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status })
  });
  return j(res);
}
export async function exportTasksCsv(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => (v!=null && v!=='') && q.append(k, v));
  const res = await fetch(`/api/tasks/export?${q.toString()}`, {
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date();
  a.download = `tasks_${ts.toISOString().slice(0,19).replace(/[:T]/g,'')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  return true;
}

// ----- Onboarding -----
export async function postOnboarding({ username, real_name, role }) {
  const res = await fetch('/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, real_name, role })
  });
  return j(res);
}
