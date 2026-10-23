import { supabase, hasValidSupabaseKey } from "../lib/supabase";

/**
 * توقيتات الآيات اليدوية لكل سورة (بالثواني).
 *
 * البنية الكاملة (الموصى بها) لكل سورة:
 *   {
 *     teacher: [t0, t1, t2, ...],   // بداية كل آية في قسم المعلم
 *     kidsStart: number,            // (اختياري) ثانية بداية قسم الطفل في نفس الملف
 *     kids: [t0, t1, t2, ...],      // (اختياري) بداية كل آية في قسم الطفل (محسوبة من بداية الملف)
 *   }
 *
 * الصيغة المختصرة (للتوافق مع القديم): مصفوفة أرقام = توقيتات المعلم فقط.
 *
 * كيفية ملء التوقيتات:
 *  1) افتح ملف الصوت في أي مشغّل (VLC / Audacity).
 *  2) دوّن ثانية بداية كل آية بدقة.
 *  3) إذا كان نفس الملف يحوي المعلم ثم الطفل، اكتب kidsStart = الثانية التي يبدأ فيها الطفل،
 *     ثم اكتب توقيتات آيات الطفل في kids[] (محسوبة من بداية الملف، ليس من kidsStart).
 *  4) إذا لا يوجد قسم طفل، اكتفِ بـ teacher فقط.
 *
 * مثال (الفاتحة): المعلم 0:00→0:42، الطفل 0:43→1:25
 *   1: {
 *     teacher: [0, 5.5, 12.0, 18.0, 24.5, 31.0, 37.0],
 *     kidsStart: 43.0,
 *     kids:    [43.0, 48.5, 55.0, 61.0, 67.5, 74.0, 80.0],
 *   }
 */

export interface AudioSegment {
  id: string;
  start: number;
  end: number;
  speaker: "teacher" | "kids";
  ayah?: number;
  label?: string;
}

export interface SurahTimings {
  teacher: number[];          // start time of each ayah during teacher recitation
  kidsStart?: number;         // start of kids section in the SAME file (if combined)
  kids?: number[];            // start time of each ayah during kids recitation
  segments?: AudioSegment[];  // (optional) custom audio segments with start/end bounds
  teacherAudioUrl?: string;   // uploaded teacher recording
  kidsAudioUrl?: string;      // uploaded kids recording
}

export const AYAH_TIMINGS: Record<number, SurahTimings | number[]> = {
  1: {
    teacher: [0, 5.5, 12.0, 18.0, 24.5, 31.0, 37.0],
    kidsStart: 43.0,
    kids: [43.0, 48.5, 55.0, 61.0, 67.5, 74.0, 80.0],
  }
};


// === LocalStorage overrides (saved from /timings tool) ===
const TIMINGS_STORAGE_KEY = "mushaf:ayahTimings:v1";

export const syncTimingsFromServer = async () => {
  if (typeof window === "undefined") return;
  
  // 1. مزامنة من ملفات السيرفر المحلي أولاً (الحاسوب)
  try {
    const res = await fetch("/api/save-timings", { cache: "no-store" });
    if (res.ok) {
      const localData = await res.json();
      if (localData && Object.keys(localData).length > 0) {
        const cur = getSavedTimings();
        const merged = { ...cur, ...localData };
        localStorage.setItem(TIMINGS_STORAGE_KEY, JSON.stringify(merged));
        window.dispatchEvent(new Event("mushaf:sync_complete"));
      }
    }
  } catch (err) {
    console.debug("Local timings fetch skipped:", err);
  }

  // 2. مزامنة من Supabase السحابي
  if (typeof navigator !== "undefined" && !navigator.onLine) return; // offline
  if (!hasValidSupabaseKey()) return; // skip sync when no valid API key
  try {
    const { data } = await supabase.from("store").select("value").eq("key", TIMINGS_STORAGE_KEY).maybeSingle();
    if (data && data.value) {
      const cur = getSavedTimings();
      const merged = { ...cur, ...data.value };
      localStorage.setItem(TIMINGS_STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new Event("mushaf:sync_complete"));
    }
  } catch (e) {
    console.error("Supabase sync timings error:", e);
  }
};

export function getSavedTimings(): Record<number, SurahTimings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(TIMINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function saveSurahTimings(surahNumber: number, timings: Partial<SurahTimings>) {
  if (typeof window === "undefined") return;
  const all = getSavedTimings();
  all[surahNumber] = {
    ...(all[surahNumber] || { teacher: [] }),
    ...timings,
  };
  localStorage.setItem(TIMINGS_STORAGE_KEY, JSON.stringify(all));
  
  // 1. الحفظ في ملفات الحاسوب والمشروع عبر السيرفر المحلي
  try {
    await fetch("/api/save-timings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all),
    });
  } catch (err) {
    console.debug("Local server timings save skipped:", err);
  }

  // 2. الحفظ في سيرفر Supabase السحابي
  try {
    await supabase.from("store").upsert({ key: TIMINGS_STORAGE_KEY, value: all });
  } catch (e) {
    console.error("Supabase save timings error:", e);
  }
}

