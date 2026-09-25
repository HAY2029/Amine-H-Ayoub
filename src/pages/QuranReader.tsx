import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Play, Pause, Maximize2, Minimize2, X, Shuffle, Pencil, Check, Settings, Bell, SplitSquareHorizontal, SplitSquareVertical, Volume2, VolumeX, Menu, Eye, EyeOff, List, Lock, Baby, Bookmark as BookmarkIcon, Trash2, Plus, Wrench, Headphones, Download, Mic, Repeat, Palette, LayoutGrid, GripVertical, SkipForward, SkipBack } from "lucide-react";
import { getAudioPath as audioPath } from "@/data/audioUrls";
import { getPageAyahBoxes, PAGE_IMAGE_SIZE } from "@/data/ayahCoordinates";
import AppFooter from "@/components/AppFooter";
import { getSavedTimings, getSurahTimings } from "@/data/ayahTimings";
import { getCustomPages, getAllPageImages, syncAllPageImagesFromServer, syncCustomPagesFromServer, getPageOrder, getPageOrderSrcs, savePageOrder, syncPageOrderFromServer, normalizeImageKey, isBogusSrc, sanitizePageOrder } from "@/data/customPages";
import { getPageSurahRegions } from "@/data/surahRegions";
import { addReadingMinutes, addCoins, kidsEnabled as getKidsEnabled, getProgress, isPureMode, setAppMode } from "@/data/kidsProfile";
import { recordTodayActivity } from "@/data/kidsBadges";

import { getBookmarks, addBookmark, removeBookmark, Bookmark } from "@/data/bookmarks";
import { isKidsMode, setKidsLocked, hasKidsPin } from "@/data/kidsLock";
import ParentalGateModal from "@/components/ParentalGateModal";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { fetchHuggingFaceImages, HFImage } from "@/services/huggingFaceService";
import { syncImageOrderFromServer, saveImageOrder } from "@/services/imageOrderService";
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
import { resolvePlayableAudioUrl } from "@/data/offlineAudioCache";
import { useAudioContext } from "@/contexts/audioContext";
import SplitViewPanel from "@/components/SplitViewPanel";
import NotificationsModal from "@/components/NotificationsModal";
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
    await supabase.from("store").upsert({ key: PAGE_NAMES_KEY, value: all });
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

interface SurahAudio { name: string; number: number; src: string; ayahCount: number; }
interface PageInfo { name: string; src: string; surahs: SurahAudio[]; }

const BASE_PAGES: PageInfo[] = [
  {
    name: "الفاتحة", src: "/pages/fatiha.jpg", surahs: [
      { name: "الفاتحة", number: 1, src: audioPath(1), ayahCount: 7 },
    ]
  },
];

const SPEAKER_LABELS: Record<Speaker, string> = { teacher: "المعلم", kids: "الأطفال" };

