# 🧪 Testing Video Conference & Live Class

## ✅ Status: READY FOR FULL TESTING

Fitur live class dengan video conference sudah lengkap untuk guru dan siswa!

## 🚀 Cara Testing

### Step 1: Restart Server

```bash
# Stop server yang sedang berjalan (Ctrl+C)
# Lalu jalankan:
npm run dev
```

Server akan restart dengan Socket.io enabled.

### Step 2: Login sebagai Guru

1. Buka browser: `http://localhost:3000`
2. Login dengan akun guru
3. Pergi ke Dashboard Guru

### Step 3: Buat Live Class

1. Di Dashboard, klik **"+ Buat Live Class"** (tombol merah dengan icon 🎥)
2. Atau pergi ke menu **"Live Classes"**
3. Klik **"Buat Live Class"**
4. Isi form:
   - **Judul**: "Test Live Class - Matematika"
   - **Deskripsi**: "Testing video conference"
   - **Mata Pelajaran**: Pilih salah satu
   - **Kelas**: Pilih kelas yang ada siswa
   - **Jadwal**: Pilih waktu sekarang atau beberapa menit ke depan
   - **Durasi**: 60 menit
   - **Max Peserta**: 100
5. Klik **"Buat Live Class"**
6. Notifikasi akan terkirim ke siswa di kelas tersebut

### Step 4: Mulai Live Class (Guru)

1. Di halaman Live Classes, lihat live class yang baru dibuat
2. Status: **"📅 Terjadwal"**
3. Klik tombol **"▶️ Mulai"**
4. Status berubah menjadi **"🔴 LIVE"**
5. Klik **"🎥 Masuk Room"**

### Step 5: Join Live Class (Siswa)

1. Buka browser baru (atau incognito)
2. Login dengan akun siswa (dari kelas yang sama)
3. Pergi ke Dashboard atau klik menu **"🎥 Live Classes"**
4. Lihat live class yang sedang LIVE
5. Klik **"🎥 Join Live Class"**
6. Siswa masuk ke room yang sama dengan guru

### Step 6: Test Video Conference Room

**Guru dan Siswa akan melihat:**

**Video Conference (Jitsi Meet):**
- Video masing-masing akan muncul
- Bisa mute/unmute audio
- Bisa on/off video
- Bisa screen share (guru)
- Bisa recording (guru)
- Bisa raise hand (siswa)

**Sidebar dengan 3 Tab:**

#### Tab 1: 💬 Chat
- Ketik pesan di input box
- Klik "Kirim" atau tekan Enter
- Pesan akan muncul di chat history untuk semua peserta
- Real-time dengan Socket.io
- Guru ditandai warna kuning, siswa biru

#### Tab 2: 👥 Peserta
- Lihat daftar peserta yang join
- Guru ditandai dengan 👨‍🏫
- Siswa ditandai dengan 👨‍🎓
- Counter peserta di header update real-time

#### Tab 3: 🎯 Quiz
**Untuk Guru:**
- Form untuk buat live quiz
- Isi pertanyaan
- Isi 4 opsi jawaban (A-D)
- Pilih jawaban benar
- Set durasi (detik)
- Klik "🚀 Mulai Quiz"
- Quiz akan broadcast ke semua siswa
- Leaderboard muncul real-time

**Untuk Siswa:**
- Menunggu quiz dari guru
- Ketika quiz dimulai, pertanyaan muncul
- Timer countdown
- Pilih jawaban (A/B/C/D)
- Submit otomatis atau manual
- Lihat hasil (benar/salah)
- Lihat leaderboard

### Step 7: Test Live Quiz (Multi-User)

1. **Guru** switch ke tab **"🎯 Quiz"**
2. Isi form quiz:
   ```
   Pertanyaan: Berapa hasil 2 + 2?
   A: 3
   B: 4
   C: 5
   D: 6
   Jawaban Benar: B
   Durasi: 30 detik
   ```
3. Klik **"🚀 Mulai Quiz"**
4. **Siswa** akan otomatis switch ke tab quiz
5. **Siswa** lihat pertanyaan dan timer countdown
6. **Siswa** pilih jawaban (misal: B)
7. **Siswa** lihat hasil (Benar! +10 poin)
8. Setelah durasi habis, **semua peserta** lihat leaderboard

### Step 8: Test Chat (Multi-User)

1. **Guru** switch ke tab **"💬 Chat"**
2. Ketik: "Halo semua, selamat datang!"
3. **Siswa** akan melihat pesan dari guru (warna kuning)
4. **Siswa** balas: "Terima kasih Pak/Bu!"
5. **Guru** melihat pesan dari siswa (warna biru)
6. Chat real-time untuk semua peserta

### Step 9: Akhiri Live Class

1. **Guru** klik tombol **"Akhiri Live Class"** di header
2. Status berubah menjadi **"✓ Selesai"**
3. **Siswa** otomatis keluar dari room
4. Kehadiran siswa tersimpan otomatis

