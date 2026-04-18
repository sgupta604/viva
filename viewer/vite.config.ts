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
