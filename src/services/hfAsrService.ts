/**
 * خدمة التعرف على تلاوة القرآن.
 *
 * ⚠️ أمن: لا تُستخدَم أي مفاتيح في المتصفح. أي متغير يبدأ بـ VITE_ في Vite
 * يُدمج حرفياً داخل ملفات JS التي يحمّلها الزائر — فيستطيع أي شخص استخراجه
 * من أدوات المتصفح. لذلك يمرّ الصوت عبر وسيط خادمي (Supabase Edge Function
 * باسم `transcribe-audio`) يحتفظ بمفتاح HuggingFace في أسرار الخادم فقط.
 *
 * المفتاح المحلي في localStorage يُدعَم للتطوير على الجهاز فقط (اختياري):
 *   localStorage.setItem("hf_token", "hf_xxx")
 */

/** مسار الوسيط: في التطوير يُمرَّر لـ vite proxy، وفي الإنتاج لـ Supabase */
const SUPABASE_URL =
  (import.meta as unknown as { env?: { VITE_SUPABASE_URL?: string } })?.env
    ?.VITE_SUPABASE_URL || "";

const PROXY_URL = `${SUPABASE_URL}/functions/v1/transcribe-audio`;

const ASR_TIMEOUT_MS = 35_000;

export interface HFAsrResult {
  text: string;
  model: string;
  /** true = نجح عبر الوسيط/السحابة، false = فشل (استخدم تعرف المتصفح) */
  viaHf: boolean;
  error?: string;
  provider?: string;
}

const AUDIO_EXT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
  "3gp": "audio/3gpp",
};

export function audioMimeForFile(file: File): string {
  if (file.type && file.type.startsWith("audio/")) return file.type;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return AUDIO_EXT_MIME[ext] || "audio/webm";
}

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  if (file.type === "video/mp4" || file.type === "video/webm") return true; 
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return !!AUDIO_EXT_MIME[ext];
}

/**
 * مفتاح HuggingFace المحلي — للتطوير فقط.
 * ⚠️ لا يُستخدم في الإنتاج: الوسيط الخادمي هو من يحمل المفتاح.
 * ولا يُستخدم أي متغير VITE_ هنا عمداً كي لا يتسرّب المفتاح إلى الحزمة.
 */
export function getHfToken(): string | null {
  try {
    return localStorage.getItem("hf_token") || null;
  } catch {
    return null;
  }
}

export function getGroqToken(): string | null {
  try {
    return localStorage.getItem("groq_token") || null;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const t = getHfToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function transcribeWithGroq(blob: Blob, mimeOverride?: string): Promise<string> {
  const token = getGroqToken();
  if (!token) throw new Error("No Groq token");

  const formData = new FormData();
  let ext = "webm";
  if (mimeOverride) {
    ext = mimeOverride.split("/")[1] || "webm";
  } else if (blob.type) {
    ext = blob.type.split("/")[1] || "webm";
  }
  ext = ext.split(";")[0]; // إزالة معلومات codecs

  formData.append("file", blob, `audio.${ext}`);
  formData.append("model", "whisper-large-v3");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq API Error: ${res.status} - ${errorText}`);
  }

  const data = (await res.json()) as { text?: string };
  return data.text || "";
}

/**
 * يُوجّه الصوت عبر الوسيط الخادمي الآمن (`transcribe-audio`).
 * إن لم يكن العنوان متاحاً (تطوير بلا .env) نعيد فشلاً نظيفاً
 * فتُستخدَم تعرّف المتصفح المدمج كخطة بديلة.
 */
async function transcribeViaProxy(
  blob: Blob,
  contentType: string,
  onAttempt?: (info: { model: string; status: number | "net"; ok: boolean }) => void,
): Promise<HFAsrResult> {
  if (!SUPABASE_URL) {
    return { text: "", model: "none", viaHf: false, error: "no-proxy" };
  }

  let buf: ArrayBuffer;
  try {
    buf = await blob.arrayBuffer();
  } catch {
    buf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as ArrayBuffer);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(blob);
    });
  }

  try {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      // نرسل ArrayBuffer لا Blob: يمنع المتصفح من ضبط Content-Type إلى
      // multipart/octet-stream، وهو السبب الرئيسي لأخطاء 400/empty سابقاً.
      headers: {
        "Content-Type": contentType,
        ...authHeaders(),
        apikey:
          (import.meta as unknown as { env?: { VITE_SUPABASE_PUBLISHABLE_KEY?: string } })
            ?.env?.VITE_SUPABASE_PUBLISHABLE_KEY || "",
      },
      body: buf,
      signal: AbortSignal.timeout(ASR_TIMEOUT_MS),
    });

    onAttempt?.({ model: "proxy/whisper", status: res.status, ok: res.ok });

    if (!res.ok) {
      let errCode = `http-${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) errCode = j.error;
      } catch { /* رد غير JSON */ }
      return { text: "", model: "proxy", viaHf: false, error: errCode, provider: "supabase" };
    }

    const data = (await res.json()) as { text?: string; model?: string };
    const text = (data.text || "").trim();
    if (!text) {
      return { text: "", model: data.model || "proxy", viaHf: false, error: "empty", provider: "supabase" };
    }
    return { text, model: data.model || "proxy", viaHf: true, provider: "supabase" };
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name || "";
    onAttempt?.({ model: "proxy/whisper", status: "net", ok: false });
    return {
      text: "",
      model: "proxy",
      viaHf: false,
      error: name === "TimeoutError" ? "timeout" : "net",
      provider: "supabase",
    };
  }
}

/**
 * يحلّل التلاوة: Groq (إن وُجد مفتاح محلي) ثم الوسيط الآمن.
 * لا يُرسل أي مفتاح من المتصفح في المسار الافتراضي.
 */
export async function transcribeRecitation(
  blob: Blob,
  mimeOverride?: string,
  onAttempt?: (info: { model: string; status: number | "net"; ok: boolean }) => void
): Promise<HFAsrResult> {
  if (getGroqToken()) {
    try {
      const text = await transcribeWithGroq(blob, mimeOverride);
      onAttempt?.({ model: "groq/whisper-large-v3", status: 200, ok: true });
      return { text, model: "groq/whisper-large-v3", viaHf: true, provider: "groq" };
    } catch (e: unknown) {
      console.error("Groq API failed, falling back to proxy:", e);
      onAttempt?.({ model: "groq/whisper-large-v3", status: "net", ok: false });
    }
  }

  const contentType = mimeOverride || blob.type || "audio/webm";
  return transcribeViaProxy(blob, contentType, onAttempt);
}
