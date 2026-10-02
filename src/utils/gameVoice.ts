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

  // ═══ عبارات الترتيب والنجاح في الألعاب ═══
  "أحسنت، رتّبتها صحيحاً": null,                 // 🆕 ملف مقترح: ahsant-rattabtha.mp3
  "ما شاء الله! إتقان ممتاز يا بطل": null,       // 🆕 ملف مقترح: itqan-mumtaz.mp3

  // ═══ ⬇️ كلمات مفردة قصيرة بلا صوت — ضع اسم ملف الصوت مكان null عند صناعته ═══
  // ⚡ القاعدة: **كلمة واحدة فقط** لكل ملف — لا جمل ولا عبارات طويلة.
  "ممتاز": null,                               // ممتاز    → mumtaz.mp3
  "بطل": null,                                 // بطل      → batal.mp3
  "واصل": null,                                // واصل     → wasel.mp3
  "أكمل": null,                                // أكمل     → akmil.mp3
  "استمر": null,                               // استمر    → istamir.mp3
  "خطأ": null,                                 // خطأ      → khata.mp3
  "صح": null,                                  // صح       → sah.mp3
  "جميل": null,                                // جميل     → jameel.mp3
  "مذهل": null,                                // مذهل     → muthil.mp3
  "عبقري": null,                               // عبقري    → abqari.mp3
  "أسطورة": null,                              // أسطورة   → ustura-word.mp3
  "شكراً": null,                               // شكراً    → shukran.mp3
  "ركّز": null,                                // ركّز     → rakkiz.mp3
  "الأول": null,                               // الأول    → al-awwal.mp3
  "بالتوفيق": null,                            // بالتوفيق → bittawfiq.mp3
  "طيب": null,                                 // طيب      → tayyib.mp3
  "سهل": null,                                 // سهل      → sahl.mp3
  "جاهز": null,                                // جاهز     → jahiz.mp3
  "الأفضل": null,                              // الأفضل   → al-afdal.mp3
  "مبدع": null,                                // مبدع     → mubdi.mp3
};

/**
 * 📋 قائمة النصوص المطلوب تحويلها إلى صوت (MP3).
 *
 * الطريقة:
 *  1) حوّل النص إلى صوت MP3 بنفس نبرة الملفات الموجودة في public/audio/praise.
 *  2) سمِّ الملف بالاسم المقترح أعلاه (أو أي اسم، ثم حدّث القيمة في PRAISE_AUDIO).
 *  3) ضع الملف في المجلد:  public/audio/praise/
 *  4) استبدل null باسم الملف في PRAISE_AUDIO أعلاه → يعمل الصوت فوراً بلا أي كود إضافي.
 *
 * ترتيب الأولوية (الأهم أولاً):
 */
export const VOICE_TODO: { text: string; file: string; priority: 1 | 2 | 3 }[] = [
  // ⚡ القاعدة: **كلمة واحدة فقط** لكل ملف صوتي — قصيرة، واضحة، بلا جمل.

  // ── أولوية ١: كلمات تُنادى كثيراً في كل الألعاب ──
  { text: "أحسنت", file: "ahsant.mp3", priority: 1 },          // ✅ الملف موجود أصلاً
  { text: "رائع", file: "raea.mp3", priority: 1 },             // ✅ الملف موجود أصلاً
  { text: "ممتاز", file: "mumtaz.mp3", priority: 1 },
  { text: "بطل", file: "batal.mp3", priority: 1 },
  { text: "واصل", file: "wasel.mp3", priority: 1 },
  { text: "أكمل", file: "akmil.mp3", priority: 1 },
  { text: "استمر", file: "istamir.mp3", priority: 1 },
  { text: "خطأ", file: "khata.mp3", priority: 1 },
  { text: "صح", file: "sah.mp3", priority: 1 },

  // ── أولوية ٢: كلمات التشجيع المتنوّعة ──
  { text: "جميل", file: "jameel.mp3", priority: 2 },
  { text: "مذهل", file: "muthil.mp3", priority: 2 },
  { text: "عبقري", file: "abqari.mp3", priority: 2 },          // ⚠️ «أنت عبقري» موجود، هذه الكلمة وحدها
  { text: "أسطورة", file: "ustura-word.mp3", priority: 2 },    // ⚠️ الملف الحالي يحوي «يا أسطورة»
  { text: "شكراً", file: "shukran.mp3", priority: 2 },
  { text: "ركّز", file: "rakkiz.mp3", priority: 2 },
  { text: "الأول", file: "al-awwal.mp3", priority: 2 },

  // ── أولوية ٣: كلمات مساعدة ومجاملة ──
  { text: "بالتوفيق", file: "bittawfiq.mp3", priority: 3 },
  { text: "طيب", file: "tayyib.mp3", priority: 3 },
  { text: "سهل", file: "sahl.mp3", priority: 3 },
  { text: "جاهز", file: "jahiz.mp3", priority: 3 },
  { text: "الأفضل", file: "al-afdal.mp3", priority: 3 },
  { text: "مبدع", file: "mubdi.mp3", priority: 3 },
];

/** النصوص التي تحتاج تسجيلاً فعلياً (كل المداخل بلا ملف صوتي). */
export const listVoiceTodo = (): string[] => VOICE_TODO.map((v) => v.text);

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
