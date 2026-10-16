import { useNavigate } from "react-router-dom";
import { ArrowRight, Pencil, Scissors, Link2, ChevronLeft, GraduationCap, Mic, Timer, Image as ImageIcon, Sparkles, Palette } from "lucide-react";
import AppNav from "@/components/AppNav";

const TOOLS = [
  { to: "/sync-audio", Icon: Link2, name: "استوديو ربط التظليل بموقع الصوت (الجديد ⭐)", desc: "ربط كل مربع تظليل بتوقيت بدايته ونهايته في الصوت بنقرة زر ومعاينة مباشرة", tint: "bg-gradient-to-r from-emerald-500/30 to-amber-500/20 text-amber-300" },
  { to: "/surah-shading", Icon: Sparkles, name: "تظليل السور (مربع التظليل الجديد)", desc: "عرض السورة ومربع تظليل تفاعلي قابل للسحب والتكبير والتصغير وحفظ الموضع", tint: "bg-amber-500/20 text-amber-300" },
  { to: "/calibrate", Icon: Pencil, name: "المعايرة (التظليل)", desc: "ضبط مواضع الآيات والسور ورفع صفحات المصحف", tint: "bg-violet-500/20 text-violet-300" },
  { to: "/timings", Icon: Timer, name: "توقيت الآيات", desc: "تسجيل بداية كل آية في الصوت بدقة", tint: "bg-emerald-500/20 text-emerald-300" },
  { to: "/recitation-methods", Icon: Scissors, name: "تقسيم الصوت", desc: "تقسيم صوت السورة (معلم/طفل) بسرعة ودقّة", tint: "bg-sky-500/20 text-sky-300" },
  { to: "/audio-splitter", Icon: Scissors, name: "مقسِّم التلاوة المتقدم", desc: "أداة ذكية لتقسيم الصوت ورفع المخرجات للسيرفر", tint: "bg-indigo-500/20 text-indigo-300" },
  { to: "/link", Icon: Link2, name: "ربط الصوت بالتظليل", desc: "رفع صوت → تقسيم → ربط بالآيات في مكان واحد", tint: "bg-amber-500/20 text-amber-300" },
  { to: "/custom-audio", Icon: Mic, name: "مكتبتي الصوتية الخاصة", desc: "رفع وترتيب ملفات صوتية خاصة تظهر فوراً للأطفال", tint: "bg-rose-500/20 text-rose-300" },
  { to: "/shading-settings", Icon: Palette, name: "إعدادات التظليل والألوان", desc: "ضبط ألوان تظليل المعلم والطفل وشفافية العرض", tint: "bg-cyan-500/20 text-cyan-300" },
  { to: "/image-manager", Icon: ImageIcon, name: "مدير الصور", desc: "جلب الصور من HuggingFace وترتيبها", tint: "bg-fuchsia-500/20 text-fuchsia-300" },
];

const visibleTools = TOOLS;

export default function TeacherTools() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen page-nour text-foreground" dir="rtl">
      <AppNav />
      {/* وهج ذهبي زخرفي علوي */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-accent/10 to-transparent" aria-hidden="true" />

      <div className="relative mx-auto max-w-md px-4 py-5 space-y-5">
        <header className="flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex h-10 items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-4 text-sm font-bold border border-border hover:brightness-95 active:scale-95 transition-all shadow-soft"><ArrowRight className="h-4 w-4" /> التلاوات</button>
          <span className="w-16" />
        </header>

        {/* بطاقة العنوان الفاخرة */}
        <div className="card-nour relative overflow-hidden p-6 text-center animate-fade-up shadow-soft">
          <div className="pointer-events-none absolute -top-10 -left-10 h-32 w-32 rounded-full bg-accent/10 blur-2xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-12 -right-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" aria-hidden="true" />
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-soft animate-float">
            <GraduationCap className="h-7 w-7" />
          </span>
          <h1 className="font-extrabold text-2xl text-gradient-gold">أدوات المعلّم</h1>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            أدوات إعداد المحتوى (للمعلّم/ولي الأمر). رتّب الصفحات، ظلّل الآيات، وقسّم الصوت واربطه.
          </p>
        </div>

        <div className="space-y-2.5">
          {visibleTools.map((t, i) => (
            <button key={t.to} onClick={() => navigate(t.to)}
              style={{ animationDelay: `${(i + 1) * 70}ms` }}
              className="group w-full flex items-center gap-3 card-nour p-3.5 text-right hover:border-accent/50 active:scale-[0.99] transition-all animate-fade-up">
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-soft transition-transform group-hover:scale-105 ${t.tint}`}><t.Icon className="w-6 h-6" /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-foreground">{t.name}</span>
                <span className="block text-[11px] text-muted-foreground leading-relaxed">{t.desc}</span>
              </span>
              <ChevronLeft className="w-5 h-5 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-accent" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
