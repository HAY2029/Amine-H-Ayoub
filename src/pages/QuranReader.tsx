import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Play, Pause, Maximize2, Minimize2, X, Shuffle, Pencil, Check, Settings, Bell, SplitSquareHorizontal, SplitSquareVertical, Volume2, VolumeX, Menu, Eye, EyeOff, List, Lock, Baby, Bookmark as BookmarkIcon, Trash2, Plus, Wrench, Headphones, Download, Mic, Repeat, Palette, LayoutGrid, GripVertical, SkipForward, SkipBack, Sun, Moon, Layers, Search, Sparkles, ToggleRight } from "lucide-react";
import { getAudioPath as audioPath, getFallbackAudioUrl, getArchiveGatewayAudioUrl, reportHuggingFaceFailure, getSurahAudioBySpeaker, getTeacherAudioUrl, getKidsAudioUrl } from "@/data/audioUrls";
import { supabase, hasValidSupabaseKey } from "@/lib/supabase";
import { getPageAyahBoxes, PAGE_IMAGE_SIZE, AyahBox, getSavedAyahCoordinates } from "@/data/ayahCoordinates";
import { getTheme, toggleTheme, setTheme } from "@/utils/theme";
import DayNightSwitch from "@/components/ui/DayNightSwitch";
import AppFooter from "@/components/AppFooter";
import AppNav from "@/components/AppNav";
import QuranLoading from "@/components/QuranLoading";
import { getSavedTimings, getSurahTimings } from "@/data/ayahTimings";
import { getSurahServerUrl, getSavedLinks, getSurahLink, saveSurahLink, initDefaultLinks, syncLinksFromServer } from "@/data/surahLink";
import { getSurahSegments, SurahSegment, getOrderedSegments, createAlternatingSegments, saveSurahSegments } from "@/data/surahSegments";
import { getCustomPages, getAllPageImages, getPageOrder, getPageOrderSrcs, savePageOrder, normalizeImageKey, isBogusSrc, sanitizePageOrder } from "@/data/customPages";
import { getPageSurahRegions } from "@/data/surahRegions";
import { addReadingMinutes, addCoins, kidsEnabled as getKidsEnabled, getProgress, isPureMode, setAppMode } from "@/data/kidsProfile";
import { recordTodayActivity } from "@/data/kidsBadges";

import { getBookmarks, addBookmark, removeBookmark, Bookmark } from "@/data/bookmarks";
import { isKidsMode, setKidsLocked, hasKidsPin } from "@/data/kidsLock";
import ParentalGateModal from "@/components/ParentalGateModal";
import { toast } from "@/hooks/use-toast";
import { CODE_QURAN_PAGES } from "@/data/staticPages";
import {
  getLocalShadingSettings,
  saveShadingToServer,
  syncShadingFromServer,
  hexToRgba,
  getAyahShadingStyle,
  PRESET_SHADING_COLORS,
  type ShadingSettings
} from "@/services/shadingSyncService";
import { isTauri, checkOfflineStatus, getOfflineAudioUrl, downloadSurah, listenToDownloadProgress } from "../utils/tauriUtils";
import { isAudioCachedOffline, resolvePlayableAudioUrl } from "@/data/offlineAudioCache";
import { downloadSurahOffline, type SurahDownloadProgress } from "@/data/offlineDownload";
import { useAudioContext } from "@/contexts/audioContext";
import SplitViewPanel from "@/components/SplitViewPanel";
import NotificationsModal from "@/components/NotificationsModal";
import SurahDownloadModal from "@/components/SurahDownloadModal";
import { updateMediaSession, setMediaPlaybackState, isBackgroundAudioEnabled } from "@/utils/backgroundAudio";

// ألوان التظليل — الثيمات الجاهزة أدناه تحمل القيم (ذهبي/نعناعي/وردي)
const SHADING_HIDE_KEY = "mushaf:hideShading";
const SHADING_OPACITY_KEY = "mushaf:shadingOpacity:v1";
const SHADING_THEME_KEY = "mushaf:shadingTheme:v1";

// === أنماط التظليل الجاهزة (ثيمات) — تُطبَّق فوراً وتُحفظ ===
interface ShadingTheme {
  key: string; label: string;
  defaultFill: string; defaultStroke: string;
  teacher: { bg: string; glow: string; text: string };
  kids: { bg: string; glow: string; text: string };
}
const SHADING_THEMES: ShadingTheme[] = [
  {
    key: "gold", label: "ذهبي",
    defaultFill: "rgba(250,204,21,0.18)", defaultStroke: "rgba(180,130,20,0.55)",
    teacher: { bg: "rgba(250,204,21,0.45)", glow: "rgba(217,119,6,0.9)", text: "#92400e" },
    kids: { bg: "rgba(56,189,248,0.45)", glow: "rgba(2,132,199,0.9)", text: "#075985" },
  },
  {
    key: "mint", label: "نعناعي",
    defaultFill: "rgba(52,211,153,0.16)", defaultStroke: "rgba(5,150,105,0.5)",
    teacher: { bg: "rgba(52,211,153,0.45)", glow: "rgba(4,120,87,0.9)", text: "#065f46" },
    kids: { bg: "rgba(251,191,36,0.45)", glow: "rgba(180,83,9,0.9)", text: "#92400e" },
  },
  {
    key: "rose", label: "وردي",
    defaultFill: "rgba(244,114,182,0.15)", defaultStroke: "rgba(190,24,93,0.5)",
    teacher: { bg: "rgba(244,114,182,0.45)", glow: "rgba(157,23,77,0.9)", text: "#831843" },
    kids: { bg: "rgba(167,139,250,0.45)", glow: "rgba(109,40,217,0.9)", text: "#4c1d95" },
  },
];

// === القارئ يقرأ الثيم المحفوظ (localStorage) ===
function loadShadingTheme(): ShadingTheme {
  try {
    const k = localStorage.getItem(SHADING_THEME_KEY);
    return SHADING_THEMES.find(t => t.key === k) || SHADING_THEMES[0];
  } catch { return SHADING_THEMES[0]; }
}

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
    if (hasValidSupabaseKey()) {
      // void — الاستعلام يعيد PostgrestFilterBuilder (وليس Promise) فننتظره يدوياً بـ then
      await Promise.resolve(supabase.from("store").upsert({ key: PAGE_NAMES_KEY, value: all }));
    }
  } catch (e) {
    console.error("Save page name error:", e);
  }
}

function getPageDisplayName(page: { name: string; src: string }): string {
  const custom = getCustomPageNames();
  return custom[page.src] || page.name;
}

/** Fisher-Yates shuffle */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Speaker = "teacher" | "kids";
type PlayMode = "teacher" | "kids";

const STORAGE_KEY = "mushaf:lastPage";
const MUSHAF_LAST_SURAH = "mushaf:lastSurah";
const MUSHAF_LAST_TIME = "mushaf:lastTime";

interface SurahAudio { name: string; number: number; src: string; ayahCount: number; ayahs?: string[]; }
interface PageInfo { name: string; src: string; surahs: SurahAudio[]; }

// صفحات المصحف المدمجة داخل الكود محلياً لضمان جاهزية فورية (0ms) بلا أي اتصال بسيرفر
const BASE_PAGES: PageInfo[] = CODE_QURAN_PAGES;

const SPEAKER_LABELS: Record<Speaker, string> = { teacher: "المعلم", kids: "الأطفال" };

