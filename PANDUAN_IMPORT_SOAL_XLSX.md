# Panduan Import Soal dari File XLSX

## Deskripsi
Fitur ini memungkinkan guru untuk mengimport soal ujian dalam jumlah banyak menggunakan file Excel (.xlsx) atau CSV.

## Keunggulan Format XLSX
✅ Lebih mudah diedit dengan Microsoft Excel atau Google Sheets
✅ Mendukung formatting dan validasi data
✅ Dilengkapi sheet Panduan di dalam file
✅ Lebih stabil untuk file besar
✅ Mendukung karakter Unicode (bahasa Indonesia, simbol matematika, dll)

## Cara Menggunakan

### 1. Download Template
1. Buka halaman ujian yang ingin ditambahkan soal
2. Klik "Import Soal"
3. Download **Template XLSX** (rekomendasi) atau Template CSV
4. Buka file template dengan Microsoft Excel atau Google Sheets

### 2. Isi Data Soal

Template memiliki 2 sheet:
- **Sheet "Panduan"**: Berisi instruksi lengkap
- **Sheet "Soal"**: Berisi contoh format soal

#### Kolom Wajib:
| Kolom | Deskripsi | Contoh |
|-------|-----------|--------|
| `question_text` | Teks soal | "Apa fungsi CPU pada komputer?" |
| `points` | Nilai/bobot soal (angka) | 1 atau 2 |
| `A` | Opsi jawaban A | "Menyimpan data" |
| `B` | Opsi jawaban B | "Mengolah data" |
| `C` | Opsi jawaban C | "Menampilkan data" |
| `D` | Opsi jawaban D | "Mengirim data" |
| `E` | Opsi jawaban E | "Mencetak data" |
| `correct` | Kunci jawaban | A / B / C / D / E |

#### Kolom Opsional:
| Kolom | Deskripsi | Contoh |
|-------|-----------|--------|
| `image` | Nama file gambar atau URL | "gambar1.jpg" atau "https://example.com/img.jpg" |

### 3. Tambahkan Gambar (Opsional)

Jika soal memerlukan gambar:

**Cara 1: Upload File Gambar**
1. Isi kolom `image` dengan nama file (contoh: `gambar1.jpg`)
2. Siapkan file gambar dengan nama yang sama
3. Saat upload, pilih file XLSX DAN file gambar sekaligus

**Cara 2: Gunakan URL**
1. Upload gambar ke hosting (Google Drive, Imgur, dll)
2. Isi kolom `image` dengan URL lengkap
3. Contoh: `https://drive.google.com/uc?id=xxxxx`

### 4. Upload dan Preview

1. Klik tombol "Choose File" di bagian "File Excel/CSV"
2. Pilih file XLSX yang sudah diisi
3. (Opsional) Jika ada gambar lokal, pilih di bagian "Gambar (opsional, multiple)"
4. Klik "Preview & Validasi"
5. Sistem akan menampilkan preview dan validasi data
6. Jika ada error, perbaiki file XLSX dan upload ulang
7. Jika sudah benar, klik "Commit Import" untuk menyimpan

## Format Data

### Contoh Data yang Benar:

```
question_text: Apa fungsi CPU pada komputer?
image: (kosong)
points: 1
A: Menyimpan data
B: Mengolah data
C: Menampilkan data
D: Mengirim data
E: Mencetak data
correct: B
```

### Contoh dengan Gambar:

```
question_text: Perhatikan gambar berikut. Apa nama komponen tersebut?
image: gambar_motherboard.jpg
points: 2
A: RAM
B: Motherboard
C: Hard Disk
D: Power Supply
E: Processor
correct: B
```

## Validasi Data

Sistem akan memvalidasi:
- ✅ Semua kolom wajib terisi
- ✅ Kunci jawaban harus A/B/C/D/E
- ✅ Points harus angka positif
- ✅ Semua opsi (A-E) harus diisi
- ✅ Nama file gambar harus sesuai dengan file yang diupload

## Tips & Best Practices

### 1. Persiapan File
- Hapus baris contoh sebelum mengisi data sendiri
- Jangan ubah nama kolom header
- Gunakan copy-paste untuk mempercepat input data

### 2. Penulisan Soal
- Tulis soal dengan jelas dan lengkap
- Pastikan tidak ada typo di kunci jawaban
- Gunakan huruf kapital untuk kunci jawaban (A/B/C/D/E)

### 3. Gambar
- Format gambar: JPG, PNG, GIF
- Ukuran maksimal per gambar: 5MB
- Nama file gambar tidak boleh ada spasi (gunakan underscore)
- Contoh nama yang baik: `soal_1.jpg`, `matematika_01.png`

### 4. Performa
- Maksimal 200 soal per file untuk performa optimal
- Jika lebih dari 200 soal, pecah menjadi beberapa file
- Upload gambar maksimal 200 file sekaligus

### 5. Troubleshooting
- Jika preview error, cek format kolom di Excel
- Pastikan tidak ada baris kosong di tengah data
- Pastikan encoding file UTF-8 (untuk karakter khusus)

## Error yang Sering Terjadi

### 1. "Kolom wajib tidak lengkap"
**Penyebab**: Ada kolom yang kosong
**Solusi**: Pastikan semua kolom wajib terisi di setiap baris

### 2. "Kunci jawaban tidak valid"
**Penyebab**: Kolom `correct` tidak berisi A/B/C/D/E
**Solusi**: Isi dengan huruf kapital A, B, C, D, atau E

### 3. "Gambar tidak ditemukan"
**Penyebab**: Nama file di kolom `image` tidak sesuai dengan file yang diupload
**Solusi**: Pastikan nama file sama persis (case-sensitive)

### 4. "Points harus angka"
**Penyebab**: Kolom `points` berisi teks atau kosong
**Solusi**: Isi dengan angka positif (1, 2, 3, dst)

## Alternatif: Import dari Word

Jika sudah punya soal di Microsoft Word, bisa menggunakan fitur "Import dari Word (DOCX)":

Format:
```
1. Apa fungsi CPU?
A. Menyimpan data
B. Mengolah data
C. Menampilkan data
D. Mengirim data
E. Mencetak data
KUNCI: B
NILAI: 1

2. Manakah yang termasuk perangkat input?
A. Monitor
B. Printer
C. Keyboard
D. Speaker
E. Proyektor
KUNCI: C
NILAI: 1
```

## Support

Jika mengalami kesulitan:
1. Cek sheet "Panduan" di template XLSX
2. Lihat contoh di sheet "Soal"
3. Download ulang template jika file rusak
4. Hubungi administrator sistem

---

**Template Location**: `src/public/templates/question_import_template.xlsx`
**Script Generator**: `scripts/create_question_template.js`
