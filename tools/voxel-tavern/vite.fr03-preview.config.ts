import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// FR-03 原创纪念品与展柜独立预览构建配置，不改动主线 vite.config.ts。
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist-fr03',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./fr03-souvenirs-preview.html', import.meta.url)),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5203,
    strictPort: true,
  },
});
