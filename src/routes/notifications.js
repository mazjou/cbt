const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

function requireTeacherOrAdmin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Silakan login terlebih dahulu');
    return res.redirect('/login');
  }
  const role = req.session.user.role;
  if (role !== 'TEACHER' && role !== 'ADMIN') {
    req.flash('error', 'Akses ditolak.');
    return res.redirect('/dashboard');
  }
  next();
}

// ===== TEACHER/ADMIN ROUTES =====

router.get('/', requireTeacherOrAdmin, async (req, res) => {
  const user = req.session.user;
  try {
    const isAdmin = user.role === 'ADMIN';
    let notifications;
    if (isAdmin) {
      [notifications] = await pool.query(
        `SELECT n.*, u.username AS sender_name,
                (SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id = n.id) AS read_count
         FROM notifications n
         LEFT JOIN users u ON u.id = n.sender_id
         ORDER BY n.created_at DESC LIMIT 100`
      );
    } else {
      [notifications] = await pool.query(
        `SELECT n.*, u.username AS sender_name,
                (SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id = n.id) AS read_count
         FROM notifications n
         LEFT JOIN users u ON u.id = n.sender_id
         WHERE n.sender_id = :uid
         ORDER BY n.created_at DESC LIMIT 100`,
        { uid: user.id }
      );
    }
    res.render('notifications/index', { title: 'Kelola Notifikasi', notifications });
  } catch (error) {
    console.error('Error loading notifications:', error);
    req.flash('error', 'Gagal memuat notifikasi: ' + error.message);
    res.redirect('/dashboard');
  }
});

router.get('/new', requireTeacherOrAdmin, async (req, res) => {
  try {
    const [classes] = await pool.query('SELECT id, name FROM classes ORDER BY name ASC');
    const [students] = await pool.query(
      `SELECT u.id, u.username, u.full_name, c.name AS class_name, u.class_id
       FROM users u
       LEFT JOIN classes c ON c.id = u.class_id
       WHERE u.role = 'STUDENT'
       ORDER BY c.name ASC, u.full_name ASC`
    );
    res.render('notifications/new', { title: 'Buat Notifikasi Baru', classes, students });
  } catch (error) {
    console.error('Error loading form:', error);
    req.flash('error', 'Gagal memuat form: ' + error.message);
    res.redirect('/notifications');
  }
});

router.post('/new', requireTeacherOrAdmin, async (req, res) => {
  const user = req.session.user;
  const { title, message, type, target_type, target_id, expires_hours } = req.body;
  try {
    let expiresAt = null;
    if (expires_hours && Number(expires_hours) > 0) {
      expiresAt = new Date(Date.now() + Number(expires_hours) * 3600 * 1000);
    }
    const finalTargetId = (target_type !== 'all' && target_id) ? parseInt(target_id) || null : null;

    await pool.query(
      `INSERT INTO notifications (title, message, type, sender_id, sender_role, target_type, target_id, is_active, expires_at)
       VALUES (:title, :message, :type, :sender_id, :sender_role, :target_type, :target_id, true, :expires_at)`,
      {
        title, message,
        type: type || 'info',
        sender_id: user.id,
        sender_role: user.role,
        target_type: target_type || 'all',
        target_id: finalTargetId,
        expires_at: expiresAt
      }
    );
    req.flash('success', 'Notifikasi berhasil dibuat');
    res.redirect('/notifications');
  } catch (error) {
    console.error('Error creating notification:', error);
    req.flash('error', 'Gagal membuat notifikasi: ' + error.message);
    res.redirect('/notifications/new');
  }
});

router.get('/:id/edit', requireTeacherOrAdmin, async (req, res) => {
  const user = req.session.user;
  try {
    const [[notification]] = await pool.query(
      `SELECT * FROM notifications WHERE id = :id`, { id: req.params.id }
    );
    if (!notification) { req.flash('error', 'Notifikasi tidak ditemukan'); return res.redirect('/notifications'); }
    if (user.role !== 'ADMIN' && notification.sender_id !== user.id) {
      req.flash('error', 'Akses ditolak'); return res.redirect('/notifications');
    }
    const [classes] = await pool.query('SELECT id, name FROM classes ORDER BY name ASC');
    const [students] = await pool.query(
      `SELECT u.id, u.username, u.full_name, c.name AS class_name
       FROM users u LEFT JOIN classes c ON c.id = u.class_id
       WHERE u.role = 'STUDENT' ORDER BY c.name ASC, u.full_name ASC`
    );
    res.render('notifications/edit', { title: 'Edit Notifikasi', notification, classes, students });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Gagal memuat form: ' + error.message);
    res.redirect('/notifications');
  }
});

