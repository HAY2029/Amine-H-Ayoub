export const HF_IMAGES_REPO = "hammoualiyoucef20/quran-images"; // قم بتغيير هذا إذا كان المستودع مختلفاً
export const HF_IMAGES_BASE = `https://huggingface.co/datasets/${HF_IMAGES_REPO}/resolve/main`;

// يمكنك إضافة الرمز الخاص بك هنا مباشرة ليعمل التطبيق بدون أي واجهات تعقيدية
const HARDCODED_TOKEN = ""; // مثال: "hf_xxxxxxxxxxxxxxxxxxx"

export interface HFImage {
  name: string;
  url: string;
  pageNumber: number;
  /** مصدر الصورة: huggingface | supabase | local — للعرض في مدير الصور */
  source?: "huggingface" | "supabase" | "local";
}

export function getHFToken(): string | null {
  if (HARDCODED_TOKEN) return HARDCODED_TOKEN;
  try {
    return (
      localStorage.getItem("hf_token") ||
      (import.meta as any)?.env?.VITE_HF_TOKEN ||
      null
    );
  } catch {
    return (import.meta as any)?.env?.VITE_HF_TOKEN || null;
  }
}

export function setHFToken(token: string) {
  try {
    if (token) {
      localStorage.setItem("hf_token", token);
    } else {
      localStorage.removeItem("hf_token");
    }
  } catch { /* ignore */ }
  // عند تغيير التوكن نُعيد فحص المستودع فوراً (قد يصبح متاحاً بالتوكن الصحيح)
  _repoBadUntil = 0;
  try { localStorage.removeItem(HF_BAD_KEY); } catch { /* ignore */ }
  clearHFImagesCache();
}

const HF_LIST_PATH = "pages";

// صفحات مصحف موجودة فعلياً في public/pages (مؤكدة محلياً — تعمل حتى أوفلاين)
// تشمل جزء عمّ/تبارك: من النبأ (581) إلى الناس (604) + الفاتحة
const LOCAL_PAGES = [
  "fatiha.jpg",
  ...[581, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598].map(n => `${n}.jpg`),
  ...[600, 601, 602, 603, 604].map(n => `${n}.jpg`),
];

// صفحات ناقصة محلياً — تُفحص من سيرفر HuggingFace فقط (لا نصنع صوراً وهمية لها
// محلياً أبداً حتى لا تظهر صفحات فارغة/سوداء إذا كان المستودع خاصاً بلا توكن)
const SERVER_PAGES = [
  ...[582, 583, 584, 599].map(n => `${n}.jpg`),
];

// كل الصفحات المعروفة — تُستخدم لفحص HEAD من السيرفر
const KNOWN_PAGES = [...LOCAL_PAGES, ...SERVER_PAGES];

// كاش خفيف لتفادي إعادة الجلب المتكرر
let _cache: { at: number; imgs: HFImage[] } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// ─── حماية من إغراق الشبكة ───────────────
// 1) قفل ضد الطلبات المتزامنة: لا يخرج أكثر من طلب واحد فعلي للشبكة في لحظة.
let _inFlight: Promise<HFImage[]> | null = null;

// 2) كاش "حالة المستودع": إذا كان المستودع محذوفاً (404) أو خاصاً بلا توكن (401)
//    نُسجّل ذلك ولا نُعيد المحاولة لمدة 30 دقيقة — يمنع سبام 404/401 في الكونسول
//    ويسرّع التحميل الفوري من Supabase + المحلي.
const HF_BAD_KEY = "hf:repo-bad-until";
const REPO_BAD_MS = 30 * 60 * 1000;
let _repoBadUntil = readRepoBadUntil();

function readRepoBadUntil(): number {
  try {
    const raw = localStorage.getItem(HF_BAD_KEY);
    if (raw) {
      const t = parseInt(raw, 10);
      if (!isNaN(t)) return t;
    }
  } catch { /* ignore */ }
  return 0;
}

