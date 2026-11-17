import vinext from 'vinext';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(
        new URL('./db/node-env.ts', import.meta.url),
      ),
    },
  },
  plugins: [vinext()],
  server: { host: '127.0.0.1' },
});
