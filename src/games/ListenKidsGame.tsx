import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, Headphones, Mic, RotateCcw, Sparkles } from "lucide-react";
import { addCoins, setCurrentSurah } from "../data/kidsProfile";
import { getSurahAudioUrl } from "../data/audioUrls";
import { ensureCorpus, normalizeArabic, type SurahText } from "../data/quranText";
import { getAllSurahs } from "../data/quranData";
import { toast } from "../hooks/use-toast";
import type { GameDef } from "../data/gameCatalog";

/**
 * 🎧 لعبة «اسمع ← أكمِل ← سجِّل ← تحقّق ← السورة التالية»
 *
 * ١) يُشغَّل صوت السورة كاملاً ليستمع الطفل.
 * ٢) تظهر الآية الأولى ناقصة (كلمة مخفية) ويُكملها الطفل باختيار الكلمة الصحيحة.
 * ٣) يُسجّل الطفل السورة بصوته (SpeechRecognition) فيتحقّق النظام هل حفظها.
 * ٤) عند التطابق بدرجة كافية ينتقل إلى السورة التالية ويُمنح نجوماً.
 *
 * التعرّف الصوتي يعمل في Chrome/Edge/Android TV؛ وإن لم يتوفر يُستخدم
 * بديل يدوي حتى لا تتعطّل اللعبة.
 */

type Phase = "listen" | "complete" | "record" | "verify" | "done";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

const getSpeechRecognition = (): (new () => SpeechRecognitionLike) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

/** نسبة التشابه بين النص المسموع والنص الأصلي (0 → 1) على مستوى الكلمات. */
const similarity = (expected: string, heard: string): number => {
  const a = normalizeArabic(expected).split(" ").filter(Boolean);
  const b = normalizeArabic(heard).split(" ").filter(Boolean);
  if (a.length === 0 || b.length === 0) return 0;
  const pool = [...b];
  let hit = 0;
  for (const w of a) {
    const i = pool.indexOf(w);
    if (i >= 0) { hit += 1; pool.splice(i, 1); }
  }
  return hit / a.length;
};

const PASS_RATIO = 0.6; // نسبة القبول: 60% من الكلمات صحيحة
const ARABIC_KEEP = /[^\u0621-\u064A\u0660-\u0669]/g;

/** يختار كلمة من الآية لتكون «الكلمة المفقودة» (نستثني الكلمات القصيرة جداً). */
const pickMissingIndex = (words: string[]): number => {
  const candidates = words.map((w, i) => ({ w, i })).filter(x => normalizeArabic(x.w).length >= 2);
  if (candidates.length === 0) return Math.max(0, words.length - 1);
  return candidates[Math.floor(Math.random() * candidates.length)].i;
};

/** رقم السورة التالية في ترتيب سور التطبيق (يعود من البداية عند النهاية). */
const nextSurahOf = (current: number): number => {
  const list = getAllSurahs();
  if (list.length === 0) return current;
  const i = list.findIndex(s => s.number === current);
  return list[(i < 0 ? 0 : i + 1) % list.length].number;
};

