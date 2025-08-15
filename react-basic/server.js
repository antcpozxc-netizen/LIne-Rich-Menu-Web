// server.js
require('dotenv').config(); // โหลด .env ก่อน

// ใช้ fetch จาก Node 18+ ถ้ามี; ถ้าไม่มีให้ fallback ไป node-fetch แบบ dynamic import
const fetchFn = (...args) =>
  (global.fetch ? global.fetch(...args) : import('node-fetch').then(({ default: f }) => f(...args)));

const fs = require('fs');
const path = require('path');
const express = require('express');

const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

import admin from 'firebase-admin';

if (!admin.apps.length) {
  let creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(creds),
    projectId: creds.project_id,
  });
  console.log("[FIREBASE] Initialized with service account from ENV");
}

// ----- Firebase Admin init -----
if (!admin.apps.length) {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS; // ex: C:/myWeb/secrets/firebase-admin.json
  if (!saPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set in .env');

  const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
  });
  console.log('[FIREBASE] Using service account:', serviceAccount.client_email);
}

// ---- Helper: ตรวจสอบ Firebase ID Token จาก client (ต้องอยู่นอกบล็อก init) ----
async function requireFirebaseAuth(req, res, next) {
  try {
    // ต้องส่ง header: Authorization: Bearer <idToken>
    const h = req.headers.authorization || '';
    const m = h.match(/^Bearer (.+)$/);
    if (!m) {
      return res.status(401).json({ error: 'Missing Authorization: Bearer <idToken>' });
    }
    // ตรวจสอบโทเคน -> ได้ข้อมูลผู้ใช้
    const decoded = await admin.auth().verifyIdToken(m[1]);
    req.user = decoded; // { uid, ... }
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// middleware (parse JSON แค่ครั้งเดียว)
app.use(express.json({ limit: '1mb' }));

// ========== LINE Login Routes ==========
app.get('/auth/line/start', (req, res) => {
  const state = Math.random().toString(36).slice(2);
  const nonce = Math.random().toString(36).slice(2);

  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.LINE_LOGIN_CHANNEL_ID);
  url.searchParams.set('redirect_uri', process.env.LINE_LOGIN_CALLBACK_URL);
  url.searchParams.set('scope', 'openid profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);

  res.redirect(url.toString());
});

app.get('/auth/line/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');

    // 1) แลก token
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: process.env.LINE_LOGIN_CALLBACK_URL,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID,
      client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET,
    });

    const tokenRes = await fetchFn('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });

    const raw = await tokenRes.text();
    if (!tokenRes.ok) return res.status(401).send('Token exchange failed: ' + raw);
    const tokenJson = JSON.parse(raw);

    const { id_token, access_token } = tokenJson;
    const payload = jwt.decode(id_token);
    const uid = `line:${payload.sub}`;

    // 2) ขอโปรไฟล์ล่าสุดจาก LINE
    let profile = null;
    try {
      const p = await fetchFn('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (p.ok) profile = await p.json(); // { userId, displayName, pictureUrl }
    } catch (e) {
      console.warn('[LINE] profile fetch failed', e);
    }

    // fallback ถ้าดึงโปรไฟล์ไม่สำเร็จ ก็ใช้ข้อมูลจาก id_token
    const displayName = profile?.displayName || payload.name || payload.display_name || 'LINE User';
    const photoURL   = profile?.pictureUrl || payload.picture || '';

    // 3) บันทึกลง Firestore -> users/{uid}
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

    // 4) ออก custom token และ redirect กลับแอป
    const customToken = await admin.auth().createCustomToken(uid);
    const appUrl = process.env.PUBLIC_APP_URL || `http://localhost:${PORT}`;
    return res.redirect(302, `${appUrl}/#token=${customToken}`);
  } catch (err) {
    console.error('[CALLBACK] unhandled error', err);
    return res.status(500).send('Callback error: ' + (err?.message || err));
  }
});
// =======================================

