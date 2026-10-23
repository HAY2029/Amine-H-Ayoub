import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Headphones, X, Clock, Star, Timer, Check } from "lucide-react";
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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
    if (isCompleted) navigate(targetName === "المتجر" ? "/shop" : "/games");
    else navigate("/audio");
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
        className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-5 animate-fade-in"
        onClick={onClose}
        dir="rtl"
      >
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="quran-gate-title"
          className="relative w-full max-w-[360px] bg-[#10231d] text-white rounded-[28px] shadow-[0_24px_90px_rgba(0,0,0,.55)] border border-amber-400/35 p-4 sm:p-5 text-center space-y-3.5 animate-fade-up overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* هالات خلفية ذهبية خفيفة */}
          <div aria-hidden="true" className="absolute -top-16 -right-12 w-40 h-40 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
          <div aria-hidden="true" className="absolute -bottom-16 -left-12 w-40 h-40 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

          <button 
            onClick={onClose}
            className="absolute top-3 left-3 z-10 p-2 rounded-full bg-white/5 text-white/55 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>

          {/* شارة القفل الذهبية المتوهجة */}
          <div className={`relative mx-auto w-14 h-14 rounded-[20px] border flex items-center justify-center shadow-inner ${isCompleted ? "bg-emerald-400/10 border-emerald-300/30 text-emerald-300" : "bg-amber-400/10 border-amber-300/25 text-amber-300"}`}>
            {isCompleted ? <Check className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
            <span className={`absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${isCompleted ? "bg-emerald-400 text-emerald-950" : "bg-amber-400 text-amber-950"}`}>
              {isCompleted ? "✓" : "!"}
            </span>
          </div>

          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-amber-200/90 px-3 py-1 rounded-full bg-amber-300/10 border border-amber-300/15">
              <Timer className="w-3.5 h-3.5" /> وقت مدارسة القرآن الكريم
            </span>
            <h3 id="quran-gate-title" className="text-lg sm:text-xl font-black text-white leading-snug">
              {isCompleted ? `أحسنت! فُتحت ${targetName}` : `${targetName} مقفلة حتى تكمل وردك`}
            </h3>
            <p className="text-[11px] text-white/60 font-medium leading-relaxed">
              {isCompleted
                ? "أكملت وقت الاستماع اليومي، استمتع بوقتك!"
                : isPlayExpired
                ? "انتهى وقت اللعب لليوم، حان وقت تلاوة كتاب الله"
                : "استمع للقرآن لإكمال وقتك وفتح الألعاب تلقائياً"}
            </p>
          </div>

          {/* ── العداد التنازلي الرقمي الحي (ساعة إلكترونية فخمة) ── */}
          <div className="p-3.5 rounded-[22px] bg-white/[0.045] border border-white/[0.08] shadow-inner space-y-3">
            <span className="text-[10px] font-bold text-white/55 flex items-center justify-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-300" />
              <span>{isCompleted ? `اكتمل وقت ${targetName}` : "الوقت المتبقي لإكمال وردك"}</span>
            </span>

            {/* أرقام العداد التنازلي الضخمة (دقائق وثوانٍ) */}
            <div className="flex items-center justify-center gap-3 py-1" dir="rtl">
              {/* الدقائق */}
              <div className="flex flex-col items-center">
                <div className={`w-[58px] h-[58px] sm:w-16 sm:h-16 rounded-[18px] bg-[#06130f] border-2 flex items-center justify-center shadow-lg ${isCompleted ? "border-emerald-300/45" : "border-amber-400/55"}`}>
                  <span className={`font-mono text-3xl sm:text-4xl font-black tracking-wider tabular-nums ${isCompleted ? "text-emerald-300" : "text-amber-300"}`}>
                    {String(remMinutes).padStart(2, "0")}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-white/50 mt-1">دقائق</span>
              </div>

              {/* نقطتا الفصل الوامضتان */}
              <div className="text-3xl font-black text-amber-300/70 pb-4">:</div>

              {/* الثواني */}
              <div className="flex flex-col items-center">
                <div className={`w-[58px] h-[58px] sm:w-16 sm:h-16 rounded-[18px] bg-[#06130f] border-2 flex items-center justify-center shadow-lg ${isCompleted ? "border-emerald-300/45" : "border-amber-400/55"}`}>
                  <span className={`font-mono text-3xl sm:text-4xl font-black tracking-wider tabular-nums ${isCompleted ? "text-emerald-300" : "text-amber-300"}`}>
                    {String(remSeconds).padStart(2, "0")}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-white/50 mt-1">ثوانٍ</span>
              </div>
            </div>

            {/* شريط الإنجاز */}
            <div className="space-y-1 pt-1" dir="rtl">
              <div className="h-2 rounded-full bg-black/30 overflow-hidden" role="progressbar" aria-label="تقدم وقت الاستماع" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, minutesRead)}>
                <div 
                  className="h-full rounded-full bg-gradient-to-l from-emerald-300 to-emerald-500 transition-all duration-500 shadow-[0_0_12px_rgba(52,211,153,.25)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-bold text-white/45 px-0.5">
                <span>استمعت: <b className="text-emerald-300 font-black">{minutesRead}</b> د</span>
                <span>الهدف: <b className="text-white/80 font-black">{goal}</b> د</span>
              </div>
            </div>

            <div className="pt-0.5 flex items-center justify-center gap-1.5 text-[10px] text-amber-200/80 font-bold">
              <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
              <span>نجمتان لكل دقيقة استماع</span>
            </div>
          </div>

          {/* الأزرار والإجراءات */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={handleStartReading}
              className="w-full min-h-11 px-4 py-2.5 rounded-2xl bg-gradient-to-l from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-[#06251b] font-black text-sm flex items-center justify-center gap-2 active:scale-[.98] transition-all shadow-lg shadow-emerald-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10231d]"
            >
              {isCompleted ? <Check className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
              <span>{isCompleted ? `انتقل إلى ${targetName}` : "استمع الآن للقرآن"}</span>
            </button>

            <button
              onClick={onClose}
              className="w-full min-h-10 p-2.5 rounded-xl bg-white/[0.045] hover:bg-white/[0.08] text-white/55 hover:text-white/85 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[.98] border border-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <span>متابعة التصفح</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
