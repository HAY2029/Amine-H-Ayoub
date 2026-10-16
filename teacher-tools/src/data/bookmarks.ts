/**
 * علامات مرجعية في القراءة — تُحفظ محلياً + على السيرفر (Supabase store) وتتزامن.
 */
import { supabase, hasValidSupabaseKey } from "../lib/supabase";

export interface Bookmark {
  id: string;
  src: string;        // مسار صفحة المصحف
  name: string;       // اسم الصفحة المعروض
  surah?: string;     // اسم السورة المحدّدة وقت الحفظ
  createdAt: number;
}

const KEY = "mushaf:bookmarks:v1";

export const getBookmarks = (): Bookmark[] => {
  if (typeof window === "undefined") return [];
  try { const r = localStorage.getItem(KEY); const v = r ? JSON.parse(r) : []; return Array.isArray(v) ? v : []; } catch { return []; }
};

const persist = (b: Bookmark[]) => {
  localStorage.setItem(KEY, JSON.stringify(b));
  if (hasValidSupabaseKey()) supabase.from("store").upsert({ key: KEY, value: b }).then(() => {}, () => {});
};

export const addBookmark = (bm: Bookmark): Bookmark[] => {
  const all = getBookmarks().filter(b => !(b.src === bm.src && b.surah === bm.surah));
  all.unshift(bm);
  persist(all.slice(0, 50));
  return getBookmarks();
};

export const removeBookmark = (id: string): Bookmark[] => {
  const all = getBookmarks().filter(b => b.id !== id);
  persist(all);
  return all;
};

export const syncBookmarksFromServer = async () => {
  if (typeof window === "undefined" || !hasValidSupabaseKey()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return; // offline
  try {
    const { data } = await supabase.from("store").select("value").eq("key", KEY).maybeSingle();
    if (data && Array.isArray(data.value)) localStorage.setItem(KEY, JSON.stringify(data.value));
  } catch (e) { console.debug("sync bookmarks info:", e); }
};
