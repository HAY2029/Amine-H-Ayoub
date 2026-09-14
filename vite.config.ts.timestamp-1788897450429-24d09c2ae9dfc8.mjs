// vite.config.ts
import { defineConfig } from "file:///H:/learn-quran-kids-1/node_modules/vite/dist/node/index.js";
import react from "file:///H:/learn-quran-kids-1/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { fileURLToPath } from "url";
import { componentTagger } from "file:///H:/learn-quran-kids-1/node_modules/lovable-tagger/dist/index.js";
import { VitePWA } from "file:///H:/learn-quran-kids-1/node_modules/vite-plugin-pwa/dist/index.js";
import { mcpPlugin } from "file:///H:/learn-quran-kids-1/node_modules/@lovable.dev/mcp-js/dist/stacks/supabase/vite.js";
import fs from "fs";
var __vite_injected_original_import_meta_url = "file:///H:/learn-quran-kids-1/vite.config.ts";
var __filename = fileURLToPath(__vite_injected_original_import_meta_url);
var __dirname = path.dirname(__filename);
var vite_config_default = defineConfig(({ mode }) => ({
  base: mode === "development" ? "/" : process.env.VITE_BASE_URL || "/",
  server: {
    host: "::",
    hmr: {
      overlay: false
    },
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/App.tsx"]
    }
  },
  build: {
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
          let body = "";
          req.on("data", (chunk) => body += chunk);
          req.on("end", () => {
            fs.writeFileSync("boxes-dump.json", body);
            res.end("saved");
          });
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
            // صور صفحات المصحف
            urlPattern: /\/pages\/.*\.(?:jpg|jpeg|png)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "pages-cache",
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJIOlxcXFxsZWFybi1xdXJhbi1raWRzLTFcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkg6XFxcXGxlYXJuLXF1cmFuLWtpZHMtMVxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vSDovbGVhcm4tcXVyYW4ta2lkcy0xL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcclxuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcclxuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gXCJ1cmxcIjtcclxuaW1wb3J0IHsgY29tcG9uZW50VGFnZ2VyIH0gZnJvbSBcImxvdmFibGUtdGFnZ2VyXCI7XHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tIFwidml0ZS1wbHVnaW4tcHdhXCI7XHJcbmltcG9ydCB7IG1jcFBsdWdpbiB9IGZyb20gXCJAbG92YWJsZS5kZXYvbWNwLWpzL3N0YWNrcy9zdXBhYmFzZS92aXRlXCI7XHJcblxyXG5jb25zdCBfX2ZpbGVuYW1lID0gZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpO1xyXG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoX19maWxlbmFtZSk7XHJcbmltcG9ydCBmcyBmcm9tIFwiZnNcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+ICh7XHJcbiAgYmFzZTogbW9kZSA9PT0gXCJkZXZlbG9wbWVudFwiID8gXCIvXCIgOiBwcm9jZXNzLmVudi5WSVRFX0JBU0VfVVJMIHx8IFwiL1wiLFxyXG4gIHNlcnZlcjoge1xyXG4gICAgaG9zdDogXCI6OlwiLFxyXG4gICAgaG1yOiB7XHJcbiAgICAgIG92ZXJsYXk6IGZhbHNlLFxyXG4gICAgfSxcclxuICAgIHdhcm11cDoge1xyXG4gICAgICBjbGllbnRGaWxlczogWycuL3NyYy9tYWluLnRzeCcsICcuL3NyYy9BcHAudHN4J11cclxuICAgIH1cclxuICB9LFxyXG4gIGJ1aWxkOiB7XHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIG1hbnVhbENodW5rcyhpZCkge1xyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdzcmMvZGF0YS9xdXJhblRleHQudHMnKSB8fCBpZC5pbmNsdWRlcygnc3JjL2RhdGEvc3VyYWhzLnRzJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdxdXJhbi1kYXRhJztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL3JlYWN0LycpIHx8IGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvcmVhY3QtZG9tLycpIHx8IGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvcmVhY3Qtcm91dGVyLWRvbS8nKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ3ZlbmRvci1yZWFjdCc7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy9AcmFkaXgtdWkvJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItcmFkaXgnO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvQHN1cGFiYXNlLycpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAndmVuZG9yLXN1cGFiYXNlJztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL0B0YW5zdGFjay8nKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ3ZlbmRvci10YW5zdGFjayc7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy9sdWNpZGUtcmVhY3QvJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItaWNvbnMnO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIG1pbmlmeTogJ2VzYnVpbGQnLFxyXG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiAxMDAwLFxyXG4gIH0sXHJcbiAgcGx1Z2luczogW1xyXG4gICAge1xyXG4gICAgICBuYW1lOiAnc2F2ZS1ib3hlcy1wbHVnaW4nLFxyXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxyXG4gICAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyOiBhbnkpIHtcclxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxyXG4gICAgICAgIHNlcnZlci5taWRkbGV3YXJlcy51c2UoJy9hcGkvc2F2ZS1ib3hlcycsIChyZXE6IGFueSwgcmVzOiBhbnkpID0+IHtcclxuICAgICAgICAgIGxldCBib2R5ID0gJyc7XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxyXG4gICAgICAgICAgcmVxLm9uKCdkYXRhJywgKGNodW5rOiBhbnkpID0+IGJvZHkgKz0gY2h1bmspO1xyXG4gICAgICAgICAgcmVxLm9uKCdlbmQnLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoJ2JveGVzLWR1bXAuanNvbicsIGJvZHkpO1xyXG4gICAgICAgICAgICByZXMuZW5kKCdzYXZlZCcpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcclxuICAgICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKCcvYXBpL3NlbmQtZW1haWwnLCBhc3luYyAocmVxOiBhbnksIHJlczogYW55KSA9PiB7XHJcbiAgICAgICAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ1BPU1QnKSB7XHJcbiAgICAgICAgICAgIGxldCBib2R5ID0gJyc7XHJcbiAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XHJcbiAgICAgICAgICAgIHJlcS5vbignZGF0YScsIChjaHVuazogYW55KSA9PiBib2R5ICs9IGNodW5rKTtcclxuICAgICAgICAgICAgcmVxLm9uKCdlbmQnLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzcCA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwaS5yZXNlbmQuY29tL2VtYWlscycsIHtcclxuICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgICAgICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtwYXlsb2FkLmFwaUtleSB8fCBCdWZmZXIuZnJvbSgnY21WZlZIRkJkbEZCWlU1ZlJYbGxkMEpqYTNaYVIyUnhSazB4VERoaVZVeDNWRUp4JywgJ2Jhc2U2NCcpLnRvU3RyaW5nKCd1dGYtOCcpfWAsXHJcbiAgICAgICAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ1xyXG4gICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkLmRhdGEpXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwLmpzb24oKTtcclxuICAgICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qc29uJyk7XHJcbiAgICAgICAgICAgICAgICByZXMuc3RhdHVzQ29kZSA9IHJlc3Auc3RhdHVzO1xyXG4gICAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeShkYXRhKSk7XHJcbiAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcclxuICAgICAgICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xyXG4gICAgICAgICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSA1MDA7XHJcbiAgICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSA0MDU7XHJcbiAgICAgICAgICAgIHJlcy5lbmQoJ01ldGhvZCBOb3QgQWxsb3dlZCcpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgcmVhY3QoKSxcclxuICAgIG1jcFBsdWdpbigpLFxyXG4gICAgbW9kZSA9PT0gXCJkZXZlbG9wbWVudFwiICYmIGNvbXBvbmVudFRhZ2dlcigpLFxyXG4gICAgVml0ZVBXQSh7XHJcbiAgICAgIHJlZ2lzdGVyVHlwZTogXCJhdXRvVXBkYXRlXCIsXHJcbiAgICAgIHNyY0RpcjogXCJzcmNcIixcclxuICAgICAgZmlsZW5hbWU6IFwic2VydmljZS13b3JrZXIuanNcIixcclxuICAgICAgc3RyYXRlZ2llczogXCJpbmplY3RNYW5pZmVzdFwiLFxyXG4gICAgICBpbmplY3RNYW5pZmVzdDoge1xyXG4gICAgICAgIHN3U3JjOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcInNyYy9zZXJ2aWNlLXdvcmtlci5qc1wiKSxcclxuICAgICAgICBnbG9iUGF0dGVybnM6IFtcIioqLyoue2pzLGNzcyxodG1sLGljbyx3ZWJtYW5pZmVzdH1cIl0sXHJcbiAgICAgICAgbWF4aW11bUZpbGVTaXplVG9DYWNoZUluQnl0ZXM6IDUwMDAwMDAsXHJcbiAgICAgICAgaW5qZWN0aW9uUG9pbnQ6IFwic2VsZi5fX1dCX01BTklGRVNUXCIsXHJcbiAgICAgIH0sXHJcbiAgICAgIGluamVjdE1hbmlmZXN0QnVpbGRPcHRpb25zOiB7XHJcbiAgICAgICAgbWluaWZ5OiBmYWxzZSxcclxuICAgICAgICBzb3VyY2VtYXA6IGZhbHNlLFxyXG4gICAgICAgIHRhcmdldDogXCJlc25leHRcIixcclxuICAgICAgfSxcclxuICAgICAgaW5qZWN0TWFuaWZlc3RSb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICAgICAgdHJlZXNoYWtlOiBmYWxzZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgICBkZXZPcHRpb25zOiB7XHJcbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXHJcbiAgICAgIH0sXHJcbiAgICAgIGluY2x1ZGVBc3NldHM6IFtcImZhdmljb24uaWNvXCIsIFwibXktcGhvdG8ucG5nXCIsIFwiYmFja2dyb3VuZC1raWRzLmpwZ1wiLCBcInB3YS0xOTJ4MTkyLnBuZ1wiLCBcInB3YS01MTJ4NTEyLnBuZ1wiXSxcclxuICAgICAgbWFuaWZlc3Q6IHtcclxuICAgICAgICBuYW1lOiBcIlx1MDYyRFx1MDYyN1x1MDYyQyBcdTA2MjNcdTA2NEFcdTA2NDhcdTA2MjggXHUwNjIzXHUwNjQ1XHUwNjRBXHUwNjQ2XCIsXHJcbiAgICAgICAgc2hvcnRfbmFtZTogXCJcdTA2MkRcdTA2MjdcdTA2MkMgXHUwNjIzXHUwNjRBXHUwNjQ4XHUwNjI4IFx1MDYyM1x1MDY0NVx1MDY0QVx1MDY0NlwiLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1MDYyQVx1MDYzN1x1MDYyOFx1MDY0QVx1MDY0MiBcdTA2MkFcdTA2MzlcdTA2NDRcdTA2NEFcdTA2NDVcdTA2NEEgXHUwNjQ0XHUwNjJBXHUwNjMxXHUwNjQxXHUwNjRBXHUwNjQ3IFx1MDYyN1x1MDY0NFx1MDYzN1x1MDY0MVx1MDY0NCBcdTA2MjhcdTA2MzlcdTA2MkYgXHUwNjQyXHUwNjMxXHUwNjI3XHUwNjIxXHUwNjI5IFx1MDYyN1x1MDY0NFx1MDY0Mlx1MDYzMVx1MDYyMlx1MDY0NlwiLFxyXG4gICAgICAgIHRoZW1lX2NvbG9yOiBcIiNEMkI0OENcIixcclxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiBcIiNGNUY1RENcIixcclxuICAgICAgICBkaXNwbGF5OiBcInN0YW5kYWxvbmVcIixcclxuICAgICAgICBkaXI6IFwicnRsXCIsXHJcbiAgICAgICAgbGFuZzogXCJhclwiLFxyXG4gICAgICAgIHN0YXJ0X3VybDogXCIvXCIsXHJcbiAgICAgICAgaWNvbnM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiBcIi9wd2EtMTkyeDE5Mi5wbmdcIixcclxuICAgICAgICAgICAgc2l6ZXM6IFwiMTkyeDE5MlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImltYWdlL3BuZ1wiLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiBcIi9wd2EtNTEyeDUxMi5wbmdcIixcclxuICAgICAgICAgICAgc2l6ZXM6IFwiNTEyeDUxMlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImltYWdlL3BuZ1wiLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3JjOiBcIi9wd2EtNTEyeDUxMi5wbmdcIixcclxuICAgICAgICAgICAgc2l6ZXM6IFwiNTEyeDUxMlwiLFxyXG4gICAgICAgICAgICB0eXBlOiBcImltYWdlL3BuZ1wiLFxyXG4gICAgICAgICAgICBwdXJwb3NlOiBcIm1hc2thYmxlXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0sXHJcbiAgICAgIHdvcmtib3g6IHtcclxuICAgICAgICBtYXhpbXVtRmlsZVNpemVUb0NhY2hlSW5CeXRlczogNTAwMDAwMCxcclxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrRGVueWxpc3Q6IFsvXlxcL35vYXV0aC9dLFxyXG4gICAgICAgIGdsb2JQYXR0ZXJuczogW1wiKiovKi57anMsY3NzLGh0bWwsaWNvLHBuZyxqcGcsanBlZyxzdmcsd29mZix3b2ZmMn1cIl0sXHJcbiAgICAgICAgcnVudGltZUNhY2hpbmc6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogL15cXC9hdWRpb1xcLy4qXFwubXAzJC8sXHJcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiQ2FjaGVGaXJzdFwiLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcImF1ZGlvLWNhY2hlXCIsXHJcbiAgICAgICAgICAgICAgcmFuZ2VSZXF1ZXN0czogdHJ1ZSxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDUwMCwgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMzY1IH0sXHJcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBcdTA2MzVcdTA2NDhcdTA2MkEgXHUwNjI3XHUwNjQ0XHUwNjMzXHUwNjQ4XHUwNjMxIFx1MDYyN1x1MDY0NFx1MDYzM1x1MDYyRFx1MDYyN1x1MDYyOFx1MDY0QSAoU3VwYWJhc2UpIFx1MjAxNCBcdTA2NEFcdTA2NEZcdTA2MkRcdTA2NDFcdTA2MzggXHUwNjI4XHUwNjM5XHUwNjJGIFx1MDYyM1x1MDY0OFx1MDY0NCBcdTA2MkFcdTA2MzRcdTA2M0FcdTA2NEFcdTA2NDQgXHUwNjQ0XHUwNjQ0XHUwNjM5XHUwNjQ1XHUwNjQ0IFx1MDYyRlx1MDY0OFx1MDY0NiBcdTA2MjVcdTA2NDZcdTA2MkFcdTA2MzFcdTA2NDZcdTA2MkFcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsIH0pID0+IHVybC5ocmVmLmluY2x1ZGVzKFwiL3N0b3JhZ2UvdjEvb2JqZWN0L3B1YmxpYy9xdXJhbi1hdWRpby9cIiksXHJcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiQ2FjaGVGaXJzdFwiLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcImNsb3VkLWF1ZGlvLWNhY2hlXCIsXHJcbiAgICAgICAgICAgICAgcmFuZ2VSZXF1ZXN0czogdHJ1ZSxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDUwMCwgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMzY1IH0sXHJcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBcdTA2MzVcdTA2NDhcdTA2MkEgXHUwNjI3XHUwNjQ0XHUwNjMzXHUwNjQ4XHUwNjMxIFx1MDY0NVx1MDY0NiBIdWdnaW5nRmFjZSBcdTIwMTQgXHUwNjRBXHUwNjRGXHUwNjJEXHUwNjQxXHUwNjM4IFx1MDYyOFx1MDYzOVx1MDYyRiBcdTA2MjNcdTA2NDhcdTA2NDQgXHUwNjJBXHUwNjM0XHUwNjNBXHUwNjRBXHUwNjQ0IFx1MDY0NFx1MDY0NFx1MDYzOVx1MDY0NVx1MDY0NCBcdTA2MkZcdTA2NDhcdTA2NDYgXHUwNjI1XHUwNjQ2XHUwNjJBXHUwNjMxXHUwNjQ2XHUwNjJBXHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46ICh7IHVybCB9KSA9PiB1cmwuaG9zdG5hbWUuaW5jbHVkZXMoXCJodWdnaW5nZmFjZS5jb1wiKSAmJiB1cmwucGF0aG5hbWUuZW5kc1dpdGgoXCIubXAzXCIpLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiBcIkNhY2hlRmlyc3RcIixcclxuICAgICAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogXCJoZi1hdWRpby1jYWNoZVwiLFxyXG4gICAgICAgICAgICAgIHJhbmdlUmVxdWVzdHM6IHRydWUsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAyMDAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxyXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMCwgMjAwXSB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgLy8gXHUwNjM1XHUwNjQ4XHUwNjMxIFx1MDYzNVx1MDY0MVx1MDYyRFx1MDYyN1x1MDYyQSBcdTA2MjdcdTA2NDRcdTA2NDVcdTA2MzVcdTA2MkRcdTA2NDFcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogL1xcL3BhZ2VzXFwvLipcXC4oPzpqcGd8anBlZ3xwbmcpJC8sXHJcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiQ2FjaGVGaXJzdFwiLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcInBhZ2VzLWNhY2hlXCIsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAzMDAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxyXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMCwgMjAwXSB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgfSksXHJcbiAgXS5maWx0ZXIoQm9vbGVhbiksXHJcbiAgcmVzb2x2ZToge1xyXG4gICAgYWxpYXM6IHtcclxuICAgICAgXCJAXCI6IGZpbGVVUkxUb1BhdGgobmV3IFVSTChcIi4vc3JjXCIsIGltcG9ydC5tZXRhLnVybCkpLFxyXG4gICAgfSxcclxuICAgIGRlZHVwZTogW1wicmVhY3RcIiwgXCJyZWFjdC1kb21cIiwgXCJyZWFjdC9qc3gtcnVudGltZVwiLCBcInJlYWN0L2pzeC1kZXYtcnVudGltZVwiLCBcIkB0YW5zdGFjay9yZWFjdC1xdWVyeVwiLCBcIkB0YW5zdGFjay9xdWVyeS1jb3JlXCJdLFxyXG4gIH0sXHJcbiAgb3B0aW1pemVEZXBzOiB7XHJcbiAgICBleGNsdWRlOiBbXCJAcmlja3kwMTIzL3ZhZC13ZWJcIiwgXCJvbm54cnVudGltZS13ZWJcIl0sXHJcbiAgfSxcclxufSkpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXFQLFNBQVMsb0JBQW9CO0FBQ2xSLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBSTFCLE9BQU8sUUFBUTtBQVZzSSxJQUFNLDJDQUEyQztBQVF0TSxJQUFNLGFBQWEsY0FBYyx3Q0FBZTtBQUNoRCxJQUFNLFlBQVksS0FBSyxRQUFRLFVBQVU7QUFHekMsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE9BQU87QUFBQSxFQUN6QyxNQUFNLFNBQVMsZ0JBQWdCLE1BQU0sUUFBUSxJQUFJLGlCQUFpQjtBQUFBLEVBQ2xFLFFB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
