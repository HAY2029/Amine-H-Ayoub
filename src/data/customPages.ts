/**
 * صفحات/سور مخصّصة يضيفها المستخدم برفع صورة في المعايرة.
 * كل شيء يُحفظ على السيرفر (Supabase store) + نسخة محلية للسرعة:
 *  - بيانات الصفحات (الاسم/الرقم)            → localStorage + store[META_KEY]
 *  - ترتيب الصفحات في القارئ                  → localStorage + store[ORDER_KEY]
 *  - صور الصفحات (base64)                     → IndexedDB (محلي) + store["mushaf:pageImg:<id>"]
 */
import { supabase, hasValidSupabaseKey } from "../lib/supabase";
import { getPageSurahRegions } from "./surahRegions";

export interface CustomPage {
  src: string;     // معرّف فريد مثل "custom:1700000000000"
  name: string;    // اسم/رقم الصفحة (قد تحوي أكثر من سورة)
  surah?: number;  // رقم سورة اختياري (للتوافق)
}

const META_KEY = "mushaf:customPages:v1";
const ORDER_KEY = "mushaf:pageOrder:v1";
const imgKey = (id: string) => `mushaf:pageImg:${id}`;

/**
 * يوحّد اسم ملف (من الـ bucket أو من جدول store) إلى المفتاح الوحيد الذي
 * يستخدمه القارئ والمعايرة عبر imgSrcFor(src) / serverOnlySrcs / pageSources:
 *  - صفحات أساسية: "600.jpg" | "pages/600.jpg" | "/pages/600.jpg" → "/pages/600.jpg"
 *  - صفحات مخصّصة:  "custom:…" | "/custom:…" | "custom/…"          → "custom:…"
 * يمنع تخزين مفاتيح مكرّرة/غير المطلوبة (مثل "600.jpg" أو "pages/600.jpg")
 * اللّي تُنتج صفحة مكرّرة وهمية في قائمة الصفحات.
 */
export const normalizeImageKey = (raw: string): string | null => {
  if (!raw) return null;
  const trimmed = raw.replace(/^\/+/, ""); // أزل أي "/" بادئة
  // صفحة مخصصة (custom: أو custom/…) → "custom:<rest>"
  if (trimmed.startsWith("custom:") || trimmed.startsWith("custom/")) {
    const rest = trimmed.startsWith("custom:") ? trimmed.slice("custom:".length) : trimmed.slice("custom/".length);
    return `custom:${rest}`;
  }
  // صفحة أساسية — أزل بادئة pages/ المكررة إن وجدت، وحافظ على الامتداد الأصلي
  const name = trimmed.replace(/^pages\//, "");
  return name ? `/pages/${name}` : null;
};

const upsert = (key: string, value: unknown) => {
  if (!hasValidSupabaseKey()) return;
  supabase.from("store").upsert({ key, value }).then(() => {}, () => {});
};

// ─────────────── بيانات الصفحات ───────────────

export const getCustomPages = (): CustomPage[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(META_KEY);
    const v = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(v)) return [];
    // تصفية الصفحات الخاطئة (برقم 0) والمكرّرة — سبب الصفحات الوهمية في القارئ
    const seen = new Set<string>();
    const out: CustomPage[] = [];
    (v as CustomPage[]).forEach(p => {
      if (!p || typeof p.src !== "string") return;
      const key = normalizeImageKey(p.src);
      if (!key || isBogusSrc(key) || seen.has(key)) return;
      seen.add(key);
      out.push({ ...p, src: key });
    });
    return out;
  } catch { return []; }
};

