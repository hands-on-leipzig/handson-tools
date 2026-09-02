const path = require('path');

module.exports = {
  apps: [{
    name: 'domain-shortener',
    script: './server.js',
    cwd: path.resolve(__dirname), // Ensure PM2 runs from the project directory
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
      // Note: Keycloak OAuth configuration is loaded from .env file
      // See env.example for required variables
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};

