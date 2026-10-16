import React, { useState, useEffect } from 'react';
import { ArrowRight, Trophy, Sparkles } from 'lucide-react';
import { addCoins } from '../data/kidsProfile';
import { toast } from '../hooks/use-toast';
import { playCardFlipSfx, playMatchSuccessSfx, playMismatchSfx, playVictoryFanfareSfx } from '../utils/gameSfx';

interface CardData {
  id: number;
  type: 'surah' | 'meaning';
  text: string;
}

// بنك معاني وقصص السور — يتم اختيار مجموعة عشوائية منها في كل لعبة
const ALL_SURAH_PAIRS = [
  { id: 1, surah: 'سورة الفاتحة', meaning: '🤲 أم الكتاب والسبع المثاني' },
  { id: 2, surah: 'سورة الناس', meaning: '🛡️ الاستعاذة من الوسواس' },
  { id: 3, surah: 'سورة الفلق', meaning: '🌅 الاستعاذة من شر ما خلق' },
  { id: 4, surah: 'سورة الإخلاص', meaning: '☝️ قل هو الله أحد' },
  { id: 5, surah: 'سورة المسد', meaning: '🔥 هلاك أبي لهب' },
  { id: 6, surah: 'سورة النصر', meaning: '🏆 فتح مكة ودخول الناس في الدين' },
  { id: 7, surah: 'سورة الكافرون', meaning: '⚖️ لكم دينكم ولي دين' },
  { id: 8, surah: 'سورة الكوثر', meaning: '🌊 نهر الخير في الجنة' },
  { id: 9, surah: 'سورة الماعون', meaning: '🍲 إطعام المسكين ومساعدة المحتاج' },
  { id: 10, surah: 'سورة قريش', meaning: '🐪 رحلة الشتاء والصيف' },
  { id: 11, surah: 'سورة الفيل', meaning: '🐘 قصة أبرهة وجيش الفيل' },
  { id: 12, surah: 'سورة الهمزة', meaning: '🚫 النهي عن الغيبة واللمز' },
  { id: 13, surah: 'سورة العصر', meaning: '⏳ قيمة الوقت والعمل الصالح' },
  { id: 14, surah: 'سورة التكاثر', meaning: '💰 التنافس في جمع الأموال' },
  { id: 15, surah: 'سورة القارعة', meaning: '🔔 أهوال يوم القيامة والموازين' },
  { id: 16, surah: 'سورة العاديات', meaning: '🐎 الخيل التي تعدو سريعاً' },
  { id: 17, surah: 'سورة الزلزلة', meaning: '🌍 إذا زلزلت الأرض زلزالها' },
  { id: 18, surah: 'سورة القدر', meaning: '✨ ليلة مباركة خير من ألف شهر' },
  { id: 19, surah: 'سورة العلق', meaning: '📖 اقرأ باسم ربك الذي خلق' },
  { id: 20, surah: 'سورة التين', meaning: '🌳 والتين والزيتون وطور سينين' },
  { id: 21, surah: 'سورة الشرح', meaning: '💖 ألم نشرح لك صدرك' },
  { id: 22, surah: 'سورة الضحى', meaning: '☀️ ما ودعك ربك وما قلى' },
  { id: 23, surah: 'سورة الليل', meaning: '🌙 والليل إذا يغشى والنهار إذا تجلى' },
  { id: 24, surah: 'سورة الشمس', meaning: '🌞 والشمس وضحاها والقمر إذا تلاها' },
  { id: 25, surah: 'سورة البلد', meaning: '🏙️ القسم بمكة المكرمة' },
  { id: 26, surah: 'سورة الفجر', meaning: '⭐ والفجر وليال عشر' },
  { id: 27, surah: 'سورة الغاشية', meaning: '☁️ هل أتاك حديث الغاشية' },
  { id: 28, surah: 'سورة الأعلى', meaning: '🌿 سبح اسم ربك الأعلى' },
  { id: 29, surah: 'سورة الطارق', meaning: '🌠 والسماء والطارق والنجم الثاقب' },
  { id: 30, surah: 'سورة البروج', meaning: '🌌 قصة أصحاب الأخدود' },
];

