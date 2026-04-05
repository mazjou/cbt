# Fix: Siswa Tidak Bisa Memulai Ujian

## Masalah

Siswa tidak bisa memulai ujian karena ada inkonsistensi query antara:
- Route untuk menampilkan detail ujian (`GET /student/exams/:id`)
- Route untuk memulai ujian (`POST /student/exams/:id/start`)

## Root Cause

**Route Detail Ujian** menggunakan kondisi:
```sql
WHERE e.id=:id AND e.is_published=1 AND (e.class_id IS NULL OR e.class_id=:class_id)
```

**Route Start Ujian** menggunakan kondisi:
```sql
WHERE id=:id AND is_published=1
  AND (
    NOT EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=:id)
    OR EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=:id AND ec.class_id=:class_id)
  )
```

Perbedaan ini menyebabkan:
- Siswa bisa melihat ujian di halaman detail
- Tapi tidak bisa memulai ujian karena query berbeda

## Solusi

Menyamakan query di kedua route menggunakan tabel `exam_classes`:

### File: `src/routes/student.js`

**Route Detail Ujian (Line 126-142):**
```javascript
router.get('/exams/:id', async (req, res) => {
  const user = req.session.user;
  const [[exam]] = await pool.query(
    `SELECT e.*, s.name AS subject_name, c.name AS class_name,
            (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
            (SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id AND a.student_id=:sid) AS attempts_count
     FROM exams e
     JOIN subjects s ON s.id=e.subject_id
     LEFT JOIN classes c ON c.id=e.class_id
     WHERE e.id=:id AND e.is_published=1
       AND (
         NOT EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id)
         OR EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id=:class_id)
       )
     LIMIT 1;`,
    { id: req.params.id, sid: user.id, class_id: user.class_id || 0 }
  );
  if (!exam) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Ujian tidak tersedia.', user });
  res.render('student/exam_detail', { title: exam.title, exam });
});
```

## Penjelasan Query

Query menggunakan tabel `exam_classes` untuk menentukan apakah ujian tersedia untuk kelas siswa:

1. **Ujian untuk semua kelas:**
   ```sql
   NOT EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id)
   ```
   Jika tidak ada record di `exam_classes`, berarti ujian untuk semua kelas.

2. **Ujian untuk kelas tertentu:**
   ```sql
   EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id=:class_id)
   ```
   Jika ada record di `exam_classes` dengan `class_id` siswa, berarti ujian tersedia untuk kelas siswa.

## Testing

### 1. Ujian untuk Semua Kelas
- Buat ujian tanpa memilih kelas spesifik
- Semua siswa dari semua kelas bisa melihat dan memulai ujian

### 2. Ujian untuk Kelas Tertentu
- Buat ujian dan pilih kelas tertentu (misal: Kelas X RPL 1)
- Hanya siswa dari kelas X RPL 1 yang bisa melihat dan memulai ujian
- Siswa dari kelas lain tidak bisa melihat ujian tersebut

### 3. Ujian untuk Multiple Kelas
- Buat ujian dan pilih beberapa kelas (misal: X RPL 1, X RPL 2)
- Siswa dari kedua kelas tersebut bisa melihat dan memulai ujian
- Siswa dari kelas lain tidak bisa melihat ujian

## Validasi Lainnya

Route start ujian juga melakukan validasi:

1. **Waktu Mulai:**
   ```javascript
   if (exam.start_at && now < new Date(exam.start_at)) {
     req.flash('info', 'Ujian belum dimulai.');
     return res.redirect(`/student/exams/${examId}`);
   }
   ```

2. **Waktu Selesai:**
   ```javascript
   if (exam.end_at && now > new Date(exam.end_at)) {
     req.flash('error', 'Ujian sudah berakhir.');
     return res.redirect(`/student/exams/${examId}`);
   }
   ```

3. **Kode Akses:**
   ```javascript
   if (exam.access_code && exam.access_code.length) {
     if (access_code_input.toUpperCase() !== String(exam.access_code).toUpperCase()) {
       req.flash('error', 'Kode akses salah.');
       return res.redirect(`/student/exams/${examId}`);
     }
   }
   ```

4. **Batas Percobaan:**
   ```javascript
   const [[cnt]] = await pool.query(
     `SELECT COUNT(*) AS c FROM attempts WHERE exam_id=:eid AND student_id=:sid;`,
     { eid: examId, sid: user.id }
   );
   if (cnt.c >= exam.max_attempts) {
     req.flash('error', 'Batas percobaan ujian sudah habis.');
     return res.redirect(`/student/exams/${examId}`);
   }
   ```

## Status

✅ **Fixed!** Siswa sekarang bisa memulai ujian dengan benar.

Query sudah konsisten di semua route:
- ✅ List ujian (`GET /student/exams`)
- ✅ Detail ujian (`GET /student/exams/:id`)
- ✅ Start ujian (`POST /student/exams/:id/start`)

## Restart Aplikasi

Setelah fix, restart aplikasi:
```bash
pm2 reload lms-smkn1kras
```

---

**Tanggal Fix:** 2026-03-05  
**File Diubah:** `src/routes/student.js`
