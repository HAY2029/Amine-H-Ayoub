import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Upload, Play, Pause, Save, Trash2, GraduationCap, Baby, Loader2, CheckCircle2, RotateCcw, SkipBack, SkipForward, Link2 } from "lucide-react";
import { ensureCorpus, type SurahText } from "@/data/quranText";
import { getSurahTimings, saveSurahTimings, AYAH_COUNTS, type SurahTimings, type AudioSegment } from "@/data/ayahTimings";
import { getPageAyahBoxes, savePageAyahBoxes, getAllPageSources } from "@/data/ayahCoordinates";
import { getCustomPages } from "@/data/customPages";
import { useToast } from "@/hooks/use-toast";

/**
 * صفحة التظليل المزدوج (معلم 🧑‍🏫 / طفل 🧒)
 *
 * الفكرة: ترفع ملفاً صوتياً (يدوياً) يحتوي تلاوة المعلم ثم تلاوة الطفل،
 * وتشغّله، وكل آية تتظلّل بلونين: أخضر للمعلم وأصفر للطفل.
 * التوقيقات تُحفظ في نظام ayahTimings الموجود (localStorage + Supabase)
 * فتُستخدم أيضاً في المصحف وصفحات التلاوة الأخرى.
 *
 * NOTE: النسخة 2 — تم تجميعها مرة أخرى لضمان تضمين رفع الملف.
 */

const SURAH_NAMES: Record<number, string> = {
  1: "الفاتحة", 2: "الناس", 3: "الفلق", 4: "الإخلاص", 5: "المسد",
  6: "النصر", 7: "الكافرون", 8: "الكوثر", 9: "الماعون", 10: "قريش",
  11: "الفيل", 12: "الهمزة", 13: "العصر", 14: "التكاثر",
};

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const d = Math.floor((s % 1) * 10);
  return `${m}:${String(r).padStart(2, "0")}.${d}`;
};

