// Maps surah names (from API) to their Quran page images
// The API uses custom numbering (1-14), but the page images show actual Quran surahs

// Mapping from API surah name → page image(s)
export const surahPageMap: Record<string, string[]> = {
  "الفاتحة": ["/pages/0.jpg"],
  "التكاثر": ["/pages/600.jpg"],
  "العصر": ["/pages/601.jpg"],
  "الهمزة": ["/pages/601.jpg"],
  "الفيل": ["/pages/601.jpg"],
  "قريش": ["/pages/602.jpg"],
  "الماعون": ["/pages/602.jpg"],
  "الكوثر": ["/pages/602.jpg"],
  "الكافرون": ["/pages/603.jpg"],
  "النصر": ["/pages/603.jpg"],
  "المسد": ["/pages/603.jpg"],
  "الإخلاص": ["/pages/604.jpg"],
  "الفلق": ["/pages/604.jpg"],
  "الناس": ["/pages/604.jpg"],
};

export function getPageImages(surahName: string): string[] {
  return surahPageMap[surahName] || [];
}
