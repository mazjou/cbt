# Update Live Class - Simplified UI

## Perubahan yang Dilakukan

### ✅ Menghapus Sidebar
- Sidebar chat, peserta, dan quiz dihapus
- Video conference sekarang full screen
- UI lebih clean dan fokus ke video

### ✅ Menambahkan Tombol Kembali
- Tombol "Kembali" di header (kiri atas)
- Guru: Kembali ke `/teacher/live-classes`
- Siswa: Kembali ke `/student/live-classes`

### ✅ Layout Baru

**Header:**
```
[← Kembali] [Judul Live Class]     [Peserta: X] [Akhiri Live Class]
```

**Body:**
```
┌─────────────────────────────────────────────┐
│                                             │
│         Video Conference (Full Screen)      │
│         https://vc.tam.web.id/              │
│                                             │
└─────────────────────────────────────────────┘
```

## Files Modified

### 1. `src/views/teacher/live_class_room.ejs`
**Dihapus:**
- Sidebar dengan 3 tabs (Chat, Peserta, Quiz)
- Semua fungsi chat (sendMessage, displayMessage)
- Semua fungsi peserta sidebar (addParticipant, removeParticipant)
- Semua fungsi quiz (startQuiz, displayLeaderboard)
- Tab switching functions
- Event listener untuk Enter key di chat input

**Ditambahkan:**
- Tombol "Kembali" di header kiri
- Layout full screen untuk video conference

**Tetap Ada:**
- Tracking jumlah peserta (updateParticipantCount)
- Socket.io untuk join/leave events
- Tombol "Akhiri Live Class"

### 2. `src/views/student/live_class_room.ejs`
**Dihapus:**
- Sidebar dengan 3 tabs (Chat, Peserta, Quiz)
- Semua fungsi chat
- Semua fungsi peserta sidebar
- Semua fungsi quiz student (startQuizForStudent, submitQuizAnswer, dll)
- Tab switching functions
- Event listener untuk Enter key

**Ditambahkan:**
- Tombol "Kembali" di header kiri
- Layout full screen untuk video conference

**Tetap Ada:**
- Tracking jumlah peserta
- Socket.io untuk join/leave events

## Fitur yang Dihapus

❌ **Chat Real-time**
- Gunakan fitur chat bawaan aplikasi WebRTC

❌ **Daftar Peserta Sidebar**
- Gunakan participant list di aplikasi WebRTC

❌ **Live Quiz**
- Bisa buat quiz terpisah di menu Ujian
- Atau gunakan polling feature di WebRTC app (jika ada)

❌ **Leaderboard**
- Tidak diperlukan karena quiz dihapus

## Fitur yang Tetap Ada

✅ **Video Conference Full Screen**
- Embed iframe dari https://vc.tam.web.id/
- Parameter: room, name, role, userId, moderator

✅ **Tracking Peserta**
- Jumlah peserta aktif di header
- Socket.io untuk real-time update

✅ **Navigasi**
- Tombol "Kembali" untuk keluar
- Tombol "Akhiri Live Class" untuk guru

## Keuntungan Perubahan Ini

### 1. UI Lebih Clean
- Fokus ke video conference
- Tidak ada distraksi dari sidebar
- Lebih mirip Zoom/Google Meet

### 2. Full Screen Experience
- Video conference lebih besar
- Lebih nyaman untuk presentasi
- Optimal untuk screen sharing

### 3. Simplified Code
- Mengurangi kompleksitas JavaScript
- Lebih mudah maintenance
- Lebih cepat load time

### 4. Leverage WebRTC App Features
- Chat menggunakan fitur bawaan WebRTC
- Participant list dari WebRTC
- Polling/quiz dari WebRTC (jika ada)
- Recording, breakout rooms, dll

## Testing Checklist

### Teacher
- [ ] Buat live class baru
- [ ] Start live class
- [ ] Cek iframe WebRTC muncul full screen
- [ ] Cek tombol "Kembali" berfungsi
- [ ] Cek tombol "Akhiri Live Class" berfungsi
- [ ] Cek jumlah peserta update saat siswa join

### Student
- [ ] Lihat daftar live class
- [ ] Join live class yang LIVE
- [ ] Cek iframe WebRTC muncul full screen
- [ ] Cek tombol "Kembali" berfungsi
- [ ] Cek jumlah peserta update

### WebRTC Integration
- [ ] Parameter room terkirim dengan benar
- [ ] Parameter name terkirim (dengan emoji)
- [ ] Parameter role terkirim (teacher/student)
- [ ] Parameter userId terkirim
- [ ] Parameter moderator terkirim (true untuk guru)
- [ ] Guru dan siswa masuk ke room yang sama
- [ ] Camera/microphone permission berfungsi

## Rollback (Jika Diperlukan)

Jika ingin kembalikan sidebar dengan chat & quiz:

1. Restore dari git history:
```bash
git checkout HEAD~1 -- src/views/teacher/live_class_room.ejs
git checkout HEAD~1 -- src/views/student/live_class_room.ejs
```

2. Atau copy dari backup jika ada

## Notes

- Aplikasi WebRTC di https://vc.tam.web.id/ harus support parameter yang dikirim
- Pastikan aplikasi WebRTC punya fitur chat sendiri
- Jika butuh quiz, bisa buat di menu Ujian terpisah
- Socket.io tetap digunakan untuk tracking peserta

---

**Status**: ✅ Completed
**Version**: 2.0.0 (Simplified)
**Date**: 2026-03-06
**Previous Version**: 1.0.0 (With Sidebar)
