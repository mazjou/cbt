# Redirect Admin ke /admin

## Deskripsi
Memindahkan route dashboard admin ke `/admin`, sama seperti yang dilakukan untuk guru. Sekarang ketika admin mengakses `/dashboard`, mereka akan otomatis diarahkan ke `/admin`.

## Perubahan

### 1. Route Dashboard (src/routes/dashboard.js)

**Sebelum:**
```javascript
router.get('/', requireAuth, async (req, res) => {
  const user = req.session.user;
  
  if (user.role === 'PRINCIPAL') {
    return res.redirect('/principal');
  }
  
  if (user.role === 'TEACHER') {
    return res.redirect('/teacher');
  }
  
  // Admin mendapat dashboard dengan stats
  if (user.role === 'ADMIN') {
    const [[uCnt]] = await pool.query(...);
    const [[eCnt]] = await pool.query(...);
    const [[qCnt]] = await pool.query(...);
    stats = { users: uCnt.c, exams: eCnt.c, questions: qCnt.c };
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
  
  // Redirect admin to their dashboard
  if (user.role === 'ADMIN') {
    return res.redirect('/admin');
  }
  
  // Only student uses dashboard/index
  // ...
});
```

### 2. Navbar Desktop

**Sebelum:**
- Admin: Tombol "Dashboard" + Tombol "Admin"

**Sesudah:**
- Admin: Hanya tombol "Admin"

### 3. Mobile Sidebar

**Sebelum:**
- Admin: Tombol "Dashboard" + Tombol "Admin"

**Sesudah:**
- Admin: Hanya tombol "Admin"

### 4. Profile Dropdown

**Sebelum:**
- Admin: Profil Saya + Dashboard + Keluar

**Sesudah:**
- Admin: Profil Saya + Keluar

## Hasil Setelah Perubahan

### URL yang Sama untuk Admin
Admin dapat mengakses dashboard melalui 2 URL:
1. `http://localhost:3000/dashboard` → redirect ke `/admin`
2. `http://localhost:3000/admin` → tampil langsung

### Navbar untuk Setiap Role

#### Admin
- Desktop: Hanya tombol "Admin"
- Sidebar: Hanya tombol "Admin"
- Dropdown: Profil Saya, Keluar

#### Teacher
- Desktop: (kosong, hanya logo & profil)
- Sidebar: (hanya logout)
- Dropdown: Profil Saya, Keluar

#### Student
- Desktop: Tombol "Dashboard", Tombol "Siswa"
- Sidebar: Tombol "Dashboard", Tombol "Siswa"
- Dropdown: Profil Saya, Dashboard, Keluar

#### Principal
- Desktop: Tombol "Dashboard", Tombol "Kepala Sekolah"
- Sidebar: Tombol "Dashboard", Tombol "Kepala Sekolah"
- Dropdown: Profil Saya, Dashboard, Keluar

## Konsistensi Routing

Sekarang semua role memiliki pola yang konsisten:

| Role | Login Redirect | Dashboard Redirect | Main Page |
|------|---------------|-------------------|-----------|
| Admin | `/dashboard` | `/admin` | `/admin` |
| Teacher | `/dashboard` | `/teacher` | `/teacher` |
| Student | `/dashboard` | (stay) | `/dashboard` |
| Principal | `/dashboard` | `/principal` | `/principal` |

## Keuntungan

1. ✅ **Konsistensi**: Admin dan Teacher memiliki pola yang sama
2. ✅ **Simplifikasi**: Mengurangi tombol yang tidak diperlukan
3. ✅ **User Experience**: Navbar lebih bersih untuk admin
4. ✅ **Logical Flow**: Admin langsung ke halaman admin, bukan dashboard generic

## Testing

### Test Case 1: Login sebagai Admin
1. Login sebagai admin
2. **Expected**: Redirect ke `/dashboard` → redirect ke `/admin`
3. **Expected**: Navbar hanya menampilkan tombol "Admin"

### Test Case 2: Akses Dashboard sebagai Admin
1. Login sebagai admin
2. Akses `/dashboard`
3. **Expected**: Redirect ke `/admin`

### Test Case 3: Akses Langsung /admin
1. Login sebagai admin
2. Akses `/admin` langsung
3. **Expected**: Tampil halaman admin tanpa redirect

### Test Case 4: Navbar Desktop Admin
1. Login sebagai admin
2. Lihat navbar
3. **Expected**: Tidak ada tombol "Dashboard"
4. **Expected**: Hanya tombol "Admin"

### Test Case 5: Mobile Sidebar Admin
1. Login sebagai admin di mobile
2. Klik hamburger menu
3. **Expected**: Sidebar hanya menampilkan tombol "Admin" dan logout
4. **Expected**: Tidak ada tombol "Dashboard"

### Test Case 6: Profile Dropdown Admin
1. Login sebagai admin
2. Klik profil dropdown
3. **Expected**: Hanya ada "Profil Saya" dan "Keluar"
4. **Expected**: Tidak ada link "Dashboard"

### Test Case 7: Role Lain Tidak Terpengaruh
1. Login sebagai student/principal
2. **Expected**: Navbar tetap menampilkan tombol "Dashboard"
3. **Expected**: Profile dropdown tetap ada link "Dashboard"

### Test Case 8: Teacher Tetap Sama
1. Login sebagai teacher
2. **Expected**: Navbar tetap bersih (hanya logo & profil)
3. **Expected**: Tidak ada tombol "Dashboard" atau "Guru"

## File yang Diubah

1. `src/routes/dashboard.js`: Menambahkan redirect admin ke `/admin`
2. `src/views/partials/navbar.ejs`: Menghilangkan tombol "Dashboard" untuk admin

## File yang Tidak Diubah

- `src/routes/admin.js`: Tetap sama
- `src/views/admin/index.ejs`: Tetap sama
- Route dan view untuk role lain: Tetap sama

## Deployment

Setelah update kode:
1. Restart aplikasi: `npm restart` atau `pm2 restart cbt-app`
2. Test login sebagai admin
3. Verifikasi redirect berfungsi
4. Verifikasi navbar bersih tanpa tombol "Dashboard"

## Catatan

- Perubahan ini hanya mempengaruhi admin dan teacher
- Student dan Principal tetap menggunakan tombol "Dashboard"
- Tidak ada perubahan database
- Tidak ada breaking changes
- Backward compatible (URL lama tetap berfungsi dengan redirect)

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

## Update Log

- **2024**: Memindahkan route dashboard admin ke `/admin` untuk konsistensi dengan teacher
