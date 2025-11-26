/*******************************
 * LINE Time Attendance – GAS API (tenant-less)
 * One spreadsheet = one OA/tenant
 * Timezone: Asia/Bangkok
 *******************************/
const TZ = 'Asia/Bangkok';
const SHARED_KEY = 'oifjhweorijgfowrejgowerngojwpasdasdwe'; // ให้ตรงกับ .env

/**** Sheet names ****/
const SH = {
  EMP:  'employees',
  WORK: 'work_logs',
  LEAVE:'leave_logs',
  RUN:  'payroll_runs',
  ITEM: 'payroll_items',
  ROLES:'roles',            // ✅ ใหม่
  NOTI: 'notifications',    // ✅ ใหม่
  PSTAT:'payroll_status',   // ✅ ใหม่
  PG:   'paygroups',        // ✅ ใหม่
  PGM:  'paygroups_members' // ✅ ใหม่
};

// ===== Work logs (multi-sheet: one per month) =====
// header มาตรฐานของ work_logs (ใช้ทุกชีต)
const WORK_HEADERS = [
  'lineUserId','io','logId','time','date',
  'lat','lng','address','note','linkedOutId','_raw'
];

// คืนค่า "คีย์เดือน" จาก YMD → 'YYYY-MM'
function workMonthKeyFromYMD(ymd){
  const s = String(ymd || '');
  return s.slice(0, 7); // 'YYYY-MM'
}

// สร้างชื่อชีตจาก month key → เช่น 'work_logs_2025-11'
function workSheetNameFromMonthKey(monthKey){
  monthKey = String(monthKey || '').slice(0, 7);
  return SH.WORK + '_' + monthKey; // ex. "work_logs_2025-11"
}

// จากวันที่ (YMD) → ชื่อชีตของเดือนนั้น
function workSheetNameFromDateYMD(ymd){
  const mk = workMonthKeyFromYMD(ymd);
  return workSheetNameFromMonthKey(mk);
}

// ดึงรายชื่อชีต work_logs ทั้งแบบเก่า (work_logs)
// และแบบรายเดือน ที่เกี่ยวข้องกับช่วง [startYMD, endYMD]
function getWorkSheetsForRange(startYMD, endYMD){
  const sss = ss();
  const out = [];

  // legacy sheet 
  // const legacy = sss.getSheetByName(SH.WORK);
  // if (legacy){
  //   ensureHeaders(legacy, WORK_HEADERS);
  //   out.push(legacy);
  // }

  if (!startYMD || !endYMD) return out;

  const start = new Date(startYMD + 'T00:00:00');
  const end   = new Date(endYMD   + 'T00:00:00');

  let y = start.getFullYear();
  let m = start.getMonth();  // 0-based
  const endY = end.getFullYear();
  const endM = end.getMonth();

  while (y < endY || (y === endY && m <= endM)){
    const ym = y + '-' + ('0' + (m + 1)).slice(-2); // 'YYYY-MM'
    const name = workSheetNameFromMonthKey(ym);
    const ws = sss.getSheetByName(name);
    if (ws){
      ensureHeaders(ws, WORK_HEADERS);
      out.push(ws);
    }
    m++;
    if (m > 11){ m = 0; y++; }
  }
  return out;
}


/** ---------- CTX: เปิด Spreadsheet ตาม sheetId ที่ถูกส่งมา ---------- */
var __CTX = null;
function withCtx(body, fn){ __CTX = body || null; try { return fn(); } finally { __CTX = null; } }

function ssFromCtx() {
  let id = '';
  if (__CTX) id = String(__CTX.sheetId || __CTX.appsSheetId || __CTX.sheet_id || '').trim();
  if (!id)   id = (PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '').trim();
  if (!id)   throw new Error('missing sheetId');
  return SpreadsheetApp.openById(id);
}

/**** Helpers ****/
const now = () => Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
const ymd = d => Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd');
const num = v => (v === '' || v == null ? null : Number(v));
const jstr = o => JSON.stringify(o ?? {});
const jparse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

// 🔧 money rounding helper: เศษ ≥ .50 ปัดขึ้น / < .50 ปัดลง
function moneyRound(v){
  const n = Number(v || 0);
  const s = n < 0 ? -1 : 1;              // เผื่ออนาคตมีค่าติดลบ
  const a = Math.abs(n);
  const i = Math.floor(a);
  const frac = a - i;
  const EPS = 1e-9;                      // กัน floating error เช่น .499999999
  const up = (frac + EPS) >= 0.5 ? 1 : 0;
  return s * (i + up);
}


function ss(){ return ssFromCtx(); }
function sh(name){ const sss=ss(); let s=sss.getSheetByName(name); if(!s) s=sss.insertSheet(name); return s; }

function readRows(sheet){
  const lr = sheet.getLastRow(), lc = sheet.getLastColumn();
  if (lr <= 1 || lc <= 0) return [];
  return sheet.getRange(2,1,lr-1,lc).getValues();
}

function ensureHeaders(sheet, headers){
  const lastCol = sheet.getLastColumn();
  // ยังไม่มีอะไรเลย → สร้างหัวตารางใหม่ทั้งหมด
  if (lastCol === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    return;
  }
  // ถ้าช่อง A1 ยังว่างอยู่ → เติมหัวตารางใหม่ทั้งหมด
  const firstRow = sheet.getRange(1,1,1,lastCol).getValues()[0];
  if (!firstRow[0]) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    return;
  }
  // มีหัวอยู่แล้ว → ถ้าจำนวนคอลัมน์น้อยกว่าที่ต้องการ ให้ "เติมส่วนที่ขาด" ต่อท้าย
  if (lastCol < headers.length){
    sheet.getRange(1,lastCol+1,1,headers.length-lastCol)
         .setValues([headers.slice(lastCol)]);
  }
}
function toYMDStrict(v){
  if (v == null || v === '') return '';
  try {
    // รับได้ทั้ง Date, 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'
    if (Object.prototype.toString.call(v) === '[object Date]') {
      return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    }
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already YMD
    // DD/MM/YYYY หรือ MM/DD/YYYY → เดาว่า DD/MM/YYYY ก่อน (ไทย)
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m){
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
    }
    // fallback: new Date(..)
    const d2 = new Date(s);
    if (!isNaN(d2.getTime())) return Utilities.formatDate(d2, TZ, 'yyyy-MM-dd');
  } catch(_) {}
  return '';
}

function pad2(n){ return String(n).padStart(2,'0'); }
function toHMStrict(v){
  if (v == null || v === '') return '';
  // ถ้าเป็นสตริง HH:MM อยู่แล้ว
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${pad2(+m[1])}:${pad2(+m[2])}`;

  // ถ้าเป็น Date (เช่นค่าที่อ่านจากชีตที่ฟอร์แมตเป็นเวลา)
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`;
  }

  // ถ้าเป็นตัวเลข (fraction of day)
  if (typeof v === 'number' && isFinite(v)) {
    const totalMin = Math.round(v * 24 * 60);
    const hh = Math.floor(totalMin / 60) % 24;
    const mm = totalMin % 60;
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  // สตริงอื่นๆ: ลอง new Date แล้วดึงชั่วโมง/นาทีแบบ local
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return '';
}

function _nowISO(){ return new Date().toISOString(); }
function _readTable(sheet){
  const lr = sheet.getLastRow(), lc = sheet.getLastColumn();
  if (lc <= 0) return { headers:[], rows:[] };               // ไม่มีคอลัมน์เลย
  const vals = sheet.getRange(1,1,Math.max(1, lr), lc).getValues(); // อย่างน้อยอ่านหัว 1 แถว
  const headers = vals[0].map(h => String(h||'').trim());
  const rows = (lr > 1)
    ? vals.slice(1).map(r => { const o={}; headers.forEach((h,i)=>o[h]=r[i]); return o; })
    : [];
  return { headers, rows };
}



function patchByKeys(sheetName, keys, partial){
  const s = sh(sheetName); const m = headerMap(s);
  const hdrs = Object.keys(m);
  // หาแถวจาก keys
  const rows = readRows(s);
  let row = -1;
  for (let i=0;i<rows.length;i++){
    let ok = true;
    for (const k of (keys||[])) {
      const col = m[k];
      const have = (col ? rows[i][col-1] : '');
      if (String(have ?? '') !== String(partial[k] ?? '')) { ok=false; break; }
    }
    if (ok){ row = i + 2; break; }
  }
  // ไม่พบ → สร้างใหม่ด้วย upsertByKeys ปกติ
  if (row === -1) return upsertByKeys(sheetName, hdrs, keys, partial);

  // พบแถว → อัปเดตเฉพาะคอลัมน์ที่ส่งมา
  const updates = Object.keys(partial||{}).filter(h => m[h]);
  updates.forEach(h => s.getRange(row, m[h], 1, 1).setValue(partial[h] ?? ''));
  return row;
}

function daysInMonthFrom(dateStr){
  // รับ 'YYYY-MM-DD' หรือ Date
  const d = (dateStr && typeof dateStr === 'string') ? new Date(dateStr) : new Date(dateStr || new Date());
  const y = d.getFullYear(); const m = d.getMonth(); // 0-based
  return new Date(y, m+1, 0).getDate(); // 28/29/30/31
}


function headerMap(sheet){
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {};
  const row = sheet.getRange(1,1,1,lastCol).getValues()[0];
  const map = {};
  row.forEach((h,i)=>{ if(h) map[h]=i+1; });
  return map;
}

/* upsert by key columns — header-name aware & width-safe */
/* upsert by key columns — header-name aware & width-safe */
/* upsert by key columns — header-name aware & width-safe */
function upsertByKeys(sheetName, desiredHeaders, keys, data) {
  const s = sh(sheetName);

  // 1) ถ้ายังไม่มีหัวเลย → ปูหัวตาม desiredHeaders
  ensureHeaders(s, desiredHeaders || []);

  // 2) เติมหัวที่ขาด (ถ้าขาด) ต่อท้าย
  let map = headerMap(s);
  const need = (desiredHeaders || []).filter(h => !map[h]);
  if (need.length > 0) {
    const start = s.getLastColumn() + 1;
    s.getRange(1, start, 1, need.length).setValues([need]);
    map = headerMap(s);
  }

  const headersAll = Object.keys(map);

  // ใช้จำนวนคอลัมน์จริงของชีต ป้องกัน error 32 vs 30
  const sheetWidth = s.getLastColumn();
  const width = Math.max(sheetWidth, headersAll.length);
  const lastR = s.getLastRow();

  let row = -1;

  if (lastR > 1 && (keys && keys.length)) {
    const rng = s.getRange(2, 1, lastR - 1, width).getValues();
    for (let r = 0; r < rng.length; r++) {
      let ok = true;
      for (const k of keys) {
        const c = map[k];
        const have = (c ? rng[r][c - 1] : '');
        if (String(have ?? '') !== String(data[k] ?? '')) { ok = false; break; }
      }
      if (ok) { row = r + 2; break; }
    }
  }
  if (row === -1) row = lastR + 1;

  const out = new Array(width).fill('');
  for (const h of headersAll) {
    const colIdx = map[h];
    if (!colIdx) continue;
    const idx = colIdx - 1;
    if (idx >= 0 && idx < width) {
      out[idx] = (data[h] == null ? '' : data[h]);
    }
  }

  s.getRange(row, 1, 1, width).setValues([out]);

  return row;
}




