import { supabase, hasValidSupabaseKey } from "../lib/supabase";

/**
 * جزء من الآية الطويلة: الآية الواحدة قد يقرأها المعلم على أجزاء (لأنها طويلة)،
 * ويقرأ الطفل كل جزء بعد معلّمه. كل جزء يحمل مدى تلاوة المعلم ومدى تلاوة الطفل.
 */
export interface AyahPart {
  id: string;
  /** بداية ونهاية تلاوة المعلم لهذا الجزء (ثوانٍ من بداية الملف) */
  tStart: number;
  tEnd: number;
  /** بداية ونهاية تلاوة الطفل لنفس الجزء (اختياري) */
  kStart?: number;
  kEnd?: number;
  label?: string;
}

export interface AyahBox {
  surah: number;
  ayah: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Custom highlight color (e.g. hex, rgba) specified by user */
  color?: string;
  /** Custom opacity (0.1 to 1.0) */
  opacity?: number;
  /** Optional: precise audio segment bound to this highlight (in seconds) for the teacher. */
  audioStart?: number;
  audioEnd?: number;
  /** Optional: precise audio segment bound for the kids/child. */
  kidsStart?: number;
  kidsEnd?: number;
  /** Optional: which speaker section this segment belongs to (deprecated in favor of dual timing support). */
  speaker?: "teacher" | "kids";
  /** Optional: Custom name/label for the box (e.g. "البسملة") */
  label?: string;
  /**
   * أجزاء الآية الطويلة (اختياري). عند وجودها يتلو المعلم الجزء الأول ثم الطفل
   * نفس الجزء، ثم المعلم الجزء الثاني ثم الطفل… بدل قراءة الآية دفعة واحدة.
   */
  parts?: AyahPart[];
  /** Optional: إذا كان المربع يظهر في أكثر من صفحة، سرد كل مصادر الصفحات هنا */
  pages?: string[];
}

const CALIBRATION_STORAGE_KEY = "mushaf:ayahCoordinates:v1";

const makeBoxes = (
  surah: number,
  count: number,
  x: number,
  y: number,
  width: number,
  height: number,
  columns = count,
): AyahBox[] => {
  const rows = Math.ceil(count / columns);
  const rowHeight = height / rows;
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const itemsInRow = Math.min(columns, count - row * columns);
    const boxWidth = width / itemsInRow;
    return {
      surah,
      ayah: index + 1,
      x: x + width - boxWidth * (col + 1),
      y: y + rowHeight * row,
      width: boxWidth,
      height: rowHeight,
    };
  });
};

export const PAGE_IMAGE_SIZE = { width: 1260, height: 1929 };

import defaultBoxes from "./shading/boxes-dump.json";

export interface PageSectionInfo {
  surah: number;
  startAyah: number;
  endAyah: number;
  hasBasmalah?: boolean;
}

