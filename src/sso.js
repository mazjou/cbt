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
    // SDMS bisa mengirim username dalam format NISN@smkn1kras.sch.id atau NISN plain
    // Kita harus cari user yang cocok dengan salah satu format tersebut
    // agar tidak membuat duplikat
    const nisnPlain = decoded.username ? decoded.username.split('@')[0].trim() : '';
    const lmsRole   = mapRole(decoded.role);

    // Cari berdasarkan NISN plain dulu (akun utama), lalu username asli dari SDMS
    let lmsUser = null;
    if (nisnPlain) {
      const [byNisn] = await pool.query(
        `SELECT id, username, full_name, role, is_active, class_id FROM users
         WHERE username = $1 AND role = $2 LIMIT 1`,
        [nisnPlain, lmsRole]
      );
      lmsUser = byNisn[0] || null;
    }

    // Kalau belum ketemu dengan NISN plain, coba dengan username asli (NISN@domain)
    if (!lmsUser && decoded.username) {
      const [byFull] = await pool.query(
        `SELECT id, username, full_name, role, is_active, class_id FROM users
         WHERE username = $1 LIMIT 1`,
        [decoded.username]
      );
      lmsUser = byFull[0] || null;
    }

    // 3. Kalau belum ada → buat user baru dengan NISN plain sebagai username
    if (!lmsUser) {
      // Username pakai NISN plain (tanpa @domain) agar konsisten dengan sync SDMS
      const usernameToCreate = nisnPlain || decoded.username;
      const plainPass  = 'smkn1kras';
      const passHash   = await bcrypt.hash(plainPass, 10);

      const [newRows] = await pool.query(
        `INSERT INTO users
           (username, full_name, role, password_hash, plain_password, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
         RETURNING id, username, full_name, role, is_active, class_id`,
        [usernameToCreate, decoded.full_name || usernameToCreate, lmsRole, passHash, plainPass]
      );

      lmsUser = newRows[0];
      console.log(`[SSO] ✅ User baru dibuat: ${usernameToCreate} (${lmsRole})`);
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

    // 6. Buat session LMS — sertakan class_id untuk filter konten siswa
    req.session.user = {
      id:        lmsUser.id,
      username:  lmsUser.username,
      full_name: lmsUser.full_name,
      role:      lmsUser.role,
      class_id:  lmsUser.class_id || null,
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
