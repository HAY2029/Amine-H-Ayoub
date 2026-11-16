import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, RefreshCw, Star, Sparkles, CheckCircle2, Info, BookOpen, Volume2, Trophy } from "lucide-react";
import { addCoins, formatCoins, getCoins } from "../data/kidsProfile";
import type { GameDef } from "../data/gameCatalog";
import { playCardFlipSfx, playMatchSuccessSfx, playMismatchSfx, playVictoryFanfareSfx, playStarCollectSfx } from "../utils/gameSfx";

/**
 * 💛 لعبة «قلبٌ يحبّ الخير»
 *
 * فكرة اللعبة: موقف من حياة الطفل اليومية، وثلاثة اختيارات، واختيار واحد يرضي الله
 * ويفرّح القلب. الهدف ليس الحفظ بل **المعنى في قلب الطفل**: يكتشف أن الخير قرار
 * صغير يتخذه الآن، ويتعلّم معه دليلًا من القرآن أو السنة.
 *
 * الأداة المميّزة:
 *  - «قلب» يمتلئ مع كل اختيار صحيح (حتى 10).
 *  - «دفتر قلبي» يجمع القيم التي عاشها الطفل في الجولة، ويُقرأ بالصوت.
 *  - محتوى لا يتكرر: كل موقف يظهر مرة واحدة، والجولات القادمة تبدأ بمواقف لم يرها
 *    الطفل بعد، فلا يعيد المعلومة نفسها في كل مرة.
 */

interface Choice {
  text: string;
  good?: boolean;
}

interface HeartScenario {
  id: string;
  emoji: string;
  situation: string;
  value: string;
  tip: string;
  source: string;
  choices: Choice[];
}

const ROUNDS = 10;
const SEEN_KEY = "mushaf:kindheart:seen:v1";

