import { Eye, EyeOff, Minimize2, Pause, Play, Repeat, Settings, X } from "lucide-react";

/**
 * 🎧 شريط التحكم الصوتي العائم (Audio HUD)
 * ----------------------------------------
 * كبسولة شفافة تطفو أسفل صفحة المصحف في وضع القراءة الغامر، بلا أي شريط مشتت:
 *  - تشغيل / إيقاف
 *  - تكرار الآية
 *  - سرعة التلاوة  *  - المدى النشط «من ← إلى» مع إمكانية إلغائه
 *  - إخفاء/إظهار تظليل الآيات بنقرة واحدة
 *  - الإعدادات والخروج من الوضع الغامر
 *
 * ⚠️ ألوان التظليل لا تُعدَّل من هنا: مكانها الوحيد صفحة الإعدادات،
 * والقارئ يطبّقها لحظياً متى تغيّرت.
 */
interface Props {
  visible: boolean;
  isPlaying: boolean;
  needsTap: boolean;
  surahLabel: string;
  ayahLabel: string;
  repeatLabel: string;
  speed: number;
  range: { from: number; to: number } | null;
  /** التظليل مخفي حالياً؟ (الزر يُعيد إظهاره بالنقر مرة أخرى) */
  shadingHidden: boolean;
  onTogglePlay: () => void;
  onCycleRepeat: () => void;
  onCycleSpeed: () => void;
  onToggleShading: () => void;
  onClearRange: () => void;
  onSettings: () => void;
  onExit: () => void;
}

const btnCls =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/90 transition-all hover:bg-foreground/10 active:scale-90";

export default function ReaderAudioHud({
  visible,
  isPlaying,
  needsTap,
  surahLabel,
  ayahLabel,
  repeatLabel,
  speed,
  range,
  onTogglePlay,
  onCycleRepeat,
  onCycleSpeed,
  shadingHidden,
  onToggleShading,
  onClearRange,
  onSettings,
  onExit,
}: Props) {
  if (!visible) return null;

  return (
    <div
      dir="rtl"
      className="pointer-events-none absolute inset-x-0 bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] z-[60] flex flex-col items-center gap-1.5 px-2"
    >
      {/* سطر معلومات قصير: السورة + الآية أو تلميح اللمسة الأولى */}
      <p className="pointer-events-none max-w-[92vw] truncate rounded-full bg-black/45 px-3 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-sm">
        {needsTap ? "اضغط ▶ لبدء التلاوة" : `${surahLabel}${ayahLabel ? ` • ${ayahLabel}` : ""}`}
      </p>

      {/* الكبسولة */}
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/25 bg-background/80 px-1.5 py-1 shadow-2xl backdrop-blur-xl dark:border-white/10">
        <button
          onClick={onTogglePlay}
          aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
          title={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${
            isPlaying ? "bg-amber-500 text-black" : "bg-amber-400 text-black"
          } ${needsTap ? "animate-pulse ring-2 ring-amber-300/70" : ""}`}
        >
          {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
        </button>

        <button
          onClick={onCycleRepeat}
          aria-label="تكرار الآية"
          title={repeatLabel}
          className={btnCls}
        >
          <span className="relative flex items-center justify-center">
            <Repeat className="h-5 w-5" />
            <span className="absolute -bottom-1.5 text-[9px] font-extrabold tabular-nums">
              {repeatLabel.startsWith("♾") ? "∞" : repeatLabel.replace(/[^\d]/g, "") || "0"}
            </span>
          </span>
        </button>

        <button
          onClick={onCycleSpeed}
          aria-label="سرعة التلاوة"
          title={`سرعة التلاوة: ${speed}×`}
          className={`${btnCls} text-xs font-extrabold tabular-nums`}
        >
          {speed}×
        </button>

        {range && (
          <button
            onClick={onClearRange}
            aria-label="إلغاء المدى المحدد"
            title={`المدى: من الآية ${range.from} إلى ${range.to} — اضغط للإلغاء`}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 text-[10px] font-extrabold text-amber-700 dark:text-amber-300"
          >
            <span className="tabular-nums">
              {range.from}–{range.to}
            </span>
            <X className="h-3 w-3" />
          </button>
        )}

        {/* إخفاء/إظهار التظليل — نقرة تُخفي التظليل ونقرة ثانية تُعيده */}
        <button
          onClick={onToggleShading}
          aria-label={shadingHidden ? "إظهار التظليل" : "إخفاء التظليل"}
          aria-pressed={shadingHidden}
          title={shadingHidden ? "إظهار التظليل" : "إخفاء التظليل"}
          className={`${btnCls} ${shadingHidden ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}
        >
          {shadingHidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>

        <button onClick={onSettings} aria-label="الإعدادات" title="الإعدادات" className={btnCls}>
          <Settings className="h-5 w-5" />
        </button>

        <button onClick={onExit} aria-label="إظهار شريط التحكم" title="إظهار شريط التحكم" className={btnCls}>
          <Minimize2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
