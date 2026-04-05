# Fitur Edit Tugas - Dashboard Guru

## Status: ✅ COMPLETED

## Overview
Menambahkan fitur edit tugas pada dashboard guru, memungkinkan guru untuk mengubah informasi tugas yang sudah dibuat tanpa harus menghapus dan membuat ulang.

## Features Added

### 1. Tombol Edit di List Tugas
- Tombol Edit dengan soft purple gradient
- Posisi: Di samping tombol "Lihat Detail"
- Warna: Purple gradient (400 → 500)
- Hover effect: Shadow + scale transform

### 2. Route Edit Assignment
**GET `/teacher/assignments/:id/edit`**
- Menampilkan form edit dengan data tugas yang sudah ada
- Verifikasi ownership (hanya guru pembuat yang bisa edit)
- Load data subjects dan classes untuk dropdown

**POST `/teacher/assignments/:id/update`**
- Update data tugas di database
- Validasi ownership
- Redirect ke list tugas setelah berhasil

### 3. View Edit Assignment
File: `src/views/teacher/assignment_edit.ejs`

Form fields yang bisa diedit:
- ✅ Judul Tugas
- ✅ Deskripsi / Instruksi
- ✅ Mata Pelajaran
- ✅ Kelas Target
- ✅ Deadline
- ✅ Nilai Maksimal
- ✅ Izinkan pengumpulan terlambat (checkbox)
- ✅ Status publikasi (checkbox)

### 4. Update Tombol dengan Warna Ceria
Semua tombol di halaman assignments sekarang menggunakan soft gradient:

- **Lihat Detail** → 💙 Soft Blue Gradient
- **Edit** → 💜 Soft Purple Gradient
- **Publish** → 💚 Soft Green to Emerald Gradient
- **Unpublish** → 🧡 Soft Orange Gradient
- **Hapus** → ❤️ Soft Rose Gradient

## Technical Implementation

### Routes Added (src/routes/teacher.js)

```javascript
// Edit assignment form
router.get('/assignments/:id/edit', async (req, res) => {
  // Load assignment data
  // Load subjects and classes
  // Render edit form
});

// Update assignment
router.post('/assignments/:id/update', async (req, res) => {
  // Verify ownership
  // Update assignment data
  // Redirect to list
});
```

### View Structure (assignment_edit.ejs)

```html
<form method="POST" action="/teacher/assignments/:id/update">
  <!-- Judul -->
  <input name="title" value="<%= assignment.title %>" />
  
  <!-- Deskripsi -->
  <textarea name="description"><%= assignment.description %></textarea>
  
  <!-- Mata Pelajaran -->
  <select name="subject_id">
    <option selected><%= assignment.subject_id %></option>
  </select>
  
  <!-- Kelas -->
  <select name="class_id">
    <option selected><%= assignment.class_id %></option>
  </select>
  
  <!-- Deadline -->
  <input type="datetime-local" name="due_date" 
         value="<%= assignment.due_date %>" />
  
  <!-- Max Score -->
  <input type="number" name="max_score" 
         value="<%= assignment.max_score %>" />
  
  <!-- Checkboxes -->
  <input type="checkbox" name="allow_late_submission" 
         <%= assignment.allow_late_submission ? 'checked' : '' %> />
  <input type="checkbox" name="is_published" 
         <%= assignment.is_published ? 'checked' : '' %> />
  
  <!-- Buttons -->
  <button type="submit">Simpan Perubahan</button>
  <a href="/teacher/assignments">Batal</a>
</form>
```

### Button Styles (assignments.ejs)

```html
<!-- Edit Button -->
<a href="/teacher/assignments/<%= assignment.id %>/edit" 
   class="bg-gradient-to-r from-purple-400 to-purple-500 
          hover:from-purple-500 hover:to-purple-600 
          text-white font-semibold rounded-lg 
          shadow-sm hover:shadow-md 
          transform hover:scale-105 
          transition-all duration-200">
  Edit
</a>
```

## User Flow

### Edit Tugas Workflow:

1. **Guru membuka halaman Tugas Saya**
   - URL: `/teacher/assignments`
   - Melihat list semua tugas

2. **Klik tombol "Edit" pada tugas yang ingin diubah**
   - Redirect ke: `/teacher/assignments/:id/edit`
   - Form edit terbuka dengan data pre-filled

3. **Ubah informasi yang diperlukan**
   - Judul, deskripsi, mata pelajaran, dll
   - Semua field sudah terisi dengan data lama

4. **Klik "Simpan Perubahan"**
   - POST ke: `/teacher/assignments/:id/update`
   - Data diupdate di database
   - Flash message: "Tugas berhasil diperbarui"
   - Redirect ke: `/teacher/assignments`

5. **Atau klik "Batal"**
   - Redirect ke: `/teacher/assignments`
   - Tidak ada perubahan disimpan

## Security & Validation

### Ownership Verification
```javascript
const [[existing]] = await pool.query(
  `SELECT id FROM assignments 
   WHERE id = :id AND teacher_id = :teacherId;`,
  { id: assignmentId, teacherId }
);

if (!existing) {
  req.flash('error', 'Tugas tidak ditemukan');
  return res.redirect('/teacher/assignments');
}
```

