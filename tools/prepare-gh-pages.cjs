/**
 * يهيّئ مجلد dist للنشر على GitHub Pages:
 *  1) 404.html — GitHub Pages لا يدعم توجيه SPA؛ أي مسار غير موجود (مثل
 *     /recitation?surah=86) يُعيد 404. بنسخ index.html إليه يعمل التوجيه
 *     في الجهة العميلة ويعرض الصفحة الصحيحة.
 *  2) .nojekyll — يُمنع Jekyll من معالجة الملفات التي تبدأ بشرطة سفلية
 *     (مثل _next أو assets ذات أسماء خاصة) وتُحذف من الموقع.
 */
const fs = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "..", "dist");

if (!fs.existsSync(DIST)) {
  console.error("مجلد dist غير موجود — شغّل npm run build أولاً");
  process.exit(1);
}

const indexPath = path.join(DIST, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error("dist/index.html غير موجود — البناء لم يكتمل");
  process.exit(1);
}

fs.copyFileSync(indexPath, path.join(DIST, "404.html"));
console.log("✔ نسخ index.html → 404.html (توجيه SPA)");

fs.writeFileSync(path.join(DIST, ".nojekyll"), "");
console.log("✔ إنشاء .nojekyll (تعطيل Jekyll)");