import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Play, Pause, Maximize2, Minimize2, X, Pencil, Check, Shuffle, Mic, Headphones, Baby } from "lucide-react";
import { getSavedTimings, getSurahTimings, getAyahStartTime, hasKidsSection } from "@/data/ayahTimings";
import { getSurahAudioUrl, hasCloudAudio, getFallbackAudioUrl } from "@/data/audioUrls";
import { getPageAyahBoxes, PAGE_IMAGE_SIZE } from "@/data/ayahCoordinates";
import { supabase } from "@/lib/supabase";

const audioPath = (n: number) => (hasCloudAudio(n) ? getSurahAudioUrl(n) : getFallbackAudioUrl(n));

// === Page naming from settings ===
const PAGE_NAMES_KEY = "mushaf:pageNames:v1";

function getCustomPageNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PAGE_NAMES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveCustomPageName(pageSrc: string, name: string) {
  const all = getCustomPageNames();
  if (name.trim()) {
    all[pageSrc] = name.trim();
  } else {
    delete all[pageSrc];
  }
  localStorage.setItem(PAGE_NAMES_KEY, JSON.stringify(all));
  try {
    await supabase.from("store").upsert({ key: PAGE_NAMES_KEY, value: all });
  } catch (e) {
    console.error("Save page name error:", e);
  }
}

function getPageDisplayName(page: { name: string; src: string }): string {
  const custom = getCustomPageNames();
  return custom[page.src] || page.name;
}

type Speaker = "teacher" | "kids";
type PlayMode = "teacher" | "kids";

const STORAGE_KEY = "mushaf:lastPage";
const MUSHAF_LAST_SURAH = "mushaf:lastSurah";
const MUSHAF_LAST_TIME = "mushaf:lastTime";

interface SurahAudio { name: string; number: number; src: string; ayahCount: number; }
interface PageInfo { name: string; src: string; surahs: SurahAudio[]; }

const pages: PageInfo[] = [
  { name: "الفاتحة", src: "/pages/fatiha.jpg", surahs: [
    { name: "الفاتحة", number: 1, src: audioPath(1), ayahCount: 7 },
  ]},
  { name: "القارعة - التكاثر", src: "/pages/600.jpg", surahs: [
    { name: "التكاثر", number: 14, src: audioPath(14), ayahCount: 8 },
  ]},
  { name: "العصر - الهمزة - الفيل", src: "/pages/601.jpg", surahs: [
    { name: "العصر", number: 13, src: audioPath(13), ayahCount: 3 },
    { name: "الهمزة", number: 12, src: audioPath(12), ayahCount: 9 },
    { name: "الفيل", number: 11, src: audioPath(11), ayahCount: 5 },
  ]},
  { name: "قريش - الماعون - الكوثر", src: "/pages/602.jpg", surahs: [
    { name: "قريش", number: 10, src: audioPath(10), ayahCount: 4 },
    { name: "الماعون", number: 9, src: audioPath(9), ayahCount: 7 },
    { name: "الكوثر", number: 8, src: audioPath(8), ayahCount: 3 },
  ]},
  { name: "الكافرون - النصر - المسد", src: "/pages/603.jpg", surahs: [
    { name: "الكافرون", number: 7, src: audioPath(7), ayahCount: 6 },
    { name: "النصر", number: 6, src: audioPath(6), ayahCount: 3 },
    { name: "المسد", number: 5, src: audioPath(5), ayahCount: 5 },
  ]},
  { name: "الإخلاص - الفلق - الناس", src: "/pages/604.jpg", surahs: [
    { name: "الإخلاص", number: 4, src: audioPath(4), ayahCount: 4 },
    { name: "الفلق", number: 3, src: audioPath(3), ayahCount: 5 },
    { name: "الناس", number: 2, src: audioPath(2), ayahCount: 6 },
  ]},
];

const speakerColors: Record<Speaker, { bg: string; glow: string; text: string }> = {
  teacher: { bg: "rgba(250,204,21,0.30)", glow: "rgba(250,204,21,0.55)", text: "#b45309" },
  kids:    { bg: "rgba(56,189,248,0.30)", glow: "rgba(56,189,248,0.55)", text: "#0369a1" },
};

const previewHighlight = "rgba(250,204,21,0.14)";
const previewStroke = "hsl(var(--accent) / 0.28)";

interface Props { onBack: () => void; }

