const { createClient } = require('redis');
require('dotenv').config();

async function diagnoseRedisConnection() {
  console.log('🔍 Diagnosing Redis Connection Issues...\n');
  
  const config = {
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      connectTimeout: 10000
    },
    password: process.env.REDIS_PASSWORD || undefined
  };
  
  console.log('📋 Configuration:');
  console.log(`   Host: ${config.socket.host}`);
  console.log(`   Port: ${config.socket.port}`);
  console.log(`   Password: ${config.password ? '***' : '(none)'}`);
  console.log('');
  
  // Test 1: Basic Connection
  console.log('Test 1: Basic Connection');
  const client = createClient(config);
  
  let connected = false;
  let errorOccurred = false;
  
  client.on('error', (err) => {
    console.log('   ❌ Error:', err.message);
    errorOccurred = true;
  });
  
  client.on('connect', () => {
    console.log('   ✅ Connected');
    connected = true;
  });
  
  client.on('ready', () => {
    console.log('   ✅ Ready');
  });
  
  client.on('end', () => {
    console.log('   ⚠️  Connection ended');
  });
  
  try {
    await client.connect();
    console.log('   ✅ Connection successful\n');
    
    // Test 2: Ping
    console.log('Test 2: Ping');
    const pong = await client.ping();
    console.log(`   ✅ Ping response: ${pong}\n`);
    
    // Test 3: Set/Get
    console.log('Test 3: Set/Get');
    await client.set('test:key', 'test-value', { EX: 10 });
    console.log('   ✅ Set test:key = test-value');
    
    const value = await client.get('test:key');
    console.log(`   ✅ Get test:key = ${value}\n`);
    
    // Test 4: Server Info
    console.log('Test 4: Server Info');
    const info = await client.info('server');
    const lines = info.split('\r\n');
    lines.forEach(line => {
      if (line.startsWith('redis_version:') || 
          line.startsWith('os:') || 
          line.startsWith('uptime_in_seconds:') ||
          line.startsWith('tcp_port:')) {
        console.log(`   ${line}`);
      }
    });
    console.log('');
    
    // Test 5: Memory Info
    console.log('Test 5: Memory Info');
    const memInfo = await client.info('memory');
    const memLines = memInfo.split('\r\n');
    memLines.forEach(line => {
      if (line.startsWith('used_memory_human:') || 
          line.startsWith('maxmemory_human:') ||
          line.startsWith('used_memory_peak_human:')) {
        console.log(`   ${line}`);
      }
    });
    console.log('');
    
    // Test 6: Connected Clients
    console.log('Test 6: Connected Clients');
    const clientInfo = await client.info('clients');
    const clientLines = clientInfo.split('\r\n');
    clientLines.forEach(line => {
      if (line.startsWith('connected_clients:') || 
          line.startsWith('blocked_clients:')) {
        console.log(`   ${line}`);
      }
    });
    console.log('');
    
    // Test 7: Persistence
    console.log('Test 7: Persistence');
    const persistInfo = await client.info('persistence');
    const persistLines = persistInfo.split('\r\n');
    persistLines.forEach(line => {
      if (line.startsWith('rdb_last_save_time:') || 
          line.startsWith('rdb_changes_since_last_save:') ||
          line.startsWith('aof_enabled:')) {
        console.log(`   ${line}`);
      }
    });
    console.log('');
    
    // Test 8: Keep connection open for 30 seconds
    console.log('Test 8: Connection Stability (30 seconds)');
    console.log('   Keeping connection open to test stability...');
    
    let pingCount = 0;
    const interval = setInterval(async () => {
      try {
        await client.ping();
        pingCount++;
        process.stdout.write(`\r   ✅ Ping ${pingCount}/30 successful`);
      } catch (err) {
        console.log(`\n   ❌ Ping failed: ${err.message}`);
        clearInterval(interval);
      }
    }, 1000);
    
    setTimeout(async () => {
      clearInterval(interval);
      console.log('\n   ✅ Connection stable for 30 seconds\n');
      
      // Cleanup
      await client.del('test:key');
      await client.quit();
      
      console.log('✅ All tests passed!');
      console.log('\n📊 Summary:');
      console.log(`   Connection: ${connected ? '✅ OK' : '❌ Failed'}`);
      console.log(`   Errors: ${errorOccurred ? '❌ Yes' : '✅ None'}`);
      console.log(`   Stability: ✅ OK (${pingCount}/30 pings successful)`);
      
      process.exit(0);
    }, 30000);
    
  } catch (err) {
    console.error('\n❌ Connection failed:', err.message);
    console.error('\n🔧 Troubleshooting:');
    
    if (err.message.includes('ECONNREFUSED')) {
      console.error('   1. Redis server is not running');
      console.error('   2. Check if Redis is installed: redis-cli --version');
      console.error('   3. Start Redis: sudo systemctl start redis-server');
    } else if (err.message.includes('ETIMEDOUT')) {
      console.error('   1. Network timeout - Redis server unreachable');
      console.error('   2. Check firewall: sudo ufw status');
      console.error('   3. Check Redis bind address in /etc/redis/redis.conf');
    } else if (err.message.includes('WRONGPASS')) {
      console.error('   1. Incorrect password');
      console.error('   2. Check REDIS_PASSWORD in .env');
      console.error('   3. Check requirepass in /etc/redis/redis.conf');
    } else if (err.message.includes('ENOTFOUND')) {
      console.error('   1. Hostname not found');
      console.error('   2. Check REDIS_HOST in .env');
      console.error('   3. Check DNS: nslookup ' + config.socket.host);
    } else {
      console.error('   Unknown error. Check Redis logs:');
      console.error('   sudo tail -f /var/log/redis/redis-server.log');
    }
    
    process.exit(1);
  }
}

diagnoseRedisConnection();
