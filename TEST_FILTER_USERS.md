# Test Plan: Filter Daftar Pengguna

## Persiapan Testing

### 1. Pastikan Server Running
```bash
npm run dev
```

### 2. Login sebagai Admin
- URL: http://localhost:3000/login
- Username: admin
- Password: (password admin Anda)

### 3. Buka Halaman Users
- URL: http://localhost:3000/admin/users

## Test Cases

### ✅ Test 1: Filter by Search (Username/Nama)

**Steps:**
1. Di field "Cari username/nama...", ketik: "ahmad"
2. Klik tombol "Filter"

**Expected Result:**
- ✅ Hanya pengguna dengan username atau nama yang mengandung "ahmad" yang ditampilkan
- ✅ Field search tetap berisi "ahmad"
- ✅ Total pengguna di header berubah sesuai hasil filter
- ✅ URL berubah menjadi: `/admin/users?page=1&limit=10&search=ahmad&role=&class=&status=`

---

### ✅ Test 2: Filter by Role

**Steps:**
1. Reset filter (klik "Reset")
2. Di dropdown "Role", pilih: "STUDENT"
3. Klik tombol "Filter"

**Expected Result:**
- ✅ Hanya siswa (role=STUDENT) yang ditampilkan
- ✅ Dropdown Role tetap menunjukkan "STUDENT" selected
- ✅ Total pengguna berubah
- ✅ URL: `/admin/users?page=1&limit=10&search=&role=STUDENT&class=&status=`

**Repeat untuk:**
- Role: TEACHER
- Role: PRINCIPAL
- Role: ADMIN

---

### ✅ Test 3: Filter by Kelas

**Steps:**
1. Reset filter
2. Di dropdown "Kelas", pilih salah satu kelas (contoh: "X TKI 1")
3. Klik tombol "Filter"

**Expected Result:**
- ✅ Hanya siswa dari kelas tersebut yang ditampilkan
- ✅ Dropdown Kelas tetap menunjukkan kelas yang dipilih
- ✅ Kolom "Kelas" di tabel menunjukkan nama kelas yang sama
- ✅ URL: `/admin/users?page=1&limit=10&search=&role=&class=1&status=`

**Note:** Jika tidak ada siswa di kelas tersebut, akan muncul "Tidak ada data pengguna."

---

### ✅ Test 4: Filter by Status

**Steps:**
1. Reset filter
2. Di dropdown "Status", pilih: "Aktif"
3. Klik tombol "Filter"

**Expected Result:**
- ✅ Hanya pengguna aktif yang ditampilkan
- ✅ Kolom "Status" di tabel semua menunjukkan "Aktif"
- ✅ Dropdown Status tetap menunjukkan "Aktif" selected
- ✅ URL: `/admin/users?page=1&limit=10&search=&role=&class=&status=active`

**Repeat untuk:**
- Status: Nonaktif

---

### ✅ Test 5: Filter Kombinasi (Multiple Filters)

**Steps:**
1. Reset filter
2. Isi field search: "a"
3. Pilih Role: "STUDENT"
4. Pilih Kelas: "X TKI 1"
5. Pilih Status: "Aktif"
6. Klik tombol "Filter"

**Expected Result:**
- ✅ Hanya siswa aktif dari kelas X TKI 1 dengan nama/username mengandung "a" yang ditampilkan
- ✅ Semua filter tetap selected/terisi
- ✅ URL: `/admin/users?page=1&limit=10&search=a&role=STUDENT&class=1&status=active`

---

### ✅ Test 6: Change Limit (Items per Page)

**Steps:**
1. Apply filter apapun
2. Di dropdown "per halaman", pilih: "20 per halaman"
3. Klik tombol "Filter"

**Expected Result:**
- ✅ Menampilkan 20 data per halaman (jika ada)
- ✅ Filter tetap aktif
- ✅ Dropdown limit menunjukkan "20 per halaman" selected
- ✅ URL: `/admin/users?page=1&limit=20&search=...&role=...&class=...&status=...`

---

### ✅ Test 7: Pagination dengan Filter Aktif

**Steps:**
1. Apply filter yang menghasilkan > 10 data
2. Klik halaman "2" di pagination

**Expected Result:**
- ✅ Pindah ke halaman 2
- ✅ Filter tetap aktif
- ✅ Dropdown dan field tetap menunjukkan filter yang dipilih
- ✅ URL: `/admin/users?page=2&limit=10&search=...&role=...&class=...&status=...`
- ✅ Tombol "← Sebelumnya" muncul
- ✅ Klik "← Sebelumnya" kembali ke halaman 1 dengan filter tetap aktif

---

### ✅ Test 8: Reset Filter

**Steps:**
1. Apply beberapa filter
2. Klik tombol "Reset"