// ---- API: สร้าง tenant (เก็บ OA ของผู้ใช้) ----
app.post('/api/tenants', requireFirebaseAuth, async (req, res) => {
  console.log('[api/tenants] hit', { uid: req.user?.uid, channelId: req.body?.channelId });

  try {
    const { channelId, channelSecret } = req.body || {};
    if (!channelId || !channelSecret) {
      return res.status(400).json({ error: 'channelId & channelSecret required' });
    }

    // 1) issue channel access token
    console.log('[api/tenants] issuing token…');
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
    console.log('[api/tenants] token status:', tokRes.status, tokText.slice(0, 200));
    if (!tokRes.ok) {
      let j = {}; try { j = JSON.parse(tokText); } catch {}
      return res.status(400).json({
        error: 'Cannot issue access token',
        detail: j.error_description || j.message || tokText
      });
    }
    const { access_token } = JSON.parse(tokText);

    // 2) bot info
    console.log('[api/tenants] fetching bot info…');
    const infoRes = await fetchFn('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const infoText = await infoRes.text();
    console.log('[api/tenants] bot info status:', infoRes.status, infoText.slice(0, 200));
    if (!infoRes.ok) {
      let j = {}; try { j = JSON.parse(infoText); } catch {}
      return res.status(400).json({
        error: 'Cannot fetch bot info',
        detail: j.message || infoText,
        hint: 'ใช้ Channel ID/Secret ของ Messaging API (ไม่ใช่ LINE Login) และ OA ต้อง Enabled ใน OAM'
      });
    }
    const info = JSON.parse(infoText); // { basicId, displayName, pictureUrl, ... }

    // 3) เช็คซ้ำ + บันทึก Firestore
    const db = admin.firestore();
    const ownerUid = req.user.uid;

    // 🔎 เช็คว่าผู้ใช้นี้เคยเพิ่ม OA (channelId เดิม) ไปแล้วหรือยัง
    const dupSnap = await db.collection('tenants')
      .where('ownerUid', '==', ownerUid)
      .where('channelId', '==', channelId)
      .limit(1)
      .get();

    if (!dupSnap.empty) {
      // 👉 มีอยู่แล้ว: อัปเดตข้อมูลที่เปลี่ยน + secret (idempotent)
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

    // 🆕 ไม่ซ้ำ: สร้างเอกสารใหม่
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


// Health check
app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.get('/admin-check', (_req, res) => {
  try {
    const pid = admin.app().options.projectId;
    res.json({ ok: true, projectId: pid });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// เสิร์ฟ React build
const clientBuildPath = path.join(__dirname, 'build');
app.use(express.static(clientBuildPath));

// ===== Utilities (ตรวจสิทธิ์ OA) =====
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

// ===== ส่ง Broadcast ทันที =====
app.post('/api/tenants/:id/broadcast', requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;
    const { recipient = 'all', sendType = 'now', messages = [] } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages_required' });
    }
    if (messages.length > 5) {
      return res.status(400).json({ error: 'too_many_messages', detail: 'LINE จำกัดครั้งละไม่เกิน 5 messages' });
    }
    if (sendType !== 'now') {
      return res.status(400).json({ error: 'schedule_not_supported_yet' });
    }

    // ตรวจสิทธิ์ OA
    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    // ดึง accessToken จาก subcollection secret/v1
    const secSnap = await tenant.ref.collection('secret').doc('v1').get();
    if (!secSnap.exists) return res.status(500).json({ error: 'missing_secret' });
    const { accessToken } = secSnap.data();
    if (!accessToken) return res.status(500).json({ error: 'missing_access_token' });

    // เรียก LINE Broadcast API
    const resp = await fetchFn('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error('[broadcast] LINE error', resp.status, text);
      return res.status(resp.status).json({ error: 'line_error', detail: text });
    }

    // บันทึกประวัติ (optional)
    const logRef = tenant.ref.collection('broadcasts').doc();
    await logRef.set({
      createdBy: uid,
      recipient,
      sendType,
      messages,
      status: 'sent',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ ok: true, id: logRef.id });
  } catch (e) {
    console.error('[broadcast] error', e);
    return res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});


// ===== Helpers =====
function toTs(iso) {
  // รับ ISO string (UTC หรือมี offset) → Firestore Timestamp
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return admin.firestore.Timestamp.fromDate(d);
}

async function getTenantSecretAccessToken(tenantRef) {
  const secSnap = await tenantRef.collection('secret').doc('v1').get();
  if (!secSnap.exists) throw new Error('missing_secret');
  const { accessToken } = secSnap.data() || {};
  if (!accessToken) throw new Error('missing_access_token');
  return accessToken;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'messages_required';
  }
  if (messages.length > 5) {
    return 'too_many_messages';
  }
  return null;
}

// ===== บันทึก Draft/Scheduled =====
app.post('/api/tenants/:id/broadcast/draft', requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;
    const { recipient = 'all', messages = [], targetSummary, schedule = null } = req.body || {};

    const msgErr = validateMessages(messages);
    if (msgErr) {
      return res.status(400).json({ error: msgErr, detail: msgErr === 'too_many_messages' ? 'LINE จำกัดครั้งละไม่เกิน 5 messages' : undefined });
    }

    // ตรวจสิทธิ์ OA
    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });

    // ตีความสถานะจาก schedule
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
    const docRef = tenant.ref.collection('broadcasts').doc(); // สร้างใหม่
    await docRef.set({
      createdBy: uid,
      recipient,
      messages,
      targetSummary: targetSummary || (recipient === 'all' ? 'All friends' : 'Targeting'),
      status,
      scheduledAt: scheduledAt || null,
      tz: tz || null,
      createdAt: now,
      updatedAt: now,
    });

    return res.json({ ok: true, id: docRef.id, status });
  } catch (e) {
    console.error('[broadcast draft] error', e);
    const code = e.message === 'not_member_of_tenant' ? 403
               : (e.message && e.message.startsWith('missing_') ? 500 : 500);
    return res.status(code).json({ error: 'server_error', detail: String(e.message || e) });
  }
});

// ===== ส่งทดสอบ (push ให้ผู้ส่ง) =====
app.post('/api/tenants/:id/broadcast/test', requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;
    const { messages = [] } = req.body || {};

    const msgErr = validateMessages(messages);
    if (msgErr) {
      return res.status(400).json({ error: msgErr, detail: msgErr === 'too_many_messages' ? 'LINE จำกัดครั้งละไม่เกิน 5 messages' : undefined });
    }

    // ตรวจสิทธิ์ OA + token
    const tenant = await getTenantIfMember(id, uid);
    if (!tenant) return res.status(403).json({ error: 'not_member_of_tenant' });
    const accessToken = await getTenantSecretAccessToken(tenant.ref);

    // หา LINE userId ของผู้ขอทดสอบ
    const userSnap = await admin.firestore().doc(`users/${uid}`).get();
    const to = userSnap.get('line.userId');
    if (!to) return res.status(400).json({ error: 'user_has_no_line_id' });

    // push ให้ผู้ส่ง
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

// ===== ส่งทันที (เดิม) — เติม log ให้ครบเล็กน้อย =====
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

    // Broadcast
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

    // log
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


// ใช้คีย์ง่าย ๆ กันคนนอกเรียก
app.post('/tasks/cron/broadcast', async (req, res) => {
  console.log('[cron] hit', new Date().toISOString(), 'key=', req.get('X-App-Cron-Key'));
  try {
    if (req.get('X-App-Cron-Key') !== process.env.CRON_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    // ดึงงานที่ถึงเวลาแล้ว (scheduled <= now)
    const snap = await db.collectionGroup('broadcasts')
      .where('status','==','scheduled')
      .where('scheduledAt','<=', now)
      .limit(25)
      .get();

    const jobs = snap.docs.map(async d => {
      const data = d.data();
      const tenantRef = d.ref.parent.parent; // tenants/{id}
      if (!tenantRef) return;

      // กันยิงซ้ำด้วย transaction เล็ก ๆ
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

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));