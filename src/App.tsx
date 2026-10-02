import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { setupTauriCloseHandler, closeTauriApp } from "./utils/tauriUtils";
import { isKidsMode, setKidsLocked } from "./data/kidsLock";
import ParentalGateModal from "./components/ParentalGateModal";
import { Toaster as Sonner } from "./components/ui/sonner";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { useEffect, useState, useCallback, lazy, Suspense, type ReactNode } from "react";
const SiteLinksOverlay = lazy(() => import("./components/SiteLinksOverlay"));
import { syncCoordinatesFromServer } from "./data/ayahCoordinates";
import { syncTimingsFromServer } from "./data/ayahTimings";
import { syncCustomPagesFromServer, syncAllShadingFromServer } from "./data/customPages";
import { syncSurahRegionsFromServer } from "./data/surahRegions";
import { syncBookmarksFromServer } from "./data/bookmarks";
import { AudioContextProvider } from "./contexts/audioContext";
import { preloadCorpusInBackground } from "./data/lazyCorpus";
const Index = lazy(() => import("./pages/Index.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const QuranReader = lazy(() => import("./pages/QuranReader.tsx"));
const KidsGames = lazy(() => import("./pages/KidsGames.tsx"));
const KidsShop = lazy(() => import("./pages/KidsShop.tsx"));
import { applyTheme, getTheme } from "./utils/theme";
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
import { getProfile, getAppMode, getProfiles, kidsEnabled } from "./data/kidsProfile";
import { toast } from "./hooks/use-toast";
import WelcomeOverlay, { isOnboarded } from "./components/WelcomeOverlay.tsx";
import ProfilePicker, { isPicked, markPicked } from "./components/ProfilePicker.tsx";
import { logAppOpen } from "./utils/analytics.ts";
import { useBackgroundNotifications, showLocalNotification } from "./utils/notifications.ts";
import { claimDailyRewards, incrementStreak } from "./data/dailyRewards";
import { setupRemoteControlListeners } from "./utils/controllerNavigation";

const queryClient = new QueryClient();

// 🎞️ غلاف انتقال موحّد: كل صفحة تدخل بحركة ظهور واحدة (fade + صعود خفيف)
// يستعمل key=location.pathname ليعاد تشغيل الحركة عند كل تغيير مسار،
// ويعمل مع lazy/Suspense لأن الغلاف يبقى خارج منطقة التحميل الكسول.
const PageTransition = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-transition">
      {children}
    </div>
  );
};

// المسار الرئيسي يفتح صفحة الصوت (التلاوات) — المصحف قيد التطوير
// ملاحظة: نعرض الصفحة مباشرة بدل إعادة التوجيه إلى /audio حتى لا يظهر المسار "/" كأنه فارغ،
// مع إبقاء المسار /audio يعمل كما هو عند الدخول عليه من شريط التنقل.
const HomeRoute = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // إن كان مسار الجذر يحمل معاملات (query/hash) فحوّل إلى /audio مع الحفاظ عليها
    if (location.search || location.hash) {
      navigate(`/audio${location.search}${location.hash}`, { replace: true });
    }
  }, [location.search, location.hash, navigate]);

  return <Index />;
};

function KidsModeGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const checkMode = () => {
      const allowedPaths = ["/games", "/", "/audio", "/mushaf", "/shop", "/profiles", "/settings", "/parent"];
      if (isKidsMode() && !allowedPaths.includes(location.pathname)) {
        navigate("/audio", { replace: true });
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
        const allowedPaths = ["/games", "/", "/audio", "/mushaf", "/shop", "/profiles", "/settings", "/parent"];
        if (!allowedPaths.includes(window.location.pathname)) {
          window.history.pushState(null, "", "/audio");
          navigate("/audio", { replace: true });
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
    // ⚡ الأداء: المزامنة مع السيرفر تُؤجَّل للخلفية كي لا تبطئ فتح التطبيق
    const syncTimer = setTimeout(() => {
      syncCoordinatesFromServer();
      syncTimingsFromServer();
      syncCustomPagesFromServer();   // الصفحات المرفوعة + صورها (تُجلب من السيرفر)
      syncSurahRegionsFromServer();  // مناطق السور المعرّفة في المعايرة
      syncBookmarksFromServer();
      syncKidsProfileFromServer();
      syncAdminDataFromServer(); // الألقاب + أكواد النقاط + كود HTML الخارجي (مركزي من لوحة admin.html)
      syncAllShadingFromServer();    // إعدادات التظليل (الثيم، الشفافية، الإخفاء)
    }, 1500);

    // Preload Quran corpus in background after initial render
    // This improves performance when user navigates to reading/listening pages
    setTimeout(() => {
      preloadCorpusInBackground();
    }, 500);

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
          <HashRouter basename={import.meta.env.BASE_URL} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <KidsModeGuard />
            <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div></div>}>
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
          </HashRouter>
        </TooltipProvider>
      </QueryClientProvider>
      </AudioContextProvider>
  );
};

export default App;
