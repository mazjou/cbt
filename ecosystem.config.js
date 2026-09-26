module.exports = {
  apps: [
    {
      name: 'lms-smkn1kras',
      script: 'src/server.js',
      // Cluster mode: pakai semua CPU core (untuk VPS 2 core = 2 instance)
      instances: 'max',
      exec_mode: 'cluster',
      node_args: '--max-old-space-size=512',  // 512MB heap per instance
      watch: false,
      autorestart: true,
      max_memory_restart: '600M',  // Restart jika 1 instance > 600MB (di atas heap limit)
      kill_timeout: 10000,
      listen_timeout: 10000,
      restart_delay: 5000,          // Tunggu 5 detik sebelum restart (bukan 2 detik)
      exp_backoff_restart_delay: 200, // Backoff lebih panjang jika terus crash
      merge_logs: true,
      out_file: '/cbt/logs/pm2-out.log',
      error_file: '/cbt/logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta',
        PORT: 3000
      }
    }
  ]
};
