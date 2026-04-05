# Update Notifikasi: Filter Kelas & Tampilan Nama + Username

## Status: COMPLETED ✅

Update form notifikasi untuk menampilkan siswa dengan filter kelas dan menampilkan nama + username.

---

## Perubahan

### 1. Query Database (src/routes/notifications.js)
**Sebelum:**
```javascript
const [students] = await pool.query(
  `SELECT id, username FROM users WHERE role = 'student' ORDER BY username ASC`
);
```

**Sesudah:**
```javascript
const [students] = await pool.query(
  `SELECT u.id, u.username, u.full_name, c.name AS class_name, u.class_id
   FROM users u
   LEFT JOIN classes c ON c.id = u.class_id
   WHERE u.role = 'student'
   ORDER BY c.name ASC, u.full_name ASC, u.username ASC`
);
```

### 2. Dropdown Siswa (src/views/notifications/new.ejs)
**Fitur Baru:**
- Filter dropdown berdasarkan kelas
- Tampilan: `Nama Lengkap (Username) - Kelas`
- Contoh: `Ahmad Rizki Pratama (ahmad123) - 10 IPA 1`
- Fallback ke username jika full_name kosong

**HTML:**
```html
<!-- Filter by class -->
<select id="classFilter" class="...">
  <option value="">🏫 Semua Kelas</option>
  <% classes.forEach(c => { %>
    <option value="<%= c.id %>"><%= c.name %></option>
  <% }) %>
</select>

<!-- Student dropdown -->
<select name="target_id" id="studentSelector" class="...">
  <option value="">-- Pilih Siswa --</option>
  <% students.forEach(s => { %>
    <option value="<%= s.id %>" data-class="<%= s.class_id || '' %>">
      <%= s.full_name || s.username %> (<%= s.username %>) - <%= s.class_name || 'Tanpa Kelas' %>
    </option>
  <% }) %>
</select>
```

### 3. JavaScript Filter (src/views/notifications/new.ejs)
```javascript
// Store all student options
const allStudentOptions = Array.from(studentSelector.options);

// Filter students by class
classFilter.addEventListener('change', function() {
  const selectedClass = this.value;
  
  // Clear current options
  studentSelector.innerHTML = '<option value="">-- Pilih Siswa --</option>';
  
  // Filter and add options
  allStudentOptions.forEach(option => {
    if (option.value === '') return;
    
    const studentClass = option.getAttribute('data-class');
    
    if (selectedClass === '' || studentClass === selectedClass) {
      studentSelector.appendChild(option.cloneNode(true));
    }
  });
});
```

### 4. Fix Query SQL Parameters
**Masalah:** Query menggunakan named parameters (`:param`) yang tidak konsisten
**Solusi:** Ubah semua query ke placeholder (`?`)

**Contoh Perubahan:**
```javascript
// SEBELUM (named parameters)
await pool.query('SELECT * FROM users WHERE id = :uid', { uid: user.id });

// SESUDAH (placeholder)
await pool.query('SELECT * FROM users WHERE id = ?', [user.id]);
```

**File yang diperbaiki:**
- `GET /notifications` - List notifikasi
- `POST /:id/toggle` - Toggle active
- `POST /:id/delete` - Delete notifikasi
- `GET /active` - Get notifikasi aktif (siswa)
- `POST /:id/read` - Mark as read

---

## Cara Menggunakan

### Untuk Guru/Admin:

1. **Buka Form Notifikasi**
   - Akses `/notifications/new`
   - Pilih "Target Penerima" = "Siswa Tertentu"

2. **Filter Siswa by Kelas**
   - Dropdown filter kelas akan muncul
   - Pilih kelas untuk filter siswa
   - Atau pilih "Semua Kelas" untuk tampilkan semua

3. **Pilih Siswa**
   - Dropdown siswa menampilkan:
     * Nama lengkap (jika ada)
     * Username dalam kurung
     * Nama kelas
   - Contoh: `Ahmad Rizki (ahmad123) - 10 IPA 1`

4. **Kirim Notifikasi**
   - Isi form lengkap
   - Klik "Kirim Notifikasi"

---

## Tampilan

### Filter Kelas
```
🏫 Pilih Kelas
┌─────────────────────────────────┐
│ 🏫 Semua Kelas                  │
│ 10 IPA 1                        │
│ 10 IPA 2                        │
│ 11 IPA 1                        │
└─────────────────────────────────┘
```

### Dropdown Siswa
```
👤 Pilih Siswa
┌─────────────────────────────────────────────────┐
│ -- Pilih Siswa --                               │
│ Ahmad Rizki (ahmad123) - 10 IPA 1               │
│ Budi Santoso (budi456) - 10 IPA 1               │
│ Citra Dewi (citra789) - 10 IPA 1                │
│ Doni Pratama (doni012) - Tanpa Kelas            │
└─────────────────────────────────────────────────┘
```

---

## Testing

### Test 1: Filter Kelas
1. Buka `/notifications/new`
2. Pilih "Siswa Tertentu"
3. Pilih kelas "10 IPA 1" di filter
4. Verifikasi hanya siswa kelas 10 IPA 1 yang muncul

### Test 2: Tampilan Nama + Username
1. Lihat dropdown siswa
2. Verifikasi format: `Nama (Username) - Kelas`
3. Verifikasi siswa tanpa kelas tampil "Tanpa Kelas"

### Test 3: Kirim Notifikasi ke Siswa Tertentu
1. Pilih siswa dari dropdown
2. Isi form notifikasi
3. Kirim notifikasi
4. Login sebagai siswa tersebut
5. Verifikasi modal muncul

---

## File yang Dimodifikasi

1. `src/routes/notifications.js`
   - Update query GET `/new` untuk ambil data siswa dengan kelas
   - Fix semua query SQL dari named parameters ke placeholder

2. `src/views/notifications/new.ejs`
   - Tambah dropdown filter kelas
   - Update dropdown siswa dengan format baru
   - Tambah JavaScript untuk filter

---

## Troubleshooting

### Problem: Dropdown siswa kosong
**Solution:**
- Pastikan tabel `users` punya kolom `name` dan `class_id`
- Cek query SQL di route `/new`
- Cek console browser untuk error

### Problem: Filter kelas tidak berfungsi
**Solution:**
- Pastikan JavaScript loaded
- Cek `data-class` attribute di option
- Cek console browser untuk error

### Problem: Siswa tidak punya kelas
**Solution:**
- Normal, akan tampil "Tanpa Kelas"
- Update `class_id` di tabel users jika perlu

---

## Database Schema

Kolom `full_name` sudah ditambahkan ke tabel `users`:
```sql
ALTER TABLE users ADD COLUMN full_name VARCHAR(255) NULL AFTER username;
```

**Struktur:**
- `full_name` - Nama lengkap siswa (opsional)
- Jika `full_name` NULL, akan fallback ke `username`
- Format tampilan: `Nama Lengkap (username) - Kelas`

**Contoh Data:**
```sql
-- Siswa dengan full_name
INSERT INTO users (username, full_name, role, class_id) 
VALUES ('ahmad123', 'Ahmad Rizki Pratama', 'student', 1);

-- Siswa tanpa full_name (akan tampil username saja)
INSERT INTO users (username, role, class_id) 
VALUES ('budi456', 'student', 1);
```

---

**Status**: ✅ Filter Kelas & Tampilan Nama Sudah Aktif!
**Updated**: 2026-03-07
**Impact**: Lebih mudah memilih siswa target notifikasi

Guru sekarang bisa filter siswa berdasarkan kelas dan melihat nama lengkap + username! 🎯✨
