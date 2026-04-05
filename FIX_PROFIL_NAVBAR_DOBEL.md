# Fix Navbar Dobel dan Notifikasi Kosong - Halaman Profil

## Masalah
1. ❌ Navbar muncul 2 kali (dobel) di halaman profil
2. ❌ Notifikasi kosong (kotak hijau muda dan orange tanpa isi)

## Penyebab

### 1. Navbar Dobel
File `src/views/profile/index.ejs` tidak menggunakan layout system yang benar:
- File membuat HTML lengkap sendiri (`<!DOCTYPE html>`, `<head>`, `<body>`)
- File juga include navbar dengan `<%- include('../partials/navbar') %>`
- Tapi aplikasi menggunakan `express-ejs-layouts` yang otomatis wrap semua view dengan layout
- Layout (`src/views/layout.ejs`) juga punya navbar
- Hasilnya: navbar muncul 2 kali (dari layout + dari view)

### 2. Notifikasi Kosong
Flash messages di-pass dengan cara yang salah:
- Route pass `messages` object manual
- Tapi layout expect `flash` object dari `res.locals`
- Hasilnya: div notifikasi muncul tapi kosong

## Solusi yang Diterapkan

### 1. Ubah Profile View Menggunakan Layout
**File:** `src/views/profile/index.ejs`

**Sebelum:**
```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title><%= title %> - LMS SMKN 1 Kras</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <%- include('../partials/navbar') %>
  <main>...</main>
</body>
</html>
```

**Sesudah:**
```html
<main class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
  <!-- Flash Messages -->
  <% if (flash.success && flash.success.length > 0) { %>
    <div class="mb-6 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
      <%= flash.success[0] %>
    </div>
  <% } %>
  ...
</main>
<script>...</script>
```

**Perubahan:**
- ✅ Hapus `<!DOCTYPE html>`, `<head>`, `<body>` tags
- ✅ Hapus `<%- include('../partials/navbar') %>`
- ✅ Ubah `messages` menjadi `flash` (sesuai res.locals)
- ✅ Hapus closing `</body></html>` tags
- ✅ Layout akan otomatis wrap view dengan HTML structure dan navbar

### 2. Simplify Profile Route
**File:** `src/routes/profile.js`

**Sebelum:**
```javascript
res.render('profile/index', { 
  title: 'Profil Saya', 
  user: req.session.user,
  profileUser: user,
  messages: {
    success: req.flash('success'),
    error: req.flash('error'),
    info: req.flash('info')
  }
});
```

**Sesudah:**
```javascript
res.render('profile/index', { 
  title: 'Profil Saya',
  profileUser: user
});
```

**Perubahan:**
- ✅ Hapus manual `messages` object
- ✅ Hapus redundant `user` (sudah ada di res.locals)
- ✅ Flash messages otomatis tersedia via middleware

## Cara Testing

### 1. Refresh Halaman Profil
```
1. Buka halaman profil: http://localhost:3000/profile
2. Navbar seharusnya hanya muncul 1 kali
3. Notifikasi kosong seharusnya hilang
```

### 2. Test Flash Messages
```
1. Upload foto profil
2. Seharusnya muncul notifikasi hijau: "Profil berhasil diperbarui"
3. Notifikasi punya isi dan tidak kosong
```

### 3. Test Edit Profil
```
1. Ubah nama lengkap
2. Klik "Simpan Perubahan"
3. Notifikasi sukses muncul dengan benar
```

## Penjelasan Layout System

### Struktur Layout EJS
```
src/views/
├── layout.ejs              # Master layout (HTML, head, body, navbar)
├── profile/
│   └── index.ejs          # Content only (no HTML tags)
├── teacher/
│   └── index.ejs          # Content only
└── student/
    └── index.ejs          # Content only
```

### Cara Kerja express-ejs-layouts
```javascript
// Di server.js
app.use(expressLayouts);
app.set('layout', 'layout');

// Saat render view:
res.render('profile/index', { title: 'Profil' });

// Express otomatis:
// 1. Render profile/index.ejs → dapat content
// 2. Wrap content dengan layout.ejs
// 3. Inject content ke <%- body %> di layout
// 4. Kirim HTML lengkap ke browser
```

### Template View yang Benar
```html
<!-- src/views/example/page.ejs -->
<main class="container">
  <!-- Flash messages jika perlu -->
  <% if (flash.success && flash.success.length > 0) { %>
    <div class="alert alert-success">
      <%= flash.success[0] %>
    </div>
  <% } %>
  
  <!-- Page content -->
  <h1><%= title %></h1>
  <p>Content here...</p>
</main>

<!-- Script khusus page ini (opsional) -->
<script>
  // Page-specific JavaScript
</script>
```

**JANGAN:**
- ❌ Tambahkan `<!DOCTYPE html>`
- ❌ Tambahkan `<html>`, `<head>`, `<body>` tags
- ❌ Include navbar manual
- ❌ Tutup dengan `</body></html>`

**LAKUKAN:**
- ✅ Mulai langsung dengan content (`<main>`, `<div>`, dll)
- ✅ Gunakan `flash` untuk messages (bukan `messages`)
- ✅ Akhiri dengan script jika perlu
- ✅ Biarkan layout handle HTML structure

## File yang Diubah
1. `src/views/profile/index.ejs` - Ubah ke layout-based view
2. `src/routes/profile.js` - Simplify render call

## Verifikasi

### Cek Navbar
- ✅ Navbar hanya muncul 1 kali di top
- ✅ Logo, menu, dan profile dropdown berfungsi normal

### Cek Flash Messages
- ✅ Notifikasi kosong hilang
- ✅ Notifikasi sukses/error muncul dengan isi yang benar
- ✅ Notifikasi auto-dismiss atau bisa di-close

### Cek Layout
- ✅ HTML structure valid (cek view source)
- ✅ Tailwind CSS loaded
- ✅ JavaScript berfungsi (photo preview, dropdown, dll)

## Catatan Penting
- Semua view di aplikasi ini menggunakan layout system
- Jangan buat HTML lengkap di view individual
- Flash messages otomatis tersedia via `res.locals.flash`
- User dan session data otomatis tersedia via `res.locals.user`

## Troubleshooting

### Navbar masih dobel
**Solusi:** Hard refresh browser (Ctrl+Shift+R atau Cmd+Shift+R)

### Notifikasi masih kosong
**Solusi:** 
1. Cek apakah menggunakan `flash` bukan `messages`
2. Cek apakah flash middleware aktif di server.js

### Layout tidak apply
**Solusi:**
1. Cek `app.use(expressLayouts)` di server.js
2. Cek `app.set('layout', 'layout')` di server.js
3. Restart server
