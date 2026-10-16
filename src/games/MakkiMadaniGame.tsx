import { useState, useMemo } from "react";
import { Star, RefreshCw, Trophy, Sparkles, Building2, Landmark, CheckCircle2, AlertCircle } from "lucide-react";
import { addCoins, formatCoins, getCoins } from "../data/kidsProfile";
import { GameDef } from "../data/gameCatalog";
import { playMatchSuccessSfx, playMismatchSfx, playVictoryFanfareSfx, playCardFlipSfx } from "../utils/gameSfx";

interface MakkiMadaniGameProps {
  def: GameDef;
  minSurah?: number;
}

interface SurahItem {
  id: number;
  name: string;
  type: "makki" | "madani";
  ayahCount: number;
  orderNum: number;
  fact: string;
}

const SURAH_BANK: SurahItem[] = [
  { id: 1, name: "سورة الفاتحة", type: "makki", ayahCount: 7, orderNum: 1, fact: "أم الكتاب والسبع المثاني، نزلت بمكة وتُقرأ في كل ركعة!" },
  { id: 114, name: "سورة الناس", type: "makki", ayahCount: 6, orderNum: 114, fact: "سورة الاستعاذة العظيمة، نزلت بمكة وتعلّمنا اللجوء لرب الناس من الوسواس." },
  { id: 113, name: "سورة الفلق", type: "makki", ayahCount: 5, orderNum: 113, fact: "سورة التحصين بنور الصباح واللجوء لرب الفلق من شر كل ذي شر." },
  { id: 112, name: "سورة الإخلاص", type: "makki", ayahCount: 4, orderNum: 112, fact: "تعدل ثلث القرآن الكريم، وتؤكد توحيد الله الأحد الصمد." },
  { id: 111, name: "سورة المسد", type: "makki", ayahCount: 5, orderNum: 111, fact: "نزلت بمكة تبين خسران أبي لهب وعداوته للحق." },
  { id: 110, name: "سورة النصر", type: "madani", ayahCount: 3, orderNum: 110, fact: "سورة مدنية عظيمة بشرت بفتح مكة ودخول الناس في دين الله أفواجاً." },
  { id: 109, name: "سورة الكافرون", type: "makki", ayahCount: 6, orderNum: 109, fact: "سورة البراءة من الشرك وتثبيت عقيدة التوحيد الصافية." },
  { id: 108, name: "سورة الكوثر", type: "makki", ayahCount: 3, orderNum: 108, fact: "أقصر سور القرآن الكريم، وتعد النبي ﷺ بنهر الخير العظيم بالجنة." },
  { id: 107, name: "سورة الماعون", type: "makki", ayahCount: 7, orderNum: 107, fact: "تحث على إطعام المسكين ومساعدة اليتيم والنهي عن الرياء." },
  { id: 106, name: "سورة قريش", type: "makki", ayahCount: 4, orderNum: 106, fact: "تذكر نعم الله بالأمن وإطعامهم في رحلتي الشتاء والصيف." },
  { id: 105, name: "سورة الفيل", type: "makki", ayahCount: 5, orderNum: 105, fact: "قصة معجزة طير الأبابيل وحماية بيت الله الحرام من جيش أبرهة." },
  { id: 103, name: "سورة العصر", type: "makki", ayahCount: 3, orderNum: 103, fact: "قسم عظيم بقيمة الوقت وأهمية الإيمان والعمل الصالح والتواصي بالحق." },
  { id: 99, name: "سورة الزلزلة", type: "madani", ayahCount: 8, orderNum: 99, fact: "سورة مدنية جليلة تبين موازين الحساب الدقيقة حتى مثقال الذرة." },
  { id: 98, name: "سورة البينة", type: "madani", ayahCount: 8, orderNum: 98, fact: "سورة مدنية تتحدث عن رسالة النبي بالقرآن القيّم والبينة الواضحة." },
  { id: 97, name: "سورة القدر", type: "makki", ayahCount: 5, orderNum: 97, fact: "فضل الليلة المباركة التي أنزل فيها القرآن وخيرها من ألف شهر." },
  { id: 95, name: "سورة التين", type: "makki", ayahCount: 8, orderNum: 95, fact: "قسم بالتين والزيتون وطور سينين والبلد الأمين وخلق الإنسان بأحسن تقويم." },
  { id: 94, name: "سورة الشرح", type: "makki", ayahCount: 8, orderNum: 94, fact: "بشارة للمؤمنين: إن مع العسر يسراً، وتخفيف الأعباء." },
  { id: 93, name: "سورة الضحى", type: "makki", ayahCount: 11, orderNum: 93, fact: "رحمة الله بنبيه: ما ودعك ربك وما قلى وللآخرة خير لك من الأولى." },
  { id: 89, name: "سورة الفجر", type: "makki", ayahCount: 30, orderNum: 89, fact: "قسم عظيم بالفجر وليال عشر وختام بالنداء للروح المطمئنة لدخول الجنة." },
  { id: 67, name: "سورة الملك", type: "makki", ayahCount: 30, orderNum: 67, fact: "المانعة المنجية من عذاب القبر، تبارك الذي بيده الملك وهو على كل شيء قدير." },
  { id: 2, name: "سورة البقرة", type: "madani", ayahCount: 286, orderNum: 2, fact: "أطول سور القرآن، نزلت بالمدينة المنورة وفيها أعظم آية: آية الكرسي." },
];

