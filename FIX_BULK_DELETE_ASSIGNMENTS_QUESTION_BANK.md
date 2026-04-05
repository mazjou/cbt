# Fix Bulk Delete Tugas dan Bank Soal

## Problem
Ketika admin mencoba bulk delete tugas atau bank soal:
1. Centang beberapa item
2. Klik tombol "Hapus Terpilih"
3. Muncul peringatan: "Tidak ada tugas yang dipilih" atau "Tidak ada soal yang dipilih"
4. Padahal sudah ada item yang dicentang

## Root Cause
Backend tidak menerima data IDs dengan benar karena:
1. Parsing array dari form data tidak robust
2. Tidak ada validasi untuk empty values
3. Tidak menggunakan transaction untuk delete cascade
4. Query menggunakan named parameters (`:id0`, `:id1`) yang tidak konsisten dengan pool.query

## Solution
Memperbaiki endpoint bulk delete untuk:
1. Handle multiple parameter names (`ids[]` dan `ids`)
2. Validasi dan filter empty values
3. Convert ke integer dan filter NaN
4. Gunakan transaction untuk data consistency
5. Gunakan placeholder `?` yang konsisten dengan mysql2

## Changes Made

### File: `src/routes/admin.js`

#### 1. Bulk Delete Assignments (baris ~2931)
```javascript
// Before
router.post('/assignments/bulk-delete', async (req, res) => {
  const ids = req.body['ids[]'] || [];
  const idsArray = Array.isArray(ids) ? ids : [ids];
  
  if (idsArray.length === 0) {
    req.flash('error', 'Tidak ada tugas yang dipilih.');
    return res.redirect('/admin/assignments');
  }
  
  try {
    const placeholders = idsArray.map((_, i) => `:id${i}`).join(',');
    const params = {};
    idsArray.forEach((id, i) => {
      params[`id${i}`] = id;
    });
    
    await pool.query(`DELETE FROM assignments WHERE id IN (${placeholders});`, params);
    req.flash('success', `${idsArray.length} tugas berhasil dihapus.`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus tugas.');
  }
  
  res.redirect('/admin/assignments');
});

// After
router.post('/assignments/bulk-delete', async (req, res) => {
  let ids = req.body['ids[]'] || req.body.ids || [];
  const idsArray = Array.isArray(ids) ? ids : (ids ? [ids] : []);
  const validIds = idsArray.filter(id => id && id.trim() !== '').map(id => parseInt(id)).filter(id => !isNaN(id));
  
  if (validIds.length === 0) {
    req.flash('error', 'Tidak ada tugas yang dipilih.');
    return res.redirect('/admin/assignments');
  }
  
  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    const placeholders = validIds.map(() => '?').join(',');
    
    // Delete related data first
    await conn.query(`DELETE FROM assignment_submissions WHERE assignment_id IN (${placeholders});`, validIds);
    
    // Delete assignments
    const [result] = await conn.query(`DELETE FROM assignments WHERE id IN (${placeholders});`, validIds);
    deleted = result.affectedRows || 0;
    
    await conn.commit();
    req.flash('success', `Berhasil menghapus ${deleted} tugas dan data terkait.`);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menghapus tugas. Terjadi kesalahan pada database.');
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/assignments');
});
```

#### 2. Bulk Delete Question Bank (baris ~3070)
```javascript
// Before
router.post('/question-bank/bulk-delete', async (req, res) => {
  const ids = req.body['ids[]'] || [];
  const idsArray = Array.isArray(ids) ? ids : [ids];
  
  if (idsArray.length === 0) {
    req.flash('error', 'Tidak ada soal yang dipilih.');
    return res.redirect('/admin/question-bank');
  }
  
  try {
    const placeholders = idsArray.map((_, i) => `:id${i}`).join(',');
    const params = {};
    idsArray.forEach((id, i) => {
      params[`id${i}`] = id;
    });
    
    await pool.query(`DELETE FROM question_bank WHERE id IN (${placeholders});`, params);
    req.flash('success', `${idsArray.length} soal berhasil dihapus.`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus soal.');
  }
  
  res.redirect('/admin/question-bank');
});

// After
router.post('/question-bank/bulk-delete', async (req, res) => {
  let ids = req.body['ids[]'] || req.body.ids || [];
  const idsArray = Array.isArray(ids) ? ids : (ids ? [ids] : []);
  const validIds = idsArray.filter(id => id && id.trim() !== '').map(id => parseInt(id)).filter(id => !isNaN(id));
  
  if (validIds.length === 0) {
    req.flash('error', 'Tidak ada soal yang dipilih.');
    return res.redirect('/admin/question-bank');
  }
  
  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    const placeholders = validIds.map(() => '?').join(',');
    
    const [result] = await conn.query(`DELETE FROM question_bank WHERE id IN (${placeholders});`, validIds);
    deleted = result.affectedRows || 0;
    
    await conn.commit();
    req.flash('success', `Berhasil menghapus ${deleted} soal dari bank soal.`);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menghapus soal. Terjadi kesalahan pada database.');
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/question-bank');
});
```

## Key Improvements

1. **Robust Array Handling**
   ```javascript
   let ids = req.body['ids[]'] || req.body.ids || [];
   const idsArray = Array.isArray(ids) ? ids : (ids ? [ids] : []);
   ```

2. **Data Validation**
   ```javascript
   const validIds = idsArray
     .filter(id => id && id.trim() !== '')  // Remove empty
     .map(id => parseInt(id))                // Convert to int
     .filter(id => !isNaN(id));              // Remove NaN
   ```

3. **Transaction Support**
   ```javascript
   const conn = await pool.getConnection();
   try {
     await conn.beginTransaction();
     // ... delete operations
     await conn.commit();
   } catch (e) {
     await conn.rollback();
   } finally {
     conn.release();
   }
   ```

4. **Proper Placeholder Syntax**
   ```javascript
   // Before: :id0, :id1, :id2 (named parameters - not supported by mysql2)
   // After: ?, ?, ? (positional parameters - correct for mysql2)
   const placeholders = validIds.map(() => '?').join(',');
   ```

## Testing
1. Bulk delete tugas → Berhasil
2. Bulk delete bank soal → Berhasil
3. Centang 1 item → Berhasil
4. Centang multiple items → Berhasil
5. Tidak centang apapun → Peringatan muncul dengan benar

## Related Files
- `src/routes/admin.js` - Backend endpoints
- `src/views/admin/assignments.ejs` - Frontend tugas
- `src/views/admin/question_bank.ejs` - Frontend bank soal
