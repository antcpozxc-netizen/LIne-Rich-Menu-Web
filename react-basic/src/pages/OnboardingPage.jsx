// src/pages/OnboardingPage.jsx
import React, { useState } from 'react';
import { Box, Button, Card, CardContent, Container, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { postOnboarding } from '../api/client';

export default function OnboardingPage() {
  const [form, setForm] = useState({ username: '', real_name: '', role: 'user' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await postOnboarding(form);
      window.location.href = '/app'; // ให้ frontend พากลับ app
    } catch (err) {
      alert('บันทึกล้มเหลว: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
      <Container maxWidth="sm">
        <Card elevation={6} sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h5" sx={{ mb: 2 }}>First-time Registration</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              กรอกข้อมูลครั้งแรกเพื่อเริ่มใช้งานระบบ
            </Typography>
            <Box component="form" onSubmit={submit}>
              <Stack spacing={2}>
                <TextField
                  label="ชื่อผู้ใช้ (username)"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
                <TextField
                  label="ชื่อ–นามสกุล"
                  value={form.real_name}
                  onChange={(e) => setForm({ ...form, real_name: e.target.value })}
                  required
                />
                <TextField
                  select
                  label="Role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  required
                >
                  {['user', 'supervisor', 'admin', 'developer'].map((r) => (
                    <MenuItem key={r} value={r}>{r}</MenuItem>
                  ))}
                </TextField>
                <Grid container justifyContent="flex-end">
                  <Button type="submit" variant="contained" disabled={busy}>
                    บันทึกและเริ่มใช้งาน
                  </Button>
                </Grid>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      </Container>
  );
}
