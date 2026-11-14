import { useEffect, useMemo, useRef, useState } from "react";
import { Headphones, Pause, Play, Sparkles, Volume2 } from "lucide-react";
import type { GameDef } from "../data/gameCatalog";
import { addCoins } from "../data/kidsProfile";
import { ensureCorpus, type SurahText } from "../data/quranText";
import { getFallbackAudioUrl, getSurahAudioUrl, hasCloudAudio } from "../data/audioUrls";

interface Question {
  symbol: string;
  prompt: string;
  answer: string;
  options: string[];
  ayahText?: string;
}

const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[targetIndex]] = [result[targetIndex], result[index]];
  }
  return result;
};

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const wordsIn = (text: string) => unique(
  text
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ""))
    .filter((word) => word.length > 1),
);

const numericChoices = (answer: number, maximum: number) => unique([
  String(answer),
  String(Math.max(1, answer - 1)),
  String(Math.min(maximum, answer + 1)),
  String(answer + 2 <= maximum ? answer + 2 : Math.max(1, answer - 2)),
]).slice(0, 3);

const questionFor = (surah: SurahText, corpus: SurahText[], round: number): Question => {
  const ayahIndex = round % surah.ayahs.length;
  const kind = Math.floor(round / surah.ayahs.length) % 4;
  const cycle = Math.floor(round / (surah.ayahs.length * 4));
  const ayah = surah.ayahs[ayahIndex];
  const allWords = unique(surah.ayahs.flatMap((item) => wordsIn(item.text)));
  const ayahWords = wordsIn(ayah.text);

  if (kind === 0) {
    return {
      symbol: "📖",
      prompt: "ما رقم هذه الآية؟",
      ayahText: ayah.text,
      answer: String(ayah.n),
      options: numericChoices(ayah.n, surah.ayahs.length),
    };
  }

  if (kind === 1 && ayahWords.length) {
    const answer = ayahWords[cycle % ayahWords.length];
    const wrongWords = allWords.filter((word) => !ayahWords.includes(word));
    const choices = unique([answer, ...wrongWords.slice(cycle % Math.max(1, wrongWords.length), (cycle % Math.max(1, wrongWords.length)) + 2)]);
    while (choices.length < 3) choices.push(...allWords.filter((word) => word !== answer && !choices.includes(word)).slice(0, 3 - choices.length));
    return {
      symbol: "🔎",
      prompt: "اختر كلمة سمعتها في الآية",
      ayahText: ayah.text,
      answer,
      options: choices.slice(0, 3),
    };
  }

  if (kind === 2) {
    const prompts = [
      `كم آية في سورة ${surah.name}؟`,
      `سورة ${surah.name} فيها كم آية؟`,
      `اختر عدد آيات سورة ${surah.name}`,
    ];
    return {
      symbol: "🔢",
      prompt: prompts[cycle % prompts.length],
      answer: String(surah.ayahs.length),
      options: numericChoices(surah.ayahs.length, Math.max(12, surah.ayahs.length + 3)),
    };
  }

  const otherSurahs = corpus.filter((item) => item.std !== surah.std && item.name !== surah.name);
  const firstOther = otherSurahs[(cycle * 11 + 3) % otherSurahs.length];
  const secondOther = otherSurahs[(cycle * 17 + 19) % otherSurahs.length];
  return {
    symbol: "✨",
    prompt: "ما اسم السورة التي استمعت إليها؟",
    answer: surah.name,
    options: unique([surah.name, firstOther?.name || "", secondOther?.name || ""]).slice(0, 3),
  };
};

const audioUrlFor = (surahNumber: number) => hasCloudAudio(surahNumber) ? getSurahAudioUrl(surahNumber) : getFallbackAudioUrl(surahNumber);