router.post('/:id/edit', requireTeacherOrAdmin, async (req, res) => {
  const user = req.session.user;
  const { title, message, type, target_type, target_id, expires_hours } = req.body;
  try {
    const [[notification]] = await pool.query(
      `SELECT sender_id FROM notifications WHERE id = :id`, { id: req.params.id }
    );
    if (!notification) { req.flash('error', 'Notifikasi tidak ditemukan'); return res.redirect('/notifications'); }
    if (user.role !== 'ADMIN' && notification.sender_id !== user.id) {
      req.flash('error', 'Akses ditolak'); return res.redirect('/notifications');
    }
    let expiresAt = null;
    if (expires_hours && Number(expires_hours) > 0) {
      expiresAt = new Date(Date.now() + Number(expires_hours) * 3600 * 1000);
    }
    const finalTargetId = (target_type !== 'all' && target_id) ? parseInt(target_id) || null : null;
    await pool.query(
      `UPDATE notifications SET title=:title, message=:message, type=:type,
       target_type=:target_type, target_id=:target_id, expires_at=:expires_at WHERE id=:id`,
      { title, message, type: type || 'info', target_type: target_type || 'all', target_id: finalTargetId, expires_at: expiresAt, id: req.params.id }
    );
    req.flash('success', 'Notifikasi berhasil diupdate');
    res.redirect('/notifications');
  } catch (error) {
    console.error(error);
    req.flash('error', 'Gagal update: ' + error.message);
    res.redirect(`/notifications/${req.params.id}/edit`);
  }
});

router.post('/:id/toggle', requireTeacherOrAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_active = NOT is_active WHERE id = :id`,
      { id: req.params.id }
    );
    req.flash('success', 'Status notifikasi diubah');
  } catch (error) {
    console.error(error);
    req.flash('error', 'Gagal mengubah status');
  }
  res.redirect('/notifications');
});

router.post('/:id/delete', requireTeacherOrAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM notifications WHERE id = :id`, { id: req.params.id });
    req.flash('success', 'Notifikasi dihapus');
  } catch (error) {
    console.error(error);
    req.flash('error', 'Gagal menghapus');
  }
  res.redirect('/notifications');
});

// ===== STUDENT ROUTES =====

router.get('/active', async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== 'STUDENT') return res.json({ notifications: [] });
  try {
    const [[studentData]] = await pool.query(
      `SELECT class_id FROM users WHERE id = :id`, { id: user.id }
    );
    const classId = studentData?.class_id;
    const [notifications] = await pool.query(
      `SELECT n.id, n.title, n.message, n.type, n.created_at
       FROM notifications n
       WHERE n.is_active = true
         AND (n.expires_at IS NULL OR n.expires_at > NOW())
         AND (
           n.target_type = 'all'
           OR (n.target_type = 'class' AND n.target_id = :class_id)
           OR (n.target_type = 'student' AND n.target_id = :uid)
         )
         AND NOT EXISTS (
           SELECT 1 FROM notification_reads nr
           WHERE nr.notification_id = n.id AND nr.user_id = :uid
         )
       ORDER BY n.created_at DESC LIMIT 5`,
      { class_id: classId || 0, uid: user.id }
    );
    res.json({ notifications });
  } catch (error) {
    console.error('Error getting active notifications:', error);
    res.json({ notifications: [] });
  }
});

router.post('/:id/read', async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== 'STUDENT') return res.status(403).json({ error: 'Forbidden' });
  try {
    await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       VALUES (:nid, :uid)
       ON CONFLICT (notification_id, user_id) DO NOTHING`,
      { nid: req.params.id, uid: user.id }
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
