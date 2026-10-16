import { useState } from "react";
import { Star, RefreshCw, Trophy, Sparkles, HelpCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { addCoins, formatCoins, getCoins } from "../data/kidsProfile";
import { GameDef } from "../data/gameCatalog";
import { playMatchSuccessSfx, playMismatchSfx, playVictoryFanfareSfx, playCardFlipSfx } from "../utils/gameSfx";

interface OddQuranWordGameProps {
  def: GameDef;
  minSurah?: number;
}

interface QuestionItem {
  id: number;
  question: string;
  category: string;
  options: { text: string; isOdd: boolean; explanation?: string }[];
  hint: string;
}

const QUESTION_BANK: QuestionItem[] = [
  {
    id: 1,
    category: "سور الاستعاذة والتحصين",
    question: "جميع هذه السور هي من سور الاستعاذة والتحصين الشريفة، ما عدا سورة واحدة؟",
    options: [
      { text: "سورة الفلق", isOdd: false },
      { text: "سورة الناس", isOdd: false },
      { text: "سورة الإخلاص", isOdd: false },
      { text: "سورة الشمس", isOdd: true, explanation: "سورة الشمس سورة عظيمة تقسم بمخلوقات الله، وليست من المعوذات." },
    ],
    hint: "تذكر المعوذتين وسورة الإخلاص التي نقرؤها للتحصين كل صباح ومساء!",
  },
  {
    id: 2,
    category: "سورة الفيل المباركة",
    question: "أي كلمة أو وصف مما يلي لا ينتمي إلى قصة سورة الفيل وأصحاب الفيل؟",
    options: [
      { text: "طَيْرًا أَبَابِيلَ", isOdd: false },
      { text: "حِجَارَةٍ مِّن سِجِّيلٍ", isOdd: false },
      { text: "كَعَصْفٍ مَّأْكُولٍ", isOdd: false },
      { text: "نَهْرُ الْكَوْثَرِ", isOdd: true, explanation: "الكوثر نهر في الجنة أُعطي للنبي ﷺ في سورة الكوثر." },
    ],
    hint: "تذكر آيات: ألم تر كيف فعل ربك بأصحاب الفيل!",
  },
  {
    id: 3,
    category: "القسم العظيم في سورة التين",
    question: "أقسم الله تعالى بأشياء مباركة في سورة التين، أي اسم مما يلي لم يُذكر في القسم؟",
    options: [
      { text: "وَالتِّينِ", isOdd: false },
      { text: "وَالزَّيْتُونِ", isOdd: false },
      { text: "وَطُورِ سِينِينَ", isOdd: false },
      { text: "وَالرُّمَّانِ", isOdd: true, explanation: "سورة التين ذكرت التين والزيتون وطور سينين والبلد الأمين." },
    ],
    hint: "اقرأ مطلع السورة: والتين والزيتون وطور سينين!",
  },
  {
    id: 4,
    category: "أخلاق مدحها القرآن الكريم",
    question: "أي صفة أو سلوك مما يلي نهى عنه القرآن الكريم ولم يمدحه؟",
    options: [
      { text: "الصَّبْرُ وَالْإِحْسَانُ", isOdd: false },
      { text: "الْبِرُّ وَالصِّدْقُ", isOdd: false },
      { text: "الْغِيبَةُ وَالتَّنَابُزُ", isOdd: true, explanation: "نهى الله عن الغيبة والتنابز بالألقاب في سورة الحجرات." },
      { text: "الْعَفْوُ وَالتَّقْوَى", isOdd: false },
    ],
    hint: "المؤمن يتحلى بالأخلاق الحسنة ويجتنب ما يؤذي الآخرين.",
  },
  {
    id: 5,
    category: "سورة قريش المباركة",
    question: "أي كلمة أو عبارة مما يلي لا توجد في سورة قريش؟",
    options: [
      { text: "رِحْلَةَ الشِّتَاءِ وَالصَّيْفِ", isOdd: false },
      { text: "أَطْعَمَهُم مِّن جُوعٍ", isOdd: false },
      { text: "وَآمَنَهُم مِّنْ خَوْفٍ", isOdd: false },
      { text: "تَبَّتْ يَدَا", isOdd: true, explanation: "عبارة 'تبت يدا' هي مطلع سورة المسد وليست سورة قريش." },
    ],
    hint: "لإيلاف قريش، إيلافهم رحلة الشتاء والصيف!",
  },
  {
    id: 6,
    category: "سورة القدر المباركة",
    question: "أي وصف مما يلي لا ينتمي إلى ليلة القدر المباركة في سورة القدر؟",
    options: [
      { text: "خَيْرٌ مِّنْ أَلْفِ شَهْرٍ", isOdd: false },
      { text: "تَنَزَّلُ الْمَلَائِكَةُ وَالرُّوحُ", isOdd: false },
      { text: "سَلَامٌ هِيَ حَتَّىٰ مَطْلَعِ الْفَجْرِ", isOdd: false },
      { text: "إِنَّ الْإِنسَانَ لَفِي خُسْرٍ", isOdd: true, explanation: "هذه الآية الكريمة من سورة العصر وليست سورة القدر." },
    ],
    hint: "إنا أنزلناه في ليلة القدر، وما أدراك ما ليلة القدر!",
  },
  {
    id: 7,
    category: "أسماء يوم القيامة في القرآن",
    question: "جميع هذه الأسماء الكريمة هي من أسماء سور يوم القيامة، ما عدا سورة واحدة؟",
    options: [
      { text: "سورة القارعة", isOdd: false },
      { text: "سورة الغاشية", isOdd: false },
      { text: "سورة الزلزلة", isOdd: false },
      { text: "سورة الكوثر", isOdd: true, explanation: "سورة الكوثر سورة بشارة لنبينا بنهر عظيم بالجنة." },
    ],
    hint: "القارعة ما القارعة، هل أتاك حديث الغاشية، إذا زلزلت الأرض!",
  },
  {
    id: 8,
    category: "كلمات سورة الماعون",
    question: "أي خصلة مما يلي حذرت منها سورة الماعون الشريفة؟",
    options: [
      { text: "يَدُعُّ الْيَتِيمَ", isOdd: false },
      { text: "لَا يَحُضُّ عَلَىٰ طَعَامِ الْمِسْكِينِ", isOdd: false },
      { text: "يُرَاءُونَ وَيَمْنَعُونَ الْمَاعُونَ", isOdd: false },
      { text: "فَصَلِّ لِرَبِّكَ وَانْحَرْ", isOdd: true, explanation: "فصل لربك وانحر هي أمر جليل في سورة الكوثر." },
    ],
    hint: "أرأيت الذي يكذب بالدين، فذلك الذي يدع اليتيم!",
  },
];

export default function OddQuranWordGame({ def }: OddQuranWordGameProps) {
  const [shuffledList, setShuffledList] = useState<QuestionItem[]>(() =>
    [...QUESTION_BANK].sort(() => 0.5 - Math.random())
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [coins, setCoins] = useState(getCoins);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showFact, setShowFact] = useState(false);

  const currentQ = shuffledList[currentIndex];
  const isFinished = currentIndex >= shuffledList.length;

  const handleSelect = (idx: number) => {
    if (selectedIdx !== null || isFinished) return;

    playCardFlipSfx();
    setSelectedIdx(idx);
    const chosen = currentQ.options[idx];

    if (chosen.isOdd) {
      playMatchSuccessSfx();
      const newStreak = streak + 1;
      setStreak(newStreak);
      setScore((s) => s + 1);
      const bonus = newStreak >= 3 ? 3 : 2;
      addCoins(bonus);
      setCoins(getCoins());
    } else {
      playMismatchSfx();
      setStreak(0);
    }

    setShowFact(true);
  };

  const handleNext = () => {
    playCardFlipSfx();
    setSelectedIdx(null);
    setShowFact(false);
    if (currentIndex + 1 >= shuffledList.length) {
      playVictoryFanfareSfx();
    }
    setCurrentIndex((i) => i + 1);
  };

  const handleRestart = () => {
    playCardFlipSfx();
    setShuffledList([...QUESTION_BANK].sort(() => 0.5 - Math.random()));
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setSelectedIdx(null);
    setShowFact(false);
  };

  if (isFinished) {
    return (
      <div className="space-y-5 text-center py-8 animate-fade-up max-w-xl mx-auto" dir="rtl">
        <Trophy className="w-20 h-20 mx-auto text-amber-400 drop-shadow-xl animate-bounce" />
        <h3 className="text-2xl sm:text-3xl font-black text-foreground">
          ما شاء الله! عبقري الاكتشاف القرآني 🌟
        </h3>
        <p className="text-base text-muted-foreground font-bold">
          أحسنت يا بطل! حققت {score} إجابة صحيحة في اكتشاف الكلمات المختلفة!
        </p>
        <button
          onClick={handleRestart}
          className="btn-gold mx-auto px-8 py-3.5 rounded-2xl font-black flex items-center gap-2 text-base shadow-xl hover:brightness-105 active:scale-95 transition-all cursor-pointer"
        >
          <RefreshCw className="w-5 h-5" /> العب جولة جديدة
        </button>
      </div>
    );
  }

  const oddOption = currentQ.options.find((o) => o.isOdd);
  const isCorrect = selectedIdx !== null && currentQ.options[selectedIdx].isOdd;

  return (
    <div className="space-y-4 text-center animate-fade-up max-w-xl mx-auto" dir="rtl">
      {/* شريط الإحصائيات العلوي الملكي الموحد */}
      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground px-3.5 py-2.5 bg-secondary/50 backdrop-blur-sm rounded-2xl border border-border/70 shadow-sm">
        <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-black flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <span>السلسلة: {streak} 🔥</span>
        </span>
        <span className="text-amber-500 font-black text-sm flex items-center gap-1 bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30 shadow-inner">
          <Star className="w-4 h-4 fill-amber-500" /> {formatCoins(coins)} نجمة
        </span>
        <span className="text-muted-foreground font-extrabold">
          السؤال {currentIndex + 1} من {shuffledList.length}
        </span>
      </div>

      {/* بطاقة السؤال المعروضة الفاخرة */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-card via-card/95 to-secondary/30 border-2 border-accent/25 shadow-xl space-y-2.5 text-right">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black text-accent uppercase tracking-wider bg-accent/10 px-3 py-1 rounded-full border border-accent/20">
            {currentQ.category}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-accent" /> اختر الكلمة الدخيلة
          </span>
        </div>
        <h2 className="text-lg sm:text-xl font-black text-foreground leading-relaxed pt-1">
          {currentQ.question}
        </h2>
      </div>

      {/* شبكة الخيارات الأربعة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {currentQ.options.map((opt, idx) => {
          let style = "bg-card hover:border-accent/80 border-border text-foreground hover:bg-secondary/40";
          if (selectedIdx !== null) {
            if (opt.isOdd) {
              style = "bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-emerald-500/15 font-black";
            } else if (idx === selectedIdx) {
              style = "bg-red-500/20 border-red-500 text-red-500";
            } else {
              style = "opacity-40 border-border";
            }
          }

          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              disabled={selectedIdx !== null}
              className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 text-right cursor-pointer shadow-sm active:scale-98 ${style}`}
            >
              <span className="text-base sm:text-lg font-bold font-quran flex-1 leading-snug">
                {opt.text}
              </span>
              {selectedIdx !== null && opt.isOdd && (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* بطاقة التوضيح بعد الإجابة */}
      {showFact && (
        <div className="p-4 rounded-3xl bg-secondary/50 border border-border space-y-2.5 animate-in fade-in zoom-in-95 duration-200 text-right">
          <div className="flex items-center gap-2 font-black text-sm">
            {isCorrect ? (
              <span className="text-emerald-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5" /> أحسنت يا بطل! اكتشاف دقيق وصحيح (+نجمتان ⭐)
              </span>
            ) : (
              <span className="text-amber-500 flex items-center gap-1.5">
                <AlertCircle className="w-5 h-5" /> انتبه يا بطل، الكلمة المختلفة هي: «{oddOption?.text}»
              </span>
            )}
          </div>
          {oddOption?.explanation && (
            <p className="text-xs sm:text-sm text-foreground leading-relaxed font-bold">
              💡 {oddOption.explanation}
            </p>
          )}
          <button
            onClick={handleNext}
            className="w-full mt-2 py-3 rounded-2xl bg-accent text-accent-foreground font-black text-sm shadow-md hover:brightness-105 active:scale-98 transition-all cursor-pointer"
          >
            التحدي التالي ←
          </button>
        </div>
      )}
    </div>
  );
}
