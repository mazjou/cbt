# Troubleshooting: Bulk Reset Nilai

## Masalah: "Tidak ada nilai yang dipilih untuk direset"

### Kemungkinan Penyebab & Solusi

#### 1. **Checkbox Tidak Tercentang**
**Gejala**: User mengklik tombol reset tanpa mencentang checkbox
**Solusi**: 
- Pastikan minimal 1 checkbox tercentang sebelum klik tombol
- Cek apakah checkbox muncul di halaman

#### 2. **JavaScript Error**
**Gejala**: Checkbox tercentang tapi data tidak terkirim
**Debugging**:
```javascript
// Buka browser console (F12) dan jalankan:
console.log('Checkboxes found:', document.querySelectorAll('.attempt-checkbox').length);
console.log('Checkboxes checked:', document.querySelectorAll('.attempt-checkbox:checked').length);

// Test manual selection:
document.querySelectorAll('.attempt-checkbox')[0].checked = true;
```

#### 3. **Form Data Tidak Terkirim**
**Gejala**: JavaScript berjalan tapi server tidak menerima data
**Debugging Server** (cek console log):
```
=== BULK RESET DEBUG ===
req.body: {}
req.body keys: []
attempt_ids raw: []
```

**Solusi**:
- Restart aplikasi: `npm restart` atau `pm2 restart lms-app`
- Cek middleware body parser di app.js

#### 4. **Middleware Body Parser Missing**
**Gejala**: req.body selalu kosong
**Solusi**: Pastikan ada di app.js:
```javascript
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
```

#### 5. **Route Tidak Ditemukan**
**Gejala**: 404 error saat submit form
**Debugging**: Cek browser Network tab untuk melihat request
**Solusi**: Pastikan route terdaftar di routes/teacher.js atau routes/admin.js

## Debugging Steps

### 1. **Cek Data di Database**
```bash
node test-bulk-reset.js
```

### 2. **Cek Browser Console**
1. Buka halaman grades
2. Tekan F12 → Console tab
3. Centang beberapa checkbox
4. Klik "Reset Nilai Terpilih"
5. Lihat log debug di console

### 3. **Cek Server Console**
1. Lihat terminal/console tempat aplikasi berjalan
2. Cari log yang dimulai dengan "=== BULK RESET DEBUG ==="
3. Periksa data yang diterima server

### 4. **Test Manual Form Submit**
```javascript
// Di browser console:
const form = document.createElement('form');
form.method = 'POST';
form.action = '/teacher/attempts/bulk-reset';

const input = document.createElement('input');
input.type = 'hidden';
input.name = 'attempt_ids[]';
input.value = '123'; // Ganti dengan ID attempt yang valid

form.appendChild(input);
document.body.appendChild(form);
form.submit();
```

## Solusi Berdasarkan Log Debug

### Log: "No attempt_ids found"
```
attempt_ids raw: []
attempt_ids filtered: []
No attempt_ids found, redirecting with error
```
**Penyebab**: Form data tidak terkirim atau nama field salah
**Solusi**: 
- Cek JavaScript function bulkReset()
- Pastikan input name="attempt_ids[]"

### Log: "No valid IDs found"
```
attempt_ids raw: ["", "", ""]
validIds: []
No valid IDs found
```
**Penyebab**: Checkbox value kosong atau bukan angka
**Solusi**: 
- Cek value attribute di checkbox HTML
- Pastikan value berisi ID attempt yang valid

### Log: "Found attempts: 0 Expected: 2"
```
Found attempts: 0 Expected: 2
```
**Penyebab**: Attempt ID tidak ditemukan atau bukan milik guru
**Solusi**:
- Cek apakah attempt ID ada di database
- Untuk guru: pastikan attempt belongs to teacher's exam

## File yang Perlu Dicek

### 1. **Routes**
- `src/routes/teacher.js` - Route POST `/teacher/attempts/bulk-reset`
- `src/routes/admin.js` - Route POST `/admin/attempts/bulk-reset`

### 2. **Views**
- `src/views/teacher/grades.ejs` - Checkbox dan JavaScript
- `src/views/admin/grades.ejs` - Checkbox dan JavaScript

### 3. **App Configuration**
- `app.js` - Body parser middleware

## Testing Commands

### 1. **Test Database**
```bash
node test-bulk-reset.js
```

### 2. **Test Debug Server**
```bash
node debug-bulk-reset.js
# Kemudian POST ke http://localhost:3001/test-bulk-reset
```

### 3. **Manual Database Query**
```sql
-- Cek attempts yang ada
SELECT a.id, a.score, e.title, u.full_name 
FROM attempts a 
JOIN exams e ON e.id = a.exam_id 
JOIN users u ON u.id = a.student_id 
LIMIT 10;

-- Cek ownership untuk guru
SELECT a.id, e.teacher_id, t.full_name as teacher_name
FROM attempts a 
JOIN exams e ON e.id = a.exam_id 
JOIN users t ON t.id = e.teacher_id
WHERE a.id IN (1, 2, 3); -- Ganti dengan ID yang ditest
```

## Solusi Cepat

### 1. **Restart Aplikasi**
```bash
npm restart
# atau
pm2 restart lms-app
```

### 2. **Clear Browser Cache**
- Tekan Ctrl+F5 untuk hard refresh
- Atau buka Developer Tools → Application → Clear Storage

### 3. **Test dengan Data Minimal**
1. Login sebagai guru/admin
2. Buka halaman grades
3. Centang 1 checkbox saja
4. Klik reset
5. Cek console log

### 4. **Fallback: Individual Reset**
Jika bulk reset tidak berfungsi, gunakan tombol "Reset" individual di setiap baris.

## Error Messages & Solusi

| Error Message | Penyebab | Solusi |
|---------------|----------|---------|
| "Tidak ada nilai yang dipilih" | Checkbox tidak tercentang atau data tidak terkirim | Cek JavaScript dan form submission |
| "Tidak ada ID attempt yang valid" | Checkbox value kosong/invalid | Cek value attribute di HTML |
| "Akses ditolak" | Guru mencoba reset ujian bukan miliknya | Cek ownership verification |
| "Gagal reset nilai" | Database error | Cek database connection dan constraints |

## Kontak Support

Jika masalah masih berlanjut:
1. Kumpulkan log debug dari browser console
2. Kumpulkan log debug dari server console  
3. Screenshot error message
4. Informasi: browser, user role (guru/admin), data yang ditest