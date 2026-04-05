const express = require('express');
const { nanoid } = require('nanoid');
const pool = require('../db/pool');
const { requireRole, requireAuth } = require('../middleware/auth');
const { createNotificationForClass } = require('../utils/notifications');

const router = express.Router();

// ===== TEACHER ROUTES =====

// Get all live classes for teacher
router.get('/teacher/live-classes', requireRole('TEACHER'), async (req, res) => {
  try {
    const user = req.session.user;
    const [liveClasses] = await pool.query(
      `SELECT lc.*, s.name AS subject_name, c.name AS class_name,
              (SELECT COUNT(*) FROM live_class_participants lcp 
               WHERE lcp.live_class_id = lc.id AND lcp.left_at IS NULL) AS active_participants
       FROM live_classes lc
       JOIN subjects s ON s.id = lc.subject_id
       LEFT JOIN classes c ON c.id = lc.class_id
       WHERE lc.teacher_id = :teacherId
       ORDER BY lc.scheduled_at DESC`,
      { teacherId: user.id }
    );

    res.render('teacher/live_classes', {
      title: 'Live Classes',
      liveClasses
    });
  } catch (error) {
    console.error('Error fetching live classes:', error);
    req.flash('error', 'Gagal memuat live classes');
    res.redirect('/teacher');
  }
});

// Create live class form
router.get('/teacher/live-classes/new', requireRole('TEACHER'), async (req, res) => {
  try {
    const [subjects] = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
    const [classes] = await pool.query('SELECT * FROM classes ORDER BY name ASC');

    res.render('teacher/live_class_new', {
      title: 'Buat Live Class',
      subjects,
      classes
    });
  } catch (error) {
    console.error('Error loading form:', error);
    req.flash('error', 'Gagal memuat form');
    res.redirect('/teacher/live-classes');
  }
});

// Create live class
router.post('/teacher/live-classes', requireRole('TEACHER'), async (req, res) => {
  try {
    const user = req.session.user;
    const { subject_id, class_id, title, description, scheduled_at, duration_minutes, max_participants } = req.body;

    const roomId = nanoid(10);

    const [result] = await pool.query(
      `INSERT INTO live_classes (teacher_id, subject_id, class_id, title, description, room_id, scheduled_at, duration_minutes, max_participants)
       VALUES (:teacherId, :subjectId, :classId, :title, :description, :roomId, :scheduledAt, :durationMinutes, :maxParticipants)`,
      {
        teacherId: user.id,
        subjectId: subject_id,
        classId: class_id || null,
        title,
        description: description || null,
        roomId,
        scheduledAt: scheduled_at,
        durationMinutes: duration_minutes || 60,
        maxParticipants: max_participants || 100
      }
    );

    // Send notification to students
    if (class_id) {
      await createNotificationForClass({
        classId: class_id,
        title: `Live Class: ${title}`,
        message: `Guru telah menjadwalkan live class "${title}" pada ${new Date(scheduled_at).toLocaleString('id-ID')}`,
        type: 'ANNOUNCEMENT',
        referenceId: result.insertId
      });
    }

    req.flash('success', 'Live class berhasil dibuat');
    res.redirect('/teacher/live-classes');
  } catch (error) {
    console.error('Error creating live class:', error);
    req.flash('error', 'Gagal membuat live class');
    res.redirect('/teacher/live-classes/new');
  }
});

// Start live class
router.post('/teacher/live-classes/:id/start', requireRole('TEACHER'), async (req, res) => {
  try {
    const user = req.session.user;
    const liveClassId = req.params.id;

    await pool.query(
      `UPDATE live_classes
       SET status = 'LIVE', started_at = NOW()
       WHERE id = :id AND teacher_id = :teacherId`,
      { id: liveClassId, teacherId: user.id }
    );

    req.flash('success', 'Live class dimulai');
    res.redirect(`/teacher/live-classes/${liveClassId}/room`);
  } catch (error) {
    console.error('Error starting live class:', error);
    req.flash('error', 'Gagal memulai live class');
    res.redirect('/teacher/live-classes');
  }
});

