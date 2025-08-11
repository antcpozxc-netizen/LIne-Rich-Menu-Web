// App.js
import React from "react";
import { AppBar, Toolbar, Typography, Button, Box, Container } from "@mui/material";
import { useNavigate } from "react-router-dom";

const App = () => {
  const navigate = useNavigate();

  return (
    <Box sx={{ position: "relative", height: "100vh" }}>
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
          <Typography variant="h6" sx={{ fontWeight: "bold", color: "#fff" }}>
            Line Rich Menus Web
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Button sx={{ color: "#fff" }}>Home</Button>
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

      {/* Hero Section */}
      <Box
        sx={{
          position: "relative",
          height: "100vh",
          backgroundImage: `url('/03.png')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        {/* Overlay */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        />

        {/* Content */}
        <Container
          sx={{
            position: "relative",
            textAlign: "center",
            zIndex: 2,
            mt: -8,
          }}
        >
          <Typography variant="h5" sx={{ color: "#A5D6A7", mb: 1 }}>
            สร้าง RICH MENU ง่าย ๆ
          </Typography>
          <Typography
            variant="h3"
            sx={{
              fontWeight: "bold",
              mb: 2,
              color: "#fff",
              textShadow: "1px 1px 3px rgba(0,0,0,0.5)",
            }}
          >
            ปรับแต่งเมนู LINE OA ได้ด้วยตัวคุณเอง
          </Typography>
          <Typography variant="subtitle1" sx={{ mb: 4, color: "#ddd" }}>
            เข้าสู่ระบบด้วย LINE แล้วเริ่มสร้าง Rich Menu หรือส่ง Broadcast ได้ทันที
          </Typography>

          {/* Buttons */}
          <Box sx={{ display: "flex", justifyContent: "center", gap: 2 }}>
            <Button
              variant="contained"
              sx={{
                backgroundColor: "#4CAF50",
                "&:hover": { backgroundColor: "#43A047" },
                px: 3,
                py: 1,
                borderRadius: "20px",
              }}
              onClick={() => navigate("/accounts")}
            >
              เริ่มต้นการใช้งาน
            </Button>
            <Button
              variant="outlined"
              sx={{
                color: "#fff",
                borderColor: "#fff",
                "&:hover": { borderColor: "#A5D6A7", color: "#A5D6A7" },
                px: 3,
                py: 1,
                borderRadius: "20px",
              }}
            >
              เรียนรู้เพิ่มเติม
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
};

export default App;
