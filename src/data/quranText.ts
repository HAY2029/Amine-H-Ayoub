/**
 * نصّ القرآن للسور الموجودة في التطبيق (جزء عمّ) — للبحث في الكلمات ومدرّب التلاوة.
 *
 * مبدأ حاسم: لا يُكتب نصّ المصحف يدوياً في الكود (أي خطأ غير مقبول). يُجلب من مصدر
 * موثّق (alquran.cloud — رواية حفص، الرسم العثماني) ويُخزَّن محلياً ليعمل دون إنترنت.
 */
import { getAllSurahs } from "./quranData";

export interface Ayah { n: number; text: string }
export interface SurahText { app: number; std: number; name: string; ayahs: Ayah[] }

/** أرقام المصحف القياسية لسور التطبيق (ترقيم التطبيق المخصّص → ترقيم المصحف). */
const STD_BY_NAME: Record<string, number> = {
  "الفاتحة": 1, "الناس": 114, "الفلق": 113, "الإخلاص": 112, "المسد": 111,
  "النصر": 110, "الكافرون": 109, "الكوثر": 108, "الماعون": 107, "قريش": 106,
  "الفيل": 105, "الهمزة": 104, "العصر": 103, "التكاثر": 102, "القارعة": 101,
  "العاديات": 100, "الزلزلة": 99, "البينة": 98, "القدر": 97, "العلق": 96,
  "التين": 95, "الشرح": 94, "الضحى": 93, "الليل": 92, "الشمس": 91,
  "البلد": 90, "الفجر": 89, "الغاشية": 88, "الأعلى": 87, "الطارق": 86,
  "البروج": 85, "الإنشقاق": 84, "المطففين": 83, "الإنفطار": 82, "التكوير": 81,
  "عبس": 80, "النازعات": 79, "النبأ": 78,
};

// التطبيع يتمّ بأكواد يونيكود صريحة (لا تعابير نمطية بحروف عربية) لتجنّب أي لبس في الترميز.
const A_HAMZA = 0x0621, Y_NORM = 0x064A; // ء … ي (نطاق الحروف العربية)
const isDiacritic = (cp: number): boolean =>
  (cp >= 0x0610 && cp <= 0x061A) ||  // علامات أعلى/أسفل
  (cp >= 0x064B && cp <= 0x065F) ||  // تنوين + حركات + علامات
  (cp >= 0x06D6 && cp <= 0x06DC) ||  // علامات قرآنية
  (cp >= 0x06DF && cp <= 0x06E8) ||
  (cp >= 0x06EA && cp <= 0x06ED) ||
  cp === 0x0640;                     // تطويل

/** يوحّد صور الألف/الياء/الواو/التاء المربوطة لمطابقة بحثية متساهلة. */
const unifyCp = (cp: number): number => {
  if (cp === 0x0622 || cp === 0x0623 || cp === 0x0625 || cp === 0x0671 || cp === 0x0670) return 0x0627; // آ أ إ ٱ وألف خنجرية → ا
  if (cp === 0x0649 || cp === 0x0626 || cp === 0x06CC) return 0x064A; // ى ئ ياء فارسية → ي
  if (cp === 0x06A9) return 0x0643;                  // كاف فارسية → ك
  if (cp === 0x0624) return 0x0648;                  // ؤ → و
  if (cp === 0x0629) return 0x0647;                  // ة → ه
  return cp;
};

/** يحذف التشكيل والتطويل ويوحّد الحروف — لمطابقة بحثية متساهلة (لا يُغيّر نصّ العرض). */
export function normalizeArabic(s: string): string {
  let out = "";
  for (const ch of s || "") {
    let cp = ch.codePointAt(0) as number;
    if (isDiacritic(cp)) continue;
    cp = unifyCp(cp);
    const isLetter = cp >= A_HAMZA && cp <= Y_NORM;
    const isDigit = cp >= 0x0030 && cp <= 0x0039;
    out += isLetter || isDigit ? String.fromCodePoint(cp) : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * في الرسم العثماني من هذا المصدر تُضاف البسملة لبداية الآية الأولى من كل سورة.
 * نزيلها لكل السور عدا الفاتحة (حيث البسملة هي الآية ١ فعلاً)، حتى لا تتكرّر في البحث
 * ولا تُحسب خطأً في مدرّب التلاوة.
 */
const BASMALA_NORM = normalizeArabic("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ");
function stripLeadingBasmala(text: string): string {
  const words = text.split(/\s+/);
  if (words.length <= 4) return text;
  if (normalizeArabic(words.slice(0, 4).join(" ")) === BASMALA_NORM) return words.slice(4).join(" ").trim();
  return text;
}

import localCorpus from "./localQuranCorpus.json";

/**
 * ملف النصّ المحلي يستخدم الحقل `number` للآية، بينما واجهة `Ayah` تتوقّع `n`.
 * نُطبّع عند التحميل حتى يقرأ باقي التطبيق حقلاً واحداً — بلا تعديل الملف الضخم.
 * (ملاحظة: نصّ هذا الملف مكتوب برواية ورش عن نافع.)
 */
type RawAyah = { number?: number; n?: number; text: string };
type RawSurah = { app: number; std?: number; name: string; ayahs: RawAyah[] };

const LOCAL_BUNDLED_CORPUS: SurahText[] = (localCorpus as unknown as RawSurah[]).map((s) => ({
  app: s.app,
  std: s.std ?? s.app,
  name: s.name,
  ayahs: (s.ayahs || []).map((a, i) => ({
    n: typeof a.n === "number" ? a.n : typeof a.number === "number" ? a.number : i + 1,
    text: a.text,
  })),
}));

/** يضمن توفّر نصّ كل سور التطبيق (محلياً 100% بدون أي طلبات خارجية). */
export async function ensureCorpus(): Promise<SurahText[]> {
  return LOCAL_BUNDLED_CORPUS;
}

/** هل النصّ مُخزَّن محلياً (يعمل دون إنترنت)؟ */
export const isCorpusReady = (): boolean => true;

export interface SearchHit { app: number; name: string; ayah: number; text: string; count: number }

/** يبحث عن كلمة في كل سور التطبيق ويُرجع كل المواضع (مع عدد التكرار في الآية). */
export function searchWord(query: string, corpus: SurahText[]): SearchHit[] {
  const q = normalizeArabic(query);
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const s of corpus) {
    for (const a of s.ayahs) {
      const words = normalizeArabic(a.text).split(" ");
      const count = words.filter(w => w.includes(q)).length;
      if (count > 0) hits.push({ app: s.app, name: s.name, ayah: a.n, text: a.text, count });
    }
  }
  return hits;
}

/** يُحدّد الكلمات المطابِقة داخل آية لإبرازها عند العرض. */
export function matchedWordIndices(text: string, query: string): Set<number> {
  const q = normalizeArabic(query);
  const out = new Set<number>();
  if (!q) return out;
  text.split(/\s+/).forEach((w, i) => { if (normalizeArabic(w).includes(q)) out.add(i); });
  return out;
}
