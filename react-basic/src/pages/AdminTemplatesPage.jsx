// src/pages/AdminTemplatesPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Card, CardActionArea, CardContent, Chip, Container,
  Grid, IconButton, Stack, Typography, Tooltip
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { useNavigate, useSearchParams, useOutletContext } from 'react-router-dom';
import { auth } from '../firebase';
import { CATEGORY_OPTIONS } from '../constants/categories';

async function authedFetch(url, opts = {}) {
  const token = await auth.currentUser?.getIdToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}), Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...opts, headers });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt || res.statusText);
  return txt ? JSON.parse(txt) : {};
}

export default function AdminTemplatesPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { tenantId: ctxTenantId } = useOutletContext() || {};
  const tenantId = ctxTenantId || sp.get('tenant') || '';

  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [cat, setCat]       = useState('');

  const load = async () => {
    const j = await authedFetch('/api/admin/templates');
    setItems(j.items || []);
  };

  useEffect(() => {
    (async () => {
      try { await load(); }
      catch (e) { setError(e?.message || String(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const cats = useMemo(
    () => Array.from(new Set([...CATEGORY_OPTIONS, ...items.map(i => i.category).filter(Boolean)])),
    [items]
  );
  const filtered = useMemo(
    () => items.filter(i => !cat || i.category === cat),
    [items, cat]
  );

  const large   = filtered.filter(t => (t.size || 'large') === 'large');
  const compact = filtered.filter(t => t.size === 'compact');

  const onDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    await authedFetch(`/api/admin/templates/${id}`, { method: 'DELETE' });
    await load();
  };

  const applyTemplate = (t) => {
    if (!tenantId) { alert('กรุณาเลือก OA ก่อน'); return; }
    navigate(`/homepage/rich-menus/new?tenant=${tenantId}`, {
      state: { prefill: { size: t.size, imageUrl: t.imageUrl, chatBarText: t.chatBarText, areas: t.areas, title: t.title } }
    });
  };

  const toEdit   = (t) => navigate(`/homepage/admin/templates/${t.id}${tenantId ? `?tenant=${tenantId}` : ''}`);
  const toCreate = ()   => navigate(`/homepage/admin/templates/new${tenantId ? `?tenant=${tenantId}` : ''}`);

  const renderGrid = (list) => (
    <Grid container spacing={2}>
      {list.map(t => (
        <Grid item key={t.id} xs={12} sm={6} md={4} lg={3}>
          <Card variant="outlined">
            <CardActionArea onClick={() => toEdit(t)}>
              <Box sx={{
                height: 160,
                backgroundImage: t.imageUrl ? `url(${t.imageUrl})` : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                backgroundSize: 'contain',
                bgcolor: '#f5f5f5'
              }}/>
            </CardActionArea>
            <CardContent sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>{t.title || '(Untitled)'}</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={t.size || 'large'} />
                  {t.category && <Chip size="small" variant="outlined" label={t.category} />}
                </Stack>
              </Box>
              <Box>
                <Tooltip title="Use this template">
                  <IconButton color="success" onClick={() => applyTemplate(t)}>▶</IconButton>
                </Tooltip>
                <Tooltip title="Edit">
                  <IconButton onClick={() => toEdit(t)}><EditIcon/></IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton color="error" onClick={() => onDelete(t.id)}><DeleteIcon/></IconButton>
                </Tooltip>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight="bold">Admin: Rich Menu Templates</Typography>
        <Button variant="contained" onClick={toCreate}>+ New Template</Button>
      </Stack>

      {/* Category filter */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <Chip label="All" clickable onClick={() => setCat('')}
              color={!cat ? 'success' : 'default'} variant={!cat ? 'filled' : 'outlined'} />
        {cats.map(c => (
          <Chip key={c} label={c} clickable onClick={() => setCat(c)}
                color={cat === c ? 'success' : 'default'}
                variant={cat === c ? 'filled' : 'outlined'} />
        ))}
      </Stack>

      {loading && <Box sx={{ p: 4 }}>Loading templates…</Box>}
      {!!error && !loading && <Box sx={{ p: 4, color: 'error.main' }}>เปิดรายการเทมเพลตไม่ได้: {error}</Box>}

      {!loading && !error && (
        <Box>
          {large.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Large</Typography>
              {renderGrid(large)}
            </Box>
          )}
          {compact.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Compact</Typography>
              {renderGrid(compact)}
            </Box>
          )}
          {large.length === 0 && compact.length === 0 && (
            <Box sx={{ color: 'text.secondary', p: 4 }}>No templates yet.</Box>
          )}
        </Box>
      )}
    </Container>
  );
}
