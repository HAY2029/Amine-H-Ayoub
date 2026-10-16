import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: "/",
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
    hmr: {
      overlay: false,
      clientPort: 5174,
    },
  },
  build: {
    outDir: "dist",
    minify: "esbuild",
    cssMinify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react/")) return "vendor-react";
          if (id.includes("node_modules/@tanstack/")) return "vendor-tanstack";
          if (id.includes("node_modules/@supabase/")) return "vendor-supabase";
          if (id.includes("node_modules/lucide-react/")) return "vendor-icons";
        },
        chunkFileNames: (chunkInfo) => {
          return `js/[name]-[hash].js`;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [react()],
});