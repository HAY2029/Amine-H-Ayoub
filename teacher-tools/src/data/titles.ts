/**
 * نظام الألقاب والدرجات:
 * - يتقدّم الطفل درجة (لقب جديد) بعد كل (surahsPerLevel) سورة يُتقنها (الافتراضي 5 — أي 5 أجزاء تقريباً).
 * - الإعدادات قابلة للتعديل من صفحة admin.html الخارجية (localStorage + مزامنة سيرفر إن توفّر).
 * - أكواد النقاط المجانية لمرة واحدة (يُنشئها وليّ الأمر من admin.html).
 * - كود HTML خارجي يُعرض أسفل قسم الألعاب.
 */
import { supabase, hasValidSupabaseKey } from "../lib/supabase";

export interface TitlesConfig {
  surahsPerLevel: number;   // عدد السور لكل لقب (افتراضي 5)
  titles: string[];         // أسماء الألقاب بالترتيب (كل لقب غير مذكر متوازن)
  certificateHeader: string; // عنوان الشهادة
}

export const TITLES_CONFIG_KEY = "mushaf:titlesConfig:v1";
export const ONE_TIME_CODES_KEY = "mushaf:oneTimeCodes:v1";
export const EXTERNAL_HTML_KEY = "mushaf:externalHtml:v1";
export const ADMIN_PASSWORD_KEY = "mushaf:adminPassword:v1";

export const DEFAULT_TITLES: TitlesConfig = {
  surahsPerLevel: 5,
  titles: [
    "بستان القرآن",
    "قارئ النور",
    "حافظ الهمّة",
    "نجم المصحف",
    "صاحب الآيات",
    "درّة التلاوة",
    "فارس الإتقان",
    "قبّة الإيمان",
    "نور الأحزاب",
    "أمير الحفظ",
  ],
  certificateHeader: "شهادة إتقان وتقدّم في القرآن الكريم",
};

export const getTitlesConfig = (): TitlesConfig => {
  if (typeof window === "undefined") return DEFAULT_TITLES;
  try {
    const raw = localStorage.getItem(TITLES_CONFIG_KEY);
    if (!raw) return DEFAULT_TITLES;
    const p = JSON.parse(raw) as Partial<TitlesConfig>;
    return {
      surahsPerLevel: typeof p.surahsPerLevel === "number" && p.surahsPerLevel > 0 ? p.surahsPerLevel : 5,
      titles: Array.isArray(p.titles) && p.titles.length ? p.titles.map(String) : DEFAULT_TITLES.titles,
      certificateHeader: typeof p.certificateHeader === "string" && p.certificateHeader.trim() ? p.certificateHeader : DEFAULT_TITLES.certificateHeader,
    };
  } catch { return DEFAULT_TITLES; }
};

