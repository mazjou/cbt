# Fix: Live Class Report Route

## Masalah

Tombol "Laporan" pada live class yang sudah selesai (ENDED) mengarah ke route `/teacher/live-classes/:id/report` yang belum ada, sehingga user diminta login lagi (redirect ke login karena route tidak ditemukan).

## Penyebab

Route `/teacher/live-classes/:id/report` belum didefinisikan di `src/routes/live-classes.js`.

## Solusi

### 1. Tambah Route Report

File: `src/routes/live-classes.js`

```javascript
router.get('/teacher/live-classes/:id/report', requireRole('TEACHER'), async (req, res) => {
  // Get live class details
  // Get all participants with duration
  // Calculate statistics
  // Render report view
});
```

### 2. Buat View Report

File: `src/views/teacher/live_class_report.ejs`

Menampilkan:
- Informasi live class (mata pelajaran, kelas, durasi, status)
- Jadwal (scheduled, started, ended)
- Statistik:
  - Total partisipasi (total join)
  - Siswa unik (unique participants)
  - Rata-rata durasi per siswa
- Daftar partisipan dengan detail:
  - Nama, username, kelas
  - Waktu join dan leave
  - Durasi (dalam menit)

## Fitur Report

### Informasi Live Class
- Mata pelajaran
- Kelas
- Durasi yang direncanakan
- Status (Selesai/Live/Terjadwal)
- Waktu dijadwalkan, dimulai, diakhiri

### Statistik
1. **Total Partisipasi**: Jumlah total join (termasuk siswa yang join berkali-kali)
2. **Siswa Unik**: Jumlah siswa berbeda yang pernah join
3. **Rata-rata Durasi**: Durasi rata-rata per siswa dalam menit

### Daftar Partisipan
- Nomor urut
- Nama lengkap siswa
- Username
- Kelas
- Waktu join (HH:MM)
- Waktu leave (HH:MM atau "Masih di room")
- Durasi (menit)

### Responsive Design

**Desktop:**
- Table format dengan semua kolom
- Hover effect pada row
- Lebar penuh dengan scroll horizontal jika perlu

**Mobile:**
- Card format untuk setiap partisipan
- Info penting di atas (nama, durasi)
- Detail join/leave di bawah dalam grid 2 kolom
- Lebih mudah dibaca di layar kecil

## Query Database

```sql
-- Get participants with duration
SELECT lcp.*, u.full_name, u.username, u.class_id, c.name AS class_name,
       TIMESTAMPDIFF(MINUTE, lcp.joined_at, COALESCE(lcp.left_at, NOW())) AS duration_minutes
FROM live_class_participants lcp
JOIN users u ON u.id = lcp.user_id
LEFT JOIN classes c ON c.id = u.class_id
WHERE lcp.live_class_id = :id
ORDER BY lcp.joined_at ASC
```

## Perhitungan Statistik

```javascript
const totalParticipants = participants.length;
const uniqueParticipants = new Set(participants.map(p => p.user_id)).size;
const avgDuration = participants.length > 0 
  ? Math.round(participants.reduce((sum, p) => sum + p.duration_minutes, 0) / participants.length)
  : 0;
```

## File yang Dimodifikasi/Dibuat

1. `src/routes/live-classes.js` - Tambah route report
2. `src/views/teacher/live_class_report.ejs` - View laporan (baru)

## Testing

- ✅ Akses route `/teacher/live-classes/:id/report`
- ✅ Tampil informasi live class
- ✅ Tampil statistik yang benar
- ✅ Tampil daftar partisipan
- ✅ Responsive di mobile dan desktop
- ✅ Tidak redirect ke login lagi

## Notes

- Route menggunakan `requireRole('TEACHER')` untuk keamanan
- Hanya teacher yang membuat live class yang bisa akses report
- Durasi dihitung dari `joined_at` sampai `left_at` (atau NOW() jika masih di room)
- Support siswa yang join berkali-kali (multiple entries)

---

**Status**: ✅ Fixed
**Updated**: 2026-03-08
