import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// FR-15 空间分区天气场独立验收预览，不改主线 vite.config.ts。
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist-fr15',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./fr15-spatial-weather-preview.html', import.meta.url)),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5218,
    strictPort: true,
  },
});
