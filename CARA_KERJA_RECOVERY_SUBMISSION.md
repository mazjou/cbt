# 📚 Cara Kerja Fitur Recovery Submission Ujian

## 🎯 Tujuan Fitur

Fitur ini dibuat untuk mengatasi masalah **"jawaban siswa hilang dan nilai menjadi 0"** ketika proses submission ujian gagal karena error database, koneksi terputus, atau masalah teknis lainnya.

---

## 🔄 Alur Kerja Lengkap

### 1️⃣ **Saat Siswa Mengerjakan Ujian (Normal)**

```
Siswa menjawab soal → Jawaban tersimpan di tabel attempt_answers
```

- Setiap kali siswa memilih jawaban, langsung disimpan ke database
- Status attempt: `IN_PROGRESS`
- Tidak ada perubahan dari sistem lama

### 2️⃣ **Saat Siswa Klik "Submit Ujian" (PROSES BARU)**

Inilah bagian yang telah ditingkatkan dengan sistem backup:

```
┌─────────────────────────────────────────────────────────────┐
│  SISWA KLIK "SUBMIT"                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Update Status → "SUBMITTING"                      │
│  (Menandai bahwa proses submission sedang berjalan)        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: BACKUP JAWABAN                                     │
│  ✅ Ambil semua jawaban siswa dari attempt_answers         │
│  ✅ Simpan ke tabel submission_backups dalam format JSON   │
│  ✅ Include: soal, jawaban, poin, waktu jawab              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: HITUNG NILAI                                       │
│  • Total poin soal                                          │
│  • Poin yang didapat (jawaban benar)                       │
│  • Jumlah benar/salah                                       │
│  • Persentase nilai (0-100)                                 │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: UPDATE ATTEMPT                                     │
│  • Status: "SUBMITTED"                                      │
│  • Submission_status: "SUBMITTED"                           │
│  • Score: [nilai yang dihitung]                             │
│  • Finished_at: [waktu sekarang]                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  ✅ SUKSES - Siswa lihat hasil ujian                        │
└─────────────────────────────────────────────────────────────┘
```

### 3️⃣ **Jika Terjadi ERROR Saat Submit**

```
┌─────────────────────────────────────────────────────────────┐
│  ❌ ERROR TERJADI (Database down, koneksi putus, dll)      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  ROLLBACK TRANSACTION                                       │
│  • Semua perubahan dibatalkan                               │
│  • TAPI backup sudah tersimpan!                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  UPDATE STATUS → "FAILED"                                   │
│  • Status attempt tetap: "IN_PROGRESS"                      │
│  • Submission_status: "FAILED"                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  PESAN KE SISWA                                             │
│  "Gagal submit jawaban. Jawaban Anda telah disimpan        │
│   dan dapat dipulihkan oleh admin. Silakan hubungi         │
│   guru atau admin."                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Cara Admin Memulihkan Submission Gagal

### **Langkah 1: Akses Dashboard Admin**

```
Login sebagai Admin → Dashboard Admin
```

### **Langkah 2: Buka Halaman Recovery**

```
Klik card "Submission Gagal" (warna merah) 
atau akses: /admin/failed-submissions
```

### **Langkah 3: Lihat Daftar Submission Gagal**

Tabel akan menampilkan:
- **Nama Siswa** & Username
- **Judul Ujian** & Mata Pelajaran
- **Status**: FAILED (merah)
- **Waktu**: Kapan mulai dan selesai
- **Backup**: Ada/Tidak ada backup
- **Aksi**: Tombol Pulihkan / Coba Ulang

### **Langkah 4: Pilih Metode Recovery**

#### **Opsi A: PULIHKAN (Jika ada backup)**

```
Klik "Pulihkan" → Konfirmasi
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  PROSES RECOVERY:                                           │
│  1. Ambil data backup dari submission_backups               │
│  2. Restore semua jawaban ke attempt_answers                │
│  3. Hitung ulang nilai berdasarkan jawaban                  │
│  4. Update attempt status → "SUBMITTED"                     │
│  5. Tandai backup sebagai "RESTORED"                        │
└─────────────────────────────────────────────────────────────┘
                    ↓
         ✅ BERHASIL - Nilai muncul!
```

#### **Opsi B: COBA ULANG (Retry)**

```
Klik "Coba Ulang" → Konfirmasi
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  PROSES RETRY:                                              │
│  1. Reset submission_status → "PENDING"                     │
│  2. Jalankan ulang proses finalisasi                        │
│  3. Buat backup baru                                        │
│  4. Hitung nilai                                            │
│  5. Update status → "SUBMITTED"                             │
└─────────────────────────────────────────────────────────────┘
                    ↓
         ✅ BERHASIL - Nilai muncul!
