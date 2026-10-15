export type KidsCharacterId = string;
export type KidsCharacterGender = "boy" | "girl";

export const KIDS_CHARACTER_KEY = "kids_selected_character";

export interface KidsCharacterTheme {
  gradient: string;
  soft: string;
  ring: string;
}

export interface KidsCharacterDef {
  id: KidsCharacterId;
  name: string;
  latin: string;
  gender: KidsCharacterGender;
  emoji: string;
  image?: string;
  voiceId: string;
  greeting: string;
  walkTips: string[];
  voiceHint: {
    gender: "boy" | "girl";
    pitch: number;
    rate: number;
  };
  dialogue: {
    success: string[];
    mistake: string[];
    encouraging: string[];
  };
  theme: KidsCharacterTheme;
}

export const KIDS_CHARACTER_IDS: readonly KidsCharacterId[] = [];

export const KIDS_CHARACTERS: Record<string, KidsCharacterDef> = {};

export const isKidsCharacterId = (_value: unknown): _value is KidsCharacterId => false;

export const getKidsCharacterDef = (_id: string | null | undefined): KidsCharacterDef | null => null;

export const KIDS_CHARACTER_LIST: readonly KidsCharacterDef[] = [];

export const getSelectedKidsCharacterId = (): KidsCharacterId | null => {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(KIDS_CHARACTER_KEY);
    } catch {
      /* ignore */
    }
  }
  return null;
};

export const setSelectedKidsCharacterId = (_id: KidsCharacterId): boolean => {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(KIDS_CHARACTER_KEY);
    } catch {
      /* ignore */
    }
  }
  return false;
};

export const hasSelectedKidsCharacter = (): boolean => false;