### Required Fields
- ✅ Judul Tugas (required)
- ✅ Mata Pelajaran (required)
- ⚪ Deskripsi (optional)
- ⚪ Kelas Target (optional - default: semua kelas)
- ⚪ Deadline (optional)
- ✅ Nilai Maksimal (default: 100)

### Data Sanitization
- Null handling untuk optional fields
- Checkbox conversion (1/0)
- Date format validation

## Database Updates

### UPDATE Query
```sql
UPDATE assignments 
SET subject_id = :subject_id,
    title = :title,
    description = :description,
    class_id = :class_id,
    due_date = :due_date,
    max_score = :max_score,
    allow_late_submission = :allow_late,
    is_published = :is_published
WHERE id = :id AND teacher_id = :teacherId;
```

## UI/UX Improvements

### Visual Consistency
- Form layout sama dengan "Buat Tugas Baru"
- Purple theme untuk edit (vs green untuk create)
- Soft gradient buttons dengan hover effects

### User Feedback
- Flash messages untuk success/error
- Pre-filled form values
- Clear button labels
- Responsive layout

### Accessibility
- Required field indicators (*)
- Helper text untuk optional fields
- Keyboard navigation support
- Focus states pada form inputs

## Testing Checklist

### Functional Tests
- [ ] Tombol Edit muncul di list tugas
- [ ] Klik Edit membuka form dengan data pre-filled
- [ ] Semua field menampilkan nilai yang benar
- [ ] Dropdown subjects menunjukkan selected value
- [ ] Dropdown classes menunjukkan selected value
- [ ] Checkbox states (checked/unchecked) benar
- [ ] Datetime field menampilkan format yang benar
- [ ] Submit form berhasil update data
- [ ] Flash message "berhasil diperbarui" muncul
- [ ] Redirect ke list tugas setelah update
- [ ] Tombol Batal redirect tanpa save
- [ ] Ownership verification berfungsi
- [ ] Guru lain tidak bisa edit tugas orang lain

### UI Tests
- [ ] Tombol Edit berwarna purple gradient
- [ ] Hover effect berfungsi (shadow + scale)
- [ ] Form responsive di mobile
- [ ] Buttons aligned dengan baik
- [ ] No visual glitches
- [ ] Consistent spacing

### Edge Cases
- [ ] Edit tugas yang sudah dipublish
- [ ] Edit tugas dengan submissions
- [ ] Edit dengan menghapus deadline
- [ ] Edit dengan mengubah kelas
- [ ] Edit dengan special characters di title
- [ ] Edit dengan description sangat panjang

## Files Modified/Created

### Modified:
- ✅ `src/routes/teacher.js` - Added edit routes
- ✅ `src/views/teacher/assignments.ejs` - Added Edit button + colorful buttons

### Created:
- ✅ `src/views/teacher/assignment_edit.ejs` - Edit form view
- ✅ `FITUR_EDIT_TUGAS_GURU.md` - This documentation

## Color Palette

| Button | Color Scheme | Purpose |
|--------|--------------|---------|
| Lihat Detail | Blue (400→500) | View assignment details |
| Edit | Purple (400→500) | Edit assignment |
| Publish | Green-Emerald (400→500) | Publish draft |
| Unpublish | Orange (400→500) | Unpublish published |
| Hapus | Rose (400→500) | Delete assignment |

## Future Enhancements

### Potential Improvements:
- [ ] Add confirmation dialog before saving changes
- [ ] Show diff of changes before save
- [ ] Add "Save as Draft" option
- [ ] Auto-save functionality
- [ ] Version history / audit log
- [ ] Bulk edit multiple assignments
- [ ] Duplicate assignment feature
- [ ] Preview changes before save

### Advanced Features:
- [ ] Rich text editor untuk deskripsi
- [ ] File attachment untuk instruksi
- [ ] Template tugas
- [ ] Recurring assignments
- [ ] Assignment analytics
- [ ] Export/import assignments

## Known Limitations

1. **No notification on edit**: Siswa tidak mendapat notifikasi saat tugas diedit
2. **No version control**: Tidak ada history perubahan
3. **No undo**: Tidak bisa undo setelah save
4. **No draft save**: Harus save semua atau cancel

## Troubleshooting

### Error: "Tugas tidak ditemukan"
**Cause**: Assignment ID tidak valid atau bukan milik guru
**Solution**: Verifikasi ID dan ownership

### Error: "Gagal memperbarui tugas"
**Cause**: Database error atau validation failed
**Solution**: Check console log untuk detail error

### Form tidak pre-filled
**Cause**: Data tidak terload dari database
**Solution**: Check route GET `/assignments/:id/edit`

### Datetime field tidak menampilkan nilai
**Cause**: Format datetime tidak sesuai
**Solution**: Convert ke ISO format: `toISOString().slice(0, 16)`

## Summary

Fitur edit tugas sudah berhasil ditambahkan dengan:
- ✅ Tombol Edit berwarna purple gradient yang ceria
- ✅ Form edit dengan pre-filled values
- ✅ Routes untuk GET dan POST edit
- ✅ Ownership verification
- ✅ Flash messages untuk feedback
- ✅ Responsive design
- ✅ Consistent dengan design system

Guru sekarang bisa dengan mudah mengedit tugas yang sudah dibuat tanpa harus menghapus dan membuat ulang! 🎉
