# نشر وسيط تحليل التلاوة على Supabase
#
# يُخزّن مفتاح HuggingFace في أسرار الخادم — فلا يظهر أبداً في المتصفح.
#
# متطلبات (مرة واحدة):
#   npm i -g supabase          # أو استخدم npx supabase
#   supabase login
#   supabase link --project-ref ktfxeccahsfsuhwdjjjn

param(
  [Parameter(Mandatory = $false)]
  [string]$HfToken = ""
)

Write-Host "== 1/3 تعيين سرّ HF_TOKEN على الخادم ==" -ForegroundColor Cyan
if ($HfToken) {
  supabase secrets set HF_TOKEN=$HfToken
  if ($LASTEXITCODE -ne 0) { Write-Host "فشل تعيين السرّ" -ForegroundColor Red; exit 1 }
} else {
  Write-Host "   لم يُمرَّر مفتاح — سنفترض أن السرّ مضبوط مسبقاً." -ForegroundColor Yellow
  Write-Host "   لتعيينه: .\tools\deploy-edge-function.ps1 -HfToken hf_xxx" -ForegroundColor Yellow
}

Write-Host "== 2/3 نشر الدالة transcribe-audio ==" -ForegroundColor Cyan
supabase functions deploy transcribe-audio --no-verify-jwt
if ($LASTEXITCODE -ne 0) { Write-Host "فشل نشر الدالة" -ForegroundColor Red; exit 1 }

Write-Host "== 3/3 التحقق من الأسرار ==" -ForegroundColor Cyan
supabase secrets list

Write-Host "تمّ النشر — الوسيط جاهز على: <SUPABASE_URL>/functions/v1/transcribe-audio" -ForegroundColor Green