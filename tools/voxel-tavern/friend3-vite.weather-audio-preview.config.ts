import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist-weather-audio',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./friend3-weather-audio-preview.html', import.meta.url)),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5219,
    strictPort: true,
  },
});