/**
 * أصوات التشجيع في الألعاب — ملفات MP3 حقيقية بصوت بشري دافئ.
 * الملفات موجودة في public/audio/praise (نسخة من مجلد «ملجد اصوت»).
 */

const BASE = "/audio/praise";

/**
 * خريطة كل عبارات التشجيع في الموقع → اسم ملف الصوت (أو null إن لم يُصنع صوته بعد).
 *
 * ⚠️ القاعدة: **كل عبارة لها مدخل هنا** — الموجودة صوتها يعمل، والناقصة
 * مكتوبة بـ null وتُعرض نصاً بلا صوت حتى تصنع صوتها وتضع اسم الملف مكان null.
 * لا تحذف أياً من هذه الأسطر حتى لو بلا صوت، فهي «الكلمات الجديدة» في الموقع.
 */
export const PRAISE_AUDIO: Record<string, string | null> = {
  // ═══ إجابات صحيحة — عادية ═══
  "أحسنت يا بطل!": "ahsant.mp3",              // ✅ موجود
  "أحسنت!": "ahsant.mp3",                     // ✅ نفس الملف
  "رائع!": "raea.mp3",                        // ✅ موجود
  "أنت ذكي!": "anta-dhaki.mp3",               // ✅ موجود

  // ═══ إجابات صحيحة — جيد ═══
  "ممتاز جداً!": "mumtaz-jiddan.mp3",         // ✅ موجود
  "أداء مذهل!": "adaa-muthil.mp3",            // ✅ موجود
  "عمل رائع!": "raea.mp3",                    // ⚠️ يستعمل صوت «رائع» مؤقتاً
  "ممتاز!": "mumtaz-jiddan.mp3",              // ✅ نفس الملف

  // ═══ إجابات صحيحة — ممتاز / سلسلة طويلة ═══
  "ما شاء الله!": "mashaallah.mp3",           // ✅ موجود
  "أنت عبقري!": "anta-abqari.mp3",            // ✅ موجود
  "أسطورة!": "ustura.mp3",                    // ✅ موجود

  // ═══ عبارات خاصة بالألعاب ═══
  "لقد رتبت الآيات بنجاح": "rattabt-ayat.mp3", // ✅ موجود
  "إجابة دقيقة وصحيحة": "ijaba-daqiqa.mp3",    // ✅ موجود

  // ═══ عبارات الخطأ والتحفيز ═══
  "حاول ثانية يا بطل": "hawil-thaniya.mp3",   // ✅ موجود
  "لا بأس، التكرار يعلّم": "la-bas-takrar.mp3", // ✅ موجود
  "ركّز جيداً، أنت تستطيع": "rakkiz-jayyidan.mp3", // ✅ موجود
  "قريب جداً! استمر": "qareeb-jiddan.mp3",    // ✅ موجود

  // ═══ ⬇️ كلمات جديدة بلا صوت — ضع اسم ملف الصوت مكان null عند صناعته ═══
  "عمل رائع": null,
  "ممتاز جدا": null,
  "أحسنت يا بطل": null,
  "أنت رائع": null,
  "بطل": null,
  "واصل": null,
  "أكمل": null,
  "شكراً": null,
  "خطأ": null,
  "حاول مرة أخرى": null,
  "لا تقلق": null,
  "أنت تستطيع": null,
  "لا بأس": null,
  "ركّز": null,
  "استمر": null,
  "بالتوفيق": null,
  "بارك الله فيك": null,
  "ما شاء الله": null,
  "أنت مبدع": null,
  "أنت الأفضل": null,
  "الأول": null,
  "مذهل": null,
  "جميل": null,
  "صح": null,
  "نعم صحيح": null,
  "لا ليس صحيحاً": null,
};

/** اسم أي عبارة تشجيع معروفة في الموقع */
export type PraisePhrase = keyof typeof PRAISE_AUDIO;

