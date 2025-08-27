// src/pages/TipsPage.jsx
import React from 'react';
import {
  Container, Typography, Button, Stack, Alert, Chip, Divider, Box,
  Accordion, AccordionSummary, AccordionDetails, List, ListItem, ListItemText,
  Grid, Card, CardContent, CardMedia, Link as MuiLink } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useNavigate, Link as RouterLink } from 'react-router-dom';


// เพิ่มรูปที่ใช้ใน “ข้อ B”
import imgOA_Create     from '../assets/oa_create_new.png';
import imgOA_Form       from '../assets/oa_form.png';
import imgOA_Done       from '../assets/oa_done.png';
import imgOA_List       from '../assets/oa_list.png';
import imgOA_Settings   from '../assets/oa_settings.png';
import imgOA_Enable     from '../assets/oa_enable_messaging_api.png';
import imgOA_Provider   from '../assets/oa_choose_provider.png';
import imgOA_OK         from '../assets/oa_ok.png';
import imgOA_Check_id   from '../assets/oa_check_id.png'; // ภาพรวมขั้นที่เห็น Channel ID/Secret


// ---------- Helpers ----------
const SectionTitle = ({ children }) => (
  <Typography variant="h6" sx={{ fontWeight: 700 }}>{children}</Typography>
);
const SubTitle = ({ children, sx }) => (
  <Typography variant="subtitle2" sx={{ mt: 1, ...sx }}>{children}</Typography>
);
const Note = ({ children }) => (
  <Alert severity="info" sx={{ my: 1 }}>{children}</Alert>
);
const Code = ({ children }) => (
  <Box sx={{
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13, bgcolor: '#f7f7f9', border: '1px solid #eee',
    p: 1.25, borderRadius: 1, whiteSpace: 'pre-wrap', overflowX: 'auto'
  }}>
    {children}
  </Box>
);

