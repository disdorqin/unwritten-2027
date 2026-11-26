import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// FR-11 坑区工业小件库独立预览构建配置，不改动主线 vite.config.ts。
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist-fr11',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./fr11-pit-props-preview.html', import.meta.url)),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5211,
    strictPort: true,
  },
});
