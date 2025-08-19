// server.js
// ==============================
// 0) Config & Imports
// ==============================
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

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
app.use(express.json({ limit: '1mb' }));

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

// === Helpers for Rich Menu ===
function mapActionForLINE(a = {}) {
  switch (a.type) {
    case 'Link':
      return { type: 'uri', label: (a.label || 'Open').slice(0, 20), uri: a.url || 'https://example.com' };
    case 'Text':
      return { type: 'message', text: a.text || 'Hello!' };
    case 'QnA':
      return { type: 'postback', data: a.data || 'qna', displayText: a.label || 'QnA' };
    case 'Live Chat':
      return { type: 'message', text: a.text || '#live' };
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


// ==============================
// 4) LINE Login
// ==============================

// Start: redirect to LINE authorize
app.get('/auth/line/start', (_req, res) => {
  const state = Math.random().toString(36).slice(2);
  const nonce = Math.random().toString(36).slice(2);

  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.LINE_LOGIN_CHANNEL_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI); // use sanitized value
  url.searchParams.set('scope', 'openid profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);

  res.redirect(url.toString());
});

// Callback: exchange token, upsert user, mint Firebase custom token
app.get('/auth/line/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');

    // 1) Exchange code for tokens
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: REDIRECT_URI, // use same sanitized value
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
    const payload = jwt.decode(id_token); // (สำหรับโปรดักชันควร verify JWK)
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
    return res.redirect(302, `${BASE_APP_URL}/#token=${customToken}`);
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
      schedule = null,            // { from: ISO, to: ISO|null }  (ต้องมีเมื่อ action === 'save')
      action = 'draft'            // 'draft' | 'save'  (save = Scheduled/Active)
    } = req.body || {};

    const docRef = tenant.ref.collection('richmenus').doc(rid);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });

    const prev = snap.data() || {};
    const now = admin.firestore.FieldValue.serverTimestamp();

    // กรณีต้องมีบน LINE แต่ยังไม่มี -> สร้าง
    let lineRichMenuId = prev.lineRichMenuId || null;
    if (!lineRichMenuId) {
      if (!imageUrl) return res.status(400).json({ error: 'image_url_required' });

      const accessToken = await getTenantSecretAccessToken(tenant.ref);
      const WIDTH  = 2500;
      const HEIGHT = size === 'compact' ? 843 : 1686;
      const areasPx = toPxAreas({ areas, width: WIDTH, height: HEIGHT });

      const created = await createAndUploadRichMenuOnLINE({
        accessToken, title, chatBarText, size, areasPx, imageUrl
      });
      lineRichMenuId = created.richMenuId;
    }

    // สรุปสถานะ + schedule
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
      status: 'ready',                     // ตาม mapping: draft ปุ่ม = Ready
      schedule: action === 'save' ? schedule : null,
      scheduleFrom: action === 'save' ? scheduleFrom : null,
      scheduleTo:   action === 'save' ? scheduleTo   : null,
      updatedAt: now,
    }, { merge: true });

    return res.json({ ok: true, id: rid, richMenuId: lineRichMenuId, status: 'ready' });
  } catch (e) {
    console.error('[richmenus update] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});

// 6.x.5) Delete rich menu doc (ลบเฉพาะใน Firestore)
// หมายเหตุ: ถ้าต้องการลบบน LINE ด้วย ให้เรียก DELETE /v2/bot/richmenu/{id} เพิ่มได้
app.delete('/api/tenants/:id/richmenus/:rid', requireFirebaseAuth, async (req, res) => {
  try {
    const { id, rid } = req.params;
    const tenant = await getTenantIfMember(id, req.user.uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    await tenant.ref.collection('richmenus').doc(rid).delete();
    return res.json({ ok: true });
  } catch (e) {
    console.error('[richmenus delete] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e?.message || e) });
  }
});


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
