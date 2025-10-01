// ── Parsers

// ========== Loose assignment parser (Thai free text) — อัปเดต ==========
function parseAssignLoose(text) {
  if (!text) return null;
  const raw = String(text).trim();

  const mUser = raw.match(/@([^\s:：]+)/);
  if (!mUser) return null;

  const assigneeName = mUser[1].trim();
  let body = raw.replace(mUser[0], ' ').replace(/\s+/g, ' ').trim();

  // ฟิลเลอร์ยอดฮิต
  body = body
    .replace(/(?:^|[\s,;])ของาน(?=$|[\s,;])/gi, ' ')
    .replace(/(?:^|[\s,;])(ช่วยทำ|ช่วยเช็ค|ช่วยแก้|ช่วยอัปเดต|ช่วยตรวจ|ช่วย|จัดการ|ขอ)(?=$|[\s,;])/gi, ' ')
    .replace(/(?:^|[\s,;])ทำ(?=$|[\s,;])/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // NOTE / ความเร่งด่วน
  let note = '';
  if (/(ด่วน(ที่สุด|สุด)?|urgent)/i.test(body)) {
    note = '[URGENT]';
    body = body.replace(/(ด่วน(ที่สุด|สุด)?|urgent)/ig, ' ');
  } else if (/(ไม่รีบ(?:นะ)?|normal|ค่อยทำ)/i.test(body)) {
    note = (note ? note + ' ' : '') + 'ไม่รีบ';
    body = body.replace(/(ไม่รีบ(?:นะ)?|normal|ค่อยทำ)/ig, ' ');
  }

  // helper: ลบ token ด้วย boundary แบบไทย
  const rm = (tok) => {
    if (!tok) return;
    const esc = String(tok).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[\\s,;:()\\[\\]{}"'\`])${esc}(?=$|[\\s,;:()\\[\\]{}"'\`])`, 'giu');
    body = body.replace(re, ' ').replace(/\s+/g, ' ').trim();
  };

  let deadline = '';
  let relDay = '';     // วันนี้ | พรุ่งนี้
  let timeStr = '';    // HH:mm

  // 1) “วันนี้/พรุ่งนี้ + เวลา” (รองรับ "เที่ยง ครึ่ง", 9, 9:00, 9.30)
  if (!deadline) {
    const m = body.match(/(วันนี้|พรุ่งนี้|พรุ้งนี้|พรุงนี้)\s*(บ่าย\s*ครึ่ง|เที่ยง\s*ครึ่ง|เที่ยงครึ่ง|เที่ยง(?:\s*ตรง)?|(\d{1,2})(?:[:.](\d{2}))?)/i);
    if (m) {
      if (m[3]) {
        const hh = String(m[3]).padStart(2, '0');
        const mm = String(m[4] || '0').padStart(2, '0');
        deadline = parseNaturalDue(`${/^วันนี้$/i.test(m[1]) ? 'วันนี้' : 'พรุ่งนี้'} ${hh}:${mm}`);
      } else {
        const hhmm = /ครึ่ง/i.test(m[2]) ? '12:30' : '12:00';
        deadline = parseNaturalDue(`${/^วันนี้$/i.test(m[1]) ? 'วันนี้' : 'พรุ่งนี้'} ${hhmm}`);
      }
      rm(m[0]);
    }
  }

  // 2) วันไทยนี้/หน้า [+ เวลา | เที่ยง | เที่ยง ครึ่ง]
  if (!deadline) {
    const m = body.match(/(?:วัน)?(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)(นี้|หน้า)(?:\s+(เที่ยง(?:\s*ตรง)?|เที่ยง\s*ครึ่ง|(\d{1,2})(?:[:.](\d{2}))?))?/i);
    if (m) {
      if (m[3]) {
        if (/เที่ยง/.test(m[3])) {
          deadline = parseNaturalDue(`${m[1]}${m[2]} ${/ครึ่ง/.test(m[3]) ? 'เที่ยง ครึ่ง' : 'เที่ยง'}`);
        } else {
          const hh = String(m[4]).padStart(2, '0');
          const mm = String(m[5] || '0').padStart(2, '0');
          deadline = parseNaturalDue(`${m[1]}${m[2]} ${hh}:${mm}`);
        }
      } else {
        deadline = parseNaturalDue(`${m[1]}${m[2]}`); // default 17:30
      }
      rm(m[0]);
    }
  }

  // 3) เก็บ flag “วันนี้/พรุ่งนี้” เดี่ยว ๆ
  if (!relDay) {
    const m = body.match(/(^|[\s,;])(วันนี้|พรุ่งนี้|พรุ้งนี้|พรุงนี้)(?=($|[\s,;]))/i);
    if (m) { relDay = /^วันนี้$/i.test(m[2]) ? 'วันนี้' : 'พรุ่งนี้'; rm(m[2]); }
  }

  // 4) เที่ยง / เที่ยงครึ่ง / เที่ยง ครึ่ง
  if (!timeStr) {
    const m = body.match(/บ่าย\s*ครึ่ง|เที่ยง\s*ครึ่ง|เที่ยงครึ่ง|เที่ยง(?:\s*ตรง)?/i);
    if (m) {
      timeStr = /ครึ่ง/i.test(m[0]) ? '12:30' : '12:00';
      rm(m[0]);
    }
  }


  // 5) “ก่อนบ่าย X[:mm]” → วันนี้ X[:mm]
  if (!deadline) {
    const m = body.match(/ก่อน\s*บ่าย\s*(\d{1,2})(?:[:.](\d{2}))?/i);
    if (m) {
      const hh = Math.min(12 + Number(m[1]), 23);
      const mm = m[2] ? Number(m[2]) : 0;
      deadline = parseNaturalDue(`วันนี้ ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`);
      rm(m[0]);
    }
  }

  // 6) บ่ายหนึ่ง/สอง/... [ครึ่ง]
  if (!timeStr) {
    const m = body.match(/บ่าย\s*(หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|สิบเอ็ด|12|\d{1,2})\s*(โมง)?(ครึ่ง)?/i);
    if (m) {
      const map = { หนึ่ง:13, สอง:14, สาม:15, สี่:16, ห้า:17, หก:18, เจ็ด:19, แปด:20, เก้า:21, สิบ:22, สิบเอ็ด:23 };
      const hh = map[m[1].toLowerCase?.()] ?? (12 + Number(m[1]));
      const mm = m[3] ? 30 : 0;
      timeStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
      rm(m[0]);
    }
  }

  // 7) X โมง [เช้า|เย็น] [ครึ่ง] | X ทุ่ม [ครึ่ง]   (รองรับ "ทุ่ม ครึ่ง")
  if (!timeStr) {
    const m = body.match(/(\d{1,2})\s*โมง\s*(เช้า|เย็น)?\s*(ครึ่ง)?|(\d{1,2})\s*ทุ่ม\s*(ครึ่ง)?/i);
    if (m) {
      let hh, mm = (m[3] || m[5]) ? 30 : 0;
      if (m[1]) { // X โมง
        hh = Number(m[1]);
        if ((m[2] || '').toLowerCase() === 'เย็น' && hh <= 6) hh += 12;
      } else {    // X ทุ่ม
        hh = 18 + Number(m[4]); // 1 ทุ่ม = 19
      }
      timeStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
      rm(m[0]);
    }
  }

  // 8) dd/MM หรือ dd/MM HH[:.]mm
  if (!deadline) {
    const m = body.match(/\b(\d{1,2}\/\d{1,2})(?:\s+(\d{1,2})(?::|\.)(\d{2}))?\b/);
    if (m) { deadline = parseNaturalDue(m[0]); rm(m[0]); }
  }

  // 9) สรุป day/time → deadline
  if (!deadline && relDay && timeStr) deadline = parseNaturalDue(`${relDay} ${timeStr}`);
  if (!deadline && timeStr)          deadline = parseNaturalDue(`วันนี้ ${timeStr}`);
  if (!deadline && relDay)           deadline = parseNaturalDue(relDay);

  // กันพลาด: มี "พรุ่งนี้" ใน raw + เรามีเวลา → ใช้พรุ่งนี้
  if (!deadline && timeStr && /(พรุ่งนี้|พรุ้งนี้|พรุงนี้)/i.test(raw)) {
    deadline = parseNaturalDue(`พรุ่งนี้ ${timeStr}`);
  }

  // เลขชั่วโมงเดี่ยว ๆ เช่น "16" → วันนี้ 16:00
  if (!deadline) {
    const m = body.match(/(^|\s)(\d{1,2})(?=\s|$)/);
    if (m) {
      const hh = String(m[2]).padStart(2, '0');
      deadline = parseNaturalDue(`วันนี้ ${hh}:00`);
      body = body.replace(m[0], ' ').trim();
    }
  }


  // ===== ล้าง token วัน/เวลา ที่ยังหลงเหลือใน detail =====
  const scrubbers = [
    /(วันนี้|พรุ่งนี้|พรุ้งนี้|พรุงนี้)/gi,
    /(?:วัน)?(?:อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)(?:นี้|หน้า)(?:\s+(?:บ่าย\s*ครึ่ง|เที่ยง(?:\s*ตรง)?|เที่ยง\s*ครึ่ง|(?:\d{1,2})(?::|\.)\d{2}))?/gi,
    /\b\d{1,2}[:.]\d{2}\b/gi,                 // 09:00 / 9.30
    /เที่ยง\s*ครึ่ง|เที่ยงครึ่ง|เที่ยง(?:\s*ตรง)?/gi,
    /ก่อน\s*บ่าย\s*\d{1,2}(?:[:.]\d{2})?/gi,
    /บ่าย\s*(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|สิบเอ็ด|12|\d{1,2})(?:\s*โมง)?(?:\s*ครึ่ง)?/gi,
    /\d{1,2}\s*โมง(?:\s*(?:เช้า|เย็น))?(?:\s*ครึ่ง)?/gi,
    /\d{1,2}\s*ทุ่ม(?:\s*ครึ่ง)?/gi,
    /\b\d{1,2}\/\d{1,2}(?:\s+\d{1,2}(?::|\.)\d{2})?\b/gi
  ];
  for (const re of scrubbers) body = body.replace(re, ' ');
  body = body.replace(/(^|[\s,;])(ก่อน|ภายใน|นะ|ด้วย)(?=($|[\s,;]))/g, ' ')
             .replace(/\s+/g,' ')
             .trim();

  const detail = body || '-';
  return { assigneeName, detail, deadline, note };
}




function parseRegister(text){
  // รองรับ: ลงทะเบียน / สมัคร / ลงชื่อ / register / signup  + จะมีหรือไม่มี ":" ก็ได้
  const m = text.match(/^(?:ลงทะเบียน|สมัคร|ลงชื่อ|register|signup)\s*[:：]?\s*(.+)$/i);
  if (!m) return null;
  const payload = m[1].trim();

  // ถ้ามี , หรือ | ใช้กติกาเดิม
  if (/[,\|]/.test(payload)) {
    const parts = payload.split(/\s*[,\|]\s*/).map(s => s.trim()).filter(Boolean);
    const [username='', realName='', role=''] = parts;
    return { username, realName, role };
  }

  // เว้นวรรคล้วน: ลงทะเบียน: po ทดสอบ ระบบ [บทบาท]
  const parts = payload.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { username: parts[0] || '', realName: '', role: '' };

  const username = parts[0];
  const maybeRole = parts[parts.length - 1];

  // เลือก “คำท้าย” เป็นบทบาทเมื่อเป็นคำที่รู้จักเท่านั้น (ไม่ต้องมี normalizeRole)
  const isKnownRole = /^(admin|supervisor|developer|dev|user|แอดมิน|หัวหน้า|นักพัฒนา|ผู้ใช้)$/i.test(maybeRole);
  const role = isKnownRole ? maybeRole.toLowerCase() : '';

  const nameTokens = isKnownRole ? parts.slice(1, -1) : parts.slice(1);
  const realName = nameTokens.join(' ');

  return { username, realName, role };
}


function parseAssign(text){
  const m = text.match(/^@([^:：]+)[:：]\s*([\s\S]+)$/);
  if (!m) return null;
  const assigneeName = m[1].trim();
  let body = m[2].trim();
  body = body.replace(/;/g, '|'); // รองรับ ; แทน |

  let deadline = '', note = '';
  body = body.replace(/\|\s*(กำหนดส่ง|due|deadline)[:：]\s*([^\|]+)\s*/i, (_, __, v)=>{ deadline = v.trim(); return ''; });
  body = body.replace(/\|\s*(note|โน้ต|หมายเหตุ)[:：]\s*([^\|]+)\s*/i, (_, __, v)=>{ note = v.trim(); return ''; });

  // แท็กเร่งด่วน/ปกติ
  const urgentInText = /\b(urgent|ด่วน|รีบ)\b/i.test(body) || /\b(urgent|ด่วน|รีบ)\b/i.test(note);
  const normalInText = /\b(normal|ไม่รีบ)\b/i.test(body) || /\b(normal|ไม่รีบ)\b/i.test(note);
  // ใน parseAssign หลังคำนวณ urgentInText/normalInText แล้ว ใส่บรรทัดลบคำออกจาก body
  if (urgentInText) {
    note = note ? `[URGENT] ${note}` : `[URGENT]`;
    body = body.replace(/(ด่วน(ที่สุด|สุด)?|urgent)/ig, ' ');
  }
  if (!urgentInText && normalInText) {
    // เก็บคำเดิมเป็นโน้ต
    note = note ? (note + ' ไม่รีบ') : 'ไม่รีบ';
    body = body.replace(/(ไม่รีบ(?:นะ)?|normal|ค่อยทำ)/ig, ' ');
  }

  // เก็บกวาดฟิลเลอร์
  body = body
    .replace(/(?:^|\s)(นะ|ด้วย)(?=\s|$)/g, ' ')
    .replace(/\s+\|+\s*$/, '')
    .trim();

  const detail = body.trim().replace(/\s+\|+\s*$/,'');
  const nat = parseNaturalDue(deadline);
  return { assigneeName, detail, deadline: nat || deadline, note };
}

function parseStatus(text){
  const m1 = text.match(/^done\s+(TASK_[A-Za-z0-9]+)$/i);
  const m2 = text.match(/^กำลังดำเนินการ\s+(TASK_[A-Za-z0-9]+)$/i);
  if (m1) return { status:'done',  taskId:m1[1] };
  if (m2) return { status:'doing', taskId:m2[1] };
  return null;
}
function parseSetDeadline(text){
  const m = text.match(/^ตั้งกำหนดส่ง\s+(TASK_[A-Za-z0-9]+)[:：]\s*(.+)$/i);
  if (!m) return null;
  return { taskId:m[1], deadline:m[2].trim() };
}
function parseAddNote(text){
  const m = text.match(/^เพิ่มโน้ต\s+(TASK_[A-Za-z0-9]+)[:：]\s*(.+)$/i);
  if (!m) return null;
  return { taskId:m[1], note:m[2].trim() };
}

// --- Edit commands parsers ---
function parseReassign(text){
  const m = text.match(/^เปลี่ยนผู้รับ\s+(TASK_[A-Za-z0-9]+)[:：]\s*@?([^\s]+)\s*$/i);
  if (!m) return null;
  return { taskId: m[1], mention: m[2].trim() };
}
function parseEditDeadline(text){
  const m = text.match(/^แก้เดดไลน์\s+(TASK_[A-Za-z0-9]+)[:：]\s*(.+)$/i);
  if (!m) return null;
  return { taskId: m[1], deadline: m[2].trim() };
}
function parseEditDetail(text){
  const m = text.match(/^แก้รายละเอียด\s+(TASK_[A-Za-z0-9]+)[:：]\s*(.+)$/i);
  if (!m) return null;
  return { taskId: m[1], detail: m[2].trim() };
}

function parseRemind(text){
  const m = text.match(/^(เตือน|remind)\s+(TASK_[A-Za-z0-9]+)$/i);
  return m ? { taskId: m[2] } : null;
}


// แปลงสตริง deadline เป็น timestamp (ms)
// รองรับ ISO / "dd/MM/yyyy" / "dd/MM/yyyy HH:mm"
function parseDeadline(str){
  if (!str) return NaN;
  const s = String(str).trim();

  // 1) ISO หรือรูปแบบที่ Date.parse รองรับอยู่แล้ว
  const t1 = Date.parse(s);
  if (!Number.isNaN(t1)) return t1;

  // 2) dd/MM/yyyy [HH:mm]
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const dd = Number(m[1]), MM = Number(m[2]) - 1, yyyy = Number(m[3]);
    const hh = m[4] ? Number(m[4]) : 0, min = m[5] ? Number(m[5]) : 0;
    return new Date(yyyy, MM, dd, hh, min, 0).getTime();
  }
  return NaN;
}

// ========== Natural deadline helper (อัปเดต) ==========
function parseNaturalDue(s) {
  if (!s) return '';
  s = String(s).trim().toLowerCase();

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const toISO = (d, h = 17, m = 30) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;

  let m;

  // +Nd [HH:mm]
  m = s.match(/^\+(\d+)d(?:\s+(\d{1,2})[:.](\d{2}))?$/i);
  if (m) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(m[1]));
    const hh = m[2] ? Number(m[2]) : 17, mm = m[3] ? Number(m[3]) : 30;
    return toISO(d, hh, mm);
  }

  // วันนี้/พรุ่งนี้ [HH:mm]  (รองรับ 9, 9:00, 9.00, เที่ยง, เที่ยง ครึ่ง/เที่ยงครึ่ง)
  m = s.match(/^(วันนี้|พรุ่งนี้|พรุ้งนี้|พรุงนี้)(?:\s+(บ่าย\s*ครึ่ง|เที่ยง\s*ครึ่ง|เที่ยงครึ่ง|เที่ยง(?:\s*ตรง)?|(\d{1,2})(?:[:.](\d{2}))?))?$/i);

  if (m) {
    const add = /^วันนี้$/i.test(m[1]) ? 0 : 1;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
    let hh = 17, mm = 30;

    if (m[3]) {                      // เลขเวลา เช่น 9 / 9:30 / 09.00
      hh = Number(m[3]);
      mm = Number(m[4] || 0);
    } else if (m[2]) {               // เที่ยง / เที่ยง ครึ่ง
      if (/ครึ่ง/.test(m[2])) { hh = 12; mm = 30; }
      else { hh = 12; mm = 0; }
    }

    return toISO(d, hh, mm);
  }

  // "ก่อนบ่าย 3" / "บ่าย 3[:mm]"
  m = s.match(/^(?:ก่อน)?บ่าย\s*(\d{1,2})(?::(\d{2}))?$/);
  if (m) {
    const hr = Math.min(12 + Number(m[1]), 23);
    const mn = m[2] ? Number(m[2]) : 0;
    return toISO(now, hr, mn);
  }

  // [วันไทย] นี้/หน้า [HH:mm | เที่ยง | เที่ยง ครึ่ง]
  const thaiDays = { 'อาทิตย์':0,'จันทร์':1,'อังคาร':2,'พุธ':3,'พฤหัส':4,'ศุกร์':5,'เสาร์':6 };
  m = s.match(/^(?:วัน)?([ก-๙]+)(นี้|หน้า)(?:\s+(บ่าย\s*ครึ่ง|เที่ยง\s*ครึ่ง|เที่ยงครึ่ง|เที่ยง(?:\s*ตรง)?|(\d{1,2})(?:[:.](\d{2}))?))?$/);
  if (m && m[1] in thaiDays) {
    const target = thaiDays[m[1]], cur = now.getDay();
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7; // ถ้าตรงวันนี้ → สัปดาห์หน้า
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);

    let hh = 17, mm = 30;            // ไม่ระบุเวลา → 17:30
    if (m[3]) {
      if (/เที่ยง/.test(m[3])) {
        if (/ครึ่ง/.test(m[3])) { hh = 12; mm = 30; } else { hh = 12; mm = 0; }
      } else {
        hh = Number(m[4]); mm = Number(m[5] || 0);
      }
    }
    return toISO(d, hh, mm);
  }

  // dd/MM หรือ dd/MM HH[:.]mm (ปีปัจจุบัน)
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2})(?:[:.](\d{2}))?)?$/);
  if (m) {
    const y = now.getFullYear(), mo = Number(m[2]) - 1, da = Number(m[1]);
    const hh = m[3] ? Number(m[3]) : 17, mm = m[4] ? Number(m[4]) : 30;
    return toISO(new Date(y, mo, da), hh, mm);
  }

  // hh[:.]mm เดี่ยว ๆ → วันนี้
  m = s.match(/^(\d{1,2})(?:[:.](\d{2}))$/);
  if (m) {
    return toISO(now, Number(m[1]), Number(m[2]));
  }

  // ตัวเลขชั่วโมงเดี่ยว ๆ → วันนี้ hh:00
  m = s.match(/^(\d{1,2})$/);
  if (m) {
    return toISO(now, Number(m[1]), 0);
  }

  return s; // คืนดิบไปให้ชั้นนอก
}


// --- exports ---
module.exports = {
  parseAssignLoose,
  parseRegister,
  parseAssign,
  parseStatus,
  parseSetDeadline,
  parseAddNote,
  parseReassign,
  parseEditDeadline,
  parseEditDetail,
  parseRemind,
  parseDeadline,
  parseNaturalDue,
};
