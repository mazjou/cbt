const pool = require('../db/pool');
const { sendPushNotification, sendPushNotificationToMultipleUsers } = require('./push-notifications');

/**
 * Membuat notifikasi untuk siswa berdasarkan class_id
 * @param {Object} params
 * @param {number|null} params.classId - ID kelas (null untuk semua siswa)
 * @param {string} params.title - Judul notifikasi
 * @param {string} params.message - Pesan notifikasi
 * @param {string} params.type - Tipe notifikasi: MATERIAL, EXAM, ANNOUNCEMENT
 * @param {number|null} params.referenceId - ID referensi (material_id atau exam_id)
 */
async function createNotificationForClass({ classId, title, message, type, referenceId = null }) {
  try {
    let students = [];
    
    if (classId) {
      [students] = await pool.query(
        `SELECT id FROM users WHERE role='STUDENT' AND class_id=:classId AND is_active=1;`,
        { classId }
      );
    } else {
      [students] = await pool.query(
        `SELECT id FROM users WHERE role='STUDENT' AND is_active=1;`
      );
    }

    if (students.length === 0) {
      console.log('No students found for notification');
      return 0;
    }

    // Insert notifikasi satu per satu dengan parameterized query
    for (const student of students) {
      await pool.query(
        `INSERT INTO notifications (class_id, title, message, type, reference_id, created_by)
         VALUES (:classId, :title, :message, :type, :referenceId, NULL)`,
        { classId: classId || null, title, message, type, referenceId: referenceId || null }
      );
    }

    console.log(`Created ${students.length} notifications for ${type}`);

    const userIds = students.map(s => s.id);
    await sendPushNotificationToMultipleUsers(userIds, title, message, {
      type,
      reference_id: referenceId
    });

    return students.length;
  } catch (error) {
    console.error('Error creating notifications:', error);
    throw error;
  }
}

/**
 * Membuat notifikasi untuk siswa berdasarkan multiple class_ids (untuk ujian dengan multiple classes)
 * @param {Object} params
 * @param {Array<number>} params.classIds - Array ID kelas
 * @param {string} params.title - Judul notifikasi
 * @param {string} params.message - Pesan notifikasi
 * @param {string} params.type - Tipe notifikasi: MATERIAL, EXAM, ANNOUNCEMENT
 * @param {number|null} params.referenceId - ID referensi (material_id atau exam_id)
 */
async function createNotificationForMultipleClasses({ classIds, title, message, type, referenceId = null }) {
  try {
    if (!classIds || classIds.length === 0) {
      console.log('No class IDs provided for notification');
      return 0;
    }

    // Ambil semua siswa di kelas-kelas tertentu (distinct untuk menghindari duplikat)
    const placeholders = classIds.map((_, i) => `$${i + 1}`).join(',');
    const [students] = await pool.query(
      `SELECT DISTINCT id FROM users WHERE role='STUDENT' AND class_id IN (${placeholders}) AND is_active=1;`,
      classIds
    );

    if (students.length === 0) {
      console.log('No students found for notification');
      return 0;
    }

    // Insert notifikasi satu per satu dengan parameterized query
    for (const student of students) {
      await pool.query(
        `INSERT INTO notifications (class_id, title, message, type, reference_id, created_by)
         VALUES (:classId, :title, :message, :type, :referenceId, NULL)`,
        { classId: classIds[0] || null, title, message, type, referenceId: referenceId || null }
      );
    }

    console.log(`Created ${students.length} notifications for ${type}`);

    // Send push notifications to all students
    const userIds = students.map(s => s.id);
    await sendPushNotificationToMultipleUsers(userIds, title, message, {
      type,
      reference_id: referenceId
    });

    return students.length;
  } catch (error) {
    console.error('Error creating notifications:', error);
    throw error;
  }
}

/**
 * Menandai notifikasi sebagai sudah dibaca
 * @param {number} notificationId - ID notifikasi
 * @param {number} userId - ID user
 */
async function markNotificationAsRead(notificationId, userId) {
  try {
    await pool.query(
      `UPDATE notifications SET is_read=1 WHERE id=:id AND user_id=:userId;`,
      { id: notificationId, userId }
    );
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Menandai semua notifikasi user sebagai sudah dibaca
 * @param {number} userId - ID user
 */
async function markAllNotificationsAsRead(userId) {
  try {
    await pool.query(
      `UPDATE notifications SET is_read=1 WHERE user_id=:userId AND is_read=0;`,
      { userId }
    );
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

/**
 * Mengambil notifikasi user dengan pagination
 * @param {number} userId - ID user
 * @param {number} limit - Jumlah notifikasi per halaman
 * @param {number} offset - Offset untuk pagination
 */
async function getUserNotifications(userId, limit = 20, offset = 0) {
  try {
    const [notifications] = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id=:userId 
       ORDER BY created_at DESC 
       LIMIT :limit OFFSET :offset;`,
      { userId, limit, offset }
    );
    return notifications;
  } catch (error) {
    console.error('Error getting user notifications:', error);
    throw error;
  }
}

/**
 * Menghitung jumlah notifikasi yang belum dibaca
 * @param {number} userId - ID user
 */
async function getUnreadNotificationCount(userId) {
  try {
    const [[result]] = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id=:userId AND is_read=0;`,
      { userId }
    );
    return result.count;
  } catch (error) {
    console.error('Error getting unread notification count:', error);
    throw error;
  }
}

module.exports = {
  createNotificationForClass,
  createNotificationForMultipleClasses,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUserNotifications,
  getUnreadNotificationCount
};
