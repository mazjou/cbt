# 🚀 Quick Start - Live Class Testing

## ⚡ Langkah Cepat Testing

### 1. Pastikan Database Tables Sudah Dibuat

```bash
node scripts/create_live_tables_simple.js
```

Output yang diharapkan:
```
✅ live_classes created
✅ live_class_participants created
✅ chat_messages created
✅ forum_discussions created
✅ forum_replies created
✅ live_quizzes created
✅ live_quiz_answers created

🎉 All tables created successfully!
```

### 2. Restart Server

```bash
npm run dev
```

Server akan running dengan Socket.io enabled.

### 3. Test dengan 2 Browser

#### Browser 1 - Guru:
1. Buka `http://localhost:3000`
2. Login sebagai guru
3. Klik "🎥 Buat Live Class" di dashboard
4. Isi form:
   - Judul: "Test Live Class"
   - Mata Pelajaran: Pilih salah satu
   - Kelas: Pilih kelas yang ada siswa
   - Jadwal: Sekarang
   - Durasi: 60 menit
5. Klik "Buat Live Class"
6. Klik "▶️ Mulai"
7. Klik "🎥 Masuk Room"

#### Browser 2 - Siswa:
1. Buka `http://localhost:3000` (incognito/private window)
2. Login sebagai siswa (dari kelas yang sama)
3. Klik "🎥 Live Classes" di dashboard
4. Klik "🎥 Join Live Class" pada live class yang LIVE
5. Masuk ke room

### 4. Test Features

#### Test Video Conference:
- ✅ Video muncul untuk guru dan siswa
- ✅ Audio berfungsi
- ✅ Bisa mute/unmute
- ✅ Bisa on/off video

#### Test Chat:
1. Guru ketik: "Halo semua!"
2. Siswa lihat pesan dari guru
3. Siswa balas: "Halo Pak/Bu!"
4. Guru lihat pesan dari siswa

#### Test Live Quiz:
1. Guru switch ke tab "🎯 Quiz"
2. Isi pertanyaan: "Berapa 2 + 2?"
3. Isi opsi: A=3, B=4, C=5, D=6
4. Jawaban benar: B
5. Durasi: 30 detik
6. Klik "🚀 Mulai Quiz"
7. Siswa otomatis lihat quiz
8. Siswa pilih jawaban (B)
9. Siswa lihat hasil (Benar! +10 poin)
10. Leaderboard muncul untuk semua

#### Test Participants:
1. Switch ke tab "👥 Peserta"
2. Lihat daftar peserta (guru + siswa)
3. Counter peserta di header

### 5. Akhiri Live Class

1. Guru klik "Akhiri Live Class"
2. Status berubah "Selesai"
3. Siswa keluar otomatis

## ✅ Checklist Cepat

- [ ] Database tables created
- [ ] Server running
- [ ] Guru buat live class
- [ ] Siswa lihat notifikasi
- [ ] Guru mulai live class
- [ ] Siswa join live class
- [ ] Video conference berfungsi
- [ ] Chat 2-way berfungsi
- [ ] Quiz berfungsi
- [ ] Leaderboard update
- [ ] Akhiri live class berhasil

## 🐛 Troubleshooting Cepat

### Error: Tables not found
```bash
node scripts/create_live_tables_simple.js
```

### Error: Socket.io not connected
- Restart server
- Refresh browser
- Cek console untuk error

### Error: Video tidak muncul
- Allow camera & microphone permission
- Gunakan browser Chrome/Firefox/Edge terbaru
- Refresh page

### Error: Chat tidak terkirim
- Cek console browser (F12)
- Cek console server
- Pastikan Socket.io connected

## 📚 Dokumentasi Lengkap

- **Testing Guide**: `TESTING_VIDEO_CONFERENCE.md`
- **Implementation**: `IMPLEMENTASI_VIDEO_CONFERENCE.md`
- **Feature List**: `FITUR_LIVE_CLASS_LENGKAP.md`

## 🎉 Selesai!

Jika semua checklist ✅, fitur live class sudah berfungsi dengan baik!

**Happy Testing! 🚀**
