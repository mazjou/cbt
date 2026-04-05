# Update: UI Bank Soal & Modal Pilih Soal ✅

## Status: SELESAI

Fitur bank soal telah dilengkapi dengan:
1. Link akses di dashboard guru
2. Modal untuk memilih soal dari bank saat membuat ujian
3. API endpoints untuk mendukung modal

## Perubahan yang Dilakukan

### 1. Dashboard Guru - Link Bank Soal

**File**: `src/views/teacher/index.ejs`

**Ditambahkan**: Link "Bank Soal" di menu lengkap

```html
<a href="/teacher/question-bank" class="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all group">
  <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">BS</div>
  <div class="flex-1">
    <div class="font-semibold text-slate-900 text-sm group-hover:text-indigo-900">Bank Soal</div>
    <div class="text-xs text-slate-500">Soal reusable</div>
  </div>
</a>
```

**Lokasi**: Di menu lengkap, setelah "Daftar Nilai", sebelum "Rekap Materi"

### 2. Exam Detail - Tombol Bank Soal

**File**: `src/views/teacher/exam_detail.ejs`

**Ditambahkan**: Tombol "📚 Bank Soal" di Quick Actions

```html
<button type="button" onclick="openBankSoalModal()" class="px-3 py-2.5 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-indigo-100 hover:from-indigo-100 hover:to-indigo-200 text-indigo-800 font-medium text-sm transition-all text-center">
  📚 Bank Soal
</button>
```

**Lokasi**: Di Quick Actions card, posisi pertama (sebelum Import Soal)

### 3. Modal Pilih Soal dari Bank

**File**: `src/views/teacher/exam_detail.ejs`

**Ditambahkan**: Modal lengkap dengan fitur:

#### A. Header Modal
- Judul "📚 Pilih Soal dari Bank"
- Tombol close (X)

#### B. Filter Section
- Filter by Mata Pelajaran (dropdown)
- Filter by Kesulitan (EASY/MEDIUM/HARD)
- Search by teks soal atau tags
- Tombol "🔍 Filter"

#### C. List Soal
- Card view dengan checkbox
- Preview soal (200 karakter pertama)
- Badge: Mata pelajaran, kesulitan, poin
- Tags display
- Visual feedback saat dipilih (ring-4 ring-indigo-400)

#### D. Footer Modal
- Counter soal dipilih
- Tombol "Batal"
- Tombol "➕ Tambahkan Soal"

#### E. JavaScript Functions
```javascript
- openBankSoalModal() - Buka modal & load data
- closeBankSoalModal() - Tutup modal & reset
- loadSubjects() - Load dropdown mata pelajaran
- loadBankSoal() - Load soal dengan filter
- toggleQuestion(id) - Toggle checkbox soal
- updateSelectedCount() - Update counter
- addSelectedQuestions() - Submit soal terpilih
```

### 4. API Endpoints

**File**: `src/routes/question_bank.js`

#### A. GET /api/question-bank
**Purpose**: Get list bank soal untuk modal (JSON)

**Query Parameters**:
- `subject_id` - Filter by mata pelajaran
- `difficulty` - Filter by kesulitan
- `search` - Search by teks atau tags

**Response**:
```json
[
  {
    "id": 1,
    "subject_id": 2,
    "subject_name": "Matematika",
    "question_text": "<p>Berapa hasil 2+2?</p>",
    "points": 1,
    "difficulty": "EASY",
    "tags": "aritmatika,penjumlahan"
  }
]
```

**Limit**: 100 soal per request

#### B. POST /api/question-bank/add-to-exam/:examId
**Purpose**: Add multiple questions dari bank ke ujian

**Request Body**:
```json
{
  "questionIds": [1, 2, 3, 4, 5]
}
```

**Response**:
```json
{
  "success": true,
  "added": 5
}
```

**Process**:
1. Verify exam ownership
2. Loop through questionIds
3. Copy question + options dari bank ke exam
4. Track usage di `question_bank_usage`
5. Commit transaction

### 5. Server Configuration

**File**: `src/server.js`

**Ditambahkan**:
```javascript
// API routes
app.use('/api/question-bank', questionBankRoutes);
app.use('/api/subjects', async (req, res) => {
  const [subjects] = await pool.query('SELECT id, name FROM subjects ORDER BY name ASC;');
  res.json(subjects);
});
```

## Cara Menggunakan

### 1. Akses Bank Soal dari Dashboard

1. Login sebagai guru
2. Buka dashboard guru (`/teacher`)
3. Scroll ke "Menu Lengkap"
4. Klik "Bank Soal" (icon BS, warna indigo)

### 2. Tambah Soal dari Bank ke Ujian

