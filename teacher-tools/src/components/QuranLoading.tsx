import React from "react";
import WifiLoader from "@/components/ui/wifi-loader";

export interface QuranLoadingProps {
  /** Fullscreen overlay with backdrop blur (fixed inset-0 z-[100]) */
  fullScreen?: boolean;
  /** Main loading label shown below the animated rings */
  label?: string;
  /** Optional descriptive text */
  description?: string;
  /** Optional secondary subtitle */
  sublabel?: string;
  /** Optional explicit progress percentage (0 - 100) */
  progress?: number;
  /** Show fine-grained precision progress bar */
  showProgressBar?: boolean;
  /** Use transparent borderless display */
  minimal?: boolean;
  /** Custom class names */
  className?: string;
  /** Color variant: original (blue & violet), emerald (islamic green), or gold */
  colorVariant?: "original" | "emerald" | "gold";
}

/**
 * شاشة التحميل الموحدة الملونة والفائقة الدقة
 * تستخدم محمل الواي فاي الدائري النابض مع مؤشر تقدم دقيق ونسب مئوية سلسة
 */
export const QuranLoading: React.FC<QuranLoadingProps> = ({
  fullScreen = false,
  label = "جارٍ التحميل...",
  description = "لحظات ونفتح لك صفحات القرآن الكريم",
  sublabel = "يرجى الانتظار قليلاً",
  progress,
  showProgressBar = true,
  minimal = false,
  className = "",
  colorVariant = "original",
}) => {
  const [stagedProgress, setStagedProgress] = React.useState(progress ?? 15);

  React.useEffect(() => {
    if (typeof progress === "number") {
      setStagedProgress(progress);
      return;
    }
    // تقدم تدريجي واقعي وذكي في حال عدم توفر نسبة مباشرة
    const interval = setInterval(() => {
      setStagedProgress((prev) => {
        if (prev >= 92) return prev;
        const jump = prev < 50 ? Math.random() * 8 + 4 : Math.random() * 4 + 1;
        return Math.min(94, Math.round(prev + jump));
      });
    }, 450);
    return () => clearInterval(interval);
  }, [progress]);

  const colorProps =
    colorVariant === "emerald"
      ? { frontColor: "#10b981", backColor: "rgba(16, 185, 129, 0.2)", bgColor: "#34d399", textColor: "#059669" }
      : colorVariant === "gold"
      ? { frontColor: "#d97706", backColor: "rgba(245, 158, 11, 0.2)", bgColor: "#fbbf24", textColor: "#b45309" }
      : { originalColors: true };

  const currentPercent = Math.min(100, Math.max(0, stagedProgress));

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${
        fullScreen ? "fixed inset-0 z-[100]" : "relative w-full py-8 min-h-[220px]"
      } flex items-center justify-center overflow-hidden bg-gradient-to-br from-background/95 via-background/90 to-card/90 backdrop-blur-md p-4 transition-all duration-300 ${className}`}
    >
      {/* هالات إضاءة ملونة خلفية متحركة */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-[#4f29f0]/15 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-[#62abff]/15 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-44 w-44 rounded-full bg-amber-400/10 blur-2xl" />

      {minimal ? (
        <div className="relative z-10 flex flex-col items-center justify-center text-center max-w-xs">
          <WifiLoader text={label} {...colorProps} />
          {showProgressBar && (
            <div className="w-48 mt-8 space-y-1.5">
              <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono font-semibold">
                <span>نسبة التحميل</span>
                <span>{currentPercent}%</span>
              </div>
              <div className="h-1.5 w-full bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${currentPercent}%` }}
                />
              </div>
            </div>
          )}
          {description && (
            <p className="mt-4 text-xs font-semibold text-muted-foreground animate-fade-in">
              {description}
            </p>
          )}
        </div>
      ) : (
        <div className="card-nour relative z-10 w-full max-w-xs sm:max-w-sm overflow-hidden rounded-3xl border border-border/80 bg-card/90 p-7 text-center shadow-2xl backdrop-blur-xl">
          {/* شريط توهج علوي خفيف */}
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

          {/* محمل الحلقات الملونة النابضة مع مسح النص الضوئي */}
          <div className="my-5 flex justify-center">
            <WifiLoader text={label} {...colorProps} />
          </div>

          {/* شريط التقدم الفائق الدقة مع النسبة المئوية */}
          {showProgressBar && (
            <div className="my-4 px-2 space-y-1.5">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-[11px] text-muted-foreground font-medium">اكتمال المعالجة</span>
                <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
                  {currentPercent}%
                </span>
              </div>
              <div className="h-2 w-full bg-stone-200 dark:bg-stone-800/80 rounded-full overflow-hidden p-0.5 border border-stone-300 dark:border-stone-700">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-amber-500 to-emerald-500 rounded-full transition-all duration-300 relative overflow-hidden"
                  style={{ width: `${currentPercent}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1.5s_infinite]" />
                </div>
              </div>
            </div>
          )}

          {/* النصوص التوضيحية */}
          {description && (
            <p className="mt-3 text-xs font-bold text-foreground/90 sm:text-sm">
              {description}
            </p>
          )}
          {sublabel && (
            <p className="mt-1.5 text-[11px] font-extrabold tracking-wide text-accent animate-pulse">
              {sublabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default QuranLoading;
