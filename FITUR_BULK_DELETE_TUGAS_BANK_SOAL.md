# Fitur: Bulk Delete Tugas & Bank Soal

## 📋 Deskripsi

Menambahkan fitur hapus masal (bulk delete) untuk manajemen tugas dan bank soal di admin. Admin dapat memilih multiple tugas/soal dan menghapusnya sekaligus.

## ✨ Fitur yang Ditambahkan

### 1. Bulk Delete Tugas

- Checkbox "Select All" untuk pilih semua tugas
- Checkbox individual untuk setiap tugas
- Bar aksi bulk yang muncul saat ada tugas terpilih
- Counter jumlah tugas terpilih
- Tombol "Hapus Terpilih" dengan konfirmasi
- Flash message sukses/error

### 2. Bulk Delete Bank Soal

- Checkbox "Select All" untuk pilih semua soal
- Checkbox individual untuk setiap soal
- Bar aksi bulk yang muncul saat ada soal terpilih
- Counter jumlah soal terpilih
- Tombol "Hapus Terpilih" dengan konfirmasi
- Flash message sukses/error

## 📁 File yang Diubah

### 1. src/views/admin/assignments.ejs

**Tambahan:**
- Kolom checkbox di header tabel (Select All)
- Kolom checkbox di setiap row
- Bar aksi bulk (hidden by default)
- JavaScript untuk handle checkbox dan bulk delete

**Perubahan:**
- Colspan tabel disesuaikan (8 → 9)
- Tambah event handler untuk checkbox

### 2. src/views/admin/question_bank.ejs

**Tambahan:**
- Kolom checkbox di header tabel (Select All)
- Kolom checkbox di setiap row
- Bar aksi bulk (hidden by default)
- JavaScript untuk handle checkbox dan bulk delete

**Perubahan:**
- Colspan tabel disesuaikan (7 → 8)
- Tambah event handler untuk checkbox

### 3. src/routes/admin.js

**Tambahan:**
- Route `POST /admin/assignments/bulk-delete`
- Route `POST /admin/question-bank/bulk-delete`

## 🎨 Desain UI

### Bar Aksi Bulk (Assignments):

```
┌─────────────────────────────────────────────────────┐
│ 🟧 5 tugas dipilih          [Hapus Terpilih] 🔴    │
└─────────────────────────────────────────────────────┘
```

- Background: Gradient amber-100 to orange-100
- Border: amber-200
- Text: amber-900
- Button: Gradient red-500 to red-600

### Bar Aksi Bulk (Question Bank):

```
┌─────────────────────────────────────────────────────┐
│ 🟪 3 soal dipilih           [Hapus Terpilih] 🔴    │
└─────────────────────────────────────────────────────┘
```

- Background: Gradient pink-100 to rose-100
- Border: pink-200
- Text: pink-900
- Button: Gradient red-500 to red-600

### Checkbox:

- Warna accent: amber-500 (assignments), pink-500 (question bank)
- Size: w-4 h-4
- Cursor: pointer

## 🔧 Cara Menggunakan

### Hapus Masal Tugas:

1. Login sebagai admin
2. Buka `/admin/assignments`
3. Centang checkbox tugas yang ingin dihapus
   - Atau klik checkbox "Select All" untuk pilih semua
4. Bar aksi bulk akan muncul di atas tabel
5. Klik tombol "Hapus Terpilih"
6. Konfirmasi hapus
7. Tugas terpilih akan dihapus

### Hapus Masal Bank Soal:

1. Login sebagai admin
2. Buka `/admin/question-bank`
3. Centang checkbox soal yang ingin dihapus
   - Atau klik checkbox "Select All" untuk pilih semua
4. Bar aksi bulk akan muncul di atas tabel
5. Klik tombol "Hapus Terpilih"
6. Konfirmasi hapus
7. Soal terpilih akan dihapus

## 💻 Implementasi JavaScript

### Fungsi-Fungsi:

#### 1. toggleSelectAll(checkbox)
```javascript
// Toggle semua checkbox saat "Select All" diklik
function toggleSelectAll(checkbox) {
  const checkboxes = document.querySelectorAll('.assignment-checkbox');
  checkboxes.forEach(cb => cb.checked = checkbox.checked);
  updateBulkActions();
}
```

#### 2. updateBulkActions()
```javascript
// Update tampilan bar aksi bulk dan counter
function updateBulkActions() {
  const checkboxes = document.querySelectorAll('.assignment-checkbox:checked');
  const count = checkboxes.length;
  const bulkActions = document.getElementById('bulkActions');
  const selectedCount = document.getElementById('selectedCount');
  
  selectedCount.textContent = count;
  
  if (count > 0) {
    bulkActions.classList.remove('hidden');
  } else {
    bulkActions.classList.add('hidden');
  }
  
  // Update select all checkbox state
  const allCheckboxes = document.querySelectorAll('.assignment-checkbox');
  selectAll.checked = allCheckboxes.length > 0 && count === allCheckboxes.length;
}
```

#### 3. bulkDelete()
```javascript
// Handle bulk delete dengan konfirmasi
function bulkDelete() {
  const checkboxes = document.querySelectorAll('.assignment-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => cb.value);
  
  if (ids.length === 0) {
    alert('Pilih minimal 1 tugas untuk dihapus');
    return;
  }
  
  if (!confirm(`Yakin ingin menghapus ${ids.length} tugas terpilih?`)) {
    return;
  }
  
  // Create form and submit
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/admin/assignments/bulk-delete';
  
  ids.forEach(id => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'ids[]';
    input.value = id;
    form.appendChild(input);
  });
  
  document.body.appendChild(form);
  form.submit();
}
```

## 🔧 Implementasi Backend

