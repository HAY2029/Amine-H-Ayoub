import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from "react";

export interface GlobalTrack {
  surahNumber: number;
  surahName: string;
  audioSrc: string;
  isCustom?: boolean;
  initialTime?: number;
  source: "mushaf" | "audio-list";
}

interface AudioContextType {
  currentTrack: GlobalTrack | null;
  setCurrentTrack: (track: GlobalTrack | null) => void;
  
  // CustomPlayer exposes its audio element here so others (like QuranReader) can control it
  globalAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
  
  // Commands for CustomPlayer
  playNext: () => void;
  playPrev: () => void;
  setPlayNextHandler: (handler: () => void) => void;
  setPlayPrevHandler: (handler: () => void) => void;
  
  autoNext: boolean;
  setAutoNext: (v: boolean) => void;
  
  simultaneousMode: boolean;
  setSimultaneousMode: (v: boolean) => void;
}

const AudioCtx = createContext<AudioContextType | null>(null);

export function AudioContextProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<GlobalTrack | null>(null);
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);
  const [autoNext, setAutoNext] = useState(false);
  const [simultaneousMode, setSimultaneousMode] = useState(false);
  
  const playNextHandler = useRef<() => void>(() => {});
  const playPrevHandler = useRef<() => void>(() => {});

  const setPlayNextHandler = useCallback((handler: () => void) => {
    playNextHandler.current = handler;
  }, []);

  const setPlayPrevHandler = useCallback((handler: () => void) => {
    playPrevHandler.current = handler;
  }, []);

  const playNext = useCallback(() => playNextHandler.current(), []);
  const playPrev = useCallback(() => playPrevHandler.current(), []);

  return (
    <AudioCtx.Provider
      value={{
        currentTrack,
        setCurrentTrack,
        globalAudioRef,
        playNext,
        playPrev,
        setPlayNextHandler,
        setPlayPrevHandler,
        autoNext,
        setAutoNext,
        simultaneousMode,
        setSimultaneousMode,
      }}
    >
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudioContext(): AudioContextType {
  const ctx = useContext(AudioCtx);
  if (!ctx) {
    throw new Error("useAudioContext must be used within AudioContextProvider");
  }
  return ctx;
}
