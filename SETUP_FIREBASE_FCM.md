## 🔥 Setup Firebase Cloud Messaging (FCM)

Firebase Cloud Messaging diperlukan untuk push notification native di Android.

### Langkah 1: Buat Project Firebase

1. Buka https://console.firebase.google.com
2. Klik "Add project" atau "Tambah project"
3. Nama project: `LMS SMKN 1 Kras`
4. Ikuti wizard setup (bisa disable Google Analytics jika tidak perlu)

### Langkah 2: Tambahkan Android App

1. Di Firebase Console, klik icon Android (⚙️)
2. Isi form:
   - **Android package name**: `id.sch.smkn1kras.lms`
   - **App nickname**: `LMS SMKN 1 Kras`
   - **Debug signing certificate SHA-1**: (opsional untuk development)
3. Klik "Register app"

### Langkah 3: Download google-services.json

1. Download file `google-services.json`
2. Copy file ke folder: `android/app/google-services.json`

```bash
# Pastikan file ada di lokasi ini:
android/app/google-services.json
```

### Langkah 4: Enable Cloud Messaging API

1. Di Firebase Console, pergi ke Project Settings
2. Tab "Cloud Messaging"
3. Copy "Server key" (akan digunakan untuk backend)
4. Simpan key ini di `.env`:

```env
FIREBASE_SERVER_KEY=your_server_key_here
```

### Langkah 5: Update Android Configuration

File `android/app/build.gradle` sudah otomatis dikonfigurasi oleh Capacitor, tapi pastikan ada:

```gradle
dependencies {
    implementation 'com.google.firebase:firebase-messaging:23.0.0'
}

apply plugin: 'com.google.gms.google-services'
```

### Langkah 6: Test Push Notification

#### Test dari Firebase Console:
1. Firebase Console → Cloud Messaging
2. Klik "Send your first message"
3. Isi:
   - **Notification title**: "Test Notifikasi"
   - **Notification text**: "Ini adalah test push notification"
4. Klik "Send test message"
5. Masukkan FCM token dari device (lihat di console log app)

#### Test dari Backend:
Gunakan endpoint yang sudah dibuat:

```javascript
// src/utils/push-notifications.js
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('../../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function sendPushNotification(userId, title, message, data = {}) {
  try {
    // Get device tokens for user
    const [tokens] = await pool.query(
      'SELECT token FROM device_tokens WHERE user_id = ?',
      [userId]
    );

    if (tokens.length === 0) {
      console.log('No device tokens found for user:', userId);
      return;
    }

    const fcmTokens = tokens.map(t => t.token);

    // Send notification
    const payload = {
      notification: {
        title,
        body: message,
        icon: '/public/images/logo.png',
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      }
    };

    const response = await admin.messaging().sendToDevice(fcmTokens, payload);
    console.log('Push notification sent:', response);
    
    return response;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
}

module.exports = { sendPushNotification };
```

### Langkah 7: Integrasi dengan Notifikasi Existing

Update `src/utils/notifications.js` untuk mengirim push notification:

```javascript
const { sendPushNotification } = require('./push-notifications');

async function createNotificationForClass({ classId, title, message, type, referenceId = null }) {
  // ... existing code ...

  // Send push notifications to all students
  for (const student of students) {
    try {
      await sendPushNotification(student.id, title, message, {
        type,
        reference_id: referenceId
      });
    } catch (error) {
      console.error('Failed to send push to student:', student.id, error);
    }
  }

  return students.length;
}
```

### Troubleshooting

#### Token tidak terdaftar:
- Pastikan app sudah request permission
- Cek console log untuk FCM token
- Pastikan endpoint `/api/device/register` dipanggil

#### Notifikasi tidak muncul:
- Cek Firebase Console → Cloud Messaging → Logs
- Pastikan google-services.json sudah di copy
- Rebuild app setelah menambahkan google-services.json

#### Error "Default FirebaseApp is not initialized":
- Pastikan google-services.json ada di `android/app/`
- Clean & rebuild project di Android Studio

### Testing Checklist

- [ ] Firebase project created
- [ ] Android app registered
- [ ] google-services.json downloaded & placed
- [ ] Server key saved in .env
- [ ] App rebuilt after adding google-services.json
- [ ] Permission requested in app
- [ ] Token registered to backend
- [ ] Test notification sent from Firebase Console
- [ ] Test notification sent from backend
- [ ] Notification received on device
- [ ] Notification click opens correct page

### Resources

- Firebase Console: https://console.firebase.google.com
- FCM Documentation: https://firebase.google.com/docs/cloud-messaging
- Capacitor Push Notifications: https://capacitorjs.com/docs/apis/push-notifications