/** يزيل الرموز التعبيرية والعلامات و«يا بطل» الزائدة للوصول لجذر العبارة */
const normalize = (text: string): string =>
  text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/[!،.؟?]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** مستودع مؤقت للأصوات لتفادي إعادة التحميل والتقطيع */
const buffer = new Map<string, HTMLAudioElement>();
let current: HTMLAudioElement | null = null;
let muted = false;

/** يكتم/يُشغّل كل أصوات التشجيع (تُضبط من إعدادات وليّ الأمر) */
export const setGameVoiceMuted = (on: boolean) => {
  muted = on;
  if (on) stopGameVoice();
};

export const isGameVoiceMuted = (): boolean => muted;

/** يوقف الصوت الحالي فوراً (يُستدعى عند الخروج من اللعبة أو تغيير السؤال) */
export const stopGameVoice = () => {
  if (current) {
    try { current.pause(); current.currentTime = 0; } catch { /* ignore */ }
    current = null;
  }
};

const resolveFile = (text: string): string | null => {
  const clean = normalize(text);
  if (!clean) return null;

  const keys = Object.keys(PRAISE_AUDIO);

  // 1) مطابقة مباشرة — تُعيد الملف أو null إن كانت الكلمة موجودة بلا صوت
  for (const key of keys) {
    if (normalize(key) === clean) return PRAISE_AUDIO[key];
  }

  // 2) مطابقة جزئية (أطول مفتاح مطابق يفوز) — نتجاهل المداخل بلا صوت هنا
  //    حتى لا تمنع كلمةً ناقصة من الاستفادة من صوت كلمة أخرى مطابقة.
  let best: { len: number; file: string } | null = null;
  for (const key of keys) {
    const file = PRAISE_AUDIO[key];
    if (!file) continue;
    const nk = normalize(key);
    if (clean.includes(nk) || nk.includes(clean)) {
      if (!best || nk.length > best.len) best = { len: nk.length, file };
    }
  }
  return best ? best.file : null;
};

/** كل العبارات المعروفة في الموقع (سواء لها صوت أم لا). */
export const listPraisePhrases = (): { phrase: string; file: string | null }[] =>
  Object.keys(PRAISE_AUDIO).map((phrase) => ({ phrase, file: PRAISE_AUDIO[phrase] }));

/** العبارات التي لم يُصنع صوتها بعد — لتقرير ما ينقصك. */
export const listMissingVoices = (): string[] =>
  Object.keys(PRAISE_AUDIO).filter((phrase) => !PRAISE_AUDIO[phrase]);

/**
 * يشغّل صوت التشجيع المطابق للنص إن وُجد ملف صوتي له.
 * لا يرمي أي خطأ — يتجاهل بهدوء إن لم يوجد ملف أو تعذّر التشغيل (المتصفح قد يمنع
 * التشغيل التلقائي قبل أول تفاعل من المستخدم، وهذا طبيعي ولا يعطّل اللعبة).
 */
export const playGameVoice = (text: string): boolean => {
  if (muted || typeof window === "undefined") return false;
  const file = resolveFile(text);
  if (!file) return false;
  try {
    stopGameVoice();
    let el = buffer.get(file);
    if (!el) {
      el = new Audio(`${BASE}/${file}`);
      el.preload = "auto";
      buffer.set(file, el);
    }
    el.currentTime = 0;
    current = el;
    void el.play().catch(() => { /* المتصفح منع التشغيل التلقائي — نتجاهل بهدوء */ });
    return true;
  } catch {
    return false;
  }
};

/** يحمّل كل أصوات التشجيع المتوفرة مسبقاً لتعمل بلا تأخير ودون إنترنت */
export const precacheGameVoice = () => {
  if (typeof window === "undefined") return;
  Object.values(PRAISE_AUDIO).forEach((file) => {
    if (!file || buffer.has(file)) return;   // المداخل بلا صوت تُتخطّى
    const el = new Audio(`${BASE}/${file}`);
    el.preload = "auto";
    buffer.set(file, el);
  });
};
