import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  Ear,
  FileAudio,
  Link2,
  Loader2,
  Mic,
  RotateCcw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { ensureCorpus, type SurahText } from "../data/quranText";
import {
  analyzeAyah,
  feedbackFor,
  type AyahAnalysis,
} from "../services/tajweedAnalyzer";
import {
  getHfToken,
  getGroqToken,
  transcribeRecitation,
  audioMimeForFile,
  isAudioFile,
} from "../services/hfAsrService";
import { toast } from "../hooks/use-toast";

/** أنواع التعرف الصوتي في المتصفح */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecCtor = new () => SpeechRecognitionLike;
function getRecognitionCtor(): RecCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecCtor;
    webkitSpeechRecognition?: RecCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** سورة جاهزة للتدريب */
interface SurahOption {
  app: number;
  name: string;
  ayahs: SurahText["ayahs"];
}

export default function RecitationPage() {
  const [corpus, setCorpus] = useState<SurahText[] | null>(null);
  const [surah, setSurah] = useState<SurahOption | null>(null);
  const [startAyah, setStartAyah] = useState(1);
  const [ayahCount, setAyahCount] = useState(5);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [spoken, setSpoken] = useState("");
  const [analysis, setAnalysis] = useState<AyahAnalysis | null>(null);
  const [supported, setSupported] = useState(true);
  const [engine, setEngine] = useState<"hf" | "browser" | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const spokenRef = useRef("");
  const listeningRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  /** زر إدخال الملف الصوتي (رفع تسجيل مسجَّل مسبقاً) */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** الملف الصوتي المرفوع — يُحلَّل بنفس محرّك التسجيل المباشر */
  const [uploaded, setUploaded] = useState<{ file: File; url: string; duration: number } | null>(null);

  const surahOptions = useMemo<SurahOption[]>(() => {
    if (!corpus) return [];
    return corpus.map(s => ({ app: s.app, name: s.name, ayahs: s.ayahs }));
  }, [corpus]);

  const targetText = useMemo(() => {
    if (!surah) return "";
    return surah.ayahs.slice(startAyah - 1, startAyah - 1 + ayahCount).map(a => a.text).join(" ");
  }, [surah, startAyah, ayahCount]);

  // هل يوجد مفتاح Hugging Face أو Groq؟
  const hasHfToken = !!getHfToken();
  const hasGroqToken = !!getGroqToken();
  const hasAnyToken = hasHfToken || hasGroqToken;
  const [groqKeyInput, setGroqKeyInput] = useState("");

  const saveGroqKey = () => {
    if (!groqKeyInput.trim()) return;
    localStorage.setItem("groq_token", groqKeyInput.trim());
    window.location.reload();
  };

  // تحميل نص السور (محلي 100%)
  useEffect(() => {
    let alive = true;
    ensureCorpus().then(c => { if (alive) setCorpus(c); });
    return () => { alive = false; };
  }, []);

  // ==== رابط قابل للمشاركة: /recitation?surah=114&start=1&count=5 ====
  // الهدف: الوالد (أو المعلّم) ينسخ الرابط ويرسله للطفل، فيفتحه على السورة والمقطع مباشرة.
  const [searchParams, setSearchParams] = useSearchParams();
  // يُطبَّق فتح السورة من الرابط مرة واحدة فقط بعد تحميل النص (كي لا يمنع الطفل تغيير السورة)
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    if (!corpus || surahOptions.length === 0) return;
    const wanted = Number(searchParams.get("surah"));
    if (!Number.isFinite(wanted) || wanted <= 0) return;
    const found = surahOptions.find(s => s.app === wanted);
    if (!found) return;
    deepLinkApplied.current = true;
    setSurah(found);
    const startWanted = Number(searchParams.get("start"));
    if (Number.isFinite(startWanted) && startWanted > 0) setStartAyah(startWanted);
    const countWanted = Number(searchParams.get("count"));
    if (Number.isFinite(countWanted) && countWanted > 0) setAyahCount(countWanted);
  }, [corpus, surahOptions, searchParams]);

  /**
   *  الاكتشاف الذكي: إن لم يحدّد الرابط سورةً، نختار واحدة تلقائياً
   * فيبدأ الطفل التدريب فوراً بلا أي إعداد يدوي.
   */
  const autoPickApplied = useRef(false);
  /** مرجع حيّ لـ syncUrl — يسمح للـ effect بالوصول إليه قبل تعريفه */
  const syncUrlRef = useRef<((app: number | null, start: number, count: number) => void) | null>(null);
  useEffect(() => {
    if (autoPickApplied.current) return;
    if (!corpus || surahOptions.length === 0) return;
    const wanted = Number(searchParams.get("surah"));
    if (Number.isFinite(wanted) && wanted > 0) return; // الرابط كفى
    autoPickApplied.current = true;
    const chosen = surahOptions[Math.floor(Math.random() * surahOptions.length)];
    const count = Math.min(5, chosen.ayahs.length);
    const maxStart = Math.max(1, chosen.ayahs.length - count + 1);
    const start = Math.floor(Math.random() * maxStart) + 1;
    setSurah(chosen);
    setStartAyah(start);
    setAyahCount(count);
    syncUrlRef.current?.(chosen.app, start, count);
  }, [corpus, surahOptions, searchParams]);

  /** يحدّث الرابط في شريط العنوان ليعكس السورة/المقطع الحاليين (بلا إعادة تحميل) */
  const syncUrl = useCallback((surahApp: number | null, start: number, count: number) => {
    if (!surahApp) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ surah: String(surahApp), start: String(start), count: String(count) }, { replace: true });
  }, [setSearchParams]);

  // نُبقي المرجع محدّثاً كي يستطيع effect الاكتشاف التلقائي نداءه
  useEffect(() => { syncUrlRef.current = syncUrl; }, [syncUrl]);

  /** نسخ رابط هذا التدريب — لإرساله للطفل */
  const copyShareLink = useCallback(async () => {
    if (!surah) return;
    const base = `${window.location.origin}${window.location.pathname}`;
    const qs = `?surah=${surah.app}&start=${startAyah}&count=${ayahCount}`;
    const url = `${base}${qs}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "تم نسخ رابط التدريب", description: "أرسله للطفل ليفتح نفس السورة والمقطع" });
    } catch {
      // المتصفح منع النسخ التلقائي — نعرض الرابط ليُنسخ يدوياً
      toast({ title: "رابط التدريب", description: url });
    }
  }, [surah, startAyah, ayahCount, toast]);

  /**
   * 🎲 اختيار عشوائي: ينتقي سورة ومقطعاً عشوائياً ليتدرّب الطفل بلا تكرار معتاد.
   */
  const pickRandom = useCallback(() => {
    if (surahOptions.length === 0) return;
    const chosen = surahOptions[Math.floor(Math.random() * surahOptions.length)];
    const maxStart = chosen.ayahs.length;
    const newCount = 5;
    const validMax = Math.max(1, maxStart - newCount + 1);
    const newStart = Math.floor(Math.random() * validMax) + 1;
    setSurah(chosen);
    setStartAyah(newStart);
    setAyahCount(newCount);
    syncUrl(chosen.app, newStart, newCount);
    // تصفير الحالة كي لا تظهر نتيجة قديمة مع النص الجديد
    spokenRef.current = "";
    setSpoken("");
    setAnalysis(null);
    setEngine(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploaded(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    toast({
      title: `🎲 ${chosen.app}. ${chosen.name}`,
      description: `الآيات ${newStart}–${Math.min(newStart + newCount - 1, chosen.ayahs.length)}`,
    });
  }, [surahOptions, syncUrl, toast]);

  /** إيقاف المؤقتات والتسجيل (بلا وضع علامة) */
  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    try { recRef.current?.stop(); } catch { /* ignore */ }
    recRef.current = null;
    try { mediaRef.current?.stop(); } catch { /* ignore */ }
    mediaRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    listeningRef.current = false;
    setListening(false);
  }, []);

  // إيقاف الميكروفون عند مغادرة الصفحة
  useEffect(() => {
    return () => { stopListening(); };
  }, [stopListening]);

  // تحرير رابط المعاينة الصوتية عند مغادرة الصفحة (تفادي تسرّب الذاكرة)
  useEffect(() => {
    return () => {
      setUploaded(prev => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    };
  }, []);

  /** ⭐ وضع العلامة: HuggingFace أو Groq أولاً (تسجيل حقيقي = دقة أعلى) ثم سقوط لنص المتصفح */
  const gradeNow = useCallback(async () => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    try { recRef.current?.stop(); } catch { /* ignore */ }
    recRef.current = null;
    listeningRef.current = false;
    setListening(false);
    setProcessing(true);
    try {
      // 1) قناة HuggingFace/Groq — الصوت المسجَّل يُحلَّل بنموذج أقوى
      const chunks = chunksRef.current;
      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
        const hf = await transcribeRecitation(blob);
        if (hf.viaHf && hf.text) {
          setEngine("hf");
          setSpoken(hf.text);
          setAnalysis(analyzeAyah(targetText, hf.text));
          return;
        }
      }
      // 2) سقوط آمن: النص الحي من المتصفح
      const text = spokenRef.current.trim();
      if (text) {
        setEngine("browser");
        setAnalysis(analyzeAyah(targetText, text));
        return;
      }
      toast({ title: "لم أسمع شيئاً", description: "اقرأ بصوت واضح ثم توقف قليلاً" });
    } finally {
      setProcessing(false);
      try { mediaRef.current?.stop(); } catch { /* ignore */ }
      mediaRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, [targetText, toast]);

  /**
   * 💡 رفع تسجيل صوتي مسجَّل مسبقاً (صوت الطفل من الهاتف أو مسجّل خارجي).
   * يُغذّي نفس محرّك التحليل المستخدم في التسجيل المباشر (`transcribeRecitation` +
   * `analyzeAyah`) — فلا يتكرر منطق التقييم بين المسارين.
   */
  const gradeFromFile = useCallback(async (file: File) => {
    if (!surah) {
      toast({ title: "اختر السورة أولاً", variant: "destructive" });
      return;
    }
    // 1) فحص النوع
    if (!isAudioFile(file)) {
      toast({ title: "الملف ليس صوتياً", description: "اختر ملف mp3 أو wav أو m4a أو ogg", variant: "destructive" });
      return;
    }
    // 2) فحص الحجم للرفع الفائق (Groq يدعم حتى 25 ميجابايت)
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "الملف كبير جداً (الحد 25 ميجابايت)", variant: "destructive" });
      return;
    }
    setProcessing(true);
    // 4) معاينة + تحليل بنفس المحرّك
    const url = URL.createObjectURL(file);
    setUploaded(prev => {
      if (prev) URL.revokeObjectURL(prev.url); // حرّر الرابط السابق (تفادي تسرّب الذاكرة)
      return { file, url, duration: 0 };
    });
    setAnalysis(null);
    setSpoken("");
    spokenRef.current = "";
    setEngine(null);
    try {
      // الملف هو المصدر الوحيد للنص هنا (لا يوجد نص حيّ من الميكروفون)
      const mime = audioMimeForFile(file);
      const hf = await transcribeRecitation(file, mime);
      if (hf.viaHf && hf.text) {
        setEngine("hf");
        setSpoken(hf.text);
        setAnalysis(analyzeAyah(targetText, hf.text));
        return;
      }
      // ===== لا نتوقف: نعرض تقريراً تشخيصياً بدل إغلاق الصفحة على فشل =====
      const err = hf.error || "";
      let reason: string;
      if (err === "auth") {
        reason = "مفتاح HuggingFace غير صالح أو منتهي — أنشئ مفتاحاً جديداً من huggingface.co/settings/tokens";
      } else if (err === "loading") {
        reason = "النموذج قيد التحميل على سيرفر HuggingFace — أعد المحاولة بعد نصف دقيقة";
      } else if (err === "empty") {
        reason = "لم يتعرّف النموذج على كلام في الملف — تأكد أن التسجيل فيه قراءة واضحة (لا صمت)";
      } else if (err === "timeout") {
        reason = "انتهت مدة التحليل (30 ثانية) — جرّب مقطعاً أقصر أو ارفع ملفاً أصغر";
      } else if (err.startsWith("http-400")) {
        reason = `النموذج غير مدعوم على هذا المزوّد — ${err.replace(/^http-400:\s*/, "")}`;
      } else if (err.startsWith("http-")) {
        reason = `خطأ من السيرفر: ${err}`;
      } else {
        reason = `تعذّر الاتصال بمحرّك التحليل — ${err || "تحقّق من الاتصال بالإنترنت"}`;
      }
      // نُظهر "لم يستطع التحليل" كحالة في التحليل نفسه (لا كخطأ مانع)
      setEngine("hf");
      const expectedWords = targetText.split(/\s+/).filter(Boolean);
      setAnalysis({
        score: 0,
        correct: 0,
        soft: 0,
        total: expectedWords.length,
        issues: [{
          wordIndex: 0,
          word: expectedWords[0] ?? "",
          type: "missing",
          message: `تعذّر تحليل التسجيل: ${reason}`,
          tip: err === "empty"
            ? "اقرأ بصوت أعلى وأوضح، وتجنّب الضجيج حولك، ثم أعد المحاولة"
            : "تحقّق من الاتصال بالإنترنت ومن صحة مفتاح HuggingFace ثم أعد المحاولة",
        }],
      });
      toast({ title: "لم نتمكّن من التحليل — لكن يمكنك المتابعة", description: reason, variant: "destructive" });
    } catch (e) {
      toast({
        title: "خطأ أثناء التحليل",
        description: e instanceof Error ? e.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  }, [surah, targetText, toast]);

  /** إزالة الملف المرفوع والعودة لحالة البداية */
  const clearUploaded = useCallback(() => {
    setUploaded(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setSpoken("");
    spokenRef.current = "";
    setAnalysis(null);
    setEngine(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /** جدولة العلامة التلقائية عند الصمت (2.2 ثانية بلا كلام = انتهى المقطع) */
  const scheduleAutoGrade = useCallback(() => {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      if (listeningRef.current && spokenRef.current.trim()) void gradeNow();
    }, 2200);
  }, [gradeNow]);

  /** بدء الاستماع: تسجيل صوت حقيقي (لـ HuggingFace) + نص حي من المتصفح */
  const startListening = useCallback(async () => {
    setAnalysis(null);
    setSpoken("");
    spokenRef.current = "";
    chunksRef.current = [];
    setEngine(null);
    // الميكروفون للتسجيل الحقيقي (قناة HuggingFace)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start(1000); // قطعة كل ثانية
      mediaRef.current = mr;
    } catch {
      // بلا إذن ميكروفون — سنعتمد على نص المتصفح فقط
    }
    // نص حي من المتصفح (سقوط آمن + عرض فوري)
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      listeningRef.current = true;
      setListening(true);
      // بلا نص حي: نضع العلامة من التسجيل فقط بعد فترة أطول قليلاً
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = window.setTimeout(() => {
        if (listeningRef.current && chunksRef.current.length > 0) void gradeNow();
      }, 15000);
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = "ar-SA";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) {
          text += (e.results[i][0]?.transcript ?? "") + " ";
        }
        const t = text.trim();
        spokenRef.current = t;
        setSpoken(t);
        scheduleAutoGrade(); // صمت؟ نضع العلامة
      };
      rec.onerror = (ev) => {
        if (ev.error !== "aborted" && ev.error !== "no-speech") {
          toast({ title: "خطأ في الاستماع", description: ev.error, variant: "destructive" });
        }
      };
      rec.onend = () => {
        // المتصفح يوقف الاستماع تلقائياً — نعيد تشغيله ما دمنا في وضع السمع
        if (listeningRef.current) {
          try { rec.start(); } catch { setListening(false); }
        } else {
          setListening(false);
        }
      };
      recRef.current = rec;
      listeningRef.current = true;
      rec.start();
      setListening(true);
    } catch (err) {
      console.error(err);
      toast({ title: "تعذّر بدء الاستماع", variant: "destructive" });
    }
  }, [toast, scheduleAutoGrade, gradeNow]);

  const fb = analysis ? feedbackFor(analysis.score) : null;
  const stars = analysis
    ? analysis.score >= 90 ? 3 : analysis.score >= 70 ? 2 : analysis.score >= 50 ? 1 : 0
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white p-4 pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* الرأس */}
        <header className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2">
              <Ear className="w-7 h-7 text-emerald-600" />
              مدرّب التلاوة
            </h1>
            <p className="text-sm text-muted-foreground">
              اقرأ الآيات بصوتك — يُكتشف المقطع تلقائياً وتُوضع علامتك فوراً
            </p>
          </div>
          <div className="flex items-center gap-2">
            {surah && (
              <button
                onClick={() => void copyShareLink()}
                title="نسخ رابط هذا التدريب لإرساله للطفل"
                className="rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent flex items-center gap-1.5"
              >
                <Link2 className="w-4 h-4 text-emerald-600" /> رابط الطفل
              </button>
            )}
            <Link to="/mushaf" className="rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-emerald-600" /> المصحف
            </Link>
          </div>
        </header>

        {/* تنبيه المفاتيح وواجهة إدخال Groq */}
        {!hasGroqToken && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-bold text-lg mb-1">🚀 فعّل الرفع غير المحدود مجاناً!</p>
                <p className="leading-relaxed">
                  لرفع سور كاملة بلا حدود للوقت وبسرعة خيالية، نستخدم خدمة <strong>Groq</strong> المجانية.
                  احصل على مفتاح API مجاني من <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="underline text-emerald-600 font-bold hover:text-emerald-800">console.groq.com</a> والصقه هنا:
                </p>
                <div className="mt-3 flex gap-2 max-w-sm">
                  <input
                    type="password"
                    placeholder="gsk_..."
                    value={groqKeyInput}
                    onChange={e => setGroqKeyInput(e.target.value)}
                    className="flex-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-left font-mono"
                    dir="ltr"
                  />
                  <button onClick={saveGroqKey} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-white font-bold hover:bg-emerald-700 transition">
                    حفظ
                  </button>
                </div>
              </div>
            </div>
            {!hasHfToken && (
              <p className="mt-4 pt-3 border-t border-emerald-200/50 text-xs opacity-80">
                ملاحظة: حالياً لا يوجد مفتاح Groq ولا HuggingFace، سيعتمد التطبيق على التعرّف الصوتي المدمج في المتصفح فقط (قد يكون غير دقيق).
              </p>
            )}
          </div>
        )}

{/* النص القرآني — يُكتشف تلقائياً (من الرابط أو عشوائياً) بلا اختيار يدوي */}
  <section className="rounded-2xl border-2 border-emerald-200 bg-card p-4 space-y-3 shadow-sm">
    {!corpus && (
      <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تجهيز النص القرآني…
      </div>
    )}

    {corpus && surah && (
      <>
        {/* شريط معلومات السورة — للعرض فقط */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-emerald-600 text-white px-3 py-1 text-sm font-bold">
              سورة {surah.name}
            </span>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1 text-xs font-bold">
              الآيات {startAyah}–{Math.min(startAyah + ayahCount - 1, surah.ayahs.length)}
            </span>
          </div>
          <button
            onClick={pickRandom}
            title="تدريب آخر عشوائي"
            className="shrink-0 rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-1.5 text-xl hover:bg-amber-100 active:scale-95 transition"
          >
            🎲
          </button>
        </div>

        {/* الآيات مفصولة ومرقّمة — أوضح للطفل من كتلة نصية واحدة */}
        <div
          className="rounded-2xl border-2 border-emerald-100 bg-gradient-to-b from-emerald-50/60 to-white p-4 space-y-3"
          dir="rtl"
        >
          {surah.ayahs
            .slice(startAyah - 1, startAyah - 1 + ayahCount)
            .map(a => (
              <p key={a.n} className="flex gap-3 items-start">
                <span className="shrink-0 mt-1 grid place-items-center w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-bold">
                  {a.n}
                </span>
                <span className="text-2xl leading-[2.4] font-semibold text-emerald-950 font-quran">
                  {a.text}
                </span>
              </p>
            ))}
        </div>
      </>
    )}
  </section>

        {/* التسجيل */}
        <section className="rounded-2xl border bg-card p-4 space-y-3">
          {listening && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center text-emerald-700 font-bold animate-pulse">
              🎧 نسمعك الآن… اقرأ الآيات {startAyah}–{Math.min(startAyah + ayahCount - 1, surah?.ayahs.length || 0)} ثم توقف قليلاً
            </div>
          )}
          {processing && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center text-amber-700 font-bold flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              جارٍ تصحيح تلاوتك بأفضل دقة…
            </div>
          )}
          <button
            onClick={() => (listening ? void gradeNow() : void startListening())}
            disabled={!surah || processing}
            className={`w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition ${
              listening ? "bg-red-100 text-red-700 border border-red-300" : "btn-gold"
            } disabled:opacity-50`}
          >
            <Mic className={`w-5 h-5 ${listening ? "animate-pulse" : ""}`} />
            {listening ? "⏹ أنهيتُ — ضع علامتي" : "🎧 اسمع لي وأعطني علامتي"}
          </button>

          {/* ===== رفع تسجيل صوتي مسجَّل مسبقاً ===== */}
          <div className="relative flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-bold">أو</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.opus,.aac,.flac,.webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void gradeFromFile(f);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!surah || processing}
            className="w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 border-2 border-dashed border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 active:scale-[0.98] transition disabled:opacity-50"
          >
            <Upload className="w-5 h-5" />
             ارفع تسجيلاً جاهزاً من جهازك
          </button>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            سجّل قراءة الطفل بالهاتف ثم ارفع الملف هنا — يُقيَّم بنفس نموذج التحليل.
            <br />
            الصيغ المدعومة: mp3، wav، m4a، ogg (حتى 25 ميجابايت للرفع الفائق عبر Groq)
          </p>

          {/* معاينة الملف المرفوع */}
          {uploaded && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileAudio className="w-5 h-5 text-emerald-700 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{uploaded.file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(uploaded.file.size / 1024 / 1024).toFixed(2)} ميجابايت
                      {uploaded.duration > 0 && ` • ${Math.round(uploaded.duration)} ثانية`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={clearUploaded}
                  title="إزالة الملف"
                  className="rounded-lg border bg-card p-2 hover:bg-accent shrink-0"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
              <audio src={uploaded.url} controls className="w-full" />
            </div>
          )}
        </section>

        {/* ما سمعه النظام */}
        {spoken && (
          <section className="rounded-2xl border bg-card p-4 space-y-2">
            <div className="text-sm font-bold text-muted-foreground">ما سمعناه منك:</div>
            <p className="rounded-xl bg-emerald-50 p-3 text-lg" dir="rtl">{spoken}</p>
            <button
              onClick={() => { spokenRef.current = ""; setSpoken(""); setAnalysis(null); setEngine(null); }}
              className="w-full p-3 rounded-xl bg-secondary text-secondary-foreground font-bold flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> من جديد
            </button>
          </section>
        )}

        {/* النتيجة */}
        {analysis && fb && (
          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="text-center space-y-1">
              <div className="text-5xl tracking-widest">
                {"⭐".repeat(stars)}{"☆".repeat(3 - stars)}
              </div>
              <div className="text-2xl font-extrabold flex items-center justify-center gap-2">
                <span>{fb.emoji}</span> {fb.title}
              </div>
              <div className="text-4xl font-black text-emerald-600">{analysis.score}%</div>
              <div className="text-sm text-muted-foreground">
                {analysis.correct} من {analysis.total} كلمة صحيحة
                {analysis.soft > 0 && ` • ${analysis.soft} بنطق يحتاج تحسيناً`}
              </div>
              {engine && (
                <div className="text-xs text-muted-foreground/70">
                  {engine === "hf" ? "⚡ تحليل بنموذج Whisper عبر HuggingFace" : "🖥️ تحليل بتعرف المتصفح"}
                </div>
              )}
            </div>

            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${analysis.score}%` }}
              />
            </div>

            {analysis.issues.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-bold">ملاحظات التجويد:</div>
                {analysis.issues.slice(0, 10).map((is, idx) => (
                  <div key={idx} className="rounded-xl border p-3 space-y-1">
                    <div className="flex items-start gap-2 text-sm">
                      {is.type === "extra" ? (
                        <XCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      )}
                      <span>{is.message}</span>
                    </div>
                    <div className="text-xs text-emerald-700 pr-6">💡 {is.tip}</div>
                  </div>
                ))}
                {/* زر إعادة المحاولة — مرئي فقط عند فشل التحليل */}
                {analysis.issues.some(is => is.type === "missing" && is.message.startsWith("تعذّر")) &&
                  uploaded && (
                    <button
                      onClick={() => void gradeFromFile(uploaded.file)}
                      disabled={processing}
                      className="w-full p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 font-bold flex items-center justify-center gap-2 hover:bg-amber-100 disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {processing ? "جارٍ إعادة التحليل…" : "إعادة محاولة التحليل"}
                    </button>
                  )}
              </div>
            )}

            {analysis.issues.length === 0 && (
              <div className="rounded-xl bg-emerald-50 p-4 text-center text-emerald-700 font-bold">
                🎉 لا أخطاء — تلاوة متقنة! واصل التقدم
              </div>
            )}
          </section>
        )}

        {/* تنبيه الدعم */}
        {!supported && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            متصفحك لا يعرض النص الحي — لكن التسجيل يعمل وسيُحلَّل بنموذج HuggingFace بدقة عالية.
          </div>
        )}
      </div>
    </div>
  );
}