import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Play, RefreshCw, BookOpen, Lock, Settings, Bell, Headphones, ListOrdered, LayoutGrid, Scale, Trophy, Gift, Star, Hash, Grid3x3, Flame, Sparkles, Gamepad2, Puzzle, X, Crown, Brain, Camera, Award, Download, Clock, Mic } from "lucide-react";
import { getAllSurahs } from "../data/quranData";
import { getSurahAudioUrl, hasCloudAudio, getFallbackAudioUrl } from "../data/audioUrls";
import { getProfile, getProgress, getProfiles, getCoins, addCoins, kidsRouteBlocked, setCurrentSurah, addPlayMinutes, setAppMode, ownItem, unlockItem, getActiveId, getAppMode, isPureMode, formatCoins } from "../data/kidsProfile";
import { getGameCatalog, type GameDef, type GameEngine } from "../data/gameCatalog";
import { fetchRemoteGames, precacheRemoteGames } from "../data/remoteGames";

import { ensureCorpus, type SurahText } from "../data/quranText";
import { syncQuestionsFromServer, getLocalQuizPool, markQuestionAsAnswered, type ServerQuestion } from "../services/quizServer";
import { isKidsMode, setKidsLocked, hasKidsPin } from "../data/kidsLock";
import { saveImageDataUrl, shouldHideMushaf } from "../utils/tauriUtils";
import ParentalGateModal from "../components/ParentalGateModal";
import AdBanner from "../components/AdBanner";
import MemoryGame from "../games/MemoryGame";
import MissingWordGame from "../games/MissingWordGame";
import AyahOrderGame from "../games/AyahOrderGame";
import DetectiveGame from "../games/DetectiveGame";
import WordBuilderGame from "../games/WordBuilderGame";
import CatchStarGame from "../games/CatchStarGame";
import AyahMathGame from "../games/AyahMathGame";
import ListenKidsGame from "../games/ListenKidsGame";
import RemoteGameFrame from "../components/RemoteGameFrame";
import Avatar, { getAvatarSrc } from "../components/Avatar";
import { drawQRCodeOnCanvas } from "../utils/qrCode";
import NotificationsModal from "../components/NotificationsModal";
import BadgesModal from "../components/BadgesModal";
import QuranLockGateModal from "../components/QuranLockGateModal";
import DailyGateModal from "../components/DailyGateModal";
import ExternalHtmlBlock from "../components/ExternalHtmlBlock";
import { toast } from "../hooks/use-toast";
import { isTimeAllowed } from "../data/kidsSchedule";
import { calculateStreak, recordTodayActivity } from "../data/kidsBadges";
import { showLocalNotification } from "../utils/notifications";
import { playGameVoice, stopGameVoice, precacheGameVoice } from "../utils/gameVoice";
import { focusFirst } from "../utils/controllerNavigation";

async function enterKioskMode() {
  // تم إيقاف تكبير الشاشة التلقائي بناءً على طلب المستخدم
}

async function exitKioskMode() {
  // تم إيقاف تكبير الشاشة التلقائي بناءً على طلب المستخدم
}

const audioPath = (n: number) => (hasCloudAudio(n) ? getSurahAudioUrl(n) : getFallbackAudioUrl(n));
const shuffle = <T,>(a: T[]): T[] => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const SURAHS = getAllSurahs();

// === نظام "اللقب والانتقال التلقائي بعد 5 أحزاب" ===
const STORAGE_KEY_PROGRESS = "quran-progress";
const LAST_COMPLETED_COUNT_KEY = "mushaf:lastCompletedCount:v1";
const MUSHDAF_NAMES = ["عبدالله", "عمر", "خالد", "سعيد", "مشرق", "إسماعيل", "هاني", "بلال", "عثمان", "يوسف"];
const getNextMushafName = (index: number) => MUSHDAF_NAMES[index % MUSHDAF_NAMES.length];
const BADGE_COUNT = 5;

const TOTAL_AYAHS: Record<number, number> = {
  1:7, 2:286, 3:200, 4:176, 5:120, 6:165, 7:87, 8:75, 9:129, 10:109,
  11:123, 12:111, 13:43, 14:52, 15:99, 16:128, 17:111, 18:110, 19:98, 20:135,
  21:112, 22:78, 23:118, 24:64, 25:74, 26:227, 27:29, 28:88, 29:69, 30:60,
  31:34, 32:29, 33:73, 34:54, 35:47, 36:82, 37:182, 38:88, 39:75, 40:85,
  41:54, 42:53, 43:96, 44:76, 45:22, 46:54, 47:54, 48:105, 49:18, 50:79,
  51:135, 52:91, 53:111, 54:81, 55:47, 56:130, 57:52, 58:93, 59:45, 60:8,
  61:8, 62:11, 63:111, 64:110, 65:85, 66:365, 67:18, 68:12, 69:9, 70:11,
  71:18, 72:14, 73:11, 74:19, 75:9, 76:22, 77:27, 78:50, 79:50, 80:4,
  81:29, 82:9, 83:9, 84:6, 85:6, 86:4, 87:4, 88:5, 89:53, 90:18,
  91:14, 92:9, 93:9, 94:9, 95:9, 96:7, 97:9, 98:10, 99:6, 100:5,
  101:110, 102:44, 103:7, 104:7, 105:11, 106:12, 107:20, 108:14, 109:5, 110:4,
  111:110, 112:44, 113:45, 114:73,
};

/**
 * يحسب عدد السور المكتملّة (التي تمّ سماعها بالكامل)
 */
function getSurahCompletionCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROGRESS);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const dict : Record<string, number[]> = parsed.listenedAyahs || {};
    return Object.keys(dict).filter((k) => {
      const total = TOTAL_AYAHS[parseInt(k)] || 0;
      return total > 0 && new Set(dict[k]).size >= total;
    }).length;
  } catch {
    return 0;
  }
}

/**
 * يعيد معرفة السورة التالية في ترتيب المصحف بعد السورة الحالية
 */
function getNextSurahNumber(currentNum: number): number | null {
  const idx = SURAHS.findIndex((s) => s.number === currentNum);
  if (idx === -1 || idx + 1 >= SURAHS.length) return null;
  return SURAHS[idx + 1]?.number ?? null;
}

function drawCanvasStar(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const size = i % 2 === 0 ? radius : radius * 0.42;
    const px = x + Math.cos(angle) * size;
    const py = y + Math.sin(angle) * size;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function loadCanvasImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = encodeURI(src);
    setTimeout(() => resolve(null), 2500);
  });
}

const poolFor = (def: GameDef, minSurahOverride: number = 78) => {
  const { minAyah, maxAyah } = def.params || {};
  // يبدأ النطاق من السورة المختارة ويتجه إلى السور التالية في ترتيب المصحف.
  const minSurahNum = Math.min(114, Math.max(1, minSurahOverride));
  const minIndex = SURAHS.findIndex(s => s.number === minSurahNum);
  const safeMinIndex = minIndex >= 0 ? minIndex : SURAHS.findIndex(s => s.number === 78);

  const out = SURAHS.filter((s, idx) =>
    idx >= safeMinIndex &&
    (minAyah == null || s.ayahCount >= minAyah) &&
    (maxAyah == null || s.ayahCount <= maxAyah)
  );

  return out.length >= 4 ? out : SURAHS.filter((s, idx) => idx >= safeMinIndex);
};
// سور مجاورة للسورة المختارة (تُستخدم للمشتّات/الترتيب في بعض الألعاب)
const neighborPool = (def: GameDef, minSurahOverride: number, n: number) => {
  const chosen = SURAHS.find(s => s.number === minSurahOverride);
  if (!chosen) return poolFor(def, minSurahOverride);
  const chosenIndex = SURAHS.findIndex(s => s.number === chosen.number);
  const neighbors = SURAHS.slice(chosenIndex, chosenIndex + n).filter(s => s.number !== chosen.number);
  return [chosen, ...neighbors];
};

/* ───────────────── نواة الحماس ───────────────── */
const PRAISE_NORMAL = ["أحسنت يا بطل!", "رائع!", "أنت ذكي!"];
const PRAISE_GOOD = ["ممتاز جداً!", "أداء مذهل!", "عمل رائع!"];
const PRAISE_SUPER = ["ما شاء الله!", "أنت عبقري!", "أسطورة!"];
const ENCOURAGE_MISTAKE = ["حاول ثانية يا بطل! 🌟", "لا بأس، التكرار يعلّم!", "ركّز جيداً، أنت تستطيع! 💪", "قريب جداً! استمر! ✨"];

/** يختار عبارة التشجيع بحسب سلسلة الإجابات الصحيحة الحالية */
const pickPraise = (streak: number, seed: number): string => {
  if (streak >= 5) return PRAISE_SUPER[seed % PRAISE_SUPER.length];
  if (streak >= 3) return PRAISE_GOOD[seed % PRAISE_GOOD.length];
  return PRAISE_NORMAL[seed % PRAISE_NORMAL.length];
};

function useGame() {
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [earned, setEarned] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState(0);
  const [gain, setGain] = useState(0);
  const [wrongFlash, setWrongFlash] = useState(0);

  const correct = () => {
    const ns = streak + 1;
    // نقاط الألعاب قليلة عمداً — القراءة هي المصدر الأساسي للنجوم (المال)
    const bonus = Math.max(1, 3 - mistakes);
    addCoins(bonus); setGain(bonus); setEarned(e => e + bonus);
    setScore(s => s + 1); setAnswers(a => a + 1); setStreak(ns); setFlash(f => f + 1);
    // صوت تشجيع حقيقي بحسب مستوى الإجادة
    playGameVoice(pickPraise(ns, flash + 1));
    window.setTimeout(() => setGain(0), 900);
  };
  const miss = () => {
    setStreak(0);
    setGain(0);
    setMistakes(m => m + 1);
    setWrongFlash(w => w + 1);
    setAnswers(a => a + 1);
    // صوت تحفيزي لطيف عند الخطأ
    playGameVoice(ENCOURAGE_MISTAKE[wrongFlash % ENCOURAGE_MISTAKE.length]);
  };
  const reset = () => {
    setScore(0);
    setAnswers(0);
    setMistakes(0);
    setEarned(0);
    setStreak(0);
    setGain(0);
    setWrongFlash(0);
  };
  return { score, answers, mistakes, earned, streak, flash, gain, wrongFlash, correct, miss, reset };
}
type Game = ReturnType<typeof useGame>;

