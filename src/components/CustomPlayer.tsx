import { useEffect, useImperativeHandle, useRef, useState, forwardRef, useCallback } from "react";
import {
  X,
  Play,
  Pause,
  Repeat,
  SkipForward,
  SkipBack,
  Volume2,
  Volume1,
  VolumeX,
  Gauge,
  Clock,
  ChevronUp,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { resolvePlayableAudioUrl, cacheAudioInBackground } from "@/data/offlineAudioCache";
import { useAudioContext } from "@/contexts/audioContext";
import { updateMediaSession, setMediaPlaybackState, isBackgroundAudioEnabled } from "@/utils/backgroundAudio";

interface Props {
  surahName: string;
  surahNumber: number;
  audioSrc: string;
  isCustom?: boolean;
  initialTime?: number;
  onClose: () => void;
  onTimeUpdate?: (time: number) => void;
  onPlayNext?: () => void;
  onPlayPrev?: () => void;
  autoNext?: boolean;
  onToggleAutoNext?: () => void;
  onPlayingChange?: (playing: boolean) => void;
}

export interface CustomPlayerHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
}

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const SPEEDS = [0.75, 1, 1.25, 1.5];
const SLEEP_OPTIONS = [
  { label: "إيقاف", value: 0 },
  { label: "10 د", value: 10 },
  { label: "15 د", value: 15 },
  { label: "30 د", value: 30 },
  { label: "45 د", value: 45 },
  { label: "60 د", value: 60 },
];

