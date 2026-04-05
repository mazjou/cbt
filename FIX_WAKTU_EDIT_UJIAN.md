# Fix: Waktu Hilang di Halaman Edit Ujian

## 🐛 Masalah

Di halaman edit ujian guru (`/teacher/exams/:id/edit`), field waktu mulai dan waktu selesai tidak menampilkan nilai yang sudah ada (kosong/hilang).

## 🔍 Penyebab

1. **Nama field tidak konsisten**: Form menggunakan `start_time` dan `end_time`, tapi database menggunakan `start_at` dan `end_at`
2. **Data NULL di database**: Beberapa ujian lama dibuat tanpa waktu (start_at dan end_at adalah NULL)
3. Input `datetime-local` tidak memiliki atribut `required`
4. Timezone offset tidak diperhitungkan saat konversi waktu

## ✅ Solusi

### 1. Perbaiki Nama Field di Form

Ubah nama field dari `start_time`/`end_time` menjadi `start_at`/`end_at` agar sesuai dengan database:

**File: `src/views/teacher/exam_edit.ejs`**

```html
<!-- SEBELUM -->
<input type="datetime-local" name="start_time" ... />
<input type="datetime-local" name="end_time" ... />

<!-- SESUDAH -->
<input type="datetime-local" name="start_at" ... />
<input type="datetime-local" name="end_at" ... />
```

### 2. Perbaiki Route PUT

Ubah nama variabel yang diterima dari form:

**File: `src/routes/teacher.js`**

```javascript
// SEBELUM
const { start_time, end_time, ... } = req.body;
start_at: start_time || null,
end_at: end_time || null,

// SESUDAH
const { start_at, end_at, ... } = req.body;
start_at: start_at || null,
end_at: end_at || null,
```

### 3. Tambah Atribut Required

```html
<input type="datetime-local" name="start_at" required ... />
<input type="datetime-local" name="end_at" required ... />
```

### 4. Perbaiki Format Waktu dengan Timezone Offset

```javascript
new Date(new Date(exam.start_at).getTime() - new Date(exam.start_at).getTimezoneOffset() * 60000).toISOString().slice(0,16)
```

## 📝 Perubahan File

### 1. File: `src/views/teacher/exam_edit.ejs`

```html
<input 
  type="datetime-local" 
  name="start_at" 
  id="start_at"
  value="<%= exam.start_at ? new Date(new Date(exam.start_at).getTime() - new Date(exam.start_at).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '' %>" 
  required
  class="..." 
/>

<input 
  type="datetime-local" 
  name="end_at" 
  id="end_at"
  value="<%= exam.end_at ? new Date(new Date(exam.end_at).getTime() - new Date(exam.end_at).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '' %>" 
  required
  class="..." 
/>
```

### 2. File: `src/routes/teacher.js`

```javascript
router.put('/exams/:id', async (req, res) => {
  const {
    start_at,  // Ubah dari start_time
    end_at,    // Ubah dari end_time
    ...
  } = req.body;

  await pool.query(
    `UPDATE exams SET
      start_at=:start_at,
      end_at=:end_at,
      ...
     WHERE id=:id;`,
    {
      start_at: start_at || null,  // Ubah dari start_time
      end_at: end_at || null,      // Ubah dari end_time
      ...
    }
  );
});
```

## 🔧 Cek Data Ujian di Database

Gunakan script `check-exam-data.js` untuk cek data ujian:

```bash
node check-exam-data.js
```

Output akan menunjukkan apakah `start_at` dan `end_at` NULL atau tidak.

## 💡 Solusi untuk Ujian Lama yang Waktu NULL

### Opsi 1: Edit Manual via Web (RECOMMENDED)

1. Login sebagai guru
2. Buka halaman edit ujian
3. Isi waktu mulai dan waktu selesai
4. Klik "Simpan Perubahan"

### Opsi 2: Update Manual via Database

```sql
-- Update ujian ID 2
UPDATE exams SET
  start_at = '2024-03-10 08:00:00',
  end_at = '2024-03-10 10:00:00'
WHERE id = 2;

-- Update semua ujian yang waktu NULL
UPDATE exams SET
  start_at = DATE_ADD(created_at, INTERVAL 1 DAY),
  end_at = DATE_ADD(created_at, INTERVAL 1 DAY 2 HOUR)
WHERE start_at IS NULL OR end_at IS NULL;
```

## 🧪 Testing

### 1. Test Edit Ujian yang Sudah Ada Waktu

1. Login sebagai guru
2. Buka halaman daftar ujian: `/teacher/exams`
3. Klik "Edit" pada ujian yang sudah ada waktu
4. Periksa field "Mulai" dan "Selesai" - seharusnya menampilkan waktu
5. Ubah waktu jika perlu
6. Klik "Simpan Perubahan"
7. Verifikasi waktu tersimpan dengan benar

### 2. Test Edit Ujian yang Waktu NULL

1. Buka halaman edit ujian yang waktu NULL
2. Field "Mulai" dan "Selesai" akan kosong
3. Isi waktu mulai dan waktu selesai
4. Klik "Simpan Perubahan"
5. Edit lagi - seharusnya waktu sudah muncul

### 3. Test Validasi Required

1. Buka halaman edit ujian
2. Hapus waktu mulai atau waktu selesai
3. Klik "Simpan Perubahan"
4. Seharusnya muncul pesan error "Please fill out this field"

## 📊 Hasil

✅ Nama field konsisten antara form dan database (`start_at`, `end_at`)
✅ Waktu muncul dengan benar jika data tidak NULL
✅ Waktu sesuai dengan timezone lokal (WIB)
✅ Validasi required berfungsi
✅ Waktu tersimpan dengan benar setelah edit

## 🔧 Troubleshooting

### Waktu Masih Tidak Muncul Setelah Fix

**Kemungkinan 1: Data di database NULL**

Cek dengan script:
```bash
node check-exam-data.js
```

Jika NULL, edit ujian dan isi waktu yang benar.

**Kemungkinan 2: Cache browser**

Tekan `Ctrl+Shift+R` untuk hard refresh.

**Kemungkinan 3: Aplikasi belum restart**

```bash
# Di VPS
pm2 restart lms-smkn1kras

# Di local
# Stop (Ctrl+C) lalu jalankan lagi: npm start
```

### Waktu Bergeser Beberapa Jam

Pastikan timezone server sudah diset ke Asia/Jakarta. Cek file `.env`:
```
TZ=Asia/Jakarta
```

## 📚 Referensi

- [MDN: input type="datetime-local"](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local)
- [MySQL DATETIME](https://dev.mysql.com/doc/refman/8.0/en/datetime.html)

## ✅ Checklist

- [x] Ubah nama field di form: `start_time` → `start_at`, `end_time` → `end_at`
- [x] Ubah nama variabel di route PUT
- [x] Tambah atribut `required` pada input waktu
- [x] Perbaiki format waktu dengan timezone offset
- [x] Buat script untuk cek data ujian
- [x] Test edit ujian yang sudah ada waktu
- [x] Test edit ujian yang waktu NULL
- [x] Test validasi required
- [x] Dokumentasi lengkap

---

**Status:** ✅ Fixed
**Tanggal:** 2024
**File Diubah:** 
- `src/views/teacher/exam_edit.ejs`
- `src/routes/teacher.js`
- `check-exam-data.js` (script helper)
