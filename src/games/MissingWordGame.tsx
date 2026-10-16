import React, { useState, useEffect } from 'react';
import { ArrowRight, Trophy, Sparkles, AlertCircle } from 'lucide-react';
import { addCoins } from '../data/kidsProfile';
import { toast } from '../hooks/use-toast';
import { ensureCorpus, SurahText, normalizeArabic } from '../data/quranText';
import { GameDef } from '../data/gameCatalog';
import { pullNewQuestions, addQuestions, removeQuestion, getAnsweredIds, getBank, fetchFromQuestionServer, type BankQuestion } from '../data/questionBank';
import { createPortal } from 'react-dom';
import { playMatchSuccessSfx, playMismatchSfx, playVictoryFanfareSfx } from '../utils/gameSfx';

interface MissingWordGameProps {
  def: GameDef;
  minSurah?: number;
  onBack: () => void;
}

type Question = BankQuestion;

export default function MissingWordGame({ def, minSurah, onBack }: MissingWordGameProps) {
  const [corpus, setCorpus] = useState<SurahText[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const REQUIRED_SCORE = 5;

  useEffect(() => {
    loadCorpus();
  }, []);

  const loadCorpus = async () => {
    const data = await ensureCorpus();
    setCorpus(data);
    generateQuestions(data);
    setLoading(false);
  };

  const generateQuestions = async (data: SurahText[]) => {
    // تبدأ الأسئلة من السورة الحالية وتمتد إلى السور التالية في ترتيب المصحف.
    const surahNum = minSurah || def.params?.minSurah || 0;
    const sourceSurahs = surahNum
      ? data.filter(s => s.app >= surahNum)
      : [...data].sort((a, b) => (a.ayahs?.length || 0) - (b.ayahs?.length || 0)).slice(0, 5);

    interface AyahCandidate {
      surahName: string;
      ayahText: string;
      ayahNum: number;
      surahNum: number;
    }

    const allCandidates: AyahCandidate[] = [];
    for (const s of sourceSurahs) {
      if (!s.ayahs) continue;
      for (const a of s.ayahs) {
        const rawWords = a.text.trim().split(/\s+/);
        if (rawWords.length >= 3) {
          allCandidates.push({ surahName: s.name, ayahText: a.text.trim(), ayahNum: a.n, surahNum: s.app });
        }
      }
    }

    // خلط كل الآيات — كل آية تُستخدم مرة واحدة فقط (لا تكرار ولا تشابه)
    const shuffledCandidates = [...allCandidates].sort(() => 0.5 - Math.random());
    const selectedAyahs = shuffledCandidates.slice(0, 20);

    // بنك كلمات السورة نفسها أولاً (مشتّات صعبة ومتشابهة شكلاً) + بنك عام للتنويع
    const surahWordsBank: string[] = [];
    const allWordsBank: string[] = [];
    for (const s of sourceSurahs) {
      for (const a of s.ayahs || []) {
        for (const w of a.text.split(/\s+/)) {
          const clean = w.trim().replace(/[^\u0600-\u06FF]/g, "");
          if (clean.length >= 3) surahWordsBank.push(clean);
        }
      }
    }
    for (const s of data) {
      for (const a of s.ayahs || []) {
        for (const w of a.text.split(/\s+/)) {
          const clean = w.trim();
          if (clean.length >= 4) allWordsBank.push(clean);
        }
      }
    }

    const usedMissing = new Set<string>(); // منع تكرار نفس الكلمة المفقودة
    const generated: Question[] = [];

    for (const candidate of selectedAyahs) {
      const words = candidate.ayahText.split(/\s+/);
      // اختيار كلمة صعبة (أطول = أصعب) وغير مستخدمة في سؤال سابق
      const validIndices = words
        .map((w, idx) => ({ w, idx }))
        .filter(item => item.w.replace(/[^\u0600-\u06FF]/g, "").length >= 4 && !usedMissing.has(normalizeArabic(item.w)));

      if (validIndices.length === 0) continue;

      // نفضّل الكلمات الأطول (أصعب في التمييز)
      validIndices.sort((a, b) => b.w.length - a.w.length);
      const chosen = validIndices[Math.floor(Math.random() * Math.min(3, validIndices.length))];
      const missingWord = chosen.w;
      usedMissing.add(normalizeArabic(missingWord));

      // تكوين الآية مع وضع الفراغ بدقة في مكان الكلمة المحددة
      const wordsWithBlank = [...words];
      wordsWithBlank[chosen.idx] = " (........) ";
      const formattedAyahText = wordsWithBlank.join(" ");

      // خيارات مشتّتة: من كلمات السورة نفسها (متشابهة شكلاً = أصعب) + عامة
      const options = new Set<string>();
      options.add(missingWord);
      const norm = normalizeArabic(missingWord);

      const tryAdd = (randWord: string | undefined) => {
        if (randWord && randWord !== missingWord && normalizeArabic(randWord) !== norm) options.add(randWord);
      };

      // 2 من السورة نفسها إن توفرت
      const surahPool = [...new Set(surahWordsBank)].sort(() => 0.5 - Math.random());
      for (const w of surahPool) { if (options.size >= 3) break; tryAdd(w); }
      // الباقي من بنك المصحف العام
      let attempts = 0;
      while (options.size < 4 && attempts < 200) {
        tryAdd(allWordsBank[Math.floor(Math.random() * allWordsBank.length)]);
        attempts++;
      }

      const optionsArray = Array.from(options).sort(() => 0.5 - Math.random());
      if (optionsArray.length < 4) continue;

      generated.push({
        id: `${candidate.surahNum}-${candidate.ayahNum}-${normalizeArabic(missingWord)}`,
        surahNum: candidate.surahNum,
        surahName: candidate.surahName,
        ayahText: formattedAyahText,
        missingWord,
        options: optionsArray
      });
    }

    // حفظ الأسئلة المولدة في البنك + استدعاء أسئلة جديدة من السيرفر (بديلة عمّا أُجيب سابقاً)
    // الأسئلة المُجابة سابقاً (المحذوفة من الجهاز) لا تعود أبداً
    const answered = new Set(getAnsweredIds());
    const freshGenerated = generated.filter(q => !answered.has(q.id));

    // أولوية لسيرفر الأسئلة (توليد عشوائي على الخادم) — والمحلي احتياط
    let serverQs: BankQuestion[] = [];
    try {
      serverQs = await fetchFromQuestionServer(surahNum, 15, "missingword");
    } catch { /* بدون سيرفر */ }

    const bankQs = getBank().filter(q => (!surahNum || q.surahNum >= surahNum) && !answered.has(q.id));
    const seenLocal = new Set(freshGenerated.map(q => q.id));
    const merged: Question[] = [
      ...serverQs,
      ...freshGenerated,
      ...bankQs.filter(q => !seenLocal.has(q.id) && !serverQs.some(s => s.id === q.id)),
    ];
    try {
      const fromSupabase = await pullNewQuestions(surahNum, merged.map(q => q.id));
      merged.push(...fromSupabase);
    } catch { /* بدون سيرفر — تكفي المحلية */ }

    addQuestions(freshGenerated);
    setQuestions(merged);
    setCurrentIndex(0);
    setScore(0);
    setWon(false);
    setSelectedAnswer(null);
    setIsCorrect(null);
  };

  const handleAnswer = (option: string) => {
    if (selectedAnswer !== null) return; // Already answered this one
    
    setSelectedAnswer(option);
    const currentQ = questions[currentIndex];
    const correct = option === currentQ.missingWord;
    setIsCorrect(correct);

    // بعد الإجابة: حذف السؤال من الجهاز + استدعاء سؤال جديد بديل من السيرفر في الخلفية
    removeQuestion(currentQ.id);
    pullNewQuestions(currentQ.surahNum, questions.map(q => q.id))
      .then(fresh => { if (fresh.length) setQuestions(prev => [...prev, ...fresh]); })
      .catch(() => { /* بدون إنترنت — يكفي البنك المحلي */ });
    
    if (correct) {
      playMatchSuccessSfx();
      const newScore = score + 1;
      setScore(newScore);
      if (newScore >= REQUIRED_SCORE) {
        setTimeout(() => handleWin(), 1000);
      } else {
        setTimeout(() => nextQuestion(), 1000);
      }
    } else {
      playMismatchSfx();
      setTimeout(() => nextQuestion(), 1500);
    }
  };

  const nextQuestion = () => {
    setSelectedAnswer(null);
    setIsCorrect(null);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // نفدت الأسئلة — إعادة توليد (من البنك المحلي + السيرفر)
      generateQuestions(corpus);
    }
  };

  const handleWin = () => {
    setWon(true);
    playVictoryFanfareSfx();
    addCoins(3); // مكافأة
    toast({
      title: "🎉 بطل متميز!",
      description: "حصلت على نجوم تشجيعية لتركيزك العالي!",
    });
  };

  if (loading || questions.length === 0) {
    return createPortal(
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
        <Sparkles className="w-10 h-10 animate-spin text-accent" />
      </div>,
      document.body
    );
  }

  const currentQ = questions[currentIndex];

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4 font-quran text-right" dir="rtl">
      <div className="w-full max-w-2xl bg-card rounded-3xl shadow-2xl overflow-hidden border border-border flex flex-col h-[80vh] sm:h-auto">
        {/* Header */}
        <div className="bg-accent/10 p-4 flex items-center justify-between border-b border-border shrink-0">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" /> {def.title}
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
        <div className="p-6 flex-1 flex flex-col justify-center overflow-y-auto">
          {won ? (
            <div className="text-center py-12 space-y-6">
              <Trophy className="w-24 h-24 text-accent mx-auto animate-bounce" />
              <h3 className="text-3xl font-extrabold text-foreground">أحسنت بطل القرآن!</h3>
              <p className="text-muted-foreground text-lg">لقد أكملت الآيات بنجاح 👏</p>
              <button 
                onClick={() => generateQuestions(corpus)}
                className="mt-6 px-8 py-3 bg-accent text-accent-foreground font-bold rounded-xl shadow-lg hover:shadow-xl hover:bg-accent/90 transition-all active:scale-95"
              >
                العب مرة أخرى (20 نجمة)
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-8 w-full max-w-lg mx-auto">
              <div className="text-center space-y-2">
                <span className="text-sm font-bold text-muted-foreground bg-secondary px-3 py-1 rounded-full">
                  {currentQ.surahName}
                </span>
                <p className="text-2xl sm:text-3xl font-quran leading-loose text-foreground mt-4 select-none">
                  {currentQ.ayahText}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {currentQ.options.map((opt, i) => {
                  let stateClass = "bg-card text-foreground hover:bg-accent/10 hover:border-accent border-border shadow-md";
                  if (selectedAnswer === opt) {
                    stateClass = isCorrect 
                      ? "bg-success/20 border-success text-success scale-105 shadow-lg" 
                      : "bg-destructive/20 border-destructive text-destructive scale-95 shadow-lg";
                  } else if (selectedAnswer !== null && opt === currentQ.missingWord) {
                    // Show correct answer if they got it wrong
                    stateClass = "bg-success/20 border-success text-success opacity-80 shadow-md";
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswer(opt)}
                      disabled={selectedAnswer !== null}
                      className={`p-6 sm:p-8 rounded-2xl text-2xl sm:text-3xl font-quran font-bold border-2 transition-all duration-300 min-h-[80px] sm:min-h-[100px] flex items-center justify-center ${stateClass}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              
              {selectedAnswer !== null && (
                <div className={`text-lg font-bold animate-in fade-in zoom-in duration-300 ${isCorrect ? 'text-success' : 'text-destructive'}`}>
                  {isCorrect ? "إجابة صحيحة! 👏" : "حاول بتركيز في المرة القادمة!"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
