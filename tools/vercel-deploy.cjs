/**
 * نشر مباشر إلى Vercel عبر REST API (بلا CLI بطيء).
 * الاستخدام:  node tools/vercel-deploy.cjs
 *
 * لماذا API لا CLI؟ CLI يحتاج تثبيتاً تفاعلياً ووقتاً طويلاً في بعض البيئات،
 * بينما API يرفع الملفات ويطلق النشر ثم ينتظر انتهاءه ويطبع الرابط.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const TEAM_ID = "team_jwIZ6kCh3j8qPmz6QVh0p7Wn";
const PROJECT = "learn-quran-kids-1";
const API = "https://api.vercel.com";

function readToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const p = path.join(os.homedir(), "AppData", "Roaming", "com.vercel.cli", "Data", "auth.json");
  const alt = path.join(process.env.APPDATA || "", "com.vercel.cli", "Data", "auth.json");
  const file = fs.existsSync(p) ? p : alt;
  if (!fs.existsSync(file)) throw new Error("لم نجد توكن Vercel — شغّل: npx vercel login");
  return JSON.parse(fs.readFileSync(file, "utf8")).token;
}

const TOKEN = readToken();
const H = { Authorization: `Bearer ${TOKEN}` };

/** يمرّ على dist ويجمع الملفات مع sha1 (الذي يطلبه Vercel للرفع التفاضلي) */
async function collectFiles(dir, base = "") {
  const crypto = require("crypto");
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectFiles(full, rel)));
    } else {
      const buf = fs.readFileSync(full);
      out.push({
        file: rel,
        sha: crypto.createHash("sha1").update(buf).digest("hex"),
        size: buf.length,
        data: buf,
      });
    }
  }
  return out;
}

/** أنماط تُستثنى من النشر — غير مستخدمة في الموقع (تُوزَّع عبر GitHub Releases).
 *  ملاحظة: /pages/ تُستخدم محلياً في MushafPage (12MB فقط) — لا تُستثنى. */
const EXCLUDE = [
  /(^|\/)downloads\//, // حزم MSI/EXE الضخمة (65MB+) — الروابط تشير إلى GitHub Releases
  /google-play-assets.*\.zip$/,
];

async function main() {
  if (!fs.existsSync(DIST)) {
    console.error("مجلد dist غير موجود — شغّل: npm run build");
    process.exit(1);
  }

  console.log("== 1/4 جمع ملفات dist ==");
  const all = await collectFiles(DIST);
  const excluded = all.filter((f) => EXCLUDE.some((re) => re.test(f.file)));
  const files = all.filter((f) => !EXCLUDE.some((re) => re.test(f.file)));
  const excludedMB = (excluded.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1);
  const totalMB = (files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(2);
  console.log(`   ${files.length} ملفاً (${totalMB} ميجابايت)`);
  if (excluded.length) {
    console.log(`   ↷ استُثني ${excluded.length} ملفاً ضخماً غير مستخدم (${excludedMB}MB)`);
  }

  console.log("== 2/4 رفع الملفات الناقصة ==");
  // Vercel: الرفع الفردي عبر POST /v2/files مع x-vercel-digest فقط،
  // وبلا قائمة — قائمة الملفات تُمرَّر في طلب النشر نفسه.
  const uploadOne = async (f) => {
    const r = await fetch(`${API}/v2/files`, {
      method: "POST",
      headers: {
        ...H,
        "Content-Type": "application/octet-stream",
        "x-vercel-digest": f.sha,
        "x-now-digest": f.sha,
        "x-vercel-size": String(f.size),
      },
      body: f.data,
      signal: AbortSignal.timeout(60000), // مهلة 60 ثانية — يمنع التعليق
    });
    return r.status;
  };

  // نجرب الرفع التفاضلي أولاً: نطلب ما ينقصنا
  let toUpload = files;
  try {
    const upRes = await fetch(`${API}/v2/files?teamId=${TEAM_ID}`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify(files.map((f) => ({ file: f.file, sha: f.sha, size: f.size }))),
    });
    if (upRes.ok) {
      const j = await upRes.json();
      // الملفات الموجودة مسبقاً لا تُرجَع في الاستجابة — الناقصة فقط
      const neededShas = new Set((j.files || []).map((n) => n.sha));
      toUpload = files.filter((f) => neededShas.has(f.sha));
      console.log(`   المُخزَّن سابقاً: ${files.length - toUpload.length} — الناقص: ${toUpload.length}`);
    }
  } catch {
    // نتجاهل ونرفع الكل
  }

  console.log(`   المطلوب رفعه: ${toUpload.length} من ${files.length}`);
  let done = 0;
  let failed = 0;
  const failures = [];
  // رفع متوازٍ (6 عمليات) مع مهلة 60 ثانية لكل ملف — يمنع التعليق
  const CONCURRENCY = 6;
  const queue = [...toUpload];
  async function worker() {
    while (queue.length > 0) {
      const f = queue.shift();
      if (!f) break;
      let status = 0;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          status = await uploadOne(f);
          if (status === 200 || status === 201 || status === 409) break;
          if (status >= 400 && status < 500) break; // خطأ دائم — لا فائدة من الإعادة
        } catch (e) {
          status = -1;
          if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      }
      const ok = status === 200 || status === 201 || status === 409;
      if (!ok) {
        failed++;
        failures.push(`${f.file} (${(f.size / 1048576).toFixed(1)}MB, status=${status})`);
      }
      done++;
      if (done % 10 === 0 || done === toUpload.length) {
        console.log(`   رُفع ${done}/${toUpload.length}  (فشل: ${failed})`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  if (failed > 0) {
    console.error("\n✗ فشل رفع ملفات — أوقفنا النشر:");
    failures.slice(0, 10).forEach((x) => console.error("   " + x));
    process.exit(1);
  }

  console.log("== 3/4 إطلاق النشر ==");
  const deployRes = await fetch(`${API}/v13/deployments?teamId=${TEAM_ID}&forceNew=1`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: PROJECT,
      project: PROJECT,
      target: "production",
      files: files.map((f) => ({ file: f.file, sha: f.sha, size: f.size })),
      // نرفع dist المبنيّ محلياً — لا حاجة لبناء على الخادم
      // (npm install يفشل على الخادم برمز 254)
      projectSettings: {
        framework: null,
        buildCommand: null,
        outputDirectory: null,
        installCommand: null,
        rootDirectory: null,
      },
    }),
  });
  if (!deployRes.ok) {
    console.error("فشل إطلاق النشر:", deployRes.status, await deployRes.text());
    process.exit(1);
  }
  const dep = await deployRes.json();
  console.log(`   id=${dep.id}  url=https://${dep.url}`);

  console.log("== 4/4 انتظار اكتمال البناء ==");
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await fetch(`${API}/v13/deployments/${dep.id}?teamId=${TEAM_ID}`, { headers: H });
    const j = await s.json();
    const ready = j.readyState;
    process.stdout.write(`\r   الحالة: ${ready}            `);
    if (ready === "READY") {
      console.log("\n\n✅ تمّ النشر بنجاح");
      console.log(`   الرابط: https://${j.url}`);
      const aliases = (j.alias || []).map((a) => `https://${a}`);
      if (aliases.length) console.log(`   الروابط: ${aliases.join("  ,  ")}`);
      return;
    }
    if (ready === "ERROR" || ready === "CANCELED") {
      console.error(`\n✗ فشل النشر (${ready})`);
      process.exit(1);
    }
  }
  console.error("\nانتهت مدة الانتظار دون اكتمال");
  process.exit(1);
}

main().catch((e) => {
  console.error("خطأ:", e.message);
  process.exit(1);
});