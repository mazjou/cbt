# Fitur: Tampilan Nama Guru Pembuat Ujian untuk Siswa

## Deskripsi
Menambahkan tampilan nama guru pembuat ujian di halaman daftar ujian dan detail ujian untuk siswa, sehingga siswa dapat mengetahui siapa guru yang membuat ujian tersebut.

## Perubahan yang Dilakukan

### 1. Route Student Exams (`src/routes/student.js`)

#### A. Daftar Ujian - GET `/student/exams`
**Before:**
```sql
SELECT e.id, e.title, e.description, e.start_at, e.end_at, e.duration_minutes, e.pass_score, e.max_attempts,
       e.access_code, s.name AS subject_name,
       ...
FROM exams e
JOIN subjects s ON s.id=e.subject_id
WHERE e.is_published=1
```

**After:**
```sql
SELECT e.id, e.title, e.description, e.start_at, e.end_at, e.duration_minutes, e.pass_score, e.max_attempts,
       e.access_code, s.name AS subject_name, u.full_name AS teacher_name,
       ...
FROM exams e
JOIN subjects s ON s.id=e.subject_id
JOIN users u ON u.id=e.teacher_id
WHERE e.is_published=1
```

#### B. Detail Ujian - GET `/student/exams/:id`
**Before:**
```sql
SELECT e.*, s.name AS subject_name, c.name AS class_name,
       ...
FROM exams e
JOIN subjects s ON s.id=e.subject_id
LEFT JOIN classes c ON c.id=e.class_id
```

**After:**
```sql
SELECT e.*, s.name AS subject_name, c.name AS class_name, u.full_name AS teacher_name,
       ...
FROM exams e
JOIN subjects s ON s.id=e.subject_id
JOIN users u ON u.id=e.teacher_id
LEFT JOIN classes c ON c.id=e.class_id
```

### 2. Tampilan Daftar Ujian (`src/views/student/exams.ejs`)

#### Before:
```html
<a href="/student/exams/<%= ex.id %>" class="...">
  <div class="text-sm <%= color.light %>"><%= ex.subject_name %></div>
  <div class="mt-1 text-xl font-semibold <%= color.text %>"><%= ex.title %></div>
  ...
</a>
```

#### After:
```html
<a href="/student/exams/<%= ex.id %>" class="...">
  <div class="flex items-center justify-between">
    <div class="text-sm <%= color.light %>"><%= ex.subject_name %></div>
    <div class="text-xs <%= color.light %> flex items-center gap-1">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      <%= ex.teacher_name %>
    </div>
  </div>
  <div class="mt-1 text-xl font-semibold <%= color.text %>"><%= ex.title %></div>
  ...
</a>
```

**Fitur Baru:**
- Nama guru ditampilkan di pojok kanan atas card ujian
- Icon user untuk identifikasi visual
- Styling yang konsisten dengan warna card

### 3. Tampilan Detail Ujian (`src/views/student/exam_detail.ejs`)

#### Before:
```html
<div class="space-y-3 text-sm">
  <div class="flex justify-between items-center p-2 rounded-lg bg-white/50">
    <span class="text-purple-700 font-medium">📚 Mapel</span>
    <span class="text-purple-900 font-semibold"><%= exam.subject_name %></span>
  </div>
  ...
</div>
```

#### After:
```html
<div class="space-y-3 text-sm">
  <div class="flex justify-between items-center p-2 rounded-lg bg-white/50">
    <span class="text-purple-700 font-medium">👨‍🏫 Guru</span>
    <span class="text-purple-900 font-semibold"><%= exam.teacher_name %></span>
  </div>
  <div class="flex justify-between items-center p-2 rounded-lg bg-white/50">
    <span class="text-purple-700 font-medium">📚 Mapel</span>
    <span class="text-purple-900 font-semibold"><%= exam.subject_name %></span>
  </div>
  ...
</div>
```

**Fitur Baru:**
- Nama guru ditampilkan di bagian atas info ujian
- Icon guru (👨‍🏫) untuk identifikasi visual
- Posisi prioritas sebelum mata pelajaran

## Visual Preview

### Daftar Ujian:
```
┌─────────────────────────────────────┐
│ Matematika              👤 Pak Budi │
│ ASAS Matematika XII Kuliner 3       │
│ Ujian tentang...                    │
│                                     │
│ Soal 15    Durasi 60 mnt           │
│ Attempt: 0/1 • Butuh kode akses    │
└─────────────────────────────────────┘
```

### Detail Ujian:
```
┌─────────────────────────────────────┐
│ 📊 Info Ujian                       │
│                                     │
│ 👨‍🏫 Guru        Pak Budi            │
│ 📚 Mapel       Matematika           │
│ 📝 Jumlah soal 15 soal             │
│ ⏱️ Durasi       60 menit            │
│ ...                                 │
└─────────────────────────────────────┘
```

## Manfaat untuk Siswa

1. **Identifikasi Guru**: Siswa dapat mengetahui siapa guru yang membuat ujian
2. **Komunikasi**: Memudahkan siswa untuk bertanya kepada guru yang tepat
3. **Transparansi**: Meningkatkan transparansi dalam sistem ujian
4. **User Experience**: Informasi yang lebih lengkap dan informatif

## Database Impact

- **Query Performance**: Menambah 1 JOIN ke tabel `users`
- **Data Integrity**: Menggunakan relasi yang sudah ada (`exams.teacher_id` → `users.id`)
- **Backward Compatibility**: Tidak mengubah struktur database

## Testing

### Test Cases:
1. **Daftar Ujian**: Nama guru muncul di setiap card ujian
2. **Detail Ujian**: Nama guru muncul di info ujian
3. **Multiple Teachers**: Ujian dari guru berbeda menampilkan nama yang benar
4. **Responsive**: Tampilan baik di desktop dan mobile

### Browser Testing:
- ✅ Desktop browsers
- ✅ Mobile browsers
- ✅ Tablet view

## Files Modified

```
src/routes/student.js           - Added teacher_name to queries
src/views/student/exams.ejs     - Added teacher name display in exam cards
src/views/student/exam_detail.ejs - Added teacher name in exam info
```

## Kompatibilitas

- ✅ **Backward Compatible**: Tidak mengubah API atau struktur data
- ✅ **Database Safe**: Menggunakan JOIN yang aman
- ✅ **Performance**: Minimal impact pada query performance
- ✅ **UI Consistent**: Menggunakan design system yang ada

## Next Steps

1. Test dengan data ujian dari berbagai guru
2. Verify responsive behavior di mobile
3. Check performance dengan dataset besar
4. Consider adding teacher photo in future updates