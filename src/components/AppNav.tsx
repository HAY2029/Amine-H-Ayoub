import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Headphones, BookOpen, Gamepad2, Settings, User, Lock, ShoppingBag, Sparkles } from "lucide-react";
import { isKidsMode, setKidsLocked, hasKidsPin } from "../data/kidsLock";
import { isPureMode, setPureMode, setKidsHidden, getAppMode, setAppMode, getCoins, getProfile, getProgress } from "../data/kidsProfile";
import ParentalGateModal from "./ParentalGateModal";
import QuranLockGateModal from "./QuranLockGateModal";
import { toast } from "../hooks/use-toast";

interface AppNavProps {
  className?: string;
  transparentBg?: boolean;
  /** When true, hide the mobile bottom nav (e.g. player is open) */
  hideBottomNav?: boolean;
}

export default function AppNav({ className = "", transparentBg = false, hideBottomNav = false }: AppNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [kidsMode, setKidsMode] = useState(isKidsMode);
  const [pureMode, setPureModeState] = useState(isPureMode);
  const [appMode, setAppModeState] = useState(getAppMode);
  const [coins, setCoins] = useState(getCoins);
  const [pinAction, setPinAction] = useState<null | "unlock" | "parent" | "settings">(null);
  const [showLockGate, setShowLockGate] = useState(false);
  const [lockGateTarget, setLockGateTarget] = useState("الألعاب");
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);

  // Animated indicator
  const navRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);

  // Track mobile vs desktop
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const isGamesLocked = () => {
    const prof = getProfile();
    const prog = getProgress();
    const goal = typeof prof.goalMinutes === "number" && prof.goalMinutes > 0 ? prof.goalMinutes : 5;
    const read = prog.minutes || 0;
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
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (isGamesLocked()) { setLockGateTarget("الألعاب"); setShowLockGate(true); return; }
    navigate("/games");
  };

  const handleShopClick = (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (isGamesLocked()) { setLockGateTarget("المتجر"); setShowLockGate(true); return; }
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

  useEffect(() => {
    requestAnimationFrame(() => {
      if (!navRef.current) return;
      const active = navRef.current.querySelector("[data-nav-active='true']") as HTMLElement | null;
      if (active) {
        const navRect = navRef.current.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        setIndicatorStyle({ left: activeRect.left - navRect.left, width: activeRect.width });
      } else {
        setIndicatorStyle(null);
      }
    });
  }, [location.pathname, kidsMode, pureMode]);

  const path = location.pathname;

  const handleParentClick = () => { if (kidsMode) setPinAction("parent"); else navigate("/parent"); };
  const handleSettingsClick = () => { if (kidsMode) setPinAction("settings"); else navigate("/settings"); };
  const handleUnlockClick = () => { setLockGateTarget("الألعاب وركن الأطفال"); setShowLockGate(true); };

  const handleEnableKidsFromPure = () => {
    setPureMode(false); setKidsHidden(false); setAppMode("parent"); refreshState();
    toast({ title: "🌟 تم تفعيل ركن الأطفال!", description: "تم الانتقال إلى وضع التنقل المرن" });
    navigate("/games");
  };

  const onPinSuccess = () => {
    if (pinAction === "unlock") { setKidsLocked(false); refreshState(); toast({ title: "تم فك قفل الأطفال بنجاح ✓" }); }
    else if (pinAction === "parent") { setKidsLocked(false); refreshState(); navigate("/parent"); }
    else if (pinAction === "settings") { sessionStorage.setItem("mushaf:settingsUnlocked", "1"); navigate("/settings"); }
    setPinAction(null);
  };

  const isActive = (p: string) => { if (p === "/audio") return path === "/audio" || path === "/"; return path === p; };

  const navBtnClass = (p: string) =>
    `nav-pill relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-2xl text-[11px] sm:text-xs font-bold transition-all duration-300 shrink-0 active:scale-95 ${
      isActive(p) ? "text-amber-950 dark:text-amber-100 font-extrabold" : "text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white"
    }`;

  /* ── Mobile Bottom Navigation Items ── */
  const getMobileNavItems = () => {
    if (kidsMode) {
      return [
        { path: "/audio", icon: Headphones, label: "التلاوات", onClick: () => navigate("/audio") },
        { path: "/mushaf", icon: BookOpen, label: "المصحف", onClick: () => navigate("/mushaf") },
        { path: "/games", icon: Gamepad2, label: "الألعاب", onClick: () => handleGamesClick(), locked: isGamesLocked() },
        { path: "/shop", icon: ShoppingBag, label: "المتجر", onClick: () => handleShopClick(), locked: isGamesLocked() },
      ];
    }
    if (pureMode) {
      return [
        { path: "/audio", icon: Headphones, label: "التلاوات", onClick: () => navigate("/audio") },
        { path: "/mushaf", icon: BookOpen, label: "المصحف", onClick: () => navigate("/mushaf") },
        { path: "/settings", icon: Settings, label: "الإعدادات", onClick: handleSettingsClick },
      ];
    }
    return [
      { path: "/audio", icon: Headphones, label: "التلاوات", onClick: () => navigate("/audio") },
      { path: "/mushaf", icon: BookOpen, label: "المصحف", onClick: () => navigate("/mushaf") },
      { path: "/games", icon: Gamepad2, label: "الألعاب", onClick: () => navigate("/games") },
      { path: "/settings", icon: Settings, label: "الإعدادات", onClick: handleSettingsClick },
    ];
  };

  /* ── Desktop Top Nav Tabs (based on mode) ── */
  const renderDesktopTabs = () => {
    if (kidsMode) {
      return (
        <div className="flex items-center justify-center gap-0.5 sm:gap-1 flex-1 overflow-x-auto no-scrollbar py-0.5 relative z-10" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <button data-nav-active={isActive("/games")} onClick={handleGamesClick} className={navBtnClass("/games")}>
            <Gamepad2 className="w-4 h-4 shrink-0" /><span>الألعاب</span>
            {isGamesLocked() && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px] font-mono font-black shrink-0 shadow-sm">
                <Lock className="w-2.5 h-2.5 animate-pulse" /><span>{getCountdownText()}</span>
              </span>
            )}
          </button>
          <button data-nav-active={isActive("/audio")} onClick={() => navigate("/audio")} className={navBtnClass("/audio")}><Headphones className="w-4 h-4 shrink-0" /><span>التلاوات</span></button>
          <button data-nav-active={isActive("/mushaf")} onClick={() => navigate("/mushaf")} className={navBtnClass("/mushaf")}><BookOpen className="w-4 h-4 shrink-0" /><span>المصحف</span></button>
          <button data-nav-active={isActive("/shop")} onClick={handleShopClick} className={navBtnClass("/shop")}>
            <ShoppingBag className="w-4 h-4 shrink-0" /><span>المتجر</span>
            {isGamesLocked() ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px] font-mono font-black shrink-0 shadow-sm">
                <Lock className="w-2.5 h-2.5 animate-pulse" /><span>{getCountdownText()}</span>
              </span>
            ) : (<span className="text-[10px] text-amber-600 dark:text-amber-400 font-black">⭐</span>)}
          </button>
        </div>
      );
    }
    if (pureMode) {
      return (
        <div className="flex items-center justify-center gap-0.5 sm:gap-1 flex-1 overflow-x-auto no-scrollbar py-0.5 relative z-10" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <button data-nav-active={isActive("/audio")} onClick={() => navigate("/audio")} className={navBtnClass("/audio")}><Headphones className="w-4 h-4 shrink-0" /><span>التلاوات</span></button>
          <button data-nav-active={isActive("/mushaf")} onClick={() => navigate("/mushaf")} className={navBtnClass("/mushaf")}><BookOpen className="w-4 h-4 shrink-0" /><span>المصحف</span></button>
          <button data-nav-active={isActive("/settings")} onClick={handleSettingsClick} className={navBtnClass("/settings")}><Settings className="w-4 h-4 shrink-0" /><span>الإعدادات</span></button>
          <button onClick={handleEnableKidsFromPure}
            className="nav-pill flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-2xl text-[11px] sm:text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 transition-all duration-300 shrink-0 active:scale-95 relative z-10">
            <Sparkles className="w-3.5 h-3.5 shrink-0 animate-pulse" /><span>ركن الأطفال</span>
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-0.5 sm:gap-1 flex-1 overflow-x-auto no-scrollbar py-0.5 relative z-10" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <button data-nav-active={isActive("/audio")} onClick={() => navigate("/audio")} className={navBtnClass("/audio")}><Headphones className="w-4 h-4 shrink-0" /><span>التلاوات</span></button>
        <button data-nav-active={isActive("/mushaf")} onClick={() => navigate("/mushaf")} className={navBtnClass("/mushaf")}><BookOpen className="w-4 h-4 shrink-0" /><span>المصحف</span></button>
        <button data-nav-active={isActive("/games")} onClick={() => navigate("/games")} className={navBtnClass("/games")}><Gamepad2 className="w-4 h-4 shrink-0" /><span>الألعاب</span></button>
        <button data-nav-active={isActive("/parent")} onClick={handleParentClick} className={navBtnClass("/parent")}><User className="w-4 h-4 shrink-0" /><span><span className="hidden min-[480px]:inline">لوحة </span>الوالدين</span></button>
        <button data-nav-active={isActive("/settings")} onClick={handleSettingsClick} className={navBtnClass("/settings")}><Settings className="w-4 h-4 shrink-0" /><span>الإعدادات</span></button>
      </div>
    );
  };

  return (
    <>
      {/* ═══════════ DESKTOP TOP NAV (hidden on mobile < 768px) ═══════════ */}
      <div className={`sticky top-0 z-40 w-full hidden md:block ${transparentBg ? "bg-transparent pointer-events-none" : ""}`}>
        {!transparentBg && (
          <div className="absolute inset-0 -bottom-2 bg-background/80 backdrop-blur-xl border-b border-border/40 shadow-sm pointer-events-none" />
        )}
        <nav dir="rtl" aria-label="شريط التنقل الذكي" className={`relative w-full max-w-2xl mx-auto px-2 sm:px-4 py-2 pointer-events-auto ${className}`}>
          <div ref={navRef} className="nav-container relative flex items-center justify-between gap-1 sm:gap-2 p-1 sm:p-1.5 rounded-2xl bg-white/60 dark:bg-stone-900/70 backdrop-blur-2xl border border-amber-400/25 dark:border-amber-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            {indicatorStyle && (
              <div className="nav-indicator absolute top-1 sm:top-1.5 h-[calc(100%-0.5rem)] sm:h-[calc(100%-0.75rem)] rounded-xl bg-gradient-to-br from-amber-400/90 to-amber-500/90 dark:from-amber-500/80 dark:to-amber-600/80 shadow-[0_4px_20px_rgba(217,165,32,0.35)] dark:shadow-[0_4px_20px_rgba(217,165,32,0.25)] pointer-events-none z-0"
                style={{ left: `${indicatorStyle.left}px`, width: `${indicatorStyle.width}px`, transition: "left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1)" }}>
                <div className="absolute inset-0 rounded-xl overflow-hidden"><div className="absolute inset-0 shimmer-gold opacity-40" /></div>
              </div>
            )}
            {renderDesktopTabs()}
            <div className="flex items-center gap-1 shrink-0 pl-0.5 relative z-10">
              {kidsMode && (
                <button onClick={handleUnlockClick} className="h-8 px-2 sm:px-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 text-[10px] sm:text-[11px] font-extrabold flex items-center gap-1 active:scale-95 transition-all duration-300 shrink-0" title="اضغط لعرض العداد التنازلي التفاعلي">
                  <Lock className="w-3.5 h-3.5 shrink-0" /><span className="hidden min-[400px]:inline">العداد التنازلي</span>
                </button>
              )}
            </div>
          </div>
        </nav>
      </div>

      {/* ═══════════ MOBILE TOP HEADER (simplified, shown on mobile only) ═══════════ */}
      <div className={`sticky top-0 z-40 w-full md:hidden ${transparentBg ? "bg-transparent pointer-events-none" : ""}`}>
        {!transparentBg && (
          <div className="absolute inset-0 bg-background/85 backdrop-blur-xl border-b border-border/30 pointer-events-none" />
        )}
        <div className="relative px-4 py-2 flex items-center justify-between pointer-events-auto" dir="rtl">
          <h1 className="font-amiri font-bold text-lg text-foreground/90">
            {path === "/audio" || path === "/" ? "التلاوات" :
             path === "/mushaf" ? "المصحف" :
             path === "/games" ? "الألعاب" :
             path === "/settings" ? "الإعدادات" :
             path === "/parent" ? "لوحة الوالدين" :
             path === "/shop" ? "المتجر" : ""}
          </h1>
          {kidsMode && (
            <button onClick={handleUnlockClick} className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 text-[10px] font-bold flex items-center gap-1 active:scale-95">
              <Lock className="w-3 h-3" /><span>{getCountdownText()}</span>
            </button>
          )}
        </div>
      </div>

      {/* ═══════════ MOBILE BOTTOM NAVIGATION ═══════════ */}
      {isMobile && (
        <div className={`mobile-bottom-nav ${hideBottomNav ? "player-open" : ""}`} dir="rtl">
          <div className="flex items-center">
            {getMobileNavItems().map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button key={item.path} onClick={item.onClick} className={`mobile-bottom-nav-item ${active ? "active" : ""}`} aria-label={item.label}>
                  <div className="relative">
                    <Icon className={`w-5 h-5 transition-all duration-300 ${active ? "scale-110" : ""}`} />
                    {(item as any).locked && <Lock className="absolute -top-1 -right-1 w-2.5 h-2.5 text-amber-500 animate-pulse" />}
                  </div>
                  <span className={`transition-all duration-300 ${active ? "font-extrabold" : ""}`}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* نافذة التحقق من ولي الأمر */}
      {pinAction && (
        <ParentalGateModal
          title={pinAction === "unlock" ? "فك قفل وضع الأطفال" : pinAction === "parent" ? "الدخول للوحة ولي الأمر" : "الدخول لإعدادات التطبيق"}
          onSuccess={onPinSuccess}
          onCancel={() => setPinAction(null)}
        />
      )}

      <QuranLockGateModal isOpen={showLockGate} onClose={() => setShowLockGate(false)} targetName={lockGateTarget} />
    </>
  );
}