export const saveTitlesConfig = (cfg: TitlesConfig) => {
  try { localStorage.setItem(TITLES_CONFIG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mushaf:titles"));
  if (hasValidSupabaseKey()) supabase.from("store").upsert({ key: TITLES_CONFIG_KEY, value: cfg }).then(() => {}, () => {});
};

/** الدرجة الحالية (0-based) حسب عدد السور المكتملة. */
export const levelForCompleted = (completedSurahs: number, cfg = getTitlesConfig()): number =>
  Math.max(0, Math.floor(Math.max(0, completedSurahs) / Math.max(1, cfg.surahsPerLevel)));

/** لقب الدرجة المعيّنة. */
export const titleForLevel = (level: number, cfg = getTitlesConfig()): string => {
  if (level <= 0) return cfg.titles[0] || "بستان القرآن";
  return cfg.titles[Math.min(level, cfg.titles.length) - 1] || cfg.titles[cfg.titles.length - 1] || "بستان القرآن";
};

/** اسم اللقب القادم (نستخدمه في الاحتفال). */
export const nextTitleName = (level: number, cfg = getTitlesConfig()): string =>
  cfg.titles[Math.min(level, cfg.titles.length - 1)] || "لقب جديد";

/* ---------------- أكواد النقاط لمرة واحدة ---------------- */
interface OneTimeCode { amount: number; used: boolean; createdAt: string }

export const getOneTimeCodes = (): Record<string, OneTimeCode> => {
  try { const r = localStorage.getItem(ONE_TIME_CODES_KEY); const v = r ? JSON.parse(r) : {}; return v && typeof v === "object" ? v : {}; } catch { return {}; }
};

export const saveOneTimeCodes = (codes: Record<string, OneTimeCode>) => {
  try { localStorage.setItem(ONE_TIME_CODES_KEY, JSON.stringify(codes)); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mushaf:oneTimeCodes"));
  if (hasValidSupabaseKey()) supabase.from("store").upsert({ key: ONE_TIME_CODES_KEY, value: codes }).then(() => {}, () => {});
};

export const createOneTimeCode = (amount: number): string => {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase() + Math.floor(Math.random() * 90 + 10);
  const codes = getOneTimeCodes();
  codes[code] = { amount: Math.max(1, Math.floor(amount)), used: false, createdAt: new Date().toISOString() };
  saveOneTimeCodes(codes);
  return code;
};

/** يستهلك الكود ويُرجع المبلغ، أو -1 إن كان غير صالح/مستخدماً. */
export const redeemOneTimeCode = (codeRaw: string): number => {
  const code = codeRaw.trim().toUpperCase();
  if (!code) return -1;
  const codes = getOneTimeCodes();
  const c = codes[code];
  if (!c || c.used) return -1;
  c.used = true;
  saveOneTimeCodes(codes);
  return c.amount;
};

/* ---------------- كود HTML الخارجي ---------------- */
export const getExternalHtml = (): string => {
  try { return localStorage.getItem(EXTERNAL_HTML_KEY) || ""; } catch { return ""; }
};
export const setExternalHtml = (html: string) => {
  try { localStorage.setItem(EXTERNAL_HTML_KEY, html || ""); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mushaf:externalHtml"));
  if (hasValidSupabaseKey()) supabase.from("store").upsert({ key: EXTERNAL_HTML_KEY, value: html || "" }).then(() => {}, () => {});
};

/* ---------------- كلمة مرور لوحة التحكم ---------------- */
export const getAdminPassword = (): string => {
  try { return localStorage.getItem(ADMIN_PASSWORD_KEY) || "2012"; } catch { return "2012"; }
};
export const setAdminPassword = (p: string) => {
  try { if (p && p.trim()) localStorage.setItem(ADMIN_PASSWORD_KEY, p.trim()); } catch { /* ignore */ }
};

/* ---------------- المزامنة المركزية من السيرفر ---------------- */
/**
 * يجلب إعدادات لوحة التحكم (الألقاب، أكواد النقاط، كود HTML الخارجي، كلمة المرور)
 * من جدول store المركزي ويكتبها محلياً — تُستدعى مرة عند بدء التطبيق.
 * ملفات المستخدمين تُزامَن بالفعل عبر syncKidsProfileFromServer (يشمل verified/blocked).
 */
export const syncAdminDataFromServer = async () => {
  if (typeof window === "undefined" || !hasValidSupabaseKey()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const keys = [TITLES_CONFIG_KEY, ONE_TIME_CODES_KEY, EXTERNAL_HTML_KEY, ADMIN_PASSWORD_KEY];
  try {
    const { data } = await supabase.from("store").select("key,value").in("key", keys);
    (data || []).forEach((row: { key: string; value: unknown }) => {
      if (row.value == null) return;
      try {
        localStorage.setItem(row.key, typeof row.value === "string" ? row.value : JSON.stringify(row.value));
      } catch { /* ignore */ }
    });
    if (data && data.length) {
      window.dispatchEvent(new Event("mushaf:titles"));
      window.dispatchEvent(new Event("mushaf:externalHtml"));
      window.dispatchEvent(new Event("mushaf:oneTimeCodes"));
    }
  } catch (e) { console.debug("sync admin data:", e); }
};
