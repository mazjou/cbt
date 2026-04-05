# Fitur Tugas untuk Multiple Classes

## Deskripsi
Menambahkan kemampuan untuk membuat 1 tugas yang ditujukan ke lebih dari 1 kelas sekaligus. Sebelumnya, guru harus membuat tugas terpisah untuk setiap kelas.

## Problem
- Guru harus membuat tugas yang sama berkali-kali untuk kelas berbeda
- Tidak efisien dan memakan waktu
- Sulit maintain jika ada perubahan (harus edit semua tugas)
- Tidak bisa melihat statistik gabungan dari semua kelas

## Solution
Membuat sistem junction table `assignment_classes` yang memungkinkan relasi many-to-many antara assignments dan classes.

## Database Changes

### New Table: assignment_classes
```sql
CREATE TABLE assignment_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  UNIQUE KEY unique_assignment_class (assignment_id, class_id)
);
```

### Migration
- Tabel `assignments.class_id` tetap ada untuk backward compatibility
- Data existing dimigrate ke `assignment_classes`
- Query baru menggunakan `assignment_classes` junction table

## Features

### 1. Multiple Class Selection (Form Buat Tugas)
- Checkbox list untuk pilih kelas
- "Pilih Semua Kelas" untuk select all
- Indeterminate state untuk partial selection
- Validasi minimal 1 kelas harus dipilih
- Scrollable list jika kelas banyak

### 2. Display Multiple Classes (List Tugas)
- Jika 1 kelas: Badge biasa dengan nama kelas
- Jika >1 kelas: Badge "X Kelas" + list nama kelas di bawahnya
- Warna berbeda untuk multiple classes (purple)

### 3. Submission Tracking
- Total students dihitung dari semua kelas yang dipilih
- Submission count dari semua siswa di kelas-kelas tersebut
- Percentage calculation tetap akurat

### 4. Notification
- Notifikasi dikirim ke semua kelas yang dipilih
- Loop untuk setiap kelas saat tugas dipublish

### 5. Student View
- Siswa hanya melihat tugas yang sesuai kelasnya
- Query menggunakan INNER JOIN dengan assignment_classes
- Tidak ada perubahan UI untuk siswa

## Changes Made

### 1. Database Migration
**File: sql/add_assignment_classes_table.sql**
- Create table `assignment_classes`
- Migrate existing data
- Add indexes and foreign keys

**File: run-migration-assignment-classes.js**
- Script untuk run migration
- Verify migration success

### 2. Frontend (Form Buat Tugas)
**File: src/views/teacher/assignment_new.ejs**

Before:
```html
<select name="class_id">
  <option value="">Semua Kelas</option>
  <% classes.forEach(c => { %>
    <option value="<%= c.id %>"><%= c.name %></option>
  <% }); %>
</select>
```

After:
```html
<div class="border rounded-lg p-3 max-h-64 overflow-y-auto">
  <label>
    <input type="checkbox" id="selectAllClasses" onchange="toggleAllClasses(this)" />
    Pilih Semua Kelas
  </label>
  <div class="space-y-1">
    <% classes.forEach(c => { %>
      <label>
        <input type="checkbox" name="class_ids[]" value="<%= c.id %>" class="class-checkbox" />
        <%= c.name %>
      </label>
    <% }); %>
  </div>
</div>
```

JavaScript:
```javascript
function toggleAllClasses(checkbox) {
  const classCheckboxes = document.querySelectorAll('.class-checkbox');
  classCheckboxes.forEach(cb => cb.checked = checkbox.checked);
}

function updateSelectAll() {
  const classCheckboxes = document.querySelectorAll('.class-checkbox');
  const selectAllCheckbox = document.getElementById('selectAllClasses');
  const allChecked = Array.from(classCheckboxes).every(cb => cb.checked);
  const someChecked = Array.from(classCheckboxes).some(cb => cb.checked);
  
  selectAllCheckbox.checked = allChecked;
  selectAllCheckbox.indeterminate = someChecked && !allChecked;
}

// Form validation
document.querySelector('form').addEventListener('submit', function(e) {
  const classCheckboxes = document.querySelectorAll('.class-checkbox:checked');
  if (classCheckboxes.length === 0) {
    e.preventDefault();
    alert('Pilih minimal 1 kelas untuk tugas ini!');
    return false;
  }
});
```

### 3. Backend (Create Assignment)
**File: src/routes/teacher.js** - POST /assignments

Before:
```javascript
const { class_id, ... } = req.body;
await pool.query(
  `INSERT INTO assignments (..., class_id) VALUES (..., :class_id)`,
  { ..., class_id }
);
```

