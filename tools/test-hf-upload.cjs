/**
 * اختبار رفع ملف صوتي حقيقي (كما يفعله المتصفر) إلى نماذج Whisper.
 * - يجرب بروتوكول الاتصال (POST raw buffer مع Content-Type الصحيح)
 * - يطبع الرد الكامل (ليس مجرد status)
 * - يستخدم نفس المنطق ArrayBuffer مثل الإصدار المُحدّث من hfAsrService.ts
 *
 * الاستخدام:  node tools/test-hf-upload.cjs [token] [مسار-الملف]
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
  console.log("⚠️ لا يوجد توكن. مرّره كوسيط: node tools/test-hf-upload.cjs hf_xxx [ملف]");
  process.exit(1);
}

// نماذج التطبيق الفعلية — بنفس الترتيب
const APP_MODELS = ["openai/whisper-large-v3-turbo", "openai/whisper-large-v3"];
const APP_BASE = "https://router.huggingface.co/hf-inference/models";

// ملف صوتي افتراضي — نملأه بسيلكون تكرره (صوت مقرب من "الله")
// إذا لم يُمرّر ملف، ننشئ WAV بسيط.
const audioFile = process.argv[3];

if (audioFile) {
  // --- حالة رفع ملف حقيقي ---
  const file = fs.readFileSync(audioFile);
  const ext = (path.extname(audioFile) || "").toLowerCase().replace(".", "");
  const mimeMap = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    flac: "audio/flac",
    webm: "audio/webm",
    mp4: "audio/mp4",
  };
  const mime = mimeMap[ext] || "application/octet-stream";

  console.log(`=== اختبار رفع ملف حقيقي ===`);
  console.log(`  الملف: ${audioFile}`);
  console.log(`  الحجم: ${(file.length / 1024).toFixed(1)} KB`);
  console.log(`  الامتداد: .${ext} → MIME: ${mime}`);
  console.log("");

    (async () => {
    for (const model of APP_MODELS) {
      const started = Date.now();
      try {
        // نفس المنطق في hfAsrService.ts: إرسال ArrayBuffer مباشرةً
        const buf = Buffer.from(file);
        const r = await fetch(`${APP_BASE}/${model}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": mime,
          },
          // إرسال Buffer مباشرة (يعادل ArrayBuffer في Node 18+)
          body: buf,
          signal: AbortSignal.timeout(60000),
        });
        const ms = Date.now() - started;
        const body = await r.text();
        console.log(`  ${r.ok ? "✅" : "❌"} [${r.status}] ${ms}ms  ${model}`);
        console.log(`  الرد: ${body.slice(0, 500)}`);
        console.log("");
      } catch (e) {
        const ms = Date.now() - started;
        console.log(`  ❌ [${ms}ms] ${model}: ${e.message}`);
        console.log("");
      }
    }
    console.log("\n✓ انتهى الاختبار.\n");
  })().catch(e => console.error("خطأ فادح:", e));
} else {
    // --- اختبار بملف صوتي يحتوي على محتوى (نبضة صوتية بدلاً من صمت) ---
  console.log("لم يتم تمرير ملف — سيتم الاختبار بـ WAV يحتوي على نبضة صوتية.\n");

  function toneWav(seconds = 3, rate = 16000) {
    const n = Math.floor(seconds * rate);
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      // نبضة صوتية عند 440 Hz لمدة 3 ثوانٍ
      const t = i / rate;
      const sample = Math.sin(2 * Math.PI * 440 * t) * 0.5;
      data.writeInt16LE(Math.floor(sample * 32767), i * 2);
    }
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

  const wav = toneWav(3, 16000);
  console.log(`=== اختبار WAV بنبضة صوتية (${(wav.length / 1024).toFixed(1)} KB، 3s، 440Hz) ===`);
  console.log("");

    (async () => {
    for (const model of APP_MODELS) {
      const started = Date.now();
      try {
        const r = await fetch(`${APP_BASE}/${model}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" },
          body: wav,
          signal: AbortSignal.timeout(60000),
        });
        const ms = Date.now() - started;
        const body = await r.text();
        console.log(`  ${r.ok ? "✅" : "❌"} [${r.status}] ${ms}ms  ${model}`);
        console.log(`  الرد: ${body.slice(0, 300)}`);
        console.log("");
      } catch (e) {
        const ms = Date.now() - started;
        console.log(`  ❌ [${ms}ms] ${model}: ${e.message}`);
        console.log("");
      }
    }
    console.log("\n✓ انتهى الاختبار.\n");
  })().catch(e => console.error("خطأ فادح:", e));
}
