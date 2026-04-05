# Fitur: Export Soal Ujian ke Excel

## 📋 Deskripsi

Fitur untuk mengekspor soal ujian beserta opsi jawaban ke format Excel (.xlsx). Guru dapat mendownload soal ujian untuk keperluan backup, dokumentasi, atau sharing.

## ✨ Fitur

- Export soal ujian ke format Excel
- Include informasi ujian (judul, mata pelajaran, durasi, dll)
- Include semua soal dengan opsi jawaban (A, B, C, D, E)
- Menampilkan jawaban benar untuk setiap soal
- Menampilkan poin untuk setiap soal
- Format Excel yang rapi dan mudah dibaca
- Nama file otomatis dengan timestamp

## 📁 File yang Diubah/Dibuat

### File Diubah:

1. **src/views/teacher/exam_detail.ejs**
   - Tambah tombol "📥 Export Soal" (warna hijau)
   - Link ke `/teacher/exams/:id/export`

2. **src/routes/teacher.js**
   - Tambah route `GET /teacher/exams/:id/export`
   - Generate Excel dengan XLSX library

## 🎨 Desain UI

### Tombol Export:

```
┌─────────────────────┐
│  📥 Export Soal     │
└─────────────────────┘
```

- Warna: Green gradient (from-green-50 to-green-100)
- Border: green-200
- Text: green-800
- Posisi: Setelah tombol "Daftar Nilai"

## 📊 Format Excel

### Header Info:
```
SOAL UJIAN
Judul Ujian:        [Nama Ujian]
Mata Pelajaran:     [Nama Mapel]
Durasi:             [X] menit
Passing Score:      [X]
Total Soal:         [X]

[Empty Row]
```

### Tabel Soal:
```
| No | Soal | Opsi A | Opsi B | Opsi C | Opsi D | Opsi E | Jawaban Benar | Poin |
|----|------|--------|--------|--------|--------|--------|---------------|------|
| 1  | ...  | ...    | ...    | ...    | ...    | ...    | A             | 1    |
| 2  | ...  | ...    | ...    | ...    | ...    | ...    | B             | 1    |
```

### Column Widths:
- No: 5 characters
- Soal: 50 characters
- Opsi A-E: 30 characters each
- Jawaban Benar: 10 characters
- Poin: 8 characters

## 🔧 Cara Menggunakan

### Untuk Guru:

1. Login sebagai guru
2. Buka halaman daftar ujian: `/teacher/exams`
3. Klik ujian yang ingin diexport
4. Klik tombol "📥 Export Soal"
5. File Excel akan otomatis terdownload
6. Buka file Excel untuk melihat soal

### Nama File:

Format: `Soal_[Judul_Ujian]_[Timestamp].xlsx`

Contoh: `Soal_Ujian_Matematika_XII_1234567890.xlsx`

## 💻 Implementasi

### Route Handler:

```javascript
router.get('/exams/:id/export', async (req, res) => {
  // 1. Get exam data
  const [[exam]] = await pool.query(/* ... */);
  
  // 2. Get questions with options
  const [questions] = await pool.query(/* ... */);
  
  // 3. Prepare data for Excel
  const excelData = [];
  
  // Add header info
  excelData.push(['SOAL UJIAN']);
  excelData.push(['Judul Ujian', exam.title]);
  // ...
  
  // Add table header
  excelData.push(['No', 'Soal', 'Opsi A', ...]);
  
  // Add questions
  questions.forEach((q, index) => {
    // Parse options
    // Add row
  });
  
  // 4. Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(excelData);
  
  // 5. Set column widths
  ws['!cols'] = [/* ... */];
  
  // 6. Generate buffer and send
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.send(buffer);
});
```

### Query untuk Get Questions:

```sql
SELECT q.*, 
  (SELECT GROUP_CONCAT(
    CONCAT(o.option_label, '|', o.option_text, '|', o.is_correct)
    ORDER BY o.option_label SEPARATOR ';;'
  ) FROM options o WHERE o.question_id = q.id) as options_data
FROM questions q
WHERE q.exam_id = :exam_id
ORDER BY q.id ASC;
```

**Penjelasan:**
- Menggunakan `GROUP_CONCAT` untuk menggabungkan semua opsi dalam 1 row
- Format: `A|Teks Opsi A|0;;B|Teks Opsi B|1;;...`
- Separator antar opsi: `;;`
- Separator dalam opsi: `|`

### Parse Options:

