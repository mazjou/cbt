# Fix Ranking Tugas dengan Multiple Classes

## Problem
Setelah implementasi fitur multiple classes untuk tugas, ranking kelas di laporan LMS tidak menghitung tugas dengan benar karena query masih menggunakan tabel `assignments` lama, bukan tabel junction `assignment_classes` yang baru.

## Root Cause
Query ranking kelas menggunakan:
```sql
LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN :startDate AND :endDate
```

Ini menghitung SEMUA submission dari siswa, tanpa mempertimbangkan apakah tugas tersebut ditujukan untuk kelas siswa tersebut atau tidak.

Contoh masalah:
- Siswa dari kelas X TKJ 2 mengerjakan tugas yang ditujukan untuk XI KULINER 3
- Query lama menghitung ini sebagai aktivitas kelas X TKJ 2 (SALAH)
- Query baru hanya menghitung jika tugas memang ditujukan untuk kelas tersebut (BENAR)

## Solution

### Update Query dengan Subquery
Menggunakan subquery untuk filter assignment_submissions berdasarkan assignment_classes:

```sql
LEFT JOIN (
  SELECT asub.*, ac.class_id as target_class_id
  FROM assignment_submissions asub
  INNER JOIN assignment_classes ac ON ac.assignment_id = asub.assignment_id
  WHERE asub.created_at BETWEEN :startDate AND :endDate
) asub_filtered ON asub_filtered.student_id = u.id AND asub_filtered.target_class_id = c.id
```

### Penjelasan Subquery
1. **Inner Query**: Join `assignment_submissions` dengan `assignment_classes` untuk mendapatkan target kelas setiap submission
2. **Filter**: Hanya submission dalam periode yang ditentukan
3. **Outer Join**: Join dengan kelas hanya jika submission ditujukan untuk kelas tersebut (`target_class_id = c.id`)

## Changes Made

### 1. Admin Reports
**File: src/routes/admin.js** (line ~230-250)

Before:
```sql
LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN :startDate AND :endDate
```

After:
```sql
LEFT JOIN (
  SELECT asub.*, ac.class_id as target_class_id
  FROM assignment_submissions asub
  INNER JOIN assignment_classes ac ON ac.assignment_id = asub.assignment_id
  WHERE asub.created_at BETWEEN :startDate AND :endDate
) asub_filtered ON asub_filtered.student_id = u.id AND asub_filtered.target_class_id = c.id
```

### 2. Principal Reports
**File: src/routes/principal.js** (line ~380-400)

Same changes as admin reports, but using positional parameters instead of named parameters.

## Impact

### Before Fix
- Siswa X TKJ 2 mengerjakan tugas XI KULINER 3 → Dihitung sebagai aktivitas X TKJ 2
- Ranking tidak akurat karena menghitung submission yang tidak relevan
- Participation rate salah karena menghitung aktivitas lintas kelas

### After Fix
- Hanya submission untuk tugas yang ditujukan ke kelas tersebut yang dihitung
- Ranking lebih akurat dan mencerminkan aktivitas kelas yang sebenarnya
- Participation rate benar karena hanya menghitung aktivitas yang relevan

## Testing Results

### Query Comparison
```
Kelas          | Old Assignments | New Assignments | Status
XII TKJ 1      | 0              | 0              | ✓ Same
XI KULINER 3   | 1              | 1              | ✓ Same
X TKJ 2        | 1              | 0              | ✓ Fixed (was wrong)
```

### Detail Breakdown
```
Class Name     | Assignment Title | Submission Count | Students
XI KULINER 3   | coba            | 2               | ARIFAH GHINASTYANINGRUM, Intan Nuraini
```

X TKJ 2 tidak muncul karena tidak ada tugas yang ditujukan untuk kelas tersebut.

## Backward Compatibility

### Migration Safe
- Tabel `assignments.class_id` masih ada (tidak di-drop)
- Query lama masih bisa jalan jika diperlukan
- Data existing sudah dimigrate ke `assignment_classes`

### Rollback Plan
Jika ada masalah, bisa rollback ke query lama:
```sql
-- Rollback query (emergency only)
LEFT JOIN assignment_submissions asub ON asub.student_id = u.id 
  AND asub.created_at BETWEEN :startDate AND :endDate
  AND (asub.assignment_id IN (
    SELECT id FROM assignments WHERE class_id = c.id OR class_id IS NULL
  ))
```

## Performance Considerations

### Subquery Performance
- Subquery di-execute sekali dan di-cache
- INNER JOIN pada assignment_classes menggunakan index
- Performance impact minimal karena tabel junction kecil

### Index Recommendations
Pastikan index ada pada:
```sql
-- assignment_classes
INDEX (assignment_id, class_id)
INDEX (class_id, assignment_id)

-- assignment_submissions  
INDEX (assignment_id, student_id, created_at)
INDEX (student_id, created_at)
```

## Files Modified

1. **src/routes/admin.js** - Update activeClasses query
2. **src/routes/principal.js** - Update activeClasses query

## Testing

### Manual Test
1. Buat tugas untuk kelas A
2. Siswa dari kelas B mengerjakan tugas tersebut (jika memungkinkan)
3. Cek ranking kelas - kelas B tidak boleh dapat poin dari tugas kelas A
4. Refresh halaman reports untuk melihat data terbaru

### Automated Test
```bash
node test-fixed-ranking-assignments.js
```

Expected results:
- Query berjalan tanpa error
- Hanya submission yang relevan yang dihitung
- Ranking kelas akurat sesuai tugas yang ditujukan untuk kelas tersebut

## Future Improvements

### Real-time Updates
- Add WebSocket untuk real-time ranking updates
- Cache query results dengan TTL
- Background job untuk recalculate rankings

### Enhanced Analytics
- Breakdown per mata pelajaran
- Trend analysis (minggu ini vs minggu lalu)
- Cross-class assignment analytics

## Notes

- Query ini lebih kompleks tapi lebih akurat
- Subquery approach lebih readable daripada multiple EXISTS clauses
- Compatible dengan semua MySQL versions yang support subqueries (5.0+)
- Tested dengan data production dan hasilnya konsisten

## Status
✅ SELESAI - Ranking tugas sekarang akurat dengan multiple classes system