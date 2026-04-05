# Fitur Persentase Submission Tugas

## Deskripsi
Fitur untuk menampilkan persentase pengumpulan tugas oleh siswa. Membantu guru melihat seberapa banyak siswa yang sudah mengumpulkan tugas dengan visualisasi yang jelas.

## Fitur

### 1. Persentase di Daftar Tugas
- Menampilkan jumlah submission vs total siswa
- Badge persentase dengan warna dinamis
- Progress bar visual
- Warna berubah berdasarkan persentase:
  - Hijau: ≥ 75%
  - Kuning: 50-74%
  - Merah: < 50%

### 2. Persentase di Detail Tugas
- Header dengan statistik lengkap
- Angka persentase besar dan jelas
- Progress bar horizontal
- Informasi "X dari Y siswa telah mengumpulkan"

## Perhitungan

### Total Siswa
```javascript
// Jika tugas untuk kelas tertentu
SELECT COUNT(*) FROM users 
WHERE role = 'student' AND class_id = assignment.class_id

// Jika tugas untuk semua kelas (class_id NULL)
SELECT COUNT(*) FROM users 
WHERE role = 'student'
```

### Persentase
```javascript
submission_percentage = (submission_count / total_students) * 100
// Dibulatkan ke integer terdekat
```

### Warna Dinamis
- **Hijau** (≥75%): Bagus, mayoritas sudah mengumpulkan
- **Kuning** (50-74%): Sedang, setengah sudah mengumpulkan
- **Merah** (<50%): Rendah, perlu follow up

## UI/UX

### Daftar Tugas (Table)
```
┌─────────────────────────────────┐
│ 15 / 30  [75%]                  │
│ ████████████░░░░░░░░            │
└─────────────────────────────────┘
```

**Komponen:**
- Badge biru: Jumlah submission / total siswa
- Badge kecil: Persentase dengan warna dinamis
- Progress bar: Visual persentase

### Detail Tugas (Header)
```
┌──────────────────────────────────────────┐
│ Submission Siswa (15)                    │
│ 15 dari 30 siswa telah mengumpulkan      │
│                                    75%   │
│                          ████████████░░  │
└──────────────────────────────────────────┘
```

**Komponen:**
- Judul dengan jumlah submission
- Teks deskriptif
- Angka persentase besar
- Progress bar horizontal

## Changes Made

### File: `src/routes/teacher.js`

#### 1. Route GET /teacher/assignments
```javascript
// Tambah query total_students
const [assignments] = await pool.query(
  `SELECT 
    ...,
    (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id = a.id) AS submission_count,
    (SELECT COUNT(*) FROM users WHERE role = 'student' AND (a.class_id IS NULL OR class_id = a.class_id)) AS total_students
   FROM assignments a
   ...`
);

// Calculate percentage
assignments.forEach(a => {
  a.submission_percentage = a.total_students > 0 
    ? Math.round((a.submission_count / a.total_students) * 100) 
    : 0;
});
```

#### 2. Route GET /teacher/assignments/:id
```javascript
// Query total students
const [[totalStudents]] = await pool.query(
  `SELECT COUNT(*) as total 
   FROM users 
   WHERE role = 'student' 
   AND (${assignment.class_id ? 'class_id = :classId' : '1=1'});`,
  { classId: assignment.class_id }
);

// Calculate stats
assignment.total_students = totalStudents.total || 0;
assignment.submission_count = submissions.length;
assignment.submission_percentage = assignment.total_students > 0 
  ? Math.round((assignment.submission_count / assignment.total_students) * 100) 
  : 0;
```

### File: `src/views/teacher/assignments.ejs`

#### Kolom Submissions di Table
```html
<td class="px-4 py-4">
  <div class="flex flex-col items-start gap-2">
    <!-- Badge jumlah -->
    <div class="flex items-center gap-2">
      <span class="... bg-gradient-to-r from-blue-500 to-blue-600 ...">
        <%= assignment.submission_count || 0 %> / <%= assignment.total_students || 0 %>
      </span>
      <!-- Badge persentase dengan warna dinamis -->
      <span class="... <%= assignment.submission_percentage >= 75 ? 'bg-green-100 text-green-800' : assignment.submission_percentage >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800' %>">
        <%= assignment.submission_percentage %>%
      </span>
    </div>
    <!-- Progress bar -->
    <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
      <div class="h-2 rounded-full ... <%= assignment.submission_percentage >= 75 ? 'bg-gradient-to-r from-green-500 to-emerald-600' : assignment.submission_percentage >= 50 ? 'bg-gradient-to-r from-yellow-500 to-amber-600' : 'bg-gradient-to-r from-red-500 to-rose-600' %>" 
           style="width: <%= assignment.submission_percentage %>%">
      </div>
    </div>
  </div>
</td>
```

