module.exports = {
  apps: [
    {
      name: 'lms-smkn1kras',
      script: 'src/server.js',
      // Cluster mode: pakai semua CPU core (untuk VPS 2 core = 2 instance)
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      autorestart: true,
      max_memory_restart: '400M',  // Restart jika 1 instance > 400MB
      kill_timeout: 10000,
      listen_timeout: 10000,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
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