export default function QuranReader() {
  const navigate = useNavigate();
  const safeNavigate = (to: string) => {
    startTransition(() => {
      navigate(to);
    });
  };
  const { simultaneousMode, setSimultaneousMode } = useAudioContext();

  const [customPageList, setCustomPageList] = useState(() => getCustomPages());
  const [customImgs, setCustomImgs] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem("mushaf:cachedCustomImgs:v1");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [orderVersion, setOrderVersion] = useState(0);
  const [pageDataReady, setPageDataReady] = useState(true);

  // اختصار لوحة المفاتيح Z لفتح إعدادات التظليل
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'z' || e.key === 'Z' || e.key === 'ئ') {
        navigate("/settings");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  // تحديث محلي فوري عند التركيز بدون أي اتصال بسيرفر خارجي (0ms)
  useEffect(() => {
    const refresh = () => { 
      setCustomPageList(getCustomPages()); 
      getAllPageImages().then(imgs => {
        setCustomImgs(imgs);
      }).catch(() => {});
      setBookmarks(getBookmarks()); 
      setOrderVersion(v => v + 1);
      setPageDataReady(true);
    };
    refresh();
    const onFocus = () => refresh();
    const onVis = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("mushaf:sync_complete", refresh);
    return () => { 
      window.removeEventListener("focus", onFocus); 
      document.removeEventListener("visibilitychange", onVis); 
      window.removeEventListener("mushaf:sync_complete", refresh);
    };
  }, []);
  
  // مسار الصورة المحلي المباشر من الكود / public/pages بدون اتصال بسيرفر
  const imgSrcFor = (src: string) => {
    if (customImgs[src] && customImgs[src].startsWith("data:")) return customImgs[src];
    return src;
  };

  const imgFallbackFor = useCallback((_src: string): string | null => null, []);

  // تتبّع تحميل صور الصفحات: لا نُظهر التظليل إلا بعد ظهور الصورة (يمنع «تظليل فوق صفحة فارغة»)
  const [loadedImgs, setLoadedImgs] = useState<Set<string>>(() => new Set());
  const markLoaded = useCallback((src: string) => setLoadedImgs(prev => (prev.has(src) ? prev : new Set(prev).add(src))), []);

  // تتبّع وقت القراءة والدراسة وتسجيله في الإحصائيات والأوسمة
  useEffect(() => {
    let accumulatedSecs = 0;
    const flushMinutes = () => {
      if (accumulatedSecs >= 5) {
        const mins = Math.round((accumulatedSecs / 60) * 10) / 10;
        accumulatedSecs = 0;
        if (mins > 0) {
          const { justUnlocked } = addReadingMinutes(mins);
          // نقاط القراءة (المال): نجومتان لكل دقيقة — قليلة لكنها أكثر من نقاط الألعاب
          const stars = Math.max(1, Math.floor(mins / 5));
          addCoins(stars);
          // نقاط مجانية يومية: +5 نجوم مرة واحدة كل يوم عند قراءة/استماع 5 دقائق
          try {
            const bonusKey = `mushaf:readingFreeBonus:${new Date().toISOString().slice(0, 10)}`;
            if (!localStorage.getItem(bonusKey)) {
              localStorage.setItem(bonusKey, "1");
              addCoins(5);
              toast({ title: "🎁 +5 ⭐ نقاط مجانية يومية للقراءة!" });
            }
          } catch { /* ignore */ }
          recordTodayActivity();
          if (justUnlocked) {
            toast({ title: "🎉 أحسنت! اكتمل وقت الاستماع وفتحت الألعاب" });
            // يفتح الألعاب مباشرة عندما يتوفر الوقت — لا ننتظر
            navigate("/games", { replace: true });
          } else {
            toast({ title: `+${stars} ⭐ من القراءة` });
          }
        }
      }
    };

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      // لا نحتسب إلا أثناء تشغيل فعلي للصوت (وليس تحميلاً/تخزيناً مؤقتاً)
      const a = audioRef.current;
      const isActuallyPlaying = !!a && !a.paused && !a.ended && a.readyState >= 3;
      if (!isActuallyPlaying) return;
      accumulatedSecs += 5;
      if (accumulatedSecs >= 30) {
        flushMinutes();
      }
    }, 5000);

    return () => {
      clearInterval(id);
      flushMinutes();
    };
  }, []);
  // === تطبيق ترتيب الصفحات المحفوظ من الإعدادات (دالة عادية قبل pages) ===
  const applyPageOrder = (allPages: PageInfo[]): PageInfo[] => {
    try {
      // المفتاح الموحّد الذي تكتبه صفحة الترتيب/الرفع/القارئ هو "mushaf:pageOrder:v1".
      // (كان القارئ يقرأ مفتاحاً قديماً "mushaf:customPageOrder:v1" — سبب بقاء الترتيب
      //  القديم بصفحة "0" والمكرّرات رغم إصلاح صفحة الترتيب.)
      const ORDER_KEYS = ["mushaf:pageOrder:v1", "mushaf:customPageOrder:v1"];
      let rawOrder: string | null = null;
      let usedKey = ORDER_KEYS[0];
      for (const k of ORDER_KEYS) {
        const v = localStorage.getItem(k);
        if (v) { rawOrder = v; usedKey = k; break; }
      }
      // إن وُجد المفتاح القديم فقط، نُرحّل قيمته إلى المفتاح الموحّد ونحذف القديم نهائياً
      // حتى لا يعود الترتيب القديم (بصفحة "0" والمكرّرات) بعد إصلاح المفتاح.
      if (rawOrder && usedKey === ORDER_KEYS[1]) {
        try {
          localStorage.setItem(ORDER_KEYS[0], rawOrder);
          localStorage.removeItem(ORDER_KEYS[1]);
          usedKey = ORDER_KEYS[0];
        } catch { /* ignore */ }
      }
      if (!rawOrder) return allPages;
      let order = JSON.parse(rawOrder) as unknown[];
      if (!Array.isArray(order) || order.length === 0) return allPages;
      // دعم النسخ التي حفظت فهارس (number[]) بدل srcs
      if (typeof order[0] === "number") {
        order = (order as number[]).map(k => allPages[k]?.src).filter(Boolean);
      }
      const validSrcs = new Set(allPages.map(p => p.src));
      const seenOrder = new Set<string>();
      const cleanOrder: string[] = [];
      for (const raw of order as string[]) {
        const norm = normalizeImageKey(String(raw));
        if (!norm || isBogusSrc(norm)) continue;    // "0.jpg" خاطئة دائماً
        if (!validSrcs.has(norm)) continue;          // غير موجودة
        if (seenOrder.has(norm)) continue;           // مكرّر
        seenOrder.add(norm);
        cleanOrder.push(norm);
      }
      // إن كان الترتيب كله خاطئاً/فارغاً → تجاهله واحذفه
      if (cleanOrder.length === 0) {
        try { localStorage.removeItem(usedKey); } catch { /* ignore */ }
        return allPages;
      }
      if (cleanOrder.length !== order.length) {
        try { localStorage.setItem(usedKey, JSON.stringify(cleanOrder)); } catch { /* ignore */ }
      }
      // الفاتحة أولاً دائماً (لو جاء ترتيب قديم بصفحة غريبة في الصدارة)
      const isFatihaPage = (src: string) => /fatiha|(\b|\/)0\.jpg$/i.test(src);
      const firstNonFatiha = cleanOrder.findIndex(src => !isFatihaPage(src));
      if (firstNonFatiha > 0) {
        const fIdx = cleanOrder.findIndex(src => isFatihaPage(src));
        if (fIdx > 0) {
          const [f] = cleanOrder.splice(fIdx, 1);
          cleanOrder.unshift(f);
        }
      }
      const pageMap = new Map<string, PageInfo>();
      allPages.forEach(p => pageMap.set(p.src, p));
      
      const ordered: PageInfo[] = [];
      const added = new Set<string>();
      const addedPageNums = new Set<number>();
      
      for (const src of cleanOrder) {
        if (pageMap.has(src) && !added.has(src)) {
          const page = pageMap.get(src)!;
          const pNum = page.pageNumber || pageNumForKey(src);
          if (pNum && pNum !== Number.MAX_SAFE_INTEGER && addedPageNums.has(pNum)) continue;
          ordered.push(page);
          added.add(src);
          if (pNum && pNum !== Number.MAX_SAFE_INTEGER) addedPageNums.add(pNum);
        }
      }
      
      for (const p of allPages) {
        if (!added.has(p.src)) {
          const pNum = p.pageNumber || pageNumForKey(p.src);
          if (pNum && pNum !== Number.MAX_SAFE_INTEGER && addedPageNums.has(pNum)) continue;
          ordered.push(p);
          added.add(p.src);
          if (pNum && pNum !== Number.MAX_SAFE_INTEGER) addedPageNums.add(pNum);
        }
      }
      
      return ordered.length > 0 ? ordered : allPages;
    } catch {
      return allPages;
    }
  };

  const pages = useMemo<PageInfo[]>(() => {
    // منع تكرار أي صفحة في المصحف نهائياً (الفاتحة وسائر صفحات جزء عم والقرآن)
    const dedupeMap = new Map<string, PageInfo>();
    const seenPageNums = new Set<number>();
    const normKey = (p: PageInfo) => normalizeImageKey(p.src) || p.src;
    
    CODE_QURAN_PAGES.forEach(p => {
      if (p && p.src) {
        const k = normKey(p);
        const pNum = p.pageNumber || pageNumForKey(k);
        if (pNum && pNum !== Number.MAX_SAFE_INTEGER && seenPageNums.has(pNum)) return;
        if (!dedupeMap.has(k)) {
          dedupeMap.set(k, p);
          if (pNum && pNum !== Number.MAX_SAFE_INTEGER) seenPageNums.add(pNum);
        }
      }
    });
    const allPages = Array.from(dedupeMap.values());

    return applyPageOrder(allPages);
  }, [orderVersion]);

  // === حالة الصفحة: نحفظ src الصفحة (لا الفهرس) ليظل الموضع صحيحاً بعد تحميل صور السيرفر ===
  const [currentPage, setCurrentPage] = useState(() => {
    // المحاولة الأولى: قراءة src المحفوظة
    const savedSrc = localStorage.getItem(STORAGE_KEY + ":src");
    if (savedSrc) {
      // سنحاول إيجاد الفهرس بعد تحميل الصفحات (pages) — مؤقتاً نبدأ 0
    }
    // قراءة الفهرس القديم (للتوافق)
    const s = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    return isNaN(s) || s < 0 ? 0 : s;
  });
  // === تحميل مسبق للصفحات المجاورة (±1 و ±2) → تصفح فوري بلا انتظار ===
  useEffect(() => {
    if (pages.length === 0) return;
    const cur = Math.min(Math.max(currentPage, 0), pages.length - 1);
    [cur + 1, cur - 1, cur + 2, cur - 2].forEach((i) => {
      const p = pages[i];
      if (!p) return;
      const src = imgSrcFor(p.src);
      if (!src) return;
      const im = new Image();
      im.decoding = "async";
      im.src = src;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pages, customImgs]);

  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 1024 : false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // تنظيف أي قيمة سابقة لإعداد تخطي البسملة الخاطئ الذي كان يقفز من الفاتحة إلى النبأ
  useEffect(() => {
    try {
      localStorage.removeItem("mushaf:skipBismillah:v1");
    } catch { /* ignore */ }
  }, []);

  // Audio state
  const [activeSurah, setActiveSurah] = useState<SurahAudio | null>(null);
  const [selectedSurahIdx, setSelectedSurahIdx] = useState(0);
  const [selectedAyah, setSelectedAyah] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  // === الآية النشطة + المتكلم + السورة النشطة (رسم التظليل من React state مباشرة) ===
  const [activeSurahNum, setActiveSurahNum] = useState(-1);
  const [activeAyahNum, setActiveAyahNum] = useState(-1);
  const [activeBoxIndex, setActiveBoxIndex] = useState(-1);
  const [playMode, _setPlayMode] = useState<PlayMode>("teacher");
  const [continuousPlay, _setContinuousPlay] = useState(true);
  const [repeatCount, _setRepeatCount] = useState(0);

  // === REFS that mirror state for use inside callbacks (avoids stale closures) ===
  const playModeRef = useRef<PlayMode>(playMode);
  const continuousPlayRef = useRef(continuousPlay);
  const repeatCountRef = useRef(repeatCount);
  const hideShadingRef = useRef(false);

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

  // Shuffle state
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffledPageOrder, setShuffledPageOrder] = useState<number[]>([]);

  // ترتيب الصفحات (من شاشة «ترتيب» في المعايرة، مُخزَّن على السيرفر كقائمة src).
  // يُعاد حسابه عند تغيّر الصفحات أو اكتمال المزامنة (orderVersion).
  const customPageOrder = useMemo<number[]>(() => {
    const srcs = getPageOrderSrcs();
    if (srcs.length === 0) return [];
    const order = srcs.map((s: string) => pages.findIndex(p => p.src === s)).filter((i: number) => i >= 0);
    pages.forEach((_, i) => { if (!order.includes(i)) order.push(i); });
    return order;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, orderVersion]);

  // Split view state
  const [isSplitView, setIsSplitView] = useState(false);

  // ─── التظليل: حالة مزامَنة مع السيرفر ───
  const [shadingSettings, setShadingSettings] = useState<ShadingSettings>(() => getLocalShadingSettings());
  const [hideShading, setHideShading] = useState<boolean>(() => getLocalShadingSettings().hidden);
  const [shadingOpacity, setShadingOpacity] = useState<number>(() => getLocalShadingSettings().opacity);
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker>(() => getLocalShadingSettings().speaker as Speaker);
  const [shadingTheme, setShadingThemeState] = useState<ShadingTheme>(() => {
    const s = getLocalShadingSettings();
    return SHADING_THEMES.find(t => t.key === s.theme) || SHADING_THEMES[0];
  });

  // مزامنة التظليل من السيرفر عند التحميل والتركيز
  useEffect(() => {
    const syncShading = async () => {
      const synced = await syncShadingFromServer();
      setShadingSettings(synced);
      setHideShading(synced.hidden);
      setShadingOpacity(synced.opacity);
      setActiveSpeaker(synced.speaker as Speaker);
      const theme = SHADING_THEMES.find(t => t.key === synced.theme) || SHADING_THEMES[0];
      setShadingThemeState(theme);
    };
    syncShading();
    const handler = () => syncShading();
    window.addEventListener("mushaf:sync_complete", handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener("mushaf:sync_complete", handler);
      window.removeEventListener("focus", handler);
    };
  }, []);

  const persistHideShading = useCallback((v: boolean) => {
    hideShadingRef.current = v;
    setHideShading(v);
    if (v) { setActiveAyahNum(-1); setActiveSurahNum(-1); }
    saveShadingToServer({ hidden: v });
  }, []);

  const persistShadingOpacity = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0.3, v));
    setShadingOpacity(clamped);
    saveShadingToServer({ opacity: clamped });
  }, []);

  const persistShadingTheme = useCallback((t: ShadingTheme) => {
    setShadingThemeState(t);
    setShadingSettings(prev => ({ ...prev, theme: t.key }));
    saveShadingToServer({ theme: t.key });
  }, []);

  const [shadingTab, setShadingTab] = useState<"teacher" | "kids">("teacher");

  const persistTeacherColor = useCallback((color: string) => {
    setShadingSettings(prev => ({ ...prev, teacherColor: color }));
    saveShadingToServer({ teacherColor: color });
  }, []);

  const persistKidsColor = useCallback((color: string) => {
    setShadingSettings(prev => ({ ...prev, kidsColor: color }));
    saveShadingToServer({ kidsColor: color });
  }, []);

  // الاستماع لأي تغيير في التظليل يحدث من صفحة الإعدادات أو غيرها
  useEffect(() => {
    const handleShadingChanged = (e: Event) => {
      const detail = (e as CustomEvent<ShadingSettings>).detail;
      if (detail) {
        setShadingSettings(detail);
        if (typeof detail.hidden === "boolean") setHideShading(detail.hidden);
        if (typeof detail.opacity === "number") setShadingOpacity(detail.opacity);
        if (detail.speaker) setActiveSpeaker(detail.speaker as Speaker);
      }
    };
    window.addEventListener("mushaf:shading_changed", handleShadingChanged);
    return () => window.removeEventListener("mushaf:shading_changed", handleShadingChanged);
  }, []);

  // ركن الأطفال (قفل برمز) + لوحة التنقّل
  const [kidsMode, setKidsModeState] = useState(isKidsMode);
  const [kidsCorner, setKidsCorner] = useState(getKidsEnabled);   // ركن الأطفال مُفعَّل؟ (ليس وضع وليّ الأمر فقط)
  const [pinAction, setPinAction] = useState<null | "enter" | "exit" | "settings" >(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [surahListOpen, setSurahListOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState<"grid" | "list">("grid");
  const [reorderedPages, setReorderedPages] = useState<PageInfo[]>([]);
  const [pageOrderOpen, setPageOrderOpen] = useState(false);
  const [splitToolOpen, setSplitToolOpen] = useState(false);
  const [pageOrderSrcs, setPageOrderSrcs] = useState<string[]>(() => getPageOrderSrcs());
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // قراءة ترتيب الصفحات محلياً
  useEffect(() => {
    if (!pageOrderOpen) return;
    try { localStorage.removeItem("mushaf:customPageOrder:v1"); } catch { /* ignore */ }
    setPageOrderSrcs(getPageOrderSrcs());
  }, [pageOrderOpen]);

  const openReorder = useCallback(() => {
    const allPages = isShuffled
      ? shuffledPageOrder.map(i => pages[i]).filter((p): p is PageInfo => !!p)
      : pages;
    setReorderedPages([...allPages]);
    setReorderOpen(true);
  }, [isShuffled, shuffledPageOrder, pages]);

  const saveReorder = useCallback(async () => {
    if (reorderedPages.length === 0) return;
    // ترتيب نظيف: بلا مكرّر/خاطئ + الفاتحة أولاً
    const newOrder = sanitizePageOrder(reorderedPages.map(p => p.src));
    if (isShuffled) {
      // تحويل srcs إلى فهارس لقائمة الخلط
      setShuffledPageOrder(
        reorderedPages.map(p => pages.findIndex(x => x.src === p.src)).filter(i => i >= 0)
      );
    } else {
      localStorage.setItem("mushaf:pageOrder:v1", JSON.stringify(newOrder));
      dispatchEvent(new CustomEvent("mushaf:order_changed", { detail: newOrder }));
    }
    setReorderOpen(false);
    toast({ title: "✅ تم حفظ ترتيب الصفحات" });
  }, [reorderedPages, isShuffled, pages]);

  const movePage = useCallback((fromIdx: number, toIdx: number) => {
    setReorderedPages(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const handleSavePageOrder = useCallback(() => {
    // تحويل srcs إلى الفهارس الفعلية
    const srcToIdx: Record<string, number> = {};
    pages.forEach((p, i) => { srcToIdx[p.src] = i; });
    const idxOrder = pageOrderSrcs.map(s => srcToIdx[s]).filter(i => i !== undefined && i >= 0);
    // إضافة أي صفحات غير موجودة في الترتيب في النهاية
    for (let i = 0; i < pages.length; i++) {
      if (!idxOrder.includes(i)) idxOrder.push(i);
    }
    savePageOrder(sanitizePageOrder(idxOrder.map(i => pages[i].src)));
    setOrderVersion(v => v + 1);
    setPageOrderOpen(false);
    toast({ title: "✅ تم حفظ ترتيب الصفحات", description: "سيظهر الترتيب الجديد عند إعادة فتح المصحف" });
  }, [pageOrderSrcs]);

  const handleResetPageOrder = useCallback(() => {
    savePageOrder([]);
    setPageOrderSrcs([]);
    setOrderVersion(v => v + 1);
    setPageOrderOpen(false);
    toast({ title: "✅ تم إعادة تعيين الترتيب", description: "سيعود الترتيب الأصلي" });
  }, []);

  const handleDragStart = useCallback((idx: number) => {
    setDraggedIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback((targetIdx: number) => {
    if (draggedIdx === null || draggedIdx === targetIdx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    setPageOrderSrcs(prev => {
      const next = [...prev];
      const [moved] = next.splice(draggedIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, [draggedIdx]);
  const [navTab, setNavTab] = useState<"surahs" | "bookmarks" | "boxes">("surahs");
  const [boxSearchQuery, setBoxSearchQuery] = useState("");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => getTheme() === "dark");

  useEffect(() => {
    const handleThemeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<"dark" | "light">;
      setIsDarkMode(customEvent.detail ? customEvent.detail === "dark" : getTheme() === "dark");
    };
    window.addEventListener("mushaf:theme", handleThemeEvent);
    return () => window.removeEventListener("mushaf:theme", handleThemeEvent);
  }, []);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>(getBookmarks);
  useEffect(() => { const h = () => setKidsModeState(isKidsMode()); window.addEventListener("mushaf:kidsmode", h); return () => window.removeEventListener("mushaf:kidsmode", h); }, []);
  useEffect(() => { const h = () => setKidsCorner(getKidsEnabled()); window.addEventListener("mushaf:appmode", h); return () => window.removeEventListener("mushaf:appmode", h); }, []);

  const [playExpired, setPlayExpired] = useState(() => getProgress().playExpired);
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

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && !isBackgroundAudioEnabled() && isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
        setMediaPlaybackState("paused");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isPlaying]);

  // Simultaneous playback (teacher + kids together)
  const audioRef2 = useRef<HTMLAudioElement>(null);
  const [isSimultaneousPlaying, setIsSimultaneousPlaying] = useState(false);

  const stopSimultaneous = useCallback(() => {
    const a2 = audioRef2.current;
    if (a2) { a2.pause(); a2.currentTime = 0; }
    setIsSimultaneousPlaying(false);
  }, []);

  // Get the actual page index (shuffle > custom order > identity)
  const getActualPageIndex = useCallback((displayIdx: number) => {
    if (isShuffled && shuffledPageOrder.length > 0) {
      return shuffledPageOrder[displayIdx] ?? displayIdx;
    }
    if (customPageOrder.length > 0) {
      return customPageOrder[displayIdx] ?? displayIdx;
    }
    return displayIdx;
  }, [isShuffled, shuffledPageOrder, customPageOrder]);

  const actualPage = getActualPageIndex(currentPage);

  // ── ركن الأطفال: الدخول يقفل التطبيق، والخروج يتطلّب الرمز ──
  const enterKids = () => { if (hasKidsPin()) { setKidsLocked(true); safeNavigate("/games"); } else setPinAction("enter"); };
  const requestExitKids = () => setPinAction("exit");
  // الإعدادات محميّة: تتطلّب رمز ولي الأمر إن كان مضبوطاً
  const openSettings = () => { if (hasKidsPin()) setPinAction("settings"); else safeNavigate("/settings"); };
  const openTools = () => { if (hasKidsPin()) setPinAction("settings"); else safeNavigate("/teacher-tools"); };

  // ── قائمة كل السور للانتقال المباشر ──
  const allSurahsList = useMemo(() => {
    const seen = new Set<number>();
    const out: { number: number; name: string; pageIdx: number; surahIdx: number }[] = [];
    pages.forEach((p, pi) => p.surahs.forEach((s, si) => {
      if (!seen.has(s.number)) {
        seen.add(s.number);
        out.push({ number: s.number, name: s.name, pageIdx: pi, surahIdx: si });
      }
    }));
    return out;
  }, [pages]);
  const jumpToSurah = (pageIdx: number, surahIdx: number) => {
    let display = pageIdx;
    if (customPageOrder.length > 0) { const d = customPageOrder.indexOf(pageIdx); if (d >= 0) display = d; }
    setCurrentPage(display);
    setSelectedSurahIdx(surahIdx);
    setSurahListOpen(false);
  };

  // ── نظام المربعات: تجميع كافة المربعات المسجلة مع أسمائها وصفحاتها ──
  const allMushafBoxes = useMemo(() => {
    const coords = getSavedAyahCoordinates();
    const list: {
      box: AyahBox;
      pageSrc: string;
      pageIdx: number;
      pageName: string;
      surahName: string;
      displayLabel: string;
    }[] = [];

    pages.forEach((p, pIdx) => {
      const pageBoxes = coords[p.src] || getPageAyahBoxes(p.src);
      pageBoxes.forEach((b) => {
        const surah = p.surahs?.find((s) => s.number === b.surah) || pages.flatMap(x => x.surahs || []).find(s => s.number === b.surah);
        const displayLabel = b.label || (b.ayah === 0 ? "بسملة" : `الآية ${b.ayah}`);
        list.push({
          box: b,
          pageSrc: p.src,
          pageIdx: pIdx,
          pageName: p.name,
          surahName: surah?.name || `سورة ${b.surah}`,
          displayLabel,
        });
      });
    });
    return list;
  }, [pages, orderVersion]);

  const filteredMushafBoxes = useMemo(() => {
    if (!boxSearchQuery.trim()) return allMushafBoxes;
    const q = boxSearchQuery.trim().toLowerCase();
    return allMushafBoxes.filter(
      (item) =>
        item.displayLabel.toLowerCase().includes(q) ||
        item.surahName.toLowerCase().includes(q) ||
        item.pageName.toLowerCase().includes(q) ||
        String(item.box.ayah).includes(q)
    );
  }, [allMushafBoxes, boxSearchQuery]);

  const surahBoxMap = useMemo(() => {
    const map: Record<number, { count: number; labels: string[] }> = {};
    allMushafBoxes.forEach((item) => {
      if (!map[item.box.surah]) {
        map[item.box.surah] = { count: 0, labels: [] };
      }
      map[item.box.surah].count++;
      if (!map[item.box.surah].labels.includes(item.displayLabel)) {
        map[item.box.surah].labels.push(item.displayLabel);
      }
    });
    return map;
  }, [allMushafBoxes]);

  const jumpToBox = (item: { box: AyahBox; pageSrc: string; pageIdx: number; pageName: string; surahName: string; displayLabel: string }) => {
    let display = item.pageIdx;
    if (customPageOrder.length > 0) {
      const d = customPageOrder.indexOf(item.pageIdx);
      if (d >= 0) display = d;
    }
    setCurrentPage(display);
    setSelectedAyah(item.box.ayah);
    const surah = pages[item.pageIdx]?.surahs.find((s) => s.number === item.box.surah);
    if (surah) {
      const sIdx = pages[item.pageIdx]?.surahs.findIndex((s) => s.number === surah.number);
      if (sIdx !== -1) setSelectedSurahIdx(sIdx);
      playAyah(surah, item.box.ayah, playModeRef.current === "kids" ? "kids" : "teacher");
    }
    setSurahListOpen(false);
    toast({
      title: `📍 ${item.displayLabel}`,
      description: `${item.surahName} — ${item.pageName}`,
    });
  };

  // ── العلامات المرجعية ──
  const addCurrentBookmark = () => {
    const page = pages[actualPage];
    if (!page) return;
    const sName = currentPageSurahs[selectedSurahIdx]?.name || currentPageSurahs[0]?.name;
    const bm: Bookmark = { id: `bm-${Date.now()}`, src: page.src, name: getPageDisplayName(page), surah: sName, createdAt: Date.now() };
    setBookmarks(addBookmark(bm));
    toast({ title: "تم حفظ العلامة", description: getPageDisplayName(page) });
  };
  const jumpToBookmark = (bm: Bookmark) => {
    const idx = pages.findIndex(p => p.src === bm.src);
    if (idx < 0) { toast({ title: "الصفحة غير متوفرة", variant: "destructive" }); return; }
    let display = idx;
    if (customPageOrder.length > 0) { const d = customPageOrder.indexOf(idx); if (d >= 0) display = d; }
    setCurrentPage(display);
    setSurahListOpen(false);
  };
  const delBookmark = (id: string) => setBookmarks(removeBookmark(id));

  // Page naming state
  const [editingPageName, setEditingPageName] = useState(false);
  const [tempPageName, setTempPageName] = useState("");
  const [pageNamesVersion, setPageNamesVersion] = useState(0);

  // Offline States
  const [offlineStatus, setOfflineStatus] = useState<Record<number, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<number, number>>({});
  const [isDownloading, setIsDownloading] = useState<Record<number, boolean>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<number, string>>({});
  const [activeDownloadSurah, setActiveDownloadSurah] = useState<{ number: number; name: string; src?: string } | null>(null);
  const [activeDownloadProgressData, setActiveDownloadProgressData] = useState<SurahDownloadProgress | undefined>(undefined);
  const downloadAbortRef = useRef<AbortController | null>(null);

  // Check offline status for all surahs on current page
  const checkCurrentPageOffline = useCallback(async () => {
    const page = pages[actualPage];
    if (!page) return;
    const status: Record<number, boolean> = {};
    for (const s of page.surahs) {
      status[s.number] = isTauri()
        ? await checkOfflineStatus(s.number)
        : await isAudioCachedOffline(s.number, s.src);
    }
    setOfflineStatus(prev => ({ ...prev, ...status }));
  }, [actualPage]);

  useEffect(() => {
    checkCurrentPageOffline();
  }, [actualPage, checkCurrentPageOffline]);

  // Listen to download progress
  useEffect(() => {
    if (!isTauri()) return;
    const unsub = listenToDownloadProgress((payload) => {
      const { surah_number, progress, status } = payload;
      const rounded = Math.round(progress);
      setDownloadProgress(prev => ({ ...prev, [surah_number]: rounded }));
      
      if (activeDownloadSurah?.number === surah_number) {
        setActiveDownloadProgressData({
          progress: rounded,
          status,
          receivedBytes: payload.downloaded_bytes,
          totalBytes: payload.total_bytes,
        });
      }

      if (status === "completed") {
        setIsDownloading(prev => ({ ...prev, [surah_number]: false }));
        setOfflineStatus(prev => ({ ...prev, [surah_number]: true }));
      } else if (status === "error") {
        setIsDownloading(prev => ({ ...prev, [surah_number]: false }));
      } else if (status === "downloading") {
        setIsDownloading(prev => ({ ...prev, [surah_number]: true }));
      }
    });
    return () => unsub();
  }, [activeDownloadSurah]);

  const handleSurahDownload = useCallback(async (surah: { number: number; name: string; src?: string }) => {
    setActiveDownloadSurah(surah);
    if (offlineStatus[surah.number]) {
      setActiveDownloadProgressData({ progress: 100, status: "completed" });
      return;
    }
    if (isDownloading[surah.number]) return;

    setIsDownloading(prev => ({ ...prev, [surah.number]: true }));
    setDownloadProgress(prev => ({ ...prev, [surah.number]: 0 }));
    setDownloadErrors(prev => ({ ...prev, [surah.number]: "" }));
    setActiveDownloadProgressData({ progress: 0, status: "downloading" });
    downloadAbortRef.current = new AbortController();

    try {
      await downloadSurahOffline(
        surah.number,
        surah.src,
        (progressInfo) => {
          setDownloadProgress(prev => ({ ...prev, [surah.number]: progressInfo.progress }));
          setActiveDownloadProgressData(progressInfo);
          if (progressInfo.status === "completed") {
            setIsDownloading(prev => ({ ...prev, [surah.number]: false }));
            setOfflineStatus(prev => ({ ...prev, [surah.number]: true }));
          }
        },
        downloadAbortRef.current.signal
      );
    } catch (error) {
      setIsDownloading(prev => ({ ...prev, [surah.number]: false }));
      const msg = error instanceof Error ? error.message : "تعذر تنزيل الصوت";
      setDownloadErrors(prev => ({ ...prev, [surah.number]: msg }));
      setActiveDownloadProgressData({ progress: 0, status: "error", error: msg });
    }
  }, [isDownloading, offlineStatus]);

  const resolveAudioSrc = useCallback(async (surah: SurahAudio, speaker: Speaker = "teacher") => {
    try {
      // 1. الأولوية القصوى للتوقيتات وروابط الصوت المحددة في استوديو الربط /sync-audio
      const savedTimings = getSavedTimings()[surah.number];
      const link = getSurahLink(surah.number);

      let syncAudioUrl = "";
      if (speaker === "kids") {
        syncAudioUrl = savedTimings?.kidsAudioUrl || link?.kidsUrl || "";
      } else {
        syncAudioUrl = savedTimings?.teacherAudioUrl || link?.teacherUrl || link?.audioUrl || "";
      }

      // إذا وُجد صوت مخصص تم ضبطه في /sync-audio، تشغيله فوراً أو من الذاكرة المحلية
      if (syncAudioUrl) {
        const resolved = await resolvePlayableAudioUrl(surah.number, syncAudioUrl, speaker);
        if (resolved) return resolved;
        return syncAudioUrl;
      }

      // 2. إذا لم يُحدد صوت مخصص في /sync-audio، الاعتماد على الصوت الافتراضي للسورة
      const defaultUrl = audioPath(surah.number, speaker) || surah.src;
      const resolved = await resolvePlayableAudioUrl(surah.number, defaultUrl, speaker);
      if (resolved) return resolved;
      return defaultUrl;
    } catch (e) {
      console.warn("Offline audio resolution fallback:", e);
    }
    return surah.src;
  }, []);

  // === تشغيل السورة بالتناوب بين المعلم والطفل ===
  const [alternatingMode, setAlternatingMode] = useState<boolean>(false);
  const [autoAdvanceSegments, setAutoAdvanceSegments] = useState<boolean>(true);
  const [currentSpeaker, setCurrentSpeaker] = useState<"teacher" | "kids">("teacher");
  const [currentSegments, setCurrentSegments] = useState<SurahSegment[]>([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(0);

  const curSurah = activeSurah || pages[actualPage]?.surahs?.[selectedSurahIdx] || pages[actualPage]?.surahs?.[0];

  // تحميل مقاطع السورة عند تغير السورة
  useEffect(() => {
    const segs = getOrderedSegments(curSurah?.number || 1);
    setCurrentSegments(segs);
    setCurrentSegmentIndex(0);
  }, [curSurah?.number]);

  // تحميل مقاطع تلقائية للسورة إذا لم تكن موجودة
  useEffect(() => {
    if (curSurah && currentSegments.length === 0) {
      const totalAyahs = curSurah.ayahCount || 7;
      const autoSegs = createAlternatingSegments(curSurah.number, totalAyahs, 3, "teacher");
      saveSurahSegments(curSurah.number, autoSegs);
      setCurrentSegments(autoSegs);
    }
  }, [curSurah, currentSegments.length]);
  const { globalAudioRef, currentTrack, setCurrentTrack, setPlayNextHandler, setPlayPrevHandler, requestPlay } = useAudioContext();
  const audioRef = globalAudioRef;
  const requestRef = useRef<number>();
  const lastSavedTimeRef = useRef(0);
  const stopAtRef = useRef<number | null>(null);
  const currentRepeatRef = useRef(0);
  const currentAyahRef = useRef(-1);
  const currentBoxIndexRef = useRef(-1);
  const currentSpeakerRef = useRef<Speaker>("teacher");
  const currentBoxLabelRef = useRef<string | null>(null);
  const handleAyahSegmentEndRef = useRef<() => void>(() => {});
  const segmentEndGuardRef = useRef(false); // prevent double-fire from stopAt + onEnded
  const isHandlingSegmentEndRef = useRef(false);
  const isSeekingRef = useRef(false);
  const expectedStartTimeRef = useRef(0);
  const currentAyahStartRef = useRef(0);
  const internalPauseRef = useRef(false); // guards against external pause listener firing on internal pauses
  const autoFollowRef = useRef(false); // true عندما يتغيّر الصفحة بسبب متابعة التشغيل لسورة ممتدّة على صفحتين (يمنع إيقاف الصوت)


  // === التظليل عبر React state — لا DOM مباشر ===
  const clearAllHighlights = useCallback(() => {
    setActiveAyahNum(-1);
    setActiveSurahNum(-1);
    setActiveBoxIndex(-1);
  }, []);

  const highlightAyah = useCallback((surahNum: number, ayahNum: number, speaker: Speaker, boxIndex?: number) => {
    if (hideShadingRef.current) return;
    setActiveSpeaker(speaker);
    setActiveSurahNum(prev => (prev === surahNum ? prev : surahNum));
    setActiveAyahNum(prev => (prev === ayahNum ? prev : ayahNum));
    setActiveBoxIndex(boxIndex !== undefined ? boxIndex : -1);
  }, []);

  // تشغيل المقطع الحالي بالتناوب بين المعلم والطفل
  const playCurrentSegment = useCallback(async (segment: SurahSegment) => {
    if (!audioRef.current) return;
    
    // تحديد المتحدث
    setCurrentSpeaker(segment.speaker);
    
    // جلب رابط الصوت حسب المتحدث مع دعم الملفات المحملة أوفلاين
    const link = getSurahLink(segment.surah);
    const rawAudioUrl = segment.speaker === "kids" 
      ? (link?.kidsUrl || getSurahServerUrl(segment.surah))
      : (link?.teacherUrl || getSurahServerUrl(segment.surah));
    
    let audioUrl = rawAudioUrl;
    try {
      audioUrl = await resolvePlayableAudioUrl(segment.surah, rawAudioUrl);
    } catch {
      /* ignore */
    }
    
    // تعيين مصدر الصوت فقط إذا تغيّر لتجنب التقطيع
    if (audioRef.current.src !== audioUrl) {
      audioRef.current.src = audioUrl;
    }
    audioRef.current.currentTime = segment.startTime;
    audioRef.current.play().catch(() => {});
    
    // تحديد توقيت الإيقاف
    stopAtRef.current = segment.endTime;
    
    // تظليل الآية الأولى للمقطع
    highlightAyah(segment.surah, segment.startAyah, segment.speaker);
  }, [audioRef, highlightAyah]);

  // الانتقال للمقطع التالي
  const playNextSegment = useCallback(() => {
    setCurrentSegmentIndex(prev => {
      const nextIdx = prev + 1;
      const nextSeg = currentSegments[nextIdx];
      if (nextSeg) {
        playCurrentSegment(nextSeg);
        return nextIdx;
      }
      // انتهى جميع المقاطع - التوقف
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      toast({ title: "انتهى تشغيل السورة بالتناوب بين المعلم والطفل" });
      return prev;
    });
  }, [currentSegments, playCurrentSegment, toast, audioRef]);

  // تبديل نمط التشغيل التناوبي
  const toggleAlternatingMode = useCallback(() => {
    setAlternatingMode(prev => {
      const next = !prev;
      if (next && currentSegments.length > 0) {
        setCurrentSegmentIndex(0);
        playCurrentSegment(currentSegments[0]);
      }
      return next;
    });
  }, [currentSegments, playCurrentSegment]);

  // مراقبة انتهاء المقطع والتحويل تلقائياً
  useEffect(() => {
    if (!audioRef.current || !autoAdvanceSegments || !alternatingMode) return;

    const handleTimeUpdate = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const currentTime = audio.currentTime;
      const stopAt = stopAtRef.current;

      if (stopAt !== null && currentTime >= stopAt - 0.5) {
        stopAtRef.current = null; // منع إعادة الإطلاق لنفس النهاية عدة مرات
        audio.pause();
        playNextSegment();
      }
    };

    audioRef.current.addEventListener("timeupdate", handleTimeUpdate);
    return () => audioRef.current?.removeEventListener("timeupdate", handleTimeUpdate);
  }, [audioRef, autoAdvanceSegments, alternatingMode, playNextSegment]);

  // Shuffle handlers
  const handleShuffle = useCallback(() => {
    if (isShuffled) {
      setIsShuffled(false);
      setShuffledPageOrder([]);
    } else {
      const indices = Array.from({ length: pages.length }, (_, i) => i);
      setShuffledPageOrder(shuffleArray(indices));
      setIsShuffled(true);
      setCurrentPage(0);
    }
  }, [isShuffled]);

  // Page name display helper (re-read on version change)
  const currentPageName = useMemo(() => {
    void pageNamesVersion; // trigger re-computation
    return getPageDisplayName(pages[actualPage] || pages[0]);
  }, [actualPage, pageNamesVersion]);

  const handleSavePageName = useCallback(async () => {
    const page = pages[actualPage];
    if (page) {
      await saveCustomPageName(page.src, tempPageName);
      setPageNamesVersion(v => v + 1);
    }
    setEditingPageName(false);
  }, [actualPage, tempPageName]);

  const handleStartEditPageName = useCallback(() => {
    setTempPageName(currentPageName);
    setEditingPageName(true);
  }, [currentPageName]);

  useEffect(() => {
    const r = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", r); return () => window.removeEventListener("resize", r);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.debug("Fullscreen toggle failed:", err);
    }
  }, []);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // حفظ الصفحة: نحفظ src + الفهرس معاً (يبقى الموضع صحيحاً حتى بعد تحميل صور السيرفر)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(currentPage));
    const curPage = pages[currentPage];
    if (curPage) {
      localStorage.setItem(STORAGE_KEY + ":src", curPage.src);
    }
  }, [currentPage, pages]);

  const pageSrcRestoredRef = useRef(false);

  // تهيئة الروابط الافتراضية للسور عند تحميل التطبيق
  useEffect(() => {
    initDefaultLinks();
    syncLinksFromServer().catch(() => {});
  }, []);

  useEffect(() => {
    if (pageSrcRestoredRef.current) return;
    if (pages.length === 0) return;

    let targetIdx = -1;

    // 1. الأولوية لمسار URL (يدعم كلاً من الاستعلام العادي و HashRouter)
    const hashQuery = window.location.hash.includes("?") ? window.location.hash.slice(window.location.hash.indexOf("?") + 1) : "";
    const urlParams = new URLSearchParams(window.location.search || hashQuery);
    const surahParam = urlParams.get("surah");
    if (surahParam) {
      const targetSurah = parseInt(surahParam, 10);
      targetIdx = pages.findIndex(p => p.surahs?.some(s => s.number === targetSurah));
    }

    // 2. إذا لم يكن هناك رابط، أو لم نجد السورة، نقرأ من التخزين المحلي
    if (targetIdx === -1) {
      const savedSrc = localStorage.getItem(STORAGE_KEY + ":src");
      if (savedSrc) {
        targetIdx = pages.findIndex(p => p.src === savedSrc);
      }
    }

    if (targetIdx >= 0 && targetIdx !== currentPage) {
      setCurrentPage(targetIdx);
    }

    pageSrcRestoredRef.current = true;
  }, [pages, currentPage]);
  const lastPageRef = useRef(currentPage);
  useEffect(() => {
    if (lastPageRef.current === currentPage) return;
    lastPageRef.current = currentPage;

    // تغيُّر الصفحة بسبب متابعة التشغيل لسورة ممتدّة على صفحتين أو متابعة تلاوة: لا توقف الصوت
    if (autoFollowRef.current) { autoFollowRef.current = false; return; }
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setActiveSurah(null);
    currentAyahRef.current = -1;
    currentBoxIndexRef.current = -1;
    setSelectedSurahIdx(0);
    setSelectedAyah(-1);
    stopAtRef.current = null;
    currentRepeatRef.current = 0;
    setEditingPageName(false);
    clearAllHighlights();
  }, [currentPage, clearAllHighlights]);

  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const savedNum = parseInt(localStorage.getItem(MUSHAF_LAST_SURAH) || "0", 10);
    const savedTime = parseFloat(localStorage.getItem(MUSHAF_LAST_TIME) || "0");
    if (!savedNum) return;
    const surahIdx = pages[actualPage]?.surahs.findIndex(s => s.number === savedNum) ?? -1;
    if (surahIdx === -1) return;
    const surah = pages[actualPage].surahs[surahIdx];
    const a = audioRef.current; if (!a) return;
    
    resolveAudioSrc(surah).then(src => {
      a.src = src; a.load();
      setActiveSurah(surah);
      setSelectedSurahIdx(surahIdx);
      a.addEventListener("loadedmetadata", () => {
        if (savedTime > 0 && savedTime < a.duration) {
          a.currentTime = savedTime;
          lastSavedTimeRef.current = savedTime;
        }
      }, { once: true });
    });
  }, [currentPage, resolveAudioSrc, actualPage]);



  const getActualAyahCount = useCallback((surahNumber: number, fallback: number) => {
    const pageBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
    const surahBoxes = pageBoxes.filter(b => b.surah === surahNumber);
    if (surahBoxes.length === 0) return fallback;
    return Math.max(...surahBoxes.map(b => b.ayah));
  }, []);

  const playAyah = useCallback(async (surah: SurahAudio, ayahNum: number, forceSpeaker?: Speaker, boxIndex?: number) => {
    const a = audioRef.current; if (!a) return;
    const sp: Speaker = forceSpeaker ?? (playModeRef.current === "kids" ? "kids" : "teacher");
    currentSpeakerRef.current = sp;
    setActiveSpeaker(sp);

    const targetSrc = await resolveAudioSrc(surah, sp);
    const sameSrc = a.src === targetSrc || (a.src && a.src.endsWith(surah.src.split("/").pop() || surah.src));

    setActiveSurah(surah);
    setSelectedAyah(ayahNum);
    currentAyahRef.current = ayahNum;
    currentBoxIndexRef.current = boxIndex ?? -1;
    stopAtRef.current = null;
    // تظليل فوري ومباشر للآية في واجهة المصحف
    highlightAyah(surah.number, ayahNum, sp, boxIndex);

    // متابعة عبر الصفحات: إن كان صندوق هذه الآية في صفحة غير المعروضة، اقلب إليها دون إيقاف الصوت
    // (لا يقع هذا للسور المضمّنة لأن كل سورة على صفحة واحدة — يُفعَّل فقط لسورة موزّعة على صفحتين)
    {
      const allBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
      const tgtIdx = boxIndex !== undefined ? boxIndex : allBoxes.findIndex(b => b.surah === surah.number && b.ayah === ayahNum);
      if (tgtIdx >= 0) {
        let ownerActual = -1, acc = 0;
        for (let pi = 0; pi < pages.length; pi++) {
          const len = getPageAyahBoxes(pages[pi].src).length;
          if (tgtIdx < acc + len) { ownerActual = pi; break; }
          acc += len;
        }
        if (ownerActual >= 0 && ownerActual !== actualPage) {
          let displayIdx = ownerActual;
          if (isShuffled && shuffledPageOrder.length > 0) displayIdx = shuffledPageOrder.indexOf(ownerActual);
          else if (customPageOrder.length > 0) displayIdx = customPageOrder.indexOf(ownerActual);
          if (displayIdx >= 0) {
            currentBoxIndexRef.current = -1;   // يُعاد التظليل بعد ظهور صناديق الصفحة الجديدة
            autoFollowRef.current = true;
            setCurrentPage(displayIdx);
          }
        }
      }
    }

    const startPlayback = () => {
      currentSpeakerRef.current = sp;
      setActiveSpeaker(sp);

      const timings = getSurahTimings(surah.number);
      const segments = timings?.segments || [];

      let startT = 0;
      let nextT = a.duration || 1e9;
      let foundTimingInBox = false;

      const pageBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
      const surahBoxes = pageBoxes.filter(b => b.surah === surah.number);
      const box = boxIndex !== undefined ? pageBoxes[boxIndex] : surahBoxes.find(b => b.ayah === ayahNum);

      if (box) {
         if (sp === "teacher" && box.audioStart !== undefined && box.audioEnd !== undefined) {
             startT = box.audioStart;
             nextT = box.audioEnd;
             foundTimingInBox = true;
         } else if (sp === "kids") {
             if (box.kidsStart !== undefined && box.kidsEnd !== undefined) {
                 startT = box.kidsStart;
                 nextT = box.kidsEnd;
                 foundTimingInBox = true;
             } else if (box.audioEnd !== undefined) {
                 // إذا لم تُحدد توقيتات الطفل بشكل منفصل، فإن تلاوة الطفل تبدأ مباشرة بعد انتهاء تلاوة المعلم
                 startT = box.audioEnd;
                 const nextBox = surahBoxes.find(b => b.ayah === (box.ayah + 1) && b.audioStart !== undefined);
                 nextT = nextBox?.audioStart ?? (box.audioEnd + 15);
                 foundTimingInBox = true;
             }
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
          } else if (sp === "kids") {
            // مقاطع المعلم موجودة ولكن لم يتم استخراج مقاطع الطفل بعد: الطفل يتلو بعد مقطع المعلم
            const teacherSegments = segments.filter(s => s.speaker === "teacher").sort((a, b) => a.start - b.start);
            const tSeg = teacherSegments.find(s => s.ayah === ayahNum) || teacherSegments[segIdx];
            if (tSeg) {
              startT = tSeg.end;
              const nextTSeg = teacherSegments.find(s => s.ayah === ayahNum + 1) || teacherSegments[teacherSegments.indexOf(tSeg) + 1];
              nextT = nextTSeg ? nextTSeg.start : (a.duration || (tSeg.end + 15));
            } else {
              const total = surah.ayahCount || 1;
              const dur = a.duration && isFinite(a.duration) ? a.duration : 60;
              const ayahDur = dur / total;
              startT = segIdx * ayahDur + (ayahDur * 0.45);
              nextT = Math.min(dur, (segIdx + 1) * ayahDur);
            }
          } else {
            const total = surah.ayahCount || 1;
            const dur = a.duration && isFinite(a.duration) ? a.duration : 60;
            const ayahDur = dur / total;
            startT = segIdx * ayahDur;
            nextT = Math.min(dur, (segIdx + 1) * ayahDur);
          }
        } else {
          const segIdx = ayahNum > 0 ? ayahNum - 1 : 0;
          if (sp === "kids") {
            if (timings?.kids && timings.kids.length > 0 && timings.kids[segIdx] !== undefined) {
              startT = timings.kids[segIdx];
              nextT = timings.kids[segIdx + 1] !== undefined ? timings.kids[segIdx + 1] : (timings.teacher?.[segIdx + 1] ?? (a.duration || 1e9));
            } else if (timings?.kidsStart !== undefined && timings.teacher) {
              const t0 = timings.teacher[0] || 0;
              const curT = timings.teacher[segIdx] || 0;
              startT = timings.kidsStart + (curT - t0);
              const nextTeacher = timings.teacher[segIdx + 1];
              nextT = nextTeacher !== undefined ? (timings.kidsStart + (nextTeacher - t0)) : (a.duration || 1e9);
            } else if (timings?.teacher && timings.teacher[segIdx] !== undefined) {
              const tStart = timings.teacher[segIdx];
              const tNext = timings.teacher[segIdx + 1] ?? (a.duration || (tStart + 15));
              startT = tStart + (tNext - tStart) * 0.45;
              nextT = tNext;
            } else {
              const total = surah.ayahCount || 1;
              const dur = a.duration && isFinite(a.duration) ? a.duration : 60;
              const ayahDur = dur / total;
              startT = segIdx * ayahDur + (ayahDur * 0.45);
              nextT = Math.min(dur, (segIdx + 1) * ayahDur);
            }
          } else {
            const list = timings?.teacher || [];
            if (list[segIdx] !== undefined) {
              startT = list[segIdx];
              nextT = list[segIdx + 1] !== undefined ? list[segIdx + 1] : a.duration || 1e9;
              if (timings?.kidsStart !== undefined && nextT > timings.kidsStart) {
                nextT = timings.kidsStart;
              }
              if (timings?.kids && timings.kids[segIdx] !== undefined) {
                const kidStartT = timings.kids[segIdx];
                if (kidStartT > startT && kidStartT < nextT) {
                  nextT = kidStartT;
                }
              }
            } else {
              const total = surah.ayahCount || 1;
              const dur = a.duration && isFinite(a.duration) ? a.duration : 60;
              const ayahDur = dur / total;
              startT = segIdx * ayahDur;
              nextT = Math.min(dur, (segIdx + 1) * ayahDur);
            }
          }
        }
      }

      currentAyahStartRef.current = startT;
      // ضبط stopAtRef دائماً على نهاية المقطع (nextT) لضمان إيقاف أو انتقال الصوت فور انتهاء تلاوة المتحدث المختار
      // وبذلك لا يتسرب الصوت أبداً إلى المتحدث الآخر (عدم تشغيل الأطفال بعد المعلم، أو العكس)
      stopAtRef.current = nextT;
      isSeekingRef.current = true;
      expectedStartTimeRef.current = startT;
      a.currentTime = startT;
      highlightAyah(surah.number, ayahNum, sp, boxIndex);
      
      a.play().then(() => {
        setIsPlaying(true);
        updateMediaSession({
          title: `سورة ${surah.name} - آية ${ayahNum}`,
          artist: "القرآن الكريم",
          album: "المصحف المرتل برواية ورش",
          onPlay: () => { const aud = audioRef.current; if (aud) aud.play().catch(() => {}); },
          onPause: () => { const aud = audioRef.current; if (aud) aud.pause(); },
        });
        setMediaPlaybackState("playing");
        // ضمان إعادة تشغيل حلقة التتبع لكل مقطع جديد (تكرار/طفل/آية تالية)
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = requestAnimationFrame(trackAudio);
      }).catch(console.error);
    };

    if (!sameSrc) {
      a.src = targetSrc;
      a.load();
      a.addEventListener("loadedmetadata", startPlayback, { once: true });
    } else {
      if (a.duration > 0) startPlayback();
      else a.addEventListener("loadedmetadata", startPlayback, { once: true });
    }
  }, [actualPage, resolveAudioSrc, isShuffled, shuffledPageOrder, customPageOrder]);

  const advanceSurah = useCallback((sp: Speaker) => {
    if (!activeSurah) return;

    // 1) الانتقال للسورة التالية داخل نفس الصفحة
    const page = pages[actualPage];
    const surahIdx = page.surahs.findIndex(s => s.number === activeSurah.number);
    if (surahIdx >= 0 && surahIdx < page.surahs.length - 1) {
      const nextSurah = page.surahs[surahIdx + 1];
      setSelectedSurahIdx(surahIdx + 1);
      
      const pageBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
      const nextSurahBoxes = pageBoxes.filter(b => b.surah === nextSurah.number).sort((a,b) => a.ayah - b.ayah);
      const firstAyah = nextSurahBoxes[0]?.ayah ?? 1;
      const firstBoxIndex = nextSurahBoxes.length > 0 ? pageBoxes.indexOf(nextSurahBoxes[0]) : undefined;
      
      setSelectedAyah(firstAyah);
      playAyah(nextSurah, firstAyah, sp, firstBoxIndex);
      return;
    }

    // 2) آخر سورة في الصفحة → ننتقل للصفحة التالية تلقائياً ونكمل منها.
    // هذا هو الإصلاح الأساسي: كان التشغيل يتوقف تماماً عند نهاية الصفحة
    // فلا يمكن الاستماع لسورة التالية («استمع إلى طفل» / «تقسيم الحفظ») بشكل متواصل.
    const order = isShuffled && shuffledPageOrder.length === pages.length ? shuffledPageOrder : null;
    const nextPageIndex = actualPage + 1;
    if (nextPageIndex >= pages.length) {
      // نهاية المصحف — إيقاف طبيعي
      setIsPlaying(false);
      clearAllHighlights();
      return;
    }

    const resolvedPage = order ? order[nextPageIndex] : nextPageIndex;
    const nextPage = pages[resolvedPage];
    if (!nextPage || nextPage.surahs.length === 0) {
      setIsPlaying(false);
      clearAllHighlights();
      return;
    }

    const nextSurah = nextPage.surahs[0];
    autoFollowRef.current = true;               // يمنع إيقاف الصوت عند تغيير الصفحة
    setCurrentPage(resolvedPage);
    setSelectedSurahIdx(0);

    const allBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
    const nextBoxes = allBoxes.filter(b => b.surah === nextSurah.number).sort((a, b) => a.ayah - b.ayah);
    const firstAyah = nextBoxes[0]?.ayah ?? 1;
    const firstBoxIndex = nextBoxes.length > 0 ? allBoxes.indexOf(nextBoxes[0]) : undefined;

    setSelectedAyah(firstAyah);
    // تأخير قصير حتى يُحدَّث src الصوت للصفحة الجديدة قبل التشغيل
    window.setTimeout(() => {
      playAyah(nextSurah, firstAyah, sp, firstBoxIndex);
    }, 260);
  }, [activeSurah, actualPage, playAyah, clearAllHighlights, pages, isShuffled, shuffledPageOrder]);

  const handleAyahSegmentEnd = useCallback(() => {
    stopAtRef.current = null;
    isHandlingSegmentEndRef.current = false;
    const a = audioRef.current; if (!a || !activeSurah) return;

    // === READ FROM REFS to always get the latest values (not stale closures) ===
    const mode = playModeRef.current;
    const repeat = repeatCountRef.current;
    const continuous = continuousPlayRef.current;

    const timings = getSavedTimings()[activeSurah.number];
    // كشف صوت الطفل من مصدرين: التوقيتات المحفوظة + صناديق المعايرة
    const boxHasKids = pages
      .flatMap(p => getPageAyahBoxes(p.src))
      .some(b => b.surah === activeSurah.number && b.ayah === currentAyahRef.current
        && b.kidsStart !== undefined && b.kidsEnd !== undefined);
    const hasKids = boxHasKids || timings?.segments?.some(s => s.speaker === "kids") || timings?.kidsStart !== undefined;

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
        // إذا كان الصندوق يمثل سطراً آخر له توقيت مستقل، انتقل إليه، وإلا انتقل للآية التالية
        const curBox = currentIndex >= 0 ? sortedBoxesWithIndex[currentIndex]?.box : null;
        const isSameTiming = curBox && candidate.box.ayah === curBox.ayah &&
          candidate.box.audioStart === curBox.audioStart && candidate.box.audioEnd === curBox.audioEnd;
        if (isSameTiming) continue;
        nextItem = candidate;
        break;
      }

      if (nextItem) {
        setSelectedAyah(nextItem.box.ayah);
        playAyah(activeSurah, nextItem.box.ayah, sp, nextItem.globalIndex);
      } else {
        const totalAyahs = activeSurah.ayahCount || 7;
        const curAyah = currentAyahRef.current > 0 ? currentAyahRef.current : 1;
        if (curAyah < totalAyahs) {
          const nextAyah = curAyah + 1;
          setSelectedAyah(nextAyah);
          playAyah(activeSurah, nextAyah, sp);
        } else {
          advanceSurah(sp);
        }
      }
    };

    // "teacher" or "kids" only mode
    const speakerForMode: Speaker = mode === "kids" ? "kids" : "teacher";

    if (repeat === 999 || currentRepeatRef.current < repeat) {
      currentRepeatRef.current++;
      playAyah(activeSurah, currentAyahRef.current, speakerForMode, currentBoxIndexRef.current !== -1 ? currentBoxIndexRef.current : undefined);
    } else {
      currentRepeatRef.current = 0;
      if (continuous) {
        advanceToNextSegment(speakerForMode);
      } else {
        setIsPlaying(false);
      }
    }
  }, [activeSurah, playAyah, actualPage, advanceSurah, clearAllHighlights]);

  const trackAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a || !activeSurah) return;

    if (a.seeking) {
      if (!a.paused) requestRef.current = requestAnimationFrame(trackAudio);
      return;
    }
    if (isSeekingRef.current) {
      if (Math.abs(a.currentTime - expectedStartTimeRef.current) < 0.35 || a.currentTime >= expectedStartTimeRef.current) {
        isSeekingRef.current = false;
      } else {
        if (!a.paused) requestRef.current = requestAnimationFrame(trackAudio);
        return;
      }
    }

    if (stopAtRef.current !== null && a.currentTime >= stopAtRef.current - 0.05) {
      if (repeatCountRef.current > 0) {
        if (repeatCountRef.current === 999 || currentRepeatRef.current < repeatCountRef.current) {
          currentRepeatRef.current++;
          isSeekingRef.current = true;
          expectedStartTimeRef.current = currentAyahStartRef.current;
          a.currentTime = currentAyahStartRef.current;
          return;
        } else {
          currentRepeatRef.current = 0;
          if (continuousPlayRef.current) {
            stopAtRef.current = null;
            segmentEndGuardRef.current = true;
            handleAyahSegmentEndRef.current();
            return;
          } else {
            a.pause();
            setIsPlaying(false);
            stopAtRef.current = null;
            return;
          }
        }
      }

      if (continuousPlayRef.current) {
        stopAtRef.current = null;
        segmentEndGuardRef.current = true;
        handleAyahSegmentEndRef.current();
        return;
      } else {
        a.pause();
        setIsPlaying(false);
        stopAtRef.current = null;
        return;
      }
    }

    const pageBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
    const surahBoxes = pageBoxes.filter(b => b.surah === activeSurah.number);

    let activeBox = null;
    let foundSpeaker: Speaker | null = null;
    let activeBoxGlobalIndex = -1;

    const currentSp = currentSpeakerRef.current;

    // فصل تام بين المعلم والطفل في التظليل:
    // إذا كان المتحدث الحالي طفلاً، لا يُفحص سوى توقيت الطفل (kidsStart/End).
    // وإذا كان المتحدث معلماً، لا يُفحص سوى توقيت المعلم (audioStart/End).
    if (currentSp === "kids") {
      for (let i = 0; i < pageBoxes.length; i++) {
        const box = pageBoxes[i];
        if (box.surah !== activeSurah.number) continue;

        let kStart = box.kidsStart;
        let kEnd = box.kidsEnd;
        if ((kStart === undefined || kEnd === undefined) && box.audioEnd !== undefined) {
          kStart = box.audioEnd;
          const nextBox = pageBoxes.find(b => b.surah === activeSurah.number && b.ayah === box.ayah + 1 && b.audioStart !== undefined);
          kEnd = nextBox?.audioStart ?? (box.audioEnd + 15);
        }

        if (kStart !== undefined && kEnd !== undefined) {
          const endThreshold = kEnd + 0.15;
          if (a.currentTime >= (kStart - 0.05) && a.currentTime <= endThreshold) {
            activeBox = box;
            foundSpeaker = "kids";
            activeBoxGlobalIndex = i;
            break;
          }
        }
      }
    } else {
      for (let i = 0; i < pageBoxes.length; i++) {
        const box = pageBoxes[i];
        if (box.surah !== activeSurah.number) continue;
        if (box.audioStart !== undefined && box.audioEnd !== undefined) {
          const endThreshold = box.audioEnd + 0.15;
          if (a.currentTime >= (box.audioStart - 0.05) && a.currentTime <= endThreshold) {
            activeBox = box;
            foundSpeaker = "teacher";
            activeBoxGlobalIndex = i;
            break;
          }
        }
      }
    }

    if (activeBox && foundSpeaker) {
      if (activeBoxGlobalIndex !== currentBoxIndexRef.current || foundSpeaker !== currentSpeakerRef.current) {
        currentAyahRef.current = activeBox.ayah;
        currentBoxIndexRef.current = activeBoxGlobalIndex;
        currentSpeakerRef.current = foundSpeaker;
        currentBoxLabelRef.current = activeBox.label || null;
        highlightAyah(activeSurah.number, activeBox.ayah, foundSpeaker, activeBoxGlobalIndex);
      }
    } else {
      const timings = getSurahTimings(activeSurah.number);
      const allSegments = timings?.segments || [];
      const speakerSegments = allSegments.filter(s => s.speaker === currentSp);
      if (speakerSegments.length > 0) {
        const activeSeg = speakerSegments.find(s => a.currentTime >= s.start && a.currentTime <= s.end);
        if (activeSeg) {
          // Use segment's own ayah field if available, fallback to index-based lookup
          const segAyah = activeSeg.ayah;
          let ayahNumber: number;
          if (segAyah !== undefined) {
            ayahNumber = segAyah;
          } else {
            const sortedSpeakerSegs = [...speakerSegments].sort((a, b) => a.start - b.start);
            const ayahIdx = sortedSpeakerSegs.findIndex(s => s.id === activeSeg.id);
            const sortedBoxes = [...surahBoxes].sort((a, b) => a.ayah - b.ayah);
            ayahNumber = sortedBoxes[ayahIdx]?.ayah ?? (ayahIdx + 1);
          }

          if (ayahNumber !== currentAyahRef.current || activeSeg.speaker !== currentSpeakerRef.current || currentBoxIndexRef.current !== -1) {
            currentAyahRef.current = ayahNumber;
            currentBoxIndexRef.current = -1;
            currentSpeakerRef.current = activeSeg.speaker;
            currentBoxLabelRef.current = null;
            highlightAyah(activeSurah.number, ayahNumber, activeSeg.speaker);
          }
        } else {
          if (currentAyahRef.current !== -1) {
            currentAyahRef.current = -1;
            currentBoxIndexRef.current = -1;
            clearAllHighlights();
          }
        }
      } else if (currentSp === "kids" && allSegments.some(s => s.speaker === "teacher")) {
        const teacherSegs = allSegments.filter(s => s.speaker === "teacher").sort((a, b) => a.start - b.start);
        let foundKidSeg = false;
        for (let i = 0; i < teacherSegs.length; i++) {
          const tSeg = teacherSegs[i];
          const nextTSeg = teacherSegs[i + 1];
          const kStart = tSeg.end;
          const kEnd = nextTSeg ? nextTSeg.start : (a.duration || (tSeg.end + 20));
          if (a.currentTime >= (kStart - 0.05) && a.currentTime <= (kEnd + 0.15)) {
            const segAyah = tSeg.ayah;
            let ayahNumber: number;
            if (segAyah !== undefined) {
              ayahNumber = segAyah;
            } else {
              const sortedBoxes = [...surahBoxes].sort((a, b) => a.ayah - b.ayah);
              ayahNumber = sortedBoxes[i]?.ayah ?? (i + 1);
            }
            if (ayahNumber !== currentAyahRef.current || currentSpeakerRef.current !== "kids" || currentBoxIndexRef.current !== -1) {
              currentAyahRef.current = ayahNumber;
              currentBoxIndexRef.current = -1;
              currentSpeakerRef.current = "kids";
              currentBoxLabelRef.current = null;
              highlightAyah(activeSurah.number, ayahNumber, "kids");
            }
            foundKidSeg = true;
            break;
          }
        }
        if (!foundKidSeg && currentAyahRef.current !== -1) {
          currentAyahRef.current = -1;
          currentBoxIndexRef.current = -1;
          clearAllHighlights();
        }
      } else {
        const speaker: Speaker = currentSp;
        const list = speaker === "kids" && timings?.kids ? timings.kids : timings?.teacher || [];
        if (list.length > 0) {
          let idx = 0;
          for (let i = 0; i < list.length; i++) {
            if (list[i] <= a.currentTime + 0.05) idx = i;
            else break;
          }
          const ayahOnlyBoxes = surahBoxes.filter(b => b.ayah > 0).sort((a, b) => a.ayah - b.ayah);
          const actualCount = getActualAyahCount(activeSurah.number, activeSurah.ayahCount);
          const fallbackNumber = Math.min(idx + 1, actualCount);
          const ayahNumber = ayahOnlyBoxes[idx]?.ayah ?? fallbackNumber;
          if (ayahNumber !== currentAyahRef.current || speaker !== currentSpeakerRef.current || currentBoxIndexRef.current !== -1) {
            currentAyahRef.current = ayahNumber;
            currentBoxIndexRef.current = -1;
            currentSpeakerRef.current = speaker;
            currentBoxLabelRef.current = null;
            highlightAyah(activeSurah.number, ayahNumber, speaker);
          }
        } else {
          // Linear estimation fallback when no timings exist
          const total = activeSurah.ayahCount;
          if (total > 0 && a.duration > 0 && isFinite(a.duration)) {
            const ayahDur = a.duration / total;
            const idx = Math.min(Math.floor(a.currentTime / ayahDur), total - 1);
            const ayahOnlyBoxes = surahBoxes.filter(b => b.ayah > 0).sort((a, b) => a.ayah - b.ayah);
            const matchingBox = ayahOnlyBoxes[idx] || surahBoxes.find(b => b.ayah === idx + 1);
            if (matchingBox) {
              const ayahNumber = matchingBox.ayah;
              const globalIdx = pageBoxes.indexOf(matchingBox);
              const speaker = currentSpeakerRef.current || "teacher";
              if (ayahNumber !== currentAyahRef.current || speaker !== currentSpeakerRef.current || currentBoxIndexRef.current !== globalIdx) {
                currentAyahRef.current = ayahNumber;
                currentBoxIndexRef.current = globalIdx;
                currentSpeakerRef.current = speaker;
                currentBoxLabelRef.current = matchingBox.label || null;
                highlightAyah(activeSurah.number, ayahNumber, speaker, globalIdx);
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
  }, [activeSurah, actualPage, getActualAyahCount, handleAyahSegmentEnd, highlightAyah, clearAllHighlights]);

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


  // Keep ref always pointing to the latest handleAyahSegmentEnd
  useEffect(() => {
    handleAyahSegmentEndRef.current = handleAyahSegmentEnd;
  }, [handleAyahSegmentEnd]);


  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setAudioTime(a.currentTime);
    const onLoaded = () => setAudioDuration(a.duration || 0);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
    };
  }, [audioRef]);

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const cycleRepeatCount = useCallback(() => {
    setRepeatCount(prev => {
      if (prev === 0) return 1;
      if (prev === 1) return 2;
      if (prev === 2) return 3;
      if (prev === 3) return 5;
      if (prev === 5) return 999;
      return 0;
    });
  }, [setRepeatCount]);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };



  // Swipe page turning gestures
  const touchStartXRef = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? null;
    if (endX !== null) {
      const diffX = endX - touchStartXRef.current;
      const swipeThreshold = 50; // pixels
      if (diffX > swipeThreshold) {
        // Dragged finger to the right (RTL: Go to previous page)
        goPrev();
      } else if (diffX < -swipeThreshold) {
        // Dragged finger to the left (RTL: Go to next page)
        goNext();
      }
    }
    touchStartXRef.current = null;
  };

  const totalDisplayPages = isShuffled ? shuffledPageOrder.length : pages.length;
  useEffect(() => {
    if (!pageDataReady || totalDisplayPages === 0 || currentPage < totalDisplayPages) return;
    setCurrentPage(totalDisplayPages - 1);
  }, [currentPage, pageDataReady, totalDisplayPages]);

  const visiblePages = useMemo(() => {
    // إذا كان الفهرس المحفوظ أعلى من الصفحات المحلية المتاحة حالياً، اعرض
    // صفحة مؤقتة إلى أن تصل قائمة السيرفر، مع إبقاء currentPage لاستعادته لاحقاً.
    const displayPage = pageDataReady
      ? currentPage
      : Math.min(currentPage, Math.max(0, (isShuffled ? shuffledPageOrder.length : pages.length) - 1));
    const p1 = pages[getActualPageIndex(displayPage)];
    if (!p1) return [];
    if (!isDesktop) return [p1];

    // سورة الفاتحة (الصفحة 1 أو 0.jpg) صفحة افتتاحية مقدسة مستقلة دائماً، لا تُقرن بأي صفحة أخرى نهائياً
    const isFatiha = p1.pageNumber === 1 || p1.src.includes("0.jpg") || p1.surahs.some(s => s.number === 1);
    if (isFatiha) return [p1];

    // في الحاسوب، نعرض صفحتين متجاورتين فقط إذا كانتا متتاليتين في المصحف
    const nextIdx = displayPage + 1;
    const p2 = nextIdx < totalDisplayPages ? pages[getActualPageIndex(nextIdx)] : null;
    if (p2 && p2.pageNumber === p1.pageNumber + 1 && !p2.surahs.some(s => s.number === 1)) {
      return [p1, p2];
    }
    return [p1];
  }, [currentPage, getActualPageIndex, isDesktop, isShuffled, pageDataReady, pages, shuffledPageOrder.length, totalDisplayPages]);

  const allBoxes = useMemo(() => pages.flatMap(p => getPageAyahBoxes(p.src)), [pages]);

  // ── اتجاه قلب الصفحة: يُستخدم لتحريك المجموعة كلها (صفحة/صفحتين) معاً ──
  const [turnDir, setTurnDir] = useState<1 | -1>(1);
  const [turnKey, setTurnKey] = useState(0);
  const turnDirRef = useRef<1 | -1>(1);
  // مرجع محدَّث لأحدث صفحة معروضة (يُستخدم لمعرفة اتجاه القلب دون إعادة إنشاء الدالة)
  const currentPageRef = useRef(currentPage);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  const goToPage = useCallback((i: number) => {
    if (i < 0 || i >= totalDisplayPages) return;
    const dir: 1 | -1 = i > currentPageRef.current ? 1 : -1;
    setTurnDir(dir);
    turnDirRef.current = dir;
    setTurnKey(k => k + 1);
    setCurrentPage(i);
  }, [totalDisplayPages]);
  
  const goPrev = useCallback(() => {
    // إذا كانت الصفحة الحالية هي صفحة 1 (أول صفحة بعد الفاتحة)، فالرجوع خطوة واحدة يعيدنا للفاتحة
    let prevStep = 1;
    if (isDesktop) {
      if (currentPage === 1) {
        prevStep = 1;
      } else {
        prevStep = 2;
      }
    }
    let prevPage = currentPage - prevStep;
    goToPage(Math.max(0, prevPage));
  }, [currentPage, goToPage, isDesktop]);
  
  const goNext = useCallback(() => {
    // إذا كانت الصفحة الحالية معروضة بمفردها (كالفاتحة)، ننتقل خطوة واحدة للأمام
    const currentStep = (isDesktop && visiblePages.length > 1) ? 2 : 1;
    let nextPage = currentPage + currentStep;
    goToPage(Math.min(totalDisplayPages - 1, nextPage));
  }, [currentPage, totalDisplayPages, goToPage, isDesktop, visiblePages.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goPrev();
      if (e.key === "ArrowLeft") goNext();
      if (e.key === "Escape") { if (controlsOpen) setControlsOpen(false); else navigate("/audio"); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [controlsOpen, navigate, goPrev, goNext]);

  // ── تحميل مسبق ذكي لصور الصفحات (تظهر فوراً عند التنقّل) ──
  // نُحمّل نافذة واسعة حول الصفحة الحالية (للأمام أكثر، لأن التنقّل للأمام أشيع)
  // مع تحديد عدد الطلبات المتزامنة حتى لا نُشبع الشبكة فتتأخر الصفحة الحالية.
  const preloadCacheRef = useRef<Set<string>>(new Set());
  const PRELOAD_AHEAD = 5;   // للأمام
  const PRELOAD_BEHIND = 3;  // للخلف
  const MAX_CONCURRENT_PRELOADS = 4;

  useEffect(() => {
    let cancelled = false;
    // ترتيب الأهداف: الحالية أولاً، ثم ما بعدها بالتدريج، ثم السابقة
    const targets: number[] = [currentPage];
    for (let d = 1; d <= PRELOAD_AHEAD; d++) targets.push(currentPage + d);
    for (let d = 1; d <= PRELOAD_BEHIND; d++) targets.push(currentPage - d);

    const queue = targets
      .filter(d => d >= 0 && d < totalDisplayPages)
      .map(d => pages[getActualPageIndex(d)])
      .filter((p): p is PageInfo => !!p)
      .map(p => imgSrcFor(p.src))
      .filter(src => !!src && !preloadCacheRef.current.has(src));

    // إزالة المكرّرات مع الحفاظ على الأولوية
    const unique = Array.from(new Set(queue));

    let active = 0;
    let cursor = 0;

    const pump = () => {
      while (!cancelled && active < MAX_CONCURRENT_PRELOADS && cursor < unique.length) {
        const src = unique[cursor++];
        if (preloadCacheRef.current.has(src)) continue;
        preloadCacheRef.current.add(src);
        active += 1;
        const img = new Image();
        img.decoding = "async";
        try {
          (img as HTMLImageElement & { fetchpriority?: string }).fetchpriority =
            src === unique[0] ? "high" : "low";
        } catch { /* ignore */ }
        const done = () => { active -= 1; pump(); };
        img.onload = done;
        img.onerror = done;
        img.src = src;
      }
    };
    pump();

    return () => { cancelled = true; };
  }, [currentPage, totalDisplayPages, getActualPageIndex, customImgs, pages, isDesktop]);

  const currentPageSurahs = useMemo(() => {
    const seen = new Set<number>();
    const out: SurahAudio[] = [];
    visiblePages.flatMap(p => p.surahs).forEach(s => {
      if (!seen.has(s.number)) {
        seen.add(s.number);
        out.push(s);
      }
    });
    return out;
  }, [visiblePages]);
  
  const selectedSurah = currentPageSurahs[selectedSurahIdx] || currentPageSurahs[0];
  const ayahCount = selectedSurah ? getActualAyahCount(selectedSurah.number, selectedSurah.ayahCount) : 0;

  const playNextAyah = useCallback(() => {
    const s = activeSurah || selectedSurah || currentPageSurahs[0];
    if (!s) return;
    const allVisibleBoxes = visiblePages.flatMap(p => getPageAyahBoxes(p.src));
    const surahBoxes = allVisibleBoxes.filter(b => b.surah === s.number).sort((a, b) => a.ayah - b.ayah);
    const total = surahBoxes.length > 0 ? Math.max(...surahBoxes.map(b => b.ayah)) : (s.ayahCount || 7);
    const cur = currentAyahRef.current > 0 ? currentAyahRef.current : (selectedAyah > 0 ? selectedAyah : 1);
    if (cur < total) {
      currentRepeatRef.current = 0;
      playAyah(s, cur + 1, playModeRef.current === "kids" ? "kids" : "teacher");
    } else {
      advanceSurah(playModeRef.current === "kids" ? "kids" : "teacher");
    }
  }, [activeSurah, selectedSurah, currentPageSurahs, visiblePages, selectedAyah, playAyah, advanceSurah]);

  const playPrevAyah = useCallback(() => {
    const s = activeSurah || selectedSurah || currentPageSurahs[0];
    if (!s) return;
    const cur = currentAyahRef.current > 0 ? currentAyahRef.current : (selectedAyah > 0 ? selectedAyah : 1);
    if (cur > 1) {
      currentRepeatRef.current = 0;
      playAyah(s, cur - 1, playModeRef.current === "kids" ? "kids" : "teacher");
    }
  }, [activeSurah, selectedSurah, currentPageSurahs, selectedAyah, playAyah]);

  const handleSwitchSpeaker = useCallback((targetMode: "teacher" | "kids") => {
    if (isSimultaneousPlaying) { stopSimultaneous(); }
    setPlayMode(targetMode);
    playModeRef.current = targetMode;
    setActiveSpeaker(targetMode);
    currentSpeakerRef.current = targetMode;
    saveShadingToServer({ speaker: targetMode }).catch(() => {});

    const s = activeSurah || selectedSurah || currentPageSurahs[0];
    if (!s) return;

    const curAyah = currentAyahRef.current > 0 ? currentAyahRef.current : (selectedAyah > 0 ? selectedAyah : 1);
    currentRepeatRef.current = 0;
    playAyah(s, curAyah, targetMode, currentBoxIndexRef.current >= 0 ? currentBoxIndexRef.current : undefined);
  }, [activeSurah, selectedSurah, currentPageSurahs, selectedAyah, playAyah, setPlayMode, isSimultaneousPlaying, stopSimultaneous]);

  const togglePlayPause = () => {
    const a = audioRef.current;
    if (!a) return;
    const targetSurah = activeSurah || selectedSurah || currentPageSurahs[0];
    if (!targetSurah) return;

    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
    } else {
      const sp: Speaker = playModeRef.current === "kids" ? "kids" : "teacher";
      if (currentAyahRef.current === -1 || !activeSurah) {
        const pageBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
        const surahBoxes = pageBoxes.filter(b => b.surah === targetSurah.number).sort((a,b) => a.ayah - b.ayah);
        const targetAyah = selectedAyah > 0 ? selectedAyah : (surahBoxes[0]?.ayah ?? 1);
        playAyah(targetSurah, targetAyah, sp);
      } else {
        a.play().then(() => setIsPlaying(true)).catch(() => { });
      }
    }
  };

  // ========== Simultaneous Play (Teacher + Kids at the same time) ==========
  const playSimultaneous = useCallback(async (surah: SurahAudio) => {
    const a1 = audioRef.current;
    const a2 = audioRef2.current;
    if (!a1 || !a2) return;

    const targetSrc = await resolveAudioSrc(surah);
    const timings = getSavedTimings()[surah.number];
    if (!timings) return;

    // Teacher plays from the start
    const teacherStart = timings.teacher?.[0] ?? 0;
    // Kids plays from kidsStart or kids[0]
    const kidsStart = timings.kidsStart ?? timings.kids?.[0] ?? 0;

    if (kidsStart === 0 && !timings.kids) return; // No kids section

    // Set up both audios
    a1.src = targetSrc;
    a2.src = targetSrc;

    setActiveSurah(surah);
    requestPlay("mushaf", a1);

    const startBoth = () => {
      a1.currentTime = teacherStart;
      a2.currentTime = kidsStart;
      a1.play().catch(console.error);
      a2.play().catch(console.error);
      setIsPlaying(true);
      setIsSimultaneousPlaying(true);
    };

    a1.load();
    a2.load();

    // Wait for both to load
    let loaded = 0;
    const onLoad = () => {
      loaded++;
      if (loaded >= 2) startBoth();
    };
    a1.addEventListener("loadedmetadata", onLoad, { once: true });
    a2.addEventListener("loadedmetadata", onLoad, { once: true });
  }, [resolveAudioSrc, requestPlay]);

  // ========== Split View Surah Data ==========
  const allPageSurahs = useMemo(() => {
    const seen = new Set<number>();
    const out: { number: number; name: string; audioSrc: string }[] = [];
    pages.forEach(p => p.surahs.forEach(s => {
      if (!seen.has(s.number)) {
        seen.add(s.number);
        out.push({
          number: s.number,
          name: s.name,
          audioSrc: s.src,
        });
      }
    }));
    return out;
  }, [pages]);

  const handleSplitViewSelect = useCallback((surah: { number: number; name: string; audioSrc: string }) => {
    // Find which page this surah belongs to
    const pageIdx = pages.findIndex(p => p.surahs.some(s => s.number === surah.number));
    if (pageIdx !== -1) {
      // Navigate to that page
      if (isShuffled) {
        const displayIdx = shuffledPageOrder.indexOf(pageIdx);
        if (displayIdx !== -1) setCurrentPage(displayIdx);
      } else {
        setCurrentPage(pageIdx);
      }
      // Find the surah on that page and play it
      const pageSurahs = pages[pageIdx].surahs;
      const surahIdx = pageSurahs.findIndex(s => s.number === surah.number);
      if (surahIdx !== -1) {
        setTimeout(() => {
          setSelectedSurahIdx(surahIdx);
          const pageBoxes = getPageAyahBoxes(pages[pageIdx].src);
          const surahBoxes = pageBoxes.filter(b => b.surah === surah.number).sort((a, b) => a.ayah - b.ayah);
          const firstAyah = surahBoxes[0]?.ayah ?? 1;
          setSelectedAyah(firstAyah);
          playAyah(pageSurahs[surahIdx], firstAyah, playMode === "kids" ? "kids" : "teacher");
        }, 100);
      }
    }
  }, [isShuffled, shuffledPageOrder, playAyah, playMode]);

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] w-[100dvw] bg-background overflow-hidden select-none">
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          stopSimultaneous();
          if (segmentEndGuardRef.current) {
            segmentEndGuardRef.current = false;
            return;
          }
          if (continuousPlayRef.current) {
            advanceSurah(playModeRef.current === "kids" ? "kids" : "teacher");
          } else {
            setIsPlaying(false);
          }
        }}
        onSeeked={() => {
          isSeekingRef.current = false;
        }}
        onError={() => {
          const audio = audioRef.current;
          if (!selectedSurah || !audio) return;
          const failedUrl = audio.currentSrc || audio.src;
          if (failedUrl.includes("huggingface.co")) reportHuggingFaceFailure();
          const fallbacks = [getFallbackAudioUrl(selectedSurah.number), getArchiveGatewayAudioUrl(selectedSurah.number)];
          const next = failedUrl.includes("huggingface.co")
            ? fallbacks[0]
            : failedUrl.includes("ia803201.us.archive.org")
              ? fallbacks[1]
              : undefined;
          if (!next) return;
          audio.src = next;
          audio.load();
          audio.play().catch(() => {});
        }}
      />
      {/* Second audio for simultaneous teacher+kids playback */}
      <audio 
        ref={audioRef2} 
        onPlay={() => setIsSimultaneousPlaying(true)}
        onPause={() => setIsSimultaneousPlaying(false)}
      />

      {/* Main content area: mushaf + optional split panel */}
      <div className="flex h-full w-full" dir="rtl">
        {/* Mushaf pages area */}
        <div 
          className={`flex h-full transition-all duration-300 ${isSplitView ? 'w-[60%]' : 'w-full'}`}
          onTouchStart={handleTouchStart} 
          onTouchEnd={handleTouchEnd}
          onClick={() => { }}
        >
          {/* Single page wrapper — centered & hugging the page on desktop */}
          <div className={`flex h-full w-full ${isDesktop ? 'px-4 py-2 justify-center' : ''}`}>
            {/* ظرف المجموعة: يُحرَّك كلياً عند قلب الصفحة (صفحة أو صفحتان معاً) */}
            <div
              key={turnKey}
              className={`mushaf-page-turn relative flex h-full ${turnDir === 1 ? 'mushaf-page-turn--next' : 'mushaf-page-turn--prev'} ${isDesktop ? 'shadow-2xl rounded-lg overflow-hidden ring-1 ring-black/5' : 'w-full'}`}
            >
              {/* لمعة ورقية خفيفة تُظهر حركة القلب كمجموعة واحدة */}
              <div
                aria-hidden="true"
                className="mushaf-turn-glow absolute inset-0 z-20 bg-gradient-to-l from-transparent via-accent/40 to-transparent"
              />
              {visiblePages.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-2xl font-bold text-gray-500 z-50 rounded-lg">
                  لا يوجد صفحة
                </div>
              )}
          {visiblePages.map((page, idx) => (
            <div key={page.src} className={`relative h-full ${isDesktop ? '' : 'flex-1'} min-w-0 flex items-center justify-center bg-background overflow-hidden p-1`}>
              <div
                className={`relative ${isDesktop ? 'shadow-none' : 'shadow-xl'}`}
                style={{ aspectRatio: `${PAGE_IMAGE_SIZE.width}/${PAGE_IMAGE_SIZE.height}`, height: '100%', maxWidth: '100%' }}
              >
                <img src={imgSrcFor(page.src)} alt={page.name}
                  fetchPriority={idx === 0 ? "high" : "auto"}
                  className={`mushaf-page-img absolute inset-0 w-full h-full select-none transition-opacity duration-200 ${loadedImgs.has(page.src) ? "opacity-100" : "opacity-0"}`}
                  draggable={false} decoding="async" referrerPolicy="no-referrer"
                  ref={(el) => {
                    if (el && el.complete && el.naturalWidth > 0 && !loadedImgs.has(page.src)) {
                      markLoaded(page.src);
                    }
                  }}
                  onLoad={() => markLoaded(page.src)}
                  onError={(e) => {
                    // فشل رابط السيرفر → جرّب النسخة المحلية مرة واحدة قبل الاستسلام
                    const fb = imgFallbackFor(page.src);
                    const el = e.currentTarget;
                    if (fb && !el.dataset.fallbackTried) {
                      el.dataset.fallbackTried = "1";
                      el.src = fb;
                      return;
                    }
                    markLoaded(page.src);
                  }} />
                {/* هيكل تحميل لطيف حتى تظهر الصورة (لا تظليل فوق فراغ) */}
                {!loadedImgs.has(page.src) && (
                  <QuranLoading label={`جارٍ تجهيز ${page.name}`} />
                )}
                {loadedImgs.has(page.src) && !hideShading && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${PAGE_IMAGE_SIZE.width} ${PAGE_IMAGE_SIZE.height}`} preserveAspectRatio="none">
                  <defs>
                    <filter id="ayah-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {getPageAyahBoxes(page.src).map((box, i) => {
                    const globalBoxIdx = allBoxes.indexOf(box);
                    const hasSpecificBox = activeBoxIndex >= 0;
                    const isBoxMatch = hasSpecificBox && activeBoxIndex === globalBoxIdx;
                    const isAyahMatch = activeSurahNum === box.surah && activeAyahNum === box.ayah;

                    // تظليل السطر بدقة: إذا حُدّد سطر محدد نشط نظلله، وإلا نظلل الآية
                    const isAct = hasSpecificBox ? isBoxMatch : isAyahMatch;

                    // التظليل اليدوي بالاختيار لا يظهر أبداً أثناء تشغيل الصوت (يمنع أي تداخل بين سورتين أو تظليلتين كلياً)
                    const isSelected = !isPlaying && activeAyahNum <= 0 && selectedSurah?.number === box.surah && selectedAyah === box.ayah;
                    if (!isAct && !isSelected) return null;
                    const currentColor = activeSpeaker === "kids"
                      ? (shadingSettings.kidsColor || "#0ea5e9")
                      : (shadingSettings.teacherColor || "#f59e0b");
                    const actStyle = getAyahShadingStyle(currentColor, shadingOpacity);
                    const selectedFill = hexToRgba(currentColor, 0.22);
                    const selectedStroke = hexToRgba(currentColor, 0.65);
                    return (
                      <rect
                        key={`ayah-rect-${box.surah}-${box.ayah}-${globalBoxIdx >= 0 ? globalBoxIdx : i}`}
                        className={`ayah-highlight-smooth ${isAct ? "ayah-current" : ""} ${isSelected ? "ayah-selected" : ""}`}
                        x={box.x} y={box.y} width={box.width} height={box.height} rx="20" ry="16"
                        fill={isAct ? actStyle.fill : selectedFill}
                        stroke={isAct ? actStyle.stroke : selectedStroke}
                        strokeWidth={isAct ? 3.5 : 2.5}
                        opacity={isAct ? Math.min(1, shadingOpacity + 0.15) : shadingOpacity}
                        filter={isAct ? "url(#ayah-glow-filter)" : "none"}
                        style={{
                          "--ayah-glow": actStyle.glow,
                        } as React.CSSProperties}
                      />
                    );
                  })}
                </svg>
                )}

                <div className="absolute inset-0">
                  {getPageAyahBoxes(page.src).map((box, i) => {
                    const surah = page.surahs.find((s) => s.number === box.surah);
                    if (!surah) return null;
                    return (
                      <button
                        key={`${box.surah}-${box.ayah}-tap-${i}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const sIdx = currentPageSurahs.findIndex(s => s.number === surah.number);
                          if (sIdx !== -1) setSelectedSurahIdx(sIdx);
                          setSelectedAyah(box.ayah);
                          currentRepeatRef.current = 0;
                          // ربط التظليل مباشرة بالتشغيل السلس دون فتح مشغل يحجب المصحف
                          if (isSimultaneousPlaying) { stopSimultaneous(); }
                          const globalIdx = allBoxes.indexOf(box);
                          playAyah(surah, box.ayah, playModeRef.current === "kids" ? "kids" : "teacher", globalIdx >= 0 ? globalIdx : undefined);
                        }}
                        className="absolute rounded-md outline-none transition-colors hover:bg-accent/10 active:bg-accent/20"
                        style={{
                          left: `${(box.x / PAGE_IMAGE_SIZE.width) * 100}%`, top: `${(box.y / PAGE_IMAGE_SIZE.height) * 100}%`,
                          width: `${(box.width / PAGE_IMAGE_SIZE.width) * 100}%`, height: `${(box.height / PAGE_IMAGE_SIZE.height) * 100}%`,
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
          </div>
        </div>

        {/* Split View Panel */}
        {isSplitView && (
          <div className="w-[40%] h-full border-r border-white/10 animate-fade-in">
            <SplitViewPanel
              surahs={allPageSurahs}
              currentPlaying={activeSurah?.number ?? null}
              isPlaying={isPlaying}
              onSelect={handleSplitViewSelect}
              onClose={() => setIsSplitView(false)}
            />
          </div>
        )}
      </div>

      {/* ── الشريط العائم الذكي للمشغل (أسفل المصحف مباشرة) مع اختيار مباشر للمعلم والطفل ── */}
      {!controlsOpen && (
        <div className="absolute bottom-[calc(4.2rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-40 w-[96vw] max-w-xl animate-slide-up-short pointer-events-auto" dir="rtl">
          <div className="backdrop-blur-2xl bg-white/95 dark:bg-[#121915]/95 border border-amber-500/30 dark:border-amber-400/20 shadow-2xl rounded-2xl px-3 py-2 flex items-center justify-between gap-2 text-foreground">
            {/* معلومات السورة والآية */}
            <div className="flex items-center gap-2 min-w-0 flex-1 text-right">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/30 border border-amber-400/30 flex items-center justify-center shrink-0">
                {isPlaying ? (
                  <div className="flex items-center gap-[2px] h-4">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={`w-[2.5px] rounded-full animate-wave ${activeSpeaker === "kids" ? "bg-sky-500" : "bg-amber-500"}`} style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                ) : (
                  <Headphones className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-amiri font-bold text-sm text-foreground truncate">
                  {activeSurah?.name || selectedSurah?.name || currentPageSurahs[0]?.name || "القرآن الكريم"}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {currentBoxLabelRef.current || `﴿ الآية ${currentAyahRef.current > 0 ? currentAyahRef.current : (selectedAyah > 0 ? selectedAyah : 1)} ﴾`}
                </span>
              </div>
            </div>

            {/* زرا التبديل والاختيار المباشر بين المعلم والطفل */}
            <div className="flex items-center gap-1 bg-foreground/5 dark:bg-white/5 p-1 rounded-xl border border-border/40 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSwitchSpeaker("teacher");
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                  playMode === "teacher"
                    ? "bg-amber-500 text-black shadow-md shadow-amber-500/25 font-extrabold ring-1 ring-amber-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}
                title="تشغيل صوت الشيخ المعلم مع التوقيت والتظليل الخاص به"
              >
                <span>🎓</span>
                <span>المعلم</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSwitchSpeaker("kids");
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                  playMode === "kids"
                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/25 font-extrabold ring-1 ring-sky-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}
                title="تشغيل صوت الطفل مع التوقيت والتظليل الخاص به"
              >
                <span>👶</span>
                <span>الطفل</span>
              </button>
            </div>

            {/* أزرار التحكم بالتشغيل والآيات والتكرار */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={playPrevAyah}
                aria-label="الآية السابقة"
                title="الآية السابقة"
                className="w-8 h-8 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground flex items-center justify-center active:scale-90 transition-transform"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              <button
                onClick={togglePlayPause}
                aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
                className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all ${
                  isPlaying
                    ? (activeSpeaker === "kids" ? "bg-sky-500 text-white shadow-sky-500/30" : "bg-amber-500 text-black shadow-amber-500/30")
                    : (activeSpeaker === "kids" ? "bg-sky-400 text-white shadow-sky-400/20" : "bg-amber-400 text-black shadow-amber-400/20")
                }`}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              <button
                onClick={playNextAyah}
                aria-label="الآية التالية"
                title="الآية التالية"
                className="w-8 h-8 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground flex items-center justify-center active:scale-90 transition-transform"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={cycleRepeatCount}
                className={`px-2 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all border ${
                  repeatCount > 0
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300"
                    : "bg-foreground/5 border-transparent text-muted-foreground hover:text-foreground"
                }`}
                title="تبديل تكرار الآية"
              >
                <Repeat className="w-3 h-3" />
                <span>{repeatCount === 0 ? "بدون" : repeatCount === 999 ? "♾️" : `${repeatCount}x`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── أيقونات الخيارات (منفصلة، أسفل وسط الشاشة) ── */}
      {!controlsOpen && (
        <div className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 flex-wrap justify-center max-w-[90vw]" dir="rtl">
          {([
            { key: "back", icon: <ArrowRight className="w-5 h-5 text-foreground" />, label: "رجوع", onClick: () => safeNavigate("/audio"), active: false },
            {
              key: "theme",
              icon: isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-600 dark:text-amber-300" />,
              label: isDarkMode ? "الوضع النهاري" : "الوضع الليلي",
              onClick: () => {
                const next = toggleTheme();
                setIsDarkMode(next === "dark");
                toast({ title: next === "dark" ? "🌙 تم تفعيل الوضع الليلي للمصحف" : "☀️ تم تفعيل الوضع النهاري للمصحف" });
              },
              active: isDarkMode
            },
            { key: "grid", icon: <LayoutGrid className="w-5 h-5 text-foreground" />, label: "وصول مباشر", onClick: () => setIsGridOpen(true), active: isGridOpen },
            kidsMode && !isPureMode() && { key: "games", icon: <Baby className="w-5 h-5 text-foreground" />, label: "الألعاب", onClick: () => safeNavigate("/games"), active: false },
            kidsMode
              ? { key: "lock", icon: <Lock className="w-5 h-5 text-foreground" />, label: "خروج من ركن الأطفال", onClick: requestExitKids, active: true }
              : (kidsCorner && !isPureMode() && { key: "kids", icon: <Baby className="w-5 h-5 text-foreground" />, label: "ركن الأطفال", onClick: enterKids, active: false }),
            !kidsMode && { key: "settings", icon: <Settings className="w-5 h-5 text-foreground" />, label: "الإعدادات", onClick: openSettings, active: false },
          ].filter(Boolean) as { key: string; icon: JSX.Element; label: string; onClick: () => void; active: boolean }[]).map(b => (
            <button
              key={b.key}
              onClick={b.onClick}
              aria-label={b.label}
              title={b.label}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 border ${
                b.active
                  ? "bg-amber-400 text-black border-amber-500 shadow-amber-500/20"
                  : "bg-white/85 dark:bg-[#1a231d]/90 text-foreground border-white/40 dark:border-white/10 hover:bg-white dark:hover:bg-[#232f27]"
              }`}
              style={{ backdropFilter: "blur(14px) saturate(140%)" }}
            >
              {b.icon}
            </button>
          ))}
        </div>
      )}

      {/* لوحة التنقّل — السور ونظام المربعات والعلامات المرجعية */}
      {surahListOpen && (
        <div className="absolute inset-0 z-[55] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setSurahListOpen(false)}>
          <div className="w-full max-w-md max-h-[78dvh] overflow-y-auto rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-2xl border-t border-white/40 dark:border-white/10 bg-white/95 dark:bg-[#121915]/95 backdrop-blur-2xl text-foreground"
            onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex gap-1 bg-foreground/5 dark:bg-white/5 rounded-xl p-1">
                <button onClick={() => setNavTab("surahs")} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${navTab === "surahs" ? "bg-amber-400 text-black shadow-sm" : "text-foreground/70 dark:text-stone-300"}`}><List className="w-3.5 h-3.5" /> السور</button>
                <button onClick={() => setNavTab("boxes")} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${navTab === "boxes" ? "bg-amber-400 text-black shadow-sm" : "text-foreground/70 dark:text-stone-300"}`}><Layers className="w-3.5 h-3.5" /> نظام المربعات</button>
                <button onClick={() => setNavTab("bookmarks")} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${navTab === "bookmarks" ? "bg-amber-400 text-black shadow-sm" : "text-foreground/70 dark:text-stone-300"}`}><BookmarkIcon className="w-3.5 h-3.5" /> العلامات</button>
              </div>
              <button onClick={() => setSurahListOpen(false)} aria-label="إغلاق" className="w-8 h-8 rounded-full bg-foreground/10 hover:bg-foreground/20 text-foreground flex items-center justify-center transition-colors"><X className="w-4 h-4" /></button>
            </div>

            {navTab === "boxes" ? (
              <div className="space-y-3">
                {/* شريط البحث في المربعات */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={boxSearchQuery}
                    onChange={(e) => setBoxSearchQuery(e.target.value)}
                    placeholder="ابحث باسم المربع (مثل: بسملة، الآية 1)..."
                    className="w-full bg-foreground/5 dark:bg-white/5 border border-border/40 rounded-xl px-3 py-2 pr-9 text-xs font-bold text-foreground outline-none focus:border-amber-500/50"
                  />
                  {boxSearchQuery && (
                    <button onClick={() => setBoxSearchQuery("")} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>المربعات المتاحة ({filteredMushafBoxes.length})</span>
                  <span>اضغط للانتقال المباشر والتظليل</span>
                </div>

                {filteredMushafBoxes.length === 0 ? (
                  <div className="text-center py-8 rounded-2xl bg-foreground/5 border border-dashed border-border/40 p-4 space-y-1">
                    <Layers className="w-8 h-8 text-muted-foreground/40 mx-auto mb-1" />
                    <p className="font-bold text-xs text-foreground">لا توجد مربعات مطابقة</p>
                    <p className="text-[10px] text-muted-foreground">يمكنك إضافة وتسمية مربعات جديدة من محرر التظليل.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-0.5 custom-scrollbar">
                    {filteredMushafBoxes.map((item, idx) => {
                      const isCurrentBoxActive = activeSurahNum === item.box.surah && activeAyahNum === item.box.ayah;
                      return (
                        <button
                          key={`mushaf-box-${item.box.surah}-${item.box.ayah}-${idx}`}
                          onClick={() => jumpToBox(item)}
                          className={`w-full p-2.5 rounded-2xl border text-right transition-all flex items-center justify-between gap-2.5 ${
                            isCurrentBoxActive
                              ? "bg-amber-500/20 dark:bg-amber-500/30 border-amber-500 shadow-md ring-1 ring-amber-400/50"
                              : "bg-foreground/5 hover:bg-amber-500/10 dark:hover:bg-amber-500/15 border-border/30 hover:border-amber-500/40"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm border border-white/20"
                              style={{ backgroundColor: item.box.color || "#eab308" }}
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-amiri font-bold text-sm text-foreground truncate">
                                {item.displayLabel}
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate">
                                {item.surahName} · {item.pageName}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-foreground/5 border border-border/30 text-muted-foreground">
                              {item.box.ayah === 0 ? "بسملة" : `آية ${item.box.ayah}`}
                            </span>
                            <Play className="w-3.5 h-3.5 text-amber-500" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : navTab === "surahs" ? (
              <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto pr-0.5 custom-scrollbar">
                {allSurahsList.map((s, i) => {
                  const bCount = surahBoxMap[s.number]?.count || 0;
                  return (
                    <button key={`${s.number}-${i}`} onClick={() => jumpToSurah(s.pageIdx, s.surahIdx)}
                      className="p-2.5 rounded-xl bg-foreground/5 hover:bg-amber-200/70 dark:hover:bg-amber-950/50 text-right font-bold text-sm flex items-center justify-between gap-2 active:scale-[0.98] transition-all border border-transparent hover:border-amber-500/30">
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{s.name}</span>
                        {bCount > 0 && (
                          <span className="text-[9px] text-amber-600 dark:text-amber-400 font-sans font-medium flex items-center gap-1">
                            <Layers className="w-2.5 h-2.5" /> {bCount} مربع
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">{s.number}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={addCurrentBookmark} className="w-full p-2.5 rounded-xl bg-amber-500 text-black font-bold flex items-center justify-center gap-1 active:scale-95"><Plus className="w-4 h-4" /> أضف علامة للموضع الحالي</button>
                {bookmarks.length === 0 && <p className="text-[12px] text-muted-foreground text-center py-3">لا توجد علامات بعد — احفظ موضعك الحالي.</p>}
                {bookmarks.map(b => (
                  <div key={b.id} className="flex items-center gap-2 rounded-xl bg-foreground/5 p-2">
                    <button onClick={() => jumpToBookmark(b)} className="flex-1 min-w-0 text-right active:scale-[0.98]">
                      <span className="block font-bold text-sm text-foreground truncate">{b.surah || b.name}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">{b.name}</span>
                    </button>
                    <button onClick={() => delBookmark(b.id)} aria-label="حذف العلامة" className="w-8 h-8 rounded-lg bg-red-500/15 text-red-600 flex items-center justify-center shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── (لوحة التظليل تم نقلها بالكامل إلى الإعدادات) ── */}

      {/* ── لوحة ترتيب الصفحات — صديقة الهاتف ── */}
      {pageOrderOpen && (
        <div className="absolute inset-0 z-[56] flex items-end justify-center bg-black/55 animate-fade-in" onClick={() => setPageOrderOpen(false)}>
          <div
            className="w-full max-w-lg max-h-[85dvh] pb-[env(safe-area-inset-bottom,0px)] rounded-t-3xl animate-slide-up-short pointer-events-auto overflow-hidden flex flex-col bg-white/95 dark:bg-[#121915]/95 backdrop-blur-2xl text-foreground border-t border-white/40 dark:border-white/10"
            onClick={e => e.stopPropagation()}
            dir="rtl"
          >
            {/* رأس اللوحة */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-muted/50">
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 rounded-xl bg-accent/10 flex items-center justify-center"><List className="w-4 h-4 text-accent" /></span>
                <div>
                  <h3 className="font-bold text-base text-foreground">ترتيب الصفحات</h3>
                  <p className="text-[10px] text-muted-foreground">اسحب وأفلت لإعادة الترتيب</p>
                </div>
              </div>
              <button onClick={() => setPageOrderOpen(false)} aria-label="إغلاق" className="w-9 h-9 rounded-full bg-foreground/5 flex items-center justify-center active:scale-90">
                <X className="w-4 h-4 text-foreground/70" />
              </button>
            </div>

            {/* قائمة الصفحات بالسحب */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {pageOrderSrcs.length === 0 ? (
                <button
                  onClick={() => setPageOrderSrcs(pages.map(p => p.src))}
                  className="w-full py-4 rounded-2xl border-2 border-dashed border-muted-foreground/30 text-muted-foreground font-bold text-sm active:scale-[0.98] transition-transform"
                >
                  📋 تحميل كل الصفحات للترتيب
                </button>
              ) : (
                <div className="space-y-2">
                  {pageOrderSrcs.map((src, idx) => {
                    const page = pages.find(p => p.src === src);
                    if (!page) return null;
                    const isOver = dragOverIdx === idx;
                    return (
                      <div
                        key={src}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                        className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all cursor-grab active:cursor-grabbing select-none ${isOver ? "border-accent bg-accent/10 scale-[1.02]" : "border-transparent bg-foreground/5"} ${draggedIdx === idx ? "opacity-50 scale-95" : ""}`}
                      >
                        <span className="text-[10px] font-bold text-muted-foreground bg-muted/50 w-6 h-6 rounded-full flex items-center justify-center">{idx + 1}</span>
                        <div className="w-12 h-16 rounded-lg bg-muted/30 overflow-hidden shrink-0">
                          <img src={imgSrcFor(page.src)} alt="" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="block font-bold text-sm text-foreground truncate">{page.name}</span>
                          <span className="block text-[11px] text-muted-foreground">{page.surahs?.map(s => s.name).join(" • ") || "—"}</span>
                        </div>
                        <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* أزرار الحفظ */}
            {pageOrderSrcs.length > 0 && (
              <div className="px-5 py-4 border-t border-muted/50 space-y-2">
                <button
                  onClick={handleSavePageOrder}
                  className="w-full py-3 rounded-2xl bg-accent text-accent-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] shadow-lg"
                >
                  <Check className="w-4 h-4" /> حفظ الترتيب
                </button>
                <button
                  onClick={handleResetPageOrder}
                  className="w-full py-2.5 rounded-2xl bg-foreground/5 text-foreground/70 font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.97]"
                >
                  🔄 إعادة تعيين الترتيب الأصلي
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── لوحة تقسيم الصوت — صديقة الهاتف ── */}
      {splitToolOpen && (() => {

        const surah = selectedSurah || currentPageSurahs[0];
        const surahNum = surah?.number ?? 0;
        const timings = getSurahTimings(surahNum);
        const segList: { start: number; end: number; type: 'teacher' | 'kids' }[] = [];
        if (timings?.teacher?.length) {
          for (let i = 0; i < timings.teacher.length; i += 2)
            segList.push({ start: timings.teacher[i], end: timings.teacher[i + 1] ?? timings.teacher[i] + 2, type: 'teacher' });
        }
        if (timings?.kids?.length) {
          for (let i = 0; i < timings.kids.length; i += 2)
            segList.push({ start: timings.kids[i], end: timings.kids[i + 1] ?? timings.kids[i] + 2, type: 'kids' });
        }
        segList.sort((a, b) => a.start - b.start);
        const stats = { t: segList.filter(s => s.type === 'teacher').length, k: segList.filter(s => s.type === 'kids').length };
        return (
          <div className="absolute inset-0 z-[57] flex items-end justify-center bg-black/55 animate-fade-in" onClick={() => setSplitToolOpen(false)}>
            <div className="w-full max-w-lg max-h-[88dvh] pb-[env(safe-area-inset-bottom,0px)] rounded-t-3xl animate-slide-up-short overflow-hidden flex flex-col bg-white/95 dark:bg-[#121915]/95 backdrop-blur-2xl text-foreground border-t border-white/40 dark:border-white/10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-muted/50">
                <div className="flex items-center gap-2">
                  <span className="h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center"><SplitSquareHorizontal className="w-4 h-4 text-violet-600" /></span>
                  <div>
                    <h3 className="font-bold text-base text-foreground">تقسيم الصوت</h3>
                    <p className="text-[10px] text-muted-foreground">{surah ? `${surah.name}` : 'اختر سورة'}</p>
                  </div>
                </div>
                <button onClick={() => setSplitToolOpen(false)} aria-label="إغلاق" className="w-9 h-9 rounded-full bg-foreground/5 flex items-center justify-center active:scale-90"><X className="w-4 h-4 text-foreground/70" /></button>
              </div>
              <div className="px-5 py-3 grid grid-cols-3 gap-2 border-b border-muted/30">
                <div className="rounded-xl bg-amber-500/10 p-2 text-center"><span className="block text-[10px] text-muted-foreground">المعلم</span><span className="block text-lg font-extrabold text-amber-600">{stats.t}</span></div>
                <div className="rounded-xl bg-sky-500/10 p-2 text-center"><span className="block text-[10px] text-muted-foreground">الطفل</span><span className="block text-lg font-extrabold text-sky-600">{stats.k}</span></div>
                <div className="rounded-xl bg-emerald-500/10 p-2 text-center"><span className="block text-[10px] text-muted-foreground">الإجمالي</span><span className="block text-lg font-extrabold text-emerald-600">{segList.length}</span></div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {segList.length === 0 ? (
                  <div className="text-center py-8"><span className="block text-3xl mb-2">🎙️</span><p className="font-bold text-sm text-foreground mb-1">لا توجد توقيتات بعد</p><p className="text-[11px] text-muted-foreground">اذهب لصفحة التوقيت لتسجيل المقاطع.</p></div>
                ) : (
                  <div className="space-y-2">
                    {segList.map((seg, i) => (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-2xl border-2 ${seg.type === 'teacher' ? 'border-amber-500/30 bg-amber-500/5' : 'border-sky-500/30 bg-sky-500/5'}`}>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${seg.type === 'teacher' ? 'bg-amber-500/20 text-amber-700' : 'bg-sky-500/20 text-sky-700'}`}>{seg.type === 'teacher' ? '🎓 معلم' : '👶 طفل'}</span>
                        <div className="flex-1 min-w-0">
                          <span className="block font-bold text-sm">{Math.floor(seg.start / 60)}:{String(Math.floor(seg.start % 60)).padStart(2, '0')} — {Math.floor(seg.end / 60)}:{String(Math.floor(seg.end % 60)).padStart(2, '0')}</span>
                          <span className="block text-[11px] text-muted-foreground">المدة: {(seg.end - seg.start).toFixed(1)} ث</span>
                        </div>
                        <button onClick={() => { const a = audioRef.current; if (a) { a.src = surah?.src || ''; a.currentTime = seg.start; a.play().catch(() => {}); setIsPlaying(true); setActiveSurah(surah); } }} className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center active:scale-90"><Play className="w-4 h-4 text-accent" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-5 py-4 border-t border-muted/50 space-y-2">
                <button onClick={() => { setSplitToolOpen(false); safeNavigate('/timings'); }} className="w-full py-3 rounded-2xl bg-violet-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] shadow-lg"><Wrench className="w-4 h-4" /> صفحة التسجيل المتقدم</button>
                <button onClick={() => setSplitToolOpen(false)} className="w-full py-2.5 rounded-2xl bg-foreground/5 text-foreground/70 font-bold text-xs active:scale-[0.97]">إغلاق</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* حماية وضع الأطفال والوالدين (Parental Gate) */}
      {pinAction && (
        <ParentalGateModal
          title={
            pinAction === "enter"
              ? "إعداد رمز حماية وضع الأطفال"
              : pinAction === "settings"
              ? "أدخل رمز ولي الأمر للإعدادات"
              : "الخروج من ركن الأطفال"
          }
          onSuccess={() => {
            if (pinAction === "enter") {
              setAppMode("kids");
              setKidsLocked(true);
              safeNavigate("/games");
            } else if (pinAction === "settings") {
              sessionStorage.setItem("mushaf:settingsUnlocked", "1");
              safeNavigate("/settings");
            } else {
              setAppMode("parent");
              setKidsLocked(false);
            }
            setPinAction(null);
          }}
          onCancel={() => setPinAction(null)}
        />
      )}

      {controlsOpen && (
        <div className="absolute inset-x-0 bottom-0 z-40 animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 -top-32 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
          <div className="relative mx-auto max-w-2xl m-3 max-h-[85dvh] overflow-y-auto rounded-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-2xl border border-white/30 dark:border-white/10 bg-white/90 dark:bg-[#121915]/95 backdrop-blur-2xl text-foreground">
            <div className="flex items-center justify-between mb-3">
              {editingPageName ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={tempPageName}
                    onChange={(e) => setTempPageName(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-background border border-accent/50 font-amiri font-bold text-base outline-none focus:ring-2 focus:ring-accent/50 text-foreground"
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
                {selectedSurah && (
                  <div className="mr-2">
                    {isDownloading[selectedSurah.number] ? (
                      <button
                        onClick={() => {
                          setActiveDownloadSurah({ number: selectedSurah.number, name: selectedSurah.name, src: selectedSurah.src });
                        }}
                        className="text-[10px] bg-amber-100/10 hover:bg-amber-100/20 text-amber-500 border border-amber-500/20 font-bold px-2.5 py-1 rounded-full animate-pulse flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="انقر لعرض تفاصيل التحميل الدقيقة"
                      >
                        <Download className="w-3 h-3 animate-pulse" />
                        <span>جاري التحميل {downloadProgress[selectedSurah.number] || 0}%</span>
                      </button>
                    ) : offlineStatus[selectedSurah.number] ? (
                      <button
                        onClick={() => {
                          setActiveDownloadSurah({ number: selectedSurah.number, name: selectedSurah.name, src: selectedSurah.src });
                          setActiveDownloadProgressData({ progress: 100, status: "completed" });
                        }}
                        className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-2.5 py-1 rounded-full flex items-center gap-1 hover:bg-emerald-500/20 transition-colors"
                        title="السورة محفوظة أوفلاين على الجهاز (انقر للتفاصيل)"
                      >
                        <Check className="w-3 h-3" />
                        <span>متوفر أوفلاين</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          void handleSurahDownload(selectedSurah);
                        }}
                        className="rounded-full bg-blue-600 hover:bg-blue-700 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm flex items-center gap-1 transition-colors"
                      >
                        <Download className="w-3 h-3" /> {downloadErrors[selectedSurah.number] ? "إعادة المحاولة" : "تحميل أوفلاين"}
                      </button>
                    )}
                    {downloadErrors[selectedSurah.number] && !isDownloading[selectedSurah.number] && (
                      <p role="alert" className="mt-1 max-w-48 text-[10px] text-red-500">تعذر حفظ الصوت دون اتصال: {downloadErrors[selectedSurah.number]}</p>
                    )}
                  </div>
                )}
                <button onClick={() => setControlsOpen(false)} className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Shuffle indicator */}
            {isShuffled && (
              <div className="mb-3 flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-800 text-xs font-bold">
                <Shuffle className="w-3.5 h-3.5" />
                <span>الترتيب العشوائي مُفعّل</span>
                <button onClick={handleShuffle} className="px-2 py-0.5 rounded-md bg-amber-400/20 hover:bg-amber-400/30 text-[10px] transition-colors">إلغاء</button>
              </div>
            )}



            {/* سورة الاختيار في الصفحات التي تضم أكثر من سورة */}
            {currentPageSurahs.length > 1 && (
              <div className="mb-3">
                <p className="text-[11px] font-bold text-muted-foreground mb-1.5">السور في هذه الصفحة:</p>
                <div className="flex flex-wrap gap-1.5">
                  {currentPageSurahs.map((s, i) => {
                    const allVisibleBoxes = visiblePages.flatMap(p => getPageAyahBoxes(p.src));
                    const firstA = allVisibleBoxes.filter(b => b.surah === s.number).sort((a,b)=>a.ayah-b.ayah)[0]?.ayah ?? 1;
                    return (
                      <button
                        key={`${s.number}-${i}`}
                        onClick={() => { setSelectedSurahIdx(i); setSelectedAyah(firstA); }}
                        className={`px-3 py-1.5 rounded-full text-sm font-amiri border transition-all ${
                          selectedSurahIdx === i
                            ? "bg-accent text-accent-foreground shadow font-bold"
                            : "bg-card/80 dark:bg-card/40 border-border/60 text-foreground"
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* شبكة اختيار الآيات مع التظليل الفوري ومؤشر الآية النشطة */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-foreground/90 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>اختر الآية للاستماع مع التظليل الفوري:</span>
                </p>
                {activeAyahNum > 0 && isPlaying && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    جاري تلاوة آية {activeAyahNum}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-9 gap-1.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                {(() => {
                  const allVisibleBoxes = visiblePages.flatMap(p => getPageAyahBoxes(p.src));
                  const surahBoxes = allVisibleBoxes.filter(b => b.surah === selectedSurah?.number);
                  const numbers = surahBoxes.length > 0
                    ? Array.from(new Set(surahBoxes.map(b => b.ayah))).sort((a, b) => a - b)
                    : Array.from({ length: ayahCount }, (_, i) => i + 1);
                  return numbers.map(n => {
                    const box = surahBoxes.find(b => b.ayah === n);
                    const isCurrentActive = activeSurah?.number === selectedSurah?.number && activeAyahNum === n && isPlaying;
                    const isSelected = selectedAyah === n;
                    return (
                      <button
                        key={n}
                        onClick={() => {
                          setSelectedAyah(n);
                          currentRepeatRef.current = 0;
                          playAyah(selectedSurah, n, playMode === "kids" ? "kids" : "teacher");
                        }}
                        className={`relative py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 border ${
                          isCurrentActive
                            ? "bg-gradient-to-b from-emerald-500/25 to-teal-500/20 border-emerald-500/60 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/40 shadow-md shadow-emerald-500/15"
                            : isSelected
                            ? "bg-accent/20 border-accent/60 text-accent-foreground font-extrabold shadow-xs"
                            : "bg-card/80 dark:bg-card/40 border-border/50 hover:bg-card hover:border-amber-400/40 text-foreground"
                        }`}
                      >
                        {n === 0 || box?.label ? (
                          <span className="text-[10px] font-amiri leading-tight block truncate max-w-full px-0.5">
                            {box?.label || "البسملة"}
                          </span>
                        ) : (
                          <span className="font-amiri text-sm leading-none">﴿ {n} ﴾</span>
                        )}

                        {isCurrentActive ? (
                          <div className="flex items-center gap-[2px] h-2 mt-0.5">
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                className="w-[2px] bg-emerald-600 dark:bg-emerald-400 rounded-full animate-wave"
                                style={{ animationDelay: `${i * 0.12}s`, height: "8px" }}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-[8px] text-muted-foreground/70">آية</span>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            {/* أدوات سريعة أسفل اللوحة: التحكم بالتظليل + العلامة المرجعية + الإعدادات */}
            <div className="flex items-center gap-2 pt-2 border-t border-border/40">
              <button
                onClick={() => persistHideShading(!hideShading)}
                className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                  hideShading
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                }`}
                title={hideShading ? "انقر لإظهار تظليل الآيات" : "انقر لإخفاء تظليل الآيات"}
              >
                {hideShading ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{hideShading ? "إظهار التظليل" : "إخفاء التظليل"}</span>
              </button>

              <button
                onClick={addCurrentBookmark}
                className="flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all active:scale-95"
                title="حفظ موضع الآية الحالية في العلامات المرجعية"
              >
                <BookmarkIcon className="w-3.5 h-3.5" />
                <span>حفظ علامة</span>
              </button>

              <button
                onClick={() => safeNavigate("/settings")}
                className="py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-border/60 bg-foreground/5 hover:bg-foreground/10 text-muted-foreground transition-all active:scale-95"
                title="فتح إعدادات ألوان ونمط التظليل الكاملة"
              >
                <Palette className="w-3.5 h-3.5" />
                <span>الإعدادات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showNotifications && <NotificationsModal onClose={() => setShowNotifications(false)} />}
      
      {isGridOpen && (
        <div className="absolute inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-md animate-fade-in p-4" dir="rtl">
          <div className="flex items-center justify-between mb-4 mt-8 max-w-7xl mx-auto w-full px-4">
            <h2 className="text-2xl font-bold font-amiri text-foreground flex items-center gap-2">
              <LayoutGrid className="w-6 h-6 text-accent" />
              الوصول المباشر للصفحات
            </h2>
            <button onClick={() => setIsGridOpen(false)} className="p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-all shadow-sm">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto pb-24 max-w-7xl mx-auto w-full px-4">
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3 place-content-start">
              {pages.map((p, idx) => {
                let displayName = p.name;
                if (p.name.includes("صفحة")) {
                  displayName = p.name.replace("صفحة", "").trim();
                } else if (p.name.includes("الفاتحة")) {
                  displayName = "1";
                } else if (/افتراضي/.test(p.name)) {
                  displayName = "افتراضي";
                }
                const isActive = currentPage === idx || (isDesktop && currentPage + 1 === idx);
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setIsGridOpen(false);
                      // If it's a left page and we're on desktop, jumping to it directly might make it a right page.
                      // That's fine, we just update currentPage.
                      goToPage(idx);
                    }}
                    className={`aspect-square min-w-0 overflow-hidden whitespace-nowrap text-ellipsis rounded-2xl px-1 font-bold text-base sm:text-xl flex items-center justify-center transition-all ${
                      isActive 
                        ? "bg-accent text-accent-foreground shadow-lg scale-105 border-2 border-accent/20 ring-4 ring-accent/30" 
                        : "bg-card/90 dark:bg-card/50 text-foreground/85 hover:bg-card dark:hover:bg-card/80 hover:text-accent border border-border/70 shadow-sm hover:scale-105 hover:shadow-md"
                    }`}
                    title={p.name}
                  >
                    {displayName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeDownloadSurah && (
        <SurahDownloadModal
          isOpen={!!activeDownloadSurah}
          onClose={() => setActiveDownloadSurah(null)}
          surahNumber={activeDownloadSurah.number}
          surahName={activeDownloadSurah.name}
          progressData={activeDownloadProgressData}
          onCancel={() => {
            downloadAbortRef.current?.abort();
            setIsDownloading(prev => ({ ...prev, [activeDownloadSurah.number]: false }));
            setActiveDownloadSurah(null);
          }}
          onRetry={() => {
            if (activeDownloadSurah) {
              void handleSurahDownload(activeDownloadSurah);
            }
          }}
        />
      )}

      <AppFooter />
    </div>
  );
}