### Route Bulk Delete Assignments:

```javascript
router.post('/assignments/bulk-delete', async (req, res) => {
  const ids = req.body['ids[]'] || [];
  const idsArray = Array.isArray(ids) ? ids : [ids];
  
  if (idsArray.length === 0) {
    req.flash('error', 'Tidak ada tugas yang dipilih.');
    return res.redirect('/admin/assignments');
  }
  
  try {
    // Build placeholders for IN clause
    const placeholders = idsArray.map((_, i) => `:id${i}`).join(',');
    const params = {};
    idsArray.forEach((id, i) => {
      params[`id${i}`] = id;
    });
    
    // Delete multiple assignments
    await pool.query(
      `DELETE FROM assignments WHERE id IN (${placeholders});`, 
      params
    );
    
    req.flash('success', `${idsArray.length} tugas berhasil dihapus.`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus tugas.');
  }
  
  res.redirect('/admin/assignments');
});
```

### Route Bulk Delete Question Bank:

```javascript
router.post('/question-bank/bulk-delete', async (req, res) => {
  const ids = req.body['ids[]'] || [];
  const idsArray = Array.isArray(ids) ? ids : [ids];
  
  if (idsArray.length === 0) {
    req.flash('error', 'Tidak ada soal yang dipilih.');
    return res.redirect('/admin/question-bank');
  }
  
  try {
    // Build placeholders for IN clause
    const placeholders = idsArray.map((_, i) => `:id${i}`).join(',');
    const params = {};
    idsArray.forEach((id, i) => {
      params[`id${i}`] = id;
    });
    
    // Delete multiple questions
    await pool.query(
      `DELETE FROM question_bank WHERE id IN (${placeholders});`, 
      params
    );
    
    req.flash('success', `${idsArray.length} soal berhasil dihapus.`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus soal.');
  }
  
  res.redirect('/admin/question-bank');
});
```

## 🧪 Testing

### Test Bulk Delete Tugas:

1. **Test Select All**
   - Klik checkbox "Select All"
   - Semua checkbox tugas tercentang
   - Bar aksi bulk muncul
   - Counter menunjukkan jumlah total tugas

2. **Test Select Individual**
   - Centang 3 tugas secara manual
   - Bar aksi bulk muncul
   - Counter menunjukkan "3 tugas dipilih"

3. **Test Unselect**
   - Centang beberapa tugas
   - Uncheck semua
   - Bar aksi bulk hilang

4. **Test Bulk Delete**
   - Centang 5 tugas
   - Klik "Hapus Terpilih"
   - Konfirmasi muncul: "Yakin ingin menghapus 5 tugas terpilih?"
   - Klik OK
   - 5 tugas terhapus
   - Flash message: "5 tugas berhasil dihapus."

5. **Test Cancel Delete**
   - Centang beberapa tugas
   - Klik "Hapus Terpilih"
   - Klik Cancel di konfirmasi
   - Tidak ada yang terhapus

### Test Bulk Delete Bank Soal:

1. **Test Select All**
   - Klik checkbox "Select All"
   - Semua checkbox soal tercentang
   - Bar aksi bulk muncul
   - Counter menunjukkan jumlah total soal

2. **Test Select Individual**
   - Centang 2 soal secara manual
   - Bar aksi bulk muncul
   - Counter menunjukkan "2 soal dipilih"

3. **Test Bulk Delete**
   - Centang 10 soal
   - Klik "Hapus Terpilih"
   - Konfirmasi muncul
   - Klik OK
   - 10 soal terhapus
   - Flash message: "10 soal berhasil dihapus."

## 🔒 Keamanan

1. **Validasi Input**
   - Cek apakah ada ID yang dipilih
   - Validasi format ID (harus array)

2. **Authorization**
   - Hanya admin yang bisa akses (middleware `requireRole('ADMIN')`)

3. **Konfirmasi**
   - Konfirmasi JavaScript sebelum submit
   - Mencegah accidental delete

4. **Database**
   - Menggunakan parameterized query
   - Mencegah SQL injection

## 📊 Query Database

### Delete Multiple Assignments:

```sql
DELETE FROM assignments 
WHERE id IN (:id0, :id1, :id2, ...);
```

### Delete Multiple Questions:

```sql
DELETE FROM question_bank 
WHERE id IN (:id0, :id1, :id2, ...);
```

## 📝 Catatan

1. **CASCADE Delete**: 
   - Hapus tugas akan menghapus semua submission terkait (CASCADE)
   - Hapus bank soal akan menghapus semua opsi jawaban terkait (CASCADE)

2. **Performance**:
   - Bulk delete lebih efisien daripada delete satu-satu
   - Menggunakan single query dengan IN clause

3. **UX**:
   - Bar aksi bulk hanya muncul saat ada item terpilih
   - Counter real-time update
   - Konfirmasi mencegah accidental delete

4. **Consistency**:
   - Implementasi sama dengan bulk delete users
   - Menggunakan pattern yang sudah familiar

## ✅ Checklist

- [x] Tambah checkbox "Select All" di assignments
- [x] Tambah checkbox individual di assignments
- [x] Tambah bar aksi bulk di assignments
- [x] Tambah JavaScript handler di assignments
- [x] Tambah route bulk delete assignments
- [x] Tambah checkbox "Select All" di question bank
- [x] Tambah checkbox individual di question bank
- [x] Tambah bar aksi bulk di question bank
- [x] Tambah JavaScript handler di question bank
- [x] Tambah route bulk delete question bank
- [x] Test bulk delete assignments
- [x] Test bulk delete question bank
- [x] Dokumentasi lengkap

---

**Status:** ✅ Selesai
**Tanggal:** 2024
**File Diubah:** 3 file
