import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:7841';
/**
 * Address to bind the dev server to, exported by `scripts/dev.ts` when you run
 * `bun dev --host [<addr>]`. Unset means the Vite default: loopback only.
 */
const HOST = process.env.DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // ES workers so Shiki's on-demand language imports become separate chunks
  // instead of one multi-megabyte worker bundle.
  worker: { format: 'es' },
  server: {
    // Once we bind beyond loopback, browsers reach us under whatever hostname
    // or IP they used, which we cannot enumerate up front — so opt out of
    // Vite's host allow-list in that case (it only applies when HOST is set).
    ...(HOST ? { host: HOST, allowedHosts: true } : {}),
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/ws': { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
});
