/**
 * SDMS Webhook Route — pasang di LMS Node.js
 * Daftarkan di server.js LMS:
 *
 *   const sdmsWebhook = require('./routes-webhook');
 *   app.use('/api/webhooks', sdmsWebhook);
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { verifySDMS, handleWebhook, setupTables } = require('./sdms-webhook');

// Buat tabel sinkronisasi saat pertama kali diload
setupTables()
  .then(() => console.log('[SDMS] Tabel sinkronisasi siap'))
  .catch(err => console.error('[SDMS] Setup tabel gagal:', err.message));

// POST /api/webhooks/sdms  ← endpoint yang dipanggil SDMS
router.post('/sdms', verifySDMS, handleWebhook);

// GET /api/webhooks/sdms/status  ← cek koneksi (opsional)
router.get('/sdms/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SDMS webhook receiver aktif',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
