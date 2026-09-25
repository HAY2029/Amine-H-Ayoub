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
  1: "/pages/fatiha.jpg",
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
  const [activePageSrc, setActivePageSrc] = useState<string>("/pages/fatiha.jpg");

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

  // نافذة قائمة السور المرئية
  const [showSurahsModal, setShowSurahsModal] = useState(false);
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

        const [hfImgs, supabaseImgs] = await Promise.all([
          fetchHuggingFaceImages().catch(() => [] as HFImage[]),
          syncAllPageImagesFromServer().catch(() => ({} as Record<string, string>)),
        ]);
        if (!alive) return;

        const map: Record<string, string> = { ...supabaseImgs };
        hfImgs.forEach((img) => {
          const clean = img.name.replace(/^pages\//, "").replace(/^\/pages\//, "");
          const src = `/pages/${clean}`;
          map[src] = img.url;
        });

        // إضافة الصفحات المحلية الأساسية إن لم توجد
        getAllPageSources().forEach((src) => {
          if (!map[src]) map[src] = src;
        });

        setServerImagesMap(map);
        setServerImagesList(hfImgs);

        // تجميع كل مصادر الصفحات
        const combined = Array.from(
          new Set([
            ...getAllPageSources(),
            ...getCustomPages().map((p) => p.src),
            ...Object.keys(map),
          ])
        );
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
      "/pages/fatiha.jpg";

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
    toast({ title: `📋 تم نسخ المربع للآية ${nextAyah}` });
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

  // تصفية السور في نافذة قائمة السور
  const filteredSurahs = useMemo(() => {
    if (!surahSearchQuery.trim()) return surahsList;
    const q = surahSearchQuery.trim().toLowerCase();
    return surahsList.filter(
      (s) =>
        s.name.includes(q) ||
        s.number.toString().includes(q) ||
        (s.englishName && s.englishName.toLowerCase().includes(q))
    );
  }, [surahsList, surahSearchQuery]);

  // الألوان المشتقة من اختيار المستخدم
  const activeBoxColorHex = selectedBox?.color || customColor;
  const activeBg = hexToRgba(activeBoxColorHex, opacity);
  const activeBorder = hexToRgba(activeBoxColorHex, 0.95);
  const activeGlow = hexToRgba(activeBoxColorHex, 0.45);

  return (
    <div
      className="min-h-screen page-nour text-foreground flex flex-col select-none"
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

      {/* الرأس الفاخر */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border/80 px-4 py-2.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          {/* الرجوع والعنوان */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground hover:brightness-95 active:scale-95 transition-all shadow-soft"
              title="رجوع"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400">
                  <ImageIcon className="h-4 w-4" />
                </span>
                <h1 className="font-extrabold text-lg text-gradient-gold">
                  تظليل سور المصحف (فوق الصور)
                </h1>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                    serverSavedStatus ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                  }`}
                  title="يتم حفظ التظليل في ملف boxes-dump.json في سيرفر التطبيق وقاعدة البيانات"
                >
                  <Server className="h-3 w-3" />
                  {serverSavedStatus ? "محفوظ في السيرفر" : "تعديلات غير محفوظة"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                حدد لون التظليل بحرية، وارسم المربعات بالسحب، واستعرض السور مع تأثير الظهور والاختفاء التلقائي
              </p>
            </div>
          </div>

          {/* اختيار السورة والصفحة وزر الحفظ */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* زر فتح قائمة السور المرئية (نظام بطاقات السور) */}
            <button
              onClick={() => {
                computeSurahBoxCounts();
                setShowSurahsModal(true);
              }}
              className="flex h-9 items-center gap-1.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs active:scale-95 transition-all"
              title="عرض قائمة السور كاملة"
            >
              <BookOpen className="h-4 w-4 text-amber-400" />
              <span>قائمة السور ({currentSurah.name})</span>
            </button>

            {/* زر اختبار السورة (يظهر مربع فوق السورة ثم يذهب) */}
            <button
              onClick={() => {
                selectSurah(selectedSurahNum, true);
                toast({
                  title: `⚡ اختبار سورة ${currentSurah.name}`,
                  description: "يظهر مربع التظليل الآن فوق السورة ثم يختفي تلقائياً."
                });
              }}
              className="flex h-9 items-center gap-1.5 px-3 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 font-bold text-xs active:scale-95 transition-all"
              title="اختبار السورة: يظهر مربع مضيء فوق السورة في المصحف ثم يذهب"
            >
              <Zap className="h-3.5 w-3.5 text-purple-400" />
              <span>اختبار السورة</span>
            </button>

            {/* زر إنشاء مربع تظليل جديد للسورة (يظهر فوق الصفحة ثم يذهب) */}
            <button
              onClick={createSurahBox}
              className="flex h-9 items-center gap-1.5 px-3 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 font-bold text-xs active:scale-95 transition-all"
              title="إنشاء مربع تظليل جديد للسورة: يظهر فوق الصفحة مباشرة ثم يذهب"
            >
              <Plus className="h-4 w-4 text-sky-400" />
              <span>إنشاء مربع</span>
            </button>

            {/* زر تعريف السورة: النظام يسأل رقم السورة وعدد آياتها وكل معلوماتها (سجل مركزي بالسيرفر) */}
            <button
              onClick={() => openDefineSurah()}
              className="flex h-9 items-center gap-1.5 px-3 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 font-bold text-xs active:scale-95 transition-all"
              title="تعريف السورة: رقم + اسم + عدد آيات + صفحة — يُحفظ في السجل المركزي بالسيرفر ليسهل الربط مستقبلاً"
            >
              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              <span>تعريف سورة</span>
            </button>

            {/* قائمة صفحات السيرفر */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-muted-foreground">الصفحة:</span>
              <select
                value={activePageSrc}
                onChange={(e) => loadPage(e.target.value)}
                className="h-9 px-2.5 rounded-xl bg-secondary border border-border text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {allPages.map((src) => {
                  const label = src.replace("/pages/", "").replace(".jpg", "");
                  return (
                    <option key={src} value={src}>
                      {src.includes("fatiha") ? "📖 الفاتحة" : `صفحة ${label}`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* زر حفظ التظليل في السيرفر */}
            <button
              onClick={handleSaveShading}
              disabled={isSaving}
              className="flex h-9 items-center gap-1.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md shadow-emerald-600/20 active:scale-95 transition-all disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? "جارٍ الحفظ بالسيرفر..." : "حفظ في السيرفر"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* شريط أدوات التظليل: اختيار اللون بحرية للمستخدم + إنشاء المربعات */}
      <div className="bg-card/75 border-b border-border/60 px-4 py-2 text-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          {/* اختيار لون التظليل المخصص من قِبل المستخدم */}
          <div className="flex items-center gap-2 bg-secondary/50 p-1.5 rounded-xl border border-border/60">
            <span className="text-muted-foreground font-bold flex items-center gap-1 text-xs">
              <Palette className="h-3.5 w-3.5 text-accent" /> لون التظليل:
            </span>

            {/* منتقي الألوان الحر المباشر (Color Picker) */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex items-center">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => applyColorToSelectedBox(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border border-border bg-transparent p-0 overflow-hidden"
                  title="اختر أي لون تريده للتظليل"
                />
              </div>
              <span className="font-mono text-[11px] font-bold uppercase text-foreground/80 px-1">
                {customColor}
              </span>
            </div>

            {/* عينات ألوان سريعة */}
            <div className="hidden sm:flex items-center gap-1 border-r border-border/80 pr-1.5 mr-0.5">
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  onClick={() => applyColorToSelectedBox(swatch.hex)}
                  className="w-5 h-5 rounded-md transition-transform hover:scale-125 relative flex items-center justify-center border border-black/20"
                  style={{ backgroundColor: swatch.hex }}
                  title={swatch.name}
                >
                  {customColor.toLowerCase() === swatch.hex.toLowerCase() && (
                    <Check className="w-3 h-3 text-white stroke-[3]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* منزلق الشفافية */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-bold flex items-center gap-1">
              <Sliders className="h-3.5 w-3.5" /> الشفافية:
            </span>
            <input
              type="range"
              min="0.10"
              max="0.85"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-20 accent-accent cursor-pointer"
            />
            <span className="w-7 font-mono font-bold text-[11px]">
              {Math.round(opacity * 100)}%
            </span>
          </div>

          {/* تفعيل التوهج */}
          <button
            onClick={() => setGlowEnabled((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 transition-all ${
              glowEnabled ? "bg-accent/20 border-accent/40 text-accent" : "bg-secondary border-border text-muted-foreground"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>توهج مضيء</span>
          </button>

          {/* إظهار/إخفاء المربعات الدائمة */}
          <button
            onClick={() => setShowBoxes((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 transition-all ${
              showBoxes ? "bg-accent/20 border-accent/40 text-accent" : "bg-secondary border-border text-muted-foreground"
            }`}
            title={showBoxes ? "إخفاء مربعات التظليل الدائمة" : "إظهار مربعات التظليل الدائمة للتعديل"}
          >
            {showBoxes ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span>{showBoxes ? "المربعات ظاهرة" : "المربعات مخفية"}</span>
          </button>

          {/* نظام إنشاء المربعات: زر الرسم بالسحب + إضافة سريعة + حذف */}
          <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-xl">
            {/* وضع رسم مربع جديد بالسحب فوق الصفحة */}
            <button
              onClick={() => {
                setIsDrawMode((prev) => !prev);
                if (!isDrawMode) {
                  toast({
                    title: "✏️ وضع رسم المربع مفعل",
                    description: "انقر واسحب بالفأرة أو باللمس فوق أي آية على صورة المصحف لإنشاء مربع تظليل دقيق لها."
                  });
                }
              }}
              className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                isDrawMode
                  ? "bg-amber-500 text-black ring-2 ring-amber-400 animate-pulse"
                  : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/35 border border-amber-500/40"
              }`}
              title="انقر واسحب فوق صورة المصحف لإنشاء مربع تظليل جديد"
            >
              <Crosshair className="h-3.5 w-3.5" />
              <span>{isDrawMode ? "اسحب لرسم المربع..." : "رسم مربع بالسحب"}</span>
            </button>

            {/* إضافة سريعة للمربع */}
            <button
              onClick={addNewBox}
              className="px-2.5 py-1 rounded-lg bg-emerald-600/25 text-emerald-400 hover:bg-emerald-600/40 font-bold flex items-center gap-1 active:scale-95 transition-all"
              title="إضافة مربع آية سريع"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>مربع جديد</span>
            </button>

            {/* 🕌 مربع البسملة: برقم 0 خارج عدّ الآيات — لا ينزاح ترقيم الآيات */}
            <button
              onClick={createBismillahBox}
              className="px-2.5 py-1 rounded-lg bg-teal-600/25 text-teal-300 hover:bg-teal-600/40 font-bold flex items-center gap-1 active:scale-95 transition-all"
              title="إنشاء مربع البسملة (رقم 0 — خارج عدّ الآيات حتى يظل ترقيم الآيات صحيحاً)"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>بسملة</span>
            </button>

            {/* نسخ المربع للآية التالية */}
            <button
              onClick={duplicateSelectedBox}
              className="px-2.5 py-1 rounded-lg bg-sky-600/25 text-sky-300 hover:bg-sky-600/40 font-bold flex items-center gap-1 active:scale-95 transition-all"
              title="نسخ المربع للآية التالية"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>نسخ</span>
            </button>

            {/* حذف المربع */}
            <button
              onClick={deleteSelectedBox}
              className="px-2 py-1 rounded-lg bg-red-600/25 text-red-400 hover:bg-red-600/40 font-bold flex items-center gap-1 active:scale-95 transition-all"
              title="حذف المربع المحدد"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            {history.length > 0 && (
              <button
                onClick={undo}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                title="تراجع"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* التكبير والتصغير */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setScale((s) => clamp(s - 0.05, 0.25, 1.2))}
              className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground"
              title="تصغير الصورة"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono font-bold text-[11px] w-9 text-center text-muted-foreground">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => clamp(s + 0.05, 0.25, 1.2))}
              className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground"
              title="تكبير الصورة"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* منطقة العمل الرئيسية: صورة المصحف ومربعات التظليل */}
      <main className="flex-1 flex flex-col items-center justify-start p-3 sm:p-6 overflow-auto">
        {/* بطاقة معلومات السورة ومشغل التلاوة */}
        <div className="w-full max-w-4xl card-nour p-3 mb-4 flex items-center justify-between gap-3 flex-wrap shadow-soft">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md transition-all active:scale-95 ${
                isPlaying ? "bg-amber-600 shadow-amber-600/30" : "bg-emerald-600 shadow-emerald-600/30 hover:bg-emerald-500"
              }`}
              title={isPlaying ? "إيقاف مؤقت" : "استماع لتلاوة السورة"}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 mr-0.5" />}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base text-foreground">
                  سورة {currentSurah.name}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground font-bold">
                  {currentSurah.type} · {currentSurah.ayahCount} آيات
                </span>
                <span className="text-[11px] font-mono text-accent">
                  [{activePageSrc}]
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isDrawMode
                  ? "✏️ انقر واسحب مؤشر الفأرة على صورة المصحف لرسم مربع تظليل جديد"
                  : "اسحب مربع التظليل وضعه فوق الآية المراد تظليلها على صورة المصحف بدقة"}
              </p>
            </div>
          </div>

          {/* تبديل الآية المحددة وبياناتها */}
          {selectedBox && (
            <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-xl border border-border">
              <span className="text-xs text-muted-foreground font-bold">الآية المحددة:</span>
              <input
                type="number"
                min={1}
                max={currentSurah.ayahCount || 200}
                value={selectedBox.ayah}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 1;
                  setBoxes((list) =>
                    list.map((b, i) => (i === selectedIndex ? { ...b, ayah: val } : b))
                  );
                  markUnsaved();
                }}
                className="w-14 h-7 rounded-lg bg-background border border-border text-center font-bold text-sm focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-muted-foreground">
                الموضع: ({selectedBox.x}, {selectedBox.y})
              </span>
            </div>
          )}
        </div>

        {/* 🌟 لوحة صورة المصحف الشريف وعليها مربعات التظليل 🌟 */}
        <div className="relative flex justify-center items-start w-full overflow-auto pb-12">
          <div
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            className={`relative select-none shadow-2xl rounded-2xl overflow-hidden border-2 border-border/80 bg-stone-900 ${
              isDrawMode ? "cursor-crosshair ring-2 ring-amber-400/80" : ""
            }`}
            style={{
              width: PAGE_IMAGE_SIZE.width * scale,
              height: PAGE_IMAGE_SIZE.height * scale,
            }}
          >
            {/* صورة المصحف المعتمدة من السيرفر */}
            <img
              src={activeImageFinal}
              alt="صفحة المصحف من السيرفر"
              className="absolute inset-0 w-full h-full object-fill pointer-events-none"
              draggable={false}
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes(activePageSrc)) {
                  target.src = activePageSrc;
                }
              }}
            />

            {/* زر عائم لإظهار المربعات الدائمة عندما تكون مخفية (وضع المعاينة) */}
            {!showBoxes && (
              <button
                onClick={() => setShowBoxes(true)}
                className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-black/70 hover:bg-black/85 backdrop-blur-sm border border-white/20 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
                title="إظهار مربعات التظليل المحفوظة للتعديل"
              >
                <Eye className="h-4 w-4 text-amber-300" />
                <span>إظهار المربعات المحفوظة</span>
              </button>
            )}

            {/* مستطيل المعاينة أثناء رسم مربع جديد بالسحب */}
            {isDrawMode && drawStart && drawCurrent && (
              <div
                className="absolute border-2 border-dashed rounded-lg pointer-events-none z-30"
                style={{
                  left: Math.min(drawStart.x, drawCurrent.x) * scale,
                  top: Math.min(drawStart.y, drawCurrent.y) * scale,
                  width: Math.abs(drawCurrent.x - drawStart.x) * scale,
                  height: Math.abs(drawCurrent.y - drawStart.y) * scale,
                  backgroundColor: hexToRgba(customColor, 0.35),
                  borderColor: customColor,
                  boxShadow: `0 0 15px ${hexToRgba(customColor, 0.7)}`
                }}
              >
                <span className="absolute -top-6 right-0 px-2 py-0.5 rounded bg-black/85 text-amber-300 text-[10px] font-bold shadow">
                  جاري رسم مربع تظليل...
                </span>
              </div>
            )}

            {/* 🌟 المربع المؤقت الذي يظهر فوق السورة عند اختيارها أو اختبارها ثم يذهب 🌟 */}
            {tempSurahHighlight && (
              <div
                key={tempSurahHighlight.id}
                className="absolute z-40 rounded-xl border-4 pointer-events-none transition-all duration-700 animate-pulse"
                style={{
                  left: tempSurahHighlight.x * scale,
                  top: tempSurahHighlight.y * scale,
                  width: tempSurahHighlight.width * scale,
                  height: tempSurahHighlight.height * scale,
                  borderColor: customColor,
                  backgroundColor: hexToRgba(customColor, 0.45),
                  boxShadow: `0 0 35px ${customColor}, inset 0 0 25px ${customColor}`,
                }}
              >
                <div className="absolute -top-8 right-1/2 translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-xs shadow-xl flex items-center gap-1.5 whitespace-nowrap border border-white/50">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>{tempSurahHighlight.text} (تحديد نشط)</span>
                </div>
              </div>
            )}

            {/* عرض كافة مربعات التظليل على صورة المصحف — تُخفى في وضع المعاينة (اختيار سورة من القائمة) */}
            {showBoxes && boxes.map((box, index) => {
              const isSelected = index === selectedIndex;
              const boxColorHex = box.color || customColor;
              const boxBg = isSelected
                ? hexToRgba(boxColorHex, opacity)
                : "rgba(148, 163, 184, 0.22)";
              const boxBorder = isSelected
                ? hexToRgba(boxColorHex, 0.95)
                : "rgba(148, 163, 184, 0.65)";

              return (
                <div
                  key={`box-${box.surah}-${box.ayah}-${index}`}
                  onPointerDown={(e) => handlePointerDownDrag(e, index)}
                  style={{
                    left: box.x * scale,
                    top: box.y * scale,
                    width: box.width * scale,
                    height: box.height * scale,
                    backgroundColor: boxBg,
                    borderColor: boxBorder,
                    boxShadow: isSelected && glowEnabled
                      ? `0 0 20px ${hexToRgba(boxColorHex, 0.5)}, inset 0 0 10px ${hexToRgba(boxColorHex, 0.3)}`
                      : "none",
                  }}
                  className={`absolute z-20 rounded-lg border-2 cursor-move touch-none select-none transition-shadow ${
                    isSelected ? "border-solid ring-1 ring-white/50" : "border-dashed opacity-85 hover:opacity-100"
                  }`}
                >
                  {/* شارة رقم الآية على المربع */}
                  <span
                    style={{ backgroundColor: isSelected ? boxColorHex : "rgba(0, 0, 0, 0.8)" }}
                    className="absolute -top-3.5 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-md flex items-center gap-1"
                  >
                    <span>{box.ayah === 0 ? "🕌 بسملة" : `آية ${box.ayah}`}</span>
                  </span>

                  {/* مقابض التحجيم للمربع النشط فقط */}
                  {isSelected && !isDrawMode && (
                    <>
                      {/* مقبض الزاوية السفلية اليمنى (SE) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize("se", e)}
                        className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-accent rounded-full cursor-se-resize shadow-md touch-none hover:scale-125 transition-transform"
                        title="تغيير الأبعاد"
                      />
                      {/* مقبض الزاوية السفلية اليسرى (SW) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize("sw", e)}
                        className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-accent rounded-full cursor-sw-resize shadow-md touch-none hover:scale-125 transition-transform"
                        title="تغيير الأبعاد"
                      />
                      {/* مقبض الزاوية العلوية اليمنى (NE) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize("ne", e)}
                        className="absolute -top-2 -right-2 w-3.5 h-3.5 bg-white border-2 border-accent rounded-full cursor-ne-resize shadow-md touch-none hover:scale-125 transition-transform"
                      />
                      {/* مقبض الزاوية العلوية اليسرى (NW) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize("nw", e)}
                        className="absolute -top-2 -left-2 w-3.5 h-3.5 bg-white border-2 border-accent rounded-full cursor-nw-resize shadow-md touch-none hover:scale-125 transition-transform"
                      />
                      {/* مقبض اليمين (E) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize("e", e)}
                        className="absolute top-1/2 -right-2 -translate-y-1/2 w-3 h-5 bg-white border-2 border-accent rounded-md cursor-e-resize shadow-md touch-none"
                      />
                      {/* مقبض اليسار (W) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize("w", e)}
                        className="absolute top-1/2 -left-2 -translate-y-1/2 w-3 h-5 bg-white border-2 border-accent rounded-md cursor-w-resize shadow-md touch-none"
                      />
                      {/* مقبض الأسفل (S) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize("s", e)}
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-3 bg-white border-2 border-accent rounded-md cursor-s-resize shadow-md touch-none"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* إرشادات سريعة في الأسفل */}
        <div className="w-full max-w-xl card-nour p-3.5 mt-4 text-xs text-muted-foreground text-center space-y-1 shadow-soft">
          <p className="font-bold text-foreground">💡 نظام التظليل المتقدم:</p>
          <p>١. اختر لون التظليل الذي يناسبك من منتقي الألوان أو العينات السريعة.</p>
          <p>٢. اضغط <b className="text-amber-400">رسم مربع بالسحب</b> واسحب مباشرة فوق أي موضع بالصفحة لإنشاء مربع تظليل دقيق فوراً.</p>
          <p>٣. اضغط <b className="text-purple-400">قائمة السور</b> أو <b className="text-purple-400">اختبار السورة</b> ليظهر المربع المضيء فوق السورة ثم يختفي تلقائياً.</p>
          <p>٤. اضغط <b className="text-emerald-500">حفظ في السيرفر</b> لحفظ التعديلات في السيرفر المحلي ومزامنتها بنجاح.</p>
        </div>
      </main>

      {/* 🌟 نافذة منبثقة: قائمة السور بنظام المربعات والبطاقات 🌟 */}
      {showSurahsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* رأس النافذة */}
            <div className="p-4 border-b border-border/80 flex items-center justify-between bg-card/90">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-extrabold text-base text-foreground">
                    قائمة سور القرآن الكريم (114 سورة)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    اختر السورة ليظهر مربع التحديد المضيء فوقها في صفحة المصحف ثم يختفي
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSurahsModal(false)}
                className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* مربع البحث */}
            <div className="p-3 border-b border-border/60 bg-secondary/30 flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground mr-1" />
              <input
                type="text"
                placeholder="ابحث عن اسم السورة أو رقمها..."
                value={surahSearchQuery}
                onChange={(e) => setSurahSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm font-bold focus:outline-none placeholder:text-muted-foreground/70"
                autoFocus
              />
              {surahSearchQuery && (
                <button
                  onClick={() => setSurahSearchQuery("")}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  مسح
                </button>
              )}
            </div>

            {/* شبكة بطاقات السور (نظام المربعات) */}
            <div className="p-4 overflow-y-auto flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {filteredSurahs.map((surah) => {
                const isCurrent = surah.number === selectedSurahNum;
                return (
                  <button
                    key={surah.number}
                    onClick={() => {
                      selectSurah(surah.number, true);
                      setShowSurahsModal(false);
                      toast({
                        title: `📖 تم اختيار سورة ${surah.name}`,
                        description: "ظهر مربع التظليل فوق السورة وسيختفي تلقائياً."
                      });
                    }}
                    className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between gap-1.5 active:scale-95 group relative ${
                      isCurrent
                        ? "bg-amber-500/20 border-amber-500/60 ring-2 ring-amber-400"
                        : "bg-secondary/40 border-border/80 hover:bg-secondary hover:border-amber-500/40"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center font-mono">
                        {surah.number}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 text-muted-foreground font-medium">
                        {surah.type}
                      </span>
                    </div>

                    <div className="font-extrabold text-sm text-foreground group-hover:text-amber-400 transition-colors">
                      سورة {surah.name}
                    </div>

                    <div className="text-[11px] text-muted-foreground flex items-center justify-between w-full">
                      <span>{surah.ayahCount} آيات</span>
                      <div className="flex items-center gap-1">
                        {surahBoxCounts[surah.number] ? (
                          <span
                            className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded"
                            title="عدد مربعات الآيات المحفوظة في السيرفر (بلا بسملة)"
                          >
                            {surahBoxCounts[surah.number]} آية
                          </span>
                        ) : null}
                        {surahBismillahFlags[surah.number] && (
                          <span
                            className="text-[10px] font-bold text-teal-300 bg-teal-500/15 px-1.5 py-0.5 rounded"
                            title="لهذه السورة مربع بسملة محفوظ (خارج عدّ الآيات)"
                          >
                            🕌 بسملة
                          </span>
                        )}
                        {getSurahRegistryEntry(surah.number) && (
                          <span
                            className="text-[10px] font-bold text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded"
                            title="هذه السورة معرّفة في السجل المركزي بالسيرفر"
                          >
                            ✓ معرّفة
                          </span>
                        )}
                      </div>
                    </div>

                    {isCurrent && (
                      <div className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-amber-500 text-black flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* تذييل النافذة */}
            <div className="p-3 border-t border-border/80 bg-card flex items-center justify-between text-xs text-muted-foreground">
              <span>عدد السور المعروضة: {filteredSurahs.length}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowSurahsModal(false);
                    openDefineSurah();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-violet-600/25 hover:bg-violet-600/35 border border-violet-500/40 text-violet-300 font-bold transition-all"
                  title="تعريف السورة الحالية: رقم + اسم + عدد آيات + صفحة"
                >
                  ✨ تعريف سورة
                </button>
                <button
                  onClick={() => setShowSurahsModal(false)}
                  className="px-4 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-foreground transition-all"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
