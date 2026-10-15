import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppFooter from "@/components/AppFooter";
import PointsDisplay from "@/components/PointsDisplay";
import SurahList from "@/components/SurahList";
import SearchBar from "@/components/SearchBar";
import CustomPlayer, { CustomPlayerHandle } from "@/components/CustomPlayer";
import ParentalGateModal from "@/components/ParentalGateModal";
import NotificationsModal from "../components/NotificationsModal";
import AppNav from "@/components/AppNav";
import WifiLoader from "@/components/ui/wifi-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurahData, SurahItem } from "@/hooks/useSurahData";
import { useProgress } from "@/hooks/useProgress";
import { useNotifications } from "@/hooks/useNotifications";
import { useTVNavigation } from "@/hooks/useTVNavigation";
import { useAudioContext } from "@/contexts/audioContext";

import { Shuffle, ListOrdered, Settings, Bell, Gamepad2, Lock, Maximize2, Minimize2 } from "lucide-react";
import { isKidsMode, setKidsLocked, hasKidsPin } from "@/data/kidsLock";
import { isTimeAllowed } from "@/data/kidsSchedule";
import { kidsEnabled as getKidsEnabled, addReadingMinutes, addCoins, setAppMode, getProgress, isPureMode, setKidsHidden, kidsHidden } from "@/data/kidsProfile";

import { checkAndUnlockBadges, recordTodayActivity } from "@/data/kidsBadges";
import { toast } from "@/hooks/use-toast";

const LAST_SURAH_KEY = "audio:lastSurah";
const LAST_TIME_KEY = "audio:lastTime";

