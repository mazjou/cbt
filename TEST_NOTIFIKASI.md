# Testing Push Notification

## Status: ✅ SIAP DIGUNAKAN

Migration database sudah berhasil dijalankan. Tabel `notifications` sudah dibuat.

## Cara Testing

### 1. Start Server
```bash
npm run dev
```

### 2. Test sebagai Guru

1. Login sebagai guru
2. Buat materi baru:
   - Pergi ke `/teacher/materials/new`
   - Isi form materi
   - Pilih kelas tertentu
   - Klik "Buat Materi"
3. Publish materi:
   - Klik tombol "Publish" pada materi yang baru dibuat
   - Sistem akan otomatis mengirim notifikasi ke semua siswa di kelas tersebut

4. Atau buat ujian baru:
   - Pergi ke `/teacher/exams/new`
   - Isi form ujian
   - Pilih satu atau lebih kelas
   - Klik "Buat Ujian"
5. Publish ujian:
   - Klik tombol "Publish" pada ujian yang baru dibuat
   - Sistem akan otomatis mengirim notifikasi ke semua siswa di kelas-kelas yang dipilih

### 3. Test sebagai Siswa

1. Login sebagai siswa (pastikan siswa memiliki class_id yang sesuai)
2. Lihat navbar - akan ada icon bell (🔔) di sebelah kiri tombol Dashboard
3. Jika ada notifikasi baru:
   - Badge merah akan muncul dengan angka jumlah notifikasi
   - Klik icon bell untuk membuka dropdown
   - Notifikasi akan ditampilkan dengan:
     - Judul (bold jika belum dibaca)
     - Pesan
     - Waktu (berapa lama yang lalu)
     - Dot biru untuk notifikasi belum dibaca
4. Klik notifikasi untuk:
   - Langsung ke halaman materi/ujian terkait
   - Otomatis ditandai sebagai sudah dibaca
5. Klik "Tandai semua dibaca" untuk menandai semua notifikasi sekaligus

## Fitur yang Sudah Diimplementasikan

✅ Tabel database `notifications`
✅ API endpoints untuk notifikasi
✅ Fungsi helper untuk membuat notifikasi
✅ Integrasi dengan toggle-publish materi
✅ Integrasi dengan toggle-publish ujian
✅ Support multiple classes untuk ujian
✅ UI notification bell di navbar (khusus siswa)
✅ Dropdown panel notifikasi
✅ Badge counter untuk notifikasi belum dibaca
✅ Real-time polling (setiap 30 detik)
✅ Mark as read (individual & bulk)
✅ Link langsung ke materi/ujian
✅ Timestamp relatif ("5 menit lalu", dll)
✅ Visual indicator untuk notifikasi belum dibaca

## Struktur File yang Dibuat/Dimodifikasi

### File Baru:
- `sql/add_notifications.sql` - Migration database
- `src/utils/notifications.js` - Helper functions untuk notifikasi
- `src/routes/notifications.js` - API endpoints notifikasi
- `scripts/migrate_notifications.js` - Script untuk menjalankan migration
- `CARA_AKTIFKAN_NOTIFIKASI.md` - Dokumentasi lengkap
- `TEST_NOTIFIKASI.md` - Panduan testing (file ini)

### File yang Dimodifikasi:
- `src/server.js` - Menambahkan route notifikasi
- `src/routes/teacher.js` - Menambahkan notifikasi saat publish materi/ujian
- `src/views/partials/navbar.ejs` - Menambahkan UI notification bell
- `src/views/layout.ejs` - Menambahkan JavaScript untuk notifikasi

## Troubleshooting

### Notifikasi tidak muncul?
1. Pastikan siswa memiliki `class_id` yang sesuai dengan materi/ujian
2. Pastikan materi/ujian sudah di-publish (is_published = 1)
3. Cek console browser untuk error
4. Cek console server untuk log notifikasi

### Badge tidak update?
1. Tunggu 30 detik (polling interval)
2. Refresh halaman
3. Cek Network tab di browser untuk melihat API calls ke `/api/notifications/unread-count`

### Error saat publish?
1. Cek console server untuk error log
2. Pastikan tabel `notifications` sudah dibuat
3. Pastikan foreign key constraints terpenuhi

## Demo Flow

```
GURU:
1. Login → Dashboard Guru
2. Buat Materi → Pilih Kelas "X RPL 1"
3. Klik "Publish"
   → Sistem mengirim notifikasi ke semua siswa di kelas X RPL 1

SISWA (di kelas X RPL 1):
1. Login → Lihat bell icon dengan badge "1"
2. Klik bell → Melihat notifikasi "Materi Baru: [Judul Materi]"
3. Klik notifikasi → Langsung ke halaman materi
   → Badge berkurang, notifikasi ditandai sudah dibaca
```

## Next Steps (Opsional)

Fitur tambahan yang bisa dikembangkan:
- [ ] WebSocket untuk real-time notification (tanpa polling)
- [ ] Email notification
- [ ] Push notification browser (Web Push API)
- [ ] Notification preferences (siswa bisa pilih jenis notifikasi)
- [ ] Notification history page
- [ ] Delete notification
- [ ] Notification sound
