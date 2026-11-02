import { getSurahPageList } from "./ayahCoordinates";
import { surahs } from "./surahs";

/**
 * خريطة اسم السورة → صفحاتها في مجلد «صفحة قران».
 * تُبنى تلقائياً من جدول أقسام الصفحات الحقيقي (ayahCoordinates)
 * حتى لا تختلف نسخة عن أخرى — كانت الخريطة اليدوية السابقة مُزاحة بصفحة كاملة
 * فتُفتح صفحة لا تحتوي السورة ويظهر التظليل في مكان خاطئ.
 */
const buildMap = (): Record<string, string[]> => {
  const map: Record<string, string[]> = {};
  surahs.forEach((s) => {
    const pages = getSurahPageList(s.number);
    if (pages.length > 0) map[s.name] = pages;
  });
  return map;
};

export const surahPageMap: Record<string, string[]> = buildMap();

export function getPageImages(surahName: string): string[] {
  return surahPageMap[surahName] || [];
}
