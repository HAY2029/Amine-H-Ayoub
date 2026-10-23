import { useState } from "react";
import {
  Check,
  Baby,
  Plus,
  Trash2,
  Minus,
  KeyRound,
  Shield,
  BookOpen,
  Headphones,
  Settings,
  Star,
  Gamepad2,
  Trophy,
  Sparkles,
  BookmarkCheck,
  ArrowLeftRight,
  Youtube,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Crown,
  Volume2,
  Lock,
  Award
} from "lucide-react";

import {
  setAppMode,
  addProfile,
  setActiveProfile,
  kidsHidden,
  setKidsHidden,
  setPureMode,
  isPureMode,
  KID_AVATARS_BOY,
  KID_AVATARS_GIRL,
  KID_COLORS,
  type AppMode
} from "../data/kidsProfile";
import { setKidsPin, setKidsLocked } from "../data/kidsLock";
import Avatar from "./Avatar";
import { openExternalUrl } from "../utils/tauriUtils";

const ONBOARD_KEY = "mushaf:onboarded:v1";

export const isOnboarded = (): boolean => {
  try {
    return localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    return true;
  }
};

interface NewKid {
  name: string;
  age: number;
  gender: "boy" | "girl";
  avatar: string;
  color: string;
}

export default function WelcomeOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<AppMode>("parent");
  const [parentStyle, setParentStyle] = useState<"pure" | "flexible">("pure");
  const [kids, setKids] = useState<NewKid[]>([
    { name: "", age: 6, gender: "boy", avatar: KID_AVATARS_BOY[0], color: KID_COLORS[0] }
  ]);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  // إذا أخفى المالك ركن الأطفال: إطلاق بالسماع فقط
  const kidsOff = kidsHidden() || isPureMode();
  const effMode: AppMode = kidsOff ? "parent" : mode;

  // مفاتيح الخطوات
  const stepKeys = kidsOff
    ? ["welcome"]
    : mode === "parent"
      ? ["welcome", "who", "parent_style"]
      : ["welcome", "who", "kids", "pin"];

  const cur = stepKeys[step] || stepKeys[0];
  const lastIdx = stepKeys.length - 1;
  const pinValid = /^\d{4}$/.test(pin) && pin === pin2;
  const pinOk = (!pin && !pin2) || pinValid;

  const finalize = () => {
    const finalMode = effMode;
    setAppMode(finalMode);
    if (finalMode === "parent") {
      setPureMode(parentStyle === "pure");
      setKidsHidden(parentStyle === "pure");
      setKidsLocked(false);
    } else {
      setPureMode(false);
      setKidsHidden(false);
      setKidsLocked(true);
      if (pinValid) setKidsPin(pin);
      const valid = kids.filter((k) => k.name.trim());
      const list = valid.length
        ? valid
        : [{ name: "طفلي", age: 6, gender: "boy" as const, avatar: KID_AVATARS_BOY[0], color: KID_COLORS[0] }];
      let firstId = "";
      list.forEach((k, i) => {
        const p = addProfile({
          name: k.name.trim() || `طفل ${i + 1}`,
          age: k.age,
          gender: k.gender,
          avatar: k.avatar,
          color: k.color || KID_COLORS[i % KID_COLORS.length]
        });
        if (i === 0) firstId = p.id;
      });
      if (firstId) setActiveProfile(firstId);
    }
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const finish = () => {
    finalize();
    onDone();
  };

  const handlePickMode = (m: AppMode) => {
    setMode(m);
  };

  const handleModeContinue = (m: AppMode) => {
    setMode(m);
    setStep(2);
  };

  const addKid = () =>
    setKids((k) => [
      ...k,
      {
        name: "",
        age: 6,
        gender: "boy",
        avatar: KID_AVATARS_BOY[0],
        color: KID_COLORS[k.length % KID_COLORS.length]
      }
    ]);

  const delKid = (i: number) => setKids((k) => (k.length > 1 ? k.filter((_, j) => j !== i) : k));
  const setKid = (i: number, patch: Partial<NewKid>) =>
    setKids((k) => k.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const kidsValid = kids.some((k) => k.name.trim());

  // تسميات مؤشر الخطوات
  const stepTitles: Record<string, { title: string; subtitle: string }> = {
    welcome: { title: "مرحباً بك", subtitle: "إشراقة المصحف المرتل" },
    who: { title: "اختيار المسار", subtitle: "تخصيص التجربة لأسرتك" },
    parent_style: { title: "نمط الواجهة", subtitle: "تخصيص مسار الاستماع" },
    kids: { title: "أبطال القرآن", subtitle: "إعداد ملفات الأطفال" },
    pin: { title: "حماية الوالدين", subtitle: "رمز قفل الأمان" }
  };

  return (
    <div
      className="fixed inset-0 z-[100] page-nour text-foreground overflow-y-auto selection:bg-amber-500/25"
      dir="rtl"
    >
      {/* ===================== الهالة والزخارف الإشعاعية الروحانية ===================== */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* هالة ذهبية علوية ضخمة */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[42rem] h-[42rem] rounded-full bg-gradient-to-b from-amber-400/25 via-emerald-500/15 to-transparent blur-[120px] animate-breathe" />
        {/* هالة زمردية يمنى */}
        <div className="absolute top-1/4 -right-32 w-96 h-96 rounded-full bg-emerald-600/20 blur-[100px] animate-pulse" />
        {/* هالة عنبرية يسرى */}
        <div className="absolute bottom-10 -left-32 w-96 h-96 rounded-full bg-amber-500/20 blur-[100px]" />

        {/* نجوم وذرات ضوئية روحانية خافتة */}
        <div className="absolute top-12 left-1/4 w-1.5 h-1.5 rounded-full bg-amber-300/60 blur-[0.5px] animate-ping" />
        <div className="absolute top-1/3 right-1/5 w-1 h-1 rounded-full bg-emerald-300/50 blur-[0.5px]" />
        <div className="absolute bottom-1/4 right-1/3 w-1.5 h-1.5 rounded-full bg-amber-200/40 blur-[0.5px] animate-pulse" />
      </div>

      <div className="relative mx-auto max-w-lg px-4 sm:px-6 py-5 sm:py-7 min-h-full flex flex-col justify-between">
        {/* ===================== شريط البسملة ومؤشر الخطوات الملكي ===================== */}
        <div className="mb-5 space-y-3">
          {/* شارة البسملة الشريفة */}
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] sm:text-xs font-quran font-bold tracking-wide shadow-sm backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              <span>بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            </div>
          </div>

          {/* معلومات الخطوة الحالية */}
          <div className="flex items-center justify-between px-1 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 text-stone-950 font-black text-[10px] flex items-center justify-center shadow-sm">
                {step + 1}
              </span>
              <span className="font-extrabold text-foreground">
                {stepTitles[cur]?.title}
              </span>
              <span className="text-muted-foreground/60 hidden sm:inline">•</span>
              <span className="text-muted-foreground text-[11px] hidden sm:inline">
                {stepTitles[cur]?.subtitle}
              </span>
            </div>
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded-md">
              {step + 1} من {stepKeys.length}
            </span>
          </div>

          {/* مسار التقدم الفاخر بنظام الكبسولات المضيئة */}
          <div
            className="grid gap-2 items-center"
            style={{ gridTemplateColumns: `repeat(${stepKeys.length}, minmax(0, 1fr))` }}
          >
            {stepKeys.map((k, i) => {
              const isActive = i === step;
              const isPast = i < step;
              return (
                <div key={k} className="relative group">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 relative overflow-hidden ${
                      isActive
                        ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 shadow-[0_0_14px_rgba(245,158,11,0.65)] ring-1 ring-amber-300/50"
                        : isPast
                        ? "bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-sm"
                        : "bg-border/60"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/50 to-white/0 animate-shimmer" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===================== الحاوية المركزية للمحتوى ===================== */}
        <div className="flex-1 flex flex-col justify-center my-auto py-2">
          {/* ===================== الخطوة 0: الترحيب بالشيخ والمصحف ===================== */}
          {cur === "welcome" && (
            <div className="text-center space-y-5 animate-fade-up">
              {/* صورة القارئ الشيخ حاج أيوب أمين داخل ميدالية إسلامية مذهبة */}
              <div className="relative mx-auto w-36 h-36 sm:w-44 sm:h-44 group">
                {/* شفق كوني نابض خلف الصورة */}
                <div className="absolute -inset-4 rounded-full bg-gradient-to-tr from-amber-500/40 via-emerald-500/25 to-amber-300/40 blur-2xl animate-breathe" />

                {/* إطار النجمة الثمانية الإسلامية الدوار بنعومة */}
                <div
                  aria-hidden
                  className="absolute -inset-3 rounded-full border border-amber-400/35 opacity-70 animate-spin"
                  style={{ animationDuration: "35s" }}
                />
                <div
                  aria-hidden
                  className="absolute -inset-1.5 rounded-full border border-dashed border-amber-400/50 opacity-80 animate-spin"
                  style={{ animationDuration: "22s", animationDirection: "reverse" }}
                />

                {/* الحاوية الدائرية لصورة القارئ الشيخ حاج أيوب أمين */}
                <div className="relative w-full h-full rounded-full p-1 bg-gradient-to-b from-amber-300 via-amber-500 to-emerald-700 shadow-[0_12px_40px_rgba(217,119,6,0.45)] ring-2 ring-white/20">
                  <div className="w-full h-full rounded-full overflow-hidden bg-stone-950 flex items-center justify-center relative">
                    <img
                      src="/my-photo.png"
                      alt="القارئ الشيخ حاج أيوب أمين"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      style={{ objectPosition: "center top" }}
                      loading="eager"
                      onError={(e) => {
                        e.currentTarget.src = "/pwa-512x512.png";
                      }}
                    />
                  </div>
                </div>

                {/* شارة التوثيق والاسم أسفل صورة الشيخ */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-stone-950 px-3.5 py-1 rounded-full shadow-[0_4px_15px_rgba(245,158,11,0.5)] ring-2 ring-white/40 text-xs font-black whitespace-nowrap flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 fill-current" />
                  <span>القارئ الشيخ: حاج أيوب أمين</span>
                </div>

                {/* شارة التوثيق المعتمدة بأعلى الصورة */}
                <div className="absolute -top-1 -right-1 bg-emerald-600 text-white p-1.5 rounded-xl shadow-md ring-2 ring-white/30 animate-bounce">
                  <Sparkles className="w-4 h-4 fill-current text-amber-300" />
                </div>
              </div>

              {/* العناوين الرسمية الدقيقة */}
              <div className="space-y-2 pt-2">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient-gold leading-tight tracking-tight drop-shadow-sm font-quran">
                  المصحف المرتل الشريف
                </h1>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-card/85 border border-amber-500/25 shadow-sm text-xs sm:text-sm font-bold">
                    <span className="text-accent">برواية ورش عن نافع</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    <span className="text-muted-foreground font-normal">من طريق الأزرق</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs sm:text-sm font-bold text-foreground">
                    <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[3]" />
                    <span>بصوت القارئ الشيخ: <b className="text-amber-600 dark:text-amber-400">حاج أيوب أمين</b></span>
                  </div>
                </div>
              </div>

              {/* بطاقة المزايا الأربع الحقيقية */}
              <div className="w-full space-y-3.5 p-4 sm:p-5 rounded-3xl bg-card/90 backdrop-blur-xl border border-amber-500/30 shadow-[0_12px_40px_rgba(0,0,0,0.25)] relative overflow-hidden">
                <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-400 via-emerald-400 to-amber-400 opacity-70" />

                <div className="flex items-center justify-between">
                  <p className="text-foreground font-black text-sm sm:text-base leading-relaxed flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>تطبيق قرآني متكامل ومجاني للأسرة</span>
                  </p>
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20">
                    استماع وتكرار بدون إنترنت
                  </span>
                </div>

                {/* شبكة المزايا التفاعلية */}
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  {/* مزية 1: التلاوات بصوت الشيخ */}
                  <div className="group/item flex items-center gap-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/15 transition-all text-right shadow-sm">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950 flex items-center justify-center shrink-0 shadow-sm group-hover/item:scale-110 transition-transform">
                      <Headphones className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <span className="block font-black text-foreground truncate">تلاوات خاشعة</span>
                      <span className="text-[10px] text-muted-foreground truncate block">بصوت الشيخ حاج أيوب</span>
                    </div>
                  </div>

                  {/* مزية 2: ألعاب البراعم */}
                  <div className="group/item flex items-center gap-2.5 p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 hover:border-sky-500/40 hover:bg-sky-500/15 transition-all text-right shadow-sm">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover/item:scale-110 transition-transform">
                      <Gamepad2 className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <span className="block font-black text-foreground truncate">ألعاب تفاعلية</span>
                      <span className="text-[10px] text-muted-foreground truncate block">تثبيت الحفظ بالمتعة</span>
                    </div>
                  </div>

                  {/* مزية 3: المكافآت والأوسمة */}
                  <div className="group/item flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/15 transition-all text-right shadow-sm">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover/item:scale-110 transition-transform">
                      <Trophy className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <span className="block font-black text-foreground truncate">جوائز وأوسمة</span>
                      <span className="text-[10px] text-muted-foreground truncate block">نقاط ومكافآت يومية</span>
                    </div>
                  </div>

                  {/* مزية 4: الختمات والمصحف */}
                  <div className="group/item flex items-center gap-2.5 p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/15 transition-all text-right shadow-sm">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-400 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover/item:scale-110 transition-transform">
                      <BookmarkCheck className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <span className="block font-black text-foreground truncate">تتبع الإنجاز</span>
                      <span className="text-[10px] text-muted-foreground truncate block">تكرار الآيات والتحفيظ</span>
                    </div>
                  </div>
                </div>

                <p className="text-muted-foreground text-xs leading-relaxed pt-1">
                  {kidsOff
                    ? "استمع إلى تلاوات الشيخ حاج أيوب أمين برواية ورش في بيئة هادئة وروحانية صافية."
                    : "صُمم بعناية ليلائم الكبار بالسكينة والتدبر، والأطفال بالتحفيز والمرح والمدارسة."}
                </p>
              </div>

              {/* زر دعم قناة الشيخ حاج أيوب أمين على يوتيوب */}
              <button
                type="button"
                onClick={() => void openExternalUrl("https://www.youtube.com/@aminehadjyoub?sub_confirmation=1")}
                className="group w-full relative overflow-hidden flex items-center justify-center gap-3 px-5 py-3.5 rounded-2xl bg-gradient-to-l from-red-600 via-rose-600 to-red-600 text-white font-black text-sm shadow-[0_8px_25px_rgba(220,38,38,0.35)] hover:shadow-red-500/50 hover:scale-[1.01] active:scale-[0.98] transition-all border border-red-400/40"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <Youtube className="w-5 h-5 shrink-0 group-hover:scale-110 transition-transform drop-shadow" />
                <span className="tracking-wide">قناة الشيخ حاج أيوب أمين الرسمية على يوتيوب</span>
              </button>
            </div>
          )}

          {/* ===================== الخطوة 1: اختيار المسار بمعلومات الشيخ الصحيحة ===================== */}
          {cur === "who" && (
            <div className="space-y-4 animate-fade-up">
              {/* الرأس الفخم */}
              <div className="text-center space-y-1.5 pb-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-accent text-xs font-bold shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>تخصيص الواجهة فوراً</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-gradient-gold tracking-tight font-quran">
                  لِمَن هذا التطبيق المبارك؟
                </h2>
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed max-w-sm mx-auto">
                  اختر المسار الأنسب لك لتجهيز التجربة فوراً، ويمكنك التبديل لاحقاً بكل سهولة.
                </p>
              </div>

              {/* بطاقات الاختيار مع صورة الشيخ الحقيقية ومعلومات دقيقة */}
              <div className="space-y-3.5 pt-1">
                {/* 1. خيار: لي أنا (الكبار والتلاوات والتدبر بصوت الشيخ حاج أيوب أمين) */}
                <div
                  onClick={() => handlePickMode("parent")}
                  onDoubleClick={() => handleModeContinue("parent")}
                  className={`group relative rounded-3xl border-2 transition-all duration-300 p-4 sm:p-5 text-right cursor-pointer select-none overflow-hidden ${
                    mode === "parent"
                      ? "border-amber-500 bg-gradient-to-b from-amber-500/20 via-card/95 to-card shadow-[0_14px_40px_rgba(217,119,6,0.3)] ring-2 ring-amber-400/40 scale-[1.01]"
                      : "border-border/80 bg-card/85 hover:border-amber-500/50 hover:bg-card/95 hover:shadow-soft"
                  }`}
                >
                  {/* شريط الإشراق العلوي في حالة التحديد */}
                  {mode === "parent" && (
                    <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-400 via-emerald-400 to-amber-500" />
                  )}

                  {/* شارة التميز أعلى البطاقة */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      <BookOpen className="w-3 h-3 text-amber-500" />
                      مسار التلاوة والتدبّر (للكبار)
                    </span>

                    {/* زر الاختيار الدائري المشع */}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                        mode === "parent"
                          ? "bg-gradient-to-tr from-amber-500 to-amber-400 text-stone-950 shadow-md shadow-amber-500/50 scale-110"
                          : "border-2 border-border/80 group-hover:border-amber-500/60"
                      }`}
                    >
                      {mode === "parent" && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>

                  {/* المحتوى الرئيسي للبطاقة مع صورة الشيخ حاج أيوب أمين المعتمدة */}
                  <div className="flex items-start gap-3.5 mb-3.5">
                    <div className="relative w-16 h-16 rounded-2xl p-0.5 bg-gradient-to-tr from-amber-400 via-amber-300 to-emerald-500 shadow-lg shadow-amber-500/30 group-hover:scale-105 transition-transform shrink-0">
                      <div className="w-full h-full rounded-[14px] overflow-hidden bg-stone-900 flex items-center justify-center relative">
                        <img
                          src="/my-photo.png"
                          alt="القارئ الشيخ حاج أيوب أمين"
                          className="w-full h-full object-cover"
                          style={{ objectPosition: "center top" }}
                          onError={(e) => {
                            e.currentTarget.src = "/pwa-512x512.png";
                          }}
                        />
                      </div>
                      <div
                        className="absolute -bottom-1 -right-1 bg-emerald-600 text-white rounded-full p-1 shadow-sm ring-1 ring-white/50"
                        title="القارئ المعتمد"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-black text-foreground text-lg sm:text-xl">
                          لي أنا
                        </h3>
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          بصوت الشيخ: حاج أيوب أمين
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-1">
                        تلاوة القرآن الكريم برواية ورش عن نافع، تكرار الآيات للتحفيظ، تفسير وعلامات مرجعية، خالية من الألعاب.
                      </p>
                    </div>
                  </div>

                  {/* مشغل التلاوة المصغّر الحقيقي بصوت القارئ الشيخ حاج أيوب أمين */}
                  <div className="w-full rounded-2xl bg-gradient-to-br from-stone-900/95 via-stone-950 to-stone-900 border border-amber-500/30 p-3.5 shadow-inner overflow-hidden text-stone-100">
                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10 text-xs">
                      <div className="flex items-center gap-2 font-bold text-amber-400 min-w-0">
                        <div className="w-6 h-6 rounded-full overflow-hidden ring-1 ring-amber-400/50 shrink-0">
                          <img
                            src="/my-photo.png"
                            alt="القارئ"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = "/pwa-512x512.png";
                            }}
                          />
                        </div>
                        <span className="truncate">سورة الفاتحة • القارئ الشيخ حاج أيوب أمين</span>
                      </div>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30 shrink-0">
                        ورش عن نافع
                      </span>
                    </div>

                    {/* موجات صوتية حية ذهبية زمردية مع الآية الشريفة */}
                    <div className="flex items-center justify-between gap-3 py-1.5 px-1">
                      <div className="flex items-center gap-1 h-8">
                        {[12, 24, 16, 28, 20, 14, 26, 18, 22, 12, 24, 16].map((h, idx) => (
                          <span
                            key={idx}
                            className={`w-1 rounded-full transition-all ${
                              mode === "parent"
                                ? "bg-gradient-to-t from-amber-400 to-emerald-400 animate-wave"
                                : "bg-amber-400/40"
                            }`}
                            style={{
                              height: `${h}px`,
                              animationDelay: `${idx * 0.08}s`
                            }}
                          />
                        ))}
                      </div>

                      <div className="text-center font-quran text-amber-200 text-base sm:text-lg font-bold drop-shadow">
                        ﴿ ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ ﴾
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-stone-300 bg-white/10 px-2.5 py-1 rounded-xl shrink-0">
                        <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>تلاوة مرتلة</span>
                      </div>
                    </div>

                    {/* شرائح المزايا بالأسفل */}
                    <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-white/10 text-[10px] text-stone-300 flex-wrap">
                      <span className="bg-white/10 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                        <Sparkles className="w-2.5 h-2.5 text-amber-400" /> تكرار الآيات والتحفيظ
                      </span>
                      <span className="bg-white/10 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                        <BookmarkCheck className="w-2.5 h-2.5 text-emerald-400" /> علامات مرجعية
                      </span>
                      <span className="bg-white/10 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                        <Settings className="w-2.5 h-2.5 text-sky-400" /> تظليل مع القراءة
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. خيار: لأطفالي (ركن البراعم والألعاب) */}
                <div
                  onClick={() => handlePickMode("kids")}
                  onDoubleClick={() => handleModeContinue("kids")}
                  className={`group relative rounded-3xl border-2 transition-all duration-300 p-4 sm:p-5 text-right cursor-pointer select-none overflow-hidden ${
                    mode === "kids"
                      ? "border-orange-500 bg-gradient-to-b from-orange-500/20 via-card/95 to-card shadow-[0_14px_40px_rgba(249,115,22,0.3)] ring-2 ring-orange-400/40 scale-[1.01]"
                      : "border-border/80 bg-card/85 hover:border-orange-500/50 hover:bg-card/95 hover:shadow-soft"
                  }`}
                >
                  {/* شريط الإشراق العلوي في حالة التحديد */}
                  {mode === "kids" && (
                    <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-orange-400 via-amber-400 to-rose-500" />
                  )}

                  {/* شارة التميز أعلى البطاقة */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30">
                      <Gamepad2 className="w-3 h-3 text-orange-500" />
                      ركن البراعم وفرسان القرآن
                    </span>

                    {/* زر الاختيار الدائري المشع */}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                        mode === "kids"
                          ? "bg-gradient-to-tr from-orange-500 to-amber-400 text-white shadow-md shadow-orange-500/50 scale-110"
                          : "border-2 border-border/80 group-hover:border-orange-500/60"
                      }`}
                    >
                      {mode === "kids" && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>

                  {/* المحتوى الرئيسي للبطاقة */}
                  <div className="flex items-start gap-3.5 mb-3.5">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 via-amber-500 to-rose-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/30 group-hover:scale-105 transition-transform">
                      <Baby className="w-8 h-8 stroke-[2.5]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-foreground text-lg sm:text-xl">
                          لأطفالي
                        </h3>
                        <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md">
                          تعليم وتحفيز ومرح
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-1">
                        ألعاب قرآنية تثبت الحفظ بصوت الشيخ حاج أيوب أمين، نجوم ومكافآت، وملفات مستقلة مع رمز حماية.
                      </p>
                    </div>
                  </div>

                  {/* استعراض ركن الأطفال المصغّر (Mini Kids Hub Preview) */}
                  <div className="w-full rounded-2xl bg-gradient-to-br from-orange-950/90 via-stone-950 to-amber-950/90 border border-orange-500/30 p-3.5 shadow-inner overflow-hidden text-white">
                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 flex items-center justify-center text-xs shadow-sm font-bold">
                          🦁
                        </div>
                        <span className="font-black text-amber-300">عمر • بطل القرآن</span>
                        <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-md font-bold">
                          المستوى ٣
                        </span>
                      </div>
                      <div className="flex items-center gap-1 font-black text-amber-400 text-xs">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>٤٥٠ نقطة</span>
                      </div>
                    </div>

                    {/* بطاقة التحدي واللعبة */}
                    <div className="flex items-center justify-between gap-3 py-1.5 px-1">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-md shrink-0">
                          <Gamepad2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-stone-100">تحدّي ترتيب الآيات</div>
                          <div className="w-32 bg-white/20 rounded-full h-2 mt-1 overflow-hidden">
                            <div className="bg-gradient-to-r from-amber-400 to-emerald-400 h-full rounded-full w-4/5 animate-pulse" />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 bg-amber-400/20 text-amber-300 px-2.5 py-1.5 rounded-xl border border-amber-400/30 shrink-0">
                        <Trophy className="w-4 h-4 fill-amber-400 text-amber-400 animate-bounce" />
                        <span className="text-[11px] font-bold">كنز اليوم</span>
                      </div>
                    </div>

                    {/* شرائح المزايا بالأسفل */}
                    <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-white/10 text-[10px] text-stone-300 flex-wrap">
                      <span className="bg-white/10 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                        <Shield className="w-2.5 h-2.5 text-emerald-400" /> قفل الوالدين
                      </span>
                      <span className="bg-white/10 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                        <Sparkles className="w-2.5 h-2.5 text-amber-400" /> أصوات تشجيعية
                      </span>
                      <span className="bg-white/10 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                        <Baby className="w-2.5 h-2.5 text-pink-400" /> ملفات متعددة
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================== الخطوة 2 (لو اختار الكبار): تخصيص الواجهة ===================== */}
          {cur === "parent_style" && (
            <div className="space-y-4 animate-fade-up">
              <div className="text-center space-y-1.5 pb-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-accent text-xs font-bold shadow-sm">
                  <Headphones className="w-3.5 h-3.5" />
                  <span>تخصيص تجربة الاستماع</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-gradient-gold font-quran">
                  كيف تفضّل شكل الواجهة؟
                </h2>
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed max-w-sm mx-auto">
                  اختر النمط المريح لك، ويمكنك تغييره لاحقاً في أي لحظة من الإعدادات.
                </p>
              </div>

              <div className="space-y-3.5 pt-1">
                {/* النمط الأول: وضع التلاوة الصافي الملكي */}
                <button
                  type="button"
                  onClick={() => setParentStyle("pure")}
                  className={`w-full text-right p-4 sm:p-5 rounded-3xl border-2 transition-all active:scale-[0.99] flex flex-col gap-3 relative overflow-hidden ${
                    parentStyle === "pure"
                      ? "border-amber-500 bg-gradient-to-b from-amber-500/20 via-card/95 to-card shadow-[0_12px_35px_rgba(217,119,6,0.25)] ring-2 ring-amber-400/30"
                      : "border-border/80 bg-card/85 hover:border-amber-500/40 shadow-soft"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-stone-950 flex items-center justify-center shrink-0 shadow-md">
                      <Headphones className="w-7 h-7 stroke-[2.5]" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-foreground text-base sm:text-lg">
                          وضع عادي (تلاوات الشيخ حاج أيوب أمين فقط)
                        </span>
                        {parentStyle === "pure" && (
                          <span className="w-6 h-6 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center shadow-sm">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <span className="block text-xs text-muted-foreground leading-relaxed mt-1">
                        واجهة صافية وسكينة تامة للاستماع لتلاوات الشيخ حاج أيوب أمين برواية ورش، خالية تماماً من ركن الأطفال.
                      </span>
                    </div>
                  </div>

                  <div className="w-full py-2.5 px-3 rounded-xl bg-background/80 border border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-bold text-foreground">
                      <BookOpen className="w-3.5 h-3.5 text-accent" /> تلاوات ومصحف وتفسير
                    </span>
                    <span className="text-[11px] bg-secondary px-2.5 py-0.5 rounded-md text-secondary-foreground font-bold">
                      ركن الأطفال مخفي تماماً
                    </span>
                  </div>
                </button>

                {/* النمط الثاني: الوضع المرن الشامل */}
                <button
                  type="button"
                  onClick={() => setParentStyle("flexible")}
                  className={`w-full text-right p-4 sm:p-5 rounded-3xl border-2 transition-all active:scale-[0.99] flex flex-col gap-3 relative overflow-hidden ${
                    parentStyle === "flexible"
                      ? "border-sky-500 bg-gradient-to-b from-sky-500/20 via-card/95 to-card shadow-[0_12px_35px_rgba(14,165,233,0.25)] ring-2 ring-sky-400/30"
                      : "border-border/80 bg-card/85 hover:border-sky-500/40 shadow-soft"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 via-sky-500 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
                      <ArrowLeftRight className="w-7 h-7 stroke-[2.5]" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-foreground text-base sm:text-lg">
                          وضع التنقل المرن
                        </span>
                        {parentStyle === "flexible" && (
                          <span className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-sm">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <span className="block text-xs text-muted-foreground leading-relaxed mt-1">
                        تصفح التلاوات بحرية تامة مع إبقاء زر ركن الأطفال متاحاً للتبديل السريع عند الحاجة.
                      </span>
                    </div>
                  </div>

                  <div className="w-full py-2.5 px-3 rounded-xl bg-background/80 border border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-bold text-foreground">
                      <Sparkles className="w-3.5 h-3.5 text-sky-500" /> كبار + إمكانية تجربة ركن الأطفال
                    </span>
                    <span className="text-[11px] bg-sky-500/15 text-sky-600 dark:text-sky-400 px-2.5 py-0.5 rounded-md font-bold border border-sky-500/20">
                      ركن الأطفال متاح
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ===================== الخطوة 2 (لو اختار الأطفال): ملفات أبطال القرآن ===================== */}
          {cur === "kids" && (
            <div className="space-y-4 animate-fade-up">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-400 text-xs font-bold shadow-sm">
                  <Baby className="w-3.5 h-3.5" />
                  <span>تجهيز أبطال القرآن</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-gradient-gold font-quran">
                  ملفّات أبطال القرآن
                </h2>
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed max-w-sm mx-auto">
                  أنشئ ملفاً لكل بطل لتوثيق إنجازه وتخصيص رحلته التشجيعية.
                </p>
              </div>

              <div className="space-y-3.5 max-h-[55vh] overflow-y-auto px-1">
                {kids.map((k, i) => (
                  <div
                    key={i}
                    className="p-4 sm:p-5 rounded-3xl bg-card/95 border border-amber-500/30 shadow-[0_10px_30px_rgba(0,0,0,0.2)] space-y-3.5 transition-all"
                  >
                    <div className="flex items-center gap-3.5">
                      <span
                        className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${k.color} flex items-center justify-center shadow-lg shrink-0 ring-2 ring-white/30`}
                      >
                        <Avatar name={k.avatar} className="w-8 h-8 text-white" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-accent flex items-center gap-1">
                            <Award className="w-3.5 h-3.5 text-amber-500" /> البطل {i + 1}
                          </span>
                        </div>
                        <input
                          value={k.name}
                          onChange={(e) => setKid(i, { name: e.target.value })}
                          placeholder="اكتب اسم البطل..."
                          className="w-full mt-1 rounded-xl bg-background border border-border px-3 py-2 text-foreground font-bold placeholder-muted-foreground focus:border-accent outline-none transition-colors text-sm shadow-inner"
                        />
                      </div>
                      {kids.length > 1 && (
                        <button
                          type="button"
                          onClick={() => delKid(i)}
                          className="w-9 h-9 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive flex items-center justify-center active:scale-95 shrink-0 transition-colors"
                          title="حذف هذا الطفل"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* ضبط العمر */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                      <span className="text-xs font-bold text-muted-foreground">العمر</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setKid(i, { age: Math.max(3, k.age - 1) })}
                          className="w-8 h-8 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground flex items-center justify-center font-black active:scale-95 shadow-sm"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-10 text-center font-black text-lg text-accent">
                          {k.age}
                        </span>
                        <button
                          type="button"
                          onClick={() => setKid(i, { age: Math.min(15, k.age + 1) })}
                          className="w-8 h-8 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground flex items-center justify-center font-black active:scale-95 shadow-sm"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* جنس الطفل */}
                    <div>
                      <span className="block text-[11px] text-muted-foreground mb-1.5 font-bold">
                        جنس الطفل:
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setKid(i, { gender: "boy", avatar: KID_AVATARS_BOY[0] })}
                          className={`flex-1 py-2 rounded-xl text-xs font-black transition-all border flex items-center justify-center gap-1.5 ${
                            k.gender === "boy"
                              ? "bg-accent/20 border-accent text-accent shadow-sm"
                              : "bg-background/80 text-muted-foreground hover:bg-secondary border-border"
                          }`}
                        >
                          <span>👦 ولد</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setKid(i, { gender: "girl", avatar: KID_AVATARS_GIRL[0] })}
                          className={`flex-1 py-2 rounded-xl text-xs font-black transition-all border flex items-center justify-center gap-1.5 ${
                            k.gender === "girl"
                              ? "bg-pink-500/20 border-pink-500 text-pink-600 dark:text-pink-400 shadow-sm"
                              : "bg-background/80 text-muted-foreground hover:bg-secondary border-border"
                          }`}
                        >
                          <span>👧 بنت</span>
                        </button>
                      </div>
                    </div>

                    {/* اختيار الشخصية المحبوبة */}
                    <div>
                      <span className="block text-[11px] text-muted-foreground mb-1.5 font-bold">
                        اختر الوجه المحبوب:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(k.gender === "girl" ? KID_AVATARS_GIRL : KID_AVATARS_BOY).map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => setKid(i, { avatar: a })}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                              k.avatar === a
                                ? "bg-accent text-accent-foreground shadow-md scale-110 ring-2 ring-accent"
                                : "bg-muted text-muted-foreground hover:bg-secondary"
                            }`}
                          >
                            <Avatar name={a} className="w-6 h-6" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* اختيار اللون المفضل */}
                    <div>
                      <span className="block text-[11px] text-muted-foreground mb-1.5 font-bold">
                        اختر اللون المفضل:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {KID_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setKid(i, { color: c })}
                            className={`w-7 h-7 rounded-lg bg-gradient-to-br ${c} transition-all ${
                              k.color === c ? "ring-2 ring-foreground scale-110 shadow-sm" : ""
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addKid}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-500/40 bg-amber-500/5 py-3.5 font-black text-accent hover:bg-amber-500/10 transition-colors active:scale-[0.99]"
                >
                  <Plus className="w-5 h-5" />
                  <span>إضافة بطل آخر</span>
                </button>
              </div>
            </div>
          )}

          {/* ===================== الخطوة 3 (لو اختار الأطفال): رمز قفل الأمان ===================== */}
          {cur === "pin" && (
            <div className="space-y-4 text-center animate-fade-up">
              <div className="relative mx-auto w-20 h-20">
                <span aria-hidden className="absolute inset-0 rounded-3xl bg-emerald-500/25 blur-xl animate-pulse" />
                <div className="relative w-20 h-20 rounded-3xl bg-card border border-emerald-500/40 text-emerald-500 flex items-center justify-center shadow-[0_8px_30px_rgba(16,185,129,0.25)]">
                  <ShieldCheck className="w-11 h-11" />
                </div>
              </div>

              <div className="space-y-1">
                <h2 className="text-2xl sm:text-3xl font-black text-gradient-gold font-quran">
                  رمز قفل وليّ الأمر
                </h2>
                <p className="text-muted-foreground text-xs leading-relaxed max-w-sm mx-auto">
                  رمز من ٤ أرقام يحمي إعدادات الوالدين والخروج من ركن الأطفال.
                  <br />
                  <b className="text-foreground">اتركه فارغاً لتخطّيه الآن</b> — يمكنك تعيينه لاحقاً من الإعدادات.
                </p>
              </div>

              {/* بطاقة الخزنة الرقمية للرمز */}
              <div className="p-5 rounded-3xl bg-card/90 border border-amber-500/30 max-w-xs mx-auto space-y-3 shadow-soft">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Lock className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-foreground">الحماية العائلية</span>
                </div>

                <div className="space-y-2.5">
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    type="password"
                    placeholder="••••"
                    className="w-full text-center tracking-[0.6em] text-2xl font-black rounded-2xl bg-background border border-border px-3 py-3 text-foreground focus:border-accent outline-none transition-colors shadow-inner"
                  />
                  <input
                    value={pin2}
                    onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    type="password"
                    placeholder="تأكيد الرمز"
                    className="w-full text-center tracking-[0.6em] text-2xl font-black rounded-2xl bg-background border border-border px-3 py-3 text-foreground focus:border-accent outline-none transition-colors shadow-inner"
                  />
                </div>

                {pin && pin2 && pin !== pin2 && (
                  <p className="text-xs text-destructive font-bold pt-1">الرمزان غير متطابقين</p>
                )}
                {pinValid && (
                  <p className="text-xs text-emerald-500 font-bold flex items-center justify-center gap-1 pt-1">
                    <KeyRound className="w-4 h-4" /> تم تأكيد الرمز بنجاح
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ===================== أزرار التنقّل السفلية الملكية ===================== */}
        <div className="flex items-center gap-3 pt-4 border-t border-border/40 mt-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-5 py-3.5 rounded-2xl bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold transition-all active:scale-95 shadow-sm text-sm flex items-center gap-1.5"
            >
              <ChevronRight className="w-4 h-4" />
              <span>السابق</span>
            </button>
          )}

          {step < lastIdx ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={(cur === "kids" && !kidsValid) || (cur === "pin" && !pinOk)}
              className="welcome-start-button btn-gold relative overflow-hidden flex-1 px-5 py-3.5 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-[0_10px_35px_rgba(245,158,11,0.4)] disabled:opacity-40 transition-all active:scale-[0.98] group"
            >
              {/* شريط وميض عابر فوق الزر */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

              {cur === "who" ? (
                <>
                  <span>المتابعة كـ "{mode === "parent" ? "لي أنا" : "لأطفالي"}"</span>
                  <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </>
              ) : cur === "pin" && !pin && !pin2 ? (
                <>
                  <span>تخطّي الرمز والمتابعة</span>
                  <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </>
              ) : (
                <>
                  <span>التالي</span>
                  <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="welcome-start-button btn-gold relative overflow-hidden flex-1 px-5 py-3.5 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-[0_12px_40px_rgba(245,158,11,0.45)] disabled:opacity-40 transition-all active:scale-[0.98] group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <Check className="w-5 h-5 stroke-[3] group-hover:scale-110 transition-transform" />
              <span>
                {cur === "parent_style"
                  ? "ابدأ التلاوة المباركة"
                  : cur === "pin"
                  ? "ابدأ رحلة الأبطال"
                  : "ابدأ الاستخدام"}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
