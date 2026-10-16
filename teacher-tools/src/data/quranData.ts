import { surahs, Surah } from "./surahs";

export interface SurahInfo extends Surah {}

export const SURAHS: SurahInfo[] = surahs;

// Helper functions
export function getSurahByNumber(num: number): SurahInfo | undefined {
  return SURAHS.find(s => s.number === num);
}

export function getSurahName(num: number): string {
  return getSurahByNumber(num)?.name || `سورة ${num}`;
}

export function getSurahAyahCount(num: number): number {
  return getSurahByNumber(num)?.ayahCount || 0;
}

export function getAllSurahs(): SurahInfo[] {
  return SURAHS;
}
