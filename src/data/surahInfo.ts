import { supabase, hasValidSupabaseKey } from "../lib/supabase";

export interface SurahMeta {
  surahNumber: number;
  surahName: string;
  ayahCount: number;
  revelationType?: string;
  teacherAudioUrl?: string;
  kidsAudioUrl?: string;
  teacherSyncedAyahs?: number[];
  kidsSyncedAyahs?: number[];
  pageSrc?: string;
  updatedAt: number;
}

const SURAH_INFO_STORAGE_KEY = "mushaf:surahInfo:v1";

export function getAllSavedSurahInfo(): Record<number, SurahMeta> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SURAH_INFO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getSavedSurahInfo(surahNumber: number): SurahMeta | null {
  const all = getAllSavedSurahInfo();
  return all[surahNumber] || null;
}

export async function saveSurahInfo(info: SurahMeta): Promise<void> {
  if (typeof window === "undefined") return;
  const all = getAllSavedSurahInfo();
  all[info.surahNumber] = {
    ...(all[info.surahNumber] || {}),
    ...info,
    updatedAt: Date.now(),
  };

  localStorage.setItem(SURAH_INFO_STORAGE_KEY, JSON.stringify(all));

  // 1. حفظ في ملفات الحاسوب والمشروع عبر السيرفر المحلي
  try {
    await fetch("/api/save-surah-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all),
    });
  } catch (err) {
    console.debug("Local surah info save skipped:", err);
  }

  // 2. حفظ في Supabase السحابي
  try {
    await supabase.from("store").upsert({ key: SURAH_INFO_STORAGE_KEY, value: all });
  } catch (e) {
    console.error("Supabase surah info save error:", e);
  }
}

export async function syncSurahInfoFromServer(): Promise<void> {
  if (typeof window === "undefined") return;

  // 1. مزامنة من ملفات السيرفر المحلي (الحاسوب)
  try {
    const res = await fetch("/api/save-surah-info", { cache: "no-store" });
    if (res.ok) {
      const localData = await res.json();
      if (localData && Object.keys(localData).length > 0) {
        const cur = getAllSavedSurahInfo();
        const merged = { ...cur, ...localData };
        localStorage.setItem(SURAH_INFO_STORAGE_KEY, JSON.stringify(merged));
      }
    }
  } catch (err) {
    console.debug("Local surah info fetch skipped:", err);
  }

  // 2. مزامنة من Supabase
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (!hasValidSupabaseKey()) return;
  try {
    const { data } = await supabase.from("store").select("value").eq("key", SURAH_INFO_STORAGE_KEY).maybeSingle();
    if (data && data.value) {
      const cur = getAllSavedSurahInfo();
      const merged = { ...cur, ...data.value };
      localStorage.setItem(SURAH_INFO_STORAGE_KEY, JSON.stringify(merged));
    }
  } catch (e) {
    console.error("Supabase surah info sync error:", e);
  }
}
