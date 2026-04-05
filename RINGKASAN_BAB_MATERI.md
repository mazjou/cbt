# Ringkasan: Fitur Bab/Materi Bank Soal

## ✅ Yang Sudah Dilakukan

1. **Database**: Menambahkan kolom `chapter` ke tabel `question_bank`
2. **Form**: Menambahkan input "Bab/Materi" di form tambah soal
3. **Backend**: Update route untuk menyimpan data chapter
4. **Tampilan**: Menampilkan badge bab/materi di list bank soal

## 🚀 Cara Install

```bash
# 1. Jalankan migration database
node run-migration-chapter.js

# 2. Restart aplikasi
pm2 restart lms
# atau
node server.js
```

## 📝 Cara Pakai

1. Buka "Bank Soal" → "Tambah Soal"
2. Isi field "Bab/Materi" (opsional)
   - Contoh: "Bab 1 - Trigonometri"
   - Contoh: "Materi Persamaan Linear"
3. Simpan soal
4. Badge bab/materi akan muncul di list (warna teal dengan icon 📚)

## 📁 File yang Diubah

- `sql/add_chapter_to_question_bank.sql`
- `run-migration-chapter.js`
- `src/views/teacher/question_bank_new.ejs`
- `src/routes/question_bank.js`
- `src/views/teacher/question_bank.ejs`

## 💡 Manfaat

- Organisasi soal lebih baik per bab/topik
- Pencarian soal lebih mudah
- Perencanaan ujian lebih terstruktur

---
Dokumentasi lengkap: `FITUR_BAB_MATERI_BANK_SOAL.md`
