module.exports = {
  apps: [
    {
      name: "microsoft-account",
      script: "telegram_bot.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
