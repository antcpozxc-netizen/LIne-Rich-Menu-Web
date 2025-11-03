// myWeb

// server.js
// ==============================
// 0) Config & Imports
// ==============================
require('dotenv').config();

const fs  = require('fs');            // ใช้กับ readFileSync
const fsp = require('fs/promises');   // ใช้กับ await fsp.readFile
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const crypto = require('crypto'); 
const sharp = require('sharp');

const multer = require("multer");
const dotenv = require("dotenv");

const cookie  = require('cookie');


const cron = require('node-cron');


const FormData = require('form-data');

const PDFDocument = require('pdfkit');
dotenv.config();


const { schedule } = require('node-cron');

// ---- LOG HELPER ----
function j(x){ try{ return JSON.stringify(x); }catch{ return String(x); } }
function log(tag, ...args){ console.log(`[${tag}]`, ...args); }
function warn(tag, ...args){ console.warn(`[${tag}]`, ...args); }
function err(tag, ...args){ console.error(`[${tag}]`, ...args); }

// เฉพาะเส้น paygroups reminder: log response body ให้เห็นง่าย
function wrapJsonForRoute(routePath){
  return (req, res, next) => {
    if (!req.path.startsWith(routePath)) return next();
    const _json = res.json.bind(res);
    res.json = (body)=>{ log('RES', req.method, req.path, '→', j(body)); return _json(body); };
    next();
  };
}



const THAI_FONT_REG  = process.env.THAI_FONT_PATH
  ? path.resolve(process.env.THAI_FONT_PATH)
  : path.join(__dirname, 'assets/fonts/NotoSansThai-Regular.ttf');

const THAI_FONT_BOLD = process.env.THAI_FONT_BOLD_PATH
  ? path.resolve(process.env.THAI_FONT_BOLD_PATH)
  : path.join(__dirname, 'assets/fonts/NotoSansThai-Bold.ttf');

  /* === HARD GUARD + LOG === */
const HAVE_REG  = fs.existsSync(THAI_FONT_REG);      // <<< ต้องมีสองบรรทัดนี้
const HAVE_BOLD = fs.existsSync(THAI_FONT_BOLD);

console.log('[PDF font] REG:', THAI_FONT_REG, fs.existsSync(THAI_FONT_REG) ? 'OK' : 'MISSING');
console.log('[PDF font] BOLD:', THAI_FONT_BOLD, fs.existsSync(THAI_FONT_BOLD) ? 'OK' : 'MISSING');

if (!HAVE_REG) {
  // ล้มตั้งแต่เริ่มรัน เพื่อกัน PDF หลุดไปใช้ Helvetica
  throw new Error('THAI_FONT_PATH not found: ' + THAI_FONT_REG);
}
if (!HAVE_BOLD) {
  // ไม่มี Bold ก็ยังไปต่อได้ แต่จะแจ้งเตือนและใช้ Regular แทน
  console.warn('[PDF font] Bold not found, will fallback to Regular:', THAI_FONT_BOLD);
}

// helper ใช้ในทุก route ที่ทำ PDF
// ฟอนต์ไทยสำหรับ PDFKit + fallback
// ฟอนต์ไทยสำหรับ PDFKit + fallback (ใช้ absolute path เสมอ)
function applyThaiFonts(doc) {
  // ใช้ค่าที่คำนวณไว้ตั้งแต่ตอนโหลดไฟล์ (absolute path)
  const pathRegular = THAI_FONT_REG;
  const pathBold    = THAI_FONT_BOLD;

  try {
    doc.registerFont('th', pathRegular);
  } catch (e) {
    console.warn('[PDF font] register "th" failed:', e.message, 'path =', pathRegular);
  }

  let boldOk = false;
  try {
    doc.registerFont('thb', pathBold);
    boldOk = true;
  } catch (e) {
    console.warn('[PDF font] register "thb" failed, fallback to regular:', e.message, 'path =', pathBold);
    try {
      doc.registerFont('thb', pathRegular);
      boldOk = false;
    } catch {}
  }

  // ตั้ง default เป็นฟอนต์ไทย
  try { doc.font('th'); } catch {}

  // helper chain เพื่อเรียกง่าย ๆ ทุกครั้งก่อน text()
  doc.useThai = {
    regular() { try { doc.font('th'); } catch {} return doc; },
    bold()    { try { doc.font('thb'); } catch { try { doc.font('th'); } catch {} } return doc; },
    boldOk
  };
  return doc;
}




const APP_JWT_SECRET = process.env.APP_JWT_SECRET || 'dev-only';

const isProd     = process.env.NODE_ENV === 'production';
const TRUST_PROXY= String(process.env.TRUST_PROXY||'0') === '1';

let ParsersMod = require('./src/core/parsers');

const draftAssign = new Map();

const PARSERS = (ParsersMod && (ParsersMod.default || ParsersMod)) || {};

const {
  parseAssignLoose,
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
} = PARSERS;

// --- sanitize เวลาโดดๆ ที่เหลือค้างหลัง parse (เช่น "11 โมง" → เหลือ "โมง")
const TIME_ORPHAN_RE = /(^|\s)(โมง|ทุ่ม|น\.?|น|am|pm|AM|PM|ครึ่ง)(?=\s|$)/g;
function stripOrphanTimeWords(s) {
  return String(s || '')
    .replace(TIME_ORPHAN_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function sanitizeAssignPayload(p = {}) {
  return {
    ...p,
    detail: stripOrphanTimeWords(p.detail),
    note:   stripOrphanTimeWords(p.note),
  };
}

// fallback เผื่อโปรเจ็กต์ตั้งชื่อเป็น register()
const parseRegister = PARSERS.parseRegister || PARSERS.register;

// ✅ guard: ถ้า export มาไม่ถูก ให้หยุดพร้อมบอกคีย์ที่มี
if (typeof parseRegister !== 'function') {
  console.error('[BOOT] parsers available keys =', Object.keys(PARSERS));
  throw new Error('parsers.parseRegister is not a function — ตรวจว่า parsers.js ได้ module.exports ฟังก์ชันเหล่านี้แล้ว');
}

// Node 18+ has global fetch; fallback to node-fetch for older envs
// Node 18+ มี global fetch; fallback ไป node-fetch ถ้าไม่มี
const fetchFn = async (...args) => {
  if (typeof global.fetch === 'function') return global.fetch(...args);
  const { default: fetch } = await import('node-fetch');
  return fetch(...args);
};

let _sharp = null;
try {
  _sharp = require('sharp'); // ต้องได้เป็นฟังก์ชัน
  if (typeof _sharp !== 'function') {
    console.warn('[IMG] unexpected sharp export type:', typeof _sharp);
    _sharp = null;
  }
} catch (e) {
  console.warn('[IMG] sharp not available, image compression disabled:', String(e && e.message || e));
}

const app = express();
const IAPP_KEY = process.env.IAPP_API_KEY;
const upload = multer({ storage: multer.memoryStorage() });
app.set('trust proxy', 1);



if (TRUST_PROXY) app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Build base/callback URLs once, then reuse everywhere
const BASE_APP_URL = ((process.env.PUBLIC_APP_URL || `http://localhost:${PORT}`) + '')
  .trim()
  .replace(/\/$/, '');
const REDIRECT_URI = ((process.env.LINE_LOGIN_CALLBACK_URL || `${BASE_APP_URL}/auth/line/callback`) + '').trim();


// [STEP9:CONFIG] — ที่อยู่รูป (อัปโหลดไฟล์ไปที่โฟลเดอร์ public/static หรือ Storage แล้วใส่ URL ตรงนี้)
const TASKMENU_MAIN_IMAGE   = process.env.TASKMENU_MAIN_IMAGE   || `${BASE_APP_URL}/static/Rich_menu_for_registered.png`;
const TASKMENU_PREREG_IMAGE = process.env.TASKMENU_PREREG_IMAGE || `${BASE_APP_URL}/static/Menu_for_non_register.png`;


// --- RAW BODY สำหรับ LINE WEBHOOK (สำคัญมาก: เฉพาะเส้นนี้) ---
const webhookRaw = express.raw({ type: '*/*' });

const DEBUG_WEBHOOK = String(process.env.DEBUG_WEBHOOK || '').toLowerCase() === '1'
                   || String(process.env.DEBUG_WEBHOOK || '').toLowerCase() === 'true';


let db;


// ใส้ส่วนนี้ไว้ใกล้ๆ ตัวแปร config อื่นๆ

const SESSION_COOKIE_NAME = 'sess'; // ให้เหมือนโปรเจกต์แรก

function setSessionCookie(res, payload, days = 7) {
  const token = jwt.sign(payload, APP_JWT_SECRET, { expiresIn: `${days}d` });
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    maxAge: days * 24 * 60 * 60
  };
  // ใช้ผ่าน ngrok/https → ถือว่าเป็น third-party context บางกรณี (LINE)
  cookieOpts.secure   = true;
  cookieOpts.sameSite = 'none';
  res.setHeader('Set-Cookie', cookie.serialize(SESSION_COOKIE_NAME, token, cookieOpts));
}

function readSession(req) {
  const cookies = String(req.headers.cookie || '');
  // รองรับทั้ง sess (ใหม่) และ sid (เก่า) — กันของเก่ายังล็อกอินอยู่
  const rawSess = cookies.split(';').find(c => c.trim().startsWith('sess='));
  const rawSid  = cookies.split(';').find(c => c.trim().startsWith('sid='));
  const raw = rawSess || rawSid;
  if (!raw) return null;
  const token = decodeURIComponent(raw.split('=')[1]);
  try { return jwt.verify(token, APP_JWT_SECRET); } catch { return null; }
}

// ===== Middlewares: AuthN / AuthZ =====
function requireAuth(req, res, next) {
  // อ่านเซสชันครั้งเดียว
  const u = req.user || readSession(req) || null;

  if (!u) {
    console.warn('[GUARD/AUTH/NO_SESSION]', {
      path: req.path,
      ua: req.get('user-agent'),
      cookies: Object.keys(req.cookies || {}),
    });
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }

  // normalize เก็บกลับลง req.user ให้ตัวต่อไปใช้ได้เสมอ
  req.user = {
    ...u,
    role: String(u.role || 'user').trim().toLowerCase(),
    status: String(u.status || 'Active').trim(),
  };

  // กันบัญชีไม่ Active ตั้งแต่ชั้น auth (ปิดได้ถ้าไม่ต้องการ)
  if (req.user.status !== 'Active') {
    console.warn('[GUARD/AUTH/INACTIVE]', {
      path: req.path,
      uid: req.user.uid,
      tenant: req.user.tenant,
      status: req.user.status,
    });
    return res.status(403).json({ ok: false, error: 'INACTIVE_USER' });
  }

  return next();
}

function requireRole(roles = []) {
  const allows = (Array.isArray(roles) ? roles : [roles])
    .map(r => String(r).trim().toLowerCase());

  return (req, res, next) => {
    // ใช้ req.user ถ้ามี ไม่งั้นอ่านจากเซสชันแล้ว normalize
    const u = req.user || readSession(req) || null;
    if (!u) {
      console.warn('[GUARD/ROLE/NO_SESSION]', { path: req.path, need: allows });
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    req.user = {
      ...u,
      role: String(u.role || 'user').trim().toLowerCase(),
      status: String(u.status || 'Active').trim(),
    };

    // เพิ่มกันสถานะไม่ Active ที่ชั้น role ด้วย (เผื่อมี route ข้าม requireAuth มา)
    if (req.user.status !== 'Active') {
      console.warn('[GUARD/ROLE/INACTIVE]', {
        path: req.path, role: req.user.role, status: req.user.status, need: allows
      });
      return res.status(403).json({ ok: false, error: 'INACTIVE_USER' });
    }

    if (!allows.includes(req.user.role)) {
      console.warn('[GUARD/ROLE/DENY]', {
        path: req.path,
        role: req.user.role,
        need: allows,
        tenant: req.user.tenant,
        uid: req.user.uid,
      });
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }

    return next();
  };
}


const GAS_ROLE_TIMEOUT_MS = 2500;

function withTimeout(p, ms, label='') {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms))
  ]);
}

// cache 30 วินาที ต่อ tenant+uid
const _roleCache = new Map(); // key -> {role, exp}
function getRoleCacheKey(tenantId, uid){ return `${tenantId}::${uid}`; }
function stashRole(tenantId, uid, role){
  _roleCache.set(getRoleCacheKey(tenantId, uid), { role, exp: Date.now()+30_000 });
}
function readRole(tenantId, uid){
  const r = _roleCache.get(getRoleCacheKey(tenantId, uid));
  if (r && r.exp > Date.now()) return r.role;
  return null;
}

// ---- tenant attendance config helper (used by getRoleSafe) ----
async function getTenantCfg(tenantId) {
  try {
    const tenantRef = db.collection('tenants').doc(tenantId);
    const snap = await tenantRef.collection('integrations').doc('attendance').get();

    // sheetId: รับทั้งค่าบน Firestore และ fallback ไป .env (คีย์ใหม่/เก่า)
    const appsSheetId = String(
      snap.get('appsSheetId') ||
      process.env.TA_SHEET_ID ||            // คีย์เก่า (ยังเผื่อไว้)
      process.env.APPS_SHEET_ID ||          // เผื่อมีตั้งชื่อแบบนี้
      ''
    ).trim();

    // GAS URL: รองรับหลายชื่อฟิลด์ + env ใหม่
    const gasUrl = String(
      snap.get('gasUrl') ||                 // โปรเจ็กต์เก่า
      snap.get('endpoint') ||               // บางที่ใช้ endpoint
      snap.get('execUrl') ||                // ถ้าไปเซฟชื่อ execUrl
      process.env.APPS_SCRIPT_EXEC_URL_TA ||// ✅ คีย์ใหม่ (ที่คุณตั้งไว้)
      ''
    ).trim();

    // sharedKey: อ่านจากไฟล์/Firestore + env ใหม่
    const sharedKey = String(
      snap.get('sharedKey') ||
      process.env.APPS_SCRIPT_SHARED_KEY_TA || // ✅ คีย์ใหม่
      process.env.APPS_SCRIPT_SHARED_KEY ||    // เผื่อคีย์กลาง
      process.env.APPS_SCRIPT_KEY ||           // เผื่อคีย์เก่า
      ''
    ).trim();

    return { appsSheetId, gasUrl, sharedKey };
  } catch (e) {
    // fallback จาก .env เพื่อไม่ให้ล่ม
    return {
      appsSheetId: String(
        process.env.TA_SHEET_ID || process.env.APPS_SHEET_ID || ''
      ).trim(),
      gasUrl: String(
        process.env.process.env.APPS_SCRIPT_EXEC_URL_TA || ''
      ).trim(),
      sharedKey: String(
        process.env.APPS_SCRIPT_SHARED_KEY_TA || ''
      ).trim(),
    };
  }
}



async function getRoleSafe(tenantId, lineUserId){
  const hit = readRole(tenantId, lineUserId);
  if (hit) return hit;
  try {
    const r = await withTimeout(
      callTA(tenantId, 'get_role', { lineUserId }),
      GAS_ROLE_TIMEOUT_MS,
      'get_role'
    );
    const role = (r && (r.role || r.data?.role)) || 'user';
    stashRole(tenantId, lineUserId, role);
    return role;
  } catch (e) {
    console.warn('[getRoleSafe]', String(e));
    // fallback เป็น user แล้วค่อยให้ไปเช็คสิทธิ์ต่อในหน้า LIFF อีกชั้น
    return 'user';
  }
}


// ===== mini cache to tame repeated GAS calls =====
const TA_CACHE = new Map();          // key -> { expires, data }
const TA_INFLIGHT = new Map();       // key -> Promise

const TA_CACHE_TTL = {
  get_role:        60_000,  // 1 นาที (สิทธิ์ไม่เปลี่ยนบ่อย)
  list_employees:  10_000,  // 10 วิ
  list_work_logs:   8_000,  // 8 วิ (ขึ้นกับช่วงวันที่)
  pg_list:         30_000,  // 30 วิ
  pg_get:          30_000,  // 30 วิ
};

function taKey(tenantId, action, payload) {
  const shallow = { ...(payload || {}) };
  // ตัด noise ไม่ทำให้ผลเปลี่ยน
  delete shallow.actor;
  delete shallow.ts;
  return `${tenantId}:${action}:${JSON.stringify(shallow)}`;
}
function taCacheGet(key) {
  const rec = TA_CACHE.get(key);
  if (!rec) return null;
  if (Date.now() > rec.expires) { TA_CACHE.delete(key); return null; }
  return rec.data;
}
function taCacheSet(key, data, ttlMs) {
  if (!ttlMs) return;
  TA_CACHE.set(key, { expires: Date.now() + ttlMs, data });
}
function withInflight(key, factory) {
  if (TA_INFLIGHT.has(key)) return TA_INFLIGHT.get(key);
  const p = (async () => {
    try { return await factory(); }
    finally { TA_INFLIGHT.delete(key); }
  })();
  TA_INFLIGHT.set(key, p);
  return p;
}


// ---- Apps Script (Time Attendance) proxy helpers ----
// เพิ่ม log ให้ละเอียดสำหรับการเรียก GAS/TA
async function callTA(tenantId, action, payload = {}, timeoutMs = 12_000) {
  // helpers (เฉพาะในฟังก์ชันนี้)
  const t0 = Date.now();
  const j = (x) => { try { return JSON.stringify(x); } catch { return String(x); } };
  const trim300 = (s) => String(s || '').slice(0, 300);

  console.log('[GAS/TA]', 'tenant=', tenantId, 'action=', action, 'timeoutMs=', timeoutMs);

  const cfg = await getTenantCfg(tenantId).catch((e) => {
    console.error('[GAS/TA] getTenantCfg error', e);
    return null;
  });

  const sheetId   = cfg?.appsSheetId || '';
  const url       = (cfg?.gasUrl || '').trim();
  const sharedKey = (
    (cfg && cfg.sharedKey) ||
    process.env.APPS_SCRIPT_SHARED_KEY_TA ||
    process.env.APPS_SCRIPT_SHARED_KEY ||
    process.env.APPS_SCRIPT_KEY ||
    ''
  ).trim();

  console.log('[GAS/TA] cfg flags', {
    hasSheetId: !!sheetId,
    hasUrl: !!url,
    hasSharedKey: !!sharedKey,
  });

  if (!sheetId || !url) {
    console.warn('[GAS/TA] missing config for tenant', tenantId, { sheetId, url });
    return { ok: false, error: 'tenant_no_gas' };
  }

  // ---- cache + inflight dedupe ----
  const key = taKey(tenantId, action, payload);
  const ttl = TA_CACHE_TTL[action] || 0;

  if (ttl) {
    const hit = taCacheGet(key);
    if (hit) {
      console.log('[GAS/TA/CACHE] HIT', 'key=', key, 'ttl=', ttl, 'elapsedMs=', Date.now() - t0);
      return hit;
    }
  }

  const doFetch = async () => {
    // แนบ sharedKey (ไม่ log ค่า key จริง)
    const body = { action, sheetId, ...(sharedKey ? { sharedKey } : {}), ...payload };
    const bodyForLog = { ...body };
    if ('sharedKey' in bodyForLog) bodyForLog.sharedKey = '***';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res, text, json;
    try {
      const bodyStr = JSON.stringify(body);
      console.log('[GAS/TA→]', 'POST', url, 'bodyLen=', bodyStr.length, 'body=', trim300(j(bodyForLog)));

      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
        signal: controller.signal,
      });

      // อ่านเป็น text ก่อนเพื่อ log ได้เสมอ แล้วค่อยพยายาม parse
      text = await res.text();
      console.log('[GAS/TA←]', 'status=', res.status, 'ms=', Date.now() - t0, 'body=', trim300(text));

      try { json = text ? JSON.parse(text) : {}; } catch {
        json = { ok: false, error: 'invalid_json', raw: trim300(text) };
      }
    } catch (e) {
      console.error('[GAS/TA] fetch error', action, e?.name || e?.message || String(e));
      return { ok: false, error: e?.name === 'AbortError' ? 'fetch_timeout' : 'fetch_error' };
    } finally {
      clearTimeout(timer);
    }

    const out = (res && res.ok && json) ? json : { ok: false, error: json?.error || `gas_${res?.status || 'fail'}` };

    if (ttl && out?.ok !== false) {
      taCacheSet(key, out, ttl);
      console.log('[GAS/TA/CACHE] SET', 'key=', key, 'ttl=', ttl);
    }
    console.log('[GAS/TA] done', 'action=', action, 'ok=', out?.ok !== false, 'elapsedMs=', Date.now() - t0);
    return out;
  };

  if (!ttl) {
    return doFetch();
  }

  // ถ้ากำลังยิงคีย์เดียวกันอยู่ ให้รออันเดิม
  console.log('[GAS/TA/INFLIGHT] key=', key);
  return withInflight(key, async () => {
    const r = await doFetch();
    console.log('[GAS/TA/INFLIGHT] resolved key=', key);
    return r;
  });
}




// --- Helper: ตรวจสิทธิ์ admin/owner ของ tenant ผ่าน Apps Script + Fallback Firestore ---
async function canAdminForTenant(tenantId, lineUserId) {
  if (!tenantId || !lineUserId) return false;

  // 1) พยายามถาม Apps Script ก่อน (ใช้ action: get_role ที่เพิ่งทำไว้)
  try {
    const r = await callTA(tenantId, 'get_role', { lineUserId });
    const role = String(r?.role || '').toLowerCase();
    if (role === 'owner' || role === 'admin') return true;
  } catch (_) {
    // no-op, ไป fallback ต่อ
  }

  // 2) Fallback: เผื่อมี role ใน Firestore (ถ้ามี collection นี้อยู่ในโปรเจกต์)
  try {
    const doc = await db
      .collection('tenants').doc(tenantId)
      .collection('roles').doc(lineUserId).get();

    const role = String(doc.exists ? (doc.data().role || '') : '').toLowerCase();
    if (role === 'owner' || role === 'admin') return true;
  } catch (_) {
    // ignore
  }

  // 3) (ทางเลือก) เปิด bypass ตอน dev ได้ ถ้าต้องการ
  if (process.env.SKIP_ADMIN_CHECK === '1') return true;

  return false;
}



// ดึงบทบาทจาก GAS (roles sheet → fallback employees.role)
async function getRoleViaGAS(tenantId, lineUserId) {
  if (!tenantId || !lineUserId) throw new Error('tenantId/lineUserId required');
  const r = await callTA(tenantId, 'get_role', { lineUserId });
  if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
  // r.role จะเป็น 'owner' | 'admin' | 'user' (ตัวพิมพ์เล็ก)
  return { role: r.role || 'user' };
}

// --- Simple in-memory cache for role lookups (TTL 2 minutes)
 // key -> { role, exp }
function _roleKey(tenantId, userId) { return `${tenantId}:${userId}`; }

async function getRoleCached(tenantId, userId) {
  try {
    const key = _roleKey(tenantId, userId);
    const hit = _roleCache.get(key);
    if (hit && hit.exp > Date.now()) return hit.role;

    const r = await getRoleViaGAS(tenantId, userId); // ใช้ฟังก์ชันเดิมของคุณ
    const role = (r && r.role) ? r.role : 'user';

    _roleCache.set(key, { role, exp: Date.now() + 120_000 }); // 120 วินาที
    return role;
  } catch (e) {
    // ถ้าพัง ให้ fallback เป็น 'user' (หรือ 'owner' ตามนโยบายของคุณ)
    return 'user';
  }
}

const _idem = new Map();
function _idemKey(req) {
  // ให้ client ส่ง x-idempotency-key หรือ body.idempotencyKey มาก็ได้
  const h = String(req.headers['x-idempotency-key'] || req.body?.idempotencyKey || '');
  if (h) return h;
  // fallback: สร้างจาก tenant + path + jobs ที่เลือก (ไม่รวมตัวเลขสุ่ม)
  const body = req.body || {};
  const minJobs = Array.isArray(body.jobs)
    ? body.jobs.map(j => ({
        u: j.lineUserId, s: j.periodStart, e: j.periodEnd,
        m: Number(j?.adjustments?.minus || 0),
        p: Number(j?.adjustments?.plus  || 0)
      }))
    : [];
  return crypto.createHash('sha1')
    .update(JSON.stringify({ t: req.params?.id, path: req.path, jobs: minJobs }))
    .digest('hex');
}
function _idemGet(key) {
  const v = _idem.get(key);
  if (!v) return null;
  if (Date.now() - v.at > 30_000) { _idem.delete(key); return null; }
  return v.data;
}
function _idemSet(key, data) { _idem.set(key, { at: Date.now(), data }); }
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _idem.entries()) if (now - v.at > 60_000) _idem.delete(k);
}, 60_000);


// === LINE push helper ===
async function pushLineFlex(tenantRef, to, altText, bubble) {
  try {
    const accessToken = await getTenantSecretAccessToken(tenantRef);
    await fetchFn('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to,
        messages: [{ type: 'flex', altText, contents: bubble }]
      })
    });
  } catch (e) {
    console.warn('[PUSH] fail', e?.message || e);
  }
}

// === card builders ===
// 1) Payslip card (ส่งให้พนักงาน)
function buildPayslipCard({ month, employeeName, netPay, pdfUrl, actorName }) {
  const alt = `สลิปเงินเดือน ${employeeName} (${month})`;
  const bubble = {
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '16px',
      contents: [
        { type: 'text', text: 'สลิปเงินเดือน', weight: 'bold', size: 'lg' },
        { type: 'text', text: `เดือน ${month}`, color: '#64748B', size: 'sm' }
      ]
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        { type: 'box', layout: 'baseline', contents: [
          { type: 'text', text: 'พนักงาน', size: 'sm', color: '#64748B', flex: 3 },
          { type: 'text', text: employeeName || '-', size: 'sm', weight: 'bold', flex: 5, wrap: true }
        ]},
        { type: 'box', layout: 'baseline', contents: [
          { type: 'text', text: 'สุทธิ', size: 'sm', color: '#64748B', flex: 3 },
          { type: 'text', text: Number(netPay||0).toLocaleString(undefined,{maximumFractionDigits:2}) + ' บาท', size: 'sm', weight: 'bold', flex: 5 }
        ]},
        { type: 'separator', margin: 'md' },
        { type: 'text', text: `สร้างโดย ${actorName||'-'}`, size: 'xs', color: '#94A3B8' },
        { type: 'text', text: new Date().toLocaleString('th-TH'), size: 'xs', color: '#94A3B8' }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        { type: 'button', style: 'primary',
          action: { type: 'uri', label: 'เปิดสลิป (PDF)', uri: pdfUrl } }
      ]
    },
    styles: { header: { backgroundColor: '#F1F5FF' } }
  };
  return { alt, bubble };
}

// 2) Payroll/Report CSV card (ส่งให้ owner)
function buildReportCard({ title, month, fileName, fileUrl, actorName }) {
  const alt = `${title} (${month})`;
  const bubble = {
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '16px',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'lg' },
        { type: 'text', text: `เดือน ${month}`, color: '#64748B', size: 'sm' }
      ]
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        { type: 'box', layout: 'baseline', contents: [
          { type: 'text', text: 'ไฟล์', size: 'sm', color: '#64748B', flex: 3 },
          { type: 'text', text: fileName || '-', size: 'sm', weight: 'bold', flex: 5, wrap: true }
        ]},
        { type: 'separator', margin: 'md' },
        { type: 'text', text: `สร้างโดย ${actorName||'-'}`, size: 'xs', color: '#94A3B8' },
        { type: 'text', text: new Date().toLocaleString('th-TH'), size: 'xs', color: '#94A3B8' }
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        { type: 'button', style: 'primary',
          action: { type: 'uri', label: 'เปิดไฟล์', uri: fileUrl } }
      ]
    },
    styles: { header: { backgroundColor: '#F1F5FF' } }
  };
  return { alt, bubble };
}


// IAPP OCR Proxy: รับไฟล์จากฟรอนต์ → ส่งต่อไป IAPP → map 4 ฟิลด์กลับมา
app.post('/api/ocr/iapp', upload.single('file'), async (req, res) => {
  try {
    if (!IAPP_KEY) return res.status(500).json({ ok:false, error:'Missing IAPP_API_KEY' });
    if (!req.file)  return res.status(400).json({ ok:false, error:'no file' });

    // 1) เตรียมภาพ: พยายาม re-encode ด้วย sharp; ถ้าพัง ให้ใช้บัฟเฟอร์เดิม
    let imgBuf = req.file.buffer;
    try {
      imgBuf = await sharp(req.file.buffer, { failOn: 'none' }) // กันเคส JPEG มี bytes เกิน
        .rotate()                                               // หมุนตาม EXIF
        .toFormat('jpeg', { quality: 92 })
        .toBuffer();
    } catch (e) {
      console.warn('[IAPP OCR] sharp failed, use original buffer:', e.message);
      imgBuf = req.file.buffer; // fallback
    }

    // 2) ส่งขึ้น IAPP ด้วย form-data (ของแพ็กเกจ form-data)
    const fd = new FormData();
    fd.append('file', imgBuf, { filename: 'idcard.jpg', contentType: 'image/jpeg' });

    const upstream = await fetch('https://api.iapp.co.th/thai-national-id-card/v3.5/front', {
      method: 'POST',
      headers: { apikey: IAPP_KEY, ...fd.getHeaders() },
      body: fd
    });

    // ถ้า IAPP ตอบ non-200 ให้ลองอ่านข้อความ error
    if (!upstream.ok) {
      const txt = await upstream.text().catch(()=> '');
      return res.status(502).json({ ok:false, error:`IAPP ${upstream.status}`, detail: txt?.slice(0,500) });
    }

    const payload = await upstream.json().catch(() => ({}));
    const o = payload?.data || payload || {};

    /* ---------- helpers ---------- */
    const TH_MONTH = {
      'ม.ค.':1,'ก.พ.':2,'มี.ค.':3,'เม.ย.':4,'พ.ค.':5,'มิ.ย.':6,'ก.ค.':7,'ส.ค.':8,'ก.ย.':9,'ต.ค.':10,'พ.ย.':11,'ธ.ค.':12,
      'มกราคม':1,'กุมภาพันธ์':2,'มีนาคม':3,'เมษายน':4,'พฤษภาคม':5,'มิถุนายน':6,'กรกฎาคม':7,'สิงหาคม':8,'กันยายน':9,'ตุลาคม':10,'พฤศจิกายน':11,'ธันวาคม':12
    };
    const EN_MONTH = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const mapThaiDigits = s => String(s||'').replace(/[๐-๙]/g, ch => '๐๑๒๓๔๕๖๗๘๙'.indexOf(ch));
    const firstNonEmpty = arr => (arr || []).find(v => v === 0 || (v !== undefined && v !== null && String(v).trim() !== '')) ?? '';

    function normalizeBirthDate(s) {
      if (!s) return '';
      const txt = mapThaiDigits(String(s).trim());

      // 6 พ.ค. 2544 / 6 พฤษภาคม 2544
      let m = txt.match(/(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*(\d{2,4})/);
      if (m) {
        const d = +m[1], mo = TH_MONTH[m[2]] || 0, y = +m[3];
        const yyyy = y > 2400 ? y - 543 : y;
        if (mo) return `${String(yyyy).padStart(4,'0')}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      }

      // 6 May 2001
      m = txt.match(/(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*(\d{4})/i);
      if (m) {
        const d = +m[1], y = +m[3], mo = EN_MONTH[m[2].toLowerCase().slice(0,3)] || 0;
        if (mo) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      }

      // 06/05/2544 หรือ 06-05-2001
      m = txt.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
      if (m) {
        const d = +m[1], mo = +m[2], y = +m[3];
        const yyyy = y > 2400 ? y - 543 : (y < 100 ? y + 2000 : y);
        return `${String(yyyy).padStart(4,'0')}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      }
      return '';
    }

    /* ---------- mapping: ยึดตามคีย์ที่ IAPP ส่งจริง ---------- */

    // 1) Citizen ID
    let nid = firstNonEmpty([
      o.id_number, o.idNumber, o.citizen_id, o.citizenId, o.cid, o.nid,
      o.identification_number, o.identificationNumber,
      (o.id_number_with_dash || o.idNumberWithDash || '').replace?.(/\D/g,''),
      (o.id_number_without_dash || o.idNumberWithoutDash || '').replace?.(/\D/g,'')
    ]);
    nid = String(nid || '').replace(/\D/g,'');

    // 2) Full name (TH) – จาก th_init + th_fname + th_lname หรือ th_name
    const thInit  = firstNonEmpty([ o.th_init,  o.name_prefix_th, o.th_prefix, o.prefix_th ]);
    const thFirst = firstNonEmpty([ o.th_fname, o.th_firstname, o.firstname_th, o.given_name_th, o.first_name_th ]);
    const thLast  = firstNonEmpty([ o.th_lname, o.th_lastname, o.lastname_th, o.family_name_th, o.last_name_th, o.surname_th ]);

    let fullName = firstNonEmpty([
      o.th_name,                      // ถ้า IAPP รวมให้แล้ว
      o.fullname_th, o.name_th_full, o.name_th,
      [thInit, thFirst, thLast].filter(Boolean).join(' ')
    ]).replace(/\s{2,}/g,' ').trim();

    // 3) Address (TH) – ใช้ home_address ก่อน แล้วค่อย fallback ประกอบเอง
    let idAddress = firstNonEmpty([
      o.address_th, o.th_address, o.idcard_address_th, o.address, o.address_full_th,
      o.home_address
    ]);
    if (!idAddress) {
      const parts = [
        firstNonEmpty([o.house_no]),
        firstNonEmpty([o.road]),
        firstNonEmpty([o.lane]),         // ซอย/ตรอก
        firstNonEmpty([o.sub_district]), // แขวง/ตำบล
        firstNonEmpty([o.district]),     // เขต/อำเภอ
        firstNonEmpty([o.province]),
        firstNonEmpty([o.postal_code]),
      ].filter(Boolean);
      idAddress = parts.join(' ').replace(/\s{2,}/g,' ').trim();
    }

    // 4) Birth date – รองรับทั้งไทยและอังกฤษ
    const birthRaw = firstNonEmpty([
      o.th_dob, o.birth_date_th, o.date_of_birth_th, o.birthday_th,
      o.en_dob, o.birth_date, o.date_of_birth, o.birthday_en, o.birth_date_en
    ]);
    const birthDate = normalizeBirthDate(birthRaw);

    return res.json({
      ok: true,
      data: {
        nationalId: nid || '',
        fullName:   (fullName || '').trim(),
        idAddress:  (idAddress || '').trim(),
        birthDate:  birthDate || '',
        raw: {
          rawNid:   nid || '',
          rawName:  fullName || '',
          rawBirth: birthRaw || '',
          rawAddr:  idAddress || '',
          upstream: o
        }
      }
    });
  } catch (e) {
    console.error('[IAPP OCR] error', e);
    return res.status(500).json({ ok:false, error: e.message || 'IAPP OCR failed' });
  }
});



function remapOldNext(n) {
  if (!n || typeof n !== 'string') return '/app';
  // ตัวอย่าง mapping เดิม → ใหม่
  if (n === '/admin/users-split') return '/app/admin/users-split';
  if (n.startsWith('/admin/'))    return n.replace(/^\/admin\//, '/app/admin/');
  return n; // อย่างอื่นปล่อยผ่าน
}


app.disable('x-powered-by');

// === Security headers (allow LINE webview + avoid WKWebView COOP/COEP bug) ===
app.use((req, res, next) => {
  // ไม่บังคับ X-Frame-Options (Safari/iOS ไม่รองรับ ALLOW-FROM)
  res.removeHeader('X-Frame-Options');

  const ua = String(req.headers['user-agent'] || '');
  const isLine = /\bLine\/\d/i.test(ua);
  const isIOS  = /\biPhone|iPad|iPod|iOS/i.test(ua);
  const isIOSLine = isLine && isIOS;

  // อนุญาตให้ถูกฝังจาก LINE domains (อย่าแตะ script-src เพื่อไม่บล็อค bundle)
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.line.me https://*.liff.line.me https://*.line-apps.com https://*.line-scdn.net"
  );

  // ปิด COOP/COEP เฉพาะ LINE iOS (WKWebView มีบั๊กทำให้ JS ไม่ execute)
  if (isIOSLine) {
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Embedder-Policy');
  } else {
    // นอก LINE: COOP แบบอ่อน ๆ (ถ้าไม่ต้องใช้ SAB ไม่ต้องตั้ง COEP)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.removeHeader('Cross-Origin-Embedder-Policy');
  }

  // กัน content sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  next();
});



// 1) หน้า auto-submit (ไม่ตั้งคุกกี้ใน GET)
// === MAGIC LINK: ตั้งคุกกี้ session + ส่ง custom token กลับให้ AuthGate ===
app.get('/auth/magic', async (req, res) => {
  try {
    const base   = (process.env.PUBLIC_APP_URL || BASE_APP_URL || '').replace(/\/$/, '');
    const tRaw   = String(req.query.t || '');        // magic token จาก OA
    const tenant = String(req.query.tenant || '');   // tenant id (สำรอง)
    const nextQ  = String(req.query.next || '/app'); // ปลายทางหลัง login (raw)
    const trace  = String(req.query.trace || '0') === '1';

    console.log('[MAGIC/AUTH/BEGIN]', {
      tenant_query: tenant,
      nextQ,
      ua: req.get('user-agent')
    });

    if (!tRaw) return res.status(400).send('missing magic token');

    // 1) ตรวจสอบ magic token => ได้ payload (uid, name, role, tenant, picture…)
    let payload;
    try {
      payload = jwt.verify(tRaw, APP_JWT_SECRET);
    } catch (e) {
      console.error('[MAGIC/AUTH/BAD_TOKEN]', e?.message || e);
      return res.status(400).send('bad magic token');
    }

    const uidRaw  = String(payload.uid || '');
    if (!uidRaw) return res.status(400).send('bad magic token');

    const role    = String(payload.role || 'user').trim().toLowerCase();
    const name    = payload.name || payload.username || '';
    const tokTid  = String(payload.tenant || '').trim();
    const qTid    = tenant.trim();
    const tid     = tokTid || qTid || '';
    const picture = payload.picture || '';

    console.log('[MAGIC/AUTH/PAYLOAD]', {
      tenant_from_token: tokTid,
      tenant_query: qTid,
      tenant_final: tid,
      uid: uidRaw,
      role
    });

    // 2) กัน tenant mismatch ชัดเจน
    if (qTid && tokTid && qTid !== tokTid) {
      console.warn('[MAGIC/AUTH/TENANT_MISMATCH]', { tenant_query: qTid, tenant_from_token: tokTid });
      return res.status(401).send('tenant mismatch');
    }

    // 3) ตั้งคุกกี้ session สำหรับ REST API (/api/**)
    //    หมายเหตุ: ให้ setSessionCookie ภายในตั้งค่า { secure:true, sameSite:'None', path:'/' } ใน prod
    await setSessionCookie(res, { uid: uidRaw, role, name, tenant: tid }, 7);

    // 4) ออก Firebase Custom Token สำหรับ client
    const uidForFirebase = uidRaw.startsWith('line:') ? uidRaw : `line:${uidRaw}`;
    const customToken = await admin.auth().createCustomToken(uidForFirebase, {
      role, name, tenant: tid, ...(picture ? { picture } : {}),
    });

    // 5) sanitize next + ลดสิทธิ์เส้นทางถ้า role ไม่ถึง
    const isInternalPath = /^\/[a-zA-Z0-9/_-]*/.test(nextQ);
    const safeNext       = isInternalPath ? nextQ : '/app';
    const isAdminLike    = ['developer','admin','supervisor'].includes(role);
    const dest           = (!isAdminLike && safeNext.startsWith('/app/admin'))
      ? '/app'
      : safeNext;

    // 6) redirect → ส่ง custom token ทาง query (?mt=) + กัน iOS ดรอป hash
    const u = new URL(dest, base);
    u.searchParams.set('mt', customToken);
    u.searchParams.set('next', dest);
    if (trace) u.searchParams.set('trace', '1');

    // ⭐ สำคัญ: log URL ที่จะ redirect "ทุกครั้ง" (จะได้เห็นว่ามี ?mt= จริง)
    console.log('[MAGIC/AUTH/URL]', u.toString());

    // กัน cache/redirect แคชค้างบน iOS WebView
    res.set('Cache-Control', 'no-store');

    // ใช้ 302 ชัดเจน
    return res.redirect(302, u.toString());


  } catch (e) {
    console.error('[MAGIC/AUTH/ERR]', e?.message || e);
    return res.status(500).send('magic failed');
  }
});




// 2) Consume → set cookie → issue Firebase customToken → redirect ไปหน้าใหม่
// === Magic link (legacy form) -> consume & redirect (with logs) ===
app.post('/auth/magic/consume', express.urlencoded({ extended: false }), async (req, res) => {
  const tRaw   = String(req.body.t || '');
  const tenant = String(req.body.tenant || '');
  const next   = String(req.body.next || '/app');

  const trace  = String(req.body.trace || req.query.trace || ''); // เผื่อยิงผ่าน query
  const started = Date.now();

  const base = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');

  console.log('[CONSUME/HIT]', {
    hasT: !!tRaw,
    tenant,
    next,
    host: req.headers.host || '',
    referer: req.headers.referer || '',
    PUBLIC_APP_URL: base
  });

  let payload = null;
  try {
    payload = jwt.verify(tRaw, APP_JWT_SECRET);
    console.log('[CONSUME] jwt ok', {
      uid: payload?.uid || payload?.user_id,
      role: payload?.role,
      tenantInToken: payload?.tenant || payload?.tid,
      exp: payload?.exp
    });
  } catch (e) {
    console.error('[CONSUME] jwt invalid:', e?.message || e);
    return res.status(401).send('Invalid or expired magic link');
  }

  const session = {
    uid:    payload.uid,
    name:   payload.name || payload.username || '',
    role:   String(payload.role || 'user').toLowerCase(),
    tenant: tenant || payload.tenant || ''
  };

  // ตั้ง session cookie (มี log)
  setSessionCookie(res, session, 7);
  console.log('[CONSUME] setSessionCookie', { uid: session.uid, role: session.role, tenant: session.tenant });

  try {
    const uidForFirebase = String(session.uid || '').startsWith('line:')
      ? session.uid
      : `line:${session.uid}`;

    console.log('[CONSUME] createCustomToken for', uidForFirebase, { hasTenantClaim: !!session.tenant });
    const customToken = await admin.auth().createCustomToken(uidForFirebase, session.tenant ? { tenant: session.tenant } : undefined);
    console.log('[CONSUME] customToken length', customToken.length);

    const safeNext = remapOldNext(next);
    const sep = safeNext.includes('?') ? '&' : '?';
    const redirectUrl = `${base}${safeNext}${sep}mt=${encodeURIComponent(customToken)}&next=${encodeURIComponent(safeNext)}`;

    console.log('[CONSUME] redirect =>', redirectUrl);

    // Trace mode: ไม่ redirect แต่โชว์รายละเอียดบนหน้า (ช่วยดีบัก)
    if (trace === '1' || trace.toLowerCase() === 'true') {
      console.log('[CONSUME] TRACE mode');
      return res
        .status(200)
        .type('html')
        .send(`
          <h1>Magic Consume Trace</h1>
          <pre>${JSON.stringify({
            PUBLIC_APP_URL: base,
            next,
            uidForFirebase,
            tenant: session.tenant,
            customTokenLength: customToken.length,
            redirect: redirectUrl
          }, null, 2)}</pre>
          <p><a href="${redirectUrl}">👉 ไปยัง SPA (ทดสอบ)</a></p>
        `);
    }

    return res.redirect(302, redirectUrl);
  } catch (e) {
    console.error('[CONSUME] createCustomToken failed:', e?.message || e);
    const fallbackUrl = `${base}${next}`;
    console.log('[CONSUME] fallback redirect =>', fallbackUrl);
    return res.redirect(302, fallbackUrl);
  } finally {
    console.log('[CONSUME/DONE] in', Date.now() - started, 'ms');
  }
});

app.post('/auth/logout', (req, res) => {
  const trustProxy = String(process.env.TRUST_PROXY || '0') !== '0';
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: trustProxy, // ถ้าอยู่หลัง proxy/https
    path: '/',
    maxAge: 0,          // ลบทันที
  };
  res.setHeader('Set-Cookie', cookie.serialize('sess', '', cookieOpts));
  return res.status(204).end();
});



// --- [LINE profile proxy] GET /api/tenants/:tenant/line/profile?userId=Uxxxx
async function getChannelAccessTokenForTenant(tenant) {
  // TODO: ถ้ามีหลาย tenant ให้ดึงจาก Firestore/DB ของคุณ
  // ชั่วคราว: ใช้ตัวเดียวจาก .env
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
}

// LINE profile proxy for AppHeader avatar
// LINE profile proxy for AppHeader avatar
app.get('/api/tenants/:tenant/line/profile', async (req, res) => {
  try {
    const tenantId = String(req.params.tenant || '');
    const userId   = String(req.query.userId || req.query.lineUserId || '');

    if (!tenantId) return res.status(400).json({ ok:false, error:'missing tenant' });
    if (!userId)   return res.status(400).json({ ok:false, error:'missing userId' });

    // สร้าง tenantRef จาก Firestore โดยตรง
    const tenantRef = admin.firestore().collection('tenants').doc(tenantId);

    // ใช้ helper เดิมของโปรเจกต์
    const accessToken = await getTenantSecretAccessToken(tenantRef);

    // เรียก LINE profile API (ใช้ fetchFn ของโปรเจกต์)
    const r = await fetchFn(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      return res.status(r.status).json({ ok:false, error:`LINE profile error ${r.status}`, detail: txt });
    }

    const profile = await r.json(); // { userId, displayName, pictureUrl, statusMessage? }
    return res.json({ ok:true, profile });
  } catch (e) {
    console.error('[line/profile] error', e);
    return res.status(500).json({ ok:false, error: e.message || String(e) });
  }
});




// 3) ตรวจ session (ให้หน้า React ดึงดูได้)
app.get('/api/session/me', requireAuth, (req,res) => {
  res.json({ ok:true, user: req.user });
});

// 4) (ตัวอย่าง) API ที่ต้องการ role สูง
// app.get('/api/admin/users', requireRole(['developer','admin','supervisor']), async (req,res)=>{
//   // TODO: ดึงข้อมูลจริงตาม req.user.tenant
//   res.json({ ok:true, items:[], tenant: req.user.tenant });
// });

// ให้หน้า React อ่าน session เบื้องต้นได้ โดย "ไม่" บังคับ requireAuth
app.get('/api/auth/session', (req, res) => {
  try {
    const sess = readSession(req); // { uid, tenant, name, role } หรือ null
    if (sess && sess.uid) {
      return res.json({ uid: sess.uid, tenant: sess.tenant, name: sess.name || '', role: sess.role || 'user' });
    }
    return res.json({}); // ไม่มีเซสชัน → ให้หน้าเว็บแสดงคำแนะนำ (ไม่ crash)
  } catch {
    return res.json({});
  }
});




// ==============================
// 1) Firebase Admin Init
// ==============================
if (!admin.apps.length) {
  let creds;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    creds = JSON.parse(fs.readFileSync(p, 'utf8'));
  } else {
    throw new Error('No Firebase credentials provided');
  }

  admin.initializeApp({
    credential: admin.credential.cert(creds),
    projectId: creds.project_id,
  });
  console.log('[FIREBASE] Initialized with service account');
}
db = admin.firestore();

// ==============================
// 2) Middleware
// ==============================

// ====== server.js PATCH #1: static ======
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(cookieParser());

function setAppCookie(res, payload) {
  const sess = {
    uid: payload.uid,
    tenant: payload.tenant,
    name: payload.name || '',
    role: payload.role || 'user'
  };

  // LINE in-app บางเวอร์ชันถือว่าเป็น third-party context ในบางกรณี
  // → ต้องใช้ SameSite=None; Secure; Path=/
  // (อย่าตั้ง domain เพื่อเลี่ยงไม่ตรงซับโดเมน ngrok)
  res.cookie('app_sess', JSON.stringify(sess), {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 1000 * 60 * 60 * 4 // 4 ชม.
  });
}


// ----- FORCE ONE-TIME SW KILL FOR iOS LINE -----
function isLineIOS(ua) {
  ua = String(ua || '');
  return /\bLine\/\d/i.test(ua) && /\biPhone|\biPad|\biPod|\biOS/i.test(ua);
}

// // เฉพาะเส้นทางหน้าเว็บ (ไม่ยุ่ง /api /auth /webhook /static ...)
// app.use((req, res, next) => {
//   const { originalUrl } = req;
//   // สนใจเฉพาะหน้า SPA
//   if (!/^\/($|app\/|admin\/)/.test(originalUrl)) return next();

//   const ua = req.headers['user-agent'] || '';
//   const hasCookie = (req.headers.cookie || '').includes('swfix=1');
//   const hasParam  = /[?&]__swfix=1\b/.test(originalUrl);

//   if (isLineIOS(ua) && !hasCookie && !hasParam) {
//     // ใส่ __swfix=1 หนึ่งครั้ง แล้วตั้งคุกกี้ swfix=1 (1 วันพอ)
//     const url = new URL(req.protocol + '://' + req.get('host') + req.originalUrl);
//     url.searchParams.set('__swfix', '1');

//     res.cookie('swfix', '1', {
//       httpOnly: false,
//       sameSite: 'Lax',
//       maxAge: 24 * 60 * 60 * 1000,
//       secure: true,
//       path: '/'
//     });

//     return res.redirect(302, url.pathname + url.search);
//   }
//   next();
// });



// ==== Static & SPA ====
// วาง "หลัง" /api, /auth, /webhook ทั้งหมด และ "ก่อน" app.listen(...)

const WEB_ROOT   = __dirname;
const PUBLIC_DIR = path.join(WEB_ROOT, 'public');
const BUILD_DIR  = path.join(WEB_ROOT, 'build');

// 0) logger – ดูให้ชัดว่าเข้าเส้นไหน/UA อะไร
app.use((req, _res, next) => {
  console.log('[REQ]', req.method, req.originalUrl, '| UA=', req.headers['user-agent'] || '(none)');
  next();
});

// ---------- 1) เสิร์ฟ /static/* แบบกำหนด MIME เอง & ไม่ให้ fallback ----------
function setStaticHeadersByExt(res, filePath) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.js'  || ext === '.mjs')      res.type('application/javascript; charset=utf-8');
  else if (ext === '.css')                   res.type('text/css; charset=utf-8');
  else if (ext === '.json')                  res.type('application/json; charset=utf-8');
  else if (ext === '.svg')                   res.type('image/svg+xml; charset=utf-8');
  else if (ext === '.ico')                   res.type('image/x-icon');
  else if (ext === '.png')                   res.type('image/png');
  else if (ext === '.jpg' || ext === '.jpeg')res.type('image/jpeg');
  else if (ext === '.webp')                  res.type('image/webp');
  else if (ext === '.woff2')                 res.type('font/woff2');

  // cache long for hashed assets
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  // ปล่อยให้ cross-origin โหลดได้ (เช่น ngrok/LINE webview)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

app.use(
  '/static',
  (req, _res, next) => { console.log('[STATIC/HIT]', req.path); next(); },
  express.static(path.join(BUILD_DIR, 'static'), {
    index: false,
    redirect: false,
    fallthrough: false,
    setHeaders: (res, filePath) => setStaticHeadersByExt(res, filePath),
  })
);

// ---------- 2) ไฟล์พิเศษที่ต้องเป็นไฟล์จริงเสมอ ----------
app.get('/asset-manifest.json', (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  res.type('application/json').sendFile(path.join(BUILD_DIR, 'asset-manifest.json'));
});
app.get('/manifest.json', (_req, res) =>
  res.type('application/manifest+json').sendFile(path.join(PUBLIC_DIR, 'manifest.json'))
);
app.get('/favicon.ico', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});
app.get('/static/hr_menu_admin.png', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'hr_menu_admin.png')));
app.get('/static/ta_menu_user.png', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'ta_menu_user.png')));
app.get('/logo192.png', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'logo192.png')));

// --- 2.5) Service Worker KILL SWITCH (กัน SW เก่าคืน index.html) ---
const SW_KILL = `
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try { const names = await caches.keys(); await Promise.all(names.map(n => caches.delete(n))); } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
  })());
});
self.addEventListener('fetch', e => {}); // ไม่ intercept
`;
app.get(['/service-worker.js','/serviceWorker.js','/sw.js','/firebase-messaging-sw.js'], (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Content-Type': 'application/javascript; charset=utf-8'
  });
  res.send(SW_KILL);
});

// ---------- 3) เสิร์ฟไฟล์อื่น ๆ ใน build แบบปกติ (ปิด index อัตโนมัติ) ----------
app.use(express.static(BUILD_DIR, { index: false }));

// ---------- 4) เตรียม index.html + /__diag/index-info ----------
const INDEX_HTML = path.join(BUILD_DIR, 'index.html');
if (!fs.existsSync(INDEX_HTML)) {
  console.error('[SPA] build/index.html NOT FOUND. Run: npm run build');
}
function readSafe(p){ try{ return fs.readFileSync(p,'utf8'); } catch { return null; } }
app.get('/__diag/index-info', (_req, res) => {
  const txt = readSafe(INDEX_HTML) || '';
  res.json({
    BUILD_DIR, PUBLIC_DIR, INDEX_HTML,
    detect: {
      hasMainJs: /\/static\/js\/main\.[a-z0-9]+\.js/.test(txt),
      hasAnyJs:  /\/static\/js\//.test(txt),
    }
  });
});

// อ่าน entrypoints จาก build/asset-manifest.json
function getEntrypointsFromManifest() {
  try {
    const manifestPath = path.join(BUILD_DIR, 'asset-manifest.json');
    const txt = fs.readFileSync(manifestPath, 'utf8');
    const json = JSON.parse(txt);

    if (Array.isArray(json.entrypoints)) {
      const css = json.entrypoints.filter(p => p.endsWith('.css'));
      const js  = json.entrypoints.filter(p => p.endsWith('.js'));
      return { css, js };
    }
    const files = json.files || {};
    const css = []; const js = [];
    if (files['main.css']) css.push(files['main.css']);
    if (files['main.js'])  js.push(files['main.js']);
    return { css, js };
  } catch { return { css: [], js: [] }; }
}

// ถ้า index.html ไม่มี /static/js/... ให้ฉีด <link>/<script> จาก manifest เข้าไป
function ensureIndexHasBundles(rawHtml) {
  if (/\/static\/js\//.test(rawHtml)) return rawHtml; // มีอยู่แล้ว ไม่ต้องฉีด
  const { css, js } = getEntrypointsFromManifest();
  if (css.length === 0 && js.length === 0) {
    console.warn('[SPA] asset-manifest.json ไม่มี entrypoints — อาจยังไม่ได้ build');
    return rawHtml;
  }
  let html = rawHtml;
  if (html.includes('</head>') && css.length) {
    html = html.replace('</head>', css.map(h => `<link rel="stylesheet" href="${h}">`).join('') + '\n</head>');
  }
  if (html.includes('</body>') && js.length) {
    html = html.replace('</body>', js.map(s => `<script defer src="${s}"></script>`).join('') + '\n</body>');
  }
  console.log('[SPA] injected bundles from manifest →', { css, js });
  return html;
}

// beacon: ถ้า JS execute ได้ จะยิง /__boot/pixel (ช่วยวินิจฉัย)
app.get('/__boot/pixel', (req, res) => {
  console.log('[BOOT] pixel', req.query);
  res.type('image/gif').end();
});


// ---------- 4.9) LINE WebView: one-shot SW/cache clear using URL flag ----------
function isLineUA(req) {
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  return ua.includes(' line/');
}
function hasSwFixed(req) {
  const q = String(req.url || '');
  if (/\b__swfix=1\b/.test(q)) return true;
  const cookie = String(req.headers.cookie || '');
  return /(?:^|;\s*)swfix=1(?:;|$)/.test(cookie);
}

app.get(['/','/app/*'], (req, res, next) => {
  // ใช้เฉพาะ LINE; ถ้าเคย fix แล้ว ให้ไปเส้นทางปกติ
  if (!isLineUA(req) || hasSwFixed(req)) return next();

  try {
    let html = fs.readFileSync(INDEX_HTML, 'utf8');
    html = ensureIndexHasBundles(html);

    const killer = `
<script>
(function(){try{
  // รันเฉพาะ LINE และเฉพาะเมื่อยังไม่มี __swfix=1 เท่านั้น
  var isLINE=(/\\bLine\\/\\d/i).test(navigator.userAgent||'');
  if(!isLINE) return;
  if((location.search||'').indexOf('__swfix=1')>=0) return;

  // ตั้งคุกกี้กันลูปสำรอง (10 นาที)
  try{ document.cookie='swfix=1; max-age=600; path=/'; }catch(_){}

  // ล้าง cache และ SW แล้ว reload พร้อมเติม __swfix=1
  var done=function(){
    var u=new URL(location.href);
    if(!u.searchParams.has('__swfix')) u.searchParams.set('__swfix','1');
    location.replace(u.toString());
  };

  var clearCaches = function(){
    try{
      if(window.caches && caches.keys){
        return caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){return caches.delete(k)})); });
      }
    }catch(_){}
    return Promise.resolve();
  };

  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistrations()
      .then(function(rs){ return Promise.all(rs.map(function(r){ return r.unregister().catch(function(){}) })); })
      .then(clearCaches).then(function(){ setTimeout(done,50); })
      .catch(function(){ done(); });
  }else{
    clearCaches().then(function(){ setTimeout(done,30); });
  }
}catch(e){}})();
</script>`.trim();

    // ฉีดสคริปต์ก่อน </head>
    if (html.includes('</head>')) html = html.replace('</head>', killer + '\n</head>'); else html = killer + '\n' + html;

    // beacon 1px (debug) ว่า JS เริ่มทำงาน
    if (html.includes('</body>')) {
      html = html.replace('</body>', `<script>try{new Image().src='/__boot/pixel?t='+(Date.now())}catch(e){}</script></body>`);
    }

    // กัน cache เต็มรูปแบบ + เคลียร์ข้อมูลฝั่ง UA
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
      'Vary': 'Accept, User-Agent',
      'Clear-Site-Data': '"cache", "storage"',
      'X-Content-Type-Options': 'nosniff',
      // ตั้งคุกกี้ swfix=1 เผื่อ UA ไม่เขียนคุกกี้จาก JS
      'Set-Cookie': 'swfix=1; Max-Age=600; Path=/',
    });

    res.type('text/html; charset=utf-8').send(html);
  } catch (e) {
    return next();
  }
});

// ---------- 5) ส่ง index แบบ no-cache ----------
function sendIndexNoCache(req, res) {
  const ua = String(req.headers['user-agent'] || '');
  const isLINE = /\bLine\/\d/i.test(ua);
  const isFix  = /[?&]__swfix=1\b/.test(req.originalUrl);

  // no-store ทุกเคส
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    'Vary': 'Accept, User-Agent',
    'X-Content-Type-Options': 'nosniff',
  });



  // ผ่อน CSP เฉพาะ LINE (กันบล็อคสคริปต์)
  if (isLINE) {
    res.set('Content-Security-Policy', [
      "default-src 'self' blob: data: https:",
      "script-src 'self' blob: 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "font-src 'self' data: https:",
      "frame-ancestors *"
    ].join('; '));
  }

  try {
    const raw  = fs.readFileSync(INDEX_HTML, 'utf8');
    let html   = ensureIndexHasBundles(raw);

    // beacon แบบ <img> (ไม่พึ่ง JS)
    const beacon = `<img alt="" src="/__boot/pixel?t=html" width="1" height="1" style="position:absolute;left:-9999px;top:-9999px">`;
    html = html.includes('</body>') ? html.replace('</body>', beacon + '\n</body>') : (html + '\n' + beacon);

    res.type('text/html; charset=utf-8').send(html);
  } catch (e) {
    console.error('[SPA] cannot read index.html', e);
    res.status(500).type('text/plain').send('index not found');
  }
}


app.get('/index.html', sendIndexNoCache);

// ---------- 6) เส้นทางเว็บ + catch-all (ยกเว้นระบบ) ----------
app.get([/^\/(app|admin)(\/.*)?$/, /^\/$/], sendIndexNoCache);
app.get(/^\/(?!api\/|auth\/|webhook\/|static\/|asset-manifest\.json$|manifest\.json$|favicon\.ico$|__diag\/|__boot\/).*/, sendIndexNoCache);

app.get('/__diag/ping', (_req, res) => res.type('text/plain').send('ok'));
app.get('/__sw-reset', (_req, res) => {
  res.type('text/html; charset=utf-8').send(`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<pre id="log" style="font:14px/1.6 ui-monospace,monospace;white-space:pre-wrap;padding:12px;border:1px solid #ddd;border-radius:8px">
SW reset page…</pre>
<button id="reload" style="margin:12px;padding:10px 14px;border-radius:8px;border:1px solid #999">Reload</button>
<script>
const L=(...a)=>{document.getElementById('log').textContent+=a.join(' ')+'\\n'};
document.getElementById('reload').onclick=()=>location.reload();
(async()=>{
  L('UA:',navigator.userAgent);
  try{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      L('[sw] regs =', regs.length);
      for(const r of regs){try{await r.unregister();L('[sw] unregistered')}catch(e){L('[sw] unregister err',e.message)}}
    }else{L('[sw] API not available')}
    if(window.caches&&caches.keys){
      const keys=await caches.keys();
      L('[cache] keys =', keys.join(', ')||'(none)');
      await Promise.all(keys.map(k=>caches.delete(k)));
      L('[cache] cleared');
    }
    L('DONE → กด Reload หรือปิดหน้านี้แล้วเปิดลิงก์เดิมใหม่');
  }catch(e){L('ERROR:',e&&e.message)}
})();
</script>`);
});
// ==== END Static & SPA ====


app.get('/__diag/ua', (req, res) => {
  res.type('text/plain').send(req.headers['user-agent'] || '(no ua)');
});

app.get('/__diag/index-plain', (_req, res) => {
  res.type('text/html; charset=utf-8').sendFile(INDEX_HTML);
});

app.get('/__diag/index-csp', (req, res) => {
  // ส่ง index พร้อม CSP ที่ผ่อน (เหมือนใน sendIndexNoCache)
  res.set('Content-Security-Policy', [
    "default-src 'self' blob: data: https:",
    "script-src 'self' blob: 'unsafe-inline' 'unsafe-eval' https:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "font-src 'self' data: https:",
    "frame-ancestors *"
  ].join('; '));
  res.type('text/html; charset=utf-8').sendFile(INDEX_HTML);
});





async function requireFirebaseAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const m = h.match(/^Bearer (.+)$/);
    if (!m) return res.status(401).json({ error: 'Missing Authorization: Bearer <idToken>' });
    const decoded = await admin.auth().verifyIdToken(m[1]);
    req.user = decoded;
    next();
  } catch (_e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ใช้ชื่อสั้นแบบเดียวกันกับโค้ดหน้า settings
const requireAuthFirebase = requireFirebaseAuth;


// คนที่ “เป็นเจ้าของ OA” หรือ “อยู่ในรายชื่อ members” ถือว่ามีสิทธิ์จัดการ
async function assertUserCanManageTenant(decodedUser, tenantRef) {
  const snap = await tenantRef.get();
  const t = snap.data() || {};
  const isOwner = t.ownerUid === decodedUser.uid;
  const isMember = Array.isArray(t.members) && t.members.includes(decodedUser.uid);
  return isOwner || isMember;
}

async function optionalAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  if (m) {
    try {
      const decoded = await admin.auth().verifyIdToken(m[1]);
      req.user = decoded;
    } catch { /* ใช้ต่อเป็น guest */ }
  }
  // ให้มี guest cookie เสมอ (เผื่อจะเก็บ draft)
  ensureGuest(req, _res, () => next());
}

function extractLineUserId(user) {
  // รับค่าจากหลายแหล่งที่อาจมีในโปรเจกต์
  let cand =
    user?.lineUserId ||
    user?.line_id ||
    user?.lineUser ||
    user?.uid || '';

  cand = String(cand).trim();
  if (cand.startsWith('line:')) cand = cand.slice(5); // ตัด prefix "line:" ออก

  // ถ้าอยากเข้มงวด: เช็คฟอร์แมต U + 32 hex
  if (!/^U[0-9a-f]{32}$/i.test(cand)) {
    return null;
  }
  return cand;
}










// ==============================
// 3) Helpers
// ==============================



async function isTaskbotEnabled(tenantRef) {
  // เปิดใช้ “integrations/taskbot.enabled” ก่อน, ถ้าไม่มีค่อยดู “settings/taskbot.enabled”
  const a = await tenantRef.collection('integrations').doc('taskbot').get().catch(()=>null);
  if (a?.exists && a.get('enabled') !== undefined) return !!a.get('enabled');
  const b = await tenantRef.collection('settings').doc('taskbot').get().catch(()=>null);
  return !!b?.get('enabled');
}



// ---------- FORCE call Attendance GAS (with sheetId + script='ATTEND') ----------
// helper ยิง GAS Attendance โดยตรง (ใช้ตามที่เราติดตั้งก่อนหน้า)
async function callAttendanceGASDirect(action, body = {}) {
  const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
  const url = process.env.APPS_SCRIPT_EXEC_URL_TA;
  const sharedKey = process.env.APPS_SCRIPT_SHARED_KEY_TA;
  if (!url) throw new Error('missing_env_APPS_SCRIPT_EXEC_URL_TA');
  if (!sharedKey) throw new Error('missing_env_APPS_SCRIPT_SHARED_KEY_TA');

  let sheetId = String(body.sheetId || body.appsSheetId || '').trim();
  if (!sheetId) {
    const integSnap = await body.tenantRef.collection('integrations').doc('attendance').get();
    const integ = integSnap.exists ? (integSnap.data() || {}) : {};
    sheetId = String(integ.appsSheetId || '').trim();
  }
  if (!sheetId) throw new Error('attendance_gas_missing_sheetId');

  const payload = { action, sharedKey, sheetId, ...body };
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const text = await r.text(); let j={}; try{ j=JSON.parse(text) }catch{}
  if (!r.ok || j.ok === false) throw new Error(`APPS_SCRIPT_ERROR: ${j?.error || `HTTP ${r.status} ${text}`}`);
  return j;
}




function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 'messages_required';
  if (messages.length > 5) return 'too_many_messages';
  return null;
}

function toTs(iso) {
  // ISO string → Firestore Timestamp
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return admin.firestore.Timestamp.fromDate(d);
}

async function getTenantIfMember(tid, uid) {
  const ref = admin.firestore().collection('tenants').doc(tid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const t = snap.data();
  const isOwner = t.ownerUid === uid;
  const isMember = Array.isArray(t.members) && t.members.includes(uid);
  if (!isOwner && !isMember) return null;
  return { id: snap.id, ...t, ref };
}

async function getTenantSecretAccessToken(tenantRef) {
  const secSnap = await tenantRef.collection('secret').doc('v1').get();
  if (!secSnap.exists) throw new Error('missing_secret');
  const { accessToken } = secSnap.data() || {};
  if (!accessToken) throw new Error('missing_access_token');
  return accessToken;
}

// ✅ เพิ่มตัวช่วยทำลิงก์ download ให้แน่ใจว่าได้ไฟล์ไบต์จริง (ไม่ใช่ HTML viewer)
function withAltMedia(u) {
  try {
    const url = new URL(u);
    const host = url.hostname;
    const isStorageHost =
      host.includes('firebasestorage.googleapis.com') ||
      host.includes('storage.googleapis.com') ||
      host.includes('firebasestorage.app');
    if (isStorageHost && !url.searchParams.has('alt')) {
      url.searchParams.set('alt', 'media');
    }
    return url.toString();
  } catch {
    return u;
  }
}

async function getTenantByChannelId(channelId) {
  const snap = await admin.firestore().collection('tenants')
    .where('channelId', '==', channelId).limit(1).get();
  if (snap.empty) return null;
  const ref = snap.docs[0].ref;
  return { id: ref.id, ref };
}

async function getTenantByBotUserId(botUserId) {
  const snap = await admin.firestore().collection('tenants')
    .where('botUserId', '==', botUserId).limit(1).get();
  if (snap.empty) return null;
  const ref = snap.docs[0].ref;
  return { id: ref.id, ref };
}

function verifyLineSignature(req, channelSecret) {
  const signature = req.get('x-line-signature') || '';
  const hmac = crypto.createHmac('sha256', channelSecret)
    .update(req.rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hmac));
  } catch { return false; }
}
function verifyLineSignatureRaw(rawBuffer, signature, channelSecret) {
  const hmac = crypto.createHmac('sha256', channelSecret).update(rawBuffer).digest('base64');
  try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hmac)); }
  catch { return false; }
}

// รับ accessToken ตรง ๆ (ดึงมาก่อนแล้วค่อยส่งมา)
async function callLineAPI(path, options = {}, accessToken) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` };
  const res = await fetchFn('https://api.line.me' + path, { ...options, headers });
  return res;
}

// === Re-issue Messaging API Channel access token (v2.1) แล้วเก็บกลับลง Firestore ===
async function reissueChannelAccessToken(tenantRef) {
  const snap = await tenantRef.get();
  const channelId = snap.get('channelId');
  const secSnap = await tenantRef.collection('secret').doc('v1').get();
  const channelSecret = secSnap.get('channelSecret');

  if (!channelId || !channelSecret) throw new Error('missing_channel_credentials');

  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: channelId,
    client_secret: channelSecret
  });

  const tokRes = await fetchFn('https://api.line.me/v2/oauth/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const text = await tokRes.text();
  if (!tokRes.ok) throw new Error('reissue_failed:' + text);

  const { access_token, expires_in } = JSON.parse(text);
  await tenantRef.collection('secret').doc('v1').set({
    accessToken: access_token,
    accessTokenExpiresIn: expires_in || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return access_token;
}

// ===== tenant helpers =====
async function requireTenantFromReq(req) {
  // รองรับทั้ง header, query, และ body
  const tid =
    (req.get && req.get('x-tenant-id')) ||
    (req.query && req.query.tenant) ||
    (req.body && req.body.tenant);

  if (!tid) {
    throw new Error('missing_tenant_id: please send x-tenant-id header or ?tenant= or body.tenant');
  }
  // สมมติ collection คือ "tenants"
  const tenantRef = admin.firestore().collection('tenants').doc(String(tid));
  const snap = await tenantRef.get();
  if (!snap.exists) {
    throw new Error('tenant_not_found: ' + tid);
  }
  return tenantRef;
}



// === เรียก LINE API โดยอิง tenantRef และ retry อัตโนมัติถ้าเจอ 401 ===
async function callLineAPITenant(tenantRef, path, options = {}) {
  const doFetch = async (token) => {
    const final = {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
    };
    log('LINE/API→', path, (final.method||'GET'), 'hdr=', Object.keys(final.headers||{}));
    if (final.body) {
      const len = typeof final.body === 'string' ? final.body.length : 0;
      log('LINE/API→BODY', len ? `bytes=${len}` : '(no body)');
    }
    return fetchFn('https://api.line.me' + path, final);
  };

  let token = await getTenantSecretAccessToken(tenantRef);
  let res = await doFetch(token);

  if (res.status === 401) {
    warn('LINE/API', '401 → reissue token');
    token = await reissueChannelAccessToken(tenantRef);
    res = await doFetch(token);
  }

  if (res.status < 200 || res.status >= 300) {
    const body = await res.text().catch(()=>'');
    warn('LINE/API', 'HTTP', res.status, path, body || '(no body)');
  } else {
    log('LINE/API', 'OK', res.status, path);
  }
  return res;
}



// ── Rich Menu helpers ─────────────────────────────────────────
function richMenuSpecForSize(size) {
  const s = String(size || 'large').toLowerCase();
  return { width: 2500, height: s === 'compact' ? 843 : 1686 };
}
function pctToPx(pct, total) {
  return Math.max(0, Math.min(total, Math.round((Number(pct) || 0) * total)));
}
function normalizeAreasToBounds(areas, size) {
  const spec = richMenuSpecForSize(size);
  return (areas || []).map((a) => {
    // รองรับทั้ง a.bounds (px), a.xPct (0–1), หรือ a.x (px)
    let x, y, w, h;
    if (a && a.bounds) {
      x = Math.round(Number(a.bounds.x) || 0);
      y = Math.round(Number(a.bounds.y) || 0);
      w = Math.max(1, Math.round(Number(a.bounds.width)  || 0));
      h = Math.max(1, Math.round(Number(a.bounds.height) || 0));
    } else if (a && (a.xPct != null)) {
      x = pctToPx(a.xPct, spec.width);
      y = pctToPx(a.yPct, spec.height);
      w = Math.max(1, pctToPx(a.wPct, spec.width));
      h = Math.max(1, pctToPx(a.hPct, spec.height));
    } else {
      x = Math.round(Number(a?.x) || 0);
      y = Math.round(Number(a?.y) || 0);
      w = Math.max(1, Math.round(Number(a?.w) || 0));
      h = Math.max(1, Math.round(Number(a?.h) || 0));
    }
    // กันล้นเฟรม
    if (x + w > spec.width)  w = spec.width  - x;
    if (y + h > spec.height) h = spec.height - y;
    return { x, y, width: w, height: h };
  });
}

function toLineAction(a) {
  const t = String(a?.type || '').toLowerCase();

  // เปิดลิงก์
  if (t === 'uri' || t === 'url' || t === 'link') {
    return {
      type: 'uri',
      uri: a.url || 'https://line.me',
      label: (a.label || 'Open').slice(0, 20)
    };
  }

  // ส่งข้อความ: รองรับทั้ง "message" และ "text"
  if (t === 'message' || t === 'text') {
    const txt = (a.text || a.displayText || '').slice(0, 300);
    return { type: 'message', text: txt || ' ' };
  }

  if (t === 'postback' || t === 'qna') {
    const data = a.data || (a.qnaKey ? `qna:${a.qnaKey}` : '');
    const display = (a.displayText || a.text || a.label || '').slice(0, 300) || undefined;
    if (!data) {
      // ถ้าไม่มี data ให้ fallback เป็น message ไปเลย จะได้มี feedback
      return { type: 'message', text: display || 'เมนู' };
    }
    const obj = { type: 'postback', data: String(data).slice(0, 300) };
    if (display) obj.displayText = display;
    return obj;
  }

  // live chat ช็อตคัต
  if (t === 'live chat' || t === 'live') {
    return { type: 'message', text: a.liveText || '#live' };
  }

  // fallback: ส่งข้อความอย่างน้อย 1 ตัวอักษร
  const fallback = (a?.text || a?.displayText || 'เมนู').slice(0, 300);
  return { type: 'message', text: fallback || ' ' };
}



function buildLineRichMenuPayload(input) {
  const size   = input?.size || 'large';
  const spec   = richMenuSpecForSize(size);
  const bounds = normalizeAreasToBounds(input?.areas || [], size);
  const areas  = bounds.map((b, i) => ({
    bounds: b,
    action: toLineAction(input?.areas?.[i]?.action)
  }));
  return {
    size: { width: spec.width, height: spec.height },
    selected: true,
    name: input?.title || 'Menu',
    chatBarText: input?.chatBarText || 'Menu',
    areas
  };
}




// ===== TaskBot Settings (per-tenant) =====
// ===== Unified Taskbot settings (keep this, delete the old ones) =====
async function getTaskbotSettings(tenantRef) {
  // อ่านค่าใหม่จาก integrations/taskbot
  const integSnap = await tenantRef.collection('integrations').doc('taskbot').get();
  let enabled     = !!(integSnap.exists && integSnap.get('enabled'));
  let execUrl     = (integSnap.exists && integSnap.get('execUrl'))      || '';
  let sharedKey   = (integSnap.exists && integSnap.get('sharedKey'))    || '';
  let appsSheetId = (integSnap.exists && integSnap.get('appsSheetId'))  || '';

  // fallback ที่เก่า (ถ้ามี)
  if (!execUrl || !sharedKey || !enabled) {
    const oldSnap = await tenantRef.collection('settings').doc('taskbot').get();
    if (oldSnap.exists) {
      if (!execUrl)     execUrl     = oldSnap.get('appsScriptUrl') || '';
      if (!sharedKey)   sharedKey   = oldSnap.get('appsScriptKey')  || '';
      if (!enabled)     enabled     = !!oldSnap.get('enabled');
      if (!appsSheetId) appsSheetId = oldSnap.get('appsSheetId')    || '';
    }
  }

  // fallback ENV
  execUrl     = execUrl     || process.env.APPS_SCRIPT_EXEC_URL || process.env.APPS_SCRIPT_URL || '';
  sharedKey   = sharedKey   || process.env.APPS_SCRIPT_SHARED_KEY || process.env.APPS_SCRIPT_KEY || '';
  appsSheetId = appsSheetId || process.env.APPS_SHEET_ID || '';

  return { enabled, execUrl, sharedKey, appsSheetId };
}

// // (แนะนำ) ไว้ใช้ซ้ำในหลายที่
// async function isTaskbotEnabled(tenantRef) {
//   const { enabled } = await getTaskbotSettings(tenantRef);
//   return !!enabled;
// }



async function saveTaskbotSettings(tenantRef, partial) {
  await tenantRef.collection('settings').doc('taskbot').set(partial, { merge: true });
}


// === NEW: read Time Attendance GAS secrets (per-tenant overrides -> env) ===
async function readTimeAttendanceSecrets(tenantRef) {
  try {
    // อนุญาตให้เก็บ override ไว้ใน Firestore ได้ (ถ้ามี)
    const integ = await tenantRef.collection('integrations').doc('attendance').get();
    const execUrl =
      (integ.exists && (integ.get('appsExecUrl') || '')) ||
      (process.env.APPS_SCRIPT_EXEC_URL_TA || '');
    const sharedKey =
      (integ.exists && (integ.get('appsSharedKey') || '')) ||
      (process.env.APPS_SCRIPT_SHARED_KEY_TA || process.env.APPS_SCRIPT_SHARED_KEY || '');

    return { execUrl, sharedKey };
  } catch {
    return {
      execUrl: process.env.APPS_SCRIPT_EXEC_URL_TA || '',
      sharedKey: process.env.APPS_SCRIPT_SHARED_KEY_TA || process.env.APPS_SCRIPT_SHARED_KEY || ''
    };
  }
}

// ===== Unified Apps Script caller (keep this, delete the old ones) =====
// เรียก Apps Script โดยอ่าน URL/KEY จาก .env และส่ง sheet_id ของ OA นั้น ๆ



// ส่งคำสั่งถึง Apps Script แบบผูก OA → Sheet (มี sheet_id + auth)
async function callAppsScriptForTenant(tenantRef, action, payload = {}, opts = {}) {
  // เลือกสคริปต์จาก opts.script ('TA' | 'TASK')
  const useTA = String(opts.script || '').toUpperCase() === 'TA' ||
                String(opts.sheetFrom || '').toLowerCase() === 'attendance';
  const { execUrl, sharedKey } = useTA
    ? await readTimeAttendanceSecrets(tenantRef)
    : await readTaskBotSecrets(tenantRef);
  if (!execUrl) throw new Error('APPS_SCRIPT_EXEC_URL_NOT_SET');

  // 1) ดึง sheet_id ต่อ use-case
  let sheetId = '';
  if (opts.sheetFrom === 'attendance') {
    try {
      const integTA = await tenantRef.collection('integrations').doc('attendance').get();
      if (integTA.exists) sheetId = integTA.get('appsSheetId') || '';
    } catch {}
  }
  // ❗ ถ้าระบุให้ใช้ Attendance แต่ไม่มี sheet → หยุดเลย (กัน fallback)
  if (useTA && !sheetId) {
    throw new Error('ATTENDANCE_SHEET_ID_REQUIRED');
  }
  if (!sheetId) {
    try {
      const integ = await tenantRef.collection('integrations').doc('taskbot').get();
      if (integ.exists) sheetId = integ.get('appsSheetId') || integ.get('sheetId') || '';
    } catch {}
    if (!sheetId) {
      try {
        const s = await tenantRef.collection('settings').doc('taskbot').get();
        if (s.exists) sheetId = s.get('appsSheetId') || s.get('sheetId') || '';
      } catch {}
    }
  }
  
  if (!sheetId) sheetId = process.env.APPS_SHEET_ID || '';

  // 2) ส่งทั้ง app_key และ key (เผื่อสคริปต์ฝั่ง GAS ใช้ชื่อใดชื่อหนึ่ง)
  const authKey = String(sharedKey || '');
  const body = {
    action,
    app_key: authKey,
    key: authKey,
    sheet_id: sheetId,
    ...payload,
  };

  // (ดีบักได้ปลอดภัย ไม่พิมพ์ key)
  console.log('[GAS] →', action, {
    sheetId, url: execUrl.replace(/\?.*$/, ''), script: useTA ? 'TA' : 'TASK'
  });

  const r = await fetchFn(execUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let j = null;
  try {
    j = await r.json();
  } catch (e) {
    throw new Error(`APPS_SCRIPT_HTTP_${r.status}: invalid JSON`);
  }

  // ✅ บังคับตรวจผลลัพธ์
  if (!r.ok || (j && j.ok === false)) {
    const msg = (j && (j.error || j.message)) || `HTTP ${r.status}`;
    throw new Error(`APPS_SCRIPT_ERROR: ${msg}`);
  }
  return j;
}




// อ่านค่า field channelSecret/botUserId ตาม schema ที่คุณใช้
function readLineFields(doc) {
  const d = doc.data() || {};
  const line = d.line || d.settings || {};
  return {
    botUserId: line.botUserId || line.bot_user_id || d.botUserId || null,
    channelSecret:
      line.channelSecret || line.messagingChannelSecret || line.channel_secret || d.channelSecret || null,
  };
}

async function upsertTenantBotUserId(tenantRef, botUserId) {
  const snap = await tenantRef.get();
  const d = snap.data() || {};
  const line = d.line || {};
  if (!line.botUserId && botUserId) {
    await tenantRef.set({ line: { ...line, botUserId } }, { merge: true });
  }
}

// ── LINE helpers

// คืนค่า LINE RichMenu ID จาก Firestore ตามชนิดที่กำหนด (PREREG|MAIN)
async function getRichMenuIdByKind(tenantRef, kind) {
  const snap = await tenantRef.collection('richmenus').doc(String(kind).toUpperCase()).get();
  if (!snap.exists) return null;
  return snap.get('lineRichMenuId') || snap.get('richMenuId') || null;
}


// ดึง channelSecret ของ tenant (เก็บใน tenants/{tid}/secret/v1)
async function getTenantChannelSecret(tenantRef) {
  const doc = await tenantRef.collection('secret').doc('v1').get();
  const data = doc.exists ? doc.data() : null;
  return data?.channelSecret || '';
}

// เรียก LINE API พร้อม token ของ tenant
async function replyWithTenant(tenantRef, replyToken, messages) {
  const accessToken = await getTenantSecretAccessToken(tenantRef); // ดึง token ต่อ tenant
  const res = await callLineAPI('/v2/bot/message/reply', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ replyToken, messages })
  }, accessToken);

  if (!res.ok) {
    console.error('REPLY_ERR', res.status, await res.text().catch(()=>'')); 
  }
}


/**
 * พยายามหา tenant ด้วย 2 ขั้น:
 * 1) เทียบ destination กับ botUserId (เร็ว)
 * 2) ถ้าไม่เจอ → วนเทียบ HMAC กับทุก tenant ที่มี channelSecret (ช้ากว่า แต่ครั้งเดียว)
 */
async function getTenantByDestinationOrSignature(db, destination, rawBuffer, signature) {
  // 1) หาแบบ botUserId ก่อน
  let qs = await db.collection('tenants').where('line.botUserId', '==', destination).limit(1).get()
    .catch(()=>null);
  if (qs && !qs.empty) return qs.docs[0].ref;

  // เผื่อบางโปรเจ็กต์เก็บไว้ key อื่น
  qs = await db.collection('tenants').where('botUserId', '==', destination).limit(1).get().catch(()=>null);
  if (qs && !qs.empty) return qs.docs[0].ref;

  // 2) เดาโดย HMAC
  const all = await db.collection('tenants').get();
  for (const doc of all.docs) {
    const { channelSecret } = readLineFields(doc);
    if (!channelSecret) continue;
    const expected = crypto.createHmac('sha256', channelSecret).update(rawBuffer).digest('base64');
    if (expected === signature) {
      const ref = doc.ref;
      // cache botUserId ไว้ (ครั้งหน้าไม่ต้องเดา)
      await upsertTenantBotUserId(ref, destination).catch(()=>{});
      return ref;
    }
  }
  return null;
}



// --- Rich Menu helpers ---
async function listRichMenus(accessToken) {
  const res = await callLineAPI('/v2/bot/richmenu/list', { method:'GET' }, accessToken);
  const txt = await res.text().catch(()=> '');
  if (!res.ok) throw new Error('list_richmenus_failed: ' + (txt || res.statusText));
  const j = JSON.parse(txt || '{}');
  return Array.isArray(j.richmenus) ? j.richmenus : [];
}

async function getDefaultRichMenuId(accessToken) {
  const res = await callLineAPI('/v2/bot/user/all/richmenu', { method:'GET' }, accessToken);
  if (res.status === 404) return ''; // ไม่มี default
  const txt = await res.text().catch(()=> '');
  if (!res.ok) throw new Error('get_default_richmenu_failed: ' + (txt || res.statusText));
  const j = JSON.parse(txt || '{}');
  return j.richMenuId || '';
}

async function unsetDefaultRichMenu(accessToken) {
  // ลบ default ของทั้งช่องทาง
  const res = await callLineAPI('/v2/bot/user/all/richmenu', { method:'DELETE' }, accessToken);
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(()=> '');
    throw new Error('unset_default_richmenu_failed: ' + (txt || res.statusText));
  }
}

async function setDefaultRichMenu(accessToken, richMenuId) {
  const res = await callLineAPI(
    `/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`,
    { method:'POST' },
    accessToken
  );
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error('set_default_richmenu_failed: ' + (txt || res.statusText));
  }
}

async function getUserRichMenuId(accessToken, userId) {
  const res = await callLineAPI(
    `/v2/bot/user/${encodeURIComponent(userId)}/richmenu`,
    { method:'GET' },
    accessToken
  );
  if (res.status === 404) return ''; // ยังไม่ถูก link รายบุคคล
  const txt = await res.text().catch(()=> '');
  if (!res.ok) throw new Error('get_user_richmenu_failed: ' + (txt || res.statusText));
  const j = JSON.parse(txt || '{}');
  return j.richMenuId || '';
}

async function linkRichMenuToUser(accessToken, userId, richMenuId) {
  const res = await callLineAPI(
    `/v2/bot/user/${encodeURIComponent(userId)}/richmenu/${encodeURIComponent(richMenuId)}`,
    { method:'POST' },
    accessToken
  );
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error('link_user_richmenu_failed: ' + (txt || res.statusText));
  }
}

async function unlinkRichMenuFromUser(accessToken, userId) {
  const res = await callLineAPI(
    `/v2/bot/user/${encodeURIComponent(userId)}/richmenu`,
    { method:'DELETE' },
    accessToken
  );
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(()=> '');
    throw new Error('unlink_user_richmenu_failed: ' + (txt || res.statusText));
  }
}

// ---- Rich Menu helpers (ByToken: ไม่ชนกับแบบ tenantRef) ----
async function getDefaultRichMenuIdByToken(accessToken) {
  const res = await callLineAPI('/v2/bot/user/all/richmenu', { method: 'GET' }, accessToken);
  if (res.status === 404) return '';
  const txt = await res.text().catch(()=> '');
  if (!res.ok) throw new Error('get_default_richmenu_failed: ' + (txt || res.statusText));
  const j = JSON.parse(txt || '{}');
  return j.richMenuId || '';
}

async function getUserRichMenuIdByToken(accessToken, userId) {
  const res = await callLineAPI(`/v2/bot/user/${encodeURIComponent(userId)}/richmenu`,
    { method:'GET' }, accessToken);
  if (res.status === 404) return '';
  const txt = await res.text().catch(()=> '');
  if (!res.ok) throw new Error('get_user_richmenu_failed: ' + (txt || res.statusText));
  const j = JSON.parse(txt || '{}');
  return j.richMenuId || '';
}
// Verify & retry using existing *ByToken helpers*
async function ensureUserLinkedRichMenuByToken(accessToken, userId, targetRichMenuId, maxRetry = 2) {
  for (let i = 0; i <= maxRetry; i++) {
    const cur = await getUserRichMenuIdByToken(accessToken, userId).catch(() => '');
    if (cur === targetRichMenuId) return true;

    await unlinkRichMenuFromUserByToken(accessToken, userId).catch(() => {});
    await linkRichMenuToUserByToken(accessToken, userId, targetRichMenuId).catch(() => {});

    const after = await getUserRichMenuIdByToken(accessToken, userId).catch(() => '');
    if (after === targetRichMenuId) return true;
  }
  return false;
}


async function linkRichMenuToUserByToken(accessToken, userId, richMenuId) {
  const res = await callLineAPI(
    `/v2/bot/user/${encodeURIComponent(userId)}/richmenu/${encodeURIComponent(richMenuId)}`,
    { method:'POST' }, accessToken);
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error('link_user_richmenu_failed: ' + (txt || res.statusText));
  }
}

async function unlinkRichMenuFromUserByToken(accessToken, userId) {
  const res = await callLineAPI(
    `/v2/bot/user/${encodeURIComponent(userId)}/richmenu`,
    { method:'DELETE' }, accessToken);
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(()=> '');
    throw new Error('unlink_user_richmenu_failed: ' + (txt || res.statusText));
  }
}

async function unsetDefaultRichMenuByToken(accessToken) {
  const res = await callLineAPI('/v2/bot/user/all/richmenu', { method:'DELETE' }, accessToken);
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(()=> '');
    throw new Error('unset_default_richmenu_failed: ' + (txt || res.statusText));
  }
}











// ส่งข้อความ text
// ========== Reply helpers ==========
async function reply(replyToken, text, quickItems, tenantRef) {
  const msg = { type: 'text', text: String(text || '') };
  if (Array.isArray(quickItems) && quickItems.length > 0) {
    msg.quickReply = { items: quickItems };
  }
  const res = await callLineAPITenant(tenantRef, '/v2/bot/message/reply', {
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ replyToken, messages: [msg] }) 
  });
  if (!res.ok) console.error('REPLY_ERR', res.status, await res.text().catch(() => ''));
}

async function replyFlex(replyToken, flexBubble, quickItems, tenantRef) {
  const message = { type: 'flex', altText: 'รายการ', contents: flexBubble };
  if (Array.isArray(quickItems) && quickItems.length > 0) {
    message.quickReply = { items: quickItems };
  }
  const res = await callLineAPITenant(tenantRef, '/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [message] })
  });
  if (!res.ok) console.error('REPLY_MSG_ERR', res.status, await res.text().catch(()=>''));
}



async function replyFlexMany(replyToken, bubbles = [], quickItems = [], tenantRef) {
  try {
    // กันกรณีไม่มีการ์ดส่งมา
    if (!Array.isArray(bubbles) || bubbles.length === 0) {
      return reply(replyToken, 'ไม่มีข้อมูลที่จะแสดง', null, tenantRef);
    }

    const contents = (bubbles.length === 1)
      ? bubbles[0]
      : { type: 'carousel', contents: bubbles.slice(0, 10) };

    const body = {
      replyToken,
      messages: [{
        type: 'flex',
        altText: 'รายการงาน',
        contents,
        ...(Array.isArray(quickItems) && quickItems.length
            ? { quickReply: { items: quickItems } }
            : {})
      }]
    };

    const res = await callLineAPITenant(tenantRef, '/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text().catch(()=>'');
      console.error('REPLY_FLEX_MANY_ERR', res.status, errText);
    }
    return res;
  } catch (e) {
    console.error('REPLY_FLEX_MANY_EX', e);
    // ถ้ายังไม่เคยส่ง reply มาก่อน ลอง fallback ข้อความง่าย ๆ
    try { return reply(replyToken, 'ไม่สามารถแสดงการ์ดได้ในขณะนี้', null, tenantRef); }
    catch (_) { /* เงียบไว้ */ }
  }
}
function makeAssignPreviewBubble({ tmpId, assign, assignee }) {
  return {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type:'text', text:'พรีวิวมอบหมายงาน', weight:'bold', size:'md' },
        { type:'text', text: assign.detail, wrap:true, size:'sm', color:'#333333', margin:'sm' },
        { type:'separator', margin:'md' },
        {
          type:'box', layout:'vertical', spacing:'xs', margin:'md',
          contents: [
            { type:'text', text:`ผู้รับ: ${assignee.username || assignee.real_name || assign.assigneeName}`, size:'xs', color:'#555555' },
            { type:'text', text:`กำหนดส่ง: ${assign.deadline ? String(assign.deadline).replace('T',' ') : '-'}`, size:'xs', color:'#555555' },
            { type:'text', text:'สถานะ: PENDING', size:'xs', color:'#9E9E9E' }
          ]
        }
      ]
    },
    footer: {
      type:'box', layout:'vertical', spacing:'sm',
      contents:[
        { type:'button', style:'primary', height:'sm',
          action:{ type:'message', label:'ยืนยันมอบหมาย', text:`ยืนยันมอบหมาย ${tmpId}` } },
        { type:'button', style:'secondary', height:'sm',
          action:{ type:'message', label:'ยกเลิก', text:`ยกเลิกมอบหมาย ${tmpId}` } }
      ]
    }
  };
}



// ========== Push helpers ==========
async function pushText(to, text, tenantRef) {
  if (!to) { warn('PUSH', 'skip: empty "to"'); return; }
  const msg = { type: 'text', text: String(text || '') };
  log('PUSH', `to=${to}`, `len=${msg.text.length}`);
  const res = await callLineAPITenant(tenantRef, '/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, messages: [msg] })
  });
  if (!res.ok) console.error('PUSH_ERR', res.status, await res.text().catch(()=>'')); 
}

// ================== Daily 17:30 Reminders (Mon-Fri, Asia/Bangkok) ==================
const DAILY_TZ = 'Asia/Bangkok';

/** ดึง tenants ที่เปิดใช้ taskbot */
async function getEnabledTenants() {
  const col = await admin.firestore().collection('tenants').get();
  const out = [];
  for (const doc of col.docs) {
    try {
      const integ = await doc.ref.collection('integrations').doc('taskbot').get();
      const d = integ.exists ? integ.data() : null;
      if (d?.enabled) out.push(doc.ref);
    } catch {}
  }
  return out;
}

async function pushFlex(tenantRef, to, bubble, altText = 'Task update') {
  const accessToken = await getTenantSecretAccessToken(tenantRef);
  await fetchFn('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'flex', altText, contents: bubble }]
    })
  }).then(r => { if (!r.ok) console.error('[pushFlex]', r.status); });
}


/** พยายามดึงงานของ user "ที่ยังคงเหลือวันนี้" จาก Apps Script (รองรับหลายรูปแบบ payload) */
async function listTodayOpenTasks(tenantRef, assigneeId) {
  const todayISO = new Date().toISOString().slice(0,10); // YYYY-MM-DD
  // รูปแบบหลัก: list_tasks + filter ใน payload
  try {
    const r = await callAppsScriptForTenant(tenantRef, 'list_tasks', {
      assignee_id: assigneeId,
      due: 'today',
      status_in: ['pending','doing']
    });
    if (Array.isArray(r?.tasks)) return r.tasks;
    if (Array.isArray(r?.data))  return r.data;
  } catch {}

  // สำรอง 1: list_tasks แบบกำหนด date
  try {
    const r = await callAppsScriptForTenant(tenantRef, 'list_tasks', {
      assignee_id: assigneeId,
      date: todayISO
    });
    if (Array.isArray(r?.tasks)) return r.tasks;
    if (Array.isArray(r?.data))  return r.data;
  } catch {}

  // สำรอง 2: tasks_of (บางสคริปต์ตั้งชื่อแบบนี้)
  try {
    const r = await callAppsScriptForTenant(tenantRef, 'tasks_of', {
      user_id: assigneeId, date: todayISO
    });
    if (Array.isArray(r?.tasks)) return r.tasks;
    if (Array.isArray(r?.data))  return r.data;
  } catch {}

  return [];
}

/** จัดรูปข้อความสรุปสำหรับผู้ใช้ 1 คน */
function buildDailySummaryText(username, tasks) {
  const dateStr = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: DAILY_TZ }).format(new Date());
  if (!tasks.length) {
    return `สรุปงานคงเหลือวันนี้ (${dateStr})\n@${username}\nวันนี้ไม่มีงานคงเหลือ 🎉`;
  }
  const lines = [];
  lines.push(`สรุปงานคงเหลือวันนี้ (${dateStr})`);
  lines.push(`@${username} • ทั้งหมด ${tasks.length} งาน`);
  lines.push('');
  const top = tasks.slice(0, 8); // แสดงสูงสุด 8 รายการ
  for (const t of top) {
    const id   = t.task_id || t.id || '';
    const det  = t.task_detail || t.detail || t.title || '(ไม่มีรายละเอียด)';
    const dl   = t.deadline || t.due_at || '';
    let dlShow = '';
    if (dl) {
      // ถ้าเป็น ISO → ตัดเหลือเวลา
      const m = String(dl).match(/T(\d{2}:\d{2})/);
      dlShow = m ? m[1] : String(dl);
    }
    lines.push(`• ${id ? '#'+String(id).slice(-6)+' ' : ''}${det}${dlShow ? ` (กำหนด ${dlShow})` : ''}`);
  }
  if (tasks.length > top.length) {
    lines.push(`…และอีก ${tasks.length - top.length} งาน`);
  }
  return lines.join('\n');
}

/** รันแจ้งเตือนสำหรับ tenant เดียว */
async function runDailyReminderForTenant(tenantRef) {
  // 1) ดึงรายชื่อผู้ใช้จากชีต
  let users = [];
  try {
    const r = await callAppsScriptForTenant(tenantRef, 'list_users', {});
    users = Array.isArray(r?.users) ? r.users : [];
  } catch (e) {
    console.error('[REMINDER] list_users failed:', e?.message || e);
    return;
  }
  if (!users.length) return;

  // 2) loop ผู้ใช้ แล้วส่งสรุปเป็นข้อความ
  for (const u of users) {
    const to = u.user_id || u.line_user_id || '';
    if (!to) continue; // ไม่มี LINE user id ก็ข้าม

    const username = u.username || u.real_name || 'คุณ';
    let tasks = [];
    try {
      tasks = await listTodayOpenTasks(tenantRef, to);
    } catch (e) {
      console.error('[REMINDER] listTodayOpenTasks failed for', to, e?.message || e);
      tasks = [];
    }

    const msg = buildDailySummaryText(username, tasks);
    await pushText(to, msg, tenantRef);
  }
}

/** รันแจ้งเตือนสำหรับทุก tenant ที่ enabled */
async function runDailyRemindersAllTenants() {
  try {
    const tenants = await getEnabledTenants();
    console.log('[REMINDER] tenants to notify:', tenants.length);
    for (const tRef of tenants) {
      try {
        await runDailyReminderForTenant(tRef);
      } catch (e) {
        console.error('[REMINDER] tenant failed:', tRef?.id, e?.message || e);
      }
    }
    console.log('[REMINDER] done.');
  } catch (e) {
    console.error('[REMINDER] all-tenants error:', e?.message || e);
  }
}
// ================== /Daily 17:30 Reminders ==================



async function pushTextQuick(to, text, quickItems, tenantRef) {
  if (!to) return;
  const msg = { type: 'text', text: String(text || '') };
  if (Array.isArray(quickItems) && quickItems.length > 0) {
    msg.quickReply = { items: quickItems };
  }
  const res = await callLineAPITenant(tenantRef, '/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, messages: [msg] })
  });
  if (!res.ok) console.error('PUSH_QR_ERR', res.status, await res.text().catch(()=>'')); 
}


async function getDisplayName(tenantRef, userId) {
  try {
    const r = await callLineAPITenant(tenantRef, '/v2/bot/profile/' + encodeURIComponent(userId), { method: 'GET' });
    if (!r.ok) return '';
    const j = await r.json();
    return j.displayName || '';
  } catch { return ''; }
}

async function linkRichMenuToUser(tenantRef, userId, richMenuId) {
  if (!userId || !richMenuId) return;
  await callLineAPITenant(tenantRef, `/v2/bot/user/${encodeURIComponent(userId)}/richmenu/${encodeURIComponent(richMenuId)}`, {
    method: 'POST'
  });
}

async function setDefaultRichMenu(tenantRef, richMenuId) {
  // ถ้าไม่ให้ id มา → ให้ตีความว่า "ยกเลิก default"
  if (!richMenuId) return unsetDefaultRichMenu(tenantRef);
  await callLineAPITenant(
    tenantRef,
    `/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`,
    { method: 'POST' }
  );
}

// NEW: ยกเลิก default rich menu ของ OA
async function unsetDefaultRichMenu(tenantRef) {
  await callLineAPITenant(
    tenantRef,
    `/v2/bot/user/all/richmenu`,
    { method: 'DELETE' }
  );
}


// (กรณีต้องการลิงก์ให้ทุก user)
async function linkRichMenuToAllUsers(tenantRef, richMenuId) {
  if (!richMenuId) return;
  try {
    const r = await callAppsScriptForTenant(tenantRef, 'list_users', {});
    const users = r.users || [];
    for (const u of users) {
      if (!u.user_id) continue;
      try {
        await linkRichMenuToUser(tenantRef, u.user_id, richMenuId);
        await new Promise(res => setTimeout(res, 60)); // กัน rate limit
      } catch (e) {
        console.error('LINK_RM_USER_ERR', u.user_id, e?.status || e);
      }
    }
  } catch (e) {
    console.error('LINK_RM_ALL_ERR', e);
  }
}



// ใช้อันนี้แทนทั้งหมด
async function loadRichMenuTemplate(name) {
  const candidates = [
    // โฟลเดอร์เดียวกับ server.js (react-basic)
    path.join(__dirname, `${name}.json`),
    // โฟลเดอร์ที่รัน (เวลาคุณ npm start ใน react-basic ก็ตรงกันกับ __dirname)
    path.join(process.cwd(), `${name}.json`),

    // เผื่อวางไว้ชั้นบน หรือในโฟลเดอร์ main/public
    path.join(path.dirname(process.cwd()), `${name}.json`),
    path.join(__dirname, 'main', `${name}.json`),
    path.join(process.cwd(), 'main', `${name}.json`),
    path.join(__dirname, 'public', `${name}.json`),
  ];

  for (const p of candidates) {
    try {
      const s = await fsp.readFile(p, 'utf8');   // ← ใช้ fsp (fs/promises)
      console.log(`[richmenu] loaded template: ${p}`);
      return JSON.parse(s);
    } catch (_) {}
  }
  console.warn('[richmenu] template search paths:', candidates);
  throw new Error(`template_not_found:${name}`);
}

// แปลง bounds ในไฟล์เทมเพลตให้เป็น px ที่ LINE ต้องการ
function toAreasPxFromTemplate(tpl) {
  const areas = Array.isArray(tpl?.areas) ? tpl.areas : [];
  return areas.map(a => {
    const b = a.bounds || {};
    const x = Number(b.x) || 0, y = Number(b.y) || 0;
    const w = Number(b.width ?? b.w) || 0, h = Number(b.height ?? b.h) || 0;
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h, action: a.action };
  }).filter(Boolean);
}

// App script helpers

// async function callAppsScript(action, data) {
//   if (!APPS_SCRIPT_EXEC_URL) throw new Error('Missing APPS_SCRIPT_EXEC_URL');
//   const key = APP_SHARED_KEY || process.env.APP_SCRIPT_SHARED_KEY || '';
//   const res = await fetchFn(APPS_SCRIPT_EXEC_URL, {
//     method:'POST',
//     headers:{ 'Content-Type':'application/json' },
//     body: JSON.stringify({ action, app_key:key, ...data })
//   });
//   const j = await res.json();
//   if (!j.ok) throw new Error('AppsScript error: '+(j.error||'unknown'));
//   return j;
// }


// ฟังก์ชันอัปเดต role แบบทนทาน: ลองหลาย action เผื่อชื่อใน Apps Script ต่างกัน
async function gsSetUserRole(user_id, role) {
  const payload = { user_id, role };
  try {
    return await callAppsScript('set_user_role', payload);
  } catch (e1) {
    console.warn('set_user_role failed, fallback to update_user', e1?.message || e1);
    try {
      return await callAppsScript('update_user', payload);
    } catch (e2) {
      console.error('update_user failed, fallback to upsert_user', e2?.message || e2);
      return await callAppsScript('upsert_user', payload);
    }
  }
}

async function gsSetUserStatus(user_id, status) {
  const payload = { user_id, status };
  try {
    return await callAppsScript('set_user_status', payload);
  } catch (e1) {
    console.warn('set_user_status failed, fallback to update_user', e1?.message || e1);
    try {
      return await callAppsScript('update_user', payload);
    } catch (e2) {
      console.error('update_user failed, fallback to upsert_user', e2?.message || e2);
      return await callAppsScript('upsert_user', payload);
    }
  }
}

// [MERGE:STEP6] Apps Script per-tenant with fallback + cache
const _taskbotSecretsCache = new Map(); // tid -> { execUrl, sharedKey, at }
const APPS_FALLBACK = {
  execUrl: process.env.APPS_SCRIPT_EXEC_URL || '',
  sharedKey: process.env.APP_SHARED_KEY || process.env.APPS_SCRIPT_SHARED_KEY || ''
};

async function readTaskBotSecrets(tenantRef) {
  const tid = tenantRef.id || tenantRef;
  const cached = _taskbotSecretsCache.get(tid);
  if (cached && (Date.now() - cached.at < 5 * 60 * 1000)) return cached; // cache 5 นาที

  // อ่านจาก tenants/{tid}/integrations/taskbot และ fallback ที่ tenants/{tid}/secret/v1
  let integ = {};
  try {
    const i = await tenantRef.collection('integrations').doc('taskbot').get();
    integ = i.exists ? i.data() : {};
  } catch {}

  let secV1 = {};
  try {
    const s = await tenantRef.collection('secret').doc('v1').get();
    secV1 = s.exists ? s.data() : {};
  } catch {}

  const execUrl   = String(integ.execUrl || secV1.appsScriptExecUrl || APPS_FALLBACK.execUrl || '');
  const sharedKey = String(integ.sharedKey || secV1.appsScriptSharedKey || APPS_FALLBACK.sharedKey || '');

  const out = { execUrl, sharedKey, at: Date.now() };
  _taskbotSecretsCache.set(tid, out);
  return out;
}




// ── Task helpers (per-tenant)
async function getTaskById(tenantRef, task_id) {
  try {
    const r = await callAppsScriptForTenant(tenantRef, 'get_task', { task_id });
    if (r && r.ok && r.task) return r.task;
  } catch {}
  try {
    const all = await callAppsScriptForTenant(tenantRef, 'list_tasks', {});
    return (all.tasks || []).find(t => String(t.task_id) === String(task_id)) || null;
  } catch { return null; }
}

// merge update บางฟิลด์
async function updateTaskFields(tenantRef, taskId, patch) {
  const cur = await getTaskById(tenantRef, taskId);
  if (!cur) throw new Error('task not found: ' + taskId);

  const assignerId = cur.assigner_id || cur.assignerId || '';
  const assigneeId = cur.assignee_id || cur.assigneeId || '';

  const merged = {
    task_id:       cur.task_id,
    assigner_name: cur.assigner_name || '',
    assigner_id:   assignerId,
    assignee_name: cur.assignee_name || '',
    assignee_id:   assigneeId,
    task_detail:   cur.task_detail || '',
    status:        cur.status || 'pending',
    created_date:  cur.created_date || new Date().toISOString(),
    updated_date:  new Date().toISOString(),
    deadline:      cur.deadline || '',
    note:          cur.note || '',
    ...patch
  };

  await callAppsScriptForTenant(tenantRef, 'upsert_task', merged);
  return merged;
}


async function resolveAssignee(tenantRef, mention) {
  const key = String(mention || '').trim().toLowerCase();
  if (!key) return null;
  const r = await callAppsScriptForTenant(tenantRef, 'list_users', {});
  const users = r.users || [];
  let hit = users.find(u =>
    String(u.user_id || '') === mention ||
    String(u.username || '').toLowerCase() === key ||
    String(u.real_name || '').toLowerCase() === key
  );
  if (hit) return hit;
  hit = users.find(u =>
    String(u.username || '').toLowerCase().includes(key) ||
    String(u.real_name || '').toLowerCase().includes(key)
  );
  return hit || null;
}

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'dev') return 'developer';
  if (['admin','supervisor','user','developer'].includes(r)) return r;
  return 'user';
}

function roleLabel(role) {
  switch (normalizeRole(role)) {
    case 'admin': return 'ผู้ดูแล';
    case 'supervisor': return 'หัวหน้างาน';
    case 'developer': return 'นักพัฒนา';
    default: return 'ผู้ใช้งาน';
  }
}

function roleRank(role) {
  switch (normalizeRole(role)) {
    case 'developer': return 0;
    case 'admin':     return 1;
    case 'supervisor':return 2;
    case 'user':      return 3;
    default:          return 9;
  }
}

function isAtLeast(userRole, minRole) {
  return roleRank(userRole) <= roleRank(minRole);
}

function shortId(id) {
  const s = String(id || '');
  return s.length <= 6 ? s : s.slice(-6);
}

// ------- Card Renderers -------
// ------- Icons & helpers (แนะนำวางไว้ใกล้ ๆ helper อื่น ๆ) -------
function statusEmoji(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'done')  return '✅ DONE';
  if (v === 'doing') return '🟡 DOING';
  return '⏳ PENDING';
}
function statusColorHex(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'done')  return '#2e7d32';
  if (v === 'doing') return '#1565c0';
  return '#9e9e9e';
}
function fmtThaiDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  return d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
}

// ------- Card Renderer (REPLACE ของเดิมทั้งก้อน) -------
function renderTaskCard({ id, title, date, due, status, assignee, assigner }, options = {}) {
  const showStatusButtons = options.showStatusButtons !== false; // default: true
  const showRemind        = !!options.showRemind;                // default: false

  const badge       = statusEmoji(status);
  const statusColor = statusColorHex(status);

  const footerContents = [];

  // ปุ่มสถานะ
  if (showStatusButtons) {
    footerContents.push(
      { type:'button', style:'primary',   height:'sm',
        action:{ type:'message', label:'✅ เสร็จแล้ว', text:`done ${id}` } },
      { type:'button', style:'secondary', height:'sm',
        action:{ type:'message', label:'⏳ กำลังทำ', text:`กำลังดำเนินการ ${id}` } }
    );
  }
  // ปุ่มเตือนงาน (เฉพาะบางจอ)
  if (showRemind) {
    footerContents.push(
      { type:'button', style:'secondary', height:'sm',
        action:{ type:'message', label:'🔔 เตือนงาน', text:`เตือน ${id}` } }
    );
  }

  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        // แถว badge สถานะ (มีไอคอน)
        { type: 'text', text: badge, size: 'xs', color: '#888888' },

        // หัวเรื่องงาน
        { type: 'text', text: title || '-', weight: 'bold', wrap: true },

        // รายละเอียดเสริมพร้อมไอคอน
        {
          type: 'box', layout: 'vertical', spacing: 'xs', contents: [
            { type: 'text', text: `🆔 ${id}`,                       size: 'xs', color: '#777777' },
            { type: 'text', text: `🗓️ อัปเดต: ${date || '-'}`,     size: 'xs', color: '#777777' },
            { type: 'text', text: `⏰ กำหนดส่ง: ${due || '-'}`,     size: 'xs', color: '#555555' },
            assignee ? { type: 'text', text: `👤 ผู้รับ: ${assignee}`, size: 'xs', color: '#555555', wrap: true } : { type:'filler' },
            assigner ? { type: 'text', text: `🧑‍💼 ผู้สั่ง: ${assigner}`, size: 'xs', color: '#555555', wrap: true } : { type:'filler' }
          ]
        },

        // แถบสถานะตัวอักษร (คงไว้เพื่อสี/การ scan)
        {
          type: 'box', layout: 'baseline', contents: [
            { type: 'text', text: String(status || '').toUpperCase(), size: 'xs', color: statusColor, weight: 'bold' }
          ]
        }
      ]
    },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerContents }
  };
}





function renderUserCard({ name, username, role, status, updated }) {
  const uname = username ? `@${username}` : '';
  return {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type: 'text', text: name || '-', weight: 'bold', wrap: true },
        ...(uname ? [{ type: 'text', text: uname, size: 'xs', color: '#666666' }] : []),
        { type: 'text', text: `บทบาท: ${role || '-'}`, size: 'sm' },
        { type: 'text', text: `สถานะ: ${status || '-'}`, size: 'sm' },
        { type: 'text', text: `อัปเดต: ${updated || '-'}`, size: 'xs', color: '#777777' }
      ]
    }
  };
}

// ---- Role & Permission helpers ----
async function getUserRole(user_id){
  try{
    const r = await callAppsScript('get_user', { user_id });
    return String(r?.user?.role || 'user').toLowerCase();
  }catch(_){ return 'user'; }
}
// ใส่ tenantRef ด้วย เพราะ getUserRole ต้องใช้
async function canModifyTask(tenantRef, actorId, task) {
  if (!task) return false;

  const assignerId = String(task.assigner_id || task.assignerId || '');
  const assigneeId = String(task.assignee_id || task.assigneeId || '');

  // อนุญาตทั้งผู้สั่งและผู้รับ
  if (String(actorId) === assignerId || String(actorId) === assigneeId) return true;

  // สิทธิ์ตามบทบาท
  const role = (await getUserRole(tenantRef, actorId)) || '';
  return ['developer','admin','supervisor'].includes(role.toLowerCase());
}


// ── Pager (ตาราง Flex + ปุ่มเลื่อนหน้า)
const pagerStore = new Map(); // key: userId → { key, rows, page, title, pageSize }
const PAGE_SIZE = 8;

function renderFlexTable(title, headers, rowsPage) {
  const header = {
    type: 'box',
    layout: 'horizontal',
    contents: headers.map(h => ({
      type: 'text',
      text: String(h || '-'),
      size: 'sm',
      weight: 'bold',
      color: '#555555',
      flex: 1,
      wrap: true
    }))
  };

  const lines = rowsPage.map((row, i) => {
    const cols = Array.isArray(row)
      ? row
      : [row?.date, row?.title, row?.due, row?.status];

    return {
      type: 'box',
      layout: 'vertical',
      margin: 'sm',
      backgroundColor: i % 2 === 0 ? '#F9F9F9' : '#FFFFFF',
      paddingAll: '4px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: String(cols[0] ?? '-'), size: 'xs', flex: 2, color: '#888888' },
            { type: 'text', text: String(cols[1] ?? '-'), size: 'sm', flex: 8, wrap: true, weight: 'bold' }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: String(cols[2] ?? '-'), size: 'xs', flex: 5, color: '#666666' },
            { type: 'text', text: String(cols[3] ?? '-'), size: 'xs', flex: 3, align: 'end', color: '#0066CC' }
          ]
        }
      ]
    };
  });

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'text', text: title, weight: 'bold', size: 'md' }]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [header, { type: 'separator', margin: 'sm' }, ...lines]
    }
  };
}


async function startPager(tenantRef, userId, replyToken, key, allRows, title){
  const state = { key, rows: allRows, page: 0, title, pageSize: PAGE_SIZE };
  pagerStore.set(userId, state);
  await sendPage(tenantRef, userId, replyToken);
}
async function sendPage(tenantRef, userId, replyToken){
  const st = pagerStore.get(userId); if (!st) return;

  const total = st.rows.length;
  const start = st.page * st.pageSize;
  const end   = Math.min(start + st.pageSize, total);
  const pageRows = st.rows.slice(start, end);
  const totalPages = Math.max(1, Math.ceil(Math.max(0,total)/st.pageSize));
  const title = `${st.title} — หน้า ${st.page+1}/${totalPages}`;

  // เลือกหัวคอลัมน์ให้เหมาะกับ key
  let headers;
  switch (st.key) {
    case 'users':
      headers = ['อัปเดต', 'ผู้ใช้ (บทบาท)', 'สถานะ', '-'];
      break;
    case 'mine_assigned':
      headers = ['วันที่', 'รายการ (#ID)', 'ผู้รับ', 'สถานะ'];
      break;
    case 'mine_pending':
    case 'today':
    case 'mine_range':
      headers = ['วันที่', 'รายการ (#ID)', 'กำหนดส่ง', 'สถานะ'];
      break;
    default:
      headers = ['วันที่', 'รายการ', 'กำหนดส่ง', 'สถานะ'];
  }

  // ปุ่มเลื่อนหน้า
  const quick = [];
  if (st.page > 0) quick.push({ type:'action', action:{ type:'message', label:'← ก่อนหน้า', text:'← ก่อนหน้า' }});
  if (st.page < totalPages-1) quick.push({ type:'action', action:{ type:'message', label:'ถัดไป →', text:'ถัดไป →' }});

  await replyFlex(replyToken, renderFlexTable(title, headers, pageRows), quick, tenantRef);

}

async function turnPage(tenantRef, userId, replyToken, delta){
  const st = pagerStore.get(userId); if (!st) return;
  const total = st.rows.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(0,total)/st.pageSize));
  st.page = Math.min(totalPages-1, Math.max(0, st.page + delta));
  await sendPage(tenantRef, userId, replyToken);
}

// ---------- QnA helpers ----------
const normalize = (s) => (s || '').toLowerCase().trim();

function listMessage(heading, items) {
  const lines = (items || []).map((it, i) => `${i + 1}. ${it.q}`);
  return [heading || 'คำถามยอดฮิต', ...lines].join('\n');
}
function toQuickReplies(items) {
  return {
    items: (items || []).slice(0, 13).map((_, i) => ({
      type: 'action',
      action: { type: 'message', label: String(i + 1), text: String(i + 1) }
    }))
  };
}

// session เก็บต่อ user ต่อ tenant
function userSessRef(tenantRef, userId) {
  return tenantRef.collection('userSessions').doc(userId);
}
async function setSession(tenantRef, userId, s) {
  await userSessRef(tenantRef, userId).set(
    { ...s, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}
async function getSession(tenantRef, userId) {
  const snap = await userSessRef(tenantRef, userId).get();
  return snap.exists ? snap.data() : null;
}
async function clearSession(tenantRef, userId) {
  await userSessRef(tenantRef, userId).delete().catch(() => {});
}

// ดึงชุด QnA จาก rich menu ที่ ready/ใช้งานอยู่ (เลือกตามช่วงเวลา ถ้ามี)
async function findQnaSetByKey(tenantRef, key) {
  const nowMs = Date.now();
  const q = await tenantRef
    .collection('richmenus')
    .where('status', '==', 'ready')
    .orderBy('updatedAt', 'desc')
    .limit(30)
    .get();

  const candidates = [];
  for (const d of q.docs) {
    const data = d.data() || {};
    const from = data.scheduleFrom?.toDate?.() || null;
    const to   = data.scheduleTo?.toDate?.()   || null;
    if (from && from.getTime() > nowMs) continue;
    if (to && to.getTime() < nowMs) continue;

    for (const a of data.areas || []) {
      const act = a.action || {};
      if (act.type === 'QnA' && (act.qnaKey || '') === key) {
        const items = Array.isArray(act.items) ? act.items : [];
        if (items.length === 0) continue; // <<< อย่าคัดตัวว่าง
        candidates.push({
          docId: d.id,
          updatedAt: data.updatedAt?.toMillis?.() || 0,
          scheduleFrom: data.scheduleFrom?.toMillis?.() || 0,
          qna: {
            items,
            displayText: act.displayText || null,
            fallbackReply: act.fallbackReply || 'ยังไม่พบคำตอบ ลองเลือกหมายเลขจากรายการนะคะ',
          },
        });
      }
    }
  }
  if (!candidates.length) return null;
  // เลือกตัว “ล่าสุดที่เริ่มแสดงแล้ว” โดยให้ weight กับ scheduleFrom ก่อน แล้วค่อย updatedAt
  candidates.sort((a, b) => (b.scheduleFrom - a.scheduleFrom) || (b.updatedAt - a.updatedAt));
  const best = candidates[0];
  console.log('[QNA:pick]', { key, docId: best.docId, items: best.qna.items.length });
  return best.qna;
}


function extractQnaFromDoc(data, key) {
  for (const a of data.areas || []) {
    const act = a.action || {};
    if (act.type === 'QnA' && (act.qnaKey || '') === key) {
      return {
        items: Array.isArray(act.items) ? act.items : [],
        displayText: act.displayText || null,
        fallbackReply: act.fallbackReply || 'ยังไม่พบคำตอบ ลองเลือกหมายเลขจากรายการนะคะ'
      };
    }
  }
  return null;
}

// ใช้ default rich menu ของ OA ปัจจุบันเป็นตัวอ้างอิง แล้วดึง QnA set จาก doc ใน Firestore
async function findQnaSetByKeyViaDefault(tenantRef, key) {
  try {
    const resp = await callLineAPITenant(tenantRef, '/v2/bot/user/all/richmenu', { method: 'GET' });

    if (resp.status === 404) return null; // ยังไม่ตั้ง default
    if (!resp.ok) {
      console.warn('[findQnaSetByKeyViaDefault] LINE default richmenu error', resp.status);
      return null;
    }
    const { richMenuId } = await resp.json();
    if (!richMenuId) return null;

    const snap = await tenantRef.collection('richmenus')
      .where('lineRichMenuId', '==', richMenuId).limit(1).get();

    let docData = null;
    if (!snap.empty) docData = snap.docs[0].data();
    else {
      const alt = await tenantRef.collection('richmenus').doc('MAIN').get();
      if (alt.exists) docData = alt.data();
    }
    if (!docData) return null;
    return extractQnaFromDoc(docData, key);
  } catch { return null; }
}



async function lineReply(accessToken, replyToken, messages) {
  const r = await fetchFn('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!r.ok) {
    const t = await r.text().catch(()=>'');
    console.error('[lineReply] error', r.status, t);
  }
}

// ไม่ต้องเช็คสิทธิ์สมาชิก เพราะ webhook มาจาก LINE
async function getTenantById(tid) {
  const ref = admin.firestore().collection('tenants').doc(tid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data(), ref };
}

// MAIN: 6 ปุ่ม 2 แถว
const MAIN_AREAS_PX = [
  { bounds:{ x:0,    y:0,   width:833,  height:843 },  action:{ type:'message', text:'สั่งงาน' } },
  { bounds:{ x:833,  y:0,   width:834,  height:843 },  action:{ type:'message', text:'ดูงานค้างทั้งหมด' } },
  { bounds:{ x:1667, y:0,   width:833,  height:843 },  action:{ type:'message', text:'ดูงานที่ฉันสั่ง' } },
  { bounds:{ x:0,    y:843, width:833,  height:843 },  action:{ type:'message', text:'งานของฉันวันนี้' } },
  { bounds:{ x:833,  y:843, width:834,  height:843 },  action:{ type:'message', text:'ดูผู้ใช้งานทั้งหมด' } },
  { bounds:{ x:1667, y:843, width:833,  height:843 },  action:{ type:'message', text:'ช่วยเหลือ' } },
]; // อ้างอิงจาก main.json ตรง ๆ :contentReference[oaicite:4]{index=4}

// PREREG: 4 ปุ่ม (ปุ่มบนเต็มแถว)
const PREREG_AREAS_PX = [
  { bounds:{ x:0,    y:0,   width:2500, height:860 }, action:{ type:'message', text:'ลงทะเบียน' } },
  { bounds:{ x:0,    y:860, width:833,  height:826 }, action:{ type:'message', text:'ดูผู้ใช้งานทั้งหมด' } },
  { bounds:{ x:833,  y:860, width:834,  height:826 }, action:{ type:'message', text:'ช่วยเหลือ' } },
  { bounds:{ x:1667, y:860, width:833,  height:826 }, action:{ type:'message', text:'ติดต่อแอดมิน' } },
]; // อ้างอิงจาก prereg.json ตรง ๆ :contentReference[oaicite:5]{index=5}


// ตรวจสิทธิ์ว่า user เป็นสมาชิก tenant นี้จริง
async function getTenantOrThrow(tid, user) {
  if (!user || !user.uid) throw new Error('unauthenticated');
  // ถ้าคุณมี helper ชื่อ getTenantIfMember อยู่แล้ว ใช้อันนี้ได้เลย
  const tenant = await getTenantIfMember(tid, user.uid);
  if (!tenant) throw new Error('not_member_of_tenant');
  return tenant; // { ref, data, id, ... } ตามที่ getTenantIfMember คืนมา
}


// === Helpers for Rich Menu ===
function mapActionForLINE(a = {}) {
  switch (a.type) {
    case 'Link':
      return { type: 'uri', label: (a.label || 'Open').slice(0, 20), uri: a.url || 'https://example.com' };
    case 'Text':
      return { type: 'message', text: a.text || 'Hello!' };
    case 'QnA':
      return {
       type: 'postback',
       data: `qna:${a.qnaKey || ''}`,
     };
    case 'Live Chat':
      return { type: 'message', text: a.liveText || '#live' };
    default:
      return { type: 'postback', data: 'noop' };
  }
}

function toPxAreas({ areas = [], width = 2500, height = 1686 }) {
  return areas.map((a) => ({
    bounds: {
      x: Math.round((Number(a.xPct) || 0) * width),
      y: Math.round((Number(a.yPct) || 0) * height),
      width: Math.round((Number(a.wPct) || 0) * width),
      height: Math.round((Number(a.hPct) || 0) * height),
    },
    action: mapActionForLINE(a.action || {}),
  }));
}

function normalizeAreas(areasPx = []) {
  return areasPx.map(a => {
    if (a?.bounds) {
      const { x, y, width, height } = a.bounds;
      return { bounds: { x, y, width, height }, action: a.action };
    }
    // รองรับคีย์แบบแบน x,y,w,h หรือ width,height
    const x = a.x ?? a.left ?? 0;
    const y = a.y ?? a.top ?? 0;
    const w = a.w ?? a.width;
    const h = a.h ?? a.height;
    return { bounds: { x, y, width: w, height: h }, action: a.action };
  });
}

// ใช้ helper จากข้อ 1: buildLineRichMenuPayload / toLineAction / normalizeAreasToBounds
// ใช้ 'areasPx' ตรงๆ — ไม่คำนวณใหม่/ไม่เติมช่องเพิ่ม
// รองรับทั้งรูปแบบ {bounds:{x,y,width,height}, action} และ {x,y,w,h, action}
function normalizeAreas(areasPx = []) {
  return areasPx.map(a => {
    if (a?.bounds) {
      const { x, y, width, height } = a.bounds;
      return { bounds: { x, y, width, height }, action: a.action };
    }
    // รองรับคีย์แบบแบน x,y,w,h หรือ width,height
    const x = a.x ?? a.left ?? 0;
    const y = a.y ?? a.top ?? 0;
    const w = a.w ?? a.width;
    const h = a.h ?? a.height;
    return { bounds: { x, y, width: w, height: h }, action: a.action };
  });
}

// ✅ Unified: always delegate image upload to uploadImageToLINE (auto-compress < 1MB)
async function createAndUploadRichMenuOnLINE({
  accessToken,
  title = 'Menu',
  chatBarText = 'Menu',
  size = 'large',
  areasPx = [],
  imageUrl,
  // ถ้าอยากบังคับพฤติกรรมเดิมให้ภาพเต็มกรอบ ให้ส่ง useCover = true
  useCover = false
}) {
  // 1) สร้าง payload (เหมือนเดิม)
  const sizeObj = size === 'large'
    ? { width: 2500, height: 1686 }
    : { width: 2500, height: 843 };

  const body = {
    size: sizeObj,
    selected: false,
    name: title,
    chatBarText,
    areas: normalizeAreas(areasPx),
  };

  console.log('[RM] create payload', {
    title,
    chatBarText,
    size,
    areas: body.areas.length
  });

  const createRes = await callLineAPI('/v2/bot/richmenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, accessToken);

  const createTxt = await createRes.text().catch(() => '');
  if (!createRes.ok) {
    console.error('[RM] create FAIL', createRes.status, createTxt);
    throw new Error('LINE create richmenu error: ' + createTxt);
  }
  const { richMenuId } = JSON.parse(createTxt || '{}');
  console.log('[RM] created id=', richMenuId);

  // 2) อัปโหลดรูป — ใช้ helper เดียวที่บีบอัดจน < 1MB และมี log [UPLOAD][compress]
  //    บังคับให้เป็น absolute URL + alt=media (ถ้ามี helper)
  let absUrl = typeof toAbsoluteAssetUrl === 'function'
    ? toAbsoluteAssetUrl(imageUrl)
    : imageUrl;
  if (typeof withAltMedia === 'function') {
    absUrl = withAltMedia(absUrl);
  }

  await uploadImageToLINE({
    accessToken,
    richMenuId,
    imageUrl: absUrl,
    useCover,          // ส่งต่อพฤติกรรมเดิม (cover/contain) ให้ helper จัดการ
  });

  return { richMenuId };
}








const RICH_SIZE_LARGE = { width: 2500, height: 1686 };
const RICH_SIZE_SMALL = { width: 2500, height: 843 };

// รับ areas ได้หลายรูปแบบ แล้วแปลงเป็น px เสมอ
function toAreasPx(areas, size = RICH_SIZE_LARGE) {
  if (!Array.isArray(areas)) return [];
  const W = size.width, H = size.height;

  const num = v => (v == null ? 0 : Number(v));
  const pct = v => Math.round(num(v) * (String(v).includes('%') ? 0.01 : 1)); // กัน input แปลก

  return areas.map(a => {
    let x, y, w, h;

    if (a.bounds) {
      x = num(a.bounds.x); y = num(a.bounds.y);
      w = num(a.bounds.width ?? a.bounds.w);
      h = num(a.bounds.height ?? a.bounds.h);
    } else if ('x' in a && ('w' in a || 'width' in a)) {
      x = num(a.x); y = num(a.y);
      w = num(a.w ?? a.width);
      h = num(a.h ?? a.height);
    } else if (a.percent) {
      x = Math.round(num(a.percent.x) * W);
      y = Math.round(num(a.percent.y) * H);
      w = Math.round(num(a.percent.w) * W);
      h = Math.round(num(a.percent.h) * H);
    } else {
      // ไม่รู้รูปแบบ → ตัดทิ้ง
      return null;
    }

    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h, action: a.action };
  }).filter(Boolean);
}


// [STEP9:HELPERS]
async function saveTenantRichMenuDoc(tenantRef, kind, lineRichMenuId, imageUrl, areasPx) {
  const doc = {
    kind,                        // 'MAIN' | 'PREREG'
    status: 'ready',
    lineRichMenuId,
    imageUrl,
    areas: areasPx,
    width: 2500,
    height: 1686,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  // เก็บไว้ที่ /tenants/{tid}/richmenus/{kind}
  await tenantRef.collection('richmenus').doc(kind).set(doc, { merge: true });
  return doc;
}

async function getSavedRichMenuByKind(tenantRef, kind) {
  const snap = await tenantRef.collection('richmenus').doc(kind).get();
  return snap.exists ? snap.data() : null;
}



// ✅ Ultra-safe: resize + recompress until < 900KB (supports size)
async function uploadImageToLINE({
  accessToken,
  richMenuId,
  imageUrl,
  useCover = false,
  size = 'large', // <-- เพิ่ม default param
}) {
  if (!accessToken) throw new Error('missing_access_token');
  if (!richMenuId) throw new Error('missing_rich_menu_id');
  if (!imageUrl)   throw new Error('missing_image_url');

  // force absolute + alt=media
  let absUrl = typeof toAbsoluteAssetUrl === 'function'
    ? toAbsoluteAssetUrl(imageUrl)
    : imageUrl;
  if (typeof withAltMedia === 'function') {
    absUrl = withAltMedia(absUrl);
  }

  console.log('[UPLOAD][compress] start', { imageUrl: absUrl, size });

  // 1) fetch original
  const r = await fetchFn(absUrl);
  if (!r.ok) {
    const t = await r.text().catch(()=> '');
    throw new Error(`image_fetch_failed: ${t || r.statusText}`);
  }
  const orig = Buffer.from(await r.arrayBuffer());

  // 2) target size (LINE rich menu)
  const TARGET_W = 2500;
  const TARGET_H = /^(compact|small)$/i.test(String(size)) ? 843 : 1686;
  const fitMode  = useCover ? 'cover' : 'contain';

  // 3) require sharp for compression
  if (typeof _sharp !== 'function') {
    console.error('[UPLOAD][compress] sharp-missing — cannot compress before upload');
    throw new Error('image_compress_unavailable: sharp is not installed. Please install sharp to avoid LINE 413.');
  }

  // 4) compress loop until < 900KB
  let quality = 90;
  let buf = await _sharp(orig)
    .resize(TARGET_W, TARGET_H, { fit: fitMode, background: { r:255, g:255, b:255, alpha:1 } })
    .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' })
    .toBuffer();

  const MAX_BYTES = 900 * 1024;
  let attempts = 0;

  while (buf.length > MAX_BYTES && attempts < 10) {
    quality = Math.max(40, quality - 8);
    buf = await _sharp(buf)
      .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' })
      .toBuffer();
    attempts++;
    console.log('[UPLOAD][compress] pass', { attempts, quality, kb: Math.ceil(buf.length/1024) });
  }

  if (buf.length > MAX_BYTES) {
    quality = Math.max(35, quality - 5);
    buf = await _sharp(buf)
      .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' })
      .toBuffer();
    console.log('[UPLOAD][compress] final', { quality, kb: Math.ceil(buf.length/1024) });
  }

  // 5) upload to LINE
  const uploadRes = await fetchFn(
    `https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/jpeg' },
      body: buf,
    }
  );

  const uploadTxt = await uploadRes.text().catch(()=> '');
  if (!uploadRes.ok) {
    console.error('[UPLOAD][compress] fail', {
      status: uploadRes.status,
      kb: Math.ceil(buf.length/1024),
      msg: uploadTxt || uploadRes.statusText
    });
    throw new Error(`LINE upload error: ${uploadTxt || uploadRes.statusText}`);
  }

  console.log('[UPLOAD][compress] done', { kb: Math.ceil(buf.length/1024) });
  return { richMenuId };
}







// ---------- Live Chat helpers ----------
function liveSessRef(tenantRef, userId) {
  return tenantRef.collection('liveSessions').doc(userId);
}
function liveMsgsRef(tenantRef, userId) {
  return liveSessRef(tenantRef, userId).collection('messages');
}

async function getLineProfile(accessToken, userId) {
  if (!accessToken) return null;
  try {
    const r = await fetchFn('https://api.line.me/v2/bot/profile/' + encodeURIComponent(userId), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!r.ok) return null;
    return await r.json(); // {userId, displayName, pictureUrl, statusMessage?}
  } catch { return null; }
}

async function ensureOpenLiveSession(tenantRef, userId, accessToken) {
  if (!accessToken) {
    try { accessToken = await getTenantSecretAccessToken(tenantRef); } catch {}
  }
  const ref = liveSessRef(tenantRef, userId);
  const snap = await ref.get();
  let profile = null;
  if (!snap.exists) {
    profile = await getLineProfile(accessToken, userId);
    await ref.set({
      userId,
      status: 'open',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      userProfile: profile || null,
      unread: 0,
    }, { merge: true });
  } else if (snap.get('status') !== 'open') {
    await ref.set({
      status: 'open',
      reopenedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } else {
    await ref.set({ lastActiveAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  return ref;
}

async function appendLiveMessage(tenantRef, userId, from, text, meta = {}) {
  const msgs = liveMsgsRef(tenantRef, userId);
  await msgs.add({
    from, // 'user' | 'agent' | 'system'
    text: String(text || ''),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...meta,
  });
  await liveSessRef(tenantRef, userId).set({
    lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageFrom: from,
    lastMessagePreview: String(text || '').slice(0, 200),
  }, { merge: true });
}

async function closeLiveSession(tenantRef, userId) {
  await liveSessRef(tenantRef, userId).set({
    status: 'closed',
    closedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}


// ----- Guest helpers -----
function signGuestToken(payload) {
  return jwt.sign(payload, process.env.GUEST_JWT_SECRET || 'dev-guest', { expiresIn: '180d' });
}
function verifyGuestToken(token) {
  try { return jwt.verify(token, process.env.GUEST_JWT_SECRET || 'dev-guest'); }
  catch { return null; }
}
function ensureGuest(req, res, next) {
  let tok = req.cookies?.guest || '';
  let data = tok ? verifyGuestToken(tok) : null;

  if (!data || !data.gid) {
    data = { gid: crypto.randomUUID(), iat: Date.now()/1000 };
    tok = signGuestToken(data);

    // ⬇️ ใช้ตัวเลือกคุ้กกี้แบบปลอดภัยขึ้น เมื่อรันบนโปรดักชัน (Render)
    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 180 * 24 * 3600 * 1000,           // 180 วัน
      ...(process.env.NODE_ENV === 'production' ? { secure: true } : {}),
    };
    res.cookie('guest', tok, cookieOpts);
  }

  req.guest = data; // { gid }
  next();
}



// ==============================
// 4) LINE Login
// ==============================

// Start: redirect to LINE authorize (hardened "next")
app.get('/auth/line/start', (req, res) => {
  const rawNext = typeof req.query.next === 'string' ? req.query.next : '/';
  // อนุญาตเฉพาะ internal path เพื่อกัน open redirect
  const next = rawNext.startsWith('/') ? rawNext : '/';

  // ⬇️ new: ดึง to จาก query (เช่น ?to=accounts)
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  // ถ้าส่ง ?force=1 (หรือ ?switch_login=1) มา ให้บังคับ re-auth/เลือกบัญชีทุกครั้ง
  const force = req.query.force === '1' || req.query.switch_login === '1';

  const state = Buffer.from(
    JSON.stringify({
      n: Math.random().toString(36).slice(2), // anti-CSRF noise
      next,
      // ⬇️ new: เก็บ to ลง state ด้วย
      to,
      force: !!force,
    }),
    'utf8'
  ).toString('base64url');

  // ใช้ nonce แบบ random bytes
  const nonce = require('crypto').randomBytes(16).toString('hex');

  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.LINE_LOGIN_CHANNEL_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', 'openid profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  // ✅ บังคับเลือกบัญชี/รี‑ล็อกอิน
  if (force) {
    url.searchParams.set('switch_login', 'true'); // ของ LINE เอง
    url.searchParams.set('prompt', 'login');      // OIDC มาตรฐาน (เผื่อไว้)
    url.searchParams.set('max_age', '0');         // ไม่ยอมรับ session เก่า
  }

  res.redirect(url.toString());
});



// Callback: exchange token, upsert user, mint Firebase custom token (hardened "next")
app.get('/auth/line/callback', async (req, res) => {
  try {
    const { code, state: stateStr } = req.query;

    // ดีฟอลต์เสมอเป็นหน้าแรก
    let next = '/';
    let toParam; // 'accounts' | undefined
    try {
      const parsed = JSON.parse(
        Buffer.from(String(stateStr || ''), 'base64url').toString('utf8')
      );
      const candidate = String(parsed.next || '/');
      // อนุญาตเฉพาะ internal path เพื่อกัน open redirect
      next = candidate.startsWith('/') ? candidate : '/';
      // ดึง to จาก state (ใช้เฉพาะค่าที่เรายอมรับ)
      toParam = parsed.to === 'accounts' ? 'accounts' : undefined;
    } catch {
      next = '/';
      toParam = undefined;
    }

    if (!code) return res.status(400).send('Missing code');

    // 1) Exchange code for tokens
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: REDIRECT_URI,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID,
      client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET,
    });

    const tokenRes = await fetchFn('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    const raw = await tokenRes.text();
    if (!tokenRes.ok) return res.status(401).send('Token exchange failed: ' + raw);
    const tokenJson = JSON.parse(raw);

    const { id_token, access_token } = tokenJson;
    const payload = jwt.decode(id_token); // (โปรดตรวจ JWK ในโปรดักชัน)
    const uid = `line:${payload.sub}`;

    // 2) Fetch fresh profile
    let profile = null;
    try {
      const p = await fetchFn('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (p.ok) profile = await p.json(); // { userId, displayName, pictureUrl }
    } catch (e) {
      console.warn('[LINE] profile fetch failed', e);
    }

    const displayName = profile?.displayName || payload.name || payload.display_name || 'LINE User';
    const photoURL   = profile?.pictureUrl || payload.picture || '';

    // 3) Upsert Firestore user
    const db = admin.firestore();
    await db.doc(`users/${uid}`).set({
      displayName,
      photoURL,
      line: {
        userId: profile?.userId || payload.sub,
        displayName: profile?.displayName || null,
        pictureUrl: profile?.pictureUrl || null,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 4) Create Firebase custom token and redirect back to app
    const customToken = await admin.auth().createCustomToken(uid);

    // กลับไปยังหน้า next พร้อม #token และ (ถ้ามี) &to=accounts
    const redirectUrl =
      `${BASE_APP_URL}${next}` +
      `#token=${encodeURIComponent(customToken)}&next=${encodeURIComponent(next)}` +
      (toParam ? `&to=${encodeURIComponent(toParam)}` : '');

    return res.redirect(302, redirectUrl);
  } catch (err) {
    console.error('[CALLBACK] unhandled error', err);
    return res.status(500).send('Callback error: ' + (err?.message || err));
  }
});




// ==============================
// 5) Tenants (Connect OA)
// ==============================

app.post('/api/tenants', requireFirebaseAuth, async (req, res) => {
  console.log('[api/tenants] hit', { uid: req.user?.uid, channelId: req.body?.channelId });

  try {
    const { channelId, channelSecret } = req.body || {};
    if (!channelId || !channelSecret) {
      return res.status(400).json({ error: 'channelId & channelSecret required' });
    }

    // 1) Issue channel access token (Messaging API)
    const tokRes = await fetchFn('https://api.line.me/v2/oauth/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: channelId,
        client_secret: channelSecret
      })
    });
    const tokText = await tokRes.text();
    if (!tokRes.ok) {
      let j = {}; try { j = JSON.parse(tokText); } catch {}
      return res.status(400).json({
        error: 'Cannot issue access token',
        detail: j.error_description || j.message || tokText
      });
    }
    const { access_token } = JSON.parse(tokText);

    // 2) Fetch bot info
    const infoRes = await fetchFn('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const infoText = await infoRes.text();
    if (!infoRes.ok) {
      let j = {}; try { j = JSON.parse(infoText); } catch {}
      return res.status(400).json({
        error: 'Cannot fetch bot info',
        detail: j.message || infoText,
        hint: 'ใช้ Channel ID/Secret ของ Messaging API (ไม่ใช่ LINE Login) และ OA ต้อง Enabled ใน OAM'
      });
    }
    const info = JSON.parse(infoText);

    // 3) Upsert tenant
    const db = admin.firestore();
    const ownerUid = req.user.uid;

    const dupSnap = await db.collection('tenants')
      .where('ownerUid', '==', ownerUid)
      .where('channelId', '==', channelId)
      .limit(1)
      .get();

    if (!dupSnap.empty) {
      const docRef = dupSnap.docs[0].ref;
      await docRef.set({
        basicId: info.basicId || null,
        displayName: info.displayName || 'OA',
        pictureUrl: info.pictureUrl || null,
        chatMode: info.chatMode || null,
        markAsReadMode: info.markAsReadMode || null,
        botUserId: info.userId || null,          // <— เพิ่มบรรทัดนี้
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await docRef.collection('secret').doc('v1').set({
        channelSecret,
        accessToken: access_token,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.json({ ok: true, id: docRef.id, deduped: true });
    }

    const docRef = db.collection('tenants').doc();
    await docRef.set({
      ownerUid,
      channelId,
      basicId: info.basicId || null,
      displayName: info.displayName || 'OA',
      pictureUrl: info.pictureUrl || null,
      chatMode: info.chatMode || null,
      markAsReadMode: info.markAsReadMode || null,
      botUserId: info.userId || null,           // <— เพิ่มบรรทัดนี้
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      secretStored: true,
    });
    await docRef.collection('secret').doc('v1').set({
      channelSecret,
      accessToken: access_token,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ ok: true, id: docRef.id, deduped: false });
  } catch (e) {
    console.error('[api/tenants] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});

// ==== Members: add/remove (Owner only) ====
app.post('/api/tenants/:id/members:add', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { memberUid } = req.body || {};
    if (!memberUid) return res.status(400).json({ error: 'memberUid_required' });

    const snap = await admin.firestore().collection('tenants').doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: 'tenant_not_found' });
    const t = snap.data() || {};

    // owner เท่านั้น
    if (t.ownerUid !== req.user.uid) {
      return res.status(403).json({ error: 'not_owner' });
    }

    const members = Array.isArray(t.members) ? t.members.slice() : [];
    if (!members.includes(memberUid)) members.push(memberUid);

    await snap.ref.set({
      members,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({ ok: true, members });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

app.post('/api/tenants/:id/members:remove', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { memberUid } = req.body || {};
    if (!memberUid) return res.status(400).json({ error: 'memberUid_required' });

    const snap = await admin.firestore().collection('tenants').doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: 'tenant_not_found' });
    const t = snap.data() || {};

    // owner เท่านั้น
    if (t.ownerUid !== req.user.uid) {
      return res.status(403).json({ error: 'not_owner' });
    }

    const members = (Array.isArray(t.members) ? t.members : []).filter(u => u && u !== memberUid);

    await snap.ref.set({
      members,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({ ok: true, members });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});





// ==============================
// 6) Broadcasts (CRUD + Actions)
// ==============================

// 6.1) Create draft/scheduled
app.post('/api/tenants/:id/broadcast/draft', requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;

    // ✅ ดึงค่าที่ต้องใช้จาก body ให้ครบ
    const {
      recipient = 'all',
      messages = [],
      targetSummary,
      schedule = null,
      composer = null,
    } = req.body || {};

    const msgErr = validateMessages(messages);
    if (msgErr) {
      return res.status(400).json({
        error: msgErr,
        detail: msgErr === 'too_many_messages' ? 'LINE จำกัดครั้งละไม่เกิน 5 messages' : undefined
      });
    }

    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    let status = 'draft';
    let scheduledAt = null;
    let tz = null;

    if (schedule && schedule.at) {
      scheduledAt = toTs(schedule.at);
      tz = schedule.tz || null;
      status = 'scheduled';
      if (!scheduledAt) return res.status(400).json({ error: 'invalid_schedule_at' });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = tenant.ref.collection('broadcasts').doc();
    await docRef.set({
      createdBy: uid,
      recipient,
      messages, // ✅ pass-through ทั้งหมด (รวม imagemap)
      targetSummary: targetSummary || (recipient === 'all' ? 'All friends' : 'Targeting'),
      status,
      scheduledAt: scheduledAt || null,
      tz: tz || null,
      composer: composer || null,
      createdAt: now,
      updatedAt: now,
    });

    return res.json({ ok: true, id: docRef.id, status });
  } catch (e) {
    console.error('[broadcast draft] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e.message || e) });
  }
});


// 6.2) Read one (draft/scheduled/sent)
app.get('/api/tenants/:id/broadcasts/:bid', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, bid } = req.params;
    const uid = req.user.uid;

    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const docRef = tenant.ref.collection('broadcasts').doc(bid);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });

    const data = snap.data();
    let scheduledAtISO = null;
    if (data.scheduledAt && typeof data.scheduledAt.toDate === 'function') {
      scheduledAtISO = data.scheduledAt.toDate().toISOString();
    }

    return res.json({ id: snap.id, ...data, scheduledAtISO });
  } catch (e) {
    console.error('[get broadcast one] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});

// 6.3) Update draft/scheduled
app.put('/api/tenants/:id/broadcast/draft/:bid', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, bid } = req.params;
    const uid = req.user.uid;

    // ✅ ดึงค่าที่ต้องใช้จาก body ให้ครบ
    const {
      recipient = 'all',
      messages = [],
      targetSummary,
      schedule = null,
      composer = null,
    } = req.body || {};

    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const err = validateMessages(messages);
    if (err) {
      return res.status(400).json({
        error: err,
        detail: err === 'too_many_messages' ? 'LINE จำกัดครั้งละไม่เกิน 5 messages' : undefined
      });
    }

    let status = 'draft';
    let scheduledAt = null;
    let tz = null;

    if (schedule && schedule.at) {
      const ts = toTs(schedule.at);
      if (!ts) return res.status(400).json({ error: 'invalid_schedule_at' });
      scheduledAt = ts;
      tz = schedule.tz || null;
      status = 'scheduled';
    }

    const docRef = tenant.ref.collection('broadcasts').doc(bid);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });

    await docRef.set({
      recipient,
      messages, // ✅ pass-through (รวม imagemap)
      targetSummary: targetSummary || (recipient === 'all' ? 'All friends' : 'Targeting'),
      status,
      scheduledAt: scheduledAt || null,
      tz: tz || null,
      composer: composer || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return res.json({ ok: true, id: bid });
  } catch (e) {
    console.error('[update draft] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});


// 6.4) Send test (push to current user)
app.post('/api/tenants/:id/broadcast/test', requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;
    const { messages = [] } = req.body || {};

    const msgErr = validateMessages(messages);
    if (msgErr) {
      return res.status(400).json({
        error: msgErr,
        detail: msgErr === 'too_many_messages' ? 'LINE จำกัดครั้งละไม่เกิน 5 messages' : undefined
      });
    }

    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    // ดึง LINE userId ของผู้เรียก
    const userSnap = await admin.firestore().doc(`users/${uid}`).get();
    const to = userSnap.get('line.userId');
    if (!to) return res.status(400).json({ error: 'user_has_no_line_id' });

    const resp = await callLineAPITenant(tenant.ref, '/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages })
    });
    if (!resp.ok) return res.status(resp.status).json({ error: 'line_push_error', detail: await resp.text() });

    return res.json({ ok: true });
  } catch (e) {
    console.error('[broadcast test] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});


// 6.5) Send now (broadcast to all)
app.post('/api/tenants/:id/broadcast', requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;
    const { recipient = 'all', sendType = 'now', messages = [], targetSummary } = req.body || {};

    const msgErr = validateMessages(messages);
    if (msgErr) {
      return res.status(400).json({
        error: msgErr,
        detail: msgErr === 'too_many_messages' ? 'LINE จำกัดครั้งละไม่เกิน 5 messages' : undefined
      });
    }
    if (sendType !== 'now') {
      return res.status(400).json({ error: 'schedule_not_supported_here' });
    }

    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const resp = await callLineAPITenant(tenant.ref, '/v2/bot/message/broadcast', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ messages }) 
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error('[broadcast now] LINE error', resp.status, text);
      return res.status(resp.status).json({ error: 'line_error', detail: text });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const logRef = tenant.ref.collection('broadcasts').doc();
    await logRef.set({
      createdBy: uid,
      recipient,
      sendType: 'now',
      messages,
      targetSummary: targetSummary || (recipient === 'all' ? 'All friends' : 'Targeting'),
      status: 'sent',
      createdAt: now,
      updatedAt: now,
    });

    return res.json({ ok: true, id: logRef.id });
  } catch (e) {
    console.error('[broadcast now] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});


// ==============================
// 6.x) Rich menus
// ==============================

// 6.x.1) Save draft (Firestore only)
app.post('/api/tenants/:id/richmenus/draft', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const {
      title = 'Rich menu',
      size = 'large',
      imageUrl = '',
      chatBarText = 'Menu',
      defaultBehavior = 'shown',
      areas = [],
      schedule = null, // { from: ISO, to: ISO|null }
    } = req.body || {};

    const now = admin.firestore.FieldValue.serverTimestamp();
    const scheduleFrom = schedule?.from ? toTs(schedule.from) : null;
    const scheduleTo   = schedule?.to ? toTs(schedule.to) : null;

    const docRef = tenant.ref.collection('richmenus').doc();
    await docRef.set({
      title, size, imageUrl, chatBarText, defaultBehavior, areas,
      schedule: schedule || null,
      scheduleFrom, scheduleTo,
      status: 'draft',
      createdBy: uid,
      createdAt: now, updatedAt: now,
    });

    return res.json({ ok: true, id: docRef.id, status: 'draft' });
  } catch (e) {
    console.error('[richmenus/draft] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});


// 6.x.1b) Update draft (Firestore only)
app.put('/api/tenants/:id/richmenus/draft/:rid', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, rid } = req.params;
    const uid = req.user.uid;
    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const {
      title = 'Rich menu',
      size = 'large',
      imageUrl = '',
      chatBarText = 'Menu',
      defaultBehavior = 'shown',
      areas = [],
      schedule = null,
    } = req.body || {};

    const scheduleFrom = schedule?.from ? toTs(schedule.from) : null;
    const scheduleTo   = schedule?.to ? toTs(schedule.to) : null;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = tenant.ref.collection('richmenus').doc(rid);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });

    await docRef.set({
      title, size, imageUrl, chatBarText, defaultBehavior,
      areas, schedule, scheduleFrom, scheduleTo,
      status: 'draft',
      updatedAt: now,
    }, { merge: true });

    return res.json({ ok: true, id: rid, status: 'draft' });
  } catch (e) {
    console.error('[richmenus/draft PUT] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});


// 6.x.2) Save → create on LINE as Ready (no default)
app.post('/api/tenants/:id/richmenus', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    const {
      title = 'Rich menu',
      size = 'large',
      imageUrl,
      chatBarText = 'Menu',
      defaultBehavior = 'shown',
      areas = [],
      schedule = null, // { from: ISO, to: ISO|null }
    } = req.body || {};

    if (!imageUrl) return res.status(400).json({ error: 'image_url_required' });

    const WIDTH  = 2500;
    const HEIGHT = size === 'compact' ? 843 : 1686;
    const areasPx = toPxAreas({ areas, width: WIDTH, height: HEIGHT });

    const { richMenuId } = await createAndUploadRichMenuOnLINE({
      accessToken, title, chatBarText, size, areasPx, imageUrl
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const scheduleFrom = schedule?.from ? toTs(schedule.from) : null;
    const scheduleTo   = schedule?.to ? toTs(schedule.to) : null;

    const docRef = tenant.ref.collection('richmenus').doc();
    await docRef.set({
      title, size, imageUrl, chatBarText, defaultBehavior,
      areas, schedule, scheduleFrom, scheduleTo,
      lineRichMenuId: richMenuId,
      status: 'ready', // แสดงในคอนโซลเป็น Ready
      createdBy: uid,
      createdAt: now, updatedAt: now,
    });

    return res.json({ ok: true, id: docRef.id, richMenuId, status: 'ready' });
  } catch (e) {
    console.error('[richmenus save] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// 6.x.3) Send test (create + upload + link to current user only)
app.post('/api/tenants/:id/richmenus/test', requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;

    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });
    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    const { title = 'Test rich menu', size = 'large', imageUrl, chatBarText = 'Menu', areas = [] } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: 'image_url_required' });

    const WIDTH  = 2500;
    const HEIGHT = size === 'compact' ? 843 : 1686;
    const areasPx = toPxAreas({ areas, width: WIDTH, height: HEIGHT });

    const { richMenuId } = await createAndUploadRichMenuOnLINE({
      accessToken, title, chatBarText, size, areasPx, imageUrl
    });

    // link to current user (test)
    const userSnap = await admin.firestore().doc(`users/${uid}`).get();
    const to = userSnap.get('line.userId');
    if (!to) return res.json({ ok: true, richMenuId, linked: false });

    const linkResp = await callLineAPITenant(tenant.ref, `/v2/bot/user/${encodeURIComponent(to)}/richmenu/${encodeURIComponent(richMenuId)}`, { method:'POST' });
    const linkText = await linkResp.text();
    if (!linkResp.ok) return res.status(linkResp.status).json({ ok: false, error: 'line_link_error', detail: linkText, richMenuId });

    return res.json({ ok: true, richMenuId, linked: true });
  } catch (e) {
    console.error('[richmenus/test] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});


// 6.x.4) Update existing rich menu doc
app.put('/api/tenants/:id/richmenus/:rid', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, rid } = req.params;
    const uid = req.user.uid;
    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const {
      title = 'Rich menu',
      size = 'large',
      imageUrl,
      chatBarText = 'Menu',
      defaultBehavior = 'shown',
      areas = [],
      schedule = null,
      action = 'draft', // 'draft' | 'save'
    } = req.body || {};

    const docRef = tenant.ref.collection('richmenus').doc(rid);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });

    const prev = snap.data() || {};
    const now = admin.firestore.FieldValue.serverTimestamp();
    let lineRichMenuId = prev.lineRichMenuId || null;

    // เปลี่ยนโครงสร้าง? (LINE ไม่มี API แก้โครงสร้าง → ต้องสร้างใหม่)
    const structChanged =
      prev.size !== size ||
      prev.chatBarText !== chatBarText ||
      JSON.stringify(prev.areas || []) !== JSON.stringify(areas || []);

    // เปลี่ยนรูป?
    const imageChanged = !!imageUrl && imageUrl !== prev.imageUrl;

    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    if (!lineRichMenuId || structChanged) {
      // สร้าง rich menu ใหม่
      const WIDTH = 2500;
      const HEIGHT = size === 'compact' ? 843 : 1686;
      const areasPx = toPxAreas({ areas, width: WIDTH, height: HEIGHT });

      const created = await createAndUploadRichMenuOnLINE({
        accessToken, title, chatBarText, size, areasPx, imageUrl
      });

      // ลบอันเก่า (best-effort)
      if (lineRichMenuId) {
        fetchFn(`https://api.line.me/v2/bot/richmenu/${encodeURIComponent(lineRichMenuId)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
        }).catch(()=>{});
      }
      lineRichMenuId = created.richMenuId;
    } else if (imageChanged) {
      // โครงสร้างเดิม แต่รูปใหม่ → อัปโหลดทับ
      await uploadImageToLINE({ accessToken, richMenuId: lineRichMenuId, imageUrl });
    }

    // schedule สำหรับปุ่ม Save (Scheduled/Active)
    let scheduleFrom = null, scheduleTo = null;
    if (action === 'save') {
      if (!schedule?.from) return res.status(400).json({ error: 'schedule_from_required' });
      scheduleFrom = toTs(schedule.from);
      scheduleTo   = schedule?.to ? toTs(schedule.to) : null;
    }

    await docRef.set({
      title, size, imageUrl, chatBarText, defaultBehavior,
      areas,
      lineRichMenuId,
      status: 'ready',
      schedule: action === 'save' ? schedule : null,
      scheduleFrom: action === 'save' ? scheduleFrom : null,
      scheduleTo:   action === 'save' ? scheduleTo   : null,
      updatedAt: now,
    }, { merge: true });

    // (ออปชัน) ถ้า schedule.from <= ตอนนี้ → ตั้ง default ให้เลย ไม่ต้องรอ cron
    if (action === 'save' && scheduleFrom && scheduleFrom.toMillis() <= Date.now()) {
      await fetchFn('https://api.line.me/v2/bot/user/all/richmenu/' + encodeURIComponent(lineRichMenuId), {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }
      }).catch(()=>{});
      await docRef.set({ lastAppliedAsDefaultAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    return res.json({ ok: true, id: rid, richMenuId: lineRichMenuId, status: 'ready' });
  } catch (e) {
    console.error('[richmenus update] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// GET settings
app.get('/api/tenants/:id/integrations/taskbot', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const doc = await tenant.ref.collection('integrations').doc('taskbot').get();
    const data = doc.exists ? doc.data() : {};
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// POST save settings (enabled, appsSheetId, pre/post ids)
app.post('/api/tenants/:id/integrations/taskbot', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const { enabled, appsSheetId, preRichMenuId, postRichMenuId } = req.body || {};
    await tenant.ref.collection('integrations').doc('taskbot').set({
      enabled: !!enabled,
      appsSheetId: String(appsSheetId || ''),
      preRichMenuId: String(preRichMenuId || ''),
      postRichMenuId: String(postRichMenuId || ''),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // ถ้า disable → เคลียร์ default ที่ OA
    if (!enabled) {
      try { await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu', { method: 'DELETE' }); } catch {}
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// POST verify (เรียก Apps Script action=verify/ping หรือ list_users)
app.post('/api/tenants/:id/integrations/taskbot/verify', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    // ถ้า GAS ไม่มี action 'verify' ให้ลอง 'list_users'
    try {
      await callAppsScriptForTenant(tenant.ref, 'verify', {});
    } catch {
      await callAppsScriptForTenant(tenant.ref, 'list_users', {});
    }

    await tenant.ref.collection('integrations').doc('taskbot')
      .set({ verifiedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});


// --- helper: ดึง LINE richMenuId จาก doc ของ tenant ---
async function getLineIdFromDoc(tenantRef, docId) {
  const snap = await tenantRef.collection('richmenus').doc(String(docId)).get();
  if (!snap.exists) return null;
  const d = snap.data() || {};
  // โครงการนี้ใช้ชื่อฟิลด์ไม่ตายตัว ลองหลายๆ key
  return d.lineRichMenuId || d.richMenuId || d.menuId || d.lineId || null;
}

// --- helper: สร้าง preset ให้ครบ (ถ้ายังไม่มี) แล้วคืน docId กลับมา ---
// ✅ REPLACE ทั้งฟังก์ชันเดิมด้วยเวอร์ชันนี้
// REPLACE: server.js → ensurePresetRichMenus()
// server.js — REPLACE this whole function
// --- helper: สร้าง preset ให้ครบ (ถ้ายังไม่มี) แล้วคืน docId กลับมา ---
async function ensurePresetRichMenus(tenantRef) {
  const admin = require('firebase-admin');

  const preRef  = tenantRef.collection('richmenus').doc('PREREG');
  const mainRef = tenantRef.collection('richmenus').doc('MAIN');
  const [preSnap, mainSnap] = await Promise.all([preRef.get(), mainRef.get()]);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const PRE_IMG  = '/static/Menu_for_non_register.png';
  const MAIN_IMG = '/static/Rich_menu_for_registered.png';

  // โหลดเทมเพลตจากไฟล์ prereg.json / main.json (มี fields: name, chatBarText, areas, size)
  const preregTpl = await loadRichMenuTemplate('prereg');
  const mainTpl   = await loadRichMenuTemplate('main');

  if (!preSnap.exists) {
    await preRef.set({
      title: preregTpl?.name || 'Pre-register',
      chatBarText: preregTpl?.chatBarText || 'เมนู',
      areas: Array.isArray(preregTpl?.areas) ? preregTpl.areas : [],
      status: 'ready',
      imageUrl: PRE_IMG,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  } else if (!preSnap.get('imageUrl')) {
    await preRef.set({ imageUrl: PRE_IMG, updatedAt: now }, { merge: true });
  }

  if (!mainSnap.exists) {
    await mainRef.set({
      title: mainTpl?.name || 'Main',
      chatBarText: mainTpl?.chatBarText || 'Menu',
      areas: Array.isArray(mainTpl?.areas) ? mainTpl.areas : [],
      status: 'ready',
      imageUrl: MAIN_IMG,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  } else if (!mainSnap.get('imageUrl')) {
    await mainRef.set({ imageUrl: MAIN_IMG, updatedAt: now }, { merge: true });
  }

  return { preregDocId: 'PREREG', mainDocId: 'MAIN' };
}





// --- แก้ route นี้ให้รองรับ ensurePreset + map docId → lineId ---
// server.js
// POST /api/tenants/:id/integrations/taskbot/apply-richmenus
/** Helper: choose a usable doc (has imageUrl + areas), else fallback */
async function pickUsableDocId(tenantRef, docId, fallbackId) {
  try {
    const snap = await tenantRef.collection('richmenus').doc(String(docId)).get();
    if (!snap.exists) return fallbackId;
    const d = snap.data() || {};
    const ok = Array.isArray(d.areas) && d.areas.length > 0 && !!d.imageUrl;
    return ok ? docId : fallbackId;
  } catch {
    return fallbackId;
  }
}

// NOTE: keep your existing helpers: getTenantIfMember, getTenantSecretAccessToken,
// ensurePresetRichMenus, createAndUploadRichMenuOnLINE, callLineAPITenant, etc.


app.post('/api/tenants/:id/integrations/taskbot/apply-richmenus',
  requireFirebaseAuth,
  express.json(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const tenant = await getTenantIfMember(id, req.user.uid);
      if (!tenant) return res.status(403).json({ ok:false, error:'not_member_of_tenant' });

      // 1) read body
      let { preRichMenuId: pre, postRichMenuId: post, ensurePreset } = req.body || {};
      pre  = String(pre  || '').trim();
      post = String(post || '').trim();

      // ถ้า client ไม่ส่งอะไรมาเลย → bootstrap mode
      if (!pre && !post) ensurePreset = true;

      // 2) ensure PREREG/MAIN templates เฉพาะตอน bootstrap เท่านั้น
      if (ensurePreset) {
        await ensurePresetRichMenus(tenant.ref);
        if (!pre)  pre  = 'PREREG';
        if (!post) post = 'MAIN';
      }

      // 3) เคารพ id ที่ส่งมา ถ้าใช้ไม่ได้ค่อย fallback ไป preset
      async function resolveDocId(inputId, fallbackCode) {
        if (!inputId) return null;
        return await pickUsableDocId(tenant.ref, inputId, fallbackCode);
      }
      pre  = await resolveDocId(pre  || 'PREREG', 'PREREG');
      post = await resolveDocId(post || 'MAIN',   'MAIN');

      // 4) สร้าง/อัปโหลด rich menu บน LINE ถ้า doc ยังไม่มี lineRichMenuId
      async function ensureLineIdFromDoc(docId) {
        if (!docId) return null;
        const dref = tenant.ref.collection('richmenus').doc(String(docId));
        const snap = await dref.get();
        if (!snap.exists) { console.warn('[APPLY] doc not found', docId); return null; }
        const data = snap.data() || {};
        if (data.lineRichMenuId) {
          console.log('[APPLY] already has lineId', docId, data.lineRichMenuId);
          return data.lineRichMenuId;
        }

        const hasAreas = Array.isArray(data.areas) && data.areas.length > 0;
        const imgUrl   = data.imageUrl;
        if (!imgUrl || !hasAreas) { console.warn('[APPLY] missing areas/image', { hasAreas, imgUrl }); return null; }

        const absoluteImageUrl = /^https?:\/\//i.test(imgUrl) ? imgUrl : `${BASE_APP_URL}${imgUrl}`;
        const accessToken = await getTenantSecretAccessToken(tenant.ref);

        try {
          const created = await createAndUploadRichMenuOnLINE({
            accessToken,
            title: data.title || docId,
            chatBarText: data.chatBarText || 'Menu',
            size: data.size || 'large',
            areasPx: data.areas,
            imageUrl: absoluteImageUrl,
          });
          const richMenuId = created?.richMenuId || created;
          await dref.set({ lineRichMenuId: richMenuId, status:'ready', updatedAt: new Date() }, { merge:true });
          console.log('[APPLY] created & saved lineId', docId, richMenuId);
          return richMenuId;
        } catch (e) {
          console.error('[APPLY] create/upload error for', docId, e?.message || e);
          return null;
        }
      }

      if (!pre) return res.status(400).json({ ok:false, error:'pre_menu_missing' });

      const preLineId  = await ensureLineIdFromDoc(pre);
      if (!preLineId)  return res.status(400).json({ ok:false, error:'pre_menu_has_no_line_id' });
      const postLineId = post ? await ensureLineIdFromDoc(post) : null;

      // 4.1) ⬅️ NEW: sync alias-docs ให้ KIND → lineRichMenuId ล่าสุด
      try {
        const rm = tenant.ref.collection('richmenus');
        const ts = admin.firestore.FieldValue.serverTimestamp();
        await rm.doc('PREREG').set({ lineRichMenuId: preLineId,  updatedAt: ts }, { merge: true });
        if (postLineId) {
          await rm.doc('MAIN').set({ lineRichMenuId: postLineId, updatedAt: ts }, { merge: true });
        }
      } catch (e) {
        console.warn('[APPLY] alias sync failed', e?.message || e);
      }

      // 5) ตั้ง default = PRE (ก่อนลงทะเบียน) เสมอ
      const setDef = await callLineAPITenant(
        tenant.ref,
        `/v2/bot/user/all/richmenu/${encodeURIComponent(preLineId)}`,
        { method:'POST' }
      );
      const setTxt = await setDef.text().catch(()=> '');
      console.log('[APPLY] set default to PRE', setDef.status, setTxt || '(ok)');

      // 5.1) Auto unlink ผู้ที่กด Enable (ลบลิงก์รายคน)
      try {
        const me = extractLineUserId(req.user);
        if (!me) {
          console.warn('[APPLY] auto-unlink skipped: cannot resolve LINE userId from req.user', req.user?.uid);
        } else {
          const unlinkRes = await callLineAPITenant(
            tenant.ref,
            `/v2/bot/user/${encodeURIComponent(me)}/richmenu`,
            { method: 'DELETE' }
          );
          const unlinkTxt = await unlinkRes.text().catch(()=> '');
          console.log('[APPLY] auto-unlink self', me, unlinkRes.status, unlinkTxt || '(ok)');
        }
      } catch (e) {
        console.warn('[APPLY] auto-unlink self failed', e?.status || e);
      }

      // 6) บันทึกสถานะที่ผู้ใช้ “เลือกจริง”
      await tenant.ref.collection('integrations').doc('taskbot').set({
        enabled: true,
        preRichMenuId: pre,
        postRichMenuId: post || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge:true });

      return res.json({ ok:true, preRichMenuId: pre, postRichMenuId: post || null, preLineId, postLineId });
    } catch (e) {
      console.error('[apply-richmenus] error:', e);
      return res.status(500).json({ ok:false, error:'server_error', detail:String(e?.message || e) });
    }
  }
);





// helper: ทำให้ path รูปเป็น absolute (ถ้าขึ้นต้น /static)
// --- utils: server.js (ใกล้ ๆ กับที่ประกาศ BASE_APP_URL) ---
// --- helper: make /static/... absolute for node-fetch ---
function toAbsoluteAssetUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = (process.env.PUBLIC_APP_URL || BASE_APP_URL || '').replace(/\/$/,'');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}


app.get('/api/tenants/:id/debug/richmenus/:docId', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ ok:false, error:'not_member_of_tenant' });

    const snap = await tenant.ref.collection('richmenus').doc(docId).get();
    if (!snap.exists) return res.status(404).json({ ok:false, error:'doc_not_found' });
    const d = snap.data() || {};
    const abs = /^https?:\/\//i.test(d.imageUrl) ? d.imageUrl : `${BASE_APP_URL}${d.imageUrl}`;

    // แค่ลองดาวน์โหลดรูปและคืนผล (ไม่สร้าง LINE จริง)
    const r = await fetchFn(withAltMedia(abs));
    const buf = await r.arrayBuffer().catch(()=>null);
    return res.json({
      ok: r.ok, status: r.status, contentType: r.headers.get('content-type') || '',
      bytes: buf ? buf.byteLength : 0, areas: Array.isArray(d.areas) ? d.areas.length : 0, imageUrl: abs
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});


// สร้าง draft ให้ user ปัจจุบันจาก rich menu (docId หรือ kind=PREREG/MAIN)
// server.js
app.post('/api/tenants/:id/richmenus/start-edit',
  requireFirebaseAuth,
  ensureGuest, // ⭐ สำคัญ: ใช้ guest id จาก cookie
  async (req, res) => {
    try {
      const { id } = req.params;
      const tenant = await getTenantIfMember(id, req.user.uid);
      if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

      const { docId, kind } = req.body || {};
      const sourceId = docId || (kind === 'main' ? 'MAIN' : 'PREREG');

      const snap = await tenant.ref.collection('richmenus').doc(String(sourceId)).get();
      if (!snap.exists) return res.status(404).json({ error: 'source_not_found' });

      const data = snap.data() || {};
      const gid = req.guest?.gid;
      if (!gid) return res.status(400).json({ error: 'guest_id_required' });

      const draftRef = admin.firestore().collection('guests')
        .doc(gid).collection('richmenus').doc();

      await draftRef.set({
        title: data.title || '',
        imageUrl: data.imageUrl || '',
        size: data.size || 'full',
        areas: Array.isArray(data.areas) ? data.areas : [],
        fromDoc: snap.id,
        tenantId: id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });

      return res.json({ ok: true, guestDraft: draftRef.id });
    } catch (e) {
      console.error('start-edit error:', e);
      return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
    }
  }
);


app.get('/api/tenants/:id/richmenus', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query || {};
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    let q = tenant.ref.collection('richmenus');
    if (status) q = q.where('status', '==', String(status));

    const snaps = await q.get();
    const data = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});


// GET list richmenus
app.get('/api/tenants/:id/richmenus', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const snap = await tenant.ref.collection('richmenus').get();
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});


// GET current default rich menu id

app.get('/api/tenants/:id/richmenus/default', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    // ถาม LINE ว่าตอนนี้ OA ตั้ง default อะไรอยู่
    const r = await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu', { method: 'GET' });
    if (r.status === 404) return res.json({ ok: true, data: null });

    const j = await r.json();
    const richMenuId = j.richMenuId || null;

    let docId = null, kind = null, title = null, size = null, imageUrl = null;

    if (richMenuId) {
      const snap = await tenant.ref.collection('richmenus')
        .where('lineRichMenuId', '==', richMenuId)
        .limit(1).get();

      if (!snap.empty) {
        const doc = snap.docs[0];
        const d = doc.data() || {};
        docId   = doc.id;
        kind    = d.kind || null;
        title   = d.title || null;
        size    = d.size || null;
        imageUrl = d.imageUrl || null;
      }
    }

    return res.json({
      ok: true,
      data: { richMenuId, docId, kind, title, size, imageUrl }
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});
// สร้างจากไฟล์ preset (public/static/{prereg.json, main.json}) + อัปโหลดรูป แล้วตั้งให้ OA
app.post('/api/tenants/:id/integrations/taskbot/bootstrap', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const body = req.body || {};
    let { preRichMenuId, postRichMenuId } = body;

    // 1) ถ้ายังไม่มี pre/main → สร้างจาก preset
    async function ensureFromPreset(kind, jsonFile, imgFile) {
      // ถ้ามี id แล้วข้าม
      if ((kind === 'pre' && preRichMenuId) || (kind === 'post' && postRichMenuId)) return;

      const jsonPath = path.join(__dirname, 'public', 'static', jsonFile);
      const imgUrl = `${BASE_APP_URL}/static/${imgFile}`; // ใช้ BASE_APP_URL ที่คำนวณแล้วเสมอ
      const areasDef = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

      // ใช้ helper ที่คุณมีอยู่แล้ว
      const token = await getTenantSecretAccessToken(tenant.ref);
      const { richMenuId } = await createAndUploadRichMenuOnLINE({
        accessToken: token,
        title: kind === 'pre' ? 'Pre' : 'Main',
        chatBarText: 'เมนู',
        size: (areasDef.size?.height === 1686 ? 'large' : 'compact'),
        areasPx: (areasDef.areas || []).map(a => ({
          x: a.bounds.x, y: a.bounds.y, w: a.bounds.width, h: a.bounds.height, action: a.action
        })),
        imageUrl: imgUrl
      });

      // เก็บลง Firestore (collection richmenus)
      const docRef = await tenant.ref.collection('richmenus').add({
        title: kind === 'pre' ? 'Pre' : 'Main',
        imageUrl: imgUrl,
        size: areasDef.size?.height === 1686 ? 'large' : 'compact',
        lineRichMenuId: richMenuId,
        kind: kind === 'pre' ? 'prereg' : 'main',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (kind === 'pre') preRichMenuId = docRef.id;
      else postRichMenuId = docRef.id;
    }

    await ensureFromPreset('pre',  'prereg.json', 'Menu_for_non_register.png');
    await ensureFromPreset('post', 'main.json',   'Rich_menu_for_registered.png');

    // 2) Apply: ตั้ง default OA = pre, และจำค่า post เพื่อใช้ตอนลงทะเบียนผู้ใช้
    const token = await getTenantSecretAccessToken(tenant.ref);
    const preDoc  = await tenant.ref.collection('richmenus').doc(preRichMenuId).get();
    const postDoc = await tenant.ref.collection('richmenus').doc(postRichMenuId).get();
    const preLineId  = preDoc.get('lineRichMenuId');
    const postLineId = postDoc.get('lineRichMenuId');

    // ตั้ง default ของ OA (ผู้ใช้ใหม่/ยังไม่ลงทะเบียนจะเห็นเมนูนี้)
    await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ richMenuId: preLineId })
    });

    // บันทึก integration settings
    await tenant.ref.collection('settings').doc('taskbot').set({
      enabled: true,
      preRichMenuId,
      postRichMenuId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({ ok: true, preRichMenuId, postRichMenuId });
  } catch (e) {
    console.error('BOOTSTRAP_ERR', e);
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});
// ยกเลิก Default rich menu ของ OA (DELETE /user/all/richmenu)
// server.js
app.post('/api/tenants/:id/integrations/taskbot/disable',
  requireFirebaseAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const tenant = await getTenantIfMember(id, req.user.uid);
      if (!tenant) return res.status(403).json({ ok:false, error:'not_member_of_tenant' });

      // 1) ลบ default rich menu ของ OA
      try {
        await unsetDefaultRichMenu(tenant.ref); // helper เดิมของคุณ
        console.log('[DISABLE] unset default ok');
      } catch (e) {
        // fallback: เรียก LINE API ตรง ๆ
        const r = await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu', { method:'DELETE' });
        console.log('[DISABLE] unset default via API', r.status, await r.text().catch(()=>'(ok)'));
      }

      // 2) ล้างลิงก์รายบุคคลของ "ผู้ที่กด Disable" เพื่อให้เห็นผลทันที
      try {
        const me = extractLineUserId(req.user);
        if (me) {
          const r = await callLineAPITenant(
            tenant.ref,
            `/v2/bot/user/${encodeURIComponent(me)}/richmenu`,
            { method: 'DELETE' }
          );
          console.log('[DISABLE] unlink self', me, r.status, await r.text().catch(()=>'(ok)'));
        } else {
          console.warn('[DISABLE] skip unlink self: cannot resolve LINE user id from req.user');
        }
      } catch (e) {
        console.warn('[DISABLE] unlink self failed', e?.message || e);
      }

      // 3) เคลียร์สถานะ integration + alias PREREG/MAIN
      const ts = admin.firestore.FieldValue.serverTimestamp();
      const rm = tenant.ref.collection('richmenus');

      await tenant.ref.collection('integrations').doc('taskbot').set({
        enabled: false,
        preRichMenuId: admin.firestore.FieldValue.delete(),
        postRichMenuId: admin.firestore.FieldValue.delete(),
        updatedAt: ts,
      }, { merge: true });

      await rm.doc('PREREG').set({ lineRichMenuId: admin.firestore.FieldValue.delete(), updatedAt: ts }, { merge: true });
      await rm.doc('MAIN').set({   lineRichMenuId: admin.firestore.FieldValue.delete(), updatedAt: ts }, { merge: true });

      return res.json({ ok: true });
    } catch (e) {
      console.error('[taskbot/disable] error:', e);
      return res.status(500).json({ ok:false, error:'server_error', detail:String(e?.message || e) });
    }
  }
);











// API TA

// ==== Enable Time Attendance (สร้าง/อัปโหลด Rich Menu ของ Attendance แล้วบันทึกสถานะ) ====

app.post('/api/tenants/:id/integrations/attendance/enable', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ ok:false, error:'not_member_of_tenant' });

    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    // --- MUST HAVE: appsSheetId ก่อนเปิดใช้งาน ---
    const integRef = tenant.ref.collection('integrations').doc('attendance');
    const snap = await integRef.get();
    const cfg  = snap.exists ? (snap.data() || {}) : {};
    // อนุญาตรับจาก body ด้วย (กันกรณีเพิ่งกรอกแล้วยังไม่ save แยก)
    const appsSheetId = String(req.body?.appsSheetId || cfg.appsSheetId || '').trim();
    if (!appsSheetId) {
      console.warn('[attendance/enable] missing appsSheetId; abort enable');
      return res.status(400).json({
        ok:false,
        error:'appsSheetId_required',
        message:'กรุณาใส่ Google Sheet ID (appsSheetId) ใน Settings แล้วบันทึกก่อนเปิดใช้งาน'
      });
    }

    // 1) ใช้ preset กลาง (ไทย + ฝั่งขวา) แล้ว "บังคับ" ปุ่ม index 3 ให้เป็น message action (ไม่ใช้ LIFF)
    const ADMIN_IMAGE = ATTEND_ADMIN_IMG;
    const USER_IMAGE  = ATTEND_USER_IMG;
    const ADMIN_AREAS = ATTEND_ADMIN_AREAS_TH;
    const USER_AREAS  = ATTEND_USER_AREAS_TH;

    // ADMIN: ปุ่มล่างขวา → บังคับเป็นข้อความ "ตั้งค่า"
    const adminAreasMsg = [...ADMIN_AREAS];
    if (adminAreasMsg[3]) {
      const last = adminAreasMsg[3];
      adminAreasMsg[3] = { bounds: last.bounds, action: { type:'message', text:'ตั้งค่า' } };
    }

    // USER: ปุ่มล่างขวา → บังคับเป็นข้อความ "ลงทะเบียนเข้าใช้งาน"
    const userAreasMsg = [...USER_AREAS];
    if (userAreasMsg[3]) {
      const regBtn = userAreasMsg[3];
      userAreasMsg[3] = { bounds: regBtn.bounds, action: { type:'message', text:'ลงทะเบียนเข้าใช้งาน' } };
    }

    // 2) สร้าง/อัปโหลด (ถ้ายังไม่มี หรือ preset เปลี่ยนให้ recreate)
    async function ensure(docId, imageUrl, areasPx) {
      const dref = tenant.ref.collection('richmenus').doc(docId);
      const snap = await dref.get();
      const data = snap.exists ? (snap.data() || {}) : {};

      let rid = data.lineRichMenuId || data.richMenuId || '';

      // เปรียบเทียบของเดิมกับพรีเซ็ตใหม่
      const prevAreas = data.areas || [];
      const prevImg   = data.imageUrl || '';
      const sameImg   = prevImg === imageUrl;
      const prevStr = JSON.stringify(prevAreas || []);
      const nextStr = JSON.stringify(areasPx || []);
      const sameAreas = (prevStr === nextStr);

      console.log(`[ensureRichMenu:${docId}] rid=${rid || '(none)'} | sameImg=${sameImg} | sameAreas=${sameAreas}`);

      // ถ้าไม่มี หรือรูป/areas ต่าง → recreate
      const needsRecreate = !rid || !sameImg || !sameAreas;

      if (needsRecreate) {
        if (rid) {
          try {
            const del = await callLineAPITenant(
              tenant.ref,
              `/v2/bot/richmenu/${encodeURIComponent(rid)}`,
              { method: 'DELETE' }
            );
            if (del.ok) console.log(`[ensureRichMenu:${docId}] deleted old`, rid);
            else {
              const txt = await del.text().catch(()=> '');
              console.warn(`[ensureRichMenu:${docId}] delete old warn`, rid, del.status, txt);
            }
          } catch (e) {
            console.warn(`[ensureRichMenu:${docId}] delete old error`, rid, String(e?.message || e));
          }
        }

        console.log(`[ensureRichMenu:${docId}] create payload preview:`, {
          title: docId, chatBarText: 'เมนู', size: 'large',
          imageUrl, areasCount: areasPx?.length || 0, btn3Action: areasPx?.[3]?.action
        });

        const created = await createAndUploadRichMenuOnLINE({
          accessToken, title: docId, chatBarText: 'เมนู', size: 'large', areasPx, imageUrl
        });
        rid = created.richMenuId;
        console.log(`[ensureRichMenu:${docId}] created new rid=`, rid);

        await dref.set({
          kind: docId, title: docId, size: 'large', chatBarText: 'เมนู',
          imageUrl, areas: areasPx, lineRichMenuId: rid, status: 'ready', updatedAt: new Date()
        }, { merge: true });

      } else {
        console.log(`[ensureRichMenu:${docId}] keep existing rid=`, rid, '(areas & image unchanged)');
      }

      return rid;
    }

    // ใช้ areas ที่แก้ไขแล้ว (message action เท่านั้น)
    const adminLineId = await ensure('ATTEND_MAIN_ADMIN', ADMIN_IMAGE, adminAreasMsg);
    const userLineId  = await ensure('ATTEND_MAIN_USER',  USER_IMAGE,  userAreasMsg);

    // 3) เคลียร์ default เก่า แล้วตั้ง default OA เป็นเมนู USER
    try { await unsetDefaultRichMenu(tenant.ref); } catch {}
    try {
      await callLineAPITenant(
        tenant.ref,
        `/v2/bot/user/all/richmenu/${encodeURIComponent(userLineId)}`,
        { method: 'POST' }
      );
      console.log('[attendance/enable] set default OA ->', userLineId);
    } catch (e) {
      console.warn('[attendance/enable] set default warn', e?.status || e);
    }

    // 3.1) ลิงก์เมนู ADMIN ให้ owner/admin ตาม “ชีต” (roles -> fallback employees.role)
    let linkedAdmins = 0;
    try {
      const resp = await callAttendanceGASDirect('list_admins', { tenantRef: tenant.ref });
      const adminIds = Array.isArray(resp?.ids) ? resp.ids.filter(Boolean) : [];

      for (const uid of adminIds) {
        try {
          // ตามสเปก LINE: link per-user = POST /v2/bot/user/{userId}/richmenu/{richMenuId}
          const link = await callLineAPITenant(
            tenant.ref,
            `/v2/bot/user/${encodeURIComponent(uid)}/richmenu/${encodeURIComponent(adminLineId)}`,
            { method: 'POST' }
          );
          if (!link.ok) {
            const txt = await link.text().catch(()=> '');
            console.warn('[attendance/enable] link admin menu fail', uid, link.status, txt);
          } else {
            linkedAdmins++;
            console.log('[attendance/enable] linked admin menu ->', uid);
          }
        } catch (e) {
          console.warn('[attendance/enable] link admin error', uid, String(e?.message || e));
        }
        await new Promise(r => setTimeout(r, 70)); // ผ่อน rate limit
      }
      console.log('[attendance/enable] per-user admin linked:', linkedAdmins, '/', adminIds.length);
    } catch (e) {
      console.warn('[attendance/enable] list_admins failed; skip per-user admin link:', String(e?.message || e));
    }


    // *** ตัดขั้นตอนดึง role และ relink เฉพาะผู้กด enable ออก (วิธี A) ***
    console.log('[attendance/enable] skip per-user relink by role (method A)');

    // 4) บันทึกสถานะเปิดใช้งาน Attendance
    await tenant.ref.collection('integrations').doc('attendance').set({
      enabled: true,
      updatedAt: new Date(),
      adminRichMenuDoc: 'ATTEND_MAIN_ADMIN',
      userRichMenuDoc:  'ATTEND_MAIN_USER',
      appsSheetId,
    }, { merge:true });

    return res.json({ ok:true, adminLineId, userLineId, linkedAdmins });
  } catch (err) {
    console.error('[attendance/enable] error:', err);
    return res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
});




// ==== Disable Time Attendance (ลบ Default OA + unlink รายผู้ใช้ [+ลบเมนูถ้าสั่ง]) ====
app.post(
  '/api/tenants/:id/integrations/attendance/disable',
  requireFirebaseAuth,
  express.json(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const tenant = await getTenantIfMember(id, req.user.uid);
      if (!tenant) return res.status(403).json({ ok:false, error:'not_member_of_tenant' });

      const deleteMenus = !!req.body?.deleteMenus;

      // รายชื่อที่จะ unlink: รับจาก body เท่านั้น (ไม่ดึงจาก GAS แล้ว)
      // ---- รายชื่อที่จะ unlink ----
      let unlinkUserIds = Array.isArray(req.body?.userIds) ? req.body.userIds.filter(Boolean) : [];

      // (ออปชัน) current user
      const bodyCurrent = (req.body?.currentLineUserId || '').trim();
      let currentLineUserId = bodyCurrent;
      if (!currentLineUserId && typeof extractLineUserId === 'function') {
        try { currentLineUserId = extractLineUserId(req.user) || ''; } catch {}
      }
      if (currentLineUserId) unlinkUserIds.push(currentLineUserId);

    
      // ✅ ดึง owner/admin จากชีต roles ผ่าน GAS Attendance
      let adminIds = [];
      try {
        const resp = await callAttendanceGASDirect('list_admins', { tenantRef: tenant.ref });
        adminIds = Array.isArray(resp?.ids) ? resp.ids.filter(Boolean) : [];
        console.log('[attendance/disable] admins from sheet =', adminIds);
      } catch (e) {
        console.warn('[attendance/disable] list_admins via TA failed:', String(e?.message || e));
      }
      unlinkUserIds.push(...adminIds);
      console.log('[attendance/disable] will unlink users:', unlinkUserIds);


      // 1) ล้าง default ของ OA
      try {
        const resp = await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu', { method:'DELETE' });
        if (!resp.ok && resp.status !== 404) {
          const txt = await resp.text().catch(()=> '');
          throw new Error(`unset default failed: ${resp.status} ${txt}`);
        }
        console.log('[attendance/disable] unset default OK');
      } catch (e) {
        console.warn('[attendance/disable] unset default warn:', String(e?.message || e));
      }

      // 2) unlink รายบุคคล (ถ้าระบุมา)
      let unlinkedCount = 0;
      for (const uid of unlinkUserIds) {
        try {
          const del = await callLineAPITenant(
            tenant.ref,
            `/v2/bot/user/${encodeURIComponent(uid)}/richmenu`,
            { method:'DELETE' }
          );
          if (!del.ok && del.status !== 404) {
            const txt = await del.text().catch(()=> '');
            console.warn('[attendance/disable] unlink fail', uid, del.status, txt);
          } else {
            // verify (GET): ถ้ายังมีเมนูจะได้ 200, ถ้าไม่มีกลับ 404
            let ok404 = true;
            try {
              const chk = await callLineAPITenant(
                tenant.ref,
                `/v2/bot/user/${encodeURIComponent(uid)}/richmenu`,
                { method:'GET' }
              );
              ok404 = (chk.status === 404);
            } catch {}
            unlinkedCount++;
            console.log('[attendance/disable] unlinked user', uid, ok404 ? '(verified 404)' : '(still linked?)');
          }
        } catch (e) {
          console.warn('[attendance/disable] unlink error', uid, String(e?.message || e));
        }
        await new Promise(r => setTimeout(r, 70));
      }

      // 3) (ออปชัน) ลบเมนูทิ้งด้วย
      let deletedMenus = 0;
      if (deleteMenus) {
        for (const kind of ['ATTEND_MAIN_ADMIN', 'ATTEND_MAIN_USER']) {
          try {
            const snap = await tenant.ref.collection('richmenus').doc(kind).get();
            const d = snap.exists ? (snap.data() || {}) : {};
            const rid = d.lineId || d.richMenuId || d.lineRichMenuId || '';
            if (!rid) continue;
            const resp = await callLineAPITenant(
              tenant.ref,
              `/v2/bot/richmenu/${encodeURIComponent(rid)}`,
              { method:'DELETE' }
            );
            if (resp.ok) {
              deletedMenus++;
              console.log('[attendance/disable] deleted menu', kind, rid);
            } else {
              const txt = await resp.text().catch(()=> '');
              console.warn('[attendance/disable] delete menu warn', kind, rid, resp.status, txt);
            }
          } catch (e) {
            console.warn('[attendance/disable] delete menu error', kind, String(e?.message || e));
          }
          await new Promise(r => setTimeout(r, 70));
        }
      }

      // 4) อัปเดตสถานะ
      await tenant.ref.collection('integrations').doc('attendance')
        .set({ enabled:false, updatedAt:new Date() }, { merge:true });

      return res.json({ ok:true, unlinked: unlinkedCount, deletedMenus });
    } catch (err) {
      console.error('[attendance/disable] error:', err);
      return res.status(500).json({ ok:false, error:String(err?.message || err) });
    }
  }
);

// DEBUG: ปิด/ถอดเมนูด้วย curl
app.post('/debug/attendance/disable', express.json(), async (req, res) => {
  try {
    const tenantRef = await requireTenantFromReq(req); // มี helper เดิมแล้ว
    const { userIds = [], deleteMenus = false } = req.body || {};
    await disableAttendanceRichMenus(tenantRef, { unlinkUserIds: userIds, deleteMenus });
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ error:String(e?.message || e) });
  }
});


// ===== Attendance Profiles (อ่าน/บันทึกข้อมูลลงทะเบียนจาก LIFF) =====




// อ่านโปรไฟล์พนักงานจาก Apps Script TA
app.get('/api/tenants/:id/attendance/profile', async (req, res) => {
  try {
    const { id } = req.params;
    const { lineUserId } = req.query;
    if (!lineUserId) return res.status(400).json({ ok:false, error:'missing lineUserId' });

    const out = await callTA(id, 'get_profile', { lineUserId });
    // debug แบบเบา ๆ
    if (!out?.ok) console.warn('[TA/get_profile] bad response', out);
    return res.json({ ok:true, data: out.data || null });
  } catch (e) {
    console.error('[TA/get_profile]', e);
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});


// POST โปรไฟล์ (เขียนเข้าชีต + map jobTitle→role + เช็คบทบาทจากชีต แล้วสลับเมนูให้)
// POST โปรไฟล์ (เขียนชีต + เซ็ต role จาก jobTitle อย่างเคร่งครัด + สลับเมนูให้)
app.post('/api/tenants/:id/attendance/profile', express.json({ limit: '6mb' }), async (req, res) => {
  try {
    const { id } = req.params;
    const { lineUserId, profile } = req.body || {};
    if (!lineUserId || !profile) {
      return res.status(400).json({ ok: false, error: 'missing params' });
    }

    const actor = { lineUserId };

    // --- [A] เขียนโปรไฟล์ลงชีต TA ก่อน
    await callTA(id, 'upsert_profile', { lineUserId, profile, actor });

    // --- [B] ตีความ jobTitle -> role (owner/admin = สิทธิ์สูง, อื่นๆ = user)
    const jtRaw = String(profile?.jobTitle || '').trim();
    const jt = jtRaw.toLowerCase();

    const isOwner = ['owner','เจ้าของ'].includes(jt);
    const isAdmin = ['admin','administrator','แอดมิน','ผู้ดูแล','supervisor','หัวหน้า'].includes(jt);

    // ถ้าไม่ใช่ owner หรือ admin → เป็น user ทั้งหมด
    const desiredRole = isOwner ? 'owner' : (isAdmin ? 'admin' : 'user');

    // --- [C] เซ็ต role ไปที่ชีต (ให้สิทธิ์ตั้ง owner ด้วย isSystem:true)
    await callTA(id, 'set_role', {
      actor:  { lineUserId, isSystem: true },
      target: { lineUserId },
      role: desiredRole
    });

    // --- [D] อ่าน role กลับมาเพื่อความชัวร์ (ถ้าอ่านไม่ได้ ใช้ desiredRole)
    let role = desiredRole;
    try {
      const roleRes =
        (await callTA(id, 'get_user', { user_id: lineUserId }).catch(() => null)) ||
        (await callTA(id, 'get_role', { lineUserId }).catch(() => null));
      const fromTop = String(roleRes?.role || '').toLowerCase();
      const fromObj = String(roleRes?.user?.role || '').toLowerCase();
      if (fromTop || fromObj) role = (fromTop || fromObj);
    } catch { /* keep desiredRole */ }

    // --- [E] ลิงก์/ปลดเมนูตาม role
    const tRef = db.collection('tenants').doc(id);
    const accessToken = await getTenantSecretAccessToken(tRef);

    if (role === 'owner' || role === 'admin') {
      const rmSnap = await tRef.collection('richmenus').doc('ATTEND_MAIN_ADMIN').get();
      const rmData = rmSnap.exists ? (rmSnap.data() || {}) : {};
      const adminMenuId = rmData.lineRichMenuId || rmData.richMenuId || '';
      if (!adminMenuId) {
        console.warn('[TA/profile] ADMIN richmenu not ready');
      } else {
        const ok = await ensureUserLinkedRichMenuByToken(accessToken, lineUserId, adminMenuId, 2);
        console.log(`[TA/profile] link ADMIN verify=${ok} for ${lineUserId}`);
      }
    } else {
      // role=user → ปลดเมนูรายคนให้ใช้ default OA (USER)
      await unlinkRichMenuFromUserByToken(accessToken, lineUserId).catch(() => {});
      try {
        const cur = await getUserRichMenuIdByToken(accessToken, lineUserId);
        console.log(`[TA/profile] unlink to default, current user menu id="${cur}" (empty=ok)`);
      } catch {}
    }


    return res.json({ ok: true, role, menu: (role === 'owner' || role === 'admin') ? 'admin' : 'user' });
  } catch (e) {
    console.error('[TA/upsert_profile]', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});


app.get('/debug/richmenu/user/:tenantId/:userId', async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const tRef = db.collection('tenants').doc(tenantId);
    const accessToken = await getTenantSecretAccessToken(tRef);
    const cur = await getUserRichMenuIdByToken(accessToken, userId);
    res.json({ ok: true, userId, richMenuId: cur });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});



// DEBUG ONLY: อ่านค่าการตั้งค่า TA ของ tenant
app.get('/api/tenants/:id/attendance/debug-config', async (req, res) => {
  try {
    const { id } = req.params;
    const tdoc = await db.collection('tenants').doc(id).get();
    if (!tdoc.exists) return res.status(404).json({ ok:false, error:'tenant_not_found' });

    const data = tdoc.data() || {};
    const sub = await tdoc.ref.collection('integrations').doc('attendance').get();
    const att = sub.exists ? sub.data() : {};
    return res.json({
      ok:true,
      data: {
        inline: data?.integrations?.attendance || null,
        legacy: data?.attendance || null,
        subdoc: att || null,
        envUrl: process.env.APPS_SCRIPT_EXEC_URL_TA ? 'set' : 'missing',
        envKey: process.env.APPS_SCRIPT_SHARED_KEY_TA || process.env.APPS_SCRIPT_SHARED_KEY ? 'set' : 'missing',
      }
    });
  } catch (e) {
    console.error('[TA/debug-config]', e);
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});




// ===== OCR (สแกนบัตรประชาชน) — ประมวลผลแล้ว "ไม่เก็บรูป" =====
app.post('/api/tenants/:id/attendance/ocr', express.json({ limit:'15mb' }), async (req, res) => {
  try {
    const { id } = req.params;
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ ok:false, error:'missing imageBase64' });

    // ยืนยันว่า tenant มีอยู่
    const snap = await db.collection('tenants').doc(id).get();
    if (!snap.exists) return res.status(404).json({ ok:false, error:'tenant_not_found' });

    // แปลงเป็น Buffer ใช้กับ OCR engine ภายนอกได้
    const buf = Buffer.from(String(imageBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64');

    // TODO: เรียก OCR engine จริง (Google Vision / AWS Textract / tesseract.js)
    // ด้านล่างเป็น "stub" ที่คืนโครงสร้างข้อมูลเปล่า ๆ ไว้ก่อน
    const parsed = {
      nationalId: '',   // 13 หลัก
      title: '',
      firstName: '',
      lastName: '',
      birthDate: '',    // YYYY-MM-DD
      address: '',
      issueDate: '',    // YYYY-MM-DD
      expiryDate: ''    // YYYY-MM-DD
    };

    // ตัวอย่าง: ถ้าจะใช้ tesseract.js-node ให้ parse จาก buf แล้ว map -> parsed

    // สำคัญ: ไม่บันทึก buf/รูปใด ๆ ลง disk หรือ storage
    return res.json({ ok:true, data: parsed });
  } catch (e) {
    console.error('[attendance/ocr]', e);
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});


// ดึงผู้รับแจ้งเตือนจากชีต roles (owner/admin) — ถ้าไม่มีเลย ให้ส่งกลับหาคนกดเอง
async function resolveClockRecipientsFromSheet(tenantId, actorUserId, { excludeSelfIfAdmin = false } = {}) {
  try {
    const res = await callTA(tenantId, 'list_admins', {});
    let ids = Array.isArray(res?.ids) ? res.ids.filter(Boolean) : [];
    if (excludeSelfIfAdmin) ids = ids.filter(id => id !== actorUserId);
    if (!ids.length) ids = [actorUserId];
    return Array.from(new Set(ids));
  } catch (e) {
    console.warn('[resolveClockRecipientsFromSheet] failed:', e?.message || e);
    return [actorUserId];
  }
}


// ================== [P0] CLOCK IN/OUT ==================
app.post('/api/tenants/:id/attendance/clock', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    let   { lineUserId, type, lat, lng, note } = req.body || {};
    if (!lineUserId || !type) {
      return res.status(400).json({ ok:false, error:'missing params' });
    }

    // normalize
    type = String(type).toLowerCase();                     // 'in' | 'out'
    lat  = (lat  === '' || lat  == null) ? undefined : Number(lat);
    lng  = (lng  === '' || lng  == null) ? undefined : Number(lng);
    if (Number.isNaN(lat)) lat = undefined;
    if (Number.isNaN(lng)) lng = undefined;

    const action = (type === 'in') ? 'clock_in' : 'clock_out';

    // 1) บันทึกลง GAS
    const gasRes = await callTA(id, action, { lineUserId, lat, lng, note });
    // map error ที่มาจาก GAS
    if (!gasRes || gasRes.ok === false) {
      const map = { already_clocked_out_today: 'วันนี้คุณลงเวลาออกไปแล้ว' };
      throw new Error(map[gasRes?.error] || gasRes?.error || 'gas_failed');
    }


    // 2) ดึงโปรไฟล์ + ที่อยู่ (สำหรับแสดงผล)
    //    - jobTitle / fullName มาจากชีต employees (ผ่าน GAS:get_profile)
    //    - address มาจาก reverse_geocode
    let fullName = '';
    let jobTitle = '';
    try {
      const prof = await callTA(id, 'get_profile', { lineUserId });
      if (prof?.ok && prof.data) {
        fullName = String(prof.data.fullName || '').trim();
        jobTitle = String(prof.data.jobTitle || '').trim();
      }
    } catch {}
    // fallback ชื่อจาก LINE ถ้ายังว่าง
    if (!fullName) {
      const tRef = db.collection('tenants').doc(id);
      fullName = (await getDisplayName(tRef, lineUserId)) || 'พนักงาน';
    }
    if (!jobTitle) jobTitle = '-';

    let address = '';
    if (typeof lat === 'number' && typeof lng === 'number') {
      try {
        const geo = await callTA(id, 'reverse_geocode', { lat, lng });
        address = String(geo?.address || '').trim();
      } catch {}
    }

    // 3) สร้างข้อความ/ Flex ให้ทั้งผู้กด และ owner/admin
    const thOpts = { timeZone: 'Asia/Bangkok' };
    const dt = new Date();
    const dateTh = dt.toLocaleDateString('th-TH', thOpts);
    const timeTh = dt.toLocaleTimeString('th-TH', { ...thOpts, hour: '2-digit', minute: '2-digit' });

    const title = (action === 'clock_in') ? 'ลงเวลาเข้า' : 'ลงเวลาออก';
    const placeText = address
      ? address
      : (typeof lat === 'number' && typeof lng === 'number' ? `พิกัด: ${lat}, ${lng}` : '—');

    const ACCENT   = (action === 'clock_in') ? '#16A34A' : '#EF4444';
    const GREY_900 = '#111111';
    const GREY_600 = '#6B7280';
    const GREY_400 = '#9CA3AF';

    // helper แถว label:value
    const row = (label, value) => ({
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: label, size: 'sm', color: GREY_400, flex: 2 },
        { type: 'text', text: String(value || '—'), size: 'sm', color: GREY_900, flex: 5, wrap: true }
      ]
    });

    const bubble = {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        backgroundColor: '#FFFFFF',
        contents: [
          // Header (แถบสี + title + time/date)
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              // ✅ box ต้องมี layout และ contents เสมอ
              { type: 'box', layout: 'vertical', contents: [], width: '6px', height: '44px', backgroundColor: ACCENT },
              {
                type: 'box',
                layout: 'vertical',
                paddingStart: '12px',
                contents: [
                  { type: 'text', text: title, weight: 'bold', size: 'lg', color: ACCENT },
                  { type: 'text', text: `${timeTh} • ${dateTh}`, size: 'xs', color: GREY_600 }
                ]
              }
            ]
          },

          // ชื่อ + ตำแหน่ง
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            contents: [
              { type: 'text', text: fullName, weight: 'bold', size: 'md', wrap: true },
              { type: 'text', text: `ตำแหน่ง: ${jobTitle || '-'}`, size: 'sm', color: GREY_600, wrap: true }
            ]
          },

          { type: 'separator', margin: 'md' },

          // รายละเอียด
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'sm',
            contents: [
              row('วัน', dateTh),
              row('เวลา', timeTh),
              row('สถานที่', placeText),
              ...(note ? [row('หมายเหตุ', note)] : [])
            ]
          }
        ]
      }
    };



    // 4) ส่งให้ "คนกดเอง" เป็นใบเสร็จ
    try {
      const tRef = db.collection('tenants').doc(id);
      console.log('[clock][notify] push self:', lineUserId);
      await callLineAPITenant(tRef, '/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lineUserId,
          messages: [{ type: 'flex', altText: `${title} @${fullName}`, contents: bubble }]
        })
      });
    } catch (e) {
      console.warn('[clock][push self] fail', e?.status || e?.message);
    }

    // 5) แจ้งเตือน owner/admin
    try {
      let recipients = await resolveClockRecipientsFromSheet(id, lineUserId, { excludeSelfIfAdmin: false });

      // sanitize id จากชีต: ตัดช่องว่าง/เครื่องหมาย : ท้ายสตริง
      recipients = recipients
        .map(s => String(s || '').trim().replace(/[:\s]+$/g, ''))
        .filter(Boolean);

      console.log('[clock][notify] admins:', recipients);

      if (recipients.length) {
        const tRef = db.collection('tenants').doc(id);
        for (const to of recipients) {
          await callLineAPITenant(tRef, '/v2/bot/message/push', {
            method: 'POST',
            headers: { 'Content-Type':'application/json' },
            body: JSON.stringify({
              to,
              messages: [{ type:'flex', altText:`แจ้งเตือน${title} @${fullName}`, contents: bubble }]
            })
          }).catch(async (e) => {
            const txt = await e?.text?.() || '';
            console.warn('[clock][push admin] fail', to, e?.status || e?.message || txt);
          });
          await new Promise(r => setTimeout(r, 60));
        }
      }
    } catch (e) {
      console.warn('[clock][notify] failed:', e?.message || e);
    }

    // ตอบกลับ LIFF
    return res.json({ ok:true, data: gasRes });
  } catch (e) {
    console.error('[attendance/clock]', e);
    return res.status(500).json({ ok:false, error: String(e?.message || e || 'server_error') });
  }
});


// ================== [P1] ATTENDANCE LOGS (list month) ==================
app.get('/api/tenants/:id/attendance/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { lineUserId, month, periodStart, periodEnd } = req.query || {};
    if (!lineUserId) return res.status(400).json({ ok:false, error:'missing lineUserId' });

    // เลือกโหมดช่วงเวลา
    const payload = periodStart && periodEnd
      ? { lineUserId, periodStart, periodEnd }
      : { lineUserId, month: month || new Date().toISOString().slice(0,7) };

    // เรียก GAS ผ่าน helper เดิม (คุณมีอยู่แล้ว)
    // แนะนำทำ action ชื่อ 'get_logs' ฝั่ง GAS ให้คืน days, leave, summary
    const r = await callTA(id, 'list_work_logs', payload);

    // shape มาตรฐานสำหรับหน้า ta-admin.html
    const out = {
      days:    Array.isArray(r?.days)    ? r.days    : [],
      leave:   Array.isArray(r?.leave)   ? r.leave   : [],
      summary: r?.summary && typeof r.summary === 'object' ? r.summary : {
        workHours: 0, workDays: 0, leaveHours: 0, leaveDays: 0
      }
    };
    return res.json({ ok:true, data: out });
  } catch (e) {
    console.error('[attendance/logs]', e);
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});


// ===== helpers: ตรวจสิทธิ์ผู้ดูแล =====
async function ensureAdminOrOwner(tenantId, actor) {
  const roleObj = await getRoleViaGAS(tenantId, actor?.lineUserId);
  if (!roleObj || (roleObj.role !== 'admin' && roleObj.role !== 'owner')) {
    const e = new Error('forbidden'); e.status = 403; throw e;
  }
  return true;
}

// ---------- Attendance config (single source of truth) ----------
async function getAttendanceConfig(tenantId) {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const snap = await tenantRef.collection('integrations').doc('attendance').get();
  const att = snap.exists ? (snap.data() || {}) : {};

  // รองรับหลายคีย์ + .env fallback
  const sheetId =
    att.sheetId ||
    att.appsSheetId ||             // ชื่อที่ UI เขียนไว้
    process.env.TA_SHEET_ID || ''; // เผื่ออนาคต

  const webAppUrl =
    att.webAppUrl ||
    process.env.APPS_SCRIPT_EXEC_URL_TA || '';

  const sharedKey =
    att.sharedKey ||
    process.env.APPS_SCRIPT_SHARED_KEY_TA ||
    process.env.APPS_SCRIPT_SHARED_KEY || '';

  // — debug ชัดๆ —
  console.log('[ATT/CFG]', {
    tenantId,
    enabled: !!att.enabled,
    sheetId_ok: !!sheetId,
    webAppUrl_ok: !!webAppUrl,
    // ถ้าอยากดูค่าจริง ให้ log ค่าเต็มชั่วคราว (ระวัง secrets)
    // sheetId, webAppUrl
  });

  return { enabled: !!att.enabled, sheetId, webAppUrl, sharedKey };
}

function getStatusStoreFromReqOrTenant(att, req){
  // ลำดับสิทธิ์: query > tenant settings > default
  const q = String(req.query?.status_store || '').toLowerCase().trim();
  if (q === 'sheet' || q === 'firestore') return q;

  // เก็บ config ไว้ใน subdoc integrations/attendance ก็ได้ (optional)
  const t = String(att?.payrollStatusStore || att?.statusStore || '').toLowerCase().trim();
  if (t === 'sheet' || t === 'firestore') return t;

  return 'firestore';
}

async function fetchPayStatusAuto(tenantId, month, lineUserId, req){
  try{
    const attCfg = await getAttendanceConfig(tenantId);
    const store = getStatusStoreFromReqOrTenant(attCfg, req);
    if (store === 'sheet') {
      const r = await callTA(tenantId, 'pay_status_get_map', { month });
      const m = (r && r.data) || {};
      return m[lineUserId] || { status:'pending', note:'' };
    }
    // firestore (เดิม)
    const ref  = admin.firestore().collection('tenants').doc(tenantId)
                 .collection('payroll').doc(month).collection('employees').doc(lineUserId);
    const snap = await ref.get();
    const d = snap.exists ? (snap.data() || {}) : {};
    return { status: d.status || 'pending', note: d.note || '' };
  }catch(_){ return { status:'pending', note:'' }; }
}

// ตรวจว่า tenant เปิดใช้ Time Attendance และมีค่าเชื่อมต่อครบ
async function ensureAttendanceEnabled(tenantId) {
  const attSnap = await db.collection('tenants')
    .doc(tenantId).collection('integrations').doc('attendance').get();
  const att = attSnap.exists ? (attSnap.data() || {}) : {};

  // ต้องเปิดใช้งาน
  if (att.enabled !== true) {
    const err = new Error('attendance_not_enabled');
    err.status = 403;
    throw err;
  }

  // ต้องมี sheetId/appsSheetId และ URL ของ GAS
  const sheetId   = att.sheetId || att.appsSheetId || process.env.TA_SHEET_ID || '';
  const webAppUrl = att.webAppUrl || process.env.APPS_SCRIPT_EXEC_URL_TA || '';

  if (!sheetId) {
    const err = new Error('missing sheetId in tenant settings');
    err.status = 500;
    throw err;
  }
  if (!webAppUrl) {
    const err = new Error('missing Apps Script URL (webAppUrl/APPS_SCRIPT_EXEC_URL_TA)');
    err.status = 500;
    throw err;
  }

  return att; // เผื่อใช้ค่าต่อ
}

// ==== list payroll status for a month ====
app.get('/api/tenants/:id/admin/payroll/status', async (req, res) => {
  try {
    // รองรับทั้ง param และ body (กันกรณีถูกเรียกผิดๆ ในอนาคต)
    const tenantId = req.params.id || req.body?.tenantId || '';
    const month = (req.query?.month || req.body?.month || '').trim();
    const actorLineUserId =
      req.query?.actorLineUserId ||
      req.body?.actorLineUserId ||
      req.body?.actor?.lineUserId ||
      '';

    if (!tenantId) {
      return res.status(400).json({ ok:false, error:'tenantId required' });
    }
    if (!month) {
      return res.status(400).json({ ok:false, error:'month required (YYYY-MM)' });
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ ok:false, error:'invalid month format (use YYYY-MM)' });
    }
    if (!actorLineUserId) {
      return res.status(400).json({ ok:false, error:'actorLineUserId required' });
    }

    // ตรวจสิทธิ์ (admin/owner)
    await ensureAdminOrOwner(tenantId, { lineUserId: actorLineUserId });

    // อ่าน config attendance (เพื่อรู้ว่าจะใช้ sheet หรือ firestore)
    const attCfg = await getAttendanceConfig(tenantId);
    const store = getStatusStoreFromReqOrTenant(attCfg, req);

    // --- ดึงจาก Google Sheet ผ่าน GAS ---
    if (store === 'sheet') {
      const r = await callTA(tenantId, 'pay_status_get_map', { month });
      if (!r || r.ok === false) {
        throw new Error(r?.error || 'gas_failed');
      }
      // คาดหวัง r.data = { [lineUserId]: { status, note, by, updatedAt } }
      return res.json({ ok:true, data: r.data || {} });
    }

    // --- ดึงจาก Firestore ---
    const snap = await admin
      .firestore()
      .collection('tenants').doc(tenantId)
      .collection('payroll').doc(month)
      .collection('employees')
      .get();

    const map = {};
    snap.forEach(d => {
      // ป้องกันค่า null/undefined
      const data = d.data() || {};
      map[d.id] = {
        status: data.status || 'Pending',
        note: data.note || '',
        by: data.by || '',
        updatedAt: data.updatedAt || null
      };
    });

    return res.json({ ok:true, data: map });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});






// save payroll status 
app.post('/api/tenants/:id/admin/payroll/status', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { month, lineUserId, status, note = '', actorLineUserId } = req.body || {};
    if (!month || !lineUserId || !status) {
      return res.status(400).json({ ok:false, error:'missing month/lineUserId/status' });
    }
    await ensureAdminOrOwner(id, { lineUserId: actorLineUserId });

    const attCfg = await getAttendanceConfig(id);
    const store = getStatusStoreFromReqOrTenant(attCfg, req);

    if (store === 'sheet') {
      // -> GAS
      const r = await callTA(id, 'pay_status_save', {
        month, lineUserId, status, note, actor: { lineUserId: actorLineUserId || '' }
      });
      if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
      return res.json({ ok:true, store:'sheet' });
    }

    // -> Firestore (ของเดิม)
    const ref = admin.firestore().collection('tenants').doc(id)
      .collection('payroll').doc(month).collection('employees').doc(lineUserId);
    await ref.set({
      status: String(status), note: String(note || ''), updatedAt: new Date(),
      actorLineUserId: actorLineUserId || ''
    }, { merge:true });

    return res.json({ ok:true, store:'firestore' });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});


// อ่านโปรไฟล์พนักงานจาก GAS
async function getEmployeeProfile(tenantId, lineUserId) {
  const r = await callTA(tenantId, 'get_profile', { lineUserId });
  if (!r || r.ok === false) return null;
  return r.data || null;
}

// ดึงสรุปทำงานของเดือนจาก GAS
async function getMonthlyLogs(tenantId, lineUserId, month) {
  const r = await callTA(tenantId, 'list_work_logs', { lineUserId, month });
  if (!r || r.ok === false) return { days: [], leave: [], summary:{workHours:0,workDays:0,leaveHours:0,leaveDays:0} };
  const data = r.data || r; // กันกรณีคืนตรง
  return {
    days: data.days || [],
    leave: data.leave || [],
    summary: Object.assign({workHours:0,workDays:0,leaveHours:0,leaveDays:0}, data.summary||{})
  };
}

// คำณวน “ชั่วโมงสายรวม” ตาม shift/grace (ใช้สูตรเดียวกับหน้า LIFF)
function parseHm(hm){ const m=String(hm||'').match(/^(\d{1,2}):(\d{2})$/); if(!m) return null; return {h:+m[1], m:+m[2]}; }
function lateMinutesForDay(d, shiftIn, graceMin){
  if (!d?.inTime || !shiftIn) return 0;
  const s = parseHm(shiftIn); if (!s) return 0;
  const inAt = new Date(d.inTime);
  const sch  = new Date(inAt); sch.setHours(s.h, s.m, 0, 0);
  const diff = Math.round((inAt - sch) / 60000);
  return Math.max(0, diff - Number(graceMin||0));
}


const TMP_FILES = new Map(); // token -> { buf, name, ctype, exp }
setInterval(()=>{ // เก็บ 10 นาที
  const now = Date.now();
  for (const [k,v] of TMP_FILES.entries()) if (!v || v.exp < now) TMP_FILES.delete(k);
}, 60_000);


// รายการรอบจ่าย (จากชีต RUN) + summary ต่อ run
app.get('/api/tenants/:id/admin/payroll/runs', async (req, res) => {
  try {
    const { id } = req.params;
    const { actorLineUserId, withAgg } = req.query || {};
    await ensureAdminOrOwner(id, { lineUserId: actorLineUserId });

    const wantAgg = String(withAgg || '') === '1';
    const tenantRef = db.collection('tenants').doc(id);

    // 1) พยายามอ่าน runs จาก Firestore ก่อน
    let runs = [];
    try {
      const snap = await tenantRef.collection('payroll_runs').orderBy('createdAt', 'desc').get();
      runs = snap.docs.map(d => ({ runId: d.id, ...d.data() }));
    } catch (_) { /* ignore */ }

    // ถ้า Firestore ว่าง ให้ fallback ไป GAS
    if (!runs.length) {
      const r = await callTA(id, 'list_runs', {});
      if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
      runs = r.data || [];
    }

    // 2) ถ้าไม่ขอสรุป -> ส่งกลับตรงๆ
    if (!wantAgg) {
      return res.json({ ok: true, data: runs });
    }

    // 3) คำนวณสรุปต่อ run จาก Firestore (ไม่เรียก GAS ทีละ run)
    const itemsColl = tenantRef.collection('payroll_items');

    const withSummary = await Promise.all(runs.map(async (r) => {
      const runId = r.runId || r.id;
      if (!runId) return { ...r, itemsCount: 0, sumNet: 0 };

      let itemsCount = 0;
      let sumNet = 0;

      // 3.1 ลอง subcollection ใน run ก่อน (เร็วและเจาะจง)
      try {
        const subSnap = await tenantRef.collection('payroll_runs').doc(runId).collection('items').get();
        if (!subSnap.empty) {
          subSnap.forEach(doc => {
            const x = doc.data() || {};
            const net = Number(x.netPay ?? x.detail?.netPay ?? 0);
            if (!Number.isNaN(net)) sumNet += net;
            itemsCount += 1;
          });
          return { ...r, itemsCount, sumNet };
        }
      } catch (_) { /* ignore */ }

      // 3.2 fallback: ค้นจากคอลเลกชันรวม (กรณีไม่ได้เก็บเป็น subcollection)
      try {
        const qSnap = await itemsColl.where('runId', '==', runId).get();
        if (!qSnap.empty) {
          qSnap.forEach(doc => {
            const x = doc.data() || {};
            const net = Number(x.netPay ?? x.detail?.netPay ?? 0);
            if (!Number.isNaN(net)) sumNet += net;
            itemsCount += 1;
          });
        }
      } catch (_) { /* ignore */ }

      return { ...r, itemsCount, sumNet };
    }));

    return res.json({ ok: true, data: withSummary });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
});


// รายการจ่ายต่อคน (จากชีต ITEM) — รองรับ filter ด้วย runId หรือ month หรือ keyword
app.get('/api/tenants/:id/admin/payroll/items', async (req, res) => {
  try {
    const { id } = req.params;
    const { actorLineUserId, runId, month, q } = req.query || {};
    await ensureAdminOrOwner(id, { lineUserId: actorLineUserId });

    const tenantRef = db.collection('tenants').doc(id);

    // 1) พยายามอ่านจาก Firestore ก่อน (ที่ commit บันทึกไว้)
    let saved = [];
    if (runId) {
      const snap = await tenantRef.collection('payroll_runs').doc(runId).collection('items').get();
      saved = snap.docs.map(d => d.data());
    } else if (month) {
      const snap = await tenantRef.collection('payroll_items')
        .where('month', '==', month).get();
      saved = snap.docs.map(d => d.data());
    }

    // filter คำค้น
    if (q && saved.length) {
      const kw = String(q).toLowerCase();
      saved = saved.filter(x =>
        String(x.fullName||'').toLowerCase().includes(kw) ||
        String(x.lineUserId||'').toLowerCase().includes(kw)
      );
    }

    // ถ้ามีใน Firestore แล้ว ให้คืนเลย
    if (saved.length) return res.json({ ok:true, data: saved });

    // 2) fallback ไป GAS
    const r = await callTA(id, 'list_items', { runId, month, q });
    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
    return res.json({ ok:true, data: r.data || [] });

  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
});



/* ===== Flex Card Helpers (Payroll) ===== */

function buildPayrollReminderFlex({ tenantName, groupName, periodStart, periodEnd, payDate }) {
  return {
    type: "flex",
    altText: `แจ้งเตือนทำเงินเดือน • ${groupName}`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", spacing: "md",
        contents: [
          { type:"text", text: tenantName || "HR MANAGEMENT", weight:"bold", size:"sm", color:"#6b8afd" },
          { type:"text", text:"แจ้งเตือนทำเงินเดือน", weight:"bold", size:"xl", color:"#0f172a" },
          { type:"text", text: groupName, size:"md", color:"#334155", wrap:true },
          { type:"separator", margin:"md" },
          { type:"box", layout:"vertical", spacing:"sm", margin:"md",
            contents:[
              { type:"box", layout:"baseline", contents:[
                { type:"text", text:"ช่วงงวด", flex:2, size:"sm", color:"#64748b" },
                { type:"text", text:`${periodStart} → ${periodEnd}`, flex:5, size:"sm", wrap:true }
              ]},
              { type:"box", layout:"baseline", contents:[
                { type:"text", text:"วันจ่าย", flex:2, size:"sm", color:"#64748b" },
                { type:"text", text: payDate || "—", flex:5, size:"sm" }
              ]}
            ]
          }
        ]
      }
    }
  };
}


const BRAND_BLUE = '#3b82f6';
const TEXT_MUTED = '#64748b';

function fmtMoney(n) {
  const v = Number(n || 0);
  return (v % 1 === 0)
    ? v.toLocaleString('th-TH', { maximumFractionDigits: 0 })
    : v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function shortName(s){ return (s || '').trim() || '-'; }

/** Card ให้พนักงานรายคน — คำนวณสุทธิใหม่เสมอ */
function buildEmployeePayrollCard({
  monthLabel, periodStart, periodEnd, empName,
  basePay = 0, lateDeduct = 0, adjPlus = 0, adjMinus = 0, note = ''
}) {
  const base  = Number(basePay || 0);
  const late  = Number(lateDeduct || 0);
  const plus  = Number(adjPlus || 0);
  const minus = Number(adjMinus || 0);
  const net   = Math.max(0, base - late - minus + plus);

  return {
    type: 'flex',
    altText: `สรุปเงินเดือน ${monthLabel}: ${shortName(empName)} สุทธิ ${fmtMoney(net)} บาท`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '12px', contents: [
          { type: 'text', text: 'สรุปเงินเดือน', weight: 'bold', color: '#ffffff', size: 'sm' },
          { type: 'text', text: monthLabel, weight: 'bold', size: 'lg', color: '#ffffff' },
          { type: 'text', text: `${periodStart} – ${periodEnd}`, size: 'xs', color: '#e5e7eb' },
        ],
        backgroundColor: BRAND_BLUE, cornerRadius: 'md'
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', contents: [
          { type: 'text', text: shortName(empName), weight: 'bold', size: 'md' },
          { type: 'separator', margin: 'md' },
          rowKV('ฐานจ่าย',      fmtMoney(base)),
          rowKV('หักสาย/ขาด',  fmtMoney(late)),
          rowKV('บวกปรับ (+)',  fmtMoney(plus)),
          rowKV('หัก/ปรับ (-)', fmtMoney(minus)),
          { type: 'separator', margin: 'md' },
          { type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: 'รวมสุทธิ', weight: 'bold' },
              { type: 'text', text: fmtMoney(net), weight: 'bold', align: 'end' }
          ]},
          ...(note ? [{ type: 'text', text: `หมายเหตุ: ${note}`, size: 'xs', color: TEXT_MUTED, wrap: true }] : [])
        ]
      },
      styles: { body: { separator: true } }
    }
  };
}

/** Card สรุปให้ Owner/Admin — รวมยอดจาก items เอง */
function buildOwnerPayrollCard({ title, periodStart, periodEnd, items = [], actorName }) {
  const safeItems = items.map(x => ({ name: shortName(x.name), net: Number(x.net || 0) }));
  const grand = safeItems.reduce((s, x) => s + x.net, 0);

  return {
    type: 'flex',
    altText: `${title || 'สรุปการจ่ายเงินเดือน'} ช่วง ${periodStart} – ${periodEnd} รวม ${fmtMoney(grand)} บาท`,
    contents: {
      type: 'bubble',
      header: {
        type:'box', layout:'vertical', paddingAll:'12px',
        contents:[
          { type:'text', text:'สรุปการจ่ายเงินเดือน', size:'sm', weight:'bold', color:'#ffffff' },
          { type:'text', text:(title || 'งวด'), size:'lg', weight:'bold', color:'#ffffff' },
          { type:'text', text:`ช่วง ${periodStart} – ${periodEnd}`, size:'xs', color:'#e5e7eb' }
        ],
        backgroundColor: BRAND_BLUE, cornerRadius:'md'
      },
      body:{
        type:'box', layout:'vertical', spacing:'sm', contents:[
          { type:'box', layout:'vertical', spacing:'xs',
            contents: safeItems.slice(0,10).map(x=>({
              type:'box', layout:'horizontal', contents:[
                { type:'text', text: x.name, size:'sm', flex: 2, wrap:true },
                { type:'text', text: fmtMoney(x.net), size:'sm', align:'end', flex:1 }
              ]
            }))
          },
          { type:'separator', margin:'md' },
          { type:'box', layout:'horizontal', contents:[
            { type:'text', text:'รวมทั้งสิ้น', weight:'bold' },
            { type:'text', text: fmtMoney(grand), weight:'bold', align:'end' }
          ]},
          ...(actorName ? [{ type:'text', text:`ผู้ดำเนินการ: ${shortName(actorName)}`, size:'xs', color: TEXT_MUTED, margin:'sm' }] : [])
        ]
      }
    }
  };
}

/* tiny helper row (เดิมใช้ต่อได้) */
function rowKV(k,v){
  return { type:'box', layout:'horizontal', contents:[
    { type:'text', text:k, size:'sm', color: TEXT_MUTED },
    { type:'text', text:v, size:'sm', align:'end' }
  ]};
}

async function resolveActorName(tenantId, lineUserId) {
  try {
    // 1) ลองจากชีตพนักงาน (GAS) ก่อน
    const prof = await callTA(tenantId, 'get_profile', { lineUserId });
    const bySheet = prof?.ok && prof.data && (prof.data.fullName || prof.data.name);
    if (bySheet) return String(bySheet);

    // 2) ตกมาใช้ชื่อที่เรา cache ในระบบ (ถ้าคุณมี helper นี้)
    const tRef = db.collection('tenants').doc(tenantId);
    const n = await getDisplayName(tRef, lineUserId);
    if (n) return n;
  } catch (_) {}

  // 3) fallback
  return lineUserId;
}


// ==== NEW: Commit payroll, notify with Flex Cards only (no PDFs) ====
// Commit payroll (approve + notify) — idempotent + safe
app.post('/api/tenants/:id/admin/payroll/commit', async (req, res) => {
  const t0 = Date.now();
  try {
    const tenantId = req.params.id;
    const actor = req.body?.actor || {};
    const jobs  = Array.isArray(req.body?.jobs) ? req.body.jobs : [];
    const notify = !!req.body?.notify;

    const overwrite = !!req.body?.overwrite;
    console.log('[payroll/commit] runId=%s overwrite=%s jobs=%d', req.body?.runId || '(new)', overwrite, jobs.length);

    // ---- validate base ----
    if (!actor?.lineUserId) return res.status(400).json({ ok:false, error:'actor required' });
    if (!jobs.length)       return res.status(400).json({ ok:false, error:'jobs required' });
    if (jobs.length > 200)  return res.status(400).json({ ok:false, error:'too_many_jobs' });

    const roleOk = await canAdminForTenant(tenantId, actor.lineUserId);
    if (!roleOk) return res.status(403).json({ ok:false, error:'forbidden' });

    // ---- one period for all items + date format ----
    const ps = String(jobs[0]?.periodStart || '').slice(0,10);
    const pe = String(jobs[0]?.periodEnd   || '').slice(0,10);
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(ps) || !re.test(pe))
      return res.status(400).json({ ok:false, error:'invalid_period' });
    const mixed = jobs.some(j =>
      String(j.periodStart||'').slice(0,10) !== ps ||
      String(j.periodEnd||'').slice(0,10)   !== pe
    );
    if (mixed) return res.status(400).json({ ok:false, error:'mixed_period' });

    // ---- idempotency (30s window) ----
    const key = _idemKey(req);
    const replay = _idemGet(key);
    if (replay) {
      console.log('[payroll/commit] idem replay', key);
      return res.json(replay);
    }

    // ---- runId fast-path ----
    let runId = String(req.body?.runId || '').trim();
    const onlyIds = Array.from(new Set(
      jobs.map(j => String(j?.lineUserId || '').trim()).filter(Boolean)
    ));
    const groupId = String(req.body?.groupId || '').trim() || undefined;
    if (!runId) {
      const runResp = await callTA(tenantId, 'run_payroll', {
        actor: { lineUserId: actor.lineUserId },
        periodStart: ps,
        periodEnd:   pe,
        onlyLineUserIds: onlyIds,
        ...(groupId ? { groupId } : {})
      });
      if (!runResp?.ok) throw new Error(runResp?.error || 'run_payroll failed');
      runId = runResp.runId || runResp?.data?.runId || '';
      if (!runId) throw new Error('runId missing');
    }

    // ---- fetch draft items of the run (authoritative baseline) ----
    const itemsResp = await callTA(tenantId, 'list_items', { runId });
    if (!itemsResp?.ok) throw new Error(itemsResp?.error || 'list_items failed');
    const baseItems = Array.isArray(itemsResp.data) ? itemsResp.data : [];
    const byUid = new Map(baseItems.map(x => [String(x.lineUserId), x]));

    // ---- build safe items from selected jobs (only users in run) ----
    const monthKey   = ps.slice(0,7); // YYYY-MM
    const monthLabel = new Date(ps + 'T00:00:00')
      .toLocaleDateString('th-TH', { month:'short', year:'numeric' });

    const num = (v, fb=0) => { const n = Number(v); return Number.isFinite(n)? n : Number(fb)||0; };

    const selectedForNotify = [];
    let committed = 0;

    for (const job of jobs) {
      const uid = String(job?.lineUserId || '');
      if (!uid) continue;
      if (!byUid.has(uid)) continue; // ไม่อยู่ใน run นี้ → ข้าม

      // ✅ normalize สถานะเป็นตัวพิมพ์เล็กเสมอ
      const statusNorm = String(job.status || 'approved').toLowerCase();

      const base = byUid.get(uid) || {};
      const d = job?.detail || {};

      // FIX: ใช้ recurring allowances/deductions จากฐาน (GAS) เป็นส่วนหนึ่งของสุทธิ
      const baseAllow = num(base.allowances, 0);  // recurring จาก GAS
      const baseDed   = num(base.deductions, 0);  // recurring จาก GAS

      const safeDetail = {
        workDays:   num(d.workDays,   base.workDays),
        workHours:  num(d.workHours,  base.workHours),
        lateHours:  num(d.lateHours,  base.lateHours),
        basePay:    num(d.basePay,    base.basePay),
        lateDeduct: num(d.lateDeduct, base.lateDeduct),
        // FIX: ถ้า client ไม่ส่ง netPay มา ให้รวม recurring เดิมเสมอ
        // ใช้ค่าจาก client เป็นหลัก แล้วค่อย fallback ไป base
        netPay: num(
          d.netPay,
          ( num(d.basePay,    base.basePay)
            - num(d.lateDeduct, base.lateDeduct)
            + baseAllow - baseDed )
        ),
        payType:    String(d.payType ?? base.payType ?? ''),
        payRate:    num(d.payRate,    base.payRate),
        dailyHours: num(d.dailyHours, base.dailyHours),
        payEveryN:  num(d.payEveryN,  base.payEveryN),
      };

      const minus = num(job?.adjustments?.minus);
      const plus  = num(job?.adjustments?.plus);
      const note  = String(job?.adjustments?.note || '');

      // FIX: สุทธิสุดท้าย = สุทธิฐาน(GAS) + ปรับ(+/–)
      const netAdj = Math.max(0, safeDetail.netPay - minus + plus);

      // ✅ บันทึกสถานะจ่าย (ต่อคน) ด้วย pay_status_save (upsert by month,lineUserId)
      await callTA(tenantId, 'pay_status_save', {
        month: monthKey,
        lineUserId: uid,
        status: statusNorm,
        note,
        actor: { lineUserId: actor.lineUserId },
        overwrite
      });
      committed++;

      // FIX: เขียนกลับชีตโดย "รวม recurring เดิม + adjustments" แทนที่เคยทับค่าเดิม
      await callTA(tenantId, 'pay_item_patch', {
        runId,
        lineUserId: uid,
        status: statusNorm,      // ✅ บันทึกสถานะลงรายการด้วย
        periodStart: ps,                        // ✅ เผื่อ endpoint ฝั่ง GAS ต้องใช้
        periodEnd:   pe,

        basePay:    safeDetail.basePay,
        lateDeduct: safeDetail.lateDeduct,
        allowances: baseAllow + plus,   // FIX
        deductions: baseDed   + minus,  // FIX
        netPay:     netAdj,

        detail: {
          ...safeDetail,
          recurring: { allowances: baseAllow, deductions: baseDed }, // FIX: เก็บ recurring แยก
          adjustments: { plus, minus, note }
        }
      });

      if (notify) {
        selectedForNotify.push({
          lineUserId: uid,
          fullName: base.fullName || job.fullName || uid,
          monthLabel,
          periodStart: ps,
          periodEnd: pe,
          basePay: safeDetail.basePay,
          lateDeduct: safeDetail.lateDeduct,
          adjPlus: plus,
          adjMinus: minus,
          netPay: netAdj,
          note
        });
      }
    }

    // ---- notify (เหมือนของเดิม) ----
    let notifiedEmployees = 0;
    let notifiedOwnerCopies = 0;
    let notifiedOwnerSummaries = 0;

    if (notify && selectedForNotify.length) {
      const tenantRef = db.collection('tenants').doc(tenantId);

      let ownerIds = [];
      try {
        const r = await callTA(tenantId, 'list_admins', {});
        ownerIds = Array.isArray(r?.ids) ? r.ids.filter(Boolean) : [];
      } catch {}

      for (const it of selectedForNotify) {
        const empCard = buildEmployeePayrollCard({
          monthLabel: it.monthLabel,
          periodStart: it.periodStart,
          periodEnd: it.periodEnd,
          empName: it.fullName,
          net: it.netPay,
          basePay: it.basePay,
          lateDeduct: it.lateDeduct,
          adjPlus: it.adjPlus,
          adjMinus: it.adjMinus,
          note: it.note
        });
        try {
          await pushFlex(tenantRef, it.lineUserId, empCard.contents, empCard.altText);
          notifiedEmployees++;
        } catch (err) {
          console.error('[payroll notify employee] push failed', it.lineUserId, err);
        }
        for (const oid of ownerIds) {
          try {
            await pushFlex(tenantRef, oid, empCard.contents, `[สำเนารายคน] ${empCard.altText}`);
            notifiedOwnerCopies++;
          } catch (err) {
            console.error('[payroll notify owner copy] push failed', oid, err);
          }
        }
      }

      if (ownerIds.length) {
        // ✅ หาชื่อจริงของผู้ดำเนินการ (จากชีต -> cache -> fallback เป็น lineUserId)
        let operatorName = actor.fullName;
        if (!operatorName) {
          try {
            operatorName = await resolveActorName(tenantId, actor.lineUserId);
          } catch (_) {
            operatorName = actor.lineUserId;
          }
        }

        const total = selectedForNotify.reduce((s, x) => s + Number(x.netPay || 0), 0);
        const ownerCard = buildOwnerPayrollCard({
          title: `งวด ${monthLabel}`,
          periodStart: ps,
          periodEnd: pe,
          items: selectedForNotify.map(x => ({ name: x.fullName, net: x.netPay })),
          total,
          actorName: operatorName,     // ✅ ใช้ชื่อจริง
        });

        for (const oid of ownerIds) {
          try {
            await pushFlex(tenantRef, oid, ownerCard.contents, ownerCard.altText);
            notifiedOwnerSummaries++;
          } catch (err) {
            console.error('[payroll notify owner] push failed', oid, err);
          }
        }
      }
    }

    const out = {
      ok: true,
      runId,
      committed,
      notifiedEmployees,
      notifiedOwnerCopies,
      notifiedOwnerSummaries,
      at: new Date().toISOString(),
      ms: Date.now() - t0
    };
    _idemSet(key, out);
    console.log('[payroll/commit] ok runId=%s n=%d in %dms', runId, committed, out.ms);
    return res.json(out);

  } catch (e) {
    console.error('[commit payroll] error', e);
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});




// list groups
// list groups (normalize fields for UI)
app.get('/api/tenants/:id/admin/paygroups', async (req, res) => {
  try {
    const tenantId = req.params.id;
    const r = await callTA(tenantId, 'pg_list', {});

    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');

    const rows = Array.isArray(r.data) ? r.data : [];

    // map/normalize -> ให้ตรง header: 
    // groupId, name, type, n, startDate, payDayOfMonth, workdayOnly, notifyBeforeDays, createdAt, updatedAt
    const out = rows.map(raw => {
      const meta = raw.meta || {};
      const payDay = raw.payDay ?? raw.payDayOfMonth ?? meta.payDay ?? meta.payDayOfMonth ?? null;

      return {
        groupId:        raw.groupId || raw.id || '',
        name:           raw.name || '',
        type:           String(raw.type || '').trim(),            // 'monthly' | 'every_n_days'
        n:              (raw.n != null ? Number(raw.n) : null),
        startDate:      (raw.startDate || meta.startDate || '')?.slice(0,10) || '',
        payDayOfMonth:  (typeof payDay === 'number' || payDay === 'last') ? payDay : '',
        workdayOnly:    Boolean(raw.workdayOnly ?? meta.workdayOnly ?? false),
        notifyBeforeDays: Number(raw.notifyBeforeDays ?? meta.notifyBeforeDays ?? 0) || 0,
        createdAt:      (raw.createdAt || meta.createdAt || ''),
        updatedAt:      (raw.updatedAt || meta.updatedAt || '')
      };
    });

    res.json({ ok:true, data: out });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});

// create group
app.post('/api/tenants/:id/admin/paygroups', express.json(), async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { actor, groupId, name, type } = req.body || {};
    if (!actor?.lineUserId) return res.status(400).json({ ok:false, error:'actor required' });
    if (!name) return res.status(400).json({ ok:false, error:'name required' });
    if (!['monthly','every_n_days'].includes(String(type))) {
      return res.status(400).json({ ok:false, error:'type invalid' });
    }

    // ฟิลด์ใหม่
    let n = null, startDate = null, payDay = null, workdayOnly = false, notifyBeforeDays = 0;

    // สำหรับ monthly: payDay = 1..31 หรือ 'last'
    if (type === 'monthly') {
      const raw = String(req.body?.payDay ?? req.body?.payDayOfMonth ?? '').trim().toLowerCase();
      if (raw) {
        if (raw === 'last') payDay = 'last';
        else {
          const d = Number.parseInt(raw, 10);
          if (!(d >= 1 && d <= 31)) return res.status(400).json({ ok:false, error:'payDay must be 1–31 or last' });
          payDay = d;
        }
      }
    }

    // สำหรับ every_n_days: ต้องมี n และ startDate
    if (type === 'every_n_days') {
      const rawN = Number.parseInt(req.body?.n, 10);
      if (!(rawN >= 1)) return res.status(400).json({ ok:false, error:'n must be >= 1' });
      n = rawN;

      const s = String(req.body?.startDate || '').slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return res.status(400).json({ ok:false, error:'startDate (YYYY-MM-DD) required' });
      startDate = s;
    }

    workdayOnly = Boolean(req.body?.workdayOnly);
    notifyBeforeDays = Number(req.body?.notifyBeforeDays || 0) || 0;

    const payload = { actor, groupId, name, type, n, startDate, payDay, payDayOfMonth: payDay, workdayOnly, notifyBeforeDays };
    const r = await callTA(tenantId, 'pg_save', payload);
    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');

    res.json({ ok:true, data: r.data || null });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});

// update group
app.put('/api/tenants/:id/admin/paygroups/:groupId', express.json(), async (req, res) => {
  try {
    const tenantId = req.params.id;
    const groupId  = req.params.groupId;
    const { actor, name, type } = req.body || {};
    if (!actor?.lineUserId) return res.status(400).json({ ok:false, error:'actor required' });
    if (!name) return res.status(400).json({ ok:false, error:'name required' });
    if (!['monthly','every_n_days'].includes(String(type))) {
      return res.status(400).json({ ok:false, error:'type invalid' });
    }

    let n = null, startDate = null, payDay = null, workdayOnly = false, notifyBeforeDays = 0;

    if (type === 'monthly') {
      const raw = String(req.body?.payDay ?? req.body?.payDayOfMonth ?? '').trim().toLowerCase();
      if (raw) {
        if (raw === 'last') payDay = 'last';
        else {
          const d = Number.parseInt(raw, 10);
          if (!(d >= 1 && d <= 31)) return res.status(400).json({ ok:false, error:'payDay must be 1–31 or last' });
          payDay = d;
        }
      }
    }

    if (type === 'every_n_days') {
      const rawN = Number.parseInt(req.body?.n, 10);
      if (!(rawN >= 1)) return res.status(400).json({ ok:false, error:'n must be >= 1' });
      n = rawN;

      const s = String(req.body?.startDate || '').slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return res.status(400).json({ ok:false, error:'startDate (YYYY-MM-DD) required' });
      startDate = s;
    }

    workdayOnly = Boolean(req.body?.workdayOnly);
    notifyBeforeDays = Number(req.body?.notifyBeforeDays || 0) || 0;

    const payload = { actor, groupId, name, type, n, startDate, payDay, payDayOfMonth: payDay, workdayOnly, notifyBeforeDays };
    const r = await callTA(tenantId, 'pg_save', payload);
    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');

    res.json({ ok:true, data: r.data || { groupId } });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});


// set members of a group
app.post('/api/tenants/:id/admin/paygroups/members', express.json(), async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { actor, groupId, memberIds } = req.body || {};
    if (!actor?.lineUserId) return res.status(400).json({ ok:false, error:'actor required' });
    if (!groupId) return res.status(400).json({ ok:false, error:'groupId required' });

    const r = await callTA(tenantId, 'pg_members_save', {
      actor, groupId, memberIds: Array.from(new Set(memberIds||[])).filter(Boolean)
    });
    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});


// ดึง actor จาก query/body/headers แบบยืดหยุ่น
function parseActorFromReq(req) {
  const qActor = req.query?.actor || req.query?.actorLineUserId;
  const bActor = req.body?.actor?.lineUserId || req.body?.actorLineUserId;
  const hActor = req.get('X-Actor-Line-UserId');
  const lineUserId = String(qActor || bActor || hActor || '').trim();
  return { lineUserId };
}

// util
function toYMD(d){ return new Date(d).toISOString().slice(0,10); }
function isWeekend(d){ const w=d.getDay(); return w===0 || w===6; }
function shiftToWorkday(date, prefer='prev'){
  const d = new Date(date);
  if (!isWeekend(d)) return d;
  if (prefer === 'next') {
    while(isWeekend(d)) d.setDate(d.getDate()+1);
  } else {
    while(isWeekend(d)) d.setDate(d.getDate()-1);
  }
  return d;
}
function firstOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }

// === helpers for monthly schedule ===
function daysInMonthUTC(y, m /*0..11*/) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
function toYMD_UTC(d) { return d.toISOString().slice(0,10); }

/**
 * คำนวณงวดรายเดือนจาก payDayOfMonth + notifyBeforeDays
 * - todayISO: 'YYYY-MM-DD' (วันที่ใช้เช็คว่า "ครบกำหนดแจ้ง" หรือยัง)
 * - g: แถว group จากชีต (expects g.payDayOfMonth หรือ g.meta.payDayOfMonth)
 */
function calcMonthlyScheduleFor(todayISO, g) {
  const today = new Date(todayISO + 'T00:00:00Z');         // ตัดเวลาแบบ UTC
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();                           // เดือนที่จะ "จ่าย"

  // อ่านค่า payDay (เลข 1..31 หรือ 'last')
  const payRaw = g.payDay ?? g.payDayOfMonth ?? g.meta?.payDay ?? g.meta?.payDayOfMonth;
  const notifyBefore = Number(g.notifyBeforeDays ?? g.meta?.notifyBeforeDays ?? 0) || 0;
  const workdayOnly  = Boolean(g.workdayOnly ?? g.meta?.workdayOnly ?? false);

  // หา payDate ของ "เดือนปัจจุบัน"
  let payDate;
  if (String(payRaw).toLowerCase() === 'last') {
    payDate = new Date(Date.UTC(y, m + 1, 0));
  } else {
    const want = Math.max(1, Math.min(Number(payRaw || 1), 31));
    const dmax = daysInMonthUTC(y, m);
    const day  = Math.min(want, dmax);                     // ถ้าอยากได้ 31 แต่มี 30 วัน → ใช้ 30
    payDate    = new Date(Date.UTC(y, m, day));
  }
  // ถ้าต้องการให้วันจ่ายเป็นวันทำงานเท่านั้น → ขยับไป "วันทำงานก่อนหน้า"
  if (workdayOnly) payDate = shiftToWorkday(payDate, 'prev');

  // วันแจ้งเตือน = payDate - notifyBeforeDays
  const notifyDate = new Date(payDate);
  if (notifyBefore > 0) notifyDate.setUTCDate(notifyDate.getUTCDate() - notifyBefore);

  // *** ช่วงงวด = "เดือนก่อนหน้า" ของ payDate (ตามที่คุณต้องการ) ***
  const yPrev = payDate.getUTCFullYear();
  const mPrev = payDate.getUTCMonth() - 1;
  const periodStart = new Date(Date.UTC(yPrev, mPrev, 1));
  const periodEnd   = new Date(Date.UTC(yPrev, mPrev + 1, 0));

  return {
    isDue: toYMD_UTC(today) === toYMD_UTC(notifyDate),
    periodStart: toYMD_UTC(periodStart),
    periodEnd:   toYMD_UTC(periodEnd),
    payDate:     toYMD_UTC(payDate),
    notifyDate:  toYMD_UTC(notifyDate),
    workdayOnly,
    notifyBeforeDays: notifyBefore
  };
}

/**
 * คืนรายการกลุ่มที่ "ครบกำหนดวันนี้" พร้อมรายละเอียด period/payDate
 * สำหรับ monthly: ใช้ payDayOfMonth/payDay (1..31 หรือ 'last')
 * - workdayOnly=true: ถ้าตรงเสาร์-อาทิตย์ ขยับไปวันทำงาน (ค่าเริ่มต้น: ถอยไปวันทำงานก่อนหน้า)
 * - notifyBeforeDays: ไว้ใช้กรณีอยากเอาไปขยับวันแจ้งเตือนล่วงหน้า (ตอนนี้คืน payDate ให้ UI)
 */
async function getDueGroupsFor(tenantId, todayISO) {
  const pg = await callTA(tenantId, 'pg_list', {});
  if (!pg?.ok) throw new Error(pg?.error || 'pg_list_failed');

  const raw = Array.isArray(pg.data) ? pg.data : [];
  const today = new Date(todayISO + 'T00:00:00');

  const out = [];

  for (const g of raw) {
    const type = String(g.type || '').trim();
    const n = Number(g.n || 0);
    const startDate = g.startDate ? new Date(g.startDate) : null;

    // normalize pay day
    const payDayRaw = g.payDay ?? g.payDayOfMonth ?? g.meta?.payDay ?? g.meta?.payDayOfMonth ?? null;
    const workdayOnly = Boolean(g.workdayOnly ?? g.meta?.workdayOnly ?? false);
    const notifyBeforeDays = Number(g.notifyBeforeDays ?? g.meta?.notifyBeforeDays ?? 0) || 0;

    // helper to push row with standard fields UI ใช้
    const pushRow = (extra={}) => {
      out.push({
        groupId: g.groupId || g.id || '',
        name: g.name || '',
        type,
        n: n || null,
        startDate: (g.startDate || g.meta?.startDate || '')?.slice(0,10) || '',
        payDayOfMonth: (typeof payDayRaw === 'number' || payDayRaw === 'last') ? payDayRaw : '',
        workdayOnly,
        notifyBeforeDays,
        ...extra
      });
    };

    if (type === 'monthly') {
      const info = calcMonthlyScheduleFor(todayISO, g);
      if (info.isDue) {
        out.push({
          groupId: g.groupId || g.id || '',
          name: g.name || '',
          type,
          n: (g.n ? Number(g.n) : null),
          startDate: (g.startDate || g.meta?.startDate || '')?.slice(0,10) || '',
          // ส่งค่า config กลับให้ UI ด้วย (ตาม header ที่คุณใช้)
          payDayOfMonth: (g.payDay ?? g.payDayOfMonth ?? g.meta?.payDay ?? g.meta?.payDayOfMonth) ?? '',
          workdayOnly: Boolean(g.workdayOnly ?? g.meta?.workdayOnly ?? false),
          notifyBeforeDays: Number(g.notifyBeforeDays ?? g.meta?.notifyBeforeDays ?? 0) || 0,

          // ค่าที่คำนวณแล้ว (สำคัญ)
          periodStart: info.periodStart,
          periodEnd:   info.periodEnd,
          payDate:     info.payDate,
          notifyDate:  info.notifyDate,
        });
      }
      continue;
    }


    if (type === 'every_n_days') {
      if (!startDate || !(n >= 1)) continue;

      // หาไซเคิลที่ครอบวัน today อยู่ แล้ว "แจ้ง" ก่อนสิ้นรอบ N วันตามต้องการ
      // ตีความง่าย: แจ้งวันนี้ถ้า today == (end - notifyBeforeDays)
      let cycleStart = new Date(startDate);
      let cycleEnd = new Date(cycleStart);
      cycleEnd.setDate(cycleEnd.getDate() + (n - 1));

      while (cycleEnd < today) {
        cycleStart.setDate(cycleStart.getDate() + n);
        cycleEnd.setDate(cycleEnd.getDate() + n);
      }

      const payDate = new Date(cycleEnd); // สมมติจ่ายวันสุดท้ายของรอบ
      if (workdayOnly) payDate = shiftToWorkday(payDate, 'prev');

      const notifyDate = new Date(payDate);
      if (notifyBeforeDays > 0) notifyDate.setDate(notifyDate.getDate() - notifyBeforeDays);

      if (toYMD(notifyDate) === toYMD(today)) {
        pushRow({
          periodStart: toYMD(cycleStart),
          periodEnd:   toYMD(cycleEnd),
          payDate:     toYMD(payDate),
          notifyDate:  toYMD(notifyDate)
        });
      }
      continue;
    }

    // ประเภทอื่น (daily/weekly) — ข้ามในสCOPEนี้
  }

  return out;
}


async function listAdminIdsFromSheet(tenantId) {
  try {
    const r = await callTA(tenantId, 'list_admins', {});
    return Array.isArray(r?.ids) ? r.ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}

// GET: รายการกลุ่มที่ครบกำหนดแจ้งเตือนวันนี้ (เช็คสิทธิ์ด้วย GAS)
app.get('/api/tenants/:id/admin/paygroups/reminder-due', async (req, res) => {
  try {
    const tenantId = req.params.id;
    const actor    = parseActorFromReq(req);
    if (!actor.lineUserId) {
      return res.status(400).json({ ok:false, error:'actor required' });
    }

    // ✅ ใช้สิทธิ์จาก GAS (owner/admin เท่านั้น)
    await ensureAdminOrOwner(tenantId, actor);

    // today (โซนเวลาไทยแบบง่าย)
    const todayStr = String(req.query?.today || '').trim();
    const todayISO = todayStr || new Date(Date.now() + (7*60*60000)).toISOString().slice(0,10);

    const due       = await getDueGroupsFor(tenantId, todayISO);
    const adminIds  = await listAdminIdsFromSheet(tenantId);

    // ส่ง 2 รูปแบบ เพื่อรองรับทั้ง UI ตอนนี้และ notify-run ที่เรียกซ้ำ
    return res.json({
      ok: true,
      today: todayISO,
      data: due,
      duePayload: { adminIds, due }
    });
  } catch (e) {
    console.error('[REM-DUE]', e);
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});


// อ่านรายละเอียดกลุ่ม + สมาชิก
// get detail (group + members)
app.get('/api/tenants/:id/admin/paygroups/:groupId', async (req, res) => {
  try {
    const tenantId = req.params.id;
    const groupId  = req.params.groupId;
    const r = await callTA(tenantId, 'pg_get', { groupId });
    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
    // standardize output ให้ตรงกับ ta-admin.html เดิม
    const d = r.data || {};
    res.json({ ok:true, data:{ ...d, members: d.memberIds || [], memberIds: d.memberIds || [] } });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});



// ==== TA Payroll Reminder Helpers (place near schedule-preview helpers) ====
function isWeekend(d){ const w=d.getDay(); return w===0 || w===6; }
function addWorkdays(base, n){
  const d=new Date(base); let left=n;
  while(left>0){ d.setDate(d.getDate()+1); if(!isWeekend(d)) left--; }
  return d;
}
function subWorkdays(base, n){
  const d=new Date(base); let left=n;
  while(left>0){ d.setDate(d.getDate()-1); if(!isWeekend(d)) left--; }
  return d;
}

// คืนวัน "แจ้งเตือน" ถัดไปของกลุ่ม (อิงสเปคที่คุยกัน)
function computeNextNotifyDateForGroup(g, today=new Date()){
  const type = String(g.type||'every_n_days');
  const n    = Number(g.n||0);
  const startYMD = String(g.startDate||'').slice(0,10);
  if(!startYMD) return null;
  const start = new Date(startYMD+'T00:00:00');

  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()); // ตัดเวลา
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  if (type === 'monthly'){
    // รอบ = 1..สิ้นเดือนของ "เดือนปัจจุบัน"
    // แจ้ง N วันก่อนวันแรกของเดือนถัดไป (N จาก g.n, default = 3)
    const warnN = n > 0 ? n : 3;
    const firstNextMonth = new Date(t0.getFullYear(), t0.getMonth()+1, 1);
    const notify = new Date(firstNextMonth);
    notify.setDate(notify.getDate()-warnN);
    return ymd(notify);
  }

  // every_n_days — เดินรอบจาก start ทีละ n วัน
  if (n <= 0) return null;
  let end = new Date(start);
  while (end <= t0) { end.setDate(end.getDate()+n); }
  // วันแจ้งเตือน = 1 วันก่อนวันสิ้นรอบ (ทำงานล้วน? ปรับที่นี่)
  const notify = new Date(end); notify.setDate(notify.getDate()-1);
  return ymd(notify);
}

// ใช้ pushText อยู่แล้วในไฟล์นี้
async function sendPayrollRemindersForTenant(tenant, { today }) {
  // 1) อ่าน integration/attendance (ต้องมี gasUrl/sharedKey/sheetId)
  const integRef = tenant.ref.collection('integrations').doc('attendance');
  const snap = await integRef.get();
  const att = snap.exists ? (snap.data() || {}) : {};

  const gasUrl    = String(att.webAppUrl || att.gasUrl || process.env.TA_WEBAPP_URL || '').trim();
  const sharedKey = String(att.sharedKey  || process.env.TA_SHARED_KEY || '').trim();
  const sheetId   = String(att.appsSheetId|| att.sheetId || process.env.TA_SHEET_ID || '').trim();

  if (!gasUrl || !sharedKey || !sheetId) {
    return { sent:0, groups:0, note:'integration_incomplete' };
  }

  // 2) เรียก GAS → pg_reminder_due
  let r;
  try {
    r = await callTA(tenant.id, 'pg_reminder_due', { sheetId, sharedKey, action:'pg_reminder_due', today });
  } catch (e) {
    console.error('[pg_reminder_due] callTA failed:', e);
    return { sent:0, groups:0, note:'gas_call_failed' };
  }

  const data = (r && r.data) || (r && r.result) || {};
  const due = Array.isArray(data.due) ? data.due : [];
  const adminIds = Array.isArray(data.adminIds) ? data.adminIds : [];

  if (!due.length || !adminIds.length) {
    return { sent:0, groups:0, note:'no_due_or_no_admins', today:data.today || today };
  }

  // 3) ประกอบข้อความ และ push ถึง admin/owner ทุกคน
  const lines = [];
  lines.push('🔔 แจ้งเตือนทำเงินเดือน');
  lines.push(`วันที่แจ้ง: ${data.today || today}`);
  lines.push('');
  for (const g of due) {
    // g = {groupId,name,type,n,periodStart,periodEnd,payDate,notifyDate,...}
    const name = g.name || g.groupId || '(ไม่ระบุชื่อกลุ่ม)';
    const range = (g.periodStart && g.periodEnd) ? `${g.periodStart} → ${g.periodEnd}` : '';
    const pay   = g.payDate ? `จ่าย: ${g.payDate}` : '';
    lines.push(`• ${name}`);
    if (range) lines.push(`  ช่วงงวด: ${range}`);
    if (pay)   lines.push(`  ${pay}`);
  }
  const msg = lines.join('\n');

  let okCount = 0;
  for (const uid of adminIds) {
    try {
      
      await pushText(uid, msg, tenant.ref);
      okCount++;
    } catch (e) {
      console.error('[reminder push] failed uid=', uid, e);
    }
  }

  return { sent: okCount, groups: due.length, adminCount: adminIds.length, today: data.today || today };
}

// ==== TA Payroll Auto Scheduler (separate from other jobs) ====
const TA_REMIND_CRON = process.env.TA_REMIND_CRON || '0 9 * * 1-5'; // 09:00 จันทร์–ศุกร์ (เวลาไทย)
const TA_REMIND_ENABLED = (process.env.TA_REMIND_ENABLED ?? 'true') !== 'false';

// ถ้าคุณใช้ node-cron ให้ใส่ { timezone: 'Asia/Bangkok' } ด้วย
if (TA_REMIND_ENABLED) {
  schedule(TA_REMIND_CRON, async () => {
    const runAt = new Date().toISOString();
    console.log(`[TA-REMINDER] tick ${runAt} spec=${TA_REMIND_CRON}`);
    try {
      const snap = await db.collection('tenants').get();
      for (const doc of snap.docs) {
        const tenantObj = { id: doc.id, ref: doc.ref };       // ✅ ส่ง object ที่มี id/ref
        const r = await sendPayrollRemindersForTenant(tenantObj, { 
          today: new Date().toISOString().slice(0,10)          // ✅ ระบุ today (เผื่อฝั่ง GAS ใช้)
        });
        console.log(`[TA-REMINDER] tenant=${tenantObj.id} ->`, r);
      }
    } catch (e) {
      console.error('[TA-REMINDER] error', e);
    }
  }, { timezone: 'Asia/Bangkok' });                            // ✅ เปิด timezone ของ node-cron

  console.log(`[TA-REMINDER] scheduled ${TA_REMIND_CRON} (Asia/Bangkok)`);
}

// ---- add response logger for these paths ----
app.use(wrapJsonForRoute('/api/tenants/'));


// GET: รายการกลุ่มที่ครบกำหนดแจ้งเตือนวันนี้ (proxy GAS)
// GET /admin/paygroups/reminder-due?today=YYYY-MM-DD
// GET /api/tenants/:id/admin/paygroups/reminder-due?today=YYYY-MM-DD



// === Paygroups: schedule preview (next period & notify dates) ===
app.get('/api/tenants/:id/admin/paygroups/schedule-preview', async (req, res) => {
  try {
    const tenantId = req.params.id;
    const today = req.query.today || undefined;  // (ออปชัน) YYYY-MM-DD
    const r = await callTA(tenantId, 'pg_schedule_preview', { today });
    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
    res.json({ ok:true, data: r.data || [] });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});



// ==== TA Admin – Manual cron endpoints ====
// 3.1 เรียกเฉพาะ tenant
// POST: ส่งแจ้งเตือนกลุ่มที่ถึงกำหนดวันนี้ (owner/admin เท่านั้น)
app.post('/api/tenants/:id/admin/paygroups/notify-run', express.json(), async (req, res) => {
  try {
    const tenantId = req.params.id;
    const actor    = parseActorFromReq(req);
    if (!actor.lineUserId) return res.status(400).json({ ok:false, error:'actor required' });

    // ✅ ตรวจสิทธิ์ด้วย GAS
    await ensureAdminOrOwner(tenantId, actor);

    const today = String(req.body?.today || '').trim()
               || new Date(Date.now() + (7*60*60000)).toISOString().slice(0,10);

    const due      = await getDueGroupsFor(tenantId, today);
    const adminIds = await listAdminIdsFromSheet(tenantId);

    if (!adminIds.length || !due.length) {
      return res.json({ ok:true, sent:0, groups: due.length, adminCount: adminIds.length });
    }

    const tenantRef = db.collection('tenants').doc(tenantId);

    // (เพิ่ม) อ่านชื่อ tenant (ถ้ามี)
    let tenantName = '';
    try {
      const t = await tenantRef.get();
      tenantName = (t.exists && (t.data()?.name || t.data()?.displayName)) || '';
    } catch {}

    let sent = 0;
    for (const g of due) {
      const name   = g.name || g.groupId || 'กลุ่มงวด';
      const period = (g.periodStart && g.periodEnd) ? `${g.periodStart} → ${g.periodEnd}` : '—';
      const payOn  = g.payDate || today || '';

      const flex = buildPayrollReminderFlex({
        tenantName,
        groupName: name,
        periodStart: g.periodStart || '-',
        periodEnd:   g.periodEnd   || '-',
        payDate:     payOn || '-'
      });

      for (const to of adminIds) {
        try {
          await callLineAPITenant(tenantRef, '/v2/bot/message/push', {
            method: 'POST',
            headers: { 'Content-Type':'application/json' },
            body: JSON.stringify({ to, messages: [flex] })
          });
          sent++;
          await new Promise(r => setTimeout(r, 60)); // กัน rate limit
        } catch (e) {
          console.warn('[REMIND/NOTIFY] push fail', to, e?.status || e?.message);
        }
      }
    }
    return res.json({ ok:true, sent, groups: due.length, adminCount: adminIds.length });
  } catch (e) {
    console.error('[REMIND/NOTIFY]', e);
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

// 3.2 เรียกแบบ all tenants (ป้องกันด้วย CRON_KEY)
app.post('/api/cron/ta/payroll-reminders', express.json(), async (req, res)=>{
  try{
    const key = String(req.query.key || req.body?.key || '').trim();
    if (!key || key !== String(process.env.CRON_KEY||'')) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }
    const snap = await db.collection('tenants').get();
    let totalSent = 0, totalGroups = 0;
    for (const doc of snap.docs) {
      const tenantObj = { id: doc.id, ref: doc.ref };
      const r = await sendPayrollRemindersForTenant(tenantObj, {
        today: new Date().toISOString().slice(0,10)
      });
      totalSent  += (r?.sent   || 0);
      totalGroups+= (r?.groups || 0);
    }

    res.json({ ok:true, totalSent, totalGroups });
  }catch(e){
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});




app.get('/api/tmp/:token', async (req, res) => {
  const rec = TMP_FILES.get(req.params.token);
  if (!rec) return res.status(404).end('expired');
  res.setHeader('Content-Type', rec.ctype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${rec.name || 'file'}"`);
  res.end(rec.buf);
});


// ================== [P0] LEAVE REQUEST ==================
app.post('/api/tenants/:id/leave/request', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    let { lineUserId, date, hours, reason, note, lat, lng, address } = req.body || {};
    if (!lineUserId || !date) {
      return res.status(400).json({ ok:false, error:'missing params' });
    }

    // normalize
    hours = (hours === '' || hours == null) ? undefined : Number(hours);
    if (Number.isNaN(hours)) hours = undefined;
    lat   = (lat   === '' || lat   == null) ? undefined : Number(lat);
    lng   = (lng   === '' || lng   == null) ? undefined : Number(lng);
    if (Number.isNaN(lat)) lat = undefined;
    if (Number.isNaN(lng)) lng = undefined;
    reason = String(reason || '').trim();
    note   = String(note || '').trim();
    address= String(address || '').trim();

    // reverse geocode (optional cache)
    if (!address && typeof lat==='number' && typeof lng==='number') {
      try {
        const geo = await callTA(id, 'reverse_geocode', { lat, lng });
        address = String(geo?.address || '').trim();
      } catch {}
    }

    // 1) call GAS → leave_request
    const gasRes = await callTA(id, 'leave_request', {
      lineUserId, date, hours, reason, note
    });
    if (!gasRes || gasRes.ok === false) {
      throw new Error(gasRes?.error || 'gas_failed');
    }

    // 2) สร้าง Flex ใบคำขอ + แจ้งเตือน
    const tRef = db.collection('tenants').doc(id);
    const fullName = (await getDisplayName(tRef, lineUserId)) || 'พนักงาน';
    const profile  = await callTA(id, 'get_profile', { lineUserId }).catch(()=>null);
    const jobTitle = profile?.ok ? (profile.data?.jobTitle || '-') : '-';

    const thTZ   = { timeZone:'Asia/Bangkok' };
    const dateTh = new Date(date).toLocaleDateString('th-TH', thTZ);
    const when   = new Date().toLocaleString('th-TH', thTZ);

    const bubble = {
      type:'bubble',
      hero: { // แถบสีหัวเรื่อง
        type:'box', layout:'vertical', height:'64px',
        contents:[
          { type:'text', text:'คำขอลางาน', weight:'bold', size:'lg', color:'#ffffff' },
          { type:'text', text:when, size:'xs', color:'#e6e6e6' }
        ],
        backgroundColor:'#F59E0B'
      },
      body:{ type:'box', layout:'vertical', spacing:'sm', contents:[
        { type:'text', text:fullName, size:'md', weight:'bold', wrap:true },
        { type:'text', text:`ตำแหน่ง: ${jobTitle}`, size:'sm', color:'#666666', wrap:true },
        { type:'separator', margin:'md' },

        { type:'box', layout:'baseline', spacing:'sm', contents:[
          { type:'text', text:'วันลา:', size:'sm', color:'#888888', flex:2 },
          { type:'text', text:dateTh,  size:'sm', color:'#111111', flex:5 }
        ]},
        { type:'box', layout:'baseline', spacing:'sm', contents:[
          { type:'text', text:'ชั่วโมง:', size:'sm', color:'#888888', flex:2 },
          { type:'text', text:String(hours ?? 0), size:'sm', color:'#111111', flex:5 }
        ]},
        ...(reason ? [{
          type:'box', layout:'baseline', spacing:'sm', contents:[
            { type:'text', text:'เหตุผล:', size:'sm', color:'#888888', flex:2 },
            { type:'text', text:reason,  size:'sm', color:'#111111', flex:5, wrap:true }
          ]
        }] : []),
        ...(note ? [{
          type:'box', layout:'baseline', spacing:'sm', contents:[
            { type:'text', text:'หมายเหตุ:', size:'sm', color:'#888888', flex:2 },
            { type:'text', text:note,    size:'sm', color:'#111111', flex:5, wrap:true }
          ]
        }] : []),
        ...(address ? [{
          type:'box', layout:'baseline', spacing:'sm', contents:[
            { type:'text', text:'สถานที่:', size:'sm', color:'#888888', flex:2 },
            { type:'text', text:address, size:'sm', color:'#111111', flex:5, wrap:true }
          ]
        }] : [])
      ]}
    };

    // 3) ส่งใบเสร็จให้คนยื่นลา
    try {
      await callLineAPITenant(tRef, '/v2/bot/message/push', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ to: lineUserId, messages:[{ type:'flex', altText:'คำขอลางานของคุณ', contents:bubble }] })
      });
    } catch (e) { console.warn('[leave][push self] fail', e?.status || e?.message); }

    // 4) แจ้ง owner/admin
    try {
      const recipients = await resolveClockRecipientsFromSheet(id, lineUserId, { excludeSelfIfAdmin:false });
      if (recipients.length) {
        for (const to of recipients) {
          await callLineAPITenant(tRef, '/v2/bot/message/push', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ to, messages:[{ type:'flex', altText:'แจ้งขอลางาน', contents:bubble }] })
          }).catch(async (e)=> {
            const txt = await e?.text?.() || ''; console.warn('[leave][push admin] fail', to, e?.status || e?.message || txt);
          });
          await new Promise(r=>setTimeout(r,60));
        }
      }
    } catch (e) { console.warn('[leave][notify] failed:', e?.message || e); }

    return res.json({ ok:true, data:gasRes });
  } catch (e) {
    console.error('[leave/request]', e);
    return res.status(500).json({ ok:false, error:String(e?.message || e || 'server_error') });
  }
});


//  ================== [P0] SETTING ADMIN ==================


// รายชื่อพนักงานทั้งหมด (ซ่อน owner) — ต้องเป็น admin/owner
app.post('/api/tenants/:id/admin/employees', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const actor = req.body?.actor || {};
    console.log('[ADMIN][employees] actor=', actor, 'tenant=', id);

    const roleObj = await getRoleViaGAS(id, actor.lineUserId);
    if (!roleObj || (roleObj.role !== 'admin' && roleObj.role !== 'owner')) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }

    const r = await callTA(id, 'list_employees', { actor, excludeOwner:true });
    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
    return res.json({ ok:true, data: r.data || [] });
  } catch (e) {
    console.error('[ADMIN][employees] error:', e);
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
});


// บันทึกข้อมูลพนักงาน (โปรไฟล์ + บทบาท + ค่าจ้าง)

app.post('/api/tenants/:id/admin/employee/save', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { actor, profile = {}, settings = {}, role } = req.body || {};

    // (ออปชัน) เติมค่าป้องกันกรณีฟอร์มยังไม่ส่งฟิลด์ใหม่มา
    profile.registerDate   = profile.registerDate   || '';
    profile.employmentType = profile.employmentType || '';

    const r = await callTA(id, 'save_employee', { actor, profile, settings, role });
    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
    return res.json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
});


// ตั้งค่าการจ่าย (กรณีอยากแยก)
app.post('/api/tenants/:id/admin/pay_settings', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { actor, lineUserId, settings } = req.body || {};
    const r = await callTA(id, 'save_pay_settings', { actor, lineUserId, settings });
    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
    return res.json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
});

// กำหนดบทบาท (owner/admin/user/ตำแหน่งอื่น ๆ)
app.post('/api/tenants/:id/admin/set_role', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { actor, target, role } = req.body || {};
    const r = await callTA(id, 'set_role', { actor, target, role });
    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
    return res.json({ ok:true, role:r.role });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
});

// รันงวดเงินเดือน (เขียน ITEM จากช่วงวันที่)
app.post('/api/tenants/:id/admin/payroll/run', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { actor, periodStart, periodEnd, onlyLineUserIds = [], groupId } = req.body || {};
    if (!actor?.lineUserId) return res.status(400).json({ ok:false, error:'actor required' });
    if (!periodStart || !periodEnd) return res.status(400).json({ ok:false, error:'periodStart/periodEnd required (YYYY-MM-DD)' });

    await ensureAdminOrOwner(id, actor);
    const r = await callTA(id, 'run_payroll', {
      actor, periodStart, periodEnd,
      onlyLineUserIds: Array.from(new Set((onlyLineUserIds||[]).filter(Boolean))),
      ...(groupId ? { groupId } : {})
    });

    if (!r || r.ok === false) throw new Error(r?.error || 'gas_failed');
    return res.json({ ok:true, runId: r.runId || null });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});


// ===== Simple payroll notifications (no PDF/URL) – via callLineAPITenant =====
function thb(n){
  const x = Number(n || 0);
  return x.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * notifyPaySimple({
 *   tenantRef,             // Firestore doc ref ของ tenant
 *   monthLabel,            // เช่น 'ต.ค. 2568' หรือ '2025-10'
 *   actorLineUserId,       // คนกดจ่าย
 *   items,                 // [{ lineUserId, fullName, netPay, note? }, ...] เฉพาะ "ที่เลือกจ่าย"
 *   ownerIds = []          // รายการ owner/admin ที่ให้แจ้งเพิ่ม
 * })
 */
async function notifyPaySimple({ tenantRef, monthLabel, actorLineUserId, items, ownerIds = [] }) {
  const total = (items || []).reduce((s, it) => s + Number(it.netPay || 0), 0);

  // ส่งข้อความล้วน (push) ด้วย callLineAPITenant
  async function pushText(to, text){
    await callLineAPITenant(tenantRef, '/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages: [{ type:'text', text }] })
    });
  }

  // 1) แจ้งพนักงานแต่ละคน
  for (const it of (items || [])){
    const text =
      `แจ้งผลการจ่ายเงินเดือน ${monthLabel}\n` +
      `ยอดสุทธิของคุณ: ${thb(it.netPay)} บาท` +
      (it.note ? `\nหมายเหตุ: ${String(it.note)}` : '');
    await pushText(it.lineUserId, text);
    await new Promise(r=>setTimeout(r,60)); // กัน rate limit
  }

  // 2) แจ้ง owner/admin สรุปยอด
  const lines = (items || []).map(it => `• ${it.fullName || it.lineUserId}: ${thb(it.netPay)} บาท`);
  const summary =
    `สรุปการจ่ายเงินเดือน ${monthLabel}\n` +
    (lines.length ? lines.join('\n') + '\n' : '') +
    `รวมทั้งสิ้น: ${thb(total)} บาท\n` +
    (actorLineUserId ? `ผู้ดำเนินการ: ${actorLineUserId}` : '');

  const uniqOwners = Array.from(new Set((ownerIds || []).filter(Boolean)));
  for (const id of uniqOwners){
    await pushText(id, summary);
    await new Promise(r=>setTimeout(r,60));
  }
}

















// ใช้รูปจาก public/static และพื้นที่คลิกแบบ preset
app.post('/api/tenants/:id/richmenus/bootstrap', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    // อนุญาตให้ override จาก body ได้ (เผื่ออนาคต)
    const body = req.body || {};
    const prereg = body.prereg || {};
    const main   = body.main   || {};
    const setDefault = body.setDefault !== false;

    // รูปภาพจาก public/static (หรือแก้ ENV ได้)
    const preregImage = prereg.imageUrl || TASKMENU_PREREG_IMAGE;
    const mainImage   = main.imageUrl   || TASKMENU_MAIN_IMAGE;

    // 1) PREREG
    const preregAreasPx = (prereg.areasPx) || PREREG_AREAS_PX; // มีในไฟล์นี้อยู่แล้ว
    const createdPre = await createAndUploadRichMenuOnLINE({
      accessToken,
      title: 'PREREG',
      chatBarText: 'Menu',
      size: 'large',
      areasPx: preregAreasPx,
      imageUrl: preregImage
    });
    // บันทึกเป็น doc id คงที่ 'PREREG'
    await tenant.ref.collection('richmenus').doc('PREREG').set({
      kind: 'PREREG',
      title: 'PREREG',
      size: 'large',
      chatBarText: 'Menu',
      imageUrl: preregImage,
      areas: PREREG_AREAS_PX,
      lineRichMenuId: createdPre.richMenuId,
      status: 'ready',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 2) MAIN
    const mainAreasPx = (main.areasPx) || MAIN_AREAS_PX;
    const createdMain = await createAndUploadRichMenuOnLINE({
      accessToken,
      title: 'MAIN',
      chatBarText: 'Menu',
      size: 'large',
      areasPx: mainAreasPx,
      imageUrl: mainImage
    });
    await tenant.ref.collection('richmenus').doc('MAIN').set({
      kind: 'MAIN',
      title: 'MAIN',
      size: 'large',
      chatBarText: 'Menu',
      imageUrl: mainImage,
      areas: MAIN_AREAS_PX,
      lineRichMenuId: createdMain.richMenuId,
      status: 'ready',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 3) ตั้งค่า default เป็น PREREG
    if (setDefault) {
      await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu/' + encodeURIComponent(createdPre.richMenuId), { method: 'POST' });
    }

    res.json({
      ok: true,
      prereg: { docId: 'PREREG', richMenuId: createdPre.richMenuId },
      main:   { docId: 'MAIN',   richMenuId: createdMain.richMenuId },
      setDefaultTo: setDefault ? 'PREREG' : null
    });
  } catch (e) {
    console.error('[bootstrap] error', e);
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});


// ===== GUEST: Rich Menu Drafts =====
app.post('/api/guest/richmenus/save', ensureGuest, async (req, res) => {
  try {
    const gid = req.guest.gid;
    const {
      id, // ถ้ามี = update, ถ้าไม่มี = create
      title = 'Rich menu',
      size = 'large',
      imageUrl = '',
      chatBarText = 'Menu',
      defaultBehavior = 'shown',
      areas = [],
      schedule = null
    } = req.body || {};
    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = id
      ? db.collection('guests').doc(gid).collection('richmenus').doc(id)
      : db.collection('guests').doc(gid).collection('richmenus').doc();
    await ref.set({
      title, size, imageUrl, chatBarText, defaultBehavior, areas,
      schedule: schedule || null,
      status: 'draft',
      updatedAt: now,
      ...(id ? {} : { createdAt: now })
    }, { merge: true });
    return res.json({ ok: true, id: ref.id });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

app.get('/api/guest/richmenus/:rid', ensureGuest, async (req, res) => {
  try {
    const gid = req.guest.gid;
    const { rid } = req.params;
    const snap = await admin.firestore().doc(`guests/${gid}/richmenus/${rid}`).get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    res.json({ id: snap.id, ...snap.data() });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

app.get('/api/guest/richmenus', ensureGuest, async (req, res) => {
  try {
    const gid = req.guest.gid;
    const snap = await admin.firestore().collection(`guests/${gid}/richmenus`)
      .orderBy('updatedAt','desc').limit(50).get();
    res.json({ ok:true, items: snap.docs.map(d=>({ id:d.id, ...d.data() })) });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

// Apply: ใช้ OA จริง (ต้องล็อกอิน + member ของ tenant)
app.post('/api/guest/richmenus/:rid/apply', requireFirebaseAuth, ensureGuest, async (req, res) => {
  try {
    const { rid } = req.params;
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ error: 'tenantId_required' });

    const tenant = await getTenantIfMember(tenantId, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    // อ่าน draft จาก guest (ใช้ cookie guest)
    const gid = (req.cookies?.guest && verifyGuestToken(req.cookies.guest)?.gid) || null;
    if (!gid) return res.status(401).json({ error: 'no_guest_cookie' });
    const draftSnap = await admin.firestore().doc(`guests/${gid}/richmenus/${rid}`).get();
    if (!draftSnap.exists) return res.status(404).json({ error: 'draft_not_found' });
    const draft = draftSnap.data() || {};
    if (!draft.imageUrl) return res.status(400).json({ error: 'image_url_required' });

    // สร้างบน LINE
    const accessToken = await getTenantSecretAccessToken(tenant.ref);
    const WIDTH  = 2500;
    const HEIGHT = draft.size === 'compact' ? 843 : 1686;
    const areasPx = toPxAreas({ areas: draft.areas || [], width: WIDTH, height: HEIGHT });
    const { richMenuId } = await createAndUploadRichMenuOnLINE({
      accessToken,
      title: draft.title,
      chatBarText: draft.chatBarText,
      size: draft.size,
      areasPx,
      imageUrl: draft.imageUrl
    });

    // บันทึกเอกสารจริงใน tenant
    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = tenant.ref.collection('richmenus').doc();
    await docRef.set({
      title: draft.title,
      size: draft.size,
      imageUrl: draft.imageUrl,
      chatBarText: draft.chatBarText,
      defaultBehavior: draft.defaultBehavior || 'shown',
      areas: draft.areas || [],
      schedule: draft.schedule || null,
      scheduleFrom: draft.schedule?.from ? toTs(draft.schedule.from) : null,
      scheduleTo:   draft.schedule?.to   ? toTs(draft.schedule.to)   : null,
      lineRichMenuId: richMenuId,
      status: 'ready',
      createdBy: req.user.uid,
      createdAt: now, updatedAt: now
    });

    // mark draft as applied (ออปชัน)
    await draftSnap.ref.set({
      appliedAt: now,
      appliedTenantId: tenant.id,
      appliedRichMenuId: richMenuId
    }, { merge: true });

    res.json({ ok:true, richMenuId, docId: docRef.id });
  } catch (e) {
    console.error('[guest apply] error', e);
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});



// // 6.x.5) Delete rich menu doc (ลบเฉพาะใน Firestore)
// // หมายเหตุ: ถ้าต้องการลบบน LINE ด้วย ให้เรียก DELETE /v2/bot/richmenu/{id} เพิ่มได้
// app.delete('/api/tenants/:id/richmenus/:rid', requireFirebaseAuth, async (req, res) => {
//   try {
//     const { id, rid } = req.params;
//     const tenant = await getTenantIfMember(id, req.user.uid);
//     if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

//     await tenant.ref.collection('richmenus').doc(rid).delete();
//     return res.json({ ok: true });
//   } catch (e) {
//     console.error('[richmenus delete] error', e);
//     return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
//   }
// });


// >>> UPDATED: set-default รองรับ docId หรือ richMenuId
app.post('/api/tenants/:id/richmenus/set-default', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    let { richMenuId, docId } = req.body || {};

    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    if (!richMenuId && docId) {
      const snap = await tenant.ref.collection('richmenus').doc(docId).get();
      richMenuId = snap.get('lineRichMenuId');
    }
    if (!richMenuId) return res.status(400).json({ error: 'richMenuId_required' });

    const r = await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu/' + encodeURIComponent(richMenuId), { method: 'POST' });

    const t = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: 'line_set_default_error', detail: t });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});

// >>> NEW: ลบ rich menu (ลบบน LINE และเอกสาร)
app.delete('/api/tenants/:id/richmenus/:docId', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    const docRef = tenant.ref.collection('richmenus').doc(docId);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    const data = snap.data() || {};
    const rmId = data.lineRichMenuId;

    if (rmId) {
      try {
        const cur = await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu', { method:'GET' });
        if (cur.ok) {
          const j = await cur.json();
          if (j.richMenuId === rmId) {
            await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu', { method: 'DELETE' });
          }
        }
      } catch {}

      await callLineAPITenant(tenant.ref, '/v2/bot/richmenu/' + encodeURIComponent(rmId), { method:'DELETE' });
    }


    await docRef.delete();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});

// ตัวอย่าง guest draft สำหรับ Rich Message (ถ้าอยากรองรับ)
app.post('/api/guest/richmessages/save', optionalAuth, async (req, res) => {
  try {
    const gid = req.guest?.gid;
    if (!gid) return res.status(401).json({ error: 'no_guest_cookie' });
    const { id, payload = {} } = req.body || {};
    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = id
      ? db.collection('guests').doc(gid).collection('richmessages').doc(id)
      : db.collection('guests').doc(gid).collection('richmessages').doc();
    await ref.set({ ...payload, status: 'draft', updatedAt: now, ...(id ? {} : { createdAt: now }) }, { merge: true });
    res.json({ ok: true, id: ref.id });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});


// เคลียร์ Default richmenu ของ OA
app.post('/api/tenants/:id/richmenus/clear-default', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    // LINE API: DELETE default
    const r = await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu', { method: 'DELETE' });
    if (!r.ok && r.status !== 404) {
      const t = await r.text().catch(() => '');
      return res.status(500).json({ ok:false, error: 'line_clear_default_failed', detail: t });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});




// ==============================
// 6.z) LINE Webhook (QnA mode)
// ==============================
// ใช้ URL เดียวสำหรับทุก OA: /webhook/line
async function findTenantBySignature(req) {
  const db = admin.firestore();
  const all = await db.collection('tenants').get();
  for (const d of all.docs) {
    try {
      const sec = await d.ref.collection('secret').doc('v1').get();
      const channelSecret = sec.get('channelSecret');
      if (!channelSecret) continue;
      if (verifyLineSignature(req, channelSecret)) {
        return { id: d.id, ref: d.ref };
      }
    } catch {}
  }
  return null;
}

// ==============================
// LINE Webhook (multi-tenant)
// ==============================
// เลือก path ปลายทางจาก role + intent
function chooseNextByIntent(role, intent = 'default') {
  const r = String(role || 'user').toLowerCase();
  if (intent === 'admin')   return '/app/admin/users-split'; // เข้าหน้าแอดมิน
  if (intent === 'my_tasks') return '/app/tasks';            // เข้างานของฉัน
  // default: ถ้าเป็นกลุ่มแอดมิน → admin, ไม่งั้น → tasks
  return ['developer','admin','supervisor'].includes(r) ? '/app/admin/users-split' : '/app/tasks';
}

app.post('/webhook/line', webhookRaw, async (req, res) => {
  const startedAt = Date.now();
  try {
    console.log('[WEBHOOK/HIT]', new Date().toISOString(), 'len=', req?.rawBody?.length ?? 'n/a');
    // 1) raw สำหรับ HMAC + body สำหรับอ่าน event
    const raw = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body || {}));
    const signature = req.get('x-line-signature') || '';
    console.log('[WEBHOOK/HDR] x-line-signature =', signature ? '(present)' : '(missing)');
    // 2) body: ถ้า express.json แปลงไว้แล้วก็ใช้เลย ไม่ต้อง parse ซ้ำ
    const body = (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body))
      ? req.body
      : (() => {
          try { return JSON.parse(raw.toString('utf8')); }
          catch { return null; }
        })();

    if (!body) {
      console.error('[WEBHOOK] invalid JSON body');
      return res.status(200).end(); // 200 เพื่อกัน LINE retry
    }

    const destination = body.destination || '';
    const events = Array.isArray(body.events) ? body.events : [];
    if (!destination || !events.length) return res.status(200).end();

    // 3) หา tenant จาก channelId (destination)
    const tenantRef = await getTenantByDestinationOrSignature(db, destination, raw, signature);
    if (!tenantRef) {
      console.warn('[WEBHOOK] unknown destination (no tenant):', destination);
      return res.status(200).end();
    }

    // 4) ตรวจลายเซ็น ต่อ tenant
    const channelSecret = await getTenantChannelSecret(tenantRef);
    if (!channelSecret) {
      console.error('[WEBHOOK] missing channelSecret for tenant:', tenantRef.id);
      return res.status(200).end();
    }
    const expected = crypto.createHmac('sha256', channelSecret).update(raw).digest('base64');
    const ok = (typeof verifyLineSignatureRaw === 'function')
      ? verifyLineSignatureRaw(raw, signature, channelSecret)      // ถ้ามี helper เดิมอยู่
      : (expected === signature);                                  // เทียบตรงๆ

    if (!ok) {
      console.warn('[WEBHOOK] bad signature for tenant:', tenantRef.id);
      return res.status(200).end();
    }

    // 5) ประมวลผลอีเวนต์ทีละรายการ (พฤติกรรมเดิม)
    for (const ev of events) {
      try {
        await handleLineEvent(ev, tenantRef, null); // accessToken ไม่ต้องส่งแล้ว helper จะดึงเอง
      } catch (e) {
        console.error('[WEBHOOK] handleEvent error:', e);
      }
    }

    // 6) ตอบ 200 เสมอ
    res.status(200).end();
  } catch (err) {
    console.error('[WEBHOOK] fatal error:', err);
    res.status(200).end();
  } finally {
    if (process.env.DEBUG_WEBHOOK === '1') {
      console.log('[WEBHOOK] done in', Date.now() - startedAt, 'ms');
    }
  }
});



app.post('/webhook/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const body = req.body || {};
    const events = body.events || [];

    const tenant = await getTenantById(tenantId);
    if (!tenant) return res.status(404).send('tenant_not_found');

    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    // จัดการแต่ละ event
    for (const ev of events) {
      await handleLineEvent(ev, tenant.ref, accessToken);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('[webhook] error', e);
    res.sendStatus(200); // ตอบ 200 เพื่อไม่ให้ LINE รีทรายรัว ๆ
  }
});



// จำสถานะชั่วคราว 5 นาที
const pendingClock = new Map(); // userId -> { type: 'in' | 'out', expire: ms }

function setPending(userId, type, ttlMs = 5 * 60 * 1000) {
  pendingClock.set(userId, { type, expire: Date.now() + ttlMs });
}

function takePending(userId) {
  const rec = pendingClock.get(userId);
  if (!rec) return null;
  if (Date.now() > rec.expire) { pendingClock.delete(userId); return null; }
  pendingClock.delete(userId);
  return rec.type;
}

// ---------- Time Attendance (Magic Link) ----------
    // เปิด/ปิดฟีเจอร์ TA ของ tenant
async function isAttendanceEnabled(tenantRef) {
  try {
    const snap = await tenantRef.collection('integrations').doc('attendance').get();
    return !!(snap.exists && snap.data()?.enabled);
  } catch {
    return false;
  }
}

// เพิ่มเมนู/คำสั่งงานแบบภาษาพูดเข้าไปครบ ชนกับของเดิมน้อยที่สุด
async function handleLineEvent(ev, tenantRef, accessToken) {
  const replyToken = ev.replyToken;
  const userId = ev.source?.userId;
  if (!replyToken || !userId) return;

  if (DEBUG_WEBHOOK) {
    const dbg = ev.type === 'postback' ? ev.postback?.data : ev.message?.text;
    console.log('[handleLineEvent]', ev.type, dbg || '');
  }

  // ====== โหมด QnA จาก postback qna:<key> (ของเดิม) ======
  // QnA via postback
  if (ev.type === 'postback' && typeof ev.postback?.data === 'string') {
    const data = ev.postback.data;
    if (data.startsWith('qna:')) {
      const key = data.slice(4).trim();

      let qna = await findQnaSetByKey(tenantRef, key);
      if (!qna) qna = await findQnaSetByKeyViaDefault(tenantRef, key);

      if (!qna || !qna.items?.length) {
        return reply(replyToken, 'ยังไม่มีคำถามสำหรับหัวข้อนี้ค่ะ', null, tenantRef);
      }

      await setSession(tenantRef, userId, {
        mode: 'qna',
        key,
        items: qna.items,
        fallback: qna.fallbackReply || 'ยังไม่พบคำตอบ ลองเลือกหมายเลขจากรายการนะคะ',
      });

      // ส่งรายการคำถาม + quick replies
      return reply(
        replyToken,
        listMessage(qna.displayText, qna.items),
        toQuickReplies(qna.items).items,
        tenantRef
      );
    }
    return reply(replyToken, 'ยังไม่ได้ตั้งค่าปุ่มนี้ค่ะ 🙏', null, tenantRef);
  }


  // ====== ผู้ใช้เพิ่มเพื่อน (greeting เดิม) ======
  if (ev.type === 'follow' && userId) {
    try {
      const gref = tenantRef.collection('settings').doc('greeting');
      const gsnap = await gref.get();
      const text = gsnap.get('text');
      if (text) {
        await reply(replyToken, String(text), null, tenantRef);
      }
    } catch (e) {
      console.warn('[greeting] failed', e);
    }
    return;
  }

  // ====== ข้อความจากผู้ใช้ ======
  if (ev.type === 'message' && ev.message?.type === 'text') {
    const text = (ev.message.text || '').trim();
    const lower = text.toLowerCase();

    // ---- page control (สำหรับ Flex pager เดิม) ----
    if (text === '← ก่อนหน้า') { await turnPage(tenantRef, userId, replyToken, -1); return; }
    if (text === 'ถัดไป →')     { await turnPage(tenantRef, userId, replyToken, +1); return; }
    // ---- ควบคุม Live Chat (ของเดิม) ----
    if (lower === '#live') {
      await ensureOpenLiveSession(tenantRef, userId); // ไม่ต้องส่ง accessToken แล้ว
      await setSession(tenantRef, userId, { mode: 'live' });
      await appendLiveMessage(tenantRef, userId, 'system', 'เริ่มต้นสนทนาสด');
      return reply(
        replyToken,
        'เชื่อมต่อเจ้าหน้าที่แล้วค่ะ พิมพ์ข้อความที่ต้องการได้เลย\n\nพิมพ์ #end เพื่อจบการสนทนา',
        null,
        tenantRef
      );
    }

    if (lower === '#end') {
      await closeLiveSession(tenantRef, userId);
      await clearSession(tenantRef, userId);
      await appendLiveMessage(tenantRef, userId, 'system', 'ผู้ใช้จบการสนทนา');
      return reply(replyToken, 'ปิดการสนทนาเรียบร้อย ขอบคุณค่ะ', null, tenantRef);
    }
    const ss = await getSession(tenantRef, userId);

    // ---- โหมด Live Chat (ของเดิม) ----
    if (ss?.mode === 'live') {
      await ensureOpenLiveSession(tenantRef, userId);
      await appendLiveMessage(tenantRef, userId, 'user', text, { lineMessageId: ev.message.id || null });
      // mark-as-read
      try {
        const accessToken = await getTenantSecretAccessToken(tenantRef);
        await fetchFn('https://api.line.me/v2/bot/message/markAsRead', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: userId })
        });
      } catch {}
      return;
    }


    // ---- โหมด QnA (ของเดิม) ----
    // QnA mode
    if (ss?.mode === 'qna' && Array.isArray(ss.items)) {
      if (text === '#exit' || text === 'จบ') {
        await clearSession(tenantRef, userId);
        return reply(replyToken, 'ออกจากโหมด QnA แล้วค่ะ', null, tenantRef);
      }
      const n = parseInt(text, 10);
      if (!isNaN(n) && n >= 1 && n <= ss.items.length) {
        return reply(replyToken, ss.items[n - 1].a || '—', null, tenantRef);
      }
      const t = normalize(text);
      const idx = ss.items.findIndex(it => normalize(it.q).includes(t));
      if (idx >= 0) {
        return reply(replyToken, ss.items[idx].a || '—', null, tenantRef);
      }
      return reply(replyToken, ss.fallback || 'ยังไม่พบคำตอบ', toQuickReplies(ss.items).items, tenantRef);
    }


    

    // (ถ้าไฟล์นี้ require('jsonwebtoken') ด้านบนอยู่แล้ว ให้ลบบรรทัดนี้ทิ้งได้)
    const _jwt = (typeof jwt !== 'undefined') ? jwt : require('jsonwebtoken');

    function issueMagicToken(payload, ttl) {
      const exp = process.env.MAGIC_TTL || ttl || '2h';
      if (!APP_JWT_SECRET) throw new Error('APP_JWT_SECRET is missing');
      return _jwt.sign(payload, APP_JWT_SECRET, { expiresIn: exp }); // HS256 by default
    }


    // helper ทำ URL /auth/magic แบบ sanitize
    function makeMagicUrl({ base, token, tenant, next, uid }) {
      const origin = (base || BASE_APP_URL || '').replace(/\/+$/, '');
      const u = new URL('/auth/magic', origin);
      const nextPath = String(next || '/app').trim();

      // อนุญาตเฉพาะ path ที่ขึ้นต้นด้วย /app/ (กัน open redirect)
      const safeNext = nextPath.startsWith('/app/') ? nextPath : '/app';

      u.searchParams.set('t', token);      // /auth/magic รองรับพารามนี้อยู่แล้ว
      u.searchParams.set('tenant', tenant);
      u.searchParams.set('next', safeNext);
      u.searchParams.set('uid', uid);
      u.searchParams.set('v', String(Date.now())); // bust cache
      return u.toString();
    }

    async function buildAdminLiffUrl(tenantRef, userId, extra = {}) {
      if (!(await isAttendanceEnabled(tenantRef))) {
        throw new Error('ยังไม่ได้เปิดใช้ระบบใน OA นี้');
      }

      let role = String(extra?.role || '').trim().toLowerCase();
      if (!role) {
        try {
          const r = await getRoleSafe(tenantRef.id, userId, { timeoutMs: 3500 });
          role = String(r?.role || 'user').trim().toLowerCase();
        } catch (e) {
          throw new Error('ดึงสิทธิ์ผู้ใช้ไม่สำเร็จ ลองใหม่อีกครั้ง');
        }
      }
      const allowed = new Set(['owner','admin','developer']);
      if (!allowed.has(role)) {
        throw new Error('คุณไม่มีสิทธิ์เข้าหน้านี้ (admin/owner เท่านั้น)');
      }

      // หา liffId (Firestore → env)
      let liffId = '';
      try {
        const cfgSnap = await tenantRef.collection('integrations').doc('attendance').get();
        liffId = String(cfgSnap.get('adminLiffId') || cfgSnap.get('liffAdminId') || '').trim();
      } catch {}
      if (!liffId) {
        liffId = String(process.env.LIFF_TA_ADMIN_ID || process.env.LIFF_TA_ID || process.env.LIFF_ADMIN_ID || '').trim();
      }
      if (!liffId) throw new Error('ยังไม่ได้ตั้งค่า LIFF ID สำหรับหน้าผู้ดูแล');

      // ✅ ใส่ liffId ลง query เพื่อให้หน้าใช้ค่าตรงกับตัวที่ถูกเปิด
      const qs = new URLSearchParams({
        tenant: tenantRef.id,
        actor: userId,
        role,
        liffId,               // ✅ เพิ่มบรรทัดนี้
        ts: String(Date.now()),
        ...(extra.view ? { view: String(extra.view) } : {}),
        ...(extra.report ? { report: String(extra.report) } : {}),
        ...(extra.payroll ? { payroll: String(extra.payroll) } : {}),
      }).toString();

      return `https://liff.line.me/${liffId}?${qs}`;
    }



    // ผู้ใช้ทั่วไป: เริ่มลงทะเบียนโปรไฟล์
    if (/^(ลงทะเบียนเข้าใช้งาน)$/i.test(text)) {
      if (!(await isAttendanceEnabled(tenantRef))) {
        return reply(replyToken, 'ยังไม่ได้เปิดใช้ระบบลงเวลาใน OA นี้', null, tenantRef);
      }

      let name = (await getDisplayName(tenantRef, userId)) || 'User';
      try {
        const gu = await callAppsScriptForTenant(
          tenantRef, 'get_user', { user_id: userId }, { sheetFrom: 'attendance' }
        ).catch(() => ({}));
        name = gu?.user?.username || gu?.user?.real_name || name;
      } catch {}

      const token = issueMagicToken({ uid: userId, name, role: 'user', tenant: tenantRef.id }, '2h');
      const url = makeMagicUrl({
        base: process.env.PUBLIC_APP_URL || BASE_APP_URL,
        token, tenant: tenantRef.id,
        next: '/app/attendance/register',
        uid: userId
      });

      const bubble = {
        type: 'bubble',
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm',
          contents: [
            { type: 'text', text: 'ลงทะเบียนเข้าใช้งาน', weight: 'bold', size: 'lg' },
            { type: 'text', text: `@${name}`, size: 'md', wrap: true }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
          contents: [
            {
              type: 'button', style: 'primary', height: 'sm',
              action: { type: 'uri', label: 'เริ่มลงทะเบียน', uri: url }
            }
          ]
        }
      };

      return replyFlex(replyToken, bubble, 'เริ่มลงทะเบียนเข้าใช้งาน', tenantRef);
      
    }

    async function requireAdminRole(tenantRef, userId) {
      const r = await getRoleViaGAS(tenantRef.id, userId).catch(() => null);
      const role = String(r?.role || '').trim().toLowerCase();
      if (!['owner', 'admin', 'developer'].includes(role)) {
        throw new Error('คุณไม่มีสิทธิ์เข้าหน้านี้ (admin/owner เท่านั้น)');
      }
      return role;
    }


    // ===== Admin Settings =====
    
    if (/^ตั้งค่า$/i.test(text)) {
      const t0 = Date.now();
      const dbgOn = String(process.env.DEBUG_WEBHOOK || '').trim() !== '';
      const dbg = (msg, extra={}) => { if (dbgOn) console.log(`[ADMIN][SETUP] ${msg}`, extra); };

      try {
        dbg('incoming', { tenant: tenantRef.id, userId, text });

        // 1) เปิดใช้ระบบหรือยัง
        const enabled = await isAttendanceEnabled(tenantRef);
        dbg('attendance enabled?', { enabled });
        if (!enabled) {
          return reply(replyToken, 'ยังไม่ได้เปิดใช้ระบบใน OA นี้', null, tenantRef);
        }

        // 2) ต้องมีสิทธิ์จากชีต
        let role;
        try {
          role = await requireAdminRole(tenantRef, userId);
          dbg('role via GAS', { role });
        } catch (e) {
          dbg('forbidden', { reason: e?.message || e });
          return reply(replyToken, 'คุณไม่มีสิทธิ์เข้าหน้าตั้งค่า (admin/owner เท่านั้น)', null, tenantRef);
        }

        // 3) สร้าง URL (ส่ง role เข้าไปด้วย)
        const url = await buildAdminLiffUrl(tenantRef, userId, { view: 'menu', role });
        dbg('final LIFF url', { url });

        // 4) ส่ง Flex
        const bubble = {
          type: 'bubble',
          body: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: 'หน้าตั้งค่า (ผู้ดูแล)', weight: 'bold', size: 'lg' },
            { type: 'text', text: 'จัดการผู้ใช้งาน / การจ่าย / สิทธิ์', size: 'sm', color: '#666666' }
          ]},
          footer: { type: 'box', layout: 'vertical', contents: [
            { type: 'button', style: 'primary',
              action: { type: 'uri', label: 'เปิดหน้าตั้งค่า', uri: url } }
          ]}
        };

        const r = await replyFlex(replyToken, bubble, 'เปิดหน้าตั้งค่า', tenantRef);
        dbg('replied flex', { ms: Date.now() - t0, ok: !!r });
        return r;

      } catch (err) {
        console.error('[ADMIN][SETUP] unexpected error:', err?.stack || err);
        return reply(replyToken, 'เกิดข้อผิดพลาดภายใน (ADMIN/LIFF)', null, tenantRef);
      }
    }


    // บันทึกการทำงาน → เปิดแท็บ logs
    if (/^บันทึกการทำงาน$/i.test(text)) {
      try {
        const role = await requireAdminRole(tenantRef, userId);
        const url = await buildAdminLiffUrl(tenantRef, userId, { view: 'logs', role });
        const bubble = {
          type: 'bubble',
          body: { type:'box', layout:'vertical', contents:[
            { type:'text', text:'บันทึกการทำงาน', weight:'bold', size:'lg' },
            { type:'text', text:'ดูเข้า-ออกงาน + สรุปเดือน', size:'sm', color:'#666666' }
          ]},
          footer: { type:'box', layout:'vertical', contents:[
            { type:'button', style:'primary', action:{ type:'uri', label:'เปิดรายการลงเวลา', uri: url } }
          ]}
        };
        return replyFlex(replyToken, bubble, 'เปิดรายการลงเวลา', tenantRef);
      } catch (e) {
        return reply(replyToken, String(e.message || e), null, tenantRef);
      }
    }


    // ทำเงินเดือน → ใช้หน้าสรุปเดือนก่อน (ส่ง flag payroll=1 เผื่อใช้ในหน้า)
    if (/^ทำเงินเดือน$/i.test(text)) {
      try {
        const role = await requireAdminRole(tenantRef, userId);
        const url = await buildAdminLiffUrl(tenantRef, userId, { view: 'logs', payroll: 1, role });
        const bubble = {
          type: 'bubble',
          body: { type:'box', layout:'vertical', contents:[
            { type:'text', text:'ทำเงินเดือน', weight:'bold', size:'lg' },
            { type:'text', text:'สรุปชั่วโมง/วัน หักสาย แล้วคำนวณเบื้องต้น', size:'sm', color:'#666666' }
          ]},
          footer: { type:'box', layout:'vertical', contents:[
            { type:'button', style:'primary', action:{ type:'uri', label:'เปิดสรุปเดือน', uri: url } }
          ]}
        };
        return replyFlex(replyToken, bubble, 'เปิดสรุปเดือน', tenantRef);
      } catch (e) {
        return reply(replyToken, String(e.message || e), null, tenantRef);
      }
    }


    // รายงาน → เปิด logs พร้อมโหมดรายงาน (report=1)
    if (/^รายงาน$/i.test(text)) {
      try {
        const role = await requireAdminRole(tenantRef, userId);
        const url = await buildAdminLiffUrl(tenantRef, userId, { view: 'logs', report: 1, role });
        const bubble = {
          type: 'bubble',
          body: { type:'box', layout:'vertical', contents:[
            { type:'text', text:'รายงาน', weight:'bold', size:'lg' },
            { type:'text', text:'ดูรายงานการทำงาน/เงินเดือน', size:'sm', color:'#666666' }
          ]},
          footer: { type:'box', layout:'vertical', contents:[
            { type:'button', style:'primary', action:{ type:'uri', label:'เปิดรายงาน', uri: url } }
          ]}
        };
        return replyFlex(replyToken, bubble, 'เปิดรายงาน', tenantRef);
      } catch (e) {
        return reply(replyToken, String(e.message || e), null, tenantRef);
      }
    }




    
    if (/^(ลงเวลา|ออกงาน)$/i.test(text)) {
      if (!(await isAttendanceEnabled(tenantRef))) {
        return reply(replyToken, 'ยังไม่ได้เปิดใช้ระบบลงเวลาใน OA นี้', null, tenantRef);
      }

      const kind = /^ลงเวลา$/i.test(text) ? 'in' : 'out'; // in | out

      // 1) หา LIFF ID: ให้ค่าใน Firestore override ได้, ถ้าไม่มีก็ใช้ .env
      let liffId = '';
      try {
        const cfgSnap = await tenantRef.collection('integrations').doc('attendance').get();
        liffId = String(cfgSnap.get('liffId') || '').trim();
      } catch {}
      if (!liffId) liffId = String(process.env.LIFF_TA_CLOCK_ID || '').trim();

      if (!liffId) {
        return reply(
          replyToken,
          'ยังไม่ได้ตั้งค่า LIFF ID (กรุณาตั้งค่า .env: LIFF_TA_CLOCK_ID หรือ integrations.attendance.liffId)',
          null,
          tenantRef
        );
      }

      // 2) ลิงก์ไปหน้า /public/ta-clock.html ผ่าน LIFF และ "ส่ง liffId ไปใน query"
      const liffUrl = `https://liff.line.me/${encodeURIComponent(liffId)}?tenant=${tenantRef.id}&type=${kind}&liffId=${encodeURIComponent(liffId)}`;
      
      console.log('[TA][LIFF] using', { liffId, liffUrl });   // <--- เพิ่มบรรทัดนี้

      const name = (await getDisplayName(tenantRef, userId)) || 'User';
      const bubble = {
        type: 'bubble',
        body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
          { type: 'text', text: kind === 'in' ? 'ลงเวลาเข้า' : 'ลงเวลาออก', weight: 'bold', size: 'lg' },
          { type: 'text', text: `@${name}`, size: 'md', wrap: true }
        ]},
        footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [
          { type: 'button', style: 'primary', height: 'sm',
            action: { type: 'uri', label: 'เปิดหน้าลงเวลา', uri: liffUrl } }
        ]}
      };

      return replyFlex(replyToken, bubble, 'เปิดหน้าลงเวลา', tenantRef);
    }


    if (/^ลางาน$/i.test(text)) {
      // เปิดใช้ฟีเจอร์?
      if (!(await isAttendanceEnabled(tenantRef))) {
        return reply(replyToken, 'ยังไม่ได้เปิดใช้ระบบลางานใน OA นี้', null, tenantRef);
      }

      // 1) หา LIFF ID: Firestore override ได้, ไม่มีก็ใช้ .env (LIFF_TA_LEAVE_ID)
      let liffId = '';
      try {
        const cfgSnap = await tenantRef.collection('integrations').doc('attendance').get();
        liffId = String(cfgSnap.get('leaveLiffId') || cfgSnap.get('liffLeaveId') || '').trim();
      } catch {}
      if (!liffId) liffId = String(process.env.LIFF_TA_LEAVE_ID || '').trim();

      if (!liffId) {
        return reply(
          replyToken,
          'ยังไม่ได้ตั้งค่า LIFF ID สำหรับลางาน (ตั้งค่า .env: LIFF_TA_LEAVE_ID หรือ integrations.attendance.leaveLiffId)',
          null,
          tenantRef
        );
      }

      // 2) ส่งลิงก์ LIFF ไปหน้า ta-leave.html (เผื่อคุณอยากดู query ในหน้า)
      const liffUrl = `https://liff.line.me/${encodeURIComponent(liffId)}?tenant=${tenantRef.id}&liffId=${encodeURIComponent(liffId)}`;
      console.log('[LEAVE][LIFF] using', { liffId, liffUrl });

      const name = (await getDisplayName(tenantRef, userId)) || 'User';
      const bubble = {
        type: 'bubble',
        body: { type:'box', layout:'vertical', spacing:'sm', contents:[
          { type:'text', text:'ขอลางาน', weight:'bold', size:'lg' },
          { type:'text', text:`@${name}`, size:'md', wrap:true }
        ]},
        footer: { type:'box', layout:'vertical', spacing:'sm', flex:0, contents:[
          { type:'button', style:'primary', height:'sm',
            action:{ type:'uri', label:'เปิดหน้าลางาน', uri:liffUrl } }
        ]}
      };
      return replyFlex(replyToken, bubble, 'เปิดหน้าลางาน', tenantRef);
    }


    
    // ======= HELP (คำสั่ง: ช่วยเหลือ) – Single Bubble (no links) =======
    // ======= HELP (คำสั่ง: ช่วยเหลือ) – Single Bubble (no spacer) =======
    // ======= HELP (คำสั่ง: ช่วยเหลือ) – Single Bubble (themed, readable) =======
    if (/^ช่วยเหลือ$/i.test(text)) {
      if (!(await isAttendanceEnabled(tenantRef))) {
        return reply(replyToken, 'ยังไม่ได้เปิดใช้ระบบ Time Attendance ใน OA นี้', null, tenantRef);
      }

      const THEME_PRIMARY = '#3B5BDB';   // ฟ้าอมม่วง (ใกล้ภาพตัวอย่าง)
      const THEME_SOFT    = '#EEF2FF';   // พื้นอ่อน
      const TEXT_MUTED    = '#6b7280';
      const TEXT_HINT     = '#9CA3AF';

      const sectionTitle = (th, en) => ({
        type: 'box',
        layout: 'baseline',
        contents: [
          { type: 'text', text: th, weight: 'bold', size: 'md', color: THEME_PRIMARY, wrap: true },
          { type: 'text', text: en, size: 'xs', color: TEXT_HINT, margin: 'sm', flex: 0 }
        ]
      });

      const item = (title, desc, hint) => ({
        type: 'box',
        layout: 'vertical',
        backgroundColor: THEME_SOFT,
        paddingAll: '12px',
        margin: 'md',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'sm', wrap: true },
          { type: 'text', text: desc, size: 'sm', color: TEXT_MUTED, margin: 'xs', wrap: true },
          { type: 'text', text: hint, size: 'xs', color: TEXT_HINT, margin: 'sm', wrap: true }
        ]
      });

      const bubble = {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          backgroundColor: '#E9EFFF',
          contents: [
            { type: 'text', text: 'Help', weight: 'bold', size: 'xl', color: '#111111' },
            { type: 'text', text: 'คู่มือการใช้งาน Time Attendance', size: 'sm', color: TEXT_MUTED, wrap: true }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: '14px',
          contents: [
            // ===== User =====
            sectionTitle('User (พนักงาน)', 'Employee'),
            item(
              'ลงเวลา',
              'บันทึกเวลามาทำงานของวันนี้ พร้อมพิกัด ใช้ยึดเวลาเริ่มงานเพื่อคิดชั่วโมงทำงาน/สาย',
              'หมายเหตุ : ลงเวลาเข้าสามารถลงซ้ำได้ โดยยึดการลงเวลาล่าสุด',
              'พิมพ์: "ลงเวลา"'
            ),
            item(
              'ออกงาน',
              'บันทึกเวลาเลิกงานของวันนี้ ระบบจะจับคู่กับเวลาเข้าและคำนวณชั่วโมงทำงานให้อัตโนมัติ',
              'หมายเหตุ : สามารถลงเวลาออกได้เพียงครั้งเดี่ยว ไม่สามารถลงซ้ำได้',
              'พิมพ์: "ออกงาน"'
            ),
            item(
              'ลางาน',
              'ส่งคำขอลา ระบุวันที่ จำนวนชั่วโมง/เต็มวัน และเหตุผล เพื่อให้ผู้ดูแลตรวจสอบและเก็บประวัติ',
              'พิมพ์: "ลางาน"'
            ),
            item(
              'ลงทะเบียนเข้าใช้งาน',
              'บันทึกโปรไฟล์พื้นฐาน เช่น ชื่อ–สกุล เบอร์โทร ตำแหน่ง ช่องทางรับเงิน (ธนาคาร/เงินสด) เพื่อใช้ทำเงินเดือน',
              'หมายเหตุ : การลงทะเบียนซ้ำจะเป็นการแก้ไขข้อมูลเดิม',
              'พิมพ์: "ลงทะเบียนเข้าใช้งาน"'
            ),

            { type: 'separator', margin: 'lg' },

            // ===== Admin =====
            sectionTitle('Owner / Admin', 'Administrator'),
            item(
              'บันทึกการทำงาน',
              'ตรวจทานเวลาเข้า–ออก เพื่อใช้ดูตารางเข้า-ออกของพนักงาน รายละเอียดเข้าสาย/สถานที่ลงเวลา',
              'เฉพาะ Owner / Admin พิมพ์: "บันทึกการทำงาน"'
            ),
            item(
              'ทำเงินเดือน',
              'tab 1 "ทำเงินเดือน" รวมชั่วโมง/วันทำงาน คิดฐานจ่ายตามรูปแบบ (รายชั่วโมง/รายวัน/รายเดือน/ทุก N วัน) คิดหักสาย/ลา และสรุปจ่ายรายกลุ่มที่ตั้งค่าไว้',
              'รวมชั่วโมง/วันทำงาน คิดฐานจ่ายตามรูปแบบ (รายชั่วโมง/รายวัน/รายเดือน/ทุก N วัน) คิดหักสาย/ลา และสรุปจ่ายรายกลุ่มที่ตั้งค่าไว้',
              '',
              'tab 2 "ตั้งค่างวดเงินเดือน" เป็นการสร้างกลุ่ม และกำหนดวันจ่าย เพื่อนำไปคำนวณหน้าทำเงินเดิอน',
              '',
              'tab 3 "จ่ายเงินพนักงาน" เป็นการเรียกดูงวดเงินเดือนที่ทำแล้ว มาเพื่อทำการจ่ายให้พนักงานตามการคำนวนเงิน',
              'เฉพาะ Owner / Admin พิมพ์: "ทำเงินเดือน"'
            ),
            item(
              'รายงาน',
              'ดูสรุปการจ่ายตามช่วงเวลา ดูรายละเอียดหรือกลับไปแก้ไขงวดเงินเดือน',
              'เฉพาะ Owner / Admin พิมพ์: "รายงาน"'
            ),
            item(
              'ตั้งค่า',
              'เปิดหน้าการตั้งค่าทั้ง 4 เมนู โดยที่ เมนูแรกจะเป็นการเรียกดูรายละเอียดพนักงานแต่ละคน สามารถคั้งค่าการจ่ายหรือแก้ไขรายละเอียดต่างๆ และ owner สามารถกำหนดสิทธิ์ใด้',
              'เฉพาะ Owner / Admin พิมพ์: "ตั้งค่า"'
            )
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: 'เมนูจะเปลี่ยนไปตาม role ในระบบ', size: 'xs', color: TEXT_HINT, align: 'center', margin: 'sm', wrap: true }
          ]
        }
      };

      return replyFlex(replyToken, bubble, 'คู่มือการใช้งาน Time Attendance', tenantRef);
    }




    // ---------- /Time Attendance ----------







    if (!(await isTaskbotEnabled(tenantRef))) {
      // ปิดใช้ Task Bot → ไม่ตอบส่วนสั่งงาน/ดึงงาน แต่ยังให้ QnA & live chat ทำงานได้
      return;
    }

    function issueMagicToken(payload, ttl) {
      const exp = process.env.MAGIC_TTL || ttl || '2h';
      if (!APP_JWT_SECRET) {
        throw new Error('APP_JWT_SECRET is missing');
      }
      const token = jwt.sign(payload, APP_JWT_SECRET, { expiresIn: exp });
      return token;
    }


    // =========================
    // ==== Task Bot block =====
    // =========================
    // 1) คำสั่งตรวจระบบ/ช่วยเหลือ
    if (lower === 'ping') {
      return reply(replyToken, 'pong (task bot)', null, tenantRef);
    }
    if (lower === 'help' || text === 'ช่วยเหลือ') {
      const help =
        [
          'วิธีใช้งาน (สั้นๆ)',
          '',
          'ลงทะเบียน',
          '• ลงทะเบียน po ปอ อนุชา user',
          '',
          'สั่งงาน',
          '• @po ปรับรายงาน พรุ่งนี้ 09:00',
          '• @test ทำป้าย ก่อนบ่าย 3',
          '• @po: งาน',
          '  | กำหนดส่ง: 12/03 14:00',
          '  | note: ไม่รีบ',
          '',
          'เปลี่ยนสถานะ',
          '• done TASK_xxxxxxxx',
          '• กำลังดำเนินการ TASK_xxxxxxxx',
          '',
          'แก้ไข/เพิ่มเติม',
          '• ตั้งกำหนดส่ง TASK_xxxxxxxx: วันนี้ 17:30',
          '• เพิ่มโน้ต TASK_xxxxxxxx: ขอไฟล์ ai',
          '',
          'ดูรายการ',
          '• ดูผู้ใช้งานทั้งหมด',
          '• ดูงานค้างทั้งหมด',
          '• งานที่ฉันสั่ง',
          '• งานของฉันวันนี้',
          '',
          'เมนู / แอดมิน',
          '• รีเซ็ตเมนู',
          '• ติดต่อแอดมิน: dm @ชื่อ ข้อความ',
          '• จัดการผู้ใช้งาน (พิมพ์ จัดการผู้ใช้งาน)'
        ].join('\n');
      return reply(replyToken, help, null, tenantRef);
    }


    // เปิดหน้า Admin/จัดการผู้ใช้งาน จาก OA
    if (text === 'จัดการผู้ใช้งาน') {
      try {
        console.log('[MANAGE/LINK/START]', {
          tenant: tenantRef.id,
          uid: userId,
          text
        });

        // 1) ดึงข้อมูลผู้ใช้จาก GAS
        const gu = await callAppsScriptForTenant(tenantRef, 'get_user', { user_id: userId }).catch(() => ({}));
        const hasRow = !!gu?.user;

        // 2) normalize role/status/name
        const role   = String(gu?.user?.role   || 'user').trim().toLowerCase();
        const status = String(gu?.user?.status || 'Active').trim();     // <<<<< เพิ่มตัวแปรนี้
        const name   = gu?.user?.username || gu?.user?.real_name || (await getDisplayName(tenantRef, userId)) || 'User';

        console.log('[MANAGE/LINK/USER]', {
          tenant: tenantRef.id,
          uid: userId,
          hasRow,
          role,
          status
        });

        // 3) บล็อกสิทธิ์: เฉพาะ dev/admin/supervisor + ต้อง Active เท่านั้น
        const ALLOWED = ['developer','admin','supervisor'];
        if (!ALLOWED.includes(role) || status !== 'Active') {
          console.warn('[MANAGE/LINK/DENY]', { tenant: tenantRef.id, uid: userId, role, status });
          return reply(
            replyToken,
            'ขออภัย คุณไม่มีสิทธิ์เข้าหน้าจัดการผู้ใช้งาน\nกรุณาติดต่อผู้ดูแลระบบ',
            null,
            tenantRef
          );
        }

        // 4) (ไม่บังคับ) รูปโปรไฟล์
        let picture = '';
        try {
          const acc  = await getTenantSecretAccessToken(tenantRef);
          const prof = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: { Authorization: `Bearer ${acc}` }
          }).then(r => r.json()).catch(() => ({}));
          picture = prof?.pictureUrl || '';
        } catch {}

        // 5) สร้าง magic link ไปหน้า /app/admin/users-split
        const token = issueMagicToken(
          { uid: userId, name, role, tenant: tenantRef.id, picture },
          '2h'
        );
        const base = (process.env.PUBLIC_APP_URL || BASE_APP_URL).replace(/\/$/, '');
        const next = '/app';
        const u = new URL('/auth/magic', base);
        u.searchParams.set('t', token);
        u.searchParams.set('tenant', tenantRef.id);
        u.searchParams.set('next', next);
        u.searchParams.set('trace', '0');

        console.log('[MANAGE/LINK/ISSUE]', { tenant: tenantRef.id, uid: userId, next });
        const url = u.toString();

        const bubble = {
          type: 'bubble',
          // size: 'kilo', // จะใส่หรือเอาออกก็ได้ (ถ้าไม่ชัวร์ ให้ลบออก)
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'จัดการผู้ใช้งาน', weight: 'bold', size: 'lg' },
              { type: 'text', text: `@${name}`, size: 'md', wrap: true },
              { type: 'text', text: role, size: 'sm', color: '#888888' } // ← เปลี่ยนเป็น 6 หลัก
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'primary',
                height: 'sm',
                action: { type: 'uri', label: 'เข้าสู่ระบบ (ผู้ดูแล)', uri: url }
              }
            ],
            flex: 0
          }
        };


        return replyFlex(replyToken, bubble, null, tenantRef);
      } catch (e) {
        console.error('[MANAGE/LINK/ERR]', { tenant: tenantRef?.id, uid: userId, msg: e?.message || e });
        return reply(replyToken, 'ไม่สามารถสร้างลิงก์เข้าสู่ระบบได้ในขณะนี้', null, tenantRef);
      }
    }



    if (/^(รีเซ็ตเมนู|ตั้งเมนูแรก|รีเซ็ตเมนูของฉัน)$/i.test(text)) {
      try {
        const userId = ev.source?.userId;
        if (!userId) return reply(replyToken, 'ไม่พบ userId ของคุณ', null, tenantRef);

        const preregId = await getRichMenuIdByKind(tenantRef, 'PREREG');
        if (preregId) {
          await linkRichMenuToUser(tenantRef, userId, preregId);
          return reply(
            replyToken,
            'เปลี่ยนเมนูของคุณกลับเป็นเมนูเริ่มต้นแล้ว ✅\nหากยังไม่เห็นการเปลี่ยนแปลง ลองปิด–เปิดห้องแชทก่อนนะ',
            null,
            tenantRef
          );
        }
        return reply(replyToken, 'ยังไม่มีเมนูเริ่มต้น (PREREG) บน OA นี้\nโปรดให้แอดมินตั้งค่าแล้วลองอีกครั้ง', null, tenantRef);
      } catch (e) {
        console.error('RESET_MENU_SELF_ERR', e?.status || e);
        return reply(replyToken, 'ไม่สามารถรีเซ็ตเมนูได้ในขณะนี้', null, tenantRef);
      }
    }


    // ปุ่มเมนู: สั่งงาน → แสดงตัวอย่าง (จัดบรรทัดอ่านง่ายเหมือน "ช่วยเหลือ")
    if (text === 'สั่งงาน') {
      const r = await callAppsScriptForTenant(tenantRef, 'list_users', {});
      const users = (r.users||[]).filter(u => String(u.status||'Active').toLowerCase()==='active');
      const sample = users.slice(0, 15).map(u => {
        const handle  = u.username ? `@${u.username}` : `@${shortId(u.user_id)}`;
        const roleTxt = roleLabel(u.role);
        const real    = u.real_name ? ` – ${u.real_name}` : '';          return `• ${handle} (${roleTxt})${real}`;
      });
      const more = users.length>15 ? `… และอีก ${users.length-15} คน` : '';
      const helpLines = [
          '📝 สั่งงาน — พิมพ์แบบนี้',
          '',
          'ตัวอย่าง (พิมพ์เล็ก/ใหญ่ และเว้นวรรคได้):',
          '• @po ปรับรายงาน พรุ่งนี้ 09:00',
          '• @test ขอทำป้ายหน้าร้าน ก่อนบ่าย 3 นะ',
          '• @po ทำ rich menu วันนี้ ด่วน',
          '',
          'เกร็ดสั้น ๆ:',
          '• ไม่ใส่เวลา → ใช้ 17:30 อัตโนมัติ',
          '• "ก่อนบ่าย 3" = วันนี้ 15:00',
          '• ใส่คำว่า ด่วน/urgent → ติดแท็ก [URGENT]',
          '',
          'ผู้รับงานในระบบ:',
          ...sample,
          more
        ].filter(Boolean);

      await replyWithTenant(tenantRef, ev.replyToken, [{ type:'text', text: helpLines.join('\n') }]);
      return;
    }

    

    // 3) เมนู: ดูผู้ใช้งานทั้งหมด (สรุปเป็น Flex)
    if (text === 'ดูผู้ใช้งานทั้งหมด') {
      const r = await callAppsScriptForTenant(tenantRef, 'list_users', {});// helper ของเดิม
      const users = r.users || [];
      if (!users.length) return reply(replyToken, 'ยังไม่มีผู้ใช้ในระบบ', null, tenantRef);
      users.sort((a,b) =>
        roleRank(a.role) - roleRank(b.role) ||
        String(a.real_name || a.username || '').localeCompare(String(b.real_name || b.username || ''))
      );
      const bubbles = users.slice(0,10).map(u => renderUserCard({
        name: u.real_name || u.username || '-',
        username: u.username || '',
        role: u.role || 'User',
        status: u.status || 'Active',
        updated: (u.updated_at || '').slice(0,10)
      }));
      return replyFlexMany(replyToken, bubbles, [], tenantRef);
    }

    // 4) เมนู: ดูงานค้างทั้งหมด (ของฉัน)
    if (text === 'ดูงานค้างทั้งหมด') {
      const r = await callAppsScriptForTenant(tenantRef, 'list_tasks', { assignee_id: userId });
      const tasks = (r.tasks || []).filter(t => ['pending','doing'].includes(String(t.status||'').toLowerCase()));
      if (!tasks.length) return reply(replyToken, 'ไม่มีงานค้าง 👍', null, tenantRef);

      // จัดเรียง: doing มาก่อน → กำหนดส่งใกล้สุด → อัปเดตล่าสุด
      const sorted = tasks.sort((a, b) => {
        const ra = (String(a.status).toLowerCase()==='doing') ? 0 : 1;
        const rb = (String(b.status).toLowerCase()==='doing') ? 0 : 1;
        if (ra !== rb) return ra - rb;
        const da = Date.parse(a.deadline || '') || Infinity;
        const db = Date.parse(b.deadline || '') || Infinity;
        if (da !== db) return da - db;
        const ua = Date.parse(a.updated_date || '') || 0;
        const ub = Date.parse(b.updated_date || '') || 0;
        return ub - ua;
      });

        const bubbles = sorted.slice(0, 10).map(t => renderTaskCard({
          id:        t.task_id,
          title:     String(t.task_detail || '-').slice(0, 80),
          date:      (t.updated_date || t.created_date) ? fmtThaiDateTime(t.updated_date || t.created_date) : '-',
          due:       t.deadline ? fmtThaiDateTime(t.deadline) : '-',
          status:    t.status,
          assignee:  t.assignee_name || '',
          assigner:  t.assigner_name || ''
        }, {
          showStatusButtons: true,  // เมนูนี้ให้เปลี่ยนสถานะได้
        }));
        return replyFlexMany(replyToken, bubbles, [], tenantRef);
    }
    
    // 5) เมนู: งานที่ฉันสั่ง
    if (text === 'ดูงานที่ฉันสั่ง' || text === 'งานที่ฉันสั่ง') {
      const r = await callAppsScriptForTenant(tenantRef, 'list_tasks', { assigner_id: userId });
      const tasks = (r.tasks || []).filter(
        t => String(t.assigner_id || t.assignerId || '') === userId
      );
      if (!tasks.length) return reply(replyToken, 'คุณยังไม่เคยสั่งงานค่ะ', null, tenantRef);

      // เรียงอัปเดตล่าสุดก่อน
      tasks.sort((a,b) => (Date.parse(b.updated_date||'')||0) - (Date.parse(a.updated_date||'')||0));

      const bubbles = tasks.slice(0, 10).map(t => renderTaskCard({
        id:        t.task_id,
        title:     String(t.task_detail || '-').slice(0, 80),
        date:      (t.updated_date || t.created_date) ? fmtThaiDateTime(t.updated_date || t.created_date) : '-',
        due:       t.deadline ? fmtThaiDateTime(t.deadline) : '-',
        status:    t.status,
        assignee:  t.assignee_name || '',
        assigner:  t.assigner_name || ''
      }, {
        showStatusButtons: false,   // งานที่ฉันสั่ง: ซ่อนปุ่มเปลี่ยนสถานะ
        showRemind: true            // โชว์ปุ่ม 🔔 เตือนงาน
      }));

      return replyFlexMany(replyToken, bubbles, [], tenantRef);
    }

    // 6) เมนู: งานของฉันวันนี้
    if (text === 'งานของฉันวันนี้') {
      const r = await callAppsScriptForTenant(tenantRef, 'list_tasks', { assignee_id: userId });

      const tz = 'Asia/Bangkok';
      const now = new Date();
      const todayYMD = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

      const isTodayDeadline = (dstr) => {
        if (!dstr) return false;
        const d = new Date(dstr);
        if (isNaN(d)) return false;
        const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        return ymd === todayYMD;
      };

      const tasks = (r.tasks || []).filter(t => {
        const st = String(t.status || '').toLowerCase();
        return st !== 'done' && isTodayDeadline(t.deadline);
      });

      if (!tasks.length) return reply(replyToken, 'วันนี้ยังไม่มีงานที่ถึงกำหนด', null, tenantRef);

      // เดดไลน์ใกล้สุดมาก่อน
      tasks.sort((a,b) => (Date.parse(a.deadline||'')||Infinity) - (Date.parse(b.deadline||'')||Infinity));

      const bubbles = tasks.slice(0, 10).map(t => renderTaskCard({
        id:        t.task_id,
        title:     String(t.task_detail || '-').slice(0, 80),
        date:      (t.updated_date || t.created_date) ? fmtThaiDateTime(t.updated_date || t.created_date) : '-',
        due:       t.deadline ? fmtThaiDateTime(t.deadline) : '-',
        status:    t.status,
        assignee:  t.assignee_name || '',
        assigner:  t.assigner_name || ''
      }, {
        showStatusButtons: true,   // งานของฉันวันนี้: กดอัปเดตสถานะได้เลย
        showRemind: false
      }));

      return replyFlexMany(replyToken, bubbles, [], tenantRef);
    }

    // 7) DM ถึงแอดมิน: "dm @username ข้อความ" หรือ "ถึงแอดมิน @username ข้อความ"
    {
      const m = text.match(/^(?:dm|ถึงแอดมิน)\s+@?([^\s:：]+)\s+([\s\S]+)$/i);
      if (m) {
        const targetKey = m[1].trim().toLowerCase();
        const message   = m[2].trim();
        const r = await callAppsScriptForTenant(tenantRef, 'list_users', {});
        const admins = (r.users||[]).filter(u =>
          ['admin','supervisor'].includes(String(u.role||'').toLowerCase())
        );
        const target = admins.find(u =>
          String(u.username||'').toLowerCase() === targetKey ||
          String(u.real_name||'').toLowerCase() === targetKey
        );
        if (!target || !target.user_id) return reply(replyToken, 'ไม่พบแอดมินปลายทาง', null, tenantRef);
        let sender = (await getDisplayName(tenantRef, userId)) || userId;
        try { const gu = await callAppsScriptForTenant(tenantRef, 'get_user', { user_id: userId });
          sender = gu?.user?.username || gu?.user?.real_name || sender;
        } catch {}
        await pushText(target.user_id, `📨 ข้อความถึงแอดมินจาก ${sender}\n${message}`, tenantRef);
        return reply(replyToken, 'ส่งข้อความถึงแอดมินแล้ว ✅', null, tenantRef);
      }
    }

    // 8) ลงทะเบียนผู้ใช้
    if (/^ลงทะเบียน$/i.test(text)) {
      try {
        const gu = await callAppsScriptForTenant(tenantRef, 'get_user', { user_id: userId }).catch(() => ({}));
        if (gu?.user) {
          const u = gu.user || {};
          const username = u.username || u.real_name || (await getDisplayName(tenantRef, userId)) || 'คุณ';
          const role = String(u.role || 'user').toLowerCase();

          // ✅ ผู้ใช้เคยลงทะเบียนแล้ว → ลิงก์ rich menu "หลังลงทะเบียน" ให้รายคนทันที
          try {
            // 1) พยายามใช้ postRichMenuId ที่ตั้งค่าไว้ใน integrations
            const integSnap = await tenantRef.collection('integrations').doc('taskbot').get();
            const postDocId = integSnap.exists ? (integSnap.data()?.postRichMenuId || null) : null;

            let mainLineId = null;
            if (postDocId) {
              // อ่าน lineRichMenuId จากเอกสารเมนูที่เลือกไว้
              const mSnap = await tenantRef.collection('richmenus').doc(String(postDocId)).get();
              mainLineId = mSnap.exists ? (mSnap.data()?.lineRichMenuId || null) : null;
            }

            // 2) ถ้ายังไม่มี ให้ fallback เป็น MAIN
            if (!mainLineId) {
              // ฟังก์ชันนี้ของคุณใช้ได้อยู่แล้วจากบล็อกลงทะเบียนจริงด้านล่าง
              mainLineId = await getRichMenuIdByKind(tenantRef, 'MAIN');
            }

            // 3) ลิงก์เมนูให้ผู้ใช้รายคน (จะแทนของเดิมอัตโนมัติ)
            if (mainLineId) {
              await linkRichMenuToUser(tenantRef, userId, mainLineId);
            }
          } catch (ee) {
            console.warn('LINK_MAIN_ON_EXISTING_FAILED', ee?.message || ee);
          }

          return reply(
            replyToken,
            `คุณลงทะเบียนแล้ว ✅\nยินดีต้อนรับ @${username}\nบทบาท: ${role}\n(อัปเดตเมนูหลักให้แล้ว)`,
            null,
            tenantRef
          );
        }

        // ยังไม่เคยลงทะเบียน → แนะนำวิธี
        const help = [
          'ยังไม่ได้ลงทะเบียน',
          'พิมพ์:',
          '• ลงทะเบียน <username> <ชื่อจริง> <role>',
          'ตัวอย่าง:',
          '• ลงทะเบียน po ปอ admin',
          '',
          'role ในระบบมีดังนี้',
          'Developer | Admin | Supervisor | user'
        ].join('\n');
        return reply(replyToken, help, null, tenantRef);
      } catch (e) {
        console.error('REGISTER_CHECK_ERR', e);
        return reply(replyToken, 'ขออภัย ตรวจสอบสถานะลงทะเบียนไม่สำเร็จ ลองใหม่อีกครั้งนะ', null, tenantRef);
      }
    }

    const reg = parseRegister(text);
    if (reg) {
      try {
        await callAppsScriptForTenant(tenantRef, 'upsert_user', {
          username:   reg.username || '',
          real_name:  reg.realName || '',
          role:       reg.role || '',
          user_id:    userId,
        });

        // หลังลงทะเบียน → ลิงก์ Rich menu "MAIN" ให้ผู้ใช้คนนี้ทันที
        try {
          const mainId = await getRichMenuIdByKind(tenantRef, 'MAIN');
          if (mainId) await linkRichMenuToUser(tenantRef, userId, mainId);
        } catch (ee) {
          console.warn('LINK_MAIN_FAILED', ee?.message || ee);
        }

        return reply(replyToken, 'ลงทะเบียนเรียบร้อย ✅', null, tenantRef);
      } catch (e) {
        console.error('REGISTER_FAIL', e?.message || e);
        return reply(replyToken, `ลงทะเบียนไม่สำเร็จ: ${e.message || 'Apps Script'}`, null, tenantRef);
      }
    }

    // ติดต่อแอดมิน — แนะนำรูปแบบ 'dm @ชื่อ ข้อความ' + Quick Reply รายชื่อแอดมิน
    if (/^ติดต่อแอดมิน$/i.test(text)) {
      try {
        const r = await callAppsScriptForTenant(tenantRef, 'list_users', {}).catch(() => ({}));
        const admins = (r?.users || [])
          .filter(u => String(u.role || '').toLowerCase() !== 'user')
          .slice(0, 13);

        const quick = admins.map(u => ({
          type: 'action',
          action: {
            type: 'message',
            label: `dm @${u.username || u.real_name || 'admin'}`,
            text: `dm @${u.username || u.real_name || 'admin'} สวัสดีครับ/ค่ะ ขอความช่วยเหลือ…`
          }
        }));

        const msg = [
          'ติดต่อแอดมิน',
          'พิมพ์: dm @ชื่อแอดมิน ข้อความ',
          'ตัวอย่าง:',
          '• dm @po ขอความช่วยเหลือเรื่องระบบ'
        ].join('\n');

        return reply(replyToken, msg, quick, tenantRef);
      } catch (e) {
        console.error('CONTACT_ADMIN_HELP_ERR', e);
        return reply(
          replyToken,
          'พิมพ์: dm @ชื่อแอดมิน ข้อความ\nตัวอย่าง: dm @po ขอความช่วยเหลือเรื่องระบบ',
          null,
          tenantRef
        );
      }
    }


    // ========== ยืนยัน/ยกเลิกรายการร่าง ==========
    {
      const mOk = text.match(/^ยืนยันมอบหมาย(?:\s+(TMP_[A-Za-z0-9]+))?$/);
      const mNo = text.match(/^ยกเลิกมอบหมาย(?:\s+(TMP_[A-Za-z0-9]+))?$/);

      if (mOk || mNo) {
        const tmpIdFromText = mOk?.[1] || mNo?.[1];
        const draft = draftAssign.get(userId);
        if (!draft) { await reply(replyToken, 'ไม่พบรายการร่าง', null, tenantRef); return; }
        if (tmpIdFromText && tmpIdFromText !== draft.taskId) {
          await reply(replyToken, 'รายการร่างไม่ตรงกับที่คุณมีอยู่', null, tenantRef);
          return;
        }

        // ยกเลิก
        if (mNo) {
          draftAssign.delete(userId);
          await reply(replyToken, 'ยกเลิกร่างแล้ว', null, tenantRef);
          return;
        }

        // ยืนยัน -> สร้างงานจริง (เขียนลงชีต)
        draftAssign.delete(userId);
        const taskId = 'TASK_' + crypto.randomBytes(4).toString('hex');

        // ชื่อผู้สั่งงาน (username ก่อน real_name)
        let assignerName = '';
        try {
          const gu = await callAppsScriptForTenant(tenantRef, 'get_user', { user_id: userId });
          const u = gu?.user || {};
          assignerName = u.username || u.real_name || (await getDisplayName(tenantRef, userId)) || 'Unknown';
        } catch {
          assignerName = (await getDisplayName(tenantRef, userId)) || 'Unknown';
        }

        // 🧼 ตัดคำบอกเวลาโดดๆ ออกจาก detail/note ก่อนบันทึก
        const clean = sanitizeAssignPayload(draft.assign);

        await callAppsScriptForTenant(tenantRef, 'upsert_task', {
          task_id: taskId,
          assigner_id: userId,
          assigner_name: assignerName,
          assignee_name: draft.assignee.username || clean.assigneeName,
          assignee_id: draft.assignee.user_id || '',
          task_detail: clean.detail,              // ✅ ใช้ข้อความที่ sanitize แล้ว
          status: 'pending',
          deadline: clean.deadline || '',
          note: clean.note || '',
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        });

        // ทำการ์ดสำหรับฝั่ง "คนสั่ง"
        const assignerBubble = renderTaskCard({
          id:        taskId,
          title:     String(clean.detail || '-').slice(0, 80),
          date:      new Date().toISOString(),
          due:       clean.deadline || '-',
          status:    'pending',
          assignee:  draft.assignee.username || draft.assignee.real_name || '',
          assigner:  assignerName
        }, {
          showStatusButtons: false, // คนสั่งไม่ต้องอัปเดตสถานะ
          showRemind: true          // ให้ปุ่ม 🔔 เตือน
        });
        await replyFlexMany(replyToken, [assignerBubble], [], tenantRef);

        // ทำการ์ดสำหรับ "ผู้รับ"
        if (draft.assignee.user_id) {
          const assigneeBubble = renderTaskCard({
            id:        taskId,
            title:     String(clean.detail || '-').slice(0, 80),
            date:      new Date().toISOString(),
            due:       clean.deadline || '-',
            status:    'pending',
            assignee:  draft.assignee.username || draft.assignee.real_name || '',
            assigner:  assignerName
          }, {
            showStatusButtons: true,  // ผู้รับกด เสร็จแล้ว/กำลังทำ ได้จากการ์ด
            showRemind: false
          });
          await pushFlex(tenantRef, draft.assignee.user_id, assigneeBubble);
        }
        return;
      }
    }


    // 9) สั่งงาน → PREVIEW ONLY (แทนที่บล็อกเดิมทั้งก้อน)
    {
      // พยายาม parse แบบภาษาพูดก่อน แล้วค่อย fallback ฟอร์แมตมาตรฐาน
      let assign = parseAssignLoose(text);
      if (!assign) assign = parseAssign(text);

      if (assign) {
        // แปลงกำหนดส่งภาษาคน → ISO (กันไม่ให้กลายเป็น 0)
        const dueISO = assign.deadline ? (parseNaturalDue(assign.deadline) || assign.deadline) : '';
        assign.deadline = dueISO || '';

        // 🧼 sanitize detail/note ตั้งแต่ตอน PREVIEW (จะได้เห็นตัวอย่างที่สะอาด)
        assign = sanitizeAssignPayload(assign);

        // หา "ผู้รับ" จากชีต (รองรับ username / real_name)
        const assignee = await resolveAssignee(tenantRef, assign.assigneeName);
        if (!assignee) {
          // เสนอรายชื่อใกล้เคียงเป็น Quick Reply ให้คลิก
          try {
            const r = await callAppsScriptForTenant(tenantRef, 'list_users', {});
            const key = String(assign.assigneeName || '').toLowerCase();
            const candidates = (r.users || [])
              .filter(u =>
                (String(u.username || '').toLowerCase().includes(key)) ||
                (String(u.real_name || '').toLowerCase().includes(key))
              )
              .slice(0, 13);

            if (candidates.length) {
              const quick = candidates.map(u => ({
                type: 'action',
                action: { type: 'message', label: `@${u.username}`, text: `สั่งงาน @${u.username} ${assign.detail}` }
              }));
              await reply(
                replyToken,
                `ไม่ชัดเจนว่า "${assign.assigneeName}" คือใคร\nเลือกผู้รับจากรายชื่อด้านล่าง`,
                quick,
                tenantRef
              );
            } else {
              await reply(replyToken, `ไม่พบผู้ใช้ชื่อ "${assign.assigneeName}"`, null, tenantRef);
            }
          } catch {
            await reply(replyToken, `ไม่พบผู้ใช้ชื่อ "${assign.assigneeName}"`, null, tenantRef);
          }
          return;
        }

        // เก็บร่าง และส่งการ์ด PREVIEW (ยังไม่บันทึกชีท)
        const tmpId = 'TMP_' + crypto.randomBytes(3).toString('hex');
        draftAssign.set(userId, { taskId: tmpId, assign, assignee });

        const preview = makeAssignPreviewBubble({ tmpId, assign, assignee });
        await replyFlexMany(replyToken, [preview], [], tenantRef);
        return;
      }
    }



    // 10) ปรับแก้งาน: สถานะ/เดดไลน์/โน้ต/ผู้รับ/รายละเอียด/เตือน
    const st = parseStatus(text);
    if (st) {
      // 1) โหลดงาน
      const t = await getTaskById(tenantRef, st.taskId);
      if (!t) {
        return reply(replyToken, 'ไม่พบบันทึกงานนั้นครับ', null, tenantRef);
      }

      // 2) เช็กสิทธิ์
      const allowed = await canModifyTask(tenantRef, userId, t);
      if (!allowed) {
        return reply(replyToken, 'สิทธิ์ไม่พอในการแก้สถานะงานนี้', null, tenantRef);
      }

      // 3) อัปเดตสถานะ
      await updateTaskFields(tenantRef, st.taskId, {
        status: st.status,
        updated_date: new Date().toISOString()
      });

      await reply(replyToken, `อัปเดตสถานะ ${st.taskId} → ${st.status.toUpperCase()}`, null, tenantRef);

      // 4) แจ้งอีกฝั่ง
      const otherId =
        userId === (t.assignee_id || t.assigneeId) ? (t.assigner_id || t.assignerId) :
        userId === (t.assigner_id || t.assignerId) ? (t.assignee_id || t.assigneeId) : '';
      if (otherId) {
        await pushText(otherId, `งาน ${t.task_id} ถูกอัปเดตเป็น "${st.status}"`, tenantRef);
      }
      return;
    }



    // --- ตั้ง/แก้เดดไลน์ ---
    const sd = parseSetDeadline(text) || parseEditDeadline(text);
    if (sd) {
      const t = await getTaskById(tenantRef, sd.taskId);
      if (!t) {
        return reply(replyToken, 'ไม่พบงานนั้นครับ', null, tenantRef);
      }
      // ✅ allow ผู้สั่งงานด้วย
      const allowed =
        userId === (t.assigner_id || '') || (await canModifyTask(tenantRef, userId, t));

      if (!allowed) {
        return reply(replyToken, 'สิทธิ์ไม่พอในการส่งเตือนงานนี้', null, tenantRef);
      }

      const nat = parseNaturalDue(sd.deadline) || sd.deadline; // รับทั้งไทย/ฟอร์แมต
      const merged = await updateTaskFields(tenantRef, sd.taskId, {
        deadline: nat,
        updated_date: new Date().toISOString()
      });

      return reply(
        replyToken,
        `เดดไลน์ใหม่ของ ${sd.taskId}: ${(merged.deadline || nat).replace('T',' ')}`,
        null,
        tenantRef
      );
    }


    // --- เพิ่มโน้ต ---
    const addN = parseAddNote(text);
    if (addN) {
      const t = await getTaskById(tenantRef, addN.taskId);
      if (!t) {
        return reply(replyToken, 'ไม่พบบันทึกงานนั้นครับ', null, tenantRef);
      }
      // ✅ allow ผู้สั่งงานด้วย
      const allowed =
        userId === (t.assigner_id || '') || (await canModifyTask(tenantRef, userId, t));

      if (!allowed) {
        return reply(replyToken, 'สิทธิ์ไม่พอในการส่งเตือนงานนี้', null, tenantRef);
      }

      const newNote = [t?.note, addN.note].filter(Boolean).join(' | ');
      await updateTaskFields(tenantRef, addN.taskId, {
        note: newNote,
        updated_date: new Date().toISOString()
      });

      return reply(replyToken, `เพิ่มโน้ตให้ ${addN.taskId} แล้ว\nโน้ต: ${newNote}`, null, tenantRef);
    }


    // --- เปลี่ยนผู้รับ (ต้องเป็นเจ้าของงาน หรือ admin/supervisor/developer) ---
    const re = parseReassign(text);
    if (re) {
      const t = await getTaskById(tenantRef, re.taskId);
      if (!t) {
        return reply(replyToken, 'ไม่พบงานนั้นครับ', null, tenantRef);
      }
      // ✅ allow ผู้สั่งงานด้วย
      const allowed =
        userId === (t.assigner_id || '') || (await canModifyTask(tenantRef, userId, t));

      if (!allowed) {
        return reply(replyToken, 'สิทธิ์ไม่พอในการส่งเตือนงานนี้', null, tenantRef);
      }

      const hit = await resolveAssignee(tenantRef, re.mention);
      if (!hit) {
        return reply(replyToken, 'หาเจ้าของงานใหม่ไม่เจอ (กรุณาระบุ @username)', null, tenantRef);
      }

      const prevAssId = t.assignee_id || '';
      const merged = await updateTaskFields(tenantRef, re.taskId, {
        assignee_id:   hit.user_id || '',
        assignee_name: hit.real_name || hit.username || re.mention,
        updated_date:  new Date().toISOString()
      });

      await reply(
        replyToken,
        `ย้ายผู้รับของ ${re.taskId} เป็น ${merged.assignee_name}`,
        null,
        tenantRef
      );

      // (ไม่บังคับ) แจ้งคนที่เกี่ยวข้อง
      if (prevAssId && prevAssId !== merged.assignee_id) {
        await pushText(prevAssId, `งาน ${re.taskId} ถูกโอนไปให้ ${merged.assignee_name}`, tenantRef);
      }
      if (merged.assignee_id) {
        await pushText(merged.assignee_id, `คุณได้รับมอบหมายงานใหม่: ${re.taskId}`, tenantRef);
      }
      return;
    }


    // --- แก้รายละเอียดงาน ---
    const ed = parseEditDetail(text);
    if (ed) {
      const t = await getTaskById(tenantRef, ed.taskId);
      if (!t) {
        return reply(replyToken, 'ไม่พบบันทึกงานนั้นครับ', null, tenantRef);
      }
      // ✅ allow ผู้สั่งงานด้วย
      const allowed =
        userId === (t.assigner_id || '') || (await canModifyTask(tenantRef, userId, t));

      if (!allowed) {
        return reply(replyToken, 'สิทธิ์ไม่พอในการส่งเตือนงานนี้', null, tenantRef);
      }

      await updateTaskFields(tenantRef, ed.taskId, {
        task_detail: ed.detail,
        updated_date: new Date().toISOString()
      });

      return reply(replyToken, `แก้รายละเอียด ${ed.taskId} แล้ว`, null, tenantRef);
    }


    // --- เตือนผู้รับให้ทำงาน ---
    const rm = parseRemind(text);
    if (rm) {
      const t = await getTaskById(tenantRef, rm.taskId);
      if (!t) {
        return reply(replyToken, 'ไม่พบบันทึกงานนั้นครับ', null, tenantRef);
      }

      const allowed = await canModifyTask(tenantRef, userId, t);
      if (!allowed) {
        return reply(replyToken, 'สิทธิ์ไม่พอในการส่งเตือนงานนี้', null, tenantRef);
      }

      const toId = t.assignee_id || t.assigneeId;
      if (!toId) {
        return reply(replyToken, 'รายการนี้ไม่มี LINE ID ของผู้รับ จึงส่งเตือนไม่ได้', null, tenantRef);
      }

      // การ์ดให้ผู้รับ (กดอัปเดตสถานะได้)
      const bubble = renderTaskCard({
        id:        t.task_id,
        title:     String(t.task_detail || '-').slice(0, 80),
        date:      new Date().toISOString(),
        due:       t.deadline || '-',
        status:    t.status,
        assignee:  t.assignee_name || '',
        assigner:  t.assigner_name || ''
      }, {
        showStatusButtons: true,
        showRemind: false
      });

      await callLineAPITenant(tenantRef, '/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toId,
          messages: [{
            type: 'flex',
            altText: `🔔 เตือนงาน ${t.task_id}`,
            contents: bubble
          }]
        })
      });

      return reply(replyToken, 'ส่งเตือนงานให้ผู้รับแล้ว', null, tenantRef);
    }



    // ---- ข้อความทั่วไป นอกทุกโหมด ----
    return; // เงียบไว้ หรือจะ reply fallback ก็ได้
  }
}




// ==============================
// 6.y) Admin Templates (global)
// ==============================
function requireAdmin(req, res, next) {
  admin.firestore().doc(`users/${req.user.uid}`).get()
    .then(snap => {
      const viaDocIsAdmin = !!snap.get('isAdmin');            // แบบ boolean
      const viaDocRole    = snap.get('role') === 'admin';     // แบบ string role
      const viaClaims     = !!req.user?.admin;                // custom claim
      if (!(viaDocIsAdmin || viaDocRole || viaClaims)) {
        return res.status(403).json({ error: 'not_admin' });
      }
      next();
    })
    .catch(() => res.status(500).json({ error: 'server_error' }));
}
// Create template
app.post('/api/admin/templates', requireFirebaseAuth, requireAdmin, async (req, res) => {
  try {
    const {
      title = '',
      size = 'large',
      imageUrl = '',
      chatBarText = 'Menu',
      areas = [],
      category = '',
      tags = [],
      note = '',
    } = req.body || {};

    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = admin.firestore().collection('admin_templates').doc();
    await ref.set({
      title, size, imageUrl, chatBarText, areas,
      category, tags, note,
      createdBy: req.user.uid,
      createdAt: now, updatedAt: now,
    });

    res.json({ ok: true, id: ref.id });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// Update template
app.put('/api/admin/templates/:tid', requireFirebaseAuth, requireAdmin, async (req, res) => {
  try {
    const { tid } = req.params;
    const payload = req.body || {};
    payload.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await admin.firestore().collection('admin_templates').doc(tid).set(payload, { merge: true });
    res.json({ ok: true, id: tid });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// Delete template
app.delete('/api/admin/templates/:tid', requireFirebaseAuth, requireAdmin, async (req, res) => {
  try {
    const { tid } = req.params;
    await admin.firestore().collection('admin_templates').doc(tid).delete();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// List templates (any logged-in user)
app.get('/api/admin/templates', requireFirebaseAuth, async (_req, res) => {
  try {
    const snap = await admin.firestore().collection('admin_templates')
      .orderBy('updatedAt', 'desc')
      .limit(200).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// Get one template
app.get('/api/admin/templates/:tid', requireFirebaseAuth, async (req, res) => {
  try {
    const { tid } = req.params;
    const snap = await admin.firestore().collection('admin_templates').doc(tid).get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    res.json({ id: snap.id, ...snap.data() });
  } catch (e) {
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// ===== Admin backfill: เติม botUserId ให้ tenants เก่าที่เคยสร้างไว้แล้ว =====
// ใช้ครั้งเดียวด้วยบัญชีที่เป็น admin
app.post('/api/admin/backfill-bot-user-id', requireFirebaseAuth, requireAdmin, async (_req, res) => {
  try {
    const db = admin.firestore();
    const snap = await db.collection('tenants').get();

    let updated = 0, skipped = 0, missing = 0, failed = 0;

    await Promise.all(snap.docs.map(async d => {
      const data = d.data() || {};
      if (data.botUserId) { skipped++; return; }

      try {
        const sec = await d.ref.collection('secret').doc('v1').get();
        const accessToken = sec.get('accessToken');
        if (!accessToken) { missing++; return; }

        const r = await fetchFn('https://api.line.me/v2/bot/info', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!r.ok) { failed++; return; }
        const info = await r.json(); // { userId, basicId, ... }

        await d.ref.set({
          botUserId: info.userId || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        updated++;
      } catch { failed++; }
    }));

    res.json({ ok: true, updated, skipped, missing, failed });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

// ======= Roles Management (Admin/Developer Console) =======
// ---------- helpers ----------
function hasRoleFromDoc(snap, role) {
  if (!snap?.exists) return false;
  const r = snap.get('role');
  if (r) return r === role;
  if (role === 'admin') return !!snap.get('isAdmin'); // fallback รุ่นเก่า
  return false;
}
function actorRoleFromReqUser(decoded) {
  if (decoded?.dev)  return 'developer';
  if (decoded?.head) return 'headAdmin';
  if (decoded?.admin) return 'admin';
  return null;
}

// ดึง tenant จาก query/header (ถ้าไม่ส่งมา = global)
function getTenantFromReq(req) {
  return String(req.query.tenant || req.get('X-Tenant-Id') || '').trim() || null;
}
// อ้างอิง collection users ตามโหมด
function usersColRef(db, tenantId) {
  return tenantId
    ? db.collection('tenants').doc(tenantId).collection('users')
    : db.collection('users');
}
// toMillis รองรับหลายรูปแบบ timestamp
function toMillis(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  if (v.toMillis) return v.toMillis();
  if (v._seconds) return v._seconds * 1000 + (v._nanoseconds ? Math.floor(v._nanoseconds / 1e6) : 0);
  return 0;
}
// แปลงเอกสารผู้ใช้ให้เข้ากับ UI
function shapeUser(id, x = {}) {
  const roleTop =
    x.role ||
    (x.line && x.line.role) ||
    (x.isAdmin ? 'admin' : 'user');

  const displayName =
    x.displayName ||
    (x.line && x.line.displayName) ||
    x.name || x.username || '';

  const photoURL =
    x.photoURL ||
    (x.line && (x.line.pictureUrl || x.line.pictureURL)) ||
    '';

  const isAdmin = typeof x.isAdmin === 'boolean'
    ? x.isAdmin
    : ['admin','headAdmin','developer'].includes(String(roleTop));

  const updatedAt = x.updatedAt || (x.line && x.line.updatedAt) || null;

  return {
    id,
    displayName,
    photoURL,
    role: roleTop || 'user',
    isAdmin: !!isAdmin,
    updatedAt,
    _updatedAtMs: toMillis(updatedAt),
  };
}

// โหลดบทบาทของผู้เรียก (claims -> tenant doc -> root doc)
async function loadActorRole(req) {
  // 1) custom claims มาก่อน
  const via = actorRoleFromReqUser(req.user);
  if (via) return via;

  // 2) หา doc ได้หลายแบบ: users/{uid} และ users/line:{uid}
  const db = admin.firestore();
  const uid = req.user?.uid || '';
  const paths = [`users/${uid}`, `users/line:${uid}`];
  for (const p of paths) {
    try {
      const snap = await db.doc(p).get();
      if (hasRoleFromDoc(snap, 'developer')) return 'developer';
      if (hasRoleFromDoc(snap, 'headAdmin')) return 'headAdmin';
      if (hasRoleFromDoc(snap, 'admin'))     return 'admin';
    } catch {/* ignore */}
  }
  return 'user';
}

// ===== list users ทั้ง global และต่อ tenant (หากมี) =====
async function listAllUsers({ tenantId } = {}) {
  const db = admin.firestore();

  // 1) global users (ไม่ lock orderBy เพื่อกันฟิลด์เวลาเพี้ยน)
  const gSnap = await db.collection('users').limit(500).get();
  const globalItems = gSnap.docs.map(d => ({ id: d.id, ...d.data(), _src: 'global' }));

  // 2) tenant users (ถ้ามี)
  let tenantItems = [];
  if (tenantId) {
    const tSnap = await db.collection(`tenants/${tenantId}/users`).limit(500).get().catch(()=>null);
    if (tSnap?.docs?.length) {
      tenantItems = tSnap.docs.map(d => ({ id: d.id, ...d.data(), _src: 'tenant' }));
    }
  }

  // รวม และให้ tenant ทับ global ถ้า id ซ้ำ
  const byId = new Map();
  for (const u of [...globalItems, ...tenantItems]) byId.set(u.id, u);

  // map ฟิลด์ให้หน้าเว็บใช้ได้แน่นอน
  const rows = [...byId.values()].map(u => {
    const role = u.role || (u.isAdmin ? 'admin' : 'user');
    const updatedAt =
      u.updatedAt ||
      u.updated_at ||
      (u.line && u.line.updatedAt) ||
      null;
    return {
      id: u.id,
      displayName: u.displayName || u.line?.displayName || '',
      photoURL: u.photoURL || u.line?.pictureUrl || '',
      role,
      isAdmin: ['developer','headAdmin','admin'].includes(role),
      updatedAt
    };
  });

  // sort ล่าสุดก่อน (รองรับ Timestamp / {_seconds})
  const toMs = (t) =>
    t?.toMillis?.() ?? (t?._seconds ? t._seconds * 1000 : 0);
  rows.sort((a,b) => (toMs(b.updatedAt) - toMs(a.updatedAt)));
  return rows;
}

// ================== ROUTES ==================

// ===== GET /api/admin/users =====
app.get('/api/admin/users', requireFirebaseAuth, async (req, res) => {
  try {
    const actor = await loadActorRole(req);
    if (!['developer','headAdmin','admin'].includes(actor)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    // ถ้ามีระบบเลือก tenant ตอนนี้ ดึงเพิ่มได้จาก req.user.tenant หรือ query
    const tenantId = req.user?.tenant || req.query.tenant || null;

    const items = await listAllUsers({ tenantId });
    return res.json({ ok: true, items });
  } catch (e) {
    console.error('/api/admin/users error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// ✅ set role for a user
// body: { role: 'developer'|'headAdmin'|'admin'|'user' }
app.post('/api/admin/users/:uid/role', requireFirebaseAuth, async (req, res) => {
  try {
    const actor = await loadActorRole(req);
    if (!['developer', 'headAdmin', 'admin'].includes(actor)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const { uid } = req.params;
    const { role } = req.body || {};
    if (!['developer','headAdmin','admin','user'].includes(role)) {
      return res.status(400).json({ error: 'invalid_role' });
    }

    const db = admin.firestore();
    const tenantId = getTenantFromReq(req);
    const primaryRef = usersColRef(db, tenantId).doc(uid);

    // อ่าน role ปัจจุบัน (เพื่อบังคับกติกาเดิม)
    const currentSnap = await primaryRef.get().catch(()=>null);
    const currentRole = currentSnap && currentSnap.exists
      ? (currentSnap.get('role') || (currentSnap.get('isAdmin') ? 'admin' : 'user'))
      : 'user';

    // ---- permission rules (developer > headAdmin > admin) ----
    if (actor === 'admin') {
      if (['developer','headAdmin'].includes(currentRole)) {
        return res.status(403).json({ error: 'admin_cannot_touch_higher' });
      }
      if (currentRole === 'admin' && role !== 'admin') {
        return res.status(403).json({ error: 'admin_cannot_downgrade_admin' });
      }
      if (['headAdmin','developer'].includes(role)) {
        return res.status(403).json({ error: 'admin_cannot_assign_higher' });
      }
    }
    if (actor === 'headAdmin') {
      if (currentRole === 'developer' || role === 'developer') {
        return res.status(403).json({ error: 'head_cannot_touch_developer' });
      }
      // ถ้าจะห้าม head ปรับ head อื่น เปิด guard ด้านล่าง:
      // if (currentRole === 'headAdmin' && role !== 'headAdmin') {
      //   return res.status(403).json({ error: 'head_cannot_downgrade_head' });
      // }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const isAdmin = ['admin','headAdmin','developer'].includes(role);

    // เขียนหลัก
    await primaryRef.set({ role, isAdmin, updatedAt: now }, { merge: true });

    // (ตัวเลือก) mirror ไป root เมื่อทำงานในโหมด tenant — ปิด/เปิดได้
    const MIRROR_TO_ROOT = true;
    if (tenantId && MIRROR_TO_ROOT) {
      await db.collection('users').doc(uid).set({ role, isAdmin, updatedAt: now }, { merge: true });
    }

    // sync custom claims
    const claims = {
      dev:  role === 'developer',
      head: role === 'headAdmin',
      admin: isAdmin,
    };
    await admin.auth().setCustomUserClaims(uid, claims).catch(()=>{});

    res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// ======= Delete user (dev/head/admin ตามสิทธิ์) =======
app.delete('/api/admin/users/:uid', requireFirebaseAuth, async (req, res) => {
  try {
    const actorRole = await loadActorRole(req);
    const targetUid = req.params.uid;

    if (!targetUid) return res.status(400).json({ error: 'missing_target' });
    if (targetUid === req.user.uid) {
      return res.status(400).json({ error: 'cannot_delete_self' });
    }
    if (!['developer', 'headAdmin', 'admin'].includes(actorRole)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const db = admin.firestore();
    const tenantId = getTenantFromReq(req);
    const ref = usersColRef(db, tenantId).doc(targetUid);
    const snap = await ref.get().catch(()=>null);

    const targetRole = snap && snap.exists
      ? (snap.get('role') || (snap.get('isAdmin') ? 'admin' : 'user'))
      : 'user';

    let canDelete = false;
    if (actorRole === 'developer') canDelete = true;
    else if (actorRole === 'headAdmin') canDelete = (targetRole === 'admin' || targetRole === 'user');
    else if (actorRole === 'admin') canDelete = (targetRole === 'user');

    if (!canDelete) {
      return res.status(403).json({ error: 'not_allowed_to_delete_target' });
    }

    // ลบหลัก
    await ref.delete().catch(() => {});

    // (ตัวเลือก) mirror ลบที่ root เมื่อโหมด tenant — ปรับตามต้องการ
    const MIRROR_DELETE_ON_ROOT = true;
    if (tenantId && MIRROR_DELETE_ON_ROOT) {
      await db.collection('users').doc(targetUid).delete().catch(()=>{});
    }

    // ลบใน Firebase Auth (optional)
    await admin.auth().deleteUser(targetUid).catch(() => {});

    return res.json({ ok: true });
  } catch (e) {
    console.error('delete user error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});





// ==============================
// 6.x) Live Chat (Agent APIs)
// ==============================
app.get('/api/tenants/:id/live', requireFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    // เพื่อหลีกเลี่ยง index composite บังคับ: ดึงมาก่อนแล้วค่อยกรองในแอป (limit 200)
    const snap = await tenant.ref.collection('liveSessions')
      .orderBy('lastActiveAt', 'desc')
      .limit(200)
      .get();

    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, items });
  } catch (e) {
    console.error('[live list] error', e);
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

app.get('/api/tenants/:id/live/:uid/messages', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, uid } = req.params;
    const { limit = 50 } = req.query;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const q = await liveMsgsRef(tenant.ref, uid)
      .orderBy('createdAt', 'asc')
      .limit(Number(limit) || 50)
      .get();
    const items = q.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, items });
  } catch (e) {
    console.error('[live messages] error', e);
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

app.post('/api/tenants/:id/live/:uid/send', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, uid } = req.params;
    const { text } = req.body || {};
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });
    if (!text) return res.status(400).json({ error: 'text_required' });

    await ensureOpenLiveSession(tenant.ref, uid, null);
    await appendLiveMessage(tenant.ref, uid, 'staff', text);

    const r = await callLineAPITenant(tenant.ref, '/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: uid, messages: [{ type: 'text', text: String(text).slice(0, 1000) }] })
    });
    const t = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: 'line_push_error', detail: t });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});


app.post('/api/tenants/:id/live/:uid/close', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, uid } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });
    await closeLiveSession(tenant.ref, uid);
    await appendLiveMessage(tenant.ref, uid, 'system', 'ปิดการสนทนาโดยเจ้าหน้าที่');

    const r = await callLineAPITenant(tenant.ref, '/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: uid, messages: [{ type: 'text', text: 'สิ้นสุดการสนทนาสด ขอบคุณค่ะ' }] })
    });
    const t = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: 'line_push_error', detail: t });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});





// ==============================
// 7) Cron (schedule runner)
// ==============================
app.post('/tasks/cron/broadcast', async (req, res) => {
  console.log('[cron] hit', new Date().toISOString()); // อย่าพิมพ์ key ออก log
  try {
    if (req.get('X-App-Cron-Key') !== process.env.CRON_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    // ✅ กันเคสช่องว่าง/บรรทัดใหม่ในทั้ง header และ env
    const sentKey = (req.get('X-App-Cron-Key') || '').trim();
    const envKey  = (process.env.CRON_KEY || '').trim();
    // ✅ log แค่ความยาวและผล match เพื่อ debug (ไม่เผยค่า)
    console.log('[cron] keys', { sentLen: sentKey.length, envLen: envKey.length, match: sentKey === envKey });
    if (!envKey || sentKey !== envKey) return res.status(401).json({ error: 'unauthorized' });

    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const snap = await db.collectionGroup('broadcasts')
      .where('status', '==', 'scheduled')
      .where('scheduledAt', '<=', now)
      .limit(25)
      .get();

    const jobs = snap.docs.map(async d => {
      const data = d.data();
      const tenantRef = d.ref.parent.parent;
      if (!tenantRef) return;

      // lightweight lock
      await db.runTransaction(async t => {
        const curr = await t.get(d.ref);
        if (curr.get('lock')) throw new Error('locked');
        t.update(d.ref, { lock: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }).catch(() => null);

      try {
        const secSnap = await tenantRef.collection('secret').doc('v1').get();
        const accessToken = secSnap.get('accessToken');
        if (!accessToken) throw new Error('missing_access_token');

        const resp = await callLineAPITenant(tenantRef, '/v2/bot/message/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: data.messages })
        });
        const text = await resp.text();
        
        if (!resp.ok) throw new Error(text);

        await d.ref.update({
          status: 'sent',
          lock: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        await d.ref.update({
          status: 'failed',
          error: String(e.message || e),
          lock: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    await Promise.all(jobs);
    res.json({ processed: jobs.length });
  } catch (e) {
    console.error('[cron] error', e);
    res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});


// ✅ ใหม่: เปลี่ยน default rich menu ตามช่วงเวลา (Display period)
app.post('/tasks/cron/richmenus', async (req, res) => {
  try {
    const sentKey = (req.get('X-App-Cron-Key') || '').trim();
    const envKey  = (process.env.CRON_KEY || '').trim();
    if (!envKey || sentKey !== envKey) return res.status(401).json({ error: 'unauthorized' });

    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    // ดึงเอกสาร ready ที่เริ่มแสดงแล้ว (scheduleFrom <= now) ทั้งที่มีและไม่มี scheduleTo
    const q1 = db.collectionGroup('richmenus')
      .where('status', '==', 'ready')
      .where('scheduleFrom', '<=', now)
      .where('scheduleTo', '==', null)
      .limit(100);

    const q2 = db.collectionGroup('richmenus')
      .where('status', '==', 'ready')
      .where('scheduleFrom', '<=', now)
      .where('scheduleTo', '>', now)
      .limit(100);

    const [s1, s2] = await Promise.all([q1.get(), q2.get()]);

    // group by tenant
    const byTenant = new Map(); // tenantId -> [{doc, data}]
    function pushDoc(d) {
      const tenantRef = d.ref.parent.parent;
      if (!tenantRef) return;
      const arr = byTenant.get(tenantRef.id) || [];
      arr.push({ ref: d.ref, data: d.data(), tenantRef });
      byTenant.set(tenantRef.id, arr);
    }
    s1.docs.forEach(pushDoc);
    s2.docs.forEach(pushDoc);

    // ต่อ tenant: เลือกอันที่ scheduleFrom ล่าสุด (ถ้าซ้ำช่วง)
    const results = [];
    for (const [tid, arr] of byTenant.entries()) {
      arr.sort((a, b) => {
        const af = a.data.scheduleFrom?.toMillis?.() || 0;
        const bf = b.data.scheduleFrom?.toMillis?.() || 0;
        return bf - af; // desc
      });
      const winner = arr[0]; // ตัวล่าสุด
      if (!winner) continue;

      // อ่าน access token
      const accessToken = await getTenantSecretAccessToken(winner.tenantRef);

      // อ่าน default ปัจจุบันก่อน เปลี่ยนเฉพาะเมื่อจำเป็น
      // อ่าน default ปัจจุบัน
      let currentDefault = null;
      try {
        const cur = await callLineAPITenant(winner.tenantRef, '/v2/bot/user/all/richmenu', { method: 'GET' });
        if (cur.ok) {
          const j = await cur.json();
          currentDefault = j.richMenuId || null;
        }
      } catch {}

      const want = winner.data.lineRichMenuId;
      if (!want || currentDefault === want) {
        results.push({ tenantId: tid, action: 'noop', want, currentDefault });
        continue;
      }

      // ตั้ง default
      const r = await callLineAPITenant(winner.tenantRef, '/v2/bot/user/all/richmenu/' + encodeURIComponent(want), { method: 'POST' });
      const t = await r.text();
      if (!r.ok) {
        results.push({ tenantId: tid, action: 'error', detail: t });
      } else {
        results.push({ tenantId: tid, action: 'set', to: want, prev: currentDefault });
      }
    }

    return res.json({ ok: true, tenantsProcessed: results.length, results });
  } catch (e) {
    console.error('[cron richmenus] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// [MERGE:STEP7] Task Bot Integration settings (admin only)
app.use('/api/tenants/:tid/integrations/taskbot', requireFirebaseAuth);



app.get('/api/tenants/:tid/integrations/taskbot', async (req, res) => {
  const { tid } = req.params;
  const tenant = await getTenantIfMember(tid, req.user.uid);
  if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

  const doc = await tenant.ref.collection('integrations').doc('taskbot').get();
  res.json({ ok: true, data: doc.exists ? doc.data() : null });
});

app.post('/api/tenants/:tid/integrations/taskbot', express.json(), async (req, res) => {
  const { tid } = req.params;
  const tenant = await getTenantIfMember(tid, req.user.uid);
  if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

  const { enabled, execUrl, sharedKey, appsSheetId } = req.body || {};
  const data = {
    ...(enabled     === undefined ? {} : { enabled: !!enabled }),
    ...(execUrl     === undefined ? {} : { execUrl: String(execUrl || '') }),
    ...(sharedKey   === undefined ? {} : { sharedKey: String(sharedKey || '') }),
    ...(appsSheetId === undefined ? {} : { appsSheetId: String(appsSheetId || '') }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: req.user.uid,
  };
  await tenant.ref.collection('integrations').doc('taskbot').set(data, { merge: true });
  res.json({ ok: true });
});

app.post('/api/tenants/:tid/integrations/taskbot/verify', async (req, res) => {
  const { tid } = req.params;
  const tenant = await getTenantIfMember(tid, req.user.uid);
  if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

  try {
    const r = await callAppsScriptForTenant(tenant.ref, 'verify', { ping: 'hello' });
    await tenant.ref.collection('integrations').doc('taskbot').set({
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastVerifyError: null
    }, { merge: true });
    res.json({ ok: true, result: r });
  } catch (e) {
    const msg = String(e && e.message || e);
    await tenant.ref.collection('integrations').doc('taskbot').set({
      lastVerifyError: msg
    }, { merge: true });
    res.status(400).json({ ok: false, error: msg });
  }
});

function toAbsoluteAssetUrl(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const base = (process.env.PUBLIC_APP_URL || BASE_APP_URL || '').replace(/\/$/,'');
  const path = p.startsWith('/') ? p : `/${p}`;
  return `${base}${path}`;
}




// ==== [ATTENDANCE] Rich Menu Helpers ====

// ⬇️ วาง helper นี้ต่อจาก lineAPI
async function deleteRichMenuSafe(tenantRef, richMenuId) {
  if (!richMenuId) return;

  // 1) เคลียร์ default OA
  try {
    await callLineAPITenant(tenantRef, '/v2/bot/user/all/richmenu', { method: 'DELETE' });
  } catch (e) {
    console.warn('[richmenu/delete] clear default failed:', e?.status || e?.message || e);
  }

  // 2) ลบ rich menu
  try {
    await callLineAPITenant(
      tenantRef,
      `/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`,
      { method: 'DELETE' }
    );
    console.log('[richmenu/delete] deleted', richMenuId);
  } catch (e) {
    console.warn('[richmenu/delete] delete failed (continue anyway):', e?.status || e?.message || e);
  }
}

// ปิดการใช้งาน Attendance Rich Menus แบบรวมศูนย์
async function disableAttendanceRichMenus(tenantRef, {
  unlinkUserIds = [],     // รายชื่อ userId ที่อยากถอดเมนูออก (เช่น เคย repair-link ไว้)
  deleteMenus = false     // ลบเมนูทิ้งจาก OA เลยไหม (ค่าเริ่มต้น: ไม่ลบ แค่ถอด)
} = {}) {
  // 1) ดึง accessToken
  const accessToken = await getTenantSecretAccessToken(tenantRef);

  // 2) เคลียร์ default rich menu ของ OA ทั้งหมด
  try { await callLineAPITenant(tenantRef, '/v2/bot/user/all/richmenu', { method: 'DELETE' }); }
  catch (e) { console.warn('[ATTEND/DISABLE] clear default failed', e?.status || e?.message || e); }

  // 3) ถอดของผู้ใช้ที่ระบุ (ถ้ามี)
  if (Array.isArray(unlinkUserIds) && unlinkUserIds.length) {
    for (const uid of unlinkUserIds) {
      try {
        await unlinkRichMenuFromUserByToken(accessToken, uid);
        await new Promise(r => setTimeout(r, 60)); // กัน rate limit
      } catch (e) {
        console.warn('[ATTEND/DISABLE] unlink user failed', uid, e?.status || e?.message || e);
      }
    }
  }

  // 4) ถ้าต้องการลบทิ้งจริง ๆ → ลบเมนู ADMIN_TA / USER_TA (ถ้ามีเก็บไว้)
  if (deleteMenus) {
    const kinds = ['ADMIN_TA', 'USER_TA', 'ATTEND_MAIN_ADMIN', 'ATTEND_MAIN_USER'];
    for (const k of kinds) {
      try {
        const snap = await tenantRef.collection('richmenus').doc(k).get();
        const id = snap.exists ? (snap.get('lineId') || snap.get('richMenuId') || snap.get('lineRichMenuId')) : '';
        if (id) await deleteRichMenuSafe(tenantRef, id);
      } catch (e) {
        console.warn('[ATTEND/DISABLE] delete menu failed', k, e?.status || e?.message || e);
      }
    }
  }

  // 5) อัปเดตสถานะ integration เป็นปิด
  await tenantRef.collection('integrations').doc('attendance').set({
    enabled: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('[ATTEND/DISABLE] done', { unlink: unlinkUserIds.length, deleteMenus });
}





// ========== Time Attendance: Preset Areas (2x2) ==========
// ขนาด large = 2500×1686 → แบ่ง 2 คอลัมน์ × 2 แถว

// ===== [PATCH] Rich Menu areas ตรงกับภาพ 2500x1686 (ปุ่มอยู่ฝั่งขวา) =====
// ===== Rich Menu areas สำหรับภาพ 2500x1686 (ปุ่มอยู่ฝั่งขวา) =====
const CANVAS_W = 2500;
const CANVAS_H = 1686;
const LEFT_BANNER_W = 900;   // พื้นที่รูปคนด้านซ้าย
const G_X = 40;              // ระยะห่างแนวนอน
const G_Y = 60;              // ระยะห่างแนวตั้ง

// คำนวณตำแหน่งช่อง 2x2 ฝั่งขวา
const RIGHT_W = CANVAS_W - LEFT_BANNER_W;              // 1600
const TILE_W  = Math.floor((RIGHT_W - (3 * G_X)) / 2); // 740
const TILE_H  = Math.floor((CANVAS_H - (3 * G_Y)) / 2);// 753
const X1 = LEFT_BANNER_W + G_X;                        // 940
const X2 = X1 + TILE_W + G_X;                          // 1720
const Y1 = G_Y;                                        // 60
const Y2 = Y1 + TILE_H + G_Y;                          // 873

const area = (x, y, w, h, action) => ({ bounds: { x, y, width: w, height: h }, action });

// ✅ SHARED TA PRESETS (Thai, right-half only)
const ATTEND_ADMIN_AREAS_TH = [
  area(X1, Y1, TILE_W, TILE_H, { type: 'message', text: 'บันทึกการทำงาน' }),
  area(X2, Y1, TILE_W, TILE_H, { type: 'message', text: 'ทำเงินเดือน' }),
  area(X1, Y2, TILE_W, TILE_H, { type: 'message', text: 'รายงาน' }),
  area(X2, Y2, TILE_W, TILE_H, { type: 'message', text: 'ตั้งค่า' }),
];
const ATTEND_USER_AREAS_TH = [
  area(X1, Y1, TILE_W, TILE_H, { type: 'message', text: 'ลงเวลา' }),
  area(X2, Y1, TILE_W, TILE_H, { type: 'message', text: 'ออกงาน' }),
  area(X1, Y2, TILE_W, TILE_H, { type: 'message', text: 'ลางาน' }),
  area(X2, Y2, TILE_W, TILE_H, { type: 'message', text: 'ลงทะเบียนเข้าใช้งาน' }),
];

// รูป preset (เสิร์ฟจาก /public/static)
const ATTEND_ADMIN_IMG = `${BASE_APP_URL}/static/hr_menu_admin.png`;
const ATTEND_USER_IMG  = `${BASE_APP_URL}/static/ta_menu_user.png`;


// // ช่วยเลือกว่าบทบาทไหนจัดเป็น admin-like
// function isAdminLikeRole(role) {
//   const r = String(role || '').toLowerCase();
//   return ['developer','admin','supervisor'].includes(r);
// }

// async function ensureAttendanceRichMenu(tenantRef, kind /* 'ADMIN_TA' | 'USER_TA' | 'ATTEND_MAIN_ADMIN' | 'ATTEND_MAIN_USER' */) {
//   const ref  = tenantRef.collection('richmenus').doc(kind);
//   const snap = await ref.get();
//   const data = snap.exists ? (snap.data() || {}) : {};

//   // รองรับชื่อเก่า/ใหม่ แต่ใช้ preset ไทยชุดเดียวกัน
//   const adminLike = (kind === 'ADMIN_TA' || kind === 'ATTEND_MAIN_ADMIN');
//   const title     = adminLike ? 'ATTEND_MAIN_ADMIN' : 'ATTEND_MAIN_USER';
//   const imageUrl  = adminLike ? ATTEND_ADMIN_IMG : ATTEND_USER_IMG;
//   const areasPx   = adminLike ? ATTEND_ADMIN_AREAS_TH : ATTEND_USER_AREAS_TH;

//   if (data.lineRichMenuId && data.imageUrl && Array.isArray(data.areas) && data.areas.length) {
//     return data.lineRichMenuId;
//   }

//   const accessToken = await getTenantSecretAccessToken(tenantRef);
//   const { richMenuId } = await createAndUploadRichMenuOnLINE({
//     accessToken,
//     title,
//     chatBarText: 'เมนู',
//     size: 'large',
//     areasPx,
//     imageUrl: toAbsoluteAssetUrl(imageUrl),
//   });

//   await ref.set({
//     kind,
//     title,
//     size: 'large',
//     chatBarText: 'เมนู',
//     imageUrl,
//     areas: areasPx,
//     lineRichMenuId: richMenuId,
//     status: 'ready',
//     updatedAt: new Date(),
//   }, { merge: true });

//   return richMenuId;
// }




// ==== Time Attendance Integration settings (admin only) ====
app.use('/api/tenants/:tid/integrations/attendance', requireFirebaseAuth);

// GET settings
app.get('/api/tenants/:tid/integrations/attendance', async (req, res) => {
  try {
    const { tid } = req.params;
    const tenant = await getTenantIfMember(tid, req.user.uid);
    if (!tenant) return res.status(403).json({ ok:false, error:'not_member_of_tenant' });

    const snap = await tenant.ref.collection('integrations').doc('attendance').get();
    return res.json({ ok:true, data: snap.exists ? snap.data() : {} });
  } catch (e) {
    console.error('[attendance:get]', e);
    return res.status(500).json({ ok:false, error:'server_error' });
  }
});

// POST save settings
app.post('/api/tenants/:tid/integrations/attendance', express.json(), async (req, res) => {
  try {
    const { tid } = req.params;
    const tenant = await getTenantIfMember(tid, req.user.uid);
    if (!tenant) return res.status(403).json({ ok:false, error:'not_member_of_tenant' });

    const allowed = [
      'enabled','appsSheetId','standardStart','workHoursPerDay',
      'latePolicyJson','geoRadiusM','liffId','notifyBeforeHours',
      'adminMenuImageUrl','userMenuImageUrl','autoApplyRichMenu'
    ];
    const data = {};
    for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
    
    // ถ้า user เซ็ต enabled=true แต่ยังไม่มี sheet → ปัดตกตั้งแต่ save (กันพลาด)
    if (data.enabled === true) {
      const appsSheetId = String(data.appsSheetId || '').trim();
      if (!appsSheetId) {
        return res.status(400).json({ ok:false, error:'appsSheetId_required_before_enable' });
      }
    }
    await tenant.ref.collection('integrations').doc('attendance').set({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid,
    }, { merge: true });
    
    // ❌ ไม่ auto-apply ที่นี่อีกต่อไป — ให้ไปกด /enable เท่านั้น
    // เหตุผล: ลดโอกาสชน rid เก่า/รูปไม่ครบ แล้วเด้ง 404
    return res.json({ ok:true });
  } catch (e) {
    console.error('[attendance:post]', e);
    return res.status(500).json({ ok:false, error:'server_error' });
  }
});


app.get('/debug/attendance/richmenus/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tRef = db.collection('tenants').doc(tenantId);
    const accessToken = await getTenantSecretAccessToken(tRef);

    const adminSnap = await tRef.collection('richmenus').doc('ATTEND_MAIN_ADMIN').get();
    const userSnap  = await tRef.collection('richmenus').doc('ATTEND_MAIN_USER').get();
    const adminId = (adminSnap.data()||{}).lineRichMenuId || (adminSnap.data()||{}).richMenuId || '';
    const userId  = (userSnap.data()||{}).lineRichMenuId  || (userSnap.data()||{}).richMenuId  || '';

    const list = await listRichMenus(accessToken).catch(()=>[]);
    const byId = Object.fromEntries(list.map(x => [x.richMenuId, { name:x.name, areas:(x.areas||[]).length }]));

    res.json({
      ok:true,
      firestore:{ adminId, userId, same: adminId === userId },
      line:{
        admin: { id: adminId, ...byId[adminId] },
        user:  { id: userId,  ...byId[userId]  }
      }
    });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
});


// ===== expose LIFF ID to client (fallback) =====
app.get('/__boot/liff-id.js', (_req, res) => {
  res.type('js').send(
    `window.DEFAULT_LIFF_ID = ${JSON.stringify(process.env.LIFF_TA_CLOCK_ID || '')};`
  );
});







// [MERGE:STEP8] Tasks API (Firestore)
app.use('/api/tenants/:tid/tasks', requireFirebaseAuth);

// list
app.get('/api/tenants/:tid/tasks', async (req, res) => {
  const { tid } = req.params;
  const tenant = await getTenantIfMember(tid, req.user.uid);
  if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

  const limit = Math.min(Number(req.query.limit || 50), 200);
  const snap = await tenant.ref.collection('tasks').orderBy('createdAt', 'desc').limit(limit).get();
  res.json({ ok: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
});

// create
app.post('/api/tenants/:tid/tasks', express.json(), async (req, res) => {
  const { tid } = req.params;
  const tenant = await getTenantIfMember(tid, req.user.uid);
  if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

  const { text, assignees = [], status = 'OPEN', dueAt = null, urgency = 'NORMAL', notes = '' } = req.body || {};
  if (!text) return res.status(400).json({ ok: false, error: 'missing_text' });

  const now = admin.firestore.FieldValue.serverTimestamp();
  const doc = {
    text: String(text),
    assignees, // [{ userId, name }]
    status, urgency,
    dueAt: dueAt ? admin.firestore.Timestamp.fromDate(new Date(dueAt)) : null,
    notes,
    creator: { uid: req.user.uid, name: req.user.name || req.user.displayName || '' },
    createdAt: now,
    updatedAt: now,
  };
  const ref = await tenant.ref.collection('tasks').add(doc);
  res.json({ ok: true, id: ref.id });
});

// patch
app.patch('/api/tenants/:tid/tasks/:id', express.json(), async (req, res) => {
  const { tid, id } = req.params;
  const tenant = await getTenantIfMember(tid, req.user.uid);
  if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

  const patch = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  await tenant.ref.collection('tasks').doc(id).set(patch, { merge: true });
  res.json({ ok: true });
});

// [MERGE:STEP8] helpers used by handleLineEvent (list + flex)
async function listTasksForUser(tenantRef, userId, { limit = 10 } = {}) {
  // ถ้าเก็บเป็น array of userId แท้ๆ ให้เปลี่ยนเป็น .where('assigneeIds','array-contains', userId)
  const snap = await tenantRef.collection('tasks')
    .orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => Array.isArray(x.assignees) && x.assignees.some(a => a.userId === userId));
}

async function listTasksForTenant(tenantRef, { limit = 10 } = {}) {
  const snap = await tenantRef.collection('tasks').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function buildTasksFlex(title, tasks) {
  const items = tasks.slice(0, 10).map(t => ({
    type: 'box', layout: 'baseline', contents: [
      { type: 'text', text: t.urgency === 'URGENT' ? '‼️' : '•', flex: 1, size: 'sm' },
      { type: 'text', text: t.text || '-', flex: 8, size: 'sm', wrap: true },
      { type: 'text', text: t.dueAt ? (t.dueAt.toDate ? t.dueAt.toDate() : new Date(t.dueAt)).toLocaleDateString('th-TH') : '', flex: 3, size: 'xs', align: 'end' }
    ]
  }));
  return {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
      { type: 'text', text: title, weight: 'bold', size: 'md' },
      ...items
    ]}
  };
}




// [STEP9:ROUTES] — Rich Menu apply/switch สำหรับ Task Bot
app.use('/api/tenants/:tid/richmenu', requireFirebaseAuth);

// สร้างและตั้งค่าเมนู "ลงทะเบียนแล้ว"
app.post('/api/tenants/:tid/richmenu/apply-main', requireFirebaseAuth, async (req, res) => {
  try {
    const { tid } = req.params;
    const tenant = await getTenantOrThrow(tid, req.user);
    const tenantRef = tenant.ref;
    const accessToken = await getTenantSecretAccessToken(tenantRef);

    const tpl = await loadRichMenuTemplate('main'); // <-- ใช้ไฟล์เก่า
    const areasPx = toAreasPxFromTemplate(tpl);
    if (!areasPx.length) throw new Error('template_has_no_areas');

    const imageUrl = process.env.TASKMENU_MAIN_IMAGE
      || `${BASE_APP_URL}/static/Rich_menu_for_registered.png`;

    const { richMenuId } = await createAndUploadRichMenuOnLINE({
      accessToken,
      title: tpl.name || 'MAIN',
      chatBarText: tpl.chatBarText || 'Menu',
      size: (tpl.size?.height === 843 ? 'small' : 'large'),
      areasPx,
      imageUrl
    });

    await tenantRef.collection('richmenus').doc('MAIN').set({
      lineRichMenuId: richMenuId,
      template: 'main',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({ ok: true, richMenuId });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});



// สร้างและตั้งค่าเมนู "ยังไม่ลงทะเบียน"
app.post('/api/tenants/:tid/richmenu/apply-prereg', requireFirebaseAuth, async (req, res) => {
  try {
    const { tid } = req.params;
    const tenant = await getTenantOrThrow(tid, req.user);
    const tenantRef = tenant.ref;
    const accessToken = await getTenantSecretAccessToken(tenantRef);

    const tpl = await loadRichMenuTemplate('prereg'); // <-- ใช้ไฟล์เก่า
    const areasPx = toAreasPxFromTemplate(tpl);
    if (!areasPx.length) throw new Error('template_has_no_areas');

    const imageUrl = process.env.TASKMENU_PREREG_IMAGE
      || `${BASE_APP_URL}/static/Menu_for_non_register.png`;

    const { richMenuId } = await createAndUploadRichMenuOnLINE({
      accessToken,
      title: tpl.name || 'PREREG',
      chatBarText: tpl.chatBarText || 'เมนู',
      size: (tpl.size?.height === 843 ? 'small' : 'large'),
      areasPx,
      imageUrl
    });

    await tenantRef.collection('richmenus').doc('PREREG').set({
      lineRichMenuId: richMenuId,
      template: 'prereg',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({ ok: true, richMenuId });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});



// สลับ default ระหว่าง MAIN/PREREG
app.post('/api/tenants/:tid/richmenu/switch', async (req, res) => {
  try {
    const { tid } = req.params;
    const kind = String(req.query.type || req.body?.type || '').toUpperCase(); // 'MAIN' | 'PREREG'
    if (!['MAIN','PREREG'].includes(kind)) return res.status(400).json({ ok:false, error:'type_required' });

    const tenant = await getTenantIfMember(tid, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const saved = await getSavedRichMenuByKind(tenant.ref, kind);
    if (!saved?.lineRichMenuId) return res.status(404).json({ ok:false, error:`no_${kind}_richmenu_saved` });

    const token = await getTenantSecretAccessToken(tenant.ref);
    // ตั้ง default rich menu
    await callLineAPITenant(tenant.ref, '/v2/bot/user/all/richmenu/' + encodeURIComponent(saved.lineRichMenuId), {
      method: 'POST'
    });

    return res.json({ ok:true, richMenuId: saved.lineRichMenuId });
  } catch (e) {
    console.error('[switch] err', e?.message || e);
    return res.status(400).json({ ok:false, error: String(e?.message || e) });
  }
});

// ===== TaskBot settings APIs =====
// (สมมติคุณมี middleware requireAuth, getTenantOrThrow อยู่แล้ว)
app.get('/api/tenants/:tid/taskbot/settings', requireFirebaseAuth, async (req, res) => {

  try {
    const tenantRef = await getTenantOrThrow(req.params.tid);
    const data = await getTaskbotSettings(tenantRef);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.patch('/api/tenants/:tid/taskbot/settings', requireAuth, async (req, res) => {
  try {
    const tenantRef = await getTenantOrThrow(req.params.tid);
    const allow = await assertUserCanManageTenant(req.user, tenantRef); // ถ้ามีฟังก์ชันเช็คสิทธิ์อยู่แล้ว
    if (!allow) return res.status(403).json({ ok: false, error: 'forbidden' });

    const { enabled, appsScriptUrl, appsScriptKey } = req.body || {};
    const patch = {};
    if (typeof enabled === 'boolean') patch.enabled = enabled;
    if (typeof appsScriptUrl === 'string') patch.appsScriptUrl = appsScriptUrl.trim();
    if (typeof appsScriptKey === 'string') patch.appsScriptKey = appsScriptKey.trim();

    await saveTaskbotSettings(tenantRef, patch);
    const data = await getTaskbotSettings(tenantRef);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/tenants/:tid/taskbot/verify', requireAuthFirebase, async (req, res) => {
  try {
    const tenantRef = await getTenantOrThrow(req.params.tid);
    const out = await callAppsScriptForTenant(tenantRef, 'ping', { ping: Date.now() });
    res.json({ ok: true, out });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
});

// ตรวจ Channel access token ของ OA (ต่อ tenant)
app.get('/api/tenants/:tid/line/selfcheck', requireFirebaseAuth, async (req, res) => {
  try {
    const tenant = await getTenantOrThrow(req.params.tid, req.user);
    const token = await getTenantSecretAccessToken(tenant.ref);   // อ่านจาก tenants/<tid>/secret/v1
    if (!token) return res.status(400).json({ ok:false, error:'no_access_token' });

    const r = await fetchFn('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const j = await r.json().catch(()=> ({}));
    res.status(200).json({ ok: r.ok, status: r.status, body: j });
  } catch (e) {
    res.status(400).json({ ok:false, error:String(e.message || e) });
  }
});


// ====== อยู่ไฟล์เดียวกับ /auth/magic ที่ทำไปก่อนหน้า ======
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const APPS_SCRIPT_EXEC_URL = process.env.APPS_SCRIPT_EXEC_URL;
const APPS_SCRIPT_SHARED_KEY = process.env.APPS_SCRIPT_SHARED_KEY;

async function callAppsScript(tenant, action, payload={}) {
  const body = {
    action,
    tenant,
    shared_key: APPS_SCRIPT_SHARED_KEY,
    ...payload
  };
  const res = await fetch(APPS_SCRIPT_EXEC_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  const ct = res.headers.get('content-type')||'';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    console.error('GAS_ERR', data);
    throw new Error(typeof data === 'string' ? data : (data.error || 'APPS_SCRIPT'));
  }
  return data;
}

// ========== Users ==========
app.get('/api/users', requireRole(['developer','admin','supervisor']), async (req,res)=>{
  try {
    const tenantRef = admin.firestore().collection('tenants').doc(req.user.tenant);
    const out = await callAppsScriptForTenant(tenantRef, 'list_users', {});
    res.json({ ok:true, users: out.users || [] });
  } catch (e) { res.status(500).json({ ok:false, error:String(e.message||e) }); }
});

app.patch('/api/users/:id', requireRole(['developer','admin','supervisor']), express.json(), async (req,res)=>{
  const { id } = req.params;
  const { username, real_name } = req.body || {};
  try {
    const tenantRef = admin.firestore().collection('tenants').doc(req.user.tenant);
    await callAppsScriptForTenant(tenantRef, 'update_user', { user_id: id, username, real_name });

    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, error:String(e.message||e) }); }
});

app.patch('/api/users/:id/role', requireRole(['developer','admin','supervisor']), express.json(), async (req,res)=>{
  const { id } = req.params;
  const { role } = req.body || {};
  try {
    const tenantRef = admin.firestore().collection('tenants').doc(req.user.tenant);
    await callAppsScriptForTenant(tenantRef, 'update_user', { user_id: id, role });

    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, error:String(e.message||e) }); }
});

app.patch('/api/users/:id/status', requireRole(['developer','admin','supervisor']), express.json(), async (req,res)=>{
  const { id } = req.params;
  const { status } = req.body || {};
  try {
    const tenantRef = admin.firestore().collection('tenants').doc(req.user.tenant);
    await callAppsScriptForTenant(tenantRef, 'update_user', { user_id: id, status });

    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, error:String(e.message||e) }); }
});

// รูปโปรไฟล์ในตาราง (optional: ใส่รูปจริงของ LINE)
// ตอนแรกส่ง transparent gif ไปก่อน
const blankGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
app.get('/api/profile/:uid/photo', requireAuth, (req,res)=> {
  res.setHeader('Content-Type','image/gif');
  res.end(blankGif);
});

// ========== Tasks ==========
app.get('/api/tasks', requireRole(['developer','admin','supervisor']), async (req,res)=>{
  const { assigner_id, assignee_id, assignee_name, status, from, to } = req.query;
  try{
    const tenantRef = admin.firestore().collection('tenants').doc(req.user.tenant);
    const out = await callAppsScriptForTenant(tenantRef, 'list_tasks', {
      assigner_id, assignee_id, assignee_name, status, from, to
    });
    res.json({ ok:true, tasks: out.tasks || [] });
  }catch(e){ res.status(500).json({ ok:false, error:String(e.message||e) }); }
});

app.patch('/api/tasks/:taskId/status', requireRole(['developer','admin','supervisor']), express.json(), async (req,res)=>{
  const { taskId } = req.params;
  const { status } = req.body || {};
  try{
    const tenantRef = admin.firestore().collection('tenants').doc(req.user.tenant);
    await callAppsScriptForTenant(tenantRef, 'update_task_status', { task_id: taskId, status });

    res.json({ ok:true });
  }catch(e){ res.status(500).json({ ok:false, error:String(e.message||e) }); }
});

app.get('/api/tasks/export', requireRole(['developer','admin','supervisor']), async (req,res)=>{
  const qs = Object.fromEntries(Object.entries(req.query).filter(([_,v])=>v!=null && v!==''));
  try{
    const tenantRef = admin.firestore().collection('tenants').doc(req.user.tenant);
    const out = await callAppsScriptForTenant(tenantRef, 'list_tasks', qs);

    const rows = out.tasks || [];
    const headers = ['task_id','assignee_name','assigner_name','task_detail','status','deadline','note','updated_date'];
    const toCsv = (v) => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const csv = '\uFEFF' + [headers.join(',')].concat(
      rows.map(r => headers.map(h => toCsv(r[h])).join(','))
    ).join('\r\n');

    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="tasks.csv"');
    res.end(csv);
  }catch(e){ res.status(500).json({ ok:false, error:String(e.message||e) }); }
});

// ========== Onboarding ==========
app.post('/api/onboarding', requireAuth, express.json(), async (req,res)=>{
  const { username, real_name, role } = req.body || {};
  try{
    const tenantRef = admin.firestore().collection('tenants').doc(req.user.tenant);
    await callAppsScriptForTenant(tenantRef, 'upsert_user', {
      user_id: req.user.uid,
      username, real_name, role
    });
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ ok:false, error:String(e.message||e) }); }
});



// ==============================
// 8) Health/Admin
// ==============================
// Healthcheck endpoint
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    version: process.env.npm_package_version || 'dev',
    env: {
      PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || null,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || null,
    },
    timestamp: Date.now()
  });
});

app.get('/admin-check', (_req, res) => {
  try {
    const pid = admin.app().options.projectId;
    res.json({ ok: true, projectId: pid });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Manual trigger สำหรับทดสอบ (ต้องเป็นสมาชิก tenant)
app.post('/api/tenants/:id/integrations/taskbot/run-daily-reminder',
  requireFirebaseAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const tenant = await getTenantIfMember(id, req.user.uid);
      if (!tenant) return res.status(403).json({ ok:false, error:'not_member_of_tenant' });

      await runDailyReminderForTenant(tenant.ref);
      return res.json({ ok:true });
    } catch (e) {
      console.error('[REMINDER/manual] error:', e?.message || e);
      return res.status(500).json({ ok:false, error:'server_error', detail:String(e?.message || e) });
    }
  }
);




// ==============================
// 9) Static (React build)
// ==============================

app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// ==== REQ LOGGER (ชั่วคราว) ====
app.use((req, _res, next) => {
  console.log('[REQ]', req.method, req.path);
  next();
});


// ==== SPA fallback (วางท้ายไฟล์ ก่อน app.listen) ====
// ---- เลือก index จาก build ถ้ามี ไม่งั้น fallback public ----
function getIndexHtmlPath() {
  const fromBuild = path.join(BUILD_DIR, 'index.html');
  if (fs.existsSync(fromBuild)) return fromBuild;
  return path.join(PUBLIC_DIR, 'index.html');
}

// ---- Root ให้ส่ง index.html จาก build ----
app.get('/', (_req, res) => {
  res.sendFile(getIndexHtmlPath());
});

// ---- SPA fallback: ยกเว้นกลุ่ม API/Auth/Webhook/Static/Manifest ----
app.get(/^\/(?!api\/|auth\/|webhook\/|static\/|manifest\.json$).*/, (_req, res) => {
  res.sendFile(getIndexHtmlPath());
});

app.get('/api/debug/whoami', (req, res) => {
  res.json({
    ok: true,
    user: req.user || null,
    cookies: Object.keys(req.cookies || {}),
  });
});


// ซ่อมลิงก์เมนูเข้างานให้ผู้ใช้ทดสอบ
app.post('/debug/attendance/repair-link', async (req, res) => {
  try {
    const tenantRef = await requireTenantFromReq(req); // ถ้าคุณมีวิธีหา tenant จาก req
    const accessToken = await getTenantSecretAccessToken(tenantRef);

    const { userId, kind } = req.body || {}; // kind: 'ATTEND_MAIN_ADMIN' | 'ATTEND_MAIN_USER'
    if (!userId || !kind) return res.status(400).json({ error: 'missing userId or kind' });

    // 1) ดึง id เมนูเป้าหมาย
    const doc = await tenantRef.collection('richmenus').doc(kind).get();
    const targetId = doc.exists ? (doc.data().lineId || doc.data().richMenuId) : '';
    if (!targetId) return res.status(404).json({ error: `no richmenu id for kind ${kind}` });

    // 2) Log สถานะปัจจุบัน
    const def = await getDefaultRichMenuIdByToken(accessToken);
    const cur = await getUserRichMenuIdByToken(accessToken, userId);
    // ...
    await unsetDefaultRichMenuByToken(accessToken);
    await unlinkRichMenuFromUserByToken(accessToken, userId);
    // ...
    await linkRichMenuToUserByToken(accessToken, userId, targetId);
    const after = await getUserRichMenuIdByToken(accessToken, userId);

    return res.json({ ok: true, linked: after, targetId });
  } catch (e) {
    console.error('[REPAIR] error', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});



// ==== DIAG: บอกชื่อไฟล์ main.js และลิงก์ทดสอบเปิดตรง ====
app.get('/__diag/asset', (_req, res) => {
  try {
    const mf = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'asset-manifest.json'),'utf8'));
    const mainJs = (mf.files && mf.files['main.js']) || null;  // e.g. /static/js/main.c360083c.js
    res.json({ mainJs, hint: mainJs ? `ลองเปิด ${mainJs}` : 'no main.js in manifest' });
  } catch (e) {
    res.status(500).json({ error: 'cannot read asset-manifest.json', msg: String(e && e.message || e) });
  }
});



// ==============================
// 10) Start
// ==============================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`BASE_APP_URL: ${BASE_APP_URL}`);
  console.log(`LINE redirect_uri: ${REDIRECT_URI}`);
});

// === Schedule: 17:30 จันทร์-ศุกร์ ตามเวลา Asia/Bangkok ===
cron.schedule('30 17 * * 1-5', () => {
  console.log('[REMINDER] cron tick 17:30 Asia/Bangkok');
  runDailyRemindersAllTenants();
}, { timezone: DAILY_TZ });

console.log('[REMINDER] scheduled at 17:30 Mon-Fri (Asia/Bangkok)');

