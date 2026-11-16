import { defineConfig } from "vite";
export default defineConfig({
  optimizeDeps: { include: ["libopus-wasm"] },
  build: {
    target: "es2022",
    outDir: "dist/client",
    rollupOptions: { input: { main: "index.html", town: "town.html" } },
  },
  worker: { format: "es" },
});
