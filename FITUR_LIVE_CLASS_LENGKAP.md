# Fitur Live Class - Panduan Lengkap

## Overview
Sistem live class terintegrasi dengan aplikasi WebRTC custom untuk video conference, dilengkapi chat real-time, quiz interaktif, dan tracking peserta.

## Fitur Utama

### 1. Video Conference (Custom WebRTC)
- ✅ Menggunakan aplikasi WebRTC di https://vc.tam.web.id/
- ✅ Embed via iframe full screen
- ✅ Guru sebagai moderator
- ✅ Siswa join ke room yang sama
- ✅ Support camera, microphone, screen sharing
- ✅ UI clean tanpa sidebar

### 2. Tracking Peserta
- ✅ Jumlah peserta aktif di header
- ✅ Notifikasi join/leave via Socket.io
- ✅ History kehadiran tersimpan di database

### 3. Navigasi
- ✅ Tombol "Kembali" untuk keluar dari room
- ✅ Tombol "Akhiri Live Class" untuk guru

## Alur Penggunaan

### Untuk Guru

#### 1. Membuat Live Class
```
Dashboard Guru → Live Classes → + Buat Live Class
```
- Pilih mata pelajaran
- Pilih kelas (opsional, bisa untuk semua kelas)
- Isi judul dan deskripsi
- Tentukan jadwal
- Set durasi (default 60 menit)
- Set max peserta (default 100)

#### 2. Memulai Live Class
```
Live Classes → Pilih live class → ▶️ Mulai
```
- Status berubah jadi LIVE
- Siswa dapat notifikasi
- Redirect ke room

#### 3. Di Room Live Class
**Video Conference:**
- Iframe WebRTC full screen
- Guru jadi moderator
- Kontrol penuh atas room
- Gunakan fitur chat, screen share, dll dari aplikasi WebRTC

**Header:**
- Tombol "Kembali" (kiri atas) untuk keluar
- Jumlah peserta aktif
- Tombol "Akhiri Live Class" (kanan atas)

#### 4. Mengakhiri Live Class
```
Klik "Akhiri Live Class" di header
```
- Status berubah jadi ENDED
- Siswa tidak bisa join lagi
- Data tersimpan untuk laporan

### Untuk Siswa

#### 1. Melihat Live Class
```
Dashboard Siswa → Live Classes
```
- Lihat semua live class untuk kelas Anda
- Status: Terjadwal / LIVE / Selesai
- Info: Guru, mata pelajaran, jadwal, durasi

#### 2. Join Live Class
```
Live Classes → Pilih live class LIVE → 🎥 Join Live Class
```
- Hanya bisa join jika status LIVE atau SCHEDULED
- Redirect ke room

#### 3. Di Room Live Class
**Video Conference:**
- Iframe WebRTC full screen
- Siswa bukan moderator
- Bisa nyalakan camera/mic sesuai permission
- Gunakan fitur chat, raise hand, dll dari aplikasi WebRTC

**Header:**
- Tombol "Kembali" (kiri atas) untuk keluar
- Jumlah peserta aktif

#### 4. Keluar dari Live Class
```
Klik "Kembali" di header (kiri atas)
```
- Kembali ke daftar live class
- Kehadiran tercatat

## Database Tables

### live_classes
```sql
- id
- teacher_id
- subject_id
- class_id (nullable, untuk semua kelas jika NULL)
- title
- description
- room_id (unique, generated)
- scheduled_at
- duration_minutes
- max_participants
- status (SCHEDULED, LIVE, ENDED, CANCELLED)
- started_at
- ended_at
- created_at
```

### live_class_participants
```sql
- id
- live_class_id
- user_id
- joined_at
- left_at
```

### live_quizzes
```sql
- id
- live_class_id
- question
- options (JSON)
- correct_answer
- duration_seconds
- started_at
- ended_at
```

### live_quiz_answers
```sql
- id
- quiz_id
- user_id
- answer
- is_correct
- response_time_ms
- points_earned
- answered_at
```