export default function QuranValuesGame({ def, minSurah }: { def: GameDef; minSurah: number }) {
  const [corpus, setCorpus] = useState<SurahText[]>([]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    ensureCorpus().then(setCorpus).catch(() => setCorpus([]));
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const surah = useMemo(() => corpus.find((item) => item.std === minSurah || item.app === minSurah) ?? corpus[0], [corpus, minSurah]);
  const question = useMemo(() => surah ? questionFor(surah, corpus, round) : null, [surah, corpus, round]);
  const choices = useMemo(() => question ? shuffle(question.options) : [], [question]);

  const playSurah = () => {
    if (!surah) return;
    if (audioRef.current && playing) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(audioUrlFor(surah.std));
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const beginChallenge = () => {
    audioRef.current?.pause();
    setPlaying(false);
    setStarted(true);
  };

  const choose = (choice: string) => {
    if (!question || selected) return;
    setSelected(choice);
    if (choice === question.answer) {
      setScore((value) => value + 1);
      addCoins(2);
    }
  };

  const next = () => {
    setRound((value) => value + 1);
    setSelected(null);
  };

  if (!surah) return <div className="py-10 text-center text-sm font-bold text-muted-foreground">جارٍ تجهيز السورة...</div>;

  if (!started) return (
    <div className="space-y-4 text-center animate-fade-up max-w-xl mx-auto" dir="rtl">
      <div className="p-6 rounded-3xl bg-gradient-to-br from-card via-card/95 to-secondary/30 border-2 border-accent/25 shadow-xl space-y-4">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shadow-inner"><Headphones className="w-8 h-8" /></div>
        <p className="text-xs font-black text-accent">استمع جيداً ثم ابدأ التحدي</p>
        <h2 className="text-3xl font-black text-foreground font-quran">سورة {surah.name}</h2>
        <p className="text-sm font-bold text-muted-foreground">بعد الاستماع ستظهر أسئلة من آيات هذه السورة فقط.</p>
        <button onClick={playSurah} className="btn-gold mx-auto px-7 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg active:scale-95">
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />} {playing ? "إيقاف الاستماع" : "استمع للسورة"}
        </button>
      </div>
      <button onClick={beginChallenge} className="w-full py-3 rounded-2xl bg-accent text-accent-foreground font-black text-sm shadow-md hover:brightness-105 active:scale-98 transition-all flex items-center justify-center gap-2"><Volume2 className="w-5 h-5" /> ابدأ أسئلة السورة</button>
    </div>
  );

  return (
    <div className="space-y-4 text-center animate-fade-up max-w-xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground px-3.5 py-2.5 bg-secondary/50 backdrop-blur-sm rounded-2xl border border-border/70 shadow-sm">
        <span className="text-foreground font-black truncate">{surah.name}</span>
        <button onClick={playSurah} className="bg-accent/10 text-accent border border-accent/20 px-3 py-1 rounded-full font-black flex items-center gap-1"><Headphones className="w-3.5 h-3.5" /> {playing ? "يعمل" : "اسمع"}</button>
        <span className="text-amber-500 font-black flex items-center gap-1 bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30"><Sparkles className="h-4 w-4" /> {score}</span>
      </div>

      <div className="p-6 rounded-3xl bg-gradient-to-br from-card via-card/95 to-secondary/30 border-2 border-accent/25 shadow-xl space-y-4">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/15 text-accent flex items-center justify-center text-4xl shadow-inner" aria-hidden="true">{question?.symbol}</div>
        <h2 className="text-2xl sm:text-3xl font-black text-foreground leading-tight">{question?.prompt}</h2>
        {question?.ayahText && <p className="rounded-2xl bg-accent/10 border border-accent/25 px-4 py-3 text-xl sm:text-2xl leading-loose font-quran text-foreground">{question.ayahText}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {choices.map((choice) => {
          const isCorrect = selected && choice === question?.answer;
          const isWrong = selected === choice && choice !== question?.answer;
          return <button key={choice} onClick={() => choose(choice)} disabled={selected !== null} className={`min-h-24 p-4 rounded-3xl border-2 transition-all flex items-center justify-center text-lg font-black shadow-lg active:scale-95 ${!selected ? "bg-gradient-to-br from-card via-card to-secondary/20 border-border hover:border-accent/70 hover:shadow-accent/10 text-foreground" : isCorrect ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400" : isWrong ? "bg-red-500/15 border-red-500 text-red-500" : "opacity-40 border-border text-muted-foreground"}`}>{choice}</button>;
        })}
      </div>

      {selected && <div className="p-4 rounded-3xl bg-secondary/50 border border-border space-y-3 animate-in fade-in zoom-in-95 duration-200">
        <p className={`font-black text-sm ${selected === question?.answer ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>{selected === question?.answer ? "إجابة صحيحة يا بطل! + نجمتان" : "استمع مرة أخرى، ثم أكمل"}</p>
        <button onClick={next} className="w-full py-3 rounded-2xl bg-accent text-accent-foreground font-black text-sm shadow-md hover:brightness-105 active:scale-98 transition-all">السؤال التالي ←</button>
      </div>}
    </div>
  );
}