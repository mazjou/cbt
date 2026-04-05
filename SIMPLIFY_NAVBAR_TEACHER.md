# Simplifikasi Navbar untuk Guru

## Deskripsi
Menghilangkan tombol "Dashboard" dan "Guru" dari navbar untuk guru karena sudah tidak diperlukan. Guru sudah langsung berada di halaman dashboard lengkap ketika login atau mengakses `/dashboard`.

## Perubahan

### 1. Navbar Desktop
**Sebelum:**
- Logo & Nama Sekolah
- Tombol "Dashboard"
- Tombol "Guru"
- Profil Dropdown (dengan link Dashboard)

**Sesudah:**
- Logo & Nama Sekolah
- Profil Dropdown (tanpa link Dashboard)

### 2. Mobile Sidebar
**Sebelum:**
- Tombol "Dashboard"
- Tombol "Guru"
- Tombol Logout

**Sesudah:**
- Tombol Logout (langsung)

### 3. Profile Dropdown
**Sebelum:**
- Profil Saya
- Dashboard
- Keluar

**Sesudah:**
- Profil Saya
- Keluar

## Alasan Perubahan

1. **Redundansi**: Guru sudah berada di halaman dashboard lengkap (`/teacher`)
2. **Simplifikasi**: Mengurangi tombol yang tidak diperlukan
3. **User Experience**: Navbar lebih bersih dan fokus
4. **Konsistensi**: Guru tidak perlu navigasi tambahan karena sudah di halaman utama

## Implementasi Teknis

### Navbar Desktop (src/views/partials/navbar.ejs)

```ejs
<% if (user.role === 'ADMIN') { %>
  <a href="/dashboard">Dashboard</a>
  <a href="/admin">Admin</a>
<% } %>
<% if (user.role === 'TEACHER') { %>
  <!-- No additional buttons for teacher, they're already on dashboard -->
<% } %>
<% if (user.role === 'PRINCIPAL') { %>
  <a href="/dashboard">Dashboard</a>
  <a href="/principal">Kepala Sekolah</a>
<% } %>
<% if (user.role === 'STUDENT') { %>
  <a href="/dashboard">Dashboard</a>
  <a href="/student">Siswa</a>
<% } %>
```

### Mobile Sidebar

```ejs
<!-- Dashboard (not for teacher) -->
<% if (user.role !== 'TEACHER') { %>
  <a href="/dashboard">Dashboard</a>
<% } %>
```

### Profile Dropdown

```ejs
<div class="py-2">
  <a href="/profile">Profil Saya</a>
  <% if (user.role !== 'TEACHER') { %>
    <a href="/dashboard">Dashboard</a>
  <% } %>
</div>
```

## Hasil Akhir

### Navbar Guru (Desktop)
```
[Logo] LMS SMKN 1 Kras [Badge]                    [Profile Dropdown ▼]
```

### Navbar Guru (Mobile)
```
[☰] [Logo] LMS SMKN 1 Kras                        [Profile Button]
```

### Mobile Sidebar Guru
```
┌─────────────────────────┐
│ [Photo] Nama Guru       │
│         TEACHER         │
├─────────────────────────┤
│                         │
│ [Icon] Keluar           │
│                         │
└─────────────────────────┘
```

### Profile Dropdown Guru
```
┌─────────────────────────┐
│ [Photo] Nama Guru       │
│         TEACHER         │
├─────────────────────────┤
│ [Icon] Profil Saya      │
├─────────────────────────┤
│ [Icon] Keluar           │
└─────────────────────────┘
```

## Perbandingan dengan Role Lain

### Admin
- Navbar: Dashboard, Admin
- Sidebar: Dashboard, Admin
- Dropdown: Profil, Dashboard

### Student
- Navbar: Dashboard, Siswa
- Sidebar: Dashboard, Siswa
- Dropdown: Profil, Dashboard

### Principal
- Navbar: Dashboard, Kepala Sekolah
- Sidebar: Dashboard, Kepala Sekolah
- Dropdown: Profil, Dashboard

### Teacher (Setelah Update)
- Navbar: (kosong, hanya logo & profil)
- Sidebar: (hanya logout)
- Dropdown: Profil

## Navigasi Guru

Guru dapat mengakses semua fitur melalui:

1. **Halaman Dashboard** (`/teacher`):
   - Statistik lengkap
   - Aksi cepat (5 tombol)
   - Menu lengkap (8 menu)
   - Panduan singkat

2. **Logo Sekolah**: Klik untuk kembali ke dashboard

3. **Profile Dropdown**: Akses profil dan logout

## Testing

### Test Case 1: Login sebagai Guru
1. Login sebagai guru
2. **Expected**: Redirect ke `/teacher` (dashboard lengkap)
3. **Expected**: Navbar hanya menampilkan logo dan profil

### Test Case 2: Navbar Desktop
1. Login sebagai guru
2. Lihat navbar
3. **Expected**: Tidak ada tombol "Dashboard" atau "Guru"
4. **Expected**: Hanya logo, badge, dan profil dropdown

### Test Case 3: Mobile Sidebar
1. Login sebagai guru di mobile
2. Klik hamburger menu
3. **Expected**: Sidebar hanya menampilkan info profil dan tombol logout
4. **Expected**: Tidak ada tombol "Dashboard" atau "Guru"

### Test Case 4: Profile Dropdown
1. Login sebagai guru
2. Klik profil dropdown
3. **Expected**: Hanya ada "Profil Saya" dan "Keluar"
4. **Expected**: Tidak ada link "Dashboard"

### Test Case 5: Klik Logo
1. Login sebagai guru
2. Klik logo sekolah
3. **Expected**: Redirect ke `/` yang akan redirect ke `/dashboard` yang akan redirect ke `/teacher`

### Test Case 6: Role Lain Tidak Terpengaruh
1. Login sebagai admin/student/principal
2. **Expected**: Navbar tetap menampilkan tombol "Dashboard" dan role-specific button
3. **Expected**: Profile dropdown tetap ada link "Dashboard"

## File yang Diubah

- `src/views/partials/navbar.ejs`: Menghilangkan tombol untuk guru

## File yang Tidak Diubah

- `src/routes/dashboard.js`: Tetap redirect guru ke `/teacher`
- `src/routes/teacher.js`: Tetap sama
- `src/views/teacher/index.ejs`: Tetap sama

## Deployment

Tidak perlu restart aplikasi, cukup refresh browser untuk melihat perubahan.

## Keuntungan

1. ✅ **Navbar lebih bersih**: Tidak ada tombol yang tidak diperlukan
2. ✅ **User experience lebih baik**: Guru fokus pada konten dashboard
3. ✅ **Konsistensi**: Guru tidak bingung dengan tombol yang tidak berfungsi
4. ✅ **Simplifikasi**: Mengurangi kompleksitas navigasi
5. ✅ **Mobile friendly**: Sidebar mobile lebih sederhana

## Catatan

- Perubahan ini hanya mempengaruhi guru (TEACHER role)
- Role lain (Admin, Student, Principal) tetap memiliki tombol navigasi lengkap
- Guru tetap bisa akses semua fitur melalui dashboard lengkap
- Logo sekolah tetap bisa diklik untuk kembali ke home/dashboard

## Update Log

- **2024**: Menghilangkan tombol "Dashboard" dan "Guru" dari navbar untuk simplifikasi
