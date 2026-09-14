import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { X, Play, Pause, Music, Repeat, SkipForward, SkipBack, RotateCcw } from "lucide-react";
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

  const CustomPlayer = forwardRef<CustomPlayerHandle, Props>(
    ({ surahName, surahNumber, audioSrc, isCustom = false, initialTime = 0, onClose, onTimeUpdate, onPlayNext, onPlayPrev, autoNext = false, onToggleAutoNext, onPlayingChange }, ref) => {
      const { requestPlay, notifyStop, registerAudio, unregisterAudio } = useAudioContext();
      const audioRef = useRef<HTMLAudioElement>(null);
      const [isPlaying, setIsPlaying] = useState(false);
      const [duration, setDuration] = useState(0);
      const [current, setCurrent] = useState(initialTime);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(false);
      const [loop, setLoop] = useState(false);
      const [fallbackToCloud, setFallbackToCloud] = useState(false);
      const initialTimeApplied = useRef(false);

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
            audioRef.current.load();
            setTimeout(() => {
              if (active && audioRef.current) {
                audioRef.current.play().catch(() => {});
              }
            }, 500);

            // Legendary feature: Aggressively cache the audio in the background!
            // If the internet is weak, the <audio> stream might stutter, but fetch() is robust.
            // By caching it, subsequent plays or repeats will be instant and completely offline.
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

      useEffect(() => {
        if (audioRef.current) audioRef.current.loop = loop;
      }, [loop]);

      useEffect(() => {
        onPlayingChange?.(isPlaying);
      }, [isPlaying, onPlayingChange]);
      useEffect(() => () => onPlayingChange?.(false), [onPlayingChange]);

      useEffect(() => {
        const a = audioRef.current;
        if (a) {
          registerAudio("audio-list", a);
        }
        return () => { unregisterAudio("audio-list"); };
      }, [registerAudio, unregisterAudio]);

      useEffect(() => {
        if (isPlaying) {
          updateMediaSession({
            title: `سورة ${surahName}`,
            artist: "القارئ حاج أيوب أمين",
            album: "المصحف المرتل برواية ورش",
            onPlay: () => { audioRef.current?.play().catch(() => {}); },
            onPause: () => { audioRef.current?.pause(); },
            onNext: onPlayNext,
            onPrev: onPlayPrev,
            onSeek: (t) => { if (audioRef.current) audioRef.current.currentTime = t; }
          });
          setMediaPlaybackState("playing");
        } else {
          setMediaPlaybackState("paused");
        }
      }, [isPlaying, surahName, onPlayNext, onPlayPrev]);

      useEffect(() => {
        const handleVisibility = () => {
          if (document.hidden && !isBackgroundAudioEnabled()) {
            audioRef.current?.pause();
          }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
      }, []);

      useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        const handlePause = () => {
          if (isPlaying) setIsPlaying(false);
        };
        a.addEventListener("pause", handlePause);
        return () => a.removeEventListener("pause", handlePause);
      }, [isPlaying]);

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

      const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current;
        if (!audio) return;
        const t = (parseFloat(e.target.value) / 100) * (duration || 0);
        audio.currentTime = t;
        setCurrent(t);
      };

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

      const handleClosePlayer = () => {
        if (audioRef.current) {
          audioRef.current.pause();
          notifyStop("audio-list");
        }
        onClose();
      };

      const progress = duration > 0 ? (current / duration) * 100 : 0;

      return (
        <div className="fixed bottom-[68px] left-0 right-0 z-50 px-3 pb-2 md:max-w-2xl md:left-1/2 md:-translate-x-1/2">
          <div
            className="rounded-3xl shadow-2xl overflow-hidden border border-accent/25"
            style={{
              background: "linear-gradient(135deg, hsl(var(--card) / 0.97), hsl(var(--secondary) / 0.95))",
              backdropFilter: "blur(20px) saturate(140%)",
              WebkitBackdropFilter: "blur(20px) saturate(140%)",
            }}
          >
            {/* Top row: artwork + surah info + close */}
            <div className="flex items-center gap-3 px-4 pt-3 pb-1">
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30">
                <span className="text-white font-black text-lg tabular-nums">
                  {isCustom ? "🎤" : surahNumber}
                </span>
                <span className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-card text-accent flex items-center justify-center shadow-soft ring-1 ring-accent/20"><Music className="w-3 h-3" /></span>
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="font-bold text-foreground font-amiri text-lg leading-tight truncate">
                  {isCustom ? surahName : `سورة ${surahName}`}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isPlaying ? (
                    <span className="flex items-center gap-[2px] h-3">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="w-[2px] bg-accent rounded-full animate-wave"
                          style={{ animationDelay: `${i * 0.12}s` }}
                        />
                      ))}
                    </span>
                  ) : (
                    <Music className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {loading ? "جاري التحميل..." : error ? (navigator.onLine ? "تعذّر التحميل — اضغط للإعادة" : "لا يوجد إنترنت — حمّل التلاوات من الإعدادات") : isPlaying ? "جاري التشغيل" : "جاهز"}
                  </span>
                </div>
              </div>

              <button
                onClick={handleClosePlayer}
                className="w-8 h-8 rounded-full bg-foreground/5 text-muted-foreground flex items-center justify-center hover:bg-foreground/10 hover:text-foreground transition-all shrink-0 active:scale-95"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="px-4 pt-2">
              <div className="relative h-2 bg-foreground/10 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={progress}
                onChange={seek}
                className="w-full h-6 opacity-0 absolute -mt-4 cursor-pointer"
                dir="ltr"
                aria-label="موضع التشغيل"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums mt-1" dir="ltr">
                <span className="text-accent font-bold">{formatTime(current)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls row */}
            <div className="px-4 pb-3 pt-1 flex items-center justify-between">
              
              {/* Left group: Repeat / AutoNext */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLoop(!loop)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    loop
                      ? "bg-accent/20 text-accent"
                      : "bg-foreground/5 text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label="تكرار"
                  title={loop ? "إيقاف التكرار" : "تكرار السورة"}
                >
                  <Repeat className="w-4 h-4" />
                </button>
                {onToggleAutoNext && (
                  <button
                    onClick={onToggleAutoNext}
                    className={`px-2.5 h-9 rounded-full flex items-center justify-center gap-1 text-[10px] font-bold transition-all ${
                      autoNext
                        ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                        : "bg-foreground/5 text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                    title={autoNext ? "إيقاف التشغيل التلقائي" : "تشغيل التالي تلقائياً"}
                  >
                    تلقائي
                  </button>
                )}
              </div>

              {/* Center: -10, Play, +10 */}
              <div className="flex items-center gap-3">
                <button
                  onClick={skipBack}
                  className="w-10 h-10 rounded-full bg-foreground/5 text-muted-foreground flex items-center justify-center hover:text-foreground transition-colors text-xs font-bold"
                  aria-label="رجوع 10 ثوانٍ"
                >
                  -10
                </button>

                <button
                  onClick={error ? retry : togglePlay}
                  disabled={loading}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={error ? "إعادة المحاولة" : isPlaying ? "إيقاف" : "تشغيل"}
                >
                  {error ? <RotateCcw className="w-6 h-6" /> : isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 mr-[-2px]" />}
                </button>

                <button
                  onClick={skipForward}
                  className="w-10 h-10 rounded-full bg-foreground/5 text-muted-foreground flex items-center justify-center hover:text-foreground transition-colors text-xs font-bold"
                  aria-label="تقدم 10 ثوانٍ"
                >
                  +10
                </button>
              </div>

              {/* Right group: Prev / Next */}
              <div className="flex items-center gap-2">
                {onPlayPrev && (
                  <button
                    onClick={onPlayPrev}
                    className="w-9 h-9 rounded-full bg-foreground/5 text-muted-foreground flex items-center justify-center hover:text-foreground transition-colors"
                    aria-label="السورة السابقة"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                )}
                {onPlayNext && (
                  <button
                    onClick={onPlayNext}
                    className="w-9 h-9 rounded-full bg-foreground/5 text-muted-foreground flex items-center justify-center hover:text-foreground transition-colors"
                    aria-label="السورة التالية"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                )}
              </div>
              
            </div>

            <audio
              ref={audioRef}
              preload="auto"
              onLoadedMetadata={(e) => {
                const a = e.target as HTMLAudioElement;
                setDuration(a.duration);
                setLoading(false);
                if (!initialTimeApplied.current && initialTime > 0 && initialTime < a.duration) {
                  a.currentTime = initialTime;
                  setCurrent(initialTime);
                }
                initialTimeApplied.current = true;
              }}
              onCanPlay={() => setLoading(false)}
              onTimeUpdate={(e) => {
                const t = (e.target as HTMLAudioElement).currentTime;
                setCurrent(t);
                onTimeUpdate?.(t);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                onTimeUpdate?.(0);
                if (!loop && autoNext && onPlayNext) {
                  onPlayNext();
                }
              }}
              onError={() => {
                if (!fallbackToCloud) {
                  setFallbackToCloud(true);
                } else {
                  setError(true);
                  setLoading(false);
                }
              }}
            />
          </div>
        </div>
      );
    }
  );

CustomPlayer.displayName = "CustomPlayer";

export default CustomPlayer;
