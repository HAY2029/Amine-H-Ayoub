import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Download, Upload, Link2, CheckCircle2, Loader2,
  SquareDashed, AudioLines, Clock3, ShieldCheck, Copy,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * مفاتيح بيانات التظليل وربط الصوت التي تُصدَّر/تُستورد كنسخة واحدة.
 * كل مفاتيح التظليل التي يكتبها التطبيق تبدأ بأحد هذه البادئات.
 */
const EXPORT_PREFIXES = [
  "mushaf:ayahCoordinates",
  "mushaf:ayahTimings",
  "mushaf:surahLink",
  "mushaf:surahSegments",
  "mushaf:surahInfo",
  "mushaf:shadingSettings",
  "mushaf:shading:",
  "mushaf:shadingCustomColor",
];

/** نقاط الربط مع الأدوات (كلها روابط داخلية تعمل بعد النشر) */
const TOOLS = [
  {
    to: "/shading",
    icon: SquareDashed,
    title: "تظليل الآيات",
    desc: "ارسم مربّع كل آية على صورة الصفحة وحدّد توقيتها (بداية/نهاية) للمعلم والطفل.",
    color: "text-amber-600 dark:text-amber-300",
    border: "border-amber-500/30",
  },
  {
    to: "/sync-audio",
    icon: AudioLines,
    title: "ربط الصوت بالتظليل",
    desc: "ارفع ملف التلاوة واربطه بالسورة، وحدّد مقاطع المعلم والطفل بدقّة ثانية بثانية.",
    color: "text-sky-600 dark:text-sky-300",
    border: "border-sky-500/30",
  },
  {
    to: "/timings",
    icon: Clock3,
    title: "توقيتات الآيات",
    desc: "ضبط سريع لبدايات آيات السورة كاملة أثناء الاستماع، مع الحفظ الفوري.",
    color: "text-emerald-600 dark:text-emerald-300",
    border: "border-emerald-500/30",
  },
];

type Backup = {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, string | null>;
};

export default function ShadingToolsPage() {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [stats, setStats] = useState<{ pages: number; boxes: number; surahs: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const collect = () => {
    const data: Record<string, string | null> = {};
    if (typeof window === "undefined") return data;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (EXPORT_PREFIXES.some((p) => key.startsWith(p))) {
        data[key] = localStorage.getItem(key);
      }
    }
    return data;
  };

  const refreshStats = () => {
    if (typeof window === "undefined") return;
    try {
      const boxes = JSON.parse(localStorage.getItem("mushaf:ayahCoordinates:v1") || "{}");
      const timings = JSON.parse(localStorage.getItem("mushaf:ayahTimings:v1") || "{}");
      const boxesCount = Object.values(boxes).reduce<number>(
        (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
        0,
      );
      setStats({
        pages: Object.keys(boxes).length,
        boxes: boxesCount,
        surahs: Object.keys(timings).length,
      });
    } catch {
      setStats({ pages: 0, boxes: 0, surahs: 0 });
    }
  };

  useEffect(() => {
    refreshStats();
    const onSync = () => refreshStats();
    window.addEventListener("mushaf:sync_complete", onSync);
    return () => window.removeEventListener("mushaf:sync_complete", onSync);
  }, []);

  /** تنزيل نسخة كاملة إلى جهاز المستخدم كملف JSON */
  const handleExport = () => {
    setBusy("export");
    try {
      const backup: Backup = {
        app: "mushaf-shading",
        version: 1,
        exportedAt: new Date().toISOString(),
        data: collect(),
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shading-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast({ title: "تم تنزيل النسخة", description: "حُفظت نسخة كاملة من التظليل وربط الصوت على جهازك" });
    } catch (e) {
      toast({ title: "تعذّر التصدير", description: String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  /** استيراد نسخة من جهاز المستخدم إلى الذاكرة المحلية + محاولة رفعها للسيرفر */
  const handleImportFile = async (file: File) => {
    setBusy("import");
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const data: Record<string, string | null> = parsed?.data ?? parsed;
      let count = 0;
      for (const [key, value] of Object.entries(data)) {
        if (!EXPORT_PREFIXES.some((p) => key.startsWith(p))) continue;
        if (typeof value !== "string") continue;
        localStorage.setItem(key, value);
        count++;
      }
      window.dispatchEvent(new Event("mushaf:sync_complete"));

      // رفع للسيرفر عندما تكون نقاط الحفظ متاحة (السيرفر المحلي) — بلا فشل قاتل
      const boxes = localStorage.getItem("mushaf:ayahCoordinates:v1");
      const timings = localStorage.getItem("mushaf:ayahTimings:v1");
      await Promise.all([
        boxes
          ? fetch("/api/save-boxes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: boxes,
            }).catch(() => null)
          : Promise.resolve(null),
        timings
          ? fetch("/api/save-timings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: timings,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      refreshStats();
      toast({ title: "تم الاستيراد", description: `استُعيد ${count} مجموعة بيانات، وأُرسلت للسيرفر عند توفّره` });
    } catch (e) {
      toast({ title: "ملف غير صالح", description: "تأكد أنك اخترت ملف النسخة الاحتياطية JSON", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "تم نسخ الرابط", description: window.location.href });
    } catch {
      toast({ title: "انسخ الرابط يدوياً", description: window.location.href });
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="w-9 h-9 rounded-xl bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center"
            aria-label="رجوع"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-amiri text-2xl font-bold">أدوات التظليل وربط الصوت</h1>
            <p className="text-xs text-muted-foreground">جارٍ الحفظ في الحاسوب والسيرفر تلقائياً</p>
          </div>
        </div>

        {/* حالة البيانات */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <div className="text-sm">
              <div className="font-bold">البيانات المحفوظة الآن</div>
              <div className="text-xs text-muted-foreground">
                {stats
                  ? `${stats.pages} صفحة • ${stats.boxes} مربّع آية • ${stats.surahs} سورة بتوقيتات`
                  : "…جارٍ القراءة"}
              </div>
            </div>
          </div>
          <button
            onClick={copyLink}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-foreground/5 hover:bg-foreground/10 flex items-center gap-1 shrink-0"
            title="نسخ رابط هذه الصفحة"
          >
            <Copy className="w-3.5 h-3.5" />
            نسخ الرابط
          </button>
        </div>

        {/* الأدوات */}
        <div className="space-y-3">
          {TOOLS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={`block rounded-2xl border ${t.border} bg-card p-4 hover:bg-accent/5 transition-colors`}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0">
                  <t.icon className={`w-5 h-5 ${t.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm">{t.title}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{t.desc}</div>
                  <div className="mt-1 text-[11px] font-mono text-muted-foreground/70" dir="ltr">
                    {t.to}
                  </div>
                </div>
                <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
        </div>

        {/* نسخ احتياطية */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <div>
            <div className="font-bold text-sm">نسخة على حاسوبك (JSON)</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              نزّل نسخة كاملة من التظليل وربط الصوت، واستوردها لاحقاً أو على جهاز آخر.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              disabled={busy !== null}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-60 flex items-center gap-1.5"
            >
              {busy === "export" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              تنزيل نسخة إلى حاسوبي
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-foreground/5 hover:bg-foreground/10 disabled:opacity-60 flex items-center gap-1.5"
            >
              {busy === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              استيراد نسخة من حاسوبي
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            الحفظ التلقائي: الذاكرة المحلية + السيرفر المحلي (/api) + Supabase
          </div>
        </div>
      </div>
    </div>
  );
}
