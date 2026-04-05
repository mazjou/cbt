# Update Kelas Teraktif - Tambah Kategori Tugas

## Deskripsi
Update fitur "Kelas Teraktif" untuk memasukkan aktivitas tugas (assignments) dan baca materi ke dalam perhitungan ranking. Sebelumnya hanya menghitung ujian (attempts) saja.

## Problem
Ranking "Kelas Teraktif" tidak akurat karena:
- Hanya menghitung ujian (attempts)
- Tidak memasukkan submission tugas
- Tidak memasukkan material reads
- Kelas yang aktif di tugas tapi jarang ujian tidak ter-rank tinggi

## Solution
Menambahkan 3 kategori aktivitas:
1. **Total Ujian** (attempts) - sudah ada
2. **Total Tugas** (assignment_submissions) - BARU
3. **Total Baca Materi** (material_reads) - BARU

## Perhitungan Baru

### Total Activities
```sql
total_activities = total_exams + total_assignments + total_material_reads
```

### Participation Rate
```sql
participation_rate = (
  (COUNT(DISTINCT at.student_id) + 
   COUNT(DISTINCT asub.student_id) + 
   COUNT(DISTINCT mr.user_id)) 
  / 
  (COUNT(DISTINCT u.id) * 3)
) * 100
```

**Penjelasan:**
- Numerator: Total unique students yang melakukan aktivitas (ujian + tugas + baca)
- Denominator: Total siswa × 3 (karena ada 3 jenis aktivitas)
- Hasil: Persentase partisipasi rata-rata

### Ranking/Sorting
```sql
ORDER BY 
  total_activities DESC,      -- Prioritas 1: Total aktivitas
  participation_rate DESC,    -- Prioritas 2: Tingkat partisipasi
  c.name ASC                  -- Prioritas 3: Nama kelas (alfabetis)
```

## Changes Made

### File: `src/routes/admin.js`

#### Query Active Classes
```javascript
const [activeClassesRaw] = await pool.query(`
  SELECT 
    c.id, c.name as class_name,
    COUNT(DISTINCT u.id) as total_students,
    COUNT(DISTINCT at.id) as total_exams,                    -- BARU: renamed from total_attempts
    COUNT(DISTINCT asub.id) as total_assignments,            -- BARU
    COUNT(DISTINCT mr.id) as total_material_reads,           -- BARU
    COALESCE(AVG(at.score), 0) as avg_score,
    (COUNT(DISTINCT at.id) + COUNT(DISTINCT asub.id) + COUNT(DISTINCT mr.id)) as total_activities,  -- BARU
    CASE 
      WHEN COUNT(DISTINCT u.id) > 0 THEN 
        ROUND(((COUNT(DISTINCT at.student_id) + COUNT(DISTINCT asub.student_id) + COUNT(DISTINCT mr.user_id)) / (COUNT(DISTINCT u.id) * 3)) * 100)  -- UPDATED
      ELSE 0 
    END as participation_rate
  FROM classes c
  LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.is_active = 1
  LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN :startDate AND :endDate
  LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.submitted_at BETWEEN :startDate AND :endDate  -- BARU
  LEFT JOIN material_reads mr ON mr.user_id = u.id AND mr.read_at BETWEEN :startDate AND :endDate  -- BARU
  GROUP BY c.id, c.name
  HAVING total_students > 0
  ORDER BY total_activities DESC, participation_rate DESC, c.name ASC  -- UPDATED
`, { startDate, endDate });
```

#### Excel Export
```javascript
const classesData = [
  ['Ranking', 'Nama Kelas', 'Total Siswa', 'Total Ujian', 'Total Tugas', 'Total Baca Materi', 'Total Aktivitas', 'Rata-rata Nilai', 'Partisipasi (%)'],  // UPDATED
  ...activeClasses.map((classData, index) => [
    index + 1,
    classData.class_name,
    classData.total_students,
    classData.total_exams,           // UPDATED
    classData.total_assignments,     // BARU
    classData.total_material_reads,  // BARU
    classData.total_activities,      // BARU
    classData.avg_score.toFixed(2),
    classData.participation_rate
  ])
];
```

### File: `src/routes/principal.js`

Perubahan yang sama seperti di `admin.js`, dengan perbedaan:
- Menggunakan positional parameters (`?`) bukan named parameters (`:name`)
- Parameter array: `[startDate, endDate, startDate, endDate, startDate, endDate]`

### File: `src/views/admin/reports.ejs`

#### Display Update
```html
<div class="text-xs text-purple-600">
  <%= classData.total_students %> siswa • 
  <%= classData.total_exams %> ujian • 
  <%= classData.total_assignments %> tugas • 
  <%= classData.total_material_reads %> baca materi
</div>
<div class="text-xs text-purple-500 mt-1">
  Total <%= classData.total_activities %> aktivitas • Rata-rata <%= classData.avg_score.toFixed(1) %>
</div>
```

### File: `src/views/principal/reports.ejs`

Perubahan yang sama seperti di `admin/reports.ejs`.

## Data Flow

