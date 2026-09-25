import { useEffect, useCallback, startTransition } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Headphones, Timer, Target, Zap, X, Map, GraduationCap } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const links = [
  { path: "/surah-shading", label: "مربع التظليل الجديد", description: "تظليل السورة مع مربع تظليل تفاعلي بالسحب والتكبير", icon: Zap, color: "from-amber-400 to-yellow-500", glow: "shadow-amber-500/20" },
  { path: "/", label: "المصحف المعلم", description: "قراءة القرآن مع التقسيم والتشغيل", icon: BookOpen, color: "from-amber-400 to-orange-500", glow: "shadow-amber-500/20" },
  { path: "/audio", label: "التلاوات", description: "قائمة السور الصوتية", icon: Headphones, color: "from-sky-400 to-blue-500", glow: "shadow-sky-500/20" },
  { path: "/shading", label: "التظليل المزدوج", description: "معلم وطفل بلونين مع صوتك", icon: Timer, color: "from-emerald-400 to-teal-500", glow: "shadow-emerald-500/20" },
  { path: "/timings", label: "إعداد التوقيت", description: "معايرة توقيت الآيات الصوتية", icon: Timer, color: "from-emerald-400 to-teal-500", glow: "shadow-emerald-500/20" },
  { path: "/calibrate", label: "ضبط المواضع", description: "ضبط مواضع الآيات على الصفحات", icon: Target, color: "from-violet-400 to-purple-500", glow: "shadow-violet-500/20" },
];

export default function SiteLinksOverlay({ open, onClose }: Props) {
  const navigate = useNavigate();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg glass-nour rounded-3xl p-6 shadow-soft animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-quran font-bold text-xl text-gradient-gold flex items-center gap-2">
              <Map className="w-5 h-5 text-accent" /> خريطة الموقع
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ctrl+5 للفتح/الإغلاق
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground hover:brightness-95 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-secondary-foreground" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-20 h-1 bg-gradient-to-r from-amber-400 to-sky-400 mx-auto rounded-full mb-5" />

        {/* Links Grid */}
        <div className="space-y-2.5">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.path}
                onClick={() => {
                  startTransition(() => {
                    navigate(link.path);
                    onClose();
                  });
                }}
                className="w-full flex items-center gap-4 p-3.5 rounded-2xl bg-card hover:bg-muted border border-border hover:border-accent/50 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] group text-right"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${link.color} flex items-center justify-center shrink-0 shadow-lg ${link.glow} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-quran font-bold text-base text-foreground leading-tight">
                    {link.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {link.description}
                  </p>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono bg-muted px-2 py-1 rounded-lg border border-border shrink-0 dir-ltr" dir="ltr">
                  {link.path}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
