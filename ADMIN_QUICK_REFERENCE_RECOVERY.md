# 🚨 Panduan Cepat Admin: Recovery Submission Gagal

## 📋 Kapan Menggunakan Fitur Ini?

Gunakan fitur recovery jika:
- ✅ Siswa lapor nilai tidak muncul setelah submit ujian
- ✅ Siswa dapat pesan "Gagal submit jawaban"
- ✅ Ada notifikasi submission gagal di dashboard

---

## 🔍 Cara Mengakses

### **Metode 1: Dari Dashboard**
```
Login Admin → Dashboard → Klik card "Submission Gagal" (warna merah)
```

### **Metode 2: URL Langsung**
```
https://your-domain.com/admin/failed-submissions
```

---

## 📊 Membaca Informasi Submission Gagal

### **Kolom-Kolom Penting:**

| Kolom | Penjelasan |
|-------|------------|
| **Siswa** | Nama dan username siswa |
| **Ujian** | Judul ujian dan mata pelajaran |
| **Status** | FAILED (merah) = perlu recovery |
| **Waktu** | Kapan mulai dan selesai mengerjakan |
| **Backup** | Ada/Tidak ada backup data |
| **Aksi** | Tombol untuk recovery |

---

## 🛠️ Cara Recovery (2 Metode)

### **Metode 1: PULIHKAN (Recommended)** ✅

**Kapan digunakan:**
- ✅ Ada backup (badge hijau "Ada Backup")
- ✅ Submission gagal karena error database/koneksi
- ✅ Jawaban siswa sudah tersimpan sebelumnya

**Cara:**
```
1. Cari submission yang gagal di tabel
2. Pastikan ada badge hijau "Ada Backup"
3. Klik tombol "Pulihkan" (hijau)
4. Konfirmasi dengan klik OK
5. ✅ Selesai! Nilai akan muncul
```

**Proses di Balik Layar:**
```
1. Ambil data backup dari database
2. Restore semua jawaban siswa
3. Hitung ulang nilai
4. Update status → SUBMITTED
5. Tampilkan nilai ke siswa
```

**Waktu:** ~2-5 detik

---

### **Metode 2: COBA ULANG (Retry)** 🔄

**Kapan digunakan:**
- ⚠️ Tidak ada backup (badge abu-abu "Tidak Ada")
- ⚠️ Backup corrupt atau tidak lengkap
- ⚠️ Metode "Pulihkan" gagal

**Cara:**
```
1. Cari submission yang gagal di tabel
2. Klik tombol "Coba Ulang" (biru)
3. Konfirmasi dengan klik OK
4. ✅ Sistem akan coba proses ulang
```

**Proses di Balik Layar:**
```
1. Reset status submission
2. Ambil jawaban dari tabel attempt_answers
3. Buat backup baru
4. Hitung nilai
5. Update status → SUBMITTED
```

**Waktu:** ~3-7 detik

---

## 🎯 Decision Tree: Metode Mana yang Digunakan?

```
Ada submission gagal?
    ↓
Cek kolom "Backup"
    ↓
┌─────────────────────────────────────────┐
│ Ada badge hijau "Ada Backup"?           │
└─────────────────────────────────────────┘
    ↓                           ↓
   YES                         NO
    ↓                           ↓
Gunakan "PULIHKAN"      Gunakan "COBA ULANG"
    ↓                           ↓
✅ Sukses?                  ✅ Sukses?
    ↓                           ↓
   YES → Selesai!          YES → Selesai!
    ↓                           ↓
   NO                          NO
    ↓                           ↓
Coba "COBA ULANG"       Hubungi Developer
```

---

## ⚠️ Troubleshooting

### **Problem 1: Tombol "Pulihkan" tidak ada**

**Penyebab:** Tidak ada backup untuk submission ini

**Solusi:**
```
1. Gunakan tombol "Coba Ulang" sebagai gantinya
2. Jika "Coba Ulang" juga gagal, hubungi developer
```

---

### **Problem 2: Klik "Pulihkan" tapi gagal**

**Penyebab:** Backup corrupt atau data tidak lengkap

**Solusi:**
```
1. Coba gunakan "Coba Ulang"
2. Jika masih gagal, cek logs:
   - PM2: pm2 logs bank-soal
   - Systemd: sudo journalctl -u bank-soal
3. Hubungi developer dengan info error
```

---

### **Problem 3: Klik "Coba Ulang" tapi gagal**

**Penyebab:** Data attempt_answers tidak ada atau corrupt

**Solusi:**
```
1. Cek apakah siswa benar-benar sudah menjawab soal
2. Minta siswa coba submit ulang dari browser
3. Jika masih gagal, hubungi developer
```

---

### **Problem 4: Nilai muncul tapi salah**

**Penyebab:** Jawaban siswa memang salah, bukan error sistem

**Solusi:**
```
1. Cek review jawaban siswa
2. Verifikasi kunci jawaban soal
3. Jika memang error sistem, hubungi developer
```

---

