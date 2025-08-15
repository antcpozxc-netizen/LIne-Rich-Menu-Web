// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';


// ⚠️ ใส่ค่าจริงจาก Firebase Console ของโปรเจกต์คุณ
const firebaseConfig = {
  apiKey: "AIzaSyDxlmzgBNDDz9vD2aSSKadnmEMYBMPHwZQ",
  authDomain: "line-rich-menus-web.firebaseapp.com",       // เช่น line-rich-menus-web.firebaseapp.com
  projectId: "line-rich-menus-web",     // ของคุณ
  appId: "1:610199065213:web:d3d4f4671af6862a3b1714",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
