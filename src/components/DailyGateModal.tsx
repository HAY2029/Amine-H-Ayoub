/**
 * بوابة السؤال اليومي في منطقة الألعاب:
 * - تُعرض سورة الطفل الحالية بآياتها، ويستمع لها بصوته من السيرفر.
 * - يُسجّل الطفل السورة بصوته، فيتحقّق النظام من حفظه (تطابق ≥ 60%).
 * - عند النجاح فقط → الانتقال إلى السورة التالية + نقاط مكافأة مجانية.
 * - عند بلوغ كل درجة (عدد السور المحدد من الإعدادات — افتراضي 5) يحصل الطفل على لقب جديد
 *   + يمكنه تحميل شهادة (الاسم والرقم قابلان للتعديل قبل التحميل).
 * - إدخال كود نقاط مجانية لمرة واحدة (يُنشأ من admin.html).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Award, BookOpen, Check, Download, Gift, Headphones, Mic, RotateCcw, Trophy, X } from "lucide-react";
import { getProfile, setCurrentSurah, addCoins, formatCoins, getActiveId, getCoins } from "../data/kidsProfile";
import { getAllSurahs } from "../data/quranData";
import { getSurahAudioUrl } from "../data/audioUrls";
import { ensureCorpus, normalizeArabic, type SurahText } from "../data/quranText";
import { getTitlesConfig, levelForCompleted, titleForLevel, redeemOneTimeCode } from "../data/titles";
import { toast } from "../hooks/use-toast";

// مرتبة بترتيب المصحف — التقدّم دائماً إلى السورة التالية للأمام
const SURAHS = [...getAllSurahs()].sort((a, b) => a.number - b.number);
const CORRECT_REWARD = 10; // نقاط مجانية عند إتمام الحفظ بنجاح
const PASS_RATIO = 0.6; // نسبة القبول: 60% من الكلمات صحيحة

// واجهة التعرف على الكلام (غير موحّدة في TS)
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

const gateKey = (pid: string) => `mushaf:dailyGate:${new Date().toISOString().slice(0, 10)}:${pid}`;

/** هل فُتحت الألعاب اليوم؟ (يقرأ تقدّم الملف النشط) */
function isGamesUnlocked(): boolean {
  try {
    const id = getActiveId() || "default";
    const raw = localStorage.getItem(`mushaf:kidsProgress:v1:${id}`);
    if (!raw) return true;
    const p = JSON.parse(raw);
    return !!p?.unlocked;
  } catch { return true; }
}