## 📞 Kapan Harus Hubungi Developer?

Hubungi developer jika:
- ❌ Kedua metode (Pulihkan & Coba Ulang) gagal
- ❌ Ada banyak submission gagal (>10) dalam waktu singkat
- ❌ Nilai yang muncul tidak masuk akal (0 atau 100 semua)
- ❌ Error message yang tidak jelas
- ❌ Sistem tidak merespon

**Info yang perlu disiapkan:**
1. Screenshot halaman failed submissions
2. Nama siswa yang terdampak
3. Judul ujian
4. Waktu kejadian
5. Error message (jika ada)

---

## 📊 Monitoring Rutin

### **Cek Harian (5 menit):**
```
1. Login admin
2. Buka /admin/failed-submissions
3. Cek apakah ada submission gagal
4. Jika ada, recovery segera
5. Catat jumlah dan pola (jika ada)
```

### **Cek Setelah Ujian Besar:**
```
1. Tunggu 10-15 menit setelah ujian selesai
2. Buka /admin/failed-submissions
3. Recovery semua submission gagal
4. Verifikasi semua siswa dapat nilai
5. Lapor ke guru jika ada masalah
```

### **Cek Mingguan (10 menit):**
```
1. Review jumlah submission gagal minggu ini
2. Identifikasi pola (waktu, ujian, kelas)
3. Diskusi dengan developer jika ada pola
4. Update dokumentasi jika perlu
```

---

## 🎓 Tips & Best Practices

### **DO's ✅**
- ✅ Cek failed submissions setiap hari
- ✅ Recovery segera setelah ada laporan
- ✅ Gunakan "Pulihkan" jika ada backup
- ✅ Catat pola submission gagal
- ✅ Komunikasi dengan siswa/guru
- ✅ Backup database sebelum recovery massal

### **DON'Ts ❌**
- ❌ Ignore failed submissions
- ❌ Recovery tanpa konfirmasi siswa
- ❌ Ubah nilai manual tanpa recovery
- ❌ Hapus data backup
- ❌ Panic jika ada submission gagal (ada solusi!)

---

## 📈 Success Metrics

### **Target:**
- ✅ Recovery time: < 5 menit setelah laporan
- ✅ Success rate: > 95% recovery berhasil
- ✅ Response time: < 1 jam untuk laporan siswa

### **Cara Ukur:**
```sql
-- Cek success rate recovery
SELECT 
  COUNT(*) as total_failed,
  SUM(CASE WHEN submission_status = 'SUBMITTED' THEN 1 ELSE 0 END) as recovered,
  ROUND(SUM(CASE WHEN submission_status = 'SUBMITTED' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as recovery_rate
FROM attempts
WHERE submission_status IN ('FAILED', 'SUBMITTED')
  AND updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);
```

---

## 🚨 Emergency Procedures

### **Jika Banyak Submission Gagal (>20):**

```
1. JANGAN PANIC!
2. Cek apakah server masih running
3. Cek database connection
4. Hubungi developer SEGERA
5. Sementara: Catat semua attempt_id yang gagal
6. Tunggu instruksi developer
7. Jangan recovery massal tanpa konsultasi
```

### **Jika Database Down:**

```
1. Hubungi developer/sysadmin SEGERA
2. JANGAN coba recovery
3. Tunggu database up
4. Setelah up, cek failed submissions
5. Recovery satu per satu dengan hati-hati
```

---

## 📝 Checklist Recovery

Sebelum recovery:
- [ ] Verifikasi siswa benar-benar sudah mengerjakan
- [ ] Cek ada backup atau tidak
- [ ] Pilih metode yang tepat (Pulihkan/Coba Ulang)
- [ ] Siap konfirmasi ke siswa

Setelah recovery:
- [ ] Verifikasi nilai muncul
- [ ] Cek nilai masuk akal (tidak 0 atau 100 semua)
- [ ] Konfirmasi ke siswa
- [ ] Catat di log (opsional)
- [ ] Update status di sistem tracking (jika ada)

---

## 📞 Kontak

**Developer:** [Your contact]  
**Sysadmin:** [Sysadmin contact]  
**Emergency:** [Emergency contact]

**Dokumentasi Lengkap:**
- `PEAK_LOAD_SUBMISSION_SOLUTION.md` - Technical details
- `CARA_KERJA_RECOVERY_SUBMISSION.md` - How it works
- `DEPLOY_PEAK_LOAD_SOLUTION.md` - Deployment guide

---

## ✅ Summary

**3 Langkah Mudah Recovery:**

1. **Akses:** Login Admin → Dashboard → "Submission Gagal"
2. **Pilih:** Klik "Pulihkan" (jika ada backup) atau "Coba Ulang"
3. **Verifikasi:** Cek nilai muncul, konfirmasi ke siswa

**Waktu:** < 5 menit per submission  
**Success Rate:** > 95%  
**Difficulty:** ⭐⭐☆☆☆ (Easy)

---

**Semoga membantu! 🎉**

*Last Updated: 14 Maret 2026*