export default function MakkiMadaniGame({ def }: MakkiMadaniGameProps) {
  const [shuffledList, setShuffledList] = useState<SurahItem[]>(() =>
    [...SURAH_BANK].sort(() => 0.5 - Math.random())
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [coins, setCoins] = useState(getCoins);
  const [selectedAnswer, setSelectedAnswer] = useState<"makki" | "madani" | null>(null);
  const [showFact, setShowFact] = useState(false);

  const currentSurah = shuffledList[currentIndex];
  const isFinished = currentIndex >= shuffledList.length;

  const handleChoice = (choice: "makki" | "madani") => {
    if (selectedAnswer !== null || isFinished) return;

    playCardFlipSfx();
    setSelectedAnswer(choice);
    const isCorrect = choice === currentSurah.type;

    if (isCorrect) {
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
    setSelectedAnswer(null);
    setShowFact(false);
    if (currentIndex + 1 >= shuffledList.length) {
      playVictoryFanfareSfx();
    }
    setCurrentIndex((i) => i + 1);
  };

  const handleRestart = () => {
    playCardFlipSfx();
    setShuffledList([...SURAH_BANK].sort(() => 0.5 - Math.random()));
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setSelectedAnswer(null);
    setShowFact(false);
  };

  if (isFinished) {
    return (
      <div className="space-y-5 text-center py-8 animate-fade-up max-w-xl mx-auto" dir="rtl">
        <Trophy className="w-20 h-20 mx-auto text-amber-400 drop-shadow-xl animate-bounce" />
        <h3 className="text-2xl sm:text-3xl font-black text-foreground">
          ما شاء الله! بطل عارف بالسور المكية والمدنية 🌟
        </h3>
        <p className="text-base text-muted-foreground font-bold">
          أحسنت يا بطل! حققت {score} إجابة صحيحة من أصل {shuffledList.length}
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

  const isCorrect = selectedAnswer === currentSurah.type;

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
          السورة {currentIndex + 1} من {shuffledList.length}
        </span>
      </div>

      {/* بطاقة السورة المعروضة الفاخرة */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-card via-card/95 to-secondary/30 border-2 border-accent/25 shadow-xl space-y-3">
        <span className="text-xs font-bold text-accent px-3 py-1 bg-accent/10 rounded-full border border-accent/20">
          رقم السورة في المصحف: ({currentSurah.orderNum}) • عدد الآيات: {currentSurah.ayahCount}
        </span>
        <h2 className="text-3xl sm:text-4xl font-black text-foreground drop-shadow-sm font-quran py-1">
          {currentSurah.name}
        </h2>
        <p className="text-sm font-bold text-muted-foreground">
          أين نزلت هذه السورة المباركة؟ اختر مكان النزول الصحيح:
        </p>
      </div>

      {/* خيارا الاختيار: مكي أم مدني */}
      <div className="grid grid-cols-2 gap-3.5 sm:gap-5 pt-1">
        {/* زر سورة مكية */}
        <button
          onClick={() => handleChoice("makki")}
          disabled={selectedAnswer !== null}
          className={`p-4 sm:p-5 rounded-3xl border-2 transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer shadow-lg active:scale-95 ${
            selectedAnswer === null
              ? "bg-gradient-to-br from-amber-500/10 via-card to-amber-500/5 hover:border-amber-400/80 border-amber-500/30 text-foreground hover:shadow-amber-500/10"
              : selectedAnswer === "makki"
              ? isCorrect
                ? "bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-emerald-500/20"
                : "bg-red-500/20 border-red-500 text-red-500"
              : currentSurah.type === "makki"
              ? "bg-emerald-500/15 border-emerald-500/70 text-emerald-500"
              : "opacity-40 border-border"
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shadow-inner">
            <Building2 className="w-8 h-8" />
          </div>
          <span className="text-lg sm:text-xl font-black">🕋 سورة مكيّة</span>
          <span className="text-[11px] font-medium text-muted-foreground">نزلت بمكة المكرمة</span>
        </button>

        {/* زر سورة مدنية */}
        <button
          onClick={() => handleChoice("madani")}
          disabled={selectedAnswer !== null}
          className={`p-4 sm:p-5 rounded-3xl border-2 transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer shadow-lg active:scale-95 ${
            selectedAnswer === null
              ? "bg-gradient-to-br from-emerald-500/10 via-card to-emerald-500/5 hover:border-emerald-400/80 border-emerald-500/30 text-foreground hover:shadow-emerald-500/10"
              : selectedAnswer === "madani"
              ? isCorrect
                ? "bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-emerald-500/20"
                : "bg-red-500/20 border-red-500 text-red-500"
              : currentSurah.type === "madani"
              ? "bg-emerald-500/15 border-emerald-500/70 text-emerald-500"
              : "opacity-40 border-border"
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shadow-inner">
            <Landmark className="w-8 h-8" />
          </div>
          <span className="text-lg sm:text-xl font-black">🕌 سورة مدنيّة</span>
          <span className="text-[11px] font-medium text-muted-foreground">نزلت بالمدينة المنورة</span>
        </button>
      </div>

      {/* بطاقة المعلومة الإثرائية بعد الإجابة */}
      {showFact && (
        <div className="p-4 rounded-3xl bg-secondary/50 border border-border space-y-2.5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-center gap-2 font-black text-sm">
            {isCorrect ? (
              <span className="text-emerald-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5" /> إجابة صحيحة يا بطل! (+نجمتان ⭐)
              </span>
            ) : (
              <span className="text-amber-500 flex items-center gap-1.5">
                <AlertCircle className="w-5 h-5" /> معلومة مفيدة للمرة القادمة
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-foreground leading-relaxed font-bold">
            {currentSurah.fact}
          </p>
          <button
            onClick={handleNext}
            className="w-full mt-2 py-3 rounded-2xl bg-accent text-accent-foreground font-black text-sm shadow-md hover:brightness-105 active:scale-98 transition-all cursor-pointer"
          >
            السورة التالية ←
          </button>
        </div>
      )}
    </div>
  );
}
