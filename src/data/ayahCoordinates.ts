import { supabase, hasValidSupabaseKey } from "../lib/supabase";

export interface AyahBox {
  surah: number;
  ayah: number;
  x: number;
  y: number;
  width: number;
  height: number;
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

export const AYAH_COORDINATES: Record<string, AyahBox[]> = {
  "/pages/fatiha.jpg": [
    { surah: 1, ayah: 1, x: 255, y: 630, width: 760, height: 150 },
    { surah: 1, ayah: 2, x: 255, y: 790, width: 760, height: 135 },
    { surah: 1, ayah: 3, x: 255, y: 930, width: 760, height: 140 },
    { surah: 1, ayah: 4, x: 255, y: 1075, width: 760, height: 145 },
    { surah: 1, ayah: 5, x: 255, y: 1225, width: 760, height: 145 },
    { surah: 1, ayah: 6, x: 255, y: 1375, width: 760, height: 145 },
    { surah: 1, ayah: 7, x: 255, y: 1525, width: 760, height: 140 },
  ],
  "/pages/600.jpg": [
    ...makeBoxes(14, 8, 140, 720, 980, 620, 2),
  ],
  "/pages/601.jpg": [
    ...makeBoxes(13, 3, 140, 240, 980, 255, 1),
    ...makeBoxes(12, 9, 140, 605, 980, 675, 3),
    ...makeBoxes(11, 5, 140, 1390, 980, 330, 2),
  ],
  "/pages/602.jpg": [
    ...makeBoxes(10, 4, 140, 250, 980, 300, 2),
    ...makeBoxes(9, 7, 140, 660, 980, 570, 2),
    ...makeBoxes(8, 3, 140, 1350, 980, 300, 1),
  ],
  "/pages/603.jpg": [
    ...makeBoxes(7, 6, 140, 245, 980, 520, 2),
    ...makeBoxes(6, 3, 140, 875, 980, 275, 1),
    ...makeBoxes(5, 5, 140, 1260, 980, 400, 2),
  ],
  "/pages/604.jpg": [
    ...makeBoxes(4, 4, 140, 245, 980, 315, 2),
    ...makeBoxes(3, 5, 140, 670, 980, 420, 2),
    ...makeBoxes(2, 6, 140, 1200, 980, 500, 2),
  ],
};

// صفحات المصحف الإضافية (جزء عمّ: النبأ → الناس) — تظهر في المعايرة لتعريف مناطق السور.
// ضع ملفات الصور في public/pages/ بنفس الأسماء (مثل 581.jpg، 585.jpg ...).
// القائمة تطابق الملفات الموجودة فعلياً في public/pages (581 + 585-598).
const EXTRA_PAGES = [581, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598];
for (const p of EXTRA_PAGES) {
  const key = `/pages/${p}.jpg`;
  if (!(key in AYAH_COORDINATES)) AYAH_COORDINATES[key] = [];
}

const cloneBoxes = (boxes: AyahBox[]) => boxes.map((box) => ({ ...box }));


export const syncCoordinatesFromServer = async () => {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return; // offline
  if (!hasValidSupabaseKey()) return; // skip sync when no valid API key
  try {
    const { data } = await supabase.from("store").select("value").eq("key", CALIBRATION_STORAGE_KEY).maybeSingle();
    if (data && data.value && Object.keys(data.value as Record<string, unknown>).length > 0) {
      // Server has data → mirror to local
      localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(data.value));
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

export const getSavedAyahCoordinates = (): Record<string, AyahBox[]> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
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
    await supabase.from("store").upsert({ key: CALIBRATION_STORAGE_KEY, value: saved });
  } catch (e) {
    console.error("Supabase delete error:", e);
  }
};

export const getAllPageSources = () => Object.keys(AYAH_COORDINATES);