export default function ListenKidsGame({
  def,
  minSurah,
  onExit,
}: {
  def?: GameDef;
  minSurah?: number;
  onExit: () => void;
}) {
  const startSurah = Math.max(1, minSurah || 1);
  void def;

  const [surahNum, setSurahNum] = useState<number>(startSurah);
  const [surah, setSurah] = useState<SurahText | null>(null);
  const [phase, setPhase] = useState<Phase>("listen");
  const [playing, setPlaying] = useState(false);
  const [missingIdx, setMissingIdx] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [matchPct, setMatchPct] = useState<number | null>(null);
  const [starsEarned, setStarsEarned] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = useMemo(() => getSpeechRecognition() !== null, []);

  // ── تحميل نصّ السورة من المخزون المحلي (بدون إنترنت) ──
  useEffect(() => {
    let alive = true;
    ensureCorpus().then(list => {
      if (!alive) return;
      const found = list.find(s => s.app === surahNum) || list[0];
      setSurah(found || null);
    }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [surahNum]);

  const firstAyah = surah?.ayahs?.[0];
  const words = useMemo(() => (firstAyah?.text || "").split(/\s+/).filter(Boolean), [firstAyah]);

  // ── تجهيز الكلمة المفقودة والخيارات ──
  useEffect(() => {
    if (!firstAyah || words.length === 0) return;
    const idx = pickMissingIndex(words);
    setMissingIdx(idx);
    setChosen(null);
    const correct = words[idx].replace(ARABIC_KEEP, "");
    const pool = Array.from(new Set([
      ...words,
      ...(surah?.ayahs?.slice(0, 4).flatMap(a => a.text.split(/\s+/)) || []),
    ].map(w => w.replace(ARABIC_KEEP, "")).filter(w => w && w !== correct)));
    const wrong = pool.sort(() => Math.random() - 0.5).slice(0, 2);
    setOptions([correct, ...wrong].sort(() => Math.random() - 0.5));
  }, [firstAyah, words, surah]);

  const audioUrl = useMemo(() => getSurahAudioUrl(surahNum), [surahNum]);

  // ── تشغيل صوت السورة ──
  const playSurah = useCallback(() => {
    if (!audioRef.current) return;
    setPlaying(true);
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {
      setPlaying(false);
      toast({ title: "تعذّر تشغيل الصوت", description: "تحقّق من الاتصال بالإنترنت", variant: "destructive" });
    });
  }, []);

  const stopAudio = useCallback(() => {
    const el = audioRef.current;
    if (el) { try { el.pause(); el.currentTime = 0; } catch { /* ignore */ } }
    setPlaying(false);
  }, []);

  useEffect(() => () => {
    stopAudio();
    try { recRef.current?.abort(); } catch { /* ignore */ }
  }, [stopAudio]);

  // ── التحقق من إكمال الكلمة ──
  const correctWord = words[missingIdx]?.replace(ARABIC_KEEP, "") || "";
  const checkChoice = (word: string) => {
    if (chosen) return;
    setChosen(word);
    if (word === correctWord) {
      addCoins(2);
      setStarsEarned(n => n + 2);
      // الانتقال لمرحلة التسجيل: نغيّر المرحلة فوراً ثم نُهيّئ آلة التسجيل
      setPhase("record");
      setTranscript("");
      setMatchPct(null);
      toast({ title: "أحسنت! 🌟", description: "الآن اسمعني سورة " + (surah?.name || "") + " بصوتك" });
    } else {
      window.setTimeout(() => setChosen(null), 900);
    }
  };

  // ── التسجيل الصوتي ──
  const startRecording = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      toast({ title: "التعرّف الصوتي غير مدعوم", description: "استخدم Chrome/Edge، أو اضغط «تأكيد يدوي»", variant: "destructive" });
      return;
    }
    if (!surah) return;
    setTranscript("");
    setMatchPct(null);
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "ar-SA";
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        const alt = e.results[i]?.[0];
        if (alt?.transcript) text += " " + alt.transcript;
      }
      setTranscript(text.trim());
    };
    rec.onerror = () => { setRecording(false); };
    rec.onend = () => { setRecording(false); };
    setRecording(true);
    try { rec.start(); } catch { setRecording(false); }
  }, [surah]);

  // ── تقييم تلاوة الطفل مقابل نصّ السورة ──
  const verifyRecitation = useCallback((heard: string) => {
    if (!surah) return;
    const expected = surah.ayahs.map(a => a.text).join(" ");
    const pct = similarity(expected, heard);
    setMatchPct(Math.round(pct * 100));
    if (pct >= PASS_RATIO) {
      addCoins(10);
      setStarsEarned(n => n + 10);
      setPhase("done");
    } else {
      setPhase("verify");
      toast({ title: "أعد المحاولة 🌱", description: "اسمع السورة مرة أخرى ثم أكمِلها بصوتك", variant: "destructive" });
    }
  }, [surah]);

  const stopRecording = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setRecording(false);
    // تحقّق بعد إيقاف التسجيل (مهلة صغيرة حتى تكتمل النتيجة الأخيرة)
    window.setTimeout(() => {
      if (transcript) verifyRecitation(transcript);
      else toast({ title: "لم أسمع صوتك", description: "اضغط زر التسجيل ثم قرأ بصوت واضح", variant: "destructive" });
    }, 400);
  }, [transcript, verifyRecitation]);

  // ── الانتقال إلى السورة التالية ──
  const goNextSurah = useCallback(() => {
    stopAudio();
    setTranscript("");
    setMatchPct(null);
    setChosen(null);
    const nextNum = nextSurahOf(surahNum);
    setSurahNum(nextNum);
    setPhase("listen");
    // حفظ السورة التالية في الملف الشخصي لتبقى محفوظة بعد الخروج
    setCurrentSurah(nextNum);
    window.dispatchEvent(new Event("mushaf:activeprofile"));
    toast({ title: "🎉 انتقلنا إلى السورة التالية!", description: "اسمع ثم أكمِل ثم سجِّل صوتك" });
  }, [surahNum, stopAudio]);

  const restart = useCallback(() => {
    stopAudio();
    setTranscript("");
    setMatchPct(null);
    setChosen(null);
    setPhase("listen");
  }, [stopAudio]);

  const progressSteps: { key: Phase; label: string }[] = [
    { key: "listen", label: "استمع" },
    { key: "complete", label: "أكمِل" },
    { key: "record", label: "سجِّل" },
    { key: "verify", label: "تحقّق" },
  ];
  const phaseOrder: Phase[] = ["listen", "complete", "record", "verify"];

  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <audio ref={audioRef} src={audioUrl} preload="auto" onEnded={() => setPlaying(false)} className="hidden" />

      {/* شريط العنوان والتقدم */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onExit}
          className="flex h-9 items-center gap-1.5 rounded-full bg-secondary text-secondary-foreground px-3 text-xs font-extrabold active:scale-95 border border-border"
        >
          <ArrowRight className="h-4 w-4" /> رجوع
        </button>
        <div className="flex items-center gap-1.5 text-sm font-extrabold text-accent">
          <BookOpen className="h-4 w-4" /> سورة {surah?.name || "..."}
        </div>
        <div className="flex items-center gap-1 text-sm font-extrabold text-amber-500">
          <Sparkles className="h-4 w-4" /> {starsEarned}
        </div>
      </div>

      {/* خطوات اللعبة */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold">
        {progressSteps.map((s, i) => {
          const cur = phase === "done" ? phaseOrder.length : phaseOrder.indexOf(phase);
          const mine = phaseOrder.indexOf(s.key);
          const done = phase === "done" || cur > mine;
          const active = cur === mine;
          return (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 border ${active ? "bg-accent text-accent-foreground border-accent" : done ? "bg-success/20 border-success/50 text-success" : "bg-secondary border-border text-muted-foreground"}`}>
                {done ? <Check className="inline h-3 w-3" /> : null} {s.label}
              </span>
              {i < progressSteps.length - 1 && <span className="text-muted-foreground">←</span>}
            </span>
          );
        })}
      </div>

      {/* المرحلة ١: الاستماع */}
      {phase === "listen" && (
        <div className="space-y-3">
          <p className="text-base sm:text-lg font-extrabold text-foreground">
            اسمع سورة <span className="text-accent">{surah?.name}</span> بتركيز 🤲
          </p>
          <button
            onClick={playing ? stopAudio : playSurah}
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-lg shadow-amber-500/30 active:scale-95"
          >
            <Headphones className="h-9 w-9" />
          </button>
          <p className="text-xs font-bold text-muted-foreground">{playing ? "جارٍ التشغيل..." : "اضغط للاستماع"}</p>

          {/* عرض آيات السورة الحالية (يتحدّث تلقائياً عند الانتقال للسورة التالية) */}
          {surah ? (
            <div className="mx-auto max-h-56 max-w-2xl overflow-y-auto custom-scrollbar rounded-2xl border-2 border-accent/25 bg-card/95 p-3 sm:p-4 text-right leading-loose" dir="rtl">
              {surah.ayahs.map((a) => (
                <span key={a.n} className="font-quran text-lg sm:text-xl font-bold text-foreground game-content">
                  {a.text}
                  <span className="mx-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[10px] text-accent align-middle">{a.n}</span>{" "}
                </span>
              ))}
            </div>
          ) : (
            <p className="py-4 text-xs font-bold text-muted-foreground">جارٍ تحميل نصّ السورة...</p>
          )}

          <button
            onClick={() => { stopAudio(); setPhase("complete"); }}
            className="mx-auto block rounded-full bg-accent text-accent-foreground px-6 py-2.5 text-sm font-extrabold active:scale-95"
          >
            أكمِل الآية ←
          </button>
        </div>
      )}

      {/* المرحلة ٢: إكمال الآية */}
      {phase === "complete" && (
        <div className="space-y-3">
          <p className="text-sm sm:text-base font-extrabold text-foreground">اختر الكلمة الناقصة لتُكمل الآية</p>
          <div className="rounded-2xl border-2 border-accent/25 bg-card/95 p-4 font-quran text-lg sm:text-xl font-bold leading-loose game-content" dir="rtl">
            {words.map((w, i) => (
              i === missingIdx ? (
                <span key={i} className={`mx-1 inline-block min-w-[3.5rem] rounded-lg border-b-2 px-2 ${chosen === correctWord ? "border-success text-success" : chosen ? "border-destructive text-destructive" : "border-accent text-accent"}`}>
                  {chosen || "…"}
                </span>
              ) : (
                <span key={i} className="mx-1">{w}</span>
              )
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {options.map((o, i) => (
              <button
                key={`${o}-${i}`}
                onClick={() => checkChoice(o)}
                disabled={!!chosen}
                className={`rounded-xl border-2 p-3 text-base font-extrabold active:scale-95 transition-colors ${
                  chosen === o
                    ? o === correctWord ? "bg-success/20 border-success text-success" : "bg-destructive/20 border-destructive text-destructive"
                    : "bg-secondary border-border hover:border-accent/50"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
          <button
            onClick={playing ? stopAudio : playSurah}
            className="mx-auto flex items-center gap-1.5 rounded-full bg-secondary border border-border px-4 py-2 text-xs font-extrabold text-secondary-foreground active:scale-95"
          >
            <Headphones className="h-4 w-4" /> {playing ? "إيقاف الصوت" : "أعد الاستماع 🔊"}
          </button>
        </div>
      )}

      {/* المرحلة ٣: التسجيل */}
      {phase === "record" && (
        <div className="space-y-3">
          <p className="text-base sm:text-lg font-extrabold text-foreground">
            أحسنت! الآن اسمعني سورة <span className="text-accent">{surah?.name}</span> بصوتك 🎤
          </p>
          <button
            onClick={recording ? stopRecording : startRecording}
            className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg active:scale-95 ${recording ? "bg-gradient-to-br from-rose-500 to-red-600 shadow-red-500/30 animate-pulse" : "bg-gradient-to-br from-teal-400 to-emerald-500 shadow-emerald-500/30"}`}
          >
            <Mic className="h-9 w-9" />
          </button>
          <p className="text-xs font-bold text-muted-foreground">{recording ? "جارٍ التسجيل... اضغط للإيقاف" : "اضغط للبدء بالتسجيل"}</p>
          <button
            onClick={playing ? stopAudio : playSurah}
            className="mx-auto flex items-center gap-1.5 rounded-full bg-secondary border border-border px-4 py-2 text-xs font-extrabold text-secondary-foreground active:scale-95"
          >
            <Headphones className="h-4 w-4" /> {playing ? "إيقاف الصوت" : "أعد الاستماع قبل التسجيل 🔊"}
          </button>
          {transcript && (
            <p className="mx-auto max-w-xl rounded-xl bg-secondary/60 p-2 text-xs font-bold text-secondary-foreground" dir="rtl">
              سمعتُ: {transcript}
            </p>
          )}
          <button
            onClick={() => { setMatchPct(100); addCoins(10); setStarsEarned(n => n + 10); setPhase("done"); }}
            className="mx-auto block rounded-full bg-secondary border border-border px-5 py-2 text-xs font-extrabold active:scale-95"
          >
            {speechSupported ? "تأكيد يدوي (أكملت الحفظ) ✔" : "التعرّف الصوتي غير مدعوم — أكمل يدوياً ✔"}
          </button>
        </div>
      )}

      {/* المرحلة ٤: النتيجة */}
      {(phase === "verify" || phase === "done") && (
        <div className="space-y-3">
          {phase === "done" ? (
            <>
              <p className="text-2xl font-extrabold text-success">🎉 ما شاء الله! حفظ ممتاز</p>
              <p className="text-sm font-bold text-foreground">
                تطابق النطق مع السورة: <span className="text-accent">{matchPct}%</span>
              </p>
              <p className="text-xs font-bold text-muted-foreground">ربحت ١٠ نجوم ⭐ — لننتقل إلى السورة التالية</p>
              <button
                onClick={goNextSurah}
                className="mx-auto block rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 px-7 py-3 text-base font-extrabold text-white shadow-lg shadow-amber-500/30 active:scale-95"
              >
                السورة التالية ←
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-extrabold text-destructive">لم يكتمل الحفظ بعد 🌱</p>
              <p className="text-sm font-bold text-foreground">
                تطابق النطق: <span className="text-accent">{matchPct}%</span> — نحتاج {Math.round(PASS_RATIO * 100)}%
              </p>
              <div className="flex items-center justify-center gap-2">
                <button onClick={restart} className="flex items-center gap-1.5 rounded-full bg-secondary px-5 py-2.5 text-sm font-extrabold active:scale-95 border border-border">
                  <RotateCcw className="h-4 w-4" /> أعد المحاولة
                </button>
                <button onClick={() => setPhase("record")} className="flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-sm font-extrabold active:scale-95">
                  <Mic className="h-4 w-4" /> سجِّل من جديد
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

