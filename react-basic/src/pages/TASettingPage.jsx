// src/pages/TASettingPage.jsx (mobile-first)
import React, { useMemo, useState } from 'react';
import {
  Box, Grid, Card, CardContent, Button, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Stack, Chip, Divider, FormControlLabel, Checkbox, MenuItem, Alert,
  AppBar, Toolbar, IconButton, Paper, useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import PeopleIcon from '@mui/icons-material/PeopleAlt';
import PaymentsIcon from '@mui/icons-material/Payments';
import ShieldIcon from '@mui/icons-material/AdminPanelSettings';
import NotificationsIcon from '@mui/icons-material/NotificationsActive';

function BigAction({ icon, title, subtitle, onClick }) {
  return (
    <Card
      onClick={onClick}
      sx={{
        borderRadius: 2,
        boxShadow: '0 1px 6px rgba(0,0,0,.08)',
        ':active': { opacity: .8 },
      }}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{
          width: 40, height: 40, borderRadius: 2, bgcolor: 'primary.light',
          display: 'grid', placeItems: 'center', color: 'white', flexShrink: 0
        }}>
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>{title}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>{subtitle}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function TASettingPage() {
  // ปกติ tenantId/uid มาจาก session หลัง /auth/magic — รับจาก query ชั่วคราว
  const sp = new URLSearchParams(window.location.search);
  const tenantId = useMemo(() => sp.get('tenant') || '', [sp]);

  // responsive
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Dialog states
  const [openEmp, setOpenEmp] = useState(false);
  const [openPayCycle, setOpenPayCycle] = useState(false);
  const [openRole, setOpenRole] = useState(false);
  const [openNotif, setOpenNotif] = useState(false);

  // helper: header สำหรับ dialog แบบเต็มจอในมือถือ
  const MobileDialogBar = ({ title, onClose }) => (
    <AppBar sx={{ position: 'sticky', top: 0, bgcolor: 'background.paper', color: 'text.primary', boxShadow: 'none', borderBottom: '1px solid #eee' }}>
      <Toolbar sx={{ px: 1 }}>
        <IconButton edge="start" aria-label="close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
        <Typography sx={{ ml: 1, flex: 1 }} variant="subtitle1" fontWeight={700}>{title}</Typography>
      </Toolbar>
    </AppBar>
  );

  // footer action bar สำหรับมือถือ
  const MobileActionBar = ({ children }) => (
    <Paper elevation={3} sx={{
      position: 'sticky', bottom: 0, left: 0, right: 0, p: 1.25,
      borderTopLeftRadius: 12, borderTopRightRadius: 12
    }}>
      <Stack direction="row" spacing={1}>{children}</Stack>
    </Paper>
  );

  return (
    <Box sx={{ p: { xs: 1.5, md: 0 } }}>
      <Stack direction="row" alignItems="center" spacing={1.2} sx={{ mb: 1.25 }}>
        <Typography variant="h6" fontWeight={800}>Time Attendance — Settings</Typography>
        <Chip label={tenantId ? `Tenant: ${tenantId}` : 'No tenant'} size="small" />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        หน้านี้สำหรับ Owner/Admin เท่านั้น
      </Typography>

      {/* ปุ่มใหญ่ 4 อัน (แตะง่ายบนมือถือ) */}
      <Grid container spacing={1.25}>
        <Grid item xs={12}>
          <BigAction
            icon={<PeopleIcon fontSize="small" />}
            title="ตั้งค่า/เพิ่มพนักงาน"
            subtitle="อ่านบัตร • เงินเดือน/ตำแหน่ง • เพิ่ม/หัก • กฎขาด-ลา-สาย"
            onClick={() => setOpenEmp(true)}
          />
        </Grid>
        <Grid item xs={12}>
          <BigAction
            icon={<PaymentsIcon fontSize="small" />}
            title="ตั้งค่าการจ่าย (งวด)"
            subtitle="รายชั่วโมง/รายวัน/รายเดือน หรือทุก N วัน/ชั่วโมง"
            onClick={() => setOpenPayCycle(true)}
          />
        </Grid>
        <Grid item xs={12}>
          <BigAction
            icon={<ShieldIcon fontSize="small" />}
            title="ตั้งค่าผู้ใช้งาน/สิทธิ์"
            subtitle="กำหนดสิทธิ์ทำเงินเดือน/ดูรายงาน/อนุมัติ"
            onClick={() => setOpenRole(true)}
          />
        </Grid>
        <Grid item xs={12}>
          <BigAction
            icon={<NotificationsIcon fontSize="small" />}
            title="ตั้งค่าแจ้งเตือน"
            subtitle="กำหนดเหตุการณ์และช่องทางแจ้ง (LINE/Email)"
            onClick={() => setOpenNotif(true)}
          />
        </Grid>
      </Grid>

      {/* === Dialog: Employee Config === */}
      <Dialog open={openEmp} onClose={() => setOpenEmp(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        {isMobile && <MobileDialogBar title="ตั้งค่า/เพิ่มพนักงาน" onClose={() => setOpenEmp(false)} />}
        {!isMobile && <DialogTitle>ตั้งค่า/เพิ่มพนักงาน</DialogTitle>}
        <DialogContent dividers sx={{ p: { xs: 1.5, sm: 3 } }}>
          <Stack spacing={1.5}>
            <Alert severity="info">เวอร์ชันเริ่มต้น — เชื่อม OCR/บัตรภายหลังได้</Alert>

            <Typography variant="subtitle2">ข้อมูลบัตร/บุคคล</Typography>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="เลขบัตรประชาชน" inputMode="numeric" /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="ชื่อ - นามสกุล" /></Grid>
              <Grid item xs={12}><TextField fullWidth size="small" label="ที่อยู่ตามบัตร" /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="เบอร์โทร" inputMode="tel" /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" label="เลขบัญชีธนาคาร (ถ้ามี)" inputMode="numeric" /></Grid>
            </Grid>

            <Divider />

            <Typography variant="subtitle2">โครงสร้างค่าจ้าง</Typography>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={4}>
                <TextField select fullWidth size="small" label="วิธีจ่าย">
                  <MenuItem value="account">บัญชี</MenuItem>
                  <MenuItem value="cash">เงินสด</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}><TextField fullWidth size="small" label="ตำแหน่ง" /></Grid>
              <Grid item xs={12} sm={4}><TextField fullWidth size="small" type="number" label="เงินเดือน/ค่าแรงพื้นฐาน" inputMode="decimal" /></Grid>

              <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="number" label="บวกประจำ (+/เดือน)" inputMode="decimal" /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="number" label="หักประจำ (-/เดือน)" inputMode="decimal" /></Grid>

              <Grid item xs={12}>
                <FormControlLabel control={<Checkbox size="small" />} label="เพิ่ม/หักครั้งเดียวในงวดล่าสุด" />
              </Grid>
            </Grid>

            <Divider />

            <Typography variant="subtitle2">กะงาน/กฎขาด-ลา-สาย</Typography>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={4}><TextField fullWidth size="small" type="number" label="ชั่วโมงทำงาน/วัน (เช่น 8)" inputMode="decimal" /></Grid>
              <Grid item xs={12} sm={4}><TextField fullWidth size="small" type="number" label="ค่าแรง/วัน (เช่น 400)" inputMode="decimal" /></Grid>
              <Grid item xs={12} sm={4}>
                <FormControlLabel control={<Checkbox size="small" />} label="หักเงินตามสัดส่วนเมื่อ ขาด/ลา/สาย" />
              </Grid>
              <Grid item xs={12}>
                <Chip size="small" label="สูตรตัวอย่าง: หัก = 400 - (400/8*ชั่วโมงที่ขาด)" />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>

        {/* Action bar: desktop = ปุ่มปกติ, mobile = แถบล่าง */}
        {isMobile ? (
          <MobileActionBar>
            <Button fullWidth variant="outlined" onClick={() => setOpenEmp(false)}>ยกเลิก</Button>
            <Button fullWidth variant="contained" onClick={() => setOpenEmp(false)}>บันทึก</Button>
          </MobileActionBar>
        ) : (
          <DialogActions>
            <Button onClick={() => setOpenEmp(false)}>ยกเลิก</Button>
            <Button variant="contained" onClick={() => setOpenEmp(false)}>บันทึก</Button>
          </DialogActions>
        )}
      </Dialog>

      {/* === Dialog: Pay Cycle === */}
      <Dialog open={openPayCycle} onClose={() => setOpenPayCycle(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        {isMobile && <MobileDialogBar title="ตั้งค่าการจ่าย (งวด/รอบ)" onClose={() => setOpenPayCycle(false)} />}
        {!isMobile && <DialogTitle>ตั้งค่าการจ่าย (งวด/รอบ)</DialogTitle>}
        <DialogContent dividers sx={{ p: { xs: 1.5, sm: 3 } }}>
          <Stack spacing={1.5}>
            <TextField select fullWidth size="small" label="รูปแบบงวด">
              <MenuItem value="hourly">รายชั่วโมง</MenuItem>
              <MenuItem value="daily">รายวัน</MenuItem>
              <MenuItem value="monthly">รายเดือน</MenuItem>
              <MenuItem value="every_n_days">ทุก N วัน</MenuItem>
              <MenuItem value="every_n_hours">ทุก N ชั่วโมง</MenuItem>
            </TextField>
            <TextField fullWidth size="small" type="number" label="N (ถ้าเลือกทุก N วัน/ชั่วโมง)" inputMode="numeric" />
            <TextField fullWidth size="small" label="หมายเหตุของงวดนี้ (optional)" />
          </Stack>
        </DialogContent>
        {isMobile ? (
          <MobileActionBar>
            <Button fullWidth variant="outlined" onClick={() => setOpenPayCycle(false)}>ยกเลิก</Button>
            <Button fullWidth variant="contained" onClick={() => setOpenPayCycle(false)}>บันทึก</Button>
          </MobileActionBar>
        ) : (
          <DialogActions>
            <Button onClick={() => setOpenPayCycle(false)}>ยกเลิก</Button>
            <Button variant="contained" onClick={() => setOpenPayCycle(false)}>บันทึก</Button>
          </DialogActions>
        )}
      </Dialog>

      {/* === Dialog: Roles === */}
      <Dialog open={openRole} onClose={() => setOpenRole(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        {isMobile && <MobileDialogBar title="ตั้งค่าผู้ใช้งาน/สิทธิ์" onClose={() => setOpenRole(false)} />}
        {!isMobile && <DialogTitle>ตั้งค่าผู้ใช้งาน/สิทธิ์</DialogTitle>}
        <DialogContent dividers sx={{ p: { xs: 1.5, sm: 3 } }}>
          <Stack spacing={1.5}>
            <TextField fullWidth size="small" label="ค้นหาผู้ใช้ (username/ชื่อจริง)" />
            <TextField select fullWidth size="small" label="บทบาท">
              <MenuItem value="owner">Owner</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="supervisor">Supervisor</MenuItem>
              <MenuItem value="payroll">Payroll</MenuItem>
              <MenuItem value="viewer">Viewer (Reports only)</MenuItem>
            </TextField>
            <FormControlLabel control={<Checkbox size="small" defaultChecked />} label="อนุญาตดูรายงาน" />
            <FormControlLabel control={<Checkbox size="small" />} label="อนุญาตทำเงินเดือน" />
          </Stack>
        </DialogContent>
        {isMobile ? (
          <MobileActionBar>
            <Button fullWidth variant="outlined" onClick={() => setOpenRole(false)}>ยกเลิก</Button>
            <Button fullWidth variant="contained" onClick={() => setOpenRole(false)}>บันทึก</Button>
          </MobileActionBar>
        ) : (
          <DialogActions>
            <Button onClick={() => setOpenRole(false)}>ยกเลิก</Button>
            <Button variant="contained" onClick={() => setOpenRole(false)}>บันทึก</Button>
          </DialogActions>
        )}
      </Dialog>

      {/* === Dialog: Notifications === */}
      <Dialog open={openNotif} onClose={() => setOpenNotif(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        {isMobile && <MobileDialogBar title="ตั้งค่าแจ้งเตือน" onClose={() => setOpenNotif(false)} />}
        {!isMobile && <DialogTitle>ตั้งค่าแจ้งเตือน</DialogTitle>}
        <DialogContent dividers sx={{ p: { xs: 1.5, sm: 3 } }}>
          <Stack spacing={1.5}>
            <TextField select fullWidth size="small" label="เหตุการณ์ที่จะแจ้งเตือน">
              <MenuItem value="payroll_ready">เงินเดือนพร้อมจ่าย</MenuItem>
              <MenuItem value="payroll_paid">จ่ายเงินเดือนแล้ว</MenuItem>
              <MenuItem value="abnormality">ขาด/สายผิดปกติ</MenuItem>
            </TextField>
            <TextField select fullWidth size="small" label="ช่องทางแจ้ง">
              <MenuItem value="line">LINE</MenuItem>
              <MenuItem value="email">Email</MenuItem>
            </TextField>
            <TextField fullWidth size="small" label="กลุ่ม/ผู้รับ (LINE group id / email, คั่นด้วย ,)" />
            <FormControlLabel control={<Checkbox size="small" defaultChecked />} label="เปิดใช้งานการแจ้งเตือน" />
          </Stack>
        </DialogContent>
        {isMobile ? (
          <MobileActionBar>
            <Button fullWidth variant="outlined" onClick={() => setOpenNotif(false)}>ยกเลิก</Button>
            <Button fullWidth variant="contained" onClick={() => setOpenNotif(false)}>บันทึก</Button>
          </MobileActionBar>
        ) : (
          <DialogActions>
            <Button onClick={() => setOpenNotif(false)}>ยกเลิก</Button>
            <Button variant="contained" onClick={() => setOpenNotif(false)}>บันทึก</Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  );
}