export default function ShadingPage() {
  const [params] = useSearchParams();
  const { toast } = useToast();
  const initialSurah = Number(params.get("surah")) || 1;

  const [corpus, setCorpus] = useState<SurahText[]>([]);
  const [surah, setSurah] = useState<number>(initialSurah);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [audioName, setAudioName] = useState<string>("");
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);

  // التوقيتات المحلية للتحرير (قبل الحفظ)
  const [teacher, setTeacher] = useState<number[]>([]);
  const [kids, setKids] = useState<number[]>([]);
  const [kidsStart, setKidsStart] = useState<number | null>(null);
  // مقاطع التقسيم السابق (من /audio-splitter) إن وُجدت
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [linking, setLinking] = useState(false);

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const surahText = useMemo(() => corpus.find((s) => s.app === surah), [corpus, surah]);
  const ayahCount = AYAH_COUNTS[surah] || surahText?.ayahs.length || 0;

  // تحميل النص + التوقيتات المحفوظة
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const c = await ensureCorpus();
      if (!alive) return;
      setCorpus(c);
      const t = getSurahTimings(initialSurah);
      if (t) {
        setTeacher([...(t.teacher || [])]);
        setKids(t.kids ? [...t.kids] : []);
        setKidsStart(typeof t.kidsStart === "number" ? t.kidsStart : null);
        setSegments(Array.isArray(t.segments) ? t.segments : []);
      } else {
        setTeacher([]);
        setKids([]);
        setKidsStart(null);
        setSegments([]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [initialSurah]);

  // عند تغيير السورة: أعد تحميل توقيتاتها
  useEffect(() => {
    if (loading) return;
    const t = getSurahTimings(surah);
    setTeacher([...(t?.teacher || [])]);
    setKids(t?.kids ? [...t.kids] : []);
    setKidsStart(typeof t?.kidsStart === "number" ? t.kidsStart : null);
    setSegments(Array.isArray(t?.segments) ? t!.segments! : []);
    setSaved(false);
  }, [surah, loading]);

  // تنظيف رابط الملف عند الإغلاق
  useEffect(() => {
    return () => {
      if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // المزامنة أثناء التشغيل
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurTime(el.currentTime);
    const onEnd = () => { setPlaying(false); setCurTime(el.duration || 0); };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", () => setDuration(el.duration || 0));
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
    };
  }, [audioUrl]);

  /**
   * الآية الحالية والمتحدّث في هذه اللحظة (حسب التوقيتات المحلية).
   * نعتمد: إذا مرّرنا kidsStart → قائمة kids، وإلا قائمة teacher.
   */
  const current = useMemo(() => {
    const t = curTime;
    const inKids = kidsStart !== null && t >= kidsStart;
    const list = inKids && kids.length > 0 ? kids : teacher;
    if (list.length === 0) return { ayah: 0, speaker: inKids ? "kids" : "teacher" };
    let idx = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i] <= t + 0.05) idx = i;
      else break;
    }
    const speaker = inKids ? "kids" : "teacher";
    // إن كانت القائمة قصيرة (لم يُظلّل كل شيء بعد) نتجاوز خارج المدى
    if (idx >= list.length) return { ayah: 0, speaker };
    return { ayah: idx + 1, speaker };
  }, [curTime, teacher, kids, kidsStart]);

  // ─── رفع الملف ───────────────────────────────────────────────
  const onFile = useCallback((f: File | null) => {
    if (!f) return;
    if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(f);
    setAudioUrl(url);
    setAudioName(f.name);
    setPlaying(false);
    setCurTime(0);
  }, [audioUrl]);

  // ─── التحكم في التشغيل ──────────────────────────────────────
  const toggle = () => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const seek = (t: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(t, el.duration || 0));
    setCurTime(el.currentTime);
  };

  const bump = (delta: number) => seek(curTime + delta);

  // ─── تسجيل التوقيتات أثناء التشغيل ───────────────────────────
  /** يضبط بداية قسم الطفل في اللحظة الحالية */
  const markKidsStart = () => setKidsStart(curTime);

  /** يسجّل توقيت بداية آية معيّنة للمتحدّث الحالي (دقة عُشر الثانية) */
  const markAyah = (n: number) => {
    const t = Math.round(curTime * 10) / 10;
    const inKids = kidsStart !== null && curTime >= kidsStart;
    if (inKids) {
      setKids((prev) => { const next = [...prev]; next[n - 1] = t; return next; });
    } else {
      setTeacher((prev) => { const next = [...prev]; next[n - 1] = t; return next; });
    }
  };

  /** يضبط توقيت آية يدوياً (من مربع الإدخال) */
  const setAyahTime = (n: number, value: string, speaker: "teacher" | "kids") => {
    const t = parseFloat(value);
    if (!isFinite(t)) return;
    if (speaker === "kids") {
      setKids((prev) => { const next = [...prev]; next[n - 1] = t; return next; });
    } else {
      setTeacher((prev) => { const next = [...prev]; next[n - 1] = t; return next; });
    }
  };

  // ─── الحفظ ─────────────────────────────────────────────────
  const doSave = async () => {
    const clean = (arr: number[]) => arr.filter((t) => typeof t === "number" && isFinite(t));
    const payload: SurahTimings = {
      teacher: clean(teacher),
      kids: kids.length ? clean(kids) : undefined,
      kidsStart: kidsStart ?? undefined,
      segments: segments.length ? segments : undefined,
    };
    await saveSurahTimings(surah, payload);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const resetAll = () => {
    setTeacher([]);
    setKids([]);
    setKidsStart(null);
    setSaved(false);
  };

  // ─── ربط التوقيتات بتظليل /calibrate ─────────────────────────
  /**
   * يكتب توقيتات كل آية (معلم/طفل) داخل مربّعات التظليل المطابقة
   * عبر كل صفحات المصحف — نفس آلية /audio-splitter بالضبط.
   * المصدر: مقاطع التقسيم السابق (segments)، أو teacher/kids يدوياً.
   */
  const linkToCalibrateShading = useCallback(async () => {
    setLinking(true);
    try {
      // بناء مقاطع من teacher/kids إذا لم توجد segments من المقسّم
      let segs: AudioSegment[] = segments.filter((s) => typeof s.start === "number");
      if (segs.length === 0) {
        const mk = (arr: number[], speaker: "teacher" | "kids") =>
          arr.map((start, i) => ({
            id: `${speaker}-${i}`,
            start,
            end: arr[i + 1] ?? start + 8,
            speaker,
            ayah: i + 1,
            label: `آية ${i + 1}`,
          })).filter((s) => typeof s.start === "number" && isFinite(s.start));
        segs = [...mk(teacher, "teacher"), ...mk(kids, "kids")];
      }
      const tByAyah = new Map<number, AudioSegment>();
      const kByAyah = new Map<number, AudioSegment>();
      segs.forEach((s) => {
        if (!s.ayah || s.ayah < 1) return;
        if (s.speaker === "kids") { if (!kByAyah.has(s.ayah)) kByAyah.set(s.ayah, s); }
        else { if (!tByAyah.has(s.ayah)) tByAyah.set(s.ayah, s); }
      });
      if (tByAyah.size === 0 && kByAyah.size === 0) {
        toast({ title: "لا توجد توقيتات للربط", description: "سجّل توقيتات الآيات أولاً ثم اربط.", variant: "destructive" });
        return;
      }
      const allSrcs = [...getAllPageSources(), ...getCustomPages().map((p) => p.src)];
      let linked = 0;
      for (const src of allSrcs) {
        const boxes = getPageAyahBoxes(src);
        if (!boxes.some((b) => b.surah === surah)) continue;
        let changed = false;
        const next = boxes.map((b) => {
          if (b.surah !== surah) return b;
          const t = tByAyah.get(b.ayah), k = kByAyah.get(b.ayah);
          if (!t && !k) return b;
          changed = true; linked++;
          return {
            ...b,
            audioStart: t ? t.start : b.audioStart,
            audioEnd: t ? t.end : b.audioEnd,
            kidsStart: k ? k.start : b.kidsStart,
            kidsEnd: k ? k.end : b.kidsEnd,
          };
        });
        if (changed) await savePageAyahBoxes(src, next);
      }
      toast({
        title: linked > 0 ? `تم ربط ${linked} آية بالتظليل ✅` : "لم تُربط آيات",
        description: linked > 0 ? `سورة ${SURAH_NAMES[surah] || surah} — التظليل سيظهر في /calibrate والمصحف` : "لا توجد مربعات تظليل لهذه السورة بعد — ظلّلها في /calibrate أولاً.",
        variant: linked > 0 ? "default" : "destructive",
      });
    } finally {
      setLinking(false);
    }
  }, [segments, teacher, kids, surah]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <span className="text-sm font-bold">جاري تحميل النص...</span>
        </div>
      </div>
    );
  }

  const hasBoth = kidsStart !== null && kids.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-background to-background" dir="rtl">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
        className="hidden"
        onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ""; }}
      />
            <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" className="hidden" />

      {/* ملف الصوت المخفّي — هذا العنصر كان مفقوداً */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ""; }}
      />

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* الرأس: السورة + الحفظ */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-3 py-2">
            <span className="text-emerald-400 text-2xl">🖍️</span>
            <div>
              <div className="font-black text-foreground text-sm">التظليل المزدوج</div>
              <div className="text-[11px] text-muted-foreground">معلم 🧑‍🏫 أخضر · طفل 🧒 أصفر</div>
            </div>
          </div>

          <select
            value={surah}
            onChange={(e) => setSurah(Number(e.target.value))}
            className="rounded-xl bg-card border border-border px-3 py-2 text-sm font-bold"
          >
            {Object.entries(SURAH_NAMES).map(([n, name]) => (
              <option key={n} value={n}>{name}</option>
            ))}
          </select>

          <div className="flex-1" />

          <button
            onClick={doSave}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-black transition-all active:scale-95 ${
              saved
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500 hover:text-white"
            }`}
          >
            {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "حُفظ!" : "حفظ التوقيت"}
          </button>

          <button
            onClick={resetAll}
            title="مسح توقيتات هذه السورة"
            className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 p-2 hover:bg-red-500 hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* شريط التقسيم السابق + الربط بالتظليل */}
        {audioUrl && segments.length > 0 && (
          <div className="rounded-2xl bg-sky-500/10 border border-sky-500/30 p-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="font-black text-sky-300 text-sm flex items-center gap-1.5">
                <Link2 className="w-4 h-4" /> تقسيم سابق مكتشف ({segments.length} مقطع)
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                هذا الملف قُسِّم سابقاً في المقسّم — التوقيتات جاهزة. الاربط بالتظليل أو عدّلها يدوياً.
              </div>
            </div>
          </div>
        )}

        {/* زر الربط الرئيسي */}
        {audioUrl && (
          <button
            onClick={linkToCalibrateShading}
            disabled={linking}
            className="w-full py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 bg-sky-600 text-white shadow-lg shadow-sky-600/30 hover:bg-sky-500"
          >
            {linking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5" />}
            {linking ? "جارٍ الربط..." : "🔗 اربط التوقيتات بالتظليل (/calibrate)"}
          </button>
        )}
        {/* رفع الصوت أو المشغّل */}
        {!audioUrl ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-3xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 p-10 flex flex-col items-center gap-3 hover:bg-emerald-500/10 hover:border-emerald-500/70 transition-colors"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Upload className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="font-black text-foreground">ارفع الصوت (معلم + طفل)</div>
            <div className="text-xs text-muted-foreground text-center leading-relaxed">
              ملف واحد يبدأ بتلاوة المعلم ثم تلاوة الطفل<br />
              mp3 / wav / m4a / ogg
            </div>
          </button>
        ) : (
          <>
            {/* المشغّل */}
            <div className="rounded-3xl bg-card border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black truncate">{audioName}</div>
                  <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                    {fmt(curTime)} / {fmt(duration)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button onClick={() => bump(-5)} title="رجوع 5 ثوان" className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center hover:bg-secondary/70 transition-colors">
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    onClick={toggle}
                    className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95 ${
                      playing ? "bg-red-500 shadow-red-500/30" : "bg-emerald-600 shadow-emerald-600/30"
                    }`}
                  >
                    {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 mr-0.5" />}
                  </button>
                  <button onClick={() => bump(5)} title="تقدّم 5 ثوان" className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center hover:bg-secondary/70 transition-colors">
                    <SkipForward className="w-4 h-4" />
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} title="ملف آخر" className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center hover:bg-secondary/70 transition-colors">
                    <Upload className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* شريط التقدّم: أخضر للمعلم، أصفر لقسم الطفل */}
              <div
                className="relative h-3 rounded-full bg-secondary overflow-hidden cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = (rect.right - e.clientX) / rect.width;
                  seek(ratio * (duration || 0));
                }}
              >
                {kidsStart !== null && duration > 0 && (
                  <div className="absolute inset-y-0 bg-amber-400/25" style={{ right: `${(kidsStart / duration) * 100}%`, left: 0 }} />
                )}
                <div
                  className="absolute inset-y-0 right-0 bg-emerald-500"
                  style={{ width: `${duration > 0 ? (curTime / duration) * 100 : 0}%` }}
                />
                {kidsStart !== null && duration > 0 && (
                  <div className="absolute inset-y-0 w-1 bg-amber-400" style={{ right: `${(kidsStart / duration) * 100}%` }} />
                )}
              </div>

              {/* زر بداية الطفل */}
              <button
                onClick={markKidsStart}
                className={`w-full py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                  kidsStart !== null
                    ? "bg-amber-400/15 text-amber-500 border border-amber-400/40"
                    : "bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/30"
                }`}
              >
                <Baby className="w-4 h-4" />
                {kidsStart !== null ? `يبدأ الطفل عند ${fmt(kidsStart)} — اضغط للتعديل` : "🧒 اضغط هنا عندما يبدأ صوت الطفل"}
              </button>
            </div>

            {/* قائمة الآيات مع التظليل المزدوج */}
            <div className="space-y-2">
              {surahText?.ayahs.slice(0, ayahCount).map((a, i) => {
                const n = a.n;
                const tStart = teacher[i];
                const kStart = kids[i];
                const isTeacherActive = current.speaker === "teacher" && current.ayah === n;
                const isKidsActive = current.speaker === "kids" && current.ayah === n;
                const tNext = teacher[i + 1];
                const kNext = kids[i + 1];

                return (
                  <div
                    key={n}
                    className={`rounded-2xl border p-3 transition-all duration-300 ${
                      isTeacherActive
                        ? "border-emerald-500 bg-emerald-500/15 shadow-lg shadow-emerald-500/10 scale-[1.01]"
                        : isKidsActive
                        ? "border-amber-400 bg-amber-400/15 shadow-lg shadow-amber-400/10 scale-[1.01]"
                        : "border-border bg-card/60"
                    }`}
                  >
                    {(isTeacherActive || isKidsActive) && (
                      <div className="flex items-center gap-1.5 mb-2">
                        {isTeacherActive && (
                          <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-black rounded-full px-2 py-0.5">
                            <GraduationCap className="w-3 h-3" /> المعلم يتلو الآن
                          </span>
                        )}
                        {isKidsActive && (
                          <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-[10px] font-black rounded-full px-2 py-0.5">
                            <Baby className="w-3 h-3" /> الطفل يلوّ الآن
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                        isTeacherActive ? "bg-emerald-600 text-white" : isKidsActive ? "bg-amber-400 text-amber-950" : "bg-secondary text-secondary-foreground"
                      }`}>
                        {n}
                      </div>

                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-xl leading-loose text-foreground" style={{ fontFamily: "'Amiri Quran', 'Amiri', serif" }}>{a.text}</p>

                        {/* التوقيتات: معلم | طفل */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap" dir="ltr">
                          <div className={`flex items-center gap-1 rounded-lg px-2 py-1 ${tStart !== undefined ? "bg-emerald-500/10 text-emerald-400" : "bg-secondary/50 text-muted-foreground"}`}>
                            <GraduationCap className="w-3 h-3" />
                            <input
                              type="number"
                              step="0.1"
                              value={tStart ?? ""}
                              placeholder="—"
                              onChange={(e) => setAyahTime(n, e.target.value, "teacher")}
                              className="w-14 bg-transparent text-xs font-mono outline-none placeholder:text-muted-foreground/50"
                            />
                            <button onClick={() => markAyah(n)} title="اضبط للتوقيت الحالي" className="text-emerald-500 hover:text-emerald-300 text-xs">⏱</button>
                            {tStart !== undefined && tNext !== undefined && <span className="text-[9px] text-muted-foreground">→{fmt(tNext)}</span>}
                          </div>

                          {hasBoth && (
                            <div className={`flex items-center gap-1 rounded-lg px-2 py-1 ${kStart !== undefined ? "bg-amber-400/10 text-amber-500" : "bg-secondary/50 text-muted-foreground"}`}>
                              <Baby className="w-3 h-3" />
                              <input
                                type="number"
                                step="0.1"
                                value={kStart ?? ""}
                                placeholder="—"
                                onChange={(e) => setAyahTime(n, e.target.value, "kids")}
                                className="w-14 bg-transparent text-xs font-mono outline-none placeholder:text-muted-foreground/50"
                              />
                              <button onClick={() => markAyah(n)} title="اضبط للتوقيت الحالي" className="text-amber-500 hover:text-amber-300 text-xs">⏱</button>
                              {kStart !== undefined && kNext !== undefined && <span className="text-[9px] text-muted-foreground">→{fmt(kNext)}</span>}
                            </div>
                          )}

                          {(tStart !== undefined || kStart !== undefined) && (
                            <button
                              onClick={() => {
                                const src = tStart !== undefined ? tStart : kStart;
                                const end = tStart !== undefined ? (tNext ?? src + 8) : (kNext ?? src + 8);
                                seek(src);
                                audioRef.current?.play().then(() => setPlaying(true)).catch(() => {});
                                setTimeout(() => { audioRef.current?.pause(); setPlaying(false); }, Math.max(1000, (end - src) * 1000));
                              }}
                              className="text-muted-foreground hover:text-foreground text-xs"
                              title="استمع لهذه الآية"
                            >
                              ▶ سماع
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* إرشادات */}
            <div className="rounded-2xl bg-card border border-border p-4 text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              <div className="font-black text-foreground text-sm mb-1">طريقة الاستخدام السريعة:</div>
              <div>1️⃣ ارفع الملف واضغط تشغيل ▶</div>
              <div>2️⃣ عندما يبدأ <b className="text-emerald-500">المعلم</b> بالآية، اضغط ⏱ بجانبها</div>
              <div>3️⃣ كرّر لكل آية… أو أدخل التوقيت يدوياً في المربعات</div>
              <div>4️⃣ عندما يبدأ <b className="text-amber-500">الطفل</b>، اضغط زر «يبدأ الطفل» 🧒 ثم علّم آياته</div>
              <div>5️⃣ اضغط <b className="text-emerald-400">حفظ التوقيت</b> — تظهر التظلال في المصحف أيضاً</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}