After:
```javascript
const { class_ids, ... } = req.body;
const classIdsArray = Array.isArray(class_ids) ? class_ids : [class_ids];

// Validate
if (!class_ids || classIdsArray.length === 0) {
  req.flash('error', 'Pilih minimal 1 kelas');
  return res.redirect('/teacher/assignments/new');
}

// Insert assignment
const [result] = await connection.query(
  `INSERT INTO assignments (..., class_id) VALUES (..., NULL)`,
  { ... }
);

// Insert into junction table
for (const classId of classIdsArray) {
  await connection.query(
    `INSERT INTO assignment_classes (assignment_id, class_id) VALUES (?, ?)`,
    [result.insertId, classId]
  );
}

// Send notifications to all classes
for (const classId of classIdsArray) {
  await createNotificationForClass(classId, ...);
}
```

### 4. Backend (List Assignments)
**File: src/routes/teacher.js** - GET /assignments

Before:
```javascript
SELECT a.*, c.name AS class_name
FROM assignments a
LEFT JOIN classes c ON c.id = a.class_id
WHERE a.teacher_id = :teacherId
```

After:
```javascript
SELECT 
  a.*,
  GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS class_names,
  COUNT(DISTINCT ac.class_id) AS class_count,
  (SELECT COUNT(DISTINCT u.id) 
   FROM users u 
   INNER JOIN assignment_classes ac2 ON ac2.class_id = u.class_id 
   WHERE ac2.assignment_id = a.id AND u.role = 'student') AS total_students
FROM assignments a
LEFT JOIN assignment_classes ac ON ac.assignment_id = a.id
LEFT JOIN classes c ON c.id = ac.class_id
WHERE a.teacher_id = :teacherId
GROUP BY a.id
```

### 5. Frontend (List Assignments)
**File: src/views/teacher/assignments.ejs**

Before:
```html
<span><%= assignment.class_name || 'Semua' %></span>
```

After:
```html
<% if (assignment.class_count > 1) { %>
  <span class="bg-purple-100 text-purple-800">
    <%= assignment.class_count %> Kelas
  </span>
  <div class="text-xs"><%= assignment.class_names %></div>
<% } else { %>
  <span class="bg-cyan-100 text-cyan-800">
    <%= assignment.class_names || 'Semua' %>
  </span>
<% } %>
```

### 6. Student View
**File: src/routes/student.js** - GET /assignments

Before:
```javascript
WHERE a.is_published = 1
  AND (a.class_id IS NULL OR a.class_id = :classId)
```

After:
```javascript
INNER JOIN assignment_classes ac ON ac.assignment_id = a.id
WHERE a.is_published = 1
  AND ac.class_id = :classId
```

## Workflow

### Guru Membuat Tugas untuk Multiple Classes
1. Klik "Buat Tugas Baru"
2. Isi judul, deskripsi, mata pelajaran, dll
3. Di bagian "Kelas Target":
   - Centang kelas-kelas yang diinginkan
   - Atau klik "Pilih Semua Kelas" untuk select all
4. Klik "Buat Tugas"
5. Sistem akan:
   - Insert 1 record di tabel `assignments`
   - Insert N records di tabel `assignment_classes` (N = jumlah kelas)
   - Kirim notifikasi ke semua kelas yang dipilih
6. Flash message: "Tugas berhasil dibuat untuk X kelas"

### Guru Melihat List Tugas
1. Buka halaman "Tugas Saya"
2. Untuk tugas dengan 1 kelas:
   - Badge cyan dengan nama kelas
3. Untuk tugas dengan >1 kelas:
   - Badge purple "X Kelas"
   - List nama kelas di bawahnya
4. Submission count dan percentage dihitung dari semua kelas

### Siswa Melihat Tugas
1. Buka halaman "Tugas Saya"
2. Hanya melihat tugas yang sesuai kelasnya
3. Tidak ada perubahan UI atau workflow

## Benefits

### Efficiency
- **Before**: Buat 5 tugas terpisah untuk 5 kelas = 5x effort
- **After**: Buat 1 tugas untuk 5 kelas = 1x effort
- **Time saved**: ~80% faster

### Maintainability
- Edit 1 tugas = update untuk semua kelas
- Hapus 1 tugas = hapus untuk semua kelas (CASCADE)
- Konsisten across classes

### Statistics
- Lihat submission rate gabungan dari semua kelas
- Compare performance antar kelas untuk tugas yang sama
- Better insights untuk guru

### User Experience
- Checkbox list lebih intuitive daripada multiple select
- "Pilih Semua" untuk convenience
- Visual feedback dengan indeterminate state
- Clear display untuk multiple classes

## Backward Compatibility

