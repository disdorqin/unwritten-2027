import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// FR-01 木石生活构件库独立预览构建配置，不改动主线 vite.config.ts。
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist-fr01',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./fr01-wood-stone-preview.html', import.meta.url)),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5201,
    strictPort: true,
  },
});