function markRepoUnavailable() {
  _repoBadUntil = Date.now() + REPO_BAD_MS;
  try { localStorage.setItem(HF_BAD_KEY, String(_repoBadUntil)); } catch { /* ignore */ }
}

const HF_TOKEN_KEYS = ["hf_token", "VITE_HF_TOKEN", "hf:token"] as const;

function readStoredHfToken(): string {
  if (typeof window === "undefined") return "";
  if (HARDCODED_TOKEN) return HARDCODED_TOKEN;
  for (const k of HF_TOKEN_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v && v.trim().length > 4) return v.trim();
    } catch { /* ignore */ }
  }
  return "";
}

/** رقم الصفحة من الاسم — الفاتحة = 1 (ترتيبها أول شيء)، غير المرقّم = 0 */
function pageNumFromName(name: string): number {
  const m = name.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  if (/fatiha/i.test(name)) return 1;
  return 0;
}

function toHFImage(name: string, url: string, source: HFImage["source"] = "huggingface"): HFImage {
  return { name, url, pageNumber: pageNumFromName(name), source };
}

function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function headOk(url: string, token = ""): Promise<boolean> {
  const headers = authHeaders(token);
  try {
    const h = await fetch(url, { method: "HEAD", cache: "no-store", headers });
    if (h.ok) return true;
  } catch { /* ignore — جرّب GET خفيف */ }
  try {
    // بعض السيرفرات ترفض HEAD — جرّب GET لأول بايت فقط
    const g = await fetch(url, { headers: { ...headers, Range: "bytes=0-0" }, cache: "no-store" });
    return g.ok || g.status === 206;
  } catch {
    return false;
  }
}

// كاش Blob URLs للصور الخاصة (حتى لا نعيد تحميل نفس الصورة)
const _blobCache = new Map<string, string>();

/**
 * جلب صورة خاصة من HF عبر fetch مصادق وتحويلها إلى Blob URL.
 * وسم <img> لا يرسل Authorization header، لذلك هذه هي الطريقة الوحيدة
 * لعرض صور مستودع خاص في المتصفح.
 */
export async function fetchHFImageBlob(url: string, token: string): Promise<string | null> {
  if (!token) return null;
  const cached = _blobCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url, { headers: authHeaders(token), cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    _blobCache.set(url, objUrl);
    return objUrl;
  } catch {
    return null;
  }
}

/**
 * تحويل قائمة صور HF (روابط مباشرة) إلى روابط قابلة للعرض:
 * - مستودع عام: نفس الرابط يعمل مباشرة.
 * - مستودع خاص + توكن: جلب Blob مصادق لكل صورة.
 * - مستودع خاص بلا توكن: تُستبعد الصورة (تُعوَّض بـ Supabase/المحلي).
 */
export async function resolveHFDisplayUrls(imgs: { name: string; url: string }[], token: string): Promise<HFImage[]> {
  if (!token) return []; // بلا توكن لا يمكن عرض صور مستودع خاص
  const out: HFImage[] = [];
  // جلب متوازٍ محدود لتفادي إغراق الشبكة
  const CONC = 6;
  for (let i = 0; i < imgs.length; i += CONC) {
    const batch = imgs.slice(i, i + CONC);
    const resolved = await Promise.all(
      batch.map(async (f) => {
        const blobUrl = await fetchHFImageBlob(f.url, token);
        if (!blobUrl) return null;
        const m = f.name.match(/(\d+)/);
        return { name: f.name, url: blobUrl, pageNumber: pageNumFromName(f.name), source: "huggingface" as const };
      })
    );
    for (const r of resolved) if (r) out.push(r);
  }
  return out;
}

/**
 * جلب كل صور صفحات المصحف من كل السيرفرات + البدائل المحلية.
 * الترتيب: 1) HuggingFace  2) Supabase (store base64 + bucket mushaf-images)
 *           3) ملفات public/pages المحلية.
 * المستودع خاص (401) → تُجلب الصور عبر fetch مصادق (Blob URLs) إن وُجد توكن،
 * وإلا تُعوَّض بـ Supabase/المحلي — لا روابط HF مكسورة أبداً.
 * تُوسم كل صورة بمصدرها (source) ليُعرض في مدير الصور.
 */