export const JUZ_AMMA_PAGE_SECTIONS: Record<number, PageSectionInfo[]> = {
  0: [{ surah: 1, startAyah: 1, endAyah: 7, hasBasmalah: true }],
  1: [{ surah: 1, startAyah: 1, endAyah: 7, hasBasmalah: true }],
  581: [{ surah: 78, startAyah: 1, endAyah: 30, hasBasmalah: true }],
  582: [{ surah: 78, startAyah: 31, endAyah: 40, hasBasmalah: false }, { surah: 79, startAyah: 1, endAyah: 15, hasBasmalah: true }],
  583: [{ surah: 79, startAyah: 16, endAyah: 46, hasBasmalah: false }],
  584: [{ surah: 80, startAyah: 1, endAyah: 42, hasBasmalah: true }],
  585: [{ surah: 81, startAyah: 1, endAyah: 29, hasBasmalah: true }],
  586: [{ surah: 82, startAyah: 1, endAyah: 19, hasBasmalah: true }, { surah: 83, startAyah: 1, endAyah: 6, hasBasmalah: true }],
  587: [{ surah: 83, startAyah: 7, endAyah: 34, hasBasmalah: false }],
  588: [{ surah: 83, startAyah: 35, endAyah: 36, hasBasmalah: false }, { surah: 84, startAyah: 1, endAyah: 25, hasBasmalah: true }],
  589: [{ surah: 85, startAyah: 1, endAyah: 22, hasBasmalah: true }],
  590: [{ surah: 86, startAyah: 1, endAyah: 17, hasBasmalah: true }, { surah: 87, startAyah: 1, endAyah: 15, hasBasmalah: true }],
  591: [{ surah: 87, startAyah: 16, endAyah: 19, hasBasmalah: false }, { surah: 88, startAyah: 1, endAyah: 26, hasBasmalah: true }],
  592: [{ surah: 89, startAyah: 1, endAyah: 23, hasBasmalah: true }],
  593: [{ surah: 89, startAyah: 24, endAyah: 30, hasBasmalah: false }, { surah: 90, startAyah: 1, endAyah: 20, hasBasmalah: true }],
  594: [{ surah: 91, startAyah: 1, endAyah: 15, hasBasmalah: true }, { surah: 92, startAyah: 1, endAyah: 14, hasBasmalah: true }],
  595: [{ surah: 92, startAyah: 15, endAyah: 21, hasBasmalah: false }, { surah: 93, startAyah: 1, endAyah: 11, hasBasmalah: true }, { surah: 94, startAyah: 1, endAyah: 8, hasBasmalah: true }],
  596: [{ surah: 95, startAyah: 1, endAyah: 8, hasBasmalah: true }, { surah: 96, startAyah: 1, endAyah: 19, hasBasmalah: true }],
  597: [{ surah: 97, startAyah: 1, endAyah: 5, hasBasmalah: true }, { surah: 98, startAyah: 1, endAyah: 7, hasBasmalah: true }],
  598: [{ surah: 98, startAyah: 8, endAyah: 8, hasBasmalah: false }, { surah: 99, startAyah: 1, endAyah: 8, hasBasmalah: true }, { surah: 100, startAyah: 1, endAyah: 9, hasBasmalah: true }],
  599: [{ surah: 100, startAyah: 10, endAyah: 11, hasBasmalah: false }, { surah: 101, startAyah: 1, endAyah: 11, hasBasmalah: true }, { surah: 102, startAyah: 1, endAyah: 8, hasBasmalah: true }],
  600: [{ surah: 103, startAyah: 1, endAyah: 3, hasBasmalah: true }, { surah: 104, startAyah: 1, endAyah: 9, hasBasmalah: true }, { surah: 105, startAyah: 1, endAyah: 5, hasBasmalah: true }],
  601: [{ surah: 106, startAyah: 1, endAyah: 4, hasBasmalah: true }, { surah: 107, startAyah: 1, endAyah: 7, hasBasmalah: true }, { surah: 108, startAyah: 1, endAyah: 3, hasBasmalah: true }],
  602: [{ surah: 109, startAyah: 1, endAyah: 6, hasBasmalah: true }, { surah: 110, startAyah: 1, endAyah: 3, hasBasmalah: true }, { surah: 111, startAyah: 1, endAyah: 5, hasBasmalah: true }],
  603: [{ surah: 112, startAyah: 1, endAyah: 4, hasBasmalah: true }, { surah: 113, startAyah: 1, endAyah: 5, hasBasmalah: true }, { surah: 114, startAyah: 1, endAyah: 6, hasBasmalah: true }],
};

/**
 * رقم ملف الصفحة من مصدره: /pages/603.jpg → 603، والفاتحة → 0.
 * الصفحات المخصصة أو الصور الخارجية تُرجع null (لا يوجد جدول سور لها).
 */
export const getPageFileNumber = (rawPageSrc: string): number | null => {
  if (!rawPageSrc) return null;
  if (rawPageSrc.includes("fatiha")) return 0;
  const m = rawPageSrc.match(/\/pages\/(\d{1,3})\.[a-z]+$/i) || rawPageSrc.match(/^(\d{1,3})$/);
  return m ? parseInt(m[1], 10) : null;
};

/** أقسام السور (نطاقات الآيات) الموجودة فعلياً على صفحة المصحف */
export const getPageSections = (rawPageSrc: string): PageSectionInfo[] => {
  const n = getPageFileNumber(rawPageSrc);
  return n == null ? [] : (JUZ_AMMA_PAGE_SECTIONS[n] || []);
};

