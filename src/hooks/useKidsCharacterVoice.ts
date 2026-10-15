export interface UseKidsCharacterVoiceResult {
  speak: (text: string) => void;
  pickDialogue: (kind: "success" | "mistake" | "encouraging", seed?: number) => string;
  stop: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useKidsCharacterVoice(_characterId?: any): UseKidsCharacterVoiceResult {
  return {
    speak: () => {},
    pickDialogue: () => "",
    stop: () => {},
  };
}

export default useKidsCharacterVoice;