const BANK: HeartScenario[] = [
  {
    id: "wallet", emoji: "👛", value: "الأمانة",
    situation: "وجدتَ محفظة فيها نقود في طريق المدرسة. ماذا تفعل؟",
    tip: "المحفظة ليست ملكك، وأمانةُ الطريق تُردّ لصاحبها ولو كانت صغيرة.",
    source: "﴿إِنَّ اللَّهَ يَأْمُرُكُمْ أَن تُؤَدُّوا الْأَمَانَاتِ إِلَىٰ أَهْلِهَا﴾",
    choices: [
      { text: "أبحث عن صاحبها وأسلّمها له", good: true },
      { text: "آخذ النقود وأشتري حلوى" },
      { text: "أتركها في مكانها بلا اهتمام" },
    ],
  },
  {
    id: "mother-call", emoji: "🤱", value: "برّ الوالدين",
    situation: "أنت تلعب، وأمك تناديك لتساعدها. ماذا تفعل؟",
    tip: "إجابة الأم ولو كانت في وقت اللعب تُدخل الفرح على قلبها وقلبك.",
    source: "﴿وَبِالْوَالِدَيْنِ إِحْسَانًا﴾",
    choices: [
      { text: "أجيبها فورًا وأساعدها", good: true },
      { text: "أكمل اللعب وأتظاهر أني لم أسمع" },
      { text: "أصرخ: لستُ فاضيًا الآن" },
    ],
  },
  {
    id: "friend-fall", emoji: "🤕", value: "الرحمة",
    situation: "سقط صديقك في الملعب وتألّم رُكبتُه. ماذا تفعل؟",
    tip: "الرحمة ليست كلامًا؛ يدٌ ترفع أخاك وتطمئنه هي الرحمة نفسها.",
    source: "«ارحموا من في الأرض يرحمكم من في السماء»",
    choices: [
      { text: "أرفعه وأطمئنه وأذهب معه", good: true },
      { text: "أضحك عليه مع الآخرين" },
      { text: "أكمل لعبي فهو ليس صديقي المقرب" },
    ],
  },
  {
    id: "share-biscuit", emoji: "🍪", value: "الإيثار",
    situation: "بقي معك قطعة حلوى واحدة، وصديقك بجانبك يتمنّاها. ماذا تفعل؟",
    tip: "أن تعطي وأنت تحبّ ما تعطيه — هذا إيثار، وهو أحبّ الخير إلى القلوب.",
    source: "﴿وَيُؤْثِرُونَ عَلَىٰ أَنفُسِهِمْ﴾",
    choices: [
      { text: "أقاسمه نصفها وأبتسم", good: true },
      { text: "آكلها أمامه بسرعة" },
      { text: "أخفيها في جيبي حتى لا يراها" },
    ],
  },
  {
    id: "broken-vase", emoji: "🏺", value: "الصدق",
    situation: "لعبتم في البيت وانكسرت مزهرية، وأنت من كسرها. ماذا تقول؟",
    tip: "الصدق يخيف لثانية، لكنه يريح القلب ساعةً طويلة، ويُصلح ما كُسر.",
    source: "«إنَّ الصِّدْقَ يَهْدِي إِلَى الْبِرِّ»",
    choices: [
      { text: "أعترف وأعتذر وأساعد في التنظيف", good: true },
      { text: "أقول إنّ أخي هو الذي كسرها" },
      { text: "أهرب وأترك المكان" },
    ],
  },
  {
    id: "new-student", emoji: "🧑‍🎓", value: "حسن الخلق",
    situation: "طالب جديد في الصفّ يجلس وحده ولا يعرفه أحد. ماذا تفعل؟",
    tip: "كلمة ترحيب صغيرة تجعل طفلًا يشعر أنه بين أهله، لا غريبًا.",
    source: "﴿وَقُولُوا لِلنَّاسِ حُسْنًا﴾",
    choices: [
      { text: "أرحّب به وأجلس معه في الفسحة", good: true },
      { text: "أضحك مع أصحابي عليه" },
      { text: "أتجاهله حتى يكلّمني أولًا" },
    ],
  },
  {
    id: "paper-floor", emoji: "🧹", value: "إماطة الأذى",
    situation: "رأيت ورقة وحجرًا صغيرًا في طريق المصلّين. ماذا تفعل؟",
    tip: "رفع الأذى عن طريق الناس صدقة، ولو كان شيئًا صغيرًا لا يراه غيرك.",
    source: "«وَتُمِيطُ الأَذَى عَنِ الطَّرِيقِ صَدَقَةٌ»",
    choices: [
      { text: "أرفعها وأضعها في سلة المهملات", good: true },
      { text: "أتخطاها وأكمل طريقي" },
      { text: "أنتظر حتى يرفعها أحد غيري" },
    ],
  },
  {
    id: "thirsty-cat", emoji: "🐈", value: "الرفق بالحيوان",
    situation: "قطة صغيرة عطشى تقف قرب الباب. ماذا تفعل؟",
    tip: "الرحمة بالحيوان بابٌ عظيم للأجر، وقد غُفر لمن سقى كلبًا عطشًا.",
    source: "«في كلِّ كبدٍ رطبةٍ أجرٌ»",
    choices: [
      { text: "أضع لها ماءً في صحن بعيد عن الطريق", good: true },
      { text: "أرميها بحجر حتى تبعد" },
      { text: "أطاردها لإخافتها" },
    ],
  },
  {
    id: "adhan", emoji: "🕌", value: "الصلاة",
    situation: "أذّن المؤذن وأنت في أحلى لحظة لعب. ماذا تفعل؟",
    tip: "الصلاة ليست انقطاعًا عن اللعب، بل موعد مع من يحبّك أكثر من كل أحد.",
    source: "﴿وَأَقِيمُوا الصَّلَاةَ﴾",
    choices: [
      { text: "أترك اللعب وأتطهّر وأصلّي", good: true },
      { text: "أكمل اللعب وأصلّي متأخرًا كل يوم" },
      { text: "أخفض الصوت حتى لا يسمعني أحد" },
    ],
  },
  {
    id: "gift-coins", emoji: "🪙", value: "الشكر",
    situation: "أعطاك جدّك نقودًا قليلة، وصديقك أخذ أكثر. ماذا تقول؟",
    tip: "الشكر يفتح باب الزيادة؛ ومن رضي بما أعطاه الله عاش قلبه غنيًّا.",
    source: "﴿لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ﴾",
    choices: [
      { text: "أشكر جدّي وأفرح بما عندي", good: true },
      { text: "أغضب وأقول: هذا قليل!" },
      { text: "أطلب أكثر وأنا متضايق" },
    ],
  },
  {
    id: "wait-brother", emoji: "⏳", value: "الصبر",
    situation: "أخوك تأخّر في الحمام وأنتما مستعجلان للخروج. ماذا تفعل؟",
    tip: "الصبر ليس انتظارًا صامتًا فقط، بل انتظارٌ معه رحمة وحُسن كلام.",
    source: "﴿وَاللَّهُ مَعَ الصَّابِرِينَ﴾",
    choices: [
      { text: "أنتظره بهدوء وأقول: خذ وقتك", good: true },
      { text: "أطرق الباب بقوة وأصرخ عليه" },
      { text: "أذهب وحدي وأتركه" },
    ],
  },
  {
    id: "share-toy", emoji: "🧸", value: "المشاركة",
    situation: "أختك الصغيرة تبكي وتريد لعبتك المفضّلة. ماذا تفعل؟",
    tip: "أن تُشارك يعني أن تعطي شيئًا تحبّه، ومن شارك أحبّه الناس.",
    source: "«لا يؤمنُ أحدُكم حتى يحبَّ لأخيه ما يحبُّ لنفسه»",
    choices: [
      { text: "أعطيها اللعبة وأعلّمها كيف تلعب بها", good: true },
      { text: "أخفيها وأقفل الباب" },
      { text: "أصرخ عليها وأبعدها" },
    ],
  },
  {
    id: "extra-food", emoji: "🍽️", value: "الاعتدال",
    situation: "وُضع أمامك طعام كثير وتعلم أنك ستترك نصفه. ماذا تفعل؟",
    tip: "الاعتدال يحفظ النعمة، ويترك لمن يحتاج نصيبًا منها.",
    source: "﴿وَلَا تُسْرِفُوا﴾",
    choices: [
      { text: "آخذ ما أحتاجه وأترك الباقي لغدٍ أو لغيري", good: true },
      { text: "أملأ صحني وأترك النصف" },
      { text: "أرمي الباقي لأنه زائد" },
    ],
  },
  {
    id: "gossip", emoji: "🤫", value: "حفظ اللسان",
    situation: "بدأ أصحابك يذكرون عيوب زميل في غيابه. ماذا تفعل؟",
    tip: "أن تسكت عن عيب أخيك خير من أن تدافع عنه بعد أن يُجرح.",
    source: "﴿وَلَا يَغْتَب بَّعْضُكُم بَعْضًا﴾",
    choices: [
      { text: "لا أشارك وأحوّل الحديث إلى شيء جميل", good: true },
      { text: "أضحك وأزيد من الكلام" },
      { text: "أسمع بصمت ثم أنقل الكلام له" },
    ],
  },
  {
    id: "teach-ayah", emoji: "📖", value: "تعليم الخير",
    situation: "تعلّمت آية جديدة، وأخوك الأصغر لا يعرفها. ماذا تفعل؟",
    tip: "أن تُعلّم غيرك حرفًا خيرٌ من أن تحفظه وحدك؛ الخير يزداد حين يُقسم.",
    source: "«خيرُكم مَن تعلَّم القرآنَ وعلَّمه»",
    choices: [
      { text: "أعلّمها له برفق ونكرّرها معًا", good: true },
      { text: "أحفظها لنفسي فقط" },
      { text: "أسخر منه لأنه لا يعرفها" },
    ],
  },
  {
    id: "show-grade", emoji: "🏅", value: "التواضع",
    situation: "نجحت بدرجة عالية وأردت أن تُخبر الجميع بفخر. ماذا تفعل؟",
    tip: "النجاح نعمة تُشكَر لا تُتعالى بها، والقلب المتواضع يبقى محبوبًا.",
    source: "«ومَن تواضعَ لله رفعهُ الله»",
    choices: [
      { text: "أحمد الله وأشجّع من لم ينجح", good: true },
      { text: "أذكّر الجميع بدرجتي كل يوم" },
      { text: "أسخر ممن درجته أقل" },
    ],
  },
];

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const readSeen = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
};