## Routes

### Teacher Routes
```
GET  /teacher/live-classes              - List live classes
GET  /teacher/live-classes/new          - Form buat live class
POST /teacher/live-classes              - Create live class
POST /teacher/live-classes/:id/start    - Start live class
POST /teacher/live-classes/:id/end      - End live class
GET  /teacher/live-classes/:id/room     - Live class room
```

### Student Routes
```
GET  /student/live-classes              - List live classes
GET  /student/live-classes/:id/join     - Join live class room
```

### API Routes
```
GET  /api/live-classes/:id              - Get live class details
GET  /api/live-classes/:id/participants - Get participants
POST /api/live-quizzes                  - Create quiz (teacher)
```

## Socket.io Events

### Client → Server
```javascript
'live:join'         - Join live class
'live:leave'        - Leave live class
'chat:join'         - Join chat room
'chat:message'      - Send chat message
'quiz:start'        - Start quiz (teacher)
'quiz:answer'       - Submit quiz answer (student)
```

### Server → Client
```javascript
'chat:history'           - Chat history saat join
'chat:message'           - New chat message
'live:participant-joined' - Someone joined
'live:participant-left'   - Someone left
'quiz:started'           - Quiz started
'quiz:ended'             - Quiz ended
'quiz:leaderboard'       - Quiz leaderboard update
```

## Tips & Best Practices

### Untuk Guru
1. **Persiapan**: Buat live class H-1, beri deskripsi jelas
2. **Jadwal**: Set jadwal sesuai jam pelajaran
3. **Durasi**: Sesuaikan dengan materi (30-90 menit)
4. **Interaksi**: Gunakan fitur chat dan screen share di WebRTC app
5. **Monitoring**: Cek jumlah peserta di header

### Untuk Siswa
1. **Persiapan**: Cek jadwal live class di dashboard
2. **Tepat Waktu**: Join sebelum live class dimulai
3. **Koneksi**: Pastikan internet stabil
4. **Partisipasi**: Aktif di chat dan raise hand jika perlu
5. **Etika**: Mute mic saat tidak bicara

## Troubleshooting

### Video tidak muncul
- Refresh halaman
- Cek permission camera/mic di browser
- Coba browser lain (Chrome/Firefox/Edge)
- Cek koneksi internet

### Chat tidak terkirim
- Gunakan fitur chat bawaan aplikasi WebRTC
- Chat tidak lagi menggunakan sidebar LMS

### Quiz tidak muncul
- Fitur quiz dihapus dari sidebar
- Gunakan fitur polling/quiz dari aplikasi WebRTC (jika ada)
- Atau buat quiz terpisah di menu Ujian

### Tidak bisa join
- Cek status live class (harus LIVE atau SCHEDULED)
- Pastikan Anda di kelas yang benar
- Cek apakah sudah max participants

## Monitoring & Analytics

### Data yang Tercatat
- ✅ Kehadiran siswa (join/leave time)
- ✅ Durasi kehadiran
- ✅ Jumlah peserta per live class

### Laporan (Coming Soon)
- Rekap kehadiran per live class
- Statistik partisipasi
- Export ke Excel

## Keamanan

- ✅ Authentication required (login)
- ✅ Role-based access (guru/siswa)
- ✅ Room ID random & unique
- ✅ Class-based filtering (siswa hanya lihat kelas mereka)
- ✅ Teacher ownership (guru hanya edit live class mereka)

## Integrasi WebRTC

Aplikasi WebRTC custom di https://vc.tam.web.id/ menerima parameter:
- `room`: ID room
- `name`: Nama user
- `role`: teacher/student
- `userId`: ID user
- `moderator`: true/false

Detail: Lihat `IMPLEMENTASI_VIDEO_CONFERENCE.md`

---

**Status**: ✅ Production Ready
**Version**: 1.0.0
**Last Update**: 2026-03-06