/** أرقام السور التي توجد فعلياً على الصفحة (فارغة = صفحة غير معروفة) */
export const getPageSurahNumbers = (rawPageSrc: string): number[] => {
  const sections = getPageSections(rawPageSrc);
  return sections.length ? Array.from(new Set(sections.map((s) => s.surah))) : [];
};

/** هل السورة موجودة فعلاً على هذه الصفحة؟ الصفحات غير المعروفة تُقبل دائماً */
export const isSurahOnPage = (rawPageSrc: string, surah: number): boolean => {
  const nums = getPageSurahNumbers(rawPageSrc);
  return nums.length === 0 || nums.includes(surah);
};

/** كل صفحات السورة بالترتيب — للفاتحة صفحة واحدة، ولغيرها من جدول الأقسام */
export const getSurahPageList = (surah: number): string[] => {
  if (surah === 1) return ["/pages/0.jpg"];
  const pages: number[] = [];
  for (const [page, sections] of Object.entries(JUZ_AMMA_PAGE_SECTIONS)) {
    const n = Number(page);
    if (n <= 1) continue;
    if (sections.some((s) => s.surah === surah)) pages.push(n);
  }
  return pages.sort((a, b) => a - b).map((n) => `/pages/${n}.jpg`);
};

/** أول صفحة للسورة (null إن لم تكن معروفة) */
export const getSurahFirstPage = (surah: number): string | null =>
  getSurahPageList(surah)[0] || null;

/**
 * تنقية مربعات صفحة: حذف أي مربع لسورة لا توجد على هذه الصفحة.
 * هذه الحماية تمنع ظهور التظليل على سورة خاطئة إذا كانت البيانات القديمة مرتبطة بصفحة غير صفحتها.
 */
