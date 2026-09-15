/**
 * تشخيص مفتاح HuggingFace ونماذج ASR.
 * الاستخدام:  node tools/test-hf-token.cjs [token]
 * إن لم يُمرَّر توكن، يُقرأ من VITE_HF_TOKEN أو localStorage غير متاح (Node) → يُطلب كوسيط.
 */
const fs = require("fs");
const path = require("path");

const token =
  process.argv[2] ||
  (() => {
    try {
      const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
      const m = env.match(/^VITE_HF_TOKEN=(.+)$/m);
      return m ? m[1].trim() : null;
    } catch {
      return null;
    }
  })();

if (!token) {
  console.log("لا يوجد توكن. مرّره كوسيط: node tools/test-hf-token.cjs hf_xxx");
  process.exit(1);
}

const MODELS = [
  "TeraflopAI/Cashe-DistilWhisper-Arabic",
  "openai/whisper-large-v3-turbo",
  "openai/whisper-large-v3",
  "tarteel-ai/whisper-base-ar-quran",
];

const BASES = [
  "https://router.huggingface.co/hf-inference/models",
  "https://api-inference.huggingface.co/models",
];

/** WAV صغير صامت (0.5 ثانية) لاختبار القناة بلا ملف خارجي */
function silentWav(seconds = 0.5, rate = 16000) {
  const n = Math.floor(seconds * rate);
  const data = Buffer.alloc(n * 2);
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0);
  hdr.writeUInt32LE(36 + data.length, 4);
  hdr.write("WAVE", 8);
  hdr.write("fmt ", 12);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(rate, 24);
  hdr.writeUInt32LE(rate * 2, 28);
  hdr.writeUInt16LE(2, 32);
  hdr.writeUInt16LE(16, 34);
  hdr.write("data", 36);
  hdr.writeUInt32LE(data.length, 40);
  return Buffer.concat([hdr, data]);
}

/** نفس النماذج التي يستخدمها التطبيق فعلاً في src/services/hfAsrService.ts */
const APP_MODELS = ["openai/whisper-large-v3-turbo", "openai/whisper-large-v3"];
const APP_BASE = "https://router.huggingface.co/hf-inference/models";

(async () => {
  console.log("=== 1) التحقق من صحة التوكن (whoami) ===");
  try {
    const r = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const txt = await r.text();
    console.log("  status:", r.status);
    if (r.ok) {
      const j = JSON.parse(txt);
      console.log("  المستخدم:", j.name || j.user || "?");
      console.log("  النوع:", j.type || "?");
      const perms = j.auth?.accessToken?.permissions || [];
      console.log("  صلاحيات المفتاح:", JSON.stringify(perms));
      const role = j.auth?.accessToken?.role;
      if (role) console.log("  الدور:", role);
      if (perms.length && !perms.some(p => /inference/i.test(p))) {
        console.log("  ⚠️ لا توجد صلاحية 'inference' صريحة — قد تفشل نداءات ASR.");
      }
    } else {
      console.log("  ❌ التوكن غير صالح:", txt.slice(0, 300));
    }
  } catch (e) {
    console.log("  ❌ فشل الاتصال:", e.message);
  }

  console.log("\n=== 2) اختبار قنوات ASR (WAV صامت 0.5s) ===");
  const wav = silentWav();
  for (const base of BASES) {
    for (const model of MODELS) {
      const url = `${base}/${model}`;
      const started = Date.now();
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" },
          body: wav,
          signal: AbortSignal.timeout(40000),
        });
        const body = await r.text();
        const ms = Date.now() - started;
        const tag = r.ok ? "✅" : r.status === 503 ? "⏳ (تحميل)" : "❌";
        console.log(`  ${tag} [${r.status}] ${ms}ms  ${model}`);
        console.log(`       base: ${base}`);
        if (!r.ok || r.status === 503) console.log(`       رد: ${body.slice(0, 220).replace(/\s+/g, " ")}`);
      } catch (e) {
        console.log(`  ❌ استثناء ${model}: ${e.message}`);
      }
    }
  }
  console.log("\n=== 3) فحص قناة التطبيق الفعلية (نماذج src/services/hfAsrService.ts) ===");
  let appOk = 0;
  for (const model of APP_MODELS) {
    const started = Date.now();
    try {
      const r = await fetch(`${APP_BASE}/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" },
        body: wav,
        signal: AbortSignal.timeout(40000),
      });
      const body = await r.text();
      const ms = Date.now() - started;
      if (r.ok) {
        appOk++;
        console.log(`  ✅ [200] ${ms}ms  ${model}`);
        console.log(`       رد (WAV صامت): ${body.slice(0, 160).replace(/\s+/g, " ")}`);
      } else {
        console.log(`  ❌ [${r.status}] ${ms}ms  ${model}  →  ${body.slice(0, 160).replace(/\s+/g, " ")}`);
      }
    } catch (e) {
      console.log(`  ❌ استثناء ${model}: ${e.message}`);
    }
  }
  console.log(appOk > 0
    ? `\n  🎉 قناة التحليل تعمل (${appOk}/${APP_MODELS.length} نموذج جاهز) — مشكلة الرفع محلولة.`
    : "\n  ⚠️ لا يوجد نموذج يعمل — تحقّق من التوكن أو أضف نموذجاً مدعوماً.");

  console.log("\nانتهى التشخيص.");
})();
