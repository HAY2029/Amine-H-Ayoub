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
  "أحسنت، رتّبتها صحيحاً": "rattabt-ayat.mp3",     // ✅ نفس معنى «رتّبت الآيات بنجاح»
  "ما شاء الله! إتقان ممتاز يا بطل": "mashaallah2.mp3", // ✅ صوت «ما شاء الله» الثاني

  // ═══ ⬇️ كلمات مفردة قصيرة بلا صوت — ضع اسم ملف الصوت مكان null عند صناعته ═══
  // ⚡ القاعدة: **كلمة واحدة فقط** لكل ملف — لا جمل ولا عبارات طويلة.
  "ممتاز": "mumtaz.mp3",                        // ممتاز    ✅
  "بطل": "batal.mp3",                           // بطل      ✅
  "واصل": "wasel.mp3",                          // واصل     ✅
  "أكمل": "akmil.mp3",                          // أكمل     ✅
  "استمر": "istamir.mp3",                       // استمر    ✅
  "خطأ": "khata.mp3",                           // خطأ      ✅
  "صح": "sah.mp3",                              // صح       ✅
  "جميل": "jameel.mp3",                         // جميل     ✅
  "مذهل": "muthil.mp3",                         // مذهل     ✅
  "عبقري": "abqari.mp3",                        // عبقري    ✅
  "أسطورة": "ustura-word.mp3",                  // أسطورة   ✅
  "شكراً": "shukran.mp3",                       // شكراً    ✅
  "ركّز": "rakkiz.mp3",                         // ركّز     ✅
  "الأول": null,                                // الأول    → al-awwal.mp3 (لا يوجد صوت بعد)
  "بالتوفيق": "bittawfiq.mp3",                  // بالتوفيق ✅
  "طيب": "tayyib.mp3",                          // طيب      ✅
  "سهل": "sahl.mp3",                            // سهل      ✅
  "جاهز": null,                                // جاهز     → jahiz.mp3 (لا يوجد صوت بعد)
  "الأفضل": "al-afdal.mp3",                     // الأفضل   ✅
  "مبدع": "mubdi.mp3",                          // مبدع     ✅
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
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\u{FE0F}/gu, "")
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

// 🌐 تعريض دالة الإيقاف على window ليتّمكّن حارس التنقّل العام من إسكات الأصوات
// عند مغادرة صفحة الألعاب (بلا أي اعتماد دائري على وحدات أخرى).
if (typeof window !== "undefined") {
  (window as unknown as { __stopGameVoice?: () => void }).__stopGameVoice = stopGameVoice;
}

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

/* ───────── احتياطي صوت الألعاب ─────────
 * يُسجَّل اختياريًا من ركن الأطفال. يعمل فقط عندما لا يوجد ملف MP3 مطابق،
 * فلا يغيّر سلوك النظام الحالي إطلاقًا (لا يُستبدل أي صوت موجود).
 */
type CharacterVoiceFallback = (text: string) => boolean | Promise<boolean>;
let characterVoiceFallback: CharacterVoiceFallback | null = null;

/** يسجّل دالة احتياطية لتشغيل صوت الشخصية عند غياب ملف الألعاب (أو يلغيها بـ null). */
export const setCharacterVoiceFallback = (fn: CharacterVoiceFallback | null): void => {
  characterVoiceFallback = fn;
};

/**
 * يشغّل صوت تشجيع: يجرّب أولاً ملفات الألعاب الحالية (playGameVoice)،
 * وإن لم يوجد ملف مطابق يستعمل احتياطي صوت الشخصية إن كان مسجّلاً.
 * لا يرمي أبدًا.
 */
export const playGameVoiceWithCharacterFallback = (text: string): boolean => {
  const played = playGameVoice(text);
  if (played) return true;
  if (characterVoiceFallback) {
    try { void characterVoiceFallback(text); } catch { /* ignore */ }
  }
  return false;
};

/** مدة الصوت الحالي بالملي ثانية إن كان جاهزاً (بلا انتظار التحميل)، أو null. */
export const getCurrentVoiceDurationMs = (): number | null => {
  if (!current) return null;
  const d = current.duration;
  return Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : null;
};

/**
 * يجلب مدة صوت عبارة بعينها بالملي ثانية (يجعل المتصفح يحمّل الملف بهدوء).
 * يعود بمدة مخزّنة سابقاً أو null إن تعذّر — لا يرمي أبداً.
 */
export const getVoiceDurationMs = async (text: string): Promise<number | null> => {
  if (typeof window === "undefined") return null;
  try {
    const file = resolveFile(text);
    if (!file) return null;
    let el = buffer.get(file);
    if (!el) {
      el = new Audio(`${BASE}/${file}`);
      el.preload = "auto";
      el.onerror = () => { /* نتجاهل */ };
      buffer.set(file, el);
    }
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) return Math.round(d * 1000);
    await new Promise<void>((res) => {
      const done = () => { el?.removeEventListener("loadedmetadata", done); res(); };
      el?.addEventListener("loadedmetadata", done);
      // أقصى انتظار 2 ثوانٍ ثم نكمل بأي حال (لا نعلّق الواجهة)
      window.setTimeout(done, 2000);
    });
    const d2 = el.duration;
    return Number.isFinite(d2) && d2 > 0 ? Math.round(d2 * 1000) : null;
  } catch {
    return null; // نتجاهل بهدوء
  }
};

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

/**
 * تسخين ذكي لأصوات التشجيع — لا نحمل كل الأصوات الـ 40 دفعة واحدة عند الإقلاع لتفادي إبطاء التشغيل
 */
export const precacheGameVoice = () => {
  if (typeof window === "undefined") return;
  try {
    // تجهيز الأصوات الأساسية الأكثر تكراراً فقط، مع إبقاء الباقي عند الطلب
    const topFiles = ["ahsant.mp3", "mumtaz-jiddan.mp3", "mashaallah.mp3"];
    topFiles.forEach((file) => {
      if (buffer.has(file)) return;
      try {
        const el = new Audio(`${BASE}/${file}`);
        el.preload = "none";
        el.onerror = () => { /* ignore */ };
        buffer.set(file, el);
      } catch { /* ignore */ }
    });
  } catch { /* ignore */ }
};

/**
 * تسخين آمن في وقت الخمول فقط — لا يستنزف الباندويث عند فتح التطبيق
 */
export const warmUpGameVoices = () => {
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).requestIdleCallback(() => precacheGameVoice(), { timeout: 8000 });
  } else {
    setTimeout(precacheGameVoice, 6000);
  }
};
