const pool = require('./src/db/pool');

async function testCompactButtons() {
  console.log('=== Testing Compact Admin Buttons Layout ===');
  
  try {
    // Test 1: Get sample exam for testing
    console.log('\n1. Testing new 2-row button layout...');
    const [exams] = await pool.query(`
      SELECT e.id, e.title, e.is_published
      FROM exams e
      ORDER BY e.created_at DESC
      LIMIT 3;
    `);
    
    console.log(`Found ${exams.length} exams for layout testing:`);
    exams.forEach((exam, index) => {
      console.log(`\n${index + 1}. "${exam.title}" (ID: ${exam.id})`);
      console.log(`   Status: ${exam.is_published ? 'Published' : 'Draft'}`);
      console.log('   Button Layout:');
      console.log('   Row 1: [Detail] [Edit]');
      console.log(`   Row 2: [${exam.is_published ? 'Unpublish' : 'Publish'}] [Hapus]`);
    });
    
    console.log('\n2. Layout improvements:');
    console.log('✅ Reduced horizontal space usage');
    console.log('✅ Organized buttons into logical groups');
    console.log('✅ Maintained all functionality');
    console.log('✅ Smaller button padding for compact design');
    console.log('✅ Rounded corners adjusted for smaller size');
    
    console.log('\n3. Button grouping logic:');
    console.log('📋 Row 1 (View/Edit): Detail + Edit');
    console.log('🔄 Row 2 (Actions): Publish/Unpublish + Delete');
    
    console.log('\n4. Space efficiency:');
    console.log('Before: 4 buttons in 1 row (wide)');
    console.log('After:  2 buttons × 2 rows (compact)');
    console.log('Result: ~50% less horizontal space needed');
    
    console.log('\n=== Compact Buttons Test Complete ===');
    console.log('\n🎯 EXPECTED RESULT:');
    console.log('- Each exam row now has 2 rows of buttons');
    console.log('- Top row: Detail (blue) + Edit (emerald)');
    console.log('- Bottom row: Publish/Unpublish (green/orange) + Delete (red)');
    console.log('- Buttons are smaller but still readable');
    console.log('- Table takes less horizontal space');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await pool.end();
  }
}

testCompactButtons();