import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from "react";

export interface GlobalTrack {
  surahNumber: number;
  surahName: string;
  audioSrc: string;
  isCustom?: boolean;
  initialTime?: number;
  source: "mushaf" | "audio-list";
}

/** مصادر الصوت المختلفة في التطبيق — mushaf: مشغل المصحف، audio-list: قائمة التلاوات */
export type AudioSource = "mushaf" | "audio-list";

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

  // ── تنسيق المصادر: يمنع تشغيل مصدرين معاً (المصحف وقائمة التلاوات) ──
  /** يُستدعى عند بدء تشغيل مصدر — يوقف أي مصدر آخر يعمل حالياً. */
  requestPlay: (source: AudioSource, audioElement: HTMLAudioElement) => void;
  /** يُستدعى عند توقّف مصدر عن التشغيل. */
  notifyStop: (source: AudioSource) => void;
  /** تسجيل عنصر صوت لمصدر معيّن لإيقافه عن بُعد عند الحاجة. */
  registerAudio: (source: AudioSource, audioElement: HTMLAudioElement) => void;
  /** إلغاء تسجيل عنصر صوت. */
  unregisterAudio: (source: AudioSource) => void;
  /** المصدر النشط حالياً (أو null إن لا يوجد تشغيل). */
  activeSource: AudioSource | null;
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

  // ── تنسيق المصادر: خريطة المشغلات المسجّلة (المصدر → عنصر الصوت) ──
  const registeredAudios = useRef<Map<AudioSource, HTMLAudioElement>>(new Map());
  const [activeSource, setActiveSource] = useState<AudioSource | null>(null);

  const registerAudio = useCallback((source: AudioSource, audioElement: HTMLAudioElement) => {
    registeredAudios.current.set(source, audioElement);
  }, []);

  const unregisterAudio = useCallback((source: AudioSource) => {
    registeredAudios.current.delete(source);
    setActiveSource((prev) => (prev === source ? null : prev));
  }, []);

  const requestPlay = useCallback((source: AudioSource, _audioElement: HTMLAudioElement) => {
    // إيقاف أي مصدر آخر يعمل، حتى لا يتشغّل مصدران معاً (المصحف وقائمة التلاوات)
    registeredAudios.current.forEach((audio, registeredSource) => {
      if (registeredSource !== source && !audio.paused) {
        try { audio.pause(); } catch { /* ignore */ }
      }
    });
    setActiveSource(source);
  }, []);

  const notifyStop = useCallback((source: AudioSource) => {
    setActiveSource((prev) => (prev === source ? null : prev));
  }, []);

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
        requestPlay,
        notifyStop,
        registerAudio,
        unregisterAudio,
        activeSource,
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