export const saveCustomPages = (pages: CustomPage[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(META_KEY, JSON.stringify(pages));
  upsert(META_KEY, pages);
};

export const addCustomPage = (page: CustomPage): CustomPage[] => {
  const all = getCustomPages();
  if (!all.some(p => p.src === page.src)) all.push(page);
  saveCustomPages(all);
  return all;
};

export const removeCustomPage = (src: string): CustomPage[] => {
  const all = getCustomPages().filter(p => p.src !== src);
  saveCustomPages(all);
  return all;
};

// ─────────────── ترتيب الصفحات ───────────────
// ملاحظة: القارئ القديم كان يحفظ مصفوفة src (نصوص). القارئ الجديد يحوّل
// srcs → فهارس عبر pages.findIndex. لذلك نحفظ النوعين معاً للتوافق.
export const getPageOrder = (): number[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    const v = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(v)) return [];
    // تحويل إلى أرقام (للتوافق مع النسخ القديمة التي كانت تحفظ string[])
    const nums = v.map(x => typeof x === "number" ? x : parseInt(x, 10)).filter(n => !isNaN(n));
    // حماية: كان الصفر يُعتبر خاطئاً، الآن تم السماح به ويكون أولاً
    const cleanNums = nums.filter(n => n >= 0);
    // إذا كانت القيم نصوص src خالصة (فشل التحويل كله) — أعد ترجمتها
    // عبر قائمة الصفحات الديناميكية مع تصفية الخاطئ والمكرّر
    if (cleanNums.length === 0 && v.length > 0 && typeof v[0] === "string") {
      const knownSrcs = getKnownPageSrcs();
      const seen = new Set<number>();
      const out: number[] = [];
      (v as string[]).forEach(s => {
        const key = normalizeImageKey(String(s));
        if (!key || isBogusSrc(key)) return;
        const idx = knownSrcs.indexOf(key);
        if (idx >= 0 && !seen.has(idx)) { seen.add(idx); out.push(idx); }
      });
      return out;
    }
    return cleanNums;
  } catch { return []; }
};

