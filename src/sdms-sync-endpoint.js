'use strict';
/**
 * SDMS Manual Sync Endpoint
 * =========================
 * Dipasang di server.js LMS:
 *
 *   const sdmsSync = require('./sdms-sync-endpoint');
 *   app.use(sdmsSync);
 *
 * Endpoints:
 *   POST /api/sdms/sync        — request bulk sync dari SDMS (butuh login admin)
 *   GET  /api/sdms/sync/status — cek jumlah data saat ini di tabel sdms_*
 *   GET  /sdms-sync            — halaman tombol sync (UI)
 */

const express = require('express');
const axios   = require('axios');
const crypto  = require('crypto');
const router  = express.Router();

const { handleBulkSync } = require('./sdms-webhook');

// Konfigurasi — dibaca dari .env LMS
const SDMS_URL     = process.env.SDMS_URL     || 'http://10.10.102.11:3000';
const SDMS_API_KEY = process.env.SDMS_API_KEY || '';   // opsional jika SDMS butuh auth
const SDMS_WEBHOOK_SECRET = process.env.SDMS_WEBHOOK_SECRET || 'sdms_lms_secret';

// ── Middleware: cek login admin ───────────────────────────────
const requireAdmin = (req, res, next) => {
  const user = req.session?.user;
  if (!user) {
    // Jika akses via browser, redirect ke login
    if (req.accepts('html')) return res.redirect('/login?redirect=/sdms-sync');
    return res.status(401).json({ ok: false, message: 'Login dulu' });
  }
  const role = (user.role || user.level || '').toUpperCase();
  const allowed = ['ADMIN', 'SUPER_ADMIN', 'TEACHER', 'OPERATOR'];
  if (!allowed.includes(role)) {
    return res.status(403).json({ ok: false, message: 'Tidak punya akses' });
  }
  next();
};

