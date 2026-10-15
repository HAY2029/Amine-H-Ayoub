/**
 * ذاكرة صوت الشخصيات — تخزين مؤقت لملفات الصوت المُشتقّة من ElevenLabs.
 *
 * الهدف:
 *  - عدم إرسال نفس الجملة إلى ElevenLabs مرّة أخرى.
 *  - تقليل استهلاك الـ API وتسريع التطبيق.
 *
 * المفتاح = `<id>:<text>`
 * تُخزَّن ملفات الصوت في IndexedDB (Blob) — أخفّ وأسرع من localStorage للبيانات الثنائية،
 * مع احتياطٍ في الذاكرة (Map) للجلسة الحالية.
 *
 * ملاحظة: إن لم يتوفّر IndexedDB (بيئة نادرة) يعمل النظام بالذاكرة فقط بلا أي خطأ.
 */

const DB_NAME = "kidsCharacterVoice";
const DB_VERSION = 1;
const STORE = "clips";

export const voiceCacheKey = (characterId: string, text: string): string =>
  `${characterId}:${text.trim()}`;

/** خريطة في الذاكرة للجلسة الحالية (تسرّع الاستعمال المتكرر). */
const memCache = new Map<string, Blob>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** يجلب صوتًا مخزّنًا (أو null). */
export const getCachedVoice = async (characterId: string, text: string): Promise<Blob | null> => {
  const key = voiceCacheKey(characterId, text);
  if (memCache.has(key)) return memCache.get(key) ?? null;
  const db = await openDb();
  if (!db) return null;
  return new Promise<Blob | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const blob = req.result as Blob | undefined;
        if (blob) memCache.set(key, blob);
        resolve(blob ?? null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

/** يخزّن صوتًا في الذاكرة + IndexedDB. */
export const setCachedVoice = async (characterId: string, text: string, blob: Blob): Promise<void> => {
  const key = voiceCacheKey(characterId, text);
  memCache.set(key, blob);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
};

/** هل هذه الجملة مخزّنة مسبقًا؟ */
export const hasCachedVoice = async (characterId: string, text: string): Promise<boolean> =>
  (await getCachedVoice(characterId, text)) !== null;