import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

/**
 * نفس وحدة Vite الافتراضية للاختبارات: أسماء صور صفحات المصحف
 * (تُعرَّف في vite.config.ts أثناء البناء؛ الاختبارات لا تقرأ ذلك الملف).
 */
const QURAN_PAGES_ID = "virtual:quran-page-files";
const RESOLVED_QURAN_PAGES_ID = "\0" + QURAN_PAGES_ID;
const quranPageFilesPlugin = {
  name: "quran-page-files-test",
  resolveId(id: string) {
    return id === QURAN_PAGES_ID ? RESOLVED_QURAN_PAGES_ID : null;
  },
  load(id: string) {
    if (id !== RESOLVED_QURAN_PAGES_ID) return null;
    let files: string[] = [];
    try {
      const dir = path.resolve(__dirname, "صفحة قران");
      if (fs.existsSync(dir)) {
        files = fs
          .readdirSync(dir)
          .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
          .sort((a, b) => parseInt(a.match(/\d+/)?.[0] || "0", 10) - parseInt(b.match(/\d+/)?.[0] || "0", 10));
      }
    } catch {
      files = [];
    }
    return `export default ${JSON.stringify(files)};`;
  },
};

export default defineConfig({
  plugins: [react(), quranPageFilesPlugin],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
