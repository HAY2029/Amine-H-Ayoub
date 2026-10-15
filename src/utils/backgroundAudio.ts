/**
 * إدارة تشغيل الصوت في الخلفية والتحكم من شاشة القفل / شريط الإشعارات
 * Background Audio & Media Session Controller
 */

const BG_AUDIO_KEY = "mushaf:backgroundAudioEnabled";

/**
 * هل تشغيل الصوت في الخلفية وعند إطفاء الشاشة مفعّل؟ (الافتراضي: نعم)
 */
export function isBackgroundAudioEnabled(): boolean {
  try {
    const val = localStorage.getItem(BG_AUDIO_KEY);
    return val === null ? true : val === "1";
  } catch {
    return true;
  }
}

/**
 * تغيير إعداد تشغيل الصوت في الخلفية
 */
export function setBackgroundAudioEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(BG_AUDIO_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("mushaf:backgroundaudio"));
  }
}

export interface MediaSessionOptions {
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onSeek?: (time: number) => void;
}

/**
 * تحديث معلومات شاشة القفل وشريط الإشعارات (Media Session API)
 */
export function updateMediaSession(opts: MediaSessionOptions): void {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) {
    return;
  }

  try {
    const defaultArtwork = [
      { src: opts.artworkUrl || "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
      { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/my-photo.png", sizes: "512x512", type: "image/png" }
    ];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: opts.title || "تلاوة القرآن الكريم",
      artist: opts.artist || "القرآن الكريم",
      album: opts.album || "المصحف المرتل برواية ورش",
      artwork: defaultArtwork,
    });

    if (opts.onPlay) {
      navigator.mediaSession.setActionHandler("play", () => {
        opts.onPlay?.();
      });
    }

    if (opts.onPause) {
      navigator.mediaSession.setActionHandler("pause", () => {
        opts.onPause?.();
      });
    }

    if (opts.onPrev) {
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        opts.onPrev?.();
      });
    }

    if (opts.onNext) {
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        opts.onNext?.();
      });
    }

    if (opts.onSeek) {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) {
          opts.onSeek?.(details.seekTime);
        }
      });
    }

    navigator.mediaSession.playbackState = "playing";
  } catch (e) {
    console.warn("MediaSession update error:", e);
  }
}

/**
 * تعيين حالة المشغل (playing / paused / none)
 */
export function setMediaPlaybackState(state: "playing" | "paused" | "none"): void {
  if (typeof window !== "undefined" && "mediaSession" in navigator) {
    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      /* ignore */
    }
  }
}
