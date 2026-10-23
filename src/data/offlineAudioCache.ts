import { isTauri, checkOfflineStatus as checkTauriOffline, getOfflineAudioUrl as getTauriOfflineUrl } from "@/utils/tauriUtils";
import { getSurahAudioUrl } from "./audioUrls";

const CACHE_NAME = "quran-audio-cache-v1";
const DB_NAME = "LearnQuranKids_OfflineAudio";
const STORE_NAME = "audio_blobs";

let idbPromise: Promise<IDBDatabase> | null = null;

// ذاكرة سريعة لحفظ عناوين ObjectURL الحالية لتجنب إعادة التوليد المتكرر وتسريب الذاكرة
const activeObjectUrls = new Map<number, string>();
const MAX_ACTIVE_URLS = 6;

function getAudioIDB(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB not available"));
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

/**
 * حفظ ملف الصوت محلياً في IndexedDB و Cache Storage
 * مع ضمان نوع MIME: audio/mpeg لتوافقه مع كافة مشغلات الصوت بالمتصفح
 */
export async function saveAudioToCache(url: string, surahNumber: number, blob: Blob, speaker?: "teacher" | "kids"): Promise<void> {
  let persisted = false;

  // التأكد من أن الـ Blob من نوع audio/mpeg بصورة قطعية
  const audioBlob =
    blob.type === "audio/mpeg" || blob.type === "audio/mp3"
      ? blob
      : new Blob([blob], { type: "audio/mpeg" });

  // 1. IndexedDB أولاً (الأكثر موثوقية وثباتاً لحفظ الملفات الصوتية الكاملة)
  try {
    const db = await getAudioIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const speakerKey = speaker ? `surah_${surahNumber}_${speaker}` : `surah_${surahNumber}`;
      const req = store.put({
        key: speakerKey,
        surahNumber,
        speaker: speaker || "teacher",
        url,
        blob: audioBlob,
        size: audioBlob.size,
        updatedAt: Date.now()
      });
      if (speaker === "teacher" || !speaker) {
        store.put({
          key: `surah_${surahNumber}`,
          surahNumber,
          speaker: "teacher",
          url,
          blob: audioBlob,
          size: audioBlob.size,
          updatedAt: Date.now()
        });
      }
      req.onsuccess = () => {
        persisted = true;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[offlineAudioCache] Failed saving to IndexedDB:", e);
  }

  // 2. Cache Storage (تخزين تحت عدة روابط بديلة لضمان العثور عليه بأي رابط)
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      const headers = new Headers({
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBlob.size),
        "Accept-Ranges": "bytes",
      });

      const response1 = new Response(audioBlob, { status: 200, statusText: "OK", headers });
      await cache.put(url, response1);

      // حفظ برابط السورة الافتراضي إن كان مختلفاً
      const defaultUrl = getSurahAudioUrl(surahNumber);
      if (defaultUrl && defaultUrl !== url) {
        const response2 = new Response(audioBlob, { status: 200, statusText: "OK", headers });
        await cache.put(defaultUrl, response2);
      }

      persisted = true;
    } catch (e) {
      console.warn("[offlineAudioCache] Failed saving to CacheStorage:", e);
    }
  }

  // تحديث أو تجديد رابط ObjectURL المحلي في الذاكرة
  if (activeObjectUrls.has(surahNumber)) {
    const oldUrl = activeObjectUrls.get(surahNumber);
    if (oldUrl) {
      try { URL.revokeObjectURL(oldUrl); } catch { /* ignore */ }
    }
    const newUrl = URL.createObjectURL(audioBlob);
    activeObjectUrls.set(surahNumber, newUrl);
  }

  if (!persisted) {
    throw new Error("تعذر حفظ الصوت في ذاكرة الجهاز المحلية");
  }
}

/**
 * التحقق مما إذا كانت السورة محملة وجاهزة للتشغيل دون اتصال
 */
