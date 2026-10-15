import React, { useMemo } from "react";
import {
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  Server,
  HardDrive,
  Gauge,
  Clock,
  Sparkles,
  RefreshCw,
  EyeOff
} from "lucide-react";
import type { SurahDownloadProgress } from "@/data/offlineDownload";

export interface SurahDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  surahNumber: number;
  surahName: string;
  progressData?: SurahDownloadProgress;
  onCancel?: () => void;
  onRetry?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 ميجابايت";
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
}

function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "قيد القياس...";
  if (bytesPerSec < 1024 * 1024) {
    return `${(bytesPerSec / 1024).toFixed(0)} كيلوبايت/ث`;
  }
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} ميجابايت/ث`;
}

function formatEstimatedTime(received?: number, total?: number, speed?: number): string {
  if (!total || !received || !speed || speed <= 0 || received >= total) {
    return "ثوانٍ معدودة";
  }
  const remainingBytes = total - received;
  const seconds = Math.ceil(remainingBytes / speed);
  if (seconds <= 1) return "ثانية واحدة";
  if (seconds === 2) return "ثانيتان";
  if (seconds <= 10) return `${seconds} ثوانٍ`;
  if (seconds < 60) return `${seconds} ثانية`;
  const minutes = Math.ceil(seconds / 60);
  return `حوالي ${minutes} دقيقة`;
}

export const SurahDownloadModal: React.FC<SurahDownloadModalProps> = ({
  isOpen,
  onClose,
  surahNumber,
  surahName,
  progressData,
  onCancel,
  onRetry,
}) => {
  if (!isOpen) return null;

  const isCompleted = progressData?.status === "completed" || (progressData?.progress || 0) >= 100;
  const isError = progressData?.status === "error";
  const progressPercent = Math.min(100, Math.max(0, progressData?.progress || 0));

  const stats = useMemo(() => {
    const received = progressData?.receivedBytes;
    const total = progressData?.totalBytes;
    const speed = progressData?.speed;

    return {
      downloadedText: total
        ? `${formatBytes(received)} من ${formatBytes(total)}`
        : received
        ? formatBytes(received)
        : "جاري الحساب...",
      speedText: formatSpeed(speed),
      estimatedTimeText: formatEstimatedTime(received, total, speed),
      serverText: progressData?.serverName || "سيرفر التخزين السحابي فائق السرعة",
    };
  }, [progressData]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`شاشة تحميل سورة ${surahName}`}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && (isCompleted || isError)) onClose();
      }}
    >
      {/* Background Decorative Glow */}
      <div className="pointer-events-none absolute w-96 h-96 rounded-full bg-amber-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -right-10 w-72 h-72 rounded-full bg-emerald-500/15 blur-3xl" />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-amber-500/30 bg-card/95 text-card-foreground p-6 sm:p-7 shadow-2xl backdrop-blur-2xl transition-all">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner transition-colors ${
                isCompleted
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500"
                  : isError
                  ? "bg-red-500/15 border-red-500/40 text-red-500"
                  : "bg-amber-500/15 border-amber-500/40 text-amber-500"
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-6 h-6 animate-scale-up" />
              ) : isError ? (
                <AlertCircle className="w-6 h-6 animate-pulse" />
              ) : (
                <Download className="w-6 h-6 animate-bounce" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  سورة رقم {surahNumber}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-stone-400" /> حفظ دائم للجهاز
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black mt-0.5 text-foreground">
                {surahName}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="إغلاق الشاشة"
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server & Status Info Banner */}
        <div className="flex items-center justify-between text-xs px-3.5 py-2 rounded-xl bg-stone-100/70 dark:bg-stone-800/40 border border-border mb-5">
          <span className="flex items-center gap-1.5 text-stone-600 dark:text-stone-300 font-medium truncate">
            <Server className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">{stats.serverText}</span>
          </span>
          <span
            className={`font-bold shrink-0 ${
              isCompleted
                ? "text-emerald-500"
                : isError
                ? "text-red-500"
                : "text-amber-500 animate-pulse"
            }`}
          >
            {isCompleted ? "اكتمل التنزيل" : isError ? "تعثر التحميل" : "جاري التحميل..."}
          </span>
        </div>

        {/* Big Percentage & Progress Bar */}
        <div className="space-y-2 mb-6">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isCompleted ? "تم الحفظ بنجاح" : isError ? "توقف التنزيل" : "نسبة الإنجاز الدقيقة"}
            </span>
            <span className="text-3xl sm:text-4xl font-black tracking-tight font-mono text-transparent bg-clip-text bg-gradient-to-l from-amber-600 via-amber-500 to-emerald-600 dark:from-amber-400 dark:to-emerald-400">
              {progressPercent}%
            </span>
          </div>

          {/* Precision Dual-Track Progress Bar */}
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800 border border-stone-300 dark:border-stone-700/80 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-200 relative overflow-hidden ${
                isCompleted
                  ? "bg-emerald-500"
                  : isError
                  ? "bg-red-500"
                  : "bg-gradient-to-r from-emerald-500 via-amber-500 to-amber-400"
              }`}
              style={{ width: `${progressPercent}%` }}
            >
              {/* Shimmer Light Reflection Effect */}
              {!isCompleted && !isError && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1.5s_infinite]" />
              )}
            </div>
          </div>
        </div>

        {/* Live Metrics Grid (Speed, Downloaded Size, Estimated Time) */}
        {!isError && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
            {/* Downloaded / Total */}
            <div className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-100/60 dark:bg-stone-800/40 border border-border text-center">
              <HardDrive className="w-4 h-4 text-amber-500 mb-1" />
              <span className="text-[10px] text-muted-foreground">الحجم</span>
              <span className="text-xs font-bold text-foreground mt-0.5 dir-ltr truncate max-w-full">
                {stats.downloadedText}
              </span>
            </div>

            {/* Current Speed */}
            <div className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-100/60 dark:bg-stone-800/40 border border-border text-center">
              <Gauge className="w-4 h-4 text-emerald-500 mb-1" />
              <span className="text-[10px] text-muted-foreground">السرعة</span>
              <span className="text-xs font-bold text-foreground mt-0.5 dir-ltr truncate max-w-full">
                {isCompleted ? "مكتمل" : stats.speedText}
              </span>
            </div>

            {/* Remaining Time */}
            <div className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-stone-100/60 dark:bg-stone-800/40 border border-border text-center">
              <Clock className="w-4 h-4 text-blue-500 mb-1" />
              <span className="text-[10px] text-muted-foreground">الوقت المتبقي</span>
              <span className="text-xs font-bold text-foreground mt-0.5 truncate max-w-full">
                {isCompleted ? "0 ثانية" : stats.estimatedTimeText}
              </span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {isError && (
          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs mb-6 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              تعذّر إكمال التحميل:
            </p>
            <p className="text-[11px] text-red-500/90 pr-5">
              {progressData?.error || "حدث انقطاع في الاتصال بالسيرفر أو شبكة الإنترنت"}
            </p>
          </div>
        )}

        {/* Completion Notice */}
        {isCompleted && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs mb-6 flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-emerald-500 shrink-0" />
            <p className="font-medium text-[11px] leading-relaxed">
              أصبحت السورة الآن محفوظة بشكل دائم في ذاكرة جهازك، وستعمل تلقائياً وبسرعة فائقة حتى لو انقطع الإنترنت تماماً.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          {isCompleted ? (
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" /> تم الحفظ، حسناً
            </button>
          ) : isError ? (
            <>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> إعادة المحاولة
                </button>
              )}
              <button
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl border border-border text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-semibold transition-colors"
              >
                إلغاء
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                title="إخفاء الشاشة ومتابعة التنزيل بالخلفية"
                className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors"
              >
                <EyeOff className="w-4 h-4" /> المتابعة في الخلفية
              </button>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="py-2.5 px-3 rounded-xl text-stone-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs font-semibold transition-colors"
                >
                  إلغاء
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SurahDownloadModal;
