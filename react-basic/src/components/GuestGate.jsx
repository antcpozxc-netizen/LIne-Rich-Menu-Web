import React from 'react';
import { Alert, Button, Stack } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import { loginWithLine } from '../lib/authx';

export default function GuestGate({ visible, nextPath, sx }) {
  if (!visible) return null;
  return (
    <Stack sx={{ my: 1, ...sx }}>
      <Alert
        severity="info"
        action={
          <Button
            color="inherit"
            size="small"
            startIcon={<LoginIcon />}
            onClick={() => loginWithLine(nextPath)}
          >
            Login ด้วย LINE
          </Button>
        }
      >
        คุณกำลังใช้งานโหมด Guest — ลองสร้าง/แก้ไขได้ปกติ แต่การ “ส่งจริง / ใช้กับ OA” จะให้ล็อกอินก่อนเสมอ
      </Alert>
    </Stack>
  );
}