```

---

## 🗄️ Struktur Database

### **Tabel: submission_backups**

```sql
CREATE TABLE submission_backups (
    id INT PRIMARY KEY,
    attempt_id INT,           -- ID attempt yang di-backup
    student_id INT,           -- ID siswa
    exam_id INT,              -- ID ujian
    backup_data JSON,         -- Data jawaban dalam format JSON
    created_at TIMESTAMP,     -- Kapan backup dibuat
    restored_at TIMESTAMP,    -- Kapan di-restore (NULL jika belum)
    status ENUM('ACTIVE', 'RESTORED', 'EXPIRED')
);
```

### **Kolom Baru di Tabel: attempts**

```sql
ALTER TABLE attempts ADD COLUMN 
submission_status ENUM('PENDING', 'SUBMITTING', 'SUBMITTED', 'FAILED');
```

**Status Meaning:**
- `PENDING`: Belum di-submit
- `SUBMITTING`: Sedang proses submit
- `SUBMITTED`: Berhasil submit
- `FAILED`: Gagal submit (perlu recovery)

### **Contoh Data Backup (JSON)**

```json
{
  "attempt_id": 123,
  "student_id": 456,
  "exam_id": 789,
  "backup_timestamp": "2026-03-13T10:30:00.000Z",
  "answers": [
    {
      "question_id": 1,
      "option_id": 3,
      "is_correct": 1,
      "answered_at": "2026-03-13T10:25:00.000Z",
      "question_text": "Apa ibu kota Indonesia?",
      "points": 10,
      "option_text": "Jakarta"
    },
    {
      "question_id": 2,
      "option_id": 7,
      "is_correct": 0,
      "answered_at": "2026-03-13T10:26:00.000Z",
      "question_text": "Berapa 2+2?",
      "points": 10,
      "option_text": "5"
    }
  ]
}
```

---

## 🔐 Keamanan & Integritas Data

### **Transaction-based Processing**

```javascript
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  
  // Step 1: Update status
  // Step 2: Backup
  // Step 3: Calculate
  // Step 4: Update result
  
  await connection.commit(); // ✅ Semua berhasil
} catch (error) {
  await connection.rollback(); // ❌ Batalkan semua
  throw error;
}
```

**Benefit:**
- Jika ada error di tengah proses, semua dibatalkan
- Data tidak akan corrupt atau setengah-setengah
- Backup tetap tersimpan untuk recovery

---

## 📊 Monitoring & Logging

### **Log Messages**

```bash
# Submission berhasil
[AUTO-SUBMIT] Attempt 123 successfully submitted with backup

# Submission gagal
[FAILED] Submission 123 marked as failed

# Recovery berhasil
[RECOVERY] Attempt 123 recovered from backup
```

### **Query Monitoring**

```sql
-- Cek berapa submission yang gagal
SELECT COUNT(*) FROM attempts WHERE submission_status = 'FAILED';

-- Cek berapa backup yang aktif
SELECT COUNT(*) FROM submission_backups WHERE status = 'ACTIVE';

-- Cek berapa yang sudah di-recover
SELECT COUNT(*) FROM submission_backups WHERE status = 'RESTORED';
```

---

## 🎯 Skenario Penggunaan

### **Skenario 1: Database Overload**

```
Situasi: 100 siswa submit bersamaan, database lambat
Hasil: Beberapa submission timeout
Solusi: Admin buka /admin/failed-submissions → Klik "Coba Ulang"
```

### **Skenario 2: Koneksi Internet Siswa Putus**

```
Situasi: Siswa klik submit, tapi koneksi putus di tengah proses
Hasil: Submission gagal, status FAILED
Solusi: Admin buka /admin/failed-submissions → Klik "Pulihkan"
```

### **Skenario 3: Server Restart Mendadak**

```
Situasi: Server restart saat ada siswa yang sedang submit
Hasil: Submission tidak selesai, ada backup
Solusi: Admin buka /admin/failed-submissions → Klik "Pulihkan"
```

---

## ✅ Keuntungan Sistem Ini

1. **Zero Data Loss** 
   - Jawaban siswa tidak akan pernah hilang
   - Backup otomatis sebelum proses apapun

2. **Easy Recovery**
   - Admin bisa pulihkan dengan 1 klik
   - Tidak perlu akses database manual

3. **Transparent**
   - Siswa tahu jika ada masalah
   - Admin bisa lihat semua submission gagal

4. **Automatic**
   - Backup otomatis, tidak perlu manual
   - Auto-submit juga menggunakan sistem ini

5. **Audit Trail**
   - Semua proses tercatat di log
   - Bisa tracking kapan backup dibuat/di-restore

---

## 🚀 Cara Menggunakan

### **Untuk Siswa:**
- Kerjakan ujian seperti biasa
- Klik "Submit" seperti biasa
- Jika gagal, hubungi guru/admin
- Jawaban sudah aman tersimpan!

### **Untuk Admin:**
1. Login sebagai admin
2. Klik card "Submission Gagal" di dashboard
3. Lihat daftar submission yang gagal
4. Klik "Pulihkan" atau "Coba Ulang"
5. Selesai! Nilai siswa muncul

---

## 🔧 Troubleshooting

### **Jika tidak ada tombol "Pulihkan":**
- Berarti tidak ada backup untuk submission tersebut
- Gunakan tombol "Coba Ulang" sebagai gantinya

### **Jika "Coba Ulang" gagal:**
- Cek koneksi database
- Lihat log error di console
- Pastikan data attempt_answers masih ada

### **Jika backup tidak terbuat:**
- Cek apakah tabel submission_backups ada
- Cek permission database
- Lihat log error saat submission

---

## 📝 Kesimpulan

Fitur Recovery Submission Ujian ini bekerja dengan cara:

1. **Backup otomatis** sebelum setiap submission
2. **Transaction-based** untuk keamanan data
3. **Status tracking** untuk monitoring
4. **Admin interface** untuk recovery mudah
5. **Logging lengkap** untuk audit

**Hasil:** Jawaban siswa tidak akan pernah hilang lagi, bahkan jika submission gagal! 🎉