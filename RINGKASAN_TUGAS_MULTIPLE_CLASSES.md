# Ringkasan: Fitur Tugas untuk Multiple Classes

## Fitur Baru
Guru sekarang bisa membuat 1 tugas untuk lebih dari 1 kelas sekaligus, tidak perlu membuat tugas terpisah untuk setiap kelas.

## Perubahan

### 1. Database
- Tabel baru: `assignment_classes` (junction table)
- Relasi many-to-many antara assignments dan classes
- Data existing sudah dimigrate otomatis

### 2. Form Buat Tugas
- Dropdown "Kelas Target" diganti dengan checkbox list
- Fitur "Pilih Semua Kelas" untuk convenience
- Validasi minimal 1 kelas harus dipilih
- Scrollable jika kelas banyak

### 3. Tampilan List Tugas (Guru)
- Jika 1 kelas: Badge cyan dengan nama kelas
- Jika >1 kelas: Badge purple "X Kelas" + list nama kelas
- Submission tracking dari semua kelas gabungan

### 4. Tampilan Tugas (Siswa)
- Tidak ada perubahan UI
- Siswa tetap hanya melihat tugas kelasnya
- Query dioptimasi dengan INNER JOIN

## Cara Menggunakan

### Membuat Tugas untuk Multiple Classes
1. Klik "Buat Tugas Baru"
2. Isi form seperti biasa
3. Di bagian "Kelas Target":
   - Centang kelas-kelas yang diinginkan
   - Atau klik "Pilih Semua Kelas"
4. Klik "Buat Tugas"
5. Tugas akan dibuat untuk semua kelas yang dipilih
6. Notifikasi otomatis dikirim ke semua kelas

### Melihat Tugas dengan Multiple Classes
- Di list tugas, akan muncul badge "X Kelas"
- Hover atau lihat di bawah badge untuk list nama kelas
- Submission count dan percentage dihitung dari semua kelas

## Keuntungan

### Efisiensi
- **Sebelum**: Buat 5 tugas terpisah untuk 5 kelas = 5x effort
- **Sekarang**: Buat 1 tugas untuk 5 kelas = 1x effort
- Hemat waktu ~80%

### Konsistensi
- Edit 1 tugas = update untuk semua kelas
- Hapus 1 tugas = hapus untuk semua kelas
- Tidak ada inkonsistensi antar kelas

### Statistik
- Lihat submission rate gabungan
- Compare performance antar kelas
- Better insights untuk evaluasi

## Migration

### Cara Install
```bash
# Run migration
node run-migration-assignment-classes.js

# Restart server
npm start
```

### Aman untuk Production
- Data existing otomatis dimigrate
- Backward compatible (kolom class_id tetap ada)
- Transaction-based untuk data consistency
- Rollback otomatis jika gagal

## Testing

Test berhasil untuk:
- ✓ Create assignment untuk 1 kelas
- ✓ Create assignment untuk multiple classes
- ✓ Display multiple classes di list tugas
- ✓ Student view hanya melihat tugas kelasnya
- ✓ Submission tracking akurat
- ✓ Query performance optimal

## Files Modified

1. **sql/add_assignment_classes_table.sql** - Migration SQL
2. **run-migration-assignment-classes.js** - Migration script
3. **src/views/teacher/assignment_new.ejs** - Form dengan checkbox
4. **src/routes/teacher.js** - Create & list assignments
5. **src/views/teacher/assignments.ejs** - Display multiple classes
6. **src/routes/student.js** - Filter assignments by class

## Status
✅ SELESAI - Tested & ready for production

## Next Steps
1. Run migration di production
2. Restart server
3. Test create tugas dengan multiple classes
4. Monitor untuk issues


## Update: Edit Tugas dengan Multiple Classes

### Status: ✅ SELESAI

Fitur edit tugas sekarang juga mendukung multiple classes selection, sama seperti form create.

### Perubahan

#### 1. Form Edit Tugas
- Dropdown "Kelas Target" diganti dengan checkbox list
- Kelas yang sudah dipilih otomatis ter-centang
- Fitur "Pilih Semua Kelas" tersedia
- Validasi minimal 1 kelas

#### 2. Backend Logic
- Load selected classes saat buka form edit
- Update menggunakan strategi DELETE + INSERT
- Transaction untuk data consistency
- Validation untuk empty classes

### Cara Menggunakan

#### Edit Classes untuk Tugas Existing
1. Buka halaman "Tugas Saya"
2. Klik tombol "Edit" pada tugas
3. Form edit terbuka dengan kelas yang sudah dipilih ter-centang
4. Ubah pilihan kelas:
   - Centang kelas baru untuk menambah
   - Uncheck kelas untuk menghapus
   - Klik "Pilih Semua" untuk select all
5. Klik "Simpan Perubahan"
6. Tugas akan diupdate untuk kelas-kelas yang dipilih

### Testing

Test berhasil untuk:
- ✓ Load form dengan selected classes ter-centang
- ✓ Update classes (add, remove, change)
- ✓ Validation untuk empty classes
- ✓ Transaction rollback jika error
- ✓ Flash message sesuai jumlah kelas

### Files Modified

1. **src/routes/teacher.js**
   - GET /assignments/:id/edit - Load selected classes
   - POST /assignments/:id/update - Update dengan transaction

2. **src/views/teacher/assignment_edit.ejs**
   - Replace dropdown dengan checkbox list
   - Add JavaScript untuk toggle & validation
   - Pre-select classes yang sudah dipilih

### Status
✅ SELESAI - Create dan Edit tugas sudah support multiple classes

## Fix: Ranking Tugas di Laporan LMS

### Status: ✅ SELESAI

Setelah implementasi multiple classes, ranking kelas di laporan LMS sudah diperbaiki untuk menghitung tugas dengan benar.

### Masalah yang Diperbaiki

#### Sebelum Fix
- Query menghitung SEMUA submission siswa, tanpa peduli tugas ditujukan untuk kelas mana
- Siswa X TKJ 2 mengerjakan tugas XI KULINER 3 → Dihitung sebagai aktivitas X TKJ 2 (SALAH)
- Ranking tidak akurat

#### Setelah Fix
- Query hanya menghitung submission untuk tugas yang ditujukan ke kelas tersebut
- Menggunakan subquery dengan `assignment_classes` junction table
- Ranking akurat sesuai aktivitas kelas yang sebenarnya

### Perubahan Query

#### Admin & Principal Reports
```sql
-- BEFORE
LEFT JOIN assignment_submissions asub ON asub.student_id = u.id 
  AND asub.created_at BETWEEN :startDate AND :endDate

-- AFTER  
LEFT JOIN (
  SELECT asub.*, ac.class_id as target_class_id
  FROM assignment_submissions asub
  INNER JOIN assignment_classes ac ON ac.assignment_id = asub.assignment_id
  WHERE asub.created_at BETWEEN :startDate AND :endDate
) asub_filtered ON asub_filtered.student_id = u.id 
  AND asub_filtered.target_class_id = c.id
```

### Files Modified

1. **src/routes/admin.js** - Update query activeClasses
2. **src/routes/principal.js** - Update query activeClasses

### Testing

Test berhasil menunjukkan:
- ✅ Query berjalan tanpa error
- ✅ Hanya submission yang relevan yang dihitung
- ✅ X TKJ 2 tidak dapat poin dari tugas XI KULINER 3
- ✅ Ranking kelas akurat

### Status
✅ SELESAI - Ranking tugas di laporan LMS sekarang akurat dengan sistem multiple classes