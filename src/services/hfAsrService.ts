/**
 * خدمة التعرف على تلاوة القرآن عبر HuggingFace Inference API
 * — نماذج Whisper/ASR جيدة بالعربية والقرآن = دقة أعلى من تعرف المتصفح
 * سقوط آمن: إن فشل السيرفر، تستخدم الصفحة تعرف المتصفح المدمج
 */

const HF_BASES = [
  "https://router.huggingface.co/hf-inference/models", // نقطة النهاية الحالية
  "https://api-inference.huggingface.co/models",        // القديمة (احتياط)
];

/** نماذج ASR تدعم العربية جيداً (الأخص بالقرآن أولاً) */
const ASR_MODELS = [
  "TeraflopAI/Cashe-DistilWhisper-Arabic", // whisper مُضبوط على العربية
  "openai/whisper-large-v3-turbo",         // الأقوى عموماً، ممتاز بالعربية
  "openai/whisper-large-v3",               // بديل موثوق
];

const ASR_TIMEOUT_MS = 30_000;

export interface HFAsrResult {
  text: string;
  model: string;
  /** true = نجح عبر HuggingFace، false = فشل (استخدم المتصفح) */
  viaHf: boolean;
  error?: string;
}

export function getHfToken(): string | null {
  try {
    return (
      localStorage.getItem("hf_token") ||
      (import.meta as unknown as { env?: { VITE_HF_TOKEN?: string } })?.env
        ?.VITE_HF_TOKEN ||
      null
    );
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const t = getHfToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** يجرّب النماذج ونقاط النهاية بالترتيب حتى ينجح أحدها */
export async function transcribeRecitation(blob: Blob): Promise<HFAsrResult> {
  let lastError = "unknown";
  for (const model of ASR_MODELS) {
    for (const base of HF_BASES) {
      try {
        const res = await fetch(`${base}/${model}`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": blob.type || "audio/webm" },
          body: blob,
          signal: AbortSignal.timeout(ASR_TIMEOUT_MS),
        });
        if (res.status === 503) {
          // النموذج قيد التحميل على السيرفر — انتظار ثم النقطة التالية
          lastError = "loading";
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          lastError = "auth";
          break; // نفس التوكن لن يصلح النقاط الأخرى
        }
        if (!res.ok) {
          lastError = `http-${res.status}`;
          continue;
        }
        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        if (text) return { text, model, viaHf: true };
        lastError = "empty";
      } catch (e) {
        lastError = e instanceof Error ? e.message : "network";
      }
    }
  }
  return { text: "", model: "", viaHf: false, error: lastError };
}
