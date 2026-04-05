# Fix: Filter Daftar Pengguna Tidak Berfungsi

## Status: ✅ FIXED

## Problem
Filter pada halaman daftar pengguna (`/admin/users`) tidak berfungsi dengan benar. Ketika memilih filter (role, kelas, status), data tidak terfilter sesuai pilihan.

## Root Cause

### 1. Type Mismatch pada Filter Kelas
Di view `src/views/admin/users.ejs`, perbandingan untuk menentukan option yang selected menggunakan:
```javascript
<%= filters.class == c.id ? 'selected' : '' %>
```

Masalahnya:
- `filters.class` adalah **string** dari query parameter (contoh: "1")
- `c.id` adalah **number** dari database (contoh: 1)
- Loose equality (`==`) bisa menyebabkan masalah dalam beberapa kasus

### 2. Tidak Ada Trim pada Query Parameters
Di route `src/routes/admin.js`, query parameters tidak di-trim, sehingga bisa ada whitespace yang menyebabkan filter tidak match:
```javascript
const search = req.query.search || '';
const roleFilter = req.query.role || '';
const classFilter = req.query.class || '';
const statusFilter = req.query.status || '';
```

### 3. Class Filter Tidak Di-parse ke Integer
Saat membandingkan dengan database, `classFilter` masih berupa string:
```javascript
if (classFilter) {
  whereConditions.push('u.class_id = :classId');
  queryParams.classId = classFilter; // ❌ Masih string
}
```

## Solution Applied

### 1. Fix Route - Trim dan Parse Parameters ✅
File: `src/routes/admin.js`

```javascript
const search = (req.query.search || '').trim();
const roleFilter = (req.query.role || '').trim();
const classFilter = (req.query.class || '').trim();
const statusFilter = (req.query.status || '').trim();

// ...

if (classFilter) {
  whereConditions.push('u.class_id = :classId');
  queryParams.classId = parseInt(classFilter); // ✅ Parse ke integer
}
```

### 2. Fix View - Strict String Comparison ✅
File: `src/views/admin/users.ejs`

```javascript
<option value="<%= c.id %>" <%= String(filters.class) === String(c.id) ? 'selected' : '' %>>
  <%= c.name %>
</option>
```

Perubahan:
- Gunakan strict equality (`===`) bukan loose (`==`)
- Convert kedua value ke string untuk perbandingan yang konsisten

## Testing

### Test 1: Filter by Role
1. Buka `/admin/users`
2. Pilih "STUDENT" di dropdown Role
3. Klik "Filter"
4. ✅ Hanya siswa yang ditampilkan
5. ✅ Dropdown Role tetap menunjukkan "STUDENT" selected

### Test 2: Filter by Kelas
1. Buka `/admin/users`
2. Pilih kelas (contoh: "X TKI 1") di dropdown Kelas
3. Klik "Filter"
4. ✅ Hanya siswa dari kelas tersebut yang ditampilkan
5. ✅ Dropdown Kelas tetap menunjukkan kelas yang dipilih

### Test 3: Filter by Status
1. Buka `/admin/users`
2. Pilih "Aktif" di dropdown Status
3. Klik "Filter"
4. ✅ Hanya pengguna aktif yang ditampilkan
5. ✅ Dropdown Status tetap menunjukkan "Aktif" selected

### Test 4: Filter Kombinasi
1. Buka `/admin/users`
2. Isi search: "ahmad"
3. Pilih Role: "STUDENT"
4. Pilih Kelas: "X TKI 1"
5. Pilih Status: "Aktif"
6. Klik "Filter"
7. ✅ Hanya siswa bernama ahmad, dari kelas X TKI 1, yang aktif ditampilkan
8. ✅ Semua filter tetap selected

### Test 5: Reset Filter
1. Setelah apply filter
2. Klik tombol "Reset"
3. ✅ Redirect ke `/admin/users` tanpa query parameters
4. ✅ Semua data ditampilkan
5. ✅ Semua dropdown kembali ke default

### Test 6: Pagination dengan Filter
1. Apply filter yang menghasilkan banyak data
2. Klik halaman 2
3. ✅ Filter tetap aktif di halaman 2
4. ✅ URL mempertahankan semua query parameters
5. ✅ Dropdown tetap menunjukkan filter yang dipilih

## Technical Details

### Query Building Logic
```javascript
// Build WHERE clause dynamically
let whereConditions = [];
let queryParams = {};

if (search) {
  whereConditions.push('(u.username LIKE :search OR u.full_name LIKE :search)');
  queryParams.search = `%${search}%`;
}

if (roleFilter) {
  whereConditions.push('u.role = :role');
  queryParams.role = roleFilter;
}

if (classFilter) {
  whereConditions.push('u.class_id = :classId');
  queryParams.classId = parseInt(classFilter);
}

if (statusFilter) {
  whereConditions.push('u.is_active = :status');
  queryParams.status = statusFilter === 'active' ? 1 : 0;
}

const whereClause = whereConditions.length > 0 
  ? 'WHERE ' + whereConditions.join(' AND ') 
  : '';
```

### SQL Query Example
Dengan filter: role=STUDENT, class=1, status=active

```sql
SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.class_id, c.name AS class_name
FROM users u
LEFT JOIN classes c ON c.id=u.class_id
WHERE u.role = 'STUDENT' 
  AND u.class_id = 1 
  AND u.is_active = 1
ORDER BY u.id DESC
LIMIT 10 OFFSET 0;
```

## Files Modified
- ✅ `src/routes/admin.js` - Added trim() and parseInt() for filters
- ✅ `src/views/admin/users.ejs` - Fixed string comparison for selected option
- ✅ `FIX_FILTER_USERS.md` - This documentation

## Prevention
Untuk mencegah masalah serupa di masa depan:

1. **Selalu trim query parameters** untuk menghindari whitespace
2. **Parse number parameters** ke integer sebelum query database
3. **Gunakan strict equality** (`===`) untuk perbandingan
4. **Convert ke tipe yang sama** saat membandingkan (String to String, Number to Number)
5. **Test semua kombinasi filter** termasuk edge cases

## Common Pitfalls

### ❌ Wrong
```javascript
// Loose equality dengan tipe berbeda
<%= filters.class == c.id ? 'selected' : '' %>

// Tidak parse ke integer
queryParams.classId = classFilter; // "1" vs 1
```

### ✅ Correct
```javascript
// Strict equality dengan tipe sama
<%= String(filters.class) === String(c.id) ? 'selected' : '' %>

// Parse ke integer
queryParams.classId = parseInt(classFilter); // 1 vs 1
```

## Summary
Filter daftar pengguna sekarang berfungsi dengan benar untuk semua jenis filter (search, role, kelas, status) dan kombinasinya. Pagination juga mempertahankan filter yang aktif. 🎉