// “ภาพตัวอย่าง” จำลอง Rich Menu template ไม่ต้องใช้ไฟล์รูป
function RMThumb({ label, size = 'large', cells = [] }) {
  const pt = size === 'compact' ? '33%' : '45%';
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: .5 }}>{label}</Typography>
        <Box sx={{
          position: 'relative', width: '100%', pt,
          bgcolor: '#f1f3f4', borderRadius: 1, overflow: 'hidden'
        }}>
          {cells.map(([x, y, w, h], i) => (
            <Box key={i} sx={{
              position: 'absolute',
              left: `${(x / 6) * 100}%`, top: `${(y / 4) * 100}%`,
              width: `${(w / 6) * 100}%`, height: `${(h / 4) * 100}%`,
              border: '1px solid #cfd8dc', background: 'rgba(0,0,0,0.03)', borderRadius: .5
            }} />
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
        <Typography variant="h4" fontWeight="bold">Tips : คู่มือการใช้งาน</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => navigate('/homepage')}>Back to Home</Button>
        </Stack>
      </Stack>

      <Alert severity="success" sx={{ mb: 2 }}>
        สรุปสั้น ๆ สำหรับหน้า: <strong>Accounts</strong>, <strong>Broadcast</strong>, <strong>Rich Message</strong>, <strong>Greeting Message</strong>, <strong>Rich Menu</strong>.
        โหมด <em>Guest</em> จะบันทึกเฉพาะเครื่อง — เมื่อกด “ส่ง/บันทึกขึ้น OA” ระบบจะพาไป Login อัตโนมัติ
      </Alert>

      {/* Quick shortcuts */}
      <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap' }}>
        <Button component={RouterLink} to="/accounts" variant="contained" size="small">Accounts</Button>
        <Button component={RouterLink} to="/homepage/broadcast" variant="outlined" size="small">Broadcast</Button>
        <Button component={RouterLink} to="/homepage/rich-message" variant="outlined" size="small">Rich Message</Button>
        <Button component={RouterLink} to="/homepage/greeting-message" variant="outlined" size="small">Greeting</Button>
        <Button component={RouterLink} to="/homepage/rich-menus" variant="outlined" size="small">Rich Menu</Button>
      </Stack>

      {/* Channel ID / Secret */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SectionTitle>Channel ID / Channel secret</SectionTitle>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            การเชื่อมต่อ LINE OA (Channel ID / Channel secret)
          </Typography>

          {/* B1 */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                1) เข้าสู่ LINE Official Account Manager แล้วกด “Create new”
              </Typography>
              <Typography variant="body2" color="text.secondary">
                สร้างบัญชี LINE OA ใหม่ หากยังไม่มี (กรอกข้อมูลชื่อ ประเภท ธุรกิจ ฯลฯ ให้ครบ)
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Create} alt="Create new Official Account"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
            <Box sx={{ px: 2, py: 1, fontSize: 12, color: 'text.secondary' }}>
              ตัวอย่าง: หน้าสร้าง OA ใหม่
            </Box>
          </Card>

          {/* B2 */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                2) กรอกรายละเอียดให้ครบถ้วน
              </Typography>
              <Typography variant="body2" color="text.secondary">
                ตรวจสอบชื่อ รูปภาพ และข้อมูลธุรกิจให้ถูกต้องก่อนดำเนินการต่อ
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Form} alt="OA Form"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B3 */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                3) ตรวจสอบข้อมูลและกด “เสร็จสิ้น”
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Done} alt="Complete OA"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B4 */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                4) กลับไปเลือก Account ที่สร้างจากรายการ (List)
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_List} alt="OA List"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B5 */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                5) กด “Settings” มุมขวาบนของ OA
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Settings} alt="OA Settings"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B6 */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                6) ไปที่หัวข้อ “Messaging API” และกด “Enable Messaging API”
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Enable} alt="Enable Messaging API"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B7 */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                7) เลือก Provider ที่ต้องการหรือสร้าง Provider ใหม่
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Provider} alt="Choose Provider"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B8 */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                8) กด “OK”
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_OK} alt="Confirm OK"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* B9 */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                9) ดูค่า Channel ID / Channel secret
              </Typography>
              <Typography variant="body2" color="text.secondary">
                - Tab <b>Basic settings</b>: ดู <b>Channel ID</b> • Tab <b>Messaging API</b>: เลื่อนลงไปด้านล่างเพื่อดู <b>Channel secret</b>
              </Typography>
            </CardContent>
            <CardMedia component="img" image={imgOA_Check_id} alt="ตำแหน่ง Channel ID / Channel secret"
              sx={{ maxHeight: 520, objectFit: 'contain', background: '#fafafa', borderTop: '1px solid #eee' }} />
          </Card>

          {/* ใช้กับระบบเราอย่างไร */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                ใช้ค่าเหล่านี้กับระบบเราอย่างไร?
              </Typography>
              <Typography variant="body2" color="text.secondary">
                เปิดหน้า <b>Accounts</b> → กด <b>Add LINE OA</b> → วาง <em>Channel ID</em> และ <em>Channel secret</em> แล้วกดเชื่อมต่อ
                (หากเคยเชื่อมแล้ว ระบบจะอัปเดตโทเค็น/ข้อมูลล่าสุดให้โดยไม่สร้างซ้ำ)
              </Typography>
              <Box sx={{ mt: 1 }}>
                <MuiLink href="https://lineforbusiness.com/th/service/line-oa-features" target="_blank" rel="noreferrer">
                  เปิด LINE Official Account
                </MuiLink>
              </Box>
            </CardContent>
          </Card>
          
          <Note>
            ถ้าเชื่อม OA เดิมซ้ำ ระบบจะ “อัปเดตข้อมูล/โทเค็นล่าสุดให้” โดยไม่สร้างซ้ำ •
            หากไม่เห็นค่า <em>Channel secret</em> ให้ตรวจสิทธิ์ใน Provider/Project และยืนยันว่า Channel เป็นประเภท <b>Messaging API</b>
          </Note>
        </AccordionDetails>
      </Accordion>


      {/* Accounts */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SectionTitle>Accounts</SectionTitle>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            จัดการการเชื่อมต่อ LINE OA และสมาชิกของแต่ละ OA
          </Typography>

          <SubTitle>Add LINE OA</SubTitle>
          <List dense>
            <ListItem><ListItemText primary="กด “Add LINE OA” มุมขวาบน" /></ListItem>
            <ListItem><ListItemText primary="กรอก Channel ID และ Channel secret (จาก Messaging API)" /></ListItem>
            <ListItem><ListItemText primary="กด ‘เชื่อมต่อ’" /></ListItem>
          </List>

          <SubTitle sx={{ mt: 1 }}>Members</SubTitle>
          <List dense>
            <ListItem>
              <ListItemText
                primary="Owner → ปุ่ม ‘Members’ เพื่อเพิ่ม/ลบสมาชิก"
                secondary="ค้นหาจากชื่อ หรือวาง UID: line:Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </ListItem>
          </List>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            อ้างอิงพฤติกรรมจาก <Chip size="small" label="AccountsPage.js" />
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Broadcast */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SectionTitle>Broadcast</SectionTitle>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            ส่งข้อความถึงผู้ติดตามทั้งหมดหรือทำ Targeting และตั้งเวลาส่งได้
          </Typography>

          <SubTitle>Workflow</SubTitle>
          <List dense>
            <ListItem><ListItemText primary="Recipients: All friends / Targeting" /></ListItem>
            <ListItem><ListItemText primary="Broadcast time: Send now / Schedule (ระบุ Date/Time/Timezone)" /></ListItem>
            <ListItem><ListItemText primary="แต่งคอนเทนต์ด้วย Blocks: Text / Image / File / Link / Rich" /></ListItem>
            <ListItem><ListItemText primary="Send test, Save draft, หรือ Send" /></ListItem>
          </List>

          <SubTitle>ตัวอย่าง Blocks</SubTitle>
          <Grid container spacing={2} sx={{ mb: 1 }}>
            {[
              ['Text', 'ข้อความสั้น ๆ สูงสุด ~500 ตัวอักษร'],
              ['Image', 'แนบรูป/อัปโหลด (โหมด Guest เก็บเป็น dataURL ชั่วคราว)'],
              ['File', 'แนบไฟล์ ระบบแปลงเป็นลิงก์'],
              ['Rich', 'เลือก Rich message / Imagemap ที่สร้างไว้']
            ].map(([title, desc]) => (
              <Grid item xs={12} sm={6} md={3} key={title}>
                <Card variant="outlined"><CardContent>
                  <Typography fontWeight={700}>{title}</Typography>
                  <Typography variant="body2" color="text.secondary">{desc}</Typography>
                </CardContent></Card>
              </Grid>
            ))}
          </Grid>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            อ้างอิงพฤติกรรมจาก <Chip size="small" label="BroadcastPage.js" />
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Rich Message */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SectionTitle>Rich Message</SectionTitle>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            สร้างรูปภาพ + พื้นที่กด (areas) หรือ <em>imagemap</em> เพื่อใช้ซ้ำใน Broadcast
          </Typography>

          <SubTitle>ขั้นตอน</SubTitle>
          <List dense>
            <ListItem><ListItemText primary="ไปหน้า Rich Message → Create" /></ListItem>
            <ListItem><ListItemText primary="อัปโหลดภาพ ตั้งชื่อ และเพิ่ม areas (label + URL)" /></ListItem>
            <ListItem><ListItemText primary="บันทึก (โหมดเดโม่เก็บ localStorage) แล้วเลือกใช้ใน Broadcast" /></ListItem>
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
          <SectionTitle>Greeting Message</SectionTitle>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            ข้อความต้อนรับเมื่อผู้ใช้เพิ่มเพื่อน (follow) LINE OA ของคุณ
          </Typography>

          <SubTitle>การตั้งค่า</SubTitle>
          <List dense>
            <ListItem><ListItemText primary="Enabled / Only send for first-time friends" /></ListItem>
            <ListItem><ListItemText primary="Text + Image (รองรับตัวแปร {displayName}, {accountName})" /></ListItem>
            <ListItem><ListItemText primary="Save (local) / Save to OA / Send test" /></ListItem>
          </List>

          <SubTitle>ตัวอย่างข้อความ</SubTitle>
          <Code>
{`สวัสดี {displayName} ขอบคุณที่เพิ่ม {accountName} 😊
พิมพ์ "เมนู" เพื่อดูสิทธิพิเศษวันนี้ได้เลย!`}
          </Code>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            อ้างอิงพฤติกรรมจาก <Chip size="small" label="GreetingMessagePage.js" />
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Rich Menu */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SectionTitle>Rich Menu</SectionTitle>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            ออกแบบเมนูภาพคลิกได้ เลือกเทมเพลต อัปโหลดภาพตามสเปค LINE และกำหนด Action ของแต่ละบล็อก
          </Typography>

          <SubTitle>ตัวอย่าง Template (ภาพประกอบ)</SubTitle>
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

          <SubTitle>Action ที่รองรับ & ใช้อย่างไร</SubTitle>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined"><CardContent>
                <Chip size="small" label="Link" color="success" sx={{ mr: .5 }} />
                <Typography fontWeight={700} sx={{ display:'inline' }}>เปิดหน้าเว็บ (URL)</Typography>
                <Typography variant="body2" color="text.secondary">เช่น โปรโมชัน/คูปอง/จองโต๊ะ — ระบุ URL + Label</Typography>
              </CardContent></Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card variant="outlined"><CardContent>
                <Chip size="small" label="Text" color="success" sx={{ mr: .5 }} />
                <Typography fontWeight={700} sx={{ display:'inline' }}>ส่งข้อความทันที</Typography>
                <Typography variant="body2" color="text.secondary">เช่น “ดูเมนูวันนี้” เพื่อให้บอทตอบต่อ (trigger คำสั่งในบอท)</Typography>
              </CardContent></Card>
            </Grid>

            {/* QnA – ขยายรายละเอียดตามที่ขอ */}
            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Chip size="small" label="QnA" color="success" sx={{ mr: .75 }} />
                  <Typography fontWeight={700} sx={{ display:'inline' }}>FAQ / คำถามยอดฮิต (Postback แบบ qna:&lt;key&gt;)</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>
                    ใช้สำหรับ “เปิดคำตอบสำเร็จรูป” จากคีย์ที่กำหนดไว้ล่วงหน้า เหมาะกับเมนูช่วยเหลือ/นโยบาย/เวลาทำการ ฯลฯ
                  </Typography>

                  <SubTitle sx={{ mt: 1.25 }}>วิธีตั้งค่า</SubTitle>
                  <List dense sx={{ mb: 1 }}>
                    <ListItem>
                      <ListItemText
                        primary="1) กำหนด QnA key"
                        secondary="เช่น help, shipping, refund, hours"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="2) สร้างรายการคำตอบในระบบ"
                        secondary="Mapping: key → ข้อความ/เทมเพลต (เก็บใน Firestore/DB ของคุณ)"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="3) ตั้ง Action ของบล็อกใน Rich Menu เป็น QnA"
                        secondary="ระบุ key (เช่น shipping) ระบบจะยิง postback qna:shipping"
                      />
                    </ListItem>
                  </List>

                  <SubTitle>ตัวอย่าง Postback ที่บอทจะได้รับ</SubTitle>
                  <Code>
{`// Webhook event (ย่อ)
{
  "type": "postback",
  "postback": { "data": "qna:shipping" },
  "source": { "userId": "Uxxxxxxxx..." },
  "replyToken": "xxxx"
}

// Handler (pseudo)
const data = event.postback?.data || '';
if (data.startsWith('qna:')) {
  const key = data.slice(4); // "shipping"
  const answer = await getQnaAnswer(key); // ดึงจาก DB/Firestore
  if (answer) {
    await client.replyMessage(event.replyToken, { type: 'text', text: answer });
  } else {
    await client.replyMessage(event.replyToken, { type: 'text', text: 'ขออภัย ไม่พบคำตอบที่ต้องการ' });
  }
}`}
                  </Code>

                  <SubTitle>แนะนำโครงสร้างข้อมูล (Firestore/DB)</SubTitle>
                  <Code>
{`// ตัวอย่าง Firestore
qna/{tenantId}/entries/{key} = {
  answer: "เวลาทำการ: จ-ศ 09:00-18:00 น.",
  updatedAt: 1712345678901,
  // เพิ่ม field optional:
  rich: {...}, // ถ้าต้องการส่ง Flex/Imagemap
  aliases: ["openhours", "time", "hours"]
}`}
                  </Code>

                  <SubTitle>ทริคที่มีประโยชน์</SubTitle>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="รองรับหลายภาษา"
                        secondary="แยกเอกสาร qna ตาม locale หรือเก็บ answer.th / answer.en ใน document เดียว"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="นับสถิติยอดกด/คำถามยอดนิยม"
                        secondary="log key + timestamp เพื่อนำไปแสดง Top QnA/แดชบอร์ด"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Fallback ที่เป็นมิตร"
                        secondary="ถ้าไม่พบ key ให้ส่งลิงก์ ‘ดูทั้งหมด’ หรือส่ง Rich Message รวมหมวด QnA"
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            {/* Live Chat */}
            <Grid item xs={12}>
              <Card variant="outlined"><CardContent>
                <Chip size="small" label="Live Chat" color="success" sx={{ mr: .5 }} />
                <Typography fontWeight={700} sx={{ display:'inline' }}>เปิดแชทสด</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>
                  ตั้งข้อความทริกเกอร์ เช่น <Code>#live</Code> เพื่อให้ระบบสลับโหมดแชทคนจริง/ส่งต่อทีมแอดมิน
                </Typography>
              </CardContent></Card>
            </Grid>
          </Grid>

          <List dense sx={{ mt: 2 }}>
            <ListItem><ListItemText primary="สเปคภาพ: Large 2500×1686, Compact 2500×843 (≤ ~1MB)" /></ListItem>
            <ListItem><ListItemText primary="Chat bar label จำกัด 14 ตัวอักษร" /></ListItem>
            <ListItem><ListItemText primary="ตั้งช่วง Display from–to เพื่อ Scheduled; ไม่ระบุ = พร้อมใช้งานทันที (Ready)" /></ListItem>
          </List>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            อ้างอิงพฤติกรรมจาก <Chip size="small" label="RichMenusPage.js" />
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* FAQ */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SectionTitle>FAQ</SectionTitle>
        </AccordionSummary>
        <AccordionDetails>
          <SubTitle>Guest vs Logged‑in</SubTitle>
          <List dense>
            <ListItem><ListItemText primary="Guest: บันทึก localStorage และ dataURL ชั่วคราว" /></ListItem>
            <ListItem><ListItemText primary="Logged‑in + เลือก OA: อัปโหลดไฟล์ขึ้น Firebase Storage และบันทึกจริง" /></ListItem>
          </List>

          <SubTitle sx={{ mt: 1 }}>การตั้งเวลา (Scheduling)</SubTitle>
          <List dense>
            <ListItem><ListItemText primary="Broadcast: เลือก Date/Time/Timezone แล้ว Save/Schedule" /></ListItem>
            <ListItem><ListItemText primary="Rich Menu: ระบุ Display from–to เพื่อสร้าง Scheduled" /></ListItem>
          </List>
        </AccordionDetails>
      </Accordion>
    </Container>
  );
}