const CustomPlayer = forwardRef<CustomPlayerHandle, Props>(
  (
    {
      surahName,
      surahNumber,
      audioSrc,
      isCustom = false,
      initialTime = 0,
      onClose,
      onTimeUpdate,
      onPlayNext,
      onPlayPrev,
      autoNext = false,
      onToggleAutoNext,
      onPlayingChange,
    },
    ref
  ) => {
    const { requestPlay, notifyStop, registerAudio, unregisterAudio } = useAudioContext();
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [current, setCurrent] = useState(initialTime);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [loop, setLoop] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const [showSleepMenu, setShowSleepMenu] = useState(false);
    const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
    const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<number | null>(null);
    const [fallbackToCloud, setFallbackToCloud] = useState(false);
    const initialTimeApplied = useRef(false);
    const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);

    // Track mobile vs desktop
    useEffect(() => {
      const handler = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener("resize", handler);
      return () => window.removeEventListener("resize", handler);
    }, []);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        const a = audioRef.current;
        if (!a) return;
        a.currentTime = seconds;
        setCurrent(seconds);
        a.play().catch(() => {});
      },
      play: () => {
        audioRef.current?.play().catch(() => {});
      },
      pause: () => {
        audioRef.current?.pause();
      },
    }));

    // Source resolution and autoplay
    useEffect(() => {
      let active = true;
      const getSrc = async () => {
        setLoading(true);
        setError(false);
        setIsPlaying(false);
        initialTimeApplied.current = false;

        let finalSrc = audioSrc;
        if (!audioSrc.startsWith("blob:") && !fallbackToCloud) {
          try {
            finalSrc = await resolvePlayableAudioUrl(surahNumber, audioSrc);
          } catch (e) {
            console.warn("Offline audio resolution fallback:", e);
          }
        }

        if (active && audioRef.current) {
          audioRef.current.src = finalSrc;
          audioRef.current.playbackRate = playbackRate;
          audioRef.current.volume = isMuted ? 0 : volume;
          audioRef.current.load();
          setTimeout(() => {
            if (active && audioRef.current) {
              audioRef.current.play().catch(() => {});
            }
          }, 350);

          if (!fallbackToCloud && finalSrc === audioSrc && !audioSrc.startsWith("blob:")) {
            cacheAudioInBackground(surahNumber, audioSrc);
          }
        }
      };

      getSrc();
      return () => {
        active = false;
      };
    }, [audioSrc, surahNumber, fallbackToCloud]);

    // Loop
    useEffect(() => {
      if (audioRef.current) audioRef.current.loop = loop;
    }, [loop]);

    // Playback rate
    useEffect(() => {
      if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    }, [playbackRate]);

    // Volume & Mute
    useEffect(() => {
      if (audioRef.current) {
        audioRef.current.volume = isMuted ? 0 : volume;
        audioRef.current.muted = isMuted;
      }
    }, [volume, isMuted]);

    // Notify playing state changes
    useEffect(() => {
      onPlayingChange?.(isPlaying);
    }, [isPlaying, onPlayingChange]);
    useEffect(() => () => onPlayingChange?.(false), [onPlayingChange]);

    // Audio Context registration
    useEffect(() => {
      const a = audioRef.current;
      if (a) {
        registerAudio("audio-list", a);
      }
      return () => {
        unregisterAudio("audio-list");
      };
    }, [registerAudio, unregisterAudio]);

    // Sleep Timer countdown
    useEffect(() => {
      if (!sleepTimerMinutes || sleepTimerMinutes <= 0) {
        setSleepRemainingSeconds(null);
        return;
      }

      setSleepRemainingSeconds(sleepTimerMinutes * 60);

      const interval = setInterval(() => {
        setSleepRemainingSeconds((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            if (audioRef.current) {
              audioRef.current.pause();
              setIsPlaying(false);
            }
            setSleepTimerMinutes(null);
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }, [sleepTimerMinutes]);

    // Media Session
    useEffect(() => {
      if (isPlaying) {
        updateMediaSession({
          title: `سورة ${surahName}`,
          artist: "القارئ حاج أيوب أمين",
          album: "المصحف المرتل برواية ورش",
          onPlay: () => {
            audioRef.current?.play().catch(() => {});
          },
          onPause: () => {
            audioRef.current?.pause();
          },
          onNext: onPlayNext,
          onPrev: onPlayPrev,
          onSeek: (t) => {
            if (audioRef.current) audioRef.current.currentTime = t;
          },
        });
        setMediaPlaybackState("playing");
      } else {
        setMediaPlaybackState("paused");
      }
    }, [isPlaying, surahName, onPlayNext, onPlayPrev]);

    // Background audio visibility
    useEffect(() => {
      const handleVisibility = () => {
        if (document.hidden && !isBackgroundAudioEnabled()) {
          audioRef.current?.pause();
        }
      };
      document.addEventListener("visibilitychange", handleVisibility);
      return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, []);

    // Pause listener
    useEffect(() => {
      const a = audioRef.current;
      if (!a) return;
      const handlePause = () => {
        if (isPlaying) setIsPlaying(false);
      };
      a.addEventListener("pause", handlePause);
      return () => a.removeEventListener("pause", handlePause);
    }, [isPlaying]);

    // Keyboard controls
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

        if (e.code === "Space") {
          e.preventDefault();
          togglePlay();
        } else if (e.code === "ArrowRight") {
          e.preventDefault();
          skipForward();
        } else if (e.code === "ArrowLeft") {
          e.preventDefault();
          skipBack();
        } else if (e.key === "m" || e.key === "M") {
          toggleMute();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isPlaying, isMuted, volume]);

    const retry = () => {
      const audio = audioRef.current;
      if (!audio) return;
      setError(false);
      setLoading(true);
      setFallbackToCloud(true);
      audio.src = audioSrc;
      audio.load();
      requestPlay("audio-list", audio);
      audio.play().catch(() => {
        setError(true);
        setLoading(false);
      });
    };

    const togglePlay = async () => {
      const audio = audioRef.current;
      if (!audio) return;
      try {
        if (isPlaying) {
          audio.pause();
          notifyStop("audio-list");
        } else {
          requestPlay("audio-list", audio);
          await audio.play();
        }
      } catch (e) {
        console.error("Audio play error:", e);
        if (!fallbackToCloud) {
          setFallbackToCloud(true);
        } else {
          setError(true);
          setLoading(false);
        }
      }
    };

    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      // RTL: right edge is start
      const clickX = e.clientX - rect.left;
      const pct = 1 - (clickX / rect.width);
      const t = pct * duration;
      audio.currentTime = t;
      setCurrent(t);
    }, [duration]);

    const skipBack = () => {
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = Math.max(0, a.currentTime - 10);
    };

    const skipForward = () => {
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = Math.min(duration, a.currentTime + 10);
    };

    const toggleMute = () => {
      setIsMuted((prev) => !prev);
    };

    const handleClosePlayer = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        notifyStop("audio-list");
      }
      onClose();
    };

    const progress = duration > 0 ? (current / duration) * 100 : 0;

    const audioElement = (
      <audio ref={audioRef} preload="auto"
        onLoadedMetadata={(e) => { const a = e.target as HTMLAudioElement; setDuration(a.duration); setLoading(false); if (!initialTimeApplied.current && initialTime > 0 && initialTime < a.duration) { a.currentTime = initialTime; setCurrent(initialTime); } initialTimeApplied.current = true; }}
        onCanPlay={() => setLoading(false)}
        onTimeUpdate={(e) => { const t = (e.target as HTMLAudioElement).currentTime; setCurrent(t); onTimeUpdate?.(t); }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); onTimeUpdate?.(0); if (!loop && autoNext && onPlayNext) onPlayNext(); }}
        onError={() => { if (!fallbackToCloud) setFallbackToCloud(true); else { setError(true); setLoading(false); } }}
      />
    );

    /* ======================= FULL PLAYER (Mobile expanded) ======================= */
    if (isExpanded && isMobile) {
      return (
        <div className="fixed inset-0 z-50 player-full-enter" dir="rtl">
          {/* Dark background */}
          <div className="absolute inset-0 bg-[#1a1410]" />
          <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-amber-900/30 via-amber-950/15 to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col h-full p-5 safe-area-inset">
            {/* Top Bar */}
            <div className="flex items-center justify-between mb-8">
              <button onClick={() => setIsExpanded(false)} className="w-10 h-10 rounded-full bg-stone-800/60 text-stone-400 hover:text-white flex items-center justify-center transition-all active:scale-90" aria-label="تصغير">
                <ChevronDown className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                {sleepRemainingSeconds !== null && (
                  <span className="text-[10px] bg-amber-900/60 text-amber-300 border border-amber-700/50 px-2.5 py-1 rounded-full font-mono flex items-center gap-1.5">
                    <Clock className="w-3 h-3 animate-spin" style={{ animationDuration: "3s" }} />
                    {formatTime(sleepRemainingSeconds)}
                  </span>
                )}
                <button onClick={handleClosePlayer} className="w-10 h-10 rounded-full bg-stone-800/60 hover:bg-red-900/70 text-stone-400 hover:text-red-400 flex items-center justify-center transition-all active:scale-90" aria-label="إغلاق">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Vinyl Disc */}
            <div className="flex-1 flex items-center justify-center">
              <div className="relative">
                {isPlaying && (
                  <div className="absolute inset-[-8px] rounded-full border-2 border-amber-500/20 animate-pulse" />
                )}
                <div className={`relative w-48 h-48 rounded-full ${isPlaying ? "player-disc-spin" : ""}`}>
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-600 via-amber-700 to-amber-900 p-[3px] shadow-[0_0_40px_rgba(180,120,20,0.3)]">
                    <div className="w-full h-full rounded-full bg-[#1a1410] p-1">
                      <div className="w-full h-full rounded-full border-[3px] border-stone-800/50 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-4 rounded-full border border-stone-700/30" />
                        <div className="absolute inset-8 rounded-full border border-stone-700/20" />
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 via-amber-600 to-amber-800 flex items-center justify-center p-[3px] shadow-inner">
                          <div className="w-full h-full rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex flex-col items-center justify-center">
                            <span className="text-white/90 font-black text-2xl tabular-nums">
                              {isCustom ? "🎤" : surahNumber}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="text-center mb-4">
              <h2 className="font-bold text-amber-100 font-amiri text-2xl leading-tight truncate">
                {isCustom ? surahName : `سورة ${surahName}`}
              </h2>
              <p className="text-stone-500 text-xs mt-1">
                {loading ? "جاري التحميل..." : error ? "تعذّر التحميل" : `القارئ أمين حاج أيوب — سورة رقم ${surahNumber}`}
              </p>
            </div>

            {/* Progress */}
            <div className="mb-4" dir="ltr">
              <div className="player-progress-track" onClick={handleProgressClick}>
                <div className="player-progress-fill" style={{ width: `${progress}%` }} />
                <div className="player-progress-thumb" style={{ left: `calc(${progress}% - 7px)` }} />
              </div>
              <div className="flex justify-between text-[11px] text-stone-500 tabular-nums mt-1.5 font-mono" dir="rtl">
                <span className="text-amber-400 font-bold">{formatTime(current)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Main Controls */}
            <div className="flex items-center justify-center gap-5 mb-4">
              {onPlayPrev && (
                <button onClick={onPlayPrev} className="w-11 h-11 rounded-full bg-stone-800/60 text-stone-400 hover:text-white flex items-center justify-center transition-all active:scale-90" aria-label="السابقة">
                  <SkipBack className="w-5 h-5" />
                </button>
              )}
              <button onClick={skipBack} className="w-10 h-10 rounded-full bg-stone-800/60 text-stone-400 hover:text-white flex items-center justify-center text-xs font-bold active:scale-90" aria-label="تأخير 10 ثوانٍ">-10</button>

              <button
                onClick={error ? retry : togglePlay}
                disabled={loading}
                className={`player-play-btn w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 text-[#1a1410] flex items-center justify-center shadow-[0_0_30px_rgba(180,120,20,0.4)] disabled:opacity-40 ${isPlaying ? "is-playing" : ""}`}
                aria-label={error ? "إعادة المحاولة" : isPlaying ? "إيقاف" : "تشغيل"}
              >
                {error ? <RotateCcw className="w-7 h-7" /> : isPlaying ? <Pause className="w-7 h-7 fill-[#1a1410]" /> : <Play className="w-7 h-7 fill-[#1a1410] ml-[-2px]" />}
              </button>

              <button onClick={skipForward} className="w-10 h-10 rounded-full bg-stone-800/60 text-stone-400 hover:text-white flex items-center justify-center text-xs font-bold active:scale-90" aria-label="تقديم 10 ثوانٍ">+10</button>
              {onPlayNext && (
                <button onClick={onPlayNext} className="w-11 h-11 rounded-full bg-stone-800/60 text-stone-400 hover:text-white flex items-center justify-center transition-all active:scale-90" aria-label="التالية">
                  <SkipForward className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Secondary Controls */}
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 relative">
                {/* Speed */}
                <div className="relative">
                  <button onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowSleepMenu(false); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${playbackRate !== 1 ? "bg-amber-600 text-[#1a1410] border-amber-500 shadow-md" : "bg-stone-800/60 text-stone-400 border-stone-700/50 hover:text-stone-200"}`}
                  >
                    <Gauge className="w-3.5 h-3.5" /><span>{playbackRate}×</span>
                  </button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-full mb-2 right-0 z-30 bg-[#1a1410] border border-amber-700/50 rounded-2xl p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex gap-1 animate-scale-up">
                      {SPEEDS.map((s) => (
                        <button key={s} onClick={() => { setPlaybackRate(s); setShowSpeedMenu(false); }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${playbackRate === s ? "bg-amber-600 text-[#1a1410] font-black" : "text-stone-400 hover:bg-stone-800"}`}>{s}×</button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Sleep */}
                <div className="relative">
                  <button onClick={() => { setShowSleepMenu(!showSleepMenu); setShowSpeedMenu(false); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${sleepTimerMinutes ? "bg-amber-900/50 text-amber-300 border-amber-600/50" : "bg-stone-800/60 text-stone-400 border-stone-700/50 hover:text-stone-200"}`}
                  >
                    <Clock className="w-3.5 h-3.5" /><span>نوم</span>
                  </button>
                  {showSleepMenu && (
                    <div className="absolute bottom-full mb-2 right-0 z-30 bg-[#1a1410] border border-amber-700/50 rounded-2xl p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex flex-wrap gap-1 w-44 animate-scale-up">
                      {SLEEP_OPTIONS.map((opt) => (
                        <button key={opt.value} onClick={() => { setSleepTimerMinutes(opt.value === 0 ? null : opt.value); setShowSleepMenu(false); }}
                          className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 text-center ${(opt.value === 0 && !sleepTimerMinutes) || sleepTimerMinutes === opt.value ? "bg-amber-600 text-[#1a1410] font-black" : "text-stone-400 hover:bg-stone-800"}`}>{opt.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setLoop(!loop)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all relative ${loop ? "bg-amber-600 text-[#1a1410] shadow-md" : "bg-stone-800/60 text-stone-500 hover:text-stone-200"}`}
                  aria-label="تكرار"
                >
                  <Repeat className="w-4 h-4" />
                  {loop && <span className="absolute -top-1 -right-1 text-[8px] bg-[#1a1410] text-amber-400 rounded-full w-3.5 h-3.5 flex items-center justify-center font-black border border-amber-600/50">1</span>}
                </button>
                {onToggleAutoNext && (
                  <button onClick={onToggleAutoNext}
                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border ${autoNext ? "bg-emerald-900/40 text-emerald-400 border-emerald-600/40" : "bg-stone-800/60 text-stone-500 border-stone-700/50 hover:text-stone-200"}`}
                  >تلقائي</button>
                )}
              </div>
            </div>
          </div>
          {audioElement}
        </div>
      );
    }

    /* ======================= BOTTOM BAR PLAYER (Desktop & Mobile Mini) ======================= */
    return (
      <div
        className="player-bottom-bar animate-fade-up"
        dir="rtl"
      >
        {/* Top progress bar — always visible */}
        <div className="player-progress-track" onClick={handleProgressClick} dir="ltr" style={{ borderRadius: 0 }}>
          <div className="player-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="mx-auto max-w-5xl px-3 sm:px-5">
          <div className="flex items-center gap-3 py-2.5 sm:py-3">
            {/* Surah info + disc */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Mini disc */}
              <div className={`relative w-10 h-10 sm:w-11 sm:h-11 shrink-0 ${isPlaying ? "player-disc-spin" : ""}`}>
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 p-[2px]">
                  <div className="w-full h-full rounded-full bg-[#1a1410] flex items-center justify-center">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-amber-500/40 to-amber-700/40 flex items-center justify-center p-[1px]">
                      <div className="w-full h-full rounded-full bg-[#1a1410] flex items-center justify-center">
                        <span className="text-amber-400 font-black text-[9px] sm:text-[10px]">{isCustom ? "🎤" : surahNumber}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm font-amiri text-amber-200 truncate leading-tight">
                  {isCustom ? surahName : `سورة ${surahName}`}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-stone-500 tabular-nums font-mono">
                    {formatTime(current)} / {formatTime(duration)}
                  </span>
                  {isPlaying && (
                    <div className="flex items-center gap-[2px] h-3">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-[2px] bg-amber-400 rounded-full animate-wave" style={{ animationDelay: `${i * 0.12}s` }} />
                      ))}
                    </div>
                  )}
                  {!isPlaying && <span className="text-[10px] text-stone-600">القارئ أمين حاج أيوب</span>}
                </div>
              </div>
            </div>

            {/* Desktop Controls — hidden on mobile */}
            <div className="hidden md:flex items-center gap-2">
              {onPlayPrev && (
                <button onClick={onPlayPrev} className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white flex items-center justify-center transition-colors" aria-label="السابقة">
                  <SkipBack className="w-4 h-4" />
                </button>
              )}
              <button onClick={skipBack} className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white flex items-center justify-center text-[10px] font-bold" aria-label="تأخير 10 ثوانٍ">-10</button>

              <button onClick={error ? retry : togglePlay} disabled={loading}
                className={`player-play-btn w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-[#1a1410] flex items-center justify-center shadow-lg shadow-amber-600/30 disabled:opacity-40 ${isPlaying ? "is-playing" : ""}`}
                aria-label={isPlaying ? "إيقاف" : "تشغيل"}
              >
                {error ? <RotateCcw className="w-5 h-5" /> : isPlaying ? <Pause className="w-5 h-5 fill-[#1a1410]" /> : <Play className="w-5 h-5 fill-[#1a1410] ml-[-1px]" />}
              </button>

              <button onClick={skipForward} className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white flex items-center justify-center text-[10px] font-bold" aria-label="تقديم 10 ثوانٍ">+10</button>
              {onPlayNext && (
                <button onClick={onPlayNext} className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white flex items-center justify-center transition-colors" aria-label="التالية">
                  <SkipForward className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Desktop Secondary Controls */}
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <button onClick={() => setLoop(!loop)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${loop ? "bg-amber-600 text-[#1a1410]" : "text-stone-500 hover:text-stone-200"}`}
                title={loop ? "إيقاف التكرار" : "تكرار"} aria-label="تكرار"
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
              {onToggleAutoNext && (
                <button onClick={onToggleAutoNext}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${autoNext ? "bg-emerald-900/40 text-emerald-400" : "text-stone-500 hover:text-stone-200"}`}
                >تلقائي</button>
              )}
              <button onClick={() => { setPlaybackRate(playbackRate === 1.5 ? 1 : SPEEDS[SPEEDS.indexOf(playbackRate) + 1] || 1); }}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${playbackRate !== 1 ? "bg-amber-600 text-[#1a1410]" : "text-stone-500 hover:text-stone-200"}`}
                title="سرعة التلاوة"
              >{playbackRate}×</button>

              {/* Volume */}
              <div className="flex items-center gap-1.5">
                <button onClick={toggleMute} className="w-8 h-8 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-white flex items-center justify-center transition-colors" aria-label="الصوت">
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : volume < 0.5 ? <Volume1 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                  onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (isMuted && v > 0) setIsMuted(false); }}
                  className="w-16 accent-amber-500 cursor-pointer h-1 bg-stone-700 rounded-lg" aria-label="مستوى الصوت" />
              </div>
            </div>

            {/* Mobile Controls */}
            <div className="flex md:hidden items-center gap-1.5 shrink-0">
              <button onClick={error ? retry : togglePlay} disabled={loading}
                className={`player-play-btn w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-[#1a1410] flex items-center justify-center shadow-lg shadow-amber-600/30 disabled:opacity-40 ${isPlaying ? "is-playing" : ""}`}
                aria-label={isPlaying ? "إيقاف" : "تشغيل"}
              >
                {error ? <RotateCcw className="w-5 h-5" /> : isPlaying ? <Pause className="w-5 h-5 fill-[#1a1410]" /> : <Play className="w-5 h-5 fill-[#1a1410] ml-[-1px]" />}
              </button>
              {onPlayNext && (
                <button onClick={onPlayNext} className="w-8 h-8 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center" aria-label="التالي">
                  <SkipForward className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setIsExpanded(true)} className="w-8 h-8 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center" aria-label="توسيع">
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            {/* Close button */}
            <button onClick={handleClosePlayer} className="w-8 h-8 rounded-full bg-stone-800 hover:bg-red-900/60 hover:text-red-400 text-stone-500 flex items-center justify-center transition-colors shrink-0" aria-label="إغلاق">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {audioElement}
      </div>
    );
  }
);

CustomPlayer.displayName = "CustomPlayer";

export default CustomPlayer;
