import React from 'react';
import { Grid, Card, CardContent, Typography, Button, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import useMe from '../hooks/useMe';

export default function HomePage() {
  const { data } = useMe();

  const username = data?.user?.username || data?.user?.name || data?.user?.real_name || 'ผู้ใช้';
  const role = (data?.user?.role || 'user').toLowerCase();
  const hello = username ? (username.startsWith('@') ? username : `@${username}`) : 'ผู้ใช้';

  return (
    <Stack spacing={3}>
      <Typography variant="h4" fontWeight={800}>สวัสดี {hello}</Typography>
      <Typography variant="body1" color="text.secondary">บทบาท: {role}</Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>จัดการผู้ใช้</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                จัดการบทบาทและสถานะผู้ใช้ทั้งหมด
              </Typography>
              <Button variant="contained" component={RouterLink} to="/app/admin/users-split">
                ไปที่ Users (แบ่งตาม role)
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>งานของผู้ใช้</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                เลือกผู้ใช้ระดับ user เพื่อดูตารางงาน
              </Typography>
              <Button variant="contained" component={RouterLink} to="/app/tasks">
                ไปที่ Tasks
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
