import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// FR-13 地下营地/勇士城生活陈设库独立预览构建配置，不改动主线 vite.config.ts。
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist-fr13',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./fr13-underground-props-preview.html', import.meta.url)),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5213,
    strictPort: true,
  },
});
