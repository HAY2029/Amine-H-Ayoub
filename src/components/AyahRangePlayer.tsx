import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Baby, GraduationCap, Info, Pause, Play, Repeat, SlidersHorizontal, Square, X,
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
const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R;

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
  const [expanded, setExpanded] = useState(false);
  // شكل المشغّل: كبسولة على الهاتف، ولوحة عريضة على الحاسوب
  const [isDock, setIsDock] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 900
  );

  useEffect(() => {
    const onResize = () => setIsDock(window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

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

  // ── قائمة التشغيل الفعلية: في وضع «معلم» لا يدخل أي مقطع للطفل إطلاقاً (والعكس) ──
  // كان الشريط يعتمد على «queue» وحده، فأي تأخّر في تحديث الحالة بعد اختيار الصوت
  // يُبقي مقاطع «معًا» في القائمة فيُسمع الطفل مع المعلم. هذا الفلتر يقطع الطريق على ذلك.
  const activeQueue = useMemo<Seg[]>(() => {
    if (speakerMode === "both") return queue;
    const wanted: Speaker = speakerMode === "kids" ? "kids" : "teacher";
    const only = queue.filter((s) => s.speaker === wanted);
    return only.length > 0 ? only : [];
  }, [queue, speakerMode]);

  queueRef.current = activeQueue;

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

  const seg = activeQueue[Math.min(segIdx, Math.max(activeQueue.length - 1, 0))];
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

  const noTimings = activeQueue.length === 0;
  const selectCls =
    "h-8 rounded-full bg-secondary text-secondary-foreground border border-border/60 px-2 text-center text-[11px] font-extrabold outline-none focus:border-accent";
  const pillSelectCls =
    "h-9 w-[3.4rem] shrink-0 rounded-full bg-background text-foreground border border-accent/35 px-1 text-center text-[13px] font-extrabold tabular-nums outline-none transition-colors focus:border-accent";
  // في وضع «سور» نعرض اسم السورة بدل رقمها (أوضح على الهاتف)
  const pillSurahSelectCls =
    "h-9 w-[4.9rem] shrink-0 rounded-full bg-background text-foreground border border-accent/35 px-1.5 text-center text-[12px] font-extrabold truncate outline-none transition-colors focus:border-accent";
  const accentBg = activeSpeaker === "kids" ? "bg-sky-400" : "bg-amber-400";
  const accentText = activeSpeaker === "kids" ? "text-sky-300" : "text-amber-300";
  // حقول لوحة الحاسوب (أكبر قليلاً وأسهل في النقر)
  const dockSelectCls =
    "h-9 w-[4.2rem] shrink-0 rounded-xl bg-background text-foreground border border-accent/35 px-1.5 text-center text-[13px] font-extrabold tabular-nums outline-none transition-colors hover:border-accent focus:border-accent";
  const dockSurahSelectCls =
    "h-9 w-[6.6rem] shrink-0 rounded-xl bg-background text-foreground border border-accent/35 px-2 text-center text-[12px] font-extrabold truncate outline-none transition-colors hover:border-accent focus:border-accent";

  /* زر التشغيل المشترك: حلقة تقدّم حيّة + نبض ناعم أثناء التشغيل */
  const playButton = (wrapCls: string, innerCls: string, iconCls: string) => (
    <button
      onClick={toggle}
      disabled={loading}
      className={`relative ${wrapCls} shrink-0 rounded-full flex items-center justify-center transition-transform active:scale-90 disabled:opacity-60 ${
        playing ? "arp-glow" : ""
      }`}
      aria-label={playing ? "إيقاف مؤقت" : "تشغيل المقطع"}
      title={playing ? "إيقاف مؤقت" : "تشغيل"}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-border" />
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={accentText}
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C - (RING_C * progress) / 100}
          style={{ transition: "stroke-dashoffset 0.15s linear" }}
        />
      </svg>
      <span className={`${innerCls} rounded-full flex items-center justify-center ${accentBg} text-black shadow-sm`}>
        {loading ? (
          <span className="text-[9px] font-black">…</span>
        ) : playing ? (
          <Pause className={`${iconCls} fill-current`} />
        ) : (
          <Play className={`${iconCls} fill-current ms-0.5`} />
        )}
      </span>
    </button>
  );

  const optionsButton = (sizeCls: string, iconCls: string) => (
    <button
      onClick={() => setExpanded((v) => !v)}
      className={`${sizeCls} shrink-0 rounded-full flex items-center justify-center border transition-all active:scale-90 ${
        expanded
          ? "bg-accent text-accent-foreground border-accent"
          : "bg-foreground/5 text-muted-foreground border-border/60 hover:text-foreground"
      }`}
      aria-label="خيارات التشغيل"
      title="خيارات: سور، مرات، سرعة، صوت"
    >
      <SlidersHorizontal className={iconCls} />
    </button>
  );

  const closeButton = (sizeCls: string, iconCls: string) => (
    <button
      onClick={() => {
        stop();
        onClose();
      }}
      className={`${sizeCls} shrink-0 rounded-full flex items-center justify-center bg-foreground/5 border border-border/60 text-muted-foreground transition-all active:scale-90 hover:text-foreground`}
      aria-label="إغلاق المشغّل"
      title="إغلاق"
    >
      <X className={iconCls} />
    </button>
  );

  const speakerBtn = (value: SpeakerMode, label: string, icon: JSX.Element, activeCls: string) => (
    <button
      onClick={() => setSpeakerMode(value)}
      className={`px-2 h-6 rounded-md text-[11px] font-extrabold flex items-center gap-1 transition-all ${
        speakerMode === value ? activeCls : "text-muted-foreground hover:text-foreground"
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
    <div
      className="fixed inset-x-0 z-[80] flex flex-col items-center px-3 pointer-events-none bottom-[calc(76px+env(safe-area-inset-bottom,0px))] min-[900px]:bottom-4"
      dir="rtl"
    >      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
      />

      {/* لوحة الخيارات — تُفتح عند الحاجة فقط، والشريط يبقى «من ← إلى» */}
      {expanded && (
        <div className="pointer-events-auto mb-2 w-[min(94vw,360px)] rounded-3xl border border-accent/40 bg-card/97 backdrop-blur-2xl shadow-[0_18px_50px_rgba(0,0,0,0.35)] p-3 space-y-2.5 animate-fade-in text-foreground">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black text-muted-foreground">الاختيارات</span>
            <span className="font-mono text-[10px] text-muted-foreground truncate">
              {liveAyah > 0 ? `آية ${liveAyah} • ` : ""}
              {fmt(Math.max(0, pos - startT))} / {span > 0 ? fmt(span) : "--:--"}
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-full bg-secondary p-0.5">
            <button
              onClick={() => setMode("ayah")}
              className={`flex-1 h-7 rounded-full text-[11px] font-extrabold transition-all ${
                mode === "ayah" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              آيات
            </button>
            <button
              onClick={() => setMode("surah")}
              className={`flex-1 h-7 rounded-full text-[11px] font-extrabold transition-all ${
                mode === "surah" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              سور
            </button>
          </div>

          {mode === "surah" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground">من سورة</span>
              <select
                value={fromSurah}
                onChange={(e) => setFromSurah(Number(e.target.value))}
                className="h-8 flex-1 min-w-0 rounded-full bg-secondary text-secondary-foreground border border-border/60 px-2 text-[11px] font-bold outline-none focus:border-accent"
              >
                {surahOptions.map((s) => (
                  <option key={s.n} value={s.n}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-bold text-muted-foreground">إلى</span>
              <select
                value={toSurah}
                onChange={(e) => setToSurah(Number(e.target.value))}
                className="h-8 flex-1 min-w-0 rounded-full bg-secondary text-secondary-foreground border border-border/60 px-2 text-[11px] font-bold outline-none focus:border-accent"
              >
                {surahOptions.map((s) => (
                  <option key={s.n} value={s.n}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-muted-foreground">عدد المرات</span>
            <select
              value={repeats}
              onChange={(e) => setRepeats(Number(e.target.value))}
              className={selectCls}
              title="عدد مرات التكرار"
            >
              {REPEAT_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r === 0 ? "∞" : `×${r}`}
                </option>
              ))}
            </select>

            <span className="text-[10px] font-bold text-muted-foreground">السرعة</span>
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

            <div className="flex items-center rounded-full bg-secondary p-0.5 ms-auto">
              {speakerBtn("teacher", "معلم", <GraduationCap className="w-3 h-3" />, "bg-accent text-accent-foreground")}
              {speakerBtn("kids", "طفل", <Baby className="w-3 h-3" />, "bg-sky-400 text-black")}
              {speakerBtn(
                "both",
                "معًا",
                <Repeat className="w-3 h-3" />,
                "bg-gradient-to-r from-amber-400 to-sky-400 text-black"
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={stop}
              className="flex-1 h-8 rounded-full bg-secondary text-secondary-foreground text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95 transition-all"
            >
              <Square className="w-3 h-3 fill-current" />
              إيقاف وإعادة
            </button>
            {noTimings && (
              <button
                onClick={() => setShowHint((v) => !v)}
                className="w-8 h-8 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center"
                aria-label="معلومات"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {showHint && noTimings && (
            <p className="text-[10px] leading-relaxed rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-500 px-2.5 py-1.5">
              لا توجد توقيتات محفوظة لهذا الاختيار. وثّق الآيات من «استوديو ربط التظليل بالصوت» ثم أعد المحاولة.
            </p>
          )}
        </div>
      )}

      {isDock ? (
        /* ── شكل الحاسوب: لوحة أفقية عريضة مع خط تقدّم رقيق ── */
        <div className="arp-dock-enter pointer-events-auto relative flex w-full max-w-[min(92vw,760px)] items-center gap-2 rounded-2xl border border-accent/45 bg-gradient-to-b from-card/98 to-card/92 px-3 py-2.5 ring-1 ring-primary/10 shadow-[0_22px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
          {/* خط تقدّم رقيق أسفل البطاقة (لا شريط عريض) */}
          <span aria-hidden className="absolute inset-x-3 bottom-1 h-[3px] overflow-hidden rounded-full bg-foreground/10">
            <span
              className={`block h-full rounded-full ${accentBg}`}
              style={{ width: `${progress}%`, transition: "width 0.2s linear" }}
            />
          </span>

          {/* آيات / سور */}
          <div className="flex shrink-0 items-center rounded-full bg-secondary p-0.5">
            <button
              onClick={() => setMode("ayah")}
              className={`h-7 rounded-full px-3 text-[11px] font-extrabold transition-all active:scale-95 ${
                mode === "ayah" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              آيات
            </button>
            <button
              onClick={() => setMode("surah")}
              className={`h-7 rounded-full px-3 text-[11px] font-extrabold transition-all active:scale-95 ${
                mode === "surah" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              سور
            </button>
          </div>

          <span className="text-[11px] font-black text-accent">من</span>
          <select
            value={mode === "surah" ? fromSurah : fromAyah}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v) || v <= 0) return;
              if (mode === "surah") setFromSurah(v);
              else setFromAyah(v);
            }}
            className={mode === "surah" ? dockSurahSelectCls : dockSelectCls}
            title={mode === "surah" ? "من سورة" : "من الآية"}
          >
            {mode === "surah"
              ? surahOptions.map((s) => (
                  <option key={s.n} value={s.n}>
                    {s.name}
                  </option>
                ))
              : (ayahOptions.length ? ayahOptions : [1]).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
          </select>

          <span className="text-accent" aria-hidden>
            <ArrowLeft className="w-3.5 h-3.5" />
          </span>

          <span className="text-[11px] font-black text-accent">إلى</span>
          <select
            value={mode === "surah" ? toSurah : toAyah}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v) || v <= 0) return;
              if (mode === "surah") setToSurah(v);
              else setToAyah(v);
            }}
            className={mode === "surah" ? dockSurahSelectCls : dockSelectCls}
            title={mode === "surah" ? "إلى سورة" : "إلى الآية"}
          >
            {mode === "surah"
              ? surahOptions.map((s) => (
                  <option key={s.n} value={s.n}>
                    {s.name}
                  </option>
                ))
              : (ayahOptions.length ? ayahOptions : [1]).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
          </select>

          {/* شارة صغيرة: من يقرأ الآن + التكرار */}
          <span className="ms-1 hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/50 bg-foreground/5 px-2.5 py-1 text-[10px] font-bold text-muted-foreground sm:flex">
            {activeSpeaker === "kids" ? (
              <Baby className="w-3 h-3 text-sky-400" />
            ) : (
              <GraduationCap className="w-3 h-3 text-amber-400" />
            )}
            {mode === "surah" ? surahLabel(seg?.surah ?? surahNum) : `آية ${liveAyah}`}
            <span className="text-[9px] opacity-70">{repeats > 0 ? `×${repeats}` : "∞"}</span>
          </span>

          <div className="ms-auto flex shrink-0 items-center gap-1.5">
            {playButton("w-11 h-11", "w-9 h-9", "w-4 h-4")}
            {optionsButton("w-9 h-9", "w-4 h-4")}
            {closeButton("w-9 h-9", "w-4 h-4")}
          </div>
        </div>
      ) : (
        /* ── شكل الهاتف: كبسولة مدمجة فوق شريط التنقّل ── */
        <div className="arp-enter pointer-events-auto flex max-w-[calc(100vw-1.25rem)] items-center gap-1.5 rounded-full border border-accent/50 bg-gradient-to-b from-card to-card/95 px-2.5 py-2 ring-1 ring-primary/10 shadow-[0_14px_36px_-12px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
          <span className="text-[10px] font-black text-accent">من</span>
          <select
            value={mode === "surah" ? fromSurah : fromAyah}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v) || v <= 0) return;
              if (mode === "surah") setFromSurah(v);
              else setFromAyah(v);
            }}
            className={mode === "surah" ? pillSurahSelectCls : pillSelectCls}
            title={mode === "surah" ? "من سورة" : "من الآية"}
          >
            {mode === "surah"
              ? surahOptions.map((s) => (
                  <option key={s.n} value={s.n}>
                    {s.name}
                  </option>
                ))
              : (ayahOptions.length ? ayahOptions : [1]).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
          </select>

          <span className="text-accent" aria-hidden>
            <ArrowLeft className="w-3.5 h-3.5" />
          </span>

          <span className="text-[10px] font-black text-accent">إلى</span>
          <select
            value={mode === "surah" ? toSurah : toAyah}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v) || v <= 0) return;
              if (mode === "surah") setToSurah(v);
              else setToAyah(v);
            }}
            className={mode === "surah" ? pillSurahSelectCls : pillSelectCls}
            title={mode === "surah" ? "إلى سورة" : "إلى الآية"}
          >
            {mode === "surah"
              ? surahOptions.map((s) => (
                  <option key={s.n} value={s.n}>
                    {s.name}
                  </option>
                ))
              : (ayahOptions.length ? ayahOptions : [1]).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
          </select>

          {playButton("w-10 h-10 ms-0.5", "w-8 h-8", "w-3.5 h-3.5")}
          {optionsButton("w-8 h-8", "w-3.5 h-3.5")}
          {closeButton("w-8 h-8", "w-3.5 h-3.5")}
        </div>
      )}
    </div>
  );
}
