// server.js
// ==============================
// 0) Config & Imports
// ==============================
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const crypto = require('crypto'); 

// Node 18+ has global fetch; fallback to node-fetch for older envs
const fetchFn = (...args) =>
  (global.fetch ? global.fetch(...args) : import('node-fetch').then(({ default: f }) => f(...args)));

const app = express();
const PORT = process.env.PORT || 3000;

// Build base/callback URLs once, then reuse everywhere
const BASE_APP_URL = ((process.env.PUBLIC_APP_URL || `http://localhost:${PORT}`) + '')
  .trim()
  .replace(/\/$/, '');
const REDIRECT_URI = ((process.env.LINE_LOGIN_CALLBACK_URL || `${BASE_APP_URL}/auth/line/callback`) + '').trim();

// เปิด log ดีบักได้ตามต้องการ
const DEBUG_WEBHOOK = process.env.DEBUG_WEBHOOK === '1';

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


// ==============================
// 2) Middleware
// ==============================
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf; } // เก็บ raw body
}));
app.use(cookieParser());

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


// ==============================
// 3) Helpers
// ==============================
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

async function findQnaSetByKeyViaDefault(tenantRef, accessToken, key) {
  try {
    const cur = await fetchFn('https://api.line.me/v2/bot/user/all/richmenu', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!cur.ok) return null;
    const { richMenuId } = await cur.json();
    if (!richMenuId) return null;

    const snap = await tenantRef.collection('richmenus')
      .where('lineRichMenuId', '==', richMenuId).limit(1).get();
    if (snap.empty) return null;

    return extractQnaFromDoc(snap.docs[0].data() || {}, key);
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

async function createAndUploadRichMenuOnLINE({ accessToken, title, chatBarText, size, areasPx, imageUrl }) {
  const WIDTH = 2500;
  const HEIGHT = size === 'compact' ? 843 : 1686;

  // 1) Create rich menu
  const createBody = {
    size: { width: WIDTH, height: HEIGHT },
    selected: false,
    name: String(title || 'RichMenu').slice(0, 300),
    chatBarText: String(chatBarText || 'Menu').slice(0, 14),
    areas: areasPx,
  };

  const createResp = await fetchFn('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  });
  const createText = await createResp.text();
  if (!createResp.ok) throw new Error(`LINE create error: ${createText}`);
  const { richMenuId } = JSON.parse(createText) || {};
  if (!richMenuId) throw new Error('LINE create returned no richMenuId');

  // 2) Download image (force bytes) and upload to LINE
  const downloadUrl = withAltMedia(imageUrl);
  const imgResp = await fetchFn(downloadUrl);
  if (!imgResp.ok) throw new Error(`image fetch failed: ${await imgResp.text().catch(()=> '') || imgResp.statusText}`);

  let imgType = imgResp.headers.get('content-type') || '';
  let imgBuf = Buffer.from(await imgResp.arrayBuffer());
  if (!/^image\/(png|jpeg)$/i.test(imgType)) {
    if (imgBuf[0] === 0x89 && imgBuf[1] === 0x50) imgType = 'image/png';
    else if (imgBuf[0] === 0xff && imgBuf[1] === 0xd8) imgType = 'image/jpeg';
    else imgType = 'image/jpeg';
  }

  const upResp = await fetchFn(`https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': imgType },
    body: imgBuf,
  });
  const upText = await upResp.text();
  if (!upResp.ok) {
    // best effort cleanup
    await fetchFn(`https://api.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(()=>{});
    throw new Error(`LINE upload error: ${upText}`);
  }

  return { richMenuId };
}

async function uploadImageToLINE({ accessToken, richMenuId, imageUrl }) {
  const downloadUrl = withAltMedia(imageUrl);
  const imgResp = await fetchFn(downloadUrl);
  if (!imgResp.ok) {
    const txt = await imgResp.text().catch(()=> '');
    throw new Error(`image fetch failed: ${txt || imgResp.statusText}`);
  }
  let imgType = imgResp.headers.get('content-type') || '';
  const buf = Buffer.from(await imgResp.arrayBuffer());
  if (!/^image\/(png|jpeg)$/i.test(imgType)) {
    if (buf[0] === 0x89 && buf[1] === 0x50) imgType = 'image/png';
    else if (buf[0] === 0xff && buf[1] === 0xd8) imgType = 'image/jpeg';
    else imgType = 'image/jpeg';
  }
  const r = await fetchFn(`https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': imgType },
    body: buf,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`LINE upload error: ${t}`);
}


// ---------- Live Chat helpers ----------
function liveSessRef(tenantRef, userId) {
  return tenantRef.collection('liveSessions').doc(userId);
}
function liveMsgsRef(tenantRef, userId) {
  return liveSessRef(tenantRef, userId).collection('messages');
}

async function getLineProfile(accessToken, userId) {
  try {
    const r = await fetchFn('https://api.line.me/v2/bot/profile/' + encodeURIComponent(userId), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!r.ok) return null;
    return await r.json(); // {userId, displayName, pictureUrl, statusMessage?}
  } catch { return null; }
}

async function ensureOpenLiveSession(tenantRef, userId, accessToken) {
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

  const state = Buffer.from(
    JSON.stringify({
      n: Math.random().toString(36).slice(2), // anti-CSRF noise
      next,
      // ⬇️ new: เก็บ to ลง state ด้วย
      to,
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
      return res.status(400).json({ error: msgErr, detail: msgErr === 'too_many_messages' ? 'LINE จำกัดครั้งละไม่เกิน 5 messages' : undefined });
    }

    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });
    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    const userSnap = await admin.firestore().doc(`users/${uid}`).get();
    const to = userSnap.get('line.userId');
    if (!to) return res.status(400).json({ error: 'user_has_no_line_id' });

    const resp = await fetchFn('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error('[broadcast test] LINE error', resp.status, text);
      return res.status(resp.status).json({ error: 'line_error', detail: text });
    }

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
      return res.status(400).json({ error: msgErr, detail: msgErr === 'too_many_messages' ? 'LINE จำกัดครั้งละไม่เกิน 5 messages' : undefined });
    }
    if (sendType !== 'now') {
      return res.status(400).json({ error: 'schedule_not_supported_here' });
    }

    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    const resp = await fetchFn('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
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

    const linkResp = await fetchFn(
      `https://api.line.me/v2/bot/user/${encodeURIComponent(to)}/richmenu/${encodeURIComponent(richMenuId)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
    );
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

    const r = await fetchFn(
      'https://api.line.me/v2/bot/user/all/richmenu/' + encodeURIComponent(richMenuId),
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
    );
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
      // ถ้าเป็น default ปัจจุบันให้พยายาม unset ก่อน (best-effort)
      try {
        const cur = await fetchFn('https://api.line.me/v2/bot/user/all/richmenu', { headers: { Authorization: `Bearer ${accessToken}` } });
        if (cur.ok) {
          const j = await cur.json();
          if (j.richMenuId === rmId) {
            await fetchFn('https://api.line.me/v2/bot/user/all/richmenu', { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }).catch(()=>{});
          }
        }
      } catch {}

      await fetchFn('https://api.line.me/v2/bot/richmenu/' + encodeURIComponent(rmId), {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
      }).catch(()=>{}); // เผื่อถูกลบไปแล้ว
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

app.post('/webhook/line', async (req, res) => {
  try {
    const { destination, events = [] } = req.body || {};
    if (!destination) return res.status(200).send('ok'); // ping/verify

    // ปกติหาโดย botUserId ตามสเปค LINE
    let tenant = await getTenantByBotUserId(destination);

    // ถ้ายังไม่เจอ → ลองไล่เทียบลายเซ็นกับทุก tenant
    if (!tenant) {
      console.warn('[webhook] no tenant by botUserId, try signature fallback:', destination);
      tenant = await findTenantBySignature(req);
    }

    if (!tenant) {
      console.warn('[webhook] still no tenant matched:', destination);
      return res.status(200).send('ok');
    }

    const sec = await tenant.ref.collection('secret').doc('v1').get();
    const channelSecret = sec.get('channelSecret');
    const accessToken   = sec.get('accessToken');

    // ตรวจลายเซ็น (ถ้ามาจาก fallback จะผ่านแน่ เพราะเราเทียบก่อนแล้ว)
    if (!verifyLineSignature(req, channelSecret)) {
      console.warn('[webhook] bad signature for tenant', tenant.id);
      return res.status(403).send('bad signature');
    }

    await Promise.all(events.map(ev => handleLineEvent(ev, tenant.ref, accessToken)));
    res.status(200).send('ok');
  } catch (e) {
    console.error('[webhook/line] error', e);
    res.status(200).send('ok');
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

async function handleLineEvent(ev, tenantRef, accessToken) {
  const replyToken = ev.replyToken;
  const userId = ev.source?.userId;
  if (!replyToken || !userId) return;

  if (DEBUG_WEBHOOK) {
    const dbg = ev.type === 'postback' ? ev.postback?.data : ev.message?.text;
    console.log('[handleLineEvent]', ev.type, dbg || '');
  }

  // ====== เริ่มโหมด QnA จาก postback qna:<key> ======
  if (ev.type === 'postback' && typeof ev.postback?.data === 'string') {
    const data = ev.postback.data;
    if (data.startsWith('qna:')) {
      const key = data.slice(4).trim();

      // 1) หาใน docs ready ล่าสุด
      let qna = await findQnaSetByKey(tenantRef, key);
      // 2) ถ้าไม่เจอ → fallback ไปดู default rich menu ปัจจุบัน
      if (!qna) qna = await findQnaSetByKeyViaDefault(tenantRef, accessToken, key);

      console.log('[QNA:init]', { key, items: qna?.items?.length || 0 });

      if (!qna || !qna.items?.length) {
        return lineReply(accessToken, replyToken, [{ type: 'text', text: 'ยังไม่มีคำถามสำหรับหัวข้อนี้ค่ะ' }]);
      }

      await setSession(tenantRef, userId, {
        mode: 'qna',
        key,
        items: qna.items,
        fallback: qna.fallbackReply || 'ยังไม่พบคำตอบ ลองเลือกหมายเลขจากรายการนะคะ',
      });

      return lineReply(accessToken, replyToken, [{
        type: 'text',
        text: listMessage(qna.displayText, qna.items),
        quickReply: toQuickReplies(qna.items),
      }]);
    }
  }

  // ====== ผู้ใช้เพิ่มเพื่อน (ส่ง greeting ถ้าตั้งค่าไว้) ======
  if (ev.type === 'follow' && userId) {
    try {
      const gref = tenantRef.collection('settings').doc('greeting');
      const gsnap = await gref.get();
      const text = gsnap.get('text');
      if (text) {
        await lineReply(accessToken, replyToken, [{ type: 'text', text: String(text) }]);
      }
    } catch (e) {
      console.warn('[greeting] failed', e);
    }
    return;
  }

  // ====== ข้อความจากผู้ใช้ ======
  if (ev.type === 'message' && ev.message?.type === 'text') {
    const text = (ev.message.text || '').trim();

    // ---- คำสั่งควบคุม Live Chat (จับก่อน QnA เสมอ) ----
    if (text.toLowerCase() === '#live') {
      await ensureOpenLiveSession(tenantRef, userId, accessToken);
      await setSession(tenantRef, userId, { mode: 'live' });
      await appendLiveMessage(tenantRef, userId, 'system', 'เริ่มต้นสนทนาสด');
      return lineReply(accessToken, replyToken, [{
        type: 'text',
        text: 'เชื่อมต่อเจ้าหน้าที่แล้วค่ะ พิมพ์ข้อความที่ต้องการได้เลย\n\nพิมพ์ #end เพื่อจบการสนทนา'
      }]);
    }

    if (text.toLowerCase() === '#end') {
      await closeLiveSession(tenantRef, userId);
      await clearSession(tenantRef, userId);
      await appendLiveMessage(tenantRef, userId, 'system', 'ผู้ใช้จบการสนทนา');
      return lineReply(accessToken, replyToken, [{ type: 'text', text: 'ปิดการสนทนาเรียบร้อย ขอบคุณค่ะ' }]);
    }

    const ss = await getSession(tenantRef, userId);

    // ---- โหมด Live Chat ----
    if (ss?.mode === 'live') {
      await ensureOpenLiveSession(tenantRef, userId, accessToken);
      await appendLiveMessage(tenantRef, userId, 'user', text, { lineMessageId: ev.message.id || null });
      
      // ไม่ส่งข้อความอัตโนมัติกลับไปหา user
      // (optional) mark-as-read ก็ได้ ถ้าอยากให้ chat ขึ้นว่าอ่านแล้ว
      await fetchFn('https://api.line.me/v2/bot/message/markAsRead', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: userId })
      }).catch(()=>{});

      return; // จบเลย ไม่ต้อง reply อะไร
    }

    // ---- โหมด QnA ----
    if (ss?.mode === 'qna' && Array.isArray(ss.items)) {
      if (text === '#exit' || text === 'จบ') {
        await clearSession(tenantRef, userId);
        return lineReply(accessToken, replyToken, [{ type: 'text', text: 'ออกจากโหมด QnA แล้วค่ะ' }]);
      }

      // ตัวเลข 1..N
      const n = parseInt(text, 10);
      if (!isNaN(n) && n >= 1 && n <= ss.items.length) {
        return lineReply(accessToken, replyToken, [{ type: 'text', text: ss.items[n - 1].a || '—' }]);
      }

      // จับคู่แบบง่าย
      const t = normalize(text);
      const idx = ss.items.findIndex(it => normalize(it.q).includes(t));
      if (idx >= 0) {
        return lineReply(accessToken, replyToken, [{ type: 'text', text: ss.items[idx].a || '—' }]);
      }

      // ไม่เจอ → fallback
      return lineReply(accessToken, replyToken, [{
        type: 'text',
        text: ss.fallback || 'ยังไม่พบคำตอบ',
        quickReply: toQuickReplies(ss.items),
      }]);
    }

    // ---- ข้อความทั่วไป นอกทุกโหมด ----
    // จะไม่ตอบอะไรเป็นพิเศษ ปล่อยผ่านได้ หรือจะส่งข้อความช่วยเหลือก็ได้
    return; 
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
    const { id, uid } = req.params; // uid = LINE userId (Uxxxxxxxx)
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text_required' });

    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    // push หา user
    const r = await fetchFn('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: uid, messages: [{ type: 'text', text: String(text).slice(0, 1000) }] }),
    });
    const t = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: 'line_push_error', detail: t });

    // log ข้อความฝั่ง agent
    await ensureOpenLiveSession(tenant.ref, uid, accessToken);
    await appendLiveMessage(tenant.ref, uid, 'agent', text, { agentUid: req.user.uid });

    res.json({ ok: true });
  } catch (e) {
    console.error('[live send] error', e);
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

app.post('/api/tenants/:id/live/:uid/close', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, uid } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    await closeLiveSession(tenant.ref, uid);
    await appendLiveMessage(tenant.ref, uid, 'system', 'แอดมินปิดการสนทนา', { agentUid: req.user.uid });

    // แจ้งผู้ใช้
    await fetchFn('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: uid, messages: [{ type: 'text', text: 'ปิดการสนทนาเรียบร้อย ขอบคุณค่ะ' }] }),
    }).catch(()=>{});

    // เคลียร์ session โหมด live (ถ้ามี)
    await clearSession(tenant.ref, uid).catch(()=>{});

    res.json({ ok: true });
  } catch (e) {
    console.error('[live close] error', e);
    res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
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

        const resp = await fetchFn('https://api.line.me/v2/bot/message/broadcast', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: data.messages }),
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
      let currentDefault = null;
      try {
        const cur = await fetchFn('https://api.line.me/v2/bot/user/all/richmenu', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
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
      const r = await fetchFn('https://api.line.me/v2/bot/user/all/richmenu/' + encodeURIComponent(want), {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const t = await r.text();
      if (!r.ok) {
        results.push({ tenantId: tid, action: 'failed', detail: t });
      } else {
        // อัพเดต flag ไว้ดูย้อนหลัง (ออปชัน)
        await winner.ref.set({
          lastAppliedAsDefaultAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        results.push({ tenantId: tid, action: 'set-default', richMenuId: want });
      }
    }

    return res.json({ ok: true, tenantsProcessed: results.length, results });
  } catch (e) {
    console.error('[cron richmenus] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});


// ==============================
// 8) Health/Admin
// ==============================
app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.get('/admin-check', (_req, res) => {
  try {
    const pid = admin.app().options.projectId;
    res.json({ ok: true, projectId: pid });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});



// ==============================
// 9) Static (React build)
// ==============================
const clientBuildPath = path.join(__dirname, 'build');
app.use(express.static(clientBuildPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});


// ==============================
// 10) Start
// ==============================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`BASE_APP_URL: ${BASE_APP_URL}`);
  console.log(`LINE redirect_uri: ${REDIRECT_URI}`);
});
