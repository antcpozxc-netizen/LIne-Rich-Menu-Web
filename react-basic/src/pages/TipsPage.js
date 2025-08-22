// src/pages/TipsPage.jsx
import React from 'react';
import {
  Container, Typography, Button, Stack, Alert, Chip, Divider, Box,
  Accordion, AccordionSummary, AccordionDetails, List, ListItem, ListItemText
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNavigate, Link as RouterLink } from 'react-router-dom';

export default function TipsPage() {
  const navigate = useNavigate();

  const Code = ({ children }) => (
    <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: '#f7f7f9', border: '1px solid #eee', p: 1, borderRadius: 1, whiteSpace: 'pre-wrap' }}>
      {children}
    </Box>
  );

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
        เนื้อหานี้เป็นคู่มือการใช้งานสั้นๆ ของแต่ละหน้าในระบบ: <strong>Accounts</strong>, <strong>Broadcast</strong>, <strong>Rich Message</strong>, <strong>Greeting Message</strong>, และ <strong>Rich Menu</strong>.
        โหมด <em>Guest</em> จะบันทึกแบบ Local ก่อน—เมื่อกดส่ง/บันทึกขึ้น OA ระบบจะพาไป Login อัตโนมัติ
      </Alert>

      {/* Quick shortcuts */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <Button component={RouterLink} to="/accounts" variant="contained" size="small">Go to Accounts</Button>
        <Button component={RouterLink} to="/homepage/broadcast" variant="outlined" size="small">Go to Broadcast</Button>
        <Button component={RouterLink} to="/homepage/rich-message" variant="outlined" size="small">Go to Rich Message</Button>
        <Button component={RouterLink} to="/homepage/greeting-message" variant="outlined" size="small">Go to Greeting</Button>
        <Button component={RouterLink} to="/homepage/rich-menus" variant="outlined" size="small">Go to Rich Menu</Button>
      </Stack>

      {/* Accounts */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Accounts</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            ใช้สำหรับเชื่อมต่อ LINE OA และจัดการสมาชิกของแต่ละ OA
          </Typography>

          <Typography variant="subtitle2" sx={{ mt: 1 }}>Add LINE OA</Typography>
          <List dense>
            <ListItem><ListItemText primary="กดปุ่ม “Add LINE OA” มุมขวาบน" /></ListItem>
            <ListItem><ListItemText primary="กรอก Channel ID และ Channel Secret (Messaging API)" /></ListItem>
            <ListItem><ListItemText primary="กด ‘เชื่อมต่อ’ ระบบจะบันทึก OA ให้กับบัญชีของคุณ" /></ListItem>
          </List>
          <Alert severity="success" sx={{ mb: 2 }}>
            ถ้า OA เดิมถูกเชื่อมไว้แล้ว ระบบจะแจ้งว่า “อัปเดตข้อมูล/โทเค็นล่าสุดให้เรียบร้อย”
          </Alert>

          <Typography variant="subtitle2">เลือก OA เพื่อเข้าใช้งาน</Typography>
          <List dense>
            <ListItem><ListItemText primary="คลิกแถว OA เพื่อเลือก ระบบจะเซ็ต activeTenantId และพาไป /homepage พร้อม ?tenant=" /></ListItem>
          </List>

          <Typography variant="subtitle2">Members (Owner เท่านั้น)</Typography>
          <List dense>
            <ListItem><ListItemText primary="กดปุ่ม ‘Members’ ในแถวของ OA" /></ListItem>
            <ListItem><ListItemText primary="ค้นหาจากชื่อ (prefix search) หรือวาง UID รูปแบบ line:Uxxxxxxxx หรือ Uxxxxxxxx" /></ListItem>
            <ListItem><ListItemText primary="กด ‘เพิ่ม’ เพื่อเชิญเป็นสมาชิก / ปุ่มถังขยะเพื่อลบ (ลบ Owner ไม่ได้)" /></ListItem>
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
            ส่งข้อความหาผู้ติดตามทั้งหมด หรือกำหนดกลุ่มเป้าหมาย พร้อมรองรับการตั้งเวลา
          </Typography>

          <Typography variant="subtitle2">Workflow</Typography>
          <List dense>
            <ListItem><ListItemText primary="เลือก Recipients: All friends / Targeting (ระบุเซกเมนต์ภายหลังได้)" /></ListItem>
            <ListItem><ListItemText primary="เลือก Broadcast time: Send now หรือ Schedule (กำหนด Date/Time/Timezone)" /></ListItem>
            <ListItem><ListItemText primary="แต่งคอนเทนต์ด้วย Blocks (Text / Image / File / Link / Rich)" /></ListItem>
            <ListItem><ListItemText primary="กด Send test เพื่อส่งทดสอบ (push ให้ผู้ส่ง)" /></ListItem>
            <ListItem><ListItemText primary="กด Save draft หรือ Send (ถ้าตั้งเวลาจะสร้างเป็น schedule draft)" /></ListItem>
          </List>

          <Typography variant="subtitle2">Blocks ที่รองรับ</Typography>
          <List dense>
            <ListItem><ListItemText primary="Text: สูงสุด 500 ตัวอักษร/บล็อก" /></ListItem>
            <ListItem><ListItemText primary="Image: อัปโหลดไฟล์—Guest จะเก็บเป็น dataURL ก่อน, Login แล้วอัปขึ้น Storage" /></ListItem>
            <ListItem><ListItemText primary="File: แนบไฟล์—ระบบจะแนบลิงก์ดาวน์โหลดในข้อความ" /></ListItem>
            <ListItem><ListItemText primary="Link: ใส่ Label และ URL จะรวมเป็นข้อความเดียว" /></ListItem>
            <ListItem>
              <ListItemText
                primary="Rich: เลือกจาก RichMessagePicker (imagemap หรือ image+links)"
                secondary="ถ้าเป็น imagemap จะถูกแปลงเป็น LINE imagemap message อัตโนมัติ"
              />
            </ListItem>
          </List>

          <Typography variant="subtitle2">Tips</Typography>
          <List dense>
            <ListItem><ListItemText primary="รวมได้สูงสุด 5 messages ต่อการส่งหนึ่งครั้ง (ระบบจะตัดเกินอัตโนมัติ)" /></ListItem>
            <ListItem><ListItemText primary="โหมด Guest: กด Save draft (local) เพื่อเก็บไว้ก่อน" /></ListItem>
          </List>

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
            สร้างคอนเทนต์แบบรูปภาพ + พื้นที่กด (areas) หรือ imagemap เพื่อใช้ซ้ำใน Broadcast
          </Typography>

          <Typography variant="subtitle2">สร้างใหม่</Typography>
          <List dense>
            <ListItem><ListItemText primary="ไปหน้า Rich Message > Create" /></ListItem>
            <ListItem><ListItemText primary="ตั้งชื่อ, อัปโหลดรูป, เพิ่ม areas (label + URL) หรือใช้โหมด imagemap" /></ListItem>
            <ListItem><ListItemText primary="กด Save — ระบบจะเก็บลง localStorage (โหมดตัวอย่าง/เดโม่)" /></ListItem>
          </List>

          <Typography variant="subtitle2">นำไปใช้ใน Broadcast</Typography>
          <List dense>
            <ListItem><ListItemText primary="ในหน้า Broadcast กดไอคอน Rich เพื่อเปิด RichMessagePicker" /></ListItem>
            <ListItem><ListItemText primary="เลือก Rich ที่ต้องการ — ระบบจะแปลงเป็น imagemap message (ถ้ามี) หรือ image + ข้อความลิงก์" /></ListItem>
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
            ข้อความต้อนรับเมื่อผู้ใช้ “เพิ่มเพื่อน (follow)” LINE OA ของคุณ
          </Typography>

          <Typography variant="subtitle2">การตั้งค่า</Typography>
          <List dense>
            <ListItem><ListItemText primary="สวิตช์ Enabled เปิด/ปิดการทำงาน" /></ListItem>
            <ListItem><ListItemText primary="Only send for first-time friends ป้องกันส่งซ้ำเมื่อ Unblock" /></ListItem>
            <ListItem>
              <ListItemText
                primary="Text + Image (เลือกได้)"
                secondary="รองรับตัวแปร {displayName}, {accountName} เฉพาะพรีวิวจะแสดงเป็นค่าทดแทน"
              />
            </ListItem>
            <ListItem><ListItemText primary="กด Save (local) เพื่อเก็บบนเครื่อง หรือ Save to OA เพื่อบันทึกจริง" /></ListItem>
            <ListItem><ListItemText primary="Send test เพื่อทดสอบส่งเข้าบัญชีผู้ดูแล" /></ListItem>
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

      {/* Rich Menu */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Rich Menu</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            ออกแบบเมนูภาพคลิกได้ เลือกเทมเพลต, อัปโหลดภาพตามสเปค LINE และกำหนด Action ของแต่ละบล็อก
          </Typography>

          <Typography variant="subtitle2">ขั้นตอนหลัก</Typography>
          <List dense>
            <ListItem><ListItemText primary="เลือก Template (Large / Compact) หรือกด Reset to template เพื่อกลับค่าเริ่มต้น" /></ListItem>
            <ListItem><ListItemText primary="อัปโหลดภาพ — ระบบจะย่อ/อัดภาพเป็น 2500×1686 (Large) หรือ 2500×843 (Compact)" /></ListItem>
            <ListItem><ListItemText primary="จัดวาง Areas (ลาก/ย่อขยาย) และกำหนด Action ต่อบล็อก" /></ListItem>
            <ListItem><ListItemText primary="ตั้งค่า Chat bar label, Behavior (Shown/Collapsed), Schedule (Display from–to ถ้าต้องการ)" /></ListItem>
            <ListItem><ListItemText primary="กด Save draft (เก็บร่าง) หรือ Save (พร้อมตารางเวลา => Scheduled หรือไม่มีตารางเวลา => Ready)" /></ListItem>
          </List>

          <Typography variant="subtitle2">Action ที่รองรับ &amp; ตัวอย่างการใช้งาน</Typography>
          <List dense>
            <ListItem>
              <ListItemText
                primary={<><Chip size="small" label="Link" color="success" sx={{ mr: .5 }} /> เปิดหน้าเว็บ</>}
                secondary="เช่น โปรโมชัน, คูปอง, จองโต๊ะ — ระบุ URL + Label (ไม่เกิน 20)"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary={<><Chip size="small" label="Text" color="success" sx={{ mr: .5 }} /> ส่งข้อความทันที</>}
                secondary="เช่น “ดูเมนูวันนี้” / “ขอโปรโมชัน” เพื่อให้บอทตอบต่อ"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary={<><Chip size="small" label="QnA" color="success" sx={{ mr: .5 }} /> FAQ / คำถามยอดฮิต</>}
                secondary={
                  <>
                    ตั้ง <em>QnA key</em> และรายการ Q/A — ระบบจะส่ง postback <Code>{`qna:<key>`}</Code> ไปยังบอทของคุณ<br/>
                    ผู้ใช้พิมพ์ “1–N” หรือข้อความใกล้เคียงเพื่อรับคำตอบได้
                  </>
                }
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary={<><Chip size="small" label="Live Chat" color="success" sx={{ mr: .5 }} /> เปิดแชทสด</>}
                secondary="กำหนดข้อความทริกเกอร์ (เช่น #live) เพื่อให้ระบบสลับเข้าห้องแชทเจ้าหน้าที่"
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary={<><Chip size="small" label="No action" sx={{ mr: .5 }} /> ไม่มีการทำงาน</>}
                secondary="ใช้สำหรับพื้นที่ตกแต่ง/กันพื้นที่"
              />
            </ListItem>
          </List>

          <Typography variant="subtitle2">ข้อควรทราบ</Typography>
          <List dense>
            <ListItem><ListItemText primary="ภาพควรมีสัดส่วนพอดีกับสเปคเพื่อให้คมชัด (ระบบช่วยบีบอัดให้ ≤ 1MB)" /></ListItem>
            <ListItem><ListItemText primary="Label แถบล่าง (Chat bar label) จำกัด 14 ตัวอักษร" /></ListItem>
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
            <ListItem><ListItemText primary="Guest: ข้อมูลบันทึกเป็น localStorage / dataURL ชั่วคราว" /></ListItem>
            <ListItem><ListItemText primary="Logged-in + เลือก OA: อัปโหลดไฟล์ขึ้น Firebase Storage และบันทึกข้อมูลจริง" /></ListItem>
          </List>

          <Typography variant="subtitle2" sx={{ mt: 1 }}>การตั้งเวลา (Schedule)</Typography>
          <List dense>
            <ListItem><ListItemText primary="Broadcast: เลือก Date/Time/Timezone แล้วกด Save/Schedule" /></ListItem>
            <ListItem><ListItemText primary="Rich Menu: ระบุ Display from–to เพื่อสร้างเป็น Scheduled; ไม่ระบุจะเป็น Ready" /></ListItem>
          </List>
        </AccordionDetails>
      </Accordion>
    </Container>
  );
}
