import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Play, Pause, RotateCcw, Save, Trash2, Plus, Sparkles,
  Palette, Eye, EyeOff, ZoomIn, ZoomOut, Check, ChevronLeft,
  ChevronRight, Volume2, Maximize2, Move, Sliders, Copy, Image as ImageIcon,
  Layers, Upload, Server, Crosshair, BookOpen, Search, X, Zap, CheckCircle2
} from "lucide-react";
import { getAllSurahs, getSurahByNumber, SurahInfo } from "@/data/quranData";
import { getSurahAudioUrl } from "@/data/audioUrls";
import {
  getPageAyahBoxes, savePageAyahBoxes, AyahBox, getAllPageSources,
  PAGE_IMAGE_SIZE, AYAH_COORDINATES, syncCoordinatesFromServer
} from "@/data/ayahCoordinates";
import {
  SurahRegion, getSurahRegistry, getSurahRegistryEntry,
  upsertSurahRegistryEntry, syncSurahRegistryFromServer
} from "@/data/surahRegions";
import { getCustomPages, syncAllPageImagesFromServer, saveShadingCustomColorToServer, syncShadingCustomColorFromServer } from "@/data/customPages";
import { fetchHuggingFaceImages, HFImage } from "@/services/huggingFaceService";
import { surahPageMap } from "@/data/surahPages";
import { toast } from "@/hooks/use-toast";

// خريطة صفحات جزء عمّ والسور الأساسية لربط السورة بالصفحة مباشرة
const SURAH_TO_DEFAULT_PAGE: Record<number, string> = {
  1: "/pages/0.jpg",
  78: "/pages/582.jpg",
  79: "/pages/583.jpg",
  80: "/pages/585.jpg",
  81: "/pages/586.jpg",
  82: "/pages/587.jpg",
  83: "/pages/587.jpg",
  84: "/pages/589.jpg",
  85: "/pages/590.jpg",
  86: "/pages/591.jpg",
  87: "/pages/591.jpg",
  88: "/pages/592.jpg",
  89: "/pages/593.jpg",
  90: "/pages/594.jpg",
  91: "/pages/595.jpg",
  92: "/pages/595.jpg",
  93: "/pages/596.jpg",
  94: "/pages/596.jpg",
  95: "/pages/597.jpg",
  96: "/pages/597.jpg",
  97: "/pages/598.jpg",
  98: "/pages/598.jpg",
  99: "/pages/599.jpg",
  100: "/pages/600.jpg",
  101: "/pages/600.jpg",
  102: "/pages/600.jpg",
  103: "/pages/601.jpg",
  104: "/pages/601.jpg",
  105: "/pages/601.jpg",
  106: "/pages/602.jpg",
  107: "/pages/602.jpg",
  108: "/pages/602.jpg",
  109: "/pages/603.jpg",
  110: "/pages/603.jpg",
  111: "/pages/603.jpg",
  112: "/pages/604.jpg",
  113: "/pages/604.jpg",
  114: "/pages/604.jpg",
};

// نماذج ألوان جاهزة سريعة
const COLOR_SWATCHES = [
  { hex: "#eab308", name: "ذهبي ملكي" },
  { hex: "#10b981", name: "أخضر زمردي" },
  { hex: "#0284c7", name: "أزرق سماوي" },
  { hex: "#f43f5e", name: "وردي زاهر" },
  { hex: "#a855f7", name: "بنفسجي فاخر" },
  { hex: "#f97316", name: "برتقالي مشرق" },
  { hex: "#14b8a6", name: "تركواز هادئ" },
  { hex: "#84cc16", name: "ليموني نضر" },
];

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