```javascript
const options = {};
let correctAnswer = '';

if (q.options_data) {
  const optionsArray = q.options_data.split(';;');
  optionsArray.forEach(opt => {
    const [label, text, isCorrect] = opt.split('|');
    options[label] = text;
    if (isCorrect === '1') {
      correctAnswer = label;
    }
  });
}
```

## 🧪 Testing

### Test Export Soal:

1. **Test Export Ujian dengan Soal**
   - Login sebagai guru
   - Buka detail ujian yang ada soalnya
   - Klik "Export Soal"
   - File Excel terdownload
   - Buka file Excel
   - Cek header info (judul, mapel, durasi, dll)
   - Cek tabel soal (no, soal, opsi, jawaban benar, poin)
   - Semua data sesuai

2. **Test Export Ujian Tanpa Soal**
   - Buka detail ujian yang belum ada soalnya
   - Klik "Export Soal"
   - File Excel terdownload
   - Buka file Excel
   - Header info ada
   - Tabel soal kosong (hanya header)

3. **Test Nama File**
   - Export beberapa ujian
   - Cek nama file
   - Format: `Soal_[Judul]_[Timestamp].xlsx`
   - Timestamp berbeda untuk setiap export

4. **Test Opsi Jawaban**
   - Export ujian dengan soal yang punya 3 opsi (A, B, C)
   - Cek Excel
   - Opsi D dan E kosong
   - Jawaban benar sesuai

5. **Test Soal dengan Gambar/PDF**
   - Export ujian dengan soal yang ada gambar/PDF
   - Cek Excel
   - Teks soal tetap muncul
   - (Gambar/PDF tidak ikut terexport, hanya teks)

## 📊 Contoh Output Excel

### Sheet: "Soal Ujian"

```
A                    B                           C           D           E
1  SOAL UJIAN
2  Judul Ujian       Ujian Matematika XII
3  Mata Pelajaran    Matematika
4  Durasi            90 menit
5  Passing Score     75
6  Total Soal        10
7
8  No  Soal                          Opsi A      Opsi B      Opsi C      Opsi D      Opsi E      Jawaban Benar  Poin
9  1   Berapakah 2 + 2?              3           4           5           6           7           B              1
10 2   Berapakah 5 x 5?              20          25          30          35          40          B              1
```

## 🔒 Keamanan

1. **Authorization**
   - Hanya guru yang bisa export
   - Guru hanya bisa export ujian miliknya sendiri
   - Cek ownership: `teacher_id = user.id`

2. **Validasi**
   - Cek apakah ujian ada
   - Cek apakah user adalah owner

3. **Sanitasi Filename**
   - Replace karakter special dengan underscore
   - Mencegah path traversal

## 📝 Catatan

1. **Gambar/PDF Tidak Terexport**
   - Hanya teks soal yang terexport
   - Gambar/PDF perlu didownload manual dari aplikasi

2. **Format Excel**
   - Format `.xlsx` (Excel 2007+)
   - Compatible dengan Microsoft Excel, Google Sheets, LibreOffice

3. **Ukuran File**
   - Tergantung jumlah soal
   - Rata-rata: 10-50 KB untuk 20-50 soal

4. **Encoding**
   - UTF-8 encoding
   - Support karakter Indonesia (é, ñ, dll)

## 🚀 Fitur Tambahan (Opsional)

Fitur yang bisa ditambahkan di masa depan:

1. **Export dengan Gambar**
   - Include gambar soal di Excel
   - Menggunakan library untuk embed image

2. **Export ke PDF**
   - Format PDF untuk print
   - Layout yang lebih rapi

3. **Export Template**
   - Template kosong untuk import soal
   - Format yang sama untuk import

4. **Export dengan Statistik**
   - Include statistik soal (berapa siswa yang benar/salah)
   - Tingkat kesulitan soal

5. **Bulk Export**
   - Export multiple ujian sekaligus
   - Zip file dengan multiple Excel

## ✅ Checklist

- [x] Tambah tombol "Export Soal" di exam_detail.ejs
- [x] Tambah route GET /teacher/exams/:id/export
- [x] Implementasi export dengan XLSX
- [x] Format Excel dengan header info
- [x] Format Excel dengan tabel soal
- [x] Set column widths
- [x] Generate filename dengan timestamp
- [x] Authorization check
- [x] Error handling
- [x] Dokumentasi lengkap

---

**Status:** ✅ Selesai
**Tanggal:** 2024
**File Diubah:** 2 file
**Dependencies:** XLSX (sudah terinstall)
