// src/pages/TemplateRichMenusPage.js
import React, { useMemo, useState } from 'react';
import {
  Box, Button, Card, CardActionArea, CardContent, CardMedia, Chip,
  Container, Divider, Grid, Stack, Typography
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

// หมวดหมู่ตัวอย่าง
const CATEGORIES = [
  'ร้านอาหาร / คาเฟ่', 'บริการทั่วไป', 'แหล่งท่องเที่ยว / E-Commerce', 'โรงแรม / รีสอร์ท',
  'อสังหาฯ/งานบริการ', 'ค้าปลีก / บริการทั่วไป', 'โรงเรียน / สถาบัน', 'คลินิก / โรงพยาบาล',
  'ยานยนต์ / รถยนต์'
];

// เทมเพลตตัวอย่าง (mock)
const TEMPLATES = [
  {
    id: 'large-6-01',
    title: 'Size : 6 Block',
    sizeId: 'large-6',
    category: 'ร้านอาหาร / คาเฟ่',
    thumb: 'https://picsum.photos/seed/rm-6a/560/320',
  },
  {
    id: 'large-6-02',
    title: 'Size : 6 Block',
    sizeId: 'large-6',
    category: 'ร้านอาหาร / คาเฟ่',
    thumb: 'https://picsum.photos/seed/rm-6b/560/320',
  },
  {
    id: 'large-6-03',
    title: 'Size : 6 Block',
    sizeId: 'large-6',
    category: 'บริการทั่วไป',
    thumb: 'https://picsum.photos/seed/rm-6c/560/320',
  },

  {
    id: 'large-4-01',
    title: 'Size : 4 Block',
    sizeId: 'compact-4',
    category: 'ร้านอาหาร / คาเฟ่',
    thumb: 'https://picsum.photos/seed/rm-4a/300/360',
  },
  {
    id: 'large-4-02',
    title: 'Size : 4 Block',
    sizeId: 'compact-4',
    category: 'บริการทั่วไป',
    thumb: 'https://picsum.photos/seed/rm-4b/300/360',
  },

  {
    id: 'large-3-01',
    title: 'Size : 3 Block',
    sizeId: 'large-3',
    category: 'ร้านอาหาร / คาเฟ่',
    thumb: 'https://picsum.photos/seed/rm-3a/560/260',
  },
  {
    id: 'large-3-02',
    title: 'Size : 3 Block',
    sizeId: 'large-3',
    category: 'บริการทั่วไป',
    thumb: 'https://picsum.photos/seed/rm-3b/560/260',
  },
];

export default function TemplateRichMenusPage() {
  const navigate = useNavigate();
  const [activeCat, setActiveCat] = useState('ร้านอาหาร / คาเฟ่');

  const filtered = useMemo(
    () => TEMPLATES.filter(t => t.category === activeCat),
    [activeCat]
  );

  const onUseTemplate = (tpl) => {
    // ส่ง templateId ไปที่หน้า rich-menus
    navigate('/homepage/rich-menus', { state: { applyTemplateId: tpl.sizeId } });
  };

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
        Example Template Rich Menus ตามประเภทธุรกิจ
      </Typography>

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1">Category :</Typography>
        {CATEGORIES.map(cat => (
          <Chip
            key={cat}
            label={cat}
            clickable
            onClick={() => setActiveCat(cat)}
            color={activeCat === cat ? 'success' : 'default'}
            variant={activeCat === cat ? 'filled' : 'outlined'}
            sx={{ mr: 1, mb: 1 }}
          />
        ))}
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {/* กลุ่ม 6 บล็อก */}
      <Section
        title="Size : 6 Block"
        items={filtered.filter(t => t.sizeId === 'large-6')}
        onUseTemplate={onUseTemplate}
      />

      {/* กลุ่ม 4 บล็อก */}
      <Section
        title="Size : 4 Block"
        items={filtered.filter(t => t.sizeId === 'compact-4')}
        onUseTemplate={onUseTemplate}
      />

      {/* กลุ่ม 3 บล็อก */}
      <Section
        title="Size : 3 Block"
        items={filtered.filter(t => t.sizeId === 'large-3')}
        onUseTemplate={onUseTemplate}
      />
    </Container>
  );
}

function Section({ title, items, onUseTemplate }) {
  if (items.length === 0) return null;
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>{title}</Typography>
      <Grid container spacing={2}>
        {items.map(t => (
          <Grid key={t.id} item xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardActionArea onClick={() => onUseTemplate(t)}>
                <CardMedia component="img" image={t.thumb} alt={t.id} />
              </CardActionArea>
              <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">{t.category}</Typography>
                <Button size="small" variant="contained" onClick={() => onUseTemplate(t)}>
                  Use
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
