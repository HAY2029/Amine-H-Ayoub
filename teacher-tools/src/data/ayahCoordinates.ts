import { supabase, hasValidSupabaseKey } from "../lib/supabase";

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
  582: [{ surah: 78, startAyah: 1, endAyah: 30, hasBasmalah: true }],
  583: [
    { surah: 78, startAyah: 31, endAyah: 40, hasBasmalah: false },
    { surah: 79, startAyah: 1, endAyah: 15, hasBasmalah: true }
  ],
  584: [{ surah: 79, startAyah: 16, endAyah: 46, hasBasmalah: false }],
  585: [{ surah: 80, startAyah: 1, endAyah: 42, hasBasmalah: true }],
  586: [
    { surah: 81, startAyah: 1, endAyah: 29, hasBasmalah: true },
    { surah: 82, startAyah: 1, endAyah: 5, hasBasmalah: true }
  ],
  587: [
    { surah: 82, startAyah: 6, endAyah: 19, hasBasmalah: false },
    { surah: 83, startAyah: 1, endAyah: 6, hasBasmalah: true }
  ],
  588: [{ surah: 83, startAyah: 7, endAyah: 36, hasBasmalah: false }],
  589: [{ surah: 84, startAyah: 1, endAyah: 25, hasBasmalah: true }],
  590: [
    { surah: 85, startAyah: 1, endAyah: 22, hasBasmalah: true },
    { surah: 86, startAyah: 1, endAyah: 5, hasBasmalah: true }
  ],
  591: [
    { surah: 86, startAyah: 6, endAyah: 17, hasBasmalah: false },
    { surah: 87, startAyah: 1, endAyah: 15, hasBasmalah: true }
  ],
  592: [
    { surah: 87, startAyah: 16, endAyah: 19, hasBasmalah: false },
    { surah: 88, startAyah: 1, endAyah: 26, hasBasmalah: true }
  ],
  593: [{ surah: 89, startAyah: 1, endAyah: 30, hasBasmalah: true }],
  594: [
    { surah: 90, startAyah: 1, endAyah: 20, hasBasmalah: true },
    { surah: 91, startAyah: 1, endAyah: 15, hasBasmalah: true }
  ],
  595: [
    { surah: 92, startAyah: 1, endAyah: 21, hasBasmalah: true },
    { surah: 93, startAyah: 1, endAyah: 11, hasBasmalah: true },
    { surah: 94, startAyah: 1, endAyah: 8, hasBasmalah: true }
  ],
  596: [
    { surah: 95, startAyah: 1, endAyah: 8, hasBasmalah: true },
    { surah: 96, startAyah: 1, endAyah: 19, hasBasmalah: true }
  ],
  597: [
    { surah: 97, startAyah: 1, endAyah: 5, hasBasmalah: true },
    { surah: 98, startAyah: 1, endAyah: 5, hasBasmalah: true }
  ],
  598: [
    { surah: 98, startAyah: 6, endAyah: 8, hasBasmalah: false },
    { surah: 99, startAyah: 1, endAyah: 8, hasBasmalah: true },
    { surah: 100, startAyah: 1, endAyah: 11, hasBasmalah: true }
  ],
  599: [
    { surah: 101, startAyah: 1, endAyah: 11, hasBasmalah: true },
    { surah: 102, startAyah: 1, endAyah: 8, hasBasmalah: true },
    { surah: 103, startAyah: 1, endAyah: 3, hasBasmalah: true }
  ],
  600: [
    { surah: 104, startAyah: 1, endAyah: 9, hasBasmalah: true },
    { surah: 105, startAyah: 1, endAyah: 5, hasBasmalah: true },
    { surah: 106, startAyah: 1, endAyah: 4, hasBasmalah: true }
  ],
  601: [
    { surah: 107, startAyah: 1, endAyah: 7, hasBasmalah: true },
    { surah: 108, startAyah: 1, endAyah: 3, hasBasmalah: true },
    { surah: 109, startAyah: 1, endAyah: 6, hasBasmalah: true }
  ],
  602: [
    { surah: 110, startAyah: 1, endAyah: 3, hasBasmalah: true },
    { surah: 111, startAyah: 1, endAyah: 5, hasBasmalah: true },
    { surah: 112, startAyah: 1, endAyah: 4, hasBasmalah: true }
  ],
  603: [
    { surah: 112, startAyah: 1, endAyah: 4, hasBasmalah: true },
    { surah: 113, startAyah: 1, endAyah: 5, hasBasmalah: true },
    { surah: 114, startAyah: 1, endAyah: 6, hasBasmalah: true }
  ],
  604: [
    { surah: 112, startAyah: 1, endAyah: 4, hasBasmalah: true },
    { surah: 113, startAyah: 1, endAyah: 5, hasBasmalah: true },
    { surah: 114, startAyah: 1, endAyah: 6, hasBasmalah: true }
  ],
};

