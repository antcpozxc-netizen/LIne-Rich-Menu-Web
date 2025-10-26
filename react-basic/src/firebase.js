// src/firebase.js
import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDxlmzgBNDDz9vD2aSSKadnmEMYBMPHwZQ',
  authDomain: 'line-rich-menus-web.firebaseapp.com',
  projectId: 'line-rich-menus-web',
  appId: '1:610199065213:web:d3d4f4671af6862a3b1714',
  storageBucket: 'line-rich-menus-web.firebasestorage.app',
};

export const app = initializeApp(firebaseConfig);

// --- เลือก persistence ตามสภาพแวดล้อม ---
const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
const isIOS = /iphone|ipad|ipod/.test(ua);
const isLine = ua.includes(' line/');
const isLineIOS = isIOS && isLine;

// LINE iOS → ใช้ in-memory กันปัญหา IndexedDB/LocalStorage บน WKWebView
// ที่อื่น → ใช้ IndexedDB (หรือ browserLocalPersistence ก็ได้)
export const auth = initializeAuth(app, {
  persistence: isLineIOS ? inMemoryPersistence : indexedDBLocalPersistence,
});

export const db = getFirestore(app);
export const storage = getStorage(app);

// สำหรับดีบักใน DevTools
if (typeof window !== 'undefined') {
  window.__app = app;
  window.__auth = auth;
  window.__db = db;
  window.__storage = storage;
}
