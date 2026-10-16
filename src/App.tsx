import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { setupTauriCloseHandler, closeTauriApp } from "./utils/tauriUtils";
import { isKidsMode, setKidsLocked } from "./data/kidsLock";
import ParentalGateModal from "./components/ParentalGateModal";
import { Toaster as Sonner } from "./components/ui/sonner";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { useEffect, useState, useCallback, lazy, Suspense, startTransition, type ReactNode } from "react";
const SiteLinksOverlay = lazy(() => import("./components/SiteLinksOverlay"));
import { AudioContextProvider } from "./contexts/audioContext";
const Index = lazy(() => import("./pages/Index.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const QuranReader = lazy(() => import("./pages/QuranReader.tsx"));
const KidsGames = lazy(() => import("./pages/KidsGames.tsx"));
const KidsShop = lazy(() => import("./pages/KidsShop.tsx"));
import { applyTheme, getTheme } from "./utils/theme";
import { syncCoordinatesFromServer } from "./data/ayahCoordinates";
import { syncTimingsFromServer } from "./data/ayahTimings";
import { syncCustomPagesFromServer, syncAllShadingFromServer } from "./data/customPages";
import { syncSurahRegionsFromServer } from "./data/surahRegions";
import { syncBookmarksFromServer } from "./data/bookmarks";
import { syncAdminDataFromServer } from "./data/titles";
import { syncKidsProfileFromServer } from "./data/kidsProfile";
const SettingsPage = lazy(() => import("./pages/SettingsPage.tsx"));
const ParentDashboard = lazy(() => import("./pages/ParentDashboard.tsx"));
const CustomAudioManager = lazy(() => import("./pages/CustomAudioManager.tsx"));
const AudioUploadPage = lazy(() => import("./pages/AudioUploadPage.tsx"));
const UploadDeskPage = lazy(() => import("./pages/UploadDeskPage.tsx"));
const SupportPage = lazy(() => import("./pages/SupportPage.tsx"));

const AnnouncementsPage = lazy(() => import("./pages/AnnouncementsPage.tsx"));
const ErrorPage = lazy(() => import("./pages/ErrorPage.tsx"));
const AdminReleasesPanel = lazy(() => import("./pages/AdminReleasesPanel.tsx"));
const LegendaryDownloadHub = lazy(() => import("./components/LegendaryDownloadHub.tsx"));
// ===== أدوات المعلّم والمصحف (معايرة التظليل / التوقيت / التقسيم / الربط) =====
const TeacherTools = lazy(() => import("./pages/TeacherTools.tsx"));
const AyahCalibration = lazy(() => import("./pages/AyahCalibration.tsx"));
const TimingsRecorder = lazy(() => import("./pages/TimingsRecorder.tsx"));
const ShadingPage = lazy(() => import("./pages/ShadingPage.tsx"));
const LinkAudioPage = lazy(() => import("./pages/LinkAudioPage.tsx"));
const RecitationMethods = lazy(() => import("./pages/RecitationMethods.tsx"));
const AudioSplitterPage = lazy(() => import("./pages/AudioSplitterPage.tsx"));
const ImageManager = lazy(() => import("./pages/ImageManager.tsx"));
const MushafUploadPage = lazy(() => import("./pages/MushafUploadPage.tsx"));
const SortPagesPage = lazy(() => import("./pages/SortPagesPage.tsx"));
const RecitationPage = lazy(() => import("./pages/RecitationPage.tsx"));
const ShadingSettingsPage = lazy(() => import("./pages/ShadingSettingsPage.tsx"));
const SurahShadingPage = lazy(() => import("./pages/SurahShadingPage.tsx"));
const AudioShadingSyncPage = lazy(() => import("./pages/AudioShadingSyncPage.tsx"));
import { getProfile, getAppMode, getProfiles, kidsEnabled } from "./data/kidsProfile";
import { toast } from "./hooks/use-toast";
import WelcomeOverlay, { isOnboarded } from "./components/WelcomeOverlay.tsx";
import ProfilePicker, { isPicked, markPicked } from "./components/ProfilePicker.tsx";
import { logAppOpen } from "./utils/analytics.ts";
import { useBackgroundNotifications, showLocalNotification } from "./utils/notifications.ts";
import { claimDailyRewards, incrementStreak } from "./data/dailyRewards";
import { setupRemoteControlListeners } from "./utils/controllerNavigation";
import { GlobalPlayerWrapper } from "./GlobalPlayerWrapper";
import QuranLoading from "./components/QuranLoading";
import Intro3DCarousel from "./components/Intro3DCarousel";
import NetworkStatusBar from "./components/NetworkStatusBar";

const queryClient = new QueryClient();

// 🎞️ غلاف انتقال موحّد: كل صفحة تدخل بحركة ظهور واحدة مع حماية Suspense ثابتة لكل مسار
const PageTransition = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  return (
    <Suspense fallback={<QuranLoading fullScreen label="جارٍ فتح الصفحة..." />}>
      <div key={location.pathname} className="page-transition">
        {children}
      </div>
    </Suspense>
  );
};

// 🔇 عند الانتقال بين الصفحات: يوقف أي صوت يعمل (المصحف/التلاوات/الألعاب)
// حتى لا يستمرّ التشغيل في الخلفية عند مغادرة الصفحة، ويستثني الصفحات
// التي يُفترض أن يستمرّ فيها الصوت (المصحف والتلاوات) عند التنقل بينهما.
const AUDIO_PERSIST_ROUTES = ["/", "/audio", "/mushaf"];

const NavigationAudioGuard = () => {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    const el = (window as unknown as { __globalAudioEl?: HTMLAudioElement }).__globalAudioEl;
    // إيقاف المشغّل العام (المصحف/التلاوات) إن كنا خارج صفحات الاستمرار
    if (el && !AUDIO_PERSIST_ROUTES.includes(path)) {
      try { el.pause(); } catch { /* ignore */ }
    }
    // إيقاف أصوات التشجيع في الألعاب
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gv = (window as any).__stopGameVoice;
      if (typeof gv === "function") gv();
    } catch { /* ignore */ }
    // إيقاف النطق المحلي (Web Speech API) حتى لا يستمر الكلام في الخلفية
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch { /* ignore */ }
    // إيقاف أي عنصر <audio> يعمل داخل الصفحة السابقة
    try {
      document.querySelectorAll("audio").forEach((a) => {
        if (!a.paused) a.pause();
      });
    } catch { /* ignore */ }
  }, [location.pathname]);
  return null;
};

