module.exports = {
  apps: [
    {
      name: 'mixchat',
      script: './dist/server/entry.mjs',
      interpreter: 'node',
      cwd: '/home/felipe/devel-gitea/Mixchat',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3000',
        // Tells Astro's Node adapter the public-facing origin.
        // Without this, SSR routing behind a reverse proxy can produce 404s
        // on direct navigation to dynamic routes like /channel/[name].
        ORIGIN: 'https://mixchat.grepfs.xyz',
      },
      // Restart on crash, but not too aggressively
      max_restarts: 10,
      min_uptime: '10s',
      // Log to files for easier debugging
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
