/**
 * فهرس الألعاب المدمجة (Native)
 */
import { supabase, hasValidSupabaseKey } from "../lib/supabase";

export type GameEngine = "order" | "memory" | "memory_meaning" | "which" | "quiz" | "server_quiz" | "count" | "nextayah" | "prevayah" | "whichsurah" | "missingword" | "surahaudio" | "ayahsurah" | "ayahorder" | "ayahlonger" | "surahorder" | "surahnum" | "remote" | "detective" | "wordbuilder" | "ayahmath" | "listenkids" | "makkimadani" | "oddword" | "orchard" | "values";

export interface GameDef {
  id: string;
  title: string;
  engine: GameEngine;
  ageMin: number;
  ageMax?: number;
  cost: number;
  tint: string;
  icon: string;
  params?: { pairs?: number; timeLimit?: number; minSurah?: number; maxSurah?: number; minAyah?: number; maxAyah?: number };
  custom?: boolean;
  desc?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remote?: any;
}

const CATALOG_KEY = "mushaf:gameCatalog:v1";
const PRICE_OVERRIDE_KEY = "mushaf:gamePriceOverrides:v1";

const T = [
  "bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-cyan-500/30",
  "bg-gradient-to-br from-pink-500 to-rose-400 text-white shadow-pink-500/30",
  "bg-gradient-to-br from-violet-400 to-purple-500 text-white shadow-purple-500/30",
  "bg-gradient-to-br from-teal-400 to-emerald-500 text-white shadow-emerald-500/30",
  "bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-orange-500/30",
  "bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-amber-500/30",
  "bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-indigo-500/30",
  "bg-gradient-to-br from-fuchsia-400 to-pink-500 text-white shadow-fuchsia-500/30",
];
const t = (i: number) => T[i % T.length];

const SHORT = { minSurah: 38 };
const MID = { minSurah: 114, maxSurah: 20 };
const FULL = { minSurah: 114 };

// قائمة الألعاب غير القرآنية والمكررة المحظورة نهائياً
const BANNED_NON_QURAN_IDS = new Set([
  "odd-square", "catch-star", "falling-stars", "count-stars",
  "odd_square", "catch_star", "falling_stars", "count_stars",
  "order-surahs", "complete-ayah", "which-surah", "longer-surah", "memory-quran",
  // «word-letters» نسخة قديمة مرفوعة من لعبة «رتّب كلمات القرآن» المدمجة
  // (المحرّك wordbuilder)، وكانت تظهر بجانبها كأنها لعبة ثانية مكررة.
  "word-letters",
]);

/**
 * 🔒 أُزيلت لعبة «صائد النجوم» الترفيهية (بلا قيمة تربوية) من الكتالوج والملفات،
 * ويُمنع أي نسخة بعيدة/مخزّنة تحمل مُعرّفها أو محرّكها من الظهور مجدداً.
 */
export const OUT_OF_SCOPE_GAME_IDS = new Set(["catchstar"]);

const isBlockedGame = (id: string): boolean =>
  BANNED_NON_QURAN_IDS.has(id) || OUT_OF_SCOPE_GAME_IDS.has(id);

// تنظيف التخزين المؤقت فورياً من أي لعبة غير قرآنية
if (typeof window !== "undefined") {
  try {
    const rawRemote = localStorage.getItem("mushaf:remoteGames:v1");
    if (rawRemote && (rawRemote.includes("odd-square") || rawRemote.includes("catch-star") || rawRemote.includes("falling-stars") || rawRemote.includes("count-stars") || rawRemote.includes("order-surahs"))) {
      const parsed = JSON.parse(rawRemote);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((g: any) => g && !BANNED_NON_QURAN_IDS.has(g.id));
        localStorage.setItem("mushaf:remoteGames:v1", JSON.stringify(cleaned));
      }
    }
    const rawCatalog = localStorage.getItem(CATALOG_KEY);
    if (rawCatalog && (rawCatalog.includes("odd-square") || rawCatalog.includes("catch-star") || rawCatalog.includes("falling-stars") || rawCatalog.includes("count-stars") || rawCatalog.includes("order-surahs"))) {
      const parsed = JSON.parse(rawCatalog);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((g: any) => g && !BANNED_NON_QURAN_IDS.has(g.id));
        localStorage.setItem(CATALOG_KEY, JSON.stringify(cleaned));
      }
    }
  } catch { /* ignore */ }
}

const HIDDEN_REMOTE_KEY = "mushaf:remoteGamesHidden";

