import React from 'react';
import { Container, Typography, Button, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function FriendsPage() {
  const navigate = useNavigate();
  return (
    <Container sx={{ py: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">Friends</Typography>
        <Button variant="outlined" onClick={() => navigate('/homepage')}>Back to Home</Button>
      </Stack>
      <Typography color="text.secondary">
        Stub page: รายชื่อเพื่อน/กลุ่ม/เซกเมนต์ แสดงที่นี่
      </Typography>
    </Container>
  );
}
