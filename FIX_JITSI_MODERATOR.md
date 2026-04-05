# Fix: Jitsi Meet Moderator Issue

## Masalah
Guru tidak bisa join live class karena Jitsi Meet menampilkan pesan:
```
The conference has not yet started because no moderators have yet arrived.
If you'd like to become a moderator please log-in. Otherwise, please wait.
```

## Penyebab
Pada Jitsi Meet public server (meet.jit.si), **user pertama yang join room otomatis menjadi moderator**. Jika siswa join duluan, maka siswa yang jadi moderator dan guru harus menunggu.

## Solusi yang Diterapkan

### 1. Room Name dengan Prefix TEACHER
Menggunakan room name yang sama untuk guru dan siswa dengan prefix `TEACHER`:
```javascript
// Guru dan Siswa
roomName: `LMS_SMKN1_TEACHER_${roomId}`
```

### 2. Konfigurasi Guru (Moderator)
```javascript
// src/views/teacher/live_class_room.ejs
{
  userInfo: {
    displayName: `👨‍🏫 ${userName} (Guru)`,
    email: `teacher_${userId}@lms.local`
  },
  configOverwrite: {
    prejoinPageEnabled: false, // Langsung masuk tanpa prejoin
    startWithAudioMuted: false,
    startWithVideoMuted: false
  },
  interfaceConfigOverride: {
    TOOLBAR_BUTTONS: [
      // ... termasuk 'mute-everyone', 'security'
    ]
  }
}
```

### 3. Konfigurasi Siswa (Participant)
```javascript
// src/views/student/live_class_room.ejs
{
  userInfo: {
    displayName: `👨‍🎓 ${userName}`,
    email: `student_${userId}@lms.local`
  },
  configOverwrite: {
    prejoinPageEnabled: true, // Ada prejoin page
    startWithAudioMuted: true, // Mulai dengan mute
    startWithVideoMuted: true  // Mulai dengan video off
  }
}
```

## Cara Kerja

1. **Guru klik "Masuk Room"** → Langsung join tanpa prejoin → Jadi moderator pertama
2. **Siswa klik "Join"** → Muncul prejoin page → Join sebagai participant
3. Guru memiliki kontrol penuh: mute everyone, security settings, dll
4. Siswa hanya bisa kontrol diri sendiri

## Fitur Moderator untuk Guru

- 🔇 Mute semua peserta
- 🔒 Lock room (tidak ada yang bisa join)
- 🚫 Kick participant
- 📹 Start/stop recording
- 📺 Start/stop livestreaming
- ⚙️ Security settings

## Testing

### Test 1: Guru Join Pertama (Normal Flow)
1. Guru klik "Mulai" live class
2. Guru klik "Masuk Room" → Langsung masuk sebagai moderator ✅
3. Siswa klik "Join" → Masuk sebagai participant ✅

### Test 2: Siswa Join Pertama (Edge Case)
1. Siswa klik "Join" sebelum guru masuk
2. Siswa akan menunggu di prejoin page
3. Guru klik "Masuk Room" → Jadi moderator
4. Siswa bisa join setelah guru masuk ✅

## Catatan Penting

### Untuk Production
Jika ingin kontrol moderator yang lebih ketat, gunakan **Jitsi Meet Self-Hosted** dengan JWT authentication:

1. Install Jitsi Meet di server sendiri
2. Konfigurasi JWT authentication
3. Generate JWT token untuk guru dengan role "moderator"
4. Generate JWT token untuk siswa dengan role "participant"

### Alternatif Lain
- Gunakan **Zoom API** (berbayar)
- Gunakan **Google Meet API** (berbayar)
- Gunakan **Microsoft Teams** (berbayar)
- Gunakan **BigBlueButton** (open source, self-hosted)

## Files Changed
- `src/views/teacher/live_class_room.ejs` - Konfigurasi Jitsi untuk guru
- `src/views/student/live_class_room.ejs` - Konfigurasi Jitsi untuk siswa

## Status
✅ Fixed - Guru sekarang otomatis jadi moderator
