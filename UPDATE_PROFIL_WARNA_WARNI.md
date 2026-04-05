# Update Warna Card Profil - Ceria & Colorful

## Perubahan
Mengubah warna card dan header di halaman profil dari putih polos menjadi warna pastel ceria dengan emoji seperti dashboard.

## Header Profil Baru

### Gradient Header
- **Background:** Gradient blue-purple-pink (from-blue-500 via-purple-500 to-pink-500)
- **Icon:** Emoji 👤 dalam box putih transparan dengan backdrop blur
- **Title:** "Profil Saya ✨" dengan emoji sparkles
- **Subtitle:** "Kelola informasi profil dan foto Anda 📸" dengan emoji kamera
- **Decorative circles:** 3 lingkaran putih transparan untuk efek visual

## Warna Card Baru

### 1. Card Foto Profil (Kiri) 📷
- **Background:** Gradient blue (from-blue-50 to-blue-100)
- **Border:** Blue-200
- **Text:** Blue-700 sampai Blue-900
- **Heading:** "📷 Foto Profil" dengan emoji kamera

### 2. Card Informasi Profil (Kanan Atas) 📝
- **Background:** Gradient purple (from-purple-50 to-purple-100)
- **Border:** Purple-200
- **Text:** Purple-700 sampai Purple-900
- **Heading:** "📝 Informasi Profil" dengan emoji notes
- **Sub-heading:** "🔐 Ubah Password" dengan emoji lock

### 3. Card Informasi Akun (Kanan Bawah) ℹ️
- **Background:** Gradient green (from-green-50 to-green-100)
- **Border:** Green-200
- **Text:** Green-700 sampai Green-900
- **Heading:** "ℹ️ Informasi Akun" dengan emoji info

## Detail Perubahan

### Header (Baru):
```html
<!-- Header dengan gradient colorful dan emoji -->
<div class="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">
  <div class="bg-white/30 backdrop-blur-sm">
    <div class="text-5xl">👤</div>
  </div>
  <h1 class="text-white">
    <span>Profil Saya</span>
    <span class="text-2xl">✨</span>
  </h1>
  <p class="text-white/90">Kelola informasi profil dan foto Anda 📸</p>
</div>
```

### Sebelum:
```html
<!-- Semua card putih polos -->
<div class="bg-white rounded-2xl shadow-lg border-2 border-slate-100">
  <h2 class="text-slate-800">...</h2>
  <label class="text-slate-700">...</label>
  <input class="border-slate-200 bg-slate-50 text-slate-500">
</div>
```

### Sesudah:
```html
<!-- Card Foto Profil - Blue dengan emoji -->
<div class="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
  <h2 class="text-blue-800 flex items-center gap-2">
    <span>📷</span>
    <span>Foto Profil</span>
  </h2>
  <div class="text-blue-900">Nama</div>
  <div class="text-blue-700">Role</div>
</div>

<!-- Card Info Profil - Purple dengan emoji -->
<div class="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
  <h2 class="text-purple-800 flex items-center gap-2">
    <span>📝</span>
    <span>Informasi Profil</span>
  </h2>
  <h3 class="text-purple-800 flex items-center gap-2">
    <span>🔐</span>
    <span>Ubah Password</span>
  </h3>
  <label class="text-purple-700">Username</label>
  <input class="border-purple-200 bg-purple-50 text-purple-600">
</div>

<!-- Card Info Akun - Green dengan emoji -->
<div class="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200">
  <h2 class="text-green-800 flex items-center gap-2">
    <span>ℹ️</span>
    <span>Informasi Akun</span>
  </h2>
  <span class="text-green-700">Status Akun</span>
</div>
```

## Konsistensi dengan Dashboard

Warna card profil sekarang matching dengan dashboard:
- **Dashboard:** Blue (Total Pengguna), Purple (Total Ujian), Green (Total Soal)
- **Profil:** Blue (Foto), Purple (Info Profil), Green (Info Akun)

