// vite.config.ts
import { defineConfig } from "file:///H:/Amine-H-Ayoub/node_modules/vite/dist/node/index.js";
import react from "file:///H:/Amine-H-Ayoub/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { fileURLToPath } from "url";
import { componentTagger } from "file:///H:/Amine-H-Ayoub/node_modules/lovable-tagger/dist/index.js";
import { VitePWA } from "file:///H:/Amine-H-Ayoub/node_modules/vite-plugin-pwa/dist/index.js";
import { mcpPlugin } from "file:///H:/Amine-H-Ayoub/node_modules/@lovable.dev/mcp-js/dist/stacks/supabase/vite.js";
import fs from "fs";
var __vite_injected_original_import_meta_url = "file:///H:/Amine-H-Ayoub/vite.config.ts";
var __filename = fileURLToPath(__vite_injected_original_import_meta_url);
var __dirname = path.dirname(__filename);
var vite_config_default = defineConfig(({ mode }) => ({
  base: mode === "development" ? "/" : process.env.VITE_BASE_URL || "/",
  server: {
    host: "::",
    // Explicit port: on some environments (Node 24) vite 5.4.21 does not apply the
    // default 5173 port to config.server.port before injecting HMR values into
    // /@vite/client, which produced "localhost:undefined" and broke the HMR socket.
    port: 5173,
    hmr: {
      overlay: false
    },
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/App.tsx"]
    }
  },
  build: {
    // publicDir الافتراضي هو "public" — تُنسخ كل محتوياته إلى dist.
    // ملاحظة: مجلد النسخ الأصلية public/avatars/_originals مستثنى عبر .gitignore ولا يجب رفعه؛
    // ومن أراد تقليل حجم dist أكثر يحذفه قبل البناء (يُحتسب ~50MB).
    copyPublicDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("src/data/quranText.ts") || id.includes("src/data/surahs.ts")) {
            return "quran-data";
          }
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/react-router-dom/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          if (id.includes("node_modules/@supabase/")) {
            return "vendor-supabase";
          }
          if (id.includes("node_modules/@tanstack/")) {
            return "vendor-tanstack";
          }
          if (id.includes("node_modules/lucide-react/")) {
            return "vendor-icons";
          }
        }
      }
    },
    minify: "esbuild",
    chunkSizeWarningLimit: 1e3
  },
  plugins: [
    {
      name: "save-boxes-plugin",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configureServer(server) {
        server.middlewares.use("/api/save-boxes", (req, res) => {
          if (req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            try {
              if (fs.existsSync("boxes-dump.json")) {
                const content = fs.readFileSync("boxes-dump.json", "utf-8");
                res.statusCode = 200;
                res.end(content || "{}");
              } else {
                res.statusCode = 200;
                res.end("{}");
              }
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => body += chunk);
            req.on("end", () => {
              try {
                fs.writeFileSync("boxes-dump.json", body);
                res.setHeader("Content-Type", "application/json");
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, message: "saved" }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }
          res.statusCode = 405;
          res.end("Method Not Allowed");
        });
        server.middlewares.use("/api/send-email", async (req, res) => {
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => body += chunk);
            req.on("end", async () => {
              try {
                const payload = JSON.parse(body);
                const resp = await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${payload.apiKey || Buffer.from("cmVfVHFBdlFBZU5fRXlld0Jja3ZaR2RxRk0xTDhiVUx3VEJx", "base64").toString("utf-8")}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify(payload.data)
                });
                const data = await resp.json();
                res.setHeader("Content-Type", "application/json");
                res.statusCode = resp.status;
                res.end(JSON.stringify(data));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            res.statusCode = 405;
            res.end("Method Not Allowed");
          }
        });
      }
    },
    react(),
    mcpPlugin(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      srcDir: "src",
      filename: "service-worker.js",
      strategies: "injectManifest",
      injectManifest: {
        swSrc: path.resolve(__dirname, "src/service-worker.js"),
        globPatterns: ["**/*.{js,css,html,ico,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5e6,
        injectionPoint: "self.__WB_MANIFEST"
      },
      injectManifestBuildOptions: {
        minify: false,
        sourcemap: false,
        target: "esnext"
      },
      injectManifestRollupOptions: {
        rollupOptions: {
          treeshake: false
        }
      },
      devOptions: {
        enabled: false
      },
      includeAssets: ["favicon.ico", "my-photo.png", "background-kids.jpg", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        name: "\u062D\u0627\u062C \u0623\u064A\u0648\u0628 \u0623\u0645\u064A\u0646",
        short_name: "\u062D\u0627\u062C \u0623\u064A\u0648\u0628 \u0623\u0645\u064A\u0646",
        description: "\u062A\u0637\u0628\u064A\u0642 \u062A\u0639\u0644\u064A\u0645\u064A \u0644\u062A\u0631\u0641\u064A\u0647 \u0627\u0644\u0637\u0641\u0644 \u0628\u0639\u062F \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0642\u0631\u0622\u0646",
        theme_color: "#D2B48C",
        background_color: "#F5F5DC",
        display: "standalone",
        dir: "rtl",
        lang: "ar",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5e6,
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,jpeg,svg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^\/audio\/.*\.mp3$/,
            handler: "CacheFirst",
            options: {
              cacheName: "audio-cache",
              rangeRequests: true,
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // صوت السور السحابي (Supabase) — يُحفظ بعد أول تشغيل للعمل دون إنترنت
            urlPattern: ({ url }) => url.href.includes("/storage/v1/object/public/quran-audio/"),
            handler: "CacheFirst",
            options: {
              cacheName: "cloud-audio-cache",
              rangeRequests: true,
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // صوت السور من HuggingFace — يُحفظ بعد أول تشغيل للعمل دون إنترنت
            urlPattern: ({ url }) => url.hostname.includes("huggingface.co") && url.pathname.endsWith(".mp3"),
            handler: "CacheFirst",
            options: {
              cacheName: "hf-audio-cache",
              rangeRequests: true,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // صور صفحات المصحف المحلية
            urlPattern: /\/pages\/.*\.(?:jpg|jpeg|png)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "pages-cache",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // صور صفحات المصحف من سيرفر HuggingFace — تُحفظ بعد أول عرض للعمل دون إنترنت
            urlPattern: ({ url }) => url.hostname.includes("huggingface.co") && /\/pages\/.*\.(?:jpg|jpeg|png)/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "hf-pages-cache",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"]
  },
  optimizeDeps: {
    exclude: ["@ricky0123/vad-web", "onnxruntime-web"]
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJIOlxcXFxBbWluZS1ILUF5b3ViXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJIOlxcXFxBbWluZS1ILUF5b3ViXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9IOi9BbWluZS1ILUF5b3ViL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcclxuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcclxuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gXCJ1cmxcIjtcclxuaW1wb3J0IHsgY29tcG9uZW50VGFnZ2VyIH0gZnJvbSBcImxvdmFibGUtdGFnZ2VyXCI7XHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tIFwidml0ZS1wbHVnaW4tcHdhXCI7XHJcbmltcG9ydCB7IG1jcFBsdWdpbiB9IGZyb20gXCJAbG92YWJsZS5kZXYvbWNwLWpzL3N0YWNrcy9zdXBhYmFzZS92aXRlXCI7XHJcblxyXG5jb25zdCBfX2ZpbGVuYW1lID0gZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpO1xyXG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoX19maWxlbmFtZSk7XHJcbmltcG9ydCBmcyBmcm9tIFwiZnNcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+ICh7XHJcbiAgYmFzZTogbW9kZSA9PT0gXCJkZXZlbG9wbWVudFwiID8gXCIvXCIgOiBwcm9jZXNzLmVudi5WSVRFX0JBU0VfVVJMIHx8IFwiL1wiLFxyXG4gIHNlcnZlcjoge1xyXG4gICAgaG9zdDogXCI6OlwiLFxyXG4gICAgLy8gRXhwbGljaXQgcG9ydDogb24gc29tZSBlbnZpcm9ubWVudHMgKE5vZGUgMjQpIHZpdGUgNS40LjIxIGRvZXMgbm90IGFwcGx5IHRoZVxyXG4gICAgLy8gZGVmYXVsdCA1MTczIHBvcnQgdG8gY29uZmlnLnNlcnZlci5wb3J0IGJlZm9yZSBpbmplY3RpbmcgSE1SIHZhbHVlcyBpbnRvXHJcbiAgICAvLyAvQHZpdGUvY2xpZW50LCB3aGljaCBwcm9kdWNlZCBcImxvY2FsaG9zdDp1bmRlZmluZWRcIiBhbmQgYnJva2UgdGhlIEhNUiBzb2NrZXQuXHJcbiAgICBwb3J0OiA1MTczLFxyXG4gICAgaG1yOiB7XHJcbiAgICAgIG92ZXJsYXk6IGZhbHNlLFxyXG4gICAgfSxcclxuICAgIHdhcm11cDoge1xyXG4gICAgICBjbGllbnRGaWxlczogWycuL3NyYy9tYWluLnRzeCcsICcuL3NyYy9BcHAudHN4J11cclxuICAgIH0sXHJcbiAgfSxcclxuICBidWlsZDoge1xyXG4gICAgLy8gcHVibGljRGlyIFx1MDYyN1x1MDY0NFx1MDYyN1x1MDY0MVx1MDYyQVx1MDYzMVx1MDYyN1x1MDYzNlx1MDY0QSBcdTA2NDdcdTA2NDggXCJwdWJsaWNcIiBcdTIwMTQgXHUwNjJBXHUwNjRGXHUwNjQ2XHUwNjMzXHUwNjJFIFx1MDY0M1x1MDY0NCBcdTA2NDVcdTA2MkRcdTA2MkFcdTA2NDhcdTA2NEFcdTA2MjdcdTA2MkFcdTA2NDcgXHUwNjI1XHUwNjQ0XHUwNjQ5IGRpc3QuXHJcbiAgICAvLyBcdTA2NDVcdTA2NDRcdTA2MjdcdTA2MkRcdTA2MzhcdTA2Mjk6IFx1MDY0NVx1MDYyQ1x1MDY0NFx1MDYyRiBcdTA2MjdcdTA2NDRcdTA2NDZcdTA2MzNcdTA2MkUgXHUwNjI3XHUwNjQ0XHUwNjIzXHUwNjM1XHUwNjQ0XHUwNjRBXHUwNjI5IHB1YmxpYy9hdmF0YXJzL19vcmlnaW5hbHMgXHUwNjQ1XHUwNjMzXHUwNjJBXHUwNjJCXHUwNjQ2XHUwNjQ5IFx1MDYzOVx1MDYyOFx1MDYzMSAuZ2l0aWdub3JlIFx1MDY0OFx1MDY0NFx1MDYyNyBcdTA2NEFcdTA2MkNcdTA2MjggXHUwNjMxXHUwNjQxXHUwNjM5XHUwNjQ3XHUwNjFCXHJcbiAgICAvLyBcdTA2NDhcdTA2NDVcdTA2NDYgXHUwNjIzXHUwNjMxXHUwNjI3XHUwNjJGIFx1MDYyQVx1MDY0Mlx1MDY0NFx1MDY0QVx1MDY0NCBcdTA2MkRcdTA2MkNcdTA2NDUgZGlzdCBcdTA2MjNcdTA2NDNcdTA2MkJcdTA2MzEgXHUwNjRBXHUwNjJEXHUwNjMwXHUwNjQxXHUwNjQ3IFx1MDY0Mlx1MDYyOFx1MDY0NCBcdTA2MjdcdTA2NDRcdTA2MjhcdTA2NDZcdTA2MjdcdTA2MjEgKFx1MDY0QVx1MDY0Rlx1MDYyRFx1MDYyQVx1MDYzM1x1MDYyOCB+NTBNQikuXHJcbiAgICBjb3B5UHVibGljRGlyOiB0cnVlLFxyXG4gICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICBvdXRwdXQ6IHtcclxuICAgICAgICBtYW51YWxDaHVua3MoaWQpIHtcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnc3JjL2RhdGEvcXVyYW5UZXh0LnRzJykgfHwgaWQuaW5jbHVkZXMoJ3NyYy9kYXRhL3N1cmFocy50cycpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAncXVyYW4tZGF0YSc7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy9yZWFjdC8nKSB8fCBpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL3JlYWN0LWRvbS8nKSB8fCBpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL3JlYWN0LXJvdXRlci1kb20vJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItcmVhY3QnO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvQHJhZGl4LXVpLycpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAndmVuZG9yLXJhZGl4JztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL0BzdXBhYmFzZS8nKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ3ZlbmRvci1zdXBhYmFzZSc7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy9AdGFuc3RhY2svJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItdGFuc3RhY2snO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvbHVjaWRlLXJlYWN0LycpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAndmVuZG9yLWljb25zJztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBtaW5pZnk6ICdlc2J1aWxkJyxcclxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogMTAwMCxcclxuICB9LFxyXG4gIHBsdWdpbnM6IFtcclxuICAgIHtcclxuICAgICAgbmFtZTogJ3NhdmUtYm94ZXMtcGx1Z2luJyxcclxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcclxuICAgICAgY29uZmlndXJlU2VydmVyKHNlcnZlcjogYW55KSB7XHJcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcclxuICAgICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKCcvYXBpL3NhdmUtYm94ZXMnLCAocmVxOiBhbnksIHJlczogYW55KSA9PiB7XHJcbiAgICAgICAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ0dFVCcpIHtcclxuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICBpZiAoZnMuZXhpc3RzU3luYygnYm94ZXMtZHVtcC5qc29uJykpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoJ2JveGVzLWR1bXAuanNvbicsICd1dGYtOCcpO1xyXG4gICAgICAgICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSAyMDA7XHJcbiAgICAgICAgICAgICAgICByZXMuZW5kKGNvbnRlbnQgfHwgJ3t9Jyk7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHJlcy5zdGF0dXNDb2RlID0gMjAwO1xyXG4gICAgICAgICAgICAgICAgcmVzLmVuZCgne30nKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XHJcbiAgICAgICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSA1MDA7XHJcbiAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBlcnIubWVzc2FnZSB9KSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChyZXEubWV0aG9kID09PSAnUE9TVCcpIHtcclxuICAgICAgICAgICAgbGV0IGJvZHkgPSAnJztcclxuICAgICAgICAgICAgcmVxLm9uKCdkYXRhJywgKGNodW5rOiBhbnkpID0+IGJvZHkgKz0gY2h1bmspO1xyXG4gICAgICAgICAgICByZXEub24oJ2VuZCcsICgpID0+IHtcclxuICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYygnYm94ZXMtZHVtcC5qc29uJywgYm9keSk7XHJcbiAgICAgICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpO1xyXG4gICAgICAgICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSAyMDA7XHJcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ3NhdmVkJyB9KSk7XHJcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcclxuICAgICAgICAgICAgICAgIHJlcy5zdGF0dXNDb2RlID0gNTAwO1xyXG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBlcnIubWVzc2FnZSB9KSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHJlcy5zdGF0dXNDb2RlID0gNDA1O1xyXG4gICAgICAgICAgcmVzLmVuZCgnTWV0aG9kIE5vdCBBbGxvd2VkJyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcclxuICAgICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKCcvYXBpL3NlbmQtZW1haWwnLCBhc3luYyAocmVxOiBhbnksIHJlczogYW55KSA9PiB7XHJcbiAgICAgICAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ1BPU1QnKSB7XHJcbiAgICAgICAgICAgIGxldCBib2R5ID0gJyc7XHJcbiAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XHJcbiAgICAgICAgICAgIHJlcS5vbignZGF0YScsIChjaHVuazogYW55KSA9PiBib2R5ICs9IGNodW5rKTtcclxuICAgICAgICAgICAgcmVxLm9uKCdlbmQnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzcCA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwaS5yZXNlbmQuY29tL2VtYWlscycsIHtcclxuICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgICAgICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtwYXlsb2FkLmFwaUtleSB8fCBCdWZmZXIuZnJvbSgnY21WZlZIRkJkbEZCWlU1ZlJYbGxkMEpqYTNaYVIyUnhSazB4VERoaVZVeDNWRUp4JywgJ2Jhc2U2NCcpLnRvU3RyaW5nKCd1dGYtOCcpfWAsXHJcbiAgICAgICAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ1xyXG4gICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkLmRhdGEpXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwLmpzb24oKTtcclxuICAgICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qc29uJyk7XHJcbiAgICAgICAgICAgICAgICByZXMuc3RhdHVzQ29kZSA9IHJlc3Auc3RhdHVzO1xyXG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeShkYXRhKSk7XHJcbiAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcclxuICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xyXG4gICAgICAgICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSA1MDA7XHJcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSA0MDU7XHJcbiAgICAgICAgICAgIHJlcy5lbmQoJ01ldGhvZCBOb3QgQWxsb3dlZCcpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgcmVhY3QoKSxcclxuICAgIG1jcFBsdWdpbigpLFxyXG4gICAgbW9kZSA9PT0gXCJkZXZlbG9wbWVudFwiICYmIGNvbXBvbmVudFRhZ2dlcigpLFxyXG4gICAgVml0ZVBXQSh7XHJcbiAgICAgIHJlZ2lzdGVyVHlwZTogXCJhdXRvVXBkYXRlXCIsXHJcbiAgICAgIHNyY0RpcjogXCJzcmNcIixcclxuICAgICAgZmlsZW5hbWU6IFwic2VydmljZS13b3JrZXIuanNcIixcclxuICAgICAgc3RyYXRlZ2llczogXCJpbmplY3RNYW5pZmVzdFwiLFxyXG4gICAgICBpbmplY3RNYW5pZmVzdDoge1xyXG4gICAgICAgIHN3U3JjOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcInNyYy9zZXJ2aWNlLXdvcmtlci5qc1wiKSxcclxuICAgICAgICBnbG9iUGF0dGVybnM6IFtcIioqLyoue2pzLGNzcyxodG1sLGljbyx3ZWJtYW5pZmVzdH1cIl0sXHJcbiAgICAgICAgbWF4aW11bUZpbGVTaXplVG9DYWNoZUluQnl0ZXM6IDUwMDAwMDAsXHJcbiAgICAgICAgaW5qZWN0aW9uUG9pbnQ6IFwic2VsZi5fX1dCX01BTklGRVNUXCIsXHJcbiAgICAgIH0sXHJcbiAgICAgIGluamVjdE1hbmlmZXN0QnVpbGRPcHRpb25zOiB7XHJcbiAgICAgICAgbWluaWZ5OiBmYWxzZSxcclxuICAgICAgICBzb3VyY2VtYXA6IGZhbHNlLFxyXG4gICAgICAgIHRhcmdldDogXCJlc25leHRcIixcclxuICAgICAgfSxcclxuICAgICAgaW5qZWN0TWFuaWZlc3RSb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICAgICAgdHJlZXNoYWtlOiBmYWxzZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgICBkZXZPcHRpb25zOiB7XHJcbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXHJcbiAgICAgIH0sXHJcbiAgICAgIGluY2x1ZGVBc3NldHM6IFtcImZhdmljb24uaWNvXCIsIFwibXktcGhvdG8ucG5nXCIsIFwiYmFja2dyb3VuZC1raWRzLmpwZ1wiLCBcInB3YS0xOTJ4MTkyLnBuZ1wiLCBcInB3YS01MTJ4NTEyLnBuZ1wiXSxcclxuICAgICAgbWFuaWZlc3Q6IHtcclxuICAgICAgICBuYW1lOiBcIlx1MDYyRFx1MDYyN1x1MDYyQyBcdTA2MjNcdTA2NEFcdTA2NDhcdTA2MjggXHUwNjIzXHUwNjQ1XHUwNjRBXHUwNjQ2XCIsXHJcbiAgICAgICAgc2hvcnRfbmFtZTogXCJcdTA2MkRcdTA2MjdcdTA2MkMgXHUwNjIzXHUwNjRBXHUwNjQ4XHUwNjI4IFx1MDYyM1x1MDY0NVx1MDY0QVx1MDY0NlwiLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1MDYyQVx1MDYzN1x1MDYyOFx1MDY0QVx1MDY0MiBcdTA2MkFcdTA2MzlcdTA2NDRcdTA2NEFcdTA2NDVcdTA2NEEgXHUwNjQ0XHUwNjJBXHUwNjMxXHUwNjQxXHUwNjRBXHUwNjQ3IFx1MDYyN1x1MDY0NFx1MDYzN1x1MDY0MVx1MDY0NCBcdTA2MjhcdTA2MzlcdTA2MkYgXHUwNjQyXHUwNjMxXHUwNjI3XHUwNjIxXHUwNjI5IFx1MDYyN1x1MDY0NFx1MDY0Mlx1MDYzMVx1MDYyMlx1MDY0NlwiLFxyXG4gICAgICAgIHRoZW1lX2NvbG9yOiBcIiNEMkI0OENcIixcclxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiBcIiNGNUY1RENcIixcclxuICAgICAgICBkaXNwbGF5OiBcInN0YW5kYWxvbmVcIixcclxuICAgICAgICBkaXI6IFwicnRsXCIsXHJcbiAgICAgICAgbGFuZzogXCJhclwiLFxyXG4gICAgICAgIHN0YXJ0X3VybDogXCIvXCIsXHJcbiAgICAgICAgaWNvbnM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiBcIi9wd2EtMTkyeDE5Mi5wbmdcIixcclxuICAgICAgICAgICAgc2l6ZXM6IFwiMTkyeDE5MlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImltYWdlL3BuZ1wiLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiBcIi9wd2EtNTEyeDUxMi5wbmdcIixcclxuICAgICAgICAgICAgc2l6ZXM6IFwiNTEyeDUxMlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImltYWdlL3BuZ1wiLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiBcIi9wd2EtNTEyeDUxMi5wbmdcIixcclxuICAgICAgICAgICAgc2l6ZXM6IFwiNTEyeDUxMlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImltYWdlL3BuZ1wiLFxyXG4gICAgICAgICAgICBwdXJwb3NlOiBcIm1hc2thYmxlXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0sXHJcbiAgICAgIHdvcmtib3g6IHtcclxuICAgICAgICBtYXhpbXVtRmlsZVNpemVUb0NhY2hlSW5CeXRlczogNTAwMDAwMCxcclxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrRGVueWxpc3Q6IFsvXlxcL35vYXV0aC9dLFxyXG4gICAgICAgIGdsb2JQYXR0ZXJuczogW1wiKiovKi57anMsY3NzLGh0bWwsaWNvLHBuZyxqcGcsanBlZyxzdmcsd29mZix3b2ZmMn1cIl0sXHJcbiAgICAgICAgcnVudGltZUNhY2hpbmc6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogL15cXC9hdWRpb1xcLy4qXFwubXAzJC8sXHJcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiQ2FjaGVGaXJzdFwiLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcImF1ZGlvLWNhY2hlXCIsXHJcbiAgICAgICAgICAgICAgcmFuZ2VSZXF1ZXN0czogdHJ1ZSxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDUwMCwgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMzY1IH0sXHJcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBcdTA2MzVcdTA2NDhcdTA2MkEgXHUwNjI3XHUwNjQ0XHUwNjMzXHUwNjQ4XHUwNjMxIFx1MDYyN1x1MDY0NFx1MDYzM1x1MDYyRFx1MDYyN1x1MDYyOFx1MDY0QSAoU3VwYWJhc2UpIFx1MjAxNCBcdTA2NEFcdTA2NEZcdTA2MkRcdTA2NDFcdTA2MzggXHUwNjI4XHUwNjM5XHUwNjJGIFx1MDYyM1x1MDY0OFx1MDY0NCBcdTA2MkFcdTA2MzRcdTA2M0FcdTA2NEFcdTA2NDQgXHUwNjQ0XHUwNjQ0XHUwNjM5XHUwNjQ1XHUwNjQ0IFx1MDYyRlx1MDY0OFx1MDY0NiBcdTA2MjVcdTA2NDZcdTA2MkFcdTA2MzFcdTA2NDZcdTA2MkFcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsIH0pID0+IHVybC5ocmVmLmluY2x1ZGVzKFwiL3N0b3JhZ2UvdjEvb2JqZWN0L3B1YmxpYy9xdXJhbi1hdWRpby9cIiksXHJcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiQ2FjaGVGaXJzdFwiLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcImNsb3VkLWF1ZGlvLWNhY2hlXCIsXHJcbiAgICAgICAgICAgICAgcmFuZ2VSZXF1ZXN0czogdHJ1ZSxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDUwMCwgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMzY1IH0sXHJcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBcdTA2MzVcdTA2NDhcdTA2MkEgXHUwNjI3XHUwNjQ0XHUwNjMzXHUwNjQ4XHUwNjMxIFx1MDY0NVx1MDY0NiBIdWdnaW5nRmFjZSBcdTIwMTQgXHUwNjRBXHUwNjRGXHUwNjJEXHUwNjQxXHUwNjM4IFx1MDYyOFx1MDYzOVx1MDYyRiBcdTA2MjNcdTA2NDhcdTA2NDQgXHUwNjJBXHUwNjM0XHUwNjNBXHUwNjRBXHUwNjQ0IFx1MDY0NFx1MDY0NFx1MDYzOVx1MDY0NVx1MDY0NCBcdTA2MkZcdTA2NDhcdTA2NDYgXHUwNjI1XHUwNjQ2XHUwNjJBXHUwNjMxXHUwNjQ2XHUwNjJBXHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46ICh7IHVybCB9KSA9PiB1cmwuaG9zdG5hbWUuaW5jbHVkZXMoXCJodWdnaW5nZmFjZS5jb1wiKSAmJiB1cmwucGF0aG5hbWUuZW5kc1dpdGgoXCIubXAzXCIpLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiBcIkNhY2hlRmlyc3RcIixcclxuICAgICAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogXCJoZi1hdWRpby1jYWNoZVwiLFxyXG4gICAgICAgICAgICAgIHJhbmdlUmVxdWVzdHM6IHRydWUsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAyMDAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxyXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMCwgMjAwXSB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgLy8gXHUwNjM1XHUwNjQ4XHUwNjMxIFx1MDYzNVx1MDY0MVx1MDYyRFx1MDYyN1x1MDYyQSBcdTA2MjdcdTA2NDRcdTA2NDVcdTA2MzVcdTA2MkRcdTA2NDEgXHUwNjI3XHUwNjQ0XHUwNjQ1XHUwNjJEXHUwNjQ0XHUwNjRBXHUwNjI5XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9cXC9wYWdlc1xcLy4qXFwuKD86anBnfGpwZWd8cG5nKSQvLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiBcIkNhY2hlRmlyc3RcIixcclxuICAgICAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogXCJwYWdlcy1jYWNoZVwiLFxyXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogMzAwLCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzNjUgfSxcclxuICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzAsIDIwMF0gfSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIFx1MDYzNVx1MDY0OFx1MDYzMSBcdTA2MzVcdTA2NDFcdTA2MkRcdTA2MjdcdTA2MkEgXHUwNjI3XHUwNjQ0XHUwNjQ1XHUwNjM1XHUwNjJEXHUwNjQxIFx1MDY0NVx1MDY0NiBcdTA2MzNcdTA2NEFcdTA2MzFcdTA2NDFcdTA2MzEgSHVnZ2luZ0ZhY2UgXHUyMDE0IFx1MDYyQVx1MDY0Rlx1MDYyRFx1MDY0MVx1MDYzOCBcdTA2MjhcdTA2MzlcdTA2MkYgXHUwNjIzXHUwNjQ4XHUwNjQ0IFx1MDYzOVx1MDYzMVx1MDYzNiBcdTA2NDRcdTA2NDRcdTA2MzlcdTA2NDVcdTA2NDQgXHUwNjJGXHUwNjQ4XHUwNjQ2IFx1MDYyNVx1MDY0Nlx1MDYyQVx1MDYzMVx1MDY0Nlx1MDYyQVxyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAoeyB1cmwgfSkgPT4gdXJsLmhvc3RuYW1lLmluY2x1ZGVzKFwiaHVnZ2luZ2ZhY2UuY29cIikgJiYgL1xcL3BhZ2VzXFwvLipcXC4oPzpqcGd8anBlZ3xwbmcpLy50ZXN0KHVybC5wYXRobmFtZSksXHJcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiQ2FjaGVGaXJzdFwiLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcImhmLXBhZ2VzLWNhY2hlXCIsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAzMDAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxyXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMCwgMjAwXSB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgfSksXHJcbiAgXS5maWx0ZXIoQm9vbGVhbiksXHJcbiAgcmVzb2x2ZToge1xyXG4gICAgYWxpYXM6IHtcclxuICAgICAgXCJAXCI6IGZpbGVVUkxUb1BhdGgobmV3IFVSTChcIi4vc3JjXCIsIGltcG9ydC5tZXRhLnVybCkpLFxyXG4gICAgfSxcclxuICAgIGRlZHVwZTogW1wicmVhY3RcIiwgXCJyZWFjdC1kb21cIiwgXCJyZWFjdC9qc3gtcnVudGltZVwiLCBcInJlYWN0L2pzeC1kZXYtcnVudGltZVwiLCBcIkB0YW5zdGFjay9yZWFjdC1xdWVyeVwiLCBcIkB0YW5zdGFjay9xdWVyeS1jb3JlXCJdLFxyXG4gIH0sXHJcbiAgb3B0aW1pemVEZXBzOiB7XHJcbiAgICBleGNsdWRlOiBbXCJAcmlja3kwMTIzL3ZhZC13ZWJcIiwgXCJvbm54cnVudGltZS13ZWJcIl0sXHJcbiAgfSxcclxufSkpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXNPLFNBQVMsb0JBQW9CO0FBQ25RLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBSTFCLE9BQU8sUUFBUTtBQVY0SCxJQUFNLDJDQUEyQztBQVE1TCxJQUFNLGFBQWEsY0FBYyx3Q0FBZTtBQUNoRCxJQUFNLFlBQVksS0FBSyxRQUFRLFVBQVU7QUFHekMsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE9BQU87QUFBQSxFQUN6QyxNQUFNLFNBQVMsZ0JBQWdCLE1BQU0sUUFBUSxJQUFJLGlCQUFpQjtBQUFBLEVBQ2xFLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUlOLE1BQU07QUFBQSxJQUNOLEtBQUs7QUFBQSxNQUNILFNBQVM7QUFBQSxJQUNYO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixhQUFhLENBQUMsa0JBQWtCLGVBQWU7QUFBQSxJQUNqRDtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUlMLGVBQWU7QUFBQSxJQUNmLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQSxRQUNOLGFBQWEsSUFBSTtBQUNmLGNBQUksR0FBRyxTQUFTLHVCQUF1QixLQUFLLEdBQUcsU0FBUyxvQkFBb0IsR0FBRztBQUM3RSxtQkFBTztBQUFBLFVBQ1Q7QUFDQSxjQUFJLEdBQUcsU0FBUyxxQkFBcUIsS0FBSyxHQUFHLFNBQVMseUJBQXlCLEtBQUssR0FBRyxTQUFTLGdDQUFnQyxHQUFHO0FBQ2pJLG1CQUFPO0FBQUEsVUFDVDtBQUNBLGNBQUksR0FBRyxTQUFTLHlCQUF5QixHQUFHO0FBQzFDLG1CQUFPO0FBQUEsVUFDVDtBQUNBLGNBQUksR0FBRyxTQUFTLHlCQUF5QixHQUFHO0FBQzFDLG1CQUFPO0FBQUEsVUFDVDtBQUNBLGNBQUksR0FBRyxTQUFTLHlCQUF5QixHQUFHO0FBQzFDLG1CQUFPO0FBQUEsVUFDVDtBQUNBLGNBQUksR0FBRyxTQUFTLDRCQUE0QixHQUFHO0FBQzdDLG1CQUFPO0FBQUEsVUFDVDtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLElBQ0EsUUFBUTtBQUFBLElBQ1IsdUJBQXVCO0FBQUEsRUFDekI7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQO0FBQUEsTUFDRSxNQUFNO0FBQUE7QUFBQSxNQUVOLGdCQUFnQixRQUFhO0FBRTNCLGVBQU8sWUFBWSxJQUFJLG1CQUFtQixDQUFDLEtBQVUsUUFBYTtBQUNoRSxjQUFJLElBQUksV0FBVyxPQUFPO0FBQ3hCLGdCQUFJLFVBQVUsZ0JBQWdCLGtCQUFrQjtBQUNoRCxnQkFBSTtBQUNGLGtCQUFJLEdBQUcsV0FBVyxpQkFBaUIsR0FBRztBQUNwQyxzQkFBTSxVQUFVLEdBQUcsYUFBYSxtQkFBbUIsT0FBTztBQUMxRCxvQkFBSSxhQUFhO0FBQ2pCLG9CQUFJLElBQUksV0FBVyxJQUFJO0FBQUEsY0FDekIsT0FBTztBQUNMLG9CQUFJLGFBQWE7QUFDakIsb0JBQUksSUFBSSxJQUFJO0FBQUEsY0FDZDtBQUFBLFlBQ0YsU0FBUyxLQUFVO0FBQ2pCLGtCQUFJLGFBQWE7QUFDakIsa0JBQUksSUFBSSxLQUFLLFVBQVUsRUFBRSxPQUFPLElBQUksUUFBUSxDQUFDLENBQUM7QUFBQSxZQUNoRDtBQUNBO0FBQUEsVUFDRjtBQUVBLGNBQUksSUFBSSxXQUFXLFFBQVE7QUFDekIsZ0JBQUksT0FBTztBQUNYLGdCQUFJLEdBQUcsUUFBUSxDQUFDLFVBQWUsUUFBUSxLQUFLO0FBQzVDLGdCQUFJLEdBQUcsT0FBTyxNQUFNO0FBQ2xCLGtCQUFJO0FBQ0YsbUJBQUcsY0FBYyxtQkFBbUIsSUFBSTtBQUN4QyxvQkFBSSxVQUFVLGdCQUFnQixrQkFBa0I7QUFDaEQsb0JBQUksYUFBYTtBQUNqQixvQkFBSSxJQUFJLEtBQUssVUFBVSxFQUFFLFNBQVMsTUFBTSxTQUFTLFFBQVEsQ0FBQyxDQUFDO0FBQUEsY0FDN0QsU0FBUyxLQUFVO0FBQ2pCLG9CQUFJLGFBQWE7QUFDakIsb0JBQUksSUFBSSxLQUFLLFVBQVUsRUFBRSxPQUFPLElBQUksUUFBUSxDQUFDLENBQUM7QUFBQSxjQUNoRDtBQUFBLFlBQ0YsQ0FBQztBQUNEO0FBQUEsVUFDRjtBQUVBLGNBQUksYUFBYTtBQUNqQixjQUFJLElBQUksb0JBQW9CO0FBQUEsUUFDOUIsQ0FBQztBQUVELGVBQU8sWUFBWSxJQUFJLG1CQUFtQixPQUFPLEtBQVUsUUFBYTtBQUN0RSxjQUFJLElBQUksV0FBVyxRQUFRO0FBQ3pCLGdCQUFJLE9BQU87QUFFWCxnQkFBSSxHQUFHLFFBQVEsQ0FBQyxVQUFlLFFBQVEsS0FBSztBQUM1QyxnQkFBSSxHQUFHLE9BQU8sWUFBWTtBQUN4QixrQkFBSTtBQUNGLHNCQUFNLFVBQVUsS0FBSyxNQUFNLElBQUk7QUFDL0Isc0JBQU0sT0FBTyxNQUFNLE1BQU0saUNBQWlDO0FBQUEsa0JBQ3hELFFBQVE7QUFBQSxrQkFDUixTQUFTO0FBQUEsb0JBQ1AsaUJBQWlCLFVBQVUsUUFBUSxVQUFVLE9BQU8sS0FBSyxvREFBb0QsUUFBUSxFQUFFLFNBQVMsT0FBTyxDQUFDO0FBQUEsb0JBQ3hJLGdCQUFnQjtBQUFBLGtCQUNsQjtBQUFBLGtCQUNBLE1BQU0sS0FBSyxVQUFVLFFBQVEsSUFBSTtBQUFBLGdCQUNuQyxDQUFDO0FBQ0Qsc0JBQU0sT0FBTyxNQUFNLEtBQUssS0FBSztBQUM3QixvQkFBSSxVQUFVLGdCQUFnQixrQkFBa0I7QUFDaEQsb0JBQUksYUFBYSxLQUFLO0FBQ3RCLG9CQUFJLElBQUksS0FBSyxVQUFVLElBQUksQ0FBQztBQUFBLGNBRTlCLFNBQVMsS0FBVTtBQUNqQixvQkFBSSxhQUFhO0FBQ2pCLG9CQUFJLElBQUksS0FBSyxVQUFVLEVBQUUsT0FBTyxJQUFJLFFBQVEsQ0FBQyxDQUFDO0FBQUEsY0FDaEQ7QUFBQSxZQUNGLENBQUM7QUFBQSxVQUNILE9BQU87QUFDTCxnQkFBSSxhQUFhO0FBQ2pCLGdCQUFJLElBQUksb0JBQW9CO0FBQUEsVUFDOUI7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRjtBQUFBLElBQ0EsTUFBTTtBQUFBLElBQ04sVUFBVTtBQUFBLElBQ1YsU0FBUyxpQkFBaUIsZ0JBQWdCO0FBQUEsSUFDMUMsUUFBUTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsWUFBWTtBQUFBLE1BQ1osZ0JBQWdCO0FBQUEsUUFDZCxPQUFPLEtBQUssUUFBUSxXQUFXLHVCQUF1QjtBQUFBLFFBQ3RELGNBQWMsQ0FBQyxvQ0FBb0M7QUFBQSxRQUNuRCwrQkFBK0I7QUFBQSxRQUMvQixnQkFBZ0I7QUFBQSxNQUNsQjtBQUFBLE1BQ0EsNEJBQTRCO0FBQUEsUUFDMUIsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLE1BQ1Y7QUFBQSxNQUNBLDZCQUE2QjtBQUFBLFFBQzNCLGVBQWU7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNiO0FBQUEsTUFDRjtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1YsU0FBUztBQUFBLE1BQ1g7QUFBQSxNQUNBLGVBQWUsQ0FBQyxlQUFlLGdCQUFnQix1QkFBdUIsbUJBQW1CLGlCQUFpQjtBQUFBLE1BQzFHLFVBQVU7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLGFBQWE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLGtCQUFrQjtBQUFBLFFBQ2xCLFNBQVM7QUFBQSxRQUNULEtBQUs7QUFBQSxRQUNMLE1BQU07QUFBQSxRQUNOLFdBQVc7QUFBQSxRQUNYLE9BQU87QUFBQSxVQUNMO0FBQUEsWUFDRSxLQUFLO0FBQUEsWUFDTCxPQUFPO0FBQUEsWUFDUCxNQUFNO0FBQUEsVUFDUjtBQUFBLFVBQ0E7QUFBQSxZQUNFLEtBQUs7QUFBQSxZQUNMLE9BQU87QUFBQSxZQUNQLE1BQU07QUFBQSxVQUNSO0FBQUEsVUFDQTtBQUFBLFlBQ0UsS0FBSztBQUFBLFlBQ0wsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sU0FBUztBQUFBLFVBQ1g7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1AsK0JBQStCO0FBQUEsUUFDL0IsMEJBQTBCLENBQUMsV0FBVztBQUFBLFFBQ3RDLGNBQWMsQ0FBQyxvREFBb0Q7QUFBQSxRQUNuRSxnQkFBZ0I7QUFBQSxVQUNkO0FBQUEsWUFDRSxZQUFZO0FBQUEsWUFDWixTQUFTO0FBQUEsWUFDVCxTQUFTO0FBQUEsY0FDUCxXQUFXO0FBQUEsY0FDWCxlQUFlO0FBQUEsY0FDZixZQUFZLEVBQUUsWUFBWSxLQUFLLGVBQWUsS0FBSyxLQUFLLEtBQUssSUFBSTtBQUFBLGNBQ2pFLG1CQUFtQixFQUFFLFVBQVUsQ0FBQyxHQUFHLEdBQUcsRUFBRTtBQUFBLFlBQzFDO0FBQUEsVUFDRjtBQUFBLFVBQ0E7QUFBQTtBQUFBLFlBRUUsWUFBWSxDQUFDLEVBQUUsSUFBSSxNQUFNLElBQUksS0FBSyxTQUFTLHdDQUF3QztBQUFBLFlBQ25GLFNBQVM7QUFBQSxZQUNULFNBQVM7QUFBQSxjQUNQLFdBQVc7QUFBQSxjQUNYLGVBQWU7QUFBQSxjQUNmLFlBQVksRUFBRSxZQUFZLEtBQUssZUFBZSxLQUFLLEtBQUssS0FBSyxJQUFJO0FBQUEsY0FDakUsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLEdBQUcsR0FBRyxFQUFFO0FBQUEsWUFDMUM7QUFBQSxVQUNGO0FBQUEsVUFDQTtBQUFBO0FBQUEsWUFFRSxZQUFZLENBQUMsRUFBRSxJQUFJLE1BQU0sSUFBSSxTQUFTLFNBQVMsZ0JBQWdCLEtBQUssSUFBSSxTQUFTLFNBQVMsTUFBTTtBQUFBLFlBQ2hHLFNBQVM7QUFBQSxZQUNULFNBQVM7QUFBQSxjQUNQLFdBQVc7QUFBQSxjQUNYLGVBQWU7QUFBQSxjQUNmLFlBQVksRUFBRSxZQUFZLEtBQUssZUFBZSxLQUFLLEtBQUssS0FBSyxJQUFJO0FBQUEsY0FDakUsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLEdBQUcsR0FBRyxFQUFFO0FBQUEsWUFDMUM7QUFBQSxVQUNGO0FBQUEsVUFDQTtBQUFBO0FBQUEsWUFFRSxZQUFZO0FBQUEsWUFDWixTQUFTO0FBQUEsWUFDVCxTQUFTO0FBQUEsY0FDUCxXQUFXO0FBQUEsY0FDWCxZQUFZLEVBQUUsWUFBWSxLQUFLLGVBQWUsS0FBSyxLQUFLLEtBQUssSUFBSTtBQUFBLGNBQ2pFLG1CQUFtQixFQUFFLFVBQVUsQ0FBQyxHQUFHLEdBQUcsRUFBRTtBQUFBLFlBQzFDO0FBQUEsVUFDRjtBQUFBLFVBQ0E7QUFBQTtBQUFBLFlBRUUsWUFBWSxDQUFDLEVBQUUsSUFBSSxNQUFNLElBQUksU0FBUyxTQUFTLGdCQUFnQixLQUFLLGdDQUFnQyxLQUFLLElBQUksUUFBUTtBQUFBLFlBQ3JILFNBQVM7QUFBQSxZQUNULFNBQVM7QUFBQSxjQUNQLFdBQVc7QUFBQSxjQUNYLFlBQVksRUFBRSxZQUFZLEtBQUssZUFBZSxLQUFLLEtBQUssS0FBSyxJQUFJO0FBQUEsY0FDakUsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLEdBQUcsR0FBRyxFQUFFO0FBQUEsWUFDMUM7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNILEVBQUUsT0FBTyxPQUFPO0FBQUEsRUFDaEIsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxjQUFjLElBQUksSUFBSSxTQUFTLHdDQUFlLENBQUM7QUFBQSxJQUN0RDtBQUFBLElBQ0EsUUFBUSxDQUFDLFNBQVMsYUFBYSxxQkFBcUIseUJBQXlCLHlCQUF5QixzQkFBc0I7QUFBQSxFQUM5SDtBQUFBLEVBQ0EsY0FBYztBQUFBLElBQ1osU0FBUyxDQUFDLHNCQUFzQixpQkFBaUI7QUFBQSxFQUNuRDtBQUNGLEVBQUU7IiwKICAibmFtZXMiOiBbXQp9Cg==
