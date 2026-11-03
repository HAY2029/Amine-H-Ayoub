import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import type { GameDef } from "../data/gameCatalog";
import { getAllSurahs } from "../data/quranData";
import { addCoins } from "../data/kidsProfile";

interface Quest {
  symbol: string;
  question: string;
  answer: string;
  choices: string[];
}

const QUESTS: Record<string, Quest[]> = {
  "quran-book": [
    { symbol: "📖", question: "أين كتاب القرآن؟", answer: "📖", choices: ["📖", "⚽", "🚗"] },
    { symbol: "✨", question: "ماذا نفعل عند القرآن؟", answer: "نستمع", choices: ["نستمع", "نرميه", "نغلقه"] },
    { symbol: "🤲", question: "بعد القراءة نقول؟", answer: "صدق الله", choices: ["صدق الله", "لا شيء", "وداعاً"] },
  ],
  "prayer-time": [
    { symbol: "💧", question: "الخطوة الأولى للصلاة؟", answer: "نتوضأ", choices: ["نتوضأ", "ننام", "نلعب"] },
    { symbol: "🕋", question: "نتجه في الصلاة إلى؟", answer: "القبلة", choices: ["القبلة", "التلفاز", "الباب"] },
    { symbol: "🙌", question: "نبدأ الصلاة بـ؟", answer: "الله أكبر", choices: ["الله أكبر", "تصفيق", "غناء"] },
    { symbol: "📖", question: "نقرأ في الصلاة؟", answer: "الفاتحة", choices: ["الفاتحة", "قصة", "رسالة"] },
    { symbol: "🙇", question: "ثم ننحني في؟", answer: "الركوع", choices: ["الركوع", "الجري", "الضحك"] },
    { symbol: "🤲", question: "نضع الجبهة على الأرض في؟", answer: "السجود", choices: ["السجود", "النوم", "القفز"] },
  ],
  "sunrise-remembrance": [
    { symbol: "☀️", question: "عند الصباح نقول؟", answer: "الحمد لله", choices: ["الحمد لله", "لا شيء", "غضب"] },
    { symbol: "🌤️", question: "من خلق الشمس؟", answer: "الله", choices: ["الله", "اللعبة", "السيارة"] },
    { symbol: "😊", question: "نبدأ يومنا بـ؟", answer: "ابتسامة", choices: ["ابتسامة", "خصام", "بكاء"] },
  ],
  "kindness-gift": [
    { symbol: "🎁", question: "نشارك لعبتنا مع؟", answer: "صديق", choices: ["صديق", "لا أحد", "نخفيها"] },
    { symbol: "💛", question: "الكلمة الطيبة؟", answer: "جميلة", choices: ["جميلة", "سيئة", "لا نحتاجها"] },
    { symbol: "🌷", question: "نساعد من؟", answer: "المحتاج", choices: ["المحتاج", "لا أحد", "نضحك عليه"] },
  ],
  "clean-water": [
    { symbol: "💧", question: "نتوضأ بـ؟", answer: "الماء", choices: ["الماء", "الرمل", "الكرة"] },
    { symbol: "🫧", question: "نغسل يدينا؟", answer: "للنظافة", choices: ["للنظافة", "للتعب", "لا نغسلها"] },
    { symbol: "🌿", question: "النظافة شيء؟", answer: "جميل", choices: ["جميل", "سيئ", "ممنوع"] },
  ],
  "mosque-path": [
    { symbol: "🕌", question: "في المسجد نكون؟", answer: "هادئين", choices: ["هادئين", "صاخبين", "غاضبين"] },
    { symbol: "👟", question: "قبل الدخول؟", answer: "نخلع الحذاء", choices: ["نخلع الحذاء", "نرميه", "نلبس اثنين"] },
    { symbol: "🤲", question: "المسجد بيت؟", answer: "الله", choices: ["الله", "السيارة", "اللعبة"] },
  ],
  "parents-love": [
    { symbol: "❤️", question: "نقول لأمي؟", answer: "أحبك", choices: ["أحبك", "لا", "اذهبي"] },
    { symbol: "🌟", question: "نطيع والدي؟", answer: "نعم", choices: ["نعم", "لا", "أحياناً"] },
    { symbol: "🤝", question: "نساعد في البيت؟", answer: "نعم", choices: ["نعم", "لا", "نهرب"] },
  ],
  "honest-star": [
    { symbol: "⭐", question: "وجدت لعبة ليست لي", answer: "أعيدها", choices: ["أعيدها", "آخذها", "أكسرها"] },
    { symbol: "💬", question: "نقول دائماً؟", answer: "الصدق", choices: ["الصدق", "الكذب", "لا نتكلم"] },
    { symbol: "🏅", question: "الصادق طفل؟", answer: "شجاع", choices: ["شجاع", "سيئ", "كسول"] },
  ],
  "help-friend": [
    { symbol: "🤝", question: "صديقي يحتاج مساعدة", answer: "أساعده", choices: ["أساعده", "أضحك", "أهرب"] },
    { symbol: "😊", question: "الصديق الجيد؟", answer: "لطيف", choices: ["لطيف", "مؤذٍ", "غاضب"] },
    { symbol: "🧸", question: "نرتب الألعاب معاً؟", answer: "نعم", choices: ["نعم", "لا", "نرميها"] },
  ],
  "night-moon": [
    { symbol: "🌙", question: "قبل النوم نقرأ؟", answer: "دعاء", choices: ["دعاء", "صراخ", "لا شيء"] },
    { symbol: "😴", question: "النوم نعمة من؟", answer: "الله", choices: ["الله", "اللعبة", "القمر"] },
    { symbol: "⭐", question: "ننام بعد؟", answer: "الهدوء", choices: ["الهدوء", "الركض", "الضجيج"] },
  ],
  "garden-good": [
    { symbol: "🌷", question: "الزهرة تحتاج؟", answer: "ماء", choices: ["ماء", "حجر", "حذاء"] },
    { symbol: "🌱", question: "نحافظ على؟", answer: "الزرع", choices: ["الزرع", "إفساده", "قطفه كله"] },
    { symbol: "🦋", question: "نحن لطفاء مع؟", answer: "الحيوان", choices: ["الحيوان", "إيذائه", "إخافته"] },
  ],
  "qibla-compass": [
    { symbol: "🧭", question: "قبل الصلاة نتجه إلى؟", answer: "القبلة", choices: ["القبلة", "الباب", "التلفاز"] },
    { symbol: "🕋", question: "الكعبة في؟", answer: "مكة", choices: ["مكة", "البحر", "الحديقة"] },
    { symbol: "🤲", question: "نقف في الصلاة؟", answer: "بانتباه", choices: ["بانتباه", "بلعب", "بنوم"] },
  ],
  "charity-box": [
    { symbol: "🪙", question: "نتصدق على؟", answer: "المحتاج", choices: ["المحتاج", "لا أحد", "نخفي المال"] },
    { symbol: "🍎", question: "نشارك طعامنا؟", answer: "نعم", choices: ["نعم", "لا", "نرميه"] },
    { symbol: "💛", question: "العطاء يجعل القلب؟", answer: "سعيداً", choices: ["سعيداً", "حزيناً", "غاضباً"] },
  ],
  "rainbow-mercy": [
    { symbol: "🌈", question: "نقول لمن أخطأ؟", answer: "سامحتك", choices: ["سامحتك", "لا", "اذهب"] },
    { symbol: "💗", question: "الرحمة شيء؟", answer: "جميل", choices: ["جميل", "سيئ", "لا نعرف"] },
    { symbol: "🕊️", question: "نحب السلام؟", answer: "نعم", choices: ["نعم", "لا", "غضب"] },
  ],
  "good-deeds-crown": [
    { symbol: "👑", question: "العمل الطيب يجعلني؟", answer: "سعيداً", choices: ["سعيداً", "غاضباً", "حزيناً"] },
    { symbol: "🌟", question: "إذا ساعدت غيري؟", answer: "أحصل على أجر", choices: ["أحصل على أجر", "أخسر", "لا شيء"] },
    { symbol: "🤲", question: "نختار كل يوم؟", answer: "عملاً طيباً", choices: ["عملاً طيباً", "خصاماً", "كذباً"] },
  ],  "lamp-learning": [
    { symbol: "💡", question: "نتعلم القرآن بـ؟", answer: "فرح", choices: ["فرح", "ملل", "غضب"] },
    { symbol: "📚", question: "عندما لا نعرف نسأل؟", answer: "المعلم", choices: ["المعلم", "لا أحد", "الكرسي"] },
    { symbol: "🏆", question: "كل محاولة تجعلني؟", answer: "أفضل", choices: ["أفضل", "أسوأ", "لا شيء"] },
  ],
};

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);
const SURAHS = getAllSurahs();

