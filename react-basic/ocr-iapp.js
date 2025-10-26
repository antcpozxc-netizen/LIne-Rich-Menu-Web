// server/ocr-iapp.js
import express from 'express';
import FormData from 'form-data';

const router = express.Router();

router.post('/api/ocr/iapp', async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    if (!dataUrl) return res.status(400).json({ ok:false, error:'dataUrl is required' });

    // รับ dataURL -> แยก mime + base64
    const m = String(dataUrl).match(/^data:(.+?);base64,(.+)$/);
    if (!m) return res.status(400).json({ ok:false, error:'invalid dataUrl' });
    const mime = m[1];
    const buf  = Buffer.from(m[2], 'base64');

    // ส่งขึ้น iApp เป็น multipart/form-data
    const form = new FormData();
    form.append('file', buf, { filename:'idcard.jpg', contentType: mime });

    const r = await fetch('https://api.iapp.co.th/thai-national-id-card/v3.5/front', {
      method: 'POST',
      headers: { apikey: process.env.IAPP_API_KEY },
      body: form
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ ok:false, error: j?.message || 'iApp error', raw:j });
    }
    res.json({ ok:true, data:j });
  } catch (e) {
    res.status(500).json({ ok:false, error: e?.message || 'server error' });
  }
});

export default router;
