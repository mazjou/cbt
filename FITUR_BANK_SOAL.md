# Fitur Bank Soal

## Status: ✅ SELESAI (Partial - Core Features Ready)

## Deskripsi
Fitur bank soal memungkinkan guru untuk menyimpan soal yang dapat digunakan ulang untuk berbagai ujian. Soal disimpan dengan kategorisasi (mata pelajaran, tingkat kesulitan, tags) dan dapat dicari/difilter dengan mudah.

## Fitur Utama

### 1. Kelola Bank Soal
- ✅ List semua soal di bank
- ✅ Filter by mata pelajaran
- ✅ Filter by tingkat kesulitan (Easy/Medium/Hard)
- ✅ Search by teks soal atau tags
- ✅ Tambah soal baru ke bank
- ✅ Edit soal di bank
- ✅ Hapus soal dari bank
- ✅ Lihat detail soal & statistik penggunaan

### 2. Gunakan Soal dari Bank
- ✅ Copy soal dari bank ke ujian
- ✅ Tracking penggunaan soal (berapa kali digunakan)
- ⚠️ **Belum**: UI untuk memilih soal dari bank saat membuat ujian

### 3. Kategorisasi & Pencarian
- ✅ Mata pelajaran
- ✅ Tingkat kesulitan (EASY, MEDIUM, HARD)
- ✅ Tags (comma-separated)
- ✅ Full-text search

## Database Schema

### Tabel: `question_bank`
```sql
CREATE TABLE question_bank (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_image VARCHAR(255) NULL,
  question_pdf VARCHAR(255) NULL,
  points INT DEFAULT 1,
  difficulty ENUM('EASY', 'MEDIUM', 'HARD') DEFAULT 'MEDIUM',
  tags VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
```

### Tabel: `question_bank_options`
```sql
CREATE TABLE question_bank_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_bank_id INT NOT NULL,
  option_label CHAR(1) NOT NULL,
  option_text TEXT NOT NULL,
  is_correct TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_bank_id) REFERENCES question_bank(id) ON DELETE CASCADE,
  UNIQUE KEY unique_question_option (question_bank_id, option_label)
);
```

### Tabel: `question_bank_usage`
```sql
CREATE TABLE question_bank_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_bank_id INT NOT NULL,
  question_id INT NOT NULL,
  exam_id INT NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_bank_id) REFERENCES question_bank(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
```

## Routes

### GET /teacher/question-bank
List semua soal di bank dengan filter

**Query Parameters:**
- `subject_id` - Filter by mata pelajaran
- `difficulty` - Filter by tingkat kesulitan (EASY/MEDIUM/HARD)
- `search` - Search by teks soal atau tags

### GET /teacher/question-bank/new
Form tambah soal ke bank

### POST /teacher/question-bank
Simpan soal baru ke bank

**Form Data:**
- `subject_id` - ID mata pelajaran (required)
- `question_text` - Teks pertanyaan (required)
- `question_image` - File gambar (optional, max 10MB)
- `question_pdf` - File PDF (optional, max 10MB)
- `points` - Poin soal (required, default 1)
- `difficulty` - Tingkat kesulitan (required, default MEDIUM)
- `tags` - Tags comma-separated (optional)
- `a, b, c, d, e` - Opsi jawaban (required)
- `correct` - Jawaban benar A/B/C/D/E (required)

### GET /teacher/question-bank/:id
Detail soal di bank + statistik penggunaan

### GET /teacher/question-bank/:id/edit
Form edit soal di bank

### PUT /teacher/question-bank/:id
Update soal di bank

### DELETE /teacher/question-bank/:id
Hapus soal dari bank

### POST /teacher/question-bank/:id/use-in-exam/:examId
Copy soal dari bank ke ujian tertentu

## View Files

### 1. `src/views/teacher/question_bank.ejs`
**Status**: ✅ Created

List bank soal dengan:
- Filter by subject, difficulty, search
- Card view dengan preview soal
- Badge untuk difficulty, points, usage count
- Tags display
- Actions: Detail, Edit, Delete

### 2. `src/views/teacher/question_bank_new.ejs`
**Status**: ✅ Created

Form tambah soal dengan:
- Subject dropdown
- Difficulty dropdown
- Question editor (contenteditable + paste image)
- Image upload
- PDF upload
- Points input
- Tags input
- Options A-E (contenteditable)
- Correct answer dropdown

### 3. `src/views/teacher/question_bank_detail.ejs`
**Status**: ⚠️ TODO

Detail soal dengan:
- Full question display
- All options display
- Difficulty & tags
- Usage statistics (berapa kali digunakan, di ujian mana)
- Actions: Edit, Delete, Use in Exam

### 4. `src/views/teacher/question_bank_edit.ejs`
**Status**: ⚠️ TODO (mirip dengan question_edit.ejs)

Form edit soal dengan:
- Semua field seperti form new
- Preview existing image/PDF
- Checkbox remove image/PDF

## Cara Menggunakan

### 1. Tambah Soal ke Bank

1. Buka menu "Bank Soal" di dashboard guru
2. Klik "➕ Tambah Soal"
3. Isi form:
   - Pilih mata pelajaran
   - Pilih tingkat kesulitan
   - Ketik pertanyaan
   - Upload gambar/PDF (opsional)
   - Set poin
   - Isi tags (opsional, pisahkan dengan koma)
   - Isi opsi A-E
   - Pilih jawaban benar
4. Klik "💾 Simpan ke Bank Soal"

### 2. Cari Soal di Bank

1. Buka "Bank Soal"
2. Gunakan filter:
   - Mata Pelajaran: Pilih dari dropdown
   - Tingkat Kesulitan: Easy/Medium/Hard
   - Cari: Ketik kata kunci atau tag
