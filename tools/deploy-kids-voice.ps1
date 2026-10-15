# نشر دالة صوت شخصيات الأطفال (عمران / راضية) على Supabase
#
# 🔒 الأمان: مفتاح ElevenLabs ومعرّفات الأصوات تُخزَّن كأسرار في Supabase فقط،
#    فلا تظهر أبداً في المتصفح ولا في GitHub.
#
# متطلبات (مرة واحدة):
#   npx supabase login
#
# الاستعمال:
#   .\tools\deploy-kids-voice.ps1 -ElevenLabsKey "sk_xxx" -ImranVoiceId "pNInz..." -RadiaVoiceId "pNInz..."
#
param(
  [Parameter(Mandatory = $false)]
  [string]$ElevenLabsKey = "",

  [Parameter(Mandatory = $false)]
  [string]$ImranVoiceId = "",

  [Parameter(Mandatory = $false)]
  [string]$RadiaVoiceId = "",

  [Parameter(Mandatory = $false)]
  [string]$ProjectRef = "ktfxeccahsfsuhwdjjjn"
)

Write-Host "== 1/3 التحقق من تسجيل الدخول ==" -ForegroundColor Cyan
npx supabase projects list | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "فشل: لم تسجّل الدخول. نفّذ أولاً:  npx supabase login" -ForegroundColor Red
  exit 1
}
Write-Host "   تم تسجيل الدخول بنجاح" -ForegroundColor Green

Write-Host "== 2/3 ضبط الأسرار ==" -ForegroundColor Cyan
if ($ElevenLabsKey) {
  npx supabase secrets set "ELEVENLABS_API_KEY=$ElevenLabsKey" --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { Write-Host "فشل ضبط مفتاح ElevenLabs" -ForegroundColor Red; exit 1 }
  Write-Host "   ELEVENLABS_API_KEY OK" -ForegroundColor Green
} else {
  Write-Host "   تخطّي مفتاح ElevenLabs (سيُستخدم المضبوط مسبقاً)" -ForegroundColor Yellow
}

if ($ImranVoiceId) {
  npx supabase secrets set "ELEVENLABS_IMRAN_VOICE_ID=$ImranVoiceId" --project-ref $ProjectRef
  Write-Host "   ELEVENLABS_IMRAN_VOICE_ID OK" -ForegroundColor Green
} else {
  Write-Host "   تحذير: لا يوجد Voice ID لعمران — سيبقى على النطق المحلي" -ForegroundColor Yellow
}

if ($RadiaVoiceId) {
  npx supabase secrets set "ELEVENLABS_RADIA_VOICE_ID=$RadiaVoiceId" --project-ref $ProjectRef
  Write-Host "   ELEVENLABS_RADIA_VOICE_ID OK" -ForegroundColor Green
} else {
  Write-Host "   تحذير: لا يوجد Voice ID لراضية — سيبقى على النطق المحلي" -ForegroundColor Yellow
}

Write-Host "== 3/3 نشر دالة kids-character-voice ==" -ForegroundColor Cyan
npx supabase functions deploy kids-character-voice --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) {
  Write-Host "فشل النشر" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "تم النشر بنجاح!" -ForegroundColor Green
Write-Host "اختبر الآن مباشرة من المتصفح:" -ForegroundColor Cyan
Write-Host "  https://$ProjectRef.supabase.co/functions/v1/kids-character-voice"
Write-Host ""
Write-Host "أو بالأمر:" -ForegroundColor Cyan
Write-Host "  curl -X POST `"https://$ProjectRef.supabase.co/functions/v1/kids-character-voice`" -H `"Content-Type: application/json`" -d '{`"characterId`":`"imran`",`"text`":`"مرحبا`"}'"
Write-Host ""
Write-Host "ردcontaining audioBase64 يعني أن ElevenLabs يعمل" -ForegroundColor Green