/** قائمة src الافتراضية للصفحات (لترجمة ترتيب src القديم → فهارس) */
function getKnownPageSrcs(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const key = normalizeImageKey(raw);
    if (!key || isBogusSrc(key) || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  try {
    const hfRaw = localStorage.getItem("mushaf:hfImageSrcs:v1");
    if (hfRaw) {
      const hf = JSON.parse(hfRaw);
      if (Array.isArray(hf)) hf.forEach(push);
    }
    getCustomPages().forEach(p => push(p?.src));
  } catch { /* ignore */ }
  push("/pages/fatiha.jpg");
  return sortPageSrcs(out);
}

/**
 * ترتيب src الصفحات ترتيباً رقمياً طبيعياً.
 * ملاحظة: الترتيب المُعتمد في المشروع يضع صفحة 0 أولاً ثم الفاتحة ثم الباقي تصاعدياً
 * (قرار المستخدم) — و`sanitizePageOrder` بلا numericSort هي المصدر الموثوق لهذا الترتيب.
 */
export function sortPageSrcs(srcs: string[]): string[] {
  return sanitizePageOrder(srcs);
}

export function isBogusSrc(src: string): boolean {
  // تم إزالة شرط اعتبار صفحة 0 خاطئة بناءً على طلب المستخدم
  return false;
}

/**
 * ترتيب احترافي موحّد (يُستخدم في كل مكان: واجهة الترتيب، الحفظ، السيرفر، القارئ):
 *  1) توحيد المفتاح عبر normalizeImageKey (يمنع المكرّر: 600.jpg / pages/600.jpg / /pages/600.jpg)
 *  2) إسقاط الصفحات الخاطئة (رقم 0) والفارغة
 *  3) إسقاط المكرّرات — أول ظهور يفوز (يحافظ على ترتيب المستخدم)
 *  4) الفاتحة أولاً (صفحة 1)، ثم الأرقام تصاعدياً…
 *     وأي صفحة بلا رقم (fatiha/custom) تُترك كما هي في مكانها النسبي
 *
 * ملاحظة مهمة: لا نفرض ترتيباً رقمياً على قائمة مرتبة يدوياً — بل نُصلح فقط
 * الفاتحة/الرقم 0/المكرّرات، حتى لا يتغيّر ترتيب المستخدم بلا سبب.
 */
export function sanitizePageOrder(srcs: string[], opts?: { numericSort?: boolean }): string[] {
  const seen = new Set<string>();
  const seenNums = new Set<number>();
  const out: string[] = [];
  (srcs || []).forEach(raw => {
    const key = normalizeImageKey(String(raw || ""));
    if (!key || isBogusSrc(key) || seen.has(key)) return;
    
    // Aggressive deduplication by actual page number
    const num = pageNumForKey(key);
    // Don't deduplicate unnumbered pages
    if (num !== Number.MAX_SAFE_INTEGER) {
      if (seenNums.has(num)) return; // skip this duplicate!
      seenNums.add(num);
    }
    
    seen.add(key);
    out.push(key);
  });
  if (opts?.numericSort) {
    return out.slice().sort((a, b) => {
      const d = pageNumForKey(a) - pageNumForKey(b);
      return d !== 0 ? d : a.localeCompare(b);
    });
  }
  // ترتيب الصفحات: 0 أولاً، ثم الفاتحة، ثم الباقي
  const zeroes = out.filter(k => pageNumForKey(k) === 0);
  const fatiha = out.filter(k => pageNumForKey(k) === 1 || /fatiha/i.test(k));
  const rest = out.filter(k => pageNumForKey(k) !== 0 && pageNumForKey(k) !== 1 && !/fatiha/i.test(k));
  return [...zeroes, ...fatiha, ...rest];
}

/** رقم الصفحة من مفتاح موحّد — الفاتحة = 1، بلا رقم/مخصّص = النهاية، "0" = 0 (خاطئة) */
export function pageNumForKey(src: string): number {
  if (/fatiha/i.test(src)) return 1;
  // الصفحات المخصّصة معرّفها طابع زمني (custom:1700000000000)
  if (/^custom:/i.test(String(src || ""))) {
    const allCustom = getCustomPages();
    const cp = allCustom.find(p => p.src === src);
    if (cp && cp.name) {
      if (/fatiha|فاتحة/i.test(cp.name)) return 1;
      const m = cp.name.match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
    return Number.MAX_SAFE_INTEGER;
  }
  const m = String(src || "").match(/(\d+)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(m[1], 10);
  return n;
}

/** تنظيف قائمة صور/صفحات: توحيد + حذف الخاطئ والمكرّر + ترتيب رقمي (للقوائم غير المرتّبة يدوياً) */
export const sanitizeImageList = (srcs: string[]): string[] => sanitizePageOrder(srcs, { numericSort: true });

/** ملف المراجعة: كم مكرّراً/خاطئاً حُذف؟ (لعرضه للمستخدم أو تسجيله) */
export function auditPageOrder(srcs: string[]): { kept: string[]; duplicates: string[]; bogus: string[] } {
  const seen = new Set<string>();
  const kept: string[] = [];
  const duplicates: string[] = [];
  const bogus: string[] = [];
  (srcs || []).forEach(raw => {
    const key = normalizeImageKey(String(raw || ""));
    if (!key || isBogusSrc(key)) { bogus.push(String(raw)); return; }
    if (seen.has(key)) { duplicates.push(key); return; }
    seen.add(key);
    kept.push(key);
  });
  return { kept, duplicates, bogus };
}

/** يُرجع الترتيب الخام كما هو محفوظ (نصوص src) — للمعايرة وواجهة الترتيب */
export const getPageOrderSrcs = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    const v = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(v)) return [];
    // حماية: ترتيب يحتوي صفحات خاطئة/غير موجودة → نتجاهله كلياً
    // (سبب ظهور صفحة "0" أولاً ومكرّرات في القارئ) — يُنظّف في sanitizePageOrder
    // مخزّن كـ srcs (النوع الحالي) → نظّفه وأعده كما هو مع تصفية الخاطئ/المكرّر/الفاتحة أولاً
    if (v.length > 0 && typeof v[0] === "string") return sanitizePageOrder(v as string[]);
    // مخزّن كفهارس (نسخ قديمة) → حوّله إلى srcs عبر القائمة الديناميكية
    const known = getKnownPageSrcs();
    return sanitizePageOrder((v as number[]).map(i => known[i]).filter(Boolean) as string[]);
  } catch { return []; }
};

export const savePageOrder = (order: number[] | string[]) => {
  if (typeof window === "undefined") return;
  // نخزّن دائماً نصوص src (متوافقة مع كل النسخ)، ونحوّل الفهارس إن لزم
  let srcs: string[];
  if (order.length > 0 && typeof order[0] === "number") {
    const known = getKnownPageSrcs();
    srcs = (order as number[]).map(i => known[i]).filter(Boolean) as string[];
    // حماية: فهرس صفر/غير صالح → لا نحفظ ترتيباً خاطئاً أبداً
    if (srcs.length === 0) return;
  } else {
    srcs = order as string[];
  }
  // تصفية موحّدة: حذف الخاطئ (0.jpg) والمكرّر مع الحفاظ على الترتيب + الفاتحة أولاً
  const clean = sanitizePageOrder(srcs);
  localStorage.setItem(ORDER_KEY, JSON.stringify(clean));
  upsert(ORDER_KEY, clean);
};

