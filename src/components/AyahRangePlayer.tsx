import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Baby, ChevronDown, ChevronUp, GraduationCap, Pause, Play, Repeat, Square, X, Info,
} from "lucide-react";
import { getPageAyahBoxes } from "@/data/ayahCoordinates";
import { getSavedTimings, getSurahTimings, type SurahTimings } from "@/data/ayahTimings";
import { getAudioPath } from "@/data/audioUrls";
import { resolvePlayableAudioUrl } from "@/data/offlineAudioCache";
import { getAllSurahs } from "@/data/quranData";
import { toast } from "@/hooks/use-toast";

/**
 * 🎵 شريط مشغّل المقطع
 * -------------------
 * شريط رقيق فوق المصحف:
 *  - «آيات»: من آية → إلى آية داخل السورة.
 *  - «سور»: من سورة → إلى سورة (تشغيل متتابع ثم تكرار السلسلة).
 *  - الصوت: معلم / طفل / **معًا** (المعلم ثم الطفل لكل آية — تكرار الحفظ).
 *  - سرعة حتى 3× (1.75 / 2 / 2.5 / 3).
 *  - عدد مرات، شريط تقدّم حيّ، وزر طيّ الشريط لسطر واحد.
 */

type Speaker = "teacher" | "kids";
type SpeakerMode = "teacher" | "kids" | "both";
type Mode = "ayah" | "surah";
type Bound = { start: number; end?: number };
type Seg = { surah: number; from: number; to: number; speaker: Speaker };

interface Props {
  open: boolean;
  onClose: () => void;
  surahNumber: number;
  initialAyah?: number;
  pageSrcs: string[];
  onBeforePlay?: () => void;
}

const fmt = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const REPEAT_OPTIONS = [1, 2, 3, 5, 7, 10, 0];

// تنبيه واحد فقط لكل جلسة عند غياب ملف صوت الطفل
let kidsFallbackNotified = false;
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const addBound = (map: Map<number, Bound>, ayah: number, start?: number, end?: number) => {
  if (typeof start !== "number" || !isFinite(start)) return;
  const cur = map.get(ayah);
  if (!cur || start < cur.start) map.set(ayah, { start, end });
  const next = map.get(ayah)!;
  if (typeof end === "number" && isFinite(end) && (next.end === undefined || end > next.end)) {
    next.end = end;
  }
};

const finalizeBounds = (map: Map<number, Bound>) => {
  const ayahs = [...map.keys()].sort((a, b) => a - b);
  ayahs.forEach((ayah, idx) => {
    const cur = map.get(ayah)!;
    const nextStart = idx + 1 < ayahs.length ? map.get(ayahs[idx + 1])!.start : undefined;
    if (cur.end === undefined && nextStart !== undefined) cur.end = nextStart;
    if (cur.end !== undefined && cur.end <= cur.start) delete cur.end;
  });
  return map;
};

const surahLabel = (n: number): string => getAllSurahs().find((s) => s.number === n)?.name || `سورة ${n}`;

