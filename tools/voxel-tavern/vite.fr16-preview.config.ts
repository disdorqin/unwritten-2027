import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    outDir: resolve(__dirname, '../../dist-fr16'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'fr16-weather-snow-preview.html'),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5219,
    strictPort: true,
  },
});
