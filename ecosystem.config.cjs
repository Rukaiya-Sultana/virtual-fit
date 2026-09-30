// PM2 process definition — run with: pm2 start ecosystem.config.cjs
// Then: pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "virtual-fit",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: __dirname,
      instances: 1, // catalog.json + in-memory rate limiting assume a single instance
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Restart policy
      max_memory_restart: "512M",
      exp_backoff_restart_delay: 200,
      // Logs
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
