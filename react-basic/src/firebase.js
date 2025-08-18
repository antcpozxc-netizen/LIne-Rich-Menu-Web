// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDxlmzgBNDDz9vD2aSSKadnmEMYBMPHwZQ',
  authDomain: 'line-rich-menus-web.firebaseapp.com',
  projectId: 'line-rich-menus-web',
  appId: '1:610199065213:web:d3d4f4671af6862a3b1714',
  storageBucket: 'line-rich-menus-web.firebasestorage.app', // ใช้อันนี้ได้
  // storageBucket: 'line-rich-menus-web.appspot.com',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { app };

// --- เพิ่มบล็อกนี้ เพื่อใช้งานจาก DevTools Console ---
if (typeof window !== 'undefined') {
  window.__app = app;
  window.__auth = auth;
  window.__db = db;
  window.__storage = storage;
}
