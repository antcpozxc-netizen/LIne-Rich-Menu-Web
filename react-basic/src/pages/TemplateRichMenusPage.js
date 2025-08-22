// src/pages/TemplateRichMenusPage.js

import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardActionArea, CardContent, Container, Grid, Stack, Typography, Chip } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../firebase';
import { CATEGORY_OPTIONS } from '../constants/categories';

async function fetchTemplatesForAnyone() {
  // 1) ถ้า login แล้วลองดึงแบบแอดมินก่อน
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      const r = await fetch('/api/admin/templates', {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      if (r.ok) {
        const j = await r.json();
        return j.items || [];
      }
    }
  } catch {}

  // 2) ไม่ได้ (guest หรือ 401) → ดึง public
  try {
    const r = await fetch('/api/templates'); // ให้ backend คืนเฉพาะ published
    if (r.ok) {
      const j = await r.json();
      return j.items || [];
    }
  } catch {}

  // 3) สุดท้าย ถ้าไม่ได้จริง ๆ
  throw new Error('cannot_load_templates');
}

export default function TemplateRichMenusPage() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tenantId = sp.get('tenant') || '';

  const [cat, setCat] = useState(sp.get('cat') || '');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const list = await fetchTemplatesForAnyone();
        setItems(list);
      } catch (e) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setCatAndUrl = (next) => {
    setCat(next);
    const nextSp = new URLSearchParams(sp.toString());
    if (next) nextSp.set('cat', next); else nextSp.delete('cat');
    setSp(nextSp, { replace: true });
  };

  const cats = useMemo(
    () => Array.from(new Set([...CATEGORY_OPTIONS, ...items.map(i => i.category).filter(Boolean)])),
    [items]
  );
  const filtered = useMemo(
    () => items.filter(i => !cat || i.category === cat),
    [items, cat]
  );

  const large   = useMemo(() => filtered.filter(t => (t.size || 'large') === 'large'), [filtered]);
  const compact = useMemo(() => filtered.filter(t => t.size === 'compact'), [filtered]);

  const onUse = (tpl) => {
    if (!tenantId) { alert('กรุณาเลือก OA ก่อน'); return; }
    navigate(`/homepage/rich-menus/new?tenant=${tenantId}`, {
      state: {
        prefill: {
          size: tpl.size,
          imageUrl: tpl.imageUrl,
          chatBarText: tpl.chatBarText,
          areas: tpl.areas,
          title: tpl.title,
        }
      }
    });
  };

  const renderGrid = (list) => (
    <Grid container spacing={2}>
      {list.map(t => (
        <Grid key={t.id} item xs={12} sm={6} md={4} lg={3}>
          <Card variant="outlined">
            <CardActionArea onClick={() => onUse(t)}>
              <Box
                sx={{
                  height: 160,
                  backgroundImage: t.imageUrl ? `url(${t.imageUrl})` : 'none',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  backgroundSize: 'contain',
                  bgcolor: '#f5f5f5'
                }}
              />
            </CardActionArea>
            <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle2" noWrap>{t.title || '(Untitled)'}</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={t.size || 'large'} />
                  {t.category && <Chip size="small" variant="outlined" label={t.category} />}
                </Stack>
              </Box>
              <Button size="small" variant="contained" onClick={() => onUse(t)}>Use</Button>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" fontWeight="bold">Template Rich Menus</Typography>
        <Box sx={{ flex: 1 }} />
        <Chip
          label="All"
          clickable
          onClick={() => setCatAndUrl('')}
          color={!cat ? 'success' : 'default'}
          variant={!cat ? 'filled' : 'outlined'}
        />
        {cats.map(c => (
          <Chip
            key={c}
            label={c}
            clickable
            onClick={() => setCatAndUrl(c)}
            color={cat === c ? 'success' : 'default'}
            variant={cat === c ? 'filled' : 'outlined'}
            sx={{ ml: 1 }}
          />
        ))}
      </Stack>

      {loading && <Box sx={{ p: 4 }}>Loading templates…</Box>}
      {!!err && !loading && <Box sx={{ p: 4, color: 'error.main' }}>โหลดเทมเพลตไม่สำเร็จ: {err}</Box>}

      {!loading && !err && (
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
            <Box sx={{ p: 4, color: 'text.secondary' }}>No templates.</Box>
          )}
        </Box>
      )}
    </Container>
  );
}

