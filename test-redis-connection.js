// Test Redis Connection
require('dotenv').config();
const { createClient } = require('redis');

async function testRedisConnection() {
  console.log('🔍 Testing Redis Connection...\n');
  
  const config = {
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    },
    password: process.env.REDIS_PASSWORD || undefined
  };
  
  console.log('Configuration:');
  console.log(`  Host: ${config.socket.host}`);
  console.log(`  Port: ${config.socket.port}`);
  console.log(`  Password: ${config.password ? '***' + config.password.slice(-4) : '(none)'}\n`);
  
  const client = createClient(config);
  
  client.on('error', (err) => {
    console.error('❌ Redis Client Error:', err.message);
  });
  
  try {
    console.log('⏳ Connecting to Redis...');
    await client.connect();
    console.log('✅ Connected to Redis successfully!\n');
    
    // Test PING
    console.log('⏳ Testing PING...');
    const pong = await client.ping();
    console.log(`✅ PING response: ${pong}\n`);
    
    // Test SET
    console.log('⏳ Testing SET...');
    await client.set('test:connection', 'success');
    console.log('✅ SET successful\n');
    
    // Test GET
    console.log('⏳ Testing GET...');
    const value = await client.get('test:connection');
    console.log(`✅ GET successful: ${value}\n`);
    
    // Test DEL
    console.log('⏳ Testing DEL...');
    await client.del('test:connection');
    console.log('✅ DEL successful\n');
    
    // Get Redis info
    console.log('⏳ Getting Redis info...');
    const info = await client.info('server');
    const lines = info.split('\r\n').filter(line => 
      line.includes('redis_version') || 
      line.includes('os') || 
      line.includes('uptime_in_days')
    );
    console.log('✅ Redis Server Info:');
    lines.forEach(line => console.log(`  ${line}`));
    
    await client.quit();
    console.log('\n✅ All tests passed! Redis is working correctly.');
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ Connection failed:', err.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Check if Redis server is running');
    console.error('  2. Verify REDIS_HOST and REDIS_PORT in .env');
    console.error('  3. Check if password is correct');
    console.error('  4. Check firewall settings');
    console.error('  5. Try: redis-cli -h 10.10.102.8 -a redisCBT2026 ping');
    process.exit(1);
  }
}

testRedisConnection();
