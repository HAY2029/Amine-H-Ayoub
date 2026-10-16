import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Play, Pause, RotateCcw, Save, Trash2, Sparkles,
  Volume2, VolumeX, Eye, EyeOff, ZoomIn, ZoomOut, Check, ChevronLeft,
  ChevronRight, Scissors, Upload, Download, RefreshCw, Zap, CheckCircle2,
  Clock, FastForward, Rewind, Layers, Sliders, Music, FileAudio, Bookmark,
  SlidersHorizontal, Radio, Sun, Moon
} from "lucide-react";
import { getAllSurahs, getSurahByNumber, SurahInfo } from "@/data/quranData";
import { getSurahAudioUrl } from "@/data/audioUrls";
import {
  getPageAyahBoxes, savePageAyahBoxes, AyahBox, getAllPageSources,
  PAGE_IMAGE_SIZE, getSavedAyahCoordinates
} from "@/data/ayahCoordinates";
import { getSurahTimings, saveSurahTimings, AudioSegment } from "@/data/ayahTimings";
import { getCustomPages } from "@/data/customPages";
import { toast } from "@/hooks/use-toast";
import AppNav from "@/components/AppNav";

// مساعدة لتنسيق الوقت بصيغة الدقائق والثواني والأجزاء: 00:00.00
const formatTimestamp = (sec: number | undefined): string => {
  if (sec === undefined || isNaN(sec) || !isFinite(sec) || sec < 0) return "--:--.--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
};