// End live class
router.post('/teacher/live-classes/:id/end', requireRole('TEACHER'), async (req, res) => {
  try {
    const user = req.session.user;
    const liveClassId = req.params.id;

    await pool.query(
      `UPDATE live_classes
       SET status = 'ENDED', ended_at = NOW()
       WHERE id = :id AND teacher_id = :teacherId`,
      { id: liveClassId, teacherId: user.id }
    );

    req.flash('success', 'Live class diakhiri');
    res.redirect('/teacher/live-classes');
  } catch (error) {
    console.error('Error ending live class:', error);
    req.flash('error', 'Gagal mengakhiri live class');
    res.redirect('/teacher/live-classes');
  }
});

// Live class room (teacher)
router.get('/teacher/live-classes/:id/room', requireRole('TEACHER'), async (req, res) => {
  try {
    const user = req.session.user;
    const liveClassId = req.params.id;

    const [[liveClass]] = await pool.query(
      `SELECT lc.*, s.name AS subject_name, c.name AS class_name
       FROM live_classes lc
       JOIN subjects s ON s.id = lc.subject_id
       LEFT JOIN classes c ON c.id = lc.class_id
       WHERE lc.id = :id AND lc.teacher_id = :teacherId`,
      { id: liveClassId, teacherId: user.id }
    );

    if (!liveClass) {
      req.flash('error', 'Live class tidak ditemukan');
      return res.redirect('/teacher/live-classes');
    }

    res.render('teacher/live_class_room', {
      title: `Live Class: ${liveClass.title}`,
      liveClass
    });
  } catch (error) {
    console.error('Error loading live class room:', error);
    req.flash('error', 'Gagal memuat live class room');
    res.redirect('/teacher/live-classes');
  }
});

// Live class report (teacher)
router.get('/teacher/live-classes/:id/report', requireRole('TEACHER'), async (req, res) => {
  try {
    const user = req.session.user;
    const liveClassId = req.params.id;

    // Get live class details
    const [[liveClass]] = await pool.query(
      `SELECT lc.*, s.name AS subject_name, c.name AS class_name
       FROM live_classes lc
       JOIN subjects s ON s.id = lc.subject_id
       LEFT JOIN classes c ON c.id = lc.class_id
       WHERE lc.id = :id AND lc.teacher_id = :teacherId`,
      { id: liveClassId, teacherId: user.id }
    );

    if (!liveClass) {
      req.flash('error', 'Live class tidak ditemukan');
      return res.redirect('/teacher/live-classes');
    }

    // Get all participants (including those who left)
    const [participants] = await pool.query(
      `SELECT lcp.*, u.full_name, u.username, u.class_id, c.name AS class_name,
              TIMESTAMPDIFF(MINUTE, lcp.joined_at, COALESCE(lcp.left_at, NOW())) AS duration_minutes
       FROM live_class_participants lcp
       JOIN users u ON u.id = lcp.user_id
       LEFT JOIN classes c ON c.id = u.class_id
       WHERE lcp.live_class_id = :id
       ORDER BY lcp.joined_at ASC`,
      { id: liveClassId }
    );

    // Calculate statistics
    const totalParticipants = participants.length;
    const uniqueParticipants = new Set(participants.map(p => p.user_id)).size;
    const avgDuration = participants.length > 0 
      ? Math.round(participants.reduce((sum, p) => sum + p.duration_minutes, 0) / participants.length)
      : 0;

    res.render('teacher/live_class_report', {
      title: `Laporan: ${liveClass.title}`,
      liveClass,
      participants,
      stats: {
        totalParticipants,
        uniqueParticipants,
        avgDuration
      }
    });
  } catch (error) {
    console.error('Error loading live class report:', error);
    req.flash('error', 'Gagal memuat laporan live class');
    res.redirect('/teacher/live-classes');
  }
});

