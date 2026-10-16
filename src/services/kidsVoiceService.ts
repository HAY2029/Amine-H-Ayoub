/**
 * خدمة صوت الشخصيات — تنسّق بين الواجهة وSupabase Edge Function وذاكرة الصوت.
 *
 * 🔒 قاعدة أمنية: لا يوجد أي مفتاح ElevenLabs في هذا الملف ولا في الواجهة إطلاقًا.
 * كل استدعاء لـ ElevenLabs يمرّ عبر Edge Function اسمها `kids-character-voice`
 * حيث يُخزَّن `ELEVENLABS_API_KEY` و`ELEVENLABS_*_VOICE_ID` كأسرار في Supabase.
 *
 * المسار:  الواجهة ← Edge Function ← ElevenLabs ← Voice ID ← Audio (Blob)
 */
import { supabase, hasValidSupabaseKey } from "../lib/supabase";
import { getCachedVoice, setCachedVoice, voiceCacheKey } from "../utils/kidsVoiceCache";
import type { KidsCharacterId } from "../data/kidsCharacters";

/** الحد الأقصى لطول النص المُرسل (يمنع الطلبات العبثية). */
const MAX_TEXT_LENGTH = 300;

/** نسجّل الطلبات الجارية لمنع إرسال نفس الجملة مرّتين بالتوازي. */
const inFlight = new Map<string, Promise<Blob | null>>();

export interface KidsVoiceRequest {
  characterId: KidsCharacterId;
  text: string;
}

/** يتحقّق أن الاستدعاء ممكن (مفتاح Supabase مهيّأ + نص صالح). */
export const isKidsVoiceAvailable = (): boolean => hasValidSupabaseKey();

/**
 * يجلب صوت جملة بشخصية معيّنة:
 *  1) من الذاكرة/IndexedDB إن وُجد.
 *  2) وإلا من Edge Function ثم يخزّنه.
 * يعيد Blob (أو null عند أي فشل — بلا رمي استثناءات).
 */
export const fetchKidsVoice = async ({
  characterId,
  text,
}: KidsVoiceRequest): Promise<Blob | null> => {
  const cleanText = text.trim();
  if (!cleanText || cleanText.length > MAX_TEXT_LENGTH) return null;

  // 1) ذاكرة مؤقتة
  const cached = await getCachedVoice(characterId, cleanText);
  if (cached) return cached;

  // 2) طلب واحد فقط لنفس (الشخصية + الجملة) في الوقت نفسه
  const key = voiceCacheKey(characterId, cleanText);
  const existing = inFlight.get(key);
  if (existing) return existing;

  if (!isKidsVoiceAvailable()) return null;

  const task = (async (): Promise<Blob | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("kids-character-voice", {
        body: { characterId, text: cleanText },
      });
      if (error) return null;

      // Edge Function تعيد { audioBase64, contentType } أو { audioUrl }
      const payload = data as
        | { audioBase64?: string; contentType?: string; audioUrl?: string }
        | null;
      if (!payload) return null;

      let blob: Blob | null = null;
      if (payload.audioBase64) {
        const bytes = base64ToBytes(payload.audioBase64);
        blob = new Blob([bytes.buffer as ArrayBuffer], { type: payload.contentType || "audio/mpeg" });
      } else if (payload.audioUrl) {
        const res = await fetch(payload.audioUrl);
        if (res.ok) blob = await res.blob();
      }
      if (!blob) return null;

      await setCachedVoice(characterId, cleanText, blob);
      return blob;
    } catch {
      return null; // نتجاهل بهدوء — التطبيق يستمر بلا صوت
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
};

/** تحويل Base64 إلى Uint8Array بلا أي مكتبات خارجية. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ───────────────── تشغيل الصوت ───────────────── */

let currentClipEl: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

/** يوقف أي مقطع صوت للشخصية يعمل حالياً. */
export const stopKidsCharacterVoice = (): void => {
  if (currentClipEl) {
    try {
      currentClipEl.pause();
      currentClipEl.currentTime = 0;
    } catch {
      /* ignore */
    }
    currentClipEl = null;
  }
  if (currentObjectUrl) {
    try {
      URL.revokeObjectURL(currentObjectUrl);
    } catch {
      /* ignore */
    }
    currentObjectUrl = null;
  }
};

/**
 * يشغّل صوت جملة بشخصية معيّنة (من cache أو من Edge Function).
 * لا يرمي أبداً — يتجاهل بهدوء عند أي فشل، فلا يعطّل اللعبة.
 * يعيد true إن بدأ التشغيل.
 */
export const playKidsCharacterVoice = async ({
  characterId,
  text,
}: KidsVoiceRequest): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  const blob = await fetchKidsVoice({ characterId, text });
  if (!blob) return false;
  try {
    stopKidsCharacterVoice();
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.preload = "auto";
    currentClipEl = el;
    currentObjectUrl = url;
    el.addEventListener("ended", () => stopKidsCharacterVoice(), { once: true });
    await el.play();
    return true;
  } catch {
    stopKidsCharacterVoice();
    return false;
  }
};

/** يسجّل توقّف الصوت على window لإيقافه عند مغادرة الصفحة (على نمط __stopGameVoice). */
if (typeof window !== "undefined") {
  (window as unknown as { __stopKidsCharacterVoice?: () => void }).__stopKidsCharacterVoice =
    stopKidsCharacterVoice;
}