### 1. Query Execution
```
Database Query
  ↓
LEFT JOIN attempts (ujian)
LEFT JOIN assignment_submissions (tugas)
LEFT JOIN material_reads (baca materi)
  ↓
COUNT DISTINCT untuk setiap kategori
  ↓
Calculate total_activities
Calculate participation_rate
  ↓
ORDER BY total_activities DESC
```

### 2. Display
```
Backend (routes)
  ↓
Pass activeClasses to view
  ↓
Frontend (EJS)
  ↓
Loop dan display dengan breakdown
```

### 3. Excel Export
```
Backend (routes)
  ↓
Map activeClasses to array
  ↓
XLSX.utils.aoa_to_sheet
  ↓
Download file
```

## Example Output

### Before (Hanya Ujian)
```
Ranking | Kelas    | Siswa | Ujian | Avg  | Part%
1       | X TKJ 1  | 30    | 45    | 85.5 | 75%
2       | X TKJ 2  | 28    | 40    | 82.3 | 71%
```

### After (Ujian + Tugas + Baca)
```
Ranking | Kelas    | Siswa | Ujian | Tugas | Baca | Total | Avg  | Part%
1       | X TKJ 1  | 30    | 45    | 60    | 120  | 225   | 85.5 | 83%
2       | X TKJ 2  | 28    | 40    | 55    | 110  | 205   | 82.3 | 81%
```

## Impact

### Ranking Changes
Kelas yang sebelumnya rank rendah karena jarang ujian tapi aktif di tugas dan baca materi, sekarang bisa naik ranking.

**Contoh:**
- Kelas A: 50 ujian, 10 tugas, 20 baca = 80 total
- Kelas B: 30 ujian, 40 tugas, 50 baca = 120 total
- **Before**: Kelas A rank lebih tinggi (50 > 30)
- **After**: Kelas B rank lebih tinggi (120 > 80) ✓

### Participation Rate
Lebih akurat karena menghitung partisipasi di semua jenis aktivitas, bukan hanya ujian.

**Contoh:**
- 30 siswa di kelas
- 20 siswa ikut ujian
- 25 siswa kumpul tugas
- 28 siswa baca materi
- **Before**: 20/30 = 67% (hanya ujian)
- **After**: (20+25+28)/(30×3) = 81% (semua aktivitas) ✓

## Testing

### Test Query
```sql
-- Manual test query
SELECT 
  c.name,
  COUNT(DISTINCT u.id) as students,
  COUNT(DISTINCT at.id) as exams,
  COUNT(DISTINCT asub.id) as assignments,
  COUNT(DISTINCT mr.id) as reads,
  (COUNT(DISTINCT at.id) + COUNT(DISTINCT asub.id) + COUNT(DISTINCT mr.id)) as total
FROM classes c
LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student'
LEFT JOIN attempts at ON at.student_id = u.id
LEFT JOIN assignment_submissions asub ON asub.student_id = u.id
LEFT JOIN material_reads mr ON mr.user_id = u.id
GROUP BY c.id, c.name
ORDER BY total DESC;
```

### Test Cases
1. Kelas dengan banyak ujian, sedikit tugas
2. Kelas dengan sedikit ujian, banyak tugas
3. Kelas dengan aktivitas seimbang
4. Kelas tanpa aktivitas sama sekali
5. Kelas dengan 1 siswa vs kelas dengan 30 siswa

### Verify
1. Total activities = sum of all 3 categories
2. Participation rate between 0-100%
3. Ranking berubah sesuai total activities
4. Excel export memiliki semua kolom baru
5. Display di web menampilkan breakdown

## Performance

### Query Optimization
- 3 LEFT JOIN tambahan (assignment_submissions, material_reads)
- COUNT DISTINCT untuk setiap kategori
- Index yang diperlukan:
  - `assignment_submissions.student_id`
  - `assignment_submissions.submitted_at`
  - `material_reads.user_id`
  - `material_reads.read_at`

### Expected Performance
- Small dataset (<1000 records): <100ms
- Medium dataset (1000-10000): <500ms
- Large dataset (>10000): <2s

## Migration Notes

### Database
Tidak perlu migration karena:
- Tabel `assignment_submissions` sudah ada
- Tabel `material_reads` sudah ada
- Hanya update query, tidak ada perubahan schema

### Backward Compatibility
- Field `total_attempts` diganti `total_exams` (breaking change di Excel)
- Tambah field baru: `total_assignments`, `total_material_reads`, `total_activities`
- Participation rate calculation berubah (breaking change)

### Rollback
Jika perlu rollback, kembalikan query ke versi sebelumnya:
```sql
-- Old query (hanya attempts)
COUNT(DISTINCT at.id) as total_attempts
-- No assignment_submissions JOIN
-- No material_reads JOIN
```

## Future Enhancements

1. **Weighted Scoring**: Beri bobot berbeda untuk setiap aktivitas
   - Ujian: 3 poin
   - Tugas: 2 poin
   - Baca: 1 poin

2. **Time-based Ranking**: Ranking berdasarkan periode waktu tertentu

3. **Trend Analysis**: Grafik trend aktivitas per kelas

4. **Drill-down**: Klik kelas untuk lihat detail aktivitas per siswa

5. **Comparison**: Bandingkan kelas dengan kelas lain

6. **Export Detail**: Export dengan breakdown per siswa
