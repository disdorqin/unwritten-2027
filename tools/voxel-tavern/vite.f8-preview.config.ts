import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// 只为 F-8 燃料仪表独立审阅页服务的临时构建/预览配置。
// 不参与正式构建，不改动 vite.config.ts；构建产物落在 dist-f8/（可随时删除）。
export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist-f8',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./f8-fuel-preview.html', import.meta.url)),
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
  },
});
