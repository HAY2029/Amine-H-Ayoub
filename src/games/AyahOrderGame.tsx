import React, { useState, useEffect } from 'react';
import { ArrowRight, Trophy, Sparkles, ListOrdered } from 'lucide-react';
import { addCoins } from '../data/kidsProfile';
import { toast } from '../hooks/use-toast';
import { ensureCorpus, SurahText } from '../data/quranText';
import { GameDef } from '../data/gameCatalog';
import { createPortal } from 'react-dom';
import { playCardFlipSfx, playMatchSuccessSfx, playMismatchSfx, playVictoryFanfareSfx } from '../utils/gameSfx';

interface AyahOrderGameProps {
  def: GameDef;
  minSurah?: number;
  onBack: () => void;
}

interface GameRound {
  surahName: string;
  ayahs: { n: number; text: string; id: string }[];
  shuffled: { n: number; text: string; id: string }[];
}

export default function AyahOrderGame({ def, minSurah, onBack }: AyahOrderGameProps) {
  const [corpus, setCorpus] = useState<SurahText[]>([]);
  const [rounds, setRounds] = useState<GameRound[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // The ayahs the user has selected in order
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  // Is the current selection being evaluated?
  const [evaluating, setEvaluating] = useState(false);

  const REQUIRED_SCORE = 3;

  useEffect(() => {
    loadCorpus();
  }, []);

  const loadCorpus = async () => {
    const data = await ensureCorpus();
    setCorpus(data);
    generateRounds(data);
    setLoading(false);
  };

  const generateRounds = (data: SurahText[]) => {
    const minS = minSurah || def.params?.minSurah || 1;
    
    // تصفية السور المناسبة والتي تحتوي على 3 آيات على الأقل
    let allowedSurahs = data.filter(s => s.app >= minS && s.ayahs && s.ayahs.length >= 3);
    if (allowedSurahs.length === 0) allowedSurahs = data.filter(s => s.ayahs && s.ayahs.length >= 3);
    if (allowedSurahs.length === 0) allowedSurahs = [data[0]];

    // خلط السور لاختيار سور مختلفة تماماً لكل جولة
    const shuffledSurahs = [...allowedSurahs].sort(() => 0.5 - Math.random());
    const selectedSurahs = shuffledSurahs.slice(0, 5);

    const generated: GameRound[] = [];
    const numAyahs = def.ageMin >= 8 ? 4 : 3;

    for (const s of selectedSurahs) {
      const maxStartIndex = s.ayahs.length - numAyahs;
      const startIndex = maxStartIndex > 0 ? Math.floor(Math.random() * (maxStartIndex + 1)) : 0;
      
      const sequence = s.ayahs.slice(startIndex, startIndex + numAyahs).map(a => ({
        ...a,
        id: `s${s.app}-a${a.n}`
      }));
      
      // خلط الآيات والتأكد من أنها ليست مرتبة بالصدفة
      let shuffled = [...sequence].sort(() => 0.5 - Math.random());
      let shuffleTries = 0;
      while (shuffled.every((a, idx) => a.id === sequence[idx].id) && sequence.length > 1 && shuffleTries < 10) {
        shuffled = [...sequence].sort(() => 0.5 - Math.random());
        shuffleTries++;
      }
      
      generated.push({
        surahName: s.name,
        ayahs: sequence,
        shuffled
      });
    }
    
    setRounds(generated);
    setCurrentIndex(0);
    setScore(0);
    setWon(false);
    setSelectedOrder([]);
    setEvaluating(false);
  };

  const handleAyahTap = (id: string) => {
    if (evaluating || selectedOrder.includes(id)) return;
    
    playCardFlipSfx();
    const currentRound = rounds[currentIndex];
    const newSelection = [...selectedOrder, id];
    setSelectedOrder(newSelection);
    
    // Check if the current selection is correct so far
    for (let i = 0; i < newSelection.length; i++) {
      if (newSelection[i] !== currentRound.ayahs[i].id) {
        // Mistake!
        playMismatchSfx();
        setEvaluating(true);
        setTimeout(() => {
          setSelectedOrder([]);
          setEvaluating(false);
        }, 1000);
        return;
      }
    }
    
    // If we reached the end successfully
    if (newSelection.length === currentRound.ayahs.length) {
      playMatchSuccessSfx();
      setEvaluating(true);
      setTimeout(() => {
        const newScore = score + 1;
        setScore(newScore);
        if (newScore >= REQUIRED_SCORE) {
          handleWin();
        } else {
          nextRound();
        }
      }, 1000);
    }
  };
  
  const handleAyahDeselect = (id: string) => {
    if (evaluating) return;
    // Only allow removing the last selected item
    if (selectedOrder[selectedOrder.length - 1] === id) {
      playCardFlipSfx();
      setSelectedOrder(selectedOrder.slice(0, -1));
    }
  };

  const nextRound = () => {
    setSelectedOrder([]);
    setEvaluating(false);
    if (currentIndex < rounds.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      generateRounds(corpus);
    }
  };

  const handleWin = () => {
    setWon(true);
    playVictoryFanfareSfx();
    addCoins(3); 
    toast({
      title: "🎉 ترتيب ممتاز!",
      description: "حصلت على نجوم تشجيعية!",
    });
  };

  if (loading || rounds.length === 0) {
    return createPortal(
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
        <Sparkles className="w-10 h-10 animate-spin text-accent" />
      </div>,
      document.body
    );
  }

  const currentRound = rounds[currentIndex];
  // Filter out ayahs that are already selected from the pool
  const poolAyahs = currentRound.shuffled.filter(a => !selectedOrder.includes(a.id));

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4 font-quran text-right" dir="rtl">
      <div className="w-full max-w-3xl bg-card rounded-3xl shadow-2xl overflow-hidden border border-border flex flex-col h-[90vh] sm:h-[80vh]">
        {/* Header */}
        <div className="bg-accent/10 p-4 flex items-center justify-between border-b border-border shrink-0">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ListOrdered className="w-5 h-5 text-accent" /> {def.title}
          </h2>
          <div className="flex items-center gap-4">
            <span className="bg-accent/20 text-accent px-4 py-1.5 rounded-full font-bold text-sm">
              النتيجة: {score} / {REQUIRED_SCORE}
            </span>
            <button 
              onClick={onBack}
              className="p-2 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Game Area */}
        <div className="p-6 flex-1 flex flex-col overflow-y-auto">
          {won ? (
            <div className="text-center py-12 space-y-6 m-auto">
              <Trophy className="w-24 h-24 text-accent mx-auto animate-bounce" />
              <h3 className="text-3xl font-extrabold text-foreground">أحسنت بطل القرآن!</h3>
              <p className="text-muted-foreground text-lg">لقد رتبت الآيات بنجاح 👏</p>
              <button 
                onClick={() => generateRounds(corpus)}
                className="mt-6 px-8 py-3 bg-accent text-accent-foreground font-bold rounded-xl shadow-lg hover:shadow-xl hover:bg-accent/90 transition-all active:scale-95"
              >
                العب مرة أخرى (15 نجمة)
              </button>
            </div>
          ) : (
            <div className="flex flex-col space-y-8 h-full">
              <div className="text-center shrink-0">
                <span className="text-sm font-bold text-muted-foreground bg-secondary px-4 py-1.5 rounded-full shadow-sm border border-border">
                  سورة {currentRound.surahName}
                </span>
                <p className="text-lg text-foreground mt-4 font-bold">اضغط على الآيات بالترتيب الصحيح:</p>
              </div>

              {/* Selected Area */}
              <div className="flex-1 bg-secondary/30 rounded-2xl p-4 border-2 border-dashed border-accent/30 min-h-[200px] flex flex-col gap-3">
                {selectedOrder.map((id, index) => {
                  const ayah = currentRound.shuffled.find(a => a.id === id)!;
                  let stateClass = "bg-card text-foreground border-border";
                  
                  if (evaluating && index === selectedOrder.length - 1) {
                    // It's the last one we just clicked, let's see if it's right or wrong
                    if (currentRound.ayahs[index].id !== id) {
                      stateClass = "bg-destructive/20 border-destructive text-destructive animate-shake";
                    } else if (selectedOrder.length === currentRound.ayahs.length) {
                      stateClass = "bg-success/20 border-success text-success";
                    }
                  } else if (evaluating && selectedOrder.length === currentRound.ayahs.length) {
                    stateClass = "bg-success/20 border-success text-success";
                  }
                  
                  return (
                    <button
                      key={id}
                      onClick={() => handleAyahDeselect(id)}
                      className={`p-4 rounded-xl text-lg sm:text-xl font-quran font-bold border-2 transition-all duration-300 text-right w-full shadow-sm ${stateClass}`}
                    >
                      <span className="inline-block bg-accent/20 text-accent rounded-full w-6 h-6 text-center text-sm ml-2 leading-6">{index + 1}</span>
                      {ayah.text}
                    </button>
                  );
                })}
                {selectedOrder.length === 0 && (
                  <div className="m-auto text-muted-foreground font-bold flex flex-col items-center gap-2 opacity-50">
                    <ListOrdered className="w-10 h-10" />
                    الآيات المرتبة ستظهر هنا
                  </div>
                )}
              </div>

              {/* Pool Area */}
              <div className="shrink-0 space-y-3">
                {poolAyahs.map((ayah) => (
                  <button
                    key={ayah.id}
                    onClick={() => handleAyahTap(ayah.id)}
                    disabled={evaluating}
                    className="p-4 w-full rounded-xl text-lg sm:text-xl font-quran font-bold bg-accent/10 border-2 border-accent/20 hover:border-accent hover:bg-accent/20 text-foreground transition-all duration-300 text-right shadow-sm active:scale-[0.98]"
                  >
                    {ayah.text}
                  </button>
                ))}
              </div>
              
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