/** Fisher-Yates shuffle */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const Index = () => {
  useNotifications();
  const navigate = useNavigate();
  const { surahs, loading, error, retry } = useSurahData();
  const { points, recordAyah } = useProgress();
  const { currentTrack, setCurrentTrack, setPlayNextHandler, setPlayPrevHandler, globalAudioRef } = useAudioContext();
  
  const [search, setSearch] = useState("");
  const lastSavedRef = useRef(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffledSurahs, setShuffledSurahs] = useState<SurahItem[]>([]);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  // ركن الأطفال
  const [kidsMode, setKidsMode] = useState(isKidsMode);
  const [pinAction, setPinAction] = useState<null | "enter" | "settings" | "exit_kids" | "exit_kids">(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const isAudioPlayingRef = useRef(false);
  useEffect(() => { isAudioPlayingRef.current = isAudioPlaying; }, [isAudioPlaying]);
  useEffect(() => { const h = () => setKidsMode(isKidsMode()); window.addEventListener("mushaf:kidsmode", h); return () => window.removeEventListener("mushaf:kidsmode", h); }, []);

  const [playExpired, setPlayExpired] = useState(() => getProgress().playExpired);
  // حالة ظهور ركن الأطفال (تتفاعل فوراً مع زر الاسترجاع)
  const [kidsOn, setKidsOn] = useState(() => getKidsEnabled());
  useEffect(() => {
    const h = () => setKidsOn(getKidsEnabled());
    h();
    window.addEventListener("mushaf:appmode", h);
    window.addEventListener("mushaf:coins", h);
    window.addEventListener("mushaf:activeprofile", h);
    window.addEventListener("focus", h);
    return () => {
      window.removeEventListener("mushaf:appmode", h);
      window.removeEventListener("mushaf:coins", h);
      window.removeEventListener("mushaf:activeprofile", h);
      window.removeEventListener("focus", h);
    };
  }, []);
  // زر استرجاع ركن الأطفال بضغطة واحدة (بدون الحاجة للإعدادات)
  const restoreKids = () => {
    setKidsHidden(false);
    setKidsOn(getKidsEnabled());
    window.dispatchEvent(new Event("mushaf:appmode"));
    toast({ title: "🎉 عاد ركن الأطفال والألعاب!" });
  };
  useEffect(() => {
    const h = () => setPlayExpired(getProgress().playExpired);
    h();
    window.addEventListener("mushaf:activeprofile", h);
    window.addEventListener("focus", h);
    return () => {
      window.removeEventListener("mushaf:activeprofile", h);
      window.removeEventListener("focus", h);
    };
  }, []);
  // موضع شريط التنقل (داخل الإطار / أسفل الشاشة / أعلى الشاشة)
  const [navPosition, setNavPosition] = useState<"inside" | "top" | "bottom">(() => {
    return (localStorage.getItem("mushaf:navPosition") as "inside" | "top" | "bottom") || "inside";
  });

  const cycleNavPosition = () => {
    setNavPosition((prev) => {
      const next = prev === "inside" ? "bottom" : prev === "bottom" ? "top" : "inside";
      localStorage.setItem("mushaf:navPosition", next);
      const names = {
        inside: "داخل الإطار (يحرر لافتة العنوان)",
        bottom: "أسفل الشاشة (شريط عائم)",
        top: "أعلى الشاشة (كلاسيكي)",
      };
      toast({ title: `تم تغيير موضع الشريط إلى: ${names[next]}` });
      return next;
    });
  };
  // ── الإعدادات: محميّة برمز ولي الأمر فقط في وضع الأطفال ──
  const openSettings = () => { if (isKidsMode() && hasKidsPin()) setPinAction("settings"); else navigate("/settings"); };

  // تتبّع دقائق الاستماع والدراسة الفعالة وحفظها في الإحصائيات والأوسمة
  useEffect(() => {
    let accumulatedSecs = 0;
    const flushMinutes = () => {
      if (accumulatedSecs >= 5) {
        const mins = Math.round((accumulatedSecs / 60) * 10) / 10;
        accumulatedSecs = 0;
        if (mins > 0) {
          const { justUnlocked } = addReadingMinutes(mins);
          // نقاط القراءة (المال): نجومتان لكل دقيقة — قليلة لكنها أكثر من نقاط الألعاب
          const stars = Math.max(1, Math.round(mins * 2));
          addCoins(stars);
          recordTodayActivity();
          checkAndUnlockBadges();
          if (justUnlocked) {
            toast({ title: "🎉 أحسنت! اكتمل وقت الاستماع وفتحت الألعاب" });
            // يفتح الألعاب مباشرة عندما يتوفر الوقت — لا ننتظر
            navigate("/games", { replace: true });
          } else {
            toast({ title: `+${stars} ⭐ من القراءة`, description: "واصل الاستماع لتربح المزيد" });
          }
        }
      }
    };

    const handleExit = () => flushMinutes();
    window.addEventListener("beforeunload", handleExit);
    window.addEventListener("mushaf:flush_time", handleExit);

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (!isAudioPlayingRef.current) return; // لا نحتسب إلا أثناء استماع وتشغيل فعلي
      accumulatedSecs += 5;
      if (accumulatedSecs >= 30) {
        flushMinutes();
      }
    }, 5000);

    return () => {
      clearInterval(id);
      flushMinutes();
      window.removeEventListener("beforeunload", handleExit);
      window.removeEventListener("mushaf:flush_time", handleExit);
    };
  }, [navigate]);

  useEffect(() => {
    const handleBadgeUnlocked = (e: any) => {
      const badges = e.detail;
      if (Array.isArray(badges) && badges.length > 0) {
        badges.forEach((b: any) => {
          toast({
            title: `🏆 مبارك! وسام جديد: ${b.title}`,
            description: `حصلت على ${b.rewardCoins} نجمة إضافية!`,
          });
        });
      }
    };
    window.addEventListener("mushaf:badge_unlocked", handleBadgeUnlocked);

    return () => {
      window.removeEventListener("mushaf:badge_unlocked", handleBadgeUnlocked);
    };
  }, []);

  // Unified Playlist State
  const [combinedSurahs, setCombinedSurahs] = useState<SurahItem[]>(() => surahs);

  useEffect(() => {
    if (loading || surahs.length === 0) return;
    
    const objectUrls: string[] = [];
    let isMounted = true;
    
    const loadUnifiedList = async () => {
      try {
        const { getAllCustomAudios } = await import("@/data/customAudioStore");
        const { syncPlaylist } = await import("@/data/playlistStore");
        
        const customAudios = await getAllCustomAudios();
        const config = await syncPlaylist(surahs, customAudios.map((audio) => ({ id: audio.id })));
        
        if (!isMounted) return;
        
        const customMap = new Map(customAudios.map(a => [a.id, a]));
        const builtinMap = new Map(surahs.map(s => [s.number, s]));
        
        const mapped: SurahItem[] = [];
        
        for (const c of config) {
          if (c.isHidden) continue;
          
          if (c.type === 'custom') {
            const ca = customMap.get(c.originalId as string);
            if (ca) {
              const url = URL.createObjectURL(ca.blob);
              objectUrls.push(url);
              mapped.push({
                number: 1000 + mapped.length, // unique high number
                name: c.customName || ca.title,
                englishName: "Custom Audio",
                englishNameTranslation: "",
                numberOfAyahs: 0,
                revelationType: "custom",
                audioSrc: url,
              });
            }
          } else {
            const s = builtinMap.get(Number(c.originalId));
            if (s) {
              mapped.push({
                ...s,
                name: c.customName || s.name,
              });
            }
          }
        }
        
        setCombinedSurahs(mapped);
      } catch (err) {
        console.error("Failed to load unified playlist:", err);
      }
    };
    
    loadUnifiedList();
    
    return () => {
      isMounted = false;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [surahs, loading]);

  // Restore last played surah once data arrives on initial load only
  const hasRestoredOnce = useRef(false);

  useEffect(() => {
    if (hasRestoredOnce.current) return;
    if (surahs.length === 0) return;
    
    // Mark as restored so it never re-triggers when currentTrack becomes null (e.g. closing player)
    hasRestoredOnce.current = true;

    if (currentTrack) return;

    const savedNum = parseInt(localStorage.getItem(LAST_SURAH_KEY) || "0", 10);
    if (!savedNum) return;
    const found = surahs.find((s) => s.number === savedNum);
    if (found) {
      const t = parseFloat(localStorage.getItem(LAST_TIME_KEY) || "0");
      setCurrentTrack({
        surahNumber: found.number,
        surahName: found.name,
        audioSrc: found.audioSrc,
        isCustom: found.revelationType === "custom",
        initialTime: isNaN(t) ? 0 : t,
        source: "audio-list"
      });
    }
  }, [surahs, currentTrack, setCurrentTrack]);

  const [filterCategory, setFilterCategory] = useState<"all" | "juz_amma" | "meccan" | "medinan">("all");

  const displaySurahs = useMemo(() => {
    let base = isShuffled ? shuffledSurahs : (combinedSurahs.length > 0 ? combinedSurahs : surahs);
    if (search.trim()) {
      base = base.filter((s) => s.name.includes(search.trim()));
    }
    if (filterCategory === "juz_amma") {
      base = base.filter((s) => s.number >= 78 || s.revelationType === "custom");
    } else if (filterCategory === "meccan") {
      base = base.filter((s) => s.revelationType === "Meccan" || s.type === "مكية");
    } else if (filterCategory === "medinan") {
      base = base.filter((s) => s.revelationType === "Medinan" || s.type === "مدنية");
    }
    return base;
  }, [combinedSurahs, shuffledSurahs, isShuffled, search, surahs, filterCategory]);

  const handleShuffle = useCallback(() => {
    if (isShuffled) {
      setIsShuffled(false);
      setShuffledSurahs([]);
    } else {
      setShuffledSurahs(shuffleArray(combinedSurahs));
      setIsShuffled(true);
    }
  }, [isShuffled, combinedSurahs]);

  const handleSelect = (surah: SurahItem) => {
    setCurrentTrack({
      surahNumber: surah.number,
      surahName: surah.name,
      audioSrc: surah.audioSrc,
      isCustom: surah.revelationType === "custom",
      initialTime: 0,
      source: "audio-list"
    });
    localStorage.setItem(LAST_SURAH_KEY, String(surah.number));
    localStorage.setItem(LAST_TIME_KEY, "0");
    recordAyah(surah.number, 1);
  };

  useEffect(() => {
    if (currentTrack === null) {
      localStorage.removeItem(LAST_SURAH_KEY);
      localStorage.removeItem(LAST_TIME_KEY);
    }
  }, [currentTrack]);

  // Listen to time updates from global audio element
  useEffect(() => {
    const audio = globalAudioRef?.current;
    if (!audio) return;
    
    const handleTimeUpdate = () => {
      const t = audio.currentTime;
      if (Math.abs(t - lastSavedRef.current) >= 2) {
        lastSavedRef.current = t;
        localStorage.setItem(LAST_TIME_KEY, String(t));
      }
    };
    
    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [globalAudioRef]);

  const activeSurahList = isShuffled ? shuffledSurahs : combinedSurahs;

  const handlePlayNext = useCallback(() => {
    if (!currentTrack || activeSurahList.length === 0) return;
    const idx = activeSurahList.findIndex(s => s.number === currentTrack.surahNumber);
    const next = activeSurahList[idx + 1];
    if (next) {
      handleSelect(next);
    }
  }, [currentTrack, activeSurahList]);

  const handlePlayPrev = useCallback(() => {
    if (!currentTrack || activeSurahList.length === 0) return;
    const idx = activeSurahList.findIndex(s => s.number === currentTrack.surahNumber);
    const prev = activeSurahList[idx - 1];
    if (prev) {
      handleSelect(prev);
    }
  }, [currentTrack, activeSurahList]);

  useEffect(() => {
    setPlayNextHandler(handlePlayNext);
    setPlayPrevHandler(handlePlayPrev);
  }, [handlePlayNext, handlePlayPrev, setPlayNextHandler, setPlayPrevHandler]);

  // دعم جهاز التحكم عن بُعد والتلفاز الذكي (Android TV Remote & D-pad Navigation)
  const toggleGlobalPlayPause = useCallback(() => {
    const audio = globalAudioRef?.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [globalAudioRef]);

  const closeCurrentTrack = useCallback(() => {
    const audio = globalAudioRef?.current;
    if (audio) { try { audio.pause(); audio.currentTime = 0; } catch { /* ignore */ } }
    setCurrentTrack(null);
  }, [globalAudioRef, setCurrentTrack]);

  useTVNavigation({
    onPlayPause: toggleGlobalPlayPause,
    onNext: handlePlayNext,
    onPrev: handlePlayPrev,
    onBack: () => {
      if (currentTrack) closeCurrentTrack();
      else if (showNotifications) setShowNotifications(false);
    },
  });

  return (
    <div className="quran-kids-page">
      {/* شريط التنقل في الموضع العلوي (إن اختاره المستخدم) */}
      {navPosition === "top" && (
        <div className="fixed top-1 left-0 right-0 z-40 px-2 pointer-events-none">
          <AppNav
            transparentBg={true}
            className="scale-90 sm:scale-95 origin-top pointer-events-auto"
            hideBottomNav={!!currentTrack}
            position={navPosition}
            onCyclePosition={cycleNavPosition}
          />
        </div>
      )}

      {/* شريط التنقل في الموضع السفلي (إن اختاره المستخدم) */}
      {navPosition === "bottom" && (
        <div className={`fixed ${currentTrack ? "bottom-24" : "bottom-3"} left-0 right-0 z-40 px-2 pointer-events-none transition-all duration-300`}>
          <AppNav
            transparentBg={true}
            className="scale-90 sm:scale-95 origin-bottom pointer-events-auto shadow-2xl"
            hideBottomNav={true}
            position={navPosition}
            onCyclePosition={cycleNavPosition}
          />
        </div>
      )}

      <div className="quran-kids-frame">
        {/* الصورة الخلفية لإطار تعليم القرآن للأطفال - تتبدل تلقائياً للهاتف */}
        <picture>
          <source
            media="(max-width: 768px), (max-aspect-ratio: 1.15/1)"
            srcSet="/mobile-home-bg.jpg"
          />
          <img
            src="/quran-kids-frame.jpg"
            alt="تعليم القرآن للأطفال - القرآن الكريم"
            className="quran-kids-frame-bg"
          />
        </picture>

        {/* طبقة بيضاء شفافة فوق الخلفية مباشرة */}
        <div className="quran-kids-overlay" />

        {/* المكان الأبيض الشفاف المخصص لقائمة السور */}
        <div className={`quran-kids-white-area ${isMobileExpanded ? "expanded-mode" : ""}`}>
          {/* ═══════════════════════════════════════════════════════════════
              التاج العلوي الأندلسي المقوّس (Curved Islamic Arch Canopy)
              شريط علوي منحني دائري غير مستقيم يجمع التنقل والبحث والأدوات
              ═══════════════════════════════════════════════════════════════ */}
          <div className="relative shrink-0 z-20 bg-gradient-to-b from-white/95 via-amber-50/65 to-white/90 dark:from-stone-900/95 dark:to-stone-900/85 backdrop-blur-xl border-b-2 border-amber-400/35 shadow-[0_12px_28px_rgba(212,175,55,0.12)] rounded-b-[32px] sm:rounded-b-[40px] px-2.5 sm:px-4 pt-1.5 sm:pt-2.5 pb-3.5 space-y-2.5">
            {/* شريط التنقل الذكي داخل التاج المقوّس */}
            {navPosition === "inside" && (
              <div className="w-full">
                <AppNav
                  transparentBg={true}
                  className="w-full scale-95 sm:scale-100 origin-top"
                  hideBottomNav={!!currentTrack}
                  position={navPosition}
                  onCyclePosition={cycleNavPosition}
                />
              </div>
            )}

            {/* شريط أدوات قائمة السور الدائري: بحث كبسولي + زر عشوائي دائري + زر التوسيع للهاتف + نجوم */}
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex-1 min-w-0" data-color-target="cyan-search">
                <SearchBar value={search} onChange={setSearch} />
              </div>
              <button
                onClick={handleShuffle}
                data-color-target="yellow-shuffle"
                className={`shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-300 border ${
                  isShuffled
                    ? "bg-amber-500 text-white border-amber-600 shadow-md scale-105"
                    : "bg-amber-400 hover:bg-amber-500 text-amber-950 border-amber-500/70 shadow-sm hover:shadow active:scale-95"
                }`}
                title={isShuffled ? "العودة للترتيب الأصلي" : "ترتيب عشوائي"}
                aria-label={isShuffled ? "العودة للترتيب الأصلي" : "ترتيب عشوائي"}
              >
                {isShuffled ? (
                  <ListOrdered className="w-5 h-5 text-white" />
                ) : (
                  <Shuffle className="w-5 h-5 text-amber-950 font-black" />
                )}
              </button>
              <button
                onClick={() => setIsMobileExpanded(!isMobileExpanded)}
                className="sm:hidden shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border bg-white/90 hover:bg-amber-100 text-amber-900 border-amber-400/50 shadow-xs active:scale-95"
                title={isMobileExpanded ? "العودة للوضع المؤطر الفني" : "توسيع عرض السور للهاتف"}
                aria-label={isMobileExpanded ? "العودة للوضع المؤطر الفني" : "توسيع عرض السور للهاتف"}
              >
                {isMobileExpanded ? (
                  <Minimize2 className="w-4 h-4 text-amber-800" />
                ) : (
                  <Maximize2 className="w-4 h-4 text-amber-800" />
                )}
              </button>
              {kidsOn && !isPureMode() && (
                <div className="shrink-0 hidden sm:block" data-color-target="yellow-stars">
                  <PointsDisplay points={points} />
                </div>
              )}
            </div>

            {/* أزرار تصنيف السور كبسولية دائرية سريعة */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              <button
                onClick={() => setFilterCategory("all")}
                data-color-target="yellow-filter"
                className={`px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold transition-all duration-300 shrink-0 border ${
                  filterCategory === "all"
                    ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                    : "bg-white/80 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border-amber-400/25 hover:border-amber-400"
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setFilterCategory("juz_amma")}
                data-color-target="gold-filter"
                className={`px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold transition-all duration-300 shrink-0 border ${
                  filterCategory === "juz_amma"
                    ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                    : "bg-white/80 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border-amber-400/25 hover:border-amber-400"
                }`}
              >
                ⭐ جزء عمّ (قصار السور)
              </button>
              <button
                onClick={() => setFilterCategory("meccan")}
                data-color-target="green-meccan"
                className={`px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold transition-all duration-300 shrink-0 border ${
                  filterCategory === "meccan"
                    ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                    : "bg-white/80 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border-amber-400/25 hover:border-amber-400"
                }`}
              >
                🕋 مكية
              </button>
              <button
                onClick={() => setFilterCategory("medinan")}
                data-color-target="blue-medinan"
                className={`px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold transition-all duration-300 shrink-0 border ${
                  filterCategory === "medinan"
                    ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                    : "bg-white/80 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border-amber-400/25 hover:border-amber-400"
                }`}
              >
                🕌 مدنية
              </button>
            </div>

            {/* شريط معلومات عدد السور والحالة في كبسولات دائرية ناعمة */}
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-amber-950/80 dark:text-amber-200/80 px-1 font-semibold">
              <span className="inline-flex items-center gap-1.5 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {displaySurahs.length === 114
                  ? "جميع سور القرآن الكريم (١١٤ سورة)"
                  : `السور المطابقة: ${displaySurahs.length}`}
              </span>
              {isShuffled && (
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 text-amber-800 dark:text-amber-300 bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30">
                    <Shuffle className="w-3 h-3" /> الترتيب العشوائي
                  </span>
                  <button
                    onClick={handleShuffle}
                    className="text-[10px] text-amber-800 underline hover:text-amber-950 font-bold px-1"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>

            {/* أيقونة القوس الأندلسي المركزية — حجر العقد الزخرفي */}
            <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-3 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 rounded-b-full shadow-xs flex items-center justify-center border-b border-x border-amber-600/30">
                <div className="w-1.5 h-1.5 rounded-full bg-white/90 shadow-xs" />
              </div>
            </div>
          </div>

          {/* محتوى قائمة السور قابل للتمرير بسلاسة داخل الإطار الأبيض الشفاف */}
          <div className={`flex-1 overflow-y-auto quran-kids-scroll p-2 sm:p-2.5 ${currentTrack ? 'pb-[110px]' : ''}`}>
            {loading && (
              <div className="py-8 my-4 flex flex-col items-center justify-center text-center">
                <WifiLoader text="جاري جلب قائمة السور والتلاوات..." />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full mt-12">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-white/60 border border-amber-400/20">
                      <Skeleton className="w-10 h-10 rounded-xl" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-6 text-center space-y-3 my-4">
                <p className="text-destructive font-bold">خطأ في تحميل البيانات</p>
                <p className="text-muted-foreground text-sm">{error}</p>
                <button
                  onClick={retry}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
                >
                  🔄 إعادة المحاولة
                </button>
              </div>
            )}

            {!loading && !error && (
              <SurahList
                surahs={displaySurahs}
                currentPlaying={currentTrack?.surahNumber ?? null}
                onSelect={handleSelect}
              />
            )}
          </div>
        </div>
      </div>


      {/* رمز ولي الأمر للإعدادات أو فك القفل */}
      {pinAction && (
        <ParentalGateModal
          title={pinAction === "exit_kids" ? "فك قفل وضع الأطفال" : "الدخول إلى الإعدادات"}
          onSuccess={() => {
            if (pinAction === "exit_kids") {
              setKidsLocked(false);
              toast({ title: "تم فك قفل الأطفال بنجاح" });
            } else if (pinAction === "settings") {
              sessionStorage.setItem("mushaf:settingsUnlocked", "1");
              navigate("/settings");
            }
            setPinAction(null);
          }}
          onCancel={() => setPinAction(null)}
        />
      )}

      {showNotifications && <NotificationsModal onClose={() => setShowNotifications(false)} />}

      {/* تذييل الموقع — يُخفى بالكامل في وضع الأطفال */}
      <AppFooter />
    </div>
  );
};

export default Index;
