# Troubleshooting: Assignments Table Error

## Problem
Server crashed on startup with error:
```
Error: Table 'cbt_smk.assignments' doesn't exist
at PromisePool.query (node_modules\mysql2\lib\promise\pool.js:36:22)
at src\routes\teacher.js:244:42
```

## Root Cause
The teacher dashboard route was trying to query the `assignments` table immediately on page load, but:
1. The table was created after the server had already started
2. MySQL connection pool may have cached the old database schema
3. No error handling was in place for missing tables

## Solution Applied

### 1. Added Error Handling
Modified `src/routes/teacher.js` teacher dashboard route to:
- Wrap all queries in try-catch blocks
- Specifically handle assignments table query with nested try-catch
- Default to 0 assignments if table doesn't exist
- Provide user-friendly error messages

### 2. Verified Tables Exist
Ran verification scripts to confirm:
- ✓ `assignments` table exists
- ✓ `assignment_submissions` table exists
- ✓ Queries work correctly with both named and positional placeholders

## How to Verify Fix

### 1. Check Server Status
The server should now start successfully. Look for:
```
LMS SMKN 1 Kras running on http://localhost:3000
```

### 2. Test Teacher Dashboard
1. Login as a teacher (user with role='teacher')
2. Navigate to `/teacher` dashboard
3. Should see statistics including "Tugas" count (will be 0 initially)

### 3. Test Assignment Features

#### Teacher Side:
1. Go to `/teacher/assignments`
2. Click "Buat Tugas Baru"
3. Fill in assignment details
4. Upload file (optional)
5. Click "Simpan"
6. Verify assignment appears in list

#### Student Side:
1. Login as a student
2. Go to `/student/assignments`
3. Should see published assignments
4. Click on an assignment
5. Upload a file
6. Submit assignment

### 4. Run Verification Scripts
```bash
# Check tables exist
node scripts/check_tables.js

# Test queries directly
node scripts/test_assignments_query.js
```

## Files Modified
- `src/routes/teacher.js` - Added error handling to dashboard route
- `scripts/test_assignments_query.js` - Created test script for debugging

## Prevention
The error handling now ensures:
- Server starts even if optional features are missing
- Graceful degradation when tables don't exist
- Clear console messages for debugging
- User-friendly error messages

## Next Steps
1. Verify server is running
2. Test complete assignment workflow
3. Check notifications are sent when assignments are published
4. Test file uploads and downloads
5. Test grading functionality
