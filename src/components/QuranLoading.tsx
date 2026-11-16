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
 * شاشة التحميل السريعة والمطورة للمصحف الشريف
 * تصميم إسلامي حديث، خفيف، وسريع الاستجابة بحلقات ذهبية وزمردية متحركة
 */
export const QuranLoading: React.FC<QuranLoadingProps> = ({
  fullScreen = false,
  label = "جارٍ الفتح السريع...",
  description,
  sublabel,
  progress,
  showProgressBar = false,
  minimal = false,
  className = "",
  colorVariant = "emerald",
}) => {
  const [stagedProgress, setStagedProgress] = React.useState(progress ?? 35);

  React.useEffect(() => {
    if (typeof progress === "number") {
      setStagedProgress(progress);
      return;
    }
    // تقدم فوري وسريع (120ms فقط) حتى يشعر المستخدم بالسرعة الفائقة
    const interval = setInterval(() => {
      setStagedProgress((prev) => {
        if (prev >= 95) return prev;
        return Math.min(96, prev + 12);
      });
    }, 120);
    return () => clearInterval(interval);
  }, [progress]);

  const currentPercent = Math.min(100, Math.max(0, stagedProgress));

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${
        fullScreen ? "fixed inset-0 z-[100]" : "relative w-full py-6 min-h-[160px]"
      } flex items-center justify-center overflow-hidden bg-background/85 dark:bg-[#0c120e]/90 backdrop-blur-md p-4 transition-all duration-200 animate-fade-in ${className}`}
      dir="rtl"
    >
      {/* هالة ضوئية خفيفة خلفية */}
      <div className="pointer-events-none absolute h-56 w-56 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute h-40 w-40 rounded-full bg-amber-500/10 blur-2xl" />

      <div className="relative z-10 flex flex-col items-center justify-center text-center max-w-xs animate-scale-in">
        {/* حلقة دوارة إسلامية سريعة ومضيئة */}
        <div className="relative w-16 h-16 mb-3.5 flex items-center justify-center" aria-hidden="true">
          {/* الحلقة الخارجية الدوارة بسرعة عالية */}
          <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 border-r-amber-400 animate-spin drop-shadow-[0_0_6px_rgba(16,185,129,0.45)]" style={{ animationDuration: "0.75s" }} />
          
          {/* الحلقة الداخلية العكسية */}
          <div className="absolute inset-[6px] rounded-full border-2 border-dashed border-amber-400/45 animate-spin" style={{ animationDuration: "7s", animationDirection: "reverse" }} />
          
          {/* أيقونة المركز المتوهجة */}
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40 ring-1 ring-white/30">
            <span className="text-[16px] font-amiri font-bold select-none leading-none drop-shadow">۞</span>
          </div>
        </div>

        {/* النص الرئيسي */}
        <p className="font-amiri font-black text-base sm:text-lg text-foreground">
          {label}
        </p>

        {/* شريط التقدم السريع والخفيف */}
        {(showProgressBar || typeof progress === "number") && (
          <div className="w-40 mt-2.5 space-y-1.5">
            <div className="relative h-1.5 w-full bg-foreground/10 rounded-full overflow-hidden ring-1 ring-foreground/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-[width] duration-150"
                style={{ width: `${currentPercent}%` }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-pulse" />
            </div>
            {typeof progress === "number" && (
              <span className="text-[10px] font-mono font-bold text-muted-foreground block text-center num">
                {currentPercent}%
              </span>
            )}
          </div>
        )}

        {/* نص ثانوي موجز جداً إن وجد */}
        {description && (
          <p className="mt-1 text-[11px] text-muted-foreground font-medium">
            {description}
          </p>
        )}
        {sublabel && (
          <p className="mt-0.5 text-[10px] text-accent font-bold">
            {sublabel}
          </p>
        )}
      </div>
    </div>
  );
};

export default QuranLoading;