export default function AudioShadingSyncPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSurah = Number(searchParams.get("surah")) || 1;

  const surahsList = useMemo(() => getAllSurahs(), []);
  const [selectedSurahNum, setSelectedSurahNum] = useState<number>(initialSurah);
  const selectedSurah = useMemo(() => getSurahByNumber(selectedSurahNum), [selectedSurahNum]);

  // مصدر الصوت: إما سحابة التطبيق (افتراضي وموصى به) أو ملف مخصص يرفعه المستخدم
  const [audioSourceType, setAudioSourceType] = useState<"app" | "custom">("app");
  const [customAudioFile, setCustomAudioFile] = useState<File | null>(null);
  const [customAudioUrl, setCustomAudioUrl] = useState<string>("");

  // مشغل الصوت الرئيسي
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);

  // صفحات ومربعات التظليل الخاصة بالسورة
  const [allPages, setAllPages] = useState<string[]>([]);
  const [activePageSrc, setActivePageSrc] = useState<string>("/pages/0.jpg");
  const [pageBoxes, setPageBoxes] = useState<AyahBox[]>([]);
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number>(0);
  const [previewNightMode, setPreviewNightMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // مقياس معاينة صفحة المصحف
  const [scale, setScale] = useState(0.42);

  // جلب كافة مصادر الصفحات المتوفرة
  useEffect(() => {
    try {
      // جلب صفحات مجلد "صفحة قران"
      fetch("/api/quran-pages")
        .then(r => r.ok ? r.json() : [])
        .then((folderPages: string[]) => {
          const codePages = [...getAllPageSources(), ...folderPages].map(s => (s.includes("fatiha") || s.includes("0.jpg")) ? "/pages/0.jpg" : s);
          const custom = getCustomPages().map((p) => p.src);
          const combined = Array.from(new Set([...codePages, ...custom])).sort((a, b) => {
            const getNum = (s: string) => {
              if (s.includes("0.jpg") || s.includes("fatiha")) return 0;
              if (s.startsWith("custom:")) return 999999;
              const m = s.match(/\d+/);
              return m ? parseInt(m[0], 10) : 999998;
            };
            return getNum(a) - getNum(b);
          });
          setAllPages(combined);
        })
        .catch(() => {});

      const codePages = getAllPageSources().map(s => (s.includes("fatiha") || s.includes("0.jpg")) ? "/pages/0.jpg" : s);
      const custom = getCustomPages().map((p) => p.src);
      const combined = Array.from(new Set([...codePages, ...custom])).sort((a, b) => {
        const getNum = (s: string) => {
          if (s.includes("0.jpg") || s.includes("fatiha")) return 0;
          if (s.startsWith("custom:")) return 999999;
          const m = s.match(/\d+/);
          return m ? parseInt(m[0], 10) : 999998;
        };
        return getNum(a) - getNum(b);
      });
      setAllPages(combined);

      // البحث عن أول صفحة تحتوي السورة المحددة
      const saved = getSavedAyahCoordinates();
      let foundPage = combined[0] || "/pages/0.jpg";
      for (const p of combined) {
        const boxes = saved[p] || getPageAyahBoxes(p);
        if (boxes.some((b) => b.surah === selectedSurahNum)) {
          foundPage = p;
          break;
        }
      }
      setActivePageSrc(foundPage);
      const initialBoxes = saved[foundPage] || getPageAyahBoxes(foundPage);
      setPageBoxes(initialBoxes);
    } catch {
      setActivePageSrc("/pages/0.jpg");
      setPageBoxes(getPageAyahBoxes("/pages/0.jpg"));
    }
  }, [selectedSurahNum]);

  // تحديث مربعات الصفحة عند تبديل الصفحة
  const handlePageChange = (src: string) => {
    setActivePageSrc(src);
    const boxes = getPageAyahBoxes(src);
    setPageBoxes(boxes);
    const firstMatch = boxes.findIndex((b) => b.surah === selectedSurahNum);
    setSelectedBoxIndex(firstMatch >= 0 ? firstMatch : 0);
  };

  // رابط الصوت الفعال
  const activeAudioUrl = useMemo(() => {
    if (audioSourceType === "custom" && customAudioUrl) {
      return customAudioUrl;
    }
    return getSurahAudioUrl(selectedSurahNum);
  }, [audioSourceType, customAudioUrl, selectedSurahNum]);

  // معالجة رفع ملف صوتي مخصص
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (customAudioUrl) {
      URL.revokeObjectURL(customAudioUrl);
    }
    const url = URL.createObjectURL(f);
    setCustomAudioFile(f);
    setCustomAudioUrl(url);
    setAudioSourceType("custom");
    toast({ title: "📁 تم تحميل الملف الصوتي", description: `${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB)` });
  };

  // المربعات التابعة للسورة المحددة في الصفحة الحالية
  const surahBoxes = useMemo(() => {
    return pageBoxes
      .map((box, idx) => ({ box, originalIndex: idx }))
      .filter(({ box }) => box.surah === selectedSurahNum);
  }, [pageBoxes, selectedSurahNum]);

  const selectedBox = pageBoxes[selectedBoxIndex] || null;

  // إحصائيات الربط
  const syncStats = useMemo(() => {
    const total = surahBoxes.length;
    const synced = surahBoxes.filter(({ box }) => box.audioStart !== undefined && box.audioEnd !== undefined).length;
    return { total, synced, remaining: total - synced, percent: total > 0 ? Math.round((synced / total) * 100) : 0 };
  }, [surahBoxes]);

  // التحكم في تشغيل الصوت
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const seek = (time: number) => {
    if (!audioRef.current) return;
    const clamped = Math.max(0, Math.min(duration || 9999, time));
    audioRef.current.currentTime = clamped;
    setCurrentTime(clamped);
  };

  // تحديث وقت المربع المحدد
  const updateBoxTiming = (index: number, start?: number, end?: number) => {
    setPageBoxes((prev) => {
      const copy = [...prev];
      if (!copy[index]) return prev;
      copy[index] = {
        ...copy[index],
        audioStart: start !== undefined ? Number(start.toFixed(2)) : copy[index].audioStart,
        audioEnd: end !== undefined ? Number(end.toFixed(2)) : copy[index].audioEnd,
      };
      return copy;
    });
  };

  // تسجيل بداية التوقيت للمربع الحالي عند اللحظة الحالية في الصوت
  const stampCurrentBoxStart = () => {
    if (!selectedBox) return;
    const stampTime = Number(currentTime.toFixed(2));
    updateBoxTiming(selectedBoxIndex, stampTime, selectedBox.audioEnd);
    toast({
      title: "📍 تم تسجيل البداية",
      description: `${selectedBox.label || `الآية ${selectedBox.ayah}`} بدأت عند ${formatTimestamp(stampTime)}`,
    });
  };

  // تسجيل نهاية التوقيت للمربع الحالي
  const stampCurrentBoxEnd = () => {
    if (!selectedBox) return;
    const stampTime = Number(currentTime.toFixed(2));
    updateBoxTiming(selectedBoxIndex, selectedBox.audioStart, stampTime);
    toast({
      title: "⏹️ تم تسجيل النهاية",
      description: `${selectedBox.label || `الآية ${selectedBox.ayah}`} انتهت عند ${formatTimestamp(stampTime)}`,
    });

    // الانتقال التلقائي للمربع التالي إن وجد
    const currentPos = surahBoxes.findIndex((sb) => sb.originalIndex === selectedBoxIndex);
    if (currentPos >= 0 && currentPos < surahBoxes.length - 1) {
      const nextIndex = surahBoxes[currentPos + 1].originalIndex;
      setSelectedBoxIndex(nextIndex);
    }
  };

  // تشغيل مقطع المربع فقط للتأكد من دقته
  const playBoxAudio = (box: AyahBox) => {
    if (!audioRef.current) return;
    const start = box.audioStart ?? 0;
    const end = box.audioEnd;
    audioRef.current.currentTime = start;
    setCurrentTime(start);
    audioRef.current.play().then(() => {
      setIsPlaying(true);
      if (end !== undefined && end > start) {
        const checkEnd = () => {
          if (!audioRef.current) return;
          if (audioRef.current.currentTime >= end) {
            audioRef.current.pause();
            setIsPlaying(false);
            audioRef.current.removeEventListener("timeupdate", checkEnd);
          }
        };
        audioRef.current.addEventListener("timeupdate", checkEnd);
      }
    }).catch(() => {});
  };

  // حفظ التوقيتات والمربعات في السيرفر والمشروع
  const handleSaveSync = async () => {
    setIsSaving(true);
    try {
      // 1. حفظ المربعات المحدثة لصفحة المصحف الحالية
      await savePageAyahBoxes(activePageSrc, pageBoxes);

      // 2. تجميع التوقيتات وحفظها في بنية توقيتات السورة
      const sortedBoxes = [...surahBoxes].sort((a, b) => a.box.ayah - b.box.ayah);
      const teacherTimes: number[] = [];
      const segments: AudioSegment[] = [];

      sortedBoxes.forEach(({ box }) => {
        if (box.audioStart !== undefined) {
          teacherTimes.push(box.audioStart);
          segments.push({
            id: `seg_${box.surah}_${box.ayah}_${Date.now()}`,
            start: box.audioStart,
            end: box.audioEnd ?? (box.audioStart + 3),
            speaker: "teacher",
            ayah: box.ayah,
            label: box.label || (box.ayah === 0 ? "البسملة" : `آية ${box.ayah}`),
          });
        }
      });

      if (teacherTimes.length > 0) {
        await saveSurahTimings(selectedSurahNum, {
          teacher: teacherTimes,
          segments,
        });
      }

      toast({
        title: "✅ تم حفظ التوقيت والربط بنجاح!",
        description: `تم حفظ ${syncStats.synced} توقيت لمربعات سورة ${selectedSurah?.name || selectedSurahNum} في ملفات المشروع والسيرفر.`,
      });
    } catch (e) {
      toast({
        title: "❌ فشل الحفظ",
        description: e instanceof Error ? e.message : "حدث خطأ أثناء حفظ التوقيتات",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // اختصارات لوحة المفاتيح
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // تجنب تفعيل الاختصارات داخل حقول الإدخال
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "b" || e.key === "B" || e.key === "لا") {
        // مفتاح البداية
        e.preventDefault();
        stampCurrentBoxStart();
      } else if (e.key === "e" || e.key === "E" || e.key === "ث") {
        // مفتاح النهاية
        e.preventDefault();
        stampCurrentBoxEnd();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(currentTime - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(currentTime + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-stone-200 font-sans select-none flex flex-col" dir="rtl">
      <AppNav />

      {/* عنصر الصوت الخفي */}
      <audio
        ref={audioRef}
        src={activeAudioUrl}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* شريط الرأس الفاخر */}
      <header className="border-b border-white/10 bg-black/60 backdrop-blur-md px-4 py-3 sticky top-0 z-40 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/surah-shading")}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 border border-white/5 transition-all flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowRight className="w-4 h-4" />
            <span>لوحة التظليل</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                <span>استوديو ربط التظليل بموقع الصوت</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                  Sync Studio
                </span>
              </h1>
              <p className="text-[11px] text-stone-400">
                اربط كل مربع تظليل بتوقيت بدايته ونهايته في التلاوة الصوتية بسلاسة
              </p>
            </div>
          </div>
        </div>

        {/* أزرار الحفظ والإجراءات السريعة */}
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>{syncStats.synced} من {syncStats.total} مربعات مربوطة ({syncStats.percent}%)</span>
          </div>

          <button
            onClick={handleSaveSync}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-amber-500/25 active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? "جاري الحفظ..." : "حفظ التوقيتات والمربعات"}</span>
          </button>
        </div>
      </header>

      {/* المحتوى الرئيسي: عمودان (المشغل وأدوات الوسم باليمين + معاينة المصحف باليسار) */}
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-[1700px] mx-auto w-full">
        
        {/* العمود الأيمن (لوحة التحكم، إعدادات الصوت، وأزرار الوسم) */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          
          {/* كارت اختيار السورة ومصدر الصوت */}
          <div className="bg-stone-900/80 border border-white/10 rounded-2xl p-4 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Sliders className="w-4 h-4" />
                <span>إعدادات السورة ومصدر الصوت:</span>
              </span>
              <span className="text-[11px] text-stone-400">
                الصفحة الحالية: <span className="font-mono text-white">{activePageSrc}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* اختيار السورة */}
              <div>
                <label className="block text-[11px] text-stone-400 mb-1 font-bold">اختر السورة:</label>
                <select
                  value={selectedSurahNum}
                  onChange={(e) => setSelectedSurahNum(Number(e.target.value))}
                  className="w-full bg-stone-950 border border-white/15 focus:border-amber-400 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                >
                  {surahsList.map((s) => (
                    <option key={s.number} value={s.number}>
                      {s.number}. سورة {s.name} ({s.ayahCount} آيات)
                    </option>
                  ))}
                </select>
              </div>

              {/* اختيار الصفحة */}
              <div>
                <label className="block text-[11px] text-stone-400 mb-1 font-bold">صفحة المصحف:</label>
                <select
                  value={activePageSrc}
                  onChange={(e) => handlePageChange(e.target.value)}
                  className="w-full bg-stone-950 border border-white/15 focus:border-amber-400 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                >
                  {allPages.map((src) => {
                    const label = (src.includes("0.jpg") || src.includes("fatiha"))
                      ? "📖 الفاتحة (صفحة 0)"
                      : src.startsWith("custom:")
                        ? `🖼️ صفحة مخصصة: ${src.replace("custom:", "")}`
                        : `📄 صفحة ${src.replace("/pages/", "").replace(".jpg", "")}`;
                    return (
                      <option key={src} value={src}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* مصدر الصوت */}
              <div>
                <label className="block text-[11px] text-stone-400 mb-1 font-bold">مصدر الصوت:</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setAudioSourceType("app")}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                      audioSourceType === "app"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow"
                        : "bg-white/5 border-white/10 text-stone-400 hover:text-white"
                    }`}
                  >
                    صوت التطبيق 🌐
                  </button>
                  <label
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border text-center cursor-pointer transition-all ${
                      audioSourceType === "custom"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow"
                        : "bg-white/5 border-white/10 text-stone-400 hover:text-white"
                    }`}
                  >
                    رفع ملف 📁
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* نصيحة ذهبية لتوضيح اقتراح المستخدم بخصوص المقطع المقسم */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs leading-relaxed text-amber-200/90 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300">💡 نصيحة واقتراح احترافي: </span>
                <span>
                  <strong>لا داعي لتقطيع الصوت لملفات منفصلة!</strong> الأفضل والأنقى دائماً هو استخدام ملف تلاوة كامل للسورة وتحديد وقت البداية والنهاية لكل آية هنا بنقرة زر واحدة. هذا يضمن تلاوة متصلة وعذبة بدون أي تقطيع بين الآيات.
                </span>
              </div>
            </div>
          </div>

          {/* مشغل الصوت والمسطرة الزمنية التفاعلية */}
          <div className="bg-stone-900/80 border border-white/10 rounded-2xl p-4 shadow-xl space-y-4">
            
            {/* رأس المشغل والوقت */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-amber-400 animate-pulse" />
                <span className="text-sm font-bold text-white">
                  {selectedSurah?.name || `سورة ${selectedSurahNum}`}
                </span>
                <span className="text-[11px] font-mono text-stone-400 bg-black/40 px-2 py-0.5 rounded-lg border border-white/5">
                  سرعة التشغيل: {playbackRate}x
                </span>
              </div>

              {/* عداد التوقيت الدقيق */}
              <div className="flex items-center gap-1 font-mono text-base sm:text-lg font-bold text-amber-300 bg-black/50 px-3 py-1 rounded-xl border border-amber-500/20 shadow-inner">
                <span>{formatTimestamp(currentTime)}</span>
                <span className="text-stone-500 text-xs">/ {formatTimestamp(duration)}</span>
              </div>
            </div>

            {/* شريط المسطرة الزمنية التفاعلي */}
            <div className="space-y-1.5">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.05"
                value={currentTime}
                onChange={(e) => seek(parseFloat(e.target.value))}
                className="w-full h-2.5 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[10px] font-mono text-stone-500 px-1">
                <span>00:00.00</span>
                <span>{formatTimestamp(duration / 2)}</span>
                <span>{formatTimestamp(duration)}</span>
              </div>
            </div>

            {/* أزرار المشغل السريع */}
            <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
              <button
                onClick={() => seek(currentTime - 5)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 border border-white/5 text-xs font-bold transition-all"
                title="تراجع 5 ثوانٍ"
              >
                -5s
              </button>
              <button
                onClick={() => seek(currentTime - 1)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 border border-white/5 text-xs font-bold transition-all"
                title="تراجع 1 ثانية"
              >
                -1s
              </button>
              <button
                onClick={() => seek(currentTime - 0.2)}
                className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 border border-white/5 text-[11px] font-mono transition-all"
                title="تراجع 0.2 ثانية (دقيق)"
              >
                -0.2s
              </button>

              {/* زر التشغيل والإيقاف الكبير */}
              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center font-bold shadow-xl shadow-amber-500/25 transition-all active:scale-95"
                title="تشغيل / إيقاف (مسافة Space)"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
              </button>

              <button
                onClick={() => seek(currentTime + 0.2)}
                className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 border border-white/5 text-[11px] font-mono transition-all"
                title="تقديم 0.2 ثانية (دقيق)"
              >
                +0.2s
              </button>
              <button
                onClick={() => seek(currentTime + 1)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 border border-white/5 text-xs font-bold transition-all"
                title="تقديم 1 ثانية"
              >
                +1s
              </button>
              <button
                onClick={() => seek(currentTime + 5)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 border border-white/5 text-xs font-bold transition-all"
                title="تقديم 5 ثوانٍ"
              >
                +5s
              </button>
            </div>

            {/* أزرار الوسم السريعة بنقرة واحدة (One-Tap Live Stamping) */}
            <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={stampCurrentBoxStart}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 active:scale-95 transition-all"
                title="تسجيل توقيت البداية للمربع المحدد عند الثانية الحالية (مفتاح B)"
              >
                <span>📍 وسم بداية المربع هنا</span>
                <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded font-mono">B</span>
              </button>

              <button
                onClick={stampCurrentBoxEnd}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30 active:scale-95 transition-all"
                title="تسجيل توقيت النهاية والانتقال للمربع التالي (مفتاح E)"
              >
                <span>⏹️ وسم نهاية المربع والانتقال للتالي</span>
                <span className="text-[10px] bg-black/30 text-white px-2 py-0.5 rounded font-mono">E</span>
              </button>
            </div>
          </div>

          {/* جدول مربعات التظليل وتوقيتاتها الخاصة بالسورة */}
          <div className="bg-stone-900/80 border border-white/10 rounded-2xl p-4 shadow-xl space-y-3 flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>مربعات تظليل السورة الحالية ({surahBoxes.length} مربع):</span>
              </span>
              <span className="text-[10px] text-stone-400 font-mono">
                اضغط على المربع لتحديده وتعديل توقيته
              </span>
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[380px] pr-1 flex-1">
              {surahBoxes.length === 0 ? (
                <div className="text-center py-8 text-stone-500 text-xs border border-dashed border-white/10 rounded-xl">
                  لا توجد مربعات تظليل معرفة لهذه السورة في الصفحة الحالية.
                  <br />
                  <Link to={`/surah-shading?surah=${selectedSurahNum}`} className="text-amber-400 hover:underline mt-2 inline-block font-bold">
                    انقر هنا لفتح لوحة التظليل ورسم المربعات أولاً
                  </Link>
                </div>
              ) : (
                surahBoxes.map(({ box, originalIndex }) => {
                  const isSelected = originalIndex === selectedBoxIndex;
                  const isSynced = box.audioStart !== undefined && box.audioEnd !== undefined;
                  const isCurrentlyPlaying = isPlaying && (
                    box.audioStart !== undefined &&
                    box.audioEnd !== undefined &&
                    currentTime >= box.audioStart &&
                    currentTime <= box.audioEnd
                  );

                  return (
                    <div
                      key={`sync-row-${box.surah}-${box.ayah}-${originalIndex}`}
                      onClick={() => setSelectedBoxIndex(originalIndex)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-amber-500/15 border-amber-400 shadow-lg ring-1 ring-amber-400/40"
                          : isCurrentlyPlaying
                          ? "bg-emerald-500/20 border-emerald-400 shadow-md ring-1 ring-emerald-400"
                          : isSynced
                          ? "bg-white/5 border-white/10 hover:bg-white/10"
                          : "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                      }`}
                    >
                      {/* معلومات المربع */}
                      <div className="flex items-center gap-2.5 min-w-[140px]">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSynced ? "bg-emerald-400" : "bg-amber-500/60"}`} />
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>{box.label || (box.ayah === 0 ? "🕌 بسملة" : `الآية ${box.ayah}`)}</span>
                            {isCurrentlyPlaying && (
                              <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
                            )}
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono">
                            {Math.round(box.x)}×{Math.round(box.y)} · {Math.round(box.width)}×{Math.round(box.height)}
                          </div>
                        </div>
                      </div>

                      {/* حقول التوقيت اليدوي */}
                      <div className="flex items-center gap-2 text-xs font-mono" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-lg border border-white/5">
                          <span className="text-[10px] text-stone-400">البداية:</span>
                          <input
                            type="number"
                            step="0.05"
                            value={box.audioStart ?? ""}
                            placeholder="00.00"
                            onChange={(e) => updateBoxTiming(originalIndex, parseFloat(e.target.value) || 0, box.audioEnd)}
                            className="w-16 bg-transparent text-amber-300 font-bold outline-none text-left"
                          />
                        </div>

                        <span className="text-stone-600">→</span>

                        <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-lg border border-white/5">
                          <span className="text-[10px] text-stone-400">النهاية:</span>
                          <input
                            type="number"
                            step="0.05"
                            value={box.audioEnd ?? ""}
                            placeholder="00.00"
                            onChange={(e) => updateBoxTiming(originalIndex, box.audioStart, parseFloat(e.target.value) || 0)}
                            className="w-16 bg-transparent text-amber-300 font-bold outline-none text-left"
                          />
                        </div>
                      </div>

                      {/* أزرار العمليات للمربع */}
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => playBoxAudio(box)}
                          className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-all text-xs"
                          title="استمع لهذا المربع فقط"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => updateBoxTiming(originalIndex, undefined, undefined)}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-xs"
                          title="مسح توقيت هذا المربع"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* العمود الأيسر (معاينة حية لصفحة المصحف ومربعات التظليل أثناء النطق) */}
        <section className="lg:col-span-5 flex flex-col gap-3">
          <div className="bg-stone-900/80 border border-white/10 rounded-2xl p-3 shadow-xl flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Eye className="w-4 h-4" />
              <span>معاينة حية للمصحف مع الصوت:</span>
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewNightMode((v) => !v)}
                className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all ${
                  previewNightMode ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300" : "bg-white/5 border-white/10 text-stone-400"
                }`}
                title="معاينة الوضع الليلي"
              >
                {previewNightMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => setScale((s) => Math.min(0.9, s + 0.05))}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 flex items-center justify-center text-xs"
                title="تكبير"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setScale((s) => Math.max(0.25, s - 0.05))}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 flex items-center justify-center text-xs"
                title="تصغير"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* لوحة الكانفاس الحاملة لصفحة المصحف */}
          <div className="flex-1 bg-stone-950/90 border border-white/10 rounded-2xl p-4 flex items-center justify-center overflow-auto shadow-2xl min-h-[500px]">
            <div
              className="relative shadow-2xl rounded-xl overflow-hidden ring-1 ring-white/10"
              style={{
                width: PAGE_IMAGE_SIZE.width * scale,
                height: PAGE_IMAGE_SIZE.height * scale,
              }}
            >
              {/* صورة صفحة المصحف */}
              <img
                src={activePageSrc}
                alt="صفحة المصحف"
                className="absolute inset-0 w-full h-full object-fill pointer-events-none transition-all duration-300"
                style={{
                  filter: previewNightMode
                    ? "invert(0.92) hue-rotate(180deg) brightness(0.88) contrast(1.15)"
                    : "none",
                }}
                draggable={false}
              />

              {/* مربعات التظليل على الصفحة */}
              {pageBoxes.map((box, idx) => {
                const isSelected = idx === selectedBoxIndex;
                const isBoxActiveWithAudio = isPlaying && (
                  box.audioStart !== undefined &&
                  box.audioEnd !== undefined &&
                  currentTime >= box.audioStart &&
                  currentTime <= box.audioEnd
                );

                return (
                  <div
                    key={`canvas-box-${box.surah}-${box.ayah}-${idx}`}
                    onClick={() => {
                      setSelectedBoxIndex(idx);
                      playBoxAudio(box);
                    }}
                    style={{
                      left: box.x * scale,
                      top: box.y * scale,
                      width: box.width * scale,
                      height: box.height * scale,
                      backgroundColor: isBoxActiveWithAudio
                        ? "rgba(245, 158, 11, 0.55)"
                        : isSelected
                        ? "rgba(245, 158, 11, 0.35)"
                        : "rgba(245, 158, 11, 0.15)",
                      borderColor: isBoxActiveWithAudio
                        ? "#f59e0b"
                        : isSelected
                        ? "#ffffff"
                        : "rgba(245, 158, 11, 0.5)",
                      boxShadow: isBoxActiveWithAudio
                        ? "0 0 30px rgba(245, 158, 11, 0.9), inset 0 0 15px rgba(245, 158, 11, 0.5)"
                        : isSelected
                        ? "0 0 20px rgba(255, 255, 255, 0.5)"
                        : "none",
                    }}
                    className={`absolute z-20 rounded-lg border-2 cursor-pointer transition-all ${
                      isBoxActiveWithAudio
                        ? "ring-4 ring-amber-400 scale-[1.02] animate-pulse"
                        : isSelected
                        ? "ring-2 ring-white"
                        : "hover:border-white"
                    }`}
                  >
                    {/* شارة رقم الآية / اسم المربع */}
                    <span
                      className={`absolute -top-3.5 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-md flex items-center gap-1 ${
                        isBoxActiveWithAudio
                          ? "bg-amber-500 text-black animate-bounce font-black"
                          : isSelected
                          ? "bg-white text-black"
                          : "bg-black/80 text-white"
                      }`}
                    >
                      {box.label || (box.ayah === 0 ? "بسملة" : `آية ${box.ayah}`)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