export const sanitizePageBoxes = (rawPageSrc: string, boxes: AyahBox[]): AyahBox[] => {
  const allowed = getPageSurahNumbers(rawPageSrc);
  if (allowed.length === 0) return boxes;
  const seen = new Set<string>();
  const out: AyahBox[] = [];
  for (const box of boxes) {
    if (!allowed.includes(box.surah)) continue;
    const key = `${box.surah}-${box.ayah}-${Math.round(box.x)}-${Math.round(box.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(box);
  }
  return out;
};

/**
 * توليد مربعات تظليل تلقائية ذكية وجميلة لأي صفحة مصحف
 * تغطي آيات السور الموجودة في الصفحة بتنسيق شبكي متناسق مع قياس الصفحة 1260x1929
 */
export function generateDefaultBoxesForPage(pageSrc: string): AyahBox[] {
  const pageNum = getPageFileNumber(pageSrc);
  // الفاتحة: صفحة 0 أو 1
  if (pageNum === 0 || pageNum === 1 || pageSrc.includes("fatiha")) {
    return [
      { surah: 1, ayah: 0, x: 340, y: 516, width: 580, height: 95, label: "البسملة", color: "#eab308" },
      { surah: 1, ayah: 1, x: 330, y: 660, width: 600, height: 95, label: "الآية 1", color: "#eab308" },
      { surah: 1, ayah: 2, x: 330, y: 800, width: 600, height: 95, label: "الآية 2", color: "#eab308" },
      { surah: 1, ayah: 3, x: 330, y: 940, width: 600, height: 95, label: "الآية 3", color: "#eab308" },
      { surah: 1, ayah: 4, x: 310, y: 1080, width: 640, height: 95, label: "الآية 4", color: "#eab308" },
      { surah: 1, ayah: 5, x: 310, y: 1220, width: 640, height: 95, label: "الآية 5", color: "#eab308" },
      { surah: 1, ayah: 6, x: 290, y: 1360, width: 680, height: 95, label: "الآية 6", color: "#eab308" },
      { surah: 1, ayah: 7, x: 250, y: 1500, width: 760, height: 95, label: "الآية 7", color: "#eab308" },
    ];
  }

  // صفحات جزء عمّ وغيرها: مربع واحد لكل سطر (بسملة + آية) بترتيب المصحف
  const sections = pageNum == null ? undefined : JUZ_AMMA_PAGE_SECTIONS[pageNum];
  if (!sections || sections.length === 0) return [];

  const PAGE_TOP = 205;
  const PAGE_BOTTOM = 1755;
  const ROW_GAP = 8;
  const CONTENT_X = 55;
  const CONTENT_W = 1150;
  const BASMALAH_X = 300;
  const BASMALAH_W = 660;

  const totalLines = sections.reduce(
    (n, s) => n + (s.hasBasmalah ? 1 : 0) + Math.max(1, s.endAyah - s.startAyah + 1),
    0
  );
  const rowH = Math.min(88, Math.max(40, (PAGE_BOTTOM - PAGE_TOP) / Math.max(1, totalLines)));
  let y = PAGE_TOP;
  const boxes: AyahBox[] = [];

  sections.forEach((s) => {
    if (s.hasBasmalah) {
      boxes.push({
        surah: s.surah,
        ayah: 0,
        x: BASMALAH_X,
        y: Math.round(y),
        width: BASMALAH_W,
        height: Math.round(rowH - ROW_GAP),
        label: "البسملة",
        color: "#eab308",
      });
      y += rowH;
    }
    for (let a = s.startAyah; a <= s.endAyah; a++) {
      boxes.push({
        surah: s.surah,
        ayah: a,
        x: CONTENT_X,
        y: Math.round(y),
        width: CONTENT_W,
        height: Math.round(rowH - ROW_GAP),
        label: `الآية ${a}`,
        color: "#eab308",
      });
      y += rowH;
    }
  });

  return boxes;
}

// سيتم الاعتماد كلياً على المجلد المحلي `public/pages/`
export const AYAH_COORDINATES: Record<string, AyahBox[]> = (defaultBoxes as Record<string, AyahBox[]>) || {};

const cloneBoxes = (boxes: AyahBox[]) => boxes.map((box) => ({ ...box }));


export const syncCoordinatesFromServer = async () => {
  if (typeof window === "undefined") return;

  // 🧹 تنظيف شامل: أي مربع لسورة ليست على صفحتها يُحذف نهائياً من النسخة المحلية،
  // فلا تعود البيانات القديمة الخاطئة للظهور بعد إعادة التحميل.
  const cleanAll = (data: Record<string, AyahBox[]>): Record<string, AyahBox[]> => {
    const out: Record<string, AyahBox[]> = {};
    for (const [src, boxes] of Object.entries(data)) {
      if (!Array.isArray(boxes)) continue;
      const kept = sanitizePageBoxes(src, boxes);
      // صفحة معروفة بلا أي مربع صحيح: نحذف مفتاحها لتُولَّد مربعاتها الصحيحة عند القراءة
      if (kept.length === 0 && getPageSurahNumbers(src).length > 0) continue;
      out[src] = kept;
    }
    return out;
  };

  const applyMerged = async (source: Record<string, AyahBox[]>) => {
    const validSources = await getExistingPageSources();
    // نُصفّي بعد الدمج أيضاً حتى لا يبقى في التخزين المحلي أي صفحة قديمة بلا صورة
    const mergedPages = Object.fromEntries(
      Object.entries({ ...getSavedAyahCoordinates(), ...source }).filter(
        ([src]) => src.startsWith("custom:") || !isMissingQuranPage(src, validSources),
      ),
    );
    const merged = cleanAll(mergedPages);
    cachedAyahCoords = merged;
    lastCacheTime = Date.now();
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new Event("mushaf:sync_complete"));
  };

  // 1. ملف المشروع المحلي (هو المرجع في التطوير: بيانات مصححة ومُدقَّقة)
  let serverDump: Record<string, AyahBox[]> | null = null;
  try {
    const res = await fetch("/api/save-boxes", { cache: "no-store" });
    if (res.ok) {
      const parsed = await res.json();
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        serverDump = parsed as Record<string, AyahBox[]>;
      }
    }
  } catch (err) {
    console.debug("Local server boxes sync info:", err);
  }

  // 2. السحابة (Supabase) — تُدمج، لكن ملف المشروع المحلي يتقدم عليها
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (serverDump) await applyMerged(serverDump);
    return;
  }
  if (!hasValidSupabaseKey()) {
    if (serverDump) await applyMerged(serverDump);
    return;
  }

  try {
    const { data } = await supabase.from("store").select("value").eq("key", CALIBRATION_STORAGE_KEY).maybeSingle();
    const cloud = (data?.value || null) as Record<string, AyahBox[]> | null;
    const hasCloud = !!cloud && Object.keys(cloud).length > 0;

    if (hasCloud || serverDump) {
      await applyMerged({ ...(cloud || {}), ...(serverDump || {}) });
    } else {
      // السحابة فارغة → ارفع النسخة المحلية بعد تنظيفها
      const validSources = await getExistingPageSources();
      const local = cleanAll(
        Object.fromEntries(
          Object.entries(getSavedAyahCoordinates()).filter(
            ([src]) => src.startsWith("custom:") || !isMissingQuranPage(src, validSources),
          ),
        ),
      );
      if (Object.keys(local).length > 0) {
        await supabase.from("store").upsert({ key: CALIBRATION_STORAGE_KEY, value: local });
      }
    }
  } catch (e) {
    console.debug("Supabase sync info:", e);
  }
};

let cachedAyahCoords: Record<string, AyahBox[]> | null = null;
let lastCacheTime = 0;

export const getSavedAyahCoordinates = (): Record<string, AyahBox[]> => {
  if (typeof window === "undefined") return {};
  const now = Date.now();
  if (cachedAyahCoords && now - lastCacheTime < 1000) {
    return cachedAyahCoords;
  }
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    cachedAyahCoords = raw ? JSON.parse(raw) : {};
    lastCacheTime = now;
    return cachedAyahCoords!;
  } catch {
    return {};
  }
};

/**
 * الحصول على مربعات الآية لصفحة معينة.
 * يشمل:
 * 1. المربعات المربوطة مباشرة بالصفحة (من الإعدادات المحفوظة أو المدمجة)
 * 2. المربعات التي تشير إلى هذه الصفحة عبر حقل `pages` (مربعات مشتركة بين صفحات)
 */
const collectSavedPageBoxes = (pageSrc: string): AyahBox[] => {
  const allSaved = getSavedAyahCoordinates();
  const result: AyahBox[] = [];
  const seen = new Set<string>();

  // 1. المربعات المباشرة للصفحة
  const directBoxes = pageSrc in allSaved
    ? allSaved[pageSrc]
    : (AYAH_COORDINATES[pageSrc] ?? (pageSrc === "/pages/0.jpg" ? (allSaved["/pages/fatiha.jpg"] ?? AYAH_COORDINATES["/pages/fatiha.jpg"] ?? []) : []));
  for (const box of directBoxes) {
    const key = `${box.surah}-${box.ayah}-${box.x}-${box.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ ...box });
    }
  }

  // 2. المربعات المشتركة (التي تشير إلى هذه الصفحة عبر pages[])
  for (const [src, boxes] of Object.entries(allSaved)) {
    if (src === pageSrc) continue;
    for (const box of boxes) {
      if (box.pages && box.pages.includes(pageSrc)) {
        const key = `${box.surah}-${box.ayah}-${box.x}-${box.y}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ ...box });
        }
      }
    }
  }

  // من الإحداثيات المدمجة أيضاً
  for (const [src, boxes] of Object.entries(AYAH_COORDINATES)) {
    if (src === pageSrc) continue;
    if (!allSaved[src]) { // فقط إذا لم يتم تجاوزها بإعدادات محفوظة
      for (const box of boxes) {
        if (box.pages && box.pages.includes(pageSrc)) {
          const key = `${box.surah}-${box.ayah}-${box.x}-${box.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ ...box });
          }
        }
      }
    }
  }

  return result;
};