function hexToRgba(hex: string, alpha: number) {
  let c = (hex || "#eab308").replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16) || 0;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function SurahShadingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSurah = Number(searchParams.get("surah")) || 1;

  const surahsList = useMemo(() => getAllSurahs(), []);
  const [selectedSurahNum, setSelectedSurahNum] = useState<number>(initialSurah);

  // صور السيرفر: Hugging Face + Supabase + المحلية
  const [serverImagesMap, setServerImagesMap] = useState<Record<string, string>>({});
  const [serverImagesList, setServerImagesList] = useState<HFImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);

  // مصادر الصفحات المتوفرة
  const [allPages, setAllPages] = useState<string[]>([]);
  const [activePageSrc, setActivePageSrc] = useState<string>("/pages/604.jpg");

  // مربعات التظليل على صورة المصحف
  const [boxes, setBoxes] = useState<AyahBox[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [history, setHistory] = useState<AyahBox[][]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [serverSavedStatus, setServerSavedStatus] = useState<boolean>(true);

  // مؤشر التعديلات غير المحفوظة — يظهر فور تعديل المربعات حتى يضغط المستخدم «حفظ في السيرفر»
  const markUnsaved = useCallback(() => setServerSavedStatus(false), []);

  // عدد مربعات التظليل المحفوظة لكل سورة (تُحسب من السيرفر/المحلي عند فتح قائمة السور)
  const [surahBoxCounts, setSurahBoxCounts] = useState<Record<number, number>>({});
  // السور التي لديها مربع بسملة محفوظ (ayah === 0) — تُعرض بشارة 🕌
  const [surahBismillahFlags, setSurahBismillahFlags] = useState<Record<number, boolean>>({});

  // مزامنة سجل السور المركزي عند فتح الصفحة (مرة واحدة)
  const [registrySyncDone, setRegistrySyncDone] = useState(false);

  // مظهر التظليل المحدد من المستخدم بالكامل
  const [customColor, setCustomColor] = useState<string>(() => {
    try {
      return localStorage.getItem("mushaf:shading:customColor") || "#eab308";
    } catch {
      return "#eab308";
    }
  });
  const [opacity, setOpacity] = useState<number>(0.35);
  const [glowEnabled, setGlowEnabled] = useState(true);

  // إظهار مربعات التظليل الدائمة — تُخفى تلقائياً عند اختيار سورة من القائمة (وضع المعاينة: يظهر المربع ثم يختفي)
  const [showBoxes, setShowBoxes] = useState(true);

  // نظام رسم وإنشاء المربعات بالسحب
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  const [surahSearchQuery, setSurahSearchQuery] = useState("");

  // 📋 نافذة تعريف السورة: رقم + اسم + عدد آيات + صفحة (يحفظ في السجل المركزي بالسيرفر)
  const [defineOpen, setDefineOpen] = useState(false);
  const [defSurahNum, setDefSurahNum] = useState<string>("");
  const [defName, setDefName] = useState<string>("");
  const [defAyahCount, setDefAyahCount] = useState<string>("");
  const [defPage, setDefPage] = useState<string>("");

  // وميض/مربع مؤقت يظهر فوق السورة عند اختيارها أو اختبارها ثم يذهب تلقائياً
  const [tempSurahHighlight, setTempSurahHighlight] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    id: number;
  } | null>(null);

  // مقياس العرض والتكبير (نسبة إلى 1260x1929)
  const [scale, setScale] = useState<number>(() => {
    if (typeof window === "undefined") return 0.55;
    return clamp((window.innerWidth - 60) / PAGE_IMAGE_SIZE.width, 0.35, 0.75);
  });

  // مشغل الصوت للسورة
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // مراجع السحب وتغيير الحجم
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef<string | null>(null);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 });

  // حفظ اللون المختار محلياً + على السيرفر (المستخدم هو من يحدد اللون)
  const handleColorChange = (newColor: string) => {
    setCustomColor(newColor);
    try {
      localStorage.setItem("mushaf:shading:customColor", newColor);
    } catch {}
    saveShadingCustomColorToServer(newColor);
  };

  // مزامنة لون التظليل الذي حدده المستخدم من السيرفر عند فتح الصفحة
  useEffect(() => {
    (async () => {
      const color = await syncShadingCustomColorFromServer();
      if (color && typeof color === "string") {
        setCustomColor(color);
        try { localStorage.setItem("mushaf:shading:customColor", color); } catch {}
      }
    })();
  }, []);

  // تطبيق اللون على المربع المحدد
  const applyColorToSelectedBox = (colorToApply: string) => {
    handleColorChange(colorToApply);
    if (boxes[selectedIndex]) {
      setBoxes((prev) =>
        prev.map((b, i) => (i === selectedIndex ? { ...b, color: colorToApply } : b))
      );
      markUnsaved();
    }
  };

  // 1. جلب صور المصحف وتزامن التظليل من السيرفر (boxes-dump.json + Supabase + HF)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingImages(true);
      try {
        // مزامنة التظليلات من السيرفر فور فتح الصفحة للتأكد من حفظ التظليل
        await syncCoordinatesFromServer().catch(() => {});

        const map: Record<string, string> = {};
        
        // إضافة الصفحات المحلية الأساسية فقط (من مجلد صفحة قران)
        getAllPageSources().forEach((src) => {
          map[src] = src;
        });

        setServerImagesMap(map);
        setServerImagesList([]);

        // تجميع مصادر الصفحات (الصفحات المحلية فقط لتجنب صفحات مستعادة أو غير مرغوب بها)
        const rawCombined = [
          ...getAllPageSources(),
        ];

        const normalized = rawCombined.map(src => {
          if (!src) return null;
          if (src.startsWith("http") || src.startsWith("data:")) return src;
          let s = src.replace(/^\/+/, "");
          if (s.startsWith("custom:") || s.startsWith("custom/")) {
            return "custom:" + s.replace(/^custom[:\/]/, "");
          }
          const name = s.replace(/^pages\//, "");
          return name ? `/pages/${name}` : null;
        }).filter(Boolean) as string[];

        const combined = Array.from(new Set(normalized)).sort((a, b) => {
          const getNum = (s: string) => {
            if (s.includes("fatiha") || s.includes("0.jpg")) return 1;
            if (s.startsWith("custom:")) return 999999;
            const m = s.match(/\d+/);
            return m ? parseInt(m[0], 10) : 999998;
          };
          return getNum(a) - getNum(b);
        });
        setAllPages(combined);

        // إعادة تحميل مربعات الصفحة الحالية بعد المزامنة
        const currentMappedPage =
          SURAH_TO_DEFAULT_PAGE[initialSurah] || "/pages/fatiha.jpg";
        loadPage(currentMappedPage, initialSurah);
        computeSurahBoxCounts();

        // مزامنة سجل السور المركزي (تعريفات السور المحفوظة في السيرفر)
        await syncSurahRegistryFromServer().catch(() => {});
        setRegistrySyncDone(true);
      } catch (err) {
        console.error("Error fetching images & syncing server:", err);
      } finally {
        if (alive) setLoadingImages(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // 2. السورة الحالية
  const currentSurah = useMemo(() => {
    return getSurahByNumber(selectedSurahNum) || surahsList[0];
  }, [selectedSurahNum, surahsList]);

  // إطلاق وميض مربع مؤقت فوق السورة ثم يختفي تلقائياً ("تظهر مربع على فوق سورة ثم يذهب")
  const triggerSurahFlash = useCallback((surahNum: number, pageSrcTarget?: string) => {
    const s = getSurahByNumber(surahNum);
    if (!s) return;

    // استخراج موضع الآية الأولى من هذه السورة في الصفحة إن وجدت
    const pageBoxes = getPageAyahBoxes(pageSrcTarget || activePageSrc);
    const firstBox = pageBoxes.find((b) => b.surah === surahNum) || pageBoxes[0];

    const targetCoords = firstBox
      ? {
          x: firstBox.x,
          y: firstBox.y,
          width: firstBox.width,
          height: firstBox.height,
        }
      : {
          x: 180,
          y: 400,
          width: 900,
          height: 180,
        };

    setTempSurahHighlight({
      ...targetCoords,
      text: `سورة ${s.name}`,
      id: Date.now(),
    });

    // يذهب المربع تلقائياً بعد ثانيتين
    setTimeout(() => {
      setTempSurahHighlight((prev) => (prev?.text === `سورة ${s.name}` ? null : prev));
    }, 2000);
  }, [activePageSrc]);

  // اختيار سورة: يحدد الصفحة، ويظهر مربع التظليل فوق السورة ثم يذهب
  // preview=true (الاختيار من قائمة السور أو الاختبار): تُخفى المربعات الدائمة ليظهر مربع مضيء فوق السورة فقط ثم يختفي
  const selectSurah = (num: number, preview = false) => {
    setSelectedSurahNum(num);
    const surah = getSurahByNumber(num);
    const mappedPage =
      SURAH_TO_DEFAULT_PAGE[num] ||
      (surah && surahPageMap[surah.name]?.[0]) ||
      "/pages/604.jpg";

    loadPage(mappedPage, num);
    if (preview) setShowBoxes(false);
    triggerSurahFlash(num, mappedPage);
  };
  // 📋 فتح نافذة تعريف السورة — النظام يسأل: رقم السورة + الاسم + عدد الآيات + الصفحة
  const openDefineSurah = (suggestedNum?: number) => {
    const num = suggestedNum || selectedSurahNum;
    const known = getSurahByNumber(num);
    const registryEntry = getSurahRegistryEntry(num);

    // تعبئة تلقائية من بيانات القرآن + السجل المركزي
    setDefSurahNum(String(num));
    setDefName(registryEntry?.name || known?.name || "");
    setDefAyahCount(String(registryEntry?.ayahCount || known?.ayahCount || ""));
    setDefPage(registryEntry?.pageSrc || activePageSrc);
    setDefineOpen(true);
  };

  // 💾 حفظ تعريف السورة في السجل المركزي (السيرفر) + إنشاء مربع السورة فوق الصفحة
  const handleDefineSave = async () => {
    const num = parseInt(defSurahNum, 10);
    const count = parseInt(defAyahCount, 10) || 0;
    if (!num || num < 1 || num > 114) {
      toast({ title: "رقم السورة غير صحيح", description: "أدخل رقماً من 1 إلى 114.", variant: "destructive" });
      return;
    }
    const name = defName.trim() || getSurahByNumber(num)?.name || `سورة ${num}`;
    if (!defPage) {
      toast({ title: "اختر صفحة المصحف", description: "حدد الصفحة التي توجد عليها السورة.", variant: "destructive" });
      return;
    }

    // 1) حفظ التعريف في السجل المركزي (محلي + Supabase) ليسهل الربط مستقبلاً
    await upsertSurahRegistryEntry({
      surah: num,
      name,
      ayahCount: count,
      pageSrc: defPage,
      color: customColor,
      notes: "معرّفة من صفحة تظليل السور",
      updatedAt: Date.now(),
    });

    // 2) التأكد من وجود مربع السورة على الصفحة (مربع واحد يمثل السورة كلها)
    if (defPage !== activePageSrc) loadPage(defPage, num);
    else setSelectedSurahNum(num);

    const pageBoxes = getPageAyahBoxes(defPage);
    const existingIdx = pageBoxes.findIndex((b) => b.surah === num);
    if (existingIdx < 0) {
      const first = pageBoxes[0];
      const newBox: AyahBox = {
        surah: num,
        ayah: 1,
        x: first ? first.x : 180,
        y: first ? first.y : 400,
        width: first ? first.width : 900,
        height: first ? first.height : 140,
        color: customColor,
        label: `سورة ${name} (${count || "?"} آيات)`
      };
      const updated = [...pageBoxes, newBox];
      await savePageAyahBoxes(defPage, updated); // حفظ فوري في السيرفر
      setBoxes(updated);
      setSelectedIndex(updated.length - 1);
    } else {
      setBoxes(pageBoxes);
      setSelectedIndex(existingIdx);
    }

    setDefineOpen(false);
    setShowBoxes(true);
    computeSurahBoxCounts();

    // 3) وميض المربع فوق السورة ثم يذهب
    triggerSurahFlash(num, defPage);

    toast({
      title: `✅ عُرّفت سورة ${name}`,
      description: `حُفظ التعريف في السجل المركزي بالسيرفر (${count || "?"} آيات · ${defPage.replace("/pages/", "")}) ومربع السورة ظهر فوق الصفحة ثم يذهب.`
    });
  };

  // 🌟 نظام إنشاء مربع: ينشئ مربع تظليل جديداً للسورة، يظهر مضيئاً فوق الصفحة ثم يذهب

  // 🌟 نظام إنشاء مربع: ينشئ مربع تظليل جديداً للسورة، يظهر مضيئاً فوق الصفحة ثم يذهب
  // 🕌 إنشاء مربع البسملة: برقم 0 (خارج عدّ الآيات) حتى لا ينزاح ترقيم الآيات
  // مثلاً: الفاتحة 7 آيات → 7 مربعات آيات + 1 مربع بسملة — الترقيم يظل صحيحاً 1-7
  const createBismillahBox = () => {
    pushHistory(boxes);
    const surahBoxes = boxes.filter((b) => b.surah === selectedSurahNum);
    const existingBismillah = surahBoxes.find((b) => b.ayah === 0);
    if (existingBismillah) {
      toast({
        title: "مربع البسملة موجود بالفعل",
        description: "لكل سورة مربع بسملة واحد فقط — حدده وعدّل موضعه أو احذفه.",
        variant: "destructive"
      });
      const idx = boxes.indexOf(existingBismillah);
      setSelectedIndex(idx);
      return;
    }

    // الموضع: فوق أول آية (البسملة تأتي قبل الآية الأولى)
    const firstAyahBox = surahBoxes.filter((b) => b.ayah > 0).sort((a, b) => a.y - b.y)[0];
    const newBox: AyahBox = {
      surah: selectedSurahNum,
      ayah: 0, // الرقم 0 = مربع البسملة (خارج عدّ الآيات)
      x: firstAyahBox ? firstAyahBox.x : 180,
      y: firstAyahBox ? clamp(firstAyahBox.y - firstAyahBox.height - 10, 30, PAGE_IMAGE_SIZE.height - 100) : 250,
      width: firstAyahBox?.width || 900,
      height: firstAyahBox?.height || 90,
      color: customColor,
      label: "بسملة"
    };
    const updated = [...boxes, newBox];
    setBoxes(updated);
    setSelectedIndex(updated.length - 1);
    markUnsaved();
    setShowBoxes(true);

    // وميض المربع فوق الصفحة ثم يذهب
    const flashText = "🕌 بسملة";
    setTempSurahHighlight({
      x: newBox.x,
      y: newBox.y,
      width: newBox.width,
      height: newBox.height,
      text: flashText,
      id: Date.now(),
    });
    setTimeout(() => {
      setTempSurahHighlight((prev) => (prev?.text === flashText ? null : prev));
    }, 2000);

    toast({
      title: "🕌 أُنشئ مربع البسملة",
      description: "البسملة خارج عدّ الآيات (رقم 0) — آيات السورة تظل مرقمة بشكل صحيح."
    });
  };

  // ملاحظة: مربع البسملة له الرقم 0 (خارج عدّ الآيات) حتى لا ينزاح ترقيم الآيات
  const createSurahBox = () => {
    pushHistory(boxes);
    const surahBoxes = boxes.filter((b) => b.surah === selectedSurahNum);
    // تجاهل مربع البسملة (ayah === 0) عند حساب رقم الآية التالية
    const ayahBoxes = surahBoxes.filter((b) => b.ayah > 0);
    const nextAyah = (ayahBoxes.length > 0 ? Math.max(...ayahBoxes.map((b) => b.ayah)) : 0) + 1;

    // الموضع: أسفل آخر مربع للسورة، أو موضع افتراضي فوق الصفحة إن لم يوجد
    const nonBismillahBoxes = surahBoxes.filter((b) => b.ayah > 0);
    const lastBox = nonBismillahBoxes.length > 0 ? nonBismillahBoxes[nonBismillahBoxes.length - 1] : null;
    const newX = lastBox ? lastBox.x : 180;
    const newY = lastBox
      ? clamp(lastBox.y + lastBox.height + 15, 50, PAGE_IMAGE_SIZE.height - 150)
      : 400;

    const newBox: AyahBox = {
      surah: selectedSurahNum,
      ayah: nextAyah,
      x: Math.round(newX),
      y: Math.round(newY),
      width: lastBox?.width || 900,
      height: lastBox?.height || 140,
      color: customColor,
      label: `سورة ${currentSurah.name} — آية ${nextAyah}`
    };

    const updated = [...boxes, newBox];
    setBoxes(updated);
    setSelectedIndex(updated.length - 1);
    markUnsaved();
    setShowBoxes(true);

    // يظهر المربع الجديد فوق الصفحة ثم يذهب تلقائياً
    const flashText = `مربع جديد — سورة ${currentSurah.name} آية ${nextAyah}`;
    setTempSurahHighlight({
      x: newBox.x,
      y: newBox.y,
      width: newBox.width,
      height: newBox.height,
      text: flashText,
      id: Date.now(),
    });
    setTimeout(() => {
      setTempSurahHighlight((prev) => (prev?.text === flashText ? null : prev));
    }, 2000);

    toast({
      title: `✨ أُنشئ مربع تظليل للسورة ${currentSurah.name}`,
      description: `مربع الآية ${nextAyah} ظهر فوق الصفحة الآن — اسحبه/حجّمه ثم اضغط «حفظ في السيرفر».`
    });
  };

  // حساب عدد مربعات التظليل المحفوظة لكل سورة من كل الصفحات (المحفوظة في السيرفر)
  // ملاحظة: مربع البسملة (ayah === 0) لا يُحسب ضمن الآيات — يُعرض بشارة 🕌 منفصلة
  const computeSurahBoxCounts = useCallback(() => {
    try {
      const counts: Record<number, number> = {};
      const bismillah: Record<number, boolean> = {};
      [...getAllPageSources(), ...getCustomPages().map((p) => p.src)].forEach((src) => {
        getPageAyahBoxes(src).forEach((b) => {
          if (!b.surah) return;
          if (b.ayah === 0) {
            bismillah[b.surah] = true; // مربع البسملة — خارج عدّ الآيات
          } else {
            counts[b.surah] = (counts[b.surah] || 0) + 1;
          }
        });
      });
      setSurahBoxCounts(counts);
      setSurahBismillahFlags(bismillah);
    } catch { /* ignore */ }
  }, []);

  // 3. تحميل الصفحة ومربعات التظليل الخاصة بها
  const loadPage = (src: string, surahForFilter?: number) => {
    setActivePageSrc(src);
    const pageBoxes = getPageAyahBoxes(src);
    const targetSurah = surahForFilter ?? selectedSurahNum;

    if (pageBoxes.length > 0) {
      setBoxes(pageBoxes);
      // اختر المربع الذي يطابق السورة إن وجد
      const matchIdx = pageBoxes.findIndex((b) => b.surah === targetSurah);
      setSelectedIndex(matchIdx >= 0 ? matchIdx : 0);
    } else {
      // لا توجد مربعات محفوظة — لا ننشئ مربعاً دائماً تلقائياً حتى لا يظل ظاهراً
      // (المستخدم ينشئه بنفسه من «إنشاء مربع» أو «رسم مربع بالسحب»، واختيار السورة يُظهر وميضاً مؤقتاً ثم يختفي)
      setBoxes([]);
      setSelectedIndex(0);
    }
    setHistory([]);
  };

  // تحميل الصفحة الافتراضية عند البدء
  useEffect(() => {
    selectSurah(selectedSurahNum);
  }, []);

  // عنوان الصفحة ورابط الصورة
  const activeImageRaw = serverImagesMap[activePageSrc] || activePageSrc;
  const activeImageFinal = activeImageRaw.startsWith("http") || activeImageRaw.startsWith("data:")
    ? activeImageRaw
    : activeImageRaw;

  // المربع المحدد حالياً
  const selectedBox = boxes[selectedIndex] || boxes[0];

  const pushHistory = (current: AyahBox[]) => {
    setHistory((prev) => [...prev.slice(-15), current]);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setBoxes(prev);
    setSelectedIndex((i) => Math.min(i, Math.max(0, prev.length - 1)));
  };

  // إضافة مربع تظليل لآية جديدة بشكل سريع
  const addNewBox = () => {
    pushHistory(boxes);
    // تجاهل مربع البسملة (ayah === 0) عند حساب رقم الآية التالية
    const surahAyahBoxes = boxes.filter((b) => b.surah === selectedSurahNum && b.ayah > 0);
    const nextAyah = (surahAyahBoxes.length > 0 ? Math.max(...surahAyahBoxes.map((b) => b.ayah)) : 0) + 1;
    const nextY = selectedBox
      ? clamp(selectedBox.y + selectedBox.height + 15, 50, PAGE_IMAGE_SIZE.height - 150)
      : 800;

    const newBox: AyahBox = {
      surah: selectedSurahNum,
      ayah: nextAyah,
      x: selectedBox?.x || 180,
      y: nextY,
      width: selectedBox?.width || 900,
      height: selectedBox?.height || 140,
      color: customColor,
      label: `الآية ${nextAyah}`
    };

    const nextList = [...boxes, newBox];
    setBoxes(nextList);
    setSelectedIndex(nextList.length - 1);
    markUnsaved();
    setShowBoxes(true);
    toast({ title: `✨ تم إضافة مربع تظليل للآية ${nextAyah}` });
  };

  // نسخ المربع الحالي
  const duplicateSelectedBox = () => {
    if (!selectedBox) return;
    pushHistory(boxes);
    // رقم الآية التالية مع تجاهل مربع البسملة (ayah === 0)
    const nextAyah = selectedBox.ayah + 1;
    const copyBox: AyahBox = {
      ...selectedBox,
      ayah: nextAyah,
      y: clamp(selectedBox.y + selectedBox.height + 12, 50, PAGE_IMAGE_SIZE.height - selectedBox.height),
      label: `الآية ${nextAyah}`
    };
    const nextList = [...boxes.slice(0, selectedIndex + 1), copyBox, ...boxes.slice(selectedIndex + 1)];
    setBoxes(nextList);
    setSelectedIndex(selectedIndex + 1);
    markUnsaved();
    setShowBoxes(true);
    toast({ title: `📋 تم نسخ المربع للآية ${nextAyah}` });
  };

  // استكمال الآية في سطر جديد (نفس رقم الآية)
  const splitAyahBox = () => {
    if (!selectedBox) return;
    pushHistory(boxes);
    const sameAyah = selectedBox.ayah;
    const copyBox: AyahBox = {
      ...selectedBox,
      y: clamp(selectedBox.y + selectedBox.height + 12, 50, PAGE_IMAGE_SIZE.height - selectedBox.height),
    };
    const nextList = [...boxes.slice(0, selectedIndex + 1), copyBox, ...boxes.slice(selectedIndex + 1)];
    setBoxes(nextList);
    setSelectedIndex(selectedIndex + 1);
    markUnsaved();
    setShowBoxes(true);
    toast({ title: `🔗 تم إضافة شطر جديد للآية ${sameAyah === 0 ? "البسملة" : sameAyah}` });
  };

  // حذف المربع الحالي
  const deleteSelectedBox = () => {
    if (boxes.length <= 1) {
      toast({ title: "يجب إبقاء مربع تظليل واحد على الأقل", variant: "destructive" });
      return;
    }
    pushHistory(boxes);
    const nextList = boxes.filter((_, idx) => idx !== selectedIndex);
    setBoxes(nextList);
    setSelectedIndex(Math.max(0, selectedIndex - 1));
    markUnsaved();
    toast({ title: "تم حذف مربع التظليل" });
  };

  // سحب المربع (Pointer Drag)
  const handlePointerDownDrag = (e: React.PointerEvent, index: number) => {
    if (isDrawMode) return;
    e.stopPropagation();
    setSelectedIndex(index);
    isDraggingRef.current = true;
    const target = boxes[index];
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: target.x,
      boxY: target.y,
      boxW: target.width,
      boxH: target.height
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  // تغيير أبعاد المربع بالمقابض (Resize)
  const handlePointerDownResize = (handle: string, e: React.PointerEvent) => {
    if (isDrawMode) return;
    e.stopPropagation();
    isResizingRef.current = handle;
    if (!selectedBox) return;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: selectedBox.x,
      boxY: selectedBox.y,
      boxW: selectedBox.width,
      boxH: selectedBox.height
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  // بدء رسم مربع جديد بالسحب فوق الصفحة
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (!isDrawMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setDrawStart({ x, y });
    setDrawCurrent({ x, y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // حالة رسم مربع جديد بالسحب
    if (isDrawMode && drawStart && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = clamp((e.clientX - rect.left) / scale, 0, PAGE_IMAGE_SIZE.width);
      const y = clamp((e.clientY - rect.top) / scale, 0, PAGE_IMAGE_SIZE.height);
      setDrawCurrent({ x, y });
      return;
    }

    // سحب مربع موجود
    if (isDraggingRef.current && selectedBox) {
      const deltaX = (e.clientX - dragStartRef.current.mouseX) / scale;
      const deltaY = (e.clientY - dragStartRef.current.mouseY) / scale;

      const newX = clamp(dragStartRef.current.boxX + deltaX, 0, PAGE_IMAGE_SIZE.width - selectedBox.width);
      const newY = clamp(dragStartRef.current.boxY + deltaY, 0, PAGE_IMAGE_SIZE.height - selectedBox.height);

      setBoxes((list) =>
        list.map((b, i) => (i === selectedIndex ? { ...b, x: Math.round(newX), y: Math.round(newY) } : b))
      );
      markUnsaved();
    } else if (isResizingRef.current && selectedBox) {
      const deltaX = (e.clientX - dragStartRef.current.mouseX) / scale;
      const deltaY = (e.clientY - dragStartRef.current.mouseY) / scale;
      const handle = isResizingRef.current;

      let newX = selectedBox.x;
      let newY = selectedBox.y;
      let newW = selectedBox.width;
      let newH = selectedBox.height;

      if (handle.includes("e")) {
        newW = clamp(dragStartRef.current.boxW + deltaX, 60, PAGE_IMAGE_SIZE.width - selectedBox.x);
      }
      if (handle.includes("w")) {
        const possibleW = dragStartRef.current.boxW - deltaX;
        if (possibleW > 60) {
          newW = possibleW;
          newX = dragStartRef.current.boxX + deltaX;
        }
      }
      if (handle.includes("s")) {
        newH = clamp(dragStartRef.current.boxH + deltaY, 30, PAGE_IMAGE_SIZE.height - selectedBox.y);
      }
      if (handle.includes("n")) {
        const possibleH = dragStartRef.current.boxH - deltaY;
        if (possibleH > 30) {
          newH = possibleH;
          newY = dragStartRef.current.boxY + deltaY;
        }
      }

      setBoxes((list) =>
        list.map((b, i) =>
          i === selectedIndex
            ? { ...b, x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) }
            : b
        )
      );
      markUnsaved();
    }
  };

  const handlePointerUp = () => {
    // إتمام رسم مربع جديد
    if (isDrawMode && drawStart && drawCurrent) {
      const x = Math.min(drawStart.x, drawCurrent.x);
      const y = Math.min(drawStart.y, drawCurrent.y);
      const width = Math.abs(drawCurrent.x - drawStart.x);
      const height = Math.abs(drawCurrent.y - drawStart.y);

      if (width >= 30 && height >= 20) {
        pushHistory(boxes);
        // رقم الآية التالية مع تجاهل مربع البسملة (ayah === 0)
        const surahAyahBoxes = boxes.filter((b) => b.surah === selectedSurahNum && b.ayah > 0);
        const nextAyah = (surahAyahBoxes.length > 0 ? Math.max(...surahAyahBoxes.map((b) => b.ayah)) : 0) + 1;
        const newBox: AyahBox = {
          surah: selectedSurahNum,
          ayah: nextAyah,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          color: customColor,
          label: `الآية ${nextAyah}`
        };
        const updated = [...boxes, newBox];
        setBoxes(updated);
        setSelectedIndex(updated.length - 1);
        setShowBoxes(true);
        toast({ title: `✨ تم إنشاء مربع تظليل جديد للآية ${nextAyah}` });
      } else {
        toast({ title: "المربع صغير جداً، اسحب مسافة أوسع لتحديده", variant: "destructive" });
      }

      setDrawStart(null);
      setDrawCurrent(null);
      setIsDrawMode(false);
      markUnsaved();
      return;
    }

    isDraggingRef.current = false;
    isResizingRef.current = null;
  };

  // حفظ التظليل في نظام المصحف والسيرفر (boxes-dump.json + Supabase)
  const handleSaveShading = async () => {
    // حماية: لا نحفظ قائمة فارغة حتى لا نمسح تظليل السيرفر بالخطأ (مثلاً أثناء وضع المعاينة)
    if (boxes.length === 0) {
      toast({
        title: "لا توجد مربعات للحفظ",
        description: "أنشئ مربعاً أولاً من زر «إنشاء مربع» أو «رسم مربع بالسحب».",
        variant: "destructive"
      });
      return;
    }
    setIsSaving(true);
    try {
      await savePageAyahBoxes(activePageSrc, boxes);
      setServerSavedStatus(true);
      computeSurahBoxCounts();

      toast({
        title: "✅ تم الحفظ في السيرفر بنجاح",
        description: `تم حفظ ${boxes.length} مربع تظليل في السيرفر المحلي (boxes-dump.json) والمزامنة بنجاح.`
      });
    } catch (err: any) {
      toast({
        title: "تعذر الحفظ",
        description: err?.message || "حدث خطأ غير متوقع أثناء حفظ التظليل على السيرفر",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // التحكم بالصوت
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((err) => {
        toast({ title: "تعذر تشغيل الصوت", description: err.message, variant: "destructive" });
      });
    }
  };



  // الألوان المشتقة من اختيار المستخدم
  const activeBoxColorHex = selectedBox?.color || customColor;
  const activeBg = hexToRgba(activeBoxColorHex, opacity);
  const activeBorder = hexToRgba(activeBoxColorHex, 0.95);
  const activeGlow = hexToRgba(activeBoxColorHex, 0.45);

  return (
    <div
      className="min-h-[100dvh] bg-[#09090b] text-stone-200 flex overflow-hidden select-none font-sans"
      dir="rtl"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* مشغل الصوت الخفي */}
      <audio
        ref={audioRef}
        src={getSurahAudioUrl(selectedSurahNum)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* الشريط الجانبي (الأدوات والإعدادات) */}
      <aside className="w-[340px] flex-shrink-0 bg-[#111113] border-l border-white/5 flex flex-col h-[100dvh] shadow-2xl relative z-40">
        {/* Header */}
        <div className="p-4 border-b border-white/5 bg-black/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-colors shadow-sm"
              title="العودة"
            >
              <ArrowRight className="w-4 h-4 text-stone-300" />
            </button>
            <div className="flex flex-col">
              <h1 className="font-bold text-sm text-stone-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                محرر التظليل
              </h1>
              <span className="text-[10px] text-stone-500">مزامنة سحابية نشطة</span>
            </div>
          </div>
          <div 
            className={`flex items-center justify-center px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${serverSavedStatus ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'}`}
            title={serverSavedStatus ? 'مزامنة مع السيرفر' : 'توجد تعديلات غير محفوظة'}
          >
            {serverSavedStatus ? <Check className="w-3 h-3 mr-1" /> : <Save className="w-3 h-3 mr-1" />}
            {serverSavedStatus ? "محفوظ" : "غير محفوظ"}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          
          {/* Section: Surah & Page */}
          <div className="space-y-2.5">
            <h2 className="text-[10px] font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> الصفحة المعروضة
            </h2>
            
            
            <div className="relative group">
              <select value={activePageSrc} onChange={(e) => loadPage(e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-xl text-xs font-bold text-stone-300 p-2.5 pl-8 pr-3 outline-none appearance-none cursor-pointer focus:border-amber-500/50 transition-colors">
                {(() => {
                  let customCount = 0;
                  let extCount = 0;
                  const seenLabels = new Set<string>();
                  const options = [];
                  
                  for (const src of allPages) {
                    let label = "";
                    if (src.includes("0.jpg") || src.includes("fatiha")) label = "📖 الفاتحة";
                    else if (src.startsWith("custom:")) {
                      const cp = getCustomPages().find((p) => p.src === src);
                      if (cp && cp.name) {
                        label = `🖼️ ${cp.name}`;
                      } else {
                        customCount++;
                        label = `🖼️ صورة مخصصة ${customCount}`;
                      }
                    }
                    else if (src.startsWith("http") || src.startsWith("data:")) {
                      extCount++;
                      label = `🖼️ صورة خارجية ${extCount}`;
                    }
                    else label = `📄 صفحة ${src.replace("/pages/", "").replace(".jpg", "")}`;
                    
                    let coreName = "";
                    if (src.includes("0.jpg") || src.includes("fatiha")) coreName = "fatiha";
                    else if (label.match(/\d+/)) coreName = label.match(/\d+/)?.[0] || label;
                    else coreName = label;
                    
                    // منع تكرار نفس رقم الصفحة في القائمة المنسدلة (مثلاً: "📄 صفحة 581" و "🖼️ 581")
                    if (seenLabels.has(coreName)) continue;
                    seenLabels.add(coreName);
                    
                    options.push(<option key={src} value={src} className="bg-stone-900">{label}</option>);
                  }
                  return options;
                })()}
              </select>
              <Layers className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-amber-500 transition-colors" />
            </div>
          </div>

          {/* Section: Appearance */}
          <div className="space-y-2.5">
            <h2 className="text-[10px] font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" /> المظهر
            </h2>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-3.5 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-stone-400">اللون المخصص</span>
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg">
                  <div className="relative w-5 h-5 rounded-md overflow-hidden border border-white/20 shadow-sm cursor-pointer">
                    <input type="color" value={customColor} onChange={(e) => applyColorToSelectedBox(e.target.value)} className="absolute inset-0 w-8 h-8 -top-1 -left-1 cursor-pointer" />
                  </div>
                  <span className="text-[10px] font-mono text-stone-400 px-1">{customColor.toUpperCase()}</span>
                </div>
              </div>
              
              <div className="flex gap-1.5 flex-wrap justify-between pt-1 border-t border-white/5">
                {COLOR_SWATCHES.map(swatch => (
                  <button key={swatch.hex} onClick={() => applyColorToSelectedBox(swatch.hex)} className={`w-5 h-5 rounded-full border transition-all hover:scale-125 ${customColor.toLowerCase() === swatch.hex.toLowerCase() ? 'border-white ring-2 ring-white/20' : 'border-black/50'}`} style={{ backgroundColor: swatch.hex }} title={swatch.name}>
                    {customColor.toLowerCase() === swatch.hex.toLowerCase() && <Check className="w-3 h-3 text-white m-auto drop-shadow-md" />}
                  </button>
                ))}
              </div>
              
              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-400">مستوى الشفافية</span>
                  <span className="text-[10px] font-mono font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">{Math.round(opacity * 100)}%</span>
                </div>
                <input type="range" min="0.10" max="0.85" step="0.05" value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} className="w-full accent-amber-500 cursor-pointer" />
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-xs font-medium text-stone-400">توهج الإضاءة المحيطة</span>
                <button onClick={() => setGlowEnabled(v => !v)} className={`w-9 h-5 rounded-full relative transition-colors shadow-inner ${glowEnabled ? 'bg-amber-500' : 'bg-white/10'}`}>
                  <span className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${glowEnabled ? 'left-1' : 'right-1'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Section: Selected Box Editor */}
          <div className="space-y-2.5">
            <h2 className="text-[10px] font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5" /> الصندوق المحدد
            </h2>
            {selectedBox ? (
              <div className="bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20 rounded-xl p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-500">رقم الآية المحددة</span>
                  <input type="number" min={0} value={selectedBox.ayah} onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    const val = isNaN(parsed) ? 0 : parsed;
                    setBoxes(list => list.map((b, i) => i === selectedIndex ? { ...b, ayah: val } : b));
                    markUnsaved();
                  }} className="w-16 h-8 bg-black/60 border border-amber-500/40 rounded-lg text-center text-sm font-bold text-amber-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all shadow-inner" />
                </div>
                <div className="flex items-center justify-between text-[10px] text-stone-500 bg-black/20 p-1.5 rounded-lg border border-white/5">
                   <span>إحداثيات الموضع:</span>
                   <span className="font-mono">X: {Math.round(selectedBox.x)} | Y: {Math.round(selectedBox.y)}</span>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-stone-600 text-center py-4 bg-black/20 rounded-xl border border-white/5 border-dashed">
                لم يتم تحديد أي مربع تظليل
              </div>
            )}
          </div>

          {/* Section: Actions & Tools */}
          <div className="space-y-2.5">
            <h2 className="text-[10px] font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> أدوات الرسم
            </h2>
            
            <button onClick={() => setIsDrawMode(v => !v)} className={`w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md ${isDrawMode ? 'bg-amber-500 text-black shadow-amber-500/20 ring-2 ring-amber-500/50' : 'bg-white/5 text-stone-300 hover:bg-white/10 border border-white/5'}`}>
              <Crosshair className="w-4 h-4" />
              {isDrawMode ? "اسحب للرسم (نشط)..." : "تفعيل الرسم اليدوي"}
            </button>
            
            <div className="grid grid-cols-2 gap-2">
              <button onClick={addNewBox} className="py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs font-bold text-emerald-400 flex flex-col items-center justify-center gap-1 transition-colors">
                <Plus className="w-4 h-4" /> <span>آية جديدة</span>
              </button>
              <button onClick={createBismillahBox} className="py-2.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-xs font-bold text-teal-400 flex flex-col items-center justify-center gap-1 transition-colors">
                <Sparkles className="w-4 h-4" /> <span>مربع بسملة</span>
              </button>
              <button onClick={splitAyahBox} className="py-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-xs font-bold text-indigo-400 flex flex-col items-center justify-center gap-1 transition-colors">
                <Layers className="w-4 h-4" /> <span>شطر ثاني</span>
              </button>
              <button onClick={duplicateSelectedBox} className="py-2.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-xs font-bold text-sky-400 flex flex-col items-center justify-center gap-1 transition-colors">
                <Copy className="w-4 h-4" /> <span>الآية التالية</span>
              </button>
            </div>
            
            <div className="flex gap-2 pt-2 border-t border-white/5">
              <button onClick={() => setShowBoxes(v => !v)} className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center transition-colors ${showBoxes ? 'bg-white/10 text-stone-200' : 'bg-white/5 text-stone-500 hover:bg-white/10'}`}>
                {showBoxes ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button onClick={undo} disabled={history.length === 0} className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-xs text-stone-400 flex items-center justify-center transition-colors">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={deleteSelectedBox} className="flex-1 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs text-red-400 flex items-center justify-center transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/5 bg-black/40 space-y-2.5 shrink-0">
          <button onClick={handleSaveShading} disabled={isSaving} className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(245,158,11,0.25)] active:scale-95">
            <Save className="w-4 h-4" />
            {isSaving ? "جاري مزامنة التظليل..." : "حفظ التظليل بالسيرفر"}
          </button>
          <button onClick={() => openDefineSurah()} className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-stone-400 text-xs font-medium flex items-center justify-center gap-2 transition-all hover:text-stone-200">
            <Server className="w-3.5 h-3.5" /> تعريف السورة في السجل
          </button>
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main className="flex-1 relative flex items-center justify-center bg-stone-950/80 overflow-auto bg-grid-pattern" id="canvas-container">
        
        {/* Floating Controls */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 p-2 rounded-2xl shadow-2xl">
           <button onClick={() => setScale(s => clamp(s + 0.05, 0.25, 2.0))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 transition-colors"><ZoomIn className="w-5 h-5" /></button>
           <span className="w-14 text-center text-[12px] font-mono font-bold text-stone-400 bg-black/40 py-1.5 rounded-lg border border-white/5">{Math.round(scale * 100)}%</span>
           <button onClick={() => setScale(s => clamp(s - 0.05, 0.25, 2.0))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 transition-colors"><ZoomOut className="w-5 h-5" /></button>
           
           <div className="w-px h-6 bg-white/10 mx-1" />
           
           <button onClick={togglePlay} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-lg ${isPlaying ? 'bg-amber-500 text-black shadow-amber-500/20' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
           </button>
        </div>

        {/* The Document Canvas */}
        <div
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          className={`relative shadow-[0_0_40px_rgba(0,0,0,0.4)] rounded-xl overflow-hidden ring-1 ring-white/10 transition-transform ${isDrawMode ? 'cursor-crosshair ring-amber-500/50 ring-2' : ''}`}
          style={{ width: PAGE_IMAGE_SIZE.width * scale, height: PAGE_IMAGE_SIZE.height * scale, transformOrigin: 'center center' }}
        >
          <img src={activeImageFinal} alt="صفحة المصحف" className="absolute inset-0 w-full h-full object-fill pointer-events-none opacity-95" draggable={false} onError={(e) => { const t = e.currentTarget; if (!t.src.includes(activePageSrc)) t.src = activePageSrc; }} />
          
          {!showBoxes && (
            <button onClick={() => setShowBoxes(true)} className="absolute top-6 left-1/2 -translate-x-1/2 z-30 px-6 py-3 rounded-full bg-black/80 backdrop-blur-md border border-white/10 text-white font-bold text-sm flex items-center gap-2 shadow-xl hover:bg-black transition-colors animate-in slide-in-from-top-4">
              <Eye className="w-5 h-5 text-amber-400" /> عرض مربعات التظليل
            </button>
          )}

          {isDrawMode && drawStart && drawCurrent && (
            <div className="absolute border-2 border-dashed rounded-lg pointer-events-none z-30" style={{ left: Math.min(drawStart.x, drawCurrent.x) * scale, top: Math.min(drawStart.y, drawCurrent.y) * scale, width: Math.abs(drawCurrent.x - drawStart.x) * scale, height: Math.abs(drawCurrent.y - drawStart.y) * scale, backgroundColor: hexToRgba(customColor, 0.35), borderColor: customColor, boxShadow: `0 0 15px ${hexToRgba(customColor, 0.7)}` }} />
          )}

          {tempSurahHighlight && (
            <div key={tempSurahHighlight.id} className="absolute z-40 rounded-xl border-4 pointer-events-none transition-all duration-700 animate-pulse" style={{ left: tempSurahHighlight.x * scale, top: tempSurahHighlight.y * scale, width: tempSurahHighlight.width * scale, height: tempSurahHighlight.height * scale, borderColor: customColor, backgroundColor: hexToRgba(customColor, 0.45), boxShadow: `0 0 35px ${customColor}, inset 0 0 25px ${customColor}` }}>
               <div className="absolute -top-10 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-amber-500 text-black font-extrabold text-xs shadow-xl flex items-center gap-1.5 whitespace-nowrap border border-white/20">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" /> {tempSurahHighlight.text}
               </div>
            </div>
          )}

          {showBoxes && boxes.map((box, index) => {
            const isSelected = index === selectedIndex;
            const boxColorHex = box.color || customColor;
            const boxBg = isSelected ? hexToRgba(boxColorHex, opacity) : hexToRgba(boxColorHex, 0.15);
            const boxBorder = isSelected ? hexToRgba(boxColorHex, 0.95) : hexToRgba(boxColorHex, 0.4);
            return (
              <div
                key={`box-${box.surah}-${box.ayah}-${index}`}
                onPointerDown={(e) => handlePointerDownDrag(e, index)}
                style={{ left: box.x * scale, top: box.y * scale, width: box.width * scale, height: box.height * scale, backgroundColor: boxBg, borderColor: boxBorder, boxShadow: isSelected && glowEnabled ? `0 0 20px ${hexToRgba(boxColorHex, 0.5)}, inset 0 0 10px ${hexToRgba(boxColorHex, 0.3)}` : "none" }}
                className={`absolute z-20 rounded-lg border-2 cursor-move touch-none select-none transition-shadow ${isSelected ? "border-solid ring-1 ring-white/30" : "border-dashed hover:border-white/40"}`}
              >
                <span style={{ backgroundColor: isSelected ? boxColorHex : "rgba(0, 0, 0, 0.75)" }} className={`absolute -top-3.5 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-md flex items-center gap-1 backdrop-blur-sm ${isSelected ? 'text-black' : 'text-stone-200'}`}>
                  {box.ayah === 0 ? "🕌 بسملة" : `آية ${box.ayah}`}
                </span>
                
                {isSelected && !isDrawMode && (
                  <>
                    <div onPointerDown={(e) => handlePointerDownResize("se", e)} className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-500 rounded-full cursor-se-resize shadow-lg touch-none hover:scale-125 transition-transform" />
                    <div onPointerDown={(e) => handlePointerDownResize("sw", e)} className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-500 rounded-full cursor-sw-resize shadow-lg touch-none hover:scale-125 transition-transform" />
                    <div onPointerDown={(e) => handlePointerDownResize("ne", e)} className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-500 rounded-full cursor-ne-resize shadow-lg touch-none hover:scale-125 transition-transform" />
                    <div onPointerDown={(e) => handlePointerDownResize("nw", e)} className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-amber-500 rounded-full cursor-nw-resize shadow-lg touch-none hover:scale-125 transition-transform" />
                    <div onPointerDown={(e) => handlePointerDownResize("e", e)} className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-5 bg-white border-2 border-amber-500 rounded cursor-e-resize shadow-lg touch-none hover:scale-y-125 transition-transform" />
                    <div onPointerDown={(e) => handlePointerDownResize("w", e)} className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-5 bg-white border-2 border-amber-500 rounded cursor-w-resize shadow-lg touch-none hover:scale-y-125 transition-transform" />
                    <div onPointerDown={(e) => handlePointerDownResize("s", e)} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-2 bg-white border-2 border-amber-500 rounded cursor-s-resize shadow-lg touch-none hover:scale-x-125 transition-transform" />
                    <div onPointerDown={(e) => handlePointerDownResize("n", e)} className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-2 bg-white border-2 border-amber-500 rounded cursor-n-resize shadow-lg touch-none hover:scale-x-125 transition-transform" />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </main>



      {/* 📋 نافذة تعريف السورة: النظام يطلب الرقم والاسم وعدد الآيات والصفحة — كل شيء معلوم */
      defineOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setDefineOpen(false)}>
          <div
            className="w-full max-w-md rounded-3xl border border-violet-500/30 bg-card shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* رأس النافذة */}
            <div className="relative p-5 bg-gradient-to-l from-violet-600/30 via-purple-600/20 to-transparent border-b border-border">
              <button
                onClick={() => setDefineOpen(false)}
                className="absolute top-3 left-3 w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4 text-foreground" />
              </button>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-violet-500/25 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-violet-300" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-foreground">تعريف السورة</h3>
                  <p className="text-xs text-muted-foreground">أدخل الرقم والاسم وعدد الآيات — يُحفظ في السجل المركزي بالسيرفر</p>
                </div>
              </div>
            </div>

            {/* النموذج */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">رقم السورة (1-114) *</label>
                  <input
                    type="number"
                    min={1}
                    max={114}
                    value={defSurahNum}
                    onChange={(e) => {
                      setDefSurahNum(e.target.value);
                      const n = parseInt(e.target.value, 10);
                      if (n >= 1 && n <= 114) {
                        const known = getSurahByNumber(n);
                        if (known && !defName.trim()) setDefName(known.name);
                        if (known?.ayahCount) setDefAyahCount(String(known.ayahCount));
                      }
                    }}
                    placeholder="مثال: 114"
                    className="w-full h-10 rounded-xl bg-background border border-border px-3 font-bold text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">عدد الآيات</label>
                  <input
                    type="number"
                    min={1}
                    value={defAyahCount}
                    onChange={(e) => setDefAyahCount(e.target.value)}
                    placeholder="مثال: 6"
                    className="w-full h-10 rounded-xl bg-background border border-border px-3 font-bold text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">اسم السورة</label>
                <input
                  type="text"
                  value={defName}
                  onChange={(e) => setDefName(e.target.value)}
                  placeholder="مثال: الناس"
                  className="w-full h-10 rounded-xl bg-background border border-border px-3 font-bold text-sm focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">صفحة المصحف *</label>
                <select
                  value={defPage}
                  onChange={(e) => setDefPage(e.target.value)}
                  className="w-full h-10 rounded-xl bg-background border border-border px-3 font-bold text-sm focus:outline-none focus:border-violet-500"
                >
                  <option value="">— اختر الصفحة —</option>
                  {allPages.map((src) => (
                    <option key={src} value={src}>
                      {src.startsWith("custom:")
                        ? `صفحة مخصصة: ${src.replace("custom:", "")}`
                        : src.replace("/pages/", "صفحة ").replace(".jpg", "")}
                    </option>
                  ))}
                </select>
              </div>

              {/* معلومات السجل */}
              <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3 text-[11px] text-violet-200/90 leading-relaxed">
                💾 يُحفظ التعريف (الرقم + الاسم + عدد الآيات + الصفحة + الموضع) في <b>السجل المركزي على السيرفر</b> —
                مما يسهّل لاحقاً ربط السورة بالتظليل والتلاوات والاختبارات تلقائياً.
              </div>
            </div>

            {/* أزرار النافذة */}
            <div className="p-5 pt-0 flex items-center gap-2">
              <button
                onClick={handleDefineSave}
                className="flex-1 h-11 rounded-xl bg-gradient-to-l from-violet-600 to-purple-600 text-white font-extrabold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all hover:opacity-90"
              >
                <Save className="w-4 h-4" />
                <span>حفظ التعريف وإنشاء المربع</span>
              </button>
              <button
                onClick={() => setDefineOpen(false)}
                className="h-11 px-4 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-sm text-foreground transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
