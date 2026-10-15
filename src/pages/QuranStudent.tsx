import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Timer as TimerIcon, ListMusic, Search, Mic, Play, Pause, Square,
  RotateCcw, Plus, Minus, Bluetooth, Volume2, Loader2, MapPin, Check, AlertTriangle,
  RefreshCw, Gauge,
} from "lucide-react";
import { getAllSurahs } from "../data/quranData";
import { getSurahAudioUrl, hasCloudAudio } from "../data/audioUrls";
import {
  ensureCorpus, isCorpusReady, searchWord, matchedWordIndices, normalizeArabic,
  type SurahText, type SearchHit,
} from "../data/quranText";
import { toast } from "../hooks/use-toast";
import AppLoader from "@/components/ui/app-loader";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const fmt = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

type TabId = "timer" | "library" | "search" | "coach";
const TABS: { id: TabId; label: string; Icon: typeof TimerIcon }[] = [
  { id: "timer", label: "المؤقّت", Icon: TimerIcon },
  { id: "library", label: "المكتبة", Icon: ListMusic },
  { id: "search", label: "بحث الكلمات", Icon: Search },
  { id: "coach", label: "مدرّب التلاوة", Icon: Mic },
];

/* ───────────────────────── ١) المؤقّت ───────────────────────── */
function beep() {
  try {
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
    const Ctx = AC.AudioContext || AC.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.18, 0.36].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.14);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* ignore */ }
}

const PRESETS = [5, 10, 15, 25];

