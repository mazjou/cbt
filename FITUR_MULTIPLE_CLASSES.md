# Fitur Multiple Classes untuk Ujian

## Deskripsi
Fitur ini memungkinkan guru untuk memilih lebih dari 1 kelas yang bisa mengerjakan ujian.

## Perubahan Database

### Tabel Baru: `exam_classes`
```sql
CREATE TABLE exam_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exam_class (exam_id, class_id),
  CONSTRAINT fk_exam_classes_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_classes_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);
```

## Cara Menggunakan

### 1. Jalankan Migration
```bash
npm run db:setup
```

Script setup akan otomatis:
- Membuat tabel `exam_classes`
- Migrasi data existing dari `exams.class_id` ke `exam_classes`

### 2. Membuat Ujian dengan Multiple Classes

Di form "Buat Ujian":
1. Pilih mata pelajaran
2. Di field "Kelas", tekan **Ctrl** (Windows) atau **Cmd** (Mac) untuk memilih lebih dari 1 kelas
3. Kosongkan pilihan untuk "Semua Kelas"
4. Isi detail ujian lainnya
5. Klik "Simpan"

### 3. Tampilan untuk Siswa

Siswa hanya akan melihat ujian yang:
- Sudah dipublish
- Tidak ada filter kelas (semua kelas), ATAU
- Kelas siswa termasuk dalam daftar kelas yang dipilih

## Perubahan Kode

### File yang Diubah:
1. **src/views/teacher/exam_new.ejs** - Form dengan multiple select
2. **src/routes/teacher.js** - Logic create exam dengan multiple classes
3. **src/routes/student.js** - Query filter ujian berdasarkan exam_classes
4. **src/routes/principal.js** - Query monitoring dengan exam_classes
5. **src/views/teacher/exams.ejs** - Tampilan multiple class names
6. **src/views/student/exams.ejs** - Tampilan multiple class names
7. **src/views/principal/exams.ejs** - Tampilan multiple class names
8. **src/views/principal/index.ejs** - Dashboard dengan multiple class names
9. **src/db/setup.js** - Migration script

### Query Pattern:

**Untuk menampilkan nama kelas:**
```sql
SELECT (SELECT GROUP_CONCAT(c.name SEPARATOR ', ') 
        FROM exam_classes ec 
        JOIN classes c ON c.id=ec.class_id 
        WHERE ec.exam_id=e.id) AS class_names
FROM exams e
```

**Untuk filter siswa yang eligible:**
```sql
WHERE (
  NOT EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=:exam_id)
  OR EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=:exam_id AND ec.class_id=:student_class_id)
)
```

## Backward Compatibility

- Kolom `exams.class_id` masih ada untuk backward compatibility
- Data lama otomatis dimigrasikan ke `exam_classes`
- Ujian tanpa entry di `exam_classes` = "Semua Kelas"

## Testing

1. Buat ujian baru dengan 2-3 kelas
2. Login sebagai siswa dari kelas yang dipilih → ujian muncul
3. Login sebagai siswa dari kelas lain → ujian tidak muncul
4. Buat ujian tanpa pilih kelas → semua siswa bisa lihat
5. Cek dashboard principal → nama kelas tampil dengan benar

## Troubleshooting

**Error: Table exam_classes doesn't exist**
- Jalankan: `npm run db:setup`

**Siswa tidak bisa lihat ujian**
- Pastikan ujian sudah dipublish
- Cek apakah kelas siswa termasuk dalam pilihan
- Cek di database: `SELECT * FROM exam_classes WHERE exam_id=X`

**Multiple select tidak berfungsi**
- Pastikan tekan Ctrl/Cmd saat klik
- Browser harus support HTML5 multiple select