interface MemoryGameProps {
  onBack: () => void;
  def?: GameDef;
  minSurah?: number;
}

import { createPortal } from 'react-dom';
import { GameDef } from '../data/gameCatalog';

export default function MemoryGame({ onBack, def, minSurah }: MemoryGameProps) {
  const [cards, setCards] = useState<(CardData & { isFlipped: boolean, isMatched: boolean })[]>([]);
  const [firstCardIndex, setFirstCardIndex] = useState<number | null>(null);
  const [lockBoard, setLockBoard] = useState(false);
  const [matches, setMatches] = useState(0);
  const [totalPairs, setTotalPairs] = useState(4);
  const [won, setWon] = useState(false);

  useEffect(() => {
    initGame();
  }, []);

  const initGame = () => {
    const numPairs = 4;
    setTotalPairs(numPairs);

    const list = ALL_SURAH_PAIRS;
    // نبدأ بمطابقة السورة المختارة + أزواجها المتجاورة (المتشابهات) إن وُجدت
    let start = 0;
    if (minSurah) {
      const chosenIdx = list.findIndex(p => p.surah.includes(String(minSurah)) || String(minSurah) === p.surah.replace(/\D/g, ""));
      // إيجاد أفضل عنصر قريب للسورة المختارة بالأرقام إن توفر
      const nums = list.map(p => Number((p.surah.match(/\d+/) || [])[0]) || 0);
      let best = nums.findIndex(n => n === minSurah);
      if (best < 0) {
        // أقرب رقم
        best = nums.reduce((acc, n, i) => Math.abs(n - minSurah) < Math.abs(nums[acc] - minSurah) ? i : acc, 0);
      }
      if (best >= 0) start = Math.max(0, Math.min(best, list.length - numPairs));
    }
    const selected = list.slice(start, start + numPairs);

    const generatedCards: CardData[] = [];
    selected.forEach(item => {
      generatedCards.push({ id: item.id, type: 'surah', text: item.surah });
      generatedCards.push({ id: item.id, type: 'meaning', text: item.meaning });
    });

    const shuffledCards = generatedCards
      .sort(() => 0.5 - Math.random())
      .map(c => ({ ...c, isFlipped: false, isMatched: false }));

    setCards(shuffledCards);
    setFirstCardIndex(null);
    setLockBoard(false);
    setMatches(0);
    setWon(false);
  };

  const handleCardClick = (index: number) => {
    if (lockBoard) return;
    if (cards[index].isFlipped || cards[index].isMatched) return;
    if (firstCardIndex === index) return;

    playCardFlipSfx();
    const newCards = [...cards];
    newCards[index].isFlipped = true;
    setCards(newCards);

    if (firstCardIndex === null) {
      setFirstCardIndex(index);
      return;
    }

    setLockBoard(true);
    checkForMatch(index);
  };

  const checkForMatch = (secondCardIndex: number) => {
    const firstCard = cards[firstCardIndex!];
    const secondCard = cards[secondCardIndex];

    if (firstCard.id === secondCard.id && firstCard.type !== secondCard.type) {
      // Match found - تطابق صحيح
      playMatchSuccessSfx();
      setTimeout(() => {
        const newCards = [...cards];
        newCards[firstCardIndex!].isMatched = true;
        newCards[secondCardIndex].isMatched = true;
        setCards(newCards);
        setFirstCardIndex(null);
        setLockBoard(false);
        const newMatches = matches + 1;
        setMatches(newMatches);

        if (newMatches === totalPairs) {
          handleWin();
        }
      }, 500);
    } else {
      // No match - إرجاع البطاقات لوضعها الأصلي
      playMismatchSfx();
      setTimeout(() => {
        const newCards = [...cards];
        newCards[firstCardIndex!].isFlipped = false;
        newCards[secondCardIndex].isFlipped = false;
        setCards(newCards);
        setFirstCardIndex(null);
        setLockBoard(false);
      }, 900);
    }
  };

  const handleWin = () => {
    setWon(true);
    playVictoryFanfareSfx();
    addCoins(2); // مكافأة
    toast({
      title: "🎉 رائع! طابقت كل السور",
      description: "حصلت على نجوم تشجيعية!",
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4 font-quran text-right" dir="rtl">
      <div className="w-full max-w-3xl bg-gradient-to-br from-card via-card to-secondary/30 rounded-3xl shadow-2xl overflow-hidden border-2 border-border flex flex-col h-[90vh] sm:h-[80vh]">
        {/* Header */}
        <div className="bg-secondary/40 p-4 flex items-center justify-between border-b border-border shrink-0">
          <h2 className="text-sm sm:text-xl font-bold text-foreground flex items-center gap-1 sm:gap-2">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
            <span className="hidden sm:inline">لعبة الذاكرة: السورة ومعناها</span>
            <span className="sm:hidden">الذاكرة</span>
          </h2>
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={onBack}
              className="p-1.5 sm:p-2 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
            >
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Game Area */}
        <div className="p-3 sm:p-6">
          {won ? (
            <div className="text-center py-6 sm:py-12 space-y-4 sm:space-y-6">
              <Trophy className="w-16 h-16 sm:w-24 sm:h-24 text-accent mx-auto animate-bounce" />
              <h3 className="text-xl sm:text-3xl font-extrabold text-foreground">أحسنت بطل القرآن!</h3>
              <p className="text-muted-foreground text-sm sm:text-lg">لقد طابقت كل السور بمعانيها بنجاح 👏</p>
              <p className="text-accent font-bold text-base sm:text-lg">+10 نجوم ⭐</p>
              <button 
                onClick={initGame}
                className="mt-4 sm:mt-6 px-6 sm:px-8 py-2 sm:py-3 bg-accent text-accent-foreground font-bold rounded-xl shadow-lg hover:shadow-xl hover:bg-accent/90 transition-all active:scale-95 text-sm sm:text-base"
              >
                العب مرة أخرى
              </button>
            </div>
          ) : (
            <>
              {/* شبكة البطاقات المتجاوبة */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
                {cards.map((card, index) => (
                  <button
                    key={index}
                    onClick={() => handleCardClick(index)}
                    disabled={lockBoard || card.isMatched}
                    className={`aspect-square min-h-[60px] sm:min-h-[100px] rounded-2xl text-xs sm:text-base font-black transition-all duration-300 border-2 shadow-sm ${
                      card.isFlipped || card.isMatched 
                        ? 'bg-gradient-to-br from-card via-card to-accent/10 border-accent/80 text-foreground shadow-lg' 
                        : 'bg-emerald-950 text-transparent border-amber-400/30 hover:border-amber-400/80 hover:shadow-amber-500/15'
                    } ${card.isMatched ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500 scale-95 opacity-80' : ''} ${lockBoard ? 'cursor-not-allowed' : 'active:scale-95'}`}
                  >
                    <div className={`w-full h-full flex flex-col items-center justify-center p-1 sm:p-2 text-center break-words leading-tight transition-opacity duration-300 ${card.isFlipped || card.isMatched ? 'opacity-100' : 'opacity-0'}`}>
                      <span className="line-clamp-2 sm:line-clamp-3">{card.text}</span>
                    </div>
                  </button>
                ))}
              </div>
              {/* معلومات اللعبة */}
              <div className="mt-3 sm:mt-6 flex justify-between items-center text-xs sm:text-sm font-bold text-muted-foreground">
                <span>المطابقات: {matches} / {totalPairs}</span>
                <button onClick={initGame} className="text-accent hover:underline">إعادة الترتيب</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