/** إزالة ترتيب الصفحات المحفوظ (محلي + سيرفر) — للعودة للترتيب الأصلي */
export const clearPageOrder = () => {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(ORDER_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem("mushaf:customPageOrder:v1"); } catch { /* ignore */ }
  upsert(ORDER_KEY, []);
};

/** مزامنة ترتيب الصفحات من السيرفر (أحدث نسخة) — تدعم صيغتي src[] و number[] */
export const syncPageOrderFromServer = async (): Promise<number[]> => {
  if (typeof window === "undefined") return [];
  if (typeof navigator !== "undefined" && !navigator.onLine) return getPageOrder();
  if (!hasValidSupabaseKey()) return getPageOrder();
  try {
    const { data } = await supabase.from("store").select("value").eq("key", ORDER_KEY).maybeSingle();
    if (data && data.value && Array.isArray(data.value) && data.value.length > 0) {
      const v = data.value as (string | number)[];
      if (typeof v[0] === "string") {
        // تصفية موحّدة: حذف الخاطئ (0.jpg) والمكرّر + الفاتحة أولاً، مع الحفاظ على الترتيب
        const clean = sanitizePageOrder(v as string[]);
        localStorage.setItem(ORDER_KEY, JSON.stringify(clean));
        window.dispatchEvent(new Event("mushaf:sync_complete"));
        const known = getKnownPageSrcs();
        const seenIdx = new Set<number>();
        const idxs: number[] = [];
        clean.forEach(s => {
          const i = known.indexOf(s);
          if (i >= 0 && !seenIdx.has(i)) { seenIdx.add(i); idxs.push(i); }
        });
        return idxs;
      }
      const nums = (v as number[]).filter(n => typeof n === "number" && !isNaN(n) && n >= 0);
      localStorage.setItem(ORDER_KEY, JSON.stringify(nums));
      window.dispatchEvent(new Event("mushaf:sync_complete"));
      return nums;
    }
    return getPageOrder();
  } catch {
    return getPageOrder();
  }
};

// ─────────────── صور الصفحات (IndexedDB + سيرفر) ───────────────

const DB_NAME = "mushaf";
const STORE = "pageImages";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const idbPut = async (id: string, dataUrl: string) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(dataUrl, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export async function savePageImage(id: string, dataUrl: string): Promise<void> {
  await idbPut(id, dataUrl);
  upsert(imgKey(id), { d: dataUrl }); // حفظ على السيرفر أيضاً
}

// ─────────────── ضغط الصور قبل الرفع للسيرفر ───────────────
// ملاحظة قياسية: جدول store يفشل (HTTP 500 statement timeout) مع حمولات
// أكبر من ~300KB — لذلك نضغط كل صورة صفحة لتبقى تحت الحد الآمن.

const SERVER_SAFE_CHARS = 160_000; // حد آمن لأحرف base64 (تحت عتبة الفشل بمرمى)

const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const loadImageEl = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("تعذّر تحميل الصورة"));
    img.src = src;
  });

const drawToJpeg = (img: HTMLImageElement, w: number, h: number, quality: number): string => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas غير مدعوم");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
};

/**
 * يضغط صورة إلى dataUrl JPEG بمقاسات وجودة متدرّجة حتى يبقى الحجم
 * تحت حد السيرفر الآمن. يُستخدم قبل savePageImage دائماً.
 */
export async function compressImageFile(file: File | Blob, maxDim = 1400): Promise<string> {
  const original = await readAsDataUrl(file);
  const img = await loadImageEl(original);
  let w = img.width;
  let h = img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  for (const q of [0.75, 0.6, 0.45, 0.32, 0.22]) {
    const out = drawToJpeg(img, w, h, q);
    if (out.length <= SERVER_SAFE_CHARS) return out;
  }
  // ما زالت كبيرة → قلّل الأبعاد وأعد المحاولة
  while (Math.max(w, h) > 500) {
    w = Math.round(w * 0.75);
    h = Math.round(h * 0.75);
    for (const q of [0.5, 0.35, 0.25]) {
      const out = drawToJpeg(img, w, h, q);
      if (out.length <= SERVER_SAFE_CHARS) return out;
    }
  }
  // آخر محاولة بأصغر مقاس مقبول
  return drawToJpeg(img, w, h, 0.25);
}


