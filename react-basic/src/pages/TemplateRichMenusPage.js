import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardActionArea, CardContent, Container, Grid, Stack, Typography, Chip } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../firebase';

async function authedFetch(url, opts={}) {
  const token = await auth.currentUser?.getIdToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}), Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...opts, headers });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt || res.statusText);
  return txt ? JSON.parse(txt) : {};
}

export default function TemplateRichMenusPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const tenantId = sp.get('tenant') || '';
  const [items, setItems] = useState([]);
  const [cat, setCat] = useState('');

  useEffect(()=>{ (async ()=>{ const j = await authedFetch('/api/admin/templates'); setItems(j.items||[]); })(); },[]);
  const cats = useMemo(()=> Array.from(new Set(items.map(i=>i.category).filter(Boolean))), [items]);
  const filtered = useMemo(()=> items.filter(i=> !cat || i.category===cat), [items, cat]);

  const onUse = (tpl) => {
    navigate(`/homepage/rich-menus/new?tenant=${tenantId}`, {
      state: { prefill: { size: tpl.size, imageUrl: tpl.imageUrl, chatBarText: tpl.chatBarText, areas: tpl.areas, title: tpl.title } }
    });
  };

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{mb:2, flexWrap:'wrap'}}>
        <Typography variant="h5" fontWeight="bold">Template Rich Menus</Typography>
        <Box sx={{flex:1}}/>
        <Chip label="All" clickable onClick={()=>setCat('')} color={!cat?'success':'default'} variant={!cat?'filled':'outlined'}/>
        {cats.map(c=> <Chip key={c} label={c} clickable onClick={()=>setCat(c)} color={cat===c?'success':'default'} variant={cat===c?'filled':'outlined'} sx={{ml:1}}/>)}
      </Stack>

      <Grid container spacing={2}>
        {filtered.map(t=>(
          <Grid key={t.id} item xs={12} sm={6} md={4} lg={3}>
            <Card variant="outlined">
              <CardActionArea onClick={()=>onUse(t)}>
                <Box sx={{
                  height: 160,
                  backgroundImage: t.imageUrl?`url(${t.imageUrl})`:'none',
                  backgroundRepeat:'no-repeat', backgroundPosition:'center', backgroundSize:'contain', bgcolor:'#f5f5f5'
                }}/>
              </CardActionArea>
              <CardContent sx={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <Box>
                  <Typography variant="subtitle2" noWrap>{t.title||'(Untitled)'}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label={t.size||'large'}/>
                    {t.category && <Chip size="small" variant="outlined" label={t.category}/>}
                  </Stack>
                </Box>
                <Button size="small" variant="contained" onClick={()=>onUse(t)}>Use</Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
        {filtered.length===0 && <Box sx={{p:4, color:'text.secondary'}}>No templates.</Box>}
      </Grid>
    </Container>
  );
}
