# Fix Filter "Belum Lihat" di Tampilan Materi

## Masalah
Pada halaman `/teacher/material-views`, bagian "Belum Lihat" menampilkan semua siswa aktif tanpa memperhatikan kelas yang ditugaskan pada materi yang dipilih. Ini menyebabkan daftar siswa yang belum melihat materi tidak akurat.

## Solusi yang Diterapkan

### 1. Filter Berdasarkan Kelas Materi
Ketika guru memilih materi tertentu, sistem sekarang:
- Mengambil `class_id` dari materi yang dipilih
- Hanya menampilkan siswa dari kelas tersebut di bagian "Belum Lihat"
- Jika materi tidak memiliki kelas spesifik (`class_id = NULL`), menampilkan semua siswa

### 2. Logika Filter

#### Ketika Materi Dipilih:
```javascript
// 1. Ambil class_id dari materi
const [[materialInfo]] = await pool.query(
  `SELECT class_id FROM materials WHERE id=:material_id LIMIT 1;`,
  { material_id }
);

// 2. Filter siswa berdasarkan kelas materi
if (materialInfo && materialInfo.class_id) {
  notViewedWhere.push('u.class_id=:material_class_id');
  notViewedParams.material_class_id = materialInfo.class_id;
}

// 3. Filter tambahan dari dropdown kelas (opsional)
if (class_id) {
  notViewedWhere.push('u.class_id=:class_id');
  notViewedParams.class_id = class_id;
}
```

#### Ketika Tidak Ada Materi Dipilih:
- Menampilkan siswa yang belum melihat SEMUA materi dari guru tersebut
- Filter kelas dari dropdown tetap berfungsi

## File yang Dimodifikasi
- `src/routes/teacher.js` (route GET `/teacher/material-views`, sekitar baris 2004-2080)

## Cara Kerja

### Skenario 1: Pilih Materi Tertentu
1. Guru memilih "Materi Matematika Kelas X-A" dari dropdown
2. Sistem mengecek bahwa materi ini ditugaskan ke kelas "X-A"
3. Bagian "Belum Lihat" hanya menampilkan siswa dari kelas X-A yang belum membuka materi
4. Siswa dari kelas lain (X-B, X-C, dll) tidak ditampilkan

### Skenario 2: Pilih Materi + Filter Kelas
1. Guru memilih "Materi Matematika Kelas X-A"
2. Guru juga memilih filter kelas "X-A" dari dropdown
3. Kedua filter bekerja bersamaan (AND logic)
4. Hasil: Siswa kelas X-A yang belum melihat materi tersebut

### Skenario 3: Tidak Pilih Materi
1. Dropdown materi: "Semua Materi"
2. Sistem menampilkan siswa yang belum melihat SEMUA materi dari guru
3. Filter kelas tetap bisa digunakan untuk mempersempit hasil

### Skenario 4: Materi Tanpa Kelas Spesifik
1. Jika materi memiliki `class_id = NULL` (untuk semua kelas)
2. Sistem menampilkan semua siswa aktif yang belum melihat
3. Filter kelas dari dropdown tetap berfungsi jika diperlukan

## Keuntungan
✅ Data "Belum Lihat" lebih akurat dan relevan  
✅ Guru tidak bingung melihat siswa dari kelas lain  
✅ Filter kelas tambahan tetap berfungsi untuk fleksibilitas  
✅ Mendukung materi yang ditugaskan ke kelas spesifik maupun semua kelas  

## Testing
Untuk menguji fitur ini:
1. Buat materi dengan kelas spesifik (misal: Kelas X-A)
2. Pastikan ada siswa di kelas X-A dan kelas lain (X-B)
3. Buka halaman `/teacher/material-views`
4. Pilih materi tersebut dari dropdown
5. Verifikasi bagian "Belum Lihat" hanya menampilkan siswa dari kelas X-A

## Catatan Teknis
- Query menggunakan parameterized queries untuk keamanan
- Menggunakan `NOT EXISTS` untuk performa optimal
- Filter bekerja dengan AND logic (semua kondisi harus terpenuhi)
- Mendukung pencarian nama/username siswa bersamaan dengan filter kelas
