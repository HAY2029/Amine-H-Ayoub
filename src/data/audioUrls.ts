// روابط الملفات الصوتية — المصدر الوحيد هو سيرفر Hugging Face الخاص بالتطبيق:
// https://huggingface.co/datasets/hammoualiyoucef20/quran-audio
// الترقيم قياسي (سورة يس = 36.mp3، الفاتحة = 1.mp3، الناس = 114.mp3 ... إلخ)
const BASE = "https://huggingface.co/datasets/hammoualiyoucef20/quran-audio/resolve/main";

/**
 * رابط الصوت الأساسي من سيرفر التطبيق على Hugging Face (قياسي مباشر).
 * كل الصوت يخرج من هذا السيرفر حصراً — لا من أي سيرفر خارجي.
 */
export const getSurahAudioUrl = (number: number): string => {
  return `${BASE}/${number}.mp3`;
};

/**
 * رابط آمن إضافي — يعيد نفس السيرفر الأساسي (Hugging Face).
 * لا يستخدم السور من أي CDN خارجي إطلاقاً.
 */
export const getFallbackAudioUrl = (number: number): string => {
  return `${BASE}/${number}.mp3`;
};

/**
 * خريطة تحويل قديمة (جزء عم المعكوس) — أُبقيَت للتوافق مع كود سابق فقط،
 * لم تعد تُستخدم لتحديد الصوت لأن سيرفر Hugging Face أصبح بالترقيم القياسي.
 */
export const LEGACY_AMMA_MAP: Record<number, number> = {};

// قائمة السور المتوفرة حالياً في التخزين السحابي (يتم تعبئتها ديناميكياً عند بدء التطبيق)
export const CLOUD_AVAILABLE_SURAHS = new Set<number>();

export const hasCloudAudio = (number: number): boolean => {
  if (CLOUD_AVAILABLE_SURAHS.size > 0) {
    return CLOUD_AVAILABLE_SURAHS.has(number);
  }
  return number >= 1 && number <= 114;
};

// التحقق من توفر الصوت
export const isAudioAvailable = (number: number): boolean => {
  return number >= 1 && number <= 114;
};

/**
 * جلب قائمة السور المتوفرة من سيرفر التطبيق على Hugging Face
 * هذا يجعل التطبيق يكتشف السور الجديدة تلقائياً بدون الحاجة لتحديث الكود.
 */
export async function initCloudAudioAvailability() {
  try {
    const res = await fetch(`https://huggingface.co/api/datasets/hammoualiyoucef20/quran-audio/tree/main?t=${Date.now()}`);
    if (!res.ok) return;
    const data = await res.json();
    data.forEach((item: any) => {
      if (item.type === 'file' && item.path.endsWith('.mp3')) {
        const num = parseInt(item.path.replace('.mp3', ''), 10);
        if (!isNaN(num)) CLOUD_AVAILABLE_SURAHS.add(num);
      }
    });
    console.log(`[Cloud Audio] Loaded ${CLOUD_AVAILABLE_SURAHS.size} available surahs.`);
  } catch (err) {
    console.error("Failed to fetch cloud audio tree:", err);
  }
}
export async function fetchAudioWithRetry(url: string, signal?: AbortSignal, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, { signal, cache: "default" });
      if (response.ok) return response;
      if (response.status === 404) return response; // don't retry non-existent files
    } catch (e) {
      if (signal?.aborted) throw e;
      attempt++;
      if (attempt >= maxRetries) throw e;
      // Wait with backoff: 500ms, 1000ms, 2000ms
      await new Promise(res => setTimeout(res, 500 * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error(`Failed to fetch audio after ${maxRetries} attempts`);
}

/**
 * Get custom audio URL for a surah if uploaded manually.
 */
export const getCustomAudioUrl = (number: number, speaker: "teacher" | "kids" = "teacher"): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(`mushaf:customAudio:${speaker}:${number}`)
    || (speaker === "teacher" ? localStorage.getItem(`mushaf:customAudio:${number}`) : null);
};

/**
 * Save custom audio URL for a surah.
 */
export const setCustomAudioUrl = (number: number, url: string, speaker: "teacher" | "kids" = "teacher") => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`mushaf:customAudio:${speaker}:${number}`, url);
    if (speaker === "teacher") localStorage.setItem(`mushaf:customAudio:${number}`, url);
  }
};

/**
 * Get the final audio path for playback. Prioritizes custom audio if set.
 */
export const getAudioPath = (number: number, speaker: "teacher" | "kids" = "teacher"): string => {
  const custom = getCustomAudioUrl(number, speaker);
  if (custom) return custom;
  return hasCloudAudio(number) ? getSurahAudioUrl(number) : getFallbackAudioUrl(number);
};
