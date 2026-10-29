import { supabase, hasValidSupabaseKey } from "../lib/supabase";

/**
 * 📋 سجل السور المركزي — تعريف كامل لكل سورة (نظام تعريف مستقبلي).
 * يُخزَّن محلياً + على السيرفر (Supabase store) ويتزامن بين الأجهزة،
 * ليسهّل لاحقاً ربط السورة بالتظليل والتلاوة والألعاب والاختبارات.
 */
export interface SurahRegistryEntry {
  surah: number;          // رقم السورة (1-114)
  name: string;           // اسم السورة
  ayahCount: number;      // عدد الآيات
  pageSrc: string;        // صفحة المصحف المرتبطة (مثل /pages/604.jpg) — أول صفحة للسورة
  /**
   * كل صفحات السورة بالترتيب — للسور الممتدة على صفحتين أو أكثر.
   * إن لم تُحدَّد، تُعتبر السورة على صفحة واحدة (pageSrc).
   */
  pages?: string[];
  box?: {                 // موضع مربع السورة فوق الصفحة (إحداثيات 1260x1929)
    x: number;
    y: number;
    width: number;
    height: number;
  };
  color?: string;         // لون تظليل السورة الذي حدده المستخدم
  notes?: string;         // ملاحظات حرة (مثل: تُحفظ في السيرفر لسهولة الربط لاحقاً)
  updatedAt: number;      // طابع آخر تحديث
}

const REGISTRY_KEY = "mushaf:surahRegistry:v1";

export const getSurahRegistry = (): Record<string, SurahRegistryEntry> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const getSurahRegistryEntry = (surah: number): SurahRegistryEntry | null => {
  return getSurahRegistry()[String(surah)] || null;
};

/** حفظ/تحديث تعريف سورة في السجل + رفعه إلى السيرفر */
export const upsertSurahRegistryEntry = async (entry: SurahRegistryEntry) => {
  if (typeof window === "undefined") return;
  const all = getSurahRegistry();
  all[String(entry.surah)] = { ...entry, updatedAt: Date.now() };
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(all));

  // رفع إلى السيرفر (Supabase store) — مصدر الحقيقة المشترك
  try {
    await supabase.from("store").upsert({ key: REGISTRY_KEY, value: all });
  } catch (e) {
    console.error("Supabase save surah registry error:", e);
  }
};

/** حذف تعريف سورة من السجل + تحديث السيرفر */
export const deleteSurahRegistryEntry = async (surah: number) => {
  if (typeof window === "undefined") return;
  const all = getSurahRegistry();
  delete all[String(surah)];
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(all));
  try {
    await supabase.from("store").upsert({ key: REGISTRY_KEY, value: all });
  } catch (e) {
    console.error("Supabase delete surah registry error:", e);
  }
};

/** مزامنة سجل السور من السيرفر (تُستدعى عند فتح الصفحة) */
export const syncSurahRegistryFromServer = async (): Promise<Record<string, SurahRegistryEntry> | null> => {
  if (typeof window === "undefined") return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  if (!hasValidSupabaseKey()) return null;
  try {
    const { data } = await supabase.from("store").select("value").eq("key", REGISTRY_KEY).maybeSingle();
    if (data?.value && typeof data.value === "object") {
      const server = data.value as Record<string, SurahRegistryEntry>;
      // دمج آمن: نأخذ الأحدث لكل سورة (بواسطة updatedAt)
      const local = getSurahRegistry();
      const merged = { ...local };
      for (const [k, v] of Object.entries(server)) {
        if (!merged[k] || (v?.updatedAt || 0) > (merged[k]?.updatedAt || 0)) merged[k] = v;
      }
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (e) {
    console.debug("Supabase sync surah registry info:", e);
  }
  return null;
};
export interface SurahRegion {
  name: string;        // اسم السورة كما يكتبه المستخدم (مثل: النبأ)
  surah?: number;      // رقم اختياري إن وُجد
  x: number;
  y: number;
  width: number;
  height: number;
}

const REGIONS_STORAGE_KEY = "mushaf:surahRegions:v1";

const clone = (regions: SurahRegion[]) => regions.map((r) => ({ ...r }));

export const getSavedSurahRegions = (): Record<string, SurahRegion[]> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(REGIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const getPageSurahRegions = (pageSrc: string): SurahRegion[] => {
  const all = getSavedSurahRegions();
  return pageSrc in all ? clone(all[pageSrc]) : [];
};

export const savePageSurahRegions = async (pageSrc: string, regions: SurahRegion[]) => {
  if (typeof window === "undefined") return;
  const all = getSavedSurahRegions();
  all[pageSrc] = clone(regions);
  localStorage.setItem(REGIONS_STORAGE_KEY, JSON.stringify(all));
  try {
    await supabase.from("store").upsert({ key: REGIONS_STORAGE_KEY, value: all });
  } catch (e) {
    console.error("Supabase save regions error:", e);
  }
};

/** يجلب مناطق السور من السيرفر إن وُجدت (للمزامنة عبر الأجهزة). */
export const syncSurahRegionsFromServer = async () => {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return; // offline
  if (!hasValidSupabaseKey()) return;
  try {
    const { data } = await supabase.from("store").select("value").eq("key", REGIONS_STORAGE_KEY).maybeSingle();
    if (data && data.value && Object.keys(data.value as Record<string, unknown>).length > 0) {
      localStorage.setItem(REGIONS_STORAGE_KEY, JSON.stringify(data.value));
      window.dispatchEvent(new Event("mushaf:sync_complete"));
    }
  } catch (e) {
    console.debug("Supabase sync regions info:", e);
  }
};
