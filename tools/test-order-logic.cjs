#!/usr/bin/env node
/**
 * tools/test-order-logic.cjs
 * اختبار منطق ترتيب/تصفية صفحات المصحف في src/data/customPages.ts
 * (isBogusSrc + sortPageSrcs + sanitizePageOrder + pageNumForKey + auditPageOrder)
 *
 * يُحمّل الدوال الحقيقية من الملف عبر esbuild (نفس محوّل TS المستخدم في Vite)،
 * فلا حاجة لتكرار المنطق ولا لكتابة regex هشّة.
 *
 * الاستخدام:  node tools/test-order-logic.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const srcPath = path.resolve(__dirname, "..", "src", "data", "customPages.ts");
const src = fs.readFileSync(srcPath, "utf8");
const tsc = esbuild.transformSync(src, { loader: "ts", format: "cjs" }).code;
// مُحمّل وهمي: دوال customPages تعتمد على supabase فقط عند الحفظ/المزامنة،
// ولا تحتاجها دوال التنظيف/الترتيب المُختبَرة هنا — فنُعيد بدائل صامتة.
const stubRequire = (id) => {
  if (id.includes("supabase")) {
    return { supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), upsert: () => ({ then: () => {} }) }) }, hasValidSupabaseKey: () => false };
  }
  if (id.includes("surahRegions")) {
    return { getPageSurahRegions: () => [] };
  }
  return require(id);
};
const tmod = { exports: {} };
new Function("module", "exports", "require", tsc)(tmod, tmod.exports, stubRequire);
const {
  isBogusSrc,
  sortPageSrcs,
  sanitizePageOrder,
  pageNumForKey,
  auditPageOrder,
} = tmod.exports;

let pass = 0, fail = 0;
const t = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + "\n        got  " + a + "\n        want " + e); }
};

console.log("=== isBogusSrc: حالة الصفحة \"0\" (السلوك الحالي: مقبولة) ===");
// ملاحظة: أُزيل اعتبار صفحة "0" خاطئة بطلب المستخدم، فأصبحت isBogusSrc ترجع false دائماً.
// نُبقي هذه التأكيدات ليكشف الاختبار فوراً لو تغيّر السلوك بلا قصد.
t("'/pages/0.jpg' ليست خاطئة (مقصود)", isBogusSrc("/pages/0.jpg"), false);
t("'/pages/000.jpg' ليست خاطئة", isBogusSrc("/pages/000.jpg"), false);
t("'0.jpg' ليست خاطئة", isBogusSrc("0.jpg"), false);
t("'custom:0' ليست خاطئة", isBogusSrc("custom:0"), false);
t("'/pages/581.jpg' ليست خاطئة", isBogusSrc("/pages/581.jpg"), false);
t("'/pages/604.jpg' ليست خاطئة", isBogusSrc("/pages/604.jpg"), false);
t("'/pages/fatiha.jpg' ليست خاطئة", isBogusSrc("/pages/fatiha.jpg"), false);
t("'custom:1700000000000' ليست خاطئة", isBogusSrc("custom:1700000000000"), false);

console.log("\n=== sanitizePageOrder: الترتيب المُعتمد (0 → الفاتحة → الباقي بترتيب الإدخال) ===");
const raw = [
  "/pages/604.jpg", "/pages/0.jpg", "/pages/581.jpg", "/pages/fatiha.jpg",
  "/pages/585.jpg", "/pages/600.jpg", "custom:1700000000000", "/pages/581.jpg"
];
const cleaned = raw.filter(s => !isBogusSrc(s));
const out = sortPageSrcs([...new Set(cleaned)]);
console.log("  الناتج: " + JSON.stringify(out));
// الترتيب المُعتمد: صفحة 0 أولاً، ثم الفاتحة، ثم الباقي **بترتيب الإدخال** (يحفظ ترتيب المستخدم)،
// والمخصّص آخراً. لا نفرض ترتيباً رقمياً على قائمة يدوية — لذلك لا نتوقّع تصاعدياً هنا.
t("صفحة 0 أولاً", out[0], "/pages/0.jpg");
t("ثم الفاتحة", out[1], "/pages/fatiha.jpg");
t("الباقي بترتيب الإدخال (604 أول غير مُقدَّم)", out[2], "/pages/604.jpg");
t("الصفحة المخصصة في النهاية", out[out.length - 1], "custom:1700000000000");
t("لا تكرار", out.length, new Set(out).size);
// 7 عناصر: 0 + fatiha + 604 + 581 + 585 + 600 + custom (نسخة 581 المكرّرة مُستبعدة فقط)
t("العدد الكامل بعد التصفية", out.length, 7);

console.log("\n=== الترتيب الرقمي الصاعد يُطلَب صراحةً بـ numericSort ===");
const ascending = sanitizePageOrder(
  ["/pages/604.jpg", "/pages/600.jpg", "/pages/585.jpg", "/pages/581.jpg"],
  { numericSort: true }
);
t("581 → 585 → 600 → 604", ascending, ["/pages/581.jpg", "/pages/585.jpg", "/pages/600.jpg", "/pages/604.jpg"]);

console.log("\n=== محاكاة قائمة المصحف الفعلية (581..604) مرتبة رقمياً ===");
const real = [];
for (let n = 581; n <= 599; n++) if (n !== 599) real.push(`/pages/${n}.jpg`);
[600, 601, 602, 603, 604].forEach(n => real.push(`/pages/${n}.jpg`));
const shuffled = [...real].reverse();
const ordered = sanitizePageOrder(shuffled, { numericSort: true });
t("تبدأ بـ 581", ordered[0], "/pages/581.jpg");
t("تنتهي بـ 604", ordered[ordered.length - 1], "/pages/604.jpg");
const nums = ordered.map(s => parseInt(s.replace(/\D/g, ""), 10));
t("تصاعدي تماماً", nums.every((n, i) => i === 0 || n > nums[i - 1]), true);

console.log("\n=== sanitizePageOrder: توحيد + حذف المكرّر + الفاتحة أولاً ===");
// المفاتيح المكرّرة بصيغ مختلفة يجب أن تُدمج في مفتاح واحد
// ملاحظة: "0.jpg" لم تعد تُحذف (isBogusSrc مُعطَّلة بطلب المستخدم) — فقط الفارغة والمكرّرة.
const meshed = [
  "0.jpg",                    // يُوحّد إلى /pages/0.jpg ويُقبل
  "600.jpg",                  // يُوحّد إلى /pages/600.jpg
  "/pages/600.jpg",           // ← نفس الصفحة (مكرّر) → يُحذف
  "pages/581.jpg",            // يُوحّد إلى /pages/581.jpg
  "/pages/fatiha.jpg",
  "/pages/581.jpg",           // ← مكرّر
  "custom:1700000000000",
  "",                         // فارغة → تُحذف
];
const clean1 = sanitizePageOrder(meshed);
// الصحيح: 0 + الفاتحة + 600 + 581 + custom = 5 ("0.jpg" و"" كلاهما مقبول بسلبط، و600/581 مكرّرتان)
t("العدد بعد التنظيف (5)", clean1.length, 5);
t("صفحة 0 أولاً (قرار المستخدم)", clean1[0], "/pages/0.jpg");
t("ثم الفاتحة", clean1[1], "/pages/fatiha.jpg");
t("لا تكرار", clean1.length, new Set(clean1).size);
t("600 مُوحّدة", clean1.filter(s => /600/.test(s)).length, 1);
t("581 مُوحّدة", clean1.filter(s => /581/.test(s)).length, 1);
t("المخصّص موجود", clean1.includes("custom:1700000000000"), true);
t("الفارغة مُستبعدة", clean1.includes(""), false);

console.log("\n=== sanitizePageOrder(numericSort): 581 → 604 ===");
const clean2 = sanitizePageOrder(["/pages/604.jpg", "/pages/581.jpg", "/pages/585.jpg"], { numericSort: true });
t("581 ثم 585 ثم 604", clean2, ["/pages/581.jpg", "/pages/585.jpg", "/pages/604.jpg"]);

console.log("\n=== الحفاظ على الترتيب اليدوي (بلا numericSort) ===");
// الترتيب مُحتفَظ به ما دام لا يحتوي صفحة 0 ولا الفاتحة (فهما يُقدَّمان دائماً)
const manual = ["/pages/600.jpg", "/pages/581.jpg", "/pages/604.jpg"];
t("الترتيب اليدوي محفوظ", sanitizePageOrder(manual), manual);
t("الفاتحة تُقدَّم للأول", sanitizePageOrder(["/pages/600.jpg", "/pages/fatiha.jpg"]), ["/pages/fatiha.jpg", "/pages/600.jpg"]);
t("صفحة 0 تُقدَّم قبل الفاتحة", sanitizePageOrder(["/pages/fatiha.jpg", "/pages/0.jpg"]), ["/pages/0.jpg", "/pages/fatiha.jpg"]);

console.log("\n=== pageNumForKey ===");
t("fatiha = 1", pageNumForKey("/pages/fatiha.jpg"), 1);
t("581 = 581", pageNumForKey("/pages/581.jpg"), 581);
t("0 = 0 (أصغر رقم)", pageNumForKey("/pages/0.jpg"), 0);
t("مخصّص = النهاية", pageNumForKey("custom:1700000000000"), Number.MAX_SAFE_INTEGER);

console.log("\n=== auditPageOrder: تقرير التنظيف ===");
const audit = auditPageOrder(meshed);
t("المحتفظ به", audit.kept.length, 5);
t("المكرّرات مكتشَفة", audit.duplicates.length, 2);
t("الخاطئة مكتشَفة", audit.bogus.length, 1); // "" (الفارغة) فقط — "0.jpg" صارت مقبولة

console.log("\n=== النتيجة: " + pass + " نجح / " + fail + " فشل ===");
process.exitCode = fail > 0 ? 1 : 0;