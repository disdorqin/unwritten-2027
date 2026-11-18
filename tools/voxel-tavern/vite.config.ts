import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const townBlockout = fileURLToPath(new URL('./town-blockout.html', import.meta.url));
const tavern = fileURLToPath(new URL('./index.html', import.meta.url));

export default defineConfig(({ mode }) => ({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/ws/': { target: 'http://127.0.0.1:4000', ws: true },
      '/info': { target: 'http://127.0.0.1:4000' },
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: mode === 'town-preview' || mode === 'town-rehearsal' ? { townBlockout } : { tavern, townBlockout },
    },
  },
}));
