# ✅ Lock Timeout Issue - FIXED!

## 🐛 Masalah yang Terjadi

Error: `Lock wait timeout exceeded; try restarting transaction`

**Penyebab:**
- Multiple transactions mencoba mengakses tabel `submission_backups` bersamaan
- Transaction pertama belum selesai, transaction kedua menunggu terlalu lama
- Tidak ada unique index, sehingga bisa terjadi duplicate backups
- Tidak ada retry mechanism

**Dampak:**
- Auto-submit gagal untuk beberapa attempts
- Submission gagal saat peak load
- Data backup duplicate

---

## ✅ Solusi yang Diterapkan

### **1. Retry Logic dengan Exponential Backoff**

**File:** `src/utils/submission-utils.js`

```javascript
async function retryOperation(operation, maxRetries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 'ER_LOCK_WAIT_TIMEOUT' && attempt < maxRetries) {
        console.log(`⏳ Lock timeout, retrying (${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw error;
    }
  }
}
```

**Benefit:**
- Otomatis retry 3x jika terjadi lock timeout
- Delay bertambah: 1s → 2s → 3s (exponential backoff)
- Mengurangi collision antar transactions

---

### **2. Proper Transaction Handling**

**Sebelum:**
```javascript
// createSubmissionBackup menggunakan pool.query (di luar transaction)
await createSubmissionBackup(attemptId, studentId, examId);
```

**Sesudah:**
```javascript
// createSubmissionBackup menggunakan connection yang sama (dalam transaction)
await createSubmissionBackup(attemptId, studentId, examId, connection);
```

**Benefit:**
- Semua query dalam 1 transaction
- Tidak ada race condition
- Lebih cepat (tidak perlu connection baru)

---

### **3. Unique Index pada attempt_id**

**SQL:**
```sql
ALTER TABLE submission_backups 
ADD UNIQUE INDEX idx_attempt_unique (attempt_id);
```

**Benefit:**
- Mencegah duplicate backups untuk attempt yang sama
- Query lebih cepat (indexed)
- Database enforced constraint

---

### **4. INSERT ... ON DUPLICATE KEY UPDATE**

**Sebelum:**
```sql
INSERT INTO submission_backups (attempt_id, student_id, exam_id, backup_data)
VALUES (?, ?, ?, ?)
```

**Sesudah:**
```sql
INSERT INTO submission_backups (attempt_id, student_id, exam_id, backup_data, status)
VALUES (?, ?, ?, ?, 'ACTIVE')
ON DUPLICATE KEY UPDATE 
  backup_data = VALUES(backup_data),
  created_at = CURRENT_TIMESTAMP,
  status = 'ACTIVE'
```

**Benefit:**
- Jika backup sudah ada, update saja (tidak error)
- Idempotent operation
- Aman untuk retry

---

### **5. Increased Lock Wait Timeout**

**Code:**
```javascript
// Set lock wait timeout to 10 seconds for this connection
await connection.query('SET SESSION innodb_lock_wait_timeout = 10');
```

**Benefit:**
- Lebih toleran terhadap lock wait
- Mengurangi timeout errors
- Masih cukup cepat untuk detect deadlock

---

## 📊 Hasil Setelah Fix

### **Sebelum:**
```
❌ Lock wait timeout exceeded
❌ Duplicate backups
❌ No retry mechanism
❌ Slow queries
```

### **Sesudah:**
```
✅ Auto-retry 3x on lock timeout
✅ No duplicate backups (unique index)
✅ Faster queries (indexed)
✅ Proper transaction handling
✅ Increased timeout tolerance
```

---

## 🚀 Cara Apply Fix

### **Step 1: Cleanup Duplicates**
```bash
node cleanup-duplicate-backups.js
```

### **Step 2: Apply Fixes**
```bash
node run-fix-lock-timeout.js
```

### **Step 3: Restart Server**
```bash
pm2 restart cbt-smk
# atau
npm start
```

### **Step 4: Verify**
```bash
pm2 logs cbt-smk

# Seharusnya tidak ada error:
# ❌ Lock wait timeout exceeded
```

---

## 🔍 Monitoring

### **Check for Lock Timeouts:**
```sql
-- Show current locks
SHOW ENGINE INNODB STATUS\G

-- Check lock wait timeout setting
SHOW VARIABLES LIKE 'innodb_lock_wait_timeout';

-- Check for failed submissions
SELECT COUNT(*) FROM attempts WHERE submission_status = 'FAILED';
```

### **Check Backup Statistics:**
```sql
SELECT 
  COUNT(*) as total_backups,
  COUNT(DISTINCT attempt_id) as unique_attempts,
  SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
  SUM(CASE WHEN status = 'RESTORED' THEN 1 ELSE 0 END) as restored
FROM submission_backups;
```

---

## 🎯 Best Practices

### **DO's ✅**
- ✅ Use retry logic for database operations
- ✅ Use unique indexes to prevent duplicates
- ✅ Use same connection for all queries in transaction
- ✅ Use ON DUPLICATE KEY UPDATE for idempotent operations
- ✅ Set appropriate lock wait timeout

### **DON'Ts ❌**
- ❌ Don't use pool.query inside transaction (use connection.query)
- ❌ Don't create multiple connections for same transaction
- ❌ Don't ignore lock timeout errors
- ❌ Don't allow duplicate backups
- ❌ Don't set lock wait timeout too low (<5s)

---

## 🔧 Troubleshooting

### **Problem: Still getting lock timeout**

**Solution:**
```sql
-- Increase global lock wait timeout
SET GLOBAL innodb_lock_wait_timeout = 20;

-- Check for long-running transactions
SELECT * FROM information_schema.innodb_trx;

-- Kill stuck transaction (if needed)
KILL <trx_mysql_thread_id>;
```

### **Problem: Duplicate backups still occurring**

**Solution:**
```bash
# Run cleanup again
node cleanup-duplicate-backups.js

# Verify unique index exists
mysql -u root -p cbt_smk -e "SHOW INDEX FROM submission_backups WHERE Key_name = 'idx_attempt_unique';"
```

### **Problem: Retry not working**

**Solution:**
```bash
# Check logs for retry messages
pm2 logs cbt-smk | grep "retrying"

# Test retry logic
node run-fix-lock-timeout.js
```

---

## 📝 Summary

**Problem:** Lock wait timeout saat concurrent submissions  
**Root Cause:** Poor transaction handling + no retry + no unique index  
**Solution:** Retry logic + proper transactions + unique index + ON DUPLICATE KEY UPDATE  
**Result:** ✅ No more lock timeout errors!

---

## 🎉 Status

- ✅ Retry logic implemented
- ✅ Unique index added
- ✅ Transaction handling fixed
- ✅ Duplicate backups cleaned
- ✅ Lock timeout increased
- ✅ Tested and verified

**Lock timeout issue is now FIXED!** 🚀

---

*Last Updated: 14 Maret 2026*
