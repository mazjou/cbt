const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Login' });
});

// API endpoint for banner data (fast loading with caching)
router.get('/api/banner-data', async (req, res) => {
  try {
    // Simple in-memory cache (5 minutes)
    const cacheKey = 'banner-data';
    const cacheTime = 5 * 60 * 1000; // 5 minutes
    
    if (router.bannerCache && router.bannerCache.timestamp && 
        (Date.now() - router.bannerCache.timestamp) < cacheTime) {
      return res.json(router.bannerCache.data);
    }

    // Calculate date range for last week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0];

    // Get top 3 active classes (optimized query)
    const [activeClasses] = await pool.query(`
      SELECT 
        c.name as class_name,
        COUNT(DISTINCT at.id) + COUNT(DISTINCT mr.id) as activity_score
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'STUDENT'
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at >= :weekAgo
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at >= :weekAgo
      GROUP BY c.id, c.name
      HAVING COUNT(DISTINCT at.id) + COUNT(DISTINCT mr.id) > 0
      ORDER BY activity_score DESC
      LIMIT 3;
    `, { weekAgo: oneWeekAgoStr });

    // Get top 3 active students (optimized query)
    const [activeStudents] = await pool.query(`
      SELECT 
        u.full_name,
        c.name as class_name,
        COUNT(DISTINCT at.id) + COUNT(DISTINCT mr.id) + COUNT(DISTINCT asub.id) as activity_score
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at >= :weekAgo
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at >= :weekAgo
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at >= :weekAgo
      WHERE u.role = 'STUDENT' AND u.is_active = true
      GROUP BY u.id, u.full_name, c.name
      HAVING COUNT(DISTINCT at.id) + COUNT(DISTINCT mr.id) + COUNT(DISTINCT asub.id) > 0
      ORDER BY activity_score DESC
      LIMIT 3;
    `, { weekAgo: oneWeekAgoStr });

    // Get top 3 active teachers (optimized query)
    const [activeTeachers] = await pool.query(`
      SELECT 
        u.full_name,
        COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT a.id) as activity_score
      FROM users u
      LEFT JOIN exams e ON e.teacher_id = u.id AND e.created_at >= :weekAgo
      LEFT JOIN materials m ON m.teacher_id = u.id AND m.created_at >= :weekAgo
      LEFT JOIN assignments a ON a.teacher_id = u.id AND a.created_at >= :weekAgo
      WHERE u.role = 'TEACHER' AND u.is_active = true
      GROUP BY u.id, u.full_name
      HAVING COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT a.id) > 0
      ORDER BY activity_score DESC
      LIMIT 3;
    `, { weekAgo: oneWeekAgoStr });

    const responseData = {
      success: true,
      data: {
        activeClasses: activeClasses.map(c => c.class_name),
        activeStudents: activeStudents.map(s => ({ name: s.full_name, class: s.class_name })),
        activeTeachers: activeTeachers.map(t => t.full_name),
        weekPeriod: `${oneWeekAgoStr} - ${new Date().toISOString().split('T')[0]}`
      }
    };

    // Cache the result
    router.bannerCache = {
      data: responseData,
      timestamp: Date.now()
    };

    res.json(responseData);
  } catch (error) {
    console.error('Banner data error:', error);
    res.json({
      success: false,
      data: {
        activeClasses: [],
        activeStudents: [],
        activeTeachers: [],
        weekPeriod: 'Data tidak tersedia'
      }
    });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [[user]] = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.class_id, u.password_hash, u.profile_photo,
              c.name AS class_name, c.code AS class_code
       FROM users u
       LEFT JOIN classes c ON c.id = u.class_id
       WHERE u.username = :username AND u.is_active=true
       LIMIT 1;`,
      { username }
    );

    if (!user) {
      req.flash('error', 'Username tidak ditemukan atau akun nonaktif.');
      return res.redirect('/login');
    }

    const ok = await bcrypt.compare(password || '', user.password_hash);
    if (!ok) {
      req.flash('error', 'Password salah.');
      return res.redirect('/login');
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      class_id: user.class_id,
      class_name: user.class_name,
      class_code: user.class_code,
      profile_photo: user.profile_photo
    };

    req.flash('success', `Selamat datang, ${user.full_name}!`);
    return res.redirect('/dashboard');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Terjadi kesalahan saat login.');
    return res.redirect('/login');
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