### Kolom class_id Tetap Ada
- Tidak di-drop untuk backward compatibility
- Set ke NULL untuk tugas baru
- Old code yang masih pakai class_id tidak break

### Migration Safe
- Data existing dimigrate ke assignment_classes
- Jika migration gagal, rollback otomatis
- Verify migration success sebelum deploy

## Testing

### Test Cases
1. **Create tugas 1 kelas**: Pilih 1 kelas → Submit → Verify created
2. **Create tugas multiple classes**: Pilih 3 kelas → Submit → Verify created for all
3. **Create tugas semua kelas**: Klik "Pilih Semua" → Submit → Verify created for all
4. **Validation**: Tidak pilih kelas → Submit → Verify error message
5. **Student view**: Login sebagai siswa → Verify hanya melihat tugas kelasnya
6. **Submission tracking**: Submit tugas → Verify count dan percentage benar
7. **Notification**: Create tugas published → Verify notif ke semua kelas
8. **Edit tugas**: (Future) Edit tugas → Verify update untuk semua kelas
9. **Delete tugas**: Delete tugas → Verify CASCADE delete di assignment_classes

### Manual Testing
```bash
# Run migration
node run-migration-assignment-classes.js

# Restart server
npm start

# Test workflow
1. Login sebagai guru
2. Buat tugas baru dengan 3 kelas
3. Verify di list tugas muncul "3 Kelas"
4. Login sebagai siswa dari salah satu kelas
5. Verify tugas muncul di list siswa
6. Login sebagai siswa dari kelas lain (tidak dipilih)
7. Verify tugas TIDAK muncul
```

## Files Modified

1. **sql/add_assignment_classes_table.sql** - Migration SQL
2. **run-migration-assignment-classes.js** - Migration script
3. **src/views/teacher/assignment_new.ejs** - Form dengan checkbox list
4. **src/routes/teacher.js** - POST /assignments (create), GET /assignments (list)
5. **src/views/teacher/assignments.ejs** - Display multiple classes
6. **src/routes/student.js** - GET /assignments (filter by class)

## Future Enhancements

1. **Edit Assignment Classes**: Allow guru to add/remove classes after creation
2. **Copy Assignment**: Duplicate tugas ke kelas lain dengan 1 klik
3. **Class Groups**: Group kelas (misal: "Semua Kelas X") untuk quick selection
4. **Bulk Operations**: Edit/delete multiple assignments at once
5. **Analytics**: Compare submission rate per class untuk tugas yang sama
6. **Template**: Save tugas sebagai template untuk reuse
7. **Schedule**: Schedule tugas untuk publish di waktu berbeda per kelas

## Notes

- Junction table pattern adalah best practice untuk many-to-many relationship
- CASCADE delete memastikan orphan records tidak ada
- UNIQUE constraint mencegah duplicate assignment-class pairs
- GROUP_CONCAT untuk display multiple class names
- Transaction untuk ensure data consistency
- Validation di frontend dan backend untuk better UX dan security


## Update: Edit Assignment dengan Multiple Classes

### Status: ✅ SELESAI

Fitur edit tugas sekarang juga mendukung multiple classes selection.

### Changes Made

#### 1. Backend - GET Edit Form
**File: src/routes/teacher.js** - GET /assignments/:id/edit

Added query to load selected classes:
```javascript
// Get selected classes for this assignment
const [selectedClasses] = await pool.query(
  `SELECT class_id FROM assignment_classes WHERE assignment_id = ?`,
  [assignmentId]
);
assignment.selected_class_ids = selectedClasses.map(sc => sc.class_id);
```

#### 2. Backend - POST Update
**File: src/routes/teacher.js** - POST /assignments/:id/update

Before:
```javascript
const { class_id, ... } = req.body;
await pool.query(
  `UPDATE assignments SET ..., class_id = :class_id WHERE id = :id`,
  { ..., class_id }
);
```

After:
```javascript
const { class_ids, ... } = req.body;
const classIdsArray = Array.isArray(class_ids) ? class_ids : [class_ids];

// Validate
if (!class_ids || classIdsArray.length === 0) {
  req.flash('error', 'Pilih minimal 1 kelas');
  return res.redirect(`/teacher/assignments/${assignmentId}/edit`);
}

// Update assignment
await connection.query(
  `UPDATE assignments SET ... WHERE id = :id`,
  { ... }
);

// Delete existing class assignments
await connection.query(
  `DELETE FROM assignment_classes WHERE assignment_id = ?`,
  [assignmentId]
);

// Insert new class assignments
for (const classId of classIdsArray) {
  await connection.query(
    `INSERT INTO assignment_classes (assignment_id, class_id) VALUES (?, ?)`,
    [assignmentId, classId]
  );
}
```

