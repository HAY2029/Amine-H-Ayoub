import { useState, useEffect } from "react";
import { 
  Trees, 
  Sparkles, 
  Droplets, 
  Trophy, 
  RefreshCw, 
  Star, 
  Lightbulb, 
  CheckCircle2, 
  Flame, 
  ArrowLeft, 
  Info
} from "lucide-react";
import { addCoins, formatCoins, getCoins } from "../data/kidsProfile";
import { GameDef } from "../data/gameCatalog";
import { 
  playCardFlipSfx, 
  playMatchSuccessSfx, 
  playMismatchSfx, 
  playStarCollectSfx, 
  playVictoryFanfareSfx, 
  playComboStreakSfx,
  playWaterSplashSfx 
} from "../utils/gameSfx";

interface QuranOrchardGameProps {
  def: GameDef;
  minSurah?: number;
}

interface WordMeaningItem {
  id: string;
  word: string;
  meaning: string;
  surah: string;
  ayah: string;
  tip?: string;
}

const ORCHARD_WORDS: WordMeaningItem[] = [
  {
    id: "w1",
    word: "الصَّمَدُ",
    meaning: "السَّيِّدُ الَّذِي يُقْصَدُ فِي كُلِّ الْحَوَائِجِ وَلَا يَحْتَاجُ لِأَحَدٍ",
    surah: "سورة الإخلاص",
    ayah: "اللَّهُ الصَّمَدُ",
    tip: "الله الصمد: كل المخلوقات تلجأ إليه وحده وتطلب منه العون."
  },
  {
    id: "w2",
    word: "غَاسِقٍ إِذَا وَقَبَ",
    meaning: "اللَّيْلُ إِذَا أَظْلَمَ وَدَخَلَ ظَلَامُهُ",
    surah: "سورة الفلق",
    ayah: "وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ",
    tip: "نستعيذ بالله من شرور الليل وظلامه حين يحل."
  },
  {
    id: "w3",
    word: "الْفَلَقِ",
    meaning: "الصُّبْحُ وَنُورُ الْفَجْرِ الْمُنْشَقُّ مِنَ الظَّلَامِ",
    surah: "سورة الفلق",
    ayah: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ",
    tip: "رب الفلق: خالق نور الصباح الذي يمحو عتمة الليل."
  },
  {
    id: "w4",
    word: "الْكَوْثَرَ",
    meaning: "الْخَيْرُ الْكَثِيرُ وَنَهْرٌ عَظِيمٌ مُبَارَكٌ فِي الْجَنَّةِ",
    surah: "سورة الكوثر",
    ayah: "إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ",
    tip: "أعطى الله نبينا محمداً ﷺ نهر الكوثر ماؤه أبيض من اللبن وأحلى من العسل."
  },
  {
    id: "w5",
    word: "سِجِّيلٍ",
    meaning: "طِينٌ مُتَحَجِّرٌ شَدِيدُ الصَّلَابَةِ مُحْمًى بِالنَّارِ",
    surah: "سورة الفيل",
    ayah: "تَرْمِيهِم بِحِجَارَةٍ مِّن سِجِّيلٍ",
    tip: "الحجارة التي أهلك الله بها جيش أبرهة لحماية بيته الحرام."
  },
  {
    id: "w6",
    word: "طَيْرًا أَبَابِيلَ",
    meaning: "جَمَاعَاتٍ وَأَفْوَاجًا مِنَ الطَّيْرِ الْمُتَتَابِعَةِ",
    surah: "سورة الفيل",
    ayah: "وَأَرْسَلَ عَلَيْهِمْ طَيْرًا أَبَابِيلَ",
    tip: "أسراب الطيور أرسلها الله للدفاع عن الكعبة المشرفة."
  },
  {
    id: "w7",
    word: "كَعَصْفٍ مَّأْكُولٍ",
    meaning: "كَوَرَقِ الزَّرْعِ الْيَابِسِ الْمُفَتَّتِ الَّذِي دَاسَتْهُ الدَّوَابُّ",
    surah: "سورة الفيل",
    ayah: "فَجَعَلَهُمْ كَعَصْفٍ مَّأْكُولٍ",
    tip: "أصبح جيش الفيل كالعشب الممزق المتطاير."
  },
  {
    id: "w8",
    word: "الْقَارِعَةُ",
    meaning: "الْقِيَامَةُ الَّتِي تَقْرَعُ الْقُلُوبَ وَالْأَسْمَاعَ بِأَهْوَالِهَا",
    surah: "سورة القارعة",
    ayah: "الْقَارِعَةُ مَا الْقَارِعَةُ",
    tip: "اسم من أسماء يوم القيامة ينبه الغافلين للاستعداد بالعمل الصالح."
  },
  {
    id: "w9",
    word: "كَالْعِهْنِ الْمَنفُوشِ",
    meaning: "كَالصُّوفِ الْمَصْبُوغِ الْمَنْتُوفِ الْمُتَطَايِرِ فِي الْهَوَاءِ",
    surah: "سورة القارعة",
    ayah: "وَتَكُونُ الْجِبَالُ كَالْعِهْنِ الْمَنفُوشِ",
    tip: "الجبال القوية الشامخة تصبح خفيفة كالصوف المتطاير يوم القيامة."
  },
  {
    id: "w10",
    word: "هَاوِيَةٌ",
    meaning: "نَارُ جَهَنَّمَ الْعَمِيقَةُ يَهْوِي فِيهَا الْخَاسِرُونَ",
    surah: "سورة القارعة",
    ayah: "فَأُمُّهُ هَاوِيَةٌ وَمَا أَدْرَاكَ مَا هِيَهْ نَارٌ حَامِيَةٌ",
    tip: "المأوى الذي يهوي فيه من لم تثقل موازينه بالحسنات."
  },
  {
    id: "w11",
    word: "حَبْلٌ مِّن مَّسَدٍ",
    meaning: "حَبْلٌ قَوِيٌّ خَشِنٌ مَجْدُولٌ مِنْ لِيفِ النَّارِ",
    surah: "سورة المسد",
    ayah: "فِي جِيدِهَا حَبْلٌ مِّن مَّسَدٍ",
    tip: "جزاء زوجة أبي لهب التي كانت تضع الشوك في طريق النبي ﷺ."
  },
  {
    id: "w12",
    word: "الْمَاعُونَ",
    meaning: "مَا يُعَانُ بِهِ مِثْلُ الْآنِيَةِ وَالْفَأْسِ وَالْمَعْرُوفِ الْقَلِيلِ",
    surah: "سورة الماعون",
    ayah: "وَيَمْنَعُونَ الْمَاعُونَ",
    tip: "حث المسلم على مساعدة الجيران وإعارتهم ما يحتاجونه من أدوات."
  },
  {
    id: "w13",
    word: "أَحْسَنِ تَقْوِيمٍ",
    meaning: "أَعْدَلِ صُورَةٍ وَأَجْمَلِ خِلْقَةٍ وَقَامَةٍ ظَاهِرًا وَبَاطِنًا",
    surah: "سورة التين",
    ayah: "لَقَدْ خَلَقْنَا الْإِنسَانَ فِي أَحْسَنِ تَقْوِيمٍ",
    tip: "كرّم الله الإنسان وميزه بالعقل والجمال ليشكره ويعبده."
  },
  {
    id: "w14",
    word: "لَيْلَةُ الْقَدْرِ",
    meaning: "لَيْلَةُ الشَّرَفِ الْعَظِيمِ الَّتِي أُنْزِلَ فِيهَا الْقُرْآنُ",
    surah: "سورة القدر",
    ayah: "إِنَّا أَنزَلْنَاهُ فِي لَيْلَةِ الْقَدْرِ",
    tip: "ليلة مباركة في شهر رمضان المبارك خير من ألف شهر."
  },
  {
    id: "w15",
    word: "مِثْقَالَ ذَرَّةٍ",
    meaning: "أَصْغَرُ وَأَدَقُّ وَزْنٍ مِثْلَ نَمْلَةٍ صَغِيرَةٍ أَوْ هَبَاءَةٍ",
    surah: "سورة الزلزلة",
    ayah: "فَمَن يَعْمَلْ مِثْقَالَ ذَرَّةٍ خَيْرًا يَرَهُ",
    tip: "لا يضيع عند الله أي عمل صالح مهما كان صغيراً في أعيننا."
  },
  {
    id: "w16",
    word: "وَالْعَادِيَاتِ ضَبْحًا",
    meaning: "الْخَيْلُ السَّرِيعَةُ الَّتِي يُسْمَعُ صَوْتُ نَفَسِهَا عِنْدَ الرَّكْضِ",
    surah: "سورة العاديات",
    ayah: "وَالْعَادِيَاتِ ضَبْحًا",
    tip: "أقسم الله بخيل المجاهدين وهي تركض مسرعة في سبيل الله."
  },
  {
    id: "w17",
    word: "الْخَنَّاسِ",
    meaning: "الشَّيْطَانُ الَّذِي يَخْتَفِي وَيَهْرُبُ عِنْدَ ذِكْرِ اللَّهِ",
    surah: "سورة الناس",
    ayah: "مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ",
    tip: "كلما ذكرت الله وهللت واستغفرت اختفى الشيطان وضعف كيده."
  },
  {
    id: "w18",
    word: "تَسْنِيمٍ",
    meaning: "عَيْنُ مَاءٍ طَهُورٍ فِي الْجَنَّةِ يَشْرَبُ مِنْهَا الْمُقَرَّبُونَ",
    surah: "سورة المطففين",
    ayah: "وَمِزَاجُهُ مِن تَسْنِيمٍ",
    tip: "أشرف شراب في الجنة وأعلاه منزلة للمؤمنين الأبرار."
  }
];