/* ===== Workday & date helpers ===== */
function isWeekend(d){ const w = new Date(d).getDay(); return w === 0 || w === 6; }
function addDays(d, k){ const t = new Date(d); t.setDate(t.getDate() + k); return t; }
function toYMDZ(d){ return Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd'); }

function addWorkdays(d, k){
  let t = new Date(d);
  const step = k >= 0 ? 1 : -1;
  let remain = Math.abs(k);
  while (remain > 0){
    t = addDays(t, step);
    if (!isWeekend(t)) remain--;
  }
  return t;
}
function subWorkdays(d, k){ return addWorkdays(d, -Math.abs(k)); }

/* ===== Period calculators ===== */
// MONTHLY (มีวันจ่ายประจำเดือน):
// - payDayOfMonth: '1'..'31' หรือ 'last'
// - ถ้า workdayOnly=true และวันจ่ายตก ส/อา → ขยับไปวันทำงานถัดไป
// - period = เดือนก่อนหน้าของ "รอบที่จะจ่าย" (เช่น จ่าย 15 พ.ย. → period คือ 1–31 ต.ค.)
// - notify = N วันก่อน payDate (ไม่เลี่ยงวันหยุด เว้นจะปรับเองภายนอก)
function monthlyNextSchedule(todayYMD, notifyN, payDayOfMonth, workdayOnly){
  const t = new Date(todayYMD + 'T00:00:00');

  function mkPayDate(baseDate){
    // baseDate = วันที่ใดก็ได้ในเดือนที่ต้องการคำนวณวันจ่าย
    const y = baseDate.getFullYear();
    const m = baseDate.getMonth(); // 0-based
    const last = new Date(y, m+1, 0).getDate();
    const want = String(payDayOfMonth || '').trim().toLowerCase();
    const day  = (want === 'last') ? last : Math.min(Math.max(parseInt(want||'1',10)||1,1), 31);
    let d = new Date(y, m, Math.min(day, last));   // cap 31 → last
    if (workdayOnly && (d.getDay()===0 || d.getDay()===6)) { // อา/ส
      // ขยับไปวันทำงานถัดไป
      while (d.getDay()===0 || d.getDay()===6) d = addDays(d, 1);
    }
    return d;
  }

  // หา "วันจ่ายถัดไป" ที่ >= วันนี้
  let cand = mkPayDate(t);
  if (cand < t) {
    cand = mkPayDate(new Date(t.getFullYear(), t.getMonth()+1, 1));
  }

  // period คือ "เดือนก่อนหน้า" ของ payDate
  const prevMonthFirst = new Date(cand.getFullYear(), cand.getMonth()-1, 1);
  const prevMonthLast  = new Date(cand.getFullYear(), cand.getMonth(),   0);

  const notifyDate = addDays(cand, -Math.max(0, notifyN|0));

  return {
    periodStart: toYMDZ(prevMonthFirst),
    periodEnd:   toYMDZ(prevMonthLast),
    payDate:     toYMDZ(cand),
    notifyDate:  toYMDZ(notifyDate)
  };
}


// EVERY N DAYS:
// - เดินรอบจาก start ทีละ N วัน
// - payDate = วันสิ้นรอบ (+ ถ้าเลือก workdayOnly และตก ส/อา → ขยับไปวันทำงานถัดไป)
// - notify = X วันก่อน payDate; ถ้า workdayOnly=true ให้ถอยเป็น "วันทำงาน" ล้วน
function everyNDaysNextSchedule(startYMD, n, today, notifyX, workdayOnly){
  const nVal = Number(n||0);
  if (!startYMD || nVal <= 0) return null;

  let s = new Date(startYMD + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');

  // หา "รอบถัดไป" ที่ payDate >= today
  // รอบที่ k: [s + (k-1)*n, s + k*n - 1]
  let k = 1;
  let pay = addDays(s, nVal); // สิ้นรอบแรก
  while (pay < t) {
    k++;
    pay = addDays(s, k*nVal);
  }
  // ปรับ payDate ถ้าต้องเลี่ยงเสาร์/อาทิตย์
  let payDate = new Date(pay);
  if (workdayOnly && isWeekend(payDate)) {
    while (isWeekend(payDate)) payDate = addDays(payDate, 1);
  }

  // notify
  let notify;
  const x = Math.max(0, notifyX|0);
  if (workdayOnly) {
    notify = subWorkdays(payDate, x);
  } else {
    notify = addDays(payDate, -x);
  }

  const periodStart = addDays(s, (k-1)*nVal);
  const periodEnd   = addDays(s,  k   *nVal - 1);

  return {
    periodStart: toYMDZ(periodStart),
    periodEnd:   toYMDZ(periodEnd),
    payDate:     toYMDZ(payDate),
    notifyDate:  toYMDZ(notify)
  };
}



// ===== helpers =====
function toYMD(v){ return Utilities.formatDate(new Date(v), TZ, 'yyyy-MM-dd'); }
function S(v){ return String(v == null ? '' : v).trim(); }
function U(v){ return S(v).toUpperCase(); }

/* simple id generator by sheet */
function nextId(prefix){
  const s = sh('_meta'); ensureHeaders(s, ['key','val']);
  const lastR = s.getLastRow();

  // อย่าเรียก getRange ถ้าไม่มีแถวข้อมูล
  const data = (lastR > 1) ? s.getRange(2,1,lastR-1,2).getValues() : [];

  let idx = data.findIndex(r => r[0] === prefix);
  let val = 0;
  if (idx >= 0) val = Number(data[idx][1] || 0) + 1;
  else { idx = data.length; val = 1; }

  // เขียนค่า (row = idx + 2)
  s.getRange(idx + 2, 1, 1, 2).setValues([[prefix, val]]);
  return `${prefix}-${val}`;
}



/* role check (owner, admin, user) without tenant) */
function canAdmin(lineUserId){
  const s = sh(SH.ROLES);
  ensureHeaders(s, ['lineUserId','role','updatedAt']);
  const m = headerMap(s);
  const rows = readRows(s);

  // 1) roles sheet ก่อน
  let role = '';
  const found = rows.find(r => String(r[m.lineUserId-1]) === String(lineUserId));
  if (found) {
    role = String(found[m.role-1] || '').trim();
  }

  // 2) fallback → ใช้เฉพาะ employees.role (ไม่ใช้ jobTitle แล้ว)
  if (!role) {
    const eS = sh(SH.EMP);
    // ✔ ตอนนี้ขอแค่ lineUserId + role ก็พอ
    ensureHeaders(eS, ['lineUserId','role']);
    const eM = headerMap(eS);
    const eRows = readRows(eS);

    const er = eRows.find(r => String(r[eM.lineUserId-1]) === String(lineUserId));
    const r1 = (er && String(er[eM.role-1] || '').trim()) || '';
    role = r1 || 'user';

    // cache กลับ roles เพื่อให้ครั้งต่อๆ ไปวิ่ง roles อย่างเดียว (เร็วขึ้น)
    upsertByKeys(SH.ROLES, ['lineUserId','role','updatedAt'], ['lineUserId'], {
      lineUserId,
      role,
      updatedAt: now()
    });
  }

  const low = role.toLowerCase();
  // อนุญาต owner/admin ตามเดิม แต่ต้องมาจาก role เท่านั้น
  const adminSyn = new Set(['owner','admin','เจ้าของ','ผู้ดูแล','แอดมิน']);
  return adminSyn.has(low);
}



/** ===== ปูหัวตารางทุกชีตล่วงหน้า ===== */
function initAllHeaders() {
  ensureHeaders(sh(SH.EMP), [
    // profile
    'lineUserId','nationalId','fullName','idAddress','currentAddress','phone','birthDate',
    'gender','jobTitle','bankName','bankAccount',
    // new meta for HR view
    'registerDate',
    // pay settings
    'payType','payRate','dailyHours',
    'breakMinutes','leaveQuotaDays',  
    'prorateLate','payEveryN',
    'payCycleType','payCycleN',  
    'shiftIn','shiftOut','lateGraceMin',
    'payoutChannel','allowances_json','deductions_json',
    // role/meta
    'role','deletedAt','updatedAt','_raw'  
  ]);

  ensureHeaders(sh(SH.ROLES), [
    'lineUserId','role','updatedAt'
  ]);

  // ensureHeaders(sh(SH.WORK), WORK_HEADERS);

  ensureHeaders(sh(SH.LEAVE), [
    'lineUserId','date','hours','reason','note',
    'createdAt','_raw',
    'year',            // 🆕 ปีที่ใช้โควต้า เช่น 2025
    'isQuota',         // 🆕 TRUE = ใบลานี้ยังอยู่ในโควต้า
    'usedAfterHours',  // 🆕 ชั่วโมงลาที่ใช้สะสมหลังใบนี้
    'usedAfterDays'    // 🆕 วันลาที่ใช้สะสมหลังใบนี้ (ชั่วโมง / dailyHours)
  ]);

  ensureHeaders(sh(SH.RUN), [
    'runId','periodStart','periodEnd','createdAt'
  ]);

  ensureHeaders(sh(SH.ITEM), [
    'runId','lineUserId','fullName','jobTitle',
    'workDays','workHours','overHours','basePay','lateDeduct',
    'allowances','deductions','netPay','detail_json',
    'status',
    'createdAt','updatedAt'
  ]);


  ensureHeaders(sh(SH.NOTI), [
    'config_json','updatedAt'
  ]);

  ensureHeaders(sh(SH.PSTAT), [
    'month','lineUserId','status','note','updatedAt','actorLineUserId'
  ]);

  ensureHeaders(sh('_meta'), [
    'key','val'
  ]);

  ensureHeaders(sh(SH.PG), [
    'groupId','name','type','n',
    'startDate',
    'payDayOfMonth',          // ✅ ใหม่ (1..31 หรือ 'last')
    'workdayOnly','notifyBeforeDays',
    'createdAt','updatedAt'
  ]);

  ensureHeaders(sh(SH.PGM), ['groupId','lineUserId','createdAt']);
}

/********** API **********/
function doPost(e){
  try{
    const body = jparse(e.postData ? e.postData.contents : '{}');
    const incomingKey = String(body.sharedKey || body.key || '').trim();
    const scriptKey   = String(PropertiesService.getScriptProperties().getProperty('SHARED_KEY') || '').trim();
    // ยอมรับได้ถ้าตรงกับอย่างใดอย่างหนึ่ง (ค่าในไฟล์/ค่าใน Script Properties)
    const validKeys = [String(SHARED_KEY || '').trim(), scriptKey].filter(Boolean);
    if (!incomingKey || !validKeys.includes(incomingKey)) {
      return reply({ ok:false, error:'bad shared key' });
    }


    return withCtx(body, function(){
      initAllHeaders();
      
      const action = String(body.action || '').trim();
      
      switch (action){

        /********* 1) ตั้งค่า / พนักงาน *********/
        case 'save_employee': {
          const { actor, profile, settings, role } = body;
          if (!actor?.lineUserId) return reply({ ok:false, error:'actor(lineUserId) required' });
          if (!canAdmin(actor.lineUserId)) return reply({ ok:false, error:'forbidden (admin/owner only)' });

          const headers = [
            'lineUserId','nationalId','fullName','idAddress','currentAddress','phone','birthDate',
            'gender','jobTitle','registerDate',
            'bankName','bankAccount',
            'payType','payRate','dailyHours',
            'breakMinutes','leaveQuotaDays',      // 🆕
            'prorateLate','payEveryN',
            'payCycleType','payCycleN', 
            'shiftIn','shiftOut','lateGraceMin',
            'payoutChannel','allowances_json','deductions_json',
            'role','deletedAt','updatedAt','_raw' 
          ];


          const rec = {
            lineUserId: profile?.lineUserId || '',
            nationalId: profile?.nationalId || '',
            fullName:   profile?.fullName || '',
            idAddress:  profile?.idAddress || '',
            currentAddress: profile?.currentAddress || '',
            phone: profile?.phone || '',
            birthDate: toYMDStrict(profile?.birthDate || ''),
            gender: profile?.gender || '',
            jobTitle: profile?.jobTitle || '',
            // NEW
            registerDate: toYMDStrict(profile?.registerDate || ''),

            bankName: profile?.bankName || '',
            bankAccount: profile?.bankAccount || '',

            payType: settings?.payType || 'daily',
            payRate: num(settings?.payRate) ?? '',
            dailyHours: num(settings?.dailyHours) ?? 8,

            breakMinutes:   num(settings?.breakMinutes)   ?? '',  // 🆕 พักเบรก/วัน (นาที)
            leaveQuotaDays: num(settings?.leaveQuotaDays) ?? '',  // 🆕 โควต้าการลา (วัน)

            prorateLate: settings?.prorateLate ? 'TRUE' : 'FALSE',
            payEveryN: num(settings?.payEveryN) ?? '',

            payCycleType: settings?.payCycleType || '',   // 🆕 เพิ่ม
            payCycleN:    num(settings?.payCycleN) ?? '', // 🆕 เพิ่ม

            shiftIn: settings?.shiftIn || '',
            shiftOut: settings?.shiftOut || '',
            lateGraceMin: num(settings?.lateGraceMin) ?? '',

            payoutChannel: settings?.payoutChannel || 'bank',
            allowances_json: jstr(settings?.allowances || []),
            deductions_json: jstr(settings?.deductions || []),

            role: role || 'user',
            updatedAt: now(),
            _raw: jstr({profile, settings})
          };

          upsertByKeys(SH.EMP, headers, ['lineUserId'], rec);

          if (rec.role) {
            upsertByKeys(SH.ROLES, ['lineUserId','role','updatedAt'], ['lineUserId'],
              { lineUserId: rec.lineUserId, role: rec.role, updatedAt: rec.updatedAt });
          }

          return reply({ ok:true });
        }

        /********* 1.2) ตั้งค่าการจ่าย / ระบบอื่น ๆ *********/
        case 'save_pay_settings': {
          const { actor, lineUserId, settings } = body;
          if (!lineUserId) return reply({ ok:false, error:'lineUserId required' });
          if (!canAdmin(actor?.lineUserId)) return reply({ ok:false, error:'forbidden' });

          // ensure columns exist (รวมเวลาเข้างาน/ออกงาน และ grace)
          const s = sh(SH.EMP); ensureHeaders(s, [
            'lineUserId',
            'payType','payRate','dailyHours',
            'breakMinutes','leaveQuotaDays',
            'prorateLate','payEveryN',
            'payCycleType','payCycleN',        // 🆕
            'shiftIn','shiftOut','lateGraceMin',
            'payoutChannel','allowances_json','deductions_json',
            'updatedAt'
          ]);


          upsertByKeys(SH.EMP, Object.keys(headerMap(s)), ['lineUserId'], {
            lineUserId,
            payType: settings?.payType || 'daily',
            payRate: num(settings?.payRate) ?? '',
            dailyHours: num(settings?.dailyHours) ?? 8,

            breakMinutes:   num(settings?.breakMinutes)   ?? '',  // 🆕
            leaveQuotaDays: num(settings?.leaveQuotaDays) ?? '',  // 🆕

            prorateLate: settings?.prorateLate ? 'TRUE' : 'FALSE',
            payEveryN: num(settings?.payEveryN) ?? '',

            payCycleType: settings?.payCycleType || '',     // 🆕
            payCycleN:    num(settings?.payCycleN) ?? '',   // 🆕

            shiftIn: settings?.shiftIn || '',
            shiftOut: settings?.shiftOut || '',
            lateGraceMin: num(settings?.lateGraceMin) ?? '',
            payoutChannel: settings?.payoutChannel || 'bank',
            allowances_json: jstr(settings?.allowances || []),
            deductions_json: jstr(settings?.deductions || []),
            updatedAt: now()
          });

          return reply({ ok:true });
        }

        /********* 1.4) ตั้งค่าแจ้งเตือนไฟล์นี้ *********/
        case 'save_notifications': {
          const { actor, config } = body;
          if (!canAdmin(actor?.lineUserId)) return reply({ ok:false, error:'forbidden' });
          upsertByKeys(SH.NOTI, ['config_json','updatedAt'], [], { // มีแถวเดียว
            config_json: jstr(config || {}), updatedAt: now()
          });
          return reply({ ok:true });
        }

        /********* 2) ลงเวลาเข้า/ออก *********/
        
        case 'clock_in': {
          const { lineUserId, lat, lng, note, address: addrFromBody } = body;
          if (!lineUserId) return reply({ ok:false, error:'lineUserId required' });

          const today = toYMD(new Date());                     // 'YYYY-MM-DD'
          const sheetName = workSheetNameFromDateYMD(today);   // ex. work_logs_2025-11
          const s = sh(sheetName);
          ensureHeaders(s, WORK_HEADERS);
          const m = headerMap(s);
          const rows = readRows(s);

          // หา IN ของวันนี้แบบ normalize
          let rowIdx = -1, oldId = '';
          for (let i=0;i<rows.length;i++){
            const r = rows[i];
            const sameUser = S(r[m.lineUserId-1]) === S(lineUserId);
            const isIn     = U(r[m.io-1]) === 'IN';
            const sameDay  = toYMD(r[m.date-1] || today) === today;
            if (sameUser && isIn && sameDay) { rowIdx=i; oldId=S(r[m.logId-1]||''); break; }
          }

          // address
          let address = S(addrFromBody);
          if (!address && (lat!=null && lng!=null)) {
            try {
              const gg = Maps.newGeocoder().reverseGeocode(Number(lat), Number(lng));
              address = (gg && gg.results && gg.results[0] && gg.results[0].formatted_address) || '';
            } catch(e) {}
          }

          const rec = {
            lineUserId: S(lineUserId), io:'IN',
            logId: oldId || nextId('IN'),
            time: now(), date: today,
            lat: num(lat) ?? '', lng: num(lng) ?? '',
            address: address || '',
            note: note || '',
            linkedOutId:'', _raw:''
          };

          const headers = WORK_HEADERS;

          // มี IN อยู่แล้ว → เขียนทับแถวเดิม (ไม่สร้างแถวใหม่)
          if (rowIdx >= 0) {
            s.getRange(rowIdx+2, 1, 1, headers.length)
              .setValues([headers.map(h => (rec[h] == null ? '' : rec[h]))]);
            return reply({ ok:true, logId: rec.logId, updated:true });
          }

          // ยังไม่มี → เพิ่ม
          upsertByKeys(sheetName, headers, ['logId'], rec);
          return reply({ ok:true, logId: rec.logId, created:true });
        }

        // ===== clock_out (แทนทั้งเคส) =====
        case 'clock_out': {
          const { lineUserId, lat, lng, note, address: addrFromBody } = body;
          if (!lineUserId) return reply({ ok:false, error:'lineUserId required' });

          const today = toYMD(new Date());
          const sheetName = workSheetNameFromDateYMD(today);
          const s = sh(sheetName);
          ensureHeaders(s, WORK_HEADERS);
          const m = headerMap(s);
          const rows = readRows(s);

          // กันกด OUT ซ้ำ (normalize ทุกค่า)
          for (const r of rows) {
            const sameUser = S(r[m.lineUserId-1]) === S(lineUserId);
            const isOut    = U(r[m.io-1]) === 'OUT';
            const sameDay  = toYMD(r[m.date-1] || today) === today;
            if (sameUser && isOut && sameDay) {
              return reply({ ok:false, error:'already_clocked_out_today' });
            }
          }

          // หา IN ของวันนี้เพื่อ link
          let inRow = -1, inId = '';
          for (let i=rows.length-1;i>=0;i--){
            const r = rows[i];
            const sameUser = S(r[m.lineUserId-1]) === S(lineUserId);
            const isIn     = U(r[m.io-1]) === 'IN';
            const sameDay  = toYMD(r[m.date-1] || today) === today;
            if (sameUser && isIn && sameDay) { inRow=i; inId=S(r[m.logId-1]||''); break; }
          }

          // address
          let address = S(addrFromBody);
          if (!address && (lat!=null && lng!=null)) {
            try {
              const gg = Maps.newGeocoder().reverseGeocode(Number(lat), Number(lng));
              address = (gg && gg.results && gg.results[0] && gg.results[0].formatted_address) || '';
            } catch(e) {}
          }

          const outId = nextId('OUT');
          const headers = WORK_HEADERS;

          upsertByKeys(sheetName, headers, ['logId'], {
            lineUserId: S(lineUserId), io:'OUT', logId: outId,
            time: now(), date: today,
            lat: num(lat) ?? '', lng: num(lng) ?? '',
            address: address || '',
            note: note || '',
            linkedOutId:'', _raw:''
          });

          if (inRow >= 0 && m.linkedOutId) s.getRange(inRow+2, m.linkedOutId, 1, 1).setValue(outId);

          return reply({ ok:true, logId: outId, linkedIn: inId || null });
        }


        /********* 3) ลางาน + คำนวณโควต้า *********/
        case 'leave_request': {
          const { lineUserId, date, hours, reason, note } = body;
          if (!lineUserId) return reply({ ok:false, error:'lineUserId required' });

          // 1) normalize วันที่ + ปี
          const dateYMD = ymd(date || new Date());   // 'YYYY-MM-DD'
          const yearStr = dateYMD.slice(0, 4);       // 'YYYY'

          // 2) โหลดค่า "ชั่วโมงมาตรฐานต่อวัน" + quota วันลา จาก employees
          let dailyHours = 8;   // จะถูกแทนด้วยชั่วโมงจริงจาก shift + break
          let quotaDays  = 0;
          try {
            const eS = sh(SH.EMP);
            ensureHeaders(eS, ['lineUserId','dailyHours','leaveQuotaDays','shiftIn','shiftOut','breakMinutes']);
            const eM = headerMap(eS);
            const eRows = readRows(eS);
            const er = eRows.find(r => String(r[eM.lineUserId-1] || '') === String(lineUserId));
            if (er) {
              // quotaDays ยังเก็บเป็น "วัน"
              if (eM.leaveQuotaDays) {
                quotaDays = Number(er[eM.leaveQuotaDays-1] || 0) || 0;
              }

              // คำนวณชั่วโมงมาตรฐานต่อวันจาก shiftIn / shiftOut - break
              let stdDaily = 0;

              if (eM.shiftIn && eM.shiftOut) {
                const inStr  = toHMStrict(er[eM.shiftIn-1]  || '');
                const outStr = toHMStrict(er[eM.shiftOut-1] || '');

                const mIn  = inStr  && inStr.match(/^(\d{1,2}):(\d{2})$/);
                const mOut = outStr && outStr.match(/^(\d{1,2}):(\d{2})$/);

                let breakMin = 0;
                if (eM.breakMinutes) {
                  const bm = Number(er[eM.breakMinutes-1] || 0);
                  if (!isNaN(bm) && bm > 0) breakMin = bm;
                }

                if (mIn && mOut) {
                  const inMin  = (+mIn[1])  * 60 + (+mIn[2]);
                  const outMin = (+mOut[1]) * 60 + (+mOut[2]);
                  const diffMin = Math.max(0, outMin - inMin);
                  stdDaily = Math.max(0, diffMin/60 - (breakMin > 0 ? breakMin/60 : 0));
                }
              }

              // fallback: ถ้าไม่ตั้ง shift → ใช้ dailyHours เดิม หรือ 8 ชั่วโมง
              if (!stdDaily && eM.dailyHours) {
                const dh = Number(er[eM.dailyHours-1] || 0);
                if (dh > 0) stdDaily = dh;
              }
              if (!stdDaily) stdDaily = 8;

              dailyHours = stdDaily;
            }
          } catch (_) {}

          const quotaHours = (quotaDays > 0 && dailyHours > 0)
            ? quotaDays * dailyHours
            : 0;

          // 3) เตรียมชีต leave_logs + คอลัมน์ quota
          const s = sh(SH.LEAVE);
          ensureHeaders(s, [
            'lineUserId','date','hours','reason','note',
            'createdAt','_raw',
            'year','isQuota','usedAfterHours','usedAfterDays'
          ]);

          // 4) บันทึกใบลานี้ (upsert ตามเดิม: lineUserId + date + reason)
          const rec = {
            lineUserId,
            date: dateYMD,
            hours: num(hours) ?? '',
            reason: reason || '',
            note: note || '',
            createdAt: now(),
            _raw: '',
            year: yearStr
          };

          upsertByKeys(
            SH.LEAVE,
            ['lineUserId','date','hours','reason','note','createdAt','_raw','year','isQuota','usedAfterHours','usedAfterDays'],
            ['lineUserId','date','reason'],
            rec
          );

          // 5) รีคำนวณ quota ใหม่ทั้งปีนี้ของคนนี้
          const m = headerMap(s);
          const rows = readRows(s);

          // เลือกเฉพาะแถวของ lineUserId + ปีตรงกัน
          const targetRows = rows
            .map((r, idx) => ({ r, rowIndex: idx + 2 }))  // +2 เพราะ header อยู่แถวที่ 1
            .filter(x => {
              const uid = String(x.r[m.lineUserId-1] || '').trim();
              if (uid !== String(lineUserId)) return false;

              // ปีจากคอลัมน์ year ถ้ามี ถ้าไม่มี fallback จาก date
              let yr = '';
              if (m.year) {
                yr = String(x.r[m.year-1] || '').slice(0, 4);
              }
              if (!yr && m.date) {
                yr = String(ymd(x.r[m.date-1] || '')).slice(0, 4);
              }
              return yr === yearStr;
            });

          // เรียงตามวันที่ + createdAt (กันเคสมีหลายใบวันเดียวกัน)
          targetRows.sort((a, b) => {
            const d1 = ymd(a.r[m.date-1] || '');
            const d2 = ymd(b.r[m.date-1] || '');
            if (d1 === d2) {
              const c1 = String(a.r[m.createdAt-1] || '');
              const c2 = String(b.r[m.createdAt-1] || '');
              return c1 < c2 ? -1 : c1 > c2 ? 1 : 0;
            }
            return d1 < d2 ? -1 : 1;
          });

          let usedHours = 0;
          targetRows.forEach(x => {
            const h = Number(x.r[m.hours-1] || 0);
            usedHours += h;

            const usedAfterHours = usedHours;
            const usedAfterDays  = (dailyHours > 0) ? (usedAfterHours / dailyHours) : 0;

            // ถ้ามี quotaHours > 0 → เช็คว่าใช้ไปจนถึงใบนี้แล้วยังไม่เกินโควต้าไหม
            const isQuota = quotaHours > 0
              ? (usedAfterHours <= quotaHours)
              : false;

            if (m.isQuota) {
              s.getRange(x.rowIndex, m.isQuota, 1, 1)
               .setValue(isQuota ? 'TRUE' : 'FALSE');
            }
            if (m.usedAfterHours) {
              s.getRange(x.rowIndex, m.usedAfterHours, 1, 1)
               .setValue(usedAfterHours);
            }
            if (m.usedAfterDays) {
              s.getRange(x.rowIndex, m.usedAfterDays, 1, 1)
               .setValue(usedAfterDays);
            }
            if (m.year) {
              s.getRange(x.rowIndex, m.year, 1, 1)
               .setValue(yearStr);
            }
          });

          return reply({ ok:true, year: yearStr });
        }

        /********* 4) รันเงินเดือน (period) *********/
        
        case 'run_payroll': {
          // ✅ เพิ่ม onlyLineUserIds, groupId
          const { actor, periodStart, periodEnd, onlyLineUserIds = [], groupId } = body;
          if (!canAdmin(actor?.lineUserId)) return reply({ ok:false, error:'forbidden' });

          const runId = nextId('PAY');
          upsertByKeys(SH.RUN, ['runId','periodStart','periodEnd','createdAt'], ['runId'], {
            runId, periodStart: ymd(periodStart), periodEnd: ymd(periodEnd), createdAt: now()
          });

          // ===== เตรียม "พนักงานเป้าหมาย" =====
          const eS = sh(SH.EMP); const eM = headerMap(eS); ensureHeaders(eS, ['lineUserId']);
          const allEmpRows = readRows(eS);

          // 1) เริ่มจากรายการที่เลือกมาโดยตรง
          let targetIds = new Set((onlyLineUserIds || []).map(x => String(x||'').trim()).filter(Boolean));

          // 2) ถ้ายังไม่มี และส่ง groupId มา → โหลดสมาชิกกลุ่มจากชีต PGM
          if (!targetIds.size && groupId) {
            const sm = sh(SH.PGM); ensureHeaders(sm, ['groupId','lineUserId','createdAt']);
            const mm = headerMap(sm);
            const rows = readRows(sm).filter(r => String(r[mm.groupId-1]||'') === String(groupId));
            rows.forEach(r => {
              const id = String(r[mm.lineUserId-1] || '').trim();
              if (id) targetIds.add(id);
            });
          }

          // 3) ถ้าไม่ระบุอะไรเลย → ใช้พนักงานทั้งหมด (พฤติกรรมเดิม)
          const employees = allEmpRows.filter(r => {
            const id = String(r[eM.lineUserId-1] || '').trim();
            if (!id) return false;
            // 🆕 ถ้ามี deletedAt ให้ข้าม
            if (eM.deletedAt && r[eM.deletedAt - 1]) return false;

            if (targetIds.size) return targetIds.has(id);
            const role = (eM.role ? String(r[eM.role-1]||'').toLowerCase().trim() : '');
            return role !== 'owner'; // default: ตัด owner ออก เว้นแต่ระบุมาใน onlyLineUserIds/group
          });

          if (!employees.length) {
            return reply({ ok:true, runId, note:'no_employees_after_filter' });
          }

          // ===== ดึง WORK / LEAVE เฉพาะช่วง (รองรับหลายชีต) =====
          const startY = ymd(periodStart);
          const endY   = ymd(periodEnd);

          const workSheets = getWorkSheetsForRange(startY, endY);
          let wM = null;
          const wRowsAll = [];

          workSheets.forEach(ws => {
            const m = headerMap(ws);
            if (!wM) wM = m;              // ใช้ headerMap ของชีตแรกเป็นมาตรฐาน
            const rows = readRows(ws);
            rows.forEach(r => {
              const src = r[m.date-1] || r[m.time-1];
              if (!src) return;
              const d = ymd(src);
              if (d >= startY && d <= endY) wRowsAll.push(r);
            });
          });

          // ถ้าไม่มีสักชีตเลย → ใช้ headerMap จาก template work_logs
          if (!wM) {
            const wT = sh(SH.WORK);
            ensureHeaders(wT, WORK_HEADERS);
            wM = headerMap(wT);
          }

          // LEAVE ยังอ่านจากชีตเดียวเหมือนเดิม
          const lS = sh(SH.LEAVE); const lM = headerMap(lS);
          const lRowsAll = readRows(lS).filter(r => {
            const src = r[lM.date-1];
            if (!src) return false;
            const d = ymd(src);
            return d >= ymd(periodStart) && d <= ymd(periodEnd);
          });

          const itemsHeaders = [
            'runId','lineUserId','fullName','jobTitle',
            'workDays','workHours','overHours','basePay','lateDeduct',
            'allowances','deductions','netPay','detail_json',
            'status','createdAt','updatedAt'
          ];

          // helper: parse HH:MM -> {h,m} | null
          function parseHM(s) {
            if (!s) return null;
            const m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
            if (!m) return null;
            const h = +m[1], mm = +m[2];
            if (h<0 || h>23 || mm<0 || mm>59) return null;
            return { h, m: mm };
          }

          for (const r of employees) {
            const lineUserId = r[eM.lineUserId-1];
            if (!lineUserId) continue;

            const fullName     = r[eM.fullName-1]   || '';
            const jobTitle     = eM.jobTitle ? (r[eM.jobTitle-1] || '') : '';
            const payType      = r[eM.payType-1]    || 'daily';
            const payRate      = Number(r[eM.payRate-1] || 0);
            const dailyHours   = Number(r[eM.dailyHours-1] || 8); // ใช้เป็น fallback เฉย ๆ
            const prorateRaw   = r[eM.prorateLate-1];
            const prorateLate  = String(prorateRaw == null ? 'FALSE' : prorateRaw)
                                  .trim()
                                  .toUpperCase() === 'TRUE';
            const payEveryN    = Number(r[eM.payEveryN-1] || 0);

            const shiftInStr   = (eM.shiftIn  && r[eM.shiftIn-1]  && toHMStrict(r[eM.shiftIn-1]))  || '';
            const shiftOutStr  = (eM.shiftOut && r[eM.shiftOut-1] && toHMStrict(r[eM.shiftOut-1])) || '';

            const graceMin     = Number(r[eM.lateGraceMin-1] || 0);
            const allowances   = jparse(r[eM.allowances_json-1]||'[]').filter(a => a && a.amount);
            const deductions   = jparse(r[eM.deductions_json-1]||'[]').filter(d => d && d.amount);
            const breakMinutes   = eM.breakMinutes   ? Number(r[eM.breakMinutes-1]   || 0) : 0;
            const leaveQuotaDays = eM.leaveQuotaDays ? Number(r[eM.leaveQuotaDays-1] || 0) : 0;

            // ===== สร้างแผนที่ IN/OUT ต่อวัน =====
            const wRows = wRowsAll.filter(x => String(x[wM.lineUserId-1])===lineUserId);
            const byDay = {};
            wRows.forEach(row => {
              const dateStr = ymd(row[wM.date-1] || row[wM.time-1]);
              const io = String(row[wM.io-1] || '').toUpperCase();
              if (!byDay[dateStr]) byDay[dateStr] = { ins: [], outs: [], addrIn: '', addrOut: '' };
              if (io === 'IN')  { byDay[dateStr].ins.push(row);  byDay[dateStr].addrIn  = row[wM.address-1] || byDay[dateStr].addrIn; }
              if (io === 'OUT') { byDay[dateStr].outs.push(row); byDay[dateStr].addrOut = row[wM.address-1] || byDay[dateStr].addrOut; }
            });

            // ===== คำนวณชั่วโมงทำงาน / lateHours / overHours =====
            let workHours = 0, workDays = 0, totalLateMin = 0, overHours = 0;

            const shiftInHM  = parseHM(shiftInStr);
            const shiftOutHM = parseHM(shiftOutStr);

            // ชั่วโมงมาตรฐานต่อวัน = shiftOut - shiftIn - break
            let standardDailyHours = 0;
            if (shiftInHM && shiftOutHM) {
              const inMin  = shiftInHM.h  * 60 + shiftInHM.m;
              const outMin = shiftOutHM.h * 60 + shiftOutHM.m;
              const diffMin = Math.max(0, outMin - inMin);
              const breakH  = breakMinutes > 0 ? (breakMinutes / 60) : 0;
              standardDailyHours = Math.max(0, diffMin/60 - breakH);
            }
            // fallback: ถ้าไม่ได้ตั้ง shiftIn/shiftOut → ใช้ dailyHours หรือ 8
            if (!standardDailyHours) {
              standardDailyHours = dailyHours > 0 ? dailyHours : 8;
            }

            Object.keys(byDay).forEach(d => {
              const o = byDay[d];
              const ins  = o.ins.sort((a,b)=> new Date(a[wM.time-1]) - new Date(b[wM.time-1]));
              const outs = o.outs.sort((a,b)=> new Date(a[wM.time-1]) - new Date(b[wM.time-1]));
              const inRow  = ins[0];
              const outRow = outs[outs.length-1];

              if (inRow && outRow) {
                const tIn  = new Date(inRow[wM.time-1]);
                const tOut = new Date(outRow[wM.time-1]);

                const rawHours = Math.max(0, (tOut - tIn)/3600000);

                const breakH = breakMinutes > 0 ? (breakMinutes / 60) : 0;
                const hours  = Math.max(0, rawHours - breakH);   // ชั่วโมงทำงานจริง (หักพักแล้ว)

                workHours += hours;
                workDays  += 1;

                // ชั่วโมงเกินต่อวัน (ไม่บังคับให้ทุกวันต้องแป๊ะเท่ากัน แต่เกินจากมาตรฐานของ shift)
                const diffH = hours - standardDailyHours;
                if (diffH > 0) overHours += diffH;

                // lateMinutes = max(0, (in - scheduledIn) - grace)
                if (shiftInHM) {
                  const sch = new Date(tIn);
                  sch.setHours(shiftInHM.h, shiftInHM.m, 0, 0);
                  const diffMin = Math.round((tIn - sch)/60000);
                  totalLateMin += Math.max(0, diffMin - graceMin);
                }
              }
            });

            const lateHours = totalLateMin / 60;

            // leaveHours สำหรับรายละเอียด
            const leaveHours = lRowsAll
              .filter(x => String(x[lM.lineUserId-1])===lineUserId)
              .reduce((a,b) => a + Number(b[lM.hours-1] || 0), 0);

            // ===== ฐานจ่าย / หักสาย =====
            const monthRefDate = periodStart ? toYMDStrict(periodStart) : toYMDStrict(new Date());
            const dim = daysInMonthFrom(monthRefDate || new Date());

            let basePay = 0;
            if (payType === 'hourly') {
              basePay = workHours * payRate;
            } else if (payType === 'daily') {
              basePay = workDays * payRate;
            } else if (payType === 'monthly') {
              basePay = payRate;
            } else if (payType === 'every_n_days' && payEveryN > 0) {
              basePay = (workDays / payEveryN) * payRate;
            } else if (payType === 'every_n_hours' && payEveryN > 0) {
              basePay = (workHours / payEveryN) * payRate;
            }

            let lateDeduct = 0;
            // ❗ ใช้ standardDailyHours แทน dailyHours โดยตรง
            if (prorateLate && standardDailyHours > 0 && payType !== 'hourly') {
              const perHour =
                (payType === 'daily')   ? (payRate / standardDailyHours)
              : (payType === 'monthly') ? ((payRate / dim) / standardDailyHours)
              :                            (payRate / standardDailyHours);
              lateDeduct = perHour * lateHours;
            }

            const allowSum = allowances.filter(a=>a.recurring==='recurring').reduce((s,a)=>s+Number(a.amount||0),0);
            const deductSum = deductions.filter(d=>d.recurring==='recurring').reduce((s,d)=>s+Number(d.amount||0),0);

            // 🔧 ปัดเศษเงินทุกตัว
            const basePayR    = moneyRound(basePay);
            const lateDeductR = moneyRound(lateDeduct);
            const allowSumR   = moneyRound(allowSum);
            const deductSumR  = moneyRound(deductSum);

            // netPay หลังปัดเศษ (และไม่ติดลบ)
            const net = Math.max(0, basePayR - lateDeductR + allowSumR - deductSumR);
            const netR = moneyRound(net);

            // ...แล้วตอน upsert ให้ใช้ค่าที่ปัดแล้ว
            upsertByKeys(SH.ITEM, itemsHeaders, ['runId','lineUserId'], {
              runId, lineUserId, fullName,
              jobTitle,
              workDays, workHours, overHours,
              basePay:    basePayR,       // 🔧 ใช้ค่าปัดแล้ว
              lateDeduct: lateDeductR,    // 🔧 ใช้ค่าปัดแล้ว
              allowances: allowSumR,      // 🔧 ใช้ค่าปัดแล้ว
              deductions: deductSumR,     // 🔧 ใช้ค่าปัดแล้ว
              netPay:     netR,           // 🔧 ใช้ค่าปัดแล้ว
              detail_json: jstr({
                payType, payRate,
                dailyHours,
                standardDailyHours,
                overHours,
                lateHours, leaveHours, graceMin,
                shiftIn: shiftInStr,
                shiftOut: shiftOutStr,
                allowances, deductions,
                breakMinutes,
                leaveQuotaDays
              }),
              status: 'approved',
              createdAt: now(),
              updatedAt: now()
            });
          }
          return reply({ ok:true, runId });
        }



        /********* 5) ตั้งค่าบทบาท *********/
        case 'set_role': {
          const { actor, target, role } = body; // set role (owner/admin/user/ตำแหน่งอื่น ๆ)
          if (!target?.lineUserId) return reply({ ok:false, error:'target(lineUserId) required' });

          // อนุญาต: 1) owner/admin จริง  หรือ  2) คำสั่งระบบ (isSystem:true) — ครอบคลุมทุกบทบาท
          const actorOk = canAdmin(actor?.lineUserId) || (actor?.isSystem === true);
          if (!actorOk) return reply({ ok:false, error:'forbidden' });

          // ปรับรูปแบบเก็บบทบาท:
          // - ถ้าเป็น owner/admin/user ให้บันทึกเป็นตัวพิมพ์เล็กเพื่อให้ canAdmin() ทำงานแน่นอน
          // - ถ้าเป็นตำแหน่งอื่น (เช่น "พนักงานรักษาความปลอดภัย") เก็บข้อความตามจริง
          const raw = String(role || '').trim();
          const low = raw.toLowerCase();
          const normalized = (low === 'owner' || low === 'admin' || low === 'user') ? low : raw;

          upsertByKeys(SH.ROLES, ['lineUserId','role','updatedAt'], ['lineUserId'], {
            lineUserId: target.lineUserId,
            role: normalized,
            updatedAt: now()
          });

          // 🆕 sync role ไปที่ชีต employees ด้วย
          patchByKeys(SH.EMP, ['lineUserId'], {
            lineUserId: target.lineUserId,
            role: normalized,
            updatedAt: now()
          });

          return reply({ ok:true, role: normalized });
        }


        case 'get_role': {
          const { lineUserId } = body;
          if (!lineUserId) return reply({ ok:false, error:'lineUserId required' });

          const s = sh(SH.ROLES); ensureHeaders(s, ['lineUserId','role','updatedAt']);
          const m = headerMap(s);
          const rows = readRows(s);
          let role = '';
          const row = rows.find(r => String(r[m.lineUserId-1])===lineUserId);
          if (row) role = String(row[m.role-1] || '').toLowerCase();

          if (!role) {
            const eS = sh(SH.EMP); ensureHeaders(eS, ['lineUserId','role']);
            const eM = headerMap(eS);
            const eRows = readRows(eS);
            const er = eRows.find(r => String(r[eM.lineUserId-1])===lineUserId);
            role = (er && String(er[eM.role-1] || '').toLowerCase()) || 'user';
            upsertByKeys(SH.ROLES, ['lineUserId','role','updatedAt'], ['lineUserId'],
              { lineUserId, role, updatedAt: now() });
          }
          return reply({ ok:true, role });
        }

        case 'get_profile': {
          const { lineUserId } = body;
          if (!lineUserId) return reply({ ok:false, error:'lineUserId required' });

          const s = sh(SH.EMP); ensureHeaders(s, ['lineUserId']);
          const map = headerMap(s);
          const rows = readRows(s);
          const row  = rows.find(r => String(r[map.lineUserId-1]) === String(lineUserId));
          if (!row) return reply({ ok:true, data: null });

          const pick = h => (map[h] ? row[map[h]-1] : '');

          const data = {
            lineUserId,
            // profile
            nationalId:     pick('nationalId'),
            fullName:       pick('fullName'),
            idAddress:      pick('idAddress'),
            currentAddress: pick('currentAddress'),
            phone:          pick('phone'),
            birthDate:      toYMDStrict(pick('birthDate')),
            gender:         pick('gender'),
            jobTitle:       pick('jobTitle'),
            registerDate:   toYMDStrict(pick('registerDate')),
            // bank
            bankName:       pick('bankName'),
            bankAccount:    pick('bankAccount'),
            // pay/settings
            payType:        pick('payType') || 'daily',
            payRate:        pick('payRate'),
            dailyHours:     pick('dailyHours'),

            breakMinutes:   pick('breakMinutes'),    // 🆕
            leaveQuotaDays: pick('leaveQuotaDays'),  // 🆕

            prorateLate:    pick('prorateLate'),
            payEveryN:      pick('payEveryN'),

            payCycleType:   pick('payCycleType'),   // 🆕
            payCycleN:      pick('payCycleN'), 

            payoutChannel:  pick('payoutChannel') || 'bank',
            shiftIn:        toHMStrict(pick('shiftIn')),
            shiftOut:       toHMStrict(pick('shiftOut')),
            lateGraceMin:   pick('lateGraceMin'),
            role:           pick('role') || 'user'
          };

          return reply({ ok:true, data });
        }


        case 'upsert_profile': {
          const { actor, lineUserId, profile } = body;
          if (!lineUserId || !profile) return reply({ ok:false, error:'lineUserId & profile required' });

          const isSelf = actor?.lineUserId && (String(actor.lineUserId) === String(lineUserId));
          const canWrite = isSelf || canAdmin(actor?.lineUserId);
          if (!canWrite) return reply({ ok:false, error:'forbidden' });

          // เตรียมเฉพาะฟิลด์โปรไฟล์ + normalize วันที่
          const partial = {
            lineUserId:       String(lineUserId),
            nationalId:       profile.nationalId || '',
            fullName:         profile.fullName || '',
            idAddress:        profile.idAddress || '',
            currentAddress:   profile.currentAddress || '',
            phone:            profile.phone || '',
            birthDate:        toYMDStrict(profile.birthDate || ''),
            gender:           profile.gender || '',
            jobTitle:         profile.jobTitle || '',
            registerDate:     toYMDStrict(profile.registerDate || ''),
            bankName:         profile.bankName || '',
            bankAccount:      profile.bankAccount || '',
            updatedAt:        now(),
          };

          // ✅ อัปเดตแบบ patch (คอลัมน์อื่นคงไว้)
          patchByKeys(SH.EMP, ['lineUserId'], partial);
          return reply({ ok:true, data: partial });
        }



        /********* X) รายชื่อ owner/admin ทั้งไฟล์ (สำหรับแจ้งเตือน) *********/
        case 'list_admins': {
          const ids = [];

          // 1) roles sheet
          const s = sh(SH.ROLES); ensureHeaders(s, ['lineUserId','role','updatedAt']);
          const m = headerMap(s);
          const rows = readRows(s);
          rows.forEach(r => {
            const id   = String(r[m.lineUserId-1] || '').trim();
            const role = String(r[m.role-1] || '').toLowerCase();
            if (id && (role === 'owner' || role === 'admin')) ids.push(id);
          });

          // 2) fallback: employees.role (เผื่อยังไม่มี roles)
          if (ids.length === 0) {
            const eS = sh(SH.EMP); ensureHeaders(eS, ['lineUserId','role']);
            const eM = headerMap(eS);
            readRows(eS).forEach(r => {
              const id   = String(r[eM.lineUserId-1] || '').trim();
              const role = String(r[eM.role-1] || '').toLowerCase();
              if (id && (role === 'owner' || role === 'admin')) ids.push(id);
            });
          }

          // unique
          const uniq = Array.from(new Set(ids)).filter(Boolean);
          return reply({ ok:true, ids: uniq });
        }
        /********* X) แปลงพิกัด -> ที่อยู่ (Reverse Geocode) *********/
        case 'reverse_geocode': {
          const { lat, lng } = body || {};
          if (typeof lat !== 'number' || typeof lng !== 'number') {
            return reply({ ok:false, error:'missing lat/lng' });
          }
          try {
            // ต้องเปิดบริการ Maps ใน Apps Script (บริการในตัว: Maps)
            const r = Maps.newGeocoder().reverseGeocode(lat, lng); // JSON
            const addr = (r && r.results && r.results[0] && r.results[0].formatted_address) || '';
            return reply({ ok:true, address: addr });
          } catch (e) {
            return reply({ ok:false, error: String(e) });
          }
        }

        case 'list_employees': {
          const { actor, excludeOwner = true } = body || {};
          if (!canAdmin(actor?.lineUserId)) return reply({ ok:false, error:'forbidden' });

          const s = sh(SH.EMP);
          const m = headerMap(s);
          const rows = readRows(s);

          const headers = Object.keys(m);
          const data = rows.map(r => {
            const o = {};
            headers.forEach(h => { o[h] = r[m[h]-1] ?? ''; });

            // ✅ normalize วันที่และเวลา
            if ('birthDate'    in o) o.birthDate    = toYMDStrict(o.birthDate);
            if ('registerDate' in o) o.registerDate = toYMDStrict(o.registerDate);
            if ('shiftIn'      in o) o.shiftIn      = toHMStrict(o.shiftIn);
            if ('shiftOut'     in o) o.shiftOut     = toHMStrict(o.shiftOut);

            return o;
          }).filter(o => {
            // 🆕 ถ้ามี deletedAt แล้วไม่ว่าง = ซ่อน
            if (o.deletedAt) return false;

            if (!excludeOwner) return true;
            return String(o.role || '').toLowerCase() !== 'owner';
          });


          return reply({ ok:true, data });
        }

        case 'list_users': {
          // ทำตัวเป็น alias ของ list_employees (ค่าเริ่มต้น exclude owner)
          const { actor, excludeOwner = true } = body || {};
          if (!canAdmin(actor?.lineUserId)) return reply({ ok:false, error:'forbidden' });

          const s = sh(SH.EMP);
          const m = headerMap(s);
          const rows = readRows(s);

          const headers = Object.keys(m);
          const data = rows.map(r => {
            const o = {};
            headers.forEach(h => { o[h] = r[m[h]-1] ?? ''; });
            if ('birthDate'    in o) o.birthDate    = toYMDStrict(o.birthDate);
            if ('registerDate' in o) o.registerDate = toYMDStrict(o.registerDate);
            if ('shiftIn'      in o) o.shiftIn      = toHMStrict(o.shiftIn);
            if ('shiftOut'     in o) o.shiftOut     = toHMStrict(o.shiftOut);
            return o;
          }).filter(o => {
            // 🆕 ถ้ามี deletedAt แล้วไม่ว่าง = ซ่อน
            if (o.deletedAt) return false;

            if (!excludeOwner) return true;
            return String(o.role || '').toLowerCase() !== 'owner';
          });

          return reply({ ok:true, data });
        }

        case 'list_work_logs': {
          const { lineUserId, month, periodStart, periodEnd } = body || {};
          if (!lineUserId) return reply({ ok:false, error:'lineUserId required' });

          // ===== คำนวณช่วงเวลา =====
          let start, end;
          if (month) {
            // month = "YYYY-MM"
            start = new Date(month + '-01T00:00:00');
            end   = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
          } else if (periodStart && periodEnd) {
            start = new Date(periodStart + 'T00:00:00');
            end   = new Date(periodEnd   + 'T23:59:59');
          } else {
            // ถ้าไม่ส่ง อนุโลมให้เป็นเดือนปัจจุบัน
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
            end   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
          }
          const ymdStr = d => Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd');
          const iso    = d => Utilities.formatDate(new Date(d), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");

          // ===== โหลด config ของพนักงาน (shift + break) เพื่อคำนวณชั่วโมงทำงาน =====
          let breakMinutes = 0;
          let dailyHours   = 8;   // มาตรฐานต่อวันหลังหักพัก
          try {
            const eS = sh(SH.EMP);
            ensureHeaders(eS, ['lineUserId','dailyHours','shiftIn','shiftOut','breakMinutes']);
            const eM = headerMap(eS);
            const eRows = readRows(eS);
            const er = eRows.find(r => String(r[eM.lineUserId-1] || '') === String(lineUserId));
            if (er) {
              // breakMinutes
              if (eM.breakMinutes) {
                const bm = Number(er[eM.breakMinutes-1] || 0);
                if (!isNaN(bm) && bm > 0) breakMinutes = bm;
              }

              // มาตรฐานต่อวันจาก shiftIn/shiftOut - break
              let stdDaily = 0;
              if (eM.shiftIn && eM.shiftOut) {
                const inStr  = toHMStrict(er[eM.shiftIn-1]  || '');
                const outStr = toHMStrict(er[eM.shiftOut-1] || '');

                const mIn  = inStr  && inStr.match(/^(\d{1,2}):(\d{2})$/);
                const mOut = outStr && outStr.match(/^(\d{1,2}):(\d{2})$/);

                if (mIn && mOut) {
                  const inMin  = (+mIn[1])  * 60 + (+mIn[2]);
                  const outMin = (+mOut[1]) * 60 + (+mOut[2]);
                  const diffMin = Math.max(0, outMin - inMin);
                  stdDaily = Math.max(0, diffMin/60 - (breakMinutes > 0 ? breakMinutes/60 : 0));
                }
              }

              // fallback: dailyHours เดิมหรือ 8 ชั่วโมง
              if (!stdDaily && eM.dailyHours) {
                const dh = Number(er[eM.dailyHours-1] || 0);
                if (dh > 0) stdDaily = dh;
              }
              if (!stdDaily) stdDaily = 8;

              dailyHours = stdDaily;
            }
          } catch (_) {}

          // ===== WORK LOGS (อ่านจากหลายชีต) =====
          const startYMD = ymdStr(start);   // 'YYYY-MM-DD'
          const endYMD   = ymdStr(end);

          const workSheets = getWorkSheetsForRange(startYMD, endYMD);
          let wM = null;
          const wRows = [];

          workSheets.forEach(ws => {
            const m = headerMap(ws);
            if (!wM) wM = m;
            const rows = readRows(ws);
            rows.forEach(r => {
              const uid = String(r[m.lineUserId-1] || '');
              const d   = r[m.date-1]
                ? new Date(r[m.date-1])
                : (r[m.time-1] ? new Date(r[m.time-1]) : null);
              if (uid === lineUserId && d && d >= start && d <= end) {
                wRows.push(r);
              }
            });
          });

          if (!wM) {
            // กรณีไม่มี log เลย แต่ต้องมี headerMap ไว้ให้ใช้ต่อด้านล่าง
            const wT = sh(SH.WORK);
            ensureHeaders(wT, WORK_HEADERS);
            wM = headerMap(wT);
          }


          // group by day
          const byDay = {};
          wRows.forEach(r=>{
            const date = ymdStr(r[wM.date-1] || r[wM.time-1]);
            const io   = String(r[wM.io-1] || '').toUpperCase();
            const obj  = (byDay[date] = byDay[date] || { ins:[], outs:[], addrs:{} });
            if (io === 'IN')  obj.ins.push(r);
            if (io === 'OUT') obj.outs.push(r);
            if (io) obj.addrs[io] = r[wM.address-1] || '';
          });

          // สร้างแถวรายวัน: เอา IN แรก + OUT สุดท้าย
          const days = Object.keys(byDay).sort().map(d=>{
            const o = byDay[d];
            const ins  = o.ins.sort((a,b)=> new Date(a[wM.time-1]) - new Date(b[wM.time-1]));
            const outs = o.outs.sort((a,b)=> new Date(a[wM.time-1]) - new Date(b[wM.time-1]));
            const inRow  = ins[0];
            const outRow = outs[outs.length-1];

            const inTime  = inRow  ? iso(inRow[wM.time-1])  : '';
            const outTime = outRow ? iso(outRow[wM.time-1]) : '';

            const rawHours = (inRow && outRow)
              ? Math.max(0, (new Date(outRow[wM.time-1]) - new Date(inRow[wM.time-1]))/3600000)
              : 0;

            const breakH  = breakMinutes > 0 ? (breakMinutes / 60) : 0;
            const workH   = Math.max(0, rawHours - breakH);
            const overH   = Math.max(0, workH - dailyHours);

            return {
              date: d,
              inTime, outTime,
              inAddr:  o.addrs.IN  || '',
              outAddr: o.addrs.OUT || '',
              hours: workH,     // ชั่วโมงทำงานจริง (หักพักเบรกแล้ว)
              rawHours,         // ชั่วโมงดิบตาม IN/OUT
              overHours: overH  // ชั่วโมงเกินจากมาตรฐานต่อวัน
            };
          });

          
          // ===== LEAVE LOGS =====
          const lS = sh(SH.LEAVE);
          ensureHeaders(lS, [
            'lineUserId','date','hours','reason','note',
            'createdAt','_raw',
            'year','isQuota','usedAfterHours','usedAfterDays'
          ]);
          const lM = headerMap(lS);

          const leave = readRows(lS).filter(r=>{
            const uid = String(r[lM.lineUserId-1] || '');
            const d   = r[lM.date-1] ? new Date(r[lM.date-1]) : null;
            return uid === lineUserId && d && d >= start && d <= end;
          }).map(r=>{
            const isQuota = lM.isQuota
              ? String(r[lM.isQuota-1] || '').toUpperCase() === 'TRUE'
              : false;
            const usedAfterDays = lM.usedAfterDays
              ? Number(r[lM.usedAfterDays-1] || 0)
              : null;

            return {
              date:  ymdStr(r[lM.date-1]),
              hours: Number(r[lM.hours-1] || 0),
              reason: r[lM.reason-1] || '',
              note:   r[lM.note-1] || '',
              isQuota,
              usedAfterDays
            };
          });

          // ===== SUMMARY =====
          const workHours = days.reduce((s,d)=> s + Number(d.hours||0), 0);
          const workDays  = days.filter(d=> Number(d.hours||0) > 0).length;
          const leaveHours= leave.reduce((s,l)=> s + Number(l.hours||0), 0);
          const leaveDays = Array.from(new Set(leave.map(l=> l.date))).length;


          const leavePaidHours   = leave.filter(l =>  l.isQuota).reduce((s,l)=> s + Number(l.hours||0), 0);
          const leaveUnpaidHours = leave.filter(l => !l.isQuota).reduce((s,l)=> s + Number(l.hours||0), 0);

          const leavePaidDays    = dailyHours > 0 ? (leavePaidHours   / dailyHours) : 0;
          const leaveUnpaidDays  = dailyHours > 0 ? (leaveUnpaidHours / dailyHours) : 0;

          return reply({
            ok:true,
            days,
            leave,
            summary:{
              workHours,
              workDays,
              leaveHours,
              leaveDays,
              // 🆕 ใช้สำหรับทำเงินเดือน
              leavePaidHours,
              leaveUnpaidHours,
              leavePaidDays,
              leaveUnpaidDays
            }
          });
        }

        

        case 'list_runs': {
          const s = sh(SH.RUN); ensureHeaders(s, ['runId','periodStart','periodEnd','createdAt']);
          const m = headerMap(s); const rows = readRows(s);
          const data = rows.map(r => ({
            runId:       String(r[m.runId-1] || ''),
            periodStart: toYMDStrict(r[m.periodStart-1] || ''),
            periodEnd:   toYMDStrict(r[m.periodEnd-1]   || ''),
            createdAt:   String(r[m.createdAt-1] || '')
          })).sort((a,b)=> (a.createdAt>b.createdAt?-1:1));
          return reply({ ok:true, data });
        }

        case 'list_items': {
          const { runId, month, q } = body || {};
          const s = sh(SH.ITEM);
          ensureHeaders(s, [
            'runId','lineUserId','fullName','jobTitle',
            'workDays','workHours','overHours','basePay','lateDeduct',
            'allowances','deductions','netPay','detail_json',
            'status','createdAt','updatedAt'
          ]);
          const m = headerMap(s); const rows = readRows(s);

          // โหลดข้อมูล RUN ทั้งหมดเพื่อ map runId -> periodStart/End
          const rS = sh(SH.RUN); const rM = headerMap(rS);
          const rRows = readRows(rS);
          const runMap = {};
          rRows.forEach(rr => {
            runMap[String(rr[rM.runId-1]||'')] = {
              periodStart: toYMDStrict(rr[rM.periodStart-1]||''),
              periodEnd:   toYMDStrict(rr[rM.periodEnd-1]  ||'')
            };
          });

          const kw = String(q||'').toLowerCase();

          const data = rows.map(r => ({
            runId:      String(r[m.runId-1]      || ''),
            lineUserId: String(r[m.lineUserId-1] || ''),
            fullName:   String(r[m.fullName-1]   || ''),
            jobTitle:   m.jobTitle ? String(r[m.jobTitle-1] || '') : '',
            workDays:   Number(r[m.workDays-1]   || 0),
            workHours:  Number(r[m.workHours-1]  || 0),
            overHours:  m.overHours ? Number(r[m.overHours-1] || 0) : 0,   // 🆕
            basePay:    Number(r[m.basePay-1]    || 0),
            lateDeduct: Number(r[m.lateDeduct-1] || 0),
            allowances: Number(r[m.allowances-1] || 0),
            deductions: Number(r[m.deductions-1] || 0),
            netPay:     Number(r[m.netPay-1]     || 0),
            detail:     jparse(r[m.detail_json-1] || '{}'),
            status:     m.status ? String(r[m.status-1] || '').toLowerCase() : '',
            createdAt:  String(r[m.createdAt-1]  || '')
          })).filter(o => {
            if (runId && o.runId !== runId) return false;

            // ถ้า user ระบุ month (YYYY-MM) ให้เทียบกับ periodStart ของ run นั้น
            if (month) {
              const ps = runMap[o.runId]?.periodStart || '';
              if (!String(ps).startsWith(String(month))) return false;
            }

            if (kw && !(o.fullName.toLowerCase().includes(kw) || o.lineUserId.toLowerCase().includes(kw))) return false;
            return true;
          }).sort((a,b)=> (a.createdAt>b.createdAt?-1:1));

          return reply({ ok:true, data });
        }

      
        case 'pay_status_get_map': {
          const { month } = body || {};
          if (!month) return reply({ ok:false, error:'month required (YYYY-MM)' });

          // ✅ normalize คีย์เดือนที่รับเข้ามา → YYYY-MM
          const mkey = String(month).trim().slice(0,7);

          const s = sh(SH.PSTAT);
          ensureHeaders(s, ['month','lineUserId','status','note','updatedAt','actorLineUserId']);
          const m = headerMap(s);

          // อ่านทุกแถว แล้ว normalize เดือนในแถวด้วย (รองรับข้อมูลเก่าที่เป็น YYYY-MM-DD)
          const rows = readRows(s).map(r => ({
            month: String(r[m.month-1] || '').trim().slice(0,7),
            lineUserId: String(r[m.lineUserId-1] || '').trim(),
            status: String(r[m.status-1] || 'pending').trim(),
            note: String(r[m.note-1] || '').trim(),
            updatedAt: String(r[m.updatedAt-1] || ''),
          })).filter(o => o.month === mkey && o.lineUserId);

          // ✅ de-duplicate: ถ้าคนเดียวกันซ้ำ ให้เลือกอัน "ล่าสุด" ตาม updatedAt
          const byUid = {};
          for (const o of rows) {
            const prev = byUid[o.lineUserId];
            if (!prev) { byUid[o.lineUserId] = o; continue; }
            if ((o.updatedAt || '') > (prev.updatedAt || '')) byUid[o.lineUserId] = o;
          }

          const map = {};
          Object.keys(byUid).forEach(uid => {
            const o = byUid[uid];
            map[uid] = { status: o.status, note: o.note, updatedAt: o.updatedAt };
          });

          return reply({ ok:true, data: map });
        }


        // [POST] บันทึก/อัปเดตสถานะของพนักงานหนึ่งคนในเดือนนั้น (upsert by month+lineUserId)
        case 'pay_status_save': {
          const json = body || {};
          const monthKey = String(json.month || '').trim().slice(0, 7); // YYYY-MM
          const lineUserId = String(json.lineUserId || '').trim();
          if (!monthKey || !lineUserId) return reply({ ok:false, error:'month & lineUserId required' });

          const raw = String(json.status || 'pending').trim().toLowerCase();
          const ALLOW = new Set(['pending','approved','paid','rejected']);
          const status = ALLOW.has(raw) ? raw : 'pending';

          const actorLineUserId = String(
            (json.actor && json.actor.lineUserId) || json.actorLineUserId || ''
          ).trim();

          const s = sh(SH.PSTAT);
          ensureHeaders(s, ['month','lineUserId','status','note','updatedAt','actorLineUserId']);
          const m = headerMap(s);
          const rows = readRows(s);

          // 🔎 หา row เดิม โดย normalize เดือนในชีตเป็น YYYY-MM เหมือนกัน
          let foundRow = -1;
          for (let i = 0; i < rows.length; i++) {
            const mon = String(rows[i][m.month-1] || '').trim().slice(0,7);
            const uid = String(rows[i][m.lineUserId-1] || '').trim();
            if (mon === monthKey && uid === lineUserId) { foundRow = i + 2; break; }
          }

          const rec = {
            month: monthKey,
            lineUserId,
            status,
            note: String(json.note || '').trim(),
            updatedAt: now(),
            actorLineUserId
          };

          if (foundRow > 0) {
            s.getRange(foundRow, 1, 1, 6).setValues([[rec.month, rec.lineUserId, rec.status, rec.note, rec.updatedAt, rec.actorLineUserId]]);
          } else {
            s.appendRow([rec.month, rec.lineUserId, rec.status, rec.note, rec.updatedAt, rec.actorLineUserId]);
          }
          return reply({ ok:true });
        }


        case 'pg_list': {
          const s = sh(SH.PG);
          ensureHeaders(s, [
            'groupId','name','type','n',
            'startDate','payDayOfMonth',
            'workdayOnly','notifyBeforeDays',
            'createdAt','updatedAt'
          ]);

          const { rows } = _readTable(s);

          // 🧠 แปลง startDate ให้เป็น YYYY-MM-DD เสมอ (ไม่ว่าจะเก็บเป็น Date หรือสตริง)
          const data = rows.map(r => ({
            ...r,
            startDate: toYMDStrict(r.startDate || '')
          }));

          return reply({ ok:true, data });
        }

        case 'pg_get': {
          const { groupId } = body || {};
          if (!groupId) return reply({ ok:false, error:'groupId_required' });

          const s  = sh(SH.PG);
          const sm = sh(SH.PGM);

          ensureHeaders(s,  [
            'groupId','name','type','n',
            'startDate','payDayOfMonth',
            'workdayOnly','notifyBeforeDays',
            'createdAt','updatedAt'
          ]);
          ensureHeaders(sm, ['groupId','lineUserId','createdAt']);

          const raw = _readTable(s).rows.find(r => String(r.groupId) === String(groupId));
          if (!raw) return reply({ ok:false, error:'group_not_found' });

          // 🧠 normalize startDate กลับเป็น YYYY-MM-DD
          const g = {
            ...raw,
            startDate: toYMDStrict(raw.startDate || '')
          };

          const memberIds = _readTable(sm).rows
            .filter(r => String(r.groupId) === String(groupId))
            .map(r => String(r.lineUserId || '').trim())
            .filter(Boolean);

          return reply({ ok:true, data: { ...g, memberIds } });
        }



        case 'pg_schedule_preview': {
          const { today } = body || {};
          const todayY = toYMDStrict(today || new Date());

          const s = sh(SH.PG);
          ensureHeaders(s, ['groupId','name','type','n','startDate','payDayOfMonth','workdayOnly','notifyBeforeDays','createdAt','updatedAt']);
          const { rows } = _readTable(s);

          const out = rows.map(g => {
            const type = String(g.type || 'every_n_days');
            const workdayOnly = String(g.workdayOnly || '').toUpperCase() === 'TRUE';
            const n = Number(g.n || 0);
            const start = toYMDStrict(g.startDate || '');
            const payDOM = String(g.payDayOfMonth || '').trim(); // ✅
            // ใช้แจ้งเตือนล่วงหน้า 0 วันเสมอ (notifyDate = payDate)
            const nb = 0;

            let sched = null;
            if (type === 'monthly') {
              sched = monthlyNextSchedule(todayY, nb, payDOM, workdayOnly);   // ✅
            } else {
              sched = everyNDaysNextSchedule(start, n, todayY, nb, workdayOnly);
            }

            return {
              groupId: g.groupId, name: g.name, type,
              n, startDate: start, workdayOnly, notifyBeforeDays: nb,
              payDayOfMonth: payDOM,                                   // ✅ ส่งคืนด้วย
              ...(sched || {}),
              notifyDate: (sched ? sched.periodEnd : null)
            };
          });

          return reply({ ok:true, data: out });
        }


        case 'pg_save': {
          const { actor, groupId, name, type, n, startDate, workdayOnly, notifyBeforeDays, payDayOfMonth } = body || {};
          if (!canAdmin(actor?.lineUserId)) return reply({ ok:false, error:'forbidden' });

          const s = sh(SH.PG);
          ensureHeaders(s, ['groupId','name','type','n','startDate','payDayOfMonth','workdayOnly','notifyBeforeDays','createdAt','updatedAt']); // ✅

          const gid = String(groupId || '').trim() || Utilities.getUuid().replace(/-/g,'').slice(0,16);
          const nowISO = _nowISO();

          upsertByKeys(SH.PG,
            ['groupId','name','type','n','startDate','payDayOfMonth','workdayOnly','notifyBeforeDays','createdAt','updatedAt'], // ✅
            ['groupId'],
            {
              groupId: gid,
              name: String(name || '').trim(),
              type: String(type || 'every_n_days'),
              n: (n === '' || n == null) ? '' : Number(n),
              startDate: toYMDStrict(startDate || ''),
              payDayOfMonth: String(payDayOfMonth || '').trim(), // ✅ '1'..'31' หรือ 'last'
              workdayOnly: (String(workdayOnly) === 'true' || workdayOnly === true) ? 'TRUE' : 'FALSE',
              notifyBeforeDays: (notifyBeforeDays === '' || notifyBeforeDays == null) ? '' : Number(notifyBeforeDays),
              createdAt: nowISO,
              updatedAt: nowISO
            }
          );
          return reply({ ok:true, data:{ groupId: gid } });
        }


        case 'pg_members_save': {
          const { actor, groupId, memberIds } = body || {};
          if (!canAdmin(actor?.lineUserId)) return reply({ ok:false, error:'forbidden' });
          if (!groupId) return reply({ ok:false, error:'groupId_required' });

          const sm = sh(SH.PGM);
          ensureHeaders(sm, ['groupId','lineUserId','createdAt']);
          const mm = headerMap(sm);

          // อ่านทั้งหมดครั้งเดียว
          const lastR = sm.getLastRow();
          const lastC = sm.getLastColumn();
          const rows  = lastR > 1 ? sm.getRange(2,1,lastR-1,lastC).getValues() : [];

          // หา index (0-based, จาก data ไม่รวม header) ของแถวที่ groupId ตรง
          const delIdx = [];
          for (let i=0;i<rows.length;i++){
            if (String(rows[i][mm.groupId-1]||'') === String(groupId)) delIdx.push(i);
          }

          // ลบจากล่างขึ้นบน เพื่อไม่ให้ index เคลื่อน
          delIdx.reverse().forEach(i => sm.deleteRow(i + 2));

          // เขียนสมาชิกใหม่ (unique + ไม่ว่าง)
          const setIds = Array.from(new Set((memberIds||[]).map(s=>String(s||'').trim()).filter(Boolean)));
          const nowISO = _nowISO();
          setIds.forEach(uid => sm.appendRow([groupId, uid, nowISO]));

          return reply({ ok:true, count: setIds.length });
        }



        case 'emp_groups_get': {
          const { actor, lineUserId } = body || {};
          if (!lineUserId) return reply({ ok:false, error:'lineUserId required' });
          if (!canAdmin(actor?.lineUserId)) return reply({ ok:false, error:'forbidden' });

          const sm = sh(SH.PGM);
          ensureHeaders(sm, ['groupId','lineUserId','createdAt']);
          const { headers, rows } = _readTable(sm);

          const groupIds = rows
            .filter(r => String(r.lineUserId || '').trim() === String(lineUserId))
            .map(r => String(r.groupId || '').trim())
            .filter(Boolean);

          return reply({ ok:true, groupIds: Array.from(new Set(groupIds)) });
        }

        case 'emp_groups_set': {
          const { actor, lineUserId, groupIds } = body || {};
          if (!lineUserId) return reply({ ok:false, error:'lineUserId required' });
          if (!canAdmin(actor?.lineUserId)) return reply({ ok:false, error:'forbidden' });

          const sm = sh(SH.PGM);
          ensureHeaders(sm, ['groupId','lineUserId','createdAt']);
          const mm = headerMap(sm);

          const lastR = sm.getLastRow();
          const lastC = sm.getLastColumn();
          const rows  = lastR > 1 ? sm.getRange(2,1,lastR-1,lastC).getValues() : [];

          const delIdx = [];
          rows.forEach((row,i) => {
            const id = String(row[mm.lineUserId-1] || '').trim();
            if (id === String(lineUserId)) delIdx.push(i);
          });
          delIdx.reverse().forEach(i => sm.deleteRow(i + 2));

          const uniqGroups = Array.from(new Set((groupIds || []).map(g => String(g || '').trim()).filter(Boolean)));
          const nowISO = _nowISO();
          uniqGroups.forEach(gid => sm.appendRow([gid, String(lineUserId), nowISO]));

          return reply({ ok:true, count: uniqGroups.length });
        }



        case 'pay_item_patch': {
          const { runId, lineUserId } = body;
          if (!runId || !lineUserId) return reply({ ok:false, error:'missing runId/lineUserId' });

          // 🔧 NEW: แปลงตัวเลข + ปัดเศษตามกติกา
          const basePayRaw    = Number(body.basePay    || 0);
          const lateDeductRaw = Number(body.lateDeduct || 0);
          const allowRaw      = Number(body.allowances || 0);
          const deductRaw     = Number(body.deductions || 0);

          const basePay    = moneyRound(basePayRaw);
          const lateDeduct = moneyRound(lateDeductRaw);
          const allowances = moneyRound(allowRaw);
          const deductions = moneyRound(deductRaw);

          // ถ้า netPay ถูกส่งมา ให้ปัดด้วย / ไม่งั้นคำนวณใหม่แล้วปัด
          const netCalc = Math.max(0, basePay - lateDeduct + allowances - deductions);
          const netPay  = moneyRound( body.netPay != null ? Number(body.netPay) : netCalc );

          const detailJson = jstr(body.detail || {});
          const status     = String(body.status || '').trim().toLowerCase();

          ensureHeaders(sh(SH.ITEM), [
            'runId','lineUserId','fullName','jobTitle',
            'workDays','workHours','overHours','basePay','lateDeduct',
            'allowances','deductions','netPay','detail_json',
            'status','createdAt','updatedAt'
          ]);

          const partial = {
            runId, lineUserId,
            basePay, lateDeduct, allowances, deductions, netPay,
            detail_json: detailJson,
            updatedAt: now()
          };
          if (status) partial.status = status;

          patchByKeys(SH.ITEM, ['runId','lineUserId'], partial);
          return reply({ ok:true });
        }

        case 'pg_reminder_due': {
          const { today } = body || {};
          const todayY = toYMDStrict(today || new Date());

          const s = sh(SH.PG);
          ensureHeaders(s, ['groupId','name','type','n','startDate','payDayOfMonth','workdayOnly','notifyBeforeDays','createdAt','updatedAt']);
          const { rows } = _readTable(s);

          const due = [];
          rows.forEach(g => {
            const type = String(g.type || 'every_n_days');
            const workdayOnly = String(g.workdayOnly || '').toUpperCase() === 'TRUE';
            const n = Number(g.n || 0);
            const start = toYMDStrict(g.startDate || '');
            const payDOM = String(g.payDayOfMonth || '').trim();
            const nb = 0;

            let sched = null;
            if (type === 'monthly') {
              sched = monthlyNextSchedule(todayY, nb, payDOM, workdayOnly);
            } else {
              sched = everyNDaysNextSchedule(start, n, todayY, nb, workdayOnly);
            }

            // ✅ ใช้ periodEnd เป็น "วันครบงวด/วันแจ้งเตือน"
            if (sched && sched.periodEnd === todayY) {
              due.push({
                groupId: g.groupId,
                name: g.name,
                type, n, workdayOnly,
                payDayOfMonth: payDOM,
                periodStart: sched.periodStart,
                periodEnd:   sched.periodEnd,
                // วันจ่ายให้ใช้วันสิ้นงวดไปเลย (ตามที่ UI แสดง)
                payDate:     sched.periodEnd,
                notifyDate:  sched.periodEnd
              });
            }
          });

          // ใส่รายชื่อผู้รับ (owner/admin) — server จะไปยิง LINE ต่อ
          const admins = (function(){
            const r = sh(SH.ROLES); ensureHeaders(r, ['lineUserId','role','updatedAt']);
            const m = headerMap(r); const rows = readRows(r);
            const ids = rows.filter(x => {
              const role = String(x[m.role-1] || '').toLowerCase();
              return role === 'owner' || role === 'admin';
            }).map(x => String(x[m.lineUserId-1] || '').trim()).filter(Boolean);
            return Array.from(new Set(ids));
          })();

          return reply({ ok:true, data: { today: todayY, due, adminIds: admins } });
        }

        case 'delete_employee': {
          const { actor, lineUserId } = body || {};
          if (!lineUserId) return reply({ ok:false, error:'lineUserId required' });
          if (!canAdmin(actor?.lineUserId)) return reply({ ok:false, error:'forbidden' });

          // 1) mark deletedAt ใน EMP
          const s = sh(SH.EMP);
          ensureHeaders(s, [
            'lineUserId','nationalId','fullName','idAddress','currentAddress','phone','birthDate',
            'gender','jobTitle','bankName','bankAccount',
            'registerDate',
            'payType','payRate','dailyHours',
            'breakMinutes','leaveQuotaDays',
            'prorateLate','payEveryN',
            'payCycleType','payCycleN', 
            'shiftIn','shiftOut','lateGraceMin',
            'payoutChannel','allowances_json','deductions_json',
            'role','deletedAt','updatedAt','_raw'
          ]);

          patchByKeys(SH.EMP, ['lineUserId'], {
            lineUserId: String(lineUserId),
            deletedAt: now()
          });

          // 2) ลบ role ใน ROLES
          const rs = sh(SH.ROLES);
          ensureHeaders(rs, ['lineUserId','role','updatedAt']);
          const rm = headerMap(rs);
          const rLast = rs.getLastRow();
          const rCols = rs.getLastColumn();
          if (rLast > 1) {
            const vals = rs.getRange(2,1,rLast-1,rCols).getValues();
            const delIdx = [];
            vals.forEach((row,i) => {
              const id = String(row[rm.lineUserId-1] || '').trim();
              if (id === String(lineUserId)) delIdx.push(i);
            });
            delIdx.reverse().forEach(i => rs.deleteRow(i + 2));
          }

          // 3) ลบออกจาก paygroups_members (PGM)
          const sm = sh(SH.PGM);
          ensureHeaders(sm, ['groupId','lineUserId','createdAt']);
          const mm = headerMap(sm);
          const sLast = sm.getLastRow();
          const sCols = sm.getLastColumn();
          if (sLast > 1) {
            const vals = sm.getRange(2,1,sLast-1,sCols).getValues();
            const delIdx = [];
            vals.forEach((row,i) => {
              const id = String(row[mm.lineUserId-1] || '').trim();
              if (id === String(lineUserId)) delIdx.push(i);
            });
            delIdx.reverse().forEach(i => sm.deleteRow(i + 2));
          }

          return reply({ ok:true });
        }




        default:
          return reply({ ok:false, error:'unknown action' });
      }
    });
  }catch(err){
    return reply({ ok:false, error: String(err) });
  }
}

function reply(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e){
  return ContentService.createTextOutput(JSON.stringify({ ok:true, time: now() }))
    .setMimeType(ContentService.MimeType.JSON);
}




/***** ---------- TEST DATA SEEDER (work_logs) ---------- *****
 * ใส่ข้อมูลเข้า-ออกงานตั้งแต่ต้นเดือนถึงปลายเดือน (ข้ามเสาร์/อาทิตย์)
 * ใช้ร่วมกับโค้ดหลักที่มีฟังก์ชัน sh(), ensureHeaders(), headerMap(),
 * upsertByKeys(), nextId(), ymd(), TZ อยู่แล้ว
 **************************************************************/

function seedWorkLogsOctober() {
  // ใช้ไฟล์นี้ครั้งเดียว (เอาเฉพาะ file ID ไม่ต้องใช้ gid)
  const sheetId = '1bBO-7u1-lMRgtO_NME0thTeb_M1SE7dowDlneMN5Smg';

  // === CONFIG ที่ต้องการทดสอบ ===
  const lineUserId = 'Udae5f3b9e1883d8883d03cff4700d801'; // <<— ใส่ LINE UserId ของพนักงานที่จะ seed
  const year  = 2025;
  const month = 11;   // ตุลา = 10
  const addrIN  = 'สำนักงาน (ประตูหน้า)';
  const addrOUT = 'สำนักงาน (ลานจอดรถ)';
  const lat = 13.81386, lng = 100.68290; // พิกัดตัวอย่าง
  const baseIn  = { h:8,  m:30 };   // เวลาเข้า (จะสุ่มสาย 0–15 นาที)
  const baseOut = { h:17, m:30 };   // เวลาออก (จะสุ่มออกก่อน 0–15 นาที)

  return withCtx({ sheetId }, function () {
    const monthKey = year + '-' + ('0' + month).slice(-2); // ex. 2025-11
    const sheetName = workSheetNameFromMonthKey(monthKey);
    const s = sh(sheetName);
    ensureHeaders(s, WORK_HEADERS);
    const m = headerMap(s);
    const headers = WORK_HEADERS;


    const lastDay = new Date(year, month, 0).getDate();
    let created = 0;

    for (let d = 1; d <= lastDay; d++) {
      const dt = new Date(year, month - 1, d);
      const wd = dt.getDay();                 // 0=อา ... 6=ส
      if (wd === 0 || wd === 6) continue;     // ข้ามเสาร์/อาทิตย์

      const dateStr = Utilities.formatDate(dt, TZ, 'yyyy-MM-dd');

      // สุ่ม: สาย 0–15 นาที, ออกก่อน 0–15 นาที
      const lateMin  = Math.floor(Math.random() * 16);
      const earlyMin = Math.floor(Math.random() * 16);

      const inDate  = new Date(year, month - 1, d, baseIn.h,  baseIn.m  + lateMin, 0);
      const outDate = new Date(year, month - 1, d, baseOut.h, Math.max(0, baseOut.m - earlyMin), 0);

      const inTimeISO  = Utilities.formatDate(inDate,  TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
      const outTimeISO = Utilities.formatDate(outDate, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");

      // เข้างาน (IN)
      const inId = nextId('IN');
      upsertByKeys(sheetName, headers, ['logId'], {
        lineUserId, io: 'IN', logId: inId, time: inTimeISO, date: dateStr,
        lat, lng, address: addrIN, note: 'seed', linkedOutId: '', _raw: ''
      });

      // ออกงาน (OUT)
      const outId = nextId('OUT');
      upsertByKeys(sheetName, headers, ['logId'], {
        lineUserId, io: 'OUT', logId: outId, time: outTimeISO, date: dateStr,
        lat, lng, address: addrOUT, note: 'seed', linkedOutId: '', _raw: ''
      });

      // ลิงก์ IN → OUT
      if (m.linkedOutId) {
        const lr = s.getLastRow(), lc = s.getLastColumn();
        const rng = lr > 1 ? s.getRange(2, 1, lr - 1, lc).getValues() : [];
        const rowIdx = rng.findIndex(r => String(r[m.logId - 1]) === inId);
        if (rowIdx >= 0) s.getRange(rowIdx + 2, m.linkedOutId, 1, 1).setValue(outId);
      }

      created++;
    }

    Logger.log(`seeded ${created} work-day(s) for ${year}-${('0'+month).slice(-2)} (Mon–Fri only)`);
    return { ok: true, created };
  });
}


function syncRolesToEmployeesOnce() {
  // ✅ ใช้ sheetId เดียวกับไฟล์ TimeAttendanceDemo
  const sheetId = '1bBO-7u1-lMRgtO_NME0thTeb_M1SE7dowDlneMN5Smg'; // เปลี่ยนเป็นของจริงถ้าไม่ตรง

  return withCtx({ sheetId }, function () {
    initAllHeaders();

    const rs = sh(SH.ROLES);
    ensureHeaders(rs, ['lineUserId','role','updatedAt']);
    const rm = headerMap(rs);
    const rows = readRows(rs);

    rows.forEach(r => {
      const lineUserId = String(r[rm.lineUserId-1] || '').trim();
      const role       = String(r[rm.role-1] || '').trim();
      if (!lineUserId || !role) return;

      patchByKeys(SH.EMP, ['lineUserId'], {
        lineUserId,
        role,
        updatedAt: now()
      });
    });
  });
}