export default function AyahRangePlayer({
  open,
  onClose,
  surahNumber,
  initialAyah = 1,
  pageSrcs,
  onBeforePlay,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startRef = useRef(0);
  const endRef = useRef<number | undefined>(undefined);
  const loopRef = useRef(1);
  const repeatsRef = useRef(3);
  const idxRef = useRef(0);
  const switchingRef = useRef(false);
  const loadedRef = useRef("");
  const queueRef = useRef<Seg[]>([]);
  const segRangeRef = useRef<(seg: Seg) => { start: number; end?: number } | null>(() => null);
  const playSegRef = useRef<(idx: number, loop: number) => void>(() => {});
  const speedRef = useRef(1);
  const rafRef = useRef(0);
  const tickRef = useRef<() => void>(() => {});
  const startTickerRef = useRef<() => void>(() => {});

  const [mode, setMode] = useState<Mode>("ayah");
  const [speakerMode, setSpeakerMode] = useState<SpeakerMode>("teacher");
  const [surahNum, setSurahNum] = useState(surahNumber);
  const [fromAyah, setFromAyah] = useState(initialAyah);
  const [toAyah, setToAyah] = useState(initialAyah);
  const [fromSurah, setFromSurah] = useState(surahNumber);
  const [toSurah, setToSurah] = useState(surahNumber);
  const [repeats, setRepeats] = useState(3);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loopIdx, setLoopIdx] = useState(1);
  const [segIdx, setSegIdx] = useState(0);
  const [pos, setPos] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  repeatsRef.current = repeats;
  speedRef.current = speed;

  /* ─────────── حدود كل سورة/آية من مربعات التظليل + التوقيتات ─────────── */
  const allBounds = useMemo(() => {
    const teacher = new Map<number, Map<number, Bound>>();
    const kids = new Map<number, Map<number, Bound>>();
    const surahSet = new Set<number>();

    const ensure = (m: Map<number, Map<number, Bound>>, n: number) => {
      if (!m.has(n)) m.set(n, new Map());
      return m.get(n)!;
    };

    pageSrcs.forEach((src) => {
      let boxes: ReturnType<typeof getPageAyahBoxes> = [];
      try {
        boxes = getPageAyahBoxes(src);
      } catch {
        boxes = [];
      }
      boxes.forEach((b) => {
        if (!(b.surah >= 1 && b.surah <= 114)) return;
        if (!(b.ayah > 0)) return;
        surahSet.add(b.surah);
        addBound(ensure(teacher, b.surah), b.ayah, b.audioStart, b.audioEnd);
        addBound(ensure(kids, b.surah), b.ayah, b.kidsStart, b.kidsEnd);
      });
    });

    const saved = getSavedTimings();
    const nums = new Set<number>([
      ...Object.keys(saved).map(Number),
      ...teacher.keys(),
      ...kids.keys(),
    ]);
    nums.forEach((n) => {
      const raw = saved[n];
      const t: SurahTimings | undefined = Array.isArray(raw)
        ? { teacher: raw }
        : raw || getSurahTimings(n);
      if (!t) return;
      const tStarts = Array.isArray(t.teacher) ? t.teacher : [];
      tStarts.forEach((st, i) => {
        if (typeof st !== "number" || !isFinite(st)) return;
        addBound(ensure(teacher, n), i + 1, st, tStarts[i + 1]);
      });
      const kStarts = Array.isArray(t.kids) ? t.kids : [];
      kStarts.forEach((st, i) => {
        if (typeof st !== "number" || !isFinite(st)) return;
        addBound(ensure(kids, n), i + 1, st, kStarts[i + 1]);
      });
    });

    teacher.forEach((m) => finalizeBounds(m));
    kids.forEach((m) => finalizeBounds(m));
    return { teacher, kids, surahSet };
  }, [pageSrcs]);

  const surahOptions = useMemo(() => {
    const nums = new Set<number>(allBounds.surahSet);
    [...allBounds.teacher.keys(), ...allBounds.kids.keys()].forEach((n) => nums.add(n));
    return [...nums]
      .filter((n) => n >= 1 && n <= 114)
      .sort((a, b) => a - b)
      .map((n) => ({ n, name: surahLabel(n) }));
  }, [allBounds]);

  // قائمة الآيات للاختيار: نعتمد توقيتات المعلم، وإن لم توجد فالطفل
  const pickerMap = useMemo(() => {
    if (speakerMode === "kids") return allBounds.kids;
    return allBounds.teacher;
  }, [speakerMode, allBounds]);

  const currentSurahMap = pickerMap.get(surahNum);
  const ayahOptions = useMemo(
    () => (currentSurahMap ? [...currentSurahMap.keys()].sort((a, b) => a - b) : []),
    [currentSurahMap]
  );

  /* ─────────── قائمة التشغيل (معلم/طفل/معًا × آيات/سور) ─────────── */
  const queue = useMemo<Seg[]>(() => {
    const t = allBounds.teacher;
    const k = allBounds.kids;
    const items: Seg[] = [];

    if (mode === "ayah") {
      if (speakerMode === "both") {
        for (let ay = Math.min(fromAyah, toAyah); ay <= Math.max(fromAyah, toAyah); ay++) {
          if (t.get(surahNum)?.has(ay)) items.push({ surah: surahNum, from: ay, to: ay, speaker: "teacher" });
          if (k.get(surahNum)?.has(ay)) items.push({ surah: surahNum, from: ay, to: ay, speaker: "kids" });
        }
        return items;
      }
      const map = speakerMode === "kids" ? k : t;
      if (map.get(surahNum)?.has(fromAyah)) {
        items.push({ surah: surahNum, from: fromAyah, to: toAyah, speaker: speakerMode });
      }
      return items;
    }

    const lo = Math.min(fromSurah, toSurah);
    const hi = Math.max(fromSurah, toSurah);
    surahOptions
      .filter((o) => o.n >= lo && o.n <= hi)
      .forEach((o) => {
        const push = (sp: Speaker) => {
          const m = sp === "kids" ? k.get(o.n) : t.get(o.n);
          if (!m || m.size === 0) return;
          const keys = [...m.keys()].sort((a, b) => a - b);
          items.push({ surah: o.n, from: keys[0], to: keys[keys.length - 1], speaker: sp });
        };
        if (speakerMode === "both") {
          push("teacher");
          push("kids");
        } else {
          push(speakerMode);
        }
      });
    return items;
  }, [mode, speakerMode, surahNum, fromAyah, toAyah, fromSurah, toSurah, surahOptions, allBounds]);

  queueRef.current = queue;

  const segRange = useCallback(
    (seg: Seg) => {
      const map = seg.speaker === "kids" ? allBounds.kids : allBounds.teacher;
      const m = map.get(seg.surah);
      const s = m?.get(seg.from);
      if (!s) return null;
      let end = m?.get(seg.to)?.end;
      if (end === undefined && m) {
        const next = [...m.keys()].filter((k2) => k2 > seg.to).sort((a, b) => a - b)[0];
        if (next !== undefined) end = m.get(next)!.start;
      }
      return { start: s.start, end };
    },
    [allBounds]
  );
  segRangeRef.current = segRange;

  /* ─────────── ضبط أولي عند الفتح فقط (لا يُعاد الضبط مع كل تغيير في المصحف) ─────────── */
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    setMode("ayah");
    setSpeakerMode("teacher");
    setSurahNum(surahNumber);
    setFromSurah(surahNumber);
    setToSurah(surahNumber);
    setFromAyah(initialAyah);
    setToAyah(initialAyah);
    setRepeats(3);
    setSpeed(1);
    setPlaying(false);
    setLoopIdx(1);
    setSegIdx(0);
    setPos(0);
    setCollapsed(false);
    loadedRef.current = "";
    switchingRef.current = false;
    loopRef.current = 1;
    idxRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      audioRef.current?.pause();
      setPlaying(false);
    }
  }, [open]);

  /* ─────────── تحميل صوت سورة معيّنة لمتحدث معيّن ─────────── */
  const ensureSrc = useCallback(
    async (n: number, sp: Speaker): Promise<HTMLAudioElement | null> => {
      const a = audioRef.current;
      if (!a) return null;
      const key = `${n}:${sp}`;
      if (loadedRef.current === key && a.src) return a;
      setLoading(true);
      try {
        const tryLoad = async (url: string): Promise<boolean> => {
          a.src = url;
          a.load();
          await new Promise<void>((res) => {
            const done = () => res();
            a.addEventListener("loadedmetadata", done, { once: true });
            a.addEventListener("error", done, { once: true });
            setTimeout(done, 6000);
          });
          return a.readyState > 0 && isFinite(a.duration) && a.duration > 0;
        };

        const remote = getAudioPath(n, sp);
        let resolved = remote;
        try {
          resolved = (await resolvePlayableAudioUrl(n, remote, sp)) || remote;
        } catch {
          resolved = remote;
        }
        let ok = await tryLoad(resolved);

        // لا يوجد ملف صوت للطفل؟ غالباً توقيتات الطفل داخل ملف المعلم نفسه — نستخدمه بدلاً من الفشل
        if (!ok && sp === "kids") {
          const teacherUrl = getAudioPath(n, "teacher");
          if (teacherUrl !== resolved) {
            ok = await tryLoad(teacherUrl);
            if (ok && !kidsFallbackNotified) {
              kidsFallbackNotified = true;
              toast({
                title: "لا يوجد ملف صوت مستقل للطفل",
                description: "استُخدم ملف التلاوة نفسه لتوقيتات الطفل.",
              });
            }
          }
        }

        // load() يعيد سرعة التشغيل إلى 1 — نعيد تطبيق السرعة المختارة
        a.playbackRate = speedRef.current;
        try {
          a.preservesPitch = true;
        } catch {
          /* ignore */
        }
        if (!ok) return null;
        loadedRef.current = key;
        return a;
      } catch {
        toast({ title: "تعذّر تحميل صوت السورة", variant: "destructive" });
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    setPlaying(false);
    loopRef.current = 1;
    idxRef.current = 0;
    setLoopIdx(1);
    setSegIdx(0);
  }, []);

  /* ─────────── تشغيل مقطع من القائمة ─────────── */
  const playSeg = useCallback(
    async (idx: number, loop: number) => {
      const q = queueRef.current;
      const seg = q[idx];
      if (!seg) return;
      const rg = segRangeRef.current(seg);
      if (!rg) return;
      const a = await ensureSrc(seg.surah, seg.speaker);
      if (!a) return;

      startRef.current = rg.start;
      endRef.current =
        rg.end !== undefined && isFinite(rg.end) && rg.end > rg.start
          ? rg.end
          : isFinite(a.duration) && a.duration > rg.start
            ? a.duration
            : undefined;

      idxRef.current = idx;
      loopRef.current = loop;
      setSegIdx(idx);
      setLoopIdx(loop);
      setPos(rg.start);
      a.playbackRate = speedRef.current;
      try {
        a.currentTime = rg.start;
      } catch {
        /* ignore */
      }
      try {
        await a.play();
        setPlaying(true);
        startTickerRef.current();
      } catch {
        setPlaying(false);
        toast({
          title: "تعذّر بدء التشغيل",
          description: "تأكد من وجود ملف الصوت لهذه السورة ثم أعد المحاولة.",
          variant: "destructive",
        });
      }
    },
    [ensureSrc]
  );
  playSegRef.current = playSeg;

  const start = useCallback(async () => {
    if (queueRef.current.length === 0) {
      toast({
        title: "لا توجد توقيتات لهذا الاختيار",
        description:
          "وثّق توقيتات السورة (أو توقيتات الطفل) من استوديو الصوت ثم أعد المحاولة.",
        variant: "destructive",
      });
      return;
    }
    onBeforePlay?.();
    await playSeg(0, 1);
  }, [onBeforePlay, playSeg]);

  const toggle = useCallback(() => {
    if (playing) {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    void start();
  }, [playing, start]);

  /* ─────────── حلقة المتابعة: تعمل ما دام الصوت يعمل فعلياً (لا تتعلّق بحالة React) ─────────── */
  const lastPosPaintRef = useRef(0);
  const tick = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    // تحديث شريط التقدّم بحد أقصى ~6 مرات بالثانية (تجنّب إعادة رسم المصحف كل إطار)
    const now = performance.now();
    if (now - lastPosPaintRef.current > 160) {
      lastPosPaintRef.current = now;
      setPos(a.currentTime);
    }
    if (switchingRef.current) return;

    let end = endRef.current;
    if (end === undefined && isFinite(a.duration) && a.duration > 0) end = a.duration;
    if (end === undefined || a.currentTime < end - 0.03) return;

    const q = queueRef.current;
    const nextIdx = idxRef.current + 1;
    const total = repeatsRef.current;
    const advance = (idx: number, loop: number) => {
      switchingRef.current = true;
      a.pause();
      void playSegRef.current(idx, loop);
      setTimeout(() => {
        switchingRef.current = false;
      }, 250);
    };

    if (nextIdx < q.length) advance(nextIdx, loopRef.current);
    else if (total === 0 || loopRef.current < total) advance(0, loopRef.current + 1);
    else {
      a.pause();
      setPos(end);
      setPlaying(false);
    }
  }, []);
  tickRef.current = tick;

  const startTicker = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const step = () => {
      tickRef.current();
      const a = audioRef.current;
      if (a && !a.paused) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);
  startTickerRef.current = startTicker;

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  /* ─────────── تغيير الخيارات يوقف التشغيل ويعيد الضبط ─────────── */
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.pause();
    setPlaying(false);
    setLoopIdx(1);
    loopRef.current = 1;
    idxRef.current = 0;
    loadedRef.current = "";
    setSegIdx(0);
    setPos(0);
  }, [speakerMode]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) {
      a.playbackRate = speed;
      // الحفاظ على نبرة الصوت عند السرعات العالية
      try {
        a.preservesPitch = true;
      } catch {
        /* ignore */
      }
    }
  }, [speed]);

  useEffect(() => {
    setPlaying(false);
    const a = audioRef.current;
    if (a) a.pause();
    idxRef.current = 0;
    setSegIdx(0);
    setPos(0);
  }, [mode, fromSurah, toSurah]);

  useEffect(() => {
    if (fromAyah > toAyah) setToAyah(fromAyah);
  }, [fromAyah, toAyah]);

  // ضبط الآيات على قيم صالحة عند تغيير السورة/المتحدث (حتى لا تبقى قيمة غير موجودة = 0)
  useEffect(() => {
    if (ayahOptions.length === 0) return;
    const first = ayahOptions[0];
    const last = ayahOptions[ayahOptions.length - 1];
    setFromAyah((v) => (ayahOptions.includes(v) ? v : first));
    setToAyah((v) => (ayahOptions.includes(v) ? v : last));
  }, [ayahOptions]);

  useEffect(() => {
    if (surahNum === fromSurah) setFromSurah(surahNum);
    if (surahNum === toSurah) setToSurah(surahNum);
  }, [surahNum, fromSurah, toSurah]);

  if (!open) return null;

  const seg = queue[Math.min(segIdx, Math.max(queue.length - 1, 0))];
  const activeSpeaker: Speaker = seg?.speaker ?? (speakerMode === "kids" ? "kids" : "teacher");
  const range = seg ? segRange(seg) : null;

  const startT = range?.start ?? 0;
  const endT = range?.end ?? (duration > startT + 0.2 ? duration : undefined);
  const span = endT !== undefined && endT > startT ? endT - startT : 0;
  const rawProgress = span > 0 ? ((pos - startT) / span) * 100 : 0;
  const progress = Math.min(100, Math.max(0, rawProgress));

  const activeMap = (activeSpeaker === "kids" ? allBounds.kids : allBounds.teacher).get(
    seg?.surah ?? surahNum
  );
  const liveAyah = (() => {
    if (!activeMap || !seg) return seg?.from ?? 1;
    let cur = seg.from;
    [...activeMap.keys()].forEach((a) => {
      if (a < seg.from || a > seg.to) return;
      if (activeMap.get(a)!.start <= pos + 0.02) cur = a;
    });
    return cur;
  })();

  const noTimings = queue.length === 0;
  const selectCls =
    "h-7 rounded-lg bg-black/50 border border-white/10 px-1.5 text-[11px] font-bold text-white outline-none focus:border-amber-400/60";
  const accentBg = activeSpeaker === "kids" ? "bg-sky-400" : "bg-amber-400";
  const accentText = activeSpeaker === "kids" ? "text-sky-300" : "text-amber-300";

  const speakerBtn = (value: SpeakerMode, label: string, icon: JSX.Element, activeCls: string) => (
    <button
      onClick={() => setSpeakerMode(value)}
      className={`px-2 h-6 rounded-md text-[11px] font-extrabold flex items-center gap-1 transition-all ${
        speakerMode === value ? activeCls : "text-stone-400 hover:text-white"
      }`}
      title={
        value === "both"
          ? "المعلم ثم الطفل لكل آية (تكرار الحفظ)"
          : value === "kids"
            ? "صوت الطفل"
            : "صوت المعلم"
      }
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] pointer-events-none" dir="rtl">
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
      />

      <div className="pointer-events-auto mx-auto max-w-5xl px-2 pb-[calc(0.35rem+env(safe-area-inset-bottom,0px))]">
        <div className="rounded-2xl border border-white/12 bg-[#0f1618]/95 backdrop-blur-xl shadow-[0_-8px_30px_rgba(0,0,0,0.45)] px-2.5 py-1.5">
          {/* الصف الأول: الاختيارات (يُخفى عند الطيّ) */}
          {!collapsed && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10">
                <button
                  onClick={() => setMode("ayah")}
                  className={`px-2 h-6 rounded-md text-[11px] font-extrabold transition-all ${
                    mode === "ayah" ? "bg-white text-black" : "text-stone-400 hover:text-white"
                  }`}
                >
                  آيات
                </button>
                <button
                  onClick={() => setMode("surah")}
                  className={`px-2 h-6 rounded-md text-[11px] font-extrabold transition-all ${
                    mode === "surah" ? "bg-white text-black" : "text-stone-400 hover:text-white"
                  }`}
                >
                  سور
                </button>
              </div>

              {mode === "ayah" ? (
                <>
                  <select
                    value={surahNum}
                    onChange={(e) => setSurahNum(Number(e.target.value))}
                    className={`${selectCls} max-w-[8.5rem]`}
                    title="السورة"
                  >
                    {surahOptions.map((s) => (
                      <option key={s.n} value={s.n}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-stone-400">من</span>
                  <select
                    value={fromAyah}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v > 0) setFromAyah(v);
                    }}
                    className={selectCls}
                    title="من الآية"
                  >
                    {(ayahOptions.length ? ayahOptions : [1]).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-stone-400">إلى</span>
                  <select
                    value={toAyah}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v > 0) setToAyah(v);
                    }}
                    className={selectCls}
                    title="إلى الآية"
                  >
                    {(ayahOptions.length ? ayahOptions : [1]).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-stone-400">من سورة</span>
                  <select
                    value={fromSurah}
                    onChange={(e) => setFromSurah(Number(e.target.value))}
                    className={`${selectCls} max-w-[8.5rem]`}
                    title="من سورة"
                  >
                    {surahOptions.map((s) => (
                      <option key={s.n} value={s.n}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-stone-400">إلى سورة</span>
                  <select
                    value={toSurah}
                    onChange={(e) => setToSurah(Number(e.target.value))}
                    className={`${selectCls} max-w-[8.5rem]`}
                    title="إلى سورة"
                  >
                    {surahOptions.map((s) => (
                      <option key={s.n} value={s.n}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <select
                value={repeats}
                onChange={(e) => setRepeats(Number(e.target.value))}
                className={selectCls}
                title="عدد المرات"
              >
                {REPEAT_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r === 0 ? "♾️" : `×${r}`}
                  </option>
                ))}
              </select>

              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className={selectCls}
                title="سرعة التشغيل"
              >
                {SPEED_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>

              {/* المتحدث: معلم / طفل / معًا */}
              <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10">
                {speakerBtn("teacher", "معلم", <GraduationCap className="w-3 h-3" />, "bg-amber-400 text-black")}
                {speakerBtn("kids", "طفل", <Baby className="w-3 h-3" />, "bg-sky-400 text-black")}
                {speakerBtn(
                  "both",
                  "معًا",
                  <Repeat className="w-3 h-3" />,
                  "bg-gradient-to-r from-amber-400 to-sky-400 text-black"
                )}
              </div>
            </div>
          )}

          {/* الصف الثاني: التشغيل والتقدّم */}
          <div className={`flex items-center gap-2 ${collapsed ? "" : "mt-1.5"}`}>
            <button
              onClick={toggle}
              disabled={loading}
              className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-60 ${accentBg} text-black`}
              aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
            >
              {loading ? (
                <span className="text-[10px] font-bold">...</span>
              ) : playing ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            {!collapsed && (
              <button
                onClick={stop}
                className="w-7 h-7 shrink-0 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-stone-300"
                aria-label="إيقاف"
                title="إيقاف وإعادة البداية"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            )}

            <div className="flex-1 min-w-0">
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${accentBg}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-0.5 text-[10px] font-mono text-stone-400">
                <span className="truncate flex items-center gap-1">
                  <span className={accentText}>{activeSpeaker === "kids" ? "👶" : "🎓"}</span>
                  {surahLabel(seg?.surah ?? surahNum)} • آية {liveAyah}
                  <span className="text-stone-600">|</span>
                  {mode === "surah"
                    ? `${Math.floor(segIdx / (speakerMode === "both" ? 2 : 1)) + 1} سورة`
                    : `آية ${fromAyah}–${toAyah}`}
                </span>
                <span className="shrink-0 flex items-center gap-1.5">
                  {loopIdx}/{repeats === 0 ? "∞" : repeats}
                  <span className="text-stone-600">|</span>
                  {fmt(Math.max(0, pos - startT))} / {span > 0 ? fmt(span) : "--:--"}
                  <span className="text-stone-600">|</span>
                  {speed}×
                </span>
              </div>
            </div>

            {noTimings ? (
              <button
                onClick={() => setShowHint((v) => !v)}
                className="shrink-0 w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center justify-center"
                title="لا توجد توقيتات"
                aria-label="معلومات"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            ) : null}

            <button
              onClick={() => setCollapsed((v) => !v)}
              className="shrink-0 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-stone-300"
              title={collapsed ? "توسيع الشريط" : "طيّ الشريط"}
              aria-label={collapsed ? "توسيع" : "طيّ"}
            >
              {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => {
                stop();
                onClose();
              }}
              className="shrink-0 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-stone-300"
              aria-label="إغلاق الشريط"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {showHint && noTimings && (
            <p className="mt-1 text-[10px] leading-relaxed rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 px-2 py-1">
              لا توجد توقيتات محفوظة لهذا الاختيار. وثّق الآيات من «استوديو ربط التظليل بالصوت» ثم أعد المحاولة.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