export async function clearSavedSurahTimings(surahNumber: number) {
  if (typeof window === "undefined") return;
  const all = getSavedTimings();
  delete all[surahNumber];
  localStorage.setItem(TIMINGS_STORAGE_KEY, JSON.stringify(all));
  
  try {
    await supabase.from("store").upsert({ key: TIMINGS_STORAGE_KEY, value: all });
  } catch (e) {
    console.error("Supabase delete timings error:", e);
  }
}

import { surahs } from "./surahs";

export function getSurahAyahTotal(surahNumber: number): number {
  const s = surahs.find(item => item.number === surahNumber);
  return s?.ayahCount || AYAH_COUNTS[surahNumber] || 7;
}

/** Approximate ayah counts for surahs in this app (legacy fallback). */
export const AYAH_COUNTS: Record<number, number> = {
  1: 7,    // الفاتحة
  2: 6,    // الناس
  3: 5,    // الفلق
  4: 4,    // الإخلاص
  5: 5,    // المسد
  6: 3,    // النصر
  7: 6,    // الكافرون
  8: 3,    // الكوثر
  9: 7,    // الماعون
  10: 4,   // قريش
  11: 5,   // الفيل
  12: 9,   // الهمزة
  13: 3,   // العصر
  14: 8,   // التكاثر
};

/** Normalize stored timings to the full SurahTimings shape. */
function normalize(entry: SurahTimings | number[] | undefined): SurahTimings | null {
  if (!entry) return null;
  if (Array.isArray(entry)) return { teacher: entry };
  return entry;
}

/** Resolve timings: prefer saved (LocalStorage) over hardcoded. */
function resolveTimings(surahNumber: number): SurahTimings | null {
  const saved = getSavedTimings()[surahNumber];
  if (saved && ((saved.teacher && saved.teacher.length > 0) || (saved.kids && saved.kids.length > 0) || (saved.segments && saved.segments.length > 0))) return saved;
  return normalize(AYAH_TIMINGS[surahNumber]);
}

export function getSurahTimings(surahNumber: number): SurahTimings | null {
  return resolveTimings(surahNumber);
}

/** True if surah has any precise teacher timings. */
export function hasManualTimings(surahNumber: number): boolean {
  const t = resolveTimings(surahNumber);
  return !!t && t.teacher.length > 0;
}

/** True if surah has a combined teacher+kids file with split point defined. */
export function hasKidsSection(surahNumber: number): boolean {
  const t = resolveTimings(surahNumber);
  return !!t && typeof t.kidsStart === "number";
}

/**
 * Determine which speaker is active at a given time in the audio file.
 * Used when a single file contains teacher then kids.
 */
export function getSpeakerAtTime(surahNumber: number, currentTime: number): "teacher" | "kids" | null {
  const t = resolveTimings(surahNumber);
  if (!t || typeof t.kidsStart !== "number") return null;
  return currentTime >= t.kidsStart ? "kids" : "teacher";
}

/**
 * Compute the current ayah (1-based) at a given playback time.
 * Returns 0 if not determinable.
 */
export function getCurrentAyahAtTime(
  surahNumber: number,
  currentTime: number,
  audioDuration: number,
): { ayah: number; speaker: "teacher" | "kids" | null } {
  const total = getSurahAyahTotal(surahNumber);
  const t = resolveTimings(surahNumber);

  // Manual timings path
  if (t && t.teacher.length > 0) {
    const speaker = getSpeakerAtTime(surahNumber, currentTime);
    const list = speaker === "kids" && t.kids && t.kids.length > 0 ? t.kids : t.teacher;
    // find last index whose start <= currentTime
    let idx = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i] <= currentTime + 0.05) idx = i;
      else break;
    }
    return { ayah: Math.min(idx + 1, total), speaker };
  }

  // Fallback: linear estimation across the whole duration
  if (audioDuration > 0 && isFinite(audioDuration)) {
    const ayahDur = audioDuration / total;
    const est = Math.floor(currentTime / ayahDur) + 1;
    return { ayah: Math.min(Math.max(est, 1), total), speaker: null };
  }
  return { ayah: 0, speaker: null };
}

/** Get start time for a specific ayah (used when jumping). */
export function getAyahStartTime(
  surahNumber: number,
  ayahIndex: number,
  audioDuration: number,
  speaker: "teacher" | "kids" = "teacher",
): number {
  const t = resolveTimings(surahNumber);
  if (t) {
    const list = speaker === "kids" && t.kids ? t.kids : t.teacher;
    if (list[ayahIndex - 1] !== undefined) return list[ayahIndex - 1];
  }
  const total = getSurahAyahTotal(surahNumber);
  if (total <= 0 || !isFinite(audioDuration)) return 0;
  return (audioDuration / total) * (ayahIndex - 1);
}