// Edit live class form
router.get('/teacher/live-classes/:id/edit', requireRole('TEACHER'), async (req, res) => {
  try {
    const user = req.session.user;
    const liveClassId = req.params.id;

    const [[liveClass]] = await pool.query(
      `SELECT lc.*
       FROM live_classes lc
       WHERE lc.id = :id AND lc.teacher_id = :teacherId`,
      { id: liveClassId, teacherId: user.id }
    );

    if (!liveClass) {
      req.flash('error', 'Live class tidak ditemukan');
      return res.redirect('/teacher/live-classes');
    }

    // Only allow editing if status is SCHEDULED
    if (liveClass.status !== 'SCHEDULED') {
      req.flash('error', 'Hanya live class yang terjadwal yang bisa diedit');
      return res.redirect('/teacher/live-classes');
    }

    const [subjects] = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
    const [classes] = await pool.query('SELECT * FROM classes ORDER BY name ASC');

    res.render('teacher/live_class_edit', {
      title: 'Edit Live Class',
      liveClass,
      subjects,
      classes
    });
  } catch (error) {
    console.error('Error loading edit form:', error);
    req.flash('error', 'Gagal memuat form edit');
    res.redirect('/teacher/live-classes');
  }
});

// Update live class
router.post('/teacher/live-classes/:id/update', requireRole('TEACHER'), async (req, res) => {
  try {
    const user = req.session.user;
    const liveClassId = req.params.id;
    const { subject_id, class_id, title, description, scheduled_at, duration_minutes, max_participants } = req.body;

    // Verify ownership and status
    const [[liveClass]] = await pool.query(
      `SELECT * FROM live_classes WHERE id = :id AND teacher_id = :teacherId`,
      { id: liveClassId, teacherId: user.id }
    );

    if (!liveClass) {
      req.flash('error', 'Live class tidak ditemukan');
      return res.redirect('/teacher/live-classes');
    }

    if (liveClass.status !== 'SCHEDULED') {
      req.flash('error', 'Hanya live class yang terjadwal yang bisa diedit');
      return res.redirect('/teacher/live-classes');
    }

    await pool.query(
      `UPDATE live_classes
       SET subject_id = :subjectId,
           class_id = :classId,
           title = :title,
           description = :description,
           scheduled_at = :scheduledAt,
           duration_minutes = :durationMinutes,
           max_participants = :maxParticipants
       WHERE id = :id AND teacher_id = :teacherId`,
      {
        id: liveClassId,
        teacherId: user.id,
        subjectId: subject_id,
        classId: class_id || null,
        title,
        description: description || null,
        scheduledAt: scheduled_at,
        durationMinutes: duration_minutes || 60,
        maxParticipants: max_participants || 100
      }
    );

    req.flash('success', 'Live class berhasil diupdate');
    res.redirect('/teacher/live-classes');
  } catch (error) {
    console.error('Error updating live class:', error);
    req.flash('error', 'Gagal mengupdate live class');
    res.redirect('/teacher/live-classes');
  }
});

// Delete live class
router.post('/teacher/live-classes/:id/delete', requireRole('TEACHER'), async (req, res) => {
  try {
    const user = req.session.user;
    const liveClassId = req.params.id;

    // Verify ownership
    const [[liveClass]] = await pool.query(
      `SELECT * FROM live_classes WHERE id = :id AND teacher_id = :teacherId`,
      { id: liveClassId, teacherId: user.id }
    );

    if (!liveClass) {
      req.flash('error', 'Live class tidak ditemukan');
      return res.redirect('/teacher/live-classes');
    }

    // Don't allow deleting LIVE classes
    if (liveClass.status === 'LIVE') {
      req.flash('error', 'Tidak bisa menghapus live class yang sedang berlangsung');
      return res.redirect('/teacher/live-classes');
    }

    // Delete participants first (foreign key constraint)
    await pool.query(
      `DELETE FROM live_class_participants WHERE live_class_id = :id`,
      { id: liveClassId }
    );

    // Delete live class
    await pool.query(
      `DELETE FROM live_classes WHERE id = :id AND teacher_id = :teacherId`,
      { id: liveClassId, teacherId: user.id }
    );

    req.flash('success', 'Live class berhasil dihapus');
    res.redirect('/teacher/live-classes');
  } catch (error) {
    console.error('Error deleting live class:', error);
    req.flash('error', 'Gagal menghapus live class');
    res.redirect('/teacher/live-classes');
  }
});

