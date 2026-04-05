require('dotenv').config();
const pool = require('../src/db/pool');

async function verifySetup() {
  console.log('🔍 Verifying notification setup...\n');
  
  let allGood = true;

  try {
    // 1. Check if notifications table exists
    console.log('1. Checking notifications table...');
    const [tables] = await pool.query("SHOW TABLES LIKE 'notifications'");
    if (tables.length > 0) {
      console.log('   ✅ Table "notifications" exists');
    } else {
      console.log('   ❌ Table "notifications" NOT found');
      console.log('   → Run: node scripts/migrate_notifications.js');
      allGood = false;
    }

    // 2. Check table structure
    if (tables.length > 0) {
      console.log('\n2. Checking table structure...');
      const [columns] = await pool.query("DESCRIBE notifications");
      const requiredColumns = ['id', 'user_id', 'title', 'message', 'type', 'reference_id', 'is_read', 'created_at'];
      const existingColumns = columns.map(c => c.Field);
      
      let structureOk = true;
      for (const col of requiredColumns) {
        if (existingColumns.includes(col)) {
          console.log(`   ✅ Column "${col}" exists`);
        } else {
          console.log(`   ❌ Column "${col}" NOT found`);
          structureOk = false;
          allGood = false;
        }
      }
      
      if (structureOk) {
        console.log('   ✅ Table structure is correct');
      }
    }

    // 3. Check if there are any students
    console.log('\n3. Checking for students...');
    const [[studentCount]] = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE role='STUDENT'"
    );
    if (studentCount.count > 0) {
      console.log(`   ✅ Found ${studentCount.count} student(s)`);
    } else {
      console.log('   ⚠️  No students found');
      console.log('   → Create students to test notifications');
    }

    // 4. Check if students have class_id
    console.log('\n4. Checking student class assignments...');
    const [[studentsWithClass]] = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE role='STUDENT' AND class_id IS NOT NULL"
    );
    if (studentsWithClass.count > 0) {
      console.log(`   ✅ ${studentsWithClass.count} student(s) have class assignments`);
    } else {
      console.log('   ⚠️  No students assigned to classes');
      console.log('   → Assign students to classes for notifications to work');
    }

    // 5. Check for published materials
    console.log('\n5. Checking published materials...');
    const [[materialCount]] = await pool.query(
      "SELECT COUNT(*) as count FROM materials WHERE is_published=1"
    );
    console.log(`   ℹ️  Found ${materialCount.count} published material(s)`);

    // 6. Check for published exams
    console.log('\n6. Checking published exams...');
    const [[examCount]] = await pool.query(
      "SELECT COUNT(*) as count FROM exams WHERE is_published=1"
    );
    console.log(`   ℹ️  Found ${examCount.count} published exam(s)`);

    // 7. Check existing notifications
    console.log('\n7. Checking existing notifications...');
    const [[notifCount]] = await pool.query(
      "SELECT COUNT(*) as count FROM notifications"
    );
    console.log(`   ℹ️  Found ${notifCount.count} notification(s) in database`);

    if (notifCount.count > 0) {
      const [[unreadCount]] = await pool.query(
        "SELECT COUNT(*) as count FROM notifications WHERE is_read=0"
      );
      console.log(`   ℹ️  ${unreadCount.count} unread notification(s)`);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    if (allGood) {
      console.log('✅ All checks passed! Notification system is ready.');
      console.log('\nNext steps:');
      console.log('1. Make sure your server is running: npm run dev');
      console.log('2. Login as a teacher');
      console.log('3. Create and publish a material or exam');
      console.log('4. Login as a student to see notifications');
    } else {
      console.log('❌ Some checks failed. Please fix the issues above.');
    }
    console.log('='.repeat(50));

    process.exit(allGood ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
    process.exit(1);
  }
}

verifySetup();
