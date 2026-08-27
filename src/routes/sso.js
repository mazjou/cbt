/**
 * SSO Callback Route — LMS SMKN 1 Kras
 * ======================================
 * Menerima redirect dari SDMS setelah user klik aplikasi LMS di App Hub.
 * URL: GET /sso/callback?token=<sso_token>&from=sdms
 *
 * Flow:
 *   SDMS App Hub → redirect ke /sso/callback?token=xxx
 *   → verifikasi JWT dengan SSO_SECRET_LMS
 *   → cari/buat user di DB LMS
 *   → buat session → redirect ke dashboard
 */

'use strict';

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');

const SSO_SECRET_LMS = process.env.SSO_SECRET_LMS || 'sso_secret_lms';

// ── SSO Callback ─────────────────────────────────────────────
router.get('/sso/callback', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    console.warn('[SSO] ⚠️ Token tidak ada di query string');
    return res.redirect('/login?error=sso_no_token');
  }

  try {
    // 1. Verifikasi JWT — secret harus sama dengan SSO_SECRET_LMS di .env LMS
    //    dan SSO_SECRET_LMS di .env SDMS
    const decoded = jwt.verify(token, SSO_SECRET_LMS, {
      audience: 'lms',
      issuer:   'sdms-core',
    });

    const pool = req.app.locals.pool;

    // 2. Cari user di LMS berdasarkan username dari SDMS
    // Pool wrapper LMS mengembalikan [rows, fields] — ambil index 0
    const [existingRows] = await pool.query(
      'SELECT id, username, full_name, role, is_active FROM users WHERE username = $1 LIMIT 1',
      [decoded.username]
    );

    let lmsUser = existingRows[0];

    // 3. Kalau belum ada → buat user baru otomatis
    if (!lmsUser) {
      const lmsRole   = mapRole(decoded.role);
      const dummyHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

      const [newRows] = await pool.query(
        `INSERT INTO users (username, full_name, role, password_hash, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         RETURNING id, username, full_name, role, is_active`,
        [decoded.username, decoded.full_name || decoded.username, lmsRole, dummyHash]
      );

      lmsUser = newRows[0];
      console.log(`[SSO] ✅ User baru dibuat: ${decoded.username} (${lmsRole})`);
    }

    // 4. Cek user aktif
    if (!lmsUser.is_active) {
      console.warn(`[SSO] ⚠️ User tidak aktif: ${lmsUser.username}`);
      return res.redirect('/login?error=sso_inactive');
    }

    // 5. Update full_name jika berubah di SDMS
    if (decoded.full_name && decoded.full_name !== lmsUser.full_name) {
      await pool.query(
        'UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2',
        [decoded.full_name, lmsUser.id]
      );
      lmsUser.full_name = decoded.full_name;
    }

    // 6. Buat session LMS
    req.session.user = {
      id:        lmsUser.id,
      username:  lmsUser.username,
      full_name: lmsUser.full_name,
      role:      lmsUser.role,
      sso:       true,
      sdms_id:   decoded.sub,
    };

    // Simpan session ke Redis dulu sebelum redirect
    // Ini penting agar session sudah tersimpan saat browser membuka halaman berikutnya
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const destination = getDashboard(lmsUser.role);
    console.log(`[SSO] ✅ Login berhasil: ${lmsUser.username} (${lmsUser.role}) → ${destination}`);
    return res.redirect(destination);

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.warn('[SSO] ⚠️ Token kadaluarsa');
      return res.redirect('/login?error=sso_expired');
    }
    if (err.name === 'JsonWebTokenError') {
      console.warn('[SSO] ⚠️ Token tidak valid:', err.message);
      return res.redirect('/login?error=sso_invalid');
    }
    console.error('[SSO] ❌ Error:', err.message);
    return res.redirect('/login?error=sso_error');
  }
});

// ── Helper: mapping role SDMS → role LMS ─────────────────────
function mapRole(sdmsRole) {
  const map = {
    super_admin: 'ADMIN',
    admin:       'ADMIN',
    guru:        'TEACHER',
    pegawai:     'ADMIN',
    siswa:       'STUDENT',
    operator:    'TEACHER',
  };
  return map[sdmsRole] || 'STUDENT';
}

// ── Helper: redirect sesuai role ─────────────────────────────
function getDashboard(role) {
  const map = {
    ADMIN:     '/admin',
    TEACHER:   '/teacher',           // coba /teacher dulu
    STUDENT:   '/student',
    PRINCIPAL: '/principal/dashboard',
  };
  return map[role] || '/dashboard';
}

module.exports = router;
