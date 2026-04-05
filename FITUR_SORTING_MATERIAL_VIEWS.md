# Fitur Sorting Material Views - COMPLETED ✅

## Overview
Implementasi lengkap fitur sorting untuk kedua tabel di halaman Material Views (`/teacher/material-views`). Guru dapat mengurutkan data dengan mengklik header kolom pada kedua tabel.

## Fitur yang Diimplementasikan

### 1. Sorting untuk Tabel "Sudah Lihat"
**Kolom yang dapat diurutkan:**
- **Nama Siswa** (`student_name`) - berdasarkan `u.full_name`
- **Username** (`username`) - berdasarkan `u.username`
- **Kelas** (`class_name`) - berdasarkan `c.name`
- **Materi** (`material_title`) - berdasarkan `m.title`
- **Dibuka** (`opened_at`) - berdasarkan `mv.first_opened_at`
- **Selesai** (`completed_at`) - berdasarkan `mv.completed_at`

### 2. Sorting untuk Tabel "Belum Lihat"
**Kolom yang dapat diurutkan:**
- **Nama Siswa** (`student_name`) - berdasarkan `u.full_name`
- **Username** (`username`) - berdasarkan `u.username`
- **Kelas** (`class_name`) - berdasarkan `c.name`
- **Materi** (`material_title`) - berdasarkan literal string

### 3. UI/UX Features
- **Clickable Headers**: Semua header kolom dapat diklik untuk sorting
- **Visual Indicators**: Ikon panah menunjukkan arah sorting (naik/turun)
- **Toggle Sorting**: Klik ulang untuk membalik urutan (asc ↔ desc)
- **Independent Sorting**: Kedua tabel memiliki sorting terpisah
- **Hover Effects**: Smooth transition saat hover pada header

## Technical Implementation

### Backend (src/routes/teacher.js)

#### Query Parameters
```javascript
// Sorting parameters untuk tabel "sudah lihat"
const sortBy = req.query.sort_by || 'completed_at';
const sortOrder = req.query.sort_order || 'desc';

// Sorting parameters untuk tabel "belum lihat"
const notViewedSortBy = req.query.not_viewed_sort_by || 'student_name';
const notViewedSortOrder = req.query.not_viewed_sort_order || 'asc';
```

#### Validation & Mapping
```javascript
// Valid sort columns untuk tabel "sudah lihat"
const validSortColumns = {
  'student_name': 'u.full_name',
  'username': 'u.username',
  'class_name': 'c.name',
  'material_title': 'm.title',
  'opened_at': 'mv.first_opened_at',
  'completed_at': 'mv.completed_at'
};

// Valid sort columns untuk tabel "belum lihat"
const validNotViewedSortColumns = {
  'student_name': 'u.full_name',
  'username': 'u.username',
  'class_name': 'c.name',
  'material_title': 'material_title'
};
```

#### Dynamic ORDER BY
```sql
-- Untuk tabel "sudah lihat"
ORDER BY ${sortColumn} ${sortDirection}

-- Untuk tabel "belum lihat"
ORDER BY ${notViewedSortColumn} ${notViewedSortDirection}
```

### Frontend (src/views/teacher/material_views.ejs)

#### Clickable Headers dengan Icons
```html
<th class="px-4 py-3 text-left text-sm font-semibold text-teal-900">
  <a href="?page=<%= pagination.page %>&limit=<%= pagination.limit %>&material_id=<%= filters.material_id %>&class_id=<%= filters.class_id %>&q=<%= filters.q %>&not_viewed_page=<%= notViewedPagination.page %>&sort_by=student_name&sort_order=<%= (sorting.sortBy === 'student_name' && sorting.sortOrder === 'asc') ? 'desc' : 'asc' %>&not_viewed_sort_by=<%= sorting.notViewedSortBy %>&not_viewed_sort_order=<%= sorting.notViewedSortOrder %>" 
     class="flex items-center gap-1 hover:text-teal-700 transition-colors">
    Nama Siswa
    <% if (sorting.sortBy === 'student_name') { %>
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <% if (sorting.sortOrder === 'asc') { %>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
        <% } else { %>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        <% } %>
      </svg>
    <% } else { %>
      <svg class="w-4 h-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
      </svg>
    <% } %>
  </a>
</th>
```