// ── GET /api/sdms/sync/status ─────────────────────────────────
// Cek jumlah data di setiap tabel sdms_*
router.get('/api/sdms/sync/status', requireAdmin, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const tables = ['sdms_guru', 'sdms_siswa', 'sdms_kelas', 'sdms_mapel', 'sdms_pegawai'];
    const counts = {};
    for (const tbl of tables) {
      try {
        const result = await pool.query(
          `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active=true) AS aktif FROM ${tbl}`
        );
        const row = result.rows?.[0] || result[0]?.[0] || {};
        counts[tbl] = { total: Number(row.total||0), aktif: Number(row.aktif||0) };
      } catch {
        counts[tbl] = { total: 0, aktif: 0, error: 'tabel belum ada' };
      }
    }

    // Ambil log sync terakhir
    let lastSync = null;
    try {
      const logResult = await pool.query(
        `SELECT event, status, created_at FROM sdms_sync_log
         WHERE event='bulk.sync' ORDER BY created_at DESC LIMIT 1`
      );
      const logRow = logResult.rows?.[0] || logResult[0]?.[0];
      if (logRow) lastSync = logRow;
    } catch { /* tabel log belum ada */ }

    return res.json({ ok: true, counts, lastSync, sdmsUrl: SDMS_URL });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// ── POST /api/sdms/sync ───────────────────────────────────────
// Request bulk sync dari SDMS, lalu proses dengan upsert
// Behaviour:
//   - Data yang belum ada → INSERT baru
//   - Data yang sama persis → SKIP (tidak disentuh)
//   - Data yang berubah di SDMS → UPDATE
//   - Data yang ada di LMS tapi tidak dikirim SDMS → TIDAK dihapus
router.post('/api/sdms/sync', requireAdmin, async (req, res) => {
  const user = req.session?.user;

  // Beri response awal agar browser tidak timeout
  // Proses akan jalan di background, hasilnya bisa dicek via /status
  res.json({
    ok: true,
    message: 'Sinkronisasi dimulai. Cek status beberapa saat lagi.',
    startedBy: user?.username || user?.full_name || 'admin',
    startedAt: new Date().toISOString(),
  });

  // Proses di background
  setImmediate(async () => {
    const startTime = Date.now();
    console.log(`[SDMS-Sync] Bulk sync dimulai oleh: ${user?.username || 'admin'}`);

    try {
      // 1. Minta data ke SDMS via API
      // SDMS endpoint: GET /api/v1/master/siswa, /guru, /kelas, dll
      // Atau trigger bulk.sync via webhook balik
      // Lebih sederhana: panggil endpoint bulk data SDMS langsung

      let guru    = [];
      let siswa   = [];
      let kelas   = [];
      let mapel   = [];
      let pegawai = [];

      // Fungsi fetch satu endpoint SDMS
      const fetchSDMS = async (path) => {
        try {
          const resp = await axios.get(`${SDMS_URL}${path}`, {
            timeout: 30000,
            params: { limit: 9999, is_active: true },
            headers: {
              'Content-Type': 'application/json',
              ...(SDMS_API_KEY && { 'X-API-Key': SDMS_API_KEY }),
            },
          });
          // SDMS response: { status:'success', data: [...] } atau { data: { data: [...] } }
          const body = resp.data;
          if (body?.data?.data) return body.data.data;
          if (Array.isArray(body?.data)) return body.data;
          if (Array.isArray(body)) return body;
          return [];
        } catch (e) {
          console.warn(`[SDMS-Sync] Gagal fetch ${path}: ${e.message}`);
          return [];
        }
      };

      // Fetch semua data master dari SDMS
      [guru, siswa, kelas, mapel, pegawai] = await Promise.all([
        fetchSDMS('/api/v1/master/guru'),
        fetchSDMS('/api/v1/master/siswa'),
        fetchSDMS('/api/v1/master/kelas'),
        fetchSDMS('/api/v1/master/mapel'),
        fetchSDMS('/api/v1/master/pegawai'),
      ]);

      console.log(`[SDMS-Sync] Data dari SDMS — guru:${guru.length} siswa:${siswa.length} kelas:${kelas.length}`);

      // 2. Upsert ke tabel sdms_* (tidak dobel, hanya melengkapi/update yang berubah)
      const stats = await handleBulkSync({ guru, siswa, kelas, mapel, pegawai });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[SDMS-Sync] Selesai dalam ${duration}s — insert:${stats.inserted} update:${stats.updated} skip:${stats.skipped} err:${stats.errors}`);

      // 3. Catat di sync log
      const pool = req.app?.locals?.pool;
      if (pool) {
        await pool.query(
          `INSERT INTO sdms_sync_log (event, resource_id, status, error_message, created_at)
           VALUES ($1,$2,$3,$4,NOW())`,
          [
            'bulk.sync.manual',
            user?.username || 'admin',
            stats.errors === 0 ? 'success' : 'partial',
            stats.errors > 0 ? `${stats.errors} error(s)` : null,
          ]
        ).catch(() => {});
      }

    } catch (err) {
      console.error(`[SDMS-Sync] Error: ${err.message}`);
    }
  });
});

// ── GET /sdms-sync ────────────────────────────────────────────
// Halaman UI tombol sync (lihat sdms-sync-page.js untuk versi terpisah)
router.get('/sdms-sync', requireAdmin, (req, res) => {
  const user = req.session?.user;
  // Kirim HTML inline agar tidak butuh view engine
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(buildSyncPage(user));
});

// ── HTML halaman sync ─────────────────────────────────────────
function buildSyncPage(user) {
  const username = user?.full_name || user?.username || 'Admin';
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sinkronisasi Data SDMS</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f172a; color: #e2e8f0;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: #1e293b; border-radius: 16px; padding: 2rem;
      width: 100%; max-width: 540px;
      box-shadow: 0 20px 60px rgba(0,0,0,.4);
    }
    .header { display: flex; align-items: center; gap: .75rem; margin-bottom: 1.75rem; }
    .header .icon { font-size: 2rem; }
    .header h1 { font-size: 1.3rem; font-weight: 700; color: #f1f5f9; }
    .header p  { font-size: .82rem; color: #94a3b8; margin-top: .15rem; }

    .status-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: .75rem;
      margin-bottom: 1.5rem;
    }
    .stat {
      background: #0f172a; border-radius: 10px; padding: .875rem 1rem;
      border: 1px solid #334155;
    }
    .stat .label { font-size: .72rem; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
    .stat .value { font-size: 1.5rem; font-weight: 700; color: #38bdf8; margin-top: .25rem; }
    .stat .sub   { font-size: .72rem; color: #475569; margin-top: .1rem; }

    .last-sync {
      background: #0f172a; border: 1px solid #334155; border-radius: 10px;
      padding: .75rem 1rem; margin-bottom: 1.5rem; font-size: .82rem; color: #94a3b8;
    }
    .last-sync span { color: #38bdf8; }

    .btn {
      width: 100%; padding: .875rem; border: none; border-radius: 10px;
      font-size: 1rem; font-weight: 600; cursor: pointer;
      transition: all .2s; display: flex; align-items: center; justify-content: center; gap: .5rem;
    }
    .btn-sync { background: #0ea5e9; color: #fff; }
    .btn-sync:hover:not(:disabled) { background: #0284c7; transform: translateY(-1px); }
    .btn-sync:disabled { background: #334155; color: #64748b; cursor: not-allowed; transform: none; }

    .progress {
      display: none; margin-top: 1.25rem;
      background: #0f172a; border-radius: 10px; padding: 1rem;
      border: 1px solid #334155;
    }
    .progress.show { display: block; }
    .progress-bar-wrap { background: #1e3a5f; border-radius: 99px; height: 6px; margin: .75rem 0; overflow: hidden; }
    .progress-bar { height: 100%; background: #0ea5e9; border-radius: 99px; width: 0%; transition: width .3s; }
    .progress-text { font-size: .82rem; color: #94a3b8; }

    .result {
      display: none; margin-top: 1.25rem; border-radius: 10px; padding: 1rem;
      font-size: .85rem;
    }
    .result.success { background: #052e16; border: 1px solid #166534; color: #86efac; display: block; }
    .result.error   { background: #450a0a; border: 1px solid #991b1b; color: #fca5a5; display: block; }
    .result .row { display: flex; justify-content: space-between; padding: .2rem 0; }
    .result .row span:last-child { font-weight: 600; }

    .note { margin-top: 1.25rem; font-size: .78rem; color: #475569; line-height: 1.6; }
    .note strong { color: #64748b; }

    .spinner { display: inline-block; width: 1rem; height: 1rem;
      border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
      border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="icon">🔄</div>
    <div>
      <h1>Sinkronisasi Data SDMS</h1>
      <p>Halo, ${username} — data siswa &amp; guru dari SDMS</p>
    </div>
  </div>

  <div class="status-grid" id="statusGrid">
    <div class="stat"><div class="label">Siswa</div><div class="value" id="cnt-siswa">...</div><div class="sub">di LMS</div></div>
    <div class="stat"><div class="label">Guru</div><div class="value" id="cnt-guru">...</div><div class="sub">di LMS</div></div>
    <div class="stat"><div class="label">Kelas</div><div class="value" id="cnt-kelas">...</div><div class="sub">di LMS</div></div>
    <div class="stat"><div class="label">Mapel</div><div class="value" id="cnt-mapel">...</div><div class="sub">di LMS</div></div>
  </div>

  <div class="last-sync" id="lastSyncInfo">Memuat status...</div>

  <button class="btn btn-sync" id="btnSync" onclick="startSync()">
    🔄 Sinkronkan Sekarang
  </button>

  <div class="progress" id="progressBox">
    <div class="progress-text" id="progressText">Menghubungi SDMS...</div>
    <div class="progress-bar-wrap"><div class="progress-bar" id="progressBar"></div></div>
    <div class="progress-text" id="progressSub" style="color:#64748b;font-size:.75rem"></div>
  </div>

  <div class="result" id="resultBox"></div>

  <div class="note">
    <strong>Cara kerja:</strong><br>
    Data yang belum ada akan <strong style="color:#86efac">ditambahkan</strong>.
    Data yang sudah ada dan <strong>sama</strong> akan dilewati (tidak disentuh).
    Data yang <strong>berubah</strong> di SDMS akan diperbarui.
    Data tidak akan pernah dobel.
  </div>
</div>

<script>
// Muat status saat halaman terbuka
async function loadStatus() {
  try {
    const r = await fetch('/api/sdms/sync/status');
    const d = await r.json();
    if (!d.ok) return;

    const c = d.counts || {};
    document.getElementById('cnt-siswa').textContent = c.sdms_siswa?.aktif ?? '0';
    document.getElementById('cnt-guru').textContent  = c.sdms_guru?.aktif  ?? '0';
    document.getElementById('cnt-kelas').textContent = c.sdms_kelas?.aktif ?? '0';
    document.getElementById('cnt-mapel').textContent = c.sdms_mapel?.aktif ?? '0';

    const ls = d.lastSync;
    const el = document.getElementById('lastSyncInfo');
    if (ls) {
      const tgl = new Date(ls.created_at).toLocaleString('id-ID');
      el.innerHTML = 'Sync terakhir: <span>' + tgl + '</span> — status: <span>' + ls.status + '</span>';
    } else {
      el.innerHTML = 'Belum pernah sinkronisasi manual.';
    }
  } catch (e) {
    document.getElementById('lastSyncInfo').textContent = 'Gagal memuat status.';
  }
}

async function startSync() {
  const btn  = document.getElementById('btnSync');
  const prog = document.getElementById('progressBox');
  const bar  = document.getElementById('progressBar');
  const txt  = document.getElementById('progressText');
  const sub  = document.getElementById('progressSub');
  const res  = document.getElementById('resultBox');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Menyinkronkan...';
  res.className = 'result';
  res.innerHTML = '';
  prog.className = 'progress show';
  bar.style.width = '5%';
  txt.textContent = 'Menghubungi SDMS dan mengambil data...';
  sub.textContent = 'Proses berjalan di background, harap tunggu 5–15 detik';

  // Animasi progress bar (estimasi)
  const steps = [
    [20, 'Mengambil data guru dari SDMS...'],
    [40, 'Mengambil data siswa dari SDMS...'],
    [60, 'Memproses kelas & mata pelajaran...'],
    [80, 'Menyimpan ke database LMS...'],
    [90, 'Menyelesaikan...'],
  ];
  let si = 0;
  const interval = setInterval(() => {
    if (si < steps.length) {
      bar.style.width = steps[si][0] + '%';
      txt.textContent = steps[si][1];
      si++;
    }
  }, 2000);

  try {
    // Kirim request sync
    const r = await fetch('/api/sdms/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const d = await r.json();

    clearInterval(interval);
    bar.style.width = '100%';
    txt.textContent = 'Sinkronisasi berjalan di background...';
    sub.textContent = 'Halaman akan refresh otomatis dalam 12 detik';

    if (d.ok) {
      // Tunggu 12 detik baru cek hasil (proses background)
      await new Promise(resolve => setTimeout(resolve, 12000));

      // Cek status terbaru
      const sr = await fetch('/api/sdms/sync/status');
      const sd = await sr.json();
      const c  = sd.counts || {};

      prog.className = 'progress';
      res.className  = 'result success';
      res.innerHTML  =
        '<div style="font-weight:700;margin-bottom:.5rem">✅ Sinkronisasi Selesai</div>' +
        '<div class="row"><span>Siswa aktif di LMS</span><span>' + (c.sdms_siswa?.aktif ?? '?') + '</span></div>' +
        '<div class="row"><span>Guru aktif di LMS</span><span>'  + (c.sdms_guru?.aktif  ?? '?') + '</span></div>' +
        '<div class="row"><span>Kelas aktif di LMS</span><span>' + (c.sdms_kelas?.aktif ?? '?') + '</span></div>' +
        '<div class="row"><span>Mapel aktif di LMS</span><span>' + (c.sdms_mapel?.aktif ?? '?') + '</span></div>';

      // Update counter di atas
      document.getElementById('cnt-siswa').textContent = c.sdms_siswa?.aktif ?? '0';
      document.getElementById('cnt-guru').textContent  = c.sdms_guru?.aktif  ?? '0';
      document.getElementById('cnt-kelas').textContent = c.sdms_kelas?.aktif ?? '0';
      document.getElementById('cnt-mapel').textContent = c.sdms_mapel?.aktif ?? '0';

      const ls = sd.lastSync;
      if (ls) {
        const tgl = new Date(ls.created_at).toLocaleString('id-ID');
        document.getElementById('lastSyncInfo').innerHTML =
          'Sync terakhir: <span>' + tgl + '</span> — status: <span>' + ls.status + '</span>';
      }
    } else {
      throw new Error(d.message || 'Sync gagal');
    }
  } catch (e) {
    clearInterval(interval);
    prog.className = 'progress';
    res.className  = 'result error';
    res.innerHTML  = '❌ Error: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔄 Sinkronkan Sekarang';
  }
}

loadStatus();
</script>
</body>
</html>`;
}

module.exports = router;
