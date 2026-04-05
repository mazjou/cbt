# Fitur Bab/Materi untuk Bank Soal

## Deskripsi
Fitur ini menambahkan field "Bab/Materi" pada bank soal untuk memudahkan guru mengorganisir soal berdasarkan bab atau topik materi tertentu.

## Perubahan yang Dilakukan

### 1. Database
- **File**: `sql/add_chapter_to_question_bank.sql`
- Menambahkan kolom `chapter` (VARCHAR 255) ke tabel `question_bank`
- Menambahkan index untuk pencarian lebih cepat
- Kolom bersifat opsional (nullable)

### 2. Form Tambah Soal
- **File**: `src/views/teacher/question_bank_new.ejs`
- Menambahkan input field "Bab/Materi" setelah dropdown Mata Pelajaran
- Field bersifat opsional dengan placeholder yang jelas
- Contoh: "Bab 1 - Trigonometri", "Materi Persamaan Linear"

### 3. Backend Route
- **File**: `src/routes/question_bank.js`
- Update POST handler untuk menerima dan menyimpan field `chapter`
- Validasi: field bersifat opsional, disimpan sebagai NULL jika kosong

### 4. Tampilan List Bank Soal
- **File**: `src/views/teacher/question_bank.ejs`
- Menampilkan badge bab/materi dengan warna teal jika ada
- Badge muncul setelah badge mata pelajaran
- Icon 📚 untuk identifikasi visual

## Cara Instalasi

### 1. Jalankan Migration Database
```bash
node run-migration-chapter.js
```

### 2. Restart Aplikasi
```bash
# Jika menggunakan PM2
pm2 restart lms

# Jika manual
# Ctrl+C lalu jalankan lagi
node server.js
```

## Cara Penggunaan

### Untuk Guru:

1. **Menambah Soal dengan Bab/Materi**:
   - Buka menu "Bank Soal"
   - Klik "Tambah Soal"
   - Pilih Mata Pelajaran
   - Isi field "Bab/Materi" (opsional)
     - Contoh: "Bab 1 - Pengenalan Algoritma"
     - Contoh: "Materi Trigonometri Dasar"
     - Contoh: "Persamaan Linear Dua Variabel"
   - Lengkapi form lainnya
   - Klik "Simpan ke Bank Soal"

2. **Melihat Soal dengan Bab/Materi**:
   - Di list bank soal, soal yang memiliki bab/materi akan menampilkan badge teal dengan icon 📚
   - Badge muncul di antara badge mata pelajaran dan tingkat kesulitan

## Manfaat

1. **Organisasi Lebih Baik**: Guru dapat mengelompokkan soal berdasarkan bab atau topik
2. **Pencarian Lebih Mudah**: Memudahkan mencari soal dari bab tertentu
3. **Perencanaan Ujian**: Membantu guru membuat ujian yang fokus pada bab tertentu
4. **Tracking Materi**: Guru dapat melihat distribusi soal per bab/materi

## Contoh Penggunaan

### Matematika:
- "Bab 1 - Bilangan Bulat"
- "Bab 2 - Pecahan dan Desimal"
- "Trigonometri - Sin, Cos, Tan"

### Bahasa Indonesia:
- "Teks Narasi"
- "Puisi dan Pantun"
- "Kalimat Efektif"

### IPA:
- "Sistem Pencernaan"
- "Energi dan Perubahannya"
- "Gaya dan Gerak"

## Catatan Teknis

- Field `chapter` bersifat opsional (tidak wajib diisi)
- Maksimal 255 karakter
- Disimpan sebagai VARCHAR di database
- Memiliki index untuk performa pencarian
- Kompatibel dengan soal lama (yang belum memiliki chapter akan NULL)

## Update Selanjutnya (Opsional)

Fitur yang bisa ditambahkan di masa depan:
1. Filter berdasarkan bab/materi di halaman list
2. Statistik jumlah soal per bab
3. Auto-complete untuk bab yang sudah pernah digunakan
4. Export soal berdasarkan bab tertentu

## Troubleshooting

### Error: Column 'chapter' doesn't exist
**Solusi**: Jalankan migration dengan `node run-migration-chapter.js`

### Bab/Materi tidak tersimpan
**Solusi**: 
1. Cek apakah migration sudah dijalankan
2. Cek console browser untuk error
3. Pastikan form field name="chapter" ada di HTML

### Badge tidak muncul
**Solusi**: Pastikan update file `question_bank.ejs` sudah dilakukan dengan benar

## File yang Diubah

1. `sql/add_chapter_to_question_bank.sql` - Migration SQL
2. `run-migration-chapter.js` - Script migration
3. `src/views/teacher/question_bank_new.ejs` - Form tambah soal
4. `src/routes/question_bank.js` - Backend route
5. `src/views/teacher/question_bank.ejs` - Tampilan list
6. `FITUR_BAB_MATERI_BANK_SOAL.md` - Dokumentasi ini

---
**Dibuat**: 2024
**Status**: ✅ Siap Digunakan
