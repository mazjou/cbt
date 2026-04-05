# Fitur Reset Submission Tugas

## Deskripsi
Fitur untuk mereset submission tugas siswa, baik individual maupun semua sekaligus. Berguna ketika guru ingin memberikan kesempatan kedua kepada siswa atau ketika ada kesalahan dalam pengumpulan tugas.

## Fitur

### 1. Reset Individual Submission
- Tombol "Reset" pada setiap baris submission di tabel
- Menghapus submission spesifik dari satu siswa
- Menghapus file yang diupload
- Menghapus nilai dan feedback

### 2. Reset All Submissions
- Tombol "Reset Submission" di header detail tugas
- Muncul hanya jika ada submission
- Menghapus SEMUA submission untuk tugas tersebut
- Menghapus semua file yang diupload
- Menghapus semua nilai dan feedback

## UI/UX

### Tombol Reset Individual
- Lokasi: Di kolom "Aksi" pada tabel submission
- Warna: Merah (red-500 to red-600)
- Icon: 🗑️
- Konfirmasi: Alert dengan nama siswa

### Tombol Reset All
- Lokasi: Di header detail tugas, sebelah tombol "Edit Tugas"
- Warna: Orange (orange-500 to orange-600)
- Icon: 🔄
- Konfirmasi: Modal dengan peringatan lengkap

### Modal Reset All
- Peringatan besar dengan icon ⚠️
- Informasi detail tentang apa yang akan dihapus:
  - Jumlah submission
  - Semua file
  - Semua nilai dan feedback
- Tombol konfirmasi merah
- Tombol batal abu-abu

## Backend Endpoints

### 1. POST /teacher/assignments/submissions/:submissionId/reset
Reset submission individual

**Parameters:**
- `submissionId`: ID submission yang akan direset

**Process:**
1. Verify ownership (cek apakah tugas milik guru yang login)
2. Get submission data
3. Delete file dari filesystem jika ada
4. Delete submission dari database
5. Redirect ke detail tugas dengan flash message

**Response:**
- Success: "Submission berhasil direset"
- Error: "Submission tidak ditemukan atau Anda tidak memiliki akses"

### 2. POST /teacher/assignments/:id/reset-all
Reset semua submission untuk tugas tertentu

**Parameters:**
- `id`: ID assignment

**Process:**
1. Verify ownership
2. Get all submissions dengan file_path
3. Loop dan delete semua file dari filesystem
4. Delete all submissions dari database
5. Redirect ke detail tugas dengan info jumlah yang dihapus

**Response:**
- Success: "Berhasil mereset X submission dan menghapus Y file"
- Error: "Gagal mereset submission"

## Security

### Authorization
- Hanya guru pemilik tugas yang bisa reset
- Verify ownership di setiap endpoint
- Session check untuk teacher role

### Confirmation
- Double confirmation untuk reset all (modal + alert)
- Single confirmation untuk reset individual (alert)
- Peringatan jelas bahwa data tidak dapat dikembalikan

### File Handling
- Check file existence sebelum delete
- Try-catch untuk setiap file deletion
- Continue jika ada file yang gagal dihapus
- Log error untuk debugging

## Changes Made

### File: `src/views/teacher/assignment_detail.ejs`

#### 1. Tambah Tombol Reset All di Header
```html
<div class="ml-auto flex gap-2">
  <a href="/teacher/assignments/<%= assignment.id %>/edit" class="...">
    ✏️ Edit Tugas
  </a>
  <% if (submissions.length > 0) { %>
    <button onclick="openResetModal()" class="...">
      🔄 Reset Submission
    </button>
  <% } %>
</div>
```

#### 2. Tambah Tombol Reset Individual di Tabel
```html
<button 
  onclick="resetIndividual(<%= sub.id %>, '<%= sub.student_name %>')"
  class="px-3 py-1 bg-gradient-to-r from-red-500 to-red-600 ..."
  title="Reset submission siswa ini"
>
  🗑️ Reset
</button>
```

#### 3. Tambah Modal Reset
```html
<div id="resetModal" class="hidden fixed inset-0 ...">
  <!-- Modal content with warning and confirmation -->
</div>
```

#### 4. Tambah JavaScript Functions
```javascript
function openResetModal() { ... }
function closeResetModal() { ... }
function resetAllSubmissions() { ... }
function resetIndividual(submissionId, studentName) { ... }
```

### File: `src/routes/teacher.js`

#### 1. Endpoint Reset Individual (setelah grade endpoint)
```javascript
router.post('/assignments/submissions/:submissionId/reset', async (req, res) => {
  // Verify ownership
  // Delete file
  // Delete submission
  // Redirect with flash message
});
```

#### 2. Endpoint Reset All
```javascript
router.post('/assignments/:id/reset-all', async (req, res) => {
  // Verify ownership
  // Get all submissions
  // Delete all files
  // Delete all submissions
  // Redirect with flash message
});
```

## Use Cases

### 1. Kesempatan Kedua
Guru ingin memberikan kesempatan kedua kepada siswa yang salah upload file atau mendapat nilai rendah.

**Steps:**
1. Buka detail tugas
2. Klik tombol "Reset" pada submission siswa
3. Konfirmasi reset
4. Siswa bisa upload ulang

### 2. Reset Massal
Guru ingin mengulang tugas dari awal untuk semua siswa (misalnya ada perubahan instruksi).

**Steps:**
1. Buka detail tugas
2. Klik tombol "Reset Submission"
3. Baca peringatan di modal
4. Klik "Reset Semua"
5. Konfirmasi di alert
6. Semua submission dihapus

### 3. Koreksi Kesalahan
Ada kesalahan teknis atau siswa upload file yang salah.

**Steps:**
1. Buka detail tugas
2. Klik "Reset" pada submission yang bermasalah
3. Konfirmasi
4. Minta siswa upload ulang dengan benar

## Testing

### Test Reset Individual
1. Login sebagai guru
2. Buka tugas yang ada submission
3. Klik tombol "Reset" pada salah satu submission
4. Konfirmasi
5. Verify:
   - Submission hilang dari tabel
   - File terhapus dari folder uploads
   - Flash message sukses muncul

### Test Reset All
1. Login sebagai guru
2. Buka tugas yang ada beberapa submission
3. Klik tombol "Reset Submission"
4. Modal muncul dengan info lengkap
5. Klik "Reset Semua"
6. Konfirmasi di alert
7. Verify:
   - Semua submission hilang
   - Semua file terhapus
   - Flash message dengan jumlah yang dihapus
   - Tombol "Reset Submission" hilang (karena tidak ada submission)

### Test Authorization
1. Login sebagai guru A
2. Coba akses URL reset untuk tugas milik guru B
3. Verify: Error "tidak memiliki akses"

## Notes

- Reset adalah operasi PERMANENT, tidak bisa undo
- File yang dihapus tidak masuk recycle bin
- Siswa akan bisa upload ulang setelah submission direset
- Nilai dan feedback juga ikut terhapus
- Log error jika ada file yang gagal dihapus, tapi proses tetap lanjut
- Tombol "Reset Submission" hanya muncul jika ada submission

## Future Enhancements

1. **Soft Delete**: Simpan submission yang dihapus ke tabel archive
2. **Bulk Reset**: Checkbox untuk pilih submission mana yang akan direset
3. **Reset History**: Log siapa yang reset dan kapan
4. **Notification**: Kirim notifikasi ke siswa ketika submission direset
5. **Restore**: Fitur untuk restore submission yang sudah direset (dalam waktu tertentu)
