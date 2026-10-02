# تقليل حجم التطبيق — ضغط صور الأفاتار

## المشكلة

كانت صور الشخصيات في `public/avatars` تُرفع بحجم **48.46 MB** لـ 28 صورة فقط
(بين 2.1 MB و 2.3 MB للصورة الواحدة، بصيغة PNG بدقة عالية جداً)،
بينما تُعرض في التطبيق داخل دوائر بحجم **32px – 160px** فقط،
وفي الشهادة داخل دائرة بنصف قطر **82px** (أي 164×164 بكسل فعلياً).

## الحل

سكربت `scripts/compress-avatars.mjs` يعيد ترميز الصور بـ:
- **أقصى بُعد: 512px** (`scaleToFit` — لا يُكبّر أبداً)
- **صيغة JPEG بجودة 82**

النتيجة: **48.46 MB → 1.76 MB** (توفير **46.7 MB**، أي **96%**)
مع الحفاظ على وضوح كامل عند مقاسات العرض الفعلية.

## الاستخدام

```bash
node scripts/compress-avatars.mjs --dry-run   # معاينة دون كتابة أي ملف
node scripts/compress-avatars.mjs             # إنشاء ملفات .opt.jpg بجانب الأصلية
node scripts/compress-avatars.mjs --in-place  # استبدال الأصلية (نسخة احتياطية في _originals)
```

> تم تنفيذ `--in-place` بالفعل. النسخ الأصلية محفوظة في `public/avatars/_originals/`
> (مستثنى في `.gitignore` — احذفه قبل البناء لتوفير ~50 MB إضافية في `dist`).

## ما تغيّر في الكود

| الملف | التغيير |
|---|---|
| `src/components/Avatar.tsx` | `getAvatarSrc()` يعيد الآن مسار `.jpg` مضغوطاً (مع `encodeURI`)، و`toCompressed()` يحوّل امتداد أي مسار (PNG → JPG) |
| `src/utils/certificateGenerator.ts` | يحمّل صورة الأفاتار بامتداد `.jpg` أولاً ثم `.png` كاحتياط |
| `src/components/BadgesModal.tsx` | يمرّر اسم ملف صحيح مشتقاً من `getAvatarSrc` بدل `boy1` غير الموجود |
| `.gitignore` | استثناء `public/avatars/_originals/` و `public/avatars/*.opt.jpg` |

## إصلاح مصاحب: روابط صور مكسورة

خريطة `AVATAR_IMAGE_PATHS` في `src/components/Avatar.tsx` كانت تشير إلى **18 اسم ملف غير موجود**
مثل `img-boy-bisht-white.jpg` و `img-girl-gold.jpg` وأسماء PNG طويلة تحتوي مسافات وحروف عربية.
النتيجة كانت فشل تحميل الصورة وسقوطها على رسم SVG بديل بسيط
(وهو ما قد يُفسَّر كـ«لا يعرض الصور»). تمت إعادة توجيه كل الأسماء إلى الملفات الـ28 الموجودة فعلاً،
وتم التحقق برمجياً أن **كل** قيمة في الخريطة تشير إلى ملف موجود.

## ملفات كبيرة أخرى (للمرحلة القادمة — لم تُلمس بعد)

| الملف | الحجم | ملاحظة |
|---|---|---|
| `public/google-play-assets-framed.zip` | 6.09 MB | ملف ZIP لا يجب أن يكون داخل الحزمة |
| `public/google-play-assets.zip` | 2.86 MB | ملف ZIP لا يجب أن يكون داخل الحزمة |
| `public/sample-*.png`، `public/*-kids-framed.png` | 2.1–3.3 MB × 8 | صور معاينة |
| `public/surah-frames/surah-001-الفاتحة.png` | 2.19 MB | إطار سورة واحد |
| `public/pages/*.jpg` | ~12 MB (21 ملفاً) | صفحات مصحف محلية |

هذه الملفات (خصوصاً ملفات ZIP) مرشّح مباشر لتوفير **~29 MB** إضافية من `dist`.
