import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * وسيط آمن لتحليل التلاوة (ASR) — يُخفي المفتاح عن المتصفح.
 *
 * لماذا؟ أي متغير يبدأ بـ VITE_ في Vite يُدمج حرفياً داخل ملفات JS التي
 * يحمّلها الزائر، فيستطيع أي شخص استخراج المفتاح من أدوات المتصفح.
 * هنا يبقى HF_TOKEN في أسرار الخادم فقط ولا يُرسَل للمتصفح أبداً.
 *
 * النشر:
 *   supabase secrets set HF_TOKEN=hf_xxx
 *   supabase functions deploy transcribe-audio --no-verify-jwt
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** نماذج Whisper — يُجرَّب الأول فإن فشل يُنتقل للثاني */
const ASR_MODELS = [
  "openai/whisper-large-v3-turbo",
  "openai/whisper-large-v3",
];

const HF_BASE = "https://router.huggingface.co/hf-inference/models";

/** أقصى حجم مسموح لملف صوتي (25 ميجابايت — حد Groq والاستخدام المعقول) */
const MAX_BYTES = 25 * 1024 * 1024;

/** المدد المسموحة من نوع الصوت (نمنع الحقن عبر Content-Type غريب) */
const ALLOWED_MIME = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/flac",
  "audio/x-flac",
  "audio/3gpp",
  "application/octet-stream",
]);

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405);

  const token = Deno.env.get("HF_TOKEN") || Deno.env.get("VITE_HF_TOKEN");
  if (!token) {
    return jsonResponse({ error: "auth", message: "خدمة التحليل غير مُعدّة على الخادم" }, 503);
  }

  try {
    const contentType = (req.headers.get("content-type") || "audio/webm").split(";")[0].trim();

    // نتحقق من النوع لكن لا نرفض بصرامة — بعض الأجهزة ترسل أنواعاً غير قياسية
    const isAudio = ALLOWED_MIME.has(contentType) || contentType.startsWith("audio/");
    if (!isAudio) {
      return jsonResponse({ error: "bad-type", message: `نوع الملف غير مدعوم: ${contentType}` }, 415);
    }

    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0) {
      return jsonResponse({ error: "empty-body", message: "لم يصل أي صوت إلى الخادم" }, 400);
    }
    if (buf.byteLength > MAX_BYTES) {
      return jsonResponse(
        { error: "too-large", message: `الملف أكبر من الحد المسموح (${MAX_BYTES / 1024 / 1024} ميجابايت)` },
        413,
      );
    }

    let lastError = "unknown";

    for (const model of ASR_MODELS) {
      try {
        const res = await fetch(`${HF_BASE}/${model}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": contentType,
          },
          body: buf,
          signal: AbortSignal.timeout(30_000),
        });

        if (res.status === 401 || res.status === 403) {
          return jsonResponse({ error: "auth", message: "مفتاح التحليل غير صالح على الخادم" }, 401);
        }

        if (res.status === 503) {
          lastError = "loading";
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }

        if (!res.ok) {
          let detail = "";
          try {
            const j = (await res.json()) as { error?: string };
            detail = j.error || "";
          } catch { /* تجاهل — رد غير JSON */ }
          lastError = detail ? `http-${res.status}: ${detail}` : `http-${res.status}`;
          continue;
        }

        const data = (await res.json()) as {
          text?: string;
          chunks?: Array<{ text?: string }>;
        };
        const text = (data.text ?? data.chunks?.map((c) => c.text ?? "").join(" ") ?? "").trim();

        return jsonResponse({ text, model, provider: "supabase" });
      } catch (err) {
        const name = (err as { name?: string })?.name || "";
        lastError = name === "TimeoutError" ? "timeout" : "net";
      }
    }

    return jsonResponse({ error: lastError, message: "تعذّر إكمال التحليل" }, 502);
  } catch (error) {
    console.error("transcribe-audio error", error);
    return jsonResponse({ error: "bad-request", message: "طلب غير صالح" }, 400);
  }
});