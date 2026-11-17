import { defineConfig } from 'vitest/config';
import { readFile } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'loopback-private-demo',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/__local_business_data', async (req, res) => {
          res.setHeader('Cache-Control', 'no-store');
          if (!process.env.MAAS_PRIVATE_DATA) {
            res.statusCode = 204;
            res.end();
            return;
          }
          const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
            req.socket.remoteAddress ?? '',
          );
          const host = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(
            req.headers.host ?? '',
          );
          if (
            !local ||
            !host ||
            req.headers['x-forwarded-for'] ||
            (req.headers.origin &&
              !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
                req.headers.origin,
              ))
          ) {
            res.statusCode = 403;
            res.end();
            return;
          }
          try {
            const data = await readFile(process.env.MAAS_PRIVATE_DATA, 'utf8');
            JSON.parse(data);
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch {
            res.statusCode = 503;
            res.end();
          }
        });
      },
    },
  ],
  server: {
    fs: {
      deny: [
        '.env',
        '.env.*',
        '**/private-data/**',
        '**/attachments/**',
        '**/*.xlsx',
        '**/secrets/**',
        '**/credentials/**',
        '**/.git/**',
      ],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
});