// المسار الرئيسي يفتح صفحة الصوت (التلاوات) — المصحف قيد التطوير
// ملاحظة: نعرض الصفحة مباشرة بدل إعادة التوجيه إلى /audio حتى لا يظهر المسار "/" كأنه فارغ،
// مع إبقاء المسار /audio يعمل كما هو عند الدخول عليه من شريط التنقل.
const HomeRoute = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // إن كان مسار الجذر يحمل معاملات query فقط (بدون hash)، حوّل إلى /audio مع الحفاظ عليها.
    // لا نعيد توجيه الروابط التي تحتوي على hash (مثل #/sync-audio) لأن React Router HashRouter
    // يتعامل معها مباشرة وعرض الصفحة المقصودة.
    if (location.search && !location.hash) {
      startTransition(() => {
        navigate(`/audio${location.search}`, { replace: true });
      });
    }
  }, [location.search, location.hash, navigate]);

  return <Index />;
};

function KidsModeGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const checkMode = () => {
      const allowedPaths = [
        "/games", "/", "/audio", "/mushaf", "/shop", "/profiles", "/settings", "/parent",
        "/teacher-tools", "/ayah-calibrate", "/calibrate", "/timings", "/shading", "/link",
        "/recitation-methods", "/audio-splitter", "/image-manager", "/mushaf-upload", "/sort",
        "/recitation", "/surah-shading", "/shading-settings", "/new-shading", "/shading-box",
        "/sync-audio", "/audio-shading-sync", "/announcements", "/support", "/download", "/releases", "/error"
      ];
      if (isKidsMode() && !allowedPaths.includes(location.pathname)) {
        startTransition(() => {
          navigate("/audio", { replace: true });
        });
      }
    };
    checkMode();
    window.addEventListener("mushaf:kidsmode", checkMode);
    window.addEventListener("mushaf:appmode", checkMode);
    return () => {
      window.removeEventListener("mushaf:kidsmode", checkMode);
      window.removeEventListener("mushaf:appmode", checkMode);
    };
  }, [location.pathname, navigate]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isKidsMode()) {
        e.preventDefault();
        e.returnValue = "وضع الأطفال مقفل لحماية طفلك.";
        return e.returnValue;
      }
    };

    const handlePopState = () => {
      if (isKidsMode()) {
        const allowedPaths = [
          "/games", "/", "/audio", "/mushaf", "/shop", "/profiles", "/settings", "/parent",
          "/teacher-tools", "/ayah-calibrate", "/calibrate", "/timings", "/shading", "/link",
          "/recitation-methods", "/audio-splitter", "/image-manager", "/mushaf-upload", "/sort",
          "/recitation", "/surah-shading", "/shading-settings", "/new-shading", "/shading-box",
          "/sync-audio", "/audio-shading-sync", "/announcements", "/support", "/download", "/releases", "/error"
        ];
        if (!allowedPaths.includes(window.location.pathname)) {
          window.history.pushState(null, "", "/audio");
          startTransition(() => {
            navigate("/audio", { replace: true });
          });
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [navigate]);

  return null;
}

const App = () => {
  const [showSiteLinks, setShowSiteLinks] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !isOnboarded());
  // بوابة "من يتعلّم الآن؟" عند فتح التطبيق
  // وضع الأطفال: فقط إن كان هناك أكثر من طفل.
  const shouldGate = () => {
    try {
      if (!isOnboarded() || isPicked()) return false;
      if (!kidsEnabled()) return false;   // وضع وليّ الأمر أو إخفاء الأطفال بالكامل
      const n = getProfiles().length;
      return n > 1;
    } catch { return false; }
  };
  const [showPicker, setShowPicker] = useState(shouldGate);
  const [showExitGate, setShowExitGate] = useState(false);

  useEffect(() => {
    // Security: Block right-click context menu
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", blockContextMenu);

    // Security: Block dev tools shortcuts
    const blockDevTools = (e: KeyboardEvent) => {
      // F12
      if (e.key === "F12") e.preventDefault();
      // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C" || e.key === "i" || e.key === "j" || e.key === "c")) {
        e.preventDefault();
      }
      // Ctrl+U (View Source)
      if (e.ctrlKey && (e.key === "U" || e.key === "u")) {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", blockDevTools);

    const unlistenPromise = setupTauriCloseHandler(() => {
      setShowExitGate(true);
    });

    const handleGlobalExitRequest = () => {
      setShowExitGate(true);
    };
    window.addEventListener("mushaf:request_exit", handleGlobalExitRequest);

    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockDevTools);
      unlistenPromise.then((unsub) => unsub && unsub());
      window.removeEventListener("mushaf:request_exit", handleGlobalExitRequest);
    };
  }, []);

  useBackgroundNotifications();

  useEffect(() => {
    applyTheme(getTheme());
    // مزامنة البيانات في الخلفية دون أن توقف إكمال بقية المهام عند فشل طلب واحد.
    const syncTimer = setTimeout(() => {
      [
        syncCoordinatesFromServer,
        syncTimingsFromServer,
        syncCustomPagesFromServer,
        syncSurahRegionsFromServer,
        syncBookmarksFromServer,
        syncKidsProfileFromServer,
        syncAdminDataFromServer,
        syncAllShadingFromServer,
      ].forEach((sync) => {
        Promise.resolve().then(sync).catch(() => { /* offline or server unavailable */ });
      });
    }, 1500);

    // Log analytics
    logAppOpen();

    // المكافآت اليومية — تحميل من السيرفر في الخلفية ومطالبتها مرة واحدة يومياً
    setTimeout(() => {
      claimDailyRewards().then((res) => {
        if (res.success && res.reward) {
          incrementStreak();
          toast({
            title: res.reward.message || "🎁 مكافأة اليوم وصلت!",
            description: `تم إضافة ${res.totalAdded} نجمة إلى حسابك`,
          });
        }
      }).catch(() => { /* ignore */ });
    }, 2000);

    // Send localStorage data to Vite plugin (dev-only, silent fail)
    const data = localStorage.getItem("mushaf:ayahCoordinates:v1");
    if (data) {
      fetch('/api/save-boxes', { method: 'POST', body: data }).catch(() => {});
    }

    // تم إزالة فحص التحديثات التلقائي

    // 🎮 ربط لوحة المفاتيح وأذرع التحكم بالتطبيق بالكامل (بدون وضع التلفاز)
    const cleanupRemote = setupRemoteControlListeners();

    return () => {
      clearTimeout(syncTimer);
      cleanupRemote();
    };
  }, []);



  // Ctrl+5 shortcut to toggle site links overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '5') {
        e.preventDefault();
        setShowSiteLinks(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
      <AudioContextProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {/* 📡 شريط تنبيه الانقطاع المؤقت وعودة الاتصال بالإنترنت */}
          <NetworkStatusBar />
          {/* 🌟 شاشة الدخول ثلاثية الأبعاد الدوارة لمدة 5 ثوانٍ عند فتح التطبيق */}
          <Intro3DCarousel />
          <HashRouter basename={import.meta.env.BASE_URL} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <KidsModeGuard />
            <NavigationAudioGuard />
            <Suspense fallback={<QuranLoading fullScreen label="جارٍ فتح التطبيق" />}>
              <Routes>
                {/* صفحة الصفحة/الانتقال: كل تغيير مسار يشغّل حركة دخول موحدة */}
                <Route path="/" element={<PageTransition><HomeRoute /></PageTransition>} />
                <Route path="/audio" element={<PageTransition><Index /></PageTransition>} />
                <Route path="/mushaf" element={<PageTransition><QuranReader /></PageTransition>} />
                <Route path="/games" element={<PageTransition><KidsGames /></PageTransition>} />
                <Route path="/shop" element={<PageTransition><KidsShop /></PageTransition>} />
                <Route path="/settings" element={<PageTransition><SettingsPage /></PageTransition>} />
                <Route path="/parent" element={<PageTransition><ParentDashboard /></PageTransition>} />
                <Route path="/profiles" element={<PageTransition><ProfilePicker /></PageTransition>} />
                <Route path="/manage-audio" element={<PageTransition><CustomAudioManager /></PageTransition>} />
                <Route path="/custom-audio" element={<PageTransition><CustomAudioManager /></PageTransition>} />
                <Route path="/upload" element={<PageTransition><AudioUploadPage /></PageTransition>} />
                <Route path="/upload-desk" element={<PageTransition><UploadDeskPage /></PageTransition>} />

                <Route path="/announcements" element={<PageTransition><AnnouncementsPage /></PageTransition>} />
                <Route path="/support" element={<PageTransition><SupportPage /></PageTransition>} />
                <Route path="/download" element={<PageTransition><LegendaryDownloadHub /></PageTransition>} />
                <Route path="/releases" element={<PageTransition><LegendaryDownloadHub /></PageTransition>} />
                <Route path="/error" element={<PageTransition><ErrorPage /></PageTransition>} />
                <Route path="/admin/releases" element={<PageTransition><AdminReleasesPanel /></PageTransition>} />
                {/* ===== أدوات المعلّم (بدون كلمة مرور — للوالدين والمعلّم) ===== */}
                <Route path="/teacher-tools" element={<PageTransition><TeacherTools /></PageTransition>} />
                <Route path="/ayah-calibrate" element={<PageTransition><AyahCalibration /></PageTransition>} />
                <Route path="/calibrate" element={<PageTransition><LinkAudioPage /></PageTransition>} />
                <Route path="/timings" element={<PageTransition><TimingsRecorder /></PageTransition>} />
                <Route path="/shading" element={<PageTransition><ShadingPage /></PageTransition>} />
                <Route path="/link" element={<PageTransition><LinkAudioPage /></PageTransition>} />
                <Route path="/recitation-methods" element={<PageTransition><RecitationMethods /></PageTransition>} />
                <Route path="/audio-splitter" element={<PageTransition><AudioSplitterPage /></PageTransition>} />
                <Route path="/image-manager" element={<PageTransition><ImageManager /></PageTransition>} />
                <Route path="/mushaf-upload" element={<PageTransition><MushafUploadPage /></PageTransition>} />
                <Route path="/sort" element={<PageTransition><SortPagesPage /></PageTransition>} />
                <Route path="/recitation" element={<PageTransition><RecitationPage /></PageTransition>} />
                <Route path="/surah-shading" element={<PageTransition><SurahShadingPage /></PageTransition>} />
                <Route path="/shading-settings" element={<PageTransition><ShadingSettingsPage /></PageTransition>} />
                <Route path="/new-shading" element={<PageTransition><SurahShadingPage /></PageTransition>} />
                <Route path="/shading-box" element={<PageTransition><SurahShadingPage /></PageTransition>} />
                <Route path="/sync-audio" element={<PageTransition><AudioShadingSyncPage /></PageTransition>} />
                <Route path="/audio-shading-sync" element={<PageTransition><AudioShadingSyncPage /></PageTransition>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
              </Routes>
            </Suspense>
            <SiteLinksOverlay open={showSiteLinks} onClose={() => setShowSiteLinks(false)} />
            {showWelcome && <WelcomeOverlay onDone={() => { markPicked(); setShowWelcome(false); setShowPicker(false); }} />}
            {!showWelcome && showPicker && <ProfilePicker onPicked={() => setShowPicker(false)} />}
            {showExitGate && (
              <ParentalGateModal
                title="إغلاق التطبيق (حماية وضع الأطفال)"
                strictMode={false}
                onSuccess={() => {
                  setShowExitGate(false);
                  setKidsLocked(false);
                  closeTauriApp();
                }}
                onCancel={() => {
                  setShowExitGate(false);
                }}
              />
            )}
            <GlobalPlayerWrapper />
          </HashRouter>
        </TooltipProvider>
      </QueryClientProvider>
      </AudioContextProvider>
  );
};

export default App;
