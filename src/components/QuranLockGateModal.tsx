import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Headphones, BookOpen, KeyRound, X, Clock, Sparkles, Star, Play, Timer } from "lucide-react";
import { getProgress, getProfile, unlockToday, formatCoins, getCoins } from "@/data/kidsProfile";
import { hasKidsPin } from "@/data/kidsLock";
import ParentalGateModal from "./ParentalGateModal";
import { toast } from "@/hooks/use-toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  targetName?: string; // "الألعاب" أو "المتجر"
}

export default function QuranLockGateModal({ isOpen, onClose, targetName = "الألعاب" }: Props) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(getProgress);
  const [profile, setProfile] = useState(getProfile);
  const [showPin, setShowPin] = useState(false);
  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const sync = () => {
      setProgress(getProgress());
      setProfile(getProfile());
    };
    sync();

    // تحديث العداد دورياً
    const timer = setInterval(() => {
      sync();
      setTicker((t) => t + 1);
    }, 1000);

    window.addEventListener("mushaf:reading_progress", sync);
    window.addEventListener("mushaf:activeprofile", sync);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("mushaf:reading_progress", sync);
      window.removeEventListener("mushaf:activeprofile", sync);
      window.removeEventListener("focus", sync);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // هدف القراءة (افتراضياً 5 دقائق إن لم يحدد)
  const goal = typeof profile.goalMinutes === "number" && profile.goalMinutes > 0 ? profile.goalMinutes : 5;
  const minutesRead = progress.minutes || 0;
  const isPlayExpired = progress.playExpired;

  // حساب الثواني المتبقية بدقة للعد التنازلي الحي
  const totalRemainingSeconds = Math.max(0, Math.round((goal - minutesRead) * 60));
  const remMinutes = Math.floor(totalRemainingSeconds / 60);
  const remSeconds = totalRemainingSeconds % 60;
  const isCompleted = totalRemainingSeconds <= 0 && !isPlayExpired;
  const pct = Math.min(100, Math.round((minutesRead / Math.max(1, goal)) * 100));

  const handleStartReading = () => {
    onClose();
    navigate("/audio");
  };

    // رسائل ذكية عند انتهاء وقت اللعب
  const isTimeUp = !!progress.playExpired;
  const handleParentUnlock = () => {
    unlockToday();
    setShowPin(false);
    toast({
      title: isTimeUp
        ? "🎉 شكراً يا ولي الأمر! 🌟 تم منح وقت لعب إضافي للطفل الآن."
        : "🎉 فُتحت الألعاب بنجاح لهذا اليوم بإذن ولي الأمر!",
    });
    onClose();
    navigate("/games");
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in"
        onClick={onClose}
        dir="rtl"
      >
        <div 
          className="relative w-full max-w-sm bg-card rounded-3xl shadow-2xl border-2 border-amber-500/50 p-5 sm:p-6 text-center space-y-4 animate-fade-up overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* هالات خلفية ذهبية خفيفة */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />

          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>

          {/* شارة القفل الذهبية المتوهجة */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/25 via-amber-500/15 to-transparent border border-amber-500/40 flex items-center justify-center text-amber-500 shadow-inner">
            <Lock className="w-8 h-8 animate-pulse text-amber-500" />
          </div>

          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 px-3 py-0.5 rounded-full border border-amber-500/30">
              <Timer className="w-3.5 h-3.5" /> وقت مدارسة القرآن الكريم
            </span>
            <h3 className="text-xl font-black text-foreground">
              {targetName} مقفلة حتى تكمل وردك
            </h3>
            <p className="text-xs text-muted-foreground font-bold">
              {isPlayExpired
                ? "انتهى وقت اللعب لليوم، حان وقت تلاوة كتاب الله"
                : "أنت في وقت مدارسة القرآن! أكمل الوقت لفتح الألعاب تلقائياً"}
            </p>
          </div>

          {/* ── العداد التنازلي الرقمي الحي (ساعة إلكترونية فخمة) ── */}
          <div className="p-4 rounded-2xl bg-gradient-to-b from-secondary/80 to-secondary/40 border border-border/80 shadow-inner space-y-3">
            <span className="text-[11px] font-bold text-muted-foreground flex items-center justify-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-accent animate-pulse" />
              <span>العداد التنازلي المتبقي لفتح الألعاب:</span>
            </span>

            {/* أرقام العداد التنازلي الضخمة (دقائق وثوانٍ) */}
            <div className="flex items-center justify-center gap-3 py-1" dir="rtl">
              {/* الدقائق */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-black/70 border-2 border-amber-500/60 flex items-center justify-center shadow-lg">
                  <span className="font-mono text-3xl sm:text-4xl font-black text-amber-400 tracking-wider">
                    {String(remMinutes).padStart(2, "0")}
                  </span>
                </div>
                <span className="text-[11px] font-black text-muted-foreground mt-1">دقائق</span>
              </div>

              {/* نقطتا الفصل الوامضتان */}
              <div className="text-3xl font-black text-amber-500 animate-pulse pb-4">:</div>

              {/* الثواني */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-black/70 border-2 border-amber-500/60 flex items-center justify-center shadow-lg">
                  <span className="font-mono text-3xl sm:text-4xl font-black text-amber-400 tracking-wider">
                    {String(remSeconds).padStart(2, "0")}
                  </span>
                </div>
                <span className="text-[11px] font-black text-muted-foreground mt-1">ثوانٍ</span>
              </div>
            </div>

            {/* شريط الإنجاز */}
            <div className="space-y-1 pt-1" dir="rtl">
              <div className="h-2.5 rounded-full bg-card border border-border/50 overflow-hidden p-0.5">
                <div 
                  className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400 transition-all duration-500 shadow-sm"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-bold text-muted-foreground px-1">
                <span>استمعت: <b className="text-emerald-500 font-black">{minutesRead}</b> د</span>
                <span>الهدف: <b className="text-foreground font-black">{goal}</b> د</span>
              </div>
            </div>

            <div className="pt-0.5 flex items-center justify-center gap-1 text-[11px] text-amber-500 font-bold">
              <Star className="w-3.5 h-3.5 fill-amber-500" />
              <span>تربح 2 نجمة عن كل دقيقة استماع للقرآن ⭐</span>
            </div>
          </div>

          {/* الأزرار والإجراءات */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={handleStartReading}
              className="w-full p-3.5 rounded-2xl bg-gradient-to-l from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg"
            >
              <Headphones className="w-5 h-5" />
              <span>استمع الآن للقرآن لتشغيل العداد 📖</span>
            </button>

            <button
              onClick={onClose}
              className="w-full p-2.5 rounded-xl bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-border/60"
            >
              <span>متابعة التصفح</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
