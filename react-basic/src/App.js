
// App.js
import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  Stack
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';

const App = () => {
  return (
    <>
      {/* Navbar */}
      <AppBar position="static" sx={{ backgroundColor: '#00c6d7' }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            Line RichMenu Web
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button color="inherit">Home</Button>
            <Button color="inherit">About</Button>
            <Button color="inherit">Rich Menu</Button>
            <Button color="inherit">Broadcast</Button>
            <Button color="inherit" variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }}>
              Join Now
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      {/* Hero Section */}
      <Box
        sx={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('/03.png')`,
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          color: '#fff',
          textAlign: 'left',
          py: 10,
          px: 4,
          minHeight: '85vh',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h6" sx={{ color: '#00c6d7', mb: 2 }}>
            สร้าง RICH MENU ง่าย ๆ
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 'bold', mb: 3 }}>
            ปรับแต่งเมนู LINE OA <br />
            ได้ด้วยตัวคุณเอง
          </Typography>
          <Typography variant="body1" sx={{ mb: 4 }}>
            เข้าสู่ระบบด้วย LINE แล้วเริ่มสร้าง Rich Menu หรือส่ง Broadcast ได้ทันที
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button variant="contained" color="primary">
              เริ่มต้นใช้งาน
            </Button>
            <Button variant="outlined" color="inherit">
              เรียนรู้เพิ่มเติม
            </Button>
          </Stack>
        </Container>
      </Box>
    </>
  );
};

export default App;

