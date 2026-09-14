import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Headphones, BookOpen, Gamepad2, Settings, User, Lock, ShoppingBag, Sparkles } from "lucide-react";
import { isKidsMode, setKidsLocked, hasKidsPin } from "../data/kidsLock";
import { isPureMode, setPureMode, setKidsHidden, getAppMode, setAppMode, getCoins, getProfile, getProgress } from "../data/kidsProfile";
import ParentalGateModal from "./ParentalGateModal";
import QuranLockGateModal from "./QuranLockGateModal";
import { toast } from "../hooks/use-toast";

interface AppNavProps {
  className?: string;
}

export default function AppNav({ className = "" }: AppNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [kidsMode, setKidsMode] = useState(isKidsMode);
  const [pureMode, setPureModeState] = useState(isPureMode);
  const [appMode, setAppModeState] = useState(getAppMode);
  const [coins, setCoins] = useState(getCoins);
  const [pinAction, setPinAction] = useState<null | "unlock" | "parent" | "settings">(null);
  const [showLockGate, setShowLockGate] = useState(false);
  const [lockGateTarget, setLockGateTarget] = useState("الألعاب");

  const isGamesLocked = () => {
    const prof = getProfile();
    const prog = getProgress();
    // وقت مدارسة القرآن (افتراضياً 5 دقائق إن لم يحدد الولي)
    const goal = typeof prof.goalMinutes === "number" && prof.goalMinutes > 0 ? prof.goalMinutes : 5;
    const read = prog.minutes || 0;
    // طالما أن الطفل في وقت الدراسة ولم يكمل الدقائق المطلوبة: لا يدخل وتكون الألعاب مقفلة!
    if (read < goal) return true;
    if (prog.playExpired) return true;
    return false;
  };

  const getCountdownText = () => {
    const prof = getProfile();
    const prog = getProgress();
    const goal = typeof prof.goalMinutes === "number" && prof.goalMinutes > 0 ? prof.goalMinutes : 5;
    const read = prog.minutes || 0;
    const remSec = Math.max(0, Math.round((goal - read) * 60));
    const m = Math.floor(remSec / 60);
    const s = remSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleGamesClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // لا يدخل للألعاب طالما أنه في وقت الدراسة، بل يعرض العداد التنازلي فوراً
    if (isGamesLocked()) {
      setLockGateTarget("الألعاب");
      setShowLockGate(true);
      return;
    }
    navigate("/games");
  };

  const handleShopClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // لا يدخل للمتجر طالما أنه في وقت الدراسة، بل يعرض العداد التنازلي فوراً بنفس طريقة الألعاب
    if (isGamesLocked()) {
      setLockGateTarget("المتجر");
      setShowLockGate(true);
      return;
    }
    navigate("/shop");
  };

  const refreshState = () => {
    setKidsMode(isKidsMode());
    setPureModeState(isPureMode());
    setAppModeState(getAppMode());
    setCoins(getCoins());
  };

  useEffect(() => {
    refreshState();
    const evts = ["mushaf:kidsmode", "mushaf:appmode", "mushaf:coins", "focus", "storage"];
    evts.forEach(e => window.addEventListener(e, refreshState));
    return () => evts.forEach(e => window.removeEventListener(e, refreshState));
  }, []);

  const path = location.pathname;

  const handleParentClick = () => {
    if (kidsMode) {
      setPinAction("parent");
    } else {
      navigate("/parent");
    }
  };

  const handleSettingsClick = () => {
    if (kidsMode) {
      setPinAction("settings");
    } else {
      navigate("/settings");
    }
  };

  const handleUnlockClick = () => {
    setLockGateTarget("الألعاب وركن الأطفال");
    setShowLockGate(true);
  };

  const handleEnableKidsFromPure = () => {
    setPureMode(false);
    setKidsHidden(false);
    setAppMode("parent");
    refreshState();
    toast({ title: "🌟 تم تفعيل ركن الأطفال!", description: "تم الانتقال إلى وضع التنقل المرن" });
    navigate("/games");
  };

  const onPinSuccess = () => {
    if (pinAction === "unlock") {
      setKidsLocked(false);
      refreshState();
      toast({ title: "تم فك قفل الأطفال بنجاح ✓" });
    } else if (pinAction === "parent") {
      setKidsLocked(false);
      refreshState();
      navigate("/parent");
    } else if (pinAction === "settings") {
      sessionStorage.setItem("mushaf:settingsUnlocked", "1");
      navigate("/settings");
    }
    setPinAction(null);
  };

  return (
    <>
      <nav
        dir="rtl"
        aria-label="شريط التنقل الذكي"
        className={`w-full max-w-2xl mx-auto px-2 sm:px-4 py-2 ${className}`}
      >
        <div className="flex items-center justify-between gap-1 sm:gap-2 p-1 sm:p-1.5 rounded-2xl bg-card/90 backdrop-blur-md border border-border/70 shadow-md">
          {/* 1. قائمة التبويبات حسب الوضع الحالي */}
          {kidsMode ? (
            /* 👶 وضع الأطفال المقفل: محصور في صفحات الأطفال، والتنقل للخارج يطلب PIN */
            <div 
              className="flex items-center justify-start sm:justify-center gap-1 sm:gap-1.5 flex-1 overflow-x-auto no-scrollbar py-0.5"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <button
                onClick={handleGamesClick}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/games"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <Gamepad2 className="w-4 h-4 shrink-0" />
                <span>الألعاب</span>
                {isGamesLocked() && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-500 text-[10px] font-mono font-black shrink-0 shadow-sm" title="وقت الدراسة: اضغط لعرض العداد التنازلي">
                    <Lock className="w-2.5 h-2.5 animate-pulse" />
                    <span>{getCountdownText()}</span>
                  </span>
                )}
              </button>

              <button
                onClick={() => navigate("/audio")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/audio" || path === "/"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <Headphones className="w-4 h-4 shrink-0" />
                <span>التلاوات</span>
              </button>

              <button
                onClick={() => navigate("/mushaf")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/mushaf"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>المصحف</span>
              </button>

              <button
                onClick={handleShopClick}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/shop"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span>المتجر</span>
                {isGamesLocked() ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-500 text-[10px] font-mono font-black shrink-0 shadow-sm" title="وقت الدراسة: اضغط لعرض العداد التنازلي">
                    <Lock className="w-2.5 h-2.5 animate-pulse" />
                    <span>{getCountdownText()}</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-accent font-black">⭐</span>
                )}
              </button>
            </div>
          ) : pureMode ? (
            /* 🎧 الوضع العادي الصارم (للكبار فقط): تلاوات، إعدادات، وزر استرجاع ركن الأطفال */
            <div 
              className="flex items-center justify-start sm:justify-center gap-1 sm:gap-1.5 flex-1 overflow-x-auto no-scrollbar py-0.5"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <button
                onClick={() => navigate("/audio")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/audio" || path === "/"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <Headphones className="w-4 h-4 shrink-0" />
                <span>التلاوات</span>
              </button>

              <button
                onClick={() => navigate("/mushaf")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/mushaf"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>المصحف</span>
              </button>

              <button
                onClick={handleSettingsClick}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/settings"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>الإعدادات</span>
              </button>

              <button
                onClick={handleEnableKidsFromPure}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold text-amber-500 bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 transition-all shrink-0 active:scale-95"
                title="تفعيل ركن الأطفال والألعاب والتحويل للوضع المرن"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>ركن الأطفال</span>
              </button>
            </div>
          ) : (
            /* 🔄 وضع التنقل المرن ووضع الولي: تنقل كامل وشامل في كل التطبيق */
            <div 
              className="flex items-center justify-start sm:justify-center gap-1 sm:gap-1.5 flex-1 overflow-x-auto no-scrollbar py-0.5"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <button
                onClick={() => navigate("/audio")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/audio" || path === "/"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <Headphones className="w-4 h-4 shrink-0" />
                <span>التلاوات</span>
              </button>

              <button
                onClick={() => navigate("/mushaf")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/mushaf"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>المصحف</span>
              </button>

              <button
                onClick={() => navigate("/games")}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/games"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <Gamepad2 className="w-4 h-4 shrink-0" />
                <span>الألعاب</span>
              </button>

              <button
                onClick={handleParentClick}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/parent"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <User className="w-4 h-4 shrink-0" />
                <span><span className="hidden min-[480px]:inline">لوحة </span>الوالدين</span>
              </button>

              <button
                onClick={handleSettingsClick}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 active:scale-95 ${
                  path === "/settings"
                    ? "bg-accent text-accent-foreground shadow-sm font-extrabold"
                    : "text-foreground/80 hover:bg-secondary"
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>الإعدادات</span>
              </button>
            </div>
          )}

          {/* 2. شارة الوضع وقفل الأمان في الطرف الأيسر */}
          <div className="flex items-center gap-1 shrink-0 pl-0.5">
            {kidsMode && (
              <button
                onClick={handleUnlockClick}
                className="h-8 px-2 sm:px-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 hover:bg-amber-500/25 text-[10px] sm:text-[11px] font-extrabold flex items-center gap-1 active:scale-95 transition-transform shrink-0"
                title="اضغط لعرض العداد التنازلي التفاعلي"
              >
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden min-[400px]:inline">العداد التنازلي</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* نافذة التحقق من ولي الأمر عند محاولة الخروج أو الدخول لمنطقة الوالدين */}
      {pinAction && (
        <ParentalGateModal
          title={
            pinAction === "unlock"
              ? "فك قفل وضع الأطفال"
              : pinAction === "parent"
              ? "الدخول للوحة ولي الأمر"
              : "الدخول لإعدادات التطبيق"
          }
          onSuccess={onPinSuccess}
          onCancel={() => setPinAction(null)}
        />
      )}

      {/* شاشة عداد القرآن المتبقي لفتح الألعاب */}
      <QuranLockGateModal
        isOpen={showLockGate}
        onClose={() => setShowLockGate(false)}
        targetName={lockGateTarget}
      />
    </>
  );
}
