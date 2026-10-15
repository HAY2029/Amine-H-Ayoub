import { useEffect, useImperativeHandle, useRef, useState, forwardRef, useCallback, useMemo } from "react";
import {
  X, Play, Pause, Repeat, SkipForward, SkipBack, Volume2, VolumeX,
  RotateCcw, RotateCw, Gauge, Loader2, ChevronDown, ChevronUp, Moon, Sparkles,
  Download, Check, AlertCircle
} from "lucide-react";
import { isAudioCachedOffline, resolvePlayableAudioUrl } from "@/data/offlineAudioCache";
import { downloadSurahOffline, type SurahDownloadProgress } from "@/data/offlineDownload";
import { isTauri, listenToDownloadProgress } from "@/utils/tauriUtils";
import { useAudioContext } from "@/contexts/audioContext";
import { updateMediaSession, setMediaPlaybackState } from "@/utils/backgroundAudio";
import { getSurahByNumber } from "@/data/quranData";
import { getArchiveGatewayAudioUrl, getFallbackAudioUrl, reportHuggingFaceFailure } from "@/data/audioUrls";
import QuranLoading from "./QuranLoading";
import SurahDownloadModal from "./SurahDownloadModal";

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
  mode?: "mushaf" | "audio-list";
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

const CustomPlayer = forwardRef<CustomPlayerHandle, Props>(
  (
    {
      surahName,
      surahNumber,
      audioSrc,
      isCustom = false,
      initialTime = 0,
      onClose,
      onTimeUpdate: onTimeUpdateProp,
      onPlayNext,
      onPlayPrev,
      autoNext = false,
      onToggleAutoNext,
      onPlayingChange,
      mode = "audio-list",
    },
    ref
  ) => {
    const { globalAudioRef, requestPlay, notifyStop, registerAudio, unregisterAudio } = useAudioContext();
    const localAudioRef = useRef<HTMLAudioElement>(null);
    const audioRef = (globalAudioRef?.current !== undefined ? globalAudioRef : localAudioRef) as React.MutableRefObject<HTMLAudioElement | null>;

    // Surah metadata lookup
    const surahInfo = useMemo(() => getSurahByNumber(surahNumber), [surahNumber]);

    // Player UI States
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [current, setCurrent] = useState(initialTime);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [loop, setLoop] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isMinimized, setIsMinimized] = useState(false);
    const [offlineSaved, setOfflineSaved] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadError, setDownloadError] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadModalOpen, setDownloadModalOpen] = useState(false);
    const [downloadProgressData, setDownloadProgressData] = useState<SurahDownloadProgress | undefined>(undefined);
    const downloadAbortRef = useRef<AbortController | null>(null);

    // Sleep Timer (مؤقت النوم)
    const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
    const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<number | null>(null);

    // Interactive Dragging Progress State
    const [isDraggingProgress, setIsDraggingProgress] = useState(false);
    const [dragPreviewTime, setDragPreviewTime] = useState<number | null>(null);
    const progressTrackRef = useRef<HTMLDivElement>(null);

    const initialTimeApplied = useRef(false);
    const currentLoadedSrcRef = useRef<string>("");
    const fallbackAttemptRef = useRef(0);
    const onPlayingChangeRef = useRef(onPlayingChange);

    const verifyOfflineCopy = useCallback(async () => {
      if (isCustom) {
        setOfflineSaved(false);
        return;
      }
      const saved = await isAudioCachedOffline(surahNumber, audioSrc);
      setOfflineSaved(saved);
    }, [audioSrc, isCustom, surahNumber]);

    useEffect(() => {
      void verifyOfflineCopy();
    }, [verifyOfflineCopy]);

    useEffect(() => {
      if (!isTauri() || isCustom) return;
      return listenToDownloadProgress((payload) => {
        if (payload.surah_number !== surahNumber) return;
        const rounded = Math.round(payload.progress);
        setDownloadProgress(rounded);
        setDownloadProgressData({
          progress: rounded,
          status: payload.status,
          receivedBytes: payload.downloaded_bytes,
          totalBytes: payload.total_bytes,
        });
        if (payload.status === "completed") {
          setIsDownloading(false);
          setOfflineSaved(true);
          setDownloadError("");
        } else if (payload.status === "error") {
          setIsDownloading(false);
          setDownloadError("فشل التنزيل؛ حاول مرة أخرى");
        }
      });
    }, [isCustom, surahNumber]);

    const handleOfflineDownload = useCallback(async () => {
      if (offlineSaved || isCustom) return;
      if (isDownloading) {
        setDownloadModalOpen(true);
        return;
      }
      const alreadySaved = await isAudioCachedOffline(surahNumber, audioSrc);
      if (alreadySaved) {
        setOfflineSaved(true);
        setDownloadProgress(100);
        setDownloadError("");
        return;
      }

      setDownloadModalOpen(true);
      setIsDownloading(true);
      setDownloadProgress(0);
      setDownloadError("");
      setDownloadProgressData({ progress: 0, status: "downloading" });
      downloadAbortRef.current = new AbortController();

      try {
        await downloadSurahOffline(
          surahNumber,
          audioSrc,
          (progressInfo) => {
            setDownloadProgress(progressInfo.progress);
            setDownloadProgressData(progressInfo);
            if (progressInfo.status === "completed") {
              setOfflineSaved(true);
              setIsDownloading(false);
            }
          },
          downloadAbortRef.current.signal
        );
        await verifyOfflineCopy();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "تعذّر حفظ الصوت دون اتصال";
        setDownloadError(msg);
        setDownloadProgressData({ progress: 0, status: "error", error: msg });
      } finally {
        setIsDownloading(false);
      }
    }, [audioSrc, isCustom, isDownloading, offlineSaved, surahNumber, verifyOfflineCopy]);

    useEffect(() => {
      onPlayingChangeRef.current = onPlayingChange;
    }, [onPlayingChange]);

    useEffect(() => {
      onPlayingChangeRef.current?.(isPlaying);
    }, [isPlaying]);

    useEffect(() => {
      return () => {
        onPlayingChangeRef.current?.(false);
      };
    }, []);

    // Global audio element inspection hook
    useEffect(() => {
      const el = audioRef.current;
      if (el) (window as unknown as { __globalAudioEl?: HTMLAudioElement }).__globalAudioEl = el;
      return () => {
        const w = window as unknown as { __globalAudioEl?: HTMLAudioElement };
        if (w.__globalAudioEl === el) delete w.__globalAudioEl;
      };
    }, [audioRef]);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        const a = audioRef.current;
        if (!a) return;
        a.currentTime = seconds;
        setCurrent(seconds);
        a.play().catch(() => {});
      },
      play: () => audioRef.current?.play().catch(() => {}),
      pause: () => audioRef.current?.pause(),
    }));

    // Audio Source loader with instant direct streaming (prevents mid-playback cutoff)
    useEffect(() => {
      let active = true;
      const a = audioRef.current;
      if (!a || mode === "mushaf") return;

      // Avoid restarting or aborting if the same audio source is already active
      if (currentLoadedSrcRef.current === audioSrc && a.src && (a.src === audioSrc || a.src.endsWith(audioSrc))) {
        return;
      }

      currentLoadedSrcRef.current = audioSrc;
      fallbackAttemptRef.current = 0;
      setLoading(true);
      setError(false);
      initialTimeApplied.current = false;

      const initAudio = async () => {
        let streamUrl = audioSrc;
        // If offline and not a blob, try loading from local offline cache
        if (!navigator.onLine && !audioSrc.startsWith("blob:")) {
          try {
            const cached = await resolvePlayableAudioUrl(surahNumber, audioSrc);
            if (cached) streamUrl = cached;
          } catch {
            /* ignore */
          }
        }
        if (!active) return;

        if (a.src !== streamUrl) {
          a.src = streamUrl;
          a.volume = isMuted ? 0 : volume;
          a.playbackRate = playbackRate;
        }

        requestPlay("audio-list", a);
        a.play().catch((err) => {
          console.debug("[CustomPlayer] Autoplay was deferred or prevented:", err);
        });
      };

      initAudio();

      return () => {
        active = false;
      };
    }, [audioSrc, surahNumber, mode, audioRef, requestPlay, isMuted, volume, playbackRate]);

    // Apply audio properties reactively
    useEffect(() => {
      if (audioRef.current) audioRef.current.loop = loop;
    }, [loop, audioRef]);

    useEffect(() => {
      if (audioRef.current) {
        audioRef.current.volume = isMuted ? 0 : volume;
        audioRef.current.muted = isMuted;
      }
    }, [volume, isMuted, audioRef]);

    useEffect(() => {
      if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    }, [playbackRate, audioRef]);

    // Register audio with coordinate context
    useEffect(() => {
      const a = audioRef.current;
      if (a) registerAudio("audio-list", a);
      return () => unregisterAudio("audio-list");
    }, [registerAudio, unregisterAudio, audioRef]);

    // MediaSession lock screen integration
    useEffect(() => {
      const title = isCustom ? surahName : `سورة ${surahName}`;
      const subtitle = surahInfo ? `${surahInfo.type} • ${surahInfo.ayahCount} آية` : "القرآن الكريم";
      updateMediaSession({
        title,
        artist: "القرآن الكريم للأطفال",
        album: subtitle,
        onPlay: () => {
          if (audioRef.current) {
            requestPlay("audio-list", audioRef.current);
            audioRef.current.play().catch(() => {});
          }
        },
        onPause: () => {
          if (audioRef.current) {
            audioRef.current.pause();
            notifyStop("audio-list");
          }
        },
        onNext: onPlayNext,
        onPrev: onPlayPrev,
        onSeek: (seconds) => {
          if (audioRef.current) {
            audioRef.current.currentTime = seconds;
            setCurrent(seconds);
          }
        },
      });
    }, [surahName, isCustom, surahInfo, onPlayNext, onPlayPrev, requestPlay, notifyStop, audioRef]);

    // Sleep Timer Interval
    const cycleSleepTimer = () => {
      const options = [null, 15, 30, 45, 60];
      const nextIdx = (options.indexOf(sleepTimerMinutes) + 1) % options.length;
      const nextVal = options[nextIdx];
      setSleepTimerMinutes(nextVal);
      setSleepRemainingSeconds(nextVal ? nextVal * 60 : null);
    };

    useEffect(() => {
      if (!sleepRemainingSeconds || sleepRemainingSeconds <= 0) return;
      if (!isPlaying) return;
      const interval = setInterval(() => {
        setSleepRemainingSeconds((prev) => {
          if (prev === null || prev <= 1) {
            if (audioRef.current) {
              audioRef.current.pause();
              notifyStop(mode || "audio-list");
            }
            setSleepTimerMinutes(null);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }, [sleepRemainingSeconds, isPlaying, mode, notifyStop, audioRef]);

    const handleAudioError = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;

      // HTMLMediaElement hides HTTP status; use the bounded provider fallback path.
      const failedUrl = audio.currentSrc || audio.src;
      if (failedUrl.includes("huggingface.co")) reportHuggingFaceFailure();
      const fallbacks = [getFallbackAudioUrl(surahNumber), getArchiveGatewayAudioUrl(surahNumber)];
      if (failedUrl.includes("archive.org") || failedUrl.includes("ia803201.us.archive.org")) {
        fallbackAttemptRef.current = 1;
      }
      const fallbackUrl = fallbacks[fallbackAttemptRef.current++];
      if (fallbackUrl && fallbackUrl !== failedUrl && fallbackAttemptRef.current <= fallbacks.length) {
        console.warn(`[CustomPlayer] Audio source failed; trying fallback provider`);
        currentLoadedSrcRef.current = fallbackUrl;
        setLoading(true);
        setError(false);
        audio.src = fallbackUrl;
        audio.load();
        audio.play().catch(() => {
          setError(true);
          setLoading(false);
          setIsPlaying(false);
        });
        return;
      }

      setError(true);
      setLoading(false);
      setIsPlaying(false);
    }, [surahNumber, audioRef]);

    // Playback control actions
    const retry = () => {
      const audio = audioRef.current;
      if (!audio) return;
      setError(false);
      setLoading(true);
      fallbackAttemptRef.current = 0;
      currentLoadedSrcRef.current = audioSrc;
      audio.src = audioSrc;
      audio.load();
      requestPlay("audio-list", audio);
      audio.play().catch(() => {
        handleAudioError();
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
          setError(false);
          requestPlay("audio-list", audio);
          await audio.play();
        }
      } catch (e) {
        handleAudioError();
      }
    };

    // Pointer-accurate Drag Scrubbing (works in RTL & LTR by using LTR bounding box)
    const calculateProgressFromPointer = useCallback(
      (clientX: number) => {
        if (!progressTrackRef.current || !duration) return 0;
        const rect = progressTrackRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return pct * duration;
      },
      [duration]
    );

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!duration) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setIsDraggingProgress(true);
      const newTime = calculateProgressFromPointer(e.clientX);
      setDragPreviewTime(newTime);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingProgress || !duration) return;
      const newTime = calculateProgressFromPointer(e.clientX);
      setDragPreviewTime(newTime);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingProgress || !duration) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setIsDraggingProgress(false);
      const newTime = calculateProgressFromPointer(e.clientX);
      setDragPreviewTime(null);
      const a = audioRef.current;
      if (a) {
        a.currentTime = newTime;
        setCurrent(newTime);
        onTimeUpdateProp?.(newTime);
      }
    };

    const skipBack10 = () => {
      const a = audioRef.current;
      if (a) {
        const nextTime = Math.max(0, a.currentTime - 10);
        a.currentTime = nextTime;
        setCurrent(nextTime);
      }
    };

    const skipForward10 = () => {
      const a = audioRef.current;
      if (a) {
        const nextTime = Math.min(duration, a.currentTime + 10);
        a.currentTime = nextTime;
        setCurrent(nextTime);
      }
    };

    const toggleMute = () => setIsMuted((prev) => !prev);

    const cycleSpeed = () => {
      const speeds = [0.75, 1, 1.25, 1.5, 2];
      setPlaybackRate((r) => speeds[(speeds.indexOf(r) + 1) % speeds.length]);
    };

    const handleClosePlayer = (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      try {
        localStorage.removeItem("audio:lastSurah");
        localStorage.removeItem("audio:lastTime");
      } catch {
        /* ignore */
      }
      if (audioRef.current) {
        audioRef.current.pause();
        notifyStop(mode || "audio-list");
      }
      onClose();
    };

    // Calculate displayed time & progress percentage
    const displayedCurrentTime = isDraggingProgress && dragPreviewTime !== null ? dragPreviewTime : current;
    const progressPercent = duration > 0 ? (displayedCurrentTime / duration) * 100 : 0;

    // Render underlying audio element (when not in mushaf mode)
    const audioElement =
      mode !== "mushaf" ? (
        <audio
          ref={audioRef}
          preload="auto"
          onLoadedMetadata={(e) => {
            const a = e.target as HTMLAudioElement;
            if (isFinite(a.duration) && a.duration > 0) {
              setDuration(a.duration);
            }
            setLoading(false);
            if (!initialTimeApplied.current && initialTime > 0 && initialTime < a.duration) {
              a.currentTime = initialTime;
              setCurrent(initialTime);
            }
            initialTimeApplied.current = true;
          }}
          onDurationChange={(e) => {
            const d = (e.target as HTMLAudioElement).duration;
            if (isFinite(d) && d > 0) setDuration(d);
          }}
          onCanPlay={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onPlaying={() => {
            setLoading(false);
            setIsPlaying(true);
            setMediaPlaybackState("playing");
          }}
          onTimeUpdate={(e) => {
            const t = (e.target as HTMLAudioElement).currentTime;
            if (!isDraggingProgress) {
              setCurrent(t);
            }
            onTimeUpdateProp?.(t);
          }}
          onPlay={() => {
            setIsPlaying(true);
            setMediaPlaybackState("playing");
          }}
          onPause={() => {
            setIsPlaying(false);
            setMediaPlaybackState("paused");
          }}
          onEnded={() => {
            setIsPlaying(false);
            setMediaPlaybackState("none");
            onTimeUpdateProp?.(0);
            if (!loop && autoNext && onPlayNext) {
              onPlayNext();
            }
          }}
          onError={handleAudioError}
        />
      ) : null;

    /* =========================================================================
     *  MINIMIZED COMPACT VIEW (كبسولة أنيقة مصغرة)
     * ========================================================================= */
    if (isMinimized) {
      return (
        <div
          className="fixed bottom-3 sm:bottom-5 left-0 right-0 mx-auto z-[100] w-[95%] max-w-[540px] animate-fade-up"
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="bg-white/95 dark:bg-[#15130f]/95 backdrop-blur-2xl border border-amber-500/30 dark:border-amber-500/20 rounded-full px-4 py-2.5 shadow-[0_12px_40px_-8px_rgba(217,119,6,0.35),0_0_0_1px_rgba(245,158,11,0.12)] flex items-center justify-between gap-3 overflow-hidden relative">
            {/* Top Micro Progress Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500/15" dir="ltr">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-150"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Left Info: Badge & Name */}
            <div
              className="flex items-center gap-3 cursor-pointer min-w-0"
              onClick={() => setIsMinimized(false)}
              title="انقر لتكبير المشغل"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white font-bold text-sm shadow-md shrink-0 border border-amber-300/40 ${
                  isPlaying ? "animate-pulse" : ""
                }`}
              >
                {isCustom ? "🎤" : surahNumber}
              </div>
              <div className="flex flex-col min-w-0 text-right">
                <span className="font-amiri font-bold text-base text-stone-900 dark:text-amber-100 truncate leading-tight">
                  {isCustom ? surahName : `سورة ${surahName}`}
                </span>
                <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                  {formatTime(displayedCurrentTime)} / {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* Right Controls: Download, Play/Pause, Expand, Close */}
            <div className="flex items-center gap-1.5 shrink-0">
              {!isCustom && (
                <button
                  onClick={handleOfflineDownload}
                  disabled={isDownloading || offlineSaved}
                  aria-label={offlineSaved ? "الصوت محفوظ دون اتصال" : "تحميل الصوت إلى الجهاز"}
                  title={downloadError || (offlineSaved ? "تم التحقق: الصوت محفوظ على الجهاز" : "تحميل السورة للاستخدام دون اتصال")}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:cursor-default ${offlineSaved ? "text-emerald-600 dark:text-emerald-400" : "text-stone-600 dark:text-stone-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"}`}
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : offlineSaved ? <Check className="w-4 h-4" /> : downloadError ? <AlertCircle className="w-4 h-4 text-red-500" /> : <Download className="w-4 h-4" />}
                </button>
              )}
              {onPlayNext && (
                <button
                  onClick={onPlayNext}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-stone-600 dark:text-stone-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all active:scale-95"
                  title="السورة التالية"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={error ? retry : togglePlay}
                disabled={loading}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-white shadow-md active:scale-95 transition-all"
                title={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : error ? (
                  <RotateCcw className="w-4 h-4" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </button>

              <button
                onClick={() => setIsMinimized(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 dark:text-stone-400 hover:bg-amber-100 dark:hover:bg-stone-800 transition-colors"
                title="تكبير المشغل"
              >
                <ChevronUp className="w-4 h-4" />
              </button>

              <button
                onClick={handleClosePlayer}
                className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                title="إغلاق المشغل"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {audioElement}
        </div>
      );
    }

    const shouldShowFirstTimeDownloadOverlay = !isCustom && isDownloading && !offlineSaved;

    /* =========================================================================
     *  EXPANDED DELUXE VIEW (المشغل الكامل الحديث والفخم)
     * ========================================================================= */
    return (
      <div
        className="fixed bottom-3 sm:bottom-5 left-0 right-0 mx-auto z-[100] w-[95%] max-w-[720px] animate-fade-up"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {shouldShowFirstTimeDownloadOverlay && (
          <div className="absolute inset-0 z-30 flex items-center justify-center rounded-[28px] bg-stone-950/50 backdrop-blur-sm">
            <QuranLoading
              fullScreen={false}
              minimal
              label="جارٍ حفظ السورة في الجهاز..."
              description="يتم حفظ نسخة محلية للاستخدام دون اتصال"
              sublabel={`${downloadProgress}%`}
              colorVariant="gold"
              className="!bg-transparent !border-0 !shadow-none"
            />
          </div>
        )}
        <div className="bg-white/95 dark:bg-[#15130f]/95 backdrop-blur-2xl border border-amber-500/25 dark:border-amber-500/20 rounded-[28px] sm:rounded-[32px] p-4 sm:p-5 shadow-[0_20px_60px_-15px_rgba(217,119,6,0.35),0_0_0_1px_rgba(245,158,11,0.12)] overflow-hidden relative group">
          
          {/* Subtle Ambient Golden Shimmer Background */}
          {isPlaying && (
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-emerald-500/5 to-amber-500/5 pointer-events-none animate-pulse" />
          )}

          <div className="relative z-10 flex flex-col gap-3.5 sm:gap-4">
            
            {/* ================= HEADER ROW: Surah Details & Utility Badges ================= */}
            <div className="flex items-center justify-between gap-2">
              
              {/* Surah Icon & Titles */}
              <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
                <div
                  className={`relative w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white font-bold text-lg sm:text-xl shadow-[0_4px_16px_rgba(245,158,11,0.35)] border border-amber-300/40 shrink-0 ${
                    isPlaying ? "shadow-amber-500/50" : ""
                  }`}
                >
                  <span className="relative z-10">{isCustom ? "🎤" : surahNumber}</span>
                  {isPlaying && (
                    <div className="absolute inset-0 rounded-2xl border-2 border-white/40 animate-ping opacity-25 pointer-events-none" />
                  )}
                </div>

                <div className="flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xl sm:text-2xl font-amiri text-stone-900 dark:text-amber-100 leading-tight truncate">
                      {isCustom ? surahName : `سورة ${surahName}`}
                    </h3>

                    {/* Animated Equalizer Sound Bars */}
                    {isPlaying && (
                      <div className="flex items-end gap-0.5 h-4 px-1" title="تلاوة نشطة">
                        <span className="w-1 bg-amber-500 rounded-full h-2 animate-[soundbar_0.8s_ease-in-out_infinite]" style={{ animationDelay: "0ms" }} />
                        <span className="w-1 bg-amber-500 rounded-full h-4 animate-[soundbar_0.8s_ease-in-out_infinite]" style={{ animationDelay: "200ms" }} />
                        <span className="w-1 bg-amber-500 rounded-full h-3 animate-[soundbar_0.8s_ease-in-out_infinite]" style={{ animationDelay: "400ms" }} />
                        <span className="w-1 bg-amber-500 rounded-full h-3.5 animate-[soundbar_0.8s_ease-in-out_infinite]" style={{ animationDelay: "100ms" }} />
                      </div>
                    )}
                  </div>

                  {/* Subtitle Badges: Makkiyah/Madaniyah & Ayah Count */}
                  <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 font-medium mt-0.5 flex-wrap">
                    {loading ? (
                      <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> جاري التحميل...
                      </span>
                    ) : error ? (
                      <span className="text-red-500 font-bold">تعذّر تشغيل الملف • انقر لإعادة المحاولة</span>
                    ) : (
                      <>
                        {surahInfo && (
                          <span className="inline-flex items-center gap-1 bg-amber-500/10 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-amber-500/20">
                            {surahInfo.type === "مكية" ? "🕋 مكية" : "🕌 مدنية"}
                          </span>
                        )}
                        {surahInfo?.ayahCount && (
                          <span className="text-stone-600 dark:text-stone-300 text-[11px]">
                            {surahInfo.ayahCount} آية
                          </span>
                        )}
                        <span className="text-stone-400 text-[10px] hidden sm:inline">• برواية ورش</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {!isCustom && (
                  <button
                    onClick={() => {
                      if (isDownloading) {
                        setDownloadModalOpen(true);
                      } else {
                        void handleOfflineDownload();
                      }
                    }}
                    disabled={offlineSaved}
                    aria-label={offlineSaved ? "الصوت محفوظ دون اتصال" : "تحميل الصوت إلى الجهاز"}
                    title={downloadError || (offlineSaved ? "تم التحقق: الصوت محفوظ على الجهاز" : "تحميل السورة للاستخدام دون اتصال")}
                    className={`h-9 px-2.5 sm:px-3 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border disabled:cursor-default ${offlineSaved ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300" : downloadError ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300" : "bg-stone-100/80 border-transparent text-stone-600 dark:bg-stone-800/50 dark:text-stone-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"}`}
                  >
                    {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : offlineSaved ? <Check className="w-3.5 h-3.5" /> : downloadError ? <AlertCircle className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                    <span>{isDownloading ? `${downloadProgress}%` : offlineSaved ? "محفوظ" : downloadError ? "إعادة" : "تحميل"}</span>
                  </button>
                )}
                {/* Sleep Timer Button */}
                <button
                  onClick={cycleSleepTimer}
                  className={`h-9 px-2.5 sm:px-3 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border ${
                    sleepTimerMinutes
                      ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300 shadow-sm"
                      : "bg-stone-100/80 border-transparent text-stone-600 dark:bg-stone-800/50 dark:text-stone-400 hover:bg-stone-200/80 dark:hover:bg-stone-700/60"
                  }`}
                  title={
                    sleepTimerMinutes
                      ? `مؤقت النوم مفعّل: متبقي ${Math.ceil((sleepRemainingSeconds || 0) / 60)} دقيقة`
                      : "تفعيل مؤقت النوم"
                  }
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">النوم:</span>
                  <span>{sleepTimerMinutes ? `${Math.ceil((sleepRemainingSeconds || 0) / 60)}د` : "إيقاف"}</span>
                </button>

                {/* Auto-Next Toggle */}
                {onToggleAutoNext && (
                  <button
                    onClick={onToggleAutoNext}
                    className={`h-9 px-2.5 sm:px-3 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border ${
                      autoNext
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 shadow-sm"
                        : "bg-stone-100/80 border-transparent text-stone-600 dark:bg-stone-800/50 dark:text-stone-400 hover:bg-stone-200/80 dark:hover:bg-stone-700/60"
                    }`}
                    title={autoNext ? "التشغيل التلقائي مفعل" : "تفعيل التشغيل التلقائي"}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">تلقائي</span>
                  </button>
                )}

                {/* Minimize Button */}
                <button
                  onClick={() => setIsMinimized(true)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-stone-100/80 dark:bg-stone-800/50 text-stone-600 dark:text-stone-400 hover:bg-amber-100 dark:hover:bg-stone-700 transition-colors"
                  title="تصغير المشغل"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>

                {/* Close Button */}
                <button
                  onClick={handleClosePlayer}
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-stone-100/80 dark:bg-stone-800/50 text-stone-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title="إغلاق المشغل"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ================= MIDDLE ROW: Interactive Pointer Scrubber ================= */}
            <div className="flex items-center gap-3 px-1 select-none">
              <span className="text-xs font-bold font-mono text-amber-600 dark:text-amber-400 w-11 text-center shrink-0">
                {formatTime(displayedCurrentTime)}
              </span>

              {/* LTR Progress Bar Container: Prevents RTL mathematical inversion */}
              <div
                ref={progressTrackRef}
                dir="ltr"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="flex-1 h-3 sm:h-3.5 bg-stone-200/90 dark:bg-stone-800/90 rounded-full cursor-pointer relative overflow-visible group/bar touch-none transition-all hover:h-4"
                title="اسحب أو انقر للانتقال"
              >
                {/* Filled Gradient Bar */}
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 rounded-full relative pointer-events-none transition-all duration-75"
                  style={{ width: `${progressPercent}%` }}
                >
                  {/* Glowing Thumb Handle */}
                  <div
                    className={`absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-amber-500 shadow-[0_2px_8px_rgba(245,158,11,0.6)] transition-transform ${
                      isDraggingProgress ? "scale-125" : "scale-100 group-hover/bar:scale-110"
                    }`}
                  />
                </div>
              </div>

              <span className="text-xs font-bold font-mono text-stone-500 dark:text-stone-400 w-11 text-center shrink-0">
                {formatTime(duration)}
              </span>
            </div>

            {/* ================= BOTTOM ROW: Control Buttons Grid ================= */}
            <div className="flex items-center justify-between gap-2 pt-0.5 px-1">
              
              {/* Left Group: Speed, Loop, Volume */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Speed Cycle */}
                <button
                  onClick={cycleSpeed}
                  className={`h-10 px-2.5 sm:px-3 flex items-center justify-center text-xs font-bold rounded-xl transition-all border ${
                    playbackRate !== 1
                      ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700"
                      : "bg-stone-100/80 text-stone-700 border-transparent dark:bg-stone-800/50 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700/60"
                  }`}
                  title="سرعة التلاوة"
                >
                  <Gauge className="w-3.5 h-3.5 ml-1" />
                  <span>{playbackRate}x</span>
                </button>

                {/* Repeat Loop */}
                <button
                  onClick={() => setLoop(!loop)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${
                    loop
                      ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 shadow-sm"
                      : "bg-stone-100/80 text-stone-700 border-transparent dark:bg-stone-800/50 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700/60"
                  }`}
                  title={loop ? "التكرار مفعّل للسورة" : "تكرار السورة"}
                >
                  <Repeat className="w-4 h-4" />
                </button>

                {/* Volume Button with Popout/Slider */}
                <div
                  className="relative hidden sm:flex items-center"
                  onMouseEnter={() => setShowVolumeSlider(true)}
                  onMouseLeave={() => setShowVolumeSlider(false)}
                >
                  <button
                    onClick={toggleMute}
                    className="w-10 h-10 rounded-xl flex items-center justify-center bg-stone-100/80 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700/60 transition-colors"
                    title={isMuted ? "إلغاء كتم الصوت" : "كتم الصوت"}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-red-500" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>

                  {/* Volume Slider Popover */}
                  {showVolumeSlider && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white dark:bg-stone-800 p-2 rounded-xl shadow-lg border border-amber-500/20 flex flex-col items-center gap-1 z-20">
                      <span className="text-[10px] font-mono text-stone-500">
                        {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setVolume(v);
                          if (isMuted && v > 0) setIsMuted(false);
                        }}
                        className="w-20 accent-amber-500 cursor-pointer h-1.5"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Center Group: Navigation & Hero Play/Pause Button */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Previous Surah */}
                {onPlayPrev && (
                  <button
                    onClick={onPlayPrev}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center bg-stone-100/90 dark:bg-stone-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-stone-700 dark:text-stone-200 transition-all active:scale-95"
                    title="السورة السابقة"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>
                )}

                {/* Rewind 10 Seconds */}
                <button
                  onClick={skipBack10}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center bg-stone-100/90 dark:bg-stone-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-stone-700 dark:text-stone-200 transition-all active:scale-95"
                  title="رجوع 10 ثوانٍ"
                >
                  <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* HERO PLAY / PAUSE BUTTON */}
                <button
                  onClick={error ? retry : togglePlay}
                  disabled={loading}
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-[0_8px_25px_rgba(245,158,11,0.45)] text-white transition-all active:scale-95 ${
                    loading
                      ? "bg-stone-400 animate-pulse"
                      : error
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 hover:scale-105"
                  }`}
                  title={error ? "إعادة المحاولة" : isPlaying ? "إيقاف مؤقت" : "تشغيل"}
                >
                  {loading ? (
                    <Loader2 className="w-7 h-7 animate-spin" />
                  ) : error ? (
                    <RotateCcw className="w-7 h-7" />
                  ) : isPlaying ? (
                    <Pause className="w-7 h-7" />
                  ) : (
                    <Play className="w-7 h-7 ml-1" />
                  )}
                </button>

                {/* Fast-Forward 10 Seconds */}
                <button
                  onClick={skipForward10}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center bg-stone-100/90 dark:bg-stone-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-stone-700 dark:text-stone-200 transition-all active:scale-95"
                  title="تقديم 10 ثوانٍ"
                >
                  <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Next Surah */}
                {onPlayNext && (
                  <button
                    onClick={onPlayNext}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center bg-stone-100/90 dark:bg-stone-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-stone-700 dark:text-stone-200 transition-all active:scale-95"
                    title="السورة التالية"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Right Group: Mobile Mute Toggle & Quick Jump Badges */}
              <div className="flex items-center gap-1 sm:hidden">
                <button
                  onClick={toggleMute}
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-stone-100/80 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300"
                  title={isMuted ? "إلغاء الكتم" : "كتم"}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-red-500" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Desktop Place-keeper to balance layout */}
              <div className="hidden sm:flex items-center gap-2 opacity-0 pointer-events-none w-[116px]">
                <div className="w-10 h-10" />
              </div>

            </div>
          </div>
        </div>
        <SurahDownloadModal
          isOpen={downloadModalOpen}
          onClose={() => setDownloadModalOpen(false)}
          surahNumber={surahNumber}
          surahName={surahName}
          progressData={downloadProgressData}
          onCancel={() => {
            downloadAbortRef.current?.abort();
            setIsDownloading(false);
            setDownloadModalOpen(false);
          }}
          onRetry={() => {
            void handleOfflineDownload();
          }}
        />
        {audioElement}
      </div>
    );
  }
);

CustomPlayer.displayName = "CustomPlayer";

export default CustomPlayer;
