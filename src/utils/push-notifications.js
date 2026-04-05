const pool = require('../db/pool');

// Firebase Admin SDK akan diinisialisasi setelah google-services.json tersedia
let admin = null;

try {
  admin = require('firebase-admin');
  
  // Check if service account file exists
  const fs = require('fs');
  const path = require('path');
  const serviceAccountPath = path.join(__dirname, '..', '..', 'firebase-service-account.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin SDK initialized');
    }
  } else {
    console.warn('⚠️  firebase-service-account.json not found. Push notifications will not work.');
    console.warn('   Download from Firebase Console → Project Settings → Service Accounts');
    admin = null;
  }
} catch (error) {
  console.warn('⚠️  Firebase Admin SDK not available:', error.message);
  console.warn('   Install: npm install firebase-admin');
  admin = null;
}

/**
 * Send push notification to specific user
 * @param {number} userId - User ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data
 */
async function sendPushNotification(userId, title, message, data = {}) {
  if (!admin) {
    console.log('Push notifications disabled (Firebase Admin SDK not initialized)');
    return { success: false, reason: 'Firebase not initialized' };
  }

  try {
    // Get device tokens for user
    const [tokens] = await pool.query(
      'SELECT token FROM device_tokens WHERE user_id = :userId',
      { userId }
    );

    if (tokens.length === 0) {
      console.log('No device tokens found for user:', userId);
      return { success: false, reason: 'No tokens' };
    }

    const fcmTokens = tokens.map(t => t.token);

    // Prepare notification payload
    const payload = {
      notification: {
        title,
        body: message,
        icon: '/public/images/logo.png',
        sound: 'default',
        badge: '1'
      },
      data: {
        ...data,
        title,
        body: message,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'lms_notifications',
          sound: 'default',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true
        }
      }
    };

    // Send to all tokens
    const results = await Promise.allSettled(
      fcmTokens.map(token => 
        admin.messaging().send({
          token,
          ...payload
        })
      )
    );

    // Count successes and failures
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`Push notification sent: ${successful} success, ${failed} failed`);

    // Remove invalid tokens
    const invalidTokens = [];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const error = result.reason;
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(fcmTokens[index]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await pool.query(
        'DELETE FROM device_tokens WHERE token IN (?)',
        [invalidTokens]
      );
      console.log(`Removed ${invalidTokens.length} invalid tokens`);
    }

    return {
      success: true,
      successful,
      failed,
      total: fcmTokens.length
    };
  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification to multiple users
 * @param {Array<number>} userIds - Array of user IDs
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data
 */
async function sendPushNotificationToMultipleUsers(userIds, title, message, data = {}) {
  if (!admin) {
    console.log('Push notifications disabled (Firebase Admin SDK not initialized)');
    return { success: false, reason: 'Firebase not initialized' };
  }

  try {
    const results = await Promise.allSettled(
      userIds.map(userId => sendPushNotification(userId, title, message, data))
    );

    const totalSuccessful = results
      .filter(r => r.status === 'fulfilled' && r.value.success)
      .reduce((sum, r) => sum + (r.value.successful || 0), 0);

    const totalFailed = results
      .filter(r => r.status === 'fulfilled' && r.value.success)
      .reduce((sum, r) => sum + (r.value.failed || 0), 0);

    console.log(`Bulk push sent: ${totalSuccessful} success, ${totalFailed} failed to ${userIds.length} users`);

    return {
      success: true,
      users: userIds.length,
      successful: totalSuccessful,
      failed: totalFailed
    };
  } catch (error) {
    console.error('Error sending bulk push notifications:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification to all students in a class
 * @param {number} classId - Class ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data
 */
async function sendPushNotificationToClass(classId, title, message, data = {}) {
  try {
    // Get all students in class
    const [students] = await pool.query(
      "SELECT id FROM users WHERE role='STUDENT' AND class_id=:classId AND is_active=1",
      { classId }
    );

    if (students.length === 0) {
      console.log('No students found in class:', classId);
      return { success: false, reason: 'No students' };
    }

    const userIds = students.map(s => s.id);
    return await sendPushNotificationToMultipleUsers(userIds, title, message, data);
  } catch (error) {
    console.error('Error sending push to class:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendPushNotification,
  sendPushNotificationToMultipleUsers,
  sendPushNotificationToClass
};