#### 3. Frontend - Edit Form
**File: src/views/teacher/assignment_edit.ejs**

Before:
```html
<select name="class_id">
  <option value="">Semua Kelas</option>
  <% classes.forEach(c => { %>
    <option value="<%= c.id %>" <%= assignment.class_id == c.id ? 'selected' : '' %>>
      <%= c.name %>
    </option>
  <% }); %>
</select>
```

After:
```html
<div class="border rounded-lg p-3 max-h-64 overflow-y-auto">
  <label>
    <input type="checkbox" id="selectAllClasses" onchange="toggleAllClasses(this)" />
    Pilih Semua Kelas
  </label>
  <div class="space-y-1">
    <% classes.forEach(c => { %>
      <label>
        <input 
          type="checkbox" 
          name="class_ids[]" 
          value="<%= c.id %>"
          <%= assignment.selected_class_ids && assignment.selected_class_ids.includes(c.id) ? 'checked' : '' %>
          class="class-checkbox"
          onchange="updateSelectAll()"
        />
        <%= c.name %>
      </label>
    <% }); %>
  </div>
</div>
```

JavaScript (same as create form):
```javascript
function toggleAllClasses(checkbox) { ... }
function updateSelectAll() { ... }

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  updateSelectAll();
});

// Form validation
document.querySelector('form').addEventListener('submit', function(e) {
  const classCheckboxes = document.querySelectorAll('.class-checkbox:checked');
  if (classCheckboxes.length === 0) {
    e.preventDefault();
    alert('Pilih minimal 1 kelas untuk tugas ini!');
    return false;
  }
});
```

### Workflow

#### Edit Assignment Classes
1. Buka halaman list tugas
2. Klik tombol "Edit" pada tugas yang ingin diubah
3. Form edit terbuka dengan checkbox list kelas
4. Kelas yang sudah dipilih sebelumnya otomatis ter-centang
5. Ubah pilihan kelas:
   - Centang kelas baru untuk menambah
   - Uncheck kelas untuk menghapus
   - Klik "Pilih Semua" untuk select all
6. Klik "Simpan Perubahan"
7. Sistem akan:
   - Update data assignment
   - Delete semua assignment_classes lama
   - Insert assignment_classes baru sesuai pilihan
8. Flash message: "Tugas berhasil diperbarui untuk X kelas"

### Important Notes

#### Delete & Re-insert Strategy
Menggunakan strategi DELETE + INSERT (bukan UPDATE) karena:
- Lebih simple dan reliable
- Tidak perlu handle add/remove logic
- Transaction memastikan consistency
- Performance impact minimal (junction table kecil)

#### Transaction Safety
```javascript
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  
  // Update assignment
  // Delete old classes
  // Insert new classes
  
  await connection.commit();
} catch (err) {
  await connection.rollback();
} finally {
  connection.release();
}
```

#### Pre-selected Classes
- Query `assignment_classes` untuk get selected class IDs
- Pass ke view sebagai `assignment.selected_class_ids` array
- EJS check: `assignment.selected_class_ids.includes(c.id)`
- JavaScript `updateSelectAll()` dipanggil saat page load untuk set indeterminate state

### Testing

Test cases untuk edit:
- ✓ Load form dengan selected classes ter-centang
- ✓ Update tanpa ubah classes (tetap sama)
- ✓ Add classes (centang kelas baru)
- ✓ Remove classes (uncheck kelas)
- ✓ Change completely (uncheck semua, pilih kelas lain)
- ✓ Validation: tidak boleh kosong
- ✓ Transaction rollback jika error
- ✓ Flash message sesuai jumlah kelas

### Files Modified

1. **src/routes/teacher.js**
   - GET /assignments/:id/edit - Load selected classes
   - POST /assignments/:id/update - Update with transaction

2. **src/views/teacher/assignment_edit.ejs**
   - Replace dropdown dengan checkbox list
   - Add JavaScript untuk toggle & validation
   - Pre-select classes yang sudah dipilih

### Comparison: Create vs Edit

| Feature | Create | Edit |
|---------|--------|------|
| Form | Checkbox list | Checkbox list ✓ |
| Validation | Min 1 class | Min 1 class ✓ |
| Select All | Yes | Yes ✓ |
| Pre-selected | No | Yes ✓ |
| Backend | INSERT | DELETE + INSERT ✓ |
| Transaction | Yes | Yes ✓ |
| Flash message | "dibuat untuk X kelas" | "diperbarui untuk X kelas" ✓ |

### Status
✅ SELESAI - Edit assignment dengan multiple classes fully functional