/**
 * المربعات **المحفوظة فقط** لصفحة (بدون توليد تقديري).
 * يستخدمها محرر التظليل حتى يبدأ المستخدم من صفحة نظيفة ويتظليل الآيات بنفسه.
 */
export const getSavedPageBoxes = (rawPageSrc: string): AyahBox[] => {
  const pageSrc = (rawPageSrc && rawPageSrc.includes("fatiha")) ? "/pages/0.jpg" : rawPageSrc;
  return sanitizePageBoxes(pageSrc, collectSavedPageBoxes(pageSrc));
};

export const getPageAyahBoxes = (rawPageSrc: string) => {
  const pageSrc = (rawPageSrc && rawPageSrc.includes("fatiha")) ? "/pages/0.jpg" : rawPageSrc;

  // حماية أساسية: أي مربع مرتبط بسورة لا توجد على هذه الصفحة يُستبعد،
  // حتى لا يظهر التظليل فوق آيات سورة أخرى (كان هذا سبب «التظليل لا يعمل»).
  const clean = sanitizePageBoxes(pageSrc, collectSavedPageBoxes(pageSrc));

  // إن لم يبق مربع صحيح (أو كانت الصفحة بلا بيانات) نولّد مربعات تلقائية لسور الصفحة الحقيقية.
  if (clean.length === 0) {
    return generateDefaultBoxesForPage(pageSrc);
  }

  return clean;
};

