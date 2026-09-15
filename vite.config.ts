import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import fs from "fs";

export default defineConfig(({ mode }) => ({
  base: mode === "development" ? "/" : process.env.VITE_BASE_URL || "/",
  server: {
    host: "::",
    hmr: {
      overlay: false,
    },
    warmup: {
      clientFiles: ['./src/main.tsx', './src/App.tsx']
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('src/data/quranText.ts') || id.includes('src/data/surahs.ts')) {
            return 'quran-data';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@radix-ui/')) {
            return 'vendor-radix';
          }
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/@tanstack/')) {
            return 'vendor-tanstack';
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
        }
      }
    },
    minify: 'esbuild',
    chunkSizeWarningLimit: 1000,
  },
  plugins: [
    {
      name: 'save-boxes-plugin',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configureServer(server: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        server.middlewares.use('/api/save-boxes', (req: any, res: any) => {
          let body = '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          req.on('data', (chunk: any) => body += chunk);
          req.on('end', () => {
            fs.writeFileSync('boxes-dump.json', body);
            res.end('saved');
          });
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        server.middlewares.use('/api/send-email', async (req: any, res: any) => {
          if (req.method === 'POST') {
            let body = '';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            req.on('data', (chunk: any) => body += chunk);
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body);
                const resp = await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${payload.apiKey || Buffer.from('cmVfVHFBdlFBZU5fRXlld0Jja3ZaR2RxRk0xTDhiVUx3VEJx', 'base64').toString('utf-8')}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(payload.data)
                });
                const data = await resp.json();
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = resp.status;
                res.end(JSON.stringify(data));
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            res.statusCode = 405;
            res.end('Method Not Allowed');
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
        maximumFileSizeToCacheInBytes: 5000000,
        injectionPoint: "self.__WB_MANIFEST",
      },
      injectManifestBuildOptions: {
        minify: false,
        sourcemap: false,
        target: "esnext",
      },
      injectManifestRollupOptions: {
        rollupOptions: {
          treeshake: false,
        },
      },
      devOptions: {
        enabled: false,
      },
      includeAssets: ["favicon.ico", "my-photo.png", "background-kids.jpg", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        name: "حاج أيوب أمين",
        short_name: "حاج أيوب أمين",
        description: "تطبيق تعليمي لترفيه الطفل بعد قراءة القرآن",
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
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000,
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
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // صوت السور السحابي (Supabase) — يُحفظ بعد أول تشغيل للعمل دون إنترنت
            urlPattern: ({ url }) => url.href.includes("/storage/v1/object/public/quran-audio/"),
            handler: "CacheFirst",
            options: {
              cacheName: "cloud-audio-cache",
              rangeRequests: true,
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // صوت السور من HuggingFace — يُحفظ بعد أول تشغيل للعمل دون إنترنت
            urlPattern: ({ url }) => url.hostname.includes("huggingface.co") && url.pathname.endsWith(".mp3"),
            handler: "CacheFirst",
            options: {
              cacheName: "hf-audio-cache",
              rangeRequests: true,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // صور صفحات المصحف المحلية
            urlPattern: /\/pages\/.*\.(?:jpg|jpeg|png)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "pages-cache",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // صور صفحات المصحف من سيرفر HuggingFace — تُحفظ بعد أول عرض للعمل دون إنترنت
            urlPattern: ({ url }) => url.hostname.includes("huggingface.co") && /\/pages\/.*\.(?:jpg|jpeg|png)/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "hf-pages-cache",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  optimizeDeps: {
    exclude: ["@ricky0123/vad-web", "onnxruntime-web"],
  },
}));
