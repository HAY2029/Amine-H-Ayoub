# نشر آمن — يتأكد أن أي مفتاح سرّي غير مُضمَّن في الحزمة قبل الرفع
#
# لماذا؟ أي متغير بادئته VITE_ في Vite يُدمج حرفياً في ملفات JS التي يحمّلها
# الزائر، فيستطيع أي شخص استخراجه (أدوات المتصفح → Network → JS).
# لذلك: أسرار الخادم في supabase secrets، لا في .env ببادئة VITE_.

Write-Host "== 1/4 فحص الأنواع ==" -ForegroundColor Cyan
npx tsc --noEmit -p tsconfig.app.json
if ($LASTEXITCODE -ne 0) { Write-Host "فشل فحص الأنواع — أوقفنا النشر" -ForegroundColor Red; exit 1 }

Write-Host "== 2/4 البناء ==" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "فشل البناء — أوقفنا النشر" -ForegroundColor Red; exit 1 }

Write-Host "== 3/4 فحص تسرّب الأسرار في dist ==" -ForegroundColor Cyan
# نبحث عن أنماط المفاتيح السرّية الفعلية (لا أسماء الأنواع)
$patterns = @('hf_[A-Za-z0-9]{30,}', 'sb_secret_[A-Za-z0-9_\-]{20,}', 'resend', 'sk-[A-Za-z0-9]{20,}')
$leaks = @()
foreach ($p in $patterns) {
  $found = Get-ChildItem dist -Recurse -Include *.js,*.html,*.css |
    Select-String -Pattern $p -List
  if ($found) { $leaks += $found }
}
if ($leaks.Count -gt 0) {
  Write-Host "!! وجدنا أسراراً محتملة في الحزمة — أوقفنا النشر:" -ForegroundColor Red
  $leaks | ForEach-Object { Write-Host ("   " + $_.Path + "  :: " + $_.Pattern) }
  exit 1
}
Write-Host "   نظيف — لا أسرار في dist" -ForegroundColor Green

Write-Host "== 4/4 النشر إلى gh-pages ==" -ForegroundColor Cyan
npx gh-pages -d dist -m "deploy: update site [skip ci]"
if ($LASTEXITCODE -ne 0) { Write-Host "فشل النشر" -ForegroundColor Red; exit 1 }

Write-Host "تمّ النشر بنجاح" -ForegroundColor Green