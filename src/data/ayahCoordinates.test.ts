import { describe, expect, it } from "vitest";
import {
  generateDefaultBoxesForPage,
  getPageAyahBoxes,
  getPageSurahNumbers,
  getSurahFirstPage,
  getSurahPageList,
  isSurahOnPage,
} from "./ayahCoordinates";
import { CODE_QURAN_PAGES } from "./staticPages";

describe("Ayah Shading & Boxes Tests", () => {
  it("covers every ayah of Al-Fatiha (page 0 / fatiha)", () => {
    const boxes = getPageAyahBoxes("/pages/0.jpg");
    // قد تُقسم الآية الطويلة إلى أكثر من مربع (شطرين)، لكن يجب ألا تغيب أي آية
    expect(boxes.length).toBeGreaterThanOrEqual(8);
    const ayahs = Array.from(new Set(boxes.map((b) => b.ayah))).sort((a, b) => a - b);
    expect(ayahs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(boxes.every((b) => b.surah === 1)).toBe(true);
  });

  it("provides full Surah An-Naba on page 581 (file numbering)", () => {
    const boxes = getPageAyahBoxes("/pages/581.jpg");
    const surah78Ayahs = boxes.filter((b) => b.surah === 78 && b.ayah > 0).map((b) => b.ayah);
    expect(surah78Ayahs).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    // صفحة 582 تكمل النبأ 31-40 ثم تبدأ النازعات (التوليد يغطّي الصفحة كاملة)
    const generated582 = generateDefaultBoxesForPage("/pages/582.jpg");
    expect(generated582.filter((b) => b.surah === 78 && b.ayah > 0)).toHaveLength(10);
    expect(generated582.filter((b) => b.surah === 79 && b.ayah > 0)).toHaveLength(15);
    // وأي تظليل محفوظ لهذه الصفحة يجب أن يكون لسورة موجودة عليها فقط
    const saved582 = getPageAyahBoxes("/pages/582.jpg");
    expect(saved582.length).toBeGreaterThan(0);
    expect(saved582.every((b) => getPageSurahNumbers("/pages/582.jpg").includes(b.surah))).toBe(true);
  });

  it("maps the last pages to the surahs actually printed on their images", () => {
    expect(getPageSurahNumbers("/pages/602.jpg")).toEqual([109, 110, 111]);
    expect(getPageSurahNumbers("/pages/603.jpg")).toEqual([112, 113, 114]);
    expect(getSurahFirstPage(112)).toBe("/pages/603.jpg");
    expect(getSurahFirstPage(100)).toBe("/pages/598.jpg");
    expect(getSurahPageList(78)).toEqual(["/pages/581.jpg", "/pages/582.jpg"]);
  });

  it("never shades a page with boxes belonging to another surah", () => {
    for (const page of CODE_QURAN_PAGES) {
      const allowed = getPageSurahNumbers(page.src);
      if (allowed.length === 0) continue;
      for (const box of getPageAyahBoxes(page.src)) {
        expect(allowed).toContain(box.surah);
        expect(isSurahOnPage(page.src, box.surah)).toBe(true);
      }
    }
  });

  it("ensures all loaded Quran pages have valid, non-empty boxes", () => {
    expect(CODE_QURAN_PAGES.length).toBeGreaterThan(0);
    for (const page of CODE_QURAN_PAGES) {
      expect(page.surahs.length).toBeGreaterThan(0);
      const boxes = getPageAyahBoxes(page.src);
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
