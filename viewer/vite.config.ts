import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  // Bundle Web Workers as native ES modules so `new Worker(url, { type: "module" })`
  // is honored at build time. Default `iife` strips the `type: "module"` arg and
  // then @rollup/plugin-commonjs emits dynamic-require throw stubs for any
  // CJS deps (elkjs in particular) — a foot-gun that bites in `vite preview`
  // but not in `vite dev`. See diagnosis 2026-04-22.
  worker: {
    format: "es",
  },
  build: {
    sourcemap: process.env.VITE_SOURCEMAP !== "0",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split Monaco into its own lazy chunk; verified by bundle grep.
          if (id.includes("monaco-editor")) return "monaco";
        },
      },
    },
  },
});
