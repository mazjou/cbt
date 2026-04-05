# Simplifikasi Navbar untuk Semua Role

## Deskripsi
Menerapkan pola yang sama untuk semua role: menghilangkan tombol "Dashboard" dan redirect langsung ke halaman role-specific. Setiap role sekarang memiliki satu tombol utama di navbar yang mengarah ke halaman dashboard mereka.

## Perubahan

### 1. Route Dashboard (src/routes/dashboard.js)

**Sebelum:**
```javascript
router.get('/', requireAuth, async (req, res) => {
  // Principal redirect
  // Teacher redirect
  // Admin redirect
  // Student render dashboard dengan stats
});
```

**Sesudah:**
```javascript
router.get('/', requireAuth, async (req, res) => {
  // Redirect all roles to their specific dashboards
  if (user.role === 'PRINCIPAL') return res.redirect('/principal');
  if (user.role === 'TEACHER') return res.redirect('/teacher');
  if (user.role === 'ADMIN') return res.redirect('/admin');
  if (user.role === 'STUDENT') return res.redirect('/student');
  
  // Fallback
  res.redirect('/login');
});
```

### 2. Navbar untuk Setiap Role

#### Admin
- **Desktop**: Hanya tombol "Admin"
- **Sidebar**: Hanya tombol "Admin"
- **Dropdown**: Profil Saya, Keluar

#### Teacher
- **Desktop**: (kosong, hanya logo & profil)
- **Sidebar**: (hanya logout)
- **Dropdown**: Profil Saya, Keluar

#### Student
- **Desktop**: Hanya tombol "Siswa"
- **Sidebar**: Hanya tombol "Siswa"
- **Dropdown**: Profil Saya, Keluar

#### Principal
- **Desktop**: Hanya tombol "Kepala Sekolah"
- **Sidebar**: Hanya tombol "Kepala Sekolah"
- **Dropdown**: Profil Saya, Keluar

## Pola Routing Konsisten

| Role | Login → | Dashboard → | Main Page | Navbar Button |
|------|---------|-------------|-----------|---------------|
| Admin | `/dashboard` | `/admin` | `/admin` | Admin |
| Teacher | `/dashboard` | `/teacher` | `/teacher` | (none) |
| Student | `/dashboard` | `/student` | `/student` | Siswa |
| Principal | `/dashboard` | `/principal` | `/principal` | Kepala Sekolah |

## Keuntungan

1. ✅ **Konsistensi**: Semua role memiliki pola yang sama
2. ✅ **Simplifikasi**: Hanya satu tombol per role (kecuali teacher)
3. ✅ **User Experience**: Navbar lebih bersih dan fokus
4. ✅ **Logical Flow**: Setiap role langsung ke halaman utama mereka
5. ✅ **Mengurangi Redundansi**: Tidak ada tombol "Dashboard" yang tidak diperlukan

## Navbar Sebelum vs Sesudah

### Sebelum
```
Admin:     [Dashboard] [Admin]
Teacher:   [Dashboard] [Guru]
Student:   [Dashboard] [Siswa]
Principal: [Dashboard] [Kepala Sekolah]
```

### Sesudah
```
Admin:     [Admin]
Teacher:   (none)
Student:   [Siswa]
Principal: [Kepala Sekolah]
```

## Profile Dropdown Sebelum vs Sesudah

### Sebelum
```
- Profil Saya
- Dashboard
- Keluar
```

### Sesudah
```
- Profil Saya
- Keluar
```

## Mobile Sidebar Sebelum vs Sesudah

### Sebelum
```
Admin:     [Dashboard] [Admin] [Logout]
Teacher:   [Dashboard] [Guru] [Logout]
Student:   [Dashboard] [Siswa] [Logout]
Principal: [Dashboard] [Kepala Sekolah] [Logout]
```

### Sesudah
```
Admin:     [Admin] [Logout]
Teacher:   [Logout]
Student:   [Siswa] [Logout]
Principal: [Kepala Sekolah] [Logout]
```

## Testing

### Test Case 1: Login sebagai Admin
1. Login sebagai admin
2. **Expected**: Redirect ke `/dashboard` → `/admin`
3. **Expected**: Navbar hanya tombol "Admin"

### Test Case 2: Login sebagai Teacher
1. Login sebagai teacher
2. **Expected**: Redirect ke `/dashboard` → `/teacher`
3. **Expected**: Navbar kosong (hanya logo & profil)