const hiddenIds = (): string[] => {
  if (typeof window === "undefined") return [];
  try { const v = JSON.parse(localStorage.getItem(HIDDEN_REMOTE_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};
export const hideRemoteGame = (id: string) => {
  try { const h = hiddenIds(); if (!h.includes(id)) localStorage.setItem(HIDDEN_REMOTE_KEY, JSON.stringify([...h, id])); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mushaf:gamecatalog"));
};
export const showRemoteGame = (id: string) => {
  try { localStorage.setItem(HIDDEN_REMOTE_KEY, JSON.stringify(hiddenIds().filter(x => x !== id))); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mushaf:gamecatalog"));
};
export const getHiddenRemoteIds = hiddenIds;

let remoteServerGames: GameDef[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setRemoteGamesList = (list: any[]) => {
  if (!Array.isArray(list)) return;
  const hidden = hiddenIds();
  remoteServerGames = list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((g: any) => g && typeof g.id === "string" && !hidden.includes(g.id) && !isBlockedGame(g.id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((g: any, i: number) => ({
      id: g.id,
      title: g.title || "لعبة قرآنية",
      engine: "remote" as GameEngine,
      ageMin: g.ageMin || 5,
      ageMax: 16,
      cost: typeof g.cost === "number" ? g.cost : 25,
      tint: t(i + 2),
      icon: g.icon || "Gamepad2",
      desc: g.desc,
      remote: g,
      params: {},
    }));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mushaf:gamecatalog"));
};

let serverGames: GameDef[] = [];

const isValid = (g: unknown): g is GameDef => {
  const d = g as GameDef;
  if (!d || typeof d.id !== "string" || typeof d.title !== "string" || typeof d.cost !== "number") return false;
  if (isBlockedGame(d.id)) return false;
  const engines: string[] = ["order", "memory", "memory_meaning", "which", "quiz", "server_quiz", "count", "nextayah", "prevayah", "whichsurah", "missingword", "surahaudio", "ayahsurah", "ayahorder", "ayahlonger", "surahorder", "surahnum", "remote", "detective", "wordbuilder", "ayahmath", "listenkids", "makkimadani", "oddword", "orchard", "values"];
  if (!engines.includes(d.engine)) return false;
  return true;
};

const readServerLocal = (): GameDef[] => {
  if (typeof window === "undefined") return [];
  try { const r = localStorage.getItem(CATALOG_KEY); const v = r ? JSON.parse(r) : []; return Array.isArray(v) ? v.filter(isValid).map(g => ({ ...g, custom: true })) : []; } catch { return []; }
};

/** بصمة قصيرة لمحتوى HTML — تكشف النسخ المرفوعة المتطابقة تحت معرّفات مختلفة. */
const strHash = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/**
 * كود اللعبة (هويتها الفعلية) — لا يعتمد على الاسم المعروض إطلاقاً:
 * - لعبة مرفوعة: نوعها + رابطها أو بصمة محتواها (أو كودها إن لم يوجد رابط).
 * - لعبة مدمجة: المحرّك + إعداداته، فمحرّك واحد بإعدادات واحدة = لعبة واحدة
 *   مهما تعدّدت عناوينها (مثال: ألعاب محرّك «values» التي تُظهر نفس المحتوى).
 */
const gameCode = (g: GameDef): string => {
  const r = g.remote as Record<string, unknown> | undefined;
  if (r) {
    const kind = String(r.kind ?? "url");
    const payload = kind === "html" ? String(r.html ?? "") : String(r.url ?? "");
    const src = payload.trim();
    if (src) return `remote:${kind}:${kind === "html" ? strHash(src) : src.toLowerCase()}`;
    const declared = r.code ?? r.slug;
    return `remote:${kind}:${String(declared ?? g.id).trim().toLowerCase()}`;
  }
  return `${g.engine}|${JSON.stringify(g.params ?? {})}`;
};

export const getGameCatalog = (): GameDef[] => {
  const server = serverGames.length ? serverGames : readServerLocal();
  const map = new Map<string, GameDef>();
  for (const g of BUILTIN_GAMES) {
    if (!isBlockedGame(g.id)) map.set(g.id, g);
  }
  for (const g of remoteServerGames) {
    if (!isBlockedGame(g.id)) map.set(g.id, g);
  }
  for (const g of server) {
    if (!isBlockedGame(g.id)) map.set(g.id, { tint: "bg-slate-500/20 text-slate-200", icon: "Gamepad2", ageMin: 5, ...g, custom: true });
  }
  // جميع الألعاب مجانية تماماً ومفتوحة (cost: 0)
  //
  // 🧹 إزالة التكرار بكود اللعبة لا باسمها:
  // الاسم المعروض يتغيّر (تشكيل/همزات/إيموجي/إعادة صياغة) فيفلت التكرار،
  // أما الكود فهو هوية اللعبة الحقيقية: المحرّك + إعداداته للعبة المدمجة،
  // ونوع رابط/محتوى اللعبة المرفوعة. أي لعبتين بنفس الكود هما لعبة واحدة،
  // فنحتفظ بأول ظهور (المدمجة أولاً) ونُسقط الباقي.
  const seenCodes = new Set<string>();
  const unique: GameDef[] = [];
  for (const g of map.values()) {
    if (isBlockedGame(g.id)) continue;
    const code = gameCode(g);
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);
    unique.push({ ...g, cost: 0 });
  }

  return unique;
};

const getPriceOverrides = (): Record<string, number> => {
  if (typeof window === "undefined") return {};
  try {
    const r = localStorage.getItem(PRICE_OVERRIDE_KEY);
    const v = r ? JSON.parse(r) : {};
    return typeof v === "object" && v !== null ? v as Record<string, number> : {};
  } catch { return {}; }
};

export const setGameCost = (gameId: string, cost: number) => {
  const overrides = getPriceOverrides();
  overrides[gameId] = cost;
  try { localStorage.setItem(PRICE_OVERRIDE_KEY, JSON.stringify(overrides)); } catch { /* ignore */ }
  // مزامنة مركزية: السعر يصل لكل الأجهزة عبر جدول store
  if (hasValidSupabaseKey()) supabase.from("store").upsert({ key: PRICE_OVERRIDE_KEY, value: overrides }).then(() => {}, () => {});
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mushaf:gamecatalog"));
};

export const getCustomGames = (): GameDef[] => getGameCatalog().filter(g => g.custom);

/**
 * الألعاب المرئية فعلياً للطفل = الفهرس الكامل ناقص الألعاب التي أخفاها وليّ الأمر.
 * تُستخدم في ركن الأطفال حتى يختفي أي شيء يخفيه الوالد فوراً.
 */
export const getVisibleGames = (): GameDef[] => {
  const hidden = hiddenIds();
  if (!hidden.length) return getGameCatalog();
  return getGameCatalog().filter((g) => !hidden.includes(g.id));
};

export const resetGamePrices = () => {
  try { localStorage.removeItem(PRICE_OVERRIDE_KEY); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mushaf:gamecatalog"));
};

const persistServer = (list: GameDef[]) => {
  serverGames = list;
  try { localStorage.setItem(CATALOG_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  if (hasValidSupabaseKey()) supabase.from("store").upsert({ key: CATALOG_KEY, value: list }).then(() => {}, () => {});
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mushaf:gamecatalog"));
};

export const addGameDef = (def: GameDef) => {
  const list = getCustomGames().filter(g => g.id !== def.id);
  persistServer([...list, { ...def, custom: true }]);
};

export const removeGameDef = (id: string) => { persistServer(getCustomGames().filter(g => g.id !== id)); };

export const syncGameCatalogFromServer = async () => {
  if (typeof window === "undefined" || !hasValidSupabaseKey()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  try {
    const { data } = await supabase.from("store").select("value").eq("key", CATALOG_KEY).maybeSingle();
    if (data && Array.isArray(data.value)) {
      const list = (data.value as GameDef[]).filter(isValid).map(g => ({ ...g, custom: true }));
      serverGames = list;
      localStorage.setItem(CATALOG_KEY, JSON.stringify(list));
      window.dispatchEvent(new Event("mushaf:gamecatalog"));
    }
    // جلب تجاوزات الأسعار المركزية (من لوحة admin.html)
    const { data: pData } = await supabase.from("store").select("value").eq("key", PRICE_OVERRIDE_KEY).maybeSingle();
    if (pData && pData.value && typeof pData.value === "object") {
      localStorage.setItem(PRICE_OVERRIDE_KEY, JSON.stringify(pData.value));
      window.dispatchEvent(new Event("mushaf:gamecatalog"));
    }
  } catch (e) { console.debug("sync game catalog:", e); }
};

const G = (id: string, title: string, engine: GameEngine, ageMin: number, ageMax: number, cost: number, icon: string, params: GameDef["params"], ti = 0): GameDef =>
  ({ id, title, engine, ageMin, ageMax, cost, icon, params: params || {}, tint: t(ti) });

// ═══════════════════════════════════════════════════════════════════════════════
// قائمة الألعاب الفريدة - بدون تكرار
// كل لعبة موجودة مرة واحدة فقط مع نطاق عمر واسع (4-16 سنة)
// ═══════════════════════════════════════════════════════════════════════════════
export const BUILTIN_GAMES: GameDef[] = [
  // ── ألعاب الاستماع ──
  G("surahaudio", "اسمع السورة", "surahaudio", 5, 16, 0, "Headphones", null, 0),
  G("listenkids", "استمع ← أكمِل ← سجِّل", "listenkids", 5, 16, 0, "Mic", FULL, 4),

  // ── ألعاب الذاكرة ──
  G("memory", "بطاقات السور الذكية", "memory", 5, 16, 0, "LayoutGrid", { pairs: 6 }, 1),

  // ── ألعاب الاكتشاف ──
  G("whichsurah", "اكتشف السورة", "whichsurah", 5, 16, 0, "Sparkles", FULL, 2),

  // ── ألعاب الترتيب ──
  G("order", "ترتيب الآيات", "order", 5, 16, 0, "ListOrdered", FULL, 3),
  G("surahorder", "ترتيب السور", "surahorder", 5, 16, 0, "ListOrdered", FULL, 4),

  // ── ألعاب العد ──
  G("count", "عدّ الآيات", "count", 5, 16, 0, "Hash", FULL, 5),

  // ── ألعاب الكلمات ──
  G("missingword", "الكلمة الضائعة", "missingword", 5, 16, 0, "Puzzle", FULL, 0),

  // ── ألعاب الاختبار ──
  G("quiz", "اختبار السور", "quiz", 5, 16, 0, "Trophy", FULL, 1),
  G("server_quiz", "أسئلة السيرفر الذكية", "server_quiz", 5, 16, 0, "Brain", FULL, 2),

  // ── ألعاب المقارنة ──
  G("which", "السورة الأطول", "which", 5, 16, 0, "Scale", FULL, 2),
  G("ayahlonger", "أي آية أطول؟", "ayahlonger", 5, 16, 0, "Scale", FULL, 3),

  // ── ألعاب الإكمال ──
  G("nextayah", "أكمل الآية", "nextayah", 5, 16, 0, "BookOpen", FULL, 4),
  G("prevayah", "الآية التي قبلها", "prevayah", 5, 16, 0, "BookOpen", FULL, 5),

  // ── ألعاب التعرف ──
  G("ayahsurah", "من أي سورة؟", "ayahsurah", 5, 16, 0, "BookOpen", FULL, 6),
  G("surahnum", "رقم السورة", "surahnum", 5, 16, 0, "Hash", FULL, 7),

  // ── الألعاب القرآنية الأسطورية الذكية ──
  G("detective", "المحقق القرآني", "detective", 5, 16, 0, "Sparkles", FULL, 0),
  G("wordbuilder", "رتّب كلمات القرآن", "wordbuilder", 5, 16, 0, "Puzzle", FULL, 1),
  G("ayahmath", "أرقام وحساب الآيات", "ayahmath", 5, 16, 0, "Hash", FULL, 3),
  G("makkimadani", "سفينة السور: مكية أم مدنية؟", "makkimadani", 5, 16, 0, "Landmark", FULL, 4),
  G("oddword", "الكلمة القرآنية المختلفة", "oddword", 5, 16, 0, "Sparkles", FULL, 5),
  G("orchard", "بستان معاني القرآن", "orchard", 5, 16, 0, "Trees", FULL, 3),
  G("quran-book", "كنز القرآن", "values", 5, 16, 0, "BookMarked", null, 0),
  G("prayer-time", "كيف أصلي؟", "values", 5, 16, 0, "Sunrise", null, 1),
  G("kindness-gift", "هدية اللطف", "values", 5, 16, 0, "Gift", null, 2),
  G("clean-water", "قطرة وضوء", "values", 5, 16, 0, "Droplets", null, 3),
  G("mosque-path", "طريق المسجد", "values", 5, 16, 0, "MapPin", null, 4),
  G("parents-love", "قلب الوالدين", "values", 5, 16, 0, "Heart", null, 5),
  G("honest-star", "نجمة الصدق", "values", 5, 16, 0, "BadgeCheck", null, 6),
  G("help-friend", "يد العون", "values", 5, 16, 0, "HandHeart", null, 7),
  G("night-moon", "قمر الدعاء", "values", 5, 16, 0, "Moon", null, 0),
  G("garden-good", "حديقة الخير", "values", 5, 16, 0, "Flower2", null, 1),
  G("qibla-compass", "بوصلة القبلة", "values", 5, 16, 0, "Compass", null, 2),
  G("charity-box", "صندوق العطاء", "values", 5, 16, 0, "CircleDollarSign", null, 3),
  G("rainbow-mercy", "قوس الرحمة", "values", 5, 16, 0, "Rainbow", null, 4),
  G("lamp-learning", "مصباح التعلّم", "values", 5, 16, 0, "Lightbulb", null, 5),
  G("good-deeds-crown", "تاج الأعمال الطيبة", "values", 5, 16, 0, "Crown", null, 6),
];
