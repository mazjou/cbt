// Check Redis Sessions
require('dotenv').config();
const { createClient } = require('redis');

async function checkSessions() {
  console.log('🔍 Checking Redis Sessions...\n');
  
  const client = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    },
    password: process.env.REDIS_PASSWORD || undefined
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to Redis\n');
    
    // Get all session keys
    const keys = await client.keys('lms:sess:*');
    console.log(`📊 Total active sessions: ${keys.length}\n`);
    
    if (keys.length === 0) {
      console.log('ℹ️  No active sessions found.');
      console.log('   Sessions will appear here after users login.\n');
    } else {
      console.log('Session Details:');
      console.log('─'.repeat(80));
      
      for (const key of keys) {
        const ttl = await client.ttl(key);
        const sessionData = await client.get(key);
        
        // Parse session data
        let userData = 'N/A';
        try {
          const parsed = JSON.parse(sessionData);
          if (parsed.user) {
            userData = `${parsed.user.full_name || 'N/A'} (${parsed.user.role || 'N/A'})`;
          }
        } catch (e) {
          // Ignore parse errors
        }
        
        const hours = Math.floor(ttl / 3600);
        const minutes = Math.floor((ttl % 3600) / 60);
        
        console.log(`\nKey: ${key.replace('lms:sess:', '')}`);
        console.log(`User: ${userData}`);
        console.log(`TTL: ${hours}h ${minutes}m (${ttl}s)`);
      }
      
      console.log('\n' + '─'.repeat(80));
    }
    
    // Get Redis info
    console.log('\n📈 Redis Server Info:');
    const info = await client.info('server');
    const memory = await client.info('memory');
    
    const extractInfo = (text, key) => {
      const line = text.split('\r\n').find(l => l.startsWith(key));
      return line ? line.split(':')[1] : 'N/A';
    };
    
    console.log(`  Version: ${extractInfo(info, 'redis_version')}`);
    console.log(`  Uptime: ${extractInfo(info, 'uptime_in_days')} days`);
    console.log(`  Memory: ${extractInfo(memory, 'used_memory_human')}`);
    
    await client.quit();
    console.log('\n✅ Done!');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkSessions();
