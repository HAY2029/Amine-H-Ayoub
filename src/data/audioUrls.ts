// Public audio delivery: Hugging Face first, with Internet Archive as a resilient fallback.
const HF_BASE = "https://huggingface.co/datasets/hammoualiyoucef20/quran-audio/resolve/main";
const DIRECT_STORAGE_BASE = "https://ia803201.us.archive.org/34/items/quran-audio-files-for-kids";
const GENERAL_DOWNLOAD_BASE = "https://archive.org/download/quran-audio-files-for-kids";
const RECOVERY_COOLDOWN_MS = 60_000;
const MAX_RETRY_DELAY_MS = 10_000;

type AudioProvider = "huggingface" | "archive";
let activeProvider: AudioProvider = "huggingface";
let nextHfProbeAt = 0;
let recoveryBackoffMs = RECOVERY_COOLDOWN_MS;
let recoveryProbe: Promise<void> | null = null;

const archiveUrls = (number: number): string[] => [
  `${DIRECT_STORAGE_BASE}/${number}.mp3`,
  `${GENERAL_DOWNLOAD_BASE}/${number}.mp3`,
];

export const getHuggingFaceAudioUrl = (number: number): string => `${HF_BASE}/${number}.mp3`;

/**
 * رابط الصوت الأساسي المباشر والسريع جداً من سيرفر التخزين.
 */
export const getSurahAudioUrl = (number: number): string => {
  if (activeProvider === "archive") return archiveUrls(number)[0];
  return getHuggingFaceAudioUrl(number);
};

/**
 * رابط احتياطي عبر بوابة التحميل العامة.
 */
export const getFallbackAudioUrl = (number: number): string => {
  return archiveUrls(number)[0];
};

export const getArchiveGatewayAudioUrl = (number: number): string => archiveUrls(number)[1];

/** URLs to try in order for a durable download; no credentials are required. */
export function getSurahAudioCandidates(number: number): string[] {
  const preferred = getSurahAudioUrl(number);
  const candidates = activeProvider === "huggingface"
    ? [preferred, ...archiveUrls(number)]
    : [...archiveUrls(number), getHuggingFaceAudioUrl(number)];
  return [...new Set(candidates)];
}

export const getAudioProvider = (): AudioProvider => activeProvider;

const retryableStatus = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500;

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const dateDelay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay >= 0) return Math.min(dateDelay, MAX_RETRY_DELAY_MS);
  }
  return Math.min(500 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

function scheduleHfRecovery(): void {
  if (recoveryProbe || typeof fetch === "undefined") return;
  if (!nextHfProbeAt) nextHfProbeAt = Date.now() + recoveryBackoffMs;
  const probeAt = nextHfProbeAt;
  recoveryProbe = (async () => {
    await wait(Math.max(0, probeAt - Date.now())).catch(() => {});
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(getHuggingFaceAudioUrl(1), {
        method: "HEAD", signal: controller.signal, cache: "no-store",
      });
      if (response.ok) {
        // Only affects future URL resolutions; an active media element is never reloaded.
        activeProvider = "huggingface";
        recoveryBackoffMs = RECOVERY_COOLDOWN_MS;
        nextHfProbeAt = 0;
      } else {
        recoveryBackoffMs = Math.min(recoveryBackoffMs * 2, 15 * 60_000);
        nextHfProbeAt = Date.now() + recoveryBackoffMs;
      }
    } catch {
      recoveryBackoffMs = Math.min(recoveryBackoffMs * 2, 15 * 60_000);
      nextHfProbeAt = Date.now() + recoveryBackoffMs;
    } finally {
      clearTimeout(timeout);
      recoveryProbe = null;
      if (activeProvider === "archive" && nextHfProbeAt > Date.now()) scheduleHfRecovery();
    }
  })();
}

/** Media elements hide HTTP status; use this when an HF media source errors. */
export function reportHuggingFaceFailure(): void {
  if (activeProvider !== "archive") {
    activeProvider = "archive";
    recoveryBackoffMs = RECOVERY_COOLDOWN_MS;
    nextHfProbeAt = 0;
    scheduleHfRecovery();
  }
}

