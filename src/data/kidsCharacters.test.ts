import { beforeEach, describe, expect, it } from "vitest";
import {
  KIDS_CHARACTER_KEY,
  KIDS_CHARACTER_LIST,
  getKidsCharacterDef,
  getSelectedKidsCharacterId,
  hasSelectedKidsCharacter,
  isKidsCharacterId,
} from "../data/kidsCharacters";

describe("kidsCharacters", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("لا يقبل أي شخصيات (تم إلغاء الشخصيات)", () => {
    expect(isKidsCharacterId("imran")).toBe(false);
    expect(isKidsCharacterId("radia")).toBe(false);
    expect(isKidsCharacterId(null)).toBe(false);
  });

  it("يعيد null دائماً", () => {
    expect(getSelectedKidsCharacterId()).toBeNull();
    expect(hasSelectedKidsCharacter()).toBe(false);
  });

  it("قائمة الشخصيات فارغة", () => {
    expect(KIDS_CHARACTER_LIST).toHaveLength(0);
    expect(getKidsCharacterDef("imran")).toBeNull();
    expect(getKidsCharacterDef("radia")).toBeNull();
  });

  it("يزيل مفتاح الشخصية إن وجد في التخزين", () => {
    localStorage.setItem(KIDS_CHARACTER_KEY, "imran");
    expect(getSelectedKidsCharacterId()).toBeNull();
    expect(localStorage.getItem(KIDS_CHARACTER_KEY)).toBeNull();
  });
});