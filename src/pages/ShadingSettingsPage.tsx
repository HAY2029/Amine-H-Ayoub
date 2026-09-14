import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Palette,
  Check,
  RotateCcw,
  Sparkles,
  Mic,
  Baby,
  Eye,
  EyeOff,
  BookOpen
} from "lucide-react";
import {
  getLocalShadingSettings,
  applyAndSaveShading,
  syncShadingFromServer,
  PRESET_SHADING_COLORS,
  getAyahShadingStyle,
  DEFAULT_SETTINGS,
  type ShadingSettings
} from "../services/shadingSyncService";
import { toast } from "../hooks/use-toast";
import AppNav from "../components/AppNav";
import AppFooter from "../components/AppFooter";

export default function ShadingSettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<ShadingSettings>(getLocalShadingSettings);
  const [activeTab, setActiveTab] = useState<"teacher" | "kids">("teacher");
  const [previewSpeaker, setPreviewSpeaker] = useState<"teacher" | "kids">("teacher");

  // مزامنة أحدث إعدادات
  useEffect(() => {
    syncShadingFromServer().then(s => {
      if (s) setSettings(s);
    }).catch(() => {});

    const onShadingChanged = (e: Event) => {
      const detail = (e as CustomEvent<ShadingSettings>).detail;
      if (detail) setSettings(detail);
    };
    window.addEventListener("mushaf:shading_changed", onShadingChanged);
    return () => window.removeEventListener("mushaf:shading_changed", onShadingChanged);
  }, []);

  // تحديث فوري وسلس
  const update = (patch: Partial<ShadingSettings>, msg?: string) => {
    const next = applyAndSaveShading(patch);
    setSettings(next);
    if (msg) toast({ title: msg });
  };

  const currentColor = activeTab === "teacher"
    ? (settings.teacherColor || DEFAULT_SETTINGS.teacherColor)
    : (settings.kidsColor || DEFAULT_SETTINGS.kidsColor);

  const previewColor = previewSpeaker === "teacher"
    ? (settings.teacherColor || DEFAULT_SETTINGS.teacherColor)
    : (settings.kidsColor || DEFAULT_SETTINGS.kidsColor);

  const previewStyle = getAyahShadingStyle(previewColor, settings.opacity);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-20 select-none" dir="rtl">
      {/* ── الرأس العلوي الفاخر ── */}
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="رجوع"
            className="w-10 h-10 rounded-xl bg-secondary hover:bg-secondary/80 flex items-center justify-center text-foreground active:scale-95 transition-all shadow-sm"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-extrabold text-base sm:text-lg flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
                <Palette className="w-4 h-4" />
              </span>
              مظهر تظليل الآيات
            </h1>
            <p className="text-[11px] text-muted-foreground font-medium">
              تخصيص ألوان المعلّم والطفل مع التعيين اليدوي الحر
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/mushaf")}
          className="px-3 py-2 rounded-xl text-xs font-bold text-accent bg-accent/10 hover:bg-accent/20 flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
        >
          <BookOpen className="w-4 h-4" />
          <span className="hidden sm:inline">فتح المصحف</span>
        </button>
      </header>

      {/* ── جسم الصفحة ── */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-5 space-y-4">

        {/* 1. مفتاح التفعيل / الإخفاء العام */}
        <div className="card-nour p-4 flex items-center justify-between shadow-soft">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-secondary text-accent flex items-center justify-center shrink-0">
              {settings.hidden ? <EyeOff className="w-5 h-5 text-muted-foreground" /> : <Eye className="w-5 h-5 text-emerald-600" />}
            </span>
            <div className="min-w-0">
              <span className="block font-bold text-sm text-foreground">تظليل الآيات على المصحف</span>
              <span className="block text-[11px] text-muted-foreground leading-tight">
                {settings.hidden ? "التظليل متوقف ومخفي حالياً" : "التظليل نشط ويضيء فوق الكلمات القرآنية"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => update({ hidden: !settings.hidden }, settings.hidden ? "تم تفعيل التظليل ✅" : "تم إخفاء التظليل ❌")}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm ${
              !settings.hidden
                ? "bg-emerald-600 text-white shadow-emerald-600/20"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {!settings.hidden ? <><Check className="w-4 h-4" /> مفعّل</> : "معطّل"}
          </button>
        </div>

        {/* 2. المعاينة الحية السلسة والمريحة للمصحف */}
        <div className="card-nour p-4 space-y-3.5 shadow-soft overflow-hidden border-2 border-accent/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Sparkles className="w-4 h-4 text-accent animate-pulse" />
              <span>معاينة شكل التظليل في المصحف:</span>
            </div>
            {/* زرا المقارنة المباشرة: المعلم والطفل */}
            <div className="flex rounded-xl bg-secondary p-1">
              <button
                type="button"
                onClick={() => setPreviewSpeaker("teacher")}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                  previewSpeaker === "teacher"
                    ? "bg-amber-500 text-amber-950 shadow-sm scale-100"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>المعلّم</span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: settings.teacherColor || DEFAULT_SETTINGS.teacherColor }} />
              </button>
              <button
                type="button"
                onClick={() => setPreviewSpeaker("kids")}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                  previewSpeaker === "kids"
                    ? "bg-sky-500 text-sky-950 shadow-sm scale-100"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Baby className="w-3.5 h-3.5" />
                <span>الطفل</span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: settings.kidsColor || DEFAULT_SETTINGS.kidsColor }} />
              </button>
            </div>
          </div>

          {/* محاكاة إطار صفحة المصحف الطبيعية */}
          <div className="relative rounded-2xl border border-border/80 bg-[#fffdf8] dark:bg-[#1a1c23] p-5 text-center transition-all duration-300 shadow-inner">
            <div
              className="rounded-xl p-3.5 transition-all duration-300"
              style={{
                backgroundColor: settings.hidden ? "transparent" : previewStyle.fill,
                border: settings.hidden ? "2px dashed var(--border)" : `2.5px solid ${previewStyle.stroke}`,
                boxShadow: settings.hidden ? "none" : `0 4px 20px ${previewStyle.glow}`,
              }}
            >
              <p className="font-quran text-xl sm:text-2xl text-foreground select-none leading-relaxed tracking-wide">
                بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾
              </p>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] font-bold text-muted-foreground px-1">
              <span className="flex items-center gap-1.5">
                <span>المتحدث:</span>
                <span className="font-extrabold text-foreground">
                  {previewSpeaker === "teacher" ? "🎓 قراءة المعلّم" : "👶 ترديد الطفل"}
                </span>
              </span>
              <span className="font-mono bg-secondary px-2 py-0.5 rounded-md text-foreground">
                {previewColor}
              </span>
            </div>
          </div>
        </div>

        {/* 3. تبويبان سلسان لتخصيص لون المعلم ولون الطفل */}
        <div className="card-nour p-4 space-y-4 shadow-soft">
          {/* محول التبويب الرئيسي */}
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-secondary border border-border">
            <button
              type="button"
              onClick={() => { setActiveTab("teacher"); setPreviewSpeaker("teacher"); }}
              className={`py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                activeTab === "teacher"
                  ? "bg-amber-500 text-amber-950 shadow-md scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>لون المعلّم</span>
              <span className="w-3.5 h-3.5 rounded-full border border-white/60 shadow-sm" style={{ backgroundColor: settings.teacherColor || DEFAULT_SETTINGS.teacherColor }} />
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("kids"); setPreviewSpeaker("kids"); }}
              className={`py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                activeTab === "kids"
                  ? "bg-sky-500 text-sky-950 shadow-md scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Baby className="w-4 h-4" />
              <span>لون الطفل</span>
              <span className="w-3.5 h-3.5 rounded-full border border-white/60 shadow-sm" style={{ backgroundColor: settings.kidsColor || DEFAULT_SETTINGS.kidsColor }} />
            </button>
          </div>

          {/* وصف دور اللون */}
          <div className="p-2.5 rounded-xl bg-muted/40 text-xs font-medium text-muted-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-ping shrink-0" />
            <span>
              {activeTab === "teacher"
                ? "يضيء هذا اللون على الآيات أثناء تلاوة وشرح المعلّم."
                : "يضيء هذا اللون تلقائياً عند دور الطفل والترديد خلف المعلّم."}
            </span>
          </div>

          {/* شبكة الألوان الجاهزة — 8 ألوان منتقاة بعناية */}
          <div>
            <span className="block text-xs font-bold text-muted-foreground mb-2">اختر من الألوان المتناسقة:</span>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
              {PRESET_SHADING_COLORS.map(c => {
                const isSelected = currentColor.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={`${activeTab}-${c.key}`}
                    type="button"
                    onClick={() => {
                      if (activeTab === "teacher") update({ teacherColor: c.hex });
                      else update({ kidsColor: c.hex });
                    }}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl border-2 transition-all active:scale-95 ${
                      isSelected
                        ? "border-accent bg-accent/15 shadow-md scale-105"
                        : "border-border/50 bg-secondary/40 hover:border-border"
                    }`}
                  >
                    <span
                      className="w-9 h-9 rounded-full shadow-md flex items-center justify-center transition-transform"
                      style={{ backgroundColor: c.hex, boxShadow: isSelected ? `0 0 12px ${c.glowHex}` : undefined }}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white stroke-[3] drop-shadow" />}
                    </span>
                    <span className="text-[11px] font-bold text-foreground/90">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* التعيين اليدوي السلس والحر (Manual Custom Picker) */}
          <div className="p-3.5 rounded-2xl bg-secondary/60 border border-border flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <label
                htmlFor="page-custom-color-picker"
                className="relative cursor-pointer group shrink-0"
                title="انقر لاختيار أي لون يدوي"
              >
                <input
                  id="page-custom-color-picker"
                  type="color"
                  value={currentColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (activeTab === "teacher") update({ teacherColor: val });
                    else update({ kidsColor: val });
                  }}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
                <div
                  className="w-12 h-12 rounded-2xl border-2 border-white dark:border-zinc-800 shadow-md flex items-center justify-center transition-transform group-hover:scale-105 active:scale-95"
                  style={{ backgroundColor: currentColor }}
                >
                  <Palette className="w-5 h-5 text-white drop-shadow" />
                </div>
              </label>

              <div>
                <span className="block font-bold text-sm text-foreground">
                  تعيين يدوي للون {activeTab === "teacher" ? "المعلّم" : "الطفل"}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  انقر على الدائرة لتحديد أي درجة، أو اكتب كود الـ HEX
                </span>
              </div>
            </div>

            {/* حقل كتابة كود الـ HEX يدوياً */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
              <span className="text-sm font-mono font-bold text-muted-foreground">#</span>
              <input
                type="text"
                maxLength={7}
                value={currentColor}
                onChange={(e) => {
                  const val = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                  if (val.length <= 7) {
                    if (activeTab === "teacher") update({ teacherColor: val });
                    else update({ kidsColor: val });
                  }
                }}
                className="w-28 px-3 py-2 text-center text-xs font-mono font-bold rounded-xl border border-border bg-background text-foreground uppercase tracking-widest shadow-inner focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="#000000"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        {/* 4. قوة وشفافية التظليل (Opacity) */}
        <div className="card-nour p-4 space-y-2.5 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <span className="block font-bold text-sm text-foreground">قوة وشفافية التظليل</span>
              <span className="block text-[11px] text-muted-foreground">درجة وضوح التظليل فوق الكلمات القرآنية</span>
            </div>
            <span className="text-sm font-extrabold text-accent bg-accent/15 px-3 py-1 rounded-full tabular-nums shadow-sm">
              {Math.round(settings.opacity * 100)}%
            </span>
          </div>

          <input
            type="range"
            min={30}
            max={100}
            step={5}
            value={Math.round(settings.opacity * 100)}
            onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
            className="w-full h-3 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--accent) ${((settings.opacity - 0.3) / 0.7) * 100}%, rgba(0,0,0,0.08) ${((settings.opacity - 0.3) / 0.7) * 100}%)`,
            }}
            aria-label="قوة التظليل"
          />

          <div className="flex justify-between text-[11px] text-muted-foreground font-bold px-1">
            <span>هادئ وخفيف (30%)</span>
            <span>واضح وبارز (100%)</span>
          </div>
        </div>

        {/* 5. أزرار الإجراءات السريعة */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => {
              update({
                teacherColor: DEFAULT_SETTINGS.teacherColor,
                kidsColor: DEFAULT_SETTINGS.kidsColor,
                opacity: DEFAULT_SETTINGS.opacity,
                hidden: false,
              }, "تمت استعادة الألوان الافتراضية بنجاح 🔄");
            }}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
          >
            <RotateCcw className="w-4 h-4" />
            استعادة الألوان الافتراضية
          </button>

          <button
            type="button"
            onClick={() => navigate("/mushaf")}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-extrabold text-accent-foreground bg-accent hover:opacity-90 flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md"
          >
            <BookOpen className="w-4 h-4" />
            تجربة التظليل في المصحف الآن
          </button>
        </div>

      </main>

      <AppFooter />
      <AppNav />
    </div>
  );
}
