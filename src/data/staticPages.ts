import { getAudioPath as audioPath } from "./audioUrls";
import { surahs } from "./surahs";
import { getPageAyahBoxes } from "./ayahCoordinates";
import { getPageSurahRegions } from "./surahRegions";

export interface SurahAudioInfo {
  name: string;
  number: number;
  src: string;
  ayahCount: number;
}

export interface StaticQuranPage {
  name: string;
  pageNumber: number;
  src: string;
  surahs: SurahAudioInfo[];
}

/**
 * 📖 قائمة صفحات المصحف الشريف المدمجة محلياً بالكامل داخل الكود
 * -------------------------------------------------------------
 * ⚡ لا يوجد أي اتصال بسيرفر خارجي (0ms تأخير، تعمل 100% أوفلاين وفورية).
 * 
 * ➕ لإضافة أي صفحة جديدة مباشرة داخل الكود:
 * فقط أضف عنصراً جديداً إلى المصفوفة أدناه مع:
 *  - name: اسم الصفحة أو عنوانها
 *  - pageNumber: رقم الصفحة
 *  - src: مسار ملف الصورة في public/pages (مثال: "/pages/605.jpg")
 *  - surahNumbers: أرقام السور الموجودة في هذه الصفحة (مثال: [112, 113, 114])
 */

function buildSurahs(pageSrc: string, surahNumbers: number[]): SurahAudioInfo[] {
  // 1. فحص ما إذا كانت هناك مناطق سور مخصصة مسجلة مسبقاً
  const regions = getPageSurahRegions(pageSrc);
  const boxes = getPageAyahBoxes(pageSrc);

  if (regions && regions.length > 0) {
    const list: SurahAudioInfo[] = [];
    const seenSurahs = new Set<number>();
    regions.forEach((r) => {
      if (r.surah && !seenSurahs.has(r.surah)) {
        seenSurahs.add(r.surah);
        const sMeta = surahs.find((s) => s.number === r.surah);
        const count = boxes.filter((b) => b.surah === r.surah).length || sMeta?.ayahCount || 0;
        list.push({
          name: r.name || sMeta?.name || `سورة ${r.surah}`,
          number: r.surah,
          src: audioPath(r.surah),
          ayahCount: count,
        });
      }
    });
    if (list.length > 0) return list;
  }

  // 2. دمج أرقام السور المعرفة في الكود مع أي سور وُجدت في مربعات الصفحة
  const surahSet = new Set<number>(surahNumbers);
  boxes.forEach((b) => {
    if (b.surah > 0) surahSet.add(b.surah);
  });
  const allSurahNums = Array.from(surahSet);

  return allSurahNums.map((num) => {
    const sMeta = surahs.find((s) => s.number === num);
    const count = boxes.filter((b) => b.surah === num).length || sMeta?.ayahCount || 0;
    return {
      name: sMeta ? sMeta.name : `سورة ${num}`,
      number: num,
      src: audioPath(num),
      ayahCount: count,
    };
  });
}

/**
 * خريطة ربط أرقام صفحات المصحف بالسور الموجودة فيها لجزء عمّ والفاتحة
 */
export const PAGE_TO_SURAHS: Record<number, number[]> = {
  0: [1],             // الفاتحة
  1: [1],             // الفاتحة
  581: [78],          // النبأ
  582: [78],          // النبأ
  583: [78, 79],      // النبأ، النازعات
  584: [79],          // النازعات
  585: [80],          // عبس
  586: [81, 82],      // التكوير، الانفطار
  587: [82, 83],      // الانفطار، المطففين
  588: [83],          // المطففين
  589: [84],          // الانشقاق
  590: [85],          // البروج
  591: [86, 87],      // الطارق، الأعلى
  592: [87, 88],      // الأعلى، الغاشية
  593: [89],          // الفجر
  594: [90, 91],      // البلد، الشمس
  595: [92, 93, 94],    // الليل، الضحى، الشرح
  596: [95, 96],      // التين، العلق
  597: [97, 98],      // القدر، البينة
  598: [98, 99, 100],   // البينة، الزلزلة، العاديات
  599: [101, 102, 103], // القارعة، التكاثر، العصر
  600: [104, 105, 106], // الهمزة، الفيل، قريش
  601: [107, 108, 109], // الماعون، الكوثر، الكافرون
  602: [110, 111, 112], // النصر، المسد، الإخلاص
  603: [112, 113, 114], // الإخلاص، الفلق، الناس
  604: [112, 113, 114],// الإخلاص، الفلق، الناس
};

const pageFiles = import.meta.glob('/صفحة قران/*.{jpg,jpeg,png}', { eager: true, query: '?url', import: 'default' });

export const CODE_QURAN_PAGES: StaticQuranPage[] = (() => {
  const seenPages = new Set<string>();
  const seenPageNumbers = new Set<number>();
  const list: StaticQuranPage[] = [];

  Object.keys(pageFiles).forEach((path) => {
    // Extract filename without extension for page number (e.g. '581' from '/صفحة قران/581.jpg')
    const fileName = path.split('/').pop() || '';
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
    
    // If it's a number, use it. Fatiha is 0.
    const numMatch = nameWithoutExt.match(/\d+/);
    const num = numMatch ? parseInt(numMatch[0], 10) : 1;
    const pageNumber = num === 0 ? 1 : num;
    const standardizedSrc = `/pages/${fileName}`;

    // منع تكرار أي صفحة في المصحف الشريف نهائياً (الفاتحة وسائر صفحات جزء عم والقرآن)
    if (seenPageNumbers.has(pageNumber)) return;
    if (seenPages.has(standardizedSrc)) return;

    seenPages.add(standardizedSrc);
    seenPageNumbers.add(pageNumber);
    
    const defaultSurahs = PAGE_TO_SURAHS[num] || PAGE_TO_SURAHS[pageNumber] || (num === 0 ? [1] : [78]);
    const sList = buildSurahs(standardizedSrc, defaultSurahs);
    const surahTitles = sList.map(s => s.name).join(" • ");
    const pageName = (num === 0 || pageNumber === 1) ? "سورة الفاتحة" : surahTitles ? `${surahTitles} (ص ${pageNumber})` : `صفحة ${pageNumber}`;
    
    list.push({
      name: pageName,
      pageNumber: pageNumber,
      src: standardizedSrc,
      surahs: sList,
    });
  });

  return list.sort((a, b) => a.pageNumber - b.pageNumber);
})();
