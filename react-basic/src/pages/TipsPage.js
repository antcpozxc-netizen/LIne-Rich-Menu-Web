// src/pages/TipsPage.jsx
import React from 'react';
import {
  Container, Typography, Button, Stack, Alert, Chip, Divider, Box,
  Accordion, AccordionSummary, AccordionDetails, List, ListItem, ListItemText,
  Grid, Card, CardContent
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNavigate, Link as RouterLink } from 'react-router-dom';

// ---------- small helpers ----------
const Code = ({ children }) => (
  <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: '#f7f7f9', border: '1px solid #eee', p: 1, borderRadius: 1, whiteSpace: 'pre-wrap' }}>
    {children}
  </Box>
);

// “ภาพตัวอย่าง” จำลอง Rich Menu template แบบไม่ต้องใช้ไฟล์รูป
function RMThumb({ label, size='large', cells=[] }) {
  const pt = size === 'compact' ? '33%' : '45%'; // ทำ aspect ให้คล้ายๆ
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: .5 }}>{label}</Typography>
        <Box sx={{ position:'relative', width:'100%', pt, bgcolor:'#f1f3f4', borderRadius:1, overflow:'hidden' }}>
          {cells.map(([x,y,w,h], i) => (
            <Box key={i} sx={{
              position:'absolute',
              left:`${(x/6)*100}%`, top:`${(y/4)*100}%`,
              width:`${(w/6)*100}%`, height:`${(h/4)*100}%`,
              border:'1px solid #cfd8dc', background:'rgba(0,0,0,0.03)', borderRadius:.5
            }}/>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

export default function TipsPage() {
  const navigate = useNavigate();

  return (
    <Container sx={{ py: 4 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">Tips</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => navigate('/homepage')}>Back to Home</Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        คู่มือการใช้งานสั้นๆ ของแต่ละหน้าในระบบ: <strong>Accounts</strong>, <strong>Broadcast</strong>, <strong>Rich Message</strong>, <strong>Greeting Message</strong>, และ <strong>Rich Menu</strong>.
        โหมด <em>Guest</em> จะบันทึกโลคัลก่อน—เมื่อกดส่ง/บันทึกขึ้น OA ระบบจะให้ Login อัตโนมัติ
      </Alert>

      {/* Shortcuts */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <Button component={RouterLink} to="/accounts" variant="contained" size="small">Go to Accounts</Button>
        <Button component={RouterLink} to="/homepage/broadcast" variant="outlined" size="small">Go to Broadcast</Button>
        <Button component={RouterLink} to="/homepage/rich-message" variant="outlined" size="small">Go to Rich Message</Button>
        <Button component={RouterLink} to="/homepage/greeting-message" variant="outlined" size="small">Go to Greeting</Button>
        <Button component={RouterLink} to="/homepage/rich-menus" variant="outlined" size="small">Go to Rich Menu</Button>
      </Stack>

      {/* NEW: Channel ID / Secret */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Channel ID / Channel secret</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            ใช้สำหรับเชื่อมต่อ LINE OA เข้ากับระบบของคุณ (ฝั่ง <Chip size="small" label="Messaging API" />)
          </Typography>

          <Typography variant="subtitle2">เอามาจากไหน</Typography>
          <List dense>
            <ListItem>
              <ListItemText
                primary="LINE Developers Console → Providers → เลือก Channel (Messaging API)"
                secondary="แท็บ Basic settings: มี Channel ID • แท็บ Messaging API: มี Channel secret"
              />
            </ListItem>
            <ListItem>
              <ListItemText primary="ต้องเปิด Messaging API ให้ OA นั้นก่อน ถึงจะเห็นค่าเหล่านี้" />
            </ListItem>
          </List>

          <Typography variant="subtitle2" sx={{ mt: 1 }}>เอามาใช้งานในระบบนี้ยังไง</Typography>
          <List dense>
            <ListItem>
              <ListItemText
                primary="หน้า Accounts → กด Add LINE OA"
                secondary="กรอก Channel ID และ Channel secret → เชื่อมต่อสำเร็จ OA จะถูกเพิ่มเข้าในรายการของคุณ"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="ฝั่ง Backend"
                secondary="ระบบเรียก POST /api/tenants ด้วย body { channelId, channelSecret } ผ่าน Firebase ID Token"
              />
            </ListItem>
          </List>

          <Code>
{`// AccountsPage.js เรียกใช้งาน (ตัดมาเฉพาะส่วนสำคัญ)
const idToken = await auth.currentUser.getIdToken();
await fetch('/api/tenants', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${idToken}\` },
  body: JSON.stringify({ channelId, channelSecret })
});`}
          </Code>

          <Alert severity="success" sx={{ mt: 2 }}>
            ถ้าเชื่อม OA เดิมซ้ำ ระบบจะ “อัปเดตข้อมูล/โทเค็นล่าสุดให้” โดยไม่สร้างซ้ำ
          </Alert>
        </AccordionDetails>
      </Accordion>

      {/* Accounts */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Accounts</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            จัดการการเชื่อมต่อ LINE OA และสมาชิกของแต่ละ OA
          </Typography>

          <Typography variant="subtitle2">Add LINE OA</Typography>
          <List dense>
            <ListItem><ListItemText primary="กดปุ่ม “Add LINE OA” มุมขวาบน" /></ListItem>
            <ListItem><ListItemText primary="กรอก Channel ID และ Channel secret (จาก Messaging API)" /></ListItem>
            <ListItem><ListItemText primary="กด ‘เชื่อมต่อ’" /></ListItem>
          </List>

          <Typography variant="subtitle2">Members</Typography>
          <List dense>
            <ListItem><ListItemText primary="Owner กด ‘Members’ เพื่อเพิ่ม/ลบสมาชิก" secondary="ค้นหาจากชื่อ หรือวาง UID: line:Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" /></ListItem>
          </List>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            อ้างอิงพฤติกรรมจากหน้า <Chip size="small" label="AccountsPage.js" />
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Broadcast */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Broadcast</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            ส่งข้อความถึงผู้ติดตามทั้งหมดหรือทำ Targeting และตั้งเวลาส่งได้
          </Typography>

          <Typography variant="subtitle2">Workflow</Typography>
          <List dense>
            <ListItem><ListItemText primary="Recipients: All friends / Targeting" /></ListItem>
            <ListItem><ListItemText primary="Broadcast time: Send now / Schedule (ระบุ Date/Time/Timezone)" /></ListItem>
            <ListItem><ListItemText primary="แต่งคอนเทนต์ด้วย Blocks: Text / Image / File / Link / Rich" /></ListItem>
            <ListItem><ListItemText primary="Send test, Save draft, หรือ Send" /></ListItem>
          </List>

          <Typography variant="subtitle2">ตัวอย่างบล็อก</Typography>
          <Grid container spacing={2} sx={{ mb: 1 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined"><CardContent>
                <Typography fontWeight={700}>Text</Typography>
                <Typography variant="body2" color="text.secondary">ข้อความสั้นๆ สูงสุด 500 ตัวอักษร</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined"><CardContent>
                <Typography fontWeight={700}>Image</Typography>
                <Typography variant="body2" color="text.secondary">แนบรูป/อัปโหลด (Guest เก็บเป็น dataURL ชั่วคราว)</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined"><CardContent>
                <Typography fontWeight={700}>File</Typography>
                <Typography variant="body2" color="text.secondary">แนบไฟล์ ระบบจะแปลงเป็นลิงก์</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card variant="outlined"><CardContent>
                <Typography fontWeight={700}>Rich</Typography>
                <Typography variant="body2" color="text.secondary">เลือก Rich message / Imagemap</Typography>
              </CardContent></Card>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            อ้างอิงพฤติกรรมจากหน้า <Chip size="small" label="BroadcastPage.js" />
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Rich Message */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Rich Message</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            สร้างรูปภาพ + พื้นที่กด (areas) หรือ <em>imagemap</em> เพื่อใช้ซ้ำใน Broadcast
          </Typography>

          <Typography variant="subtitle2">สร้างใหม่</Typography>
          <List dense>
            <ListItem><ListItemText primary="ไปหน้า Rich Message → Create" /></ListItem>
            <ListItem><ListItemText primary="อัปโหลดภาพ ตั้งชื่อ และเพิ่ม areas (label + URL)" /></ListItem>
            <ListItem><ListItemText primary="บันทึกลง localStorage (โหมดเดโม่) แล้วนำไปใช้ใน Broadcast" /></ListItem>
          </List>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            อ้างอิงพฤติกรรมจาก <Chip size="small" label="RichMessageCreatePage.js" />
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Greeting Message */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Greeting Message</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            ข้อความต้อนรับเมื่อผู้ใช้เพิ่มเพื่อน (follow) LINE OA ของคุณ
          </Typography>

          <Typography variant="subtitle2">การตั้งค่า</Typography>
          <List dense>
            <ListItem><ListItemText primary="Enabled / Only send for first-time friends" /></ListItem>
            <ListItem><ListItemText primary="Text + Image (รองรับตัวแปร {displayName}, {accountName})" /></ListItem>
            <ListItem><ListItemText primary="Save (local) / Save to OA / Send test" /></ListItem>
          </List>

          <Typography variant="subtitle2">ตัวอย่างข้อความ</Typography>
          <Code>
{`สวัสดี {displayName} ขอบคุณที่เพิ่ม {accountName} 😊
พิมพ์ "เมนู" เพื่อดูสิทธิพิเศษวันนี้ได้เลย!`}
          </Code>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            อ้างอิงพฤติกรรมจากหน้า <Chip size="small" label="GreetingMessagePage.js" />
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Rich Menu — with example thumbnails */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Rich Menu</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            ออกแบบเมนูภาพคลิกได้ เลือกเทมเพลต อัปโหลดภาพตามสเปค LINE และกำหนด Action ของแต่ละบล็อก
          </Typography>

          <Typography variant="subtitle2">ตัวอย่าง Template (ภาพประกอบ)</Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6} md={3}>
              <RMThumb label="Large • 6 blocks (2×2 × 6)" size="large" cells={[[0,0,2,2],[2,0,2,2],[4,0,2,2],[0,2,2,2],[2,2,2,2],[4,2,2,2]]}/>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <RMThumb label="Large • 3 blocks (3×2,3×2,6×2)" size="large" cells={[[0,0,3,2],[3,0,3,2],[0,2,6,2]]}/>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <RMThumb label="Compact • 4 blocks (3×2 × 4)" size="compact" cells={[[0,0,3,2],[3,0,3,2],[0,2,3,2],[3,2,3,2]]}/>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <RMThumb label="Compact • 1 block (full)" size="compact" cells={[[0,0,6,4]]}/>
            </Grid>
          </Grid>

          <Typography variant="subtitle2">Action ที่รองรับ & ตัวอย่างการใช้งาน</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined"><CardContent>
                <Chip size="small" label="Link" color="success" sx={{ mr: .5 }} />
                <Typography fontWeight={700} sx={{ display:'inline' }}>เปิดหน้าเว็บ</Typography>
                <Typography variant="body2" color="text.secondary">โปรโมชัน จองโต๊ะ คูปอง — ระบุ URL + Label</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card variant="outlined"><CardContent>
                <Chip size="small" label="Text" color="success" sx={{ mr: .5 }} />
                <Typography fontWeight={700} sx={{ display:'inline' }}>ส่งข้อความทันที</Typography>
                <Typography variant="body2" color="text.secondary">เช่น “ดูเมนูวันนี้” เพื่อให้บอทตอบต่อ</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card variant="outlined"><CardContent>
                <Chip size="small" label="QnA" color="success" sx={{ mr: .5 }} />
                <Typography fontWeight={700} sx={{ display:'inline' }}>FAQ / คำถามยอดฮิต</Typography>
                <Typography variant="body2" color="text.secondary">
                  ตั้ง <em>QnA key</em> + รายการ Q/A ระบบส่ง postback <Code>{`qna:<key>`}</Code>
                </Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card variant="outlined"><CardContent>
                <Chip size="small" label="Live Chat" color="success" sx={{ mr: .5 }} />
                <Typography fontWeight={700} sx={{ display:'inline' }}>เปิดแชทสด</Typography>
                <Typography variant="body2" color="text.secondary">ตั้งข้อความทริกเกอร์ เช่น <Code>#live</Code></Typography>
              </CardContent></Card>
            </Grid>
          </Grid>

          <List dense sx={{ mt: 2 }}>
            <ListItem><ListItemText primary="อัปโหลดภาพ ระบบช่วยย่อ/บีบอัดให้ตามสเปค (Large 2500×1686, Compact 2500×843 ≤ ~1MB)" /></ListItem>
            <ListItem><ListItemText primary="Chat bar label จำกัด 14 ตัวอักษร" /></ListItem>
            <ListItem><ListItemText primary="กำหนดช่วงเวลา Display from–to เพื่อสร้างเป็น Scheduled; ถ้าไม่ระบุจะเป็น Ready" /></ListItem>
          </List>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            อ้างอิงพฤติกรรมจากหน้า <Chip size="small" label="RichMenusPage.js" />
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* FAQ */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">FAQ</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="subtitle2">Guest vs Logged-in</Typography>
          <List dense>
            <ListItem><ListItemText primary="Guest: บันทึก localStorage และ dataURL ชั่วคราว" /></ListItem>
            <ListItem><ListItemText primary="Logged-in + เลือก OA: อัปโหลดไฟล์ขึ้น Firebase Storage และบันทึกจริง" /></ListItem>
          </List>
          <Typography variant="subtitle2" sx={{ mt: 1 }}>การตั้งเวลา</Typography>
          <List dense>
            <ListItem><ListItemText primary="Broadcast: เลือก Date/Time/Timezone แล้ว Save/Schedule" /></ListItem>
            <ListItem><ListItemText primary="Rich Menu: ระบุช่วงแสดงผล (from–to) เพื่อสร้าง Scheduled" /></ListItem>
          </List>
        </AccordionDetails>
      </Accordion>
    </Container>
  );
}
