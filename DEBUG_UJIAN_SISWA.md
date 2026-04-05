# Debug: Ujian Siswa Tidak Bisa Dimulai

## Perubahan yang Dilakukan

### 1. Menambahkan Logging di Route Start Exam

File: `src/routes/student.js`

Menambahkan console.log di setiap tahap validasi:
- User ID, Exam ID, Class ID
- Apakah ujian ditemukan
- Validasi waktu mulai
- Validasi waktu selesai
- Validasi kode akses
- Validasi batas percobaan
- Jumlah soal yang ditemukan
- Success/error saat membuat attempt

### 2. Menambahkan Flash Messages di View

File: `src/views/student/exam_detail.ejs`

Menambahkan tampilan flash messages untuk:
- Error messages (merah)
- Info messages (biru)
- Success messages (hijau)

Sekarang siswa akan melihat pesan error yang jelas kenapa ujian tidak bisa dimulai.

## Cara Debugging

### 1. Cek Logs PM2

```bash
pm2 logs lms-smkn1kras --lines 50
```

Cari log dengan prefix `[START EXAM]` untuk melihat:
- User dan exam ID
- Apakah exam ditemukan
- Validasi mana yang gagal
- Error message jika ada

### 2. Cek Flash Messages di Browser

Setelah klik "Mulai sekarang", perhatikan pesan yang muncul di halaman:
- **Merah (Error):** Ada masalah serius
  - "Ujian tidak tersedia" → Ujian tidak ditemukan atau tidak untuk kelas siswa
  - "Ujian sudah berakhir" → Waktu ujian sudah lewat
  - "Kode akses salah" → Kode yang dimasukkan salah
  - "Batas percobaan ujian sudah habis" → Sudah mencapai max attempts
  - "Gagal memulai ujian" → Error database/server

- **Biru (Info):** Informasi
  - "Ujian belum dimulai" → Waktu mulai ujian belum tiba

## Kemungkinan Masalah

### 1. Ujian Tidak Untuk Kelas Siswa

**Gejala:** Flash message "Ujian tidak tersedia"

**Log:**
```
[START EXAM] Exam not found or not accessible for user X
```

**Penyebab:**
- Ujian dibuat untuk kelas tertentu tapi siswa bukan dari kelas tersebut
- Ujian belum di-publish (`is_published = 0`)

**Solusi:**
- Pastikan ujian sudah di-publish
- Pastikan ujian dibuat untuk kelas siswa atau untuk semua kelas

### 2. Waktu Ujian Belum Dimulai

**Gejala:** Flash message "Ujian belum dimulai"

**Log:**
```
[START EXAM] Exam not started yet. Start: 2026-03-06 10:00:00, Now: 2026-03-05 14:00:00
```

**Solusi:**
- Tunggu sampai waktu mulai ujian
- Atau guru mengubah waktu mulai ujian

### 3. Waktu Ujian Sudah Berakhir

**Gejala:** Flash message "Ujian sudah berakhir"

**Log:**
```
[START EXAM] Exam already ended. End: 2026-03-05 12:00:00, Now: 2026-03-05 14:00:00
```

**Solusi:**
- Guru memperpanjang waktu selesai ujian

### 4. Kode Akses Salah

**Gejala:** Flash message "Kode akses salah"

**Log:**
```
[START EXAM] Checking access code. Expected: ABC123, Got: abc124
[START EXAM] Access code mismatch
```

**Solusi:**
- Masukkan kode akses yang benar (case insensitive)
- Tanyakan kode akses ke guru

### 5. Batas Percobaan Habis

**Gejala:** Flash message "Batas percobaan ujian sudah habis"

**Log:**
```
[START EXAM] Attempts: 3/3
[START EXAM] Max attempts reached
```

**Solusi:**
- Guru menambah max_attempts di ujian
- Atau guru menghapus attempt siswa yang gagal

### 6. Tidak Ada Soal

**Gejala:** Flash message "Gagal memulai ujian"

**Log:**
```
[START EXAM] Questions found: 0
[START EXAM] Error: ...
```

**Solusi:**
- Guru menambahkan soal ke ujian

## Testing Checklist

Setelah reload aplikasi, test skenario berikut:

### Skenario 1: Ujian Normal (Harus Berhasil)
- [ ] Ujian sudah di-publish
- [ ] Ujian untuk kelas siswa atau semua kelas
- [ ] Waktu mulai sudah lewat (atau tidak diset)
- [ ] Waktu selesai belum lewat (atau tidak diset)
- [ ] Tidak ada kode akses (atau kode benar)
- [ ] Belum mencapai max attempts
- [ ] Ada soal di ujian
- [ ] **Result:** Siswa berhasil masuk ke halaman ujian

### Skenario 2: Ujian Belum Dimulai
- [ ] Set start_at ke waktu masa depan
- [ ] **Result:** Flash message "Ujian belum dimulai"

### Skenario 3: Ujian Sudah Berakhir
- [ ] Set end_at ke waktu masa lalu
- [ ] **Result:** Flash message "Ujian sudah berakhir"

### Skenario 4: Kode Akses Salah
- [ ] Set access_code di ujian
- [ ] Masukkan kode yang salah
- [ ] **Result:** Flash message "Kode akses salah"

### Skenario 5: Batas Percobaan Habis
- [ ] Set max_attempts = 1
- [ ] Siswa sudah pernah mengerjakan 1x
- [ ] **Result:** Flash message "Batas percobaan ujian sudah habis"

## Reload Aplikasi

```bash
pm2 reload lms-smkn1kras
```

Atau jika di Linux server:
```bash
pm2 reload all
```

## Monitoring Real-time

```bash
# Terminal 1: Monitor logs
pm2 logs lms-smkn1kras

# Terminal 2: Test di browser
# Klik "Mulai sekarang" dan lihat logs di Terminal 1
```

---

**Status:** Debugging tools added  
**Next:** Test dan lihat logs untuk identifikasi masalah
