export interface UseKidsCharacterResult {
  character: null;
  characterId: null;
  hasCharacter: false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectCharacter: (id: any) => void;
}

export function useKidsCharacter(): UseKidsCharacterResult {
  return {
    character: null,
    characterId: null,
    hasCharacter: false,
    selectCharacter: () => {},
  };
}

export default useKidsCharacter;