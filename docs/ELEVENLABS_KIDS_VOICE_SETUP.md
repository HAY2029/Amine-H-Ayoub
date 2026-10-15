# 🎙️ إعداد صوت شخصيات الأطفال (عمران / راضية) — ElevenLabs

> ⚠️ **المفتاح لا يوضع أبدًا في الواجهة ولا في GitHub.** مكانه الوحيد: أسرار Supabase.

---

## 1) ما الذي يجب أن أضعه؟
ثلاثة أسرار فقط (واحد منها اختياري):

| السرّ | ماذا أضع فيه | إلزامي؟ |
|---|---|---|
| `sk_db6c23ce16381185b58a9681a32f83c4988a80839a35ffc4` | مفتاح ElevenLabs (`sk_...`) | ✅ نعم |
| `ELEVENLABS_IMRAN_VOICE_ID` | معرّف صوت عمران من ElevenLabs | ✅ نعم |
| `ELEVENLABS_RADIA_VOICE_ID` | معرّف صوت راضية من ElevenLabs | ✅ نعم |
| `ELEVENLABS_MODEL_ID` | اسم الموديل (افتراضيًا `eleven_multilingual_v2`) | ❌ لا |

---

## 2) أين أضعها؟ (بالضبط)

### الطريقة أ — عبر Supabase CLI (الأسرع)

من جذر المشروع في الطرفية:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>

supabase secrets set ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxx
supabase secrets set ELEVENLABS_IMRAN_VOICE_ID=<voice-id-عمران>
supabase secrets set ELEVENLABS_RADIA_VOICE_ID=<voice-id-راضية>
```

### الطريقة ب — عبر لوحة Supabase (بدون CLI)

1. افتح: **Supabase Dashboard → مشروعك → Edge Functions → Secrets**
2. اضغط **Add new secret** وأضف الثلاثة (نفس الأسماء أعلاه).

---

## 3) أين أضعها في Supabase؟
**لوحة Supabase → Edge Functions → Manage secrets** (أو أمر `supabase secrets set`).
هذه الأسرار تُقرأ داخل الدالة عبر `Deno.env.get("ELEVENLABS_API_KEY")` فقط — لا تُرسل للمتصفح.

---

## 4) نشر الدالة

```bash
supabase functions deploy kids-character-voice
```
أو من المشروع:
```bash
npm run deploy:edge
```

---

## 5) ما الذي **لا** يجب أن أضعه داخل GitHub؟

| ❌ لا تضع | لماذا |
|---|---|
| `ELEVENLABS_API_KEY` في أي ملف `.ts/.tsx` | يُحزَّم ويُقرأ من المتصفح |
| `VITE_ELEVENLABS_API_KEY` في `.env` | أي متغيّر يبدأ بـ `VITE_` يُكشف في الحزمة العامة |
| `xi-api-key` أو `api.elevenlabs.io` في React | يجب أن تمرّ كل الطلبات عبر الدالة |
| المفتاح في `localStorage` | يُقرأ بسهولة من المتصفح |
| المفتاح في `src/data/kidsCharacters.ts` | هذا للـ Voice IDs التوثيقية فقط، وليس للاتصال |

### أين يوضع `voiceId` في الكود؟
`src/data/kidsCharacters.ts` يحتوي **placeholders** للتوثيق فقط:
`YOUR_IMRAN_VOICE_ID` / `YOUR_RADIA_VOICE_ID`.
القيم الفعلية تُقرأ من أسرار Supabase داخل الدالة عبر `VOICE_ENV`.

---

## 6) كيف أتحقق أنه يعمل؟

```bash
# اختبار مباشر للدالة
curl -i -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/kids-character-voice" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"characterId":"imran","text":"مرحباً يا صديقي"}'
```

النتائج المتوقّعة:

| الاستجابة | المعنى |
|---|---|
| `{ "audioBase64": "...", "contentType": "audio/mpeg" }` | ✅ يعمل |
| `{ "error": "خدمة الصوت غير مُعدّة على الخادم" }` | ❌ `ELEVENLABS_API_KEY` غير مضبوط |
| `{ "error": "معرّف صوت الشخصية غير مُعدّ" }` | ❌ Voice ID غير مضبوط أو ما زال `YOUR_...` |
| `{ "error": "شخصية غير معروفة" }` | ❌ `characterId` ليس `imran`/`radia` |

---

## 7) ملاحظات أمنية في هذا المشروع (مهم)

- ملف `.env` غير مُتتبّع في git ✅
- الواجهة (`src/`) تقرأ فقط `VITE_SUPABASE_URL` و `VITE_SUPABASE_PUBLISHABLE_KEY`.
- ملف `.env` يحتوي `VITE_SUPABASE_SECRET_KEY` (Service Role) — **لا يُقرأ في الواجهة** حاليًا،
  لكن الاسم يبدأ بـ `VITE_` وهو خطر مستقبلي. الأفضل إعادة تسميته إلى `SUPABASE_SECRET_KEY`
  (بدون `VITE_`) لأن السكربتات في `tools/` تقرأ الاسمين معًا.