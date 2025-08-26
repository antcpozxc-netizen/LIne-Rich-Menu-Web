// tools/set-admin.js
const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.applicationDefault() });

async function setRole(uid, role = 'developer') {
  const claims = {
    dev: role === 'developer',
    head: role === 'headAdmin',
    admin: role === 'developer' || role === 'headAdmin' || role === 'admin',
  };

  // 1) ตั้ง Custom Claims
  await admin.auth().setCustomUserClaims(uid, claims);

  // 2) อัปเดต Firestore users/{uid}
  const db = admin.firestore();
  await db.doc(`users/${uid}`).set({
    role,
    isAdmin: claims.admin, // ให้ UI เดิมที่ดู isAdmin ใช้ได้ด้วย
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('done:', uid, '->', role, claims);
}

// 👉 เปลี่ยน UID ตรงนี้เป็นของคุณ
const uid = 'line:Udae5f3b9e1883d8883d03cff4700d798';
setRole(uid, 'developer').then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
