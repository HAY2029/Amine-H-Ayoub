/**
 * surahLink.ts — ربط السور بالصوت من السيرفر وحفظ التوقيت بدقة ثانية واحدة
 * 
 * هذا الملف يدير:
 * 1. روابط الصوت من السيرفر الخارجي (لتسريع التحميل على الهاتف)
 * 2. توقيتات كل آية بالثواني (دقة ثانية واحدة)
 * 3. حفظ التوقيتات في localStorage ومزامنتها مع السيرفر
 */

import { supabase, hasValidSupabaseKey } from "../lib/supabase";

const LINK_STORAGE_KEY = "mushaf:surahLink:v1";
const TIMING_STORAGE_KEY = "mushaf:surahTiming:v1";

/**
 * رابط السورة من السيرفر الخارجي
 */
export const getSurahServerUrl = (surahNumber: number): string => {
  // يمكن تغيير هذا الرابط لرابط السيرفر الخاص بك
  return `https://your-server.com/audio/surahs/${surahNumber}.mp3`;
};

/**
 * هيكل بيانات الربط والتوقيت للسورة
 */
export interface SurahLink {
  surah: number;
  audioUrl: string;        // رابط الصوت من السيرفر
  teacherUrl?: string;     // رابط صوت المعلم
  kidsUrl?: string;        // رابط صوت الطفل
  timings: number[];       // توقيت بداية كل آية بالثواني (دقة ثانية واحدة)
  kidsStart?: number;      // بداية قسم الطفل في نفس الملف
  kidsTimings?: number[];  // توقيتات آيات الطفل
  updatedAt: number;       // وقت آخر تحديث (timestamp)
}

/**
 * تحميل الروابط المحفوظة محلياً
 */
export const getSavedLinks = (): Record<number, SurahLink> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LINK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/**
 * حفظ رابط وتوقيت سورة (دقيقة = ثانية واحدة)
 */
export const saveSurahLink = (link: SurahLink) => {
  if (typeof window === "undefined") return;
  const all = getSavedLinks();
  all[link.surah] = {
    ...link,
    updatedAt: Date.now(),
  };
  localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(all));

  // مزامنة مع السيرفر إن توفر
  if (hasValidSupabaseKey() && typeof navigator !== "undefined" && navigator.onLine) {
    void Promise.resolve(supabase.from("store").upsert({ key: LINK_STORAGE_KEY, value: all })).catch(() => {});
  }
};

/**
 * حفظ توقيت آية واحدة بدقة ثانية واحدة
 */
export const saveAyahTiming = (surah: number, ayah: number, seconds: number) => {
  const all = getSavedLinks();
  let link = all[surah];
  if (!link) {
    link = {
      surah,
      audioUrl: getSurahServerUrl(surah),
      timings: [],
      updatedAt: Date.now(),
    };
  }
  // ضمان أن المصفوفة كبيرة بما يكفي
  while (link.timings.length < ayah) {
    link.timings.push(0);
  }
  link.timings[ayah - 1] = Math.round(seconds); // دقة ثانية واحدة
  saveSurahLink(link);
};

/**
 * جلب توقيتات سورة محددة
 */
export const getSurahLink = (surah: number): SurahLink | null => {
  const all = getSavedLinks();
  return all[surah] || null;
};

/**
 * مزامنة الروابط من السيرفر
 */
export const syncLinksFromServer = async () => {
  if (typeof window === "undefined" || !hasValidSupabaseKey()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  try {
    const { data } = await supabase
      .from("store")
      .select("value")
      .eq("key", LINK_STORAGE_KEY)
      .maybeSingle();
    if (data && data.value) {
      localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(data.value));
      window.dispatchEvent(new Event("mushaf:surahLink_sync"));
    }
  } catch (e) {
    console.debug("surahLink sync error:", e);
  }
};

/**
 * تهيئة الروابط الافتراضية للسور الموجودة في السيرفر
 */
export const initDefaultLinks = () => {
  if (typeof window === "undefined") return;
  const all = getSavedLinks();
  let changed = false;
  for (let i = 1; i <= 114; i++) {
    if (!all[i]) {
      all[i] = {
        surah: i,
        audioUrl: getSurahServerUrl(i),
        timings: [],
        updatedAt: Date.now(),
      };
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(all));
  }
};