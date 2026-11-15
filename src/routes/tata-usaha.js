const express = require('express');
const pool = require('../db/pool');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Semua route dilindungi role TATA_USAHA
router.use(requireRole('TATA_USAHA'));

router.get('/', async (req, res) => {
  const user = req.session.user;
  try {
    // Rekap statistik: jumlah siswa aktif, kelas, guru, pegawai TU
    const [[sCnt]]  = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE role='STUDENT' AND is_active=true;`);
    const [[kCnt]]  = await pool.query(`SELECT COUNT(*) AS c FROM classes;`);
    const [[tCnt]]  = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE role='TEACHER' AND is_active=true;`);
    const [[tuCnt]] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE role='TATA_USAHA' AND is_active=true;`);

    return res.render('tata-usaha/index', {
      title: 'Dashboard Tata Usaha',
      summary: {
        siswa: sCnt.c,
        kelas: kCnt.c,
        guru: tCnt.c,
        pegawai_tu: tuCnt.c
      },
      user
    });
  } catch (e) {
    console.error(e);
    return res.status(500).render('error', {
      title: 'Error',
      message: 'Gagal memuat dashboard Tata Usaha.',
      user
    });
  }
});

module.exports = router;