### File: `src/views/teacher/assignment_detail.ejs`

#### Header Submissions
```html
<div class="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-lg font-semibold text-slate-900">
        Submission Siswa (<%= submissions.length %>)
      </h2>
      <p class="text-sm text-slate-600 mt-1">
        <%= assignment.submission_count %> dari <%= assignment.total_students %> siswa telah mengumpulkan
      </p>
    </div>
    <div class="flex items-center gap-4">
      <!-- Angka persentase besar -->
      <div class="text-right">
        <div class="text-2xl font-bold <%= warna dinamis %>">
          <%= assignment.submission_percentage %>%
        </div>
        <div class="text-xs text-slate-500">Tingkat Pengumpulan</div>
      </div>
      <!-- Progress bar -->
      <div class="w-32">
        <div class="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
          <div class="h-3 rounded-full ... <%= warna dinamis %>" 
               style="width: <%= assignment.submission_percentage %>%">
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

## Color Scheme

### Hijau (≥75%)
- Badge: `bg-green-100 text-green-800`
- Progress: `bg-gradient-to-r from-green-500 to-emerald-600`
- Text: `text-green-600`

### Kuning (50-74%)
- Badge: `bg-yellow-100 text-yellow-800`
- Progress: `bg-gradient-to-r from-yellow-500 to-amber-600`
- Text: `text-yellow-600`

### Merah (<50%)
- Badge: `bg-red-100 text-red-800`
- Progress: `bg-gradient-to-r from-red-500 to-rose-600`
- Text: `text-red-600`

## Use Cases

### 1. Monitoring Pengumpulan
Guru bisa dengan cepat melihat tugas mana yang perlu di-follow up karena persentase pengumpulan rendah.

### 2. Evaluasi Deadline
Jika persentase rendah mendekati deadline, guru bisa mempertimbangkan untuk memperpanjang deadline atau mengingatkan siswa.

### 3. Identifikasi Masalah
Persentase sangat rendah bisa mengindikasikan:
- Tugas terlalu sulit
- Instruksi tidak jelas
- Masalah teknis
- Siswa tidak menerima notifikasi

### 4. Laporan ke Kepala Sekolah
Data persentase bisa digunakan untuk laporan efektivitas pembelajaran.

## Edge Cases

### Tidak Ada Siswa
```javascript
total_students = 0
submission_percentage = 0
// Tampilkan "0 / 0" dan "0%"
```

### Tugas untuk Semua Kelas
```javascript
// class_id = NULL
// Hitung semua siswa di sistem
SELECT COUNT(*) FROM users WHERE role = 'student'
```

### Tugas untuk Kelas Tertentu
```javascript
// class_id = X
// Hitung siswa di kelas tersebut
SELECT COUNT(*) FROM users WHERE role = 'student' AND class_id = X
```

## Performance

### Query Optimization
- Subquery untuk submission_count di-cache oleh MySQL
- Index pada `role` dan `class_id` di tabel users
- Index pada `assignment_id` di tabel assignment_submissions

### Frontend
- Progress bar menggunakan CSS width percentage (tidak ada JavaScript)
- Warna dinamis menggunakan conditional class (server-side rendering)
- Tidak ada AJAX call tambahan

## Testing

### Test Persentase Calculation
1. Buat tugas untuk kelas dengan 10 siswa
2. 0 submission → 0%
3. 5 submission → 50% (kuning)
4. 8 submission → 80% (hijau)
5. 3 submission → 30% (merah)

### Test Visual
1. Verify warna badge sesuai persentase
2. Verify progress bar width sesuai persentase
3. Verify responsive di mobile
4. Verify angka submission_count dan total_students benar

### Test Edge Cases
1. Tugas untuk semua kelas (class_id NULL)
2. Kelas tanpa siswa
3. Semua siswa sudah mengumpulkan (100%)
4. Tidak ada yang mengumpulkan (0%)

## Future Enhancements

1. **Grafik Trend**: Grafik pengumpulan per hari
2. **Notifikasi Otomatis**: Kirim reminder jika persentase < 50% H-1 deadline
3. **Breakdown per Kelas**: Jika tugas untuk multiple classes
4. **Export Report**: Export data persentase ke Excel
5. **Historical Data**: Simpan snapshot persentase per hari
6. **Comparison**: Bandingkan persentase antar tugas
7. **Student List**: Daftar siswa yang belum mengumpulkan (clickable)
