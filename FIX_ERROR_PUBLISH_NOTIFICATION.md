# Fix Error Publish dengan Notifikasi

## Masalah
Ketika guru melakukan publish ujian/materi/tugas, muncul pesan error merah meskipun data sudah berhasil terpublish. Ini terjadi karena error pada proses pengiriman notifikasi yang menggagalkan seluruh proses.

## Penyebab
Error terjadi pada fungsi `createNotificationForClass` atau `createNotificationForMultipleClasses` yang melempar error (throw error) jika ada masalah. Karena tidak ada error handling, error ini menyebabkan:
1. Flash message error muncul
2. User bingung karena data sebenarnya sudah terpublish
3. User experience yang buruk

## Solusi
Menambahkan try-catch block pada bagian pengiriman notifikasi sehingga:
- Jika notifikasi berhasil dikirim → bagus
- Jika notifikasi gagal → hanya log error, tidak menggagalkan proses publish
- User tetap mendapat pesan sukses karena publish berhasil

## Perubahan Kode

### 1. Toggle Publish Ujian (teacher.js)

**Sebelum:**
```javascript
// Kirim notifikasi jika ujian baru dipublish
if (!wasPublished) {
  // Get class IDs for this exam
  const [examClasses] = await pool.query(...);
  
  if (examClasses.length > 0) {
    await createNotificationForMultipleClasses({...});
  } else if (exam.class_id) {
    await createNotificationForClass({...});
  }
}

req.flash('success', 'Status publish diperbarui.');
```

**Sesudah:**
```javascript
// Kirim notifikasi jika ujian baru dipublish
if (!wasPublished) {
  try {
    // Get class IDs for this exam
    const [examClasses] = await pool.query(...);
    
    if (examClasses.length > 0) {
      await createNotificationForMultipleClasses({...});
    } else if (exam.class_id) {
      await createNotificationForClass({...});
    }
  } catch (notifError) {
    // Log error tapi jangan gagalkan proses publish
    console.error('Error sending notification:', notifError);
  }
}

req.flash('success', 'Status publish diperbarui.');
```

### 2. Toggle Publish Materi (teacher.js)

**Sebelum:**
```javascript
// Kirim notifikasi jika materi baru dipublish
if (!wasPublished) {
  const className = material.class_name || 'Semua Kelas';
  await createNotificationForClass({...});
}

req.flash('success', 'Status publish materi diperbarui.');
```

**Sesudah:**
```javascript
// Kirim notifikasi jika materi baru dipublish
if (!wasPublished) {
  try {
    const className = material.class_name || 'Semua Kelas';
    await createNotificationForClass({...});
  } catch (notifError) {
    // Log error tapi jangan gagalkan proses publish
    console.error('Error sending notification:', notifError);
  }
}

req.flash('success', 'Status publish materi diperbarui.');
```

### 3. Toggle Publish Tugas (teacher.js)

**Sebelum:**
```javascript
// Send notification if publishing
if (newStatus === 1 && assignment.class_id) {
  await createNotificationForClass(...);
}

req.flash('success', newStatus ? 'Tugas dipublikasi' : 'Tugas di-unpublish');
```

**Sesudah:**
```javascript
// Send notification if publishing
if (newStatus === 1 && assignment.class_id) {
  try {
    await createNotificationForClass(...);
  } catch (notifError) {
    // Log error tapi jangan gagalkan proses publish
    console.error('Error sending notification:', notifError);
  }
}

req.flash('success', newStatus ? 'Tugas dipublikasi' : 'Tugas di-unpublish');
```

## Hasil Setelah Fix

### Sebelum Fix:
- ✅ Data terpublish
- ❌ Muncul pesan error merah
- ❌ User bingung

### Setelah Fix:
- ✅ Data terpublish
- ✅ Muncul pesan sukses hijau
- ✅ User senang
- ✅ Error notifikasi hanya di-log di console (untuk debugging)

## Testing

### Test Case 1: Publish Ujian dengan Notifikasi Berhasil
1. Buat ujian baru
2. Pilih kelas
3. Klik tombol "Publish"
4. **Expected**: Pesan sukses muncul, notifikasi terkirim ke siswa

### Test Case 2: Publish Ujian dengan Notifikasi Gagal
1. Buat ujian baru
2. Pilih kelas yang tidak ada siswanya
3. Klik tombol "Publish"
4. **Expected**: Pesan sukses tetap muncul, ujian terpublish, error hanya di console

### Test Case 3: Publish Materi
1. Buat materi baru
2. Klik tombol "Publish"
3. **Expected**: Pesan sukses muncul

### Test Case 4: Publish Tugas
1. Buat tugas baru
2. Klik tombol "Publish"
3. **Expected**: Pesan sukses muncul

## Catatan Penting

1. **Error Handling yang Tepat**: Error notifikasi tidak boleh menggagalkan proses utama (publish)
2. **Logging**: Error tetap di-log untuk debugging
3. **User Experience**: User mendapat feedback yang benar sesuai dengan hasil operasi
4. **Backward Compatibility**: Tetap support exam dengan single class_id (backward compatibility)

## File yang Diubah

- `src/routes/teacher.js` (3 endpoint):
  - POST `/exams/:id/toggle-publish`
  - POST `/materials/:id/toggle-publish`
  - POST `/assignments/:id/toggle-publish`

## Deployment

Setelah update kode:
1. Restart aplikasi: `npm restart` atau `pm2 restart cbt-app`
2. Test semua fitur publish
3. Monitor console log untuk error notifikasi (jika ada)

## Troubleshooting

Jika masih muncul error setelah fix:
1. Cek console log untuk detail error
2. Pastikan tabel `notifications` ada dan struktur benar
3. Cek fungsi `createNotificationForClass` dan `createNotificationForMultipleClasses`
4. Pastikan ada siswa di kelas yang dipilih

## Update Log

- **2024**: Fix error handling pada proses publish untuk ujian, materi, dan tugas