## 🔍 Yang Bisa Dicek

### Console Browser (F12)
- Socket.io connection: "Connected to server"
- Chat messages
- Participant events
- Quiz events

### Console Server
- Socket.io connections
- User joined/left events
- Chat messages
- Quiz creation

### Database
Cek tabel:
```sql
-- Live class yang dibuat
SELECT * FROM live_classes;

-- Peserta yang join
SELECT * FROM live_class_participants;

-- Chat messages
SELECT * FROM chat_messages WHERE room_type = 'LIVE_CLASS';

-- Live quiz
SELECT * FROM live_quizzes;

-- Quiz answers
SELECT * FROM live_quiz_answers;
```

## 🐛 Troubleshooting

### Video tidak muncul:
- Pastikan browser memiliki akses ke camera & microphone
- Allow permission saat diminta
- Coba refresh page
- Gunakan browser Chrome, Firefox, atau Edge terbaru

### Chat tidak terkirim:
- Cek console browser untuk error
- Pastikan Socket.io connected
- Cek console server untuk error

### Quiz tidak bisa dibuat:
- Pastikan semua field terisi
- Cek console untuk error
- Pastikan API endpoint `/api/live-quizzes` berfungsi

### Socket.io tidak connect:
- Pastikan server running
- Cek port 3000 tidak digunakan aplikasi lain
- Restart server

### Siswa tidak bisa join:
- Pastikan live class status "LIVE"
- Pastikan siswa di kelas yang sama
- Cek console untuk error

## 📊 Expected Results

### Setelah Buat Live Class:
- ✅ Live class muncul di list guru
- ✅ Status "Terjadwal"
- ✅ Notifikasi terkirim ke siswa
- ✅ Siswa bisa lihat di menu Live Classes

### Setelah Mulai Live Class:
- ✅ Status berubah "LIVE"
- ✅ Guru bisa masuk room
- ✅ Siswa bisa join room
- ✅ Video conference aktif untuk semua

### Di Room (Multi-User):
- ✅ Video muncul untuk guru dan siswa
- ✅ Chat berfungsi 2-way
- ✅ Participant list update real-time
- ✅ Quiz bisa dibuat guru
- ✅ Quiz muncul di siswa
- ✅ Siswa bisa jawab quiz
- ✅ Leaderboard update real-time

### Setelah Akhiri:
- ✅ Status "Selesai"
- ✅ Kehadiran tersimpan
- ✅ Chat history tersimpan
- ✅ Quiz results tersimpan

## 🎯 Test Checklist

- [ ] Server restart berhasil
- [ ] Login sebagai guru
- [ ] Buat live class
- [ ] Notifikasi terkirim ke siswa
- [ ] Mulai live class
- [ ] Login sebagai siswa (browser baru)
- [ ] Siswa lihat live class di menu
- [ ] Siswa join live class
- [ ] Video conference muncul untuk guru & siswa
- [ ] Chat berfungsi 2-way (guru ↔ siswa)
- [ ] Participant list update real-time
- [ ] Guru buat quiz
- [ ] Quiz muncul di siswa
- [ ] Siswa jawab quiz
- [ ] Hasil quiz muncul
- [ ] Leaderboard update real-time
- [ ] Akhiri live class
- [ ] Data tersimpan di database

## 💡 Tips Testing

1. **Buka 2 browser** - Satu untuk guru, satu untuk siswa
2. **Gunakan incognito** - Untuk test multiple users
3. **Cek console** - Untuk debug real-time
4. **Test di mobile** - Jitsi Meet responsive
5. **Test dengan 3+ users** - Buka lebih banyak browser untuk test scalability

## 🎉 Fitur yang Sudah Lengkap

### Guru:
- ✅ Buat live class
- ✅ Mulai/akhiri live class
- ✅ Video conference dengan Jitsi Meet
- ✅ Chat real-time
- ✅ Lihat daftar peserta
- ✅ Buat live quiz
- ✅ Lihat leaderboard

### Siswa:
- ✅ Lihat daftar live classes
- ✅ Join live class yang sedang LIVE
- ✅ Video conference dengan Jitsi Meet
- ✅ Chat real-time dengan guru & siswa lain
- ✅ Lihat daftar peserta
- ✅ Ikut live quiz
- ✅ Lihat hasil quiz
- ✅ Lihat leaderboard

### Real-time Features:
- ✅ Socket.io untuk chat
- ✅ Socket.io untuk participant tracking
- ✅ Socket.io untuk live quiz
- ✅ Socket.io untuk leaderboard
- ✅ Jitsi Meet untuk video conference

## 🚀 Next Steps (Optional)

Fitur tambahan yang bisa ditambahkan nanti:
1. Forum diskusi (tabel sudah ada)
2. Recording live class
3. Attendance report
4. Breakout rooms
5. Whiteboard
6. File sharing during live class

---

**Selamat Testing! 🎉**

Jika ada error, cek console browser & server untuk detail error message.
