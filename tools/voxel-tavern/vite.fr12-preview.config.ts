import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// FR-12 高山旅行与缆车陈设库独立预览构建配置，不改动主线 vite.config.ts。
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist-fr12',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./fr12-alpine-props-preview.html', import.meta.url)),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5212,
    strictPort: true,
  },
});