/**
 * حفظ مربعات الآية لصفحة معينة في السيرفر.
 * إذا كان لأي مربع حقل `pages`، يتم نسخه تلقائياً إلى كل الصفحات المذكورة.
 */
export const savePageAyahBoxes = async (rawPageSrc: string, boxes: AyahBox[]) => {
  if (typeof window === "undefined") return;
  const pageSrc = (rawPageSrc && rawPageSrc.includes("fatiha")) ? "/pages/0.jpg" : rawPageSrc;
  const saved = getSavedAyahCoordinates();
  // إزالة أي مفتاح قديم مكرر للفاتحة
  delete saved["/pages/fatiha.jpg"];
  delete saved["fatiha.jpg"];

  // لا نحفظ أبداً مربعاً لسورة لا توجد على الصفحة (يمنع تلوث البيانات مستقبلاً)
  saved[pageSrc] = cloneBoxes(sanitizePageBoxes(pageSrc, boxes));
  cachedAyahCoords = saved;
  lastCacheTime = Date.now();

  // إذا كان لأي مربع حقل pages، انسخه إلى تلك الصفحات أيضاً
  for (const box of boxes) {
    if (box.pages && box.pages.length > 0) {
      for (const otherSrc of box.pages) {
        if (otherSrc === pageSrc) continue;
        if (!saved[otherSrc]) saved[otherSrc] = [];
        // أضف المربع إذا لم يكن موجوداً بالفعل
        const exists = saved[otherSrc].some(
          b => b.surah === box.surah && b.ayah === box.ayah && b.x === box.x && b.y === box.y
        );
        if (!exists) {
          saved[otherSrc].push({ ...box });
        }
      }
    }
  }

  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(saved));
  window.dispatchEvent(new Event("mushaf:sync_complete"));

  // 1. الحفظ في السيرفر المحلي فوراً (/api/save-boxes -> boxes-dump.json)
  try {
    await fetch("/api/save-boxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saved),
    });
  } catch (err) {
    console.debug("Local server save error:", err);
  }

  // 2. الحفظ في Supabase السحابي
  try {
    await supabase.from("store").upsert({ key: CALIBRATION_STORAGE_KEY, value: saved });
  } catch (e) {
    console.error("Supabase save error:", e);
  }
};

/**
 * مصادر الصفحات الموجودة فعلاً (صور المصحف + الصفحات المخصصة).
 * تستخدم لمنع رفع أو إحياء صفحة لا صورة لها (مثل /pages/604.jpg القديمة).
 */
const getExistingPageSources = async (): Promise<Set<string>> => {
  const set = new Set<string>(["/pages/0.jpg"]);
  try {
    const mod = await import("./staticPages");
    (mod.CODE_QURAN_PAGES || []).forEach((p) => p?.src && set.add(p.src));
  } catch (err) {
    console.debug("Static pages lookup skipped:", err);
  }
  try {
    const mod = await import("./customPages");
    (mod.getCustomPages?.() || []).forEach((p: { src?: string }) => p?.src && set.add(p.src));
  } catch (err) {
    console.debug("Custom pages lookup skipped:", err);
  }
  return set;
};

