# Update: Mobile Sidebar Navigation

## Perubahan

Menambahkan sidebar mobile yang bisa di-hide untuk navigasi yang lebih baik di perangkat mobile.

## Fitur

### 1. Hamburger Menu Button
- Muncul di kiri atas (sebelah logo) hanya di mobile
- Icon 3 garis horizontal
- Hilang otomatis di layar besar (lg breakpoint)

### 2. Sidebar Mobile
- Lebar: 320px (w-80)
- Posisi: Fixed di kiri
- Animasi: Slide dari kiri dengan smooth transition
- Background: Putih dengan shadow

### 3. Sidebar Header
- Gradient indigo-purple
- Menampilkan:
  - Logo sekolah
  - Nama lengkap user
  - Role dan kelas (jika ada)
- Tombol close (X) di kanan

### 4. Sidebar Menu
- Dashboard (untuk semua role)
- Menu role-specific:
  - Admin → Panel Admin
  - Teacher → Panel Guru
  - Principal → Panel Kepala Sekolah
  - Student → Panel Siswa
- Tombol Keluar (logout)

### 5. Overlay
- Background hitam semi-transparan (50%)
- Klik overlay = tutup sidebar
- Mencegah scroll body saat sidebar terbuka

### 6. Interaksi
- Klik hamburger → Buka sidebar
- Klik X → Tutup sidebar
- Klik overlay → Tutup sidebar
- Klik link menu → Tutup sidebar otomatis
- Body scroll disabled saat sidebar terbuka

## Tampilan Desktop vs Mobile

### Desktop (lg breakpoint ke atas)
- Hamburger menu: HIDDEN
- Sidebar: HIDDEN
- Tombol navigasi di navbar: VISIBLE
- Layout normal seperti biasa

### Mobile (di bawah lg breakpoint)
- Hamburger menu: VISIBLE
- Sidebar: Tersembunyi (slide out)
- Tombol navigasi di navbar: HIDDEN
- Akses menu via sidebar

## Icon yang Digunakan

- Dashboard: Home icon
- Admin: Settings/gear icon
- Guru: Book icon
- Kepala Sekolah: Building icon
- Siswa: Graduation cap icon
- Logout: Arrow right icon
- Hamburger: 3 horizontal lines
- Close: X icon

## Styling

### Colors
- Header sidebar: Gradient indigo-purple
- Dashboard: Blue gradient
- Admin: Purple gradient
- Guru: Teal gradient
- Kepala Sekolah: Amber gradient
- Siswa: Cyan gradient
- Logout: Rose gradient

### Effects
- Smooth slide animation (300ms)
- Hover effects pada semua button
- Border dan shadow untuk depth
- Rounded corners (xl)

## File yang Dimodifikasi

- `src/views/partials/navbar.ejs`

## Cara Kerja

1. User klik hamburger menu
2. Sidebar slide masuk dari kiri
3. Overlay muncul di belakang sidebar
4. Body scroll disabled
5. User pilih menu atau klik close/overlay
6. Sidebar slide keluar ke kiri
7. Overlay hilang
8. Body scroll enabled kembali

## Responsive Breakpoints

- Mobile: < 1024px (lg breakpoint)
  - Sidebar aktif
  - Hamburger visible
  - Navbar menu hidden

- Desktop: ≥ 1024px
  - Sidebar hidden
  - Hamburger hidden
  - Navbar menu visible

## JavaScript

Script inline di navbar untuk:
- Toggle sidebar open/close
- Handle overlay click
- Disable body scroll
- Auto-close saat klik link

## Testing

Test di berbagai ukuran layar:
- ✅ Mobile portrait (< 640px)
- ✅ Mobile landscape (640-768px)
- ✅ Tablet (768-1024px)
- ✅ Desktop (> 1024px)

## Notes

- Sidebar hanya muncul jika user sudah login
- Menu disesuaikan dengan role user
- Animasi smooth dengan Tailwind transitions
- Z-index tinggi (50) agar di atas konten lain
- Tidak mengganggu layout desktop

---

**Status**: ✅ Implemented
**Updated**: 2026-03-08
