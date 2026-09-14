#!/usr/bin/env node
/**
 * tools/check-page-order.cjs
 * ────────────────────────────
 * سكربت احتياطي (Node.js / CommonJS) لإدارة ترتيب صفحات المصحف المخزّن على
 * جدول `store` في Supabase — مفتاحه `mushaf:pageOrder:v1` (مصفوفة src[]).
 *
 * يستخدم مفتاح Service Role من .env (VITE_SUPABASE_SECRET_KEY) للوثوق كمدير.
 *
 * الاستخدام:
 *   node tools/check-page-order.cjs status                 # عرض الترتيب الموجود على السيرفر
 *   node tools/check-page-order.cjs save   <order.txt>    # حفظ ترتيب من ملف نصّي (سطر/صفحة)
 *   node tools/check-page-order.cjs restore <order.txt>   # استعادة ترتيب من ملف وإرساله للسيرفر
 *   node tools/check-page-order.cjs set    <src1,src2,...> # حفظ ترتيب مباشر من سطر الأوامر
 *   node tools/check-page-order.cjs clear                 # مسح الترتيب على السيرفر (عودة للأصل)
 *   node tools/check-page-order.cjs help                  # عرض المساعدة
 *
 * ملف الترتيب: نص عادي — كل سطر هو src لصفحة (مثال: /pages/600.jpg) بالترتيب الطلبي.
 */
"use strict";

const fs = require("fs");
const path = require("path");

// ───── تحميل المتغيّرات البيئية من .env ─────
const envPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SECRET = process.env.VITE_SUPABASE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY;
const ORDER_KEY = "mushaf:pageOrder:v1";
const BACKUP_KEY = "mushaf:pageOrderBackup:v1";

function assertConfig() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
  if (!SUPABASE_SECRET) missing.push("VITE_SUPABASE_SECRET_KEY");
  if (missing.length) {
    console.error("❌ متغيّرات البيئة اللازمة غير موجودة:");
    missing.forEach(v => console.error("   - " + v));
    process.exit(1);
  }
}

function createClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
    global: { headers: { "X-Client-Info": "check-page-order.cjs" } },
  });
}

function readOrderFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ الملف غير موجود: ${filePath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
}

function writeOrderToFile(filePath, order) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, order.join("\n") + "\n", "utf8");
}

function printHelp() {
  console.log(`
استخدام: node tools/check-page-order.cjs <أمر> [معامّل]

الأوامر:
  status                    عرض الترتيب الموجود على السيرفر
  save   <ملف.txt>          حفظ ترتيب من ملف نصّي إلى السيرفر
  restore <ملف.txt>         استعادة ترتيب من ملف وإرساله للسيرفر
  set    <src1,src2,...>    حفظ ترتيب مباشرة من سطر الأوامر
  clear                     مسح الترتيب على السيرفر
  help                      عرض هذه الرسالة

ملف الترتيب: نص عادي — كل سطر src لصفحة (مثال: /pages/600.jpg) بالترتيب الطلبية.
`);
}


// ───── جلب الترتيب الحالي من السيرفر ─────
async function getOrder() {
  const sb = createClient();
  const { data } = await sb.from("store").select("value").eq("key", ORDER_KEY).maybeSingle();
  return data && Array.isArray(data.value) ? data.value : [];
}

// ───── حفظ ترتيب جديد على السيرفر ─────
async function putOrder(order) {
  const sb = createClient();
  // أولاً: احتفظ بنسخة احتياطية من الترتيب الحالي
  const prev = await getOrder();
  if (prev.length) {
    await sb.from("store").upsert({ key: BACKUP_KEY, value: prev });
  }
  // الآن احفظ الترتيب الجديد
  const { error } = await sb.from("store").upsert({ key: ORDER_KEY, value: order });
  if (error) {
    console.error("❌ فشل الحفظ على السيرفر:", error.message);
    return false;
  }
  return true;
}

// ───── أوامر ─────
async function cmdStatus() {
  const order = await getOrder();
  if (!order.length) {
    console.log("ℹ️  لا يوجد ترتيب محفوظ على السيرفر (سيُستخدم الترتيب الافتراضي).");
    return;
  }
  console.log(`✅ ترتيب السيرفر (${order.length} صفحة):`);
  order.forEach((src, i) => console.log(`  ${(i + 1).toString().padStart(3, " ")}. ${src}`));
}

async function cmdSave(filePath) {
  const order = readOrderFromFile(filePath);
  console.log(`📄 قراءة ${order.length} صفحة من ${filePath} ...`);
  const ok = await putOrder(order);
  if (ok) console.log(`✅ تم حفظ ${order.length} صفحة على السيرفر (store:${ORDER_KEY}).`);
}

async function cmdRestore(filePath) {
  await cmdSave(filePath);
}

async function cmdSet(csv) {
  const order = csv.split(",").map(s => s.trim()).filter(Boolean);
  if (!order.length) {
    console.error("❌ قائمة فارغة.");
    process.exit(1);
  }
  console.log(`📝 حفظ ${order.length} صفحة ...`);
  const ok = await putOrder(order);
  if (ok) console.log(`✅ تم حفظ الترتيب على السيرفر.`);
}

async function cmdClear() {
  const ok = await putOrder([]);
  if (ok) console.log("🧹 تم مسح الترتيب على السيرفر.");
}

// ───── نقطة الدخول ─────
const args = process.argv.slice(2);
const command = args[0] || "help";

(async () => {
  try {
    assertConfig();
    switch (command) {
      case "status": await cmdStatus(); break;
      case "save": if (!args[1]) { console.error("❌ استخدم: save <ملف.txt>"); process.exit(1); } await cmdSave(args[1]); break;
      case "restore": if (!args[1]) { console.error("❌ استخدم: restore <ملف.txt>"); process.exit(1); } await cmdRestore(args[1]); break;
      case "set": if (!args[1]) { console.error("❌ استخدم: set <src1,src2,...>"); process.exit(1); } await cmdSet(args[1]); break;
      case "clear": await cmdClear(); break;
      case "help":
      case "--help":
      case "-h": printHelp(); break;
      default: console.error(`❌ أمر غير معروف: ${command}`); printHelp(); process.exit(1); break;
    }
  } catch (err) {
    console.error("❌ خطأ غير متوقع:", err.message || err);
    process.exit(1);
  }
})();
