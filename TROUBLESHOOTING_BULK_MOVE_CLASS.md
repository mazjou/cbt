# Troubleshooting: Fitur Pindah Kelas Bulk

## Masalah: "Tidak terjadi apa-apa ketika diklik pindah kelas"

### Kemungkinan Penyebab & Solusi

#### 1. JavaScript Error (Paling Umum)
**Gejala**: Button tidak merespons, tidak ada alert/confirm dialog

**Cara Check**:
```javascript
// Buka browser console (F12) dan cek error
// Atau test manual di console:
console.log(typeof bulkMoveClass); // Should return "function"
bulkMoveClass(); // Test manual
```

**Solusi**:
- Pastikan tidak ada syntax error di JavaScript
- Cek apakah fungsi `bulkMoveClass` terdefinisi di global scope
- Restart aplikasi setelah perubahan file

#### 2. DOM Elements Tidak Ditemukan
**Gejala**: Error "Cannot read property of null"

**Cara Check**:
```javascript
// Test di browser console:
console.log(document.getElementById('bulkMoveClassSelect')); // Should not be null
console.log(document.querySelectorAll('.user-checkbox').length); // Should be > 0
```

**Solusi**:
- Pastikan element `bulkMoveClassSelect` ada di HTML
- Pastikan checkbox memiliki class `user-checkbox` dan attribute `data-user-id`

#### 3. Tidak Ada Pengguna yang Dipilih
**Gejala**: Alert "Pilih pengguna yang ingin dipindah kelas terlebih dahulu"

**Cara Check**:
- Pastikan checkbox sudah dicentang sebelum klik "Pindah Kelas"
- Cek apakah bulk action bar muncul ketika checkbox dipilih

**Solusi**:
- Pilih minimal 1 pengguna dengan checkbox
- Pastikan fungsi `updateBulkActionBar()` berjalan dengan benar

#### 4. Tidak Ada Kelas Tujuan yang Dipilih
**Gejala**: Alert "Pilih kelas tujuan terlebih dahulu"

**Cara Check**:
- Pastikan dropdown "Pilih Kelas Tujuan" sudah dipilih
- Cek value dropdown tidak kosong

**Solusi**:
- Pilih kelas dari dropdown sebelum klik "Pindah Kelas"
- Pastikan dropdown memiliki option dengan value yang valid

#### 5. Server Route Tidak Ada
**Gejala**: Form submit tapi tidak ada response/error 404

**Cara Check**:
```bash
# Cek apakah route terdaftar di admin.js
grep -n "bulk-move-class" src/routes/admin.js
```

**Solusi**:
- Pastikan route `POST /admin/users/bulk-move-class` ada di `src/routes/admin.js`
- Restart aplikasi setelah menambah route

### Langkah Debugging Sistematis

#### Step 1: Cek JavaScript Console
```javascript
// Buka F12 → Console, jalankan:
console.log('Testing bulk move class...');
console.log('Function exists:', typeof window.bulkMoveClass);
console.log('Dropdown exists:', !!document.getElementById('bulkMoveClassSelect'));
console.log('Checkboxes count:', document.querySelectorAll('.user-checkbox').length);
```

#### Step 2: Test Manual Function Call
```javascript
// Di console browser:
// 1. Pilih beberapa checkbox dulu
document.querySelectorAll('.user-checkbox')[0].checked = true;
document.querySelectorAll('.user-checkbox')[1].checked = true;

// 2. Set dropdown value
document.getElementById('bulkMoveClassSelect').value = '2'; // ID kelas yang ada

// 3. Call function manually
bulkMoveClass();
```

#### Step 3: Cek Network Tab
- Buka F12 → Network tab
- Klik "Pindah Kelas"
- Lihat apakah ada request POST ke `/admin/users/bulk-move-class`
- Cek response status dan error message

#### Step 4: Cek Server Logs
```bash
# Lihat log aplikasi untuk error
# Jika pakai PM2:
pm2 logs

# Jika run manual:
# Cek terminal tempat aplikasi berjalan
```

### Script Testing Otomatis

Jalankan script testing untuk memverifikasi setup:

```bash
# Test database dan konfigurasi
node test-bulk-move-class.js

# Debug JavaScript function (perlu install jsdom)
npm install jsdom
node debug-bulk-move-class.js
```

### Checklist Verifikasi

- [ ] ✅ Aplikasi sudah di-restart setelah perubahan
- [ ] ✅ Route `POST /admin/users/bulk-move-class` ada di admin.js
- [ ] ✅ Function `bulkMoveClass()` terdefinisi di users.ejs
- [ ] ✅ Element `bulkMoveClassSelect` ada di HTML
- [ ] ✅ Checkbox memiliki class `user-checkbox` dan `data-user-id`
- [ ] ✅ Bulk action bar muncul ketika checkbox dipilih
- [ ] ✅ Dropdown kelas terisi dengan data dari database
- [ ] ✅ Tidak ada JavaScript error di browser console
- [ ] ✅ Database table `users` memiliki kolom `class_id`

### Solusi Cepat (Quick Fix)

Jika masih tidak berfungsi, coba langkah ini:

1. **Hard Refresh Browser**: Ctrl+F5 atau Ctrl+Shift+R
2. **Clear Browser Cache**: Hapus cache browser
3. **Restart Aplikasi**: 
   ```bash
   # Jika pakai PM2
   pm2 restart all
   
   # Jika manual
   # Stop aplikasi (Ctrl+C) dan jalankan ulang
   npm start
   ```
4. **Cek Mode Development**: Pastikan tidak ada cache yang mengganggu

### Contoh Error Umum & Solusi

#### Error: "bulkMoveClass is not defined"
```javascript
// Solusi: Pastikan function ada di global scope
window.bulkMoveClass = function() { ... };
```

#### Error: "Cannot read property 'value' of null"
```javascript
// Solusi: Pastikan element ada sebelum akses
const dropdown = document.getElementById('bulkMoveClassSelect');
if (!dropdown) {
  console.error('Dropdown not found!');
  return;
}
```

#### Error: "Cannot read property 'checked' of undefined"
```javascript
// Solusi: Pastikan checkbox ada
const checkboxes = document.querySelectorAll('.user-checkbox');
if (checkboxes.length === 0) {
  console.error('No checkboxes found!');
  return;
}
```

### Kontak Support

Jika masalah masih berlanjut:
1. Buka browser console dan screenshot error message
2. Jalankan `node test-bulk-move-class.js` dan share output
3. Cek apakah ada error di server logs
4. Pastikan menggunakan browser modern (Chrome, Firefox, Edge terbaru)