const GameHud = ({ g }: { g: Game }) => {
  const [showPraise, setShowPraise] = useState(false);
  const [showWrong, setShowWrong] = useState(false);

  useEffect(() => {
    if (g.flash > 0) {
      setShowPraise(true);
      const t = setTimeout(() => setShowPraise(false), 2000);
      return () => clearTimeout(t);
    }
  }, [g.flash]);

  useEffect(() => {
    if (g.wrongFlash > 0) {
      setShowWrong(true);
      const t = setTimeout(() => setShowWrong(false), 1000);
      return () => clearTimeout(t);
    }
  }, [g.wrongFlash]);

  const getPraise = () => pickPraise(g.streak, g.flash);

  const getEncourage = () => {
    return ENCOURAGE_MISTAKE[g.wrongFlash % ENCOURAGE_MISTAKE.length];
  };

  return (
    <div className="flex items-center justify-center gap-2.5 sm:gap-3 min-h-[28px] flex-wrap">
      <span className="inline-flex items-center gap-1 text-accent font-extrabold text-xs sm:text-sm">
        <Star className="w-4 h-4 fill-current text-amber-500" /> {g.score} صحيحة
      </span>
      {g.mistakes > 0 && (
        <span className="inline-flex items-center gap-1 text-rose-500 font-bold text-xs bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20 animate-in fade-in">
          ❌ {g.mistakes} أخطاء
        </span>
      )}
      {g.streak >= 2 && (
        <span className="inline-flex items-center gap-1 text-orange-400 font-bold text-xs sm:text-sm">
          <Flame className="w-4 h-4" /> {g.streak}× متتالية
        </span>
      )}
      {g.gain > 0 && (
        <span key={g.flash} className="inline-flex items-center gap-0.5 text-success font-extrabold animate-bounce text-xs sm:text-sm">
          +{g.gain}<Star className="w-3.5 h-3.5 fill-current" />
        </span>
      )}
      {showPraise && (
        <span key={`p-${g.flash}`} className="pointer-events-none fixed left-1/2 top-1/3 z-[60] -translate-x-1/2 font-extrabold text-accent drop-shadow-lg animate-celebrate"
          style={{ fontSize: g.streak >= 5 ? "2.2rem" : g.streak >= 3 ? "1.8rem" : "1.4rem" }}>
          {getPraise()}
        </span>
      )}
      {showWrong && (
        <div key={`w-${g.wrongFlash}`} className="pointer-events-none fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 animate-popup-center flex flex-col items-center">
          <div className="bg-card/95 backdrop-blur-md px-8 py-5 rounded-3xl border-2 border-rose-500/50 shadow-[0_0_40px_rgba(244,63,94,0.3)] flex items-center justify-center">
            <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-rose-400 text-2xl sm:text-3xl whitespace-nowrap">
              {getEncourage()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

function useRoundTimer(roundKey: unknown, seconds: number, onExpire: () => void, enabled = true) {
  const [left, setLeft] = useState(seconds);
  const cb = useRef(onExpire); cb.current = onExpire;
  useEffect(() => {
    setLeft(seconds);
    // seconds = 0 يعني "بلا حدّ للوقت" — لا عدّاد ولا انتهاء
    if (!enabled || seconds <= 0) return;
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const start = now();
    const id = setInterval(() => {
      const rem = Math.max(0, seconds - (now() - start) / 1000);
      setLeft(rem);
      if (rem <= 0) { clearInterval(id); cb.current(); }
    }, 100);
    return () => clearInterval(id);
  }, [roundKey, seconds, enabled]);
  return seconds <= 0 ? seconds : left;
}
const TimerBar = ({ left, seconds }: { left: number; seconds: number }) => {
  if (seconds <= 0) return <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: "100%" }} /></div>;
  const pct = Math.max(0, Math.min(100, (left / seconds) * 100));
  const danger = left <= seconds * 0.3;
  return (
    <div className="h-2 rounded-full bg-secondary overflow-hidden">
      <div className={`h-full transition-[width] duration-100 ${danger ? "bg-destructive" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

const ROUNDS = 20;
const SessionBar = ({ q }: { q: number }) => (
  <p className="text-[11px] text-muted-foreground font-bold">السؤال {Math.min(q, ROUNDS)} من {ROUNDS}</p>
);
const ResultCard = ({ g, onReplay }: { g: Game; onReplay: () => void }) => {
  const pct = g.answers ? Math.round((g.score / g.answers) * 100) : 0;
  const msg = pct >= 80 ? "ما شاء الله! إتقان ممتاز يا بطل" : pct >= 50 ? "أحسنت! أداء مبارك ورائع" : "لا بأس يا بطل — التكرار يعلّم الشطار!";
  return (
    <div className="space-y-4 text-center py-4 animate-fade-up">
      <Trophy className="w-14 h-14 mx-auto text-accent animate-pulse" />
      <p className="text-xl font-extrabold text-foreground">{msg}</p>
      <div className="flex items-center justify-center gap-3 text-xs sm:text-sm font-bold">
        <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl">✓ {g.score} إجابات صحيحة</span>
        <span className="text-rose-500 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-xl">❌ {g.mistakes} أخطاء</span>
      </div>
      <p className="inline-flex items-center gap-1 text-accent font-extrabold text-lg"><Star className="w-5 h-5 fill-current" /> ربحت {g.earned} نجمة</p>
      <button onClick={onReplay} className="btn-gold mx-auto px-6 py-2.5 rounded-xl font-bold flex items-center gap-1.5 active:scale-95 shadow-md"><RefreshCw className="w-4 h-4" /> العب من جديد</button>
    </div>
  );
};

function useCorpus() {
  const [corpus, setCorpus] = useState<SurahText[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => { setFailed(false); ensureCorpus().then(setCorpus).catch(() => setFailed(true)); };
  useEffect(load, []);
  return { corpus, failed, retry: load };
}
const CorpusGate = ({ failed, retry }: { failed: boolean; retry: () => void }) => (
  <div className="text-center space-y-3 py-6">
    {failed ? (
      <>
        <p className="text-sm text-destructive">تعذّر تحميل نصوص السور — يلزم اتصال بالإنترنت مرّة واحدة فقط</p>
        <button onClick={retry} className="btn-gold mx-auto px-5 py-2 rounded-xl font-bold flex items-center gap-1"><RefreshCw className="w-4 h-4" /> إعادة المحاولة</button>
      </>
    ) : (
      <p className="text-sm text-muted-foreground animate-pulse">جاري تحضير نصوص السور...</p>
    )}
  </div>
);

function OrderEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const { corpus } = useCorpus();
  const pool = (def.params?.minAyah || def.params?.maxAyah || def.params?.minSurah || def.params?.maxSurah) ? poolFor(def, minSurah) : SURAHS.filter(s => s.ayahCount >= 3 && s.ayahCount <= 8 && s.number >= minSurah);
  const orderRef = useRef(shuffle(pool));
  const getNext = () => { if (!orderRef.current.length) orderRef.current = shuffle(pool); return orderRef.current.pop() || pool[0]; };
  const makeSurah = () => getNext();
  const [surah, setSurah] = useState(makeSurah);
  const [order, setOrder] = useState<number[]>(() => shuffle(Array.from({ length: surah.ayahCount }, (_, i) => i + 1)));
  const [nextNum, setNextNum] = useState(1);
  const g = useGame();
  const done = nextNum > surah.ayahCount;
  const text = corpus?.find(c => c.app === surah.number);
  const ayahText = (n: number) => text?.ayahs.find(a => a.n === n)?.text;
  const reset = () => { const s = makeSurah(); setSurah(s); setOrder(shuffle(Array.from({ length: s.ayahCount }, (_, i) => i + 1))); setNextNum(1); };
  const tap = (n: number) => {
    if (done) return;
    if (n !== nextNum) { g.miss(); toast({ title: "حاول مرة أخرى" }); return; }
    g.correct(); setNextNum(n + 1);
    if (n === surah.ayahCount) toast({ title: "أحسنت، رتّبتها صحيحاً" });
  };
  return (
    <div className="space-y-4 text-center">
      <p className="text-muted-foreground text-sm">رتّب آيات <b className="text-accent">{surah.name}</b> بالترتيب الصحيح{text ? " — ابدأ بالآية الأولى" : ""}</p>
      {text ? (
        <div className="grid gap-2">
          {order.map(n => {
            const placed = n < nextNum;
            return (
              <button key={n} onClick={() => tap(n)} disabled={placed}
                className={`p-3 sm:p-4 rounded-2xl border-2 text-right font-amiri text-lg sm:text-xl font-bold leading-relaxed transition-all active:scale-95 shadow-sm ${placed ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-500 opacity-80" : "bg-secondary/80 border-border text-foreground hover:border-amber-400/80 hover:bg-secondary"}`}>
                <span className={`inline-flex w-7 h-7 ml-3 rounded-full text-[13px] items-center justify-center align-middle font-sans font-black shadow-sm ${placed ? "bg-emerald-500 text-emerald-950" : "bg-secondary-foreground/10 text-muted-foreground"}`}>{placed ? n : "؟"}</span>
                {ayahText(n)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {order.map(n => (
            <button key={n} onClick={() => tap(n)} disabled={n < nextNum} className={`aspect-square rounded-2xl font-black text-2xl sm:text-3xl border-2 active:scale-95 transition-all shadow-sm ${n < nextNum ? "bg-emerald-500 border-emerald-500 text-emerald-950 opacity-80 scale-95" : "bg-secondary/80 border-border text-foreground hover:border-amber-400 hover:bg-secondary"}`}>{n}</button>
          ))}
        </div>
      )}
      <GameHud g={g} />
      {done && <button onClick={reset} className="btn-gold mx-auto px-5 py-2 rounded-xl font-bold flex items-center gap-1"><RefreshCw className="w-4 h-4" /> سورة أخرى</button>}
    </div>
  );
}

function MemoryEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  // ── السور من سورة يس (36) إلى سورة الناس (114) حصراً ("تحت يس") ──
  const YASIN_AND_BELOW = SURAHS.filter(s => s.number >= 36 && s.number <= 114);

  // خيارات عدد البطاقات (6 أزواج = 12 بطاقة، 8 أزواج = 16 بطاقة، 10 أزواج = 20 بطاقة)
  const [pairsCount, setPairsCount] = useState<number>(() => def.params?.pairs ?? 6);
  const [moves, setMoves] = useState(0);

  const playTone = (freq: number, type: OscillatorType = "sine", duration = 0.12) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      /* ignore audio context errors */
    }
  };

  const build = (numPairs: number) => {
    const picked = shuffle(YASIN_AND_BELOW).slice(0, numPairs);
    const doubleCards = picked.flatMap((s) => [
      { id: `${s.number}-a`, num: s.number, name: s.name, ayahCount: s.ayahCount, type: s.type },
      { id: `${s.number}-b`, num: s.number, name: s.name, ayahCount: s.ayahCount, type: s.type },
    ]);
    return shuffle(doubleCards);
  };

  const [cards, setCards] = useState(() => build(pairsCount));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const g = useGame();

  const handleDifficulty = (count: number) => {
    setPairsCount(count);
    setCards(build(count));
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    g.reset();
  };

  const flip = (i: number) => {
    if (flipped.length === 2 || flipped.includes(i) || matched.includes(cards[i].num)) return;
    playTone(480, "triangle", 0.05);

    const nextFlipped = [...flipped, i];
    setFlipped(nextFlipped);

    if (nextFlipped.length === 2) {
      setMoves(m => m + 1);
      const cardA = cards[nextFlipped[0]];
      const cardB = cards[nextFlipped[1]];

      if (cardA.num === cardB.num) {
        playTone(587, "sine", 0.1);
        setTimeout(() => playTone(880, "sine", 0.22), 80);
        g.correct();
        setMatched(m => [...m, cardA.num]);
        setFlipped([]);
        addCoins(1);
      } else {
        g.miss();
        setTimeout(() => setFlipped([]), 850);
      }
    }
  };

  const won = matched.length === pairsCount;

  return (
    <div className="space-y-4 text-center">
      {/* رأس اللعبة واختيار عدد البطاقات */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-2.5 rounded-2xl bg-secondary/40 border border-border/60">
        <div className="text-right">
          <h4 className="font-extrabold text-sm text-foreground flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-accent" />
            <span>بطاقات السور المباركة (من يس إلى الناس)</span>
          </h4>
          <span className="text-[11px] text-muted-foreground">
            الحركات: {moves} • المطابقات: {matched.length}/{pairsCount}
          </span>
        </div>

        {/* عدد البطاقات */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-border text-xs font-bold">
          <span className="text-[10px] text-muted-foreground px-1 hidden min-[450px]:inline">العدد:</span>
          {[
            { label: "12 بطاقة", count: 6 },
            { label: "16 بطاقة", count: 8 },
            { label: "20 بطاقة", count: 10 },
          ].map((d) => (
            <button
              key={d.count}
              onClick={() => handleDifficulty(d.count)}
              className={`px-2 py-1 rounded-lg transition-all text-[11px] ${
                pairsCount === d.count
                  ? "btn-gold font-black shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-muted-foreground text-xs sm:text-sm font-semibold">
        اقلب البطاقات وطابق كل سورتين متماثلتين من سور ربع يس والأجزاء الأخيرة ✨
      </p>

      {/* شبكة البطاقات الفخمة */}
      <div
        className={`grid gap-2 sm:gap-3 ${
          pairsCount === 6
            ? "grid-cols-3 sm:grid-cols-4"
            : pairsCount === 8
            ? "grid-cols-4"
            : "grid-cols-4 sm:grid-cols-5"
        }`}
      >
        {cards.map((c, i) => {
          const isFlipped = flipped.includes(i);
          const isMatched = matched.includes(c.num);
          const isOpen = isFlipped || isMatched;

          return (
            <button
              key={c.id}
              onClick={() => flip(i)}
              disabled={isOpen}
              className={`relative aspect-[3/4] sm:aspect-square rounded-2xl p-2 flex flex-col items-center justify-between border-2 transition-all duration-200 transform active:scale-95 select-none ${
                isMatched
                  ? "border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-400/40 shadow-md shadow-emerald-500/20 scale-[0.98]"
                  : isOpen
                  ? "border-accent bg-gradient-to-br from-card via-card to-accent/15 shadow-xl shadow-accent/20 scale-105"
                  : "border-amber-400/35 bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-950 hover:border-amber-400/80 hover:shadow-lg hover:shadow-amber-500/15"
              }`}
            >
              {isOpen ? (
                <>
                  {/* الرأس: رقم ونوع السورة */}
                  <div className="w-full flex items-center justify-between text-[9px] font-extrabold">
                    <span className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                      {c.num}
                    </span>
                    <span className="text-muted-foreground">{c.type}</span>
                  </div>

                  {/* المنتصف: اسم السورة بفونت فخم */}
                  <div className="my-auto py-1 text-center">
                    <span className="font-amiri font-black text-sm sm:text-lg text-foreground block leading-tight">
                      {c.name}
                    </span>
                    {isMatched && (
                      <span className="text-[10px] font-black text-emerald-400 block mt-0.5 animate-in zoom-in-50">
                        ✓ متطابقة
                      </span>
                    )}
                  </div>

                  {/* الأسفل: عدد الآيات */}
                  <div className="w-full text-center text-[10px] font-bold text-muted-foreground border-t border-border/40 pt-1">
                    {c.ayahCount} آيات
                  </div>
                </>
              ) : (
                /* وجه البطاقة المغلق: تصميم إسلامي ملكي فاخر */
                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-inner group-hover:scale-110 transition-transform">
                    <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
                  </div>
                  <span className="text-[10px] sm:text-xs font-black text-amber-300/80 tracking-widest">
                    مصحف
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <GameHud g={g} />

      {/* بطاقة الفوز والاحتفال */}
      {won && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-accent/15 to-emerald-500/15 border-2 border-emerald-500/40 space-y-3 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-center gap-2 font-black text-lg sm:text-xl text-emerald-400">
            <Trophy className="w-6 h-6 text-amber-400 animate-bounce" />
            <span>ما شاء الله! طابقت جميع البطاقات بنجاح بطل! 🌟</span>
          </div>
          <p className="text-xs text-muted-foreground font-bold">
            أنهيت اللعبة في {moves} حركة • كسبت نجوم إضافية لحسابك
          </p>
          <button
            onClick={() => {
              setCards(build(pairsCount));
              setMatched([]);
              setFlipped([]);
              setMoves(0);
              g.reset();
            }}
            className="btn-gold mx-auto px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all"
          >
            <RefreshCw className="w-4 h-4" /> العب جولة جديدة بسور أخرى
          </button>
        </div>
      )}
    </div>
  );
}

function WhichEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const pool = poolFor(def, minSurah);
  const orderRef = useRef(shuffle(pool));
  const pair = () => {
    if (!orderRef.current.length) orderRef.current = shuffle(pool);
    const a = orderRef.current.pop() || pool[0];
    const diff = pool.filter(x => x.ayahCount !== a.ayahCount);
    const b = diff.length ? diff[Math.floor(Math.random() * diff.length)] : pool.find(x => x.number !== a.number)!;
    return shuffle([a, b]);
  };
  const [two, setTwo] = useState(pair);
  const [round, setRound] = useState(0);
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const g = useGame();
  const finished = qNum > ROUNDS;
  const next = (nn: number) => { setReveal(false); setQNum(nn); if (nn <= ROUNDS) { setTwo(pair()); setRound(r => r + 1); } };
  const left = useRoundTimer(round, 8, () => { g.miss(); setReveal(true); window.setTimeout(() => next(qNum + 1), 1100); }, !reveal && !finished);
  const choose = (s: typeof SURAHS[number]) => {
    if (reveal || finished) return;
    const other = two.find(x => x.number !== s.number)!;
    if (s.ayahCount > other.ayahCount) g.correct(); else g.miss();
    setReveal(true);
    window.setTimeout(() => next(qNum + 1), 1100);
  };
  const replay = () => { g.reset(); setQNum(1); setTwo(pair()); setRound(r => r + 1); };
  if (finished) return <ResultCard g={g} onReplay={replay} />;
  const maxCount = Math.max(...two.map(s => s.ayahCount));
  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-muted-foreground text-base sm:text-lg font-medium">أيّ سورة عدد آياتها أكثر؟</p>
      <TimerBar left={left} seconds={8} />
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {two.map(s => (
          <button key={s.number} onClick={() => choose(s)}
            className={`p-4 sm:p-6 rounded-2xl border-2 font-black text-lg sm:text-xl active:scale-95 transition-all shadow-sm ${reveal && s.ayahCount === maxCount ? "bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-emerald-500/20" : "bg-secondary/80 border-border hover:border-amber-400 hover:bg-secondary text-foreground"}`}>
            <span className="block">{s.name}</span>
            {reveal && <span className="block mt-1 text-xs sm:text-sm font-extrabold text-muted-foreground">{s.ayahCount} آيات</span>}
          </button>
        ))}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function QuizEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const pool = poolFor(def, minSurah);
  const orderRef = useRef(shuffle(pool));
  const make = () => {
    if (!orderRef.current.length) orderRef.current = shuffle(pool);
    const s = orderRef.current.pop() || pool[0];
    const opts = new Set<number>([s.ayahCount]);
    // خيارات أقرب للإجابة الصحيحة (فروق أصغر = سؤال أصعب)
    for (const d of shuffle([-2, -1, 1, 2])) {
      const v = s.ayahCount + d;
      if (v >= 1) opts.add(v);
      if (opts.size === 4) break;
    }
    return { s, opts: shuffle([...opts]) };
  };
  const [q, setQ] = useState(make);
  const [round, setRound] = useState(0);
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const g = useGame();
  const finished = qNum > ROUNDS;
  const next = (nn: number) => { setReveal(false); setChosen(null); setQNum(nn); if (nn <= ROUNDS) { setQ(make()); setRound(r => r + 1); } };
  const left = useRoundTimer(round, 8, () => { g.miss(); setReveal(true); window.setTimeout(() => next(qNum + 1), 1100); }, !reveal && !finished);
  const answer = (n: number) => {
    if (reveal || finished) return;
    setChosen(n);
    if (n === q.s.ayahCount) g.correct(); else g.miss();
    setReveal(true);
    window.setTimeout(() => next(qNum + 1), 1100);
  };
  const replay = () => { g.reset(); setQNum(1); setQ(make()); setRound(r => r + 1); };
  if (finished) return <ResultCard g={g} onReplay={replay} />;
  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-foreground text-base sm:text-lg font-bold">كم عدد آيات سورة <span className="text-accent">{q.s.name}</span>؟</p>
      <TimerBar left={left} seconds={8} />
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {q.opts.map((n, i) => {
          const cls = reveal && n === q.s.ayahCount ? "bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-emerald-500/20"
            : reveal && n === chosen ? "bg-rose-500/20 border-rose-500 text-rose-500"
            : "bg-secondary/80 border-border hover:border-amber-400 hover:bg-secondary text-foreground shadow-sm";
          return <button key={i} onClick={() => answer(n)} className={`p-4 sm:p-5 rounded-2xl border-2 font-black text-xl sm:text-2xl active:scale-95 transition-all ${cls}`}>{n}</button>;
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function ServerQuizEngine({ def }: { def: GameDef }) {
  const [pool, setPool] = useState<ServerQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // حاولنا جلب الأسئلة مسبقاً في useEffect الأساسي، نأخذها من المخزن الآن
    const localPool = getLocalQuizPool();
    setPool(localPool);
    setLoading(false);
  }, []);

  const orderRef = useRef<ServerQuestion[]>([]);
  const make = (): ServerQuestion | null => {
    if (pool.length === 0) return null;
    if (!orderRef.current.length) {
      orderRef.current = shuffle([...pool]);
    }
    return orderRef.current.pop() || null;
  };
  
  const [q, setQ] = useState<ServerQuestion | null>(null);
  const [round, setRound] = useState(0);
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const g = useGame();
  
  useEffect(() => {
    if (!loading && pool.length > 0 && !q) {
      setQ(make());
    }
  }, [loading, pool, q]);

  const finished = qNum > ROUNDS;
  const next = (nn: number) => { 
    setReveal(false); 
    setChosen(null); 
    setQNum(nn); 
    if (nn <= ROUNDS) { 
      setQ(make()); 
      setRound(r => r + 1); 
    } 
  };
  const left = useRoundTimer(round, 12, () => { 
    g.miss(); 
    setReveal(true); 
    if (q) markQuestionAsAnswered(q.id);
    window.setTimeout(() => next(qNum + 1), 1500); 
  }, !reveal && !finished && q !== null);

  const answer = (ans: string) => {
    if (reveal || finished || !q) return;
    setChosen(ans);
    if (ans === q.correct_answer) g.correct(); else g.miss();
    setReveal(true);
    markQuestionAsAnswered(q.id);
    window.setTimeout(() => next(qNum + 1), 1500);
  };

  const replay = () => { g.reset(); setQNum(1); setQ(make()); setRound(r => r + 1); };
  
  if (loading) return <div className="p-8 text-center text-muted-foreground font-bold">جاري تحميل الأسئلة الذكية...</div>;
  if (pool.length === 0) return <div className="p-8 text-center text-destructive font-bold">لم نتمكن من جلب الأسئلة! الرجاء الاتصال بالإنترنت أو المحاولة لاحقاً.</div>;
  
  if (finished) return <ResultCard g={g} onReplay={replay} />;
  if (!q) return null;

  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-foreground text-base sm:text-lg font-bold leading-relaxed">{q.question}</p>
      <TimerBar left={left} seconds={12} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        {q.options.map((opt, i) => {
          const cls = reveal && opt === q.correct_answer ? "bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-emerald-500/20"
            : reveal && opt === chosen ? "bg-rose-500/20 border-rose-500 text-rose-500"
            : "bg-secondary/80 border-border hover:border-amber-400 hover:bg-secondary text-foreground shadow-sm";
          return <button key={i} onClick={() => answer(opt)} className={`p-4 sm:p-5 rounded-2xl border-2 font-black text-lg active:scale-95 transition-all ${cls}`}>{opt}</button>;
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function CountEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const pool = poolFor(def, minSurah);
  const orderRef = useRef(shuffle(pool));
  const make = () => {
    if (!orderRef.current.length) orderRef.current = shuffle(pool);
    const s = orderRef.current.pop() || pool[0];
    const wrong = shuffle(pool.filter(x => x.ayahCount !== s.ayahCount)).slice(0, 3);
    return { s, opts: shuffle([s, ...wrong]) };
  };
  const [q, setQ] = useState(make);
  const [round, setRound] = useState(0);
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const g = useGame();
  const finished = qNum > ROUNDS;
  const next = (nn: number) => { setReveal(false); setChosen(null); setQNum(nn); if (nn <= ROUNDS) { setQ(make()); setRound(r => r + 1); } };
  const left = useRoundTimer(round, 9, () => { g.miss(); setReveal(true); window.setTimeout(() => next(qNum + 1), 1100); }, !reveal && !finished);
  const choose = (n: number) => {
    if (reveal || finished) return;
    setChosen(n);
    if (n === q.s.number) g.correct(); else g.miss();
    setReveal(true);
    window.setTimeout(() => next(qNum + 1), 1100);
  };
  const replay = () => { orderRef.current = shuffle(pool); g.reset(); setQNum(1); setQ(make()); setRound(r => r + 1); };
  if (finished) return <ResultCard g={g} onReplay={replay} />;
  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-foreground text-base sm:text-lg font-bold">أيّ سورة عدد آياتها <span className="text-accent">{q.s.ayahCount}</span>؟</p>
      <TimerBar left={left} seconds={9} />
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {q.opts.map(s => {
          const cls = reveal && s.number === q.s.number ? "bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-emerald-500/20"
            : reveal && s.number === chosen ? "bg-rose-500/20 border-rose-500 text-rose-500"
            : "bg-secondary/80 border-border hover:border-amber-400 hover:bg-secondary text-foreground shadow-sm";
          return (
            <button key={s.number} onClick={() => choose(s.number)} className={`p-3 sm:p-5 rounded-2xl border-2 font-black text-base sm:text-lg active:scale-95 transition-all min-h-[55px] sm:min-h-[70px] ${cls}`}>
              {s.name}{reveal && <span className="mr-1 text-xs font-extrabold text-muted-foreground">({s.ayahCount} آيات)</span>}
            </button>
          );
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function NextAyahEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const { corpus, failed, retry } = useCorpus();
  if (!corpus) return <CorpusGate failed={failed} retry={retry} />;
  return <NextAyahPlay corpus={corpus} def={def} minSurah={minSurah} />;
}
function NextAyahPlay({ corpus, def, minSurah }: { corpus: SurahText[], def: GameDef, minSurah: number }) {
  const pool = poolFor(def, minSurah).map(s => s.number);
  const eligible = corpus.filter(c => c.ayahs.length >= 3 && pool.includes(c.app));
  const orderRef = useRef(shuffle(eligible));
  const usedAyahsRef = useRef<Set<string>>(new Set());

  const getNext = () => { 
    if (!orderRef.current.length) orderRef.current = shuffle(eligible); 
    return orderRef.current.pop() || eligible[0]; 
  };

  const make = (prevApp?: number) => {
    let s = getNext();
    if (s.app === prevApp && eligible.length > 1) s = getNext();
    let promptAyah = s.ayahs[0];
    let answerAyah = s.ayahs[1];

    for (let t = 0; t < 20; t++) {
      const i = Math.floor(Math.random() * (s.ayahs.length - 1));
      promptAyah = s.ayahs[i];
      answerAyah = s.ayahs[i + 1];
      if (!usedAyahsRef.current.has(promptAyah.text)) {
        usedAyahsRef.current.add(promptAyah.text);
        break;
      }
      s = getNext();
    }

    const distract = shuffle(s.ayahs.filter(a => a.n !== answerAyah.n && a.n !== promptAyah.n)).slice(0, 2);
    const others = shuffle(eligible.filter(c => c.app !== s.app));
    for (const o of others) {
      if (distract.length >= 2) break;
      const a = o.ayahs[Math.floor(Math.random() * o.ayahs.length)];
      if (a.text !== answerAyah.text && !distract.some(d => d.text === a.text)) distract.push(a);
    }
    return { s, prompt: promptAyah, opts: shuffle([answerAyah, ...distract]), answer: answerAyah };
  };

  const [q, setQ] = useState(() => make());
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const g = useGame();
  const finished = qNum > ROUNDS;

  const next = (nn: number) => { 
    setReveal(false); 
    setChosen(null); 
    setQNum(nn); 
    if (nn <= ROUNDS) setQ(make(q.s.app)); 
  };

  const answerTap = (text: string) => {
    if (reveal || finished) return;
    setChosen(text);
    if (text === q.answer.text) g.correct(); else g.miss();
    setReveal(true);
    window.setTimeout(() => next(qNum + 1), text === q.answer.text ? 700 : 1600);
  };

  const replay = () => { 
    usedAyahsRef.current.clear(); 
    g.reset(); 
    setQNum(1); 
    setQ(make()); 
  };

  if (finished) return <ResultCard g={g} onReplay={replay} />;

  return (
    <div className="space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-muted-foreground text-sm">من سورة <b className="text-accent">{q.s.name}</b> — ما الآية التالية؟</p>
      <div className="p-4 rounded-2xl bg-accent/10 border border-accent/40 font-amiri text-xl leading-loose text-foreground">{q.prompt.text}</div>
      <div className="grid gap-2">
        {q.opts.map((a, i) => {
          const cls = reveal && a.text === q.answer.text ? "bg-success/20 border-success/60 text-success"
            : reveal && a.text === chosen ? "bg-destructive/20 border-destructive/60 text-destructive"
            : "bg-secondary border-border hover:border-accent/50 text-secondary-foreground";
          return <button key={i} onClick={() => answerTap(a.text)} className={`p-3 rounded-xl border text-right font-amiri text-lg leading-relaxed active:scale-[0.98] transition-colors ${cls}`}>{a.text}</button>;
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function PrevAyahEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const { corpus, failed, retry } = useCorpus();
  if (!corpus) return <CorpusGate failed={failed} retry={retry} />;
  return <PrevAyahPlay corpus={corpus} def={def} minSurah={minSurah} />;
}

function PrevAyahPlay({ corpus, def, minSurah }: { corpus: SurahText[], def: GameDef, minSurah: number }) {
  const pool = poolFor(def, minSurah).map(s => s.number);
  const eligible = corpus.filter(c => c.ayahs.length >= 3 && pool.includes(c.app));
  const orderRef = useRef(shuffle(eligible));
  const usedAyahsRef = useRef<Set<string>>(new Set());

  const getNext = () => { 
    if (!orderRef.current.length) orderRef.current = shuffle(eligible); 
    return orderRef.current.pop() || eligible[0]; 
  };

  const make = (prevApp?: number) => {
    let s = getNext();
    if (s.app === prevApp && eligible.length > 1) s = getNext();
    let promptAyah = s.ayahs[1];
    let answerAyah = s.ayahs[0];

    for (let t = 0; t < 20; t++) {
      const i = Math.floor(Math.random() * (s.ayahs.length - 1)) + 1;
      promptAyah = s.ayahs[i];
      answerAyah = s.ayahs[i - 1];
      if (!usedAyahsRef.current.has(promptAyah.text)) {
        usedAyahsRef.current.add(promptAyah.text);
        break;
      }
      s = getNext();
    }

    const distract = shuffle(s.ayahs.filter(a => a.n !== answerAyah.n && a.n !== promptAyah.n)).slice(0, 2);
    const others = shuffle(eligible.filter(c => c.app !== s.app));
    for (const o of others) {
      if (distract.length >= 2) break;
      const a = o.ayahs[Math.floor(Math.random() * o.ayahs.length)];
      if (a.text !== answerAyah.text && !distract.some(d => d.text === a.text)) distract.push(a);
    }
    return { s, prompt: promptAyah, opts: shuffle([answerAyah, ...distract]), answer: answerAyah };
  };

  const [q, setQ] = useState(() => make());
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const g = useGame();
  const finished = qNum > ROUNDS;

  const next = (nn: number) => { 
    setReveal(false); 
    setChosen(null); 
    setQNum(nn); 
    if (nn <= ROUNDS) setQ(make(q.s.app)); 
  };

  const answerTap = (text: string) => {
    if (reveal || finished) return;
    setChosen(text);
    if (text === q.answer.text) g.correct(); else g.miss();
    setReveal(true);
    window.setTimeout(() => next(qNum + 1), text === q.answer.text ? 700 : 1600);
  };

  const replay = () => { 
    usedAyahsRef.current.clear(); 
    g.reset(); 
    setQNum(1); 
    setQ(make()); 
  };

  if (finished) return <ResultCard g={g} onReplay={replay} />;

  return (
    <div className="space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-muted-foreground text-sm">من سورة <b className="text-accent">{q.s.name}</b> — ما الآية السابقة؟</p>
      <div className="p-4 rounded-2xl bg-accent/10 border border-accent/40 font-amiri text-xl leading-loose text-foreground">{q.prompt.text}</div>
      <div className="grid gap-2">
        {q.opts.map((a, i) => {
          const cls = reveal && a.text === q.answer.text ? "bg-success/20 border-success/60 text-success"
            : reveal && a.text === chosen ? "bg-destructive/20 border-destructive/60 text-destructive"
            : "bg-secondary border-border hover:border-accent/50 text-secondary-foreground";
          return <button key={i} onClick={() => answerTap(a.text)} className={`p-3 rounded-xl border text-right font-amiri text-lg leading-relaxed active:scale-[0.98] transition-colors ${cls}`}>{a.text}</button>;
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function WhichSurahEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const { corpus, failed, retry } = useCorpus();
  if (!corpus) return <CorpusGate failed={failed} retry={retry} />;
  return <WhichSurahPlay corpus={corpus} def={def} minSurah={minSurah} />;
}
function WhichSurahPlay({ corpus, def, minSurah }: { corpus: SurahText[], def: GameDef, minSurah: number }) {
  const pool = poolFor(def, minSurah).map(s => s.number);
  const eligible = corpus.filter(c => pool.includes(c.app));
  const orderRef = useRef(shuffle(eligible));
  const usedAyahsRef = useRef<Set<string>>(new Set());

  const getNext = () => { 
    if (!orderRef.current.length) orderRef.current = shuffle(eligible); 
    return orderRef.current.pop() || eligible[0]; 
  };

  const make = (prevApp?: number) => {
    let s = getNext();
    if (s.app === prevApp && eligible.length > 1) s = getNext();
    const ayahs = s.ayahs.filter(a => !(s.std === 1 && a.n === 1));
    const cleanAyahs = ayahs.filter(a => !usedAyahsRef.current.has(a.text));
    const a = (cleanAyahs.length ? cleanAyahs[Math.floor(Math.random() * cleanAyahs.length)] : ayahs[0]) || s.ayahs[0];
    usedAyahsRef.current.add(a.text);

    const others = shuffle(eligible.filter(c => c.app !== s.app)).slice(0, 3);
    return { text: a.text, answer: s, opts: shuffle([s, ...others]) };
  };

  const [q, setQ] = useState(() => make());
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const g = useGame();
  const finished = qNum > ROUNDS;

  const next = (nn: number) => { 
    setReveal(false); 
    setChosen(null); 
    setQNum(nn); 
    if (nn <= ROUNDS) setQ(make(q.answer.app)); 
  };

  const choose = (app: number) => {
    if (reveal || finished) return;
    setChosen(app);
    if (app === q.answer.app) g.correct(); else g.miss();
    setReveal(true);
    window.setTimeout(() => next(qNum + 1), 1100);
  };

  const replay = () => { 
    usedAyahsRef.current.clear(); 
    g.reset(); 
    setQNum(1); 
    setQ(make()); 
  };

  if (finished) return <ResultCard g={g} onReplay={replay} />;

  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-muted-foreground text-sm sm:text-base font-bold">من أيّ سورة هذه الآية الكريمة؟</p>
      <div className="p-4 rounded-2xl bg-accent/10 border border-accent/40 font-amiri text-lg sm:text-2xl leading-loose text-foreground">{q.text}</div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {q.opts.map(s => {
          const cls = reveal && s.app === q.answer.app ? "bg-success/20 border-success/60 text-success"
            : reveal && s.app === chosen ? "bg-destructive/20 border-destructive/60 text-destructive"
            : "bg-secondary border-border hover:border-accent/50 text-secondary-foreground";
          return <button key={s.app} onClick={() => choose(s.app)} className={`p-3 sm:p-5 rounded-xl border font-bold text-base sm:text-lg active:scale-95 transition-colors min-h-[55px] sm:min-h-[70px] ${cls}`}>{s.name}</button>;
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function SurahAudioEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const [source, setSource] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [question, setQuestion] = useState<{ surah: { number: number; name: string }; options: { number: number; name: string }[] } | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [round, setRound] = useState(1);
  const g = useGame();
  const deckRef = useRef<typeof SURAHS>([]);

  const makeQuestion = () => {
    let available = poolFor(def, minSurah);
    if (!available || available.length === 0) {
      available = SURAHS.filter(s => s.number === 1 || (s.number >= 78 && s.number <= 114));
    }
    if (deckRef.current.length === 0) {
      deckRef.current = shuffle([...available]);
    }
    const correct0 = deckRef.current.pop() || available[0] || SURAHS[0];
    const optionPool = neighborPool(def, correct0.number, 4);
    const others = shuffle(optionPool.filter(s => s.number !== correct0.number)).slice(0, 3);
    while (others.length < 3) {
      const extra = SURAHS.find(s => s.number !== correct0.number && !others.some(o => o.number === s.number));
      if (extra) others.push(extra); else break;
    }
    return { surah: correct0, options: shuffle([correct0, ...others].map((s) => ({ number: s.number, name: s.name }))) };
  };

  useEffect(() => {
    deckRef.current = [];
    setQuestion(makeQuestion());
    setSelected(null);
    setFeedback(null);
    setRound(1);
  }, [minSurah, def.engine]);

  useEffect(() => {
    if (!question) return;
    const primaryUrl = getSurahAudioUrl(question.surah.number);
    const fallbackUrl = getFallbackAudioUrl(question.surah.number);
    let triedFallback = false;

    const audio = new Audio(primaryUrl);
    audio.preload = "auto";
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => {
      if (!triedFallback) {
        triedFallback = true;
        audio.src = fallbackUrl;
        audio.load();
      }
    };

    setSource(audio);
    setIsPlaying(false);

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [question]);

  const playAudio = () => {
    if (!source || !question) return;
    if (isPlaying) {
      source.pause();
      setIsPlaying(false);
    } else {
      source.play().catch(() => {
        // إعادة المحاولة من سيرفر التطبيق (Hugging Face) نفسه
        source.src = getFallbackAudioUrl(question.surah.number);
        source.load();
        source.play().catch(() => {
          toast({ title: "تعذّر تشغيل الصوت", description: "تحقق من اتصالك بالإنترنت وسيعمل الصوت تلقائياً.", variant: "destructive" });
        });
      });
    }
  };

  const choose = (number: number) => {
    if (!question || feedback) return;
    if (source) {
      source.pause();
      setIsPlaying(false);
    }
    setSelected(number);
    const correct = number === question.surah.number;
    if (correct) g.correct(); else g.miss();
    setFeedback(correct ? "correct" : "wrong");
    window.setTimeout(() => {
      setQuestion(makeQuestion());
      setSelected(null);
      setFeedback(null);
      setRound(r => r + 1);
    }, 1200);
  };

  if (!question) return <div className="text-center py-8 text-sm text-muted-foreground">جارٍ تحضير اللعبة...</div>;
  const finished = round > ROUNDS;
  if (finished) return <ResultCard g={g} onReplay={() => {
    deckRef.current = [];
    g.reset(); 
    setQuestion(makeQuestion()); 
    setSelected(null); 
    setFeedback(null); 
    setRound(1);
  }} />;

  return (
    <div className="space-y-4 text-center">
      <SessionBar q={round} />
      <p className="text-foreground text-lg font-bold">اسمع السورة الكريمة واختر اسمها</p>
      <div className="py-2">
        <button
          onClick={playAudio}
          className={`mx-auto w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-accent to-amber-500 text-accent-foreground flex items-center justify-center shadow-xl active:scale-95 transition-all hover:brightness-110 ${isPlaying ? "ring-4 ring-amber-400 scale-105" : ""}`}
          title={isPlaying ? "إيقاف مؤقت" : "تشغيل الصوت"}
        >
          <Headphones className={`w-10 h-10 sm:w-12 sm:h-12 ${isPlaying ? "animate-bounce" : "animate-pulse"}`} />
        </button>
        <span className="block mt-2 text-xs font-bold text-muted-foreground">
          {isPlaying ? "جاري الاستماع... (اضغط للإيقاف) ⏸️" : "اضغط للاستماع 🎧"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {question.options.map(o => {
          const cls = feedback && o.number === question.surah.number ? "bg-success/20 border-success/60 text-success"
            : feedback && o.number === selected ? "bg-destructive/20 border-destructive/60 text-destructive"
            : "bg-secondary border-border hover:border-accent/50 text-secondary-foreground";
          return (
            <button key={o.number} onClick={() => choose(o.number)} className={`p-3 sm:p-5 rounded-xl border font-bold text-base sm:text-lg active:scale-95 transition-colors min-h-[55px] sm:min-h-[70px] ${cls}`}>
              {o.name}
            </button>
          );
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function MissingWordEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const { corpus, failed, retry } = useCorpus();
  if (!corpus) return <CorpusGate failed={failed} retry={retry} />;
  return <MissingWordPlay corpus={corpus} def={def} minSurah={minSurah} />;
}
function MissingWordPlay({ corpus, def, minSurah }: { corpus: SurahText[], def: GameDef, minSurah: number }) {
  const pool = poolFor(def, minSurah).map(s => s.number);
  const eligible = corpus.filter(c => pool.includes(c.app) && c.ayahs.some(a => a.text.split(" ").length >= 4));
  const orderRef = useRef(shuffle(eligible));
  const usedAyahsRef = useRef<Set<string>>(new Set());

  const getNext = () => { 
    if (!orderRef.current.length) orderRef.current = shuffle(eligible); 
    return orderRef.current.pop() || eligible[0]; 
  };

  const make = () => {
    let s = getNext();
    let a = s.ayahs[0];
    let words = a.text.split(" ");
    let hiddenIdx = 0;
    let answer = "";

    for (let attempt = 0; attempt < 30; attempt++) {
      const ayahs = s.ayahs.filter(x => x.text.split(" ").length >= 4);
      if (ayahs.length) {
        a = ayahs[Math.floor(Math.random() * ayahs.length)];
        const key = `${s.app}-${a.n}`;
        if (!usedAyahsRef.current.has(key)) {
          usedAyahsRef.current.add(key);
          words = a.text.split(" ");
          for (let i = 0; i < 5; i++) {
            hiddenIdx = Math.floor(Math.random() * (words.length - 1)) + 1;
            answer = words[hiddenIdx];
            if (answer.length >= 3) break;
          }
          break;
        }
      }
      s = getNext();
    }

    if (!answer) {
      hiddenIdx = Math.min(1, words.length - 1);
      answer = words[hiddenIdx] || "العظيم";
    }

    const normalizeWord = (word: string) => word.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "").replace(/[^\u0621-\u064A]/g, "");
    const answerShape = normalizeWord(answer);
    const similarWords = (wordList: string[]) => shuffle(Array.from(new Set(wordList.filter(word => {
      const normalized = normalizeWord(word);
      return normalized !== answerShape && normalized.length >= 2;
    }))));

    const allWords = s.ayahs.flatMap(ay => ay.text.split(" "));
    const distractors = similarWords(allWords).slice(0, 3);
    if (distractors.length < 3) {
      const extra = corpus.filter(c => pool.includes(c.app)).flatMap(c => c.ayahs.flatMap(ay => ay.text.split(" ")));
      distractors.push(...similarWords(extra).slice(0, 3 - distractors.length));
    }
    while (distractors.length < 3) {
      distractors.push(["الهدى", "التقوى", "الحق", "الصبر"][distractors.length]);
    }

    return { s, words, hiddenIdx, answer, opts: shuffle([answer, ...distractors.slice(0, 3)]) };
  };

  const [q, setQ] = useState(() => make());
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const g = useGame();
  const finished = qNum > ROUNDS;

  const next = (nn: number) => { 
    setReveal(false); 
    setChosen(null); 
    setQNum(nn); 
    if (nn <= ROUNDS) setQ(make()); 
  };

  const choose = (word: string) => {
    if (reveal || finished) return;
    setChosen(word);
    if (word === q.answer) g.correct(); else g.miss();
    setReveal(true);
    window.setTimeout(() => next(qNum + 1), 1600);
  };

  const replay = () => { 
    usedAyahsRef.current.clear(); 
    g.reset(); 
    setQNum(1); 
    setQ(make()); 
  };

  if (finished) return <ResultCard g={g} onReplay={replay} />;

  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-muted-foreground text-base sm:text-lg font-medium">أكمل الكلمة الناقصة في سورة <b className="text-accent">{q.s.name}</b></p>
      <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-accent/10 border border-accent/40 font-amiri text-xl sm:text-2xl leading-loose text-foreground flex flex-wrap justify-center gap-x-2 sm:gap-x-3 gap-y-2 sm:gap-y-3 game-content" dir="rtl">
        {q.words.map((w, i) => (
          <span key={i} className={i === q.hiddenIdx ? "text-transparent bg-secondary/50 border-b-2 border-dashed border-accent min-w-[50px] sm:min-w-[70px] inline-block text-center relative" : ""}>
            {i === q.hiddenIdx ? (reveal ? <span className={`absolute inset-0 flex items-center justify-center font-bold text-base sm:text-lg ${q.answer === chosen ? "text-success" : "text-accent"}`}>{q.answer}</span> : "...") : w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {q.opts.map((opt, i) => {
          const cls = reveal && opt === q.answer ? "bg-success/20 border-success/60 text-success"
            : reveal && opt === chosen ? "bg-destructive/20 border-destructive/60 text-destructive"
            : "bg-secondary border-border hover:border-accent/50 text-secondary-foreground";
          return <button key={i} onClick={() => choose(opt)} className={`p-3 sm:p-5 rounded-xl border text-center font-amiri font-bold text-lg sm:text-xl active:scale-95 transition-colors game-option min-h-[55px] sm:min-h-[70px] ${cls}`}>{opt}</button>;
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

/* ── ألعاب قرآنية صعبة مبرمجة بـ TypeScript (بنفس أسلوب الألعاب المدمجة) ── */

function AyahSurahEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const { corpus, failed, retry } = useCorpus();
  if (!corpus) return <CorpusGate failed={failed} retry={retry} />;
  return <AyahSurahPlay corpus={corpus} def={def} minSurah={minSurah} />;
}
function AyahSurahPlay({ corpus, def, minSurah }: { corpus: SurahText[]; def: GameDef; minSurah: number }) {
  const pool = poolFor(def, minSurah).map(s => s.number);
  const eligible = corpus.filter(c => c.ayahs.length >= 2 && pool.includes(c.app));
  const orderRef = useRef(shuffle(eligible));
  const usedAyahsRef = useRef<Set<string>>(new Set());

  const getNext = () => { 
    if (!orderRef.current.length) orderRef.current = shuffle(eligible); 
    return orderRef.current.pop() || eligible[0]; 
  };

  const make = () => {
    let s = getNext();
    let ayah = s.ayahs[0];

    for (let t = 0; t < 20; t++) {
      const cleanAyahs = s.ayahs.filter(a => !usedAyahsRef.current.has(a.text));
      if (cleanAyahs.length) {
        ayah = cleanAyahs[Math.floor(Math.random() * cleanAyahs.length)];
        usedAyahsRef.current.add(ayah.text);
        break;
      }
      s = getNext();
    }

    const wrong = shuffle(eligible.filter(c => c.app !== s.app)).slice(0, 3);
    return { s, ayah, opts: shuffle([s, ...wrong]) };
  };

  const [q, setQ] = useState(make);
  const [round, setRound] = useState(0);
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const g = useGame();
  const finished = qNum > ROUNDS;

  const next = (nn: number) => { 
    setReveal(false); 
    setChosen(null); 
    setQNum(nn); 
    if (nn <= ROUNDS) { 
      setQ(make()); 
      setRound(r => r + 1); 
    } 
  };

  const left = useRoundTimer(round, 12, () => { 
    g.miss(); 
    setReveal(true); 
    window.setTimeout(() => next(qNum + 1), 1300); 
  }, !reveal && !finished);

  const choose = (n: number) => {
    if (reveal || finished) return;
    setChosen(n);
    if (n === q.s.app) g.correct(); else g.miss();
    setReveal(true);
    window.setTimeout(() => next(qNum + 1), 1200);
  };

  const replay = () => { 
    usedAyahsRef.current.clear(); 
    g.reset(); 
    setQNum(1); 
    setQ(make()); 
    setRound(r => r + 1); 
  };

  if (finished) return <ResultCard g={g} onReplay={replay} />;

  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-muted-foreground text-sm sm:text-base font-bold">من أي سورة هذه الآية الكريمة؟</p>
      <TimerBar left={left} seconds={12} />
      <div className="p-3 sm:p-5 rounded-2xl bg-accent/10 border border-accent/40 font-amiri text-lg sm:text-2xl leading-loose text-foreground game-content">{q.ayah.text}</div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {q.opts.map(o => {
          const cls = reveal && o.app === q.s.app ? "bg-success/20 border-success/60 text-success"
            : reveal && o.app === chosen ? "bg-destructive/20 border-destructive/60 text-destructive"
            : "bg-secondary border-border hover:border-accent/50 text-secondary-foreground";
          return <button key={o.app} onClick={() => choose(o.app)} className={`p-3 sm:p-5 rounded-xl border font-bold text-base sm:text-lg active:scale-95 transition-colors min-h-[55px] sm:min-h-[70px] ${cls}`}>{o.name}</button>;
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function AyahOrderEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const { corpus, failed, retry } = useCorpus();
  if (!corpus) return <CorpusGate failed={failed} retry={retry} />;
  return <AyahOrderPlay corpus={corpus} def={def} minSurah={minSurah} />;
}
function AyahOrderPlay({ corpus, def, minSurah }: { corpus: SurahText[]; def: GameDef; minSurah: number }) {
  const pool = poolFor(def, minSurah).map(s => s.number);
  const eligible = corpus.filter(c => c.ayahs.length >= 4 && pool.includes(c.app));
  const orderRef = useRef(shuffle(eligible));
  const usedKeysRef = useRef<Set<string>>(new Set());

  const getNext = () => { 
    if (!orderRef.current.length) orderRef.current = shuffle(eligible); 
    return orderRef.current.pop() || eligible[0]; 
  };

  const make = () => {
    let s = getNext();
    let seq: typeof s.ayahs = [];

    for (let t = 0; t < 20; t++) {
      const maxStart = Math.max(0, s.ayahs.length - 3);
      const i = Math.floor(Math.random() * (maxStart + 1));
      seq = s.ayahs.slice(i, i + 3);
      const key = `${s.app}-${seq.map(a => a.n).join("-")}`;
      if (!usedKeysRef.current.has(key)) {
        usedKeysRef.current.add(key);
        break;
      }
      s = getNext();
    }

    return { s, opts: shuffle(seq.map((a, k) => ({ ...a, k }))) };
  };

  const [q, setQ] = useState(make);
  const [round, setRound] = useState(0);
  const [qNum, setQNum] = useState(1);
  const [picked, setPicked] = useState<number[]>([]);
  const [reveal, setReveal] = useState(false);
  const g = useGame();
  const finished = qNum > ROUNDS;

  const next = (nn: number) => { 
    setPicked([]); 
    setReveal(false); 
    setQNum(nn); 
    if (nn <= ROUNDS) { 
      setQ(make()); 
      setRound(r => r + 1); 
    } 
  };

  const left = useRoundTimer(round, 15, () => { 
    g.miss(); 
    setReveal(true); 
    window.setTimeout(() => next(qNum + 1), 1400); 
  }, !reveal && !finished);

  const tap = (k: number) => {
    if (reveal || finished || picked.includes(k)) return;
    if (k === picked.length) {
      const np = [...picked, k]; 
      setPicked(np);
      if (np.length === 3) { 
        g.correct(); 
        setReveal(true); 
        window.setTimeout(() => next(qNum + 1), 900); 
      }
    } else { 
      g.miss(); 
      setReveal(true); 
      window.setTimeout(() => { setReveal(false); setPicked([]); }, 1000); 
    }
  };

  const replay = () => { 
    usedKeysRef.current.clear(); 
    g.reset(); 
    setQNum(1); 
    setPicked([]); 
    setQ(make()); 
    setRound(r => r + 1); 
  };

  if (finished) return <ResultCard g={g} onReplay={replay} />;
  return (
    <div className="space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-muted-foreground text-sm">من سورة <b className="text-accent">{q.s.name}</b> — اضغط الآيات الثلاث بترتيبها الصحيح</p>
      <TimerBar left={left} seconds={15} />
      <div className="grid gap-2">
        {q.opts.map(a => {
          const order = picked.indexOf(a.k);
          const cls = picked.includes(a.k) || reveal
            ? "bg-accent/15 border-accent/50 text-accent"
            : "bg-secondary border-border hover:border-accent/50 text-secondary-foreground";
          return (
            <button key={a.k} onClick={() => tap(a.k)} className={`p-3 rounded-xl border text-right font-amiri text-lg leading-relaxed active:scale-[0.98] transition-colors ${cls}`}>
              {picked.includes(a.k) && <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-extrabold mr-2">{order + 1}</span>}
              {a.text}
            </button>
          );
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function AyahLongerEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const { corpus, failed, retry } = useCorpus();
  if (!corpus) return <CorpusGate failed={failed} retry={retry} />;
  return <AyahLongerPlay corpus={corpus} def={def} minSurah={minSurah} />;
}
function AyahLongerPlay({ corpus, def, minSurah }: { corpus: SurahText[]; def: GameDef; minSurah: number }) {
  const pool = poolFor(def, minSurah).map(s => s.number);
  const eligible = corpus.filter(c => c.ayahs.length >= 2 && pool.includes(c.app));
  const orderRef = useRef(shuffle(eligible));
  const usedPairsRef = useRef<Set<string>>(new Set());

  const getNext = () => { 
    if (!orderRef.current.length) orderRef.current = shuffle(eligible); 
    return orderRef.current.pop() || eligible[0]; 
  };

  const wc = (t: string) => t.split(" ").length;

  const make = () => {
    let a = getNext();
    let b = getNext();
    let ao = a.ayahs[0];
    let bo = b.ayahs[0];

    for (let t = 0; t < 25; t++) {
      a = getNext();
      b = getNext();
      if (a.app === b.app && eligible.length > 1) b = getNext();
      ao = a.ayahs[Math.floor(Math.random() * a.ayahs.length)];
      bo = b.ayahs[Math.floor(Math.random() * b.ayahs.length)];

      const closeBo = b.ayahs
        .filter(x => x.text !== ao.text && Math.abs(wc(x.text) - wc(ao.text)) <= 2)
        .sort((x, y) => Math.abs(wc(x.text) - wc(ao.text)) - Math.abs(wc(y.text) - wc(ao.text)));
      if (closeBo.length) {
        bo = closeBo[Math.floor(Math.random() * Math.min(3, closeBo.length))];
      }

      if (wc(ao.text) === wc(bo.text)) {
        const alt = a.ayahs.filter(x => x.text !== ao.text && Math.abs(wc(x.text) - wc(bo.text)) === 1);
        if (alt.length) ao = alt[Math.floor(Math.random() * alt.length)];
      }

      const key = [ao.text, bo.text].sort().join("###");
      if (!usedPairsRef.current.has(key)) {
        usedPairsRef.current.add(key);
        break;
      }
    }

    return { ao, bo, an: a.name, bn: b.name, firstLonger: wc(ao.text) > wc(bo.text) };
  };

  const [q, setQ] = useState(make);
  const [round, setRound] = useState(0);
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [chosen, setChosen] = useState<"a" | "b" | null>(null);
  const g = useGame();
  const finished = qNum > ROUNDS;

  const next = (nn: number) => { 
    setReveal(false); 
    setChosen(null); 
    setQNum(nn); 
    if (nn <= ROUNDS) { 
      setQ(make()); 
      setRound(r => r + 1); 
    } 
  };

  const left = useRoundTimer(round, 12, () => { 
    g.miss(); 
    setReveal(true); 
    window.setTimeout(() => next(qNum + 1), 1300); 
  }, !reveal && !finished);

  const choose = (w: "a" | "b") => {
    if (reveal || finished) return;
    setChosen(w);
    if ((w === "a") === q.firstLonger) g.correct(); else g.miss();
    setReveal(true);
    window.setTimeout(() => next(qNum + 1), 1300);
  };

  const replay = () => { 
    usedPairsRef.current.clear(); 
    g.reset(); 
    setQNum(1); 
    setQ(make()); 
    setRound(r => r + 1); 
  };

  if (finished) return <ResultCard g={g} onReplay={replay} />;
  const card = (w: "a" | "b", text: string, name: string, count: number) => {
    const isRight = (w === "a") === q.firstLonger;
    const cls = reveal && isRight ? "bg-success/20 border-success/60 text-success"
      : reveal && chosen === w ? "bg-destructive/20 border-destructive/60 text-destructive"
      : "bg-secondary border-border hover:border-accent/50 text-secondary-foreground";
    return (
      <button onClick={() => choose(w)} className={`p-3 sm:p-5 rounded-xl border text-right active:scale-[0.98] transition-colors min-h-[100px] sm:min-h-[140px] flex flex-col justify-center ${cls}`}>
        <span className="block text-xs sm:text-sm font-extrabold text-muted-foreground mb-1 sm:mb-2">{name}</span>
        <span className="block font-amiri text-base sm:text-xl leading-relaxed">{text}</span>
        {reveal && <span className="block mt-1 sm:mt-2 text-xs sm:text-sm font-extrabold text-muted-foreground">{count} كلمة</span>}
      </button>
    );
  };
  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-muted-foreground text-base sm:text-lg font-medium">أيّ الآيتين كلماتها أكثر؟</p>
      <TimerBar left={left} seconds={12} />
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        {card("a", q.ao.text, q.an, wc(q.ao.text))}
        {card("b", q.bo.text, q.bn, wc(q.bo.text))}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function SurahOrderEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const pool = poolFor(def, minSurah);
  const surahList = pool.length >= 8 ? pool : SURAHS;
  const usedCombosRef = useRef<Set<string>>(new Set());

  // توليد 4 سور جديدة تماماً لكل سؤال لمنع أي تكرار عبر الـ 20 سؤال
  const make = () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      let four: typeof SURAHS = [];
      // التنويع: تارة 4 سور متجاورة وتارة 4 سور متفرقة لزيادة التحدي
      if (attempt % 2 === 0 && surahList.length >= 6) {
        const maxStart = Math.max(0, surahList.length - 4);
        const start = Math.floor(Math.random() * (maxStart + 1));
        four = surahList.slice(start, start + 4);
      } else {
        four = shuffle([...surahList]).slice(0, 4);
      }

      if (four.length === 4) {
        const key = four.map(s => s.number).sort((a, b) => a - b).join("-");
        if (!usedCombosRef.current.has(key)) {
          usedCombosRef.current.add(key);
          const shuffledFour = shuffle(four);
          return { four: shuffledFour, sol: [...four].sort((x, y) => x.number - y.number) };
        }
      }
    }
    // احتياط
    const four = shuffle([...surahList]).slice(0, 4);
    return { four, sol: [...four].sort((x, y) => x.number - y.number) };
  };

  const [q, setQ] = useState(make);
  const [round, setRound] = useState(0);
  const [qNum, setQNum] = useState(1);
  const [picked, setPicked] = useState<number[]>([]);
  const [reveal, setReveal] = useState(false);
  const g = useGame();
  const finished = qNum > ROUNDS;

  const next = (nn: number) => { 
    setPicked([]); 
    setReveal(false); 
    setQNum(nn); 
    if (nn <= ROUNDS) { 
      setQ(make()); 
      setRound(r => r + 1); 
    } 
  };

  const left = useRoundTimer(round, 15, () => { 
    g.miss(); 
    setReveal(true); 
    window.setTimeout(() => next(qNum + 1), 1400); 
  }, !reveal && !finished);

  const tap = (n: number) => {
    if (reveal || finished || picked.includes(n)) return;
    const expected = q.sol[picked.length].number;
    if (n === expected) {
      const np = [...picked, n]; 
      setPicked(np);
      if (np.length === 4) { 
        g.correct(); 
        setReveal(true); 
        window.setTimeout(() => next(qNum + 1), 900); 
      }
    } else { 
      g.miss(); 
      setReveal(true); 
      window.setTimeout(() => { setReveal(false); setPicked([]); }, 1000); 
    }
  };

  const replay = () => { 
    usedCombosRef.current.clear(); 
    g.reset(); 
    setQNum(1); 
    setPicked([]); 
    setQ(make()); 
    setRound(r => r + 1); 
  };

  if (finished) return <ResultCard g={g} onReplay={replay} />;

  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-muted-foreground text-base sm:text-lg font-medium">اضغط السور الأربع حسب ترتيبها في المصحف</p>
      <TimerBar left={left} seconds={15} />
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {q.four.map(s => {
          const order = picked.indexOf(s.number);
          const done = picked.includes(s.number) || reveal;
          const cls = done ? "bg-accent/15 border-accent/50 text-accent" : "bg-secondary border-border hover:border-accent/50 text-secondary-foreground";
          return (
            <button key={s.number} onClick={() => tap(s.number)} className={`p-3 sm:p-5 rounded-xl border font-bold text-base sm:text-lg active:scale-95 transition-colors min-h-[60px] sm:min-h-[80px] flex items-center justify-center ${cls}`}>
              {picked.includes(s.number) && <span className="inline-flex w-5 h-5 sm:w-6 sm:h-6 items-center justify-center rounded-full bg-accent text-accent-foreground text-[10px] sm:text-xs font-extrabold mr-1 sm:mr-2">{order + 1}</span>}
              {s.name}
              {reveal && <span className="block mt-1 text-[10px] sm:text-xs font-extrabold text-muted-foreground">رقم {s.number}</span>}
            </button>
          );
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

function SurahNumEngine({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const pool = poolFor(def, minSurah);
  const deckRef = useRef<typeof pool>([]);

  const make = () => {
    if (deckRef.current.length === 0) {
      deckRef.current = shuffle([...pool]);
    }
    const s = deckRef.current.pop() || pool[0];
    const opts = new Set<number>([s.number]);
    for (const d of shuffle([-3, -2, -1, 1, 2, 3, -4, 4])) {
      const v = s.number + d;
      if (v >= 1 && v <= 114) opts.add(v);
      if (opts.size === 4) break;
    }
    return { s, opts: shuffle([...opts]) };
  };

  const [q, setQ] = useState(make);
  const [round, setRound] = useState(0);
  const [qNum, setQNum] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const g = useGame();
  const finished = qNum > ROUNDS;

  const next = (nn: number) => { 
    setReveal(false); 
    setChosen(null); 
    setQNum(nn); 
    if (nn <= ROUNDS) { 
      setQ(make()); 
      setRound(r => r + 1); 
    } 
  };

  const left = useRoundTimer(round, 10, () => { 
    g.miss(); 
    setReveal(true); 
    window.setTimeout(() => next(qNum + 1), 1300); 
  }, !reveal && !finished);

  const choose = (n: number) => {
    if (reveal || finished) return;
    setChosen(n);
    if (n === q.s.number) g.correct(); else g.miss();
    setReveal(true);
    window.setTimeout(() => next(qNum + 1), 1200);
  };

  const replay = () => { 
    deckRef.current = shuffle([...pool]); 
    g.reset(); 
    setQNum(1); 
    setQ(make()); 
    setRound(r => r + 1); 
  };

  if (finished) return <ResultCard g={g} onReplay={replay} />;

  return (
    <div className="space-y-3 sm:space-y-4 text-center">
      <SessionBar q={qNum} />
      <p className="text-foreground text-base sm:text-lg font-bold">ما رقم سورة <span className="text-accent">{q.s.name}</span> في ترتيب المصحف؟</p>
      <TimerBar left={left} seconds={10} />
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {q.opts.map(n => {
          const cls = reveal && n === q.s.number ? "bg-success/20 border-success/60 text-success"
            : reveal && n === chosen ? "bg-destructive/20 border-destructive/60 text-destructive"
            : "bg-secondary border-border hover:border-accent/50 text-secondary-foreground";
          return <button key={n} onClick={() => choose(n)} className={`p-4 sm:p-5 rounded-xl border font-extrabold text-xl sm:text-2xl active:scale-95 transition-colors min-h-[60px] sm:min-h-[80px] ${cls}`}>{n}</button>;
        })}
      </div>
      <GameHud g={g} />
    </div>
  );
}

const ENGINES: Record<GameEngine, (p: { def: GameDef; minSurah: number }) => JSX.Element> = {
  order: AyahOrderEngine, 
  memory: MemoryEngine, 
  memory_meaning: MemoryEngine, 
  which: WhichEngine, 
  quiz: QuizEngine, 
  count: CountEngine,
  nextayah: NextAyahEngine, 
  prevayah: PrevAyahEngine, 
  whichsurah: WhichSurahEngine, 
  missingword: MissingWordEngine, 
  surahaudio: SurahAudioEngine,
  ayahsurah: AyahSurahEngine, 
  ayahorder: AyahOrderEngine, 
  ayahlonger: AyahLongerEngine, 
  surahorder: SurahOrderEngine, 
  surahnum: SurahNumEngine,
  remote: ({ def }) => <RemoteGameFrame def={def} onExit={() => window.dispatchEvent(new Event("mushaf:remotegame:exit"))} />,
  detective: ({ def, minSurah }) => <DetectiveGame def={def} minSurah={minSurah} />,
  wordbuilder: ({ def, minSurah }) => <WordBuilderGame def={def} minSurah={minSurah} />,
  catchstar: ({ def, minSurah }) => <CatchStarGame def={def} minSurah={minSurah} />,
  ayahmath: ({ def, minSurah }) => <AyahMathGame def={def} minSurah={minSurah} />,
  server_quiz: ({ def }) => <ServerQuizEngine def={def} />,
  listenkids: ({ def, minSurah }) => <ListenKidsGame def={def} minSurah={minSurah} onExit={() => window.dispatchEvent(new Event("mushaf:listenkids:exit"))} />,
};
const ICONS: Record<string, typeof Headphones> = { Headphones, ListOrdered, LayoutGrid, Scale, Trophy, Hash, Grid3x3, Gamepad2, BookOpen, Sparkles, Puzzle, Brain, Mic };
const iconFor = (key: string) => ICONS[key] || Gamepad2;

/* ───────────────── ركن الأطفال ───────────────── */
export default function KidsGames() {
  const navigate = useNavigate();
  const [active, setActive] = useState<string | null>(null);
  const [profile, setProfile] = useState(getProfile);
  const [progress, setProgress] = useState(getProgress);
  const [coins, setCoins] = useState(getCoins);
  const [catalog, setCatalog] = useState<GameDef[]>(getGameCatalog);
  const [pinAction, setPinAction] = useState<null | "parent" | "exit" | "setread" | "setparent" | "setsurah">(null);
  const [showSurahSelector, setShowSurahSelector] = useState(false);
  const [showSurahConfirm, setShowSurahConfirm] = useState(() => {
    try { return localStorage.getItem("mushaf:surahConfirmDay") !== new Date().toDateString(); } catch { return true; }
  });
  const [showNotifications, setShowNotifications] = useState(false);

  // شهادة التقدم (زر المشكلة)
  const [showCertificate, setShowCertificate] = useState(false);
  const [certificateReady, setCertificateReady] = useState(false);
  const [streakDays, setStreakDays] = useState(calculateStreak().currentStreak);

  // شاشة النشر والاحتفال عند الوصول للميلستون
  const [showMilestone, setShowMilestone] = useState(false);
  const [milestoneData, setMilestoneData] = useState({ days: 0, title: "", message: "" });

  // الميلستونات: أول يوم، 7 أيام، 28 يوماً، شهر، شهران، 4 أشهر — وبعدها عشوائي
  const MILESTONES = [1, 7, 28, 30, 60, 120];
  const MILESTONE_NAMES: Record<number, { title: string; message: string }> = {
    1: { title: "بداية رائعة!", message: "بدأت رحلتك مع القرآن — يوم واحد من النور" },
    7: { title: "أسبوع كامل!", message: "7 أيام متتالية — أنت بطل حقيقي!" },
    28: { title: "أربعة أسابيع!", message: "28 يوماً متتالياً — عادة ذهبية راسخة!" },
    30: { title: "شهر كامل!", message: "30 يوماً — شهر من القرآن والضوء" },
    60: { title: "شهران من التميز!", message: "60 يوماً — أنت الآن بطل القرآن الأسطوري" },
    120: { title: "أربعة أشهر من العطاء!", message: "120 يوماً — مسيرة استثنائية لا تتوقف" },
  };

  // رسالة التشجيع: تظهر مرة في اليوم عند إنجاز وقت الدراسة والدخول للألعاب
  const [showEncourage, setShowEncourage] = useState(() => {
    try {
      const today = new Date().toDateString();
      const key = "mushaf:encouragedToday";
      const p = localStorage.getItem(key);
      const curr = JSON.parse(p || "null");
      const minToday = Number(localStorage.getItem("mushaf:minutesToday") || 0);
      // نحفّز إذا أُنجزت الدراسة اليوم ولم تُعرض الرسالة بعد — حتى بعد قراءة مسبقة
      return minToday > 0 && (curr?.date !== today || curr?.off === true);
    } catch { return false; }
  });

  // مخفيّ للمستخدمين (لكن يدخله المالك للتجربة)
  useEffect(() => { if (kidsRouteBlocked()) navigate("/audio", { replace: true }); }, [navigate]);

  // لا يدخل للألعاب وهو في فترة دراسة القرآن طالما لم يكمل الدقائق المطلوبة
  useEffect(() => {
    const goal = typeof profile.goalMinutes === "number" && profile.goalMinutes > 0 ? profile.goalMinutes : 5;
    const read = progress.minutes || 0;
    if (read < goal && !progress.unlocked) {
      toast({ 
        title: "⏳ وقت مدارسة القرآن الكريم أولاً!", 
        description: `بقي ${Math.max(0, Math.round((goal - read) * 10) / 10)} دقيقة استماع لفتح الألعاب.`,
        variant: "destructive"
      });
      navigate("/audio", { replace: true });
    }
  }, [profile.goalMinutes, progress.minutes, progress.unlocked, navigate]);

  useEffect(() => {
    recordTodayActivity();
    enterKioskMode();
    syncQuestionsFromServer().catch(console.error);
    
    // Prevent back navigation
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      toast({ title: "الخروج مقفل", description: "اضغط على زر خروج وأدخل الرمز", variant: "destructive" });
    };
    window.addEventListener("popstate", handlePopState);

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isKidsMode()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isKidsMode()) return;
      const blocked = event.key === "F5" || event.key === "F11" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") || (event.altKey && event.key === "ArrowLeft");
      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
        toast({ title: "الخروج مقفل", description: "يمكنك الخروج فقط برمز ولي الأمر من صفحة الألعاب", variant: "destructive" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);

          // Enforce Schedule and Play Duration
    let lastPlayTick = Date.now();
    const checkSchedule = (flushExact = false) => {
      const timeCheck = isTimeAllowed();
      if (!timeCheck.allowed) {
        // حلقة دائمة: تنبيه فقط دون إخراج — الخروج اليدوي برمز ولي الأمر
        void showLocalNotification("تنبيه الجدول ⏰", timeCheck.reason || "انتهى وقت اللعب المسموح حسب الجدول.");
        return;
      }
      
      if (isKidsMode()) {
        const now = Date.now();
        const mins = (now - lastPlayTick) / 60000;
        if (mins >= 0.1 || flushExact) {
           const { justExpired, progress } = addPlayMinutes(mins);
           lastPlayTick = now;

           // تنبيه اقتراب نفاد الوقت قبل 5 دقائق
           const currentProf = getProfile();
           if (currentProf.playMinutes > 0) {
             const remaining = currentProf.playMinutes - (progress.played || 0);
             if (remaining <= 5 && remaining > 0 && !sessionStorage.getItem("mushaf:play_5min_alert")) {
               sessionStorage.setItem("mushaf:play_5min_alert", "1");
               void showLocalNotification(
                 "تنبيه اقتراب نفاد وقت اللعب ⏳",
                 `بقي ${Math.ceil(remaining)} دقائق فقط على انتهاء وقت اللعب المخصص!`
               );
             }
           }

           if (justExpired || progress.playExpired) {
             // حلقة دائمة: تنبيه فقط دون خروج — يغادر الطفل يدوياً برمز ولي الأمر
             void showLocalNotification("انتهى وقت اللعب المحدّد ⏰", "يمكن لولي الأمر منحه وقتاً إضافياً من لوحة التحكم.");
             return;
           }
        }
      }
    };
    // في وضع التنقل المرن أو وضع المالك غير الصارم: لا نفرض قيود الوقت على المالك للتجربة
    const isParentTrial = !isKidsMode() && !isPureMode() && getAppMode() === "parent";
    // initial check on mount, without adding minutes yet
    const initialCheck = isTimeAllowed();
    if (isParentTrial ? false : (!initialCheck.allowed || getProgress().playExpired)) {
        // حلقة دائمة: تنبيه عند الدخول فقط دون إخراج — الخروج يدوي برمز ولي الأمر
        void showLocalNotification("تنبيه الوقت ⏰", initialCheck.reason || "انتهى وقت اللعب المحدّد لليوم.");
    }
    const scheduleInterval = setInterval(() => checkSchedule(false), 30000); // Check every 30s instead of 60s
    
    const handleExit = () => checkSchedule(true);
    window.addEventListener("beforeunload", handleExit);
    window.addEventListener("mushaf:flush_time", handleExit);

    return () => { 
      exitKioskMode(); 
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("beforeunload", handleExit);
      window.removeEventListener("mushaf:flush_time", handleExit);
      clearInterval(scheduleInterval);
    };
  }, [navigate]);

  // تسخين نصوص السور مبكراً (تعمل دون إنترنت)
  useEffect(() => { ensureCorpus().catch(() => { /* ستعيد اللعبة المحاولة عند فتحها */ }); }, []);

  // تحميل الألعاب من السيرفر في الخلفية + تخزين أكوادها على الجهاز (تعمل دون إنترنت)
  useEffect(() => {
    fetchRemoteGames().then(() => { precacheRemoteGames().catch(() => { /* ignore */ }); }).catch(() => { /* ignore */ });
  }, []);

  // تسخين أصوات التشجيع (ملفات MP3) لتعمل فوراً ودون إنترنت
  useEffect(() => { precacheGameVoice(); }, []);

  const [showBadges, setShowBadges] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showLockGateModal, setShowLockGateModal] = useState(false);

  // نظام فتح الألعاب بالنجوم (المال): لعبة واحدة مجانية والبقية تُفتح بالنجوم المكتسبة
  const [unlockDef, setUnlockDef] = useState<GameDef | null>(null);
  const isGameOwned = (g: GameDef) => g.cost <= 0 || ownItem(g.id);
  useEffect(() => {
    const h = () => setActive(null);
    window.addEventListener("mushaf:remotegame:exit", h);
    return () => window.removeEventListener("mushaf:remotegame:exit", h);
  }, []);

  // إغلاق لعبة «استمع ← أكمِل ← سجِّل» والعودة لقائمة الألعاب
  useEffect(() => {
    const h = () => setActive(null);
    window.addEventListener("mushaf:listenkids:exit", h);
    return () => window.removeEventListener("mushaf:listenkids:exit", h);
  }, []);

  // إيقاف صوت التشجيع فوراً عند إغلاق أي لعبة
  useEffect(() => { if (!active) stopGameVoice(); }, [active]);

  // ── تركيز تلقائي للتنقل بالأسهم/الريموت (مهم جداً لوضع الأطفال على التلفاز) ──
  // عند فتح ركن الأطفال نركّز أول عنصر، وعند الدخول لأي لعبة نركّز أول زر داخلها،
  // وعند الخروج نعيد التركيز لقائمة الألعاب — فتشتغل الأسهم فوراً بلا أي نقرة.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (active) focusFirst(null, "[data-game-panel] button, [data-game-panel] select, [data-game-panel] input");
      else focusFirst(null, "[data-game-entry], [data-game-entry] button");
    }, 120);
    return () => window.clearTimeout(t);
  }, [active]);

  useEffect(() => {
    const refresh = () => { setProfile(getProfile()); setProgress(getProgress()); setCoins(getCoins()); setCatalog(getGameCatalog()); };
    refresh();
    const evts = ["focus", "mushaf:games_unlocked", "mushaf:coins", "mushaf:gamecatalog", "mushaf:activeprofile"];
    evts.forEach(e => window.addEventListener(e, refresh));

    const handleBadgeUnlocked = (e: Event) => {
      const badges = (e as CustomEvent<unknown>).detail;
      if (Array.isArray(badges) && badges.length > 0) {
        badges.forEach((badge) => {
          if (!badge || typeof badge !== "object") return;
          const unlockedBadge = badge as { title?: string; rewardCoins?: number };
          toast({
            title: `🏆 مبارك! وسام جديد: ${unlockedBadge.title || "إنجاز جديد"}`,
            description: `حصلت على ${unlockedBadge.rewardCoins || 0} نجمة إضافية!`,
          });
        });
      }
    };
    window.addEventListener("mushaf:badge_unlocked", handleBadgeUnlocked);

    return () => {
      evts.forEach(e => window.removeEventListener(e, refresh));
      window.removeEventListener("mushaf:badge_unlocked", handleBadgeUnlocked);
    };
  }, []);

  // عند انتهاء وقت اللعب: إظهار طلب ولي الأمر تلقائياً
  useEffect(() => {
    const onExpired = () => setShowLockGateModal(true);
    window.addEventListener("mushaf:play_expired", onExpired);
    return () => window.removeEventListener("mushaf:play_expired", onExpired);
  }, []);

  // التحقق من الميلستونات وعرض شاشة الاحتفال
  useEffect(() => {
    const currentStreak = calculateStreak().currentStreak;
    setStreakDays(currentStreak);

    // قراءة الميلستونات التي تم عرضها مسبقاً
    const shownKey = `mushaf:milestonesShown:${getActiveId()}`;
    const shownRaw = localStorage.getItem(shownKey);
    const shown: number[] = shownRaw ? JSON.parse(shownRaw) : [];

    // التحقق من الميلستونات المعروفة
    if (MILESTONES.includes(currentStreak) && !shown.includes(currentStreak)) {
      const milestone = MILESTONE_NAMES[currentStreak];
      setMilestoneData({ days: currentStreak, ...milestone });
      setShowMilestone(true);
      // تسجيل الميلستون كمعروض
      localStorage.setItem(shownKey, JSON.stringify([...shown, currentStreak]));
    }
    // بعد 4 أشهر (120+ يوم): احتفال عشوائي من حين لآخر (احتمال 1/30 يومياً)
    else if (currentStreak > 120) {
      // عرض عشوائي: احتمال 1/30 لكل يوم بعد 5 أشهر
      const randomChance = Math.random() < (1 / 30);
      if (randomChance) {
        const randomMessages = [
          { title: "أسطورة القرآن!", message: `${currentStreak} يوماً — أنت الآن من العظماء` },
          { title: "بطل لا يُقهر!", message: `${currentStreak} يوماً من التميز والعطاء` },
          { title: "نجم القرآن!", message: `${currentStreak} يوماً — أنت قدوة لكل الأطفال` },
          { title: "ملك الحفظ!", message: `${currentStreak} يوماً — مسيرة لا تُنسى` },
        ];
        const randomMilestone = randomMessages[Math.floor(Math.random() * randomMessages.length)];
        setMilestoneData({ days: currentStreak, ...randomMilestone });
        setShowMilestone(true);
      }
    }
  }, [progress.minutes]);

  // قفل واحد فقط: «اقرأ لتفتح الألعاب» — بلا حدّ لوقت اللعب وبلا شراء
  const unlocked = progress.unlocked || profile.goalMinutes <= 0;
  const scheduleCheck = isTimeAllowed();
  const canPlay = unlocked && scheduleCheck.allowed;

  const myGames = catalog.filter(g => g.ageMin <= profile.age && profile.age <= (g.ageMax ?? 16));
  const def = active ? catalog.find(g => g.id === active) : null;
  const Engine = def ? ENGINES[def.engine] : null;

  const kidsMode = isKidsMode();
  const inApp = shouldHideMushaf();

  const onPinSuccess = () => {
    if (pinAction === "parent" || pinAction === "setparent") {
      setKidsLocked(false);
      setPinAction(null);
      navigate("/parent");
      return;
    }
    if (pinAction === "exit") {
      setKidsLocked(false);
      setPinAction(null);
      toast({ title: "تم فك القفل والخروج للتلاوات" });
      navigate("/audio");
      return;
    }
    if (pinAction === "setread") {
      setKidsLocked(true);
      setPinAction(null);
      navigate("/audio");
      return;
    }
    if (pinAction === "setsurah") {
      setPinAction(null);
      setShowSurahSelector(true);
      return;
    }
    setPinAction(null);
  };

  const exitKidsCorner = () => {
    // الدخول للقرآن والتلاوات متاح دائماً بدون كلمة مرور
    navigate("/audio");
  };

  const lockAndRead = () => {
    // الذهاب للاستماع والتلاوات متاح مباشرة
    navigate("/audio");
  };

  const openParent = () => {
    if (isKidsMode() && hasKidsPin()) {
      setPinAction("parent");
    } else {
      navigate("/parent");
    }
  };

  const headerBack = () => {
    if (active) {
      setActive(null);
    } else {
      exitKidsCorner();
    }
  };

  const tapGame = (id: string) => {
    if (!canPlay) {
      if (!scheduleCheck.allowed) {
        toast({ title: "مغلق بالجدول ⏰", description: scheduleCheck.reason, variant: "destructive" });
        return;
      }
      setShowLockGateModal(true);
      return;
    }
    const gg = catalog.find(x => x.id === id);
    if (!gg) return;
    if (!isGameOwned(gg)) { setUnlockDef(gg); return; }   // مقفلة بالنجوم — تظهر نافذة الفتح
    setActive(id);
  };

  const openShop = () => {
    if (!canPlay) {
      if (!scheduleCheck.allowed) {
        toast({ title: "مغلق بالجدول ⏰", description: scheduleCheck.reason, variant: "destructive" });
        return;
      }
      setShowLockGateModal(true);
      return;
    }
    navigate("/shop");
  };

  // الشراء بالنجوم مباشرة — بلا إذن إضافي (النجوم تُربح بالقراءة فقط)
  const buyGame = () => {
    if (!unlockDef) return;
    if (unlockItem(unlockDef.id, unlockDef.cost)) {
      toast({ title: `فُتحت لعبة «${unlockDef.title}»! 🎉` });
      const id = unlockDef.id;
      setUnlockDef(null);
      setActive(id);
    } else {
      toast({ title: "نجومك لا تكفي", description: "استمع واقرأ أكثر لتربح نجوماً وتفتح ألعاباً جديدة", variant: "destructive" });
    }
  };

  const pct = Math.min(100, (progress.minutes / Math.max(1, profile.goalMinutes)) * 100);
  const playPct = Math.min(100, (progress.played / Math.max(1, profile.playMinutes || 1)) * 100);

  const requestSurahChange = () => {
    if (hasKidsPin()) setPinAction("setsurah");
    else setShowSurahSelector(true);
  };

  const confirmTodaySurah = () => {
    try { localStorage.setItem("mushaf:surahConfirmDay", new Date().toDateString()); } catch { /* ignore */ }
    setShowSurahConfirm(false);
  };

  // إغلاق رسالة التشجيع لنفس اليوم
  const dismissEncourage = () => {
    try { localStorage.setItem("mushaf:encouragedToday", JSON.stringify({ date: new Date().toDateString(), off: false })); } catch { /* ignore */ }
    setShowEncourage(false);
  };

  // تسجيل إنجاز الدراسة عند دخول الألعاب (يُستدعى في كل دخول)
  const markArrived = () => {
    try { localStorage.setItem("mushaf:minutesToday", String(getProgress().minutes)); } catch { /* ignore */ }
  };
  markArrived();

  // إنشاء شهادة التقدم الفاخرة كصورة إسلامية ملكية فائقة الجودة
  const generateCertificate = async () => {
    const canvas = document.createElement("canvas");
    const canvasW = 1080;
    const canvasH = 980;
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. تدرج الخلفية العاجية الفاخرة
    const bg = ctx.createLinearGradient(0, 0, canvasW, canvasH);
    bg.addColorStop(0, "#FAF6EE");
    bg.addColorStop(0.5, "#F8F2E2");
    bg.addColorStop(1, "#F3E9D2");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // شبكة زخرفية إسلامية رقيقة في الخلفية
    ctx.strokeStyle = "rgba(197, 160, 89, 0.08)";
    ctx.lineWidth = 1.5;
    for (let x = 40; x < canvasW; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasH);
      ctx.stroke();
    }
    for (let y = 40; y < canvasH; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasW, y);
      ctx.stroke();
    }

    // 2. إطار ذهبي مزدوج مع زوايا أندلسية
    ctx.strokeStyle = "#D4AF37";
    ctx.lineWidth = 8;
    ctx.strokeRect(36, 36, canvasW - 72, canvasH - 72);

    ctx.strokeStyle = "#AA771C";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(48, 48, canvasW - 96, canvasH - 96);

    const drawCorner = (cx: number, cy: number, flipX: number, flipY: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(flipX, flipY);
      ctx.strokeStyle = "#D4AF37";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(8, 48);
      ctx.quadraticCurveTo(8, 8, 48, 8);
      ctx.stroke();
      drawCanvasStar(ctx, 28, 28, 9, "#E5C058");
      ctx.restore();
    };
    drawCorner(48, 48, 1, 1);
    drawCorner(canvasW - 48, 48, -1, 1);
    drawCorner(48, canvasH - 48, 1, -1);
    drawCorner(canvasW - 48, canvasH - 48, -1, -1);

    // 3. البسملة الشريفة في القمة
    ctx.fillStyle = "#8C6514";
    ctx.font = "bold 30px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
    ctx.textAlign = "center";
    ctx.fillText("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", canvasW / 2, 98);

    // 4. شريط العنوان الأخضر والذهبي الملكي
    const ribbonW = 740;
    const ribbonH = 76;
    const ribbonX = (canvasW - ribbonW) / 2;
    const ribbonY = 120;
    const ribbon = ctx.createLinearGradient(ribbonX, ribbonY, ribbonX + ribbonW, ribbonY + ribbonH);
    ribbon.addColorStop(0, "#124325");
    ribbon.addColorStop(0.5, "#1B6338");
    ribbon.addColorStop(1, "#124325");
    ctx.fillStyle = ribbon;
    ctx.beginPath();
    ctx.roundRect(ribbonX, ribbonY, ribbonW, ribbonH, 26);
    ctx.fill();

    ctx.strokeStyle = "#E5C058";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#FFF7D6";
    ctx.font = "bold 38px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
    ctx.fillText("شَهَادَةُ تَمَيُّزٍ وَإِنْجَازٍ قُرْآنِيّ", canvasW / 2, ribbonY + 52);

    ctx.fillStyle = "#444444";
    ctx.font = "bold 25px 'Cairo', 'Tahoma', 'Arial'";
    ctx.fillText("تُمنح هذه الشهادة المباركة تقديراً واعتزازاً بالهمة العالية", canvasW / 2, 238);

    // 5. صورة شخصية الطفل (Avatar) داخل ميدالية ذهبية شرفية
    const avatarCenterY = 345;
    const avatarRadius = 82;

    const aura = ctx.createRadialGradient(canvasW / 2, avatarCenterY, avatarRadius - 10, canvasW / 2, avatarCenterY, avatarRadius + 30);
    aura.addColorStop(0, "rgba(245, 197, 66, 0.45)");
    aura.addColorStop(1, "rgba(245, 197, 66, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(canvasW / 2, avatarCenterY, avatarRadius + 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(canvasW / 2, avatarCenterY, avatarRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    try {
      const avatarSrc = getAvatarSrc(profile.avatar);
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((res) => {
        img.onload = () => res(true);
        img.onerror = () => res(false);
        img.src = encodeURI(avatarSrc);
        setTimeout(() => res(false), 2000);
      });
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, canvasW / 2 - avatarRadius, avatarCenterY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      } else {
        drawCanvasStar(ctx, canvasW / 2, avatarCenterY, 48, "#F4C542");
      }
    } catch {
      drawCanvasStar(ctx, canvasW / 2, avatarCenterY, 48, "#F4C542");
    }
    ctx.restore();

    ctx.strokeStyle = "#D4AF37";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(canvasW / 2, avatarCenterY, avatarRadius + 3, 0, Math.PI * 2);
    ctx.stroke();

    drawCanvasStar(ctx, canvasW / 2 - 120, avatarCenterY, 15, "#E5C058");
    drawCanvasStar(ctx, canvasW / 2 + 120, avatarCenterY, 15, "#E5C058");

    // 6. صفة واسم الطالب بتنسيق ملكي سليم يمنع انقلاب النص
    ctx.fillStyle = "#8C6514";
    ctx.font = "bold 28px 'Traditional Arabic', 'Amiri', 'Cairo', serif";
    ctx.fillText("الْقَارِئُ الْحَافِظُ الْمُبَارَكُ", canvasW / 2, 458);

    const displayName = (!profile.name || profile.name === "طفلي" || profile.name === "الطفل 1") ? "بطل القرآن الكريم" : profile.name;

    ctx.fillStyle = "#0E4D2B";
    ctx.font = "bold 52px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
    ctx.fillText(displayName, canvasW / 2, 510);

    ctx.fillStyle = "#4B5563";
    ctx.font = "bold 21px 'Cairo', 'Tahoma', 'Arial'";
    ctx.fillText("لمواظبته على تلاوة وحفظ كتاب الله الكريم برواية ورش عن نافع", canvasW / 2, 548);

    // 7. شبكة بطاقات الإحصائيات (2 × 2)
    const curSurahName = SURAHS.find(s => s.number === profile.currentSurah)?.name || "النبأ";
    const statCards = [
      { title: "دقائق التلاوة والمدارسة", value: `${progress.minutes || 0} دقيقة`, color: "#16A34A", icon: "⏱️" },
      { title: "رصيد النجوم المكتسبة", value: `${formatCoins(getCoins())} نجمة`, color: "#D97706", icon: "⭐" },
      { title: "أيام المداومة والاستمرار", value: `${streakDays || 1} يوم متتالي`, color: "#EA580C", icon: "🔥" },
      { title: "السورة الحالية المتقنة", value: `سورة ${curSurahName}`, color: "#2563EB", icon: "📖" },
    ];

    const cardW = 430;
    const cardH = 92;
    const cardPositions = [
      { x: 95, y: 588, w: cardW, h: cardH },
      { x: 555, y: 588, w: cardW, h: cardH },
      { x: 95, y: 696, w: cardW, h: cardH },
      { x: 555, y: 696, w: cardW, h: cardH },
    ];

    statCards.forEach((st, idx) => {
      const pos = cardPositions[idx];
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(pos.x, pos.y, pos.w, pos.h, 20);
      ctx.fill();

      ctx.strokeStyle = "#E8DCBF";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = st.color;
      ctx.beginPath();
      ctx.arc(pos.x + 48, pos.y + 46, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "24px 'Tahoma', 'Segoe UI Emoji', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(st.icon, pos.x + 48, pos.y + 55);

      ctx.textAlign = "right";
      ctx.fillStyle = "#6B7280";
      ctx.font = "bold 16px 'Cairo', 'Tahoma', 'Arial'";
      ctx.fillText(st.title, pos.x + pos.w - 20, pos.y + 36);

      ctx.fillStyle = "#111827";
      ctx.font = "bold 26px 'Cairo', 'Tahoma', 'Arial'";
      ctx.fillText(st.value, pos.x + pos.w - 20, pos.y + 72);
    });

    // 8. لوحة الحديث الشريف المحفز
    const hadithY = 812;
    const hadithW = 780;
    const hadithH = 78;
    const hadithX = (canvasW - hadithW) / 2;

    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.beginPath();
    ctx.roundRect(hadithX, hadithY, hadithW, hadithH, 22);
    ctx.fill();
    ctx.strokeStyle = "#D4AF37";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    drawCanvasStar(ctx, hadithX + 32, hadithY + hadithH / 2, 11, "#E5C058");
    drawCanvasStar(ctx, hadithX + hadithW - 32, hadithY + hadithH / 2, 11, "#E5C058");

    ctx.textAlign = "center";
    ctx.fillStyle = "#8C6514";
    ctx.font = "bold 29px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
    ctx.fillText("« خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ »", canvasW / 2, hadithY + 41);

    ctx.fillStyle = "#6B7280";
    ctx.font = "bold 16px 'Cairo', 'Tahoma', 'Arial'";
    ctx.fillText("— قال رسول الله ﷺ —", canvasW / 2, hadithY + 66);

    // تحميل الشهادة
    const today = new Date();
    const safeName = displayName.replace(/\s+/g, "-");
    const filename = `شهادة-${safeName}-${today.toISOString().split("T")[0]}.png`;
    const dataUrl = canvas.toDataURL("image/png");

    await saveImageDataUrl(dataUrl, filename);

    setCertificateReady(true);
    toast({ title: "🎉 تم حفظ الشهادة الفاخرة!", description: "تم حفظ الصورة بجودة فائقة في جهازك" });
  };

  // مشاركة صورة الميلستون الفاخرة (مشاركة + تحميل مع رمز QR)
  const shareMilestone = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // خلفية كحلية زمردية ملكية مع تدرج ونجوم
    const bg = ctx.createLinearGradient(0, 0, 1080, 1350);
    bg.addColorStop(0, "#081E15");
    bg.addColorStop(0.4, "#0C3122");
    bg.addColorStop(0.8, "#0F3D2A");
    bg.addColorStop(1, "#071B13");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1350);

    for (let i = 0; i < 45; i++) {
      const sx = Math.sin(i * 99) * 500 + 540;
      const sy = Math.cos(i * 77) * 600 + 675;
      const sr = (i % 3) + 1.5;
      ctx.fillStyle = i % 2 === 0 ? "rgba(254, 240, 138, 0.6)" : "rgba(255, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 8;
    ctx.strokeRect(36, 36, 1008, 1278);

    ctx.strokeStyle = "#FDE68A";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(48, 48, 984, 1254);

    drawCanvasStar(ctx, 280, 95, 18, "#FDE68A");
    drawCanvasStar(ctx, 540, 85, 28, "#F59E0B");
    drawCanvasStar(ctx, 800, 95, 18, "#FDE68A");

    ctx.fillStyle = "#FEF08A";
    ctx.font = "bold 44px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
    ctx.textAlign = "center";
    ctx.fillText("إِنْجَازٌ قُرْآنِيٌّ مُتَأَلِّقٌ 🌟", 540, 165);

    ctx.fillStyle = "#A7F3D0";
    ctx.font = "24px 'Tahoma', 'Arial'";
    ctx.fillText(milestoneData.message || "مبارك المداومة والاستمرار في تلاوة كتاب الله!", 540, 215);

    // صورة الأفاتار
    const avatarCenterY = 340;
    const avatarRadius = 82;

    ctx.save();
    ctx.beginPath();
    ctx.arc(540, avatarCenterY, avatarRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    try {
      const avatarSrc = getAvatarSrc(profile.avatar);
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((res) => {
        img.onload = () => res(true);
        img.onerror = () => res(false);
        img.src = encodeURI(avatarSrc);
        setTimeout(() => res(false), 2000);
      });
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 540 - avatarRadius, avatarCenterY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      } else {
        drawCanvasStar(ctx, 540, avatarCenterY, 46, "#F59E0B");
      }
    } catch {
      drawCanvasStar(ctx, 540, avatarCenterY, 46, "#F59E0B");
    }
    ctx.restore();

    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(540, avatarCenterY, avatarRadius + 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 36px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
    ctx.fillText(profile.name || "بطل القرآن الكريم", 540, 470);

    // صندوق السلسلة اليومية
    const boxY = 505;
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.roundRect(140, boxY, 800, 290, 30);
    ctx.fill();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#FDE047";
    ctx.font = "bold 92px 'Tahoma', 'Arial'";
    ctx.fillText(String(milestoneData.days || 1), 540, boxY + 105);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 32px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
    ctx.fillText("يَوْمَاً مُتَتَالِيَةً فِي صُحْبَةِ القُرْآن", 540, boxY + 170);

    const curSurah = SURAHS.find(s => s.number === profile.currentSurah);
    ctx.fillStyle = "#6EE7B7";
    ctx.font = "bold 25px 'Tahoma', 'Arial'";
    ctx.fillText(`سورة ${curSurah?.name || "النبأ"}`, 540, boxY + 220);

    ctx.fillStyle = "#FCD34D";
    ctx.font = "bold 23px 'Tahoma', 'Arial'";
    ctx.fillText(`${formatCoins(getCoins())} نجمة وهمّة مكتسبة ⭐`, 540, boxY + 262);

    // 7. شريط التطبيق المعتمد واسمه وصورته والتاريخ (بدون مكان تحميل وبدون كلمة إصدار)
    const footY = 820;
    const footH = 470;

    // بطاقة خلفية زجاجية كحلية زمردية ملكية
    const footGrad = ctx.createLinearGradient(80, footY, 1000, footY + footH);
    footGrad.addColorStop(0, "rgba(10, 38, 26, 0.94)");
    footGrad.addColorStop(0.5, "rgba(12, 49, 34, 0.95)");
    footGrad.addColorStop(1, "rgba(8, 30, 20, 0.96)");
    ctx.fillStyle = footGrad;
    ctx.beginPath();
    ctx.roundRect(80, footY, 920, footH, 32);
    ctx.fill();

    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 3;
    ctx.stroke();

    // إطار داخلي ذهبي رفيع
    ctx.strokeStyle = "rgba(253, 230, 138, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(94, footY + 14, 892, footH - 28, 22);
    ctx.stroke();

    // آية قرآنية كريمة في أعلى البطاقة
    ctx.textAlign = "center";
    ctx.fillStyle = "#FEF08A";
    ctx.font = "bold 28px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
    ctx.fillText("« وَفِي ذَٰلِكَ فَلْيَتَنَافَسِ الْمُتَنَافِسُونَ »", 540, footY + 65);

    ctx.fillStyle = "#A7F3D0";
    ctx.font = "18px 'Tahoma', 'Arial'";
    ctx.fillText("هنيئاً لك الاستمرار والمواظبة في تلاوة وحفظ كتاب الله العزيز", 540, footY + 102);

    // خط فاصل ذهبي
    ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(130, footY + 130);
    ctx.lineTo(950, footY + 130);
    ctx.stroke();

    // صورة التطبيق / القارئ داخل ميدالية دائرية ذهبية
    const appImgX = 220;
    const appImgY = footY + 235;
    const appImgR = 64;

    // هالة ذهبية حول الشعار
    const appAura = ctx.createRadialGradient(appImgX, appImgY, appImgR - 5, appImgX, appImgY, appImgR + 20);
    appAura.addColorStop(0, "rgba(245, 158, 11, 0.45)");
    appAura.addColorStop(1, "rgba(245, 158, 11, 0)");
    ctx.fillStyle = appAura;
    ctx.beginPath();
    ctx.arc(appImgX, appImgY, appImgR + 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(appImgX, appImgY, appImgR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    const appPhoto = (await loadCanvasImage("/pwa-512x512.png")) || (await loadCanvasImage("/my-photo.png"));
    if (appPhoto && appPhoto.naturalWidth > 0) {
      ctx.drawImage(appPhoto, appImgX - appImgR, appImgY - appImgR, appImgR * 2, appImgR * 2);
    } else {
      drawCanvasStar(ctx, appImgX, appImgY, 38, "#F59E0B");
    }
    ctx.restore();

    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(appImgX, appImgY, appImgR + 2, 0, Math.PI * 2);
    ctx.stroke();

    // اسم التطبيق والشيخ بجانب الصورة
    ctx.textAlign = "right";
    ctx.fillStyle = "#FDE047";
    ctx.font = "bold 32px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
    ctx.fillText("تَطْبِيقُ الْمُصْحَفِ الْمُرَتَّلِ بِرِوَايَةِ وَرْش", 930, footY + 205);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 24px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
    ctx.fillText("الْقَارِئُ الشَّيْخُ: حَاج أَيُّوب أَمِين", 930, footY + 250);

    ctx.fillStyle = "#A7F3D0";
    ctx.font = "18px 'Tahoma', 'Arial'";
    ctx.fillText("ركن أبطال القرآن الكريم • حفظ • تجويد • مدارسة", 930, footY + 290);

    // خط فاصل سفلي
    ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(130, footY + 340);
    ctx.lineTo(950, footY + 340);
    ctx.stroke();

    // خانة التاريخ بدون كلمة إصدار
    const today = new Date();
    const dateBoxW = 420;
    const dateBoxH = 54;
    const dateBoxX = 520;
    const dateBoxY = footY + 375;

    ctx.fillStyle = "rgba(245, 158, 11, 0.18)";
    ctx.beginPath();
    ctx.roundRect(dateBoxX, dateBoxY, dateBoxW, dateBoxH, 16);
    ctx.fill();

    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#FDE047";
    ctx.font = "bold 18px 'Tahoma', 'Arial'";
    ctx.fillText(`${today.getDate()} / ${today.getMonth() + 1} / ${today.getFullYear()} م`, dateBoxX + dateBoxW / 2, dateBoxY + 35);

    // رسالة فخر في اليسار
    ctx.textAlign = "center";
    ctx.fillStyle = "#CBD5E1";
    ctx.font = "bold 16px 'Tahoma', 'Arial'";
    ctx.fillText("🌟 فخورون بهمتك العالية وبإنجازك المستمر", 300, dateBoxY + 35);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `ميلستون-${milestoneData.days}يوم-${profile.name || "بطل"}.png`, { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            title: milestoneData.title,
            text: `${milestoneData.message} — ${milestoneData.days} يوماً متتالية في حفظ وتلاوة كتاب الله الكريم مع تطبيق المصحف المرتل برواية ورش (القارئ الشيخ حاج أيوب أمين) 🌟`,
            files: [file],
          });
          toast({ title: "تمت المشاركة بنجاح!", description: "بارك الله في همتك القرآنية" });
          return;
        } catch {
          // Fallback to download
        }
      }

      const filename = `ميلستون-${milestoneData.days}يوم-${profile.name || "بطل"}.png`;
      await saveImageDataUrl(canvas.toDataURL("image/png"), filename);
      toast({ title: "تم حفظ الصورة الفاخرة!", description: "ابحث في مجلد التنزيلات بجهازك" });
    }, "image/png");
  };

  // فتح نافذة الشهادة مع معاينة
  const openCertificate = () => {
    setStreakDays(calculateStreak().currentStreak);
    setShowCertificate(true);
    setCertificateReady(false);
  };

  // شاشة تأكيد السورة الحالية — تظهر مرة واحدة كل يوم عند دخول ركن الألعاب
  if (showSurahConfirm && profile.currentSurah) {
    const cur = SURAHS.find(s => s.number === profile.currentSurah);
    return (
      <div className="min-h-screen page-nour text-foreground pb-8" dir="rtl">
        <div className="mx-auto max-w-md px-4 py-10 space-y-6 animate-fade-up">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground font-bold text-lg">أهلاً بعودتك! أنت الآن في</p>
            <div className="card-nour p-8">
              <p className="text-4xl font-extrabold text-gradient-gold drop-shadow-md">سورة {cur?.name}</p>
            </div>
          </div>
          <button onClick={confirmTodaySurah} className="btn-emerald w-full p-4 rounded-2xl font-bold text-xl shadow-lg active:scale-95">
            نعم، أكمل في سورة {cur?.name}
          </button>
          <button onClick={requestSurahChange} className="w-full p-4 rounded-2xl font-bold text-lg bg-card border-2 border-border hover:border-accent/50 active:scale-95 transition-all">
            تغيير السورة {hasKidsPin() ? "(برمز ولي الأمر)" : ""}
          </button>
        </div>
      </div>
    );
  }

  if (showSurahSelector || !profile.currentSurah) {
    return (
      <div className="min-h-screen page-nour text-foreground pb-8" dir="rtl">
        <div className="mx-auto max-w-md px-4 py-8 space-y-6 animate-fade-up">
          <div className="text-center space-y-3 mb-6">
            <h1 className="text-3xl font-extrabold text-gradient-gold drop-shadow-md">بطل التحدي الأسطوري</h1>
            <p className="text-muted-foreground font-bold text-lg">أين وصلت في الحفظ؟ حدد السورة لنبدأ!</p>
          </div>
          <div className="grid grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto p-1 custom-scrollbar">
            {SURAHS.filter(s => s.number !== 1).map(s => (
              <button key={s.number} onClick={() => { setCurrentSurah(s.number); setProfile({...profile, currentSurah: s.number}); setShowSurahSelector(false); }}
                className={`p-4 rounded-2xl border-2 font-extrabold text-xl active:scale-95 transition-all ${profile.currentSurah === s.number ? 'bg-accent/20 border-accent text-accent shadow-[0_0_15px_rgba(var(--accent),0.3)]' : 'bg-card border-border hover:border-accent/50 text-foreground'}`}>
                {s.name}
              </button>
            ))}
          </div>
          {!!profile.currentSurah && (
            <button onClick={() => setShowSurahSelector(false)} className="btn-emerald w-full p-4 rounded-2xl font-bold text-xl shadow-lg active:scale-95">متابعة اللعب</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-safe page-nour text-foreground w-full kids-games-wrap" dir="rtl">
      <div className={`mx-auto w-full px-3 py-3 sm:px-4 sm:py-4 space-y-3 sm:space-y-4 container-mobile transition-all duration-300 ${active ? "max-w-3xl" : ""}`}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <button onClick={headerBack} className="flex h-9 sm:h-10 shrink-0 items-center gap-1.5 rounded-full bg-secondary text-secondary-foreground px-3 sm:px-4 text-xs sm:text-sm font-extrabold hover:brightness-95 active:scale-95 border border-border shadow-sm">
            <ArrowRight className="h-4 w-4" /> {active ? "الرجوع للألعاب" : "الخروج للتلاوات"}
          </button>
          
          {active && def ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
              {(() => { const I = iconFor(def.icon); return <I className="w-4 h-4 text-accent" />; })()}
              <span className="font-extrabold text-xs sm:text-sm text-foreground">{def.title}</span>
            </div>
          ) : (
            <h1 className="font-extrabold text-base sm:text-lg text-gradient-gold order-first w-full text-center sm:w-auto sm:order-none">ركن الأطفال</h1>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent font-extrabold text-xs sm:text-sm px-2.5 sm:px-3 h-9 sm:h-10 shrink-0 shadow-sm">
              <Star className="w-4 h-4 shrink-0 fill-current" /> <span>{formatCoins(coins)} نجمة</span>
            </span>

            {!active && (
              <>
                <button onClick={() => setShowBadges(true)} aria-label="الأوسمة والإنجازات" title="الأوسمة والإنجازات" className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-amber-500/15 text-amber-500 hover:brightness-95 flex items-center justify-center active:scale-95 border border-amber-500/30 shadow-sm"><Trophy className="w-5 h-5" /></button>
                <button onClick={() => setShowNotifications(true)} aria-label="الإشعارات" title="الإشعارات" className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-secondary text-secondary-foreground hover:brightness-95 flex items-center justify-center active:scale-95"><Bell className="w-5 h-5" /></button>
                <button onClick={openParent} aria-label="إعدادات ولي الأمر" title="إعدادات ولي الأمر" className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-secondary text-secondary-foreground hover:brightness-95 flex items-center justify-center active:scale-95"><Settings className="w-5 h-5" /></button>
                <button onClick={openCertificate} aria-label="شهادة التقدم" title="شهادة التقدم" className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-rose-500/15 text-rose-500 hover:brightness-95 flex items-center justify-center active:scale-95 border border-rose-500/30 shadow-sm"><Award className="w-5 h-5" /></button>
              </>
            )}
          </div>
        </header>

        {/* مساحة إعلانية تمت إزالتها بناء على طلبك */}

        {/* ── شريط الوقت المتبقي وزر العرض التفاعلي ── */}
        {!active && (
          <div className="card-nour p-2.5 sm:p-3 rounded-2xl bg-gradient-to-l from-card via-card/90 to-card border border-border/80 shadow-md flex items-center justify-between gap-2 animate-fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/30">
                <Clock className="w-4 h-4 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-black text-foreground truncate">
                    {profile.playMinutes > 0
                      ? (progress.played || 0) >= profile.playMinutes
                        ? "⏰ انتهى وقت اللعب! طلب ولي الأمر..."
                        : `الوقت المتبقي: ${Math.max(0, profile.playMinutes - (progress.played || 0))} دقيقة`
                      : "وقت اللعب: مفتوح بلا حدود ♾️"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-28 sm:w-36 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        profile.playMinutes > 0 && (progress.played || 0) >= profile.playMinutes
                          ? "bg-destructive"
                          : "bg-amber-500"
                      }`}
                      style={{
                        width: `${
                          profile.playMinutes > 0
                            ? Math.min(100, Math.round(((progress.played || 0) / profile.playMinutes) * 100))
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {profile.playMinutes > 0 ? `${progress.played}/${profile.playMinutes}د` : "غير مقيّد"}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowTimeModal(true)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs shadow-sm hover:brightness-105 active:scale-95 transition-all shrink-0 flex items-center gap-1"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>كم بقي؟</span>
            </button>
          </div>
        )}

        {def && (def.remote || def.engine === "remote") ? (
          <RemoteGameFrame def={def} onExit={() => setActive(null)} />
        ) : def && Engine ? (
          <div data-game-panel className="card-nour p-3.5 sm:p-6 rounded-3xl border-2 border-accent/25 bg-card/95 shadow-2xl backdrop-blur-md animate-fade-up game-container space-y-3">
            {profile.playMinutes > 0 && (
              <div className="mb-2 p-2 sm:p-2.5 rounded-2xl bg-secondary/40 border border-border/60">
                <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground mb-1">
                  <span className="inline-flex items-center gap-1 text-amber-500"><Clock className="w-3.5 h-3.5" /> وقت اللعب المتبقي</span>
                  <span>{Math.max(0, profile.playMinutes - (progress.played || 0))} دقيقة</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${playPct >= 100 ? "bg-destructive" : "bg-amber-500"}`} style={{ width: `${Math.min(100, playPct)}%` }} />
                </div>
              </div>
            )}
            <Engine def={def} minSurah={profile.currentSurah || 38} />
          </div>
        ) : (
          <>
            <div className="card-nour p-5 text-center space-y-3 animate-fade-up">
              <div className="flex flex-col items-center gap-2">
                <button 
                  onClick={openShop} 
                  title="تخصيص الشخصية والمتجر"
                  className="relative group cursor-pointer transition-transform hover:scale-105 active:scale-95"
                >
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full ring-4 ring-accent/60 ring-offset-4 ring-offset-background p-1 bg-card shadow-xl">
                    <Avatar name={profile.avatar} className="w-full h-full rounded-full" />
                  </div>
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-[10px] font-black px-2.5 py-0.5 rounded-full shadow flex items-center gap-1 whitespace-nowrap">
                    <Sparkles className="w-3 h-3" /> المتجر
                  </span>
                </button>
                <div className="space-y-0.5">
                  <p className="font-extrabold text-lg sm:text-xl text-foreground">{profile.name ? `مرحباً ${profile.name}` : "مرحباً يا بطل القرآن"}</p>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={openShop} className="text-xs font-extrabold text-accent underline-offset-2 hover:underline flex items-center gap-1">
                      خصّص شخصيتك
                    </button>
                    {getProfiles().length > 1 && (
                      <>
                        <span className="text-muted-foreground text-xs">•</span>
                        <button onClick={() => navigate("/profiles")} className="text-xs font-bold text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">تبديل الطفل</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {!unlocked ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 animate-pulse text-amber-500" /> ركن الألعاب مقفل بالقرآن
                    </span>
                    <span className="text-xs font-black text-accent bg-accent/15 px-2.5 py-0.5 rounded-full">
                      بقي {Math.max(0, Math.round((profile.goalMinutes - (progress.minutes || 0)) * 10) / 10)} دقيقة
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="h-3 rounded-full bg-secondary overflow-hidden p-0.5 border border-border/60">
                      <div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-muted-foreground">
                      <span>استمعت: <b className="text-emerald-500">{progress.minutes}</b> د</span>
                      <span>الهدف: <b className="text-foreground">{profile.goalMinutes}</b> د</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => navigate("/audio")}
                      className="btn-emerald p-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 shadow-md"
                    >
                      <Headphones className="w-4 h-4" /> استمع للقرآن الآن 📖
                    </button>
                    <button
                      onClick={() => setShowLockGateModal(true)}
                      className="p-2.5 rounded-xl bg-card border border-border hover:border-accent/40 font-bold text-xs text-foreground flex items-center justify-center gap-1 active:scale-95 transition-all"
                    >
                      <Clock className="w-4 h-4 text-accent" /> تفاصيل العداد ⏰
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-success flex items-center justify-center gap-1 font-bold"><Gift className="w-4 h-4" /> {profile.reward}</p>
              )}
            </div>

            {/* ركن التخصيص (وجوه وألوان بالنجوم) */}
            <button onClick={openShop} className="relative z-10 w-full p-3 rounded-2xl bg-gradient-to-l from-accent/15 to-card border border-accent/40 shadow-soft flex items-center gap-3 active:scale-[0.99]">
              <span className="w-11 h-11 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shrink-0"><Sparkles className="w-6 h-6" /></span>
              <span className="flex-1 text-right"><span className="block font-extrabold text-foreground">خصّص شخصيتك</span><span className="block text-[11px] text-muted-foreground">افتح وجوهاً وألواناً جديدة بنجومك</span></span>
              <span className="inline-flex items-center gap-1 text-accent font-extrabold text-xs sm:text-sm bg-accent/15 px-2.5 py-1 rounded-full"><Star className="w-4 h-4 fill-current" /> {formatCoins(coins)} نجمة</span>
            </button>

            <div className="flex items-center justify-between mt-8 mb-3 px-1">
              <h3 className="font-extrabold text-xl text-foreground flex items-center gap-2"><Trophy className="w-6 h-6 text-accent" /> الألعاب الأسطورية</h3>
              <button onClick={requestSurahChange} className="text-xs font-bold text-accent bg-accent/15 px-3 py-1.5 rounded-full hover:bg-accent/25 transition-colors">تغيير السورة ({SURAHS.find(s => s.number === profile.currentSurah)?.name})</button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              {myGames.map((g, gi) => {
                const I = iconFor(g.icon);
                const owned = isGameOwned(g);
                return (
                  <button key={g.id} onClick={() => tapGame(g.id)} {...(gi === 0 ? { "data-game-entry": "" } : {})}
                    className={`relative overflow-hidden rounded-[1.2rem] sm:rounded-[1.7rem] p-[2px] active:scale-[0.98] transition-transform text-right ${!canPlay ? "opacity-60" : "hover:shadow-xl hover:shadow-accent/20"}`}>
                    <div className={`absolute inset-0 opacity-80 ${g.tint}`} />
                    <div className="relative bg-card/95 backdrop-blur-md rounded-[1.1rem] sm:rounded-[1.6rem] p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                      <span className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${g.tint}`}><I className="w-6 h-6 sm:w-8 sm:h-8" /></span>
                      <div className="flex-1 min-w-0">
                        <span className="block font-extrabold text-foreground text-base sm:text-xl leading-tight truncate">{g.title}</span>
                        <span className="inline-flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-bold text-muted-foreground bg-secondary rounded-full px-2.5 py-0.5">مناسب لسن {g.ageMin}+</span>
                          {g.cost > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-extrabold text-accent bg-accent/15 rounded-full px-2 py-0.5"><Star className="w-3 h-3 fill-current" /> {g.cost}</span>
                          ) : (
                            <span className="text-[11px] font-extrabold text-success bg-success/15 rounded-full px-2 py-0.5">مجانية</span>
                          )}
                        </span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground opacity-50 shrink-0"><ArrowRight className="w-4 h-4" /></div>
                    </div>
                    {!canPlay ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-[1.7rem]"><Lock className="w-10 h-10 text-muted-foreground" /></div>
                    ) : !owned && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[2px] rounded-[1.7rem]">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground font-extrabold text-sm px-4 py-2 shadow-lg">
                          <Lock className="w-4 h-4" /> افتح بـ {g.cost} <Star className="w-4 h-4 fill-current" />
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
              
              {/* زر الخروج المباشر إلى التلاوات */}
              <button onClick={() => navigate("/audio")} className="mt-2 relative overflow-hidden rounded-[1.7rem] p-[2px] active:scale-[0.98] transition-transform text-right hover:shadow-xl hover:shadow-accent/30">
                <div className="absolute inset-0 bg-accent/20" />
                <div className="relative bg-card/95 backdrop-blur-md rounded-[1.6rem] p-4 flex items-center gap-4 border border-accent/40">
                  <span className="w-16 h-16 rounded-2xl bg-accent/20 text-accent flex items-center justify-center shrink-0"><Headphones className="w-8 h-8" /></span>
                  <div className="flex-1">
                    <span className="block font-extrabold text-foreground text-xl leading-tight">الخروج إلى تلاوات القرآن</span>
                    <span className="inline-block mt-1 text-[11px] font-bold text-accent bg-accent/15 rounded-full px-2.5 py-0.5">الاستماع للقرآن الكريم</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground shrink-0"><ArrowRight className="w-4 h-4" /></div>
                </div>
              </button>
            </div>
          </>
        )}
      </div>



      {/* نافذة فتح لعبة بالنجوم (المال) */}
      {unlockDef && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4" onClick={() => setUnlockDef(null)}>
          <div className="card-nour w-full max-w-sm p-6 text-center space-y-4 animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent font-extrabold px-3 py-1.5"><Star className="w-4 h-4 fill-current" /> {coins}</span>
              <button onClick={() => setUnlockDef(null)} aria-label="إغلاق" className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center active:scale-95 transition-transform"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-lg font-extrabold text-foreground">افتح لعبة «{unlockDef.title}»؟</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              التكلفة: <span className="inline-flex items-center gap-1 font-extrabold text-accent align-middle">{unlockDef.cost} <Star className="w-4 h-4 fill-current" /></span>
              <br />القراءة والاستماع يمنحانك نجوماً أكثر بكثير من الألعاب
            </p>
            <div className="flex gap-2">
              <button onClick={buyGame} className="btn-gold flex-1 py-3 rounded-xl font-bold active:scale-95 transition-transform">فتح بالنجوم</button>
              <button onClick={() => setUnlockDef(null)} className="flex-1 py-3 rounded-xl font-bold bg-secondary text-secondary-foreground border border-border active:scale-95 transition-transform">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {pinAction && (
        <ParentalGateModal
          title={
            pinAction === "setparent" || pinAction === "setread"
              ? "إعداد رمز حماية وضع الأطفال"
              : pinAction === "parent"
              ? "الدخول لمنطقة الوالدين"
              : pinAction === "setsurah"
              ? "تغيير السورة — أدخل رمز ولي الأمر"
              : "الخروج من ركن الأطفال"
          }
          onSuccess={onPinSuccess}
          onCancel={() => setPinAction(null)}
        />
      )}
      
      {showNotifications && <NotificationsModal onClose={() => setShowNotifications(false)} />}
      {showBadges && <BadgesModal onClose={() => setShowBadges(false)} />}

      {/* رسالة التشجيع بعد إنجاز وقت الدراسة (عند الدخول للألعاب) */}
      {showEncourage && unlocked && !active && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-card rounded-3xl shadow-2xl border border-border p-6 text-center space-y-4 animate-fade-up">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-success/15 flex items-center justify-center text-5xl">🎉</div>
            <h3 className="text-xl font-extrabold text-foreground">أحسنت يا بطل القرآن!</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              أنهيتَ وقت دراستك اليوم! أنتَ مستعد للتحدي الآن.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={dismissEncourage} className="w-full p-3 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg">
                <Gamepad2 className="w-5 h-5" /> دخول الألعاب
              </button>
              <button onClick={dismissEncourage} className="w-full p-2.5 rounded-xl bg-secondary text-secondary-foreground font-bold active:scale-95 transition-all">
                دخول الألعاب
              </button>
            </div>
                    </div>
        </div>
      )}

      {/* نافذة شهادة التقدم */}
      {showCertificate && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto" onClick={() => setShowCertificate(false)}>
          <div className="w-full max-w-md bg-card rounded-3xl shadow-2xl border border-border p-4 sm:p-6 max-h-[92vh] overflow-y-auto animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 text-rose-500 font-extrabold text-xs px-3 py-1.5"><Award className="w-3.5 h-3.5" /> شهادة التقدم</span>
              <button onClick={() => setShowCertificate(false)} aria-label="إغلاق" className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center active:scale-95 transition-transform"><X className="w-4 h-4" /></button>
            </div>

            <div className="text-center space-y-4">
              <div className="mx-auto w-24 h-24 rounded-full ring-4 ring-amber-400/60 shadow-xl overflow-hidden p-1 bg-gradient-to-tr from-amber-500 to-yellow-300">
                <Avatar name={profile.avatar} className="w-full h-full rounded-full shadow-inner" />
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">تُمنح هذه الشهادة إلى</p>
                <p className="text-2xl font-extrabold text-gradient-gold">{profile.name || "بطل القرآن"}</p>
                <p className="text-muted-foreground text-sm">لمشاركته في تعلم القرآن الكريم</p>
              </div>

              <div className="bg-secondary/50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">السورة الحالية</span>
                  <span className="font-bold text-foreground">سورة {SURAHS.find(s => s.number === profile.currentSurah)?.name || "النبأ"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">وقت الدراسة</span>
                  <span className="font-bold text-foreground">{progress.minutes} دقيقة</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">النجوم المكتسبة</span>
                  <span className="font-bold text-accent">{formatCoins(getCoins())} ⭐</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">الأيام المتتالية</span>
                  <span className="font-bold text-success">{streakDays || 1} يوم</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button onClick={generateCertificate} className="w-full p-3 rounded-xl bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg">
                  <Download className="w-5 h-5" /> تحميل الشهادة كصورة
                </button>
                <button onClick={() => setShowCertificate(false)} className="w-full p-2.5 rounded-xl bg-secondary text-secondary-foreground font-bold active:scale-95 transition-all">
                  إغلاق
                </button>
              </div>

              {certificateReady && (
                <p className="text-xs text-success text-center">✓ تم حفظ الشهادة في جهازك — ابحث في مجلد التنزيلات</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* نافذة تفاصيل الوقت المتبقي للأطفال */}
      {showTimeModal && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowTimeModal(false)}>
          <div className="w-full max-w-sm bg-card rounded-3xl shadow-2xl border border-border p-6 text-center space-y-4 animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Clock className="w-7 h-7 animate-bounce" />
            </div>

            <div>
              <h3 className="text-xl font-extrabold text-foreground">عداد الوقت والهمّة ⏰</h3>
              <p className="text-xs text-muted-foreground font-bold mt-1">تتبع وقت اللعب ودراسة القرآن لليوم</p>
            </div>

            <div className="bg-secondary/40 rounded-2xl p-4 space-y-3 text-right">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Gamepad2 className="w-4 h-4 text-accent" /> الوقت المتبقي للعب:
                </span>
                <span className="text-accent font-black text-sm">
                  {profile.playMinutes > 0
                    ? `${Math.max(0, profile.playMinutes - (progress.played || 0))} دقيقة`
                    : "مفتوح بلا حدود ♾️"}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-muted-foreground" /> تم اللعب اليوم:
                </span>
                <span className="text-foreground font-black">
                  {progress.played || 0} دقيقة {profile.playMinutes > 0 ? `(من أصل ${profile.playMinutes}د)` : ""}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Headphones className="w-4 h-4 text-emerald-500" /> وقت مدارسة القرآن:
                </span>
                <span className="text-emerald-500 font-black">
                  {progress.minutes || 0} دقيقة {profile.goalMinutes > 0 ? `(الهدف: ${profile.goalMinutes}د)` : ""}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> رصيدك من النجوم:
                </span>
                <span className="text-amber-500 font-black">
                  {formatCoins(getCoins())} نجمة ⭐
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  setShowTimeModal(false);
                  navigate("/audio");
                }}
                className="w-full p-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
              >
                <Headphones className="w-4 h-4" />
                <span>الذهاب للتلاوات وحفظ القرآن 📖</span>
              </button>
              <button
                onClick={() => setShowTimeModal(false)}
                className="w-full p-2.5 rounded-xl bg-secondary text-secondary-foreground font-bold text-xs active:scale-95 transition-all"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* شاشة الاحتفال بالميلستون */}
      {showMilestone && (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto" onClick={() => setShowMilestone(false)}>
          <div className="w-full max-w-sm bg-gradient-to-br from-amber-900/90 via-yellow-900/90 to-orange-900/90 rounded-3xl shadow-2xl border-2 border-amber-400/50 p-8 text-center space-y-6 animate-fade-up" onClick={e => e.stopPropagation()}>
            {/* جزيئات احتفالية */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
              <div className="absolute top-4 left-6 text-2xl animate-bounce" style={{ animationDelay: "0s" }}>✨</div>
              <div className="absolute top-8 right-8 text-xl animate-bounce" style={{ animationDelay: "0.2s" }}>🌟</div>
              <div className="absolute top-16 left-12 text-lg animate-bounce" style={{ animationDelay: "0.4s" }}>⭐</div>
              <div className="absolute bottom-12 right-10 text-2xl animate-bounce" style={{ animationDelay: "0.1s" }}>🎉</div>
              <div className="absolute bottom-8 left-8 text-xl animate-bounce" style={{ animationDelay: "0.3s" }}>💫</div>
              <div className="absolute top-1/2 left-4 text-lg animate-bounce" style={{ animationDelay: "0.5s" }}>🎊</div>
              <div className="absolute top-1/3 right-6 text-lg animate-bounce" style={{ animationDelay: "0.15s" }}>✨</div>
            </div>

            <div className="relative space-y-4">
              <div className="mx-auto w-20 h-20 rounded-full bg-amber-400/20 border border-amber-300/50 flex items-center justify-center text-amber-300 animate-bounce"><Award className="w-12 h-12" /></div>
              <h2 className="text-3xl font-extrabold text-amber-300 drop-shadow-md">{milestoneData.title}</h2>
              <p className="text-amber-100 text-lg leading-relaxed">{milestoneData.message}</p>

              <div className="bg-black/30 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-amber-200/70">أيام متتالية</span>
                  <span className="font-bold text-amber-300 text-lg">{milestoneData.days} يوم</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-200/70">السورة</span>
                  <span className="font-bold text-amber-300">سورة {SURAHS.find(s => s.number === profile.currentSurah)?.name || "النبأ"}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button onClick={() => { shareMilestone(); }} className="w-full p-3 rounded-xl bg-gradient-to-l from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-black font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg">
                  <Camera className="w-5 h-5" /> احفظ/شارك صورة الاحتفال
                </button>
                <button onClick={() => { generateCertificate(); setShowMilestone(false); }} className="w-full p-2.5 rounded-xl bg-white/10 text-amber-200 font-bold active:scale-95 transition-all hover:bg-white/20 flex items-center justify-center gap-2">
                  <Award className="w-4 h-4" /> شهادة التقدير
                </button>
                <button onClick={() => setShowMilestone(false)} className="w-full p-2.5 rounded-xl bg-white/10 text-amber-200 font-bold active:scale-95 transition-all hover:bg-white/20">
                  متابعة اللعب
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة عداد وقفل القرآن المتبقي للألعاب */}
      <QuranLockGateModal
        isOpen={showLockGateModal}
        onClose={() => setShowLockGateModal(false)}
        targetName="الألعاب"
      />

      {/* بوابة السؤال اليومي (سؤال صعب → السورة التالية + لقب كل 5 أجزاء + شهادة + كود نقاط مجانية) */}
      <DailyGateModal />

      {/* كود HTML خارجي أسفل قسم الألعاب (يُدار من admin.html) */}
      <ExternalHtmlBlock />
    </div>
  );
}

