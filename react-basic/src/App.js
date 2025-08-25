// src/App.js
import React, { useEffect, useState } from "react";
import { AppBar, Toolbar, Typography, Button, Box, Container } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

const App = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  if (!ready) return <div style={{ padding: 16 }}>Loading...</div>;

// src/App.js
const goLogin = async () => {
  try {
    // กัน Firebase Auth ที่ค้างอยู่ (ถ้ามี)
    await auth.signOut();
  } catch {}

  const here = window.location.pathname + window.location.search;
  const nextAfter = (here === '/' ? '/homepage' : here); // ถ้ามาจากหน้าแรก → ไป /homepage
  const url = new URL('/auth/line/start', window.location.origin);
  url.searchParams.set('to', 'accounts');   // ให้ไปเลือก OA ก่อน
  url.searchParams.set('next', nextAfter);  // กลับไปยังที่ต้องการหลังเลือก OA
  url.searchParams.set('force', '1');       // ⬅️ บังคับ re-login (ไม่ใช้ session เดิม)
  window.location.href = url.toString();
};


const goGuest = () => {
   navigate("/homepage", { replace: true });
};


  return (
    <Box sx={{ position: "relative", minHeight: "100vh" }}>
      {/* Navbar */}
      <AppBar position="fixed" sx={{ backgroundColor: "#66bb6a", boxShadow: "none", px: 2 }}>
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography
            variant="h6"
            sx={{ fontWeight: "bold", color: "#fff", cursor: "pointer" }}
            onClick={() => navigate("/", { replace: true })}
          >
            Line Rich Menus Web
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Button sx={{ color: "#fff" }} onClick={() => navigate("/", { replace: true })}>Home</Button>
            <Button sx={{ color: "#fff" }} onClick={() => navigate("/homepage/rich-menus")}>Rich Menu</Button>
            <Button sx={{ color: "#fff" }} onClick={() => navigate("/homepage/broadcast")}>Broadcast</Button>
            <Button sx={{ color: "#fff" }} onClick={() => navigate("/homepage/rich-message")}>Rich Message</Button>
            {user ? (
              <Button variant="contained" onClick={() => navigate("/accounts")} sx={{ textTransform: "none" }}>
                ไปที่บัญชีของฉัน
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={goLogin}
                sx={{ backgroundColor: "#004d40", borderRadius: "10px", textTransform: "none", "&:hover": { backgroundColor: "#00332d" } }}
              >
                เข้าสู่ระบบด้วย LINE
              </Button>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      {/* Hero */}
      <Box
        sx={{
          position: "relative",
          minHeight: "100vh",
          backgroundImage: `url('/03.png')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        <Box sx={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <Container sx={{ position: "relative", textAlign: "center", zIndex: 2, mt: -8 }}>
          <Typography variant="h5" sx={{ color: "#A5D6A7", mb: 1 }}>
            สร้าง RICH MENU ง่าย ๆ
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: "bold", mb: 2, color: "#fff", textShadow: "1px 1px 3px rgba(0,0,0,0.5)" }}>
            ปรับแต่งเมนู LINE OA ได้ด้วยตัวคุณเอง
          </Typography>
          <Typography variant="subtitle1" sx={{ mb: 4, color: "#ddd" }}>
            เลือกโหมดที่ต้องการ แล้วเริ่มเลย
          </Typography>

          <Box sx={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              onClick={goLogin}
              sx={{ backgroundColor: "#4CAF50", "&:hover": { backgroundColor: "#43A047" }, px: 3, py: 1.25, borderRadius: "20px" }}
            >
              เริ่มใช้งาน (Login LINE)
            </Button>
            <Button
              variant="outlined"
              onClick={goGuest}
              sx={{ color: "#fff", borderColor: "#fff", "&:hover": { borderColor: "#A5D6A7", color: "#A5D6A7" }, px: 3, py: 1.25, borderRadius: "20px" }}
            >
              เยี่ยมชม (Guest)
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
};

export default App;