#### Updated Pagination Links
Semua pagination links sekarang menyertakan parameter sorting:
```html
<a href="?page=<%= pagination.page %>&limit=<%= pagination.limit %>&material_id=<%= filters.material_id %>&class_id=<%= filters.class_id %>&q=<%= filters.q %>&not_viewed_page=<%= notViewedPagination.page + 1 %>&sort_by=<%= sorting.sortBy %>&sort_order=<%= sorting.sortOrder %>&not_viewed_sort_by=<%= sorting.notViewedSortBy %>&not_viewed_sort_order=<%= sorting.notViewedSortOrder %>">
```

## URL Parameters

### Complete Parameter List
- `page` - Halaman untuk tabel "sudah lihat"
- `limit` - Jumlah data per halaman untuk tabel "sudah lihat"
- `not_viewed_page` - Halaman untuk tabel "belum lihat"
- `material_id` - Filter berdasarkan materi
- `class_id` - Filter berdasarkan kelas
- `q` - Search query untuk nama/username siswa
- `sort_by` - Kolom sorting untuk tabel "sudah lihat"
- `sort_order` - Arah sorting untuk tabel "sudah lihat" (asc/desc)
- `not_viewed_sort_by` - Kolom sorting untuk tabel "belum lihat"
- `not_viewed_sort_order` - Arah sorting untuk tabel "belum lihat" (asc/desc)

### Example URLs
```
# Sort tabel "sudah lihat" berdasarkan nama siswa ascending
/teacher/material-views?sort_by=student_name&sort_order=asc

# Sort tabel "belum lihat" berdasarkan kelas descending
/teacher/material-views?not_viewed_sort_by=class_name&not_viewed_sort_order=desc

# Kombinasi filter + sorting + pagination
/teacher/material-views?material_id=5&class_id=2&page=2&sort_by=completed_at&sort_order=desc&not_viewed_page=1&not_viewed_sort_by=student_name&not_viewed_sort_order=asc
```

## Default Sorting Behavior

### Tabel "Sudah Lihat"
- **Default Column**: `completed_at` (waktu selesai)
- **Default Order**: `desc` (terbaru dulu)
- **Rationale**: Menampilkan siswa yang baru saja menyelesaikan materi di atas

### Tabel "Belum Lihat"
- **Default Column**: `student_name` (nama siswa)
- **Default Order**: `asc` (A-Z)
- **Rationale**: Memudahkan guru mencari siswa berdasarkan nama

## Testing Results

✅ **All sorting queries tested successfully**
- Tested 7 different sort combinations for "viewed" table
- Tested 3 different sort combinations for "not viewed" table
- Tested with material-specific filters
- All queries execute without errors
- Proper fallback to default columns when invalid sort parameters provided

## Files Modified

1. **src/routes/teacher.js** (lines ~2129-2350)
   - Added sorting parameter parsing
   - Added validation for sort columns
   - Updated SQL queries with dynamic ORDER BY
   - Added sorting data to render context

2. **src/views/teacher/material_views.ejs** (lines ~100-460)
   - Added clickable headers with sort icons
   - Updated all pagination links to preserve sorting parameters
   - Added visual indicators for current sort state

3. **test-material-views-sorting.js** (new file)
   - Comprehensive test suite for sorting functionality

## User Experience

### Before
- Static tables with no sorting capability
- Data displayed in database insertion order
- Difficult to find specific students or analyze patterns

### After
- **Interactive Headers**: Click any column header to sort
- **Visual Feedback**: Clear icons showing sort direction
- **Persistent State**: Sorting preserved across pagination
- **Independent Control**: Each table can be sorted separately
- **Smooth UX**: Hover effects and transitions

## Performance Considerations

- **Indexed Columns**: Sorting uses indexed columns where possible
- **Efficient Queries**: No additional JOINs added for sorting
- **Pagination Preserved**: Sorting works seamlessly with existing pagination
- **Parameter Validation**: Invalid sort parameters fallback to safe defaults

## Future Enhancements

1. **Multi-column Sorting**: Sort by multiple columns simultaneously
2. **Sort Persistence**: Remember user's preferred sorting in session/localStorage
3. **Export with Sorting**: Apply current sort order to Excel exports
4. **Advanced Filters**: Combine sorting with date range filters

---

**Status**: ✅ COMPLETED
**Date**: March 11, 2026
**Task**: Implementasi fitur sorting untuk Material Views
**Result**: Fully functional sorting for both tables with comprehensive UI/UX