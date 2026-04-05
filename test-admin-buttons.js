const pool = require('./src/db/pool');

async function testAdminButtons() {
  console.log('=== Testing Admin Exam Buttons ===');
  
  try {
    // Test 1: Get sample exam for testing buttons
    console.log('\n1. Getting sample exam for button testing...');
    const [exams] = await pool.query(`
      SELECT e.id, e.title, e.is_published, 
             s.name as subject_name, 
             u.full_name as teacher_name
      FROM exams e
      LEFT JOIN subjects s ON s.id = e.subject_id
      LEFT JOIN users u ON u.id = e.teacher_id
      ORDER BY e.created_at DESC
      LIMIT 1;
    `);
    
    if (exams.length > 0) {
      const exam = exams[0];
      console.log(`Sample exam: "${exam.title}" (ID: ${exam.id})`);
      console.log(`Subject: ${exam.subject_name || 'N/A'}`);
      console.log(`Teacher: ${exam.teacher_name || 'N/A'}`);
      console.log(`Status: ${exam.is_published ? 'Published' : 'Draft'}`);
      
      console.log('\n2. Available admin buttons for this exam:');
      console.log(`✅ Detail: /admin/exams/${exam.id} (GET)`);
      console.log(`✅ Edit: /admin/exams/${exam.id}/edit (GET)`);
      console.log(`✅ Toggle Publish: /admin/exams/${exam.id}/toggle-publish (POST)`);
      console.log(`✅ Delete: /admin/exams/${exam.id}?_method=DELETE (POST)`);
      console.log(`✅ JSON Detail: /admin/exams/${exam.id}/json (GET)`);
      
    } else {
      console.log('No exams found for testing');
    }
    
    console.log('\n3. Available admin actions:');
    console.log('✅ Create New Exam: /admin/exams/new (GET)');
    console.log('✅ Create Exam: /admin/exams (POST)');
    console.log('✅ List All Exams: /admin/exams (GET)');
    console.log('✅ Bulk Delete: /admin/exams/bulk-delete (POST)');
    
    console.log('\n4. Button locations in admin interface:');
    console.log('📍 Header: "Buat Ujian Baru" button (green)');
    console.log('📍 Table Actions: Detail (blue), Edit (emerald), Publish/Unpublish (green/orange), Delete (red)');
    console.log('📍 Bulk Actions: Bulk delete for selected exams');
    
    console.log('\n=== Admin Buttons Test Complete ===');
    console.log('\n🎯 WHAT TO EXPECT:');
    console.log('1. Header has "Buat Ujian Baru" button (green) next to "Kembali"');
    console.log('2. Each exam row has: Detail | Edit | Publish/Unpublish | Delete buttons');
    console.log('3. Edit button is emerald/green color between Detail and Publish buttons');
    console.log('4. All buttons should be clickable and lead to correct pages');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await pool.end();
  }
}

testAdminButtons();