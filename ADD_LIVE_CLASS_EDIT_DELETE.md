# Add: Edit & Delete Live Class

## Fitur Baru

Menambahkan tombol Edit dan Hapus untuk live class guru dengan aturan berdasarkan status.

## Tombol Berdasarkan Status

### SCHEDULED (Terjadwal)
- ▶️ **Mulai** - Memulai live class
- ✏️ **Edit** - Edit informasi live class
- 🗑️ **Hapus** - Hapus live class

### LIVE (Sedang Berlangsung)
- 🎥 **Masuk** - Masuk ke room
- ⏹️ **Akhiri** - Akhiri live class
- ❌ Tidak bisa edit/hapus

### ENDED (Selesai)
- 📊 **Laporan** - Lihat laporan
- 🗑️ **Hapus** - Hapus live class
- ❌ Tidak bisa edit

### CANCELLED (Dibatalkan)
- 🗑️ **Hapus** - Hapus live class
- ❌ Tidak bisa edit

## Routes Baru

### GET /teacher/live-classes/:id/edit
Menampilkan form edit live class.

**Validasi:**
- Hanya teacher yang membuat live class
- Hanya status SCHEDULED yang bisa diedit

**Response:**
- Render form edit dengan data live class
- Dropdown subjects dan classes

### POST /teacher/live-classes/:id/update
Update data live class.

**Parameters:**
- subject_id
- class_id (optional)
- title
- description (optional)
- scheduled_at
- duration_minutes
- max_participants

**Validasi:**
- Ownership check
- Status harus SCHEDULED

**Response:**
- Success: Redirect ke /teacher/live-classes
- Error: Flash message + redirect

### POST /teacher/live-classes/:id/delete
Hapus live class.

**Validasi:**
- Ownership check
- Tidak bisa hapus jika status LIVE

**Process:**
1. Delete participants (foreign key)
2. Delete live class

**Response:**
- Success: Flash message + redirect
- Error: Flash message + redirect

## View: live_class_edit.ejs

Form edit dengan field:
- Mata Pelajaran (dropdown, required)
- Kelas (dropdown, optional)
- Judul (text, required)
- Deskripsi (textarea, optional)
- Jadwal (datetime-local, required)
- Durasi (number, 15-240 menit)
- Maks. Peserta (number, 1-500)

**Buttons:**
- Batal (kembali ke list)
- Simpan Perubahan (submit)

## View: live_classes.ejs (Updated)

### SCHEDULED
```html
<button>▶️ Mulai</button>
<a>✏️ Edit</a>
<button onclick="confirm()">🗑️ Hapus</button>
```

### LIVE
```html
<a>🎥 Masuk</a>
<button>⏹️ Akhiri</button>
```

### ENDED
```html
<a>📊 Laporan</a>
<button onclick="confirm()">🗑️ Hapus</button>
```

### CANCELLED
```html
<button onclick="confirm()">🗑️ Hapus</button>
```

## Confirmation Dialog

Sebelum hapus, muncul konfirmasi:
```javascript
onsubmit="return confirm('Yakin ingin menghapus live class ini?')"
```

## Security

### Ownership Check
Semua routes memvalidasi:
```sql
WHERE id = :id AND teacher_id = :teacherId
```

### Status Check
- Edit: Hanya SCHEDULED
- Delete: Tidak bisa jika LIVE

### Foreign Key Handling
Delete participants dulu sebelum delete live class.

## Styling

### Button Colors
- Edit: `bg-amber-600` (orange)
- Hapus: `bg-rose-600` (red)
- Mulai: `bg-green-600` (green)
- Masuk: `bg-red-600` (red)
- Akhiri: `bg-slate-600` (gray)
- Laporan: `bg-indigo-600` (indigo)

### Responsive
- Mobile: Buttons horizontal (flex)
- Desktop: Buttons vertical (flex-col)
- Full width di mobile dengan `flex-1`

## Error Handling

### Edit Form
- Live class tidak ditemukan
- Bukan pemilik
- Status bukan SCHEDULED

### Update
- Validation error
- Database error

### Delete
- Live class tidak ditemukan
- Bukan pemilik
- Status LIVE (tidak bisa dihapus)
- Database error

## Flash Messages

### Success
- "Live class berhasil diupdate"
- "Live class berhasil dihapus"

### Error
- "Live class tidak ditemukan"
- "Hanya live class yang terjadwal yang bisa diedit"
- "Tidak bisa menghapus live class yang sedang berlangsung"
- "Gagal mengupdate live class"
- "Gagal menghapus live class"

## File yang Dimodifikasi/Dibuat

1. `src/routes/live-classes.js` - Tambah routes edit, update, delete
2. `src/views/teacher/live_classes.ejs` - Tambah tombol edit & hapus
3. `src/views/teacher/live_class_edit.ejs` - Form edit (baru)

## Testing

### Edit
- ✅ Akses form edit untuk SCHEDULED
- ✅ Tidak bisa edit LIVE/ENDED/CANCELLED
- ✅ Form terisi dengan data existing
- ✅ Update berhasil
- ✅ Validation error handling

### Delete
- ✅ Hapus SCHEDULED berhasil
- ✅ Hapus ENDED berhasil
- ✅ Hapus CANCELLED berhasil
- ✅ Tidak bisa hapus LIVE
- ✅ Confirmation dialog muncul
- ✅ Participants terhapus juga

## Notes

- Edit hanya untuk SCHEDULED (belum dimulai)
- Delete bisa untuk semua status kecuali LIVE
- Confirmation dialog untuk prevent accidental delete
- Cascade delete untuk participants
- Flash messages untuk user feedback

---

**Status**: ✅ Implemented
**Updated**: 2026-03-08