export async function getAllPageImages(): Promise<Record<string, string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    tx.oncomplete = () => {
      const out: Record<string, string> = {};
      const keys = keysReq.result as string[];
      const vals = valsReq.result as string[];
      keys.forEach((k, i) => { out[k] = vals[i]; });
      resolve(out);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePageImage(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  // ملاحظة: لا نكتب tombstone على السيرفر (قيمة null يرفضها العمود).
  // الصف اليتيم غير ضارّ: المزامنة تجلب صور الصفحات الموجودة في القائمة فقط،
  // وحذف الصفحة يُزيلها من القائمة (saveCustomPages) فلا تُجلب صورتها أصلاً.
}

// ─────────────── مزامنة الصور من السيرفر ───────────────

/** استعراض bucket mushaf-images (بما فيها المجلدات الفرعية) وجمع كل ملفات الصور */
async function listMushafImages(): Promise<{ name: string; url: string }[]> {
  try {
    const out: { name: string; url: string }[] = [];
    // اجمع الجذر أولاً
    const { data: root } = await supabase.storage.from("mushaf-images").list();
    if (!Array.isArray(root)) return out;
    const dirs: string[] = [];
    for (const f of root) {
      const { data: { publicUrl } } = supabase.storage.from("mushaf-images").getPublicUrl(f.name);
      if (f.metadata && f.metadata.size) {
        if (publicUrl && f.name.match(/\.(jpe?g|png|webp|gif|bmp)$/i)) out.push({ name: f.name, url: publicUrl });
        continue;
      }
      dirs.push(f.name);
    }
    // مجلدات فرعية (مستوى واحد كافٍ — أغلب الرفع إما جذر أو pages/)
    for (const d of dirs) {
      try {
        const { data: files } = await supabase.storage.from("mushaf-images").list(d);
        if (!Array.isArray(files)) continue;
        for (const f of files) {
          const { data: { publicUrl } } = supabase.storage.from("mushaf-images").getPublicUrl(`${d}/${f.name}`);
          if (publicUrl && f.name.match(/\.(jpe?g|png|webp|gif|bmp)$/i)) {
            out.push({ name: `${d}/${f.name}`, url: publicUrl });
          }
        }
      } catch { /* ignore */ }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * تحميل صورة صفحة من السيرفر وحفظها في IndexedDB
 * تُستخدم عندما تكون الصورة على السيرفر فقط وغير موجودة محلياً
 */
export const syncPageImageFromServer = async (id: string): Promise<string | null> => {
  if (typeof window === "undefined") return null;
  if (!hasValidSupabaseKey()) return null;
  try {
    const { data } = await supabase.from("store").select("value").eq("key", imgKey(id)).maybeSingle();
    if (data?.value && typeof data.value === "object" && "d" in (data.value as Record<string, unknown>)) {
      const dataUrl = (data.value as { d: string }).d;
      if (dataUrl && typeof dataUrl === "string") {
        await idbPut(id, dataUrl);
        return dataUrl;
      }
    }
  } catch (e) {
    console.debug("Supabase image sync info:", e);
  }
  return null;
};

/**
 * تحميل كل صور الصفحات من السيرفر (Supabase store + storage)
 * يضمن ظهور الصور المرفوعة على السيرفر حتى لو لم تكن محلياً
 */
export const syncAllPageImagesFromServer = async (): Promise<Record<string, string>> => {
  if (typeof window === "undefined") return {};
  const localImgs = await getAllPageImages().catch(() => ({}) as Record<string, string>);
  if (!hasValidSupabaseKey()) return localImgs;
  
  try {
    // الطريقة 1: جلب من جدول store (base64)
    const { data: storeData } = await supabase.from("store").select("key, value").like("key", "mushaf:pageImg:%");
    if (storeData && Array.isArray(storeData)) {
      for (const row of storeData) {
        const key = row.key as string;
        const id = key.replace("mushaf:pageImg:", "");
        if (row.value && typeof row.value === "object" && "d" in (row.value as Record<string, unknown>)) {
          const dataUrl = (row.value as { d: string }).d;
          if (dataUrl && typeof dataUrl === "string") {
            await idbPut(id, dataUrl).catch(() => {});
            localImgs[id] = dataUrl;
          }
        }
      }
    }
    
    // الطريقة 2: جلب من Supabase Storage bucket (mushaf-images) — جذر + مجلدات فرعية
    try {
      for (const file of await listMushafImages()) {
        const { name: rawName, url: publicUrl } = file;
        // مفتاح واحد موحّد فقط — يمنع صفحة مكرّرة/وهمية في القارئ والمعايرة:
        //   "600.jpg" | "pages/600.jpg" | "/pages/600.jpg"  →  "/pages/600.jpg"
        //   "custom:…" | "/custom:…" | "custom/…"           →  "custom:…" (يطابق src المخصص)
        const key = normalizeImageKey(rawName);
        if (key && !localImgs[key]) localImgs[key] = publicUrl;
      }
    } catch (e) {
      console.debug("Supabase storage fetch info:", e);
    }
    
    return localImgs;
  } catch (e) {
    console.debug("Supabase all images sync info:", e);
    return localImgs;
  }
};

const SHADING_THEME_KEY = "mushaf:shadingTheme:v1";
const SHADING_OPACITY_KEY = "mushaf:shadingOpacity:v1";
const SHADING_HIDE_KEY = "mushaf:hideShading";
const SHADING_CUSTOM_COLOR_KEY = "mushaf:shadingCustomColor:v1";

/** حفظ لون التظليل الذي يحدده المستخدم على السيرفر (مفتاح مخصص منفصل عن ثيم القارئ) */
export const saveShadingCustomColorToServer = (color: string) => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(SHADING_CUSTOM_COLOR_KEY, color); } catch { /* ignore */ }
  upsert(SHADING_CUSTOM_COLOR_KEY, { color });
};

/** جلب لون التظليل الذي يحدده المستخدم من السيرفر */
export const syncShadingCustomColorFromServer = async (): Promise<string | null> => {
  if (typeof window === "undefined") return null;
  if (!hasValidSupabaseKey()) return null;
  try {
    const { data } = await supabase.from("store").select("value").eq("key", SHADING_CUSTOM_COLOR_KEY).maybeSingle();
    if (data?.value && typeof (data.value as { color?: string }).color === "string") {
      const color = (data.value as { color: string }).color;
      localStorage.setItem(SHADING_CUSTOM_COLOR_KEY, color);
      return color;
    }
  } catch (e) {
    console.debug("Supabase sync shading custom color info:", e);
  }
  return null;
};

/** حفظ ثيم التظليل على السيرفر */
export const saveShadingThemeToServer = (theme: unknown) => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(SHADING_THEME_KEY, JSON.stringify(theme)); } catch { /* ignore */ }
  upsert(SHADING_THEME_KEY, theme);
};

