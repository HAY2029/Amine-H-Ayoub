import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { useEffect, useState, lazy, Suspense, type ReactNode } from "react";
import { supabase, hasValidSupabaseKey } from "./lib/supabase";
import { syncAllShadingFromServer } from "./data/customPages";
import { syncSurahRegistryFromServer } from "./data/surahRegions";
import { syncBookmarksFromServer } from "./data/bookmarks";
import { syncAdminDataFromServer } from "./data/titles";
import { applyTheme, getTheme } from "./utils/theme";

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
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

function PageTransition({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function App() {
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    applyTheme(saved);
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    (async () => {
      if (hasValidSupabaseKey()) {
        await Promise.all([
          syncAllShadingFromServer(),
          syncSurahRegistryFromServer(),
          syncBookmarksFromServer(),
          syncAdminDataFromServer(),
        ]).catch(() => {});
      }
    })();
  }, [themeReady]);

  if (!themeReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<PageTransition><TeacherTools /></PageTransition>} />
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
          <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}

export default App;