import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Headphones, BookOpen, Gamepad2, Settings, User, Lock, ShoppingBag, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
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
  position?: "inside" | "top" | "bottom";
  onCyclePosition?: () => void;
}

export default function AppNav({
  className = "",
  transparentBg = false,
  hideBottomNav = false,
  position = "inside",
  onCyclePosition,
}: AppNavProps) {
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
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

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
    const updateIndicator = () => {
      if (!navRef.current) return;
      const active = navRef.current.querySelector("[data-nav-active='true']") as HTMLElement | null;
      if (active) {
        const navRect = navRef.current.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const left = Math.max(0, activeRect.left - navRect.left);
        const width = Math.min(activeRect.width, navRect.width - left);
        setIndicatorStyle({ left, width });
      } else {
        setIndicatorStyle(null);
      }
    };

    const rafId = requestAnimationFrame(updateIndicator);
    const timer = setTimeout(updateIndicator, 60);
    window.addEventListener("resize", updateIndicator);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
      window.removeEventListener("resize", updateIndicator);
    };
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

  /* ── Tab Renderer with Circular Icon Badges ── */
  const renderNavTab = (p: string, label: React.ReactNode, Icon: any, onClick: () => void, extra?: React.ReactNode) => {
    const active = isActive(p);
    const getTargetTag = (pathStr: string) => {
      if (pathStr === "/audio") return "cyan-audio";
      if (pathStr === "/mushaf") return "emerald-mushaf";
      if (pathStr === "/games") return "purple-games";
      if (pathStr === "/shop") return "pink-shop";
      if (pathStr === "/settings") return "orange-settings";
      if (pathStr === "/parent") return "amber-parent";
      return undefined;
    };
    return (
      <button
        key={p}
        data-nav-active={active}
        data-color-target={getTargetTag(p)}
        onClick={onClick}
        className={`group nav-pill relative flex items-center justify-center gap-1 sm:gap-1.5 md:gap-2 px-2 sm:px-2.5 md:px-3 lg:px-4 py-1.5 sm:py-2 rounded-full text-xs md:text-sm font-bold transition-all duration-300 active:scale-95 ${
          active
            ? "text-white font-black shadow-md shadow-amber-500/25"
            : "text-stone-700 dark:text-stone-200 hover:text-amber-800 dark:hover:text-amber-300"
        }`}
      >
        <div
          className={`w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center transition-all duration-300 shrink-0 ${
            active
              ? "bg-white/20 text-white shadow-inner scale-105"
              : "bg-amber-500/10 dark:bg-amber-400/15 text-amber-700 dark:text-amber-400 group-hover:bg-amber-500/20 group-hover:scale-110"
          }`}
        >
          <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 shrink-0" />
        </div>
        <span className="leading-none whitespace-nowrap">{label}</span>
        {extra}
      </button>
    );
  };

  /* ── Tabs (based on mode) with Circular Styling ── */
  const renderTabs = () => {
    if (kidsMode) {
      return (
        <div className="flex items-center justify-center gap-0.5 sm:gap-1 md:gap-1.5 flex-1 py-0.5 relative z-10 w-full">
          {renderNavTab("/games", "الألعاب", Gamepad2, handleGamesClick, isGamesLocked() && (
            <Lock className={`w-3 h-3 ${isActive("/games") ? "text-amber-200" : "text-amber-600 dark:text-amber-400"} animate-pulse shrink-0`} />
          ))}
          {renderNavTab("/audio", "التلاوات", Headphones, () => navigate("/audio"))}
          {renderNavTab("/mushaf", "المصحف", BookOpen, () => navigate("/mushaf"))}
          {renderNavTab("/shop", "المتجر", ShoppingBag, handleShopClick, isGamesLocked() ? (
            <Lock className={`w-3 h-3 ${isActive("/shop") ? "text-amber-200" : "text-amber-600 dark:text-amber-400"} animate-pulse shrink-0`} />
          ) : (
            <span className="text-[10px] text-amber-500 font-black">⭐</span>
          ))}
        </div>
      );
    }
    if (pureMode) {
      return (
        <div className="flex items-center justify-center gap-0.5 sm:gap-1 md:gap-1.5 flex-1 py-0.5 relative z-10 w-full">
          {renderNavTab("/audio", "التلاوات", Headphones, () => navigate("/audio"))}
          {renderNavTab("/mushaf", "المصحف", BookOpen, () => navigate("/mushaf"))}
          {renderNavTab("/settings", "الإعدادات", Settings, handleSettingsClick)}
          <button
            onClick={handleEnableKidsFromPure}
            className="nav-pill flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 transition-all duration-300 shrink-0 active:scale-95 relative z-10"
          >
            <div className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 shrink-0 animate-pulse text-amber-500" />
            </div>
            <span>ركن الأطفال</span>
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-0.5 sm:gap-1 md:gap-1.5 flex-1 py-0.5 relative z-10 w-full">
        {renderNavTab("/audio", "التلاوات", Headphones, () => navigate("/audio"))}
        {renderNavTab("/mushaf", "المصحف", BookOpen, () => navigate("/mushaf"))}
        {renderNavTab("/games", "الألعاب", Gamepad2, () => navigate("/games"))}
        {renderNavTab(
          "/parent",
          <>
            <span className="hidden xl:inline">لوحة </span>
            <span>الوالدين</span>
          </>,
          User,
          handleParentClick
        )}
        {renderNavTab("/settings", "الإعدادات", Settings, handleSettingsClick)}
      </div>
    );
  };

  return (
    <>
      {/* ═══════════ FLOATING CIRCULAR NAV DOCK (شريط التنقل الدائري العائم الفاخر) ═══════════ */}
      {!isMobile && <div className={`w-full ${transparentBg ? "bg-transparent pointer-events-none" : "py-1 sm:py-2"} ${className}`}>
        <nav dir="rtl" aria-label="شريط التنقل الذكي الدائري" className="relative w-full max-w-3xl mx-auto px-1 sm:px-3 pointer-events-auto">
          <div
            ref={navRef}
            className="nav-container relative flex items-center justify-between gap-1 sm:gap-2 p-1 sm:p-1.5 md:p-2 rounded-full overflow-hidden bg-white/95 dark:bg-stone-900/95 backdrop-blur-2xl border-2 border-amber-400/50 dark:border-amber-500/40 shadow-[0_10px_35px_rgba(217,119,6,0.18),0_2px_8px_rgba(0,0,0,0.06)] ring-4 ring-amber-400/15 dark:ring-amber-500/10"
          >
            {/* مؤشر التنقل الدائري الانسيابي الذهبي */}
            {indicatorStyle && (
              <div
                className="nav-indicator absolute top-1 sm:top-1.5 md:top-2 h-[calc(100%-0.5rem)] sm:h-[calc(100%-0.75rem)] md:h-[calc(100%-1rem)] rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 shadow-[0_4px_18px_rgba(245,158,11,0.55)] pointer-events-none z-0"
                style={{
                  left: `${indicatorStyle.left}px`,
                  width: `${indicatorStyle.width}px`,
                  transition: "left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div className="absolute inset-0 shimmer-gold opacity-35" />
                </div>
              </div>
            )}

            {/* أزرار التنقل الدائرية الرئيسية (المصحف، التلاوات، الألعاب، الإعدادات...) */}
            {renderTabs()}

            {/* عناصر التحكم الجانبية الدائرية: قفل الأطفال وتبديل الموضع */}
            {kidsMode && (
              <div className="flex items-center gap-1.5 shrink-0 pl-1 relative z-10">
                <button
                  onClick={handleUnlockClick}
                  className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[11px] sm:text-xs font-mono font-extrabold flex items-center gap-1.5 active:scale-95 transition-all duration-300 shrink-0 shadow-xs"
                  title="انقر لفك قفل وضع الأطفال أو عرض تفاصيل الوقت"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="hidden sm:inline">{isGamesLocked() ? getCountdownText() : "مفتوح"}</span>
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>}

      {/* ═══════════ MOBILE BOTTOM NAVIGATION ═══════════ */}
      {isMobile && !isNavCollapsed && createPortal((
        <div className={`mobile-bottom-nav ${hideBottomNav ? "player-open" : ""}`} dir="rtl">
          <div className="flex items-center relative">
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
            <button
              onClick={() => setIsNavCollapsed(true)}
              className="px-1 text-stone-400 hover:text-amber-600 active:scale-95 transition-all shrink-0"
              title="إخفاء الشريط مؤقتاً لمشاهدة كامل اللوحة"
              aria-label="إخفاء الشريط"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      ), document.body)}

      {/* زر عائم صغير لإظهار شريط التنقل عند إخفائه */}
      {isMobile && isNavCollapsed && !hideBottomNav && createPortal((
        <button
          onClick={() => setIsNavCollapsed(false)}
          className="fixed bottom-2 left-1/2 -translate-x-1/2 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-amber-400/50 shadow-lg text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all animate-bounce"
          title="إظهار شريط التنقل"
        >
          <ChevronUp className="w-3.5 h-3.5 text-amber-600" />
          <span>القائمة</span>
        </button>
      ), document.body)}

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