## Emoji yang Digunakan

### Header:
- 👤 User icon (dalam box)
- ✨ Sparkles (di judul)
- 📸 Camera (di subtitle)

### Card Headings:
- 📷 Camera - Foto Profil
- 📝 Memo - Informasi Profil
- 🔐 Lock - Ubah Password
- ℹ️ Info - Informasi Akun

## Elemen yang Diupdate

### Header Profil (Baru):
- Gradient background lebih cerah (blue-500, purple-500, pink-500)
- Icon emoji 👤 dalam box putih transparan
- Title dengan emoji ✨
- Subtitle dengan emoji 📸
- 3 decorative circles untuk efek visual

### Card Foto Profil (Blue):
- Background card
- Heading "Foto Profil"
- Nama user
- Role user
- Class name
- Text info (format, maksimal, dll)
- File info saat pilih foto

### Card Informasi Profil (Purple):
- Background card
- Heading "Informasi Profil"
- Heading "Ubah Password"
- Label semua field (Username, Nama, Role, Kelas, Password)
- Input disabled (background purple-50, text purple-600)
- Input active (border purple-200, focus purple-500)
- Text helper (username tidak dapat diubah, dll)

### Card Informasi Akun (Green):
- Background card
- Heading "Informasi Akun"
- Label "Status Akun" dan "Terdaftar Sejak"
- Border divider antar item

## Tombol (Tidak Berubah)
Tombol tetap menggunakan gradient indigo-purple dan emerald-teal:
- **Pilih Foto:** Indigo to Purple
- **Upload Foto:** Emerald to Teal
- **Hapus Foto:** Rose to Red
- **Simpan Perubahan:** Indigo to Purple
- **Batal:** Slate gray

## File yang Diubah
- `src/views/profile/index.ejs` - Update semua warna card dan text

## Cara Test
1. Refresh halaman profil (Ctrl+Shift+R)
2. Card seharusnya berwarna pastel ceria:
   - Kiri: Biru muda
   - Kanan atas: Ungu muda
   - Kanan bawah: Hijau muda
3. Text dan border matching dengan warna card

## Screenshot Konsep
```
┌─────────────────────────────────────────────────┐
│  [Gradient Blue-Purple-Pink Header]             │
│  👤  Profil Saya ✨                              │
│     Kelola informasi profil dan foto Anda 📸    │
└─────────────────────────────────────────────────┘

┌──────────────┐  ┌────────────────────────────┐
│ 📷 FOTO      │  │ 📝 INFORMASI PROFIL        │
│  PROFIL      │  │  (Purple Card)             │
│  (Blue Card) │  │                            │
│              │  │  Username: [disabled]      │
│  [Photo]     │  │  Nama: [editable]          │
│  Nama        │  │  Role: [disabled]          │
│  Role        │  │  Kelas: [disabled]         │
│              │  │                            │
│  [Pilih]     │  │ 🔐 UBAH PASSWORD           │
│  [Upload]    │  │  Password Baru: [input]    │
│  [Hapus]     │  │  Konfirmasi: [input]       │
│              │  │                            │
│  Format info │  │  [Simpan] [Batal]          │
└──────────────┘  └────────────────────────────┘
                  
                  ┌────────────────────────────┐
                  │ ℹ️ INFORMASI AKUN           │
                  │  (Green Card)              │
                  │                            │
                  │  Status: Aktif             │
                  │  Terdaftar: 1 Jan 2024     │
                  └────────────────────────────┘
```

## Hasil
✅ Header profil colorful dengan gradient blue-purple-pink
✅ Emoji di header (👤 ✨ 📸) untuk tampilan lebih ceria
✅ Card profil colorful dengan warna pastel
✅ Emoji di setiap heading card (📷 📝 🔐 ℹ️)
✅ Konsisten dengan design dashboard
✅ Text color matching dengan background card
✅ Border dan shadow tetap smooth
✅ Hover effects tetap berfungsi