/** صفحة رقم صفحة مصحف (وليس مخصصة) لا صورة لها = غير صالحة */
const isMissingQuranPage = (src: string, validSources: Set<string>) =>
  /^\/pages\/[^/]+$/.test(src) && !src.includes("fatiha") && !validSources.has(src);

/**
 * رفع **كل** التظليل (كل الصفحات) إلى السيرفر دفعة واحدة.
 * يجمع صفحات ملف المشروع مع تعديلات المتصفح (المتصفح يتقدم)، ثم يرفع النتيجة
 * إلى ملفات المشروع (/api/save-boxes) وإلى Supabase. لا يحذف أي صفحة.
 */
export const saveAllAyahBoxesToServer = async (): Promise<{
  pages: number;
  boxes: number;
  localOk: boolean;
  cloudOk: boolean;
}> => {
  if (typeof window === "undefined") return { pages: 0, boxes: 0, localOk: false, cloudOk: false };

  // 1. صفحات ملف المشروع الحالية (حتى لا تُفقد صفحة غير موجودة في localStorage)
  let projectDump: Record<string, AyahBox[]> = {};
  try {
    const res = await fetch("/api/save-boxes", { cache: "no-store" });
    if (res.ok) {
      const parsed = await res.json();
      if (parsed && typeof parsed === "object") projectDump = parsed as Record<string, AyahBox[]>;
    }
  } catch (err) {
    console.debug("Project boxes read skipped:", err);
  }

  // 2. تعديلات المتصفح لها الأولوية (أحدث ما ظلّله المستخدم)
  const merged: Record<string, AyahBox[]> = { ...projectDump, ...getSavedAyahCoordinates() };

  // 3. تنقية كل صفحة: لا مربع لسورة ليست عليها، ولا صفحة بلا صورة
  const validSources = await getExistingPageSources();
  const cleaned: Record<string, AyahBox[]> = {};
  let totalBoxes = 0;
  for (const [src, boxes] of Object.entries(merged)) {
    if (!Array.isArray(boxes)) continue;
    if (src.startsWith("custom:") ? false : isMissingQuranPage(src, validSources)) continue;
    const kept = sanitizePageBoxes(src, boxes);
    if (kept.length === 0) continue;
    cleaned[src] = cloneBoxes(kept);
    totalBoxes += kept.length;
  }

  const pages = Object.keys(cleaned).length;
  if (pages === 0) return { pages: 0, boxes: 0, localOk: false, cloudOk: false };

  cachedAyahCoords = cleaned;
  lastCacheTime = Date.now();
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(cleaned));
  window.dispatchEvent(new Event("mushaf:sync_complete"));

  // 4. السيرفر المحلي: ملفات المشروع (shading_data.json + boxes-dump.json)
  let localOk = false;
  try {
    const res = await fetch("/api/save-boxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleaned),
    });
    localOk = res.ok;
  } catch (err) {
    console.debug("Local server bulk save error:", err);
  }

  // 5. السحابة: Supabase
  let cloudOk = false;
  if (hasValidSupabaseKey()) {
    try {
      const { error } = await supabase.from("store").upsert({ key: CALIBRATION_STORAGE_KEY, value: cleaned });
      cloudOk = !error;
    } catch (e) {
      console.debug("Supabase bulk save error:", e);
    }
  }

  return { pages, boxes: totalBoxes, localOk, cloudOk };
};

export const resetPageAyahBoxes = async (pageSrc: string) => {
  if (typeof window === "undefined") return;
  const saved = getSavedAyahCoordinates();
  delete saved[pageSrc];
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(saved));

  try {
    await fetch("/api/save-boxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saved),
    });
  } catch (err) {
    console.debug("Local server save error on reset:", err);
  }

  try {
    await supabase.from("store").upsert({ key: CALIBRATION_STORAGE_KEY, value: saved });
  } catch (e) {
    console.error("Supabase delete error:", e);
  }
};

export const getAllPageSources = () => Object.keys(AYAH_COORDINATES).filter(k => !k.includes("fatiha"));