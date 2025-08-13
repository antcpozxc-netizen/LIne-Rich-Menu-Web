// server.js (วางไว้ระดับเดียวกับ package.json)
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ถ้ามี webhook ในอนาคต เพิ่มก่อน static/fallback ได้เลย
// app.post('/webhook', express.json(), (req, res) => { /* TODO */ res.sendStatus(200); });

app.use(express.static(path.join(__dirname, 'build')));

// SPA fallback ให้ทุก path เสิร์ฟ index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));