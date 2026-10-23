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
    host: "0.0.0.0",
    // 0.0.0.0 يقبل اتصالات من أي جهاز على نفس Wi-Fi (الهاتف عبر IPv4)
    port: 5173,
    strictPort: true,
    hmr: {
      overlay: false,
      clientPort: 5173,
    },
    warmup: {
      clientFiles: ['./src/main.tsx', './src/App.tsx']
    },
  },
  build: {
    // publicDir الافتراضي هو "public" — تُنسخ كل محتوياته إلى dist.
    // ملاحظة: مجلد النسخ الأصلية public/avatars/_originals مستثنى عبر .gitignore ولا يجب رفعه؛
    // ومن أراد تقليل حجم dist أكثر يحذفه قبل البناء (يُحتسب ~50MB).
    copyPublicDir: true,
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('src/data/quranText.ts')) {
            return 'quran-text';
          }
          if (id.includes('src/data/surahs.ts')) {
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
        },
        // تحميل متوازٍ أسرع للهاتف
        chunkFileNames: (chunkInfo) => {
          return `js/[name]-[hash].js`;
        },
      },
    },
  },
  plugins: [
    {
      name: 'save-boxes-plugin',
      buildStart() {
        try {
          const srcDir = path.resolve(__dirname, 'صفحة قران');
          const destDir = path.resolve(__dirname, 'public/pages');
          if (fs.existsSync(srcDir)) {
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            const files = fs.readdirSync(srcDir);
            for (const file of files) {
              fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
            }
          }
        } catch (e) {
          console.debug('Quran pages copy hook:', e);
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configureServer(server: any) {
        // 1. خدمة صفحات المصحف مباشرة وحياً من مجلد "صفحة قران"
        server.middlewares.use('/pages', (req: any, res: any, next: any) => {
          try {
            const rawName = decodeURIComponent((req.url || '').replace(/^\//, '').split('?')[0]);
            const quranFolder = path.resolve(__dirname, 'صفحة قران');
            const targetPath = path.join(quranFolder, rawName);
            if (rawName && fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
              const ext = path.extname(rawName).toLowerCase();
              const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
              res.setHeader('Content-Type', mime);
              res.setHeader('Cache-Control', 'no-cache');
              fs.createReadStream(targetPath).pipe(res);
              return;
            }
          } catch (e) {
            // fallback to next
          }
          next();
        });

        // 2. واجهة برمجية لجلب كافة الصفحات الموجودة فعلياً في مجلد "صفحة قران"
        server.middlewares.use('/api/quran-pages', (_req: any, res: any) => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const quranFolder = path.resolve(__dirname, 'صفحة قران');
            if (fs.existsSync(quranFolder)) {
              const files = fs.readdirSync(quranFolder)
                .filter((f: string) => /\.(jpe?g|png|webp)$/i.test(f))
                .sort((a: string, b: string) => {
                  const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
                  const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
                  return numA - numB;
                });
              res.statusCode = 200;
              res.end(JSON.stringify(files.map((f: string) => `/pages/${f}`)));
              return;
            }
            res.statusCode = 200;
            res.end('[]');
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        server.middlewares.use('/api/save-boxes', (req: any, res: any) => {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            try {
              if (fs.existsSync('ملف_التظليل/shading_data.json')) {
                const content = fs.readFileSync('ملف_التظليل/shading_data.json', 'utf-8');
                res.statusCode = 200;
                res.end(content || '{}');
              } else if (fs.existsSync('boxes-dump.json')) {
                const content = fs.readFileSync('boxes-dump.json', 'utf-8');
                res.statusCode = 200;
                res.end(content || '{}');
              } else if (fs.existsSync('src/data/shading/boxes-dump.json')) {
                const content = fs.readFileSync('src/data/shading/boxes-dump.json', 'utf-8');
                res.statusCode = 200;
                res.end(content || '{}');
              } else {
                res.statusCode = 200;
                res.end('{}');
              }
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => body += chunk);
            req.on('end', () => {
              try {
                // 1. الحفظ في المجلد المخصص داخل المشروع
                if (!fs.existsSync('ملف_التظليل')) {
                  fs.mkdirSync('ملف_التظليل', { recursive: true });
                }
                fs.writeFileSync('ملف_التظليل/shading_data.json', body);

                // 2. الحفظ في ملفات المشروع المصدرية والجذر
                fs.writeFileSync('boxes-dump.json', body);
                if (fs.existsSync('src/data/shading')) {
                  fs.writeFileSync('src/data/shading/boxes-dump.json', body);
                }

                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, message: 'saved in project files' }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          res.statusCode = 405;
          res.end('Method Not Allowed');
        });

        // 3. واجهة برمجية لحفظ توقيتات السور في ملفات المشروع والحاسوب
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        server.middlewares.use('/api/save-timings', (req: any, res: any) => {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            try {
              if (fs.existsSync('ملف_التظليل/timings_data.json')) {
                const content = fs.readFileSync('ملف_التظليل/timings_data.json', 'utf-8');
                res.statusCode = 200;
                res.end(content || '{}');
              } else if (fs.existsSync('src/data/shading/timings-dump.json')) {
                const content = fs.readFileSync('src/data/shading/timings-dump.json', 'utf-8');
                res.statusCode = 200;
                res.end(content || '{}');
              } else {
                res.statusCode = 200;
                res.end('{}');
              }
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => body += chunk);
            req.on('end', () => {
              try {
                if (!fs.existsSync('ملف_التظليل')) {
                  fs.mkdirSync('ملف_التظليل', { recursive: true });
                }
                fs.writeFileSync('ملف_التظليل/timings_data.json', body);
                if (fs.existsSync('src/data/shading')) {
                  fs.writeFileSync('src/data/shading/timings-dump.json', body);
                }
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, message: 'timings saved in project files' }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          res.statusCode = 405;
          res.end('Method Not Allowed');
        });

        // 4. واجهة برمجية لحفظ معلومات السور في ملفات المشروع والحاسوب
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        server.middlewares.use('/api/save-surah-info', (req: any, res: any) => {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            try {
              if (fs.existsSync('ملف_التظليل/surah_info_data.json')) {
                const content = fs.readFileSync('ملف_التظليل/surah_info_data.json', 'utf-8');
                res.statusCode = 200;
                res.end(content || '{}');
              } else if (fs.existsSync('src/data/shading/surah-info-dump.json')) {
                const content = fs.readFileSync('src/data/shading/surah-info-dump.json', 'utf-8');
                res.statusCode = 200;
                res.end(content || '{}');
              } else {
                res.statusCode = 200;
                res.end('{}');
              }
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => body += chunk);
            req.on('end', () => {
              try {
                if (!fs.existsSync('ملف_التظليل')) {
                  fs.mkdirSync('ملف_التظليل', { recursive: true });
                }
                fs.writeFileSync('ملف_التظليل/surah_info_data.json', body);
                if (fs.existsSync('src/data/shading')) {
                  fs.writeFileSync('src/data/shading/surah-info-dump.json', body);
                }
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, message: 'surah info saved in project files' }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          res.statusCode = 405;
          res.end('Method Not Allowed');
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
        maximumFileSizeToCacheInBytes: 1000000,
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
            // صور صفحات المصحف المحلية: لا تُخزَّن في الـ SW لمنع اكتساب腌-cache وتأخير التحديثات
            // (تحويل التخزين إلى تصفح مؤقت مباشر عبر الشبكة للملفات الثقيلة)
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
