const pool = require('./src/db/pool');

async function testNamedParams() {
  try {
    console.log('Testing named parameters...');
    
    // Test 1: Simple SELECT with named params
    const [rows1] = await pool.query(
      'SELECT * FROM users WHERE id = :id LIMIT 1',
      { id: 1 }
    );
    console.log('✓ Test 1 passed: SELECT with named params');
    console.log('  Result:', rows1[0] ? `Found user: ${rows1[0].username}` : 'No user found');
    
    // Test 2: INSERT with named params (we'll rollback)
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      
      const [result] = await conn.query(
        'INSERT INTO subjects (name, description) VALUES (:name, :desc)',
        { name: 'Test Subject', desc: 'Test Description' }
      );
      console.log('✓ Test 2 passed: INSERT with named params');
      console.log('  Insert ID:', result.insertId);
      
      await conn.rollback();
      console.log('  (Rolled back)');
    } finally {
      conn.release();
    }
    
    console.log('\n✓ All tests passed! Named parameters are working.');
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.error('  Error code:', error.code);
    console.error('  SQL:', error.sql);
  } finally {
    await pool.end();
  }
}

testNamedParams();