function TimerTool() {
  const [mode, setMode] = useState<"down" | "up">("down");
  const [total, setTotal] = useState(10 * 60);
  const [left, setLeft] = useState(10 * 60);
  const [up, setUp] = useState(0);
  const [running, setRunning] = useState(false);
  const anchor = useRef({ start: 0, base: 0 });

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const elapsed = (now() - anchor.current.start) / 1000;
      if (mode === "down") {
        const nl = Math.max(0, anchor.current.base - elapsed);
        setLeft(nl);
        if (nl <= 0) {
          setRunning(false); beep();
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try { new Notification("انتهى وقت الجلسة", { body: "أحسنت — خذ راحة قصيرة" }); } catch { /* ignore */ }
          }
          toast({ title: "انتهى الوقت", description: "أحسنت على جلستك" });
        }
      } else {
        setUp(anchor.current.base + elapsed);
      }
    }, 200);
    return () => clearInterval(id);
  }, [running, mode]);

  const start = () => {
    if (mode === "down" && left <= 0) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    anchor.current = { start: now(), base: mode === "down" ? left : up };
    setRunning(true);
  };
  const pause = () => setRunning(false);
  const reset = () => { setRunning(false); setLeft(total); setUp(0); };
  const pick = (min: number) => { setMode("down"); setRunning(false); setTotal(min * 60); setLeft(min * 60); };
  const bump = (delta: number) => { const nt = Math.max(60, total + delta * 60); setTotal(nt); setLeft(nt); setRunning(false); };

  const value = mode === "down" ? left : up;
  const pct = mode === "down" ? (total > 0 ? left / total : 0) : 0;
  const R = 86, C = 2 * Math.PI * R;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setMode("down"); setRunning(false); setLeft(total); }}
          className={`p-2.5 rounded-xl text-sm font-bold border transition-colors ${mode === "down" ? "bg-accent text-accent-foreground border-accent" : "bg-secondary text-secondary-foreground border-border"}`}>عدّ تنازلي</button>
        <button onClick={() => { setMode("up"); setRunning(false); setUp(0); }}
          className={`p-2.5 rounded-xl text-sm font-bold border transition-colors ${mode === "up" ? "bg-accent text-accent-foreground border-accent" : "bg-secondary text-secondary-foreground border-border"}`}>توقيت تصاعدي</button>
      </div>

      <div className="relative mx-auto w-[220px] h-[220px] flex items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
          {mode === "down" && (
            <circle cx="100" cy="100" r={R} fill="none" stroke="hsl(var(--accent))" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct)} className="transition-[stroke-dashoffset] duration-200" />
          )}
        </svg>
        <div className="text-center">
          <div className="text-5xl font-extrabold tabular-nums text-foreground">{fmt(value)}</div>
          <div className="text-xs text-muted-foreground mt-1">{mode === "down" ? "متبقٍّ" : "منقضٍ"}</div>
        </div>
      </div>

      {mode === "down" && (
        <>
          <div className="flex items-center justify-center gap-2">
            {PRESETS.map(p => (
              <button key={p} onClick={() => pick(p)}
                className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${total === p * 60 ? "bg-accent/15 text-accent border-accent/50" : "bg-secondary text-secondary-foreground border-border"}`}>{p} د</button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => bump(-1)} className="w-9 h-9 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center active:scale-95"><Minus className="w-4 h-4" /></button>
            <span className="text-sm text-muted-foreground">ضبط الدقائق</span>
            <button onClick={() => bump(1)} className="w-9 h-9 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center active:scale-95"><Plus className="w-4 h-4" /></button>
          </div>
        </>
      )}

      <div className="flex items-center justify-center gap-3">
        {!running ? (
          <button onClick={start} className="btn-emerald flex items-center gap-2 px-6 py-3 rounded-2xl font-bold active:scale-95"><Play className="w-5 h-5" /> ابدأ</button>
        ) : (
          <button onClick={pause} className="btn-gold flex items-center gap-2 px-6 py-3 rounded-2xl font-bold active:scale-95"><Pause className="w-5 h-5" /> إيقاف مؤقّت</button>
        )}
        <button onClick={reset} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-secondary text-secondary-foreground font-bold active:scale-95"><RotateCcw className="w-5 h-5" /> تصفير</button>
      </div>
    </div>
  );
}

/* ───────────────────────── ٢) المكتبة الصوتية ───────────────────────── */
const RATES = [0.75, 1, 1.25, 1.5];

function LibraryTool() {
  const surahs = getAllSurahs().filter(s => hasCloudAudio(s.number));
  const audioRef = useRef<HTMLAudioElement>(null);
  const [cur, setCur] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [pos, setPos] = useState({ cur: 0, dur: 0 });
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  const [sink, setSink] = useState("");
  const sinkSupported = typeof window !== "undefined" && typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate, cur]);

  const toggle = (n: number) => {
    const a = audioRef.current; if (!a) return;
    if (cur === n) { if (playing) { a.pause(); } else { a.play().catch(() => {}); } return; }
    a.src = getSurahAudioUrl(n); a.currentTime = 0; setCur(n);
    a.play().then(() => { a.playbackRate = rate; }).catch(() => toast({ title: "تعذّر تشغيل الصوت", variant: "destructive" }));
  };
  const seek = (v: number) => { const a = audioRef.current; if (a && pos.dur) { a.currentTime = (v / 100) * pos.dur; } };

  const loadDevices = async () => {
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch { /* labels قد تبقى مخفية */ }
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const outs = list.filter(d => d.kind === "audiooutput").map((d, i) => ({ id: d.deviceId, label: d.label || `جهاز إخراج ${i + 1}` }));
      setDevices(outs);
      if (!outs.length) toast({ title: "لم يُعثر على أجهزة إخراج" });
    } catch { toast({ title: "متصفّحك لا يدعم اختيار جهاز الإخراج", variant: "destructive" }); }
  };
  const selectSink = async (id: string) => {
    const a = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!a?.setSinkId) return;
    try { await a.setSinkId(id); setSink(id); toast({ title: "تمّ توجيه الصوت للجهاز المحدّد" }); }
    catch { toast({ title: "تعذّر التحويل لهذا الجهاز", variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <audio ref={audioRef}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={e => setPos({ cur: e.currentTarget.currentTime, dur: e.currentTarget.duration || 0 })} />

      {/* جهاز الإخراج / بلوتوث */}
      <div className="card-nour p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-bold text-sky-300 text-sm"><Bluetooth className="w-4 h-4" /> جهاز الاستماع</span>
          <button onClick={loadDevices} className="flex items-center gap-1 text-xs font-bold bg-secondary text-secondary-foreground hover:brightness-95 rounded-full px-3 py-1.5 active:scale-95"><RefreshCw className="w-3.5 h-3.5" /> بحث عن الأجهزة</button>
        </div>
        {sinkSupported ? (
          devices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {devices.map(d => (
                <button key={d.id} onClick={() => selectSink(d.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${sink === d.id ? "bg-sky-500/20 text-sky-200 border-sky-500/50" : "bg-secondary text-secondary-foreground border-border"}`}>
                  <Volume2 className="w-3.5 h-3.5" /> {d.label}
                </button>
              ))}
            </div>
          ) : <p className="text-[11px] text-muted-foreground">اضغط «بحث عن الأجهزة» لاختيار سمّاعة/جهاز متّصل.</p>
        ) : <p className="text-[11px] text-muted-foreground">هذا المتصفّح لا يدعم اختيار جهاز الإخراج.</p>}
        <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-accent/70" />
          اقرن سمّاعة البلوتوث من إعدادات الجهاز أولاً، ثم اخترها هنا — المتصفّح لا يُقرن البلوتوث بنفسه.
        </p>
      </div>

      {/* مشغّل + سرعة */}
      {cur && (
        <div className="card-nour p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
            <span>{fmt(pos.cur)}</span>
            <span className="flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> {rate}×</span>
            <span>{fmt(pos.dur)}</span>
          </div>
          <input type="range" min={0} max={100} value={pos.dur ? (pos.cur / pos.dur) * 100 : 0} onChange={e => seek(Number(e.target.value))}
            className="w-full accent-accent" dir="ltr" />
          <div className="flex items-center justify-center gap-2">
            {RATES.map(r => (
              <button key={r} onClick={() => setRate(r)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${rate === r ? "bg-accent/15 text-accent border-accent/50" : "bg-secondary text-secondary-foreground border-border"}`}>{r}×</button>
            ))}
          </div>
        </div>
      )}

      {/* قائمة السور */}
      <div className="space-y-2">
        {surahs.map(s => {
          const active = cur === s.number;
          return (
            <button key={s.number} onClick={() => toggle(s.number)}
              className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-right active:scale-[0.99] transition-colors ${active ? "bg-accent/10 border-accent/40" : "bg-card border-border hover:border-accent/50"}`}>
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${active && playing ? "bg-accent text-accent-foreground" : "bg-secondary text-accent"}`}>
                {active && playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-foreground">{s.name}</span>
                <span className="block text-[11px] text-muted-foreground">{s.ayahCount} آية</span>
              </span>
              {active && <span className="text-[10px] text-accent font-bold">{playing ? "يُشغّل" : "متوقّف"}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── ٣) بحث الكلمات ───────────────────────── */
function HighlightedAyah({ text, query }: { text: string; query: string }) {
  const idx = matchedWordIndices(text, query);
  return (
    <p className="font-quran text-xl leading-loose text-right text-foreground">
      {text.split(/\s+/).map((w, i) => (
        <span key={i} className={idx.has(i) ? "text-accent font-bold" : ""}>{w}{" "}</span>
      ))}
    </p>
  );
}

function SearchTool() {
  const [q, setQ] = useState("");
  const [corpus, setCorpus] = useState<SurahText[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const load = async (): Promise<SurahText[] | null> => {
    setLoading(true); setErr("");
    try { const c = await ensureCorpus(); setCorpus(c); return c; }
    catch { setErr("تعذّر تحميل نصّ القرآن — تأكّد من الاتصال بالإنترنت في المرّة الأولى، ثم يعمل لاحقاً دون إنترنت."); return null; }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isCorpusReady()) load();   }, []);

  const run = async () => {
    if (!q.trim()) return;
    const c = corpus || await load();
    if (c) setHits(searchWord(q, c));
  };

  const totalCount = hits ? hits.reduce((a, h) => a + h.count, 0) : 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground text-center leading-relaxed">اكتب كلمة لتعرف في أيّ السور والآيات وردت (سور التطبيق — جزء عمّ).</p>
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") run(); }}
          placeholder="مثال: الرحمن" dir="rtl"
          className="font-quran flex-1 rounded-xl bg-card border border-border px-4 py-3 text-foreground text-lg outline-none focus:border-accent/60" />
        <button onClick={run} disabled={loading} className="btn-gold px-4 rounded-xl font-bold flex items-center gap-1 active:scale-95 disabled:opacity-50">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
        </button>
      </div>

      {err && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {err}</p>}

      {hits && !loading && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            {hits.length === 0 ? "لا نتائج لهذه الكلمة" : <>وردت في <b className="text-accent">{hits.length}</b> آية · <b className="text-accent">{totalCount}</b> مرّة</>}
          </p>
          {hits.map((h, i) => (
            <div key={i} className="card-nour p-3 space-y-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success bg-success/10 rounded-full px-2.5 py-1">
                <MapPin className="w-3.5 h-3.5" /> سورة {h.name} · آية {h.ayah}{h.count > 1 ? ` · ${h.count} مرّات` : ""}
              </span>
              <HighlightedAyah text={h.text} query={q} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── ٤) مدرّب التلاوة (تجريبي) ───────────────────────── */
interface SRType { lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; }

function CoachTool() {
  const [corpus, setCorpus] = useState<SurahText[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [si, setSi] = useState(0);
  const [ai, setAi] = useState(0);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<{ status: ("ok" | "miss")[]; extra: string[]; score: number } | null>(null);
  const recRef = useRef<SRType | null>(null);

  const SR = typeof window !== "undefined" ? (window as unknown as { SpeechRecognition?: new () => SRType; webkitSpeechRecognition?: new () => SRType }) : {};
  const SRClass = SR.SpeechRecognition || SR.webkitSpeechRecognition;
  const supported = !!SRClass;

  useEffect(() => {
    setLoading(true);
    ensureCorpus().then(c => setCorpus(c)).catch(() => setErr("تعذّر تحميل نصّ السور — يلزم اتصال إنترنت أوّل مرّة.")).finally(() => setLoading(false));
  }, []);

  const surah = corpus?.[si];
  const ayah = surah?.ayahs[ai];

  const evaluate = (t: string) => {
    if (!ayah) return;
    const exp = ayah.text.split(/\s+/).map(w => normalizeArabic(w)).filter(Boolean);
    const tr = t.split(/\s+/).map(w => normalizeArabic(w)).filter(Boolean);
    const used = new Array(tr.length).fill(false);
    const status = exp.map(e => {
      const idx = tr.findIndex((w, i) => !used[i] && (w === e || w.includes(e) || e.includes(w)));
      if (idx >= 0) { used[idx] = true; return "ok" as const; }
      return "miss" as const;
    });
    const extra = tr.filter((_, i) => !used[i]);
    const score = exp.length ? Math.round((status.filter(s => s === "ok").length / exp.length) * 100) : 0;
    setResult({ status, extra, score });
  };

  const start = () => {
    if (!SRClass || !ayah) return;
    setTranscript(""); setResult(null);
    const rec = new SRClass();
    rec.lang = "ar-SA"; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onresult = (e) => { const t = e.results[0][0].transcript || ""; setTranscript(t); evaluate(t); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };
  const stop = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setListening(false); };

  const pickAyah = (s: number, a: number) => { setSi(s); setAi(a); setTranscript(""); setResult(null); };

  if (loading) return <AppLoader size="sm" label="جارٍ تحميل النصّ القرآني…" className="py-10" />;
  if (err) return <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {err}</p>;
  if (!surah || !ayah) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-[11px] text-accent bg-accent/10 border border-accent/30 rounded-xl p-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        تجريبي وتقريبي: يقارن تفريغ صوتك بنصّ الآية لتنبيهك على الكلمات المفقودة — ليس تصحيحاً للتجويد.
      </div>

      {/* اختيار السورة والآية */}
      <div className="grid grid-cols-2 gap-2">
        <select value={si} onChange={e => pickAyah(Number(e.target.value), 0)} className="rounded-xl bg-card border border-border px-3 py-2.5 text-foreground text-sm outline-none focus:border-accent/60">
          {corpus!.map((s, i) => <option key={s.app} value={i}>{s.name}</option>)}
        </select>
        <select value={ai} onChange={e => pickAyah(si, Number(e.target.value))} className="rounded-xl bg-card border border-border px-3 py-2.5 text-foreground text-sm outline-none focus:border-accent/60">
          {surah.ayahs.map((a, i) => <option key={a.n} value={i}>آية {a.n}</option>)}
        </select>
      </div>

      {/* نصّ الآية المرجعي */}
      <div className="card-nour p-4">
        <p className="font-quran text-2xl leading-loose text-center text-foreground">
          {result
            ? ayah.text.split(/\s+/).map((w, i) => (
                <span key={i} className={result.status[i] === "ok" ? "text-success" : result.status[i] === "miss" ? "text-destructive underline decoration-dotted" : ""}>{w}{" "}</span>
              ))
            : ayah.text}
        </p>
      </div>

      {/* زرّ التسجيل */}
      {supported ? (
        <div className="flex flex-col items-center gap-2">
          {!listening ? (
            <button onClick={start} className="btn-emerald flex items-center gap-2 px-6 py-3 rounded-2xl font-bold active:scale-95"><Mic className="w-5 h-5" /> اقرأ الآن</button>
          ) : (
            <button onClick={stop} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-destructive text-destructive-foreground font-bold active:scale-95 animate-pulse"><Square className="w-5 h-5" /> أوقف الاستماع</button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center bg-card border border-border rounded-xl p-3">التعرّف على الصوت غير مدعوم في هذا المتصفّح — استخدم Chrome على الحاسوب أو الأندرويد.</p>
      )}

      {/* النتيجة */}
      {result && (
        <div className="card-nour p-4 space-y-3 text-center">
          <div className={`text-3xl font-extrabold ${result.score >= 80 ? "text-success" : result.score >= 50 ? "text-accent" : "text-destructive"}`}>{result.score}%</div>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            {result.score >= 80 ? <><Check className="w-4 h-4 text-success" /> ممتاز، قراءة دقيقة</> : "راجِع الكلمات المُعلّمة بالأحمر"}
          </p>
          {transcript && <p className="text-xs text-muted-foreground">سُمِع: {transcript}</p>}
          {result.extra.length > 0 && <p className="text-xs text-accent/80">كلمات زائدة: {result.extra.join("، ")}</p>}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── الصفحة ───────────────────────── */
export default function QuranStudent() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("timer");

  return (
    <div className="min-h-screen page-nour text-foreground" dir="rtl">
      <div className="mx-auto max-w-md px-4 py-4 space-y-4">
        <header className="flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex h-10 items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-4 text-sm font-bold hover:brightness-95 active:scale-95"><ArrowRight className="h-4 w-4" /> التلاوات</button>
          <h1 className="font-extrabold text-lg text-gradient-gold">ركن طالب القرآن</h1>
          <span className="w-16" />
        </header>

        {/* أشرطة التبويب */}
        <div className="grid grid-cols-4 gap-1.5">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[11px] font-bold transition-colors ${active ? "bg-accent/15 border-accent/50 text-accent" : "bg-card border-border text-muted-foreground"}`}>
                <t.Icon className="w-5 h-5" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="card-nour p-4 animate-fade-up">
          {tab === "timer" && <TimerTool />}
          {tab === "library" && <LibraryTool />}
          {tab === "search" && <SearchTool />}
          {tab === "coach" && <CoachTool />}
        </div>
      </div>
    </div>
  );
}