/** جلب ثيم التظليل من السيرفر */
export const syncShadingThemeFromServer = async (): Promise<unknown | null> => {
  if (typeof window === "undefined") return null;
  if (!hasValidSupabaseKey()) return null;
  try {
    const { data } = await supabase.from("store").select("value").eq("key", SHADING_THEME_KEY).maybeSingle();
    if (data?.value) {
      localStorage.setItem(SHADING_THEME_KEY, JSON.stringify(data.value));
      return data.value;
    }
  } catch (e) {
    console.debug("Supabase sync shading theme info:", e);
  }
  return null;
};

/** حفظ شفافية التظليل على السيرفر */
export const saveShadingOpacityToServer = (opacity: number) => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(SHADING_OPACITY_KEY, String(opacity)); } catch { /* ignore */ }
  upsert(SHADING_OPACITY_KEY, { v: opacity });
};

/** جلب شفافية التظليل من السيرفر */
export const syncShadingOpacityFromServer = async (): Promise<number | null> => {
  if (typeof window === "undefined") return null;
  if (!hasValidSupabaseKey()) return null;
  try {
    const { data } = await supabase.from("store").select("value").eq("key", SHADING_OPACITY_KEY).maybeSingle();
    if (data?.value && typeof (data.value as { v?: number }).v === "number") {
      const v = (data.value as { v: number }).v;
      localStorage.setItem(SHADING_OPACITY_KEY, String(v));
      return v;
    }
  } catch (e) {
    console.debug("Supabase sync shading opacity info:", e);
  }
  return null;
};

/** حفظ حالة إظهار/إخفاء التظليل على السيرفر */
export const saveHideShadingToServer = (hide: boolean) => {
  if (typeof window === "undefined") return;
  try {
    if (hide) localStorage.setItem(SHADING_HIDE_KEY, "1");
    else localStorage.removeItem(SHADING_HIDE_KEY);
  } catch { /* ignore */ }
  upsert(SHADING_HIDE_KEY, { hide: !!hide });
};