### Test Case 3: Login sebagai Student
1. Login sebagai student
2. **Expected**: Redirect ke `/dashboard` → `/student`
3. **Expected**: Navbar hanya tombol "Siswa"

### Test Case 4: Login sebagai Principal
1. Login sebagai principal
2. **Expected**: Redirect ke `/dashboard` → `/principal`
3. **Expected**: Navbar hanya tombol "Kepala Sekolah"

### Test Case 5: Akses Dashboard Langsung
1. Login sebagai role apapun
2. Akses `/dashboard` di browser
3. **Expected**: Redirect ke halaman role-specific

### Test Case 6: Profile Dropdown
1. Login sebagai role apapun
2. Klik profil dropdown
3. **Expected**: Hanya ada "Profil Saya" dan "Keluar"
4. **Expected**: Tidak ada link "Dashboard"

### Test Case 7: Mobile Sidebar
1. Login sebagai role apapun di mobile
2. Klik hamburger menu
3. **Expected**: Sidebar hanya menampilkan tombol role-specific dan logout
4. **Expected**: Tidak ada tombol "Dashboard"

### Test Case 8: Klik Logo
1. Login sebagai role apapun
2. Klik logo sekolah
3. **Expected**: Redirect ke `/` → `/dashboard` → halaman role-specific

## File yang Diubah

1. **src/routes/dashboard.js**: 
   - Menambahkan redirect untuk semua role
   - Menghapus logic render dashboard untuk student

2. **src/views/partials/navbar.ejs**: 
   - Menghilangkan tombol "Dashboard" untuk semua role
   - Menyederhanakan profile dropdown
   - Menyederhanakan mobile sidebar

## File yang Tidak Diubah

- `src/routes/admin.js`: Tetap sama
- `src/routes/teacher.js`: Tetap sama
- `src/routes/student.js`: Tetap sama (perlu ada route GET `/student`)
- `src/routes/principal.js`: Tetap sama
- View files untuk setiap role: Tetap sama

## Catatan Penting

### Student Route
Pastikan ada route GET `/student` di `src/routes/student.js`:
```javascript
router.get('/', async (req, res) => {
  const user = req.session.user;
  // Get student stats and render dashboard
  res.render('student/index', { title: 'Dashboard Siswa', stats });
});
```

### Principal Route
Pastikan ada route GET `/principal` di `src/routes/principal.js`:
```javascript
router.get('/', async (req, res) => {
  const user = req.session.user;
  // Get principal stats and render dashboard
  res.render('principal/index', { title: 'Dashboard Kepala Sekolah', stats });
});
```

## Deployment

Setelah update kode:
1. Restart aplikasi: `npm restart` atau `pm2 restart cbt-app`
2. Test login untuk semua role
3. Verifikasi redirect berfungsi untuk semua role
4. Verifikasi navbar bersih untuk semua role

## Troubleshooting

### Jika redirect tidak berfungsi:
1. Clear browser cache
2. Logout dan login ulang
3. Cek console log untuk error
4. Pastikan session masih valid

### Jika navbar masih menampilkan tombol "Dashboard":
1. Hard refresh browser (Ctrl+F5)
2. Clear browser cache
3. Pastikan file navbar.ejs sudah terupdate

### Jika student/principal redirect error:
1. Pastikan route GET `/student` ada di student.js
2. Pastikan route GET `/principal` ada di principal.js
3. Pastikan view file `student/index.ejs` dan `principal/index.ejs` ada

## Keuntungan User Experience

### Untuk Admin
- Langsung ke halaman admin panel
- Tidak perlu klik "Dashboard" lalu "Admin"
- Navbar lebih bersih

### Untuk Teacher
- Langsung ke dashboard lengkap dengan semua fitur
- Navbar paling bersih (hanya logo & profil)
- Fokus pada konten

### Untuk Student
- Langsung ke halaman siswa dengan ujian, materi, tugas
- Tidak perlu klik "Dashboard" lalu "Siswa"
- Navbar lebih bersih

### Untuk Principal
- Langsung ke halaman kepala sekolah dengan laporan
- Tidak perlu klik "Dashboard" lalu "Kepala Sekolah"
- Navbar lebih bersih

## Update Log

- **2024**: Menerapkan simplifikasi navbar untuk semua role dengan redirect konsisten
