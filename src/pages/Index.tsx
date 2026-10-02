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
import { Skeleton } from "@/components/ui/skeleton";
import { useSurahData, SurahItem } from "@/hooks/useSurahData";
import { useProgress } from "@/hooks/useProgress";
import { useNotifications } from "@/hooks/useNotifications";
import { useTVNavigation } from "@/hooks/useTVNavigation";

import { Shuffle, ListOrdered, Settings, Bell, Gamepad2, Lock } from "lucide-react";
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
  const [currentSurah, setCurrentSurah] = useState<SurahItem | null>(null);
  const [resumeTime, setResumeTime] = useState(0);
  const [search, setSearch] = useState("");
  const playerRef = useRef<CustomPlayerHandle>(null);
  const lastSavedRef = useRef(0);
  const [autoNext, setAutoNext] = useState(true);
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffledSurahs, setShuffledSurahs] = useState<SurahItem[]>([]);

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

  // Restore last played surah once data arrives
  useEffect(() => {
    if (currentSurah || surahs.length === 0) return;
    const savedNum = parseInt(localStorage.getItem(LAST_SURAH_KEY) || "0", 10);
    if (!savedNum) return;
    const found = surahs.find((s) => s.number === savedNum);
    if (found) {
      const t = parseFloat(localStorage.getItem(LAST_TIME_KEY) || "0");
      setResumeTime(isNaN(t) ? 0 : t);
      setCurrentSurah(found);
    }
  }, [surahs, currentSurah]);

  const displaySurahs = useMemo(() => {
    const base = isShuffled ? shuffledSurahs : (combinedSurahs.length > 0 ? combinedSurahs : surahs);
    if (!search.trim()) return base;
    return base.filter((s) => s.name.includes(search.trim()));
  }, [combinedSurahs, shuffledSurahs, isShuffled, search, surahs]);

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
    setResumeTime(0);
    setCurrentSurah(surah);
    localStorage.setItem(LAST_SURAH_KEY, String(surah.number));
    localStorage.setItem(LAST_TIME_KEY, "0");
    recordAyah(surah.number, 1);
  };

  const handleClose = () => {
    setCurrentSurah(null);
    localStorage.removeItem(LAST_SURAH_KEY);
    localStorage.removeItem(LAST_TIME_KEY);
  };

  // Throttled save of currentTime
  const handleTimeUpdate = (t: number) => {
    if (Math.abs(t - lastSavedRef.current) >= 2) {
      lastSavedRef.current = t;
      localStorage.setItem(LAST_TIME_KEY, String(t));
    }
  };

  const activeSurahList = isShuffled ? shuffledSurahs : combinedSurahs;

  const handlePlayNext = () => {
    if (!currentSurah || activeSurahList.length === 0) return;
    const idx = activeSurahList.findIndex(s => s.number === currentSurah.number);
    const next = activeSurahList[idx + 1];
    if (next) {
      setResumeTime(0);
      setCurrentSurah(next);
      localStorage.setItem(LAST_SURAH_KEY, String(next.number));
      localStorage.setItem(LAST_TIME_KEY, "0");
    }
  };

  const handlePlayPrev = () => {
    if (!currentSurah || activeSurahList.length === 0) return;
    const idx = activeSurahList.findIndex(s => s.number === currentSurah.number);
    const prev = activeSurahList[idx - 1];
    if (prev) {
      setResumeTime(0);
      setCurrentSurah(prev);
      localStorage.setItem(LAST_SURAH_KEY, String(prev.number));
      localStorage.setItem(LAST_TIME_KEY, "0");
    }
  };

  // دعم جهاز التحكم عن بُعد والتلفاز الذكي (Android TV Remote & D-pad Navigation)
  useTVNavigation({
    onPlayPause: () => {
      if (playerRef.current) {
        if (isAudioPlaying) playerRef.current.pause();
        else playerRef.current.play();
      }
    },
    onNext: handlePlayNext,
    onPrev: handlePlayPrev,
    onBack: () => {
      if (currentSurah) handleClose();
      else if (showNotifications) setShowNotifications(false);
    },
  });

  return (
    <div className="quran-kids-page">
      {/* شريط التنقل الذكي مثبت في الأعلى */}
      <div className="fixed top-0 left-0 right-0 z-40 px-2 pt-1 pointer-events-none">
        <AppNav transparentBg={true} className="scale-90 sm:scale-95 origin-top" hideBottomNav={!!currentSurah} />
      </div>

      <div className="quran-kids-frame">
        {/* الصورة الخلفية فائقة الدقة لإطار تعليم القرآن للأطفال */}
        <img
          src="/quran-kids-frame.jpg"
          alt="تعليم القرآن للأطفال - القارئ أمين حاج أيوب"
          className="quran-kids-frame-bg"
        />

        {/* المكان الأبيض المخصص لقائمة السور */}
        <div className="quran-kids-white-area">
          {/* شريط أدوات قائمة السور: بحث + ترتيب + نجوم */}
          <div className="p-2 sm:p-2.5 pb-2 border-b border-amber-500/20 bg-white/50 dark:bg-card/50 backdrop-blur-xs flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <SearchBar value={search} onChange={setSearch} />
              </div>
              <button
                onClick={handleShuffle}
                className={`shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-all duration-200 border ${
                  isShuffled
                    ? "bg-amber-500 text-white border-amber-600 shadow-md scale-105"
                    : "bg-white/90 dark:bg-card/90 border-amber-400/40 text-stone-700 dark:text-stone-200 hover:border-amber-500 hover:shadow-xs"
                }`}
                title={isShuffled ? "العودة للترتيب الأصلي" : "ترتيب عشوائي"}
                aria-label={isShuffled ? "العودة للترتيب الأصلي" : "ترتيب عشوائي"}
              >
                {isShuffled ? (
                  <ListOrdered className="w-5 h-5 text-white" />
                ) : (
                  <Shuffle className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                )}
              </button>
              {kidsOn && !isPureMode() && (
                <div className="shrink-0 hidden sm:block">
                  <PointsDisplay points={points} />
                </div>
              )}
            </div>

            {/* شريط معلومات عدد السور والحالة */}
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-amber-950/70 dark:text-amber-200/70 px-1 font-semibold">
              <span>
                {displaySurahs.length === 114
                  ? "جميع سور القرآن الكريم (١١٤ سورة)"
                  : `السور المطابقة: ${displaySurahs.length}`}
              </span>
              {isShuffled && (
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                    <Shuffle className="w-3 h-3" /> الترتيب العشوائي
                  </span>
                  <button
                    onClick={handleShuffle}
                    className="text-[10px] text-amber-800 underline hover:text-amber-950 font-bold"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* محتوى قائمة السور قابل للتمرير بسلاسة داخل الإطار الأبيض */}
          <div className={`flex-1 overflow-y-auto quran-kids-scroll p-2 sm:p-2.5 ${currentSurah ? 'pb-[90px]' : ''}`}>
            {loading && (
              <div className="space-y-3 py-6 text-center">
                <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-amber-950 dark:text-amber-100 font-bold font-amiri text-sm">
                  جاري جلب قائمة السور والتلاوات...
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                currentPlaying={currentSurah?.number ?? null}
                onSelect={handleSelect}
              />
            )}
          </div>
        </div>
      </div>

      {currentSurah && (
        <CustomPlayer
          ref={playerRef}
          surahName={currentSurah.name}
          surahNumber={currentSurah.number}
          audioSrc={currentSurah.audioSrc}
          isCustom={currentSurah.revelationType === "custom"}
          initialTime={resumeTime}
          onClose={handleClose}
          onTimeUpdate={handleTimeUpdate}
          onPlayNext={handlePlayNext}
          onPlayPrev={handlePlayPrev}
          autoNext={autoNext}
          onToggleAutoNext={() => setAutoNext(v => !v)}
          onPlayingChange={setIsAudioPlaying}
        />
      )}

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