export default function QuranReader() {
  const navigate = useNavigate();
  const { requestPlay, notifyStop, registerAudio, unregisterAudio, simultaneousMode, setSimultaneousMode } = useAudioContext();

  const [customPageList, setCustomPageList] = useState(() => getCustomPages());
  const [customImgs, setCustomImgs] = useState<Record<string, string>>({});
  const [orderVersion, setOrderVersion] = useState(0);
  
  const [hfImages, setHfImages] = useState<HFImage[]>([]);
  const [hfOrder, setHfOrder] = useState<string[]>([]);
  const [hfImagesMap, setHfImagesMap] = useState<Record<string, string>>({});

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

  // يُعيد القراءة عند العودة للقارئ / عند اكتمال المزامنة من السيرفر (بلا تحديث يدوي)
  // خفض تكرار (throttle): لا نُعيد المزامنة الكاملة أكثر من مرة كل 45 ثانية — للسرعة
  const _lastRefreshRef = useRef(0);
  useEffect(() => {
    const REFRESH_MIN_MS = 45_000; // لا مزامنة كاملة أكثر من مرة كل 45 ثانية — للسرعة
    const refresh = async (force = false) => { 
      const now = Date.now();
      if (!force && now - _lastRefreshRef.current < REFRESH_MIN_MS) return;
      _lastRefreshRef.current = now;
      // أولاً: مزامنة قائمة صفحات السيرفر (إن لم تكن قد وصلت بعد)
      await syncCustomPagesFromServer().catch(() => {});
      setCustomPageList(getCustomPages()); 
      // تحميل الصور من السيرفر (Supabase) ومن المحلي معاً
      syncAllPageImagesFromServer().then(setCustomImgs).catch(() => {});
      setBookmarks(getBookmarks()); 
      
      try {
        const [images, order] = await Promise.all([
          fetchHuggingFaceImages(),
          syncImageOrderFromServer()
        ]);
        setHfImages(images);
        setHfOrder(order || []);
        
        const map: Record<string, string> = {};
        const srcList: string[] = [];
        images.forEach(img => {
          // img.name قد يكون "pages/600.jpg" — نوحّد المفتاح إلى "/pages/600.jpg"
          const clean = img.name.replace(/^pages\//, "").replace(/^\/pages\//, "");
          const src = `/pages/${clean}`;
          map[src] = img.url;
          srcList.push(src);
        });
        setHfImagesMap(map);
        try { localStorage.setItem("mushaf:hfImageSrcs:v1", JSON.stringify(srcList)); } catch { /* ignore */ }
      } catch (e) {
        console.error(e);
      }
      
      setOrderVersion(v => v + 1); 
    };
    refresh(true);
    const onFocus = () => refresh();
    const onVis = () => refresh();
    // ملاحظة: لا نستمع لحدث "mushaf:sync_complete" نهائياً — هذا الحدث يُطلق
    // من عدة أماكن (shadingSyncService وغيره) أثناء دورات مزامنة ذاتية، والاستماع
    // إليه يسبب سلسلة لا نهائية: مزامنة ← حدث ← مزامنة ← حدث... مع طلبات شبكة
    // متكررة تملأ الكونسول بأخطاء 404/500. التحديث عند التركيز والرؤية يكفي.
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  
  const imgSrcFor = (src: string) => customImgs[src] || hfImagesMap[src] || src;
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
      const isFatihaPage = (src: string) => /fatiha/i.test(src);
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
      
      for (const src of cleanOrder) {
        if (pageMap.has(src) && !added.has(src)) {
          ordered.push(pageMap.get(src)!);
          added.add(src);
        }
      }
      
      for (const p of allPages) {
        if (!added.has(p.src)) {
          ordered.push(p);
          added.add(p.src);
        }
      }
      
      return ordered.length > 0 ? ordered : allPages;
    } catch {
      return allPages;
    }
  };

  const pages = useMemo<PageInfo[]>(() => {
    const basePagesMap = new Map(BASE_PAGES.map(p => [p.src, p]));
    
    // فلترة صور HF الصحيحة (استبعاد الفارغة أو الخاطئة)
    const validHfImages = hfImages.filter(img => img.url && img.url.length > 10);
    
    // 1. ترتيب صور HF الصحيحة حسب hfOrder
    let orderedHfImages = [...validHfImages];
    if (hfOrder && hfOrder.length > 0) {
      const map = new Map<string, HFImage>();
      const unordered: HFImage[] = [];
      validHfImages.forEach(img => {
        if (hfOrder.includes(img.name)) map.set(img.name, img);
        else unordered.push(img);
      });
      const sorted: HFImage[] = [];
      hfOrder.forEach(name => {
        const img = map.get(name);
        if (img) sorted.push(img);
      });
      orderedHfImages = [...sorted, ...unordered];
    }

    const hfPageInfos: PageInfo[] = orderedHfImages.map(img => {
      // img.name قد يكون "pages/600.jpg" أو "600.jpg" — نوحّد إلى "/pages/XXX.jpg" بدون تكرار
      const clean = img.name.replace(/^pages\//, "").replace(/^\/pages\//, "");
      const src = `/pages/${clean}`;
      const regions = getPageSurahRegions(src);
      // جرّب أيضاً المفتاح الخام (للتوافق مع بيانات قديمة مخزنة بـ pages/...)
      const boxes = [...getPageAyahBoxes(src), ...getPageAyahBoxes(`pages/${clean}`), ...getPageAyahBoxes(clean)];
      const regionsAlt = [...regions, ...getPageSurahRegions(`pages/${clean}`)];
      
      let surahs: SurahAudio[] = [];
      if (regionsAlt.length > 0) {
        surahs = regionsAlt.filter(r => r.surah).map(r => ({
          name: r.name || `سورة ${r.surah}`,
          number: r.surah as number,
          src: audioPath(r.surah as number),
          ayahCount: boxes.filter(b => b.surah === r.surah).length || 0,
        }));
      } else if (basePagesMap.has(src)) {
        surahs = basePagesMap.get(src)!.surahs;
      }
      
      const defaultName = basePagesMap.has(src)
        ? basePagesMap.get(src)!.name
        : img.pageNumber > 0
          ? `صفحة ${img.pageNumber}`
          : img.name.replace(/\.jpe?g$/i, "").replace(/^pages\//, "");
      return { name: defaultName, src, surahs };
    });

    const hfSrcs = new Set(hfPageInfos.map(p => p.src));
    
    // صور السيرفر (custom:xxx / /pages/xxx من bucket) المخزّنة في customImgs —
    // ابنِ لها صفحات قارئ تلقائياً حتى تظهر كل الصور القادمة من السيرفر.
    const coveredSrcs = new Set<string>([
      ...hfPageInfos.map(p => p.src),
      ...BASE_PAGES.map(p => p.src),
      ...customPageList.map(p => p.src),
    ]);
    const serverOnlySrcs = Object.keys(customImgs).filter(
      (src) => !coveredSrcs.has(src) && customImgs[src] && String(customImgs[src]).length > 10
    );
    const serverOnlyPages: PageInfo[] = serverOnlySrcs.map((src) => {
      const regions = getPageSurahRegions(src);
      const boxes = getPageAyahBoxes(src);
      const surahs: SurahAudio[] = regions
        .filter((r) => r.surah)
        .map((r) => ({
          name: r.name || `سورة ${r.surah}`,
          number: r.surah as number,
          src: audioPath(r.surah as number),
          ayahCount: boxes.filter((b) => b.surah === r.surah).length || 0,
        }));
      const num = parseInt(src.replace(/\D/g, ""), 10);
      return {
        name: regions[0]?.name || (num ? `صفحة ${num}` : "صفحة من السيرفر"),
        src,
        surahs,
      };
    });

    // 3. Add Custom Pages — فقط الصفحات التي لها صورة حقيقية موجودة فعلاً
    // (من Supabase أو محلياً) — نستبعد أي صفحة وهمية حُذفت صورتها حتى لا تظهر فارغة
    const extra: PageInfo[] = customPageList
      .filter(cp => {
        if (customImgs[cp.src]) return true;                       // صورة موجودة (سيرفر/محلي)
        if (BASE_PAGES.some(bp => bp.src === cp.src)) return true; // صفحة أساسية محلية
        if (hfSrcs.has(cp.src)) return true;                       // صورة من السيرفر
        return false; // لا صورة → استبعاد النسخ المحلية الافتراضية
      })
      .map(cp => {
      const regions = getPageSurahRegions(cp.src);
      const boxes = getPageAyahBoxes(cp.src);
      const surahs: SurahAudio[] = regions
        .filter(r => r.surah)
        .map(r => ({
          name: r.name || `سورة ${r.surah}`,
          number: r.surah as number,
          src: audioPath(r.surah as number),
          ayahCount: boxes.filter(b => b.surah === r.surah).length || 0,
        }));
      return { name: cp.name, src: cp.src, surahs };
    });

    // ─── الدمج النهائي: صور السيرفر فقط + إزالة أي تكرار ───
    // المستخدم طلب: المصدر الوحيد هو السيرفر (Supabase) — لا صفحات محلية مكررة.
    // نستخدم مفتاحاً موحّداً (normalizeImageKey) بحيث أي نسخة مكرّرة بنفس الرقم
    // (بصيغ مختلفة: 600.jpg / pages/600.jpg / /pages/600.jpg) تُدمج في صفحة واحدة.
    const dedupeMap = new Map<string, PageInfo>();
    const normKey = (p: PageInfo) => {
      const n = normalizeImageKey(p.src);
      return n || p.src;
    };
    [...BASE_PAGES, ...hfPageInfos, ...extra, ...serverOnlyPages].forEach(p => {
      if (p && p.src) dedupeMap.set(normKey(p), p); // آخر نسخة تكسب
    });
    let allPages = Array.from(dedupeMap.values());

    // ─── تنظيف نهائي: لا "0" خاطئة ولا مكررات ───
    const byNum = new Map<number, PageInfo>();
    const noNumPages: PageInfo[] = [];
    const seenNoNum = new Set<string>();
    
    const getPageNum = (p: PageInfo) => {
      if (/fatiha/i.test(p.src) || p.name.includes("الفاتحة")) return 1;
      const mName = p.name.match(/(\d+)/);
      if (mName) return parseInt(mName[1], 10);
      if (p.src.startsWith("custom:")) return -1;
      const mSrc = p.src.match(/(\d+)/);
      return mSrc ? parseInt(mSrc[1], 10) : -1;
    };

    for (const p of allPages) {
      const num = getPageNum(p);
      if (num === 0) continue; // "0.jpg" صفحة خاطئة — احذفها دائماً
      
      if (num === -1) {
        const k = p.name && !p.name.includes("صفحة") ? p.name : normKey(p);
        if (!seenNoNum.has(k)) { seenNoNum.add(k); noNumPages.push(p); }
        continue;
      }
      
      const existing = byNum.get(num);
      if (existing) {
        // نُفضل دائماً نسخة السيرفر (التي ليست في basePagesMap) على النسخة المحلية الافتراضية
        const pIsServer = !basePagesMap.has(p.src);
        const existingIsServer = !basePagesMap.has(existing.src);
        
        let better = p;
        if (existingIsServer && !pIsServer) {
          better = existing;
        } else if (pIsServer && !existingIsServer) {
          better = p;
        } else {
          // كلاهما سيرفر أو كلاهما محلي -> نُبقي صاحبة الاسم الوصفي
          better = (!existing.name.startsWith("صفحة") && existing.name !== p.name) ? existing : p;
        }
        byNum.set(num, better);
      } else {
        byNum.set(num, p);
      }
    }
    allPages = [...noNumPages, ...Array.from(byNum.values())].filter(p => p.name !== "صفحة مستعادة");

    // ─── الترتيب: الفاتحة (فاتحة/1) أولاً ثم 581→604 تصاعدياً ───
    allPages.sort((a, b) => {
      const numA = getPageNum(a) === -1 ? Number.MAX_SAFE_INTEGER : getPageNum(a);
      const numB = getPageNum(b) === -1 ? Number.MAX_SAFE_INTEGER : getPageNum(b);
      const d = numA - numB;
      return d !== 0 ? d : a.src.localeCompare(b.src);
    });

    // احتياط تام: إذا لم تصل أي صورة سيرفر إطلاقاً (شبكة مقطوعة + سيرفر فارغ)
    // نعرض الصفحات الأساسية المحلية فقط حتى لا تبقى الشاشة فارغة.
    if (allPages.length === 0) {
      const fallback = new Map<string, PageInfo>();
      [...BASE_PAGES, ...extra].forEach(p => {
        if (p && p.src) fallback.set(normKey(p), p);
      });
      allPages = Array.from(fallback.values());
    }

    return applyPageOrder(allPages);
  }, [customPageList, customImgs, hfImages, hfOrder]);

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
  }, [currentPage, pages, customImgs, hfImagesMap]);

  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 1024 : false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [skipBismillah, setSkipBismillah] = useState(() => {
    // افتراضياً: تخطي البسملة والبدء من الصفحة 2
    const saved = localStorage.getItem("mushaf:skipBismillah:v1");
    return saved !== null ? saved === "true" : true;
  });

  // حفظ إعداد تخطي البسملة
  useEffect(() => {
    localStorage.setItem("mushaf:skipBismillah:v1", skipBismillah ? "true" : "false");
  }, [skipBismillah]);

  // تخطي البسملة عند التحميل الأول: إذا كانت الصفحة 0 والإعداد مفعل، انتقل للصفحة 1
  useEffect(() => {
    if (skipBismillah && currentPage === 0 && pages.length > 1) {
      const timer = setTimeout(() => {
        setCurrentPage(1);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [skipBismillah, pages.length]); // يُنفذ مرة واحدة بعد تحميل الصفحات

  // Audio state
  const [activeSurah, setActiveSurah] = useState<SurahAudio | null>(null);
  const [selectedSurahIdx, setSelectedSurahIdx] = useState(0);
  const [selectedAyah, setSelectedAyah] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  // === الآية النشطة + المتكلم + السورة النشطة (رسم التظليل من React state مباشرة) ===
  const [activeSurahNum, setActiveSurahNum] = useState(-1);
  const [activeAyahNum, setActiveAyahNum] = useState(-1);
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

  // مزامنة ترتيب الصفحات من السيرفر
  useEffect(() => {
    if (!pageOrderOpen) return;
    // مفتاح قديم مهجور — حذفه حتى لا يظل يفرض ترتيباً قديمًا (سبب تكرار/صفحة "0")
    try { localStorage.removeItem("mushaf:customPageOrder:v1"); } catch { /* ignore */ }
    syncPageOrderFromServer().then(order => {
      if (order.length > 0) setPageOrderSrcs(getPageOrderSrcs());
    });
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
      await saveImageOrder(newOrder);
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
  const [navTab, setNavTab] = useState<"surahs" | "bookmarks">("surahs");
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
  const enterKids = () => { if (hasKidsPin()) { setKidsLocked(true); navigate("/games"); } else setPinAction("enter"); };
  const requestExitKids = () => setPinAction("exit");
  // الإعدادات محميّة: تتطلّب رمز ولي الأمر إن كان مضبوطاً
  const openSettings = () => { if (hasKidsPin()) setPinAction("settings"); else navigate("/settings"); };
  const openTools = () => { if (hasKidsPin()) setPinAction("settings"); else navigate("/teacher-tools"); };

  // ── قائمة كل السور للانتقال المباشر ──
  const allSurahsList = useMemo(() => {
    const out: { number: number; name: string; pageIdx: number; surahIdx: number }[] = [];
    pages.forEach((p, pi) => p.surahs.forEach((s, si) => out.push({ number: s.number, name: s.name, pageIdx: pi, surahIdx: si })));
    return out;
  }, [pages]);
  const jumpToSurah = (pageIdx: number, surahIdx: number) => {
    let display = pageIdx;
    if (customPageOrder.length > 0) { const d = customPageOrder.indexOf(pageIdx); if (d >= 0) display = d; }
    setCurrentPage(display);
    setSelectedSurahIdx(surahIdx);
    setSurahListOpen(false);
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

  // Tauri Offline States
  const [offlineStatus, setOfflineStatus] = useState<Record<number, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<number, number>>({});
  const [isDownloading, setIsDownloading] = useState<Record<number, boolean>>({});

  // Check offline status for all surahs on current page
  const checkCurrentPageOffline = useCallback(async () => {
    if (!isTauri()) return;
    const page = pages[actualPage];
    if (!page) return;
    const status: Record<number, boolean> = {};
    for (const s of page.surahs) {
      status[s.number] = await checkOfflineStatus(s.number);
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
      setDownloadProgress(prev => ({ ...prev, [surah_number]: Math.round(progress) }));
      
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
  }, []);

  const resolveAudioSrc = useCallback(async (surah: SurahAudio, speaker: Speaker = "teacher") => {
    try {
      const timings = getSurahTimings(surah.number);
      const speakerUrl = speaker === "kids" ? timings?.kidsAudioUrl : timings?.teacherAudioUrl;
      const preferredUrl = speakerUrl || audioPath(surah.number, speaker) || surah.src;
      const resolved = await resolvePlayableAudioUrl(surah.number, preferredUrl);
      if (resolved) return resolved;
    } catch (e) {
      console.warn("Offline audio resolution fallback:", e);
    }
    return surah.src;
  }, []);

  // Refs for tracking without re-renders
  const audioRef = useRef<HTMLAudioElement>(null);
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
  const internalPauseRef = useRef(false); // guards against external pause listener firing on internal pauses
  const autoFollowRef = useRef(false); // true عندما يتغيّر الصفحة بسبب متابعة التشغيل لسورة ممتدّة على صفحتين (يمنع إيقاف الصوت)

  // Register mushaf audio with central AudioContext
  useEffect(() => {
    const a = audioRef.current;
    if (a) {
      registerAudio("mushaf", a);
    }
    return () => { unregisterAudio("mushaf"); };
  }, [registerAudio, unregisterAudio]);



  // Listen for external pause only (from AudioContext mutual exclusion)
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const handlePause = () => {
      // Only react to external pauses (not internal segment-boundary pauses)
      if (internalPauseRef.current) {
        internalPauseRef.current = false;
        return;
      }
      setIsPlaying(false);
    };
    a.addEventListener("pause", handlePause);
    return () => a.removeEventListener("pause", handlePause);
  }, []);


  // === التظليل عبر React state — لا DOM مباشر ===
  const clearAllHighlights = useCallback(() => {
    setActiveAyahNum(-1);
    setActiveSurahNum(-1);
  }, []);

  const highlightAyah = useCallback((surahNum: number, ayahNum: number, speaker: Speaker, _boxIndex?: number) => {
    if (hideShadingRef.current) return;
    setActiveSpeaker(speaker);
    setActiveSurahNum(prev => (prev === surahNum ? prev : surahNum));
    setActiveAyahNum(prev => (prev === ayahNum ? prev : ayahNum));
  }, []);

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

  // عند تحميل الصفحات أول مرة (مثلاً بعد وصول صور HF) استعادة الموضع من مسار URL أو المحفوظة
  const pageSrcRestoredRef = useRef(false);
  useEffect(() => {
    if (pageSrcRestoredRef.current) return;
    if (pages.length === 0) return;
    
    let targetIdx = -1;
    
    // 1. الأولوية لمسار URL
    const urlParams = new URLSearchParams(window.location.search);
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

  useEffect(() => {
    // تغيُّر الصفحة بسبب متابعة التشغيل لسورة ممتدّة على صفحتين: لا توقف الصوت ولا تُصفّر الحالة
    if (autoFollowRef.current) { autoFollowRef.current = false; return; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setActiveSurah(null); setIsPlaying(false); currentAyahRef.current = -1; currentBoxIndexRef.current = -1;
    setSelectedSurahIdx(0); setSelectedAyah(-1);
    stopAtRef.current = null; currentRepeatRef.current = 0;
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
    const targetSrc = await resolveAudioSrc(surah, forceSpeaker ?? "teacher");
    const sameSrc = a.src === targetSrc || (a.src && a.src.endsWith(surah.src.split("/").pop() || surah.src));

    setActiveSurah(surah);
    currentAyahRef.current = ayahNum;
    currentBoxIndexRef.current = boxIndex ?? -1;
    stopAtRef.current = null;

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
      const sp: Speaker = forceSpeaker ?? "teacher";
      currentSpeakerRef.current = sp;

      const timings = getSavedTimings()[surah.number];
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
            return;
          }
        } else {
          const list = sp === "kids" && timings?.kids ? timings.kids : timings?.teacher || [];
          const segIdx = ayahNum > 0 ? ayahNum - 1 : 0;
          
          if (list[segIdx] !== undefined) {
            startT = list[segIdx];
            nextT = list[segIdx + 1] !== undefined ? list[segIdx + 1] : a.duration || 1e9;
            
            // Split-file format: Teacher stops when the entire Kids section starts
            if (sp === "teacher" && timings?.kidsStart !== undefined && nextT > timings.kidsStart) {
              nextT = timings.kidsStart;
            }
            
            // Interleaved format: Teacher stops when the Kid starts for the SAME ayah
            if (sp === "teacher" && timings?.kids && timings.kids[segIdx] !== undefined) {
              const kidStartT = timings.kids[segIdx];
              if (kidStartT > startT && kidStartT < nextT) {
                nextT = kidStartT;
              }
            }

            // Interleaved format: Kid stops when the Teacher starts for the NEXT ayah
            if (sp === "kids" && timings?.teacher && timings.teacher[segIdx + 1] !== undefined) {
              const nextTeacherStart = timings.teacher[segIdx + 1];
              if (nextTeacherStart > startT && nextTeacherStart < nextT) {
                nextT = nextTeacherStart;
              }
            }
          }
        }
      }

      stopAtRef.current = nextT;
      isSeekingRef.current = true;
      expectedStartTimeRef.current = startT;
      a.currentTime = startT;
      requestPlay("mushaf", a);
      a.play().then(() => {
        setIsPlaying(true);
        updateMediaSession({
          title: `سورة ${surah.name} - آية ${ayahNum}`,
          artist: "القارئ حاج أيوب أمين",
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
    } else {
      setIsPlaying(false);
      clearAllHighlights();
    }
  }, [activeSurah, actualPage, playAyah, clearAllHighlights]);

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
        // أجزاء الآية الواحدة (نفس رقم الآية) تُعدّ وحدة واحدة — تخطَّها وانتقل للآية التالية
        if (candidate.box.ayah === currentAyahRef.current) continue;
        nextItem = candidate;
        break;
      }

      if (nextItem) {
        setSelectedAyah(nextItem.box.ayah);
        playAyah(activeSurah, nextItem.box.ayah, sp, nextItem.globalIndex);
      } else {
        advanceSurah(sp);
      }
    };

    // "teacher" or "kids" only mode
    const speakerForMode: Speaker = mode === "kids" ? "kids" : "teacher";

    if (currentRepeatRef.current < repeat) {
      currentRepeatRef.current++;
      playAyah(activeSurah, currentAyahRef.current, speakerForMode, currentBoxIndexRef.current !== -1 ? currentBoxIndexRef.current : undefined);
    } else {
      currentRepeatRef.current = 0;
      if (continuous) {
        advanceToNextSegment(speakerForMode);
      } else {
        setIsPlaying(false);
        clearAllHighlights();
      }
    }
  }, [activeSurah, playAyah, actualPage, advanceSurah, clearAllHighlights]);

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
      a.pause();
      setIsPlaying(false);
      segmentEndGuardRef.current = true;
      handleAyahSegmentEndRef.current();
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
        currentBoxLabelRef.current = activeBox.label || null;
        highlightAyah(activeSurah.number, activeBox.ayah, foundSpeaker, activeBoxGlobalIndex);
      }
    } else {
      const timings = getSurahTimings(activeSurah.number);
      const segments = timings?.segments || [];
      if (segments.length > 0) {
        const activeSeg = segments.find(s => a.currentTime >= s.start && a.currentTime <= s.end);
        if (activeSeg) {
          // Use segment's own ayah field if available, fallback to index-based lookup
          const segAyah = activeSeg.ayah;
          let ayahNumber: number;
          if (segAyah !== undefined) {
            ayahNumber = segAyah;
          } else {
            const speakerSegments = segments.filter(s => s.speaker === activeSeg.speaker).sort((a, b) => a.start - b.start);
            const ayahIdx = speakerSegments.findIndex(s => s.id === activeSeg.id);
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
          const actualCount = getActualAyahCount(activeSurah.number, activeSurah.ayahCount);
          const fallbackNumber = Math.min(idx + 1, actualCount);
          const ayahNumber = sortedBoxes[idx]?.ayah ?? fallbackNumber;
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


  const togglePlayPause = () => {
    const a = audioRef.current; if (!a || !activeSurah) return;
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
    } else {
      if (currentAyahRef.current === -1) {
        const pageBoxes = pages.flatMap(p => getPageAyahBoxes(p.src));
        const surahBoxes = pageBoxes.filter(b => b.surah === activeSurah.number).sort((a,b) => a.ayah - b.ayah);
        const firstAyah = surahBoxes[0]?.ayah ?? 1;
        playAyah(activeSurah, firstAyah, playMode === "kids" ? "kids" : "teacher");
      } else {
        a.play().then(() => setIsPlaying(true)).catch(() => { });
      }
    }
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

  const step = isDesktop ? 2 : 1;
  const totalDisplayPages = isShuffled ? shuffledPageOrder.length : pages.length;
  const goToPage = useCallback((i: number) => { if (i >= 0 && i < totalDisplayPages) setCurrentPage(i); }, [totalDisplayPages]);
  
  // === التنقّل مع مراعاة تخطي البسملة ===
  const goPrev = useCallback(() => {
    let prevPage = currentPage - step;
    if (skipBismillah && prevPage === 1 && currentPage > 1) { prevPage = 0; }
    else if (skipBismillah && currentPage === 0) { return; }
    goToPage(Math.max(0, prevPage));
  }, [currentPage, goToPage, step, skipBismillah]);
  
  const goNext = useCallback(() => {
    let nextPage = currentPage + step;
    // إذا كان تخطي البسملة مفعّلاً ونحن في الصفحة 0 (البسملة)، الانتقال مباشرة للصفحة 2 (للحاسوب والجوال)
    if (skipBismillah && currentPage === 0 && totalDisplayPages > 1) { nextPage = 1; }
    goToPage(Math.min(totalDisplayPages - 1, nextPage));
  }, [currentPage, totalDisplayPages, goToPage, step, skipBismillah]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goPrev();
      if (e.key === "ArrowLeft") goNext();
      if (e.key === "Escape") { if (controlsOpen) setControlsOpen(false); else navigate("/audio"); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [controlsOpen, navigate, goPrev, goNext]);

  // تحميل مسبق لصور الصفحة الحالية وجيرانها (تظهر فوراً عند التنقّل) — بأولوية عالية للحالية
  useEffect(() => {
    [currentPage, currentPage + 1, currentPage - 1, currentPage + 2, currentPage - 2]
      .filter(d => d >= 0 && d < totalDisplayPages)
      .forEach((d, order) => {
        const p = pages[getActualPageIndex(d)];
        if (!p) return;
        const img = new Image();
        try { (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = order === 0 ? "high" : "low"; } catch { /* ignore */ }
        img.decoding = "async";
        img.src = imgSrcFor(p.src);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, totalDisplayPages, getActualPageIndex, customImgs, pages, isDesktop]);

  const visiblePages = useMemo(() => {
    const p1 = pages[getActualPageIndex(currentPage)];
    if (!isDesktop) return [p1].filter(Boolean) as PageInfo[];
    
    // في الحاسوب، نعرض صفحتين متجاورتين
    const nextIdx = currentPage + 1;
    const p2 = nextIdx < totalDisplayPages ? pages[getActualPageIndex(nextIdx)] : null;
    return [p1, p2].filter(Boolean) as PageInfo[];
  }, [currentPage, getActualPageIndex, isDesktop, pages, totalDisplayPages]);

  const currentPageSurahs = useMemo(() => {
    return visiblePages.flatMap(p => p.surahs);
  }, [visiblePages]);
  
  const selectedSurah = currentPageSurahs[selectedSurahIdx] || currentPageSurahs[0];
  const ayahCount = selectedSurah ? getActualAyahCount(selectedSurah.number, selectedSurah.ayahCount) : 0;

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

  const stopSimultaneous = useCallback(() => {
    const a2 = audioRef2.current;
    if (a2) { a2.pause(); a2.currentTime = 0; }
    setIsSimultaneousPlaying(false);
  }, []);

  // ========== Split View Surah Data ==========
  const allPageSurahs = useMemo(() => {
    return pages.flatMap(p => p.surahs.map(s => ({
      number: s.number,
      name: s.name,
      audioSrc: s.src,
    })));
  }, []);

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
    <div className="fixed inset-0 w-screen h-screen z-50 bg-background overflow-hidden select-none">
      <audio
        ref={audioRef}
        onEnded={() => {
          setIsPlaying(false);
          stopSimultaneous();
          if (segmentEndGuardRef.current) {
            segmentEndGuardRef.current = false;
            return;
          }
          handleAyahSegmentEndRef.current();
        }}
        onSeeked={() => {
          const a = audioRef.current;
          if (a && Math.abs(a.currentTime - expectedStartTimeRef.current) < 0.15) {
            isSeekingRef.current = false;
          }
        }}
        onError={() => {
          console.warn("QuranReader audio error, falling back to network stream...");
          if (selectedSurah && audioRef.current && audioRef.current.src !== selectedSurah.src) {
            audioRef.current.src = selectedSurah.src;
            audioRef.current.load();
            audioRef.current.play().catch(() => {});
          }
        }}
      />
      {/* Second audio for simultaneous teacher+kids playback */}
      <audio ref={audioRef2} />

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
            <div className={`flex h-full ${isDesktop ? 'shadow-2xl rounded-lg overflow-hidden ring-1 ring-black/5' : 'w-full'}`}>
          {visiblePages.map((page, idx) => (
            <div key={`${page.src}-${idx}`} className={`relative h-full ${isDesktop ? '' : 'flex-1'} min-w-0 flex items-center justify-center bg-background overflow-hidden p-1`}>
              <div
                className={`relative ${isDesktop ? 'shadow-none' : 'shadow-xl'}`}
                style={{ aspectRatio: `${PAGE_IMAGE_SIZE.width}/${PAGE_IMAGE_SIZE.height}`, height: '100%', maxWidth: '100%' }}
              >
                <img src={imgSrcFor(page.src)} alt={page.name}
                  className={`absolute inset-0 w-full h-full select-none transition-opacity duration-300 ${loadedImgs.has(page.src) ? "opacity-100" : "opacity-0"}`}
                  draggable={false} decoding="async" referrerPolicy="no-referrer"
                  onLoad={() => markLoaded(page.src)} onError={() => markLoaded(page.src)} />
                {/* هيكل تحميل لطيف حتى تظهر الصورة (لا تظليل فوق فراغ) */}
                {!loadedImgs.has(page.src) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-card">
                    <div className="w-10 h-10 rounded-full border-[3px] border-accent/25 border-t-accent animate-spin" />
                  </div>
                )}
                {loadedImgs.has(page.src) && !hideShading && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${PAGE_IMAGE_SIZE.width} ${PAGE_IMAGE_SIZE.height}`} preserveAspectRatio="none">
                  {getPageAyahBoxes(page.src).map((box, i) => {
                    const isAct = activeSurahNum === box.surah && activeAyahNum === box.ayah;
                    const currentColor = activeSpeaker === "kids"
                      ? (shadingSettings.kidsColor || "#0ea5e9")
                      : (shadingSettings.teacherColor || "#f59e0b");
                    const actStyle = getAyahShadingStyle(currentColor, shadingOpacity);
                    const inactFill = hexToRgba(shadingSettings.teacherColor || "#f59e0b", 0.14);
                    const inactStroke = hexToRgba(shadingSettings.teacherColor || "#f59e0b", 0.45);
                    return (
                      <rect
                        key={`ayah-rect-${box.surah}-${box.ayah}-${i}`}
                        className={`ayah-rect ${isAct ? "ayah-active" : ""}`}
                        x={box.x} y={box.y} width={box.width} height={box.height} rx="18" ry="14"
                        fill={isAct ? actStyle.fill : inactFill}
                        stroke={isAct ? actStyle.stroke : inactStroke}
                        strokeWidth={isAct ? 3.5 : 1.5}
                        opacity={shadingOpacity}
                        style={{
                          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                          filter: isAct ? `drop-shadow(0 0 6px ${actStyle.glow})` : "none",
                        }}
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
                          setControlsOpen(true);
                          if (isSimultaneousPlaying) { stopSimultaneous(); }
                          // بلا فهرس صندوق: يجد الجزء الأول للآية بالرقم (يعالج الآيات متعددة الأجزاء)
                          playAyah(surah, box.ayah, playModeRef.current === "kids" ? "kids" : "teacher");
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

      {!controlsOpen && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-0.5 opacity-50 cursor-pointer hover:opacity-100 transition-opacity" onClick={() => setControlsOpen(true)}>
          <div className="w-10 h-1 rounded-full bg-foreground/60" />
          <span className="text-[10px] font-bold text-foreground/70">افتح الإعدادات</span>
        </div>
      )}

      {activeSurah && isPlaying && currentAyahRef.current >= 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="bg-sky-400/20 backdrop-blur-md border border-sky-300/30 px-6 py-2.5 rounded-full shadow-lg flex items-center gap-3">
            <span className="font-amiri text-sky-800 font-bold text-lg">
              {activeSurah.name} - {currentBoxLabelRef.current ? currentBoxLabelRef.current : `آية ${currentAyahRef.current}`}
            </span>
            <Headphones className="w-5 h-5 text-sky-600 animate-pulse" />
          </div>
        </div>
      )}

      {/* ── أيقونات الخيارات (منفصلة، أسفل وسط الشاشة) ── */}
      {!controlsOpen && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 flex-wrap justify-center max-w-[90vw]" dir="rtl">
          {([
            { key: "back", icon: <ArrowRight className="w-5 h-5 text-foreground" />, label: "رجوع", onClick: () => navigate("/audio"), active: false },
            { key: "grid", icon: <LayoutGrid className="w-5 h-5 text-foreground" />, label: "وصول مباشر", onClick: () => setIsGridOpen(true), active: isGridOpen },
            kidsMode && !isPureMode() && { key: "games", icon: <Baby className="w-5 h-5 text-foreground" />, label: "الألعاب", onClick: () => navigate("/games"), active: false },
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
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95"
              style={{ background: b.active ? "rgba(250,204,21,0.7)" : "rgba(255,255,255,0.72)", backdropFilter: "blur(12px) saturate(140%)" }}
            >
              {b.icon}
            </button>
          ))}
        </div>
      )}

      {/* لوحة التنقّل — السور والعلامات المرجعية */}
      {surahListOpen && (
        <div className="absolute inset-0 z-[55] flex items-end justify-center bg-black/50 animate-fade-in" onClick={() => setSurahListOpen(false)}>
          <div className="w-full max-w-md max-h-[72vh] overflow-y-auto rounded-t-3xl p-3 shadow-2xl border-t border-white/40"
            style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(20px)" }} onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-1 bg-foreground/5 rounded-xl p-1">
                <button onClick={() => setNavTab("surahs")} className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 ${navTab === "surahs" ? "bg-amber-400 text-black" : "text-foreground/70"}`}><List className="w-4 h-4" /> السور</button>
                <button onClick={() => setNavTab("bookmarks")} className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 ${navTab === "bookmarks" ? "bg-amber-400 text-black" : "text-foreground/70"}`}><BookmarkIcon className="w-4 h-4" /> العلامات</button>
              </div>
              <button onClick={() => setSurahListOpen(false)} className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>

            {navTab === "surahs" ? (
              <div className="grid grid-cols-2 gap-2">
                {allSurahsList.map((s, i) => (
                  <button key={`${s.number}-${i}`} onClick={() => jumpToSurah(s.pageIdx, s.surahIdx)}
                    className="p-2.5 rounded-xl bg-foreground/5 hover:bg-amber-200/70 text-right font-bold text-sm flex items-center justify-between gap-2 active:scale-[0.98] transition-all">
                    <span className="truncate">{s.name}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{s.number}</span>
                  </button>
                ))}
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
            className="w-full max-w-lg max-h-[85vh] rounded-t-3xl animate-slide-up-short pointer-events-auto overflow-hidden flex flex-col"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.92) 100%)', backdropFilter: 'blur(24px)' }}
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
            <div className="w-full max-w-lg max-h-[88vh] rounded-t-3xl animate-slide-up-short overflow-hidden flex flex-col" style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(24px)' }} onClick={e => e.stopPropagation()} dir="rtl">
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
                <button onClick={() => { setSplitToolOpen(false); navigate('/timings'); }} className="w-full py-3 rounded-2xl bg-violet-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] shadow-lg"><Wrench className="w-4 h-4" /> صفحة التسجيل المتقدم</button>
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
              navigate("/games");
            } else if (pinAction === "settings") {
              sessionStorage.setItem("mushaf:settingsUnlocked", "1");
              navigate("/settings");
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
          <div className="absolute inset-0 -top-32 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          <div className="relative mx-auto max-w-2xl m-3 rounded-3xl p-4 shadow-2xl border border-white/30" style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(24px) saturate(140%)" }}>
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
                {isTauri() && selectedSurah && (
                  <div className="mr-2">
                    {isDownloading[selectedSurah.number] ? (
                      <div className="text-[10px] bg-amber-100/10 text-amber-500 border border-amber-500/20 font-bold px-2 py-1 rounded-full animate-pulse flex items-center gap-1">
                        <Download className="w-3 h-3 animate-pulse" /><span>جاري التحميل {downloadProgress[selectedSurah.number] || 0}%</span>
                      </div>
                    ) : offlineStatus[selectedSurah.number] ? (
                      <div className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-2 py-1 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /><span>متوفر أوفلاين</span>
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          const url = selectedSurah.src;
                          setIsDownloading(prev => ({ ...prev, [selectedSurah.number]: true }));
                          setDownloadProgress(prev => ({ ...prev, [selectedSurah.number]: 0 }));
                          await downloadSurah(url, selectedSurah.number);
                        }}
                        className="rounded-full bg-blue-600 hover:bg-blue-700 px-2 py-1 text-[10px] font-bold text-white shadow-sm flex items-center gap-1 transition-colors"
                      >
                        <Download className="w-3 h-3" /> تحميل أوفلاين
                      </button>
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

            <div className="mb-4 bg-white/40 p-3 rounded-xl border border-white/60">
              <p className="text-xs font-bold mb-2 text-muted-foreground">وضع التشغيل</p>
              
              {/* Play mode buttons - 2x2 grid for clarity */}
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {([
                  { mode: "teacher" as PlayMode, label: "معلم فقط", Icon: Mic, desc: "تشغيل المعلم وحده", activeColor: "bg-amber-400/20 border-amber-400/50 text-amber-800" },
                  { mode: "kids" as PlayMode, label: "طفل فقط", Icon: Baby, desc: "تشغيل الطفل وحده", activeColor: "bg-sky-400/20 border-sky-400/50 text-sky-800" },
                ]).map(({ mode, label, Icon, desc, activeColor }) => (
                  <button
                    key={mode}
                    onClick={() => { 
                      if (isSimultaneousPlaying) { stopSimultaneous(); const a = audioRef.current; if (a) { a.pause(); } setIsPlaying(false); }
                      setPlayMode(mode); 
                    }}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-0.5 ${
                      playMode === mode && !isSimultaneousPlaying
                        ? `${activeColor} shadow ring-1 ring-black/5`
                        : "bg-white/70 border-border/60 text-foreground/70 hover:bg-white"
                    }`}
                    title={desc}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{label}</span>
                  </button>
                ))}

                {/* Simultaneous (Together) mode */}
                {selectedSurah && (() => {
                  const timings = getSavedTimings()[selectedSurah.number];
                  const hasKids = timings?.kidsStart !== undefined || (timings?.kids && timings.kids.length > 0);
                  if (!hasKids) return (
                    <div className="py-2.5 px-2 rounded-xl text-xs font-bold border border-dashed border-border/40 flex flex-col items-center gap-0.5 text-foreground/30 cursor-not-allowed" title="لا يتوفر صوت الطفل">
                      <VolumeX className="w-5 h-5 opacity-40" />
                      <span>تشغيل متزامن</span>
                    </div>
                  );
                  return (
                    <button
                      onClick={() => {
                        if (isSimultaneousPlaying) {
                          stopSimultaneous();
                          const a = audioRef.current;
                          if (a) { a.pause(); }
                          setIsPlaying(false);
                        } else {
                          playSimultaneous(selectedSurah);
                        }
                      }}
                      className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-0.5 ${
                        isSimultaneousPlaying
                          ? "bg-emerald-400/20 border-emerald-400/50 text-emerald-800 shadow ring-1 ring-emerald-400/20 animate-pulse"
                          : "bg-gradient-to-br from-amber-50 to-sky-50 border-border/60 text-foreground/70 hover:border-amber-400/40"
                      }`}
                      title="تشغيل المعلم والطفل في نفس الوقت"
                    >
                      <Volume2 className="w-5 h-5" />
                      <span>تشغيل متزامن</span>
                    </button>
                  );
                })()}
              </div>

              {/* Now playing indicator */}
              {isPlaying && activeSurah && !isSimultaneousPlaying && (
                <div className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg mb-3 text-xs font-bold animate-fade-in ${
                  currentSpeakerRef.current === "kids" 
                    ? "bg-sky-100/50 text-sky-700 border border-sky-200/50" 
                    : "bg-amber-100/50 text-amber-700 border border-amber-200/50"
                }`}>
                  {currentSpeakerRef.current === "kids" ? <Baby className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>يتحدث الآن: {currentSpeakerRef.current === "kids" ? "الطفل" : "المعلم"}</span>
                  <div className="flex items-center gap-[2px] h-3">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-[2px] bg-current rounded-full animate-wave" style={{ animationDelay: `${i * 0.12}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {isSimultaneousPlaying && (
                <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg mb-3 text-xs font-bold bg-emerald-100/50 text-emerald-700 border border-emerald-200/50 animate-fade-in">
                  <Volume2 className="w-4 h-4" />
                  <span>تشغيل المعلم والطفل المتزامن</span>
                  <div className="flex items-center gap-[2px] h-3">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-[2px] bg-current rounded-full animate-wave" style={{ animationDelay: `${i * 0.12}s` }} />
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm font-bold cursor-pointer text-foreground/80">
                <input type="checkbox" checked={continuousPlay} onChange={(e) => setContinuousPlay(e.target.checked)} className="accent-accent w-4 h-4" />
                تشغيل متواصل
              </label>

              <div className="flex items-center gap-2 text-sm font-bold text-foreground/80 mt-2">
                <span className="inline-flex items-center gap-1"><Repeat className="w-4 h-4" /> تكرار الآية:</span>
                <select
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Number(e.target.value))}
                  className="bg-white border border-border rounded-md px-2 py-1 text-sm outline-none cursor-pointer"
                >
                  <option value={0}>بدون</option>
                  <option value={1}>مرة</option>
                  <option value={2}>مرتين</option>
                  <option value={3}>3 مرات</option>
                  <option value={5}>5 مرات</option>
                  <option value={999}>مستمر</option>
                </select>
              </div>

              {/* زر الانتقال لإعدادات التظليل الكاملة (حسب طلب إزالة التحكم بالتظليل من هذه الواجهة) */}
              <button
                onClick={() => navigate("/settings")}
                className="w-full mt-3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 text-accent bg-accent/10 border border-accent/20 hover:bg-accent/20 transition-all active:scale-95"
              >
                <Palette className="w-4 h-4" /> إعدادات المظهر والتظليل
              </button>
            </div>

            {currentPageSurahs.length > 1 && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-1.5">
                  {currentPageSurahs.map((s, i) => {
                    const allVisibleBoxes = visiblePages.flatMap(p => getPageAyahBoxes(p.src));
                    const firstA = allVisibleBoxes.filter(b => b.surah === s.number).sort((a,b)=>a.ayah-b.ayah)[0]?.ayah ?? 1;
                    return (
                    <button key={s.number} onClick={() => { setSelectedSurahIdx(i); setSelectedAyah(firstA); }} className={`px-3 py-1.5 rounded-full text-sm font-amiri border transition-all ${selectedSurahIdx === i ? "bg-accent text-accent-foreground shadow" : "bg-white/70 border-border/60"}`}>
                      {s.name}
                    </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mb-3">
              <p className="text-xs font-bold mb-1.5 text-muted-foreground">اختر الآية</p>
              <div className="grid grid-cols-7 gap-1.5">
                {(() => {
                  const allVisibleBoxes = visiblePages.flatMap(p => getPageAyahBoxes(p.src));
                  const surahBoxes = allVisibleBoxes.filter(b => b.surah === selectedSurah?.number);
                  const numbers = surahBoxes.length > 0
                    ? Array.from(new Set(surahBoxes.map(b => b.ayah))).sort((a, b) => a - b)
                    : Array.from({ length: ayahCount }, (_, i) => i + 1);
                  return numbers.map(n => {
                    const box = surahBoxes.find(b => b.ayah === n);
                    return (
                      <button key={n} onClick={() => { setSelectedAyah(n); currentRepeatRef.current = 0; playAyah(selectedSurah, n, playMode === "kids" ? "kids" : "teacher"); }} className={`aspect-square rounded-lg text-sm font-bold transition-all flex items-center justify-center ${selectedAyah === n ? "bg-accent text-accent-foreground shadow scale-105" : "bg-white/70 hover:bg-white"}`}>
                        {box?.label ? <span className="text-[10px] leading-tight block truncate px-1">{box.label}</span> : n}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            {activeSurah && (
              <button onClick={togglePlayPause} className="mt-3 w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-foreground/10 hover:bg-foreground/15 font-bold text-sm">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? "إيقاف مؤقت" : "متابعة"}</span>
              </button>
            )}
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
                    className={`aspect-square rounded-2xl font-bold text-xl flex items-center justify-center transition-all ${
                      isActive 
                        ? "bg-accent text-accent-foreground shadow-lg scale-105 border-2 border-accent/20 ring-4 ring-accent/30" 
                        : "bg-white/90 text-foreground/80 hover:bg-white hover:text-accent border border-border shadow-sm hover:scale-105 hover:shadow-md"
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

      <AppFooter />
    </div>
  );
}