**Expected Result:**
- ✅ Redirect ke `/admin/users` tanpa query parameters
- ✅ Semua data ditampilkan
- ✅ Semua dropdown kembali ke default ("Semua Role", "Semua Kelas", "Semua Status")
- ✅ Field search kosong
- ✅ Limit kembali ke 10

---

### ✅ Test 9: Filter dengan Hasil Kosong

**Steps:**
1. Isi search dengan text yang tidak ada: "xyzabc123"
2. Klik "Filter"

**Expected Result:**
- ✅ Tabel menampilkan: "Tidak ada data pengguna."
- ✅ Total: 0 pengguna
- ✅ Pagination tidak muncul
- ✅ Filter tetap terisi

---

### ✅ Test 10: Direct URL Access dengan Query Parameters

**Steps:**
1. Buka URL langsung: `http://localhost:3000/admin/users?role=STUDENT&class=1&status=active`

**Expected Result:**
- ✅ Filter langsung diterapkan
- ✅ Dropdown menunjukkan filter yang sesuai dengan URL
- ✅ Data terfilter dengan benar

---

## Edge Cases

### Test 11: Filter dengan Special Characters
**Steps:**
1. Search: "o'brien" atau "test@123"
2. Klik Filter

**Expected:**
- ✅ Tidak error
- ✅ Search berfungsi dengan benar

### Test 12: Filter dengan Whitespace
**Steps:**
1. Search: "  ahmad  " (dengan spasi di awal/akhir)
2. Klik Filter

**Expected:**
- ✅ Whitespace di-trim
- ✅ Search berfungsi normal

### Test 13: Filter Kelas untuk Non-Student
**Steps:**
1. Pilih Role: "TEACHER"
2. Pilih Kelas: "X TKI 1"
3. Klik Filter

**Expected:**
- ✅ Tidak ada data (karena guru tidak punya kelas)
- ✅ Atau hanya guru yang kebetulan punya class_id tersebut

---

## Browser Compatibility

Test di browser:
- ✅ Chrome
- ✅ Firefox
- ✅ Edge
- ✅ Safari (jika ada)

---

## Performance Test

### Test dengan Data Banyak
1. Pastikan ada > 100 pengguna di database
2. Apply filter yang menghasilkan banyak data
3. Test pagination

**Expected:**
- ✅ Response time < 1 detik
- ✅ Pagination smooth
- ✅ No lag saat klik filter

---

## Checklist Summary

Setelah semua test, pastikan:
- [ ] Filter search berfungsi
- [ ] Filter role berfungsi
- [ ] Filter kelas berfungsi
- [ ] Filter status berfungsi
- [ ] Kombinasi filter berfungsi
- [ ] Pagination mempertahankan filter
- [ ] Reset filter berfungsi
- [ ] Dropdown menunjukkan selected value dengan benar
- [ ] URL query parameters benar
- [ ] Total count akurat
- [ ] Tidak ada error di console browser
- [ ] Tidak ada error di console server

---

## Troubleshooting

### Jika Filter Tidak Berfungsi:

1. **Check Console Browser (F12)**
   - Lihat apakah ada JavaScript error
   - Check Network tab untuk melihat request

2. **Check Server Log**
   - Lihat apakah ada error di terminal
   - Check query SQL yang dijalankan

3. **Check Database**
   ```sql
   -- Test query manual
   SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.class_id, c.name AS class_name
   FROM users u
   LEFT JOIN classes c ON c.id=u.class_id
   WHERE u.role = 'STUDENT' AND u.class_id = 1 AND u.is_active = 1
   ORDER BY u.id DESC
   LIMIT 10 OFFSET 0;
   ```

4. **Verify Fix Applied**
   - Check `src/routes/admin.js` line ~890-960
   - Check `src/views/admin/users.ejs` line ~76

5. **Clear Browser Cache**
   - Ctrl+Shift+R (hard refresh)
   - Clear cache and reload

---

## Success Criteria

✅ **PASS** jika:
- Semua 13 test cases berhasil
- Tidak ada error di console
- Filter berfungsi untuk semua kombinasi
- Pagination mempertahankan filter
- UI responsive dan user-friendly

❌ **FAIL** jika:
- Ada test case yang gagal
- Ada error di console
- Filter tidak mempertahankan state
- Pagination reset filter

---

## Report Template

```
Test Date: [DATE]
Tester: [NAME]
Browser: [BROWSER VERSION]
Server: [RUNNING/NOT RUNNING]

Results:
- Test 1: [PASS/FAIL]
- Test 2: [PASS/FAIL]
- Test 3: [PASS/FAIL]
...

Issues Found:
1. [DESCRIPTION]
2. [DESCRIPTION]

Overall Status: [PASS/FAIL]
```