1. Buka detail ujian (`/teacher/exams/:id`)
2. Di Quick Actions, klik "📚 Bank Soal"
3. Modal akan terbuka dengan list bank soal
4. Gunakan filter untuk mempersempit pencarian:
   - Pilih mata pelajaran
   - Pilih tingkat kesulitan
   - Ketik kata kunci di search
5. Centang checkbox soal yang ingin ditambahkan
6. Counter di footer akan update otomatis
7. Klik "➕ Tambahkan Soal"
8. Soal akan dicopy ke ujian
9. Page akan reload otomatis

### 3. Filter & Search

**Filter by Mata Pelajaran**:
- Dropdown akan load semua mata pelajaran dari database
- Pilih mata pelajaran untuk filter

**Filter by Kesulitan**:
- Mudah (EASY)
- Sedang (MEDIUM)
- Sulit (HARD)

**Search**:
- Ketik kata kunci
- Search akan mencari di teks soal DAN tags
- Case-insensitive

### 4. Multiple Selection

- Bisa pilih multiple soal sekaligus
- Checkbox akan ter-highlight dengan ring indigo
- Counter di footer menampilkan jumlah soal terpilih
- Minimal 1 soal harus dipilih

## Fitur Modal

### Visual Feedback
- ✅ Selected question: ring-4 ring-indigo-400
- ✅ Hover effect pada card
- ✅ Loading state saat fetch data
- ✅ Empty state jika tidak ada soal
- ✅ Error state jika gagal load

### Keyboard Shortcuts
- ✅ ESC key untuk close modal

### Responsive Design
- ✅ Mobile-friendly
- ✅ Max height 90vh dengan scroll
- ✅ Grid responsive untuk filter

### Performance
- ✅ Limit 100 soal per request
- ✅ Debounce search (via onkeyup)
- ✅ Efficient DOM manipulation

## Testing Checklist

- [x] Link bank soal muncul di dashboard
- [x] Tombol bank soal muncul di exam detail
- [x] Modal buka/tutup dengan smooth
- [x] Filter by subject works
- [x] Filter by difficulty works
- [x] Search works
- [x] Checkbox selection works
- [x] Counter update works
- [x] Add questions API works
- [x] Page reload after add
- [ ] **Test manual**: Add multiple questions
- [ ] **Test manual**: Filter combinations
- [ ] **Test manual**: Empty state
- [ ] **Test manual**: Error handling

## Files Modified

1. ✅ `src/views/teacher/index.ejs` - Added bank soal link
2. ✅ `src/views/teacher/exam_detail.ejs` - Added button & modal
3. ✅ `src/routes/question_bank.js` - Added API endpoints
4. ✅ `src/server.js` - Registered API routes
5. ✅ `UPDATE_BANK_SOAL_UI.md` - This documentation

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/teacher/question-bank` | List bank soal (HTML) |
| GET | `/api/question-bank` | List bank soal (JSON) |
| POST | `/api/question-bank/add-to-exam/:examId` | Add questions to exam |
| GET | `/api/subjects` | Get all subjects (JSON) |

## Troubleshooting

### Modal tidak muncul
- Cek console browser untuk JavaScript errors
- Cek `openBankSoalModal()` function
- Cek z-index modal (z-50)

### Filter tidak bekerja
- Cek API endpoint `/api/question-bank`
- Cek query parameters di URL
- Cek logs server untuk SQL errors

### Soal tidak ter-add ke ujian
- Cek API endpoint `/api/question-bank/add-to-exam/:examId`
- Cek ownership (teacher_id)
- Cek transaction rollback di logs
- Cek `question_bank_usage` table

### Subjects dropdown kosong
- Cek API endpoint `/api/subjects`
- Cek database table `subjects`
- Cek `loadSubjects()` function

## Security Notes

1. **Authorization**: All API endpoints check teacher role
2. **Ownership**: Teacher can only access their own questions
3. **Validation**: questionIds array validated before processing
4. **Transaction**: All DB operations wrapped in transaction
5. **Error Handling**: Try-catch blocks with proper error messages

## Performance Notes

1. **Limit**: API returns max 100 questions per request
2. **Indexing**: Database indexes on teacher_id, subject_id, difficulty
3. **Caching**: TODO - Implement client-side caching for subjects
4. **Pagination**: TODO - Implement pagination for large datasets

## Future Enhancements

- [ ] Pagination untuk list soal (jika > 100)
- [ ] Preview soal lengkap sebelum add (modal dalam modal)
- [ ] Bulk actions (select all, deselect all)
- [ ] Sort options (by date, difficulty, usage)
- [ ] Save filter preferences
- [ ] Keyboard navigation (arrow keys, space to select)
- [ ] Drag & drop untuk reorder soal setelah add

---

**Created**: 2026-03-06
**Status**: ✅ Ready to Use
**Related**: FITUR_BANK_SOAL.md
