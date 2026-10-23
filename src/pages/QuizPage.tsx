import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Trophy,
  Brain,
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Star,
  Award,
  BookOpen,
  Timer,
  ChevronLeft,
  Flame,
  HelpCircle,
  Check
} from "lucide-react";
import { 
  getLocalQuizPool, 
  syncQuestionsFromServer, 
  markQuestionAsAnswered, 
  clearAnsweredQuestions,
  type ServerQuestion 
} from "../services/quizServer";
import { addCoins, getCoins, formatCoins } from "../data/kidsProfile";
import {
  playCardFlipSfx,
  playMatchSuccessSfx,
  playMismatchSfx,
  playVictoryFanfareSfx,
  playComboStreakSfx
} from "../utils/gameSfx";
import { toast } from "../hooks/use-toast";

export default function QuizPage() {
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<ServerQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [coins, setCoins] = useState(getCoins);
  const [loading, setLoading] = useState(true);
  const [quizFinished, setQuizFinished] = useState(false);

  // تحميل ومزامنة الأسئلة
  useEffect(() => {
    async function loadQuiz() {
      setLoading(true);
      try {
        const synced = await syncQuestionsFromServer();
        const pool = (synced && synced.length > 0) ? synced : getLocalQuizPool();
        setQuestions([...pool].sort(() => 0.5 - Math.random()));
      } catch {
        setQuestions(getLocalQuizPool());
      } finally {
        setLoading(false);
      }
    }
    loadQuiz();
  }, []);

  const currentQ = questions[currentIndex];

  const handleSelectOption = (opt: string) => {
    if (isAnswerChecked || !currentQ) return;
    playCardFlipSfx();
    setSelectedOption(opt);
    setIsAnswerChecked(true);

    const isCorrect = opt === currentQ.correct_answer;
    if (isCorrect) {
      playMatchSuccessSfx();
      const newStreak = streak + 1;
      setStreak(newStreak);
      playComboStreakSfx(newStreak);
      const points = 10 + newStreak * 5;
      setScore(s => s + points);

      // إضافة نجوم/عملات
      addCoins(10);
      setCoins(getCoins());
      markQuestionAsAnswered(currentQ.id);
    } else {
      playMismatchSfx();
      setStreak(0);
    }
  };

  const handleNextQuestion = () => {
    playCardFlipSfx();
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(i => i + 1);
      setSelectedOption(null);
      setIsAnswerChecked(false);
    } else {
      setQuizFinished(true);
      playVictoryFanfareSfx();
      addCoins(50);
      setCoins(getCoins());
    }
  };

  const handleRestartQuiz = () => {
    playCardFlipSfx();
    clearAnsweredQuestions();
    setScore(0);
    setStreak(0);
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswerChecked(false);
    setQuizFinished(false);
    setQuestions([...questions].sort(() => 0.5 - Math.random()));
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-stone-100 flex flex-col font-sans select-none" dir="rtl">
      {/* ── شريط التنقل العلوي ── */}
      <header className="sticky top-0 z-30 bg-[#09090b]/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 text-xs font-bold transition-all active:scale-95 border border-white/5"
        >
          <ArrowRight className="w-4 h-4" />
          <span>رجوع</span>
        </button>

        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-amber-400 animate-pulse" />
          <h1 className="text-sm sm:text-base font-black bg-gradient-to-l from-amber-200 via-amber-400 to-yellow-200 bg-clip-text text-transparent">
            اختبار المسابقة القرآنية
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-black">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{formatCoins(coins)}</span>
          </div>
        </div>
      </header>

      {/* ── المحتوى الرئيسي ── */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-sm font-bold text-stone-400">جارٍ إعداد الأسئلة القرآنية المباركة...</p>
          </div>
        ) : quizFinished ? (
          /* ── شاشة اكتمال الاختبار ── */
          <div className="bg-gradient-to-b from-stone-900 via-stone-900 to-amber-950/40 rounded-3xl border border-amber-500/30 p-6 sm:p-8 text-center space-y-6 shadow-2xl animate-fade-in">
            <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 p-0.5 shadow-xl shadow-amber-400/30 flex items-center justify-center text-slate-950 animate-bounce">
              <Trophy className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black text-amber-300">
                مبارك! أنهيت الاختبار القرآني 🌟
              </h2>
              <p className="text-xs sm:text-sm text-stone-300">
                أداء مبارك ومتميز في تدبر واستيعاب كتاب الله
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-black/40 rounded-2xl p-4 border border-white/5">
              <div className="text-center">
                <span className="block text-[11px] text-stone-400 font-medium">النقاط المكتسبة</span>
                <span className="text-lg font-black text-emerald-400">{score}</span>
              </div>
              <div className="text-center">
                <span className="block text-[11px] text-stone-400 font-medium">النجوم المضافة</span>
                <span className="text-lg font-black text-amber-400">+50 ⭐</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={handleRestartQuiz}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-black text-xs sm:text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة الاختبار بأسئلة جديدة</span>
              </button>
              <button
                onClick={() => navigate("/")}
                className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-stone-200 font-bold text-xs sm:text-sm active:scale-95 transition-all"
              >
                العودة للتلاوات
              </button>
            </div>
          </div>
        ) : currentQ ? (
          /* ── بطاقة السؤال التفاعلية ── */
          <div className="space-y-4 animate-fade-in">
            {/* شريط التقدم والسلسلة */}
            <div className="flex items-center justify-between text-xs text-stone-400 font-bold">
              <span>السؤال {currentIndex + 1} من {questions.length}</span>
              <div className="flex items-center gap-2">
                {streak > 1 && (
                  <span className="flex items-center gap-1 text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20 text-[11px]">
                    <Flame className="w-3 h-3 fill-amber-400" /> {streak} متتالية!
                  </span>
                )}
                <span className="text-emerald-400 font-black">{score} نقطة</span>
              </div>
            </div>

            {/* خط تقدم الأسئلة */}
            <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
              />
            </div>

            {/* بطاقة السؤال */}
            <div className="bg-stone-900/90 rounded-3xl border border-white/10 p-5 sm:p-7 shadow-xl space-y-5">
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 font-black text-sm">
                  {currentIndex + 1}
                </span>
                <h2 className="text-base sm:text-lg font-bold text-stone-100 leading-relaxed pt-0.5">
                  {currentQ.question}
                </h2>
              </div>

              {/* خيارات الإجابة */}
              <div className="space-y-2.5 pt-2">
                {currentQ.options.map((opt, i) => {
                  const isSelected = selectedOption === opt;
                  const isCorrectAnswer = opt === currentQ.correct_answer;
                  
                  let optStyle = "bg-stone-800/80 hover:bg-stone-800 border-white/5 text-stone-200 hover:border-amber-500/40";
                  if (isAnswerChecked) {
                    if (isCorrectAnswer) {
                      optStyle = "bg-emerald-950/80 border-emerald-500/80 text-emerald-200 shadow-md shadow-emerald-500/20";
                    } else if (isSelected) {
                      optStyle = "bg-rose-950/80 border-rose-500/80 text-rose-200 shadow-md shadow-rose-500/20";
                    } else {
                      optStyle = "bg-stone-800/40 border-white/5 text-stone-500 opacity-60";
                    }
                  }

                  return (
                    <button
                      key={i}
                      disabled={isAnswerChecked}
                      onClick={() => handleSelectOption(opt)}
                      className={`w-full p-3.5 sm:p-4 rounded-2xl border-2 text-right text-xs sm:text-sm font-bold transition-all flex items-center justify-between gap-3 active:scale-[0.99] ${optStyle}`}
                    >
                      <span className="leading-relaxed">{opt}</span>
                      {isAnswerChecked && isCorrectAnswer && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                      {isAnswerChecked && isSelected && !isCorrectAnswer && (
                        <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* زر المتابعة إلى السؤال التالي */}
              {isAnswerChecked && (
                <div className="pt-3 animate-fade-in">
                  <button
                    onClick={handleNextQuestion}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-sm shadow-lg shadow-emerald-600/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <span>{currentIndex + 1 < questions.length ? "السؤال التالي ⬅️" : "عرض النتيجة النهائية 🏆"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-10 space-y-3">
            <HelpCircle className="w-10 h-10 text-stone-500 mx-auto" />
            <p className="text-stone-400 text-sm">لا توجد أسئلة متاحة حالياً.</p>
            <button
              onClick={() => navigate("/")}
              className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold text-stone-200"
            >
              العودة للرئيسية
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
