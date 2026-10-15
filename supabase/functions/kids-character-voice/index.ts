/**
 * Edge Function: kids-character-voice
 *
 * تولّد صوت جملة بشخصية من ركن الأطفال (عمران/راضية) عبر ElevenLabs.
 *
 * 🔒 الأمان: مفتاح ElevenLabs ومعرّفات الأصوات تبقى أسرارًا في Supabase
 * (ELEVENLABS_API_KEY / ELEVENLABS_IMRAN_VOICE_ID / ELEVENLABS_RADIA_VOICE_ID).
 * لا تضع هذه القيم في الواجهة ولا في GitHub إطلاقًا.
 *
 * الطلب (POST JSON): { characterId: "imran" | "radia", text: string }
 * الاستجابة:         { audioBase64, contentType }  أو  { audioUrl }  أو  { error }
 *
 * نشر الدالة:  supabase functions deploy kids-character-voice
 * ضبط الأسرار: supabase secrets set ELEVENLABS_API_KEY=... ELEVENLABS_IMRAN_VOICE_ID=... ELEVENLABS_RADIA_VOICE_ID=...
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** خريطة الشخصية → اسم متغيّر البيئة الذي يحمل معرّف الصوت. */
const VOICE_ENV: Record<string, string> = {
  imran: "ELEVENLABS_IMRAN_VOICE_ID",
  radia: "ELEVENLABS_RADIA_VOICE_ID",
};

const MAX_TEXT_LENGTH = 300;
const MODEL_ID = Deno.env.get("ELEVENLABS_MODEL_ID") || "eleven_multilingual_v2";

/** حدّ بسيط لمنع الإساءة (حماية رصيد ElevenLabs) — لكل IP في الدقيقة. */
const RATE_LIMIT = Number(Deno.env.get("sk_db6c23ce16381185b58a9681a32f83c4988a80839a35ffc4") || "30");
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  if (RATE_LIMIT <= 0) return false;
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405);

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    if (isRateLimited(ip)) {
      return jsonResponse({ error: "طلبات كثيرة، حاول بعد قليل" }, 429);
    }

    const body = await req.json() as { characterId?: string; text?: string };
    const characterId = String(body.characterId || "").trim();
    const text = String(body.text || "").trim();

    if (!(characterId in VOICE_ENV)) {
      return jsonResponse({ error: "شخصية غير معروفة" }, 400);
    }
    if (!text || text.length > MAX_TEXT_LENGTH) {
      return jsonResponse({ error: "النص مطلوب وأقصاه 300 حرف" }, 400);
    }

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "خدمة الصوت غير مُعدّة على الخادم" }, 503);
    }

    const voiceId = Deno.env.get(VOICE_ENV[characterId]);
    if (!voiceId || voiceId.startsWith("YOUR_")) {
      return jsonResponse({ error: "معرّف صوت الشخصية غير مُعدّ" }, 503);
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
        }),
      },
    );

    if (!response.ok) {
      console.error("ElevenLabs error", response.status, await response.text());
      return jsonResponse({ error: "تعذّر توليد الصوت من الخادم" }, 502);
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // تحويل إلى Base64 على دفعات (آمن للنصوص الكبيرة في Deno)
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const audioBase64 = btoa(binary);

    return jsonResponse({ audioBase64, contentType: "audio/mpeg" });
  } catch (error) {
    console.error("kids-character-voice error", error);
    return jsonResponse({ error: "بيانات الطلب غير صالحة" }, 400);
  }
});