export default function DailyGateModal() {
  const [open, setOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [certLevel, setCertLevel] = useState(0);
  const [certName, setCertName] = useState("");
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState("");

  // ── مراحل الحفظ: استمع ← سجِّل ← تحقّق ──
  const [surah, setSurah] = useState<SurahText | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [matchPct, setMatchPct] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);
  const [nextName, setNextName] = useState<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = useMemo(() => getSpeechRecognition() !== null, []);

  const profile = getProfile();
  const cfg = getTitlesConfig();
  const curNum = profile.currentSurah || 1;
  const completedIdx = useMemo(() => {
    const i = SURAHS.findIndex(s => s.number === curNum);
    return i >= 0 ? i : 0;
  }, [curNum]);
  const currentLevel = levelForCompleted(completedIdx, cfg);

  // ── تحميل نصّ السورة الحالية من المخزون المحلي ──
  useEffect(() => {
    if (!open) return;
    let alive = true;
    ensureCorpus().then(list => {
      if (!alive) return;
      setSurah(list.find(s => s.app === curNum) || list[0] || null);
    }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [open, curNum]);

  const audioUrl = useMemo(() => getSurahAudioUrl(curNum), [curNum]);

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

  // إيقاف الصوت والتسجيل عند الإغلاق أو الخروج
  useEffect(() => {
    if (open) return;
    stopAudio();
    try { recRef.current?.abort(); } catch { /* ignore */ }
  }, [open, stopAudio]);

  useEffect(() => () => {
    stopAudio();
    try { recRef.current?.abort(); } catch { /* ignore */ }
  }, [stopAudio]);

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

  const stopRecording = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setRecording(false);
  }, []);

  /** التحقّق من الحفظ وترقية الطفل للسورة التالية عند النجاح. */
  const finish = useCallback((heard: string, forced = false) => {
    if (!surah) return;
    const expected = surah.ayahs.map(a => a.text).join(" ");
    const pct = forced ? 1 : similarity(expected, heard);
    const ok = pct >= PASS_RATIO;
    setMatchPct(Math.round(pct * 100));
    setPassed(ok);
    try { localStorage.setItem(gateKey(getActiveId() || "default"), "1"); } catch { /* ignore */ }

    if (ok) {
      const next = SURAHS.find(s => s.number > curNum) || SURAHS[SURAHS.length - 1];
      if (next) { setCurrentSurah(next.number); setNextName(next.name); }
      addCoins(CORRECT_REWARD);
      toast({ title: `🎉 ما شاء الله! حفظ ممتاز — انتقلت إلى سورة ${next?.name}`, description: `+${CORRECT_REWARD} ⭐ نقاط مجانية` });
      const nextIdx = Math.max(0, SURAHS.findIndex(s => s.number === (next?.number ?? curNum)));
      const newLevel = levelForCompleted(nextIdx, cfg);
      if (newLevel > currentLevel) {
        setCelebrate(titleForLevel(newLevel, cfg));
        setCertLevel(newLevel);
        setCertName(profile.name || "");
        window.dispatchEvent(new Event("mushaf:activeprofile"));
      }
    } else {
      toast({ title: "لم يكتمل الحفظ بعد 🌱", description: "اسمع السورة مرة أخرى ثم سجِّل صوتك" });
    }
  }, [surah, curNum, cfg, currentLevel, profile.name]);

  // تحقّق بعد إيقاف التسجيل
  useEffect(() => {
    if (!open || recording || !transcript || matchPct !== null) return;
    const t = window.setTimeout(() => finish(transcript), 400);
    return () => window.clearTimeout(t);
  }, [open, recording, transcript, matchPct, finish]);

  const retry = () => {
    stopAudio();
    setTranscript("");
    setMatchPct(null);
    setPassed(false);
  };

  const closeGate = () => {
    stopAudio();
    try { recRef.current?.abort(); } catch { /* ignore */ }
    setOpen(false);
  };

  useEffect(() => {
    const pid = getActiveId() || "default";
    if (localStorage.getItem(gateKey(pid))) return;
    const tryOpen = () => {
      if (!localStorage.getItem(gateKey(getActiveId() || "default")) && isGamesUnlocked()) {
        setOpen(true);
      }
    };

    tryOpen();
    window.addEventListener("mushaf:games_unlocked", tryOpen);
    return () => window.removeEventListener("mushaf:games_unlocked", tryOpen);
  }, []);

  const redeem = () => {
    // تحقق كل مستخدم: استبدال أكواد النقاط متاح للمستخدمين الموثّقين فقط (يُوثّقهم المشرف من admin.html)
    if (!getProfile().verified) {
      setCodeMsg("⛔ حسابك غير موثّق — اطلب من المشرف توثيق حسابك أولاً");
      return;
    }
    const amount = redeemOneTimeCode(code);
    if (amount < 0) { setCodeMsg("❌ كود غير صالح أو مستخدماً من قبل"); return; }
    addCoins(amount);
    setCodeMsg(`✅ تم إضافة ${amount} ⭐ مجاناً!`);
    setCode("");
    toast({ title: `🎁 +${amount} ⭐ نقاط مجانية` });
  };

  const downloadCertificate = (level: number, name: string) => {
    const title = titleForLevel(level, cfg);
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>شهادة</title>
<style>body{font-family:'Amiri',serif;background:#fdf6e3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.c{border:10px double #b8860b;border-radius:24px;padding:60px 80px;text-align:center;background:#fff;box-shadow:0 0 60px rgba(184,134,11,.4)}
h1{color:#8b6914;font-size:32px}h2{font-size:44px;color:#c0392b;margin:30px 0}p{font-size:22px;color:#444}
.badge{font-size:26px;color:#fff;background:linear-gradient(90deg,#b8860b,#daa520);border-radius:50px;padding:10px 40px;display:inline-block;margin:20px 0}
.num{font-size:20px;color:#666;margin-top:30px}</style></head><body>
<div class="c"><h1>${cfg.certificateHeader}</h1><p>تشهد إدارة التطبيق أن الطفل</p><h2>${name || "الطفل المتميز"}</h2>
<p>قد أتمّ بنجاح <b>${level * cfg.surahsPerLevel} سورة/جزءاً</b> ونال اللقب</p>
<div class="badge">🏅 ${title}</div>
<p class="num">رقم الشهادة: CERT-${String(level).padStart(3, "0")}-${new Date().getFullYear()} — التاريخ: ${new Date().toLocaleDateString("ar")}</p></div></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `شهادة-${name || "الطفل"}-${level}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // منع المستخدم المحظور من دخول منطقة الألعاب
  if (getProfile().blocked) {
    return (
      <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm bg-card rounded-3xl shadow-2xl border-2 border-rose-500/50 p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-500 text-3xl">🚫</div>
          <h2 className="text-xl font-extrabold text-foreground">تم إيقاف حسابك مؤقتاً</h2>
          <p className="text-sm text-muted-foreground font-bold">راجع وليّ الأمر أو المشرف لإعادة تفعيل الحساب.</p>
        </div>
      </div>
    );
  }

  if (!open) {
    if (celebrate) {
      return (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-gradient-to-b from-amber-900/95 to-yellow-900/95 rounded-3xl shadow-2xl border-2 border-amber-400/50 p-8 text-center space-y-5 animate-fade-up">
            <div className="mx-auto w-20 h-20 rounded-full bg-amber-400/20 border border-amber-300/50 flex items-center justify-center text-amber-300 animate-bounce"><Award className="w-12 h-12" /></div>
            <h2 className="text-2xl font-extrabold text-amber-300">🏅 لقب جديد: {celebrate}</h2>
            <p className="text-amber-100 text-sm">ما شاء الله! أتممت {certLevel * cfg.surahsPerLevel} سورة/جزء ونلت لقب جديد.</p>
            <input value={certName} onChange={e => setCertName(e.target.value)} placeholder="اكتب اسمك للشهادة" className="w-full px-4 py-2 rounded-xl bg-black/30 border border-amber-400/40 text-amber-100 text-center font-bold" />
            <button onClick={() => downloadCertificate(certLevel, certName)} className="w-full p-3 rounded-xl bg-gradient-to-l from-amber-400 to-amber-500 text-black font-bold flex items-center justify-center gap-2 active:scale-95"><Download className="w-5 h-5" /> تحميل الشهادة</button>
            <button onClick={() => setCelebrate(null)} className="w-full p-2.5 rounded-xl bg-white/10 text-amber-200 font-bold hover:bg-white/20">متابعة</button>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-card rounded-3xl shadow-2xl border border-border p-5 sm:p-6 space-y-4 animate-fade-up max-h-[92vh] overflow-y-auto">
        <audio ref={audioRef} src={audioUrl} preload="auto" onEnded={() => setPlaying(false)} className="hidden" />

        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-accent" /> حفظ سورة {surah?.name || SURAHS.find(s => s.number === curNum)?.name}
          </h3>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent">🏅 لقبك: {titleForLevel(currentLevel, cfg)}</span>
        </div>

        {/* المرحلة ١: الاستماع + عرض الآيات */}
        <div className="rounded-2xl border-2 border-accent/25 bg-secondary/30 p-3 space-y-3">
          <button
            onClick={playing ? stopAudio : playSurah}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-lg shadow-amber-500/30 active:scale-95"
          >
            <Headphones className="h-7 w-7" />
          </button>
          <p className="text-center text-xs font-bold text-muted-foreground">{playing ? "جارٍ التشغيل... اضغط للإيقاف" : "اضغط للاستماع للسورة"}</p>

          {surah ? (
            <div className="max-h-52 overflow-y-auto custom-scrollbar rounded-xl bg-background/70 border border-border p-3 text-right leading-loose" dir="rtl">
              {surah.ayahs.map((a) => (
                <span key={a.n} className="text-sm sm:text-base font-bold text-foreground">
                  {a.text}
                  <span className="mx-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[10px] text-accent align-middle">{a.n}</span>{" "}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs font-bold text-muted-foreground py-4">جارٍ تحميل نصّ السورة...</p>
          )}
        </div>

        {/* المرحلة ٢: التسجيل والتحقق */}
        <div className="rounded-2xl border-2 border-border bg-secondary/20 p-3 space-y-3">
          <p className="text-center text-sm font-extrabold text-foreground">
            الآن اسمعني سورة <span className="text-accent">{surah?.name}</span> بصوتك 🎤
          </p>
          <button
            onClick={recording ? stopRecording : startRecording}
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg active:scale-95 ${recording ? "bg-gradient-to-br from-rose-500 to-red-600 shadow-red-500/30 animate-pulse" : "bg-gradient-to-br from-teal-400 to-emerald-500 shadow-emerald-500/30"}`}
          >
            <Mic className="h-7 w-7" />
          </button>
          <p className="text-center text-xs font-bold text-muted-foreground">{recording ? "جارٍ التسجيل... اضغط للإيقاف" : "اضغط للبدء بالتسجيل"}</p>

          {transcript && (
            <p className="rounded-xl bg-background/70 border border-border p-2 text-xs font-bold text-foreground" dir="rtl">
              سمعتُ: {transcript}
            </p>
          )}

          {matchPct === null ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => finish("", true)}
                className="rounded-full bg-secondary border border-border px-4 py-2 text-xs font-extrabold active:scale-95"
              >
                {speechSupported ? "تأكيد يدوي (أكملت الحفظ) ✔" : "التعرّف الصوتي غير مدعوم — أكمل يدوياً ✔"}
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-center">
              {passed ? (
                <>
                  <p className="text-lg font-extrabold text-emerald-500">🎉 ما شاء الله! حفظ ممتاز</p>
                  <p className="text-sm font-bold text-foreground">
                    تطابق النطق: <span className="text-accent">{matchPct}%</span> — انتقلت إلى سورة <span className="text-accent">{nextName}</span>
                  </p>
                  <p className="text-xs font-bold text-muted-foreground">ربحت {CORRECT_REWARD} ⭐ نقاط مجانية</p>
                </>
              ) : (
                <>
                  <p className="text-base font-extrabold text-rose-500">لم يكتمل الحفظ بعد 🌱</p>
                  <p className="text-sm font-bold text-foreground">
                    تطابق النطق: <span className="text-accent">{matchPct}%</span> — نحتاج {Math.round(PASS_RATIO * 100)}%
                  </p>
                  <button onClick={retry} className="mx-auto flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground px-5 py-2 text-sm font-extrabold active:scale-95">
                    <RotateCcw className="h-4 w-4" /> أعد المحاولة
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* كود النقاط المجانية (مرة واحدة) */}
        <div className="bg-secondary/40 rounded-2xl p-3 space-y-2">
          <p className="text-xs font-bold text-muted-foreground flex items-center gap-1"><Gift className="w-3.5 h-3.5" /> كود نقاط مجانية (يُستخدم مرة واحدة)</p>
          <div className="flex gap-2">
            <input value={code} onChange={e => { setCode(e.target.value); setCodeMsg(""); }} placeholder="مثال: ABC12345"
              className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-sm font-bold text-center" />
            <button onClick={redeem} disabled={!code.trim()} className="px-4 py-2 rounded-xl bg-accent text-white font-bold text-sm active:scale-95 disabled:opacity-40 flex items-center gap-1"><Gift className="w-4 h-4" /> تفعيل</button>
          </div>
          {codeMsg && <p className="text-xs font-bold text-center text-accent">{codeMsg}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground font-bold flex items-center gap-1">رصيدك: {formatCoins(getCoins())} ⭐</span>
          <button onClick={closeGate} className="p-2 rounded-xl bg-secondary text-secondary-foreground hover:bg-destructive/20" title="إغلاق"><X className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}