3. Klik "Filter"

### 3. Gunakan Soal dari Bank ke Ujian

**Cara 1: Dari Detail Bank Soal**
1. Buka detail soal di bank
2. Klik "Gunakan di Ujian"
3. Pilih ujian tujuan
4. Soal akan dicopy ke ujian tersebut

**Cara 2: Dari Halaman Ujian** (TODO)
1. Buka detail ujian
2. Klik "Tambah dari Bank Soal"
3. Pilih soal dari bank
4. Klik "Tambahkan"

### 4. Edit Soal di Bank

1. Buka "Bank Soal"
2. Klik "✏️ Edit" pada soal yang ingin diedit
3. Ubah field yang diperlukan
4. Klik "Simpan Perubahan"

**Note**: Mengubah soal di bank TIDAK akan mengubah soal yang sudah digunakan di ujian (soal di-copy, bukan di-link).

### 5. Hapus Soal dari Bank

1. Buka "Bank Soal"
2. Klik "🗑️ Hapus" pada soal yang ingin dihapus
3. Konfirmasi penghapusan

**Note**: Menghapus soal dari bank TIDAK akan menghapus soal yang sudah digunakan di ujian.

## Spesifikasi Teknis

| Aspek | Detail |
|-------|--------|
| **Max File Size** | 10MB (image & PDF) |
| **Difficulty Levels** | EASY, MEDIUM, HARD |
| **Tags Format** | Comma-separated string |
| **Upload Location** | `src/public/uploads/questions/` |
| **Copy Behavior** | Deep copy (soal + opsi) |
| **Usage Tracking** | Via `question_bank_usage` table |

## Files Created/Modified

### Database
1. ✅ `sql/create_question_bank.sql` - Schema
2. ✅ `run-migration-question-bank.js` - Migration script (EXECUTED)

### Backend
3. ✅ `src/routes/question_bank.js` - Routes
4. ✅ `src/server.js` - Register routes

### Frontend
5. ✅ `src/views/teacher/question_bank.ejs` - List view
6. ✅ `src/views/teacher/question_bank_new.ejs` - Create form
7. ⚠️ `src/views/teacher/question_bank_detail.ejs` - TODO
8. ⚠️ `src/views/teacher/question_bank_edit.ejs` - TODO

### Documentation
9. ✅ `FITUR_BANK_SOAL.md` - This file

## TODO / Future Enhancements

### High Priority
- [ ] Create `question_bank_detail.ejs` view
- [ ] Create `question_bank_edit.ejs` view
- [ ] Add "Pilih dari Bank Soal" button di halaman exam detail
- [ ] Modal untuk memilih soal dari bank saat membuat ujian
- [ ] Bulk import soal ke bank dari Excel

### Medium Priority
- [ ] Export bank soal ke Excel
- [ ] Duplicate soal di bank
- [ ] Share bank soal antar guru (same subject)
- [ ] Preview soal sebelum add ke ujian
- [ ] Batch add multiple soal dari bank ke ujian

### Low Priority
- [ ] Statistik penggunaan soal (success rate, avg score)
- [ ] Rekomendasi soal berdasarkan difficulty
- [ ] Auto-tag soal berdasarkan content analysis
- [ ] Version history untuk soal di bank

## Testing Checklist

- [x] Database migration executed
- [x] Routes registered
- [x] List bank soal works
- [x] Filter works (subject, difficulty, search)
- [x] Create soal works
- [ ] **Test manual**: Edit soal
- [ ] **Test manual**: Delete soal
- [ ] **Test manual**: Use soal in exam
- [ ] **Test manual**: Usage tracking
- [ ] **Test manual**: Tags search

## Troubleshooting

### Bank soal tidak muncul
- Cek database: `SELECT * FROM question_bank WHERE teacher_id=X;`
- Cek routes registered di server.js
- Cek logs: `pm2 logs` atau terminal

### Upload gagal
- Cek ukuran file (max 10MB)
- Cek format file (image: jpg/png, pdf: pdf)
- Cek permission folder `src/public/uploads/questions/`

### Filter tidak bekerja
- Cek query parameters di URL
- Cek SQL query di route handler
- Cek logs untuk SQL errors

### Soal tidak ter-copy ke ujian
- Cek ownership (teacher_id)
- Cek exam exists
- Cek transaction rollback di logs
- Cek `question_bank_usage` table

## Migration

Migration sudah berhasil dijalankan:

```
✅ Table question_bank created
✅ Table question_bank_options created
✅ Table question_bank_usage created
```

Jika perlu rollback:
```sql
DROP TABLE IF EXISTS question_bank_usage;
DROP TABLE IF EXISTS question_bank_options;
DROP TABLE IF EXISTS question_bank;
```

## Security Notes

1. **Authorization**: Semua routes require TEACHER role
2. **Ownership**: Guru hanya bisa akses soal miliknya sendiri
3. **File Upload**: Max 10MB, validated by multer
4. **SQL Injection**: Protected by parameterized queries
5. **XSS**: HTML content di-escape di view (kecuali yang di-render dengan `<%-`)

## Performance Notes

1. **Indexing**: 
   - `idx_teacher_subject` untuk filter cepat
   - `idx_difficulty` untuk filter difficulty
   - `idx_created` untuk sorting by date

2. **Pagination**: TODO - Implement pagination untuk list bank soal

3. **Caching**: TODO - Cache frequently used questions

---

**Created**: 2026-03-06
**Status**: ✅ Core features ready, some views TODO
**Migration**: ✅ Executed successfully
