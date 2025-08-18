// src/lib/lineImagemap.js
import { ref as sref, uploadBytes, updateMetadata, getDownloadURL } from 'firebase/storage';
import { app, storage } from '../firebase';

export const IMAGEMAP_WIDTHS = [240, 300, 460, 700, 1040];

async function fileToImageBitmap(file) {
  if ('createImageBitmap' in window) return await createImageBitmap(file);
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  URL.revokeObjectURL(url);
  return img;
}

function drawResizeToBlob(bitmap, targetWidth, mime = 'image/jpeg', quality = 0.92) {
  const ratio = targetWidth / bitmap.width;
  const w = targetWidth, h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('toBlob failed'));
        resolve({ blob, width: w, height: h });
    }, mime, quality);
  });

}

// ใช้แบบใหม่: uploadImagemapVariants({ file, bucketBaseDir, mime? })
export async function uploadImagemapVariants({ file, bucketBaseDir, mime = 'image/jpeg' }) {
  const bitmap = await fileToImageBitmap(file);
  const urls = {};
  let baseHeightAt1040 = 0;

  for (const w of IMAGEMAP_WIDTHS) {
    const { blob, height } = await drawResizeToBlob(bitmap, w, mime, 0.92);
    if (w === 1040) baseHeightAt1040 = height;

    const r = sref(storage, `${bucketBaseDir}/${w}`); // ชื่อ object เป็นตัวเลขล้วน
    await uploadBytes(r, blob, { contentType: mime });
    await updateMetadata(r, { contentType: mime });
    urls[w] = await getDownloadURL(r);               // ⬅️ เก็บ download URL ไว้พรีวิว
  }

  const bucket = app.options?.storageBucket;
  const baseUrl = `https://storage.googleapis.com/${bucket}/${bucketBaseDir}`; // ใช้กับ LINE (ต้อง public)

  return {
    baseUrl,
    baseSize: { width: 1040, height: baseHeightAt1040 },
    urls, // {240:'...',300:'...',460:'...',700:'...',1040:'...'}
  };
}


// รับได้ทั้ง % (0..100) หรือ normalized (0..1)
export function areasToImagemapActions(areas, baseWidth = 1040, baseHeight) {
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const pct = (a, k) =>
    a[`${k}Pct`] != null ? clamp(Number(a[`${k}Pct`])||0,0,1) : clamp((Number(a[k])||0)/100,0,1);

  return areas.map(a => {
    const area = {
      x: Math.round(pct(a,'x')*baseWidth),
      y: Math.round(pct(a,'y')*baseHeight),
      width: Math.round(pct(a,'w')*baseWidth),
      height: Math.round(pct(a,'h')*baseHeight),
    };
    return a.type === 'message'
      ? { type:'message', label:a.label||'', text:a.text||'', area }
      : { type:'uri', label:a.label||'', linkUri:a.url||'https://example.com', area };
  });
}