const gameSeed = (gameId: string) => Array.from(gameId).reduce((total, letter) => total + letter.charCodeAt(0), 0);

const endlessQuest = (gameId: string, round: number): Quest => {
  const offset = Math.max(0, round - (QUESTS[gameId]?.length ?? 0));
  const seed = gameSeed(gameId);
  const surah = SURAHS[(offset * 37 + seed) % SURAHS.length];
  const alternateOne = SURAHS[(surah.number + offset + 17) % SURAHS.length];
  const alternateTwo = SURAHS[(surah.number + offset + 43) % SURAHS.length];
  const challengeType = Math.floor(offset / SURAHS.length) % 3;

  if (challengeType === 0) {
    const nearOne = Math.max(1, surah.ayahCount - 1);
    const nearTwo = surah.ayahCount + 1;
    return { symbol: "📖", question: `كم آية في سورة ${surah.name}؟`, answer: String(surah.ayahCount), choices: [String(surah.ayahCount), String(nearOne), String(nearTwo)] };
  }

  if (challengeType === 1) {
    return { symbol: "🔢", question: `ما رقم سورة ${surah.name}؟`, answer: String(surah.number), choices: [String(surah.number), String(((surah.number + 11 - 1) % 114) + 1), String(((surah.number + 29 - 1) % 114) + 1)] };
  }

  return { symbol: "✨", question: `ما اسم السورة رقم ${surah.number}؟`, answer: surah.name, choices: [surah.name, alternateOne.name, alternateTwo.name] };
};

