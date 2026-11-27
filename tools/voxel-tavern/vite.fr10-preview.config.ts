import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// FR-10 连续昼夜天空独立验收预览，不改主线 vite.config.ts。
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist-fr10',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./fr10-weather-cycle-preview.html', import.meta.url)),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5210,
    strictPort: true,
  },
});