const writeSeen = (ids: string[]) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* لا تخزين — تكفي الجلسة الحالية */
  }
};

/** جولة بلا تكرار: نبدأ بالمواقف التي لم يرها الطفل، ونعيد الدورة فقط عند نفادها. */
const buildRound = (count: number): HeartScenario[] => {
  const seen = readSeen();
  const fresh = BANK.filter((s) => !seen.includes(s.id));
  const reused = BANK.filter((s) => seen.includes(s.id));
  const picked = [...shuffle(fresh), ...shuffle(reused)].slice(0, Math.min(count, BANK.length));
  writeSeen([...seen, ...picked.map((s) => s.id)]);
  return picked;
};

const speak = (text: string) => {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ar-SA";
    utter.rate = 0.92;
    window.speechSynthesis.speak(utter);
  } catch {
    /* الصوت غير متاح — لا مشكلة */
  }
};

export default function KindHeartGame({ def }: { def?: GameDef }) {
  void def;
  const [round, setRound] = useState<HeartScenario[]>(() => buildRound(ROUNDS));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [coins, setCoins] = useState(getCoins);
  const [notebook, setNotebook] = useState<{ value: string; emoji: string }[]>([]);
  const [earned, setEarned] = useState(0);
  const [showNotebook, setShowNotebook] = useState(false);
  const audioDoneRef = useRef(false);

  const current = round[index];
  const finished = index >= round.length;

  useEffect(() => {
    if (finished && !audioDoneRef.current) {
      audioDoneRef.current = true;
      playVictoryFanfareSfx();
    }
  }, [finished]);

  const answered = picked !== null;
  const chosen = answered && current ? current.choices[picked] : null;
  const isCorrect = !!chosen?.good;

  const choose = (choiceIndex: number) => {
    if (!current || answered) return;
    playCardFlipSfx();
    setPicked(choiceIndex);
    const choice = current.choices[choiceIndex];
    if (choice.good) {
      const nextStreak = streak + 1;
      const bonus = nextStreak >= 3 ? 4 : 3;
      addCoins(bonus);
      setCoins(getCoins());
      setEarned((v) => v + bonus);
      setScore((v) => v + 1);
      setStreak(nextStreak);
      setBestStreak((v) => Math.max(v, nextStreak));
      setNotebook((list) => [...list, { value: current.value, emoji: current.emoji }]);
      playMatchSuccessSfx();
      playStarCollectSfx();
    } else {
      setStreak(0);
      playMismatchSfx();
    }
  };

  const next = () => {
    playCardFlipSfx();
    setPicked(null);
    setIndex((i) => i + 1);
  };

  const replay = () => {
    playCardFlipSfx();
    setRound(buildRound(ROUNDS));
    setIndex(0);
    setPicked(null);
    setScore(0);
    setStreak(0);
    setNotebook([]);
    setEarned(0);
    setShowNotebook(false);
    audioDoneRef.current = false;
  };

  const heartFill = Math.round(((finished ? score : score) / round.length) * 100);
  const hearts = useMemo(() => Array.from({ length: round.length }, (_, i) => i < score), [score, round.length]);

  if (finished) {
    return (
      <div className="space-y-5 text-center py-6 animate-fade-up max-w-xl mx-auto" dir="rtl">
        <div className="relative mx-auto w-24 h-24">
          <Heart className="w-24 h-24 mx-auto text-rose-500 fill-rose-500/80 animate-pulse drop-shadow-xl" />
          <Sparkles className="absolute -top-1 -left-2 w-7 h-7 text-amber-400 animate-bounce" />
        </div>
        <h3 className="text-2xl sm:text-3xl font-black text-foreground">قلبك صار أجمل يا بطل 🌟</h3>
        <p className="text-sm sm:text-base text-muted-foreground font-bold">
          عشت {score} قيمة من {round.length} — وربحت {earned} نجمة
        </p>

        <div className="flex items-center justify-center gap-2 flex-wrap text-xs font-black">
          <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-full">
            <CheckCircle2 className="w-4 h-4" /> {score} قرارًا طيّبًا
          </span>
          <span className="inline-flex items-center gap-1 bg-orange-500/15 text-orange-500 border border-orange-500/30 px-3 py-1.5 rounded-full">
            🔥 أطول سلسلة: {bestStreak}
          </span>
          <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-500 border border-amber-500/30 px-3 py-1.5 rounded-full">
            <Star className="w-4 h-4 fill-current" /> {formatCoins(coins)}
          </span>
        </div>

        <button
          onClick={() => setShowNotebook((v) => !v)}
          className="w-full p-4 rounded-2xl bg-gradient-to-br from-card via-card/95 to-secondary/30 border-2 border-accent/25 shadow-lg flex items-center justify-between gap-2 active:scale-[0.99] transition-all"
        >
          <span className="flex items-center gap-2 font-black text-sm text-foreground">
            <BookOpen className="w-4 h-4 text-accent" /> دفتر قلبي ({notebook.length})
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">{showNotebook ? "إخفاء" : "اعرض القيم التي عشتها"}</span>
        </button>

        {showNotebook && (
          <div className="grid grid-cols-2 gap-2 animate-in fade-in zoom-in-95 duration-200">
            {notebook.length === 0 && (
              <p className="col-span-2 text-xs font-bold text-muted-foreground">لم تُسجّل قيمة بعد — ابدأ جولة جديدة واجعل قلبك يختار.</p>
            )}
            {notebook.map((n, i) => (
              <div key={`${n.value}-${i}`} className="p-3 rounded-xl bg-secondary/60 border border-border text-xs font-black text-foreground flex items-center gap-2">
                <span className="text-lg">{n.emoji}</span> {n.value}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={replay}
          className="btn-gold mx-auto px-7 py-3 rounded-2xl font-black flex items-center gap-2 shadow-xl active:scale-95 transition-all"
        >
          <RefreshCw className="w-4 h-4" /> جولة بمواقف جديدة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl mx-auto animate-fade-up" dir="rtl">
      {/* شريط الحالة: القلب الممتلئ + السلسلة + النجوم */}
      <div className="p-3.5 rounded-2xl bg-secondary/50 backdrop-blur-sm border border-border/70 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between text-xs font-black">
          <span className="flex items-center gap-1.5 text-rose-500">
            <Heart className="w-4 h-4 fill-current" /> قلب الخير {heartFill}%
          </span>
          <span className="text-orange-500">🔥 {streak}</span>
          <span className="flex items-center gap-1 text-amber-500">
            <Star className="w-4 h-4 fill-current" /> {formatCoins(coins)}
          </span>
          <span className="text-muted-foreground">الموقف {Math.min(index + 1, round.length)} من {round.length}</span>
        </div>

        <div className="h-2.5 rounded-full bg-background/70 overflow-hidden border border-border/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-400 via-pink-500 to-rose-500 transition-[width] duration-500"
            style={{ width: `${heartFill}%` }}
          />
        </div>

        <div className="flex items-center justify-center gap-1">
          {hearts.map((full, i) => (
            <Heart
              key={i}
              className={`w-4 h-4 transition-all ${full ? "text-rose-500 fill-rose-500 scale-110" : "text-muted-foreground/25"}`}
            />
          ))}
        </div>
      </div>

      {/* بطاقة الموقف */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-card via-card/95 to-rose-500/10 border-2 border-rose-500/25 shadow-xl space-y-3 text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-4xl shadow-inner">
          {current.emoji}
        </div>
        <span className="inline-block text-[11px] font-black text-rose-500 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full">
          موقف من حياتك اليومية
        </span>
        <h2 className="text-lg sm:text-xl font-black text-foreground leading-relaxed">{current.situation}</h2>
        <p className="text-[11px] font-bold text-muted-foreground">اختر ما يرضي الله ويفرّح قلبك 💛</p>
      </div>

      {/* الاختيارات */}
      <div className="space-y-2.5">
        {current.choices.map((choice, i) => {
          const isPicked = picked === i;
          const isGood = !!choice.good;
          const highlightGood = answered && isGood;
          const highlightWrong = answered && isPicked && !isGood;
          return (
            <button
              key={choice.text}
              onClick={() => choose(i)}
              disabled={answered}
              className={`w-full p-3.5 rounded-2xl border-2 text-right font-bold text-sm sm:text-base transition-all flex items-center gap-3 shadow-sm active:scale-[0.99] ${
                highlightGood
                  ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                  : highlightWrong
                    ? "bg-rose-500/15 border-rose-400 text-rose-500"
                    : answered
                      ? "bg-secondary/40 border-border text-muted-foreground opacity-70"
                      : "bg-card border-border text-foreground hover:border-accent/70 hover:bg-secondary/60"
              }`}
            >
              <span
                className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-black ${
                  highlightGood ? "bg-emerald-500 text-emerald-950" : highlightWrong ? "bg-rose-500 text-white" : "bg-secondary text-muted-foreground"
                }`}
              >
                {answered ? (isGood ? "✓" : isPicked ? "✕" : i + 1) : i + 1}
              </span>
              <span className="flex-1 leading-relaxed">{choice.text}</span>
            </button>
          );
        })}
      </div>

      {/* بطاقة المعنى بعد الاختيار */}
      {answered && (
        <div className="p-4 rounded-3xl bg-secondary/50 border border-border space-y-3 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-center gap-2 font-black text-sm">
            {isCorrect ? (
              <span className="text-emerald-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5" /> قرارٌ جميل! امتلأ قلبك قليلًا 💛
              </span>
            ) : (
              <span className="text-amber-500 flex items-center gap-1.5">
                <Info className="w-5 h-5" /> لا بأس، القلوب تتعلّم — هذا هو الخير هنا
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-black text-accent bg-accent/10 border border-accent/25 px-3 py-1 rounded-full">
              القيمة: {current.value}
            </span>
            <button
              onClick={() => speak(`${current.value}. ${current.tip} ${current.source}`)}
              className="text-[11px] font-black text-accent bg-accent/10 border border-accent/25 px-3 py-1 rounded-full flex items-center gap-1 active:scale-95 transition-all"
              title="اسمع المعنى والدليل"
            >
              <Volume2 className="w-3.5 h-3.5" /> اسمع المعنى
            </button>
          </div>

          <p className="text-xs sm:text-sm font-bold text-foreground leading-relaxed">{current.tip}</p>
          <p className="text-[11px] sm:text-xs font-black text-center text-accent/90 bg-accent/5 border border-accent/20 rounded-xl py-2 px-3 leading-relaxed">
            {current.source}
          </p>

          <button
            onClick={next}
            className="w-full py-3 rounded-2xl bg-accent text-accent-foreground font-black text-sm shadow-md hover:brightness-105 active:scale-[0.99] transition-all"
          >
            {index + 1 >= round.length ? "أرى ما جمع قلبي ←" : "الموقف التالي ←"}
          </button>
        </div>
      )}

      {!answered && (
        <p className="text-[11px] text-center font-bold text-muted-foreground flex items-center justify-center gap-1">
          <Trophy className="w-3.5 h-3.5 text-amber-500" /> كل موقف يظهر مرة واحدة فقط — والجولة القادمة بمواقف جديدة
        </p>
      )}
    </div>
  );
}
