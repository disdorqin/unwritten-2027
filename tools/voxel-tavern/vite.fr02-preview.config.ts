import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// FR-02 冬日街景道具库独立预览构建配置，不改动主线 vite.config.ts。
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist-fr02',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./fr02-winter-props-preview.html', import.meta.url)),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5202,
    strictPort: true,
  },
});
