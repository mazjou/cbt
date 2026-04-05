# Cara Mengaktifkan Fitur Push Notification

Fitur push notification sudah dibuat dan siap digunakan. Ikuti langkah-langkah berikut untuk mengaktifkannya:

## 1. Jalankan Migration Database

Jalankan SQL migration untuk membuat tabel notifications:

```bash
# Masuk ke MySQL
mysql -u root -p

# Pilih database Anda
USE nama_database_anda;

# Jalankan migration
SOURCE sql/add_notifications.sql;

# Atau copy-paste isi file sql/add_notifications.sql ke MySQL console
```

Atau langsung dari command line:

```bash
mysql -u root -p nama_database_anda < sql/add_notifications.sql
```

## 2. Restart Server

Setelah migration berhasil, restart server Node.js:

```bash
npm run dev
# atau
npm start
```

## 3. Cara Kerja Notifikasi

### Untuk Guru:
1. Buat materi atau ujian baru
2. Ketika guru menekan tombol "Publish" (toggle publish), sistem akan otomatis:
   - Mengirim notifikasi ke semua siswa di kelas yang dituju
   - Untuk materi: notifikasi dikirim ke siswa di kelas yang dipilih
   - Untuk ujian: notifikasi dikirim ke siswa di semua kelas yang dipilih (multiple classes)

### Untuk Siswa:
1. Login sebagai siswa
2. Di navbar akan muncul icon bell (🔔) di sebelah kiri tombol Dashboard
3. Badge merah akan muncul jika ada notifikasi baru yang belum dibaca
4. Klik icon bell untuk melihat daftar notifikasi
5. Klik notifikasi untuk langsung ke halaman materi/ujian terkait
6. Notifikasi akan otomatis ditandai sebagai sudah dibaca
7. Tombol "Tandai semua dibaca" untuk menandai semua notifikasi sekaligus

## 4. Fitur Notifikasi

- ✅ Real-time badge counter (polling setiap 30 detik)
- ✅ Dropdown panel notifikasi dengan scroll
- ✅ Notifikasi untuk materi baru
- ✅ Notifikasi untuk ujian baru
- ✅ Support multiple classes untuk ujian
- ✅ Link langsung ke materi/ujian
- ✅ Timestamp "berapa lama yang lalu"
- ✅ Mark as read (individual & bulk)
- ✅ Visual indicator untuk notifikasi belum dibaca

## 5. Testing

### Test sebagai Guru:
1. Login sebagai guru
2. Buat materi baru dan pilih kelas
3. Klik tombol "Publish"
4. Notifikasi akan dikirim ke semua siswa di kelas tersebut

### Test sebagai Siswa:
1. Login sebagai siswa
2. Lihat icon bell di navbar
3. Badge merah akan muncul dengan jumlah notifikasi baru
4. Klik bell untuk melihat notifikasi

## 6. Troubleshooting

### Notifikasi tidak muncul:
- Pastikan tabel `notifications` sudah dibuat (cek dengan `SHOW TABLES;`)
- Pastikan server sudah direstart
- Cek console browser untuk error JavaScript
- Pastikan siswa memiliki `class_id` yang sesuai dengan materi/ujian

### Badge tidak update:
- Refresh halaman
- Tunggu 30 detik (polling interval)
- Cek network tab di browser untuk melihat API calls

### Error saat publish:
- Cek console server untuk error log
- Pastikan foreign key constraints terpenuhi
- Pastikan user memiliki class_id yang valid

## 7. Customization

### Mengubah polling interval:
Edit file `src/views/layout.ejs`, cari baris:
```javascript
}, 30000); // 30 detik
```

### Mengubah jumlah notifikasi yang ditampilkan:
Edit file `src/views/layout.ejs`, cari baris:
```javascript
const response = await fetch('/api/notifications?limit=10');
```

### Menambahkan notifikasi manual:
```javascript
const { createNotificationForClass } = require('./src/utils/notifications');

await createNotificationForClass({
  classId: 1, // atau null untuk semua siswa
  title: 'Judul Notifikasi',
  message: 'Pesan notifikasi',
  type: 'ANNOUNCEMENT', // MATERIAL, EXAM, atau ANNOUNCEMENT
  referenceId: null // opsional
});
```

## 8. API Endpoints

- `GET /api/notifications` - Ambil daftar notifikasi
- `GET /api/notifications/unread-count` - Ambil jumlah notifikasi belum dibaca
- `POST /api/notifications/:id/read` - Tandai notifikasi sebagai dibaca
- `POST /api/notifications/read-all` - Tandai semua notifikasi sebagai dibaca

Semua endpoint memerlukan autentikasi (session).
