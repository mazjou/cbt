# Penggabungan Dashboard dengan Halaman Teacher

## Deskripsi
Menggabungkan halaman `/dashboard` dengan `/teacher` untuk guru. Sekarang ketika guru mengakses `/dashboard`, mereka akan otomatis diarahkan ke `/teacher` yang memiliki tampilan dashboard lengkap dengan statistik dan menu aksi cepat.

## Perubahan

### 1. Route Dashboard (src/routes/dashboard.js)

**Sebelum:**
```javascript
router.get('/', requireAuth, async (req, res) => {
  const user = req.session.user;
  if (user.role === 'PRINCIPAL') {
    return res.redirect('/principal');
  }
  
  // Teacher mendapat dashboard sederhana dengan stats minimal
  if (user.role === 'TEACHER') {
    const [[eCnt]] = await pool.query(...);
    const [[aCnt]] = await pool.query(...);
    stats = { exams: eCnt.c, attempts: aCnt.c };
  }
  
  res.render('dashboard/index', { title: 'Dashboard', stats });
});
```

**Sesudah:**
```javascript
router.get('/', requireAuth, async (req, res) => {
  const user = req.session.user;
  
  // Redirect principal to their dashboard
  if (user.role === 'PRINCIPAL') {
    return res.redirect('/principal');
  }
  
  // Redirect teacher to their dashboard
  if (user.role === 'TEACHER') {
    return res.redirect('/teacher');
  }
  
  // Admin dan Student tetap menggunakan dashboard/index
  // ...
});
```

## Hasil Setelah Penggabungan

### URL yang Sama
Guru dapat mengakses dashboard melalui 2 URL:
1. `http://localhost:3000/dashboard` → redirect ke `/teacher`
2. `http://localhost:3000/teacher` → tampil langsung

### Fitur Dashboard Teacher (Lengkap)

#### 1. Statistik (4 Card)
- 📝 **Ujian Anda**: Total ujian yang dibuat
- 📚 **Materi Anda**: Total materi pembelajaran
- 📋 **Tugas Anda**: Total tugas yang diberikan
- ✅ **Total Percobaan**: Siswa mengerjakan ujian

#### 2. Aksi Cepat (5 Tombol)
- 🎥 **Buat Live Class**: Video conference
- 📝 **Buat Ujian**: Pilihan ganda
- 📚 **Buat Materi**: Upload materi
- 📋 **Buat Tugas**: Upload file
- ⭐ **Lihat Nilai**: Hasil ujian

#### 3. Menu Lengkap (8 Menu)
- 🎥 **Live Classes**: Video conference
- 📝 **Ujian Saya**: Kelola ujian
- 📚 **Materi Saya**: Kelola materi
- 📋 **Tugas Saya**: Kelola tugas
- ⭐ **Daftar Nilai**: Hasil ujian siswa
- 💾 **Bank Soal**: Soal reusable
- 📊 **Rekap Materi**: Siswa lihat materi
- 📢 **Notifikasi**: Kirim peringatan

#### 4. Panduan Singkat
- Cara membuat ujian (4 langkah)
- Cara membuat materi (4 langkah)

## Keuntungan Penggabungan

### Sebelum:
- ❌ Dashboard guru sederhana (hanya 2 statistik)
- ❌ Tidak ada aksi cepat
- ❌ Tidak ada menu lengkap
- ❌ Guru harus klik menu untuk akses fitur

### Sesudah:
- ✅ Dashboard guru lengkap (4 statistik)
- ✅ Aksi cepat untuk fitur utama
- ✅ Menu lengkap dengan icon menarik
- ✅ Panduan singkat untuk membantu guru
- ✅ Tampilan lebih modern dengan gradient warna-warni
- ✅ Satu halaman untuk semua kebutuhan guru

## User Experience

### Flow Guru Login:
1. Login → redirect ke `/dashboard`
2. Dashboard detect role = TEACHER
3. Redirect ke `/teacher`
4. Tampil dashboard lengkap dengan semua fitur

### Konsistensi:
- Admin → `/dashboard` (dashboard admin)
- Teacher → `/dashboard` → redirect → `/teacher` (dashboard guru lengkap)
- Student → `/dashboard` (dashboard siswa)
- Principal → `/dashboard` → redirect → `/principal` (dashboard kepala sekolah)

## Testing

### Test Case 1: Akses Dashboard sebagai Guru
1. Login sebagai guru
2. Klik menu "Dashboard" atau akses `/dashboard`
3. **Expected**: Redirect ke `/teacher` dengan tampilan lengkap

### Test Case 2: Akses Langsung /teacher
1. Login sebagai guru
2. Akses `/teacher` langsung
3. **Expected**: Tampil dashboard lengkap tanpa redirect

### Test Case 3: Statistik Muncul
1. Login sebagai guru yang sudah buat ujian/materi/tugas
2. Akses dashboard
3. **Expected**: Angka statistik muncul dengan benar

### Test Case 4: Aksi Cepat Berfungsi
1. Login sebagai guru
2. Klik salah satu tombol aksi cepat (misal: Buat Ujian)
3. **Expected**: Redirect ke halaman form buat ujian

### Test Case 5: Menu Lengkap Berfungsi
1. Login sebagai guru
2. Klik salah satu menu lengkap (misal: Bank Soal)
3. **Expected**: Redirect ke halaman bank soal

## File yang Diubah

- `src/routes/dashboard.js`: Menambahkan redirect untuk teacher

## File yang Tidak Diubah

- `src/routes/teacher.js`: Tetap sama, sudah lengkap
- `src/views/teacher/index.ejs`: Tetap sama, sudah lengkap
- `src/views/dashboard/index.ejs`: Tetap sama (untuk admin & student)

## Deployment

Setelah update kode:
1. Restart aplikasi: `npm restart` atau `pm2 restart cbt-app`
2. Test login sebagai guru
3. Verifikasi redirect berfungsi
4. Verifikasi semua menu dan tombol berfungsi

## Catatan

- Perubahan ini hanya mempengaruhi guru (TEACHER role)
- Admin dan Student tetap menggunakan dashboard lama
- Principal sudah redirect ke `/principal` sejak awal
- Tidak ada perubahan database
- Tidak ada breaking changes

## Troubleshooting

### Jika redirect tidak berfungsi:
1. Clear browser cache
2. Logout dan login ulang
3. Cek console log untuk error
4. Pastikan session masih valid

### Jika statistik tidak muncul:
1. Cek apakah guru sudah buat ujian/materi/tugas
2. Cek console log untuk error query
3. Pastikan tabel database lengkap

## Update Log

- **2024**: Menggabungkan dashboard dengan halaman teacher untuk pengalaman yang lebih baik