/** جلب حالة إظهار/إخفاء التظليل من السيرفر */
export const syncHideShadingFromServer = async (): Promise<boolean | null> => {
  if (typeof window === "undefined") return null;
  if (!hasValidSupabaseKey()) return null;
  try {
    const { data } = await supabase.from("store").select("value").eq("key", SHADING_HIDE_KEY).maybeSingle();
    if (data?.value && typeof (data.value as { hide?: boolean }).hide === "boolean") {
      const hide = (data.value as { hide: boolean }).hide;
      if (hide) localStorage.setItem(SHADING_HIDE_KEY, "1");
      else localStorage.removeItem(SHADING_HIDE_KEY);
      return hide;
    }
  } catch (e) {
    console.debug("Supabase sync hide shading info:", e);
  }
  return null;
};

/** مزامنة جميع إعدادات التظليل من السيرفر (تُستدعى عند بدء التشغيل) */
export const syncAllShadingFromServer = async () => {
  await Promise.all([
    syncShadingThemeFromServer(),
    syncShadingOpacityFromServer(),
    syncHideShadingFromServer(),
  ]);
  window.dispatchEvent(new Event("mushaf:shading_sync_complete"));
};

/** مزامنة الصفحات المخصصة من السيرفر (قائمة الصفحات + الصور الناقصة) */
export const syncCustomPagesFromServer = async () => {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return; // offline
  try {
    const localPages = getCustomPages();
    let serverPages: CustomPage[] = [];
    if (hasValidSupabaseKey()) {
      const { data: meta } = await supabase.from("store").select("value").eq("key", META_KEY).maybeSingle();
      if (meta && Array.isArray(meta.value)) serverPages = meta.value as CustomPage[];
    }

    // دمج آمن: السيرفر + المحلي — لا نمسح المحلي أبداً بقائمة فارغة
    const bySrc = new Map<string, CustomPage>();
    [...serverPages, ...localPages].forEach(p => { if (p && p.src) bySrc.set(p.src, { ...bySrc.get(p.src), ...p }); });

    // استرجاع: أي صورة في IndexedDB لصفحة مفقودة من القائمة تُعاد (الاسم من منطقة سورتها)
    const imgs = await getAllPageImages().catch(() => ({} as Record<string, string>));
    Object.keys(imgs).forEach(src => {
      if (src.startsWith("custom:") && !bySrc.has(src)) {
        const regs = getPageSurahRegions(src);
        bySrc.set(src, { src, name: regs[0]?.name || "صفحة مستعادة" });
      }
    });

    const merged = Array.from(bySrc.values());
    localStorage.setItem(META_KEY, JSON.stringify(merged));
    // ارفع القائمة للسيرفر فقط إذا تغيّرت عن آخر ما رُفع (يمنع إعادة إرسال
    // نفس البيانات في كل مزامنة — خصوصاً عندما يفشل السيرفر بـ 500).
    const sig = JSON.stringify(merged);
    try {
      const prev = localStorage.getItem("mushaf:metaUploadSig:v1");
      if (prev !== sig) {
        upsert(META_KEY, merged);
        localStorage.setItem("mushaf:metaUploadSig:v1", sig);
      }
    } catch { /* ignore */ }

    if (hasValidSupabaseKey()) {
      const { data: ord } = await supabase.from("store").select("value").eq("key", ORDER_KEY).maybeSingle();
      if (ord && Array.isArray(ord.value) && ord.value.length > 0) localStorage.setItem(ORDER_KEY, JSON.stringify(ord.value));

      // اجلب صور الصفحات الناقصة محلياً بالمفتاح المباشر
      for (const p of merged) {
        if (imgs[p.src]) continue;
        const { data: img } = await supabase.from("store").select("value").eq("key", imgKey(p.src)).maybeSingle();
        const d = (img?.value as { d?: string } | null)?.d;
        if (d) await idbPut(p.src, d).catch(() => {});
      }
    }
    // لا نُطلق حدث mushaf:sync_complete هنا — هذه الدالة تُستدعى من داخل دورة
    // المزامنة نفسها في القارئ، وإرسال الحدث يسبب حلقة لا نهائية (الحدث ←
    // refresh ← مزامنة ← حدث...) وإغراق الشبكة بطلبات متكررة.
    // المزامنة في القارئ تُحدّث نفسها بنفسها عند الانتهاء.
  } catch (e) {
    console.debug("Supabase sync custom pages info:", e);
  }
};