export async function isAudioCachedOffline(surahNumber: number, url?: string): Promise<boolean> {
  // 1. التحقق من تطبيق توري المكتبي
  if (isTauri()) {
    try {
      const tauriOk = await checkTauriOffline(surahNumber);
      if (tauriOk) return true;
    } catch {
      // ignore
    }
  }

  // 2. التحقق من IndexedDB بواسطة رقم السورة (سريع وموثوق جداً)
  try {
    const db = await getAudioIDB();
    const hasBlob = await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`surah_${surahNumber}`);
      req.onsuccess = () => {
        const res = req.result;
        resolve(!!res?.blob && res.blob.size > 1000);
      };
      req.onerror = () => resolve(false);
    });
    if (hasBlob) return true;
  } catch {
    // ignore
  }

  // 3. التحقق من Cache Storage
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      if (url) {
        const match = await cache.match(url);
        if (match) return true;
      }
      const defaultUrl = getSurahAudioUrl(surahNumber);
      if (defaultUrl) {
        const matchDefault = await cache.match(defaultUrl);
        if (matchDefault) return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * إرجاع رابط تشغيل جاهز ومضمون (ملف محلي / رابط ذاكرة ObjectURL / رابط سحابي)
 * يُعطي الأولوية القصوى للملف المحمّل محلياً لضمان سرعة تشغيل 0ms وثبات تام
 */
export async function resolvePlayableAudioUrl(surahNumber: number, remoteUrl: string, speaker?: "teacher" | "kids"): Promise<string> {
  // 1. ملف محلي في نظام توري (Tauri Native)
  if (isTauri()) {
    try {
      const tauriUrl = await getTauriOfflineUrl(surahNumber);
      if (tauriUrl) return tauriUrl;
    } catch (e) {
      console.warn("[offlineAudioCache] Tauri local audio get failed:", e);
    }
  }

  // 2. التحقق من الذاكرة الحية (ObjectURL الكاش) إن كان قد تم إنشاؤه مسبقاً
  const memoryKey = speaker ? (surahNumber * 10 + (speaker === "kids" ? 2 : 1)) : surahNumber;
  if (activeObjectUrls.has(memoryKey)) {
    const cachedUrl = activeObjectUrls.get(memoryKey);
    if (cachedUrl) return cachedUrl;
  }
  if (activeObjectUrls.has(surahNumber)) {
    const cachedUrl = activeObjectUrls.get(surahNumber);
    if (cachedUrl) return cachedUrl;
  }

  // 3. التحقق من IndexedDB أولاً (الأعلى استقراراً وسرعة للـ Blobs)
  try {
    const db = await getAudioIDB();
    const idbResult = await new Promise<{ blob?: Blob } | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const primaryKey = speaker ? `surah_${surahNumber}_${speaker}` : `surah_${surahNumber}`;
      const req = store.get(primaryKey);
      req.onsuccess = () => {
        if (req.result?.blob) {
          resolve(req.result);
        } else if (speaker) {
          const req2 = store.get(`surah_${surahNumber}`);
          req2.onsuccess = () => resolve(req2.result || null);
          req2.onerror = () => resolve(null);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });

    if (idbResult?.blob && idbResult.blob.size > 1000) {
      // ضمان أن الـ Blob متوافق ونوعه audio/mpeg
      const cleanBlob =
        idbResult.blob.type === "audio/mpeg" || idbResult.blob.type === "audio/mp3"
          ? idbResult.blob
          : new Blob([idbResult.blob], { type: "audio/mpeg" });

      manageMemoryCache(memoryKey);
      const objUrl = URL.createObjectURL(cleanBlob);
      activeObjectUrls.set(memoryKey, objUrl);
      return objUrl;
    }
  } catch (e) {
    console.warn("[offlineAudioCache] IndexedDB audio lookup failed:", e);
  }

  // 4. التحقق من Cache Storage
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      const urlsToMatch = [remoteUrl, getSurahAudioUrl(surahNumber)].filter(Boolean);
      for (const u of urlsToMatch) {
        const match = await cache.match(u);
        if (match) {
          const blob = await match.blob();
          if (blob && blob.size > 1000) {
            const cleanBlob =
              blob.type === "audio/mpeg" || blob.type === "audio/mp3"
                ? blob
                : new Blob([blob], { type: "audio/mpeg" });

            manageMemoryCache(surahNumber);
            const objUrl = URL.createObjectURL(cleanBlob);
            activeObjectUrls.set(surahNumber, objUrl);
            return objUrl;
          }
        }
      }
    } catch (e) {
      console.warn("[offlineAudioCache] CacheStorage match failed:", e);
    }
  }

  // 5. إذا لم يكن محملاً محلياً: الرجوع لرابط البث الخارجي
  return remoteUrl;
}

/**
 * إدارة حجم ذاكرة الروابط المحفوظة (LRU صغير) لمنع تسريب الذاكرة
 */
function manageMemoryCache(newSurahNumber: number) {
  if (activeObjectUrls.size >= MAX_ACTIVE_URLS && !activeObjectUrls.has(newSurahNumber)) {
    const firstKey = activeObjectUrls.keys().next().value;
    if (firstKey !== undefined) {
      const oldUrl = activeObjectUrls.get(firstKey);
      if (oldUrl) {
        try { URL.revokeObjectURL(oldUrl); } catch { /* ignore */ }
      }
      activeObjectUrls.delete(firstKey);
    }
  }
}

/**
 * تحميل الصوت وتخزينه في الخلفية بهدوء
 */
export async function cacheAudioInBackground(surahNumber: number, url: string): Promise<void> {
  try {
    const isCached = await isAudioCachedOffline(surahNumber, url);
    if (isCached) return;

    const response = await fetch(url, { cache: "default", keepalive: true });
    if (response.ok) {
      const blob = await response.blob();
      await saveAudioToCache(url, surahNumber, blob);
    }
  } catch (e) {
    console.debug(`[offlineAudioCache] Background caching skipped for Surah ${surahNumber}`, e);
  }
}