/**
 * توليد مربعات تظليل تلقائية ذكية وجميلة لأي صفحة مصحف
 * تغطي آيات السور الموجودة في الصفحة بتنسيق شبكي متناسق مع قياس الصفحة 1260x1929
 */
export function generateDefaultBoxesForPage(pageSrc: string): AyahBox[] {
  const match = pageSrc.match(/(\d+)/);
  const pageNum = match ? parseInt(match[1], 10) : 0;
  // القرآن بدون تظليل إلا الفاتحة — فقط الفاتحة تحمل تظليلاً افتراضياً
  if (pageNum === 0 || pageNum === 1 || pageSrc.includes("fatiha") || pageSrc.includes("0.jpg") || pageSrc.includes("1.jpg")) {
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

  // سائر صفحات القرآن الكريم بدون تظليل افتراضي
  return [];
}

// سيتم الاعتماد كلياً على المجلد المحلي `public/pages/`
export const AYAH_COORDINATES: Record<string, AyahBox[]> = (defaultBoxes as Record<string, AyahBox[]>) || {};

// صفحات المصحف المحلية التي أضافها المستخدم
const LOCAL_PAGES = [0, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604];

for (const p of LOCAL_PAGES) {
  const key = `/pages/${p}.jpg`;
  if (!(key in AYAH_COORDINATES)) AYAH_COORDINATES[key] = [];
}

const cloneBoxes = (boxes: AyahBox[]) => boxes.map((box) => ({ ...box }));


export const syncCoordinatesFromServer = async () => {
  if (typeof window === "undefined") return;

  // 1. محاولة الجلب من سيرفر المشروع المحلي (/api/save-boxes / boxes-dump.json)
  try {
    const res = await fetch("/api/save-boxes", { cache: "no-store" });
    if (res.ok) {
      const serverDump = await res.json();
      if (serverDump && typeof serverDump === "object" && Object.keys(serverDump).length > 0) {
        const local = getSavedAyahCoordinates();
        const merged = { ...local, ...serverDump };
        localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(merged));
        window.dispatchEvent(new Event("mushaf:sync_complete"));
      }
    }
  } catch (err) {
    console.debug("Local server boxes sync info:", err);
  }

  // 2. محاولة الجلب من قاعدة بيانات Supabase السحابية
  if (typeof navigator !== "undefined" && !navigator.onLine) return; // offline
  if (!hasValidSupabaseKey()) return; // skip sync when no valid API key
  try {
    const { data } = await supabase.from("store").select("value").eq("key", CALIBRATION_STORAGE_KEY).maybeSingle();
    if (data && data.value && Object.keys(data.value as Record<string, unknown>).length > 0) {
      // Server has data → merge with local
      const local = getSavedAyahCoordinates();
      const merged = { ...local, ...(data.value as Record<string, unknown>) };
      localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new Event("mushaf:sync_complete"));
    } else {
      // Server empty → upload local copy so it persists across devices/refreshes
      const local = getSavedAyahCoordinates();
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
export const getPageAyahBoxes = (pageSrc: string) => {
  const allSaved = getSavedAyahCoordinates();
  const result: AyahBox[] = [];
  const seen = new Set<string>();

  // 1. المربعات المباشرة للصفحة
  const directBoxes = pageSrc in allSaved
    ? allSaved[pageSrc]
    : (AYAH_COORDINATES[pageSrc] ?? []);
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

  // إذا لم توجد مربعات محفوظة، يتم توليد الافتراضي فقط لسورة الفاتحة، أما باقي صفحات المصحف فتظل بدون تظليل
  if (result.length === 0) {
    return generateDefaultBoxesForPage(pageSrc);
  }

  return result;
};

/**
 * حفظ مربعات الآية لصفحة معينة في السيرفر.
 * إذا كان لأي مربع حقل `pages`، يتم نسخه تلقائياً إلى كل الصفحات المذكورة.
 */
export const savePageAyahBoxes = async (pageSrc: string, boxes: AyahBox[]) => {
  if (typeof window === "undefined") return;
  const saved = getSavedAyahCoordinates();
  saved[pageSrc] = cloneBoxes(boxes);
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

export const getAllPageSources = () => Object.keys(AYAH_COORDINATES);