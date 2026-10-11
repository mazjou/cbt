module.exports = {
  apps: [
    {
      name: 'lms-smkn1kras',
      script: 'src/server.js',
      // 4 CPU core → 4 worker (pakai semua core)
      instances: 'max',
      exec_mode: 'cluster',
      // 16GB RAM → tiap worker bisa dapat 2GB heap
      node_args: '--max-old-space-size=2048',
      watch: false,
      autorestart: true,
      max_memory_restart: '2500M', // restart jika worker > 2.5GB
      kill_timeout: 15000,
      listen_timeout: 15000,
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      merge_logs: true,
      out_file: '/cbt/logs/pm2-out.log',
      error_file: '/cbt/logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta',
        PORT: 3000,
        // Pool DB dinaikkan sesuai RAM — 4 worker × 75 = 300 koneksi ke DB
        DB_CONNECTION_LIMIT: '75',
        // Rate limit autosave lebih longgar
        ONLINE_TTL_SECONDS: '300'
      }
    }
  ]
};
