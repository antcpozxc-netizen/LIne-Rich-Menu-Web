// AccountsPage.js
import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Avatar,
  Box
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function AccountsPage() {
  const navigate = useNavigate();

  const accounts = [
    { name: 'Test Rich Menu Account', friends: 10, role: 'Admin' },
    { name: 'Test Rich Menu Account 2', friends: 8, role: 'Admin' },
  ];

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Navbar */}
      <AppBar
        position="fixed"
        sx={{
          backgroundColor: "#66bb6a",
          boxShadow: "none",
          px: 2,
        }}
      >
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography
            variant="h6"
            sx={{ fontWeight: "bold", color: "#fff", cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            Line Rich Menus Web
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Button sx={{ color: "#fff" }} onClick={() => navigate('/')}>Home</Button>
            <Button sx={{ color: "#fff" }}>About</Button>
            <Button sx={{ color: "#fff" }}>Rich Menu</Button>
            <Button sx={{ color: "#fff" }}>Broadcast</Button>
            <Button
              variant="contained"
              sx={{
                backgroundColor: "#004d40",
                borderRadius: "10px",
                textTransform: "none",
                "&:hover": { backgroundColor: "#00332d" },
              }}
            >
              Join now
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Page Content */}
      <Container sx={{ pt: 12 }}>
        <Typography variant="h4" gutterBottom>
          Accounts
        </Typography>
        <Table>
          <TableHead sx={{ backgroundColor: '#e8f5e9' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Account</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Friends</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Role</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((acc, i) => (
              <TableRow
                key={i}
                hover
                sx={{
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: '#f1f8e9' }
                }}
                onClick={() => navigate('/homepage')}
              >
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ bgcolor: '#66bb6a' }}>
                      {acc.name.charAt(0)}
                    </Avatar>
                    {acc.name}
                  </Box>
                </TableCell>
                <TableCell>{acc.friends}</TableCell>
                <TableCell>{acc.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Container>
    </Box>
  );
}
