import { describe, expect, it } from "vitest";
import { getPageAyahBoxes } from "./ayahCoordinates";
import { CODE_QURAN_PAGES } from "./staticPages";

describe("Ayah Shading & Boxes Tests", () => {
  it("generates full 8 boxes for Al-Fatiha (page 0 / fatiha)", () => {
    const boxes = getPageAyahBoxes("/pages/0.jpg");
    expect(boxes.length).toBe(8);
    const ayahs = boxes.map((b) => b.ayah);
    expect(ayahs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(boxes.every((b) => b.surah === 1)).toBe(true);
  });

  it("provides boxes for Surah An-Naba on page 582", () => {
    const boxes = getPageAyahBoxes("/pages/582.jpg");
    expect(boxes.length).toBeGreaterThanOrEqual(30);
    const surah78Boxes = boxes.filter((b) => b.surah === 78 && b.ayah > 0);
    expect(surah78Boxes.length).toBe(30);
  });

  it("provides boxes for Surahs 112, 113, and 114 on page 603 and 604", () => {
    for (const src of ["/pages/603.jpg", "/pages/604.jpg"]) {
      const boxes = getPageAyahBoxes(src);
      const surahs = new Set(boxes.map((b) => b.surah));
      expect(surahs.has(112)).toBe(true);
      expect(surahs.has(113)).toBe(true);
      expect(surahs.has(114)).toBe(true);
    }
  });

  it("ensures all loaded Quran pages have valid, non-empty boxes and surahs", () => {
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
