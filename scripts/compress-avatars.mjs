/**
 * ضغط صور الأفاتار لتقليل حجم التطبيق.
 *
 * الفكرة: صور الأفاتار في public/avatars تصل لأكثر من 2 MB للصورة الواحدة (حجم إجمالي ~48 MB)،
 * بينما تُعرض دائماً في دوائر صغيرة داخل التطبيق. لذلك نُصغّرها إلى 512×512 ونضغطها JPEG بجودة 82
 * فينزل الحجم الإجمالي إلى ما دون 2 MB مع الحفاظ على جودة العرض (الشهادة تستخدم 240×240 فقط).
 *
 * الاستخدام:
 *   node scripts/compress-avatars.mjs            # إنشاء الملفات المضغوطة بجانب الأصلية (‎.opt.jpg)
 *   node scripts/compress-avatars.mjs --dry-run  # معاينة النتائج دون كتابة أي ملف
 *   node scripts/compress-avatars.mjs --in-place # استبدال الأصلية (يحتفظ بنسخة داخل public/avatars/_originals)
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const { Jimp } = await import('jimp');

const AVATARS_DIR = path.resolve('public/avatars');
const ORIGINALS_DIR = path.join(AVATARS_DIR, '_originals');

/** الحد الأقصى للبُعد الأكبر للصورة المضغوطة (يكفي للشهادة والعرض الدائري) */
const MAX_SIZE = 512;
/** جودة JPEG المضغوطة */
const QUALITY = 82;

const dryRun = process.argv.includes('--dry-run');
const inPlace = process.argv.includes('--in-place');

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

if (!existsSync(AVATARS_DIR)) {
  console.error(`❌ لم يُعثر على مجلد الأفاتار: ${AVATARS_DIR}`);
  process.exit(1);
}

const { readdir } = await import('node:fs/promises');
const all = await readdir(AVATARS_DIR, { withFileTypes: true });
const inputs = all
  .filter((e) => e.isFile() && /\.(png|jpe?g|bmp|tiff)$/i.test(e.name))
  .map((e) => e.name);

if (inputs.length === 0) {
  console.log('ℹ️ لا توجد صور للضغط.');
  process.exit(0);
}

if (inPlace && !dryRun) {
  await mkdir(ORIGINALS_DIR, { recursive: true });
}

let totalBefore = 0;
let totalAfter = 0;
let converted = 0;
let skipped = 0;

console.log(
  `${dryRun ? '🔍 معاينة' : '⚙️  ضغط'} ${inputs.length} صورة — أقصى بُعد ${MAX_SIZE}px، جودة ${QUALITY}` +
    (inPlace && !dryRun ? ' (استبدال الأصلية)' : ''),
);
console.log('─'.repeat(78));

for (const name of inputs) {
  const srcPath = path.join(AVATARS_DIR, name);
  const before = (await stat(srcPath)).size;
  totalBefore += before;

  // اسم الملف مضغوطاً بـ .jpg دائماً (لأننا نزدلفها JPEG)
  const baseName = name.replace(/\.(png|jpe?g|bmp|tiff)$/i, '');
  const optName = `${baseName}.opt.jpg`;
  const optPath = path.join(AVATARS_DIR, optName);
  const finalPath = inPlace ? path.join(AVATARS_DIR, `${baseName}.jpg`) : optPath;

  try {
    const buffer = await readFile(srcPath);
    const image = await Jimp.read(buffer);

    // التصغير فقط إن كانت أكبر من الحد (لا نُكبّر أبداً)
    const longest = Math.max(image.bitmap.width, image.bitmap.height);
    if (longest > MAX_SIZE) {
      image.scaleToFit({ w: MAX_SIZE, h: MAX_SIZE });
    }

    const out = await image.getBuffer('image/jpeg', { quality: QUALITY });

    totalAfter += out.length;
    converted += 1;

    const ratio = Math.round((1 - out.length / before) * 100);
    console.log(
      `${name.padEnd(34)} ${kb(before).padStart(9)} → ${path.basename(finalPath).padEnd(30)} ${kb(out.length).padStart(8)}  (−${ratio}%)`,
    );

    if (!dryRun) {
      if (inPlace) {
        // احتفظ بالأصل قبل الاستبدال (مرة واحدة فقط)
        const backupPath = path.join(ORIGINALS_DIR, name);
        if (!existsSync(backupPath)) {
          await writeFile(backupPath, buffer);
        }
        await writeFile(finalPath, out);
      } else {
        await writeFile(optPath, out);
      }
    }
  } catch (err) {
    skipped += 1;
    totalAfter += before;
    console.warn(`⚠️  تخطّي ${name}: ${err.message}`);
  }
}

console.log('─'.repeat(78));
console.log(`الصور المضغوطة : ${converted}`);
if (skipped) console.log(`تم تخطّيها     : ${skipped}`);
console.log(`قبل            : ${mb(totalBefore)}`);
console.log(`بعد            : ${mb(totalAfter)}`);
const savedPct = totalBefore ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;
console.log(`التوفير        : ${mb(totalBefore - totalAfter)}  (−${savedPct}%)`);

if (dryRun) {
  console.log('\nℹ️ هذه معاينة فقط — لم يُكتب أي ملف. شغّل بدون --dry-run للتنفيذ.');
} else if (!inPlace) {
  console.log(`\n✅ تم إنشاء ${converted} ملفاً بامتداد .opt.jpg`);
  console.log('   راجع النتائج ثم شغّل: node scripts/compress-avatars.mjs --in-place');
} else {
  console.log(`\n✅ تم استبدال الصور. النسخ الأصلية محفوظة في public/avatars/_originals`);
}