function shuffleArray<T>(arr: T[]): T[] {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

export default function QuranOrchardGame({ def: _def }: QuranOrchardGameProps) {
  const [shuffledList, setShuffledList] = useState<WordMeaningItem[]>(() =>
    shuffleArray(ORCHARD_WORDS)
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(getCoins);
  const [streak, setStreak] = useState(0);
  const [growth, setGrowth] = useState(20);

  // الخيارات المعروضة للسؤال الحالي (3 خيارات: 1 صحيح + 2 عشوائي)
  const [options, setOptions] = useState<string[]>([]);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isWatering, setIsWatering] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const handleCoins = () => setCoins(getCoins());
    window.addEventListener("mushaf:coins", handleCoins);
    return () => window.removeEventListener("mushaf:coins", handleCoins);
  }, []);

  const currentItem = shuffledList[currentIdx % shuffledList.length];

  // توليد الخيارات عند تغير الكلمة
  useEffect(() => {
    if (!currentItem) return;
    const distractors = ORCHARD_WORDS.filter((w) => w.id !== currentItem.id)
      .map((w) => w.meaning)
      .sort(() => 0.5 - Math.random())
      .slice(0, 2);

    setOptions(shuffleArray([currentItem.meaning, ...distractors]));
    setSelectedOpt(null);
    setAnswered(false);
    setIsWatering(false);
    setShowHint(false);
  }, [currentIdx, currentItem]);

  // معالجة اختيار السلة
  const handleSelectOption = (opt: string) => {
    if (answered) return;
    setSelectedOpt(opt);
    setAnswered(true);

    const isCorrect = opt === currentItem.meaning;
    if (isCorrect) {
      playMatchSuccessSfx();
      playWaterSplashSfx();
      setIsWatering(true);
      const newStreak = streak + 1;
      setStreak(newStreak);
      playComboStreakSfx(newStreak);
      const bonus = newStreak >= 3 ? 3 : 2;
      setScore((s) => s + bonus);
      addCoins(bonus);
      setGrowth((g) => Math.min(100, g + 8));
      playStarCollectSfx();
    } else {
      playMismatchSfx();
      setStreak(0);
    }
  };

  const nextWord = () => {
    playCardFlipSfx();
    setCurrentIdx((i) => i + 1);
  };

  const isFinished = currentIdx >= shuffledList.length;

  if (isFinished) {
    return (
      <div className="space-y-4 text-center py-6 animate-fade-up max-w-xl mx-auto" dir="rtl">
        <Trophy className="w-16 h-16 mx-auto text-amber-400 drop-shadow-lg animate-bounce" />
        <h3 className="text-xl sm:text-2xl font-black text-foreground">
          ما شاء الله! سقيت البستان القرآني واكتمل بنجاح 🌟
        </h3>
        <p className="text-sm text-muted-foreground font-bold">
          جمعت {score} نجمة مباركة في تدبر وفهم معاني كلام الله
        </p>
        <button
          onClick={() => {
            setShuffledList(shuffleArray(ORCHARD_WORDS));
            setCurrentIdx(0);
            setScore(0);
            setStreak(0);
            setGrowth(20);
          }}
          className="btn-gold mx-auto px-7 py-3 rounded-2xl font-black flex items-center gap-2 text-base shadow-xl hover:brightness-105 active:scale-95 transition-all"
        >
          <RefreshCw className="w-5 h-5" /> اسقِ بستاناً جديداً
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center animate-fade-up max-w-xl mx-auto" dir="rtl">
      
      {/* ── شريط الإحصائيات العلوي الملكي الموحد (نفس نمط الألعاب الحالية) ── */}
      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground px-3.5 py-2 bg-secondary/50 backdrop-blur-sm rounded-2xl border border-border/70 shadow-sm">
        <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-black flex items-center gap-1">
          <Trees className="w-3.5 h-3.5" />
          <span>{currentItem.surah}</span>
        </span>

        {/* مؤشر سقاية ونمو الشجرة */}
        <span className="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 px-2.5 py-1 rounded-full font-black flex items-center gap-1">
          <Droplets className="w-3.5 h-3.5 text-cyan-500 animate-pulse" />
          <span>نمو البستان {growth}%</span>
        </span>

        <span className="text-amber-500 font-black text-sm flex items-center gap-1 bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30 shadow-inner">
          <Star className="w-4 h-4 fill-amber-500" /> {formatCoins(coins)} نجمة
        </span>

        <span className="text-muted-foreground font-extrabold hidden sm:inline">
          الكلمة {currentIdx + 1} من {shuffledList.length}
        </span>
      </div>

      {/* ── شارة السلسلة المتتالية ── */}
      {streak >= 2 && (
        <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 text-amber-500 border border-amber-500/30 px-3.5 py-1 rounded-full text-xs font-black animate-bounce shadow-sm">
          <Sparkles className="w-4 h-4 text-amber-500" /> إتقان قرآني متميز {streak}× على التوالي!
        </div>
      )}

      {/* ── بطاقة الشجرة القرآنية وثمرة الكلمة (النمط الملكي الموحد) ── */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-card via-card/95 to-secondary/30 border-2 border-accent/25 shadow-xl space-y-3 text-right relative overflow-hidden">
        
        {/* خلفية الشجرة برسم ناعم */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-black text-accent uppercase tracking-wider flex items-center gap-1.5">
            <Trees className="w-4 h-4 text-emerald-500" />
            <span>ثمرة الكلمة القرآنية:</span>
          </p>
          <span className="text-[10px] font-bold text-muted-foreground">
            اختر السلة المطابقة لمعنى الكلمة
          </span>
        </div>

        {/* عرض الكلمة في ثمرة ذهبية فاخرة متألقة في الشجرة */}
        <div className="py-5 px-3 flex flex-col items-center justify-center relative">
          
          {/* تأثير قطرات ماء السقاية */}
          {isWatering && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <span className="text-3xl animate-bounce">💧🌱</span>
            </div>
          )}

          <div className="relative group">
            <div className="w-36 sm:w-44 h-24 sm:h-28 rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 p-1 shadow-xl shadow-emerald-500/20 flex flex-col items-center justify-center text-white ring-4 ring-emerald-400/30">
              {/* غصن الثمرة */}
              <div className="w-2 h-4 bg-amber-900 rounded-t-full -mt-2" />
              <span className="font-extrabold text-2xl sm:text-3xl drop-shadow-md px-2 text-center">
                {currentItem.word}
              </span>
              <span className="text-[11px] text-emerald-100 font-bold opacity-90 mt-1">
                {currentItem.ayah}
              </span>
            </div>
          </div>
        </div>

        {/* شريط السقاية الأخضر */}
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border/50">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
            style={{ width: `${growth}%` }}
          />
        </div>
      </div>

      {/* ── سلال المعاني الخشبية بنمط بطاقات الخيارات الأصلية ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-bold text-muted-foreground">
            🧺 اختر السلة التي تحمل المعنى الصحيح:
          </p>
          {!showHint && (
            <button
              onClick={() => setShowHint(true)}
              className="text-[11px] font-extrabold text-accent hover:underline flex items-center gap-1"
            >
              <Lightbulb className="w-3.5 h-3.5" /> تلميح
            </button>
          )}
        </div>

        {showHint && currentItem.tip && (
          <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-500 flex items-center gap-1.5 animate-fade-in text-right">
            <Info className="w-4 h-4 shrink-0" />
            <span>{currentItem.tip}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5">
          {options.map((opt, i) => {
            const isSelected = selectedOpt === opt;
            const isCorrect = opt === currentItem.meaning;

            let cardStyle = "bg-secondary/70 border-border hover:border-accent/60 text-foreground hover:bg-secondary";
            if (answered) {
              if (isCorrect) {
                cardStyle = "bg-gradient-to-br from-emerald-600/30 to-emerald-800/40 border-emerald-500 text-emerald-300 font-black shadow-lg shadow-emerald-500/20 scale-[1.01]";
              } else if (isSelected) {
                cardStyle = "bg-rose-500/25 border-rose-500 text-rose-300 line-through";
              } else {
                cardStyle = "bg-secondary/30 border-border/40 text-muted-foreground opacity-50";
              }
            }

            return (
              <button
                key={i}
                disabled={answered}
                onClick={() => handleSelectOption(opt)}
                className={`p-4 rounded-2xl border-2 flex items-center justify-between gap-3 text-right transition-all duration-200 active:scale-[0.99] cursor-pointer shadow-sm ${cardStyle}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-card border border-border/60 flex items-center justify-center shrink-0 text-xs font-black text-accent">
                    {i + 1}
                  </span>
                  <span className="text-xs sm:text-sm font-bold leading-relaxed">{opt}</span>
                </div>

                {answered && isCorrect && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── بطاقة النجاح وانتقال الكلمة (نفس النمط الموحد لبقية الألعاب) ── */}
      {answered && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-emerald-950/80 via-emerald-900/60 to-card border-2 border-emerald-500/50 shadow-2xl space-y-2.5 animate-fade-up text-center">
          <div className="flex items-center justify-center gap-2 font-black text-emerald-400 text-base sm:text-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 animate-bounce" />
            <span>
              {selectedOpt === currentItem.meaning
                ? `أحسنت! سقيت الشجرة بمعرفة «${currentItem.word}» 🌟`
                : `المعنى الصحيح لـ «${currentItem.word}» هو: ${currentItem.meaning}`}
            </span>
          </div>

          <p className="text-xs text-emerald-200/90 font-medium">
            في قوله تعالى: <b className="text-white font-bold">{currentItem.ayah}</b> ({currentItem.surah})
          </p>

          <button
            onClick={nextWord}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-black text-sm sm:text-base shadow-lg hover:brightness-105 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2"
          >
            <span>الكلمة التالية في البستان 🌱</span>
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      )}

    </div>
  );
}
