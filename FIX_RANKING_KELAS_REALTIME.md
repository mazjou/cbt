# Fix Ranking Kelas - Data Tidak Realtime

## Problem

User melaporkan bahwa ranking kelas tidak "live" - siswa kelas X TKJ 2 sudah mengerjakan tugas hampir 86% tapi partisipasinya tercatat 0 di LMS.

## Root Cause Analysis

Setelah investigasi mendalam, ditemukan beberapa masalah:

### 1. Data Submission Tidak Sesuai Ekspektasi
- User mengira X TKJ 2 punya submission 86%
- Kenyataannya: X TKJ 2 hanya punya 1 submission (3%) dari 1 siswa
- Kemungkinan user melihat persentase di halaman lain (detail tugas guru)

### 2. Query Inconsistency
Query "Kelas Teraktif" menggunakan kolom yang berbeda untuk filter tanggal:
- `attempts`: menggunakan `created_at` ✓
- `assignment_submissions`: menggunakan `submitted_at` ✗ (SALAH)
- `material_reads`: menggunakan `created_at` ✓

Ini menyebabkan data tugas tidak terhitung dengan benar jika filter tanggal digunakan.

### 3. Data Tidak Realtime
Laporan ranking kelas menggunakan query database yang di-execute saat page load. Data baru tidak muncul sampai page di-refresh.

## Solution

### 1. Fix Query Consistency
Ubah `assignment_submissions` filter dari `submitted_at` ke `created_at` agar konsisten dengan tabel lain.

**File: src/routes/admin.js** (baris ~245)
```javascript
// BEFORE
LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.submitted_at BETWEEN :startDate AND :endDate

// AFTER
LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN :startDate AND :endDate
```

**File: src/routes/principal.js** (baris ~393)
```javascript
// BEFORE
LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.submitted_at BETWEEN ? AND ?

// AFTER
LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN ? AND ?
```

### 2. Add Refresh Button & Info Message
Tambahkan tombol refresh dan pesan informasi bahwa data tidak realtime.

**File: src/views/admin/reports.ejs**
```html
<div class="flex items-center justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">📊 Rekap Penggunaan LMS</h1>
    <p class="mt-1 text-slate-600">Laporan statistik aktivitas guru, siswa, dan kelas dalam sistem LMS.</p>
    <!-- BARU: Info message -->
    <p class="mt-1 text-sm text-amber-600 flex items-center gap-1">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>Data tidak realtime. Refresh halaman untuk melihat data terbaru.</span>
    </p>
  </div>
  <div class="flex gap-2">
    <!-- BARU: Refresh button -->
    <button onclick="location.reload()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold transition-all shadow-md flex items-center gap-2">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh
    </button>
    <!-- ... existing buttons ... -->
  </div>
</div>
```

**File: src/views/principal/reports.ejs** - Same changes

## Why Not Real-time?

Membuat laporan ranking realtime membutuhkan:
1. WebSocket connection untuk push updates
2. Background job untuk recalculate rankings
3. Caching layer untuk performance
4. Kompleksitas tinggi untuk benefit yang minimal

Untuk use case laporan statistik, refresh manual sudah cukup karena:
- Data tidak berubah setiap detik
- User biasanya melihat laporan periodic (harian/mingguan)
- Query aggregation cukup berat, tidak efisien jika realtime

## Testing

### Test Query Fix
```bash
node check-assignment-submissions-columns.js
node debug-tkj2-assignments.js
```

### Verify Data
1. Buka halaman Reports (/admin/reports atau /principal/reports)
2. Pilih filter tanggal (misal: 30 hari terakhir)
3. Cek ranking "Kelas Teraktif"
4. Verify bahwa data tugas terhitung dengan benar
5. Klik tombol "Refresh" untuk update data

### Expected Results
- Kelas dengan submission tugas muncul di ranking
- Participation rate dihitung dari 3 kategori: ujian, tugas, baca materi
- Data konsisten dengan filter tanggal yang dipilih
- Tombol refresh berfungsi untuk reload data terbaru

## Files Modified

1. **src/routes/admin.js** - Fix query activeClasses (line ~245)
2. **src/routes/principal.js** - Fix query activeClasses (line ~393)
3. **src/views/admin/reports.ejs** - Add refresh button & info message
4. **src/views/principal/reports.ejs** - Add refresh button & info message

## Debug Scripts Created

1. **check-assignment-submissions-columns.js** - Cek struktur tabel dan data sample
2. **debug-tkj2-assignments.js** - Debug detail kelas X TKJ 2
3. **check-all-tkj2-submissions.js** - Cek semua submission dari siswa X TKJ 2

## Notes

- Kolom `submitted_at` dan `created_at` di tabel `assignment_submissions` biasanya sama nilainya saat pertama submit
- Perbedaan muncul jika ada update submission (re-submit)
- Untuk consistency, gunakan `created_at` karena itu waktu pertama kali submission dibuat
- Participation rate dihitung: `(unique_students_active / (total_students * 3)) * 100`
  - Dibagi 3 karena ada 3 kategori aktivitas: ujian, tugas, baca materi
  - Setiap siswa bisa berkontribusi max 3 aktivitas

## Future Improvements

Jika ingin membuat ranking lebih "live":
1. Add auto-refresh setiap X menit dengan JavaScript
2. Use AJAX untuk fetch data tanpa reload page
3. Add loading indicator saat refresh
4. Cache query results dengan TTL (Time To Live)
5. Add last updated timestamp di UI