export async function fetchHuggingFaceImages(): Promise<HFImage[]> {
  // قفل ضد الطلبات المتزامنة — إن كان طلب جارٍ أعِد نفس النتيجة (لا استدعاءات مكررة)
  if (_inFlight) return _inFlight;
  _inFlight = doFetchHuggingFaceImages();
  try {
    return await _inFlight;
  } finally {
    _inFlight = null;
  }
}

async function doFetchHuggingFaceImages(): Promise<HFImage[]> {
  if (Date.now() < _repoBadUntil) {
    // المستودع معروف أنه غير متاح مؤخراً → لا نرسل أي طلب HF إطلاقاً،
    // نبني مباشرة من Supabase + المحلي (سرعة فائقة + لا 404 في الكونسول).
    try {
      if (_cache && Date.now() - _cache.at < CACHE_TTL) return _cache.imgs;
    } catch { /* ignore */ }
    return await buildSupabaseAndLocalOnly();
  }

  try {
    if (_cache && Date.now() - _cache.at < CACHE_TTL) return _cache.imgs;
  } catch { /* ignore */ }

  const merged = new Map<string, HFImage>(); // key = clean file name
  const cleanKey = (n: string) => n.replace(/^pages\//, "").replace(/^\/pages\//, "");

  const token = readStoredHfToken();

  // 1) محاولة API الرسمي (يعمل بدون توكن للمستودعات العامة)
  let apiFiles: { name: string; url: string }[] = [];
  let apiPublic = false;
  let apiPrivate = false;
  try {
    const headers: Record<string, string> = authHeaders(token);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(`https://huggingface.co/api/datasets/${HF_IMAGES_REPO}/tree/main/${HF_LIST_PATH}?t=${Date.now()}`, {
      headers, signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      const tree = await res.json();
      const imageFiles = (Array.isArray(tree) ? tree : []).filter((file: any) =>
        file && file.type !== "directory" && typeof file.path === "string" &&
        (file.path.endsWith(".jpg") || file.path.endsWith(".jpeg") || file.path.endsWith(".png") || file.path.endsWith(".webp"))
      );
      apiFiles = imageFiles.map((file: any) => ({ name: file.path, url: `${HF_IMAGES_BASE}/${file.path}` }));
      if (apiFiles.length > 0) console.debug(`[HF] API found ${apiFiles.length} images`);
      else console.debug("[HF] API returned no images — trying fallbacks");
    } else if (res.status === 401 || res.status === 403) {
      apiPrivate = true;
      console.debug(`[HF] dataset is private or needs token (HTTP ${res.status})`);
      if (!token) markRepoUnavailable(); // خاص بلا توكن → لا داعي لإعادة المحاولة
    } else if (res.status === 404) {
      // المستودع محذوف/غير موجود — لا نعيد المحاولة لفترة (يمنع سبام 404)
      console.debug("[HF] dataset not found (404) — marking repo unavailable");
      markRepoUnavailable();
    } else {
      console.debug("[HF] list failed:", res.status, res.statusText);
    }
  } catch (error) {
    console.debug("[HF] Error fetching images (offline?):", error);
  }

  // 1-ب) تحويل روابط API إلى روابط قابلة للعرض فعلياً
  if (apiFiles.length > 0) {
    // اختبار: هل الرابط المباشر يعمل بدون توكن؟ (مستودع عام)
    const probeOk = await headOk(apiFiles[0].url, "");
    if (probeOk) {
      apiPublic = true;
      for (const f of apiFiles) merged.set(cleanKey(f.name), toHFImage(f.name, f.url, "huggingface"));
    } else if (token) {
      // مستودع خاص + توكن موجود → جلب Blob مصادق لكل صورة
      const resolved = await resolveHFDisplayUrls(apiFiles, token);
      for (const img of resolved) merged.set(cleanKey(img.name), img);
      console.debug(`[HF] private repo: resolved ${resolved.length}/${apiFiles.length} via authenticated fetch`);
    } else {
      console.debug("[HF] private repo without token — skipping HF images (Supabase/local will cover)");
    }
  }

  // 2) Supabase: كل الصور المحفوظة على سيرفر التطبيق (store base64 + bucket)
  // حتى لو كان مستودع HF خاصاً أو بلا توكن — صور السيرفر تظهر هنا.
  try {
    const { getAllPageImages, syncAllPageImagesFromServer } = await import("../data/customPages");
    const imgs = await syncAllPageImagesFromServer().catch(() => getAllPageImages().catch(() => ({} as Record<string, string>)));
    for (const [src, url] of Object.entries(imgs)) {
      if (!url || typeof url !== "string") continue;
      // الصور المخصصة (custom:) تُترك للقارئ عبر customImgs — إدراجها هنا
      // ينتج صفحة مكررة بمفتاح خاطئ (pages/custom:...) بلا مناطق/مربعات
      if (src.startsWith("custom:") || src.startsWith("/custom:")) continue;
      // src قد يكون /pages/600.jpg أو اسم ملف خام
      const rawName = src.startsWith("/pages/") ? src.slice("/pages/".length)
        : src.startsWith("pages/") ? src.slice("pages/".length)
        : src;
      const key = cleanKey(rawName);
      if (!merged.has(key)) {
        merged.set(key, { name: `pages/${rawName}`, url, pageNumber: parseInt(rawName.replace(/\D/g, "")) || 0, source: "supabase" });
      }
    }
    if (merged.size > 0) console.debug(`[HF] merged Supabase images, total so far: ${merged.size}`);
  } catch (e) {
    console.debug("[HF] Supabase merge failed:", e);
  }

  // 3) اكتشاف صفحات HF المعروفة عبر HEAD **مصادق** (يكشف ملفات قد يخفيها tree)
  // يُشغَّل فقط إذا أثبت الـ API أن المستودع موجود فعلاً ويمكن الوصول إليه:
  //   - مستودع عام (apiPublic) → فحص بلا توكن
  //   - مستودع خاص + توكن (apiPrivate && token) → فحص مصادق
  // في أي حالة أخرى (404/غير موجود، خاص بلا توكن، offline، خطأ سيرفر) لا نرسل
  // أي طلب HEAD إطلاقاً — منعاً لموجة أخطاء 404 المتكررة عند كل تحديث.
  if (apiPublic || (apiPrivate && token)) {
    try {
      const checks = await Promise.all(
        KNOWN_PAGES.map(async (name) => {
          if (merged.has(name)) return null; // موجودة أصلاً — لا حاجة لفحصها
          const url = `${HF_IMAGES_BASE}/${HF_LIST_PATH}/${name}`;
          if (!(await headOk(url, token))) return null;
          // خاص + توكن → Blob مصادق؛ عام → رابط مباشر
          if (token) {
            const blobUrl = await fetchHFImageBlob(url, token);
            if (!blobUrl) return null;
            return { name: `${HF_LIST_PATH}/${name}`, url: blobUrl, pageNumber: pageNumFromName(name), source: "huggingface" as const };
          }
          return toHFImage(`${HF_LIST_PATH}/${name}`, url, "huggingface");
        })
      );
      for (const img of checks) {
        if (img) merged.set(cleanKey(img.name), img);
      }
      if (checks.some(Boolean)) console.debug(`[HF] direct-link fallback added images, total: ${merged.size}`);
    } catch (e) {
      console.debug("[HF] direct-link fallback failed:", e);
    }
  }

  // 4) بديل أخير: ملفات public/pages **المؤكدة فعلياً** — تعمل حتى بدون إنترنت.
  // لا نصنع صوراً وهمية لصفحات غير موجودة محلياً (582..599): لو لم تصل الصورة
  // من السيرفر أصلاً (HuggingFace خاص بلا توكن / bucket فارغ) لا نعرض صفحة مكسورة.
  for (const n of LOCAL_PAGES) {
    if (!merged.has(n)) {
      const img = toHFImage(`${HF_LIST_PATH}/${n}`, `/pages/${n}`, "local");
      merged.set(n, img);
    }
  }

  const all = Array.from(merged.values());
  all.sort((a, b) => a.pageNumber - b.pageNumber);
  _cache = { at: Date.now(), imgs: all };
  return all;
}

/** مسح الكاش (يُستخدم بعد رفع صور جديدة) */
export function clearHFImagesCache() {
  _cache = null;
  _repoBadUntil = 0;
  try { localStorage.removeItem(HF_BAD_KEY); } catch { /* ignore */ }
}

/**
 * بناء القائمة من Supabase (store base64 + bucket) + الملفات المحلية الموثوقة فقط،
 * بلا أي اتصال بـ HuggingFace. تُستخدم عندما يكون مستودع HF غير متاح (404/401 بلا
 * توكن) لضمان سرعة التحميل وعدم ظهور أخطاء في الكونسول.
 */
async function buildSupabaseAndLocalOnly(): Promise<HFImage[]> {
  const merged = new Map<string, HFImage>();
  const cleanKey = (n: string) => n.replace(/^pages\//, "").replace(/^\/pages\//, "");
  try {
    const { getAllPageImages, syncAllPageImagesFromServer } = await import("../data/customPages");
    const imgs = await syncAllPageImagesFromServer().catch(() => getAllPageImages().catch(() => ({} as Record<string, string>)));
    for (const [src, url] of Object.entries(imgs)) {
      if (!url || typeof url !== "string") continue;
      if (src.startsWith("custom:") || src.startsWith("/custom:")) continue;
      const rawName = src.startsWith("/pages/") ? src.slice("/pages/".length)
        : src.startsWith("pages/") ? src.slice("pages/".length)
        : src;
      const key = cleanKey(rawName);
      if (!merged.has(key)) {
        merged.set(key, { name: `pages/${rawName}`, url, pageNumber: parseInt(rawName.replace(/\D/g, "")) || 0, source: "supabase" });
      }
    }
  } catch (e) {
    console.debug("[HF] Supabase merge failed:", e);
  }

  for (const n of LOCAL_PAGES) {
    if (!merged.has(n)) {
      merged.set(n, toHFImage(`${HF_LIST_PATH}/${n}`, `/pages/${n}`, "local"));
    }
  }

  const all = Array.from(merged.values());
  all.sort((a, b) => a.pageNumber - b.pageNumber);
  _cache = { at: Date.now(), imgs: all };
  return all;
}

/**
 * تشخيص سريع لحالة صور السيرفر — يُستدعى من الكونسول أو زر التشخيص.
 * يُرجع: هل HF عام/خاص، هل التوكن موجود، كم صورة من كل مصدر.
 */
export async function diagnoseImageSources(): Promise<{
  hfRepo: string;
  hfTokenPresent: boolean;
  hfApiStatus: number | string;
  hf: number;
  supabase: number;
  local: number;
  total: number;
}> {
  const token = readStoredHfToken();
  let hfApiStatus: number | string = "skipped";
  try {
    const res = await fetch(`https://huggingface.co/api/datasets/${HF_IMAGES_REPO}/tree/main/${HF_LIST_PATH}?t=${Date.now()}`, {
      headers: authHeaders(token),
    });
    hfApiStatus = res.status;
  } catch (e: any) {
    hfApiStatus = e?.message || "fetch-error";
  }
  const imgs = await fetchHuggingFaceImages().catch(() => [] as HFImage[]);
  const hf = imgs.filter(i => i.source === "huggingface").length;
  const supabase = imgs.filter(i => i.source === "supabase").length;
  const local = imgs.filter(i => !i.source || i.source === "local").length;
  return { hfRepo: HF_IMAGES_REPO, hfTokenPresent: !!token, hfApiStatus, hf, supabase, local, total: imgs.length };
}

