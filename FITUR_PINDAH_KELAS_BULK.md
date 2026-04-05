# Fitur Pindah Kelas Bulk - Admin

## Deskripsi
Fitur untuk memindahkan beberapa pengguna sekaligus ke kelas yang sama dalam satu operasi. Fitur ini tersedia di halaman admin pengguna dan memungkinkan admin untuk mengubah kelas siswa secara massal.

## Lokasi Fitur
- **Halaman**: `/admin/users`
- **Akses**: Admin only
- **Posisi**: Bulk action bar (muncul ketika ada pengguna yang dipilih)

## Cara Penggunaan

### 1. Pilih Pengguna
- Centang checkbox pada pengguna yang ingin dipindah kelas
- Atau gunakan "Select All" untuk memilih semua pengguna di halaman

### 2. Pilih Kelas Tujuan
- Dropdown "Pilih Kelas Tujuan" akan muncul di bulk action bar
- Pilih kelas tujuan dari daftar kelas yang tersedia
- Pilih "Tanpa Kelas" untuk menghapus kelas dari pengguna

### 3. Konfirmasi dan Eksekusi
- Klik tombol "Pindah Kelas"
- Konfirmasi dialog akan muncul menampilkan jumlah pengguna dan kelas tujuan
- Klik "OK" untuk melanjutkan proses

## Fitur Teknis

### Frontend (JavaScript)
- **Fungsi**: `bulkMoveClass()`
- **Validasi**: 
  - Memastikan ada pengguna yang dipilih
  - Memastikan kelas tujuan sudah dipilih
  - Konfirmasi sebelum eksekusi
- **Form Submission**: Dynamic form creation dan submission

### Backend (Node.js)
- **Route**: `POST /admin/users/bulk-move-class`
- **Parameter**:
  - `user_ids`: Array ID pengguna (JSON string)
  - `class_id`: ID kelas tujuan (kosong untuk "Tanpa Kelas")
- **Validasi**:
  - Parse dan validasi user_ids
  - Validasi class_id jika ada
  - Cek keberadaan kelas tujuan
- **Database**: Transaction-based update untuk konsistensi

### Database
- **Tabel**: `users`
- **Kolom**: `class_id`
- **Operasi**: `UPDATE users SET class_id = ? WHERE id IN (...)`

## Keamanan
- ✅ Role-based access (Admin only)
- ✅ Input validation dan sanitization
- ✅ SQL injection protection (parameterized queries)
- ✅ Transaction rollback pada error
- ✅ Error handling dan logging

## Error Handling
- Format data tidak valid
- Tidak ada pengguna yang dipilih
- ID pengguna tidak valid
- Kelas tujuan tidak ditemukan
- Database error dengan rollback

## Flash Messages
- **Success**: "Berhasil memindahkan X pengguna ke kelas 'Nama Kelas'."
- **Error**: Berbagai pesan error sesuai kondisi

## UI/UX
- **Bulk Action Bar**: Muncul otomatis ketika ada pengguna yang dipilih
- **Dropdown Kelas**: Terintegrasi dengan data kelas dari database
- **Konfirmasi Dialog**: Menampilkan detail operasi sebelum eksekusi
- **Visual Feedback**: Button styling dengan gradient dan hover effects

## Integrasi
- **Filter**: Bulk action bar mempertahankan filter yang aktif
- **Pagination**: Bekerja dengan sistem pagination yang ada
- **Modal Edit**: Tidak mengganggu modal edit individual

## Testing
Untuk menguji fitur:
1. Login sebagai admin
2. Buka halaman `/admin/users`
3. Pilih beberapa pengguna dengan checkbox
4. Pilih kelas tujuan dari dropdown
5. Klik "Pindah Kelas" dan konfirmasi
6. Verifikasi perubahan kelas pada tabel pengguna

## File yang Dimodifikasi
- `src/views/admin/users.ejs` - Tambah JavaScript function `bulkMoveClass()`
- `src/routes/admin.js` - Tambah route `POST /users/bulk-move-class`

## Kompatibilitas
- ✅ Bekerja dengan sistem filter yang ada
- ✅ Kompatibel dengan bulk delete
- ✅ Responsive design
- ✅ Cross-browser compatibility