// ===== STUDENT ROUTES =====

// Get all live classes for student
router.get('/student/live-classes', requireRole('STUDENT'), async (req, res) => {
  try {
    const user = req.session.user;
    const [liveClasses] = await pool.query(
      `SELECT lc.*, s.name AS subject_name, u.full_name AS teacher_name,
              (SELECT COUNT(*) FROM live_class_participants lcp 
               WHERE lcp.live_class_id = lc.id AND lcp.left_at IS NULL) AS active_participants,
              (SELECT lcp.joined_at FROM live_class_participants lcp
               WHERE lcp.live_class_id = lc.id AND lcp.user_id = :userId
               LIMIT 1) AS my_joined_at
       FROM live_classes lc
       JOIN subjects s ON s.id = lc.subject_id
       JOIN users u ON u.id = lc.teacher_id
       WHERE lc.class_id = :classId
       ORDER BY lc.scheduled_at DESC`,
      { classId: user.class_id, userId: user.id }
    );

    res.render('student/live_classes', {
      title: 'Live Classes',
      liveClasses
    });
  } catch (error) {
    console.error('Error fetching live classes:', error);
    req.flash('error', 'Gagal memuat live classes');
    res.redirect('/student');
  }
});

// Join live class room (student)
router.get('/student/live-classes/:id/join', requireRole('STUDENT'), async (req, res) => {
  try {
    const user = req.session.user;
    const liveClassId = req.params.id;

    const [[liveClass]] = await pool.query(
      `SELECT lc.*, s.name AS subject_name, u.full_name AS teacher_name
       FROM live_classes lc
       JOIN subjects s ON s.id = lc.subject_id
       JOIN users u ON u.id = lc.teacher_id
       WHERE lc.id = :id AND lc.class_id = :classId AND lc.status IN ('SCHEDULED', 'LIVE')`,
      { id: liveClassId, classId: user.class_id }
    );

    if (!liveClass) {
      req.flash('error', 'Live class tidak ditemukan atau sudah berakhir');
      return res.redirect('/student/live-classes');
    }

    res.render('student/live_class_room', {
      title: `Live Class: ${liveClass.title}`,
      liveClass
    });
  } catch (error) {
    console.error('Error joining live class:', error);
    req.flash('error', 'Gagal join live class');
    res.redirect('/student/live-classes');
  }
});

// ===== API ROUTES =====

// Get live class details (API)
router.get('/api/live-classes/:id', requireAuth, async (req, res) => {
  try {
    const liveClassId = req.params.id;

    const [[liveClass]] = await pool.query(
      `SELECT lc.*, s.name AS subject_name, c.name AS class_name, u.full_name AS teacher_name
       FROM live_classes lc
       JOIN subjects s ON s.id = lc.subject_id
       LEFT JOIN classes c ON c.id = lc.class_id
       JOIN users u ON u.id = lc.teacher_id
       WHERE lc.id = :id`,
      { id: liveClassId }
    );

    if (!liveClass) {
      return res.status(404).json({ success: false, message: 'Live class not found' });
    }

    res.json({ success: true, liveClass });
  } catch (error) {
    console.error('Error fetching live class:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get participants (API)
router.get('/api/live-classes/:id/participants', requireAuth, async (req, res) => {
  try {
    const liveClassId = req.params.id;

    const [participants] = await pool.query(
      `SELECT lcp.*, u.full_name, u.role
       FROM live_class_participants lcp
       JOIN users u ON u.id = lcp.user_id
       WHERE lcp.live_class_id = :id AND lcp.left_at IS NULL
       ORDER BY lcp.joined_at ASC`,
      { id: liveClassId }
    );

    res.json({ success: true, participants });
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