const MushafPage = ({ onBack }: Props) => {
  const [currentPage, setCurrentPage] = useState(() => {
    const s = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    return isNaN(s) || s < 0 || s >= pages.length ? 0 : s;
  });
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 1024 : false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Audio state
  const [activeSurah, setActiveSurah] = useState<SurahAudio | null>(null);
  const [selectedSurahIdx, setSelectedSurahIdx] = useState(0);
  const [selectedAyah, setSelectedAyah] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, _setPlayMode] = useState<PlayMode>("teacher");
  const [continuousPlay, _setContinuousPlay] = useState(true);
  const [repeatCount, _setRepeatCount] = useState(0);

  // === REFS that mirror state for use inside callbacks (avoids stale closures) ===
  const playModeRef = useRef<PlayMode>(playMode);
  const continuousPlayRef = useRef(continuousPlay);
  const repeatCountRef = useRef(repeatCount);

  // Wrapper setters that keep refs in sync
  const setPlayMode = useCallback((v: PlayMode | ((prev: PlayMode) => PlayMode)) => {
    _setPlayMode(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      playModeRef.current = next;
      return next;
    });
  }, []);
  const setContinuousPlay = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    _setContinuousPlay(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      continuousPlayRef.current = next;
      return next;
    });
  }, []);
  const setRepeatCount = useCallback((v: number | ((prev: number) => number)) => {
    _setRepeatCount(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      repeatCountRef.current = next;
      return next;
    });
  }, []);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSavedTimeRef = useRef(0);
  const stopAtRef = useRef<number | null>(null);
  const currentRepeatRef = useRef(0);
  const currentAyahRef = useRef(-1);
  const currentBoxIndexRef = useRef(-1);
  const currentSpeakerRef = useRef<Speaker>("teacher");
  const requestRef = useRef<number>();
  const isHandlingSegmentEndRef = useRef(false);
  const handleAyahSegmentEndRef = useRef<(() => void) | null>(null);
  const isSeekingRef = useRef(false);
  const expectedStartTimeRef = useRef(0);

  const [syncTrigger, setSyncTrigger] = useState(0);
  const [activeMenuAyah, setActiveMenuAyah] = useState<{ surah: SurahAudio; ayah: number; label?: string; boxIndex?: number } | null>(null);

  // Page naming state
  const [editingPageName, setEditingPageName] = useState(false);
  const [tempPageName, setTempPageName] = useState("");
  const [pageNamesVersion, setPageNamesVersion] = useState(0);

  const currentPageName = useMemo(() => {
    void pageNamesVersion;
    return getPageDisplayName(pages[currentPage] || pages[0]);
  }, [currentPage, pageNamesVersion]);

  const handleSavePageName = useCallback(async () => {
    const page = pages[currentPage];
    if (page) {
      await saveCustomPageName(page.src, tempPageName);
      setPageNamesVersion(v => v + 1);
    }
    setEditingPageName(false);
  }, [currentPage, tempPageName]);

  const handleStartEditPageName = useCallback(() => {
    setTempPageName(currentPageName);
    setEditingPageName(true);
  }, [currentPageName]);

  useEffect(() => {
    const r = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", r); return () => window.removeEventListener("resize", r);
  }, []);

  // Re-render immediately when Supabase server sync completes
  useEffect(() => {
    const handleSync = () => setSyncTrigger(prev => prev + 1);
    window.addEventListener("mushaf:sync_complete", handleSync);
    return () => window.removeEventListener("mushaf:sync_complete", handleSync);
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, String(currentPage)); }, [currentPage]);

  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setActiveSurah(null); setIsPlaying(false); currentAyahRef.current = -1; currentBoxIndexRef.current = -1;
    setSelectedSurahIdx(0); setSelectedAyah(-1);
    stopAtRef.current = null; currentRepeatRef.current = 0;
    setEditingPageName(false);
    document.querySelectorAll('.ayah-rect').forEach(r => {
      const el = r as SVGRectElement;
      el.style.fill = previewHighlight;
      el.style.stroke = previewStroke;
      el.style.strokeWidth = "1.5";
      el.classList.remove('animate-pulse');
    });
  }, [currentPage]);

  // Resume last surah (once)
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const savedNum = parseInt(localStorage.getItem(MUSHAF_LAST_SURAH) || "0", 10);
    const savedTime = parseFloat(localStorage.getItem(MUSHAF_LAST_TIME) || "0");
    if (!savedNum) return;
    const surahIdx = pages[currentPage]?.surahs.findIndex(s => s.number === savedNum) ?? -1;
    if (surahIdx === -1) return;
    const surah = pages[currentPage].surahs[surahIdx];
    const a = audioRef.current; if (!a) return;
    a.src = surah.src; a.load();
    setActiveSurah(surah);
    setSelectedSurahIdx(surahIdx);
    a.addEventListener("loadedmetadata", () => {
      if (savedTime > 0 && savedTime < a.duration) {
        a.currentTime = savedTime;
        lastSavedTimeRef.current = savedTime;
      }
    }, { once: true });
  }, [currentPage]);

  // Fullscreen API
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen request denied or not supported
    }
  }, []);
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // Navigation
  const step = isDesktop ? 2 : 1;
  const goToPage = useCallback((i: number) => { if (i >= 0 && i < pages.length) setCurrentPage(i); }, []);
  const goPrev = useCallback(() => goToPage(Math.max(0, currentPage - step)), [currentPage, step, goToPage]);
  const goNext = useCallback(() => goToPage(Math.min(pages.length - 1, currentPage + step)), [currentPage, step, goToPage]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goPrev();
      if (e.key === "ArrowLeft") goNext();
      if (e.key === "Escape") { if (controlsOpen) setControlsOpen(false); else onBack(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [currentPage, isDesktop, controlsOpen, goPrev, goNext, onBack]);

  // Swipe nav + swipe-up to open controls
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);
  const onTS = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
    touchY.current = e.touches[0].clientY;
  };
  const onTE = (e: React.TouchEvent) => {
    if (touchX.current === null || touchY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    const dy = e.changedTouches[0].clientY - touchY.current;
    touchX.current = null; touchY.current = null;
    // swipe up → open control panel
    if (dy < -60 && Math.abs(dy) > Math.abs(dx)) {
      setControlsOpen(true);
      return;
    }
    // swipe down → close control panel
    if (dy > 60 && Math.abs(dy) > Math.abs(dx)) {
      setControlsOpen(false);
      return;
    }
    // swipe horizontally → page nav
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) goPrev(); else goNext();
      return;
    }
    // double tap detection (for fullscreen) — only when not tapping an ayah hotspot
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        toggleFullscreen();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  };

  const clearAllHighlights = useCallback(() => {
    const rects = document.querySelectorAll('.ayah-rect');
    rects.forEach(r => {
      const el = r as SVGRectElement;
      el.style.fill = previewHighlight;
      el.style.stroke = previewStroke;
      el.style.strokeWidth = "1.5";
      el.classList.remove('animate-pulse');
    });
  }, []);

  const highlightAyah = useCallback((surah: number, ayah: number, speaker: Speaker) => {
    clearAllHighlights();
    const selector = `.ayah-rect-${surah}-${ayah}`;
    const boxes = document.querySelectorAll(selector);
    boxes.forEach(r => {
      const el = r as SVGRectElement;
      el.style.fill = speakerColors[speaker].bg;
      el.style.stroke = speakerColors[speaker].glow;
      el.style.strokeWidth = "5";
      el.classList.add('animate-pulse');
    });
  }, [clearAllHighlights]);

  // ---- Ayah-by-ayah playback ----
  // forceSpeaker: override speaker for this particular play call (used in "both" mode)
  const playAyah = useCallback((surah: SurahAudio, ayahNum: number, forceSpeaker?: Speaker, boxIndex?: number) => {
    const a = audioRef.current; if (!a) return;
    const sameSrc = a.src && a.src.endsWith(surah.src.split("/").pop() || surah.src);

    setActiveSurah(surah);
    currentAyahRef.current = ayahNum;
    currentBoxIndexRef.current = boxIndex ?? -1;
    stopAtRef.current = null;

    const startPlayback = () => {
      const sp: Speaker = forceSpeaker ?? "teacher";
      currentSpeakerRef.current = sp;

      const timings = getSurahTimings(surah.number);
      const segments = timings?.segments || [];

      let startT = 0;
      let nextT = a.duration || 1e9;
      let foundTimingInBox = false;

      const pageBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
      const surahBoxes = pageBoxes.filter(b => b.surah === surah.number);
      const box = surahBoxes.find(b => b.ayah === ayahNum);

      if (box) {
         if (sp === "teacher" && box.audioStart !== undefined && box.audioEnd !== undefined) {
             startT = box.audioStart;
             nextT = box.audioEnd;
             foundTimingInBox = true;
         } else if (sp === "kids" && box.kidsStart !== undefined && box.kidsEnd !== undefined) {
             startT = box.kidsStart;
             nextT = box.kidsEnd;
             foundTimingInBox = true;
         }
      }

      if (!foundTimingInBox) {
        if (segments.length > 0) {
          const speakerSegments = segments.filter(s => s.speaker === sp).sort((a, b) => a.start - b.start);
          const segIdx = ayahNum > 0 ? ayahNum - 1 : 0;
          const seg = speakerSegments[segIdx];
          if (seg) {
            startT = seg.start;
            nextT = seg.end;
          } else {
            setIsPlaying(false);
            stopAtRef.current = null;
            return;
          }
        } else {
          const list = sp === "kids" && timings?.kids ? timings.kids : timings?.teacher || [];
          const segIdx = ayahNum > 0 ? ayahNum - 1 : 0;

          if (list[segIdx] !== undefined) {
            startT = list[segIdx];
            nextT = list[segIdx + 1] !== undefined ? list[segIdx + 1] : a.duration || 1e9;
            if (sp === "teacher" && timings?.kidsStart !== undefined && nextT > timings.kidsStart) {
              nextT = timings.kidsStart;
            }
            if (sp === "teacher" && timings?.kids && timings.kids[segIdx] !== undefined) {
              const kidStartT = timings.kids[segIdx];
              if (kidStartT > startT && kidStartT < nextT) {
                nextT = kidStartT;
              }
            }
            if (sp === "kids" && timings?.teacher && timings.teacher[segIdx + 1] !== undefined) {
              const nextTeacherStart = timings.teacher[segIdx + 1];
              if (nextTeacherStart > startT && nextTeacherStart < nextT) {
                nextT = nextTeacherStart;
              }
            }
          } else {
            // Linear estimation fallback when no timings exist
            const total = surah.ayahCount;
            if (total > 0 && a.duration > 0 && isFinite(a.duration)) {
              const ayahDur = a.duration / total;
              startT = ayahDur * segIdx;
              nextT = ayahDur * (segIdx + 1);
            } else {
              setIsPlaying(false);
              stopAtRef.current = null;
              return;
            }
          }
        }
      }

      stopAtRef.current = Math.max(nextT, startT + 0.1);
      isSeekingRef.current = true;
      expectedStartTimeRef.current = startT;
      a.currentTime = startT;
      a.play().then(() => {
        setIsPlaying(true);
        // ضمان إعادة تشغيل حلقة التتبع لكل مقطع جديد (تكرار/طفل/آية تالية)
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = requestAnimationFrame(trackAudio);
      }).catch(console.error);
    };

    setControlsOpen(false);

    if (!sameSrc) {
      a.src = surah.src;
      a.load();
      a.addEventListener("loadedmetadata", startPlayback, { once: true });
    } else {
      if (a.duration > 0) startPlayback();
      else a.addEventListener("loadedmetadata", startPlayback, { once: true });
    }
  }, [currentPage]);

  // compute end time of an ayah for a given speaker (start of next ayah, or boundary)
  const computeAyahEnd = (surah: SurahAudio, ayahNum: number, speaker: Speaker, dur: number): number => {
    const total = surah.ayahCount;
    if (ayahNum < total) {
      return getAyahStartTime(surah.number, ayahNum + 1, dur, speaker);
    }
    // last ayah: end at kidsStart (if teacher on combined file) or audio end
    if (speaker === "teacher" && hasKidsSection(surah.number)) {
      // import inline: we don't have direct access to kidsStart constant; compute via getAyahStartTime kids[1]
      const kidsFirst = getAyahStartTime(surah.number, 1, dur, "kids");
      if (kidsFirst > 0) return kidsFirst;
    }
    return dur || 1e9;
  };

  const trackAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a || !activeSurah) return;

    if (a.seeking) return;
    if (isSeekingRef.current) {
      if (Math.abs(a.currentTime - expectedStartTimeRef.current) < 0.15) {
        isSeekingRef.current = false;
      } else {
        return;
      }
    }

    if (stopAtRef.current !== null && a.currentTime >= stopAtRef.current - 0.05) {
      if (!isHandlingSegmentEndRef.current) {
        isHandlingSegmentEndRef.current = true;
        a.pause();
        setIsPlaying(false);
        handleAyahSegmentEndRef.current?.();
      }
      return;
    }

    const pageBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
    const surahBoxes = pageBoxes.filter(b => b.surah === activeSurah.number);

    let activeBox = null;
    let foundSpeaker: Speaker | null = null;
    let activeBoxGlobalIndex = -1;

    for (let i = 0; i < pageBoxes.length; i++) {
      const box = pageBoxes[i];
      if (box.surah !== activeSurah.number) continue;

      if (box.audioStart !== undefined && box.audioEnd !== undefined && a.currentTime >= box.audioStart && a.currentTime <= box.audioEnd) {
        activeBox = box;
        foundSpeaker = "teacher";
        activeBoxGlobalIndex = i;
        break;
      }
      if (box.kidsStart !== undefined && box.kidsEnd !== undefined && a.currentTime >= box.kidsStart && a.currentTime <= box.kidsEnd) {
        activeBox = box;
        foundSpeaker = "kids";
        activeBoxGlobalIndex = i;
        break;
      }
    }

    if (activeBox && foundSpeaker) {
      if (activeBoxGlobalIndex !== currentBoxIndexRef.current || foundSpeaker !== currentSpeakerRef.current) {
        currentAyahRef.current = activeBox.ayah;
        currentBoxIndexRef.current = activeBoxGlobalIndex;
        currentSpeakerRef.current = foundSpeaker;
        highlightAyah(activeSurah.number, activeBox.ayah, foundSpeaker);
      }
    } else {
      const timings = getSurahTimings(activeSurah.number);
      const segments = timings?.segments || [];
      if (segments.length > 0) {
        const activeSeg = segments.find(s => a.currentTime >= s.start && a.currentTime <= s.end);
        if (activeSeg) {
          const speakerSegments = segments.filter(s => s.speaker === activeSeg.speaker).sort((a, b) => a.start - b.start);
          const ayahIdx = speakerSegments.findIndex(s => s.id === activeSeg.id);
          const sortedBoxes = [...surahBoxes].sort((a, b) => a.ayah - b.ayah);
          const matchingBox = sortedBoxes[ayahIdx] || surahBoxes.find(b => b.ayah === (ayahIdx + 1));
          const ayahNumber = matchingBox?.ayah ?? (ayahIdx + 1);
          const globalIdx = matchingBox ? pageBoxes.indexOf(matchingBox) : -1;

          if (ayahNumber !== currentAyahRef.current || activeSeg.speaker !== currentSpeakerRef.current || currentBoxIndexRef.current !== globalIdx) {
            currentAyahRef.current = ayahNumber;
            currentBoxIndexRef.current = globalIdx;
            currentSpeakerRef.current = activeSeg.speaker;
            highlightAyah(activeSurah.number, ayahNumber, activeSeg.speaker);
          }
        } else {
          if (currentAyahRef.current !== -1) {
            currentAyahRef.current = -1;
            currentBoxIndexRef.current = -1;
            clearAllHighlights();
          }
        }
      } else {
        if (timings && timings.teacher.length > 0) {
          let speaker: Speaker = "teacher";
          if (timings.kidsStart !== undefined && a.currentTime >= timings.kidsStart) {
            speaker = "kids";
          }
          const list = speaker === "kids" && timings.kids ? timings.kids : timings.teacher;
          let idx = 0;
          for (let i = 0; i < list.length; i++) {
            if (list[i] <= a.currentTime + 0.05) idx = i;
            else break;
          }
          const sortedBoxes = [...surahBoxes].sort((a, b) => a.ayah - b.ayah);
          const actualCount = Math.max(...surahBoxes.map(b => b.ayah));
          const fallbackNumber = Math.min(idx + 1, actualCount);
          const matchingBox = sortedBoxes[idx] || surahBoxes.find(b => b.ayah === fallbackNumber);
          const ayahNumber = matchingBox?.ayah ?? fallbackNumber;
          const globalIdx = matchingBox ? pageBoxes.indexOf(matchingBox) : -1;

          if (ayahNumber !== currentAyahRef.current || speaker !== currentSpeakerRef.current || currentBoxIndexRef.current !== globalIdx) {
            currentAyahRef.current = ayahNumber;
            currentBoxIndexRef.current = globalIdx;
            currentSpeakerRef.current = speaker;
            highlightAyah(activeSurah.number, ayahNumber, speaker);
          }
        } else {
          // Linear estimation fallback when no timings exist
          const total = activeSurah.ayahCount;
          if (total > 0 && a.duration > 0 && isFinite(a.duration)) {
            const ayahDur = a.duration / total;
            const idx = Math.min(Math.floor(a.currentTime / ayahDur), total - 1);
            const sortedBoxes = [...surahBoxes].sort((a, b) => a.ayah - b.ayah);
            const matchingBox = sortedBoxes[idx] || surahBoxes.find(b => b.ayah === idx + 1);
            if (matchingBox) {
              const ayahNumber = matchingBox.ayah;
              const globalIdx = pageBoxes.indexOf(matchingBox);
              const speaker = currentSpeakerRef.current || "teacher";
              if (ayahNumber !== currentAyahRef.current || speaker !== currentSpeakerRef.current || currentBoxIndexRef.current !== globalIdx) {
                currentAyahRef.current = ayahNumber;
                currentBoxIndexRef.current = globalIdx;
                currentSpeakerRef.current = speaker;
                highlightAyah(activeSurah.number, ayahNumber, speaker);
              }
            }
          }
        }
      }
    }

    if (Math.abs(a.currentTime - lastSavedTimeRef.current) >= 2) {
      lastSavedTimeRef.current = a.currentTime;
      localStorage.setItem(MUSHAF_LAST_SURAH, String(activeSurah.number));
      localStorage.setItem(MUSHAF_LAST_TIME, String(a.currentTime));
    }

    if (!a.paused) {
      requestRef.current = requestAnimationFrame(trackAudio);
    }
  }, [activeSurah, currentPage, highlightAyah, clearAllHighlights]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(trackAudio);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, trackAudio]);

  const advanceSurah = useCallback((sp: Speaker) => {
    if (!activeSurah) return;
    const page = pages[currentPage];
    const surahIdx = page.surahs.findIndex(s => s.number === activeSurah.number);
    if (surahIdx >= 0 && surahIdx < page.surahs.length - 1) {
      const nextSurah = page.surahs[surahIdx + 1];
      setSelectedSurahIdx(surahIdx + 1);

      const pageBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
      const nextSurahBoxes = pageBoxes.filter(b => b.surah === nextSurah.number).sort((a,b) => a.ayah - b.ayah);
      const firstAyah = nextSurahBoxes[0]?.ayah ?? 1;

      setSelectedAyah(firstAyah);
      playAyah(nextSurah, firstAyah, sp);
    } else {
      setIsPlaying(false);
      clearAllHighlights();
    }
  }, [activeSurah, currentPage, playAyah, clearAllHighlights]);

  const handleAyahSegmentEnd = useCallback(() => {
    stopAtRef.current = null;
    isHandlingSegmentEndRef.current = false;
    const a = audioRef.current; if (!a || !activeSurah) return;

    // === READ FROM REFS to always get the latest values (not stale closures) ===
    const mode = playModeRef.current;
    const repeat = repeatCountRef.current;
    const continuous = continuousPlayRef.current;

    const timings = getSurahTimings(activeSurah.number);
    const hasKids = timings?.segments?.some(s => s.speaker === "kids") || timings?.kidsStart !== undefined;

    const advanceToNextSegment = (sp: Speaker) => {
      const pageBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
      const surahBoxesUnsorted = pageBoxes.filter(b => b.surah === activeSurah.number);
      const sortedBoxesWithIndex = surahBoxesUnsorted.map(b => ({ box: b, globalIndex: pageBoxes.indexOf(b) }))
        .sort((a, b) => a.box.ayah - b.box.ayah);

      let nextItem = null;
      let currentIndex = -1;

      if (currentBoxIndexRef.current !== -1) {
        currentIndex = sortedBoxesWithIndex.findIndex(item => item.globalIndex === currentBoxIndexRef.current);
      } else {
        currentIndex = sortedBoxesWithIndex.map(item => item.box.ayah).lastIndexOf(currentAyahRef.current);
      }

      for (let i = currentIndex + 1; i < sortedBoxesWithIndex.length; i++) {
        const candidate = sortedBoxesWithIndex[i];
        if (candidate.box.ayah === currentAyahRef.current) {
          const hasTimings = (sp === "teacher" && candidate.box.audioStart !== undefined && candidate.box.audioEnd !== undefined) ||
                             (sp === "kids" && candidate.box.kidsStart !== undefined && candidate.box.kidsEnd !== undefined);
          if (hasTimings) {
            nextItem = candidate;
            break;
          }
        } else if (candidate.box.ayah > currentAyahRef.current) {
          nextItem = candidate;
          break;
        }
      }

      if (nextItem) {
        setSelectedAyah(nextItem.box.ayah);
        playAyah(activeSurah, nextItem.box.ayah, sp);
      } else {
        advanceSurah(sp);
      }
    };

    // كشف صوت الطفل من صناديق المعايرة (مصدر منفصل عن getSurahTimings)
    const boxHasKids = pages
      .flatMap(p => getPageAyahBoxes(p.src))
      .some(b => b.surah === activeSurah.number && b.ayah === currentAyahRef.current
        && b.kidsStart !== undefined && b.kidsEnd !== undefined);
    const hasKidsEffective = hasKids || boxHasKids;

    const speakerForMode: Speaker = mode === "kids" ? "kids" : "teacher";

    if (currentRepeatRef.current < repeat) {
      currentRepeatRef.current++;
      playAyah(activeSurah, currentAyahRef.current, speakerForMode);
    } else {
      currentRepeatRef.current = 0;
      if (continuous) {
        advanceToNextSegment(speakerForMode);
      } else {
        setIsPlaying(false);
        clearAllHighlights();
      }
    }
  }, [activeSurah, playAyah, currentPage, advanceSurah, clearAllHighlights]);

  useEffect(() => {
    handleAyahSegmentEndRef.current = handleAyahSegmentEnd;
  }, [handleAyahSegmentEnd]);

  const handleEnded = () => {
    if (isHandlingSegmentEndRef.current) return;
    handleAyahSegmentEnd();
  };

  const togglePlayPause = () => {
    const a = audioRef.current; if (!a || !activeSurah) return;
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
    } else {
      if (currentAyahRef.current === -1) {
        const pageBoxes = getPageAyahBoxes(pages[currentPage]?.src || "");
        const surahBoxes = pageBoxes.filter(b => b.surah === activeSurah.number).sort((a,b) => a.ayah - b.ayah);
        const firstAyah = surahBoxes[0]?.ayah ?? 1;
        currentRepeatRef.current = 0;
        playAyah(activeSurah, firstAyah, playMode === "kids" ? "kids" : "teacher");
      } else {
        a.play().then(() => setIsPlaying(true)).catch(() => { });
      }
    }
  };



  const visiblePages = useMemo(() => {
    if (isDesktop) return [pages[currentPage], pages[currentPage + 1]].filter(Boolean) as PageInfo[];
    return [pages[currentPage]];
  }, [currentPage, isDesktop]);

  // Preload neighbors
  useEffect(() => {
    [currentPage - 1, currentPage + 1, currentPage + 2]
      .filter(i => i >= 0 && i < pages.length)
      .forEach(i => { const img = new Image(); img.src = pages[i].src; });
  }, [currentPage]);

  const currentPageSurahs = pages[currentPage]?.surahs || [];
  const selectedSurah = currentPageSurahs[selectedSurahIdx] || currentPageSurahs[0];
  const ayahCount = selectedSurah?.ayahCount || 0;

  // tap on image background → no longer opens controls (use swipe up). 
  // We keep a noop so users learn the swipe gesture via the hint.
  const onImageClick = () => { /* swipe up to open controls */ };

  return (
    <div
      className="fixed inset-0 w-screen h-screen z-50 bg-background overflow-hidden select-none"
      onTouchStart={onTS}
      onTouchEnd={onTE}
    >
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onSeeked={() => {
          const a = audioRef.current;
          if (a && Math.abs(a.currentTime - expectedStartTimeRef.current) < 0.15) {
            isSeekingRef.current = false;
          }
        }}
      />

      {/* Edge-to-edge image(s) with per-ayah tappable hotspots */}
      <div className="flex h-full w-full" dir="rtl" onClick={onImageClick}>
        {visiblePages.map((page, idx) => (
          <div
            key={`${page.src}-${idx}`}
            className="relative h-full flex-1 min-w-0 flex items-center justify-center bg-background overflow-hidden"
          >
            <div className="relative h-full w-full">
              <img
                src={page.src}
                alt={page.name}
                className="absolute inset-0 h-full w-full select-none animate-fade-in object-fill"
                loading="eager"
                decoding="async"
                draggable={false}
              />

              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${PAGE_IMAGE_SIZE.width} ${PAGE_IMAGE_SIZE.height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {getPageAyahBoxes(page.src).map((box, i) => (
                  <rect
                    key={`ayah-rect-${box.surah}-${box.ayah}-${i}`}
                    className={`ayah-rect ayah-rect-${box.surah}-${box.ayah} ayah-rect-idx-${i}`}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    rx="10"
                    fill={previewHighlight}
                    stroke={previewStroke}
                    strokeWidth={1.5}
                    style={{ mixBlendMode: "multiply", transition: "all 0.1s linear" }}
                  />
                ))}
              </svg>

              <div className="absolute inset-0">
                {getPageAyahBoxes(page.src).map((box, i) => {
                  const surah = page.surahs.find((s) => s.number === box.surah);
                  if (!surah) return null;
                  return (
                    <button
                      key={`${box.surah}-${box.ayah}-tap`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuAyah({ surah, ayah: box.ayah, label: box.label, boxIndex: i });
                      }}
                      className="absolute rounded-md outline-none transition-colors hover:bg-accent/10 active:bg-accent/20"
                      style={{
                        left: `${(box.x / PAGE_IMAGE_SIZE.width) * 100}%`,
                        top: `${(box.y / PAGE_IMAGE_SIZE.height) * 100}%`,
                        width: `${(box.width / PAGE_IMAGE_SIZE.width) * 100}%`,
                        height: `${(box.height / PAGE_IMAGE_SIZE.height) * 100}%`,
                      }}
                      aria-label={`${surah.name} - آية ${box.ayah}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Swipe-up hint (subtle, bottom center) */}
      {!controlsOpen && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-0.5 opacity-50 animate-pulse pointer-events-none">
          <div className="w-10 h-1 rounded-full bg-foreground/60" />
          <span className="text-[10px] font-bold text-foreground/70">اسحب للأعلى</span>
        </div>
      )}

      {/* Tiny transparent back button (top-right corner) */}
      <button
        onClick={(e) => { e.stopPropagation(); onBack(); }}
        className="absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center z-30 transition-opacity"
        style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(6px)", opacity: 0.35 }}
        aria-label="رجوع"
      >
        <ArrowRight className="w-4 h-4 text-foreground" />
      </button>

      {/* Tiny fullscreen toggle (top-left corner) */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
        className="absolute top-2 left-2 w-9 h-9 rounded-full flex items-center justify-center z-30 transition-opacity"
        style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(6px)", opacity: 0.35 }}
        aria-label="ملء الشاشة"
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

      {/* Page swipe hint dots (very subtle, bottom) */}
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1 z-20 opacity-25">
        {pages.map((_, i) => {
          const a = isDesktop ? i === currentPage || i === currentPage + 1 : i === currentPage;
          return <span key={i} className={`h-1 rounded-full ${a ? "bg-foreground w-4" : "bg-foreground/50 w-1"}`} />;
        })}
      </div>

      {/* Side nav arrows — only visible while controls open */}
      {controlsOpen && (
        <>
          <button onClick={(e) => { e.stopPropagation(); goPrev(); }} disabled={currentPage === 0}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-0 z-30"
            style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(8px)" }}>
            <ChevronRight className="w-6 h-6" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); goNext(); }} disabled={currentPage + step >= pages.length}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-0 z-30"
            style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(8px)" }}>
            <ChevronLeft className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Floating glass control panel */}
      {controlsOpen && (
        <div
          className="absolute inset-x-0 bottom-0 z-40 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* backdrop scrim */}
          <div
            className="absolute inset-0 -top-32 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"
          />
          <div
            className="relative mx-auto max-w-2xl m-3 rounded-3xl p-4 shadow-2xl border border-white/30"
            style={{
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(24px) saturate(140%)",
              WebkitBackdropFilter: "blur(24px) saturate(140%)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              {editingPageName ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={tempPageName}
                    onChange={(e) => setTempPageName(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-accent/50 font-amiri font-bold text-base outline-none focus:ring-2 focus:ring-accent/50"
                    autoFocus
                    dir="rtl"
                    placeholder="اسم الصفحة..."
                    onKeyDown={(e) => { if (e.key === "Enter") handleSavePageName(); if (e.key === "Escape") setEditingPageName(false); }}
                  />
                  <button onClick={handleSavePageName} className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-700 flex items-center justify-center hover:bg-emerald-500/30 transition-colors">
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-amiri font-bold text-base">{currentPageName}</p>
                  <button onClick={handleStartEditPageName} className="w-6 h-6 rounded-full bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors" title="تعديل اسم الصفحة">
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setControlsOpen(false)}
                  className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Play mode selector */}
            <div className="mb-4 bg-white/40 p-3 rounded-xl border border-white/60">
              <p className="text-xs font-bold mb-2 text-muted-foreground">وضع التشغيل</p>
              <div className="flex gap-1.5 mb-3">
                {([
                  { mode: "teacher" as PlayMode, label: "معلم", desc: "صوت المعلم فقط" },
                  { mode: "kids" as PlayMode, label: "أطفال", desc: "صوت الأطفال فقط" },
                ]).map(({ mode, label, desc }) => (
                  <button
                    key={mode}
                    onClick={() => { setPlayMode(mode); }}
                    className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all border ${
                      playMode === mode
                        ? mode === "teacher"
                            ? "bg-amber-400/20 border-amber-400/50 text-amber-800 shadow"
                            : "bg-sky-400/20 border-sky-400/50 text-sky-800 shadow"
                        : "bg-white/70 border-border/60 text-foreground/70"
                    }`}
                  >
                    <div>{label}</div>
                    <div className="text-[10px] font-normal opacity-70 mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-3 text-sm font-bold cursor-pointer text-foreground/80 select-none">
                <span className="switch">
                  <input
                    type="checkbox"
                    checked={continuousPlay}
                    onChange={(e) => setContinuousPlay(e.target.checked)}
                  />
                  <span className="slider"></span>
                </span>
                <span>تشغيل متواصل للآية التالية</span>
              </label>
              <div className="flex items-center gap-2 text-sm font-bold text-foreground/80 mt-2">
                <span>تكرار الآية:</span>
                <select 
                  value={repeatCount} 
                  onChange={(e) => setRepeatCount(Number(e.target.value))}
                  className="bg-white border border-border rounded-md px-2 py-1 text-sm outline-none cursor-pointer"
                >
                  <option value={0}>بدون تكرار</option>
                  <option value={1}>مرة واحدة</option>
                  <option value={2}>مرتين</option>
                  <option value={3}>3 مرات</option>
                  <option value={5}>5 مرات</option>
                  <option value={999}>مستمر</option>
                </select>
              </div>
            </div>

            {/* Surah selector (if more than one on page) */}
            {currentPageSurahs.length > 1 && (
              <div className="mb-3">
                <p className="text-xs font-bold mb-1.5 text-muted-foreground">السورة</p>
                <div className="flex flex-wrap gap-1.5">
                  {currentPageSurahs.map((s, i) => {
                    const firstA = getPageAyahBoxes(pages[currentPage]?.src || "").filter(b => b.surah === s.number).sort((a,b)=>a.ayah-b.ayah)[0]?.ayah ?? 1;
                    return (
                    <button
                      key={s.number}
                      onClick={() => { setSelectedSurahIdx(i); setSelectedAyah(firstA); }}
                      className={`px-3 py-1.5 rounded-full text-sm font-amiri border transition-all ${
                        selectedSurahIdx === i
                          ? "bg-accent text-accent-foreground border-accent shadow"
                          : "bg-white/70 border-border/60"
                      }`}
                    >
                      {s.name}
                    </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ayah grid */}
            <div className="mb-3">
              <p className="text-xs font-bold mb-1.5 text-muted-foreground">
                اختر الآية ({selectedAyah} / {ayahCount})
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: ayahCount }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => {
                      setSelectedAyah(n);
                      currentRepeatRef.current = 0;
                      const startSpeaker: Speaker = playMode === "kids" ? "kids" : "teacher";
                      const pageBoxes = getPageAyahBoxes(pages[currentPage].src);
                      const surahBoxes = pageBoxes.filter(b => b.surah === selectedSurah.number);
                      const firstBox = surahBoxes.find(b => b.ayah === n);
                      const boxIndex = firstBox ? pageBoxes.indexOf(firstBox) : undefined;
                      playAyah(selectedSurah, n, startSpeaker, boxIndex);
                    }}
                    className={`aspect-square rounded-lg text-sm font-bold transition-all ${
                      selectedAyah === n
                        ? "bg-accent text-accent-foreground shadow scale-105"
                        : "bg-white/70 hover:bg-white"
                    } ${currentAyahRef.current === n && isPlaying ? "ring-2 ring-offset-1" : ""}`}
                    style={currentAyahRef.current === n && isPlaying ? { boxShadow: `0 0 0 2px ${speakerColors[currentSpeakerRef.current].glow}` } : undefined}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Pause/Play current */}
            {activeSurah && (
              <button
                onClick={togglePlayPause}
                className="mt-3 w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-foreground/10 hover:bg-foreground/15 font-bold text-sm"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? "إيقاف مؤقت" : "متابعة"}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tiny "now playing" pill (when controls closed) */}
      {isPlaying && activeSurah && !controlsOpen && (
        <div
          onClick={togglePlayPause}
          className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold animate-fade-in cursor-pointer hover:scale-105 active:scale-95 transition-transform shadow-md"
          style={{
            background: speakerColors[currentSpeakerRef.current].bg,
            border: `1px solid ${speakerColors[currentSpeakerRef.current].glow}`,
            color: speakerColors[currentSpeakerRef.current].text,
            backdropFilter: "blur(8px)",
            opacity: 0.85,
          }}
        >
          <span><Headphones className="w-4 h-4 inline-block" /></span>
          <span className="font-amiri">{activeSurah.name} · آية {currentAyahRef.current}</span>
        </div>
      )}
      {/* Floating glassmorphic options menu when clicking an Ayah */}
      {activeMenuAyah && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setActiveMenuAyah(null)}
        >
          <div 
            className="w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-white/40 text-center space-y-4 animate-scale-up"
            style={{
              background: "rgba(255, 255, 255, 0.8)",
              backdropFilter: "blur(20px) saturate(160%)",
              WebkitBackdropFilter: "blur(20px) saturate(160%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="font-amiri font-bold text-2xl text-slate-800">
                سورة {activeMenuAyah.surah.name}
              </h3>
              <p className="text-xs font-bold text-slate-500">
                {activeMenuAyah.label ? activeMenuAyah.label : `الآية رقم ${activeMenuAyah.ayah}`}
              </p>
            </div>

            <div className="w-16 h-1 bg-gradient-to-r from-amber-400 to-sky-400 mx-auto rounded-full my-2" />

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setSelectedSurahIdx(currentPageSurahs.indexOf(activeMenuAyah.surah));
                  setSelectedAyah(activeMenuAyah.ayah);
                  currentRepeatRef.current = 0;
                  setPlayMode("teacher");
                  playAyah(activeMenuAyah.surah, activeMenuAyah.ayah, "teacher", activeMenuAyah.boxIndex);
                  setActiveMenuAyah(null);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-900 font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
              >
                <Mic className="w-4 h-4 inline-block" /> تلاوة المعلم
              </button>

              <button
                onClick={() => {
                  setSelectedSurahIdx(currentPageSurahs.indexOf(activeMenuAyah.surah));
                  setSelectedAyah(activeMenuAyah.ayah);
                  currentRepeatRef.current = 0;
                  setPlayMode("kids");
                  playAyah(activeMenuAyah.surah, activeMenuAyah.ayah, "kids", activeMenuAyah.boxIndex);
                  setActiveMenuAyah(null);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-sky-400/20 hover:bg-sky-400/30 border border-sky-400/50 text-sky-900 font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
              >
                <Baby className="w-4 h-4 inline-block" /> تكرار الأطفال
              </button>

              <button
                onClick={() => {
                  setSelectedSurahIdx(currentPageSurahs.indexOf(activeMenuAyah.surah));
                  setSelectedAyah(activeMenuAyah.ayah);
                  currentRepeatRef.current = 0;
                  setPlayMode("teacher");
                  playAyah(activeMenuAyah.surah, activeMenuAyah.ayah, "teacher", activeMenuAyah.boxIndex);
                  setActiveMenuAyah(null);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-900 font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
              >
                <Headphones className="w-4 h-4 inline-block" /> تلاوة المعلم
              </button>

              <button
                onClick={() => setActiveMenuAyah(null)}
                className="w-full py-3 px-4 rounded-2xl bg-gray-200/60 hover:bg-gray-200/70 border text-slate-700 font-bold text-sm transition-all active:scale-95"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MushafPage;
