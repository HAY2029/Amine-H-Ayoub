import { isTauri, checkOfflineStatus as checkTauriOffline, getOfflineAudioUrl as getTauriOfflineUrl, downloadSurah as downloadTauriSurah } from "@/utils/tauriUtils";

const CACHE_NAME = "quran-audio-cache-v1";
const DB_NAME = "LearnQuranKids_OfflineAudio";
const STORE_NAME = "audio_blobs";

let idbPromise: Promise<IDBDatabase> | null = null;

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
 * Save audio blob to Cache Storage and IndexedDB
 */
export async function saveAudioToCache(url: string, surahNumber: number, blob: Blob): Promise<void> {
  // 1. Cache Storage (standard Web/PWA)
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      const headers = new Headers({
        "Content-Type": blob.type || "audio/mpeg",
        "Content-Length": String(blob.size),
        "Accept-Ranges": "bytes",
      });
      const response = new Response(blob, { status: 200, statusText: "OK", headers });
      await cache.put(url, response);
    } catch (e) {
      console.warn("Failed saving to CacheStorage, falling back to IDB:", e);
    }
  }

  // 2. IndexedDB Backup
  try {
    const db = await getAudioIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ key: `surah_${surahNumber}`, url, blob, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("Failed saving to IndexedDB:", e);
  }

  // 3. Tauri Disk File (if running under Tauri Desktop/Android)
  if (isTauri()) {
    try {
      await downloadTauriSurah(url, surahNumber);
    } catch (e) {
      console.warn("Tauri downloadSurah fallback:", e);
    }
  }
}

/**
 * Checks if a Surah audio is cached offline on this device.
 */
export async function isAudioCachedOffline(surahNumber: number, url: string): Promise<boolean> {
  // Check Tauri
  if (isTauri()) {
    const tauriOk = await checkTauriOffline(surahNumber);
    if (tauriOk) return true;
  }

  // Check Cache Storage
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(url);
      if (match) return true;
    } catch {
      // ignore
    }
  }

  // Check IndexedDB
  try {
    const db = await getAudioIDB();
    const result = await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`surah_${surahNumber}`);
      req.onsuccess = () => resolve(!!req.result?.blob);
      req.onerror = () => resolve(false);
    });
    if (result) return true;
  } catch {
    // ignore
  }

  return false;
}

/**
 * Returns a playable audio URL (Local file / ObjectURL / Remote URL).
 * Guarantees offline playback if the audio was downloaded.
 */
export async function resolvePlayableAudioUrl(surahNumber: number, remoteUrl: string): Promise<string> {
  // 1. Tauri Native Disk File
  if (isTauri()) {
    try {
      const tauriUrl = await getTauriOfflineUrl(surahNumber);
      if (tauriUrl) return tauriUrl;
    } catch (e) {
      console.warn("Tauri local audio get failed:", e);
    }
  }

  // 2. Cache Storage
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(remoteUrl);
      if (match) {
        const blob = await match.blob();
        if (blob && blob.size > 0) {
          return URL.createObjectURL(blob);
        }
      }
    } catch (e) {
      console.warn("CacheStorage match failed:", e);
    }
  }

  // 3. IndexedDB
  try {
    const db = await getAudioIDB();
    const idbResult = await new Promise<{ blob?: Blob } | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`surah_${surahNumber}`);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (idbResult?.blob && idbResult.blob.size > 0) {
      return URL.createObjectURL(idbResult.blob);
    }
  } catch (e) {
    console.warn("IndexedDB audio lookup failed:", e);
  }

  // 4. Default to Remote URL (Stream)
  return remoteUrl;
}

/**
 * Downloads and caches audio in the background silently.
 * Used for preloading the current or next Surah on weak connections.
 */
export async function cacheAudioInBackground(surahNumber: number, url: string): Promise<void> {
  try {
    const isCached = await isAudioCachedOffline(surahNumber, url);
    if (isCached) return;

    // Fetch the audio file with a low priority if supported, or just normally
    const response = await fetch(url, { cache: "default", keepalive: true });
    if (response.ok) {
      const blob = await response.blob();
      await saveAudioToCache(url, surahNumber, blob);
      console.log(`[Cache] Background cached Surah ${surahNumber} for offline use`);
    }
  } catch (e) {
    console.debug(`[Cache] Background caching skipped for Surah ${surahNumber}`, e);
  }
}