async function fetchWithAttempts(url: string, signal?: AbortSignal, retries = 1): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    signal?.addEventListener("abort", forwardAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "default" });
      clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
      if (response.ok || !retryableStatus(response.status) || attempt === retries) return response;
      lastError = new Error(`Audio request failed: HTTP ${response.status}`);
      await wait(retryDelay(response, attempt), signal);
    } catch (error) {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt === retries) break;
      await wait(retryDelay(undefined, attempt), signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Audio request failed");
}

/** Fetch a Surah from HF first, then Archive's direct and gateway endpoints. */
export async function fetchSurahAudio(number: number, signal?: AbortSignal): Promise<{ response: Response; url: string }> {
  const hfUrl = getHuggingFaceAudioUrl(number);
  if (activeProvider === "archive" && Date.now() >= nextHfProbeAt) scheduleHfRecovery();

  if (activeProvider === "huggingface") {
    try {
      const response = await fetchWithAttempts(hfUrl, signal, 1);
      if (response.ok) return { response, url: hfUrl };
      if (response.status !== 404 && !retryableStatus(response.status)) return { response, url: hfUrl };
      // A 404 can mean this particular Surah is absent from the incomplete HF dataset.
      if (response.status !== 404) reportHuggingFaceFailure();
    } catch (error) {
      if (signal?.aborted) throw error;
      reportHuggingFaceFailure();
    }
  }

  let lastResponse: Response | undefined;
  let lastUrl = "";
  let lastError: unknown;
  const urls = archiveUrls(number);
  for (const url of urls) {
    try {
      const response = await fetchWithAttempts(url, signal, 1);
      if (response.ok || (response.status !== 404 && !retryableStatus(response.status))) return { response, url };
      lastResponse = response;
      lastUrl = url;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  if (lastResponse) return { response: lastResponse, url: lastUrl };
  throw lastError instanceof Error ? lastError : new Error("Audio unavailable from Hugging Face and Internet Archive");
}

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

const CLOUD_CACHE_KEY = "mushaf:cloud_surahs_cache_v1";
const CLOUD_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 ساعة

/**
 * Archive metadata preserves the current supported coverage even when HF is incomplete.
 * Uses localStorage cache to avoid repeated 2MB network requests on every startup.
 */
export async function initCloudAudioAvailability() {
  try {
    // 1. محاولة استرجاع السور من التخزين المحلي فوراً بدون طلب شبكة
    if (typeof localStorage !== "undefined") {
      try {
        const cached = localStorage.getItem(CLOUD_CACHE_KEY);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < CLOUD_CACHE_TTL && Array.isArray(data) && data.length > 0) {
            data.forEach((num: number) => CLOUD_AVAILABLE_SURAHS.add(num));
            return;
          }
        }
      } catch { /* ignore */ }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("https://archive.org/metadata/quran-audio-files-for-kids", { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return;
    const data = await res.json();
    const list: number[] = [];
    if (data && data.files) {
      data.files.forEach((item: any) => {
        if (item.name && item.name.endsWith('.mp3')) {
          const num = parseInt(item.name.replace('.mp3', ''), 10);
          if (!isNaN(num)) {
            CLOUD_AVAILABLE_SURAHS.add(num);
            list.push(num);
          }
        }
      });
    }
    if (typeof localStorage !== "undefined" && list.length > 0) {
      try {
        localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify({ data: list, ts: Date.now() }));
      } catch { /* ignore */ }
    }
  } catch (err) {
    // نتجاهل بهدوء ولا نعطل التطبيق
  }
}
export async function fetchAudioWithRetry(url: string, signal?: AbortSignal, maxRetries = 3): Promise<Response> {
  return fetchWithAttempts(url, signal, Math.max(0, maxRetries - 1));
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
  return getSurahAudioUrl(number);
};
