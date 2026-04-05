# Fitur Pagination untuk Material Views

## Deskripsi
Menambahkan pagination untuk kedua tabel di halaman "Rekap Siswa Lihat Materi" - baik untuk siswa yang sudah melihat materi maupun siswa yang belum melihat materi, dengan 10 data per halaman.

## Implementasi Backend

### Route: `/teacher/material-views`
**File**: `src/routes/teacher.js`

#### Parameter Pagination Baru:
- `not_viewed_page`: Halaman untuk data siswa belum lihat (default: 1)
- `notViewedLimit`: Fixed 10 data per halaman untuk siswa belum lihat
- `notViewedOffset`: Offset untuk query pagination siswa belum lihat

#### Query Database yang Diupdate:

1. **Count Total Siswa Belum Lihat**:
   ```sql
   SELECT COUNT(*) AS notViewedCount
   FROM users u
   LEFT JOIN classes c ON c.id=u.class_id
   WHERE [conditions]
     AND NOT EXISTS (
       SELECT 1 FROM material_reads mv
       WHERE mv.student_id=u.id AND mv.material_id=:material_id
     );
   ```

2. **Get Paginated Siswa Belum Lihat**:
   ```sql
   SELECT u.id, u.full_name AS student_name, u.username,
          c.name AS class_name, [material_title]
   FROM users u
   LEFT JOIN classes c ON c.id=u.class_id
   WHERE [conditions]
     AND NOT EXISTS (...)
   ORDER BY u.full_name ASC
   LIMIT :limit OFFSET :offset;
   ```

#### Data yang Dikirim ke View:
```javascript
{
  // Data existing
  rows, materials, classes, filters,
  pagination: {
    page, limit, total, totalPages
  },
  
  // Data pagination baru
  notViewedStudents,
  notViewedCount: notViewedTotal, // Total count
  notViewedPagination: {
    page: notViewedPage,
    limit: notViewedLimit,
    total: notViewedTotal,
    totalPages: Math.ceil(notViewedTotal / notViewedLimit)
  }
}
```

## Implementasi Frontend

### File: `src/views/teacher/material_views.ejs`

#### 1. Update Stats Cards
- Menggunakan `pagination.total` untuk "Sudah Lihat"
- Menggunakan `notViewedPagination.total` untuk "Belum Lihat"

#### 2. Tabel Siswa Belum Lihat dengan Pagination
- **Header**: Menampilkan total dari `notViewedPagination.total`
- **Numbering**: Menggunakan `(notViewedPagination.page - 1) * notViewedPagination.limit + idx + 1`
- **Conditional Display**: Tampil jika `notViewedStudents.length > 0 || notViewedPagination.total > 0`

#### 3. Pagination Controls
```html
<!-- Pagination for Not Viewed Students -->
<% if (notViewedPagination.totalPages > 1) { %>
  <div class="mt-6 flex items-center justify-between">
    <div class="text-sm text-rose-700">
      Halaman <%= notViewedPagination.page %> dari <%= notViewedPagination.totalPages %> 
      (Total: <%= notViewedPagination.total %> siswa belum lihat)
    </div>
    <div class="flex gap-2">
      <!-- Previous, Page Numbers, Next buttons -->
    </div>
  </div>
<% } %>
```

#### 4. URL Parameters untuk Pagination
Setiap link pagination menyertakan semua parameter filter:
- `page`: Halaman untuk tabel "sudah lihat"
- `limit`: Limit untuk tabel "sudah lihat"
- `not_viewed_page`: Halaman untuk tabel "belum lihat"
- `material_id`, `class_id`, `q`: Filter parameters

## Fitur Pagination

### Tabel "Siswa Sudah Lihat"
- ✅ Pagination sudah ada sebelumnya
- ✅ 10 data per halaman (configurable via dropdown)
- ✅ Parameter: `page`, `limit`

### Tabel "Siswa Belum Lihat" (BARU)
- ✅ Pagination baru ditambahkan
- ✅ Fixed 10 data per halaman
- ✅ Parameter: `not_viewed_page`
- ✅ Independent dari pagination tabel pertama

## Styling dan UX

### Pagination Controls
- **Warna**: Rose/Red theme untuk konsistensi dengan tabel "belum lihat"
- **Buttons**: Previous, numbered pages, Next
- **Active State**: Gradient background untuk halaman aktif
- **Hover Effects**: Smooth transitions

### Responsive Design
- Pagination controls responsive di mobile
- Tabel dengan horizontal scroll jika diperlukan
- Numbering tetap akurat di semua ukuran layar

## Benefits

1. **Performance**: Tidak load semua data sekaligus, hanya 10 per halaman
2. **User Experience**: Navigasi yang mudah untuk data besar
3. **Consistency**: Kedua tabel memiliki pagination yang konsisten
4. **Independent**: Pagination kedua tabel tidak saling mempengaruhi
5. **Filter Integration**: Pagination bekerja dengan semua filter yang ada

## Testing Scenarios

### Functional Testing
- [x] Pagination tabel "sudah lihat" tetap berfungsi
- [x] Pagination tabel "belum lihat" berfungsi independent
- [x] Filter tetap bekerja dengan pagination
- [x] Numbering akurat di semua halaman
- [x] Stats cards menampilkan total yang benar

### Edge Cases
- [x] Tidak ada data belum lihat (pagination tidak tampil)
- [x] Hanya 1 halaman data (pagination tidak tampil)
- [x] Filter menghasilkan 0 data
- [x] Navigasi antar halaman mempertahankan filter

## File yang Dimodifikasi

1. **Backend**: `src/routes/teacher.js`
   - Update route `/material-views`
   - Tambah pagination logic untuk siswa belum lihat
   - Tambah count query untuk total data

2. **Frontend**: `src/views/teacher/material_views.ejs`
   - Update stats cards
   - Tambah pagination controls untuk tabel belum lihat
   - Update conditional display logic

## Status
✅ **SELESAI** - Pagination berhasil ditambahkan untuk kedua tabel dengan 10 data per halaman, independent pagination controls, dan integrasi dengan filter yang ada.