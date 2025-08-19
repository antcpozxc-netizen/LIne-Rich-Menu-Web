// tools/set-admin.js
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });

async function setAdmin(uid, isAdmin=true) {
  await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });
  console.log('done', uid, isAdmin);
}

const uid = "line:Udae5f3b9e1883d8883d03cff4700d798";
setAdmin(uid).then(() => process.exit());