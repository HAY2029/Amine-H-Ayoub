// تقييد التظليل بسورة الفاتحة فقط

with open(r'h:\Amine-H-Ayoub\src\pages\SurahShadingPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# التعديل 1: تقييد التظليل بسورة الفاتحة فقط في selectSurah
old_select = '''  const selectSurah = (num: number, preview = false) => {
    setSelectedSurahNum(num);
    const surah = getSurahByNumber(num);
    const mappedPage =
      SURAH_TO_DEFAULT_PAGE[num] ||
      (surah && surahPageMap[surah.name]?.[0]) ||
      "/pages/604.jpg";

    loadPage(mappedPage, num);
    if (preview) setShowBoxes(false);
    triggerSurahFlash(num, mappedPage);
  };'''

new_select = '''  const selectSurah = (num: number, preview = false) => {
    // تقييد التظليل بسورة الفاتحة فقط
    if (num !== 1 && !preview) {
      toast({
        title: "التظليل مخصص لسورة الفاتحة فقط",
        description: "يمكنك التظليل على سورة الفاتحة (الآية 0) فقط.",
        variant: "destructive",
      });
      return;
    }
    setSelectedSurahNum(num);
    const surah = getSurahByNumber(num);
    const mappedPage =
      SURAH_TO_DEFAULT_PAGE[num] ||
      (surah && surahPageMap[surah.name]?.[0]) ||
      "/pages/0.jpg";

    loadPage(mappedPage, num);
    if (preview) setShowBoxes(false);
    triggerSurahFlash(num, mappedPage);
  };'''

if old_select in content:
    content = content.replace(old_select, new_select)
    print("تم تطبيق التعديل 1: تقييد التظليل بسورة الفاتحة فقط")
else:
    print("تحذير: لم يتم العثور على selectSurah الأصلي")

with open(r'h:\Amine-H-Ayoub\src\pages\SurahShadingPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("تم حفظ التعديل 1")