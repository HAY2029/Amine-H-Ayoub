/**
 * surahSegments.ts — نظام تقسيم السورة بين صوت المعلم والطفل
 * 
 * يسمح بتقسيم السورة إلى مقاطع، كل مقطع يُقرأ إما من قبل المعلم أو الطفل،
 * مع تشغيلها بالتناوب: معلم → طفل → معلم → طفل...
 */

export interface SurahSegment {
  id: string;
  surah: number;
  startAyah: number;      // الآية.beginning
  endAyah: number;        // الآية.end
  speaker: "teacher" | "kids"; // من يقرأ هذا المقطع
  startTime: number;      // توقيت البداية بالثواني
  endTime: number;        // توقيت النهاية بالثواني
  label: string;          // تسمية المقطع (مثل: "بسلمة معلم", "بسلمة طفل")
}

const SEGMENTS_STORAGE_KEY = "mushaf:surahSegments:v1";

/**
 * تحميل جميع المقاطع المحفوظة
 */
export const getSavedSegments = (): Record<number, SurahSegment[]> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SEGMENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/**
 * حفظ مقاطع سورة معينة
 */
export const saveSurahSegments = (surah: number, segments: SurahSegment[]) => {
  if (typeof window === "undefined") return;
  const all = getSavedSegments();
  all[surah] = segments;
  localStorage.setItem(SEGMENTS_STORAGE_KEY, JSON.stringify(all));
};

/**
 * جلب مقاطع سورة معينة
 */
export const getSurahSegments = (surah: number): SurahSegment[] => {
  const all = getSavedSegments();
  return all[surah] || [];
};

/**
 * إضافة مقطع جديد للسورة
 */
export const addSurahSegment = (segment: SurahSegment) => {
  const all = getSavedSegments();
  const existing = all[segment.surah] || [];
  existing.push(segment);
  // ترتيب المقاطع حسب رقم الآية
  existing.sort((a, b) => a.startAyah - b.startAyah);
  all[segment.surah] = existing;
  localStorage.setItem(SEGMENTS_STORAGE_KEY, JSON.stringify(all));
};

/**
 * حذف مقطع
 */
export const removeSurahSegment = (surah: number, segmentId: string) => {
  const all = getSavedSegments();
  const existing = all[surah] || [];
  all[surah] = existing.filter(s => s.id !== segmentId);
  localStorage.setItem(SEGMENTS_STORAGE_KEY, JSON.stringify(all));
};

/**
 * إنشاء مقاطع تلقائية للسورة بالتناوب بين المعلم والطفل
 * كل مقطع يحتوي على آيات محددة
 */
export const createAlternatingSegments = (
  surah: number,
  totalAyahs: number,
  segmentSize: number = 3, // عدد الآيات في كل مقطع
  startWith: "teacher" | "kids" = "teacher"
): SurahSegment[] => {
  const segments: SurahSegment[] = [];
  let currentAyah = 1;
  let speaker: "teacher" | "kids" = startWith;
  let segmentIndex = 1;

  while (currentAyah <= totalAyahs) {
    const endAyah = Math.min(currentAyah + segmentSize - 1, totalAyahs);
    segments.push({
      id: `seg_${surah}_${segmentIndex}`,
      surah,
      startAyah: currentAyah,
      endAyah,
      speaker,
      startTime: 0, // سيتم ملؤه لاحقًا
      endTime: 0,
      label: `${speaker === "teacher" ? "معلم" : "طفل"} - آيات ${currentAyah}-${endAyah}`,
    });
    currentAyah = endAyah + 1;
    speaker = speaker === "teacher" ? "kids" : "teacher";
    segmentIndex++;
  }

  return segments;
};

/**
 * 가져 المقاطع المرتبة لتشغيلها بالتناوب
 */
export const getOrderedSegments = (surah: number): SurahSegment[] => {
  const segments = getSurahSegments(surah);
  return segments.sort((a, b) => a.startAyah - b.startAyah);
};

/**
 * جلب المقطع التالي للتشغيل حسب الآية الحالية
 */
export const getNextSegment = (surah: number, currentAyah: number): SurahSegment | null => {
  const segments = getOrderedSegments(surah);
  return segments.find(s => s.startAyah > currentAyah) || null;
};

/**
 * مسح جميع مقاطع سورة
 */
export const clearSurahSegments = (surah: number) => {
  const all = getSavedSegments();
  delete all[surah];
  localStorage.setItem(SEGMENTS_STORAGE_KEY, JSON.stringify(all));
};