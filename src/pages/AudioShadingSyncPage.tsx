import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Play, Pause, RotateCcw, Save, Trash2, Sparkles,
  Volume2, VolumeX, Eye, EyeOff, ZoomIn, ZoomOut, Check, ChevronLeft,
  ChevronRight, Scissors, Upload, Download, RefreshCw, Zap, CheckCircle2,
  Clock, FastForward, Rewind, Layers, Sliders, Music, FileAudio, Bookmark,
  SlidersHorizontal, Radio, Sun, Moon, GraduationCap, Baby, Link2, HardDrive,
  Cloud, Info, CheckCheck, Repeat, Headphones, Wand2
} from "lucide-react";
import { getAllSurahs, getSurahByNumber, SurahInfo } from "@/data/quranData";
import { getSurahAudioUrl, getFallbackAudioUrl } from "@/data/audioUrls";
import {
  getPageAyahBoxes, savePageAyahBoxes, AyahBox, getAllPageSources,
  PAGE_IMAGE_SIZE, getSavedAyahCoordinates
} from "@/data/ayahCoordinates";
import { getSurahTimings, saveSurahTimings, getSavedTimings, AudioSegment } from "@/data/ayahTimings";
import { getSurahLink, saveSurahLink } from "@/data/surahLink";
import { saveAudioToCache, resolvePlayableAudioUrl } from "@/data/offlineAudioCache";
import { saveSurahInfo, getSavedSurahInfo, syncSurahInfoFromServer, SurahMeta } from "@/data/surahInfo";
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

  // وضع المزامنة النشط: إما المعلم أو الطفل
  const [activeSyncSpeaker, setActiveSyncSpeaker] = useState<"teacher" | "kids">("teacher");

  // مصادر الصوت المستقلة: للمعلم وللطفل
  const [teacherSourceType, setTeacherSourceType] = useState<"app" | "custom">("app");
  const [teacherCustomFile, setTeacherCustomFile] = useState<File | null>(null);
  const [teacherCustomUrl, setTeacherCustomUrl] = useState<string>("");

  const [kidsSourceType, setKidsSourceType] = useState<"app" | "custom">("app");
  const [kidsCustomFile, setKidsCustomFile] = useState<File | null>(null);
  const [kidsCustomUrl, setKidsCustomUrl] = useState<string>("");

  // مشغل الصوت الرئيسي مع نقطة الإيقاف المحددة (تمنع إيقاف الصوت التلقائي عند التشغيل العادي)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const boxStopAtRef = useRef<number | null>(null);
  const loopingBoxRef = useRef<{ start: number; end: number } | null>(null);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);

  // نظام الربط التلقائي المتسلسل بين الآيات (عند نهاية الآية N تُضبط بداية N+1 فوراً لمطابقة نفس اللحظة)
  const [autoChain, setAutoChain] = useState<boolean>(true);

  // صفحات ومربعات التظليل الخاصة بالسورة
  const [allPages, setAllPages] = useState<string[]>([]);
  const [activePageSrc, setActivePageSrc] = useState<string>("/pages/0.jpg");
  const [pageBoxes, setPageBoxes] = useState<AyahBox[]>([]);
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number>(0);
  const [previewNightMode, setPreviewNightMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // معلومات السورة المحفوظة (المحلية والسحابية)
  const [savedMeta, setSavedMeta] = useState<SurahMeta | null>(null);

  // مقياس معاينة صفحة المصحف
  const [scale, setScale] = useState(0.42);

  // جلب كافة مصادر الصفحات والبيانات المحفوظة
  useEffect(() => {
    try {
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

  // جلب روابط الصوت ومعلومات السورة المسجلة سابقاً للسورة الحالية
  useEffect(() => {
    // 1. جلب معلومات السورة المحفوظة
    const info = getSavedSurahInfo(selectedSurahNum);
    setSavedMeta(info);

    const timings = getSavedTimings()[selectedSurahNum];
    const link = getSurahLink(selectedSurahNum);

    // 2. استرجاع صوت المعلم
    if (timings?.teacherAudioUrl) {
      setTeacherCustomUrl(timings.teacherAudioUrl);
      setTeacherSourceType("custom");
    } else if (link?.teacherUrl && !link.teacherUrl.includes("your-server.com")) {
      setTeacherCustomUrl(link.teacherUrl);
      setTeacherSourceType("custom");
    } else {
      resolvePlayableAudioUrl(selectedSurahNum, "", "teacher").then((resolved) => {
        if (resolved && resolved.startsWith("blob:")) {
          setTeacherCustomUrl(resolved);
          setTeacherSourceType("custom");
        }
      }).catch(() => {});
    }

    // 3. استرجاع صوت الطفل
    if (timings?.kidsAudioUrl) {
      setKidsCustomUrl(timings.kidsAudioUrl);
      setKidsSourceType("custom");
    } else if (link?.kidsUrl && !link.kidsUrl.includes("your-server.com")) {
      setKidsCustomUrl(link.kidsUrl);
      setKidsSourceType("custom");
    } else {
      resolvePlayableAudioUrl(selectedSurahNum, "", "kids").then((resolved) => {
        if (resolved && resolved.startsWith("blob:")) {
          setKidsCustomUrl(resolved);
          setKidsSourceType("custom");
        }
      }).catch(() => {});
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

  // رابط الصوت الفعال حالياً حسب وضع المتحدث النشط - إلزام تشغيل الملف المختار فقط عند وضع ملف مخصص
  const activeAudioUrl = useMemo(() => {
    if (activeSyncSpeaker === "kids") {
      if (kidsSourceType === "custom") {
        return kidsCustomUrl || "";
      }
      return getSurahAudioUrl(selectedSurahNum);
    } else {
      if (teacherSourceType === "custom") {
        return teacherCustomUrl || "";
      }
      return getSurahAudioUrl(selectedSurahNum);
    }
  }, [activeSyncSpeaker, teacherSourceType, teacherCustomUrl, kidsSourceType, kidsCustomUrl, selectedSurahNum]);

  // تبديل المتحدث النشط للمزامنة مع التبديل الفوري للملف المخصص
  const handleSwitchSpeaker = (speaker: "teacher" | "kids") => {
    boxStopAtRef.current = null;
    loopingBoxRef.current = null;
    setIsLooping(false);
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    setActiveSyncSpeaker(speaker);
    setCurrentTime(0);

    const targetUrl = speaker === "kids"
      ? (kidsSourceType === "custom" ? (kidsCustomUrl || "") : getSurahAudioUrl(selectedSurahNum))
      : (teacherSourceType === "custom" ? (teacherCustomUrl || "") : getSurahAudioUrl(selectedSurahNum));

    if (audioRef.current && targetUrl) {
      audioRef.current.src = targetUrl;
      audioRef.current.load();
    }
  };

  // معالجة رفع ملف صوتي للمعلم - يعمل فوراً وبشكل حصري
  const handleTeacherFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (teacherCustomUrl && teacherCustomUrl.startsWith("blob:")) {
      try { URL.revokeObjectURL(teacherCustomUrl); } catch { /* ignore */ }
    }
    const url = URL.createObjectURL(f);
    setTeacherCustomFile(f);
    setTeacherCustomUrl(url);
    setTeacherSourceType("custom");
    boxStopAtRef.current = null;
    loopingBoxRef.current = null;
    setIsLooping(false);

    if (activeSyncSpeaker === "teacher" && audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      setIsPlaying(false);
    }
    toast({
      title: "🎓 تم تحميل وتفعيل ملف المعلم المختار حصرياً",
      description: `${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB) - جاهز للتشغيل والمزامنة الفورية`,
    });
  };

  // معالجة رفع ملف صوتي للطفل - يعمل فوراً وبشكل حصري
  const handleKidsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (kidsCustomUrl && kidsCustomUrl.startsWith("blob:")) {
      try { URL.revokeObjectURL(kidsCustomUrl); } catch { /* ignore */ }
    }
    const url = URL.createObjectURL(f);
    setKidsCustomFile(f);
    setKidsCustomUrl(url);
    setKidsSourceType("custom");
    boxStopAtRef.current = null;
    loopingBoxRef.current = null;
    setIsLooping(false);

    if (activeSyncSpeaker === "kids" && audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      setIsPlaying(false);
    }
    toast({
      title: "👶 تم تحميل وتفعيل ملف الطفل المختار حصرياً",
      description: `${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB) - جاهز للتشغيل والمزامنة الفورية`,
    });
  };

  // المربعات التابعة للسورة المحددة في الصفحة الحالية
  const surahBoxes = useMemo(() => {
    return pageBoxes
      .map((box, idx) => ({ box, originalIndex: idx }))
      .filter(({ box }) => box.surah === selectedSurahNum);
  }, [pageBoxes, selectedSurahNum]);

  const selectedBox = pageBoxes[selectedBoxIndex] || null;

  // إحصائيات الربط لكل من المعلم والطفل مبنية على الآيات الفريدة (يحسب نفس رقم الآية والسورة كوحدة واحدة)
  const syncStats = useMemo(() => {
    const totalBoxes = surahBoxes.length;
    // قائمة الآيات الفريدة الموجودة في السورة
    const uniqueAyahs = Array.from(new Set(surahBoxes.map(({ box }) => box.ayah)));
    const totalAyahs = uniqueAyahs.length;

    const teacherSyncedAyahs = uniqueAyahs.filter(ayahNum =>
      surahBoxes.some(({ box }) => box.ayah === ayahNum && box.audioStart !== undefined && box.audioEnd !== undefined)
    );

    const kidsSyncedAyahs = uniqueAyahs.filter(ayahNum =>
      surahBoxes.some(({ box }) => box.ayah === ayahNum && box.kidsStart !== undefined && box.kidsEnd !== undefined)
    );

    const currentSynced = activeSyncSpeaker === "kids" ? kidsSyncedAyahs.length : teacherSyncedAyahs.length;
    const currentPercent = totalAyahs > 0 ? Math.round((currentSynced / totalAyahs) * 100) : 0;

    return {
      totalBoxes,
      totalAyahs,
      teacherSyncedCount: teacherSyncedAyahs.length,
      kidsSyncedCount: kidsSyncedAyahs.length,
      currentSynced,
      currentPercent,
      teacherSyncedAyahs,
      kidsSyncedAyahs,
    };
  }, [surahBoxes, activeSyncSpeaker]);

  // التحكم في تشغيل الصوت الكامل دون توقف مع التحقق من وجود الملف عند تفعيل الوضع المخصص
  const togglePlay = () => {
    if (!audioRef.current) return;
    const isCustomMode = activeSyncSpeaker === "kids" ? kidsSourceType === "custom" : teacherSourceType === "custom";
    const hasCustomUrl = activeSyncSpeaker === "kids" ? !!kidsCustomUrl : !!teacherCustomUrl;

    if (isCustomMode && !hasCustomUrl) {
      toast({
        title: "⚠️ يرجى اختيار ملف الصوت أولاً",
        description: `لقد اخترت وضع الملف المخصص لـ${activeSyncSpeaker === "kids" ? "الطفل" : "المعلم"}. انقر على "رفع ملف" لاختيار الملف ليعمل حصرياً.`,
        variant: "destructive",
      });
      return;
    }

    // مسح أي توقيت إيقاف مؤقت أو تكرار حتى يستمر الصوت بالكامل دون انقطاع
    boxStopAtRef.current = null;
    loopingBoxRef.current = null;
    setIsLooping(false);

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((e) => {
        console.warn("Play error:", e);
      });
    }
  };

  const seek = (time: number) => {
    if (!audioRef.current) return;
    boxStopAtRef.current = null;
    const clamped = Math.max(0, Math.min(duration || 9999, time));
    audioRef.current.currentTime = clamped;
    setCurrentTime(clamped);
  };

  // تغيير سرعة التشغيل لتسهيل الضبط فائق الدقة
  const handlePlaybackRateChange = (r: number) => {
    setPlaybackRate(r);
    if (audioRef.current) {
      audioRef.current.playbackRate = r;
    }
  };

  // تحديث وقت المربع: عند وجود نفس رقم الآية والسورة يعمم التوقيت على جميع مربعات تلك الآية
  const updateBoxTiming = (index: number, start?: number, end?: number, speakerOverride?: "teacher" | "kids") => {
    const sp = speakerOverride || activeSyncSpeaker;
    setPageBoxes((prev) => {
      const copy = [...prev];
      const targetBox = copy[index];
      if (!targetBox) return prev;

      const targetSurah = targetBox.surah;
      const targetAyah = targetBox.ayah;

      // تعميم التوقيت على كل مربع يحمل نفس رقم السورة والآية (سواء مقاطع متعددة أو آية ممتدة)
      return copy.map((b) => {
        if (b.surah === targetSurah && b.ayah === targetAyah) {
          if (sp === "kids") {
            return {
              ...b,
              kidsStart: start !== undefined ? Number(start.toFixed(2)) : b.kidsStart,
              kidsEnd: end !== undefined ? Number(end.toFixed(2)) : b.kidsEnd,
            };
          } else {
            return {
              ...b,
              audioStart: start !== undefined ? Number(start.toFixed(2)) : b.audioStart,
              audioEnd: end !== undefined ? Number(end.toFixed(2)) : b.audioEnd,
            };
          }
        }
        return b;
      });
    });
  };

  // تسجيل بداية التوقيت للمربع الحالي عند اللحظة الحالية في الصوت (وتعميمها على نفس الآية)
  const stampCurrentBoxStart = () => {
    if (!selectedBox) return;
    const stampTime = Number(currentTime.toFixed(2));
    const isKid = activeSyncSpeaker === "kids";
    updateBoxTiming(selectedBoxIndex, stampTime, isKid ? selectedBox.kidsEnd : selectedBox.audioEnd, activeSyncSpeaker);
    toast({
      title: isKid ? "👶 تم تسجيل بداية تلاوة الطفل" : "🎓 تم تسجيل بداية تلاوة المعلم",
      description: `${selectedBox.label || `الآية ${selectedBox.ayah}`} بدأت عند ${formatTimestamp(stampTime)} (مطبقة على كل مقاطع الآية)`,
    });
  };

  // تسجيل نهاية التوقيت للمربع الحالي والانتقال للآية التالية مع دعم الربط التلقائي المتسلسل (0ms فواصل)
  const stampCurrentBoxEnd = () => {
    if (!selectedBox) return;
    const stampTime = Number(currentTime.toFixed(2));
    const isKid = activeSyncSpeaker === "kids";
    const currentAyah = selectedBox.ayah;

    // 1. تسجيل نهاية الآية الحالية
    updateBoxTiming(selectedBoxIndex, isKid ? selectedBox.kidsStart : selectedBox.audioStart, stampTime, activeSyncSpeaker);

    // 2. البحث عن الآية التالية
    const nextItem = surahBoxes.find(({ box }) => box.ayah > currentAyah);

    // 3. الربط المتسلسل التلقائي (ربط نهاية هذه الآية مع بداية الآية التالية فوراً دون أي فراغ زمني)
    if (autoChain && nextItem) {
      updateBoxTiming(nextItem.originalIndex, stampTime, isKid ? nextItem.box.kidsEnd : nextItem.box.audioEnd, activeSyncSpeaker);
      toast({
        title: isKid ? "🔗 ربط متسلسل للطفل" : "🔗 ربط متسلسل للمعلم",
        description: `تم وسم نهاية آية ${currentAyah} وربط بداية آية ${nextItem.box.ayah} تلقائياً عند ${formatTimestamp(stampTime)} (فاصل 0ms)`,
      });
    } else {
      toast({
        title: isKid ? "👶 تم تسجيل نهاية تلاوة الطفل" : "🎓 تم تسجيل نهاية تلاوة المعلم",
        description: `${selectedBox.label || `الآية ${currentAyah}`} انتهت عند ${formatTimestamp(stampTime)}`,
      });
    }

    // 4. الانتقال التلقائي للآية التالية
    if (nextItem) {
      setSelectedBoxIndex(nextItem.originalIndex);
    }
  };

  // سد الفواصل والربط التلقائي بين كل الآيات المتعاقبة في السورة
  const bridgeAllAyahs = () => {
    const isKid = activeSyncSpeaker === "kids";
    const sorted = [...surahBoxes].sort((a, b) => a.box.ayah - b.box.ayah);
    if (sorted.length < 2) {
      toast({
        title: "تنبيه",
        description: "يلزم وجود آيتين على الأقل للربط بينهما",
      });
      return;
    }

    let bridgedCount = 0;
    setPageBoxes((prev) => {
      const copy = [...prev];
      for (let i = 0; i < sorted.length - 1; i++) {
        const curBox = sorted[i].box;
        const nextBox = sorted[i + 1].box;

        const curEnd = isKid ? curBox.kidsEnd : curBox.audioEnd;
        const curStart = isKid ? curBox.kidsStart : curBox.audioStart;
        const nextStart = isKid ? nextBox.kidsStart : nextBox.audioStart;

        if (curEnd !== undefined && curEnd > 0) {
          if (nextStart === undefined || Math.abs(nextStart - curEnd) > 0.01) {
            // سد الفاصل: جعل بداية الآية التالية مساوية تماماً لنهاية الآية الحالية
            copy.forEach((b, idx) => {
              if (b.surah === nextBox.surah && b.ayah === nextBox.ayah) {
                copy[idx] = isKid ? { ...b, kidsStart: curEnd } : { ...b, audioStart: curEnd };
              }
            });
            bridgedCount++;
          }
        } else if (curEnd === undefined && nextStart !== undefined && curStart !== undefined && nextStart > curStart) {
          // إذا كانت بداية التالية محددة ونهاية الحالية فارغة: إكمال النهاية
          copy.forEach((b, idx) => {
            if (b.surah === curBox.surah && b.ayah === curBox.ayah) {
              copy[idx] = isKid ? { ...b, kidsEnd: nextStart } : { ...b, audioEnd: nextStart };
            }
          });
          bridgedCount++;
        }
      }
      return copy;
    });

    toast({
      title: "⚡ تم سد الفواصل والربط التلقائي بنجاح!",
      description: `تم ربط ومحاذاة ${bridgedCount} فاصل بين آيات سورة ${selectedSurah?.name || selectedSurahNum} لسماع متصل بلا انقطاع!`,
    });
  };

  // الضبط الدقيق بالأجزاء من الثانية (±0.05s, ±0.1s, ±0.5s)
  const adjustTiming = (index: number, field: "start" | "end", delta: number) => {
    const isKid = activeSyncSpeaker === "kids";
    const box = pageBoxes[index];
    if (!box) return;

    const curStart = isKid ? box.kidsStart : box.audioStart;
    const curEnd = isKid ? box.kidsEnd : box.audioEnd;

    if (field === "start") {
      const base = curStart !== undefined ? curStart : currentTime;
      const newVal = Math.max(0, Number((base + delta).toFixed(2)));
      updateBoxTiming(index, newVal, curEnd, activeSyncSpeaker);
      seek(newVal);
    } else {
      const base = curEnd !== undefined ? curEnd : currentTime;
      const newVal = Math.max(0, Number((base + delta).toFixed(2)));
      updateBoxTiming(index, curStart, newVal, activeSyncSpeaker);
      seek(Math.max(0, Number((newVal - 0.4).toFixed(2))));
    }
  };

  // تكرار الآية المحددة للاستماع المتكرر والتأكد من مخارج الحروف والوقف
  const toggleLoopSelectedBox = (box: AyahBox) => {
    if (!audioRef.current) return;
    const isKid = activeSyncSpeaker === "kids";
    const start = isKid ? (box.kidsStart ?? 0) : (box.audioStart ?? 0);
    const end = isKid ? box.kidsEnd : box.audioEnd;

    if (isLooping) {
      loopingBoxRef.current = null;
      setIsLooping(false);
      boxStopAtRef.current = null;
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (end === undefined || end <= start) {
      toast({
        title: "تنبيه",
        description: "يجب تحديد نهاية الآية أولاً لتتمكن من تكرارها",
        variant: "destructive",
      });
      return;
    }

    loopingBoxRef.current = { start, end };
    setIsLooping(true);
    boxStopAtRef.current = null;
    audioRef.current.currentTime = start;
    setCurrentTime(start);
    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
  };

  // استماع لنقطة الوصل والربط بين الآية الحالية والآية التالية
  const previewBoxTransition = (box: AyahBox) => {
    if (!audioRef.current) return;
    const isKid = activeSyncSpeaker === "kids";
    const end = isKid ? box.kidsEnd : box.audioEnd;

    if (end === undefined || end <= 0) {
      toast({
        title: "تنبيه",
        description: "يرجى وسم نهاية الآية الحالية أولاً لسماع وصلة الربط",
        variant: "destructive",
      });
      return;
    }

    loopingBoxRef.current = null;
    setIsLooping(false);
    const previewStart = Math.max(0, Number((end - 1.5).toFixed(2)));
    const previewStop = Number((end + 1.5).toFixed(2));

    boxStopAtRef.current = previewStop;
    audioRef.current.currentTime = previewStart;
    setCurrentTime(previewStart);
    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});

    toast({
      title: "🎧 معاينة الربط بين الآيتين",
      description: `يتم الاستماع من ${formatTimestamp(previewStart)} إلى ${formatTimestamp(previewStop)} لاختبار سلاسة الانتقال.`,
    });
  };

  // تشغيل مقطع المربع فقط للتأكد من دقته
  const playBoxAudio = (box: AyahBox, speakerOverride?: "teacher" | "kids") => {
    if (!audioRef.current) return;
    const sp = speakerOverride || activeSyncSpeaker;
    const start = sp === "kids" ? (box.kidsStart ?? 0) : (box.audioStart ?? 0);
    const end = sp === "kids" ? box.kidsEnd : box.audioEnd;

    loopingBoxRef.current = null;
    setIsLooping(false);

    // تعيين نقطة إيقاف فقط عند طلب الاستماع لمقطع مخصص
    boxStopAtRef.current = (end !== undefined && end > start) ? end : null;

    audioRef.current.currentTime = start;
    setCurrentTime(start);
    audioRef.current.play().then(() => {
      setIsPlaying(true);
    }).catch(() => {});
  };

  // حفظ التوقيتات والمربعات ومعلومات السورة في الحاسوب والسيرفر
  const handleSaveSync = async () => {
    setIsSaving(true);
    try {
      // 1. تعميم التوقيتات على جميع المربعات الحاملة لنفس السورة والآية في كل الصفحات
      const allSavedCoords = getSavedAyahCoordinates();
      for (const pageKey of Object.keys(allSavedCoords)) {
        allSavedCoords[pageKey] = allSavedCoords[pageKey].map(b => {
          if (b.surah === selectedSurahNum) {
            const match = pageBoxes.find(pb => pb.surah === b.surah && pb.ayah === b.ayah);
            if (match) {
              return {
                ...b,
                audioStart: match.audioStart !== undefined ? match.audioStart : b.audioStart,
                audioEnd: match.audioEnd !== undefined ? match.audioEnd : b.audioEnd,
                kidsStart: match.kidsStart !== undefined ? match.kidsStart : b.kidsStart,
                kidsEnd: match.kidsEnd !== undefined ? match.kidsEnd : b.kidsEnd,
              };
            }
          }
          return b;
        });
      }

      // حفظ الصفحة الحالية والمربعات المحدثة
      await savePageAyahBoxes(activePageSrc, pageBoxes);

      // 2. تخزين الملفات المرفوعة في كاش IndexedDB لتعمل على الحاسوب دون إنترنت
      if (teacherCustomFile) {
        await saveAudioToCache(activeAudioUrl, selectedSurahNum, teacherCustomFile, "teacher");
      }
      if (kidsCustomFile) {
        await saveAudioToCache(activeAudioUrl, selectedSurahNum, kidsCustomFile, "kids");
      }

      // 3. تجميع توقيتات المعلم والطفل كلّ على حدة حسب الآية
      const sortedBoxes = [...surahBoxes].sort((a, b) => a.box.ayah - b.box.ayah);
      const teacherTimes: number[] = [];
      const kidsTimes: number[] = [];
      const segments: AudioSegment[] = [];

      sortedBoxes.forEach(({ box }) => {
        // توقيت المعلم
        if (box.audioStart !== undefined) {
          teacherTimes.push(box.audioStart);
          segments.push({
            id: `seg_teacher_${box.surah}_${box.ayah}`,
            start: box.audioStart,
            end: box.audioEnd ?? (box.audioStart + 3),
            speaker: "teacher",
            ayah: box.ayah,
            label: box.label || (box.ayah === 0 ? "البسملة" : `آية ${box.ayah}`),
          });
        }
        // توقيت الطفل
        if (box.kidsStart !== undefined) {
          kidsTimes.push(box.kidsStart);
          segments.push({
            id: `seg_kids_${box.surah}_${box.ayah}`,
            start: box.kidsStart,
            end: box.kidsEnd ?? (box.kidsStart + 3),
            speaker: "kids",
            ayah: box.ayah,
            label: box.label || (box.ayah === 0 ? "البسملة" : `آية ${box.ayah}`),
          });
        }
      });

      // 4. حفظ التوقيتات في الحاسوب (ملف_التظليل) وسيرفر Supabase
      await saveSurahTimings(selectedSurahNum, {
        teacher: teacherTimes,
        kids: kidsTimes,
        segments,
        teacherAudioUrl: teacherSourceType === "custom" ? (teacherCustomUrl || undefined) : undefined,
        kidsAudioUrl: kidsSourceType === "custom" ? (kidsCustomUrl || undefined) : undefined,
      });

      // 5. حفظ رابط السورة
      saveSurahLink({
        surah: selectedSurahNum,
        audioUrl: teacherCustomUrl || getSurahAudioUrl(selectedSurahNum),
        teacherUrl: teacherCustomUrl || getSurahAudioUrl(selectedSurahNum),
        kidsUrl: kidsCustomUrl || undefined,
        timings: teacherTimes,
        kidsTimings: kidsTimes,
        updatedAt: Date.now(),
      });

      // 6. حفظ معلومات السورة الكاملة (على الحاسوب والسيرفر)
      const surahInfoPayload: SurahMeta = {
        surahNumber: selectedSurahNum,
        surahName: selectedSurah?.name || `سورة ${selectedSurahNum}`,
        ayahCount: selectedSurah?.ayahCount || 7,
        revelationType: selectedSurah?.revelationType || "مكية",
        teacherAudioUrl: teacherSourceType === "custom" ? teacherCustomUrl : undefined,
        kidsAudioUrl: kidsSourceType === "custom" ? kidsCustomUrl : undefined,
        teacherSyncedAyahs: syncStats.teacherSyncedAyahs,
        kidsSyncedAyahs: syncStats.kidsSyncedAyahs,
        pageSrc: activePageSrc,
        updatedAt: Date.now(),
      };
      await saveSurahInfo(surahInfoPayload);
      setSavedMeta(surahInfoPayload);

      toast({
        title: "✅ تم الحفظ الشامل في الحاسوب والسيرفر!",
        description: `تم حفظ ${syncStats.teacherSyncedCount} آية للمعلم و ${syncStats.kidsSyncedCount} آية للطفل، مع حفظ معلومات سورة ${selectedSurah?.name || selectedSurahNum} في ملفات المشروع وسيرفر التخزين.`,
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "b" || e.key === "B" || e.key === "لا") {
        e.preventDefault();
        stampCurrentBoxStart();
      } else if (e.key === "e" || e.key === "E" || e.key === "ث") {
        e.preventDefault();
        stampCurrentBoxEnd();
      } else if (e.key === "l" || e.key === "L" || e.key === "م") {
        e.preventDefault();
        if (selectedBox) toggleLoopSelectedBox(selectedBox);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(currentTime - (e.altKey ? 0.05 : 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(currentTime + (e.altKey ? 0.05 : 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-stone-200 font-sans select-none flex flex-col" dir="rtl">
      <AppNav />

      {/* عنصر الصوت المباشر مع استمرارية التشغيل والتحكم الحصري بالملفات */}
      <audio
        ref={audioRef}
        src={activeAudioUrl}
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          const cur = audioRef.current.currentTime;
          setCurrentTime(cur);

          // 1. تكرار المقطع إن كان وضع التكرار الدقيق نشطاً
          if (loopingBoxRef.current) {
            if (cur >= loopingBoxRef.current.end) {
              audioRef.current.currentTime = loopingBoxRef.current.start;
              return;
            }
          }
          // 2. إيقاف الصوت فقط إذا كان المشغل في وضع استماع مقطع أو وصلة ربط محددة
          else if (boxStopAtRef.current !== null && cur >= boxStopAtRef.current) {
            audioRef.current.pause();
            boxStopAtRef.current = null;
            setIsPlaying(false);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          boxStopAtRef.current = null;
          loopingBoxRef.current = null;
          setIsLooping(false);
          setIsPlaying(false);
        }}
        onError={() => {
          const audio = audioRef.current;
          if (!audio) return;
          const isCustomMode = activeSyncSpeaker === "kids" ? kidsSourceType === "custom" : teacherSourceType === "custom";
          if (isCustomMode) {
            console.warn("Custom audio file decode/load error:", audio.src);
            toast({
              title: "⚠️ تنبيه في ملف الصوت المختار",
              description: "تعذر تشغيل الملف المختار أو انتهت صلاحية الجلسة، يرجى إعادة اختيار الملف.",
              variant: "destructive",
            });
            return;
          }
          const fallback = getFallbackAudioUrl(selectedSurahNum);
          if (fallback && fallback !== audio.src) {
            audio.src = fallback;
            audio.load();
            if (isPlaying) audio.play().catch(() => {});
          }
        }}
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
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
              activeSyncSpeaker === "kids"
                ? "bg-sky-500/15 border-sky-500/30 text-sky-400"
                : "bg-amber-500/15 border-amber-500/30 text-amber-400"
            }`}>
              {activeSyncSpeaker === "kids" ? <Baby className="w-5 h-5" /> : <GraduationCap className="w-5 h-5" />}
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                <span>استوديو ربط التظليل بموقع الصوت</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                  activeSyncSpeaker === "kids"
                    ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                    : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                }`}>
                  {activeSyncSpeaker === "kids" ? "Kid Sync" : "Teacher Sync"}
                </span>
              </h1>
              <p className="text-[11px] text-stone-400">
                حفظ متزامن في الحاسوب والسيرفر مع توحيد توقيتات الآيات المتكررة
              </p>
            </div>
          </div>
        </div>

        {/* أزرار الحفظ وتبديل المعلم / الطفل السريعة */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* شارات الحفظ على الحاسوب والسيرفر */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-xl border border-emerald-500/30">
            <HardDrive className="w-3.5 h-3.5" />
            <span>حاسوب</span>
            <span>+</span>
            <Cloud className="w-3.5 h-3.5" />
            <span>سيرفر</span>
          </div>

          {/* تبديل المعلم / الطفل */}
          <div className="flex items-center bg-black/50 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => handleSwitchSpeaker("teacher")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeSyncSpeaker === "teacher"
                  ? "bg-amber-500 text-black shadow-lg shadow-amber-500/25"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>المعلم ({syncStats.teacherSyncedCount}/{syncStats.totalAyahs} آية)</span>
            </button>
            <button
              onClick={() => handleSwitchSpeaker("kids")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeSyncSpeaker === "kids"
                  ? "bg-sky-500 text-black shadow-lg shadow-sky-500/25"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              <Baby className="w-3.5 h-3.5" />
              <span>الطفل ({syncStats.kidsSyncedCount}/{syncStats.totalAyahs} آية)</span>
            </button>
          </div>

          <button
            onClick={handleSaveSync}
            disabled={isSaving}
            className={`px-4 py-2 rounded-xl text-black font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-lg active:scale-95 disabled:opacity-50 ${
              activeSyncSpeaker === "kids"
                ? "bg-sky-400 hover:bg-sky-300 shadow-sky-500/25"
                : "bg-amber-500 hover:bg-amber-400 shadow-amber-500/25"
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? "جاري الحفظ..." : "حفظ الكل (حاسوب + سيرفر)"}</span>
          </button>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-[1700px] mx-auto w-full">
        
        {/* العمود الأيمن (لوحة التحكم، إعدادات الصوت، وأزرار الوسم) */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          
          {/* كارت معلومات السورة الموثقة ومصدر الصوت */}
          <div className="bg-stone-900/80 border border-white/10 rounded-2xl p-4 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className={`text-xs font-bold flex items-center gap-1.5 ${
                activeSyncSpeaker === "kids" ? "text-sky-400" : "text-amber-400"
              }`}>
                <Sliders className="w-4 h-4" />
                <span>إعدادات مزامنة {activeSyncSpeaker === "kids" ? "تلاوة الطفل 👶" : "تلاوة المعلم 🎓"}:</span>
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

              {/* مصدر الصوت للمتحدث الحالي */}
              <div>
                <label className="block text-[11px] text-stone-400 mb-1 font-bold">
                  مصدر صوت {activeSyncSpeaker === "kids" ? "الطفل" : "المعلم"}:
                </label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      if (activeSyncSpeaker === "kids") setKidsSourceType("app");
                      else setTeacherSourceType("app");
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                      (activeSyncSpeaker === "kids" ? kidsSourceType : teacherSourceType) === "app"
                        ? (activeSyncSpeaker === "kids" ? "bg-sky-500/20 text-sky-300 border-sky-500/40 shadow" : "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow")
                        : "bg-white/5 border-white/10 text-stone-400 hover:text-white"
                    }`}
                  >
                    صوت التطبيق 🌐
                  </button>
                  <label
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border text-center cursor-pointer transition-all ${
                      (activeSyncSpeaker === "kids" ? kidsSourceType : teacherSourceType) === "custom"
                        ? (activeSyncSpeaker === "kids" ? "bg-sky-500/20 text-sky-300 border-sky-500/40 shadow" : "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow")
                        : "bg-white/5 border-white/10 text-stone-400 hover:text-white"
                    }`}
                  >
                    رفع ملف 📁
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a"
                      onChange={activeSyncSpeaker === "kids" ? handleKidsFileUpload : handleTeacherFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* بطاقة معلومات السورة المحفوظة (حاسوب + سيرفر) */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Info className="w-4 h-4" />
                </span>
                <div>
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>سورة {selectedSurah?.name} ({selectedSurah?.revelationType || "مكية"})</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                      {selectedSurah?.ayahCount} آيات
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-400 flex items-center gap-2 mt-0.5">
                    <span>مزامنة المعلم: <strong className="text-amber-400">{syncStats.teacherSyncedCount} آية</strong></span>
                    <span>•</span>
                    <span>مزامنة الطفل: <strong className="text-sky-400">{syncStats.kidsSyncedCount} آية</strong></span>
                    {savedMeta?.updatedAt && (
                      <>
                        <span>•</span>
                        <span className="text-stone-500">آخر حفظ: {new Date(savedMeta.updatedAt).toLocaleTimeString("ar")}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                  <CheckCheck className="w-3 h-3" />
                  <span>تزامن الآيات المتكررة مُفعّل</span>
                </span>
              </div>
            </div>

            {/* حالة الملف المخصص إن وُجد */}
            {((activeSyncSpeaker === "kids" && kidsCustomUrl) || (activeSyncSpeaker === "teacher" && teacherCustomUrl)) && (
              <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                activeSyncSpeaker === "kids"
                  ? "bg-sky-500/10 border-sky-500/20 text-sky-300"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-300"
              }`}>
                <div className="flex items-center gap-2">
                  <FileAudio className="w-4 h-4 shrink-0" />
                  <span>
                    تم تعيين ملف صوتي مخصص لـ{activeSyncSpeaker === "kids" ? "الطفل" : "المعلم"}:{" "}
                    <strong className="font-mono">
                      {(activeSyncSpeaker === "kids" ? kidsCustomFile?.name : teacherCustomFile?.name) || "ملف محفوظ محلياً"}
                    </strong>
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (activeSyncSpeaker === "kids") {
                      setKidsCustomUrl("");
                      setKidsCustomFile(null);
                      setKidsSourceType("app");
                    } else {
                      setTeacherCustomUrl("");
                      setTeacherCustomFile(null);
                      setTeacherSourceType("app");
                    }
                  }}
                  className="text-stone-400 hover:text-red-400 text-[11px] font-bold"
                >
                  استعادة الافتراضي ✕
                </button>
              </div>
            )}
          </div>

          {/* مشغل الصوت والمسطرة الزمنية التفاعلية */}
          <div className="bg-stone-900/80 border border-white/10 rounded-2xl p-4 shadow-xl space-y-4">
            
            {/* رأس المشغل والوقت */}
            {/* رأس المشغل والوقت مع مؤشر الملف الحصري ومبدل السرعات */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Volume2 className={`w-5 h-5 animate-pulse ${
                  activeSyncSpeaker === "kids" ? "text-sky-400" : "text-amber-400"
                }`} />
                <span className="text-sm font-bold text-white">
                  {selectedSurah?.name || `سورة ${selectedSurahNum}`}
                </span>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${
                  activeSyncSpeaker === "kids"
                    ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                    : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                }`}>
                  {activeSyncSpeaker === "kids" ? "صوت الطفل 👶" : "صوت المعلم 🎓"}
                </span>

                {/* شارة الملف الحصري */}
                {((activeSyncSpeaker === "kids" && kidsSourceType === "custom" && kidsCustomUrl) ||
                  (activeSyncSpeaker === "teacher" && teacherSourceType === "custom" && teacherCustomUrl)) ? (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>ملف مخصص نشط حصرياً</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-stone-400 border border-white/10">
                    صوت التطبيق الافتراضي
                  </span>
                )}

                {/* أزرار سرعة التلاوة لتسهيل التقسيم والوسم الدقيق */}
                <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10 text-[10px] font-mono">
                  {[0.5, 0.75, 1.0, 1.25].map((rate) => (
                    <button
                      key={`rate-${rate}`}
                      onClick={() => handlePlaybackRateChange(rate)}
                      className={`px-1.5 py-0.5 rounded transition-all font-bold ${
                        playbackRate === rate
                          ? "bg-amber-500 text-black shadow"
                          : "text-stone-400 hover:text-white"
                      }`}
                      title={`سرعة التلاوة ${rate}x`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              {/* عداد التوقيت الدقيق */}
              <div className={`flex items-center gap-1 font-mono text-base sm:text-lg font-bold bg-black/50 px-3 py-1 rounded-xl border shadow-inner ${
                activeSyncSpeaker === "kids"
                  ? "text-sky-300 border-sky-500/20"
                  : "text-amber-300 border-amber-500/20"
              }`}>
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
                className={`w-full h-2.5 bg-stone-700 rounded-lg appearance-none cursor-pointer ${
                  activeSyncSpeaker === "kids" ? "accent-sky-500" : "accent-amber-500"
                }`}
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

              {/* زر التشغيل والإيقاف الكبير المستمر */}
              <button
                onClick={togglePlay}
                className={`w-14 h-14 rounded-2xl text-black flex items-center justify-center font-bold shadow-xl transition-all active:scale-95 ${
                  activeSyncSpeaker === "kids"
                    ? "bg-sky-400 hover:bg-sky-300 shadow-sky-500/25"
                    : "bg-amber-500 hover:bg-amber-400 shadow-amber-500/25"
                }`}
                title="تشغيل / إيقاف مستمر (مسافة Space)"
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

            {/* أدوات الربط الهندسي وسد الفواصل */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap">
              <button
                onClick={() => setAutoChain(v => !v)}
                className={`px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-2 transition-all active:scale-95 shadow-sm ${
                  autoChain
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10 ring-1 ring-emerald-500/30"
                    : "bg-white/5 text-stone-400 border-white/10 hover:text-white"
                }`}
                title="عند وسم نهاية أي آية، يتم تلقائياً ضبط بداية الآية التالية لتكون مطابقة لنفس التوقيت (فاصل 0ms)"
              >
                <Link2 className={`w-4 h-4 ${autoChain ? "text-emerald-400 animate-pulse" : ""}`} />
                <span>الربط المتسلسل التلقائي: {autoChain ? "مُفعّل (0ms فاصل)" : "معطّل"}</span>
              </button>

              <button
                onClick={bridgeAllAyahs}
                className="px-3.5 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95 shadow-lg shadow-purple-500/10"
                title="سد كافة الفواصل بين الآيات المتتالية وجعل نهاية كل آية مطابقة لبداية الآية التالية"
              >
                <Zap className="w-4 h-4 text-purple-400" />
                <span>⚡ سد فواصل السورة والربط الشامل</span>
              </button>
            </div>

            {/* أزرار الوسم السريعة بنقرة واحدة (One-Tap Live Stamping) */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={stampCurrentBoxStart}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 active:scale-95 transition-all"
                title="تسجيل توقيت البداية للآية عند الثانية الحالية (مفتاح B)"
              >
                <span>📍 وسم بداية {activeSyncSpeaker === "kids" ? "الطفل" : "المعلم"} هنا</span>
                <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded font-mono">B</span>
              </button>

              <button
                onClick={stampCurrentBoxEnd}
                className={`py-3 px-4 rounded-xl text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${
                  activeSyncSpeaker === "kids"
                    ? "bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 shadow-sky-900/30"
                    : "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-amber-900/30"
                }`}
                title="تسجيل توقيت النهاية والانتقال للآية التالية والربط التلقائي (مفتاح E)"
              >
                <span>⏹️ وسم نهاية {activeSyncSpeaker === "kids" ? "الطفل" : "المعلم"} والتالي</span>
                <span className="text-[10px] bg-black/30 text-white px-2 py-0.5 rounded font-mono">E</span>
              </button>
            </div>
          </div>

          {/* وحدة الضبط الدقيق والربط الهندسي بين الآيات */}
          {selectedBox && (
            <div className="bg-gradient-to-b from-stone-900 to-stone-950 border border-white/15 rounded-2xl p-4 shadow-2xl space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                    activeSyncSpeaker === "kids" ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  }`}>
                    {selectedBox.ayah === 0 ? "0" : selectedBox.ayah}
                  </span>
                  <div>
                    <h3 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
                      <span>الضبط الدقيق لـ {selectedBox.label || (selectedBox.ayah === 0 ? "🕌 البسملة" : `الآية ${selectedBox.ayah}`)}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-stone-300">
                        {formatTimestamp(activeSyncSpeaker === "kids" ? selectedBox.kidsStart : selectedBox.audioStart)} → {formatTimestamp(activeSyncSpeaker === "kids" ? selectedBox.kidsEnd : selectedBox.audioEnd)}
                      </span>
                    </h3>
                    <p className="text-[11px] text-stone-400">
                      أزرار التحريك الدقيق بالأجزاء من الثانية لضبط مخارج الحروف والوقف وسد الفواصل
                    </p>
                  </div>
                </div>

                {/* أزرار العمليات والاختبار السريعة للآية */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => toggleLoopSelectedBox(selectedBox)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm ${
                      isLooping
                        ? "bg-emerald-500 text-black border-emerald-400 animate-pulse font-black"
                        : "bg-white/5 hover:bg-white/10 text-emerald-400 border-emerald-500/30"
                    }`}
                    title="تكرار الآية بشكل حلقي مستمر لاختبار الدقة (مفتاح L)"
                  >
                    <Repeat className={`w-3.5 h-3.5 ${isLooping ? "animate-spin" : ""}`} />
                    <span>{isLooping ? "إيقاف التكرار ⏹️" : "🔁 تكرار الآية للاختبار"}</span>
                  </button>

                  <button
                    onClick={() => previewBoxTransition(selectedBox)}
                    className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                    title="استماع لنقطة الوصل بين هذه الآية والآية التالية"
                  >
                    <Headphones className="w-3.5 h-3.5 text-purple-400" />
                    <span>🎧 استماع لوصلة الربط</span>
                  </button>

                  <button
                    onClick={() => playBoxAudio(selectedBox)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm ${
                      activeSyncSpeaker === "kids"
                        ? "bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/40"
                        : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40"
                    }`}
                    title="تشغيل هذه الآية فقط من البداية للنهاية"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>تشغيل الآية</span>
                  </button>
                </div>
              </div>

              {/* صفوف الضبط الدقيق بالأجزاء من الثانية */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* ضبط البداية */}
                <div className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>توقيت البداية:</span>
                    </span>
                    <span className="font-mono text-white bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {formatTimestamp(activeSyncSpeaker === "kids" ? selectedBox.kidsStart : selectedBox.audioStart)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-stone-500 font-bold ml-1">تعديل:</span>
                    {[-0.5, -0.1, -0.05, 0.05, 0.1, 0.5].map((delta) => (
                      <button
                        key={`start-nudge-${delta}`}
                        onClick={() => adjustTiming(selectedBoxIndex, "start", delta)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all active:scale-90 ${
                          delta < 0
                            ? "bg-white/5 hover:bg-white/10 text-stone-300 border-white/10"
                            : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30"
                        }`}
                      >
                        {delta > 0 ? `+${delta}s` : `${delta}s`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ضبط النهاية */}
                <div className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-amber-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>توقيت النهاية:</span>
                    </span>
                    <span className="font-mono text-white bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {formatTimestamp(activeSyncSpeaker === "kids" ? selectedBox.kidsEnd : selectedBox.audioEnd)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-stone-500 font-bold ml-1">تعديل:</span>
                    {[-0.5, -0.1, -0.05, 0.05, 0.1, 0.5].map((delta) => (
                      <button
                        key={`end-nudge-${delta}`}
                        onClick={() => adjustTiming(selectedBoxIndex, "end", delta)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all active:scale-90 ${
                          delta < 0
                            ? "bg-white/5 hover:bg-white/10 text-stone-300 border-white/10"
                            : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30"
                        }`}
                      >
                        {delta > 0 ? `+${delta}s` : `${delta}s`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* جدول مربعات التظليل وتوقيتاتها الخاصة بالسورة */}
          <div className="bg-stone-900/80 border border-white/10 rounded-2xl p-4 shadow-xl space-y-3 flex-1 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>مربعات وآيات السورة ({surahBoxes.length} مربع · {syncStats.totalAyahs} آيات):</span>
              </span>
              <span className="text-[10px] text-stone-400 font-mono">
                المتحدث النشط: {activeSyncSpeaker === "kids" ? "👶 الطفل" : "🎓 المعلم"}
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
                  const isTeacherSynced = box.audioStart !== undefined && box.audioEnd !== undefined;
                  const isKidsSynced = box.kidsStart !== undefined && box.kidsEnd !== undefined;
                  const isSynced = activeSyncSpeaker === "kids" ? isKidsSynced : isTeacherSynced;

                  const isCurrentlyPlaying = isPlaying && (
                    activeSyncSpeaker === "kids"
                      ? (box.kidsStart !== undefined && box.kidsEnd !== undefined && currentTime >= box.kidsStart && currentTime <= box.kidsEnd)
                      : (box.audioStart !== undefined && box.audioEnd !== undefined && currentTime >= box.audioStart && currentTime <= box.audioEnd)
                  );

                  return (
                    <div
                      key={`sync-row-${box.surah}-${box.ayah}-${originalIndex}`}
                      onClick={() => setSelectedBoxIndex(originalIndex)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? (activeSyncSpeaker === "kids" ? "bg-sky-500/15 border-sky-400 shadow-lg ring-1 ring-sky-400/40" : "bg-amber-500/15 border-amber-400 shadow-lg ring-1 ring-amber-400/40")
                          : isCurrentlyPlaying
                          ? "bg-emerald-500/20 border-emerald-400 shadow-md ring-1 ring-emerald-400"
                          : isSynced
                          ? "bg-white/5 border-white/10 hover:bg-white/10"
                          : "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                      }`}
                    >
                      {/* معلومات المربع ورقم الآية */}
                      <div className="flex items-center gap-2.5 min-w-[130px]">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSynced ? "bg-emerald-400" : "bg-stone-500"}`} />
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

                      {/* حقول التوقيت: المعلم والطفل معاً بوضوح تام */}
                      <div className="flex items-center gap-2.5 text-xs font-mono flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {/* توقيت المعلم */}
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all ${
                          activeSyncSpeaker === "teacher"
                            ? "bg-amber-500/15 border-amber-400/50 text-amber-300"
                            : "bg-black/40 border-white/5 text-stone-400"
                        }`}>
                          <span className="text-[10px] font-bold">🎓 المعلم:</span>
                          <input
                            type="number"
                            step="0.05"
                            value={box.audioStart ?? ""}
                            placeholder="بدء"
                            onChange={(e) => updateBoxTiming(originalIndex, parseFloat(e.target.value) || 0, box.audioEnd, "teacher")}
                            className="w-14 bg-transparent text-amber-300 font-bold outline-none text-left"
                          />
                          <span>→</span>
                          <input
                            type="number"
                            step="0.05"
                            value={box.audioEnd ?? ""}
                            placeholder="نهاية"
                            onChange={(e) => updateBoxTiming(originalIndex, box.audioStart, parseFloat(e.target.value) || 0, "teacher")}
                            className="w-14 bg-transparent text-amber-300 font-bold outline-none text-left"
                          />
                        </div>

                        {/* توقيت الطفل */}
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all ${
                          activeSyncSpeaker === "kids"
                            ? "bg-sky-500/15 border-sky-400/50 text-sky-300"
                            : "bg-black/40 border-white/5 text-stone-400"
                        }`}>
                          <span className="text-[10px] font-bold">👶 الطفل:</span>
                          <input
                            type="number"
                            step="0.05"
                            value={box.kidsStart ?? ""}
                            placeholder="بدء"
                            onChange={(e) => updateBoxTiming(originalIndex, parseFloat(e.target.value) || 0, box.kidsEnd, "kids")}
                            className="w-14 bg-transparent text-sky-300 font-bold outline-none text-left"
                          />
                          <span>→</span>
                          <input
                            type="number"
                            step="0.05"
                            value={box.kidsEnd ?? ""}
                            placeholder="نهاية"
                            onChange={(e) => updateBoxTiming(originalIndex, box.kidsStart, parseFloat(e.target.value) || 0, "kids")}
                            className="w-14 bg-transparent text-sky-300 font-bold outline-none text-left"
                          />
                        </div>

                        {/* مؤشر الربط وسد الفواصل مع الآية السابقة */}
                        {(() => {
                          const isKid = activeSyncSpeaker === "kids";
                          const curStart = isKid ? box.kidsStart : box.audioStart;
                          const curEnd = isKid ? box.kidsEnd : box.audioEnd;
                          // البحث عن الآية السابقة مباشرة
                          const prevSorted = [...surahBoxes]
                            .sort((a, b) => a.box.ayah - b.box.ayah)
                            .find(item => item.box.ayah === box.ayah - 1);
                          if (!prevSorted) return null;
                          const prevEnd = isKid ? prevSorted.box.kidsEnd : prevSorted.box.audioEnd;
                          if (curStart === undefined || prevEnd === undefined) return null;

                          const gap = Number((curStart - prevEnd).toFixed(2));
                          if (Math.abs(gap) <= 0.02) {
                            return (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/30 flex items-center gap-1" title="متصلة مباشرة بفاصل 0ms">
                                <Link2 className="w-3 h-3" />
                                <span>متصلة</span>
                              </span>
                            );
                          } else if (gap > 0.02) {
                            return (
                              <button
                                onClick={() => updateBoxTiming(originalIndex, prevEnd, curEnd, activeSyncSpeaker)}
                                className="text-[10px] font-bold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 px-2 py-1 rounded-lg border border-amber-500/40 flex items-center gap-1 transition-all shadow-sm"
                                title="انقر لسد الفاصل الزمني وربط بداية هذه الآية بنهاية الآية السابقة فوراً"
                              >
                                <span>فاصل {gap}s</span>
                                <Zap className="w-3 h-3 text-amber-400" />
                                <span>سد الربط</span>
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      {/* أزرار العمليات للمربع */}
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => playBoxAudio(box)}
                          className={`p-1.5 rounded-lg border transition-all text-xs ${
                            activeSyncSpeaker === "kids"
                              ? "bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border-sky-500/30"
                              : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30"
                          }`}
                          title={`استمع لمقطع ${activeSyncSpeaker === "kids" ? "الطفل" : "المعلم"}`}
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => toggleLoopSelectedBox(box)}
                          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 transition-all text-xs"
                          title="تكرار الآية للاختبار الدقيق"
                        >
                          <Repeat className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => previewBoxTransition(box)}
                          className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/25 transition-all text-xs"
                          title="استماع لوصلة الربط مع الآية التالية"
                        >
                          <Headphones className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => updateBoxTiming(originalIndex, undefined, undefined, activeSyncSpeaker)}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-xs"
                          title={`مسح توقيت ${activeSyncSpeaker === "kids" ? "الطفل" : "المعلم"} لهذا المربع`}
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
            <span className={`text-xs font-bold flex items-center gap-1.5 ${
              activeSyncSpeaker === "kids" ? "text-sky-400" : "text-amber-400"
            }`}>
              <Eye className="w-4 h-4" />
              <span>معاينة حية لتظليل {activeSyncSpeaker === "kids" ? "الطفل 👶" : "المعلم 🎓"}:</span>
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
                const isKid = activeSyncSpeaker === "kids";

                const isBoxActiveWithAudio = isPlaying && (
                  isKid
                    ? (box.kidsStart !== undefined && box.kidsEnd !== undefined && currentTime >= box.kidsStart && currentTime <= box.kidsEnd)
                    : (box.audioStart !== undefined && box.audioEnd !== undefined && currentTime >= box.audioStart && currentTime <= box.audioEnd)
                );

                const activeBg = isKid ? "rgba(14, 165, 233, 0.55)" : "rgba(245, 158, 11, 0.55)";
                const selectedBg = isKid ? "rgba(14, 165, 233, 0.35)" : "rgba(245, 158, 11, 0.35)";
                const idleBg = isKid ? "rgba(14, 165, 233, 0.15)" : "rgba(245, 158, 11, 0.15)";
                const activeBorder = isKid ? "#0ea5e9" : "#f59e0b";
                const activeShadow = isKid
                  ? "0 0 30px rgba(14, 165, 233, 0.9), inset 0 0 15px rgba(14, 165, 233, 0.5)"
                  : "0 0 30px rgba(245, 158, 11, 0.9), inset 0 0 15px rgba(245, 158, 11, 0.5)";

                return (
                  <div
                    key={`canvas-box-${box.surah}-${box.ayah}-${idx}`}
                    onClick={() => {
                      setSelectedBoxIndex(idx);
                      // تحديد المربع فقط دون إيقاف أو قطع التلاوة المستمرة
                    }}
                    style={{
                      left: box.x * scale,
                      top: box.y * scale,
                      width: box.width * scale,
                      height: box.height * scale,
                      backgroundColor: isBoxActiveWithAudio
                        ? activeBg
                        : isSelected
                        ? selectedBg
                        : idleBg,
                      borderColor: isBoxActiveWithAudio
                        ? activeBorder
                        : isSelected
                        ? "#ffffff"
                        : isKid ? "rgba(14, 165, 233, 0.5)" : "rgba(245, 158, 11, 0.5)",
                      boxShadow: isBoxActiveWithAudio
                        ? activeShadow
                        : isSelected
                        ? "0 0 20px rgba(255, 255, 255, 0.5)"
                        : "none",
                    }}
                    className={`absolute z-20 rounded-lg border-2 cursor-pointer transition-all ${
                      isBoxActiveWithAudio
                        ? (isKid ? "ring-4 ring-sky-400 scale-[1.02] animate-pulse" : "ring-4 ring-amber-400 scale-[1.02] animate-pulse")
                        : isSelected
                        ? "ring-2 ring-white"
                        : "hover:border-white"
                    }`}
                  >
                    {/* شارة رقم الآية / اسم المربع مع شارة المتحدث */}
                    <span
                      className={`absolute -top-3.5 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-md flex items-center gap-1 ${
                        isBoxActiveWithAudio
                          ? (isKid ? "bg-sky-400 text-black animate-bounce font-black" : "bg-amber-500 text-black animate-bounce font-black")
                          : isSelected
                          ? "bg-white text-black"
                          : "bg-black/80 text-white"
                      }`}
                    >
                      {isKid ? "👶 " : "🎓 "}
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