const questionForRound = (gameId: string, quests: Quest[], round: number) => round < quests.length ? quests[round] : endlessQuest(gameId, round);

export default function QuranValuesGame({ def }: { def: GameDef }) {
  const quests = QUESTS[def.id] ?? QUESTS["quran-book"];
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const quest = questionForRound(def.id, quests, round);
  const choices = useMemo(() => shuffle(quest.choices), [quest]);

  const choose = (choice: string) => {
    if (selected) return;
    setSelected(choice);
    if (choice === quest.answer) {
      setScore((value) => value + 1);
      addCoins(2);
    }
  };

  const next = () => { setRound((value) => value + 1); setSelected(null); };

  return (
    <div className="space-y-4 text-center animate-fade-up max-w-xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground px-3.5 py-2.5 bg-secondary/50 backdrop-blur-sm rounded-2xl border border-border/70 shadow-sm">
        <span className="text-foreground font-black truncate">{def.title}</span>
        <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-black">مرحلة {round + 1}</span>
        <span className="text-amber-500 font-black flex items-center gap-1 bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30"><Sparkles className="h-4 w-4" /> {score}</span>
      </div>

      <div className="p-6 rounded-3xl bg-gradient-to-br from-card via-card/95 to-secondary/30 border-2 border-accent/25 shadow-xl space-y-3">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/15 text-accent flex items-center justify-center text-4xl shadow-inner" aria-hidden="true">{quest.symbol}</div>
        <h2 className="text-2xl sm:text-3xl font-black text-foreground leading-tight">{quest.question}</h2>
        <p className="text-sm font-bold text-muted-foreground">اختر الجواب الصحيح</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {choices.map((choice) => {
          const isCorrect = selected && choice === quest.answer;
          const isWrong = selected === choice && choice !== quest.answer;
          return <button key={choice} onClick={() => choose(choice)} disabled={selected !== null} className={`min-h-24 p-4 rounded-3xl border-2 transition-all flex items-center justify-center text-lg font-black shadow-lg active:scale-95 ${!selected ? "bg-gradient-to-br from-card via-card to-secondary/20 border-border hover:border-accent/70 hover:shadow-accent/10 text-foreground" : isCorrect ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400" : isWrong ? "bg-red-500/15 border-red-500 text-red-500" : "opacity-40 border-border text-muted-foreground"}`}>{choice}</button>;
        })}
      </div>

      {selected && (
        <div className="p-4 rounded-3xl bg-secondary/50 border border-border space-y-3 animate-in fade-in zoom-in-95 duration-200">
          <p className={`font-black text-sm ${selected === quest.answer ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>{selected === quest.answer ? "إجابة صحيحة يا بطل! + نجمتان" : "معلومة جديدة للمرحلة القادمة"}</p>
          <button onClick={next} className="w-full py-3 rounded-2xl bg-accent text-accent-foreground font-black text-sm shadow-md hover:brightness-105 active:scale-98 transition-all">السؤال التالي ←</button>
        </div>
      )}
    </div>
  );}
