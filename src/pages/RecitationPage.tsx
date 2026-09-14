import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  Ear,
  Loader2,
  Mic,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { ensureCorpus, type SurahText } from "../data/quranText";
import {
  analyzeAyah,
  feedbackFor,
  type AyahAnalysis,
} from "../services/tajweedAnalyzer";
import { transcribeRecitation } from "../services/hfAsrService";
import { toast } from "../hooks/use-toast";

/** كل مقطع تدريب = 5 آيات (بدل السورة كاملة) */
const SEGMENT_SIZE = 5;

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
  const [segIdx, setSegIdx] = useState(0);
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

  const surahOptions = useMemo<SurahOption[]>(() => {
    if (!corpus) return [];
    return corpus.map(s => ({ app: s.app, name: s.name, ayahs: s.ayahs }));
  }, [corpus]);

  /** تقسيم السورة إلى مقاطع من 5 آيات */
  const segments = useMemo(() => {
    if (!surah) return [];
    const out: { from: number; to: number; text: string }[] = [];
    for (let i = 0; i < surah.ayahs.length; i += SEGMENT_SIZE) {
      const slice = surah.ayahs.slice(i, i + SEGMENT_SIZE);
      out.push({
        from: i + 1,
        to: i + slice.length,
        text: slice.map(a => a.text).join(" "),
      });
    }
    return out;
  }, [surah]);

  const seg = segments[segIdx] ?? null;
  const targetText = seg?.text ?? "";

  // تحميل نص السور (محلي 100%)
  useEffect(() => {
    let alive = true;
    ensureCorpus().then(c => { if (alive) setCorpus(c); });
    return () => { alive = false; };
  }, []);

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

  /** ⭐ وضع العلامة: HuggingFace أولاً (تسجيل حقيقي = دقة أعلى) ثم سقوط لنص المتصفح */
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
      // 1) قناة HuggingFace — الصوت المسجَّل يُحلَّل بنموذج أقوى
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
              اختر سورة → اقرأ بصوتك → نضع علامتك فوراً
            </p>
          </div>
          <Link to="/mushaf" className="rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-emerald-600" /> المصحف
          </Link>
        </header>

        {/* اختيار السورة */}
        <section className="rounded-2xl border bg-card p-4 space-y-3">
          <label className="text-sm font-bold">اختر السورة</label>
          {!corpus && <div className="text-sm text-muted-foreground">جارٍ تحميل نصّ السور…</div>}
          {corpus && (
            <select
              value={surah?.app ?? ""}
              onChange={(e) => {
                const s = surahOptions.find(x => x.app === Number(e.target.value)) || null;
                setSurah(s);
                setSegIdx(0);
                spokenRef.current = "";
                setSpoken("");
                setAnalysis(null);
              }}
              className="w-full rounded-xl border bg-background p-3 text-base"
            >
              <option value="">— اختر —</option>
              {surahOptions.map(s => (
                <option key={s.app} value={s.app}>
                  {s.app}. {s.name}
                </option>
              ))}
            </select>
          )}
          {surah && segments.length > 0 && (
            <div className="space-y-2">
              {/* منتقي المقطع: 5 آيات لكل تدريب */}
              <div className="flex gap-1.5 flex-wrap">
                {segments.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setSegIdx(i); spokenRef.current = ""; setSpoken(""); setAnalysis(null); }}
                    className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition ${
                      i === segIdx
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-card hover:bg-accent"
                    }`}
                  >
                    {s.from}-{s.to}
                  </button>
                ))}
              </div>
              <p className="rounded-xl bg-muted p-3 text-lg leading-loose" dir="rtl">
                {seg?.text}
              </p>
            </div>
          )}
        </section>

        {/* التسجيل */}
        <section className="rounded-2xl border bg-card p-4 space-y-3">
          {listening && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center text-emerald-700 font-bold animate-pulse">
              🎧 نسمعك الآن… اقرأ الآيات {seg?.from}-{seg?.to} ثم توقف قليلاً
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