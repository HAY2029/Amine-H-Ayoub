/**
 * خدمة النطق المحلي (Web Speech API) — صوت احتياطي مجاني 100%.
 *
 * لماذا نضيفه؟
 * - يعمل **فورًا بلا أي إعداد** (بلا ElevenLabs وبلا Supabase).
 * - يختار صوتًا عربيًا من أصوات الجهاز، ويميّز ولد/بنت عبر النبرة (pitch).
 * - يُستخدم كطبقة ثالثة: ملفات MP3 ← ElevenLabs (Edge Function) ← النطق المحلي.
 *
 * 🔒 لا يوجد أي مفتاح API هنا — كلها إعدادات متصفح محلية.
 * ملاحظة: بعض الأجهزة قد لا تحتوي صوتًا عربيًا؛ عندها نُعيد false بهدوء.
 */

/** أصوات عربية مفضّلة تُجرَّب بالترتيب (مستقلة عن الجهاز). */
const ARABIC_VOICE_HINTS = [
  "arabic",
  "ar-sa",
  "ar-eg",
  "microsoft arabic",
  "google العربية",
  "google arabic",
  "sounds good arabic",
  "maged",
  "lamm",
];

/** ذاكرة مؤقتة لقائمة الأصوات (تُحمّل بشكل كسول). */
let cachedVoices: SpeechSynthesisVoice[] | null = null;

/** يُخبر إن كان المتصفح يدعم النطق أصلًا. */
export const isSpeechSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function loadVoices(): SpeechSynthesisVoice[] {
  if (cachedVoices) return cachedVoices;
  if (!isSpeechSupported()) return [];
  const list = window.speechSynthesis.getVoices();
  if (list.length > 0) cachedVoices = list;
  return list ?? [];
}

// بعض المتصفحات تُحمّل الأصوات بشكل كسول بعد أول استدعاء.
if (typeof window !== "undefined" && isSpeechSupported()) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = null;
    loadVoices();
  };
  loadVoices();
}

/** يختار أنسب صوت عربي له جنس ونبرة محدَّدة. */
function pickVoice(gender: "boy" | "girl"): SpeechSynthesisVoice | null {
  const voices = loadVoices();
  if (voices.length === 0) return null;

  // نبحث عن صوت عربي يدعم اللغة المطلوبة (ar-*) أو يذكر كلمة عربية
  const arabic = voices.filter((v) => {
    const lang = (v.lang || "").toLowerCase();
    return lang.startsWith("ar") || ARABIC_VOICE_HINTS.some((h) => v.name.toLowerCase().includes(h));
  });

  const pool = arabic.length > 0 ? arabic : voices; // لا يوجد عربي → استخدم أي صوت
  if (pool.length === 0) return null;

  // ترجيح بسيط: الأصوات المسمّاة بأسماء شخصيات شائعة (مجرّبة) تُقدَّم
  const score = (v: SpeechSynthesisVoice): number => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (gender === "girl") {
      if (/female|woman|girl|samantha|zira|karen|moira|tessa|vicki|aria|jenny/.test(n)) s += 5;
    } else {
      if (/male|man|boy|daniel|alex|fred|thomas|david|mark/.test(n)) s += 5;
    }
    if ((v.lang || "").toLowerCase().startsWith("ar")) s += 2;
    if (v.localService) s += 1; // صوت محلي أسرع بلا إنترنت
    return s;
  };

  return pool.reduce((best, v) => (score(v) > score(best) ? v : best), pool[0]);
}

/** هل هناك أي صوت عربي متاح على هذا الجهاز؟ */
export const hasArabicVoice = (): boolean => {
  if (!isSpeechSupported()) return false;
  const voices = loadVoices();
  if (voices.length === 0) return false;
  return voices.some((v) => (v.lang || "").toLowerCase().startsWith("ar"));
};

/** آخر نطق بدأ — نستخدمه للإيقاف الفوري عند التنقّل. */
let currentUtterance: SpeechSynthesisUtterance | null = null;

/**
 * ينطق جملة عربية بنبرة الشخصية.
 * يعيد true إن بدأ النطق، false إن كان المتصفح لا يدعمه (بلا أي رمي استثناء).
 */
export function speakWithBrowserVoice(text: string, opts: { pitch: number; rate: number }): boolean {
  if (!isSpeechSupported() || !text) return false;
  try {
    // إيقاف أي نطق سابق حتى لا تتراكم الجُمل
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-SA";
    u.pitch = opts.pitch;
    u.rate = opts.rate;
    u.volume = 1;

    const voice = pickVoice(opts.pitch >= 1.35 ? "boy" : "girl");
    if (voice) u.voice = voice;

    currentUtterance = u;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

/** يوقف أي نطق جارٍ فورًا (يُستدعى عند مغادرة الصفحة). */
export function stopBrowserVoice(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  currentUtterance = null;
}

/** هل هناك نطق جارٍ الآن؟ */
export const isBrowserSpeaking = (): boolean =>
  isSpeechSupported() && window.speechSynthesis.speaking && currentUtterance !== null;