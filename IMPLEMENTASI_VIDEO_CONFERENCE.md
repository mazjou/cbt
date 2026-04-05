# Implementasi Custom WebRTC Video Conference

## Overview
Live class sekarang menggunakan aplikasi WebRTC custom di **https://vc.tam.web.id/** menggantikan Jitsi Meet.

## Perubahan yang Dilakukan

### 1. Teacher Room (`src/views/teacher/live_class_room.ejs`)
- ✅ Menghapus Jitsi Meet API
- ✅ Menghapus sidebar (chat, peserta, quiz)
- ✅ Video conference full screen
- ✅ Tombol "Kembali" di header (kiri atas)
- ✅ Menggunakan iframe untuk embed aplikasi WebRTC custom
- ✅ Mengirim parameter ke WebRTC app:
  - `room`: ID room dengan prefix `LMS_`
  - `name`: Nama guru dengan emoji 👨‍🏫
  - `role`: `teacher`
  - `userId`: ID user dari database
  - `moderator`: `true` (guru sebagai moderator)

### 2. Student Room (`src/views/student/live_class_room.ejs`)
- ✅ Menghapus Jitsi Meet API
- ✅ Menghapus sidebar (chat, peserta, quiz)
- ✅ Video conference full screen
- ✅ Tombol "Kembali" di header (kiri atas)
- ✅ Menggunakan iframe untuk embed aplikasi WebRTC custom
- ✅ Mengirim parameter ke WebRTC app:
  - `room`: ID room dengan prefix `LMS_` (sama dengan guru)
  - `name`: Nama siswa dengan emoji 👨‍🎓
  - `role`: `student`
  - `userId`: ID user dari database
  - `moderator`: `false` (siswa bukan moderator)

## URL Format

### Guru
```
https://vc.tam.web.id/?room=LMS_abc123&name=👨‍🏫%20Pak%20Budi&role=teacher&userId=1&moderator=true
```

### Siswa
```
https://vc.tam.web.id/?room=LMS_abc123&name=👨‍🎓%20Ahmad&role=student&userId=123&moderator=false
```

## Parameter yang Dikirim

| Parameter | Deskripsi | Contoh |
|-----------|-----------|--------|
| `room` | ID room dengan prefix LMS_ | `LMS_abc123` |
| `name` | Nama user dengan emoji | `👨‍🏫 Pak Budi` |
| `role` | Role user (teacher/student) | `teacher` |
| `userId` | ID user dari database | `1` |
| `moderator` | Apakah user moderator | `true` / `false` |

## Fitur yang Tetap Berfungsi

✅ Tracking peserta (jumlah peserta aktif)
✅ Notifikasi join/leave
✅ Video conference full screen

## Fitur yang Dihapus (Disederhanakan)

❌ Chat real-time (gunakan chat di WebRTC app)
❌ Daftar peserta sidebar (gunakan participant list di WebRTC app)
❌ Live quiz (bisa ditambahkan kembali jika diperlukan)
❌ Leaderboard (bisa ditambahkan kembali jika diperlukan)

## Cara Kerja

1. **Guru membuat live class** → Sistem generate `room_id` unik
2. **Guru start live class** → Redirect ke room dengan iframe WebRTC full screen
3. **Siswa join live class** → Masuk ke room yang sama dengan guru
4. **WebRTC app** menerima parameter dan setup room sesuai role
5. **Tracking peserta** menggunakan Socket.io dari aplikasi LMS
6. **Chat & fitur lain** menggunakan fitur bawaan aplikasi WebRTC

## Testing

### Test sebagai Guru:
1. Login sebagai guru
2. Buat live class baru
3. Start live class
4. Cek apakah iframe WebRTC muncul dengan parameter yang benar
5. Cek console browser untuk URL yang di-generate

### Test sebagai Siswa:
1. Login sebagai siswa
2. Lihat daftar live class
3. Join live class yang sedang LIVE
4. Cek apakah iframe WebRTC muncul dengan parameter yang benar
5. Pastikan masuk ke room yang sama dengan guru

## Troubleshooting

### Iframe tidak muncul
- Cek console browser untuk error
- Pastikan https://vc.tam.web.id/ dapat diakses
- Cek apakah browser memblokir iframe (mixed content)

### Parameter tidak terkirim
- Cek URL di console browser
- Pastikan aplikasi WebRTC menerima query parameters
- Cek encoding URL (spasi jadi %20, dll)

### Camera/Microphone tidak berfungsi
- Pastikan browser memiliki permission
- Cek iframe `allow` attribute sudah benar
- Pastikan aplikasi WebRTC request permission

## UI/UX

### Layout
- Header dengan tombol "Kembali", judul live class, dan jumlah peserta
- Video conference full screen (100% width & height)
- Tidak ada sidebar (clean & simple)

### Navigasi
- Tombol "Kembali" di kiri atas untuk kembali ke daftar live class
- Guru: Tombol "Akhiri Live Class" di kanan atas

### Responsif
- Layout full screen optimal untuk desktop dan tablet
- Mobile: Iframe WebRTC akan adjust otomatis

Jika aplikasi WebRTC Anda membutuhkan parameter tambahan, edit di:

**Teacher:** `src/views/teacher/live_class_room.ejs` line ~70-75
```javascript
webrtcUrl.searchParams.set('customParam', 'value');
```

**Student:** `src/views/student/live_class_room.ejs` line ~70-75
```javascript
webrtcUrl.searchParams.set('customParam', 'value');
```

## Keamanan

- ✅ Room ID di-generate dengan `nanoid` (random & unik)
- ✅ User ID dikirim untuk tracking
- ✅ Role dikirim untuk authorization di WebRTC app
- ⚠️ Pastikan aplikasi WebRTC Anda validasi parameter
- ⚠️ Jangan expose sensitive data di URL

## Catatan Penting

1. **Same Room ID**: Guru dan siswa harus join ke room yang sama (`LMS_${roomId}`)
2. **Moderator**: Hanya guru yang jadi moderator
3. **Emoji**: Emoji di nama membantu identifikasi visual
4. **Iframe Permissions**: Sudah include camera, microphone, fullscreen, display-capture
5. **Error Handling**: Ada fallback UI jika WebRTC gagal load

## Rollback ke Jitsi (jika diperlukan)

Jika ingin kembali ke Jitsi Meet, restore dari git history atau:
1. Tambahkan kembali `<script src="https://meet.jit.si/external_api.js"></script>`
2. Ganti `initWebRTC()` dengan `initJitsi()`
3. Restore fungsi `loadJitsiMeet()` dan `jitsiApi` variable

---

**Status**: ✅ Implemented
**Tested**: ⏳ Pending user testing
**Version**: 1.0.0
**Date**: 2026-03-06
