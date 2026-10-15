import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Wrench, User, Baby, Plus, Trash2, Minus, KeyRound, Shield, BookOpen, Headphones, Settings, Star, Gamepad2, Puzzle, Trophy, Sparkles, BookmarkCheck, ArrowLeftRight, Youtube } from "lucide-react";

import { setAppMode, addProfile, setActiveProfile, kidsHidden, setKidsHidden, setPureMode, isPureMode, KID_AVATARS_BOY, KID_AVATARS_GIRL, KID_COLORS, type AppMode } from "../data/kidsProfile";
import { setKidsPin, setKidsLocked } from "../data/kidsLock";
import Avatar from "./Avatar";
import { openExternalUrl } from "../utils/tauriUtils";




const ONBOARD_KEY = "mushaf:onboarded:v1";

export const isOnboarded = (): boolean => {
  try { return localStorage.getItem(ONBOARD_KEY) === "1"; } catch { return true; }
};

interface NewKid { name: string; age: number; gender: "boy" | "girl"; avatar: string; color: string; }

export default function WelcomeOverlay({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<AppMode | null>(null);
  const [parentStyle, setParentStyle] = useState<"pure" | "flexible">("pure");
  const [kids, setKids] = useState<NewKid[]>([{ name: "", age: 6, gender: "boy", avatar: KID_AVATARS_BOY[0], color: KID_COLORS[0] }]);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");


  // إذا أخفى المالك ركن الأطفال: إطلاق بالسماع فقط — نتخطّى خطوات الأطفال ونثبّت وضع وليّ الأمر
  const kidsOff = kidsHidden() || isPureMode();
  const effMode: AppMode = kidsOff ? "parent" : (mode ?? "parent");
  // مفاتيح الخطوات: وضع وليّ الأمر يعرض شاشة اختيار نوع الاستخدام؛ وضع الأطفال يعرض خطوة ركن الأطفال ورمز وليّ الأمر
  const stepKeys = kidsOff
    ? ["welcome"]
    : mode === "parent"
      ? ["welcome", "who", "parent_style"]
      : mode === "kids"
        ? ["welcome", "who", "kids", "pin"]
        : ["welcome", "who"];
  const cur = stepKeys[step] || stepKeys[0];
  const lastIdx = stepKeys.length - 1;
  const pinValid = /^\d{4}$/.test(pin) && pin === pin2;
  const pinOk = (!pin && !pin2) || pinValid;   // الرمز اختياري: فارغ = تخطٍّ، أو صالح ومتطابق

  const finalize = () => {
    const finalMode = mode ?? effMode;
    setAppMode(finalMode);
    if (finalMode === "parent") {
      // الوضع العادي: منع كامل لأي وصول للأطفال (حتى في وضع المطور)
      // وضع التنقل المرن: يُسمح للمالك بالتجربة
      setPureMode(parentStyle === "pure");
      setKidsHidden(parentStyle === "pure");
      setKidsLocked(false);
    } else {
      setPureMode(false);
      setKidsHidden(false);
      setKidsLocked(true);
      if (pinValid) setKidsPin(pin);
      const valid = kids.filter(k => k.name.trim());
      const list = valid.length ? valid : [{ name: "طفلي", age: 6, gender: "boy" as const, avatar: KID_AVATARS_BOY[0], color: KID_COLORS[0] }];
      let firstId = "";
      list.forEach((k, i) => {
        const p = addProfile({ name: k.name.trim() || `طفل ${i + 1}`, age: k.age, gender: k.gender, avatar: k.avatar, color: k.color || KID_COLORS[i % KID_COLORS.length] });
        if (i === 0) firstId = p.id;
      });
      if (firstId) setActiveProfile(firstId);
    }
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch { /* ignore */ }
  };
  const finish = () => { finalize(); onDone(); };
  const finishToTools = () => { /* أدوات المعلّم معطّلة */ };



  const pick = (m: AppMode) => { setMode(m); setStep(2); };
  const addKid = () => setKids(k => [...k, { name: "", age: 6, gender: "boy", avatar: KID_AVATARS_BOY[0], color: KID_COLORS[k.length % KID_COLORS.length] }]);
  const delKid = (i: number) => setKids(k => (k.length > 1 ? k.filter((_, j) => j !== i) : k));
  const setKid = (i: number, patch: Partial<NewKid>) => setKids(k => k.map((x, j) => (j === i ? { ...x, ...patch } : x)));


  const kidsValid = kids.some(k => k.name.trim());

  const ModeCard = ({ m, Icon, title, desc, children }: { m: AppMode; Icon: typeof User; title: string; desc: string; children: React.ReactNode }) => (
    <button onClick={() => pick(m)}
      className={`group w-full flex flex-col gap-3 rounded-2xl border p-4 text-right transition-all active:scale-[0.99] ${mode === m ? "border-accent bg-accent/15 shadow-gold" : "border-border bg-card hover:border-accent/50 shadow-soft"}`}>
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-black flex items-center justify-center shrink-0 shadow-soft transition-transform group-hover:scale-105"><Icon className="w-6 h-6" /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-extrabold text-foreground">{title}</span>
          <span className="block text-[12px] text-muted-foreground leading-relaxed">{desc}</span>
        </span>
      </div>
      <div className="w-full h-24 mt-1 rounded-xl bg-background/50 border border-border/50 overflow-hidden relative flex items-center justify-center p-2 gap-2">
        {children}
      </div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] page-nour text-foreground overflow-y-auto" dir="rtl">
      {/* وهج ذهبي زخرفيّ خلف المحتوى */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full bg-accent/15 blur-3xl animate-breathe" />
        <div className="absolute bottom-0 -right-20 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-md px-5 py-8 min-h-full flex flex-col">
        {/* مؤشّر الخطوات */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {stepKeys.map((_, i) => <span key={i} className={`h-2 rounded-full transition-all ${i === step ? "w-8 bg-accent shadow-gold" : i < step ? "w-2 bg-success" : "w-2 bg-border"}`} />)}
        </div>

        <div className="flex-1">
          {cur === "welcome" && (
            <div className="text-center space-y-5 pt-2 animate-fade-up">
              <div className="relative mx-auto w-40 h-40">
                <div className="absolute inset-0 rounded-full bg-accent/30 blur-2xl animate-breathe" />
                <span aria-hidden className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-gold-light to-gold opacity-80 blur-[2px]" />
                <img src="/assets/quran_icon.png" alt="القرآن الكريم"
                  className="relative w-40 h-40 rounded-full object-cover ring-4 ring-accent/80 shadow-gold"
                  style={{ objectPosition: "center top" }} loading="eager" />
              </div>
              <div className="space-y-1">
                <h1 className="text-4xl font-extrabold text-gradient-gold leading-tight">مرحباً بك</h1>
                <p className="text-accent text-sm font-bold">القرآن الكريم برواية ورش</p>
              </div>


              {/* وصف التطبيق */}
              <div className="w-full max-w-sm mx-auto space-y-3 p-4 rounded-2xl bg-card/60 border border-border/50 shadow-soft">
                <p className="text-foreground font-bold text-base leading-relaxed">
                  🌟 تطبيق تفاعلي لحفظ القرآن الكريم بالتكرار
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-accent/10 border border-accent/20">
                    <Headphones className="w-4 h-4 text-accent shrink-0" />
                    <span className="font-medium">استمع للتلاوات</span>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
                    <Gamepad2 className="w-4 h-4 text-sky-500 shrink-0" />
                    <span className="font-medium">ألعاب تعليمية</span>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <Trophy className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-medium">جوائز ومكافآت</span>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <BookmarkCheck className="w-4 h-4 text-purple-500 shrink-0" />
                    <span className="font-medium">تتبع التقدم</span>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed pt-1">
                  {kidsOff ? "استمع إلى تلاوات القرآن الكريم برواية ورش." : "استمع للتلاوات العطرة مع ألعاب تعليمية وركن أطفال آمن."}
                </p>
              </div>

              {/* زر الاشتراك في قناة يوتيوب */}
              <button
                onClick={() => void openExternalUrl("https://www.youtube.com/@aminehadjyoub?sub_confirmation=1")}
                className="group w-full max-w-sm mx-auto flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl bg-gradient-to-l from-red-600 to-red-500 text-white font-bold text-sm shadow-lg hover:shadow-red-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Youtube className="w-5 h-5 shrink-0 group-hover:animate-bounce" />
                <span>اشترك في قناتنا على يوتيوب</span>
              </button>

              <div aria-hidden className="mx-auto w-24 h-px bg-gradient-to-l from-transparent via-accent/60 to-transparent" />
            </div>
          )}

          {cur === "who" && (
            <div className="space-y-3 animate-fade-up">
              <h2 className="text-xl font-extrabold text-accent text-center">لِمَن هذا التطبيق؟</h2>
              <p className="text-muted-foreground text-sm text-center leading-relaxed">اختر طريقة الاستخدام — يمكنك تغييرها لاحقاً من الإعدادات.</p>
              <div className="space-y-4 pt-1">
                <ModeCard m="parent" Icon={User} title="لي أنا" desc="استمع للتلاوات العطرة بحرية، مع إعدادات متقدمة. (بلا ركن أطفال)">
                  <div className="flex-1 h-full rounded-lg bg-card border border-border/50 flex flex-col p-2 gap-1.5 shadow-sm">
                    <div className="flex justify-between items-center">
                      <div className="w-8 h-2 rounded bg-muted-foreground/30" />
                      <div className="w-4 h-4 rounded-full bg-accent/50 flex items-center justify-center"><BookOpen className="w-2.5 h-2.5 text-accent-foreground" /></div>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-2">
                      <div className="w-3/4 h-2 rounded bg-foreground/20" />
                      <div className="w-full h-2 rounded bg-foreground/20" />
                      <div className="w-5/6 h-2 rounded bg-foreground/20" />
                    </div>
                  </div>
                  <div className="w-10 h-full flex flex-col gap-1.5 justify-end">
                    <div className="w-full h-8 rounded-lg bg-accent/20 flex items-center justify-center"><Headphones className="w-4 h-4 text-accent" /></div>
                    <div className="w-full h-8 rounded-lg bg-secondary flex items-center justify-center"><Settings className="w-4 h-4 text-muted-foreground" /></div>
                  </div>
                </ModeCard>
                <ModeCard m="kids" Icon={Baby} title="لأطفالي" desc="واجهة مبسطة، ألعاب قرآنية، ومكافآت لكل طفل بملف منفصل.">
                  <div className="w-full h-full flex flex-col gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-orange-400 flex items-center justify-center shadow-sm"><Baby className="w-5 h-5 text-white" /></div>
                      <div className="flex-1 h-2 rounded bg-foreground/20" />
                      <div className="w-10 h-4 rounded-full bg-accent/20 flex items-center justify-center gap-0.5"><Star className="w-2.5 h-2.5 text-accent fill-accent" /><div className="w-3 h-1.5 rounded bg-accent/50" /></div>
                    </div>
                    <div className="flex flex-1 items-center justify-center gap-3 pb-1">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600"><Gamepad2 className="h-6 w-6" /></div>
                      <div className="space-y-1">
                        <div className="h-2 w-24 rounded bg-foreground/20" />
                        <div className="h-2 w-16 rounded bg-foreground/10" />
                      </div>
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/20"><Star className="h-4 w-4 fill-amber-400 text-amber-500" /></div>
                    </div>
                  </div>
                </ModeCard>
              </div>
            </div>
          )}

          {cur === "kids" && (
            <div className="space-y-3 animate-fade-up">
              <div className="text-center space-y-1">
                  <h2 className="text-xl font-extrabold text-accent">ملفّات الأطفال</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">أنشئ ملفاً لكل طفل (الاسم، العمر، ووجه يحبّه) — كما في يوتيوب على التلفاز.</p>
              </div>
              <div className="space-y-3">
                {kids.map((k, i) => (
                  <div key={i} className="card-nour p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-16 h-16 rounded-3xl bg-gradient-to-br ${k.color} flex items-center justify-center shadow-lg shrink-0`}><Avatar name={k.avatar} className="w-8 h-8 text-white" /></span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-bold text-accent">الطفل {i + 1}</span>
                        <input value={k.name} onChange={e => setKid(i, { name: e.target.value })} placeholder="اسم الطفل"
                          className="w-full mt-1 rounded-xl bg-muted border border-border px-3 py-2 text-foreground placeholder-muted-foreground focus:border-accent outline-none transition-colors" />
                      </div>
                      {kids.length > 1 && <button onClick={() => delKid(i)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-destructive active:scale-95 shrink-0"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">العمر</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setKid(i, { age: Math.max(3, k.age - 1) })} className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center active:scale-95"><Minus className="w-4 h-4" /></button>
                        <span className="w-10 text-center font-extrabold text-lg text-accent">{k.age}</span>
                        <button onClick={() => setKid(i, { age: Math.min(15, k.age + 1) })} className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center active:scale-95"><Plus className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-muted-foreground mb-1 font-bold">جنس الطفل:</span>
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => setKid(i, { gender: "boy", avatar: KID_AVATARS_BOY[0] })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${k.gender === "boy" ? "bg-accent/20 border-accent text-accent" : "bg-card text-muted-foreground hover:bg-secondary"}`}
                        >
                          ولد
                        </button>
                        <button
                          onClick={() => setKid(i, { gender: "girl", avatar: KID_AVATARS_GIRL[0] })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${k.gender === "girl" ? "bg-pink-500/20 border-pink-500 text-pink-500" : "bg-card text-muted-foreground hover:bg-secondary"}`}
                        >
                          بنت
                        </button>
                      </div>

                      <span className="block text-[11px] text-muted-foreground mb-1">اختر وجهاً</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(k.gender === 'girl' ? KID_AVATARS_GIRL : KID_AVATARS_BOY).map(a => (
                          <button key={a} onClick={() => setKid(i, { avatar: a })}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${k.avatar === a ? "bg-accent/25 ring-2 ring-accent scale-105 text-accent" : "bg-muted text-muted-foreground"}`}><Avatar name={a} className="w-5 h-5" /></button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] text-muted-foreground mb-1">اختر لوناً</span>
                      <div className="flex flex-wrap gap-1.5">
                        {KID_COLORS.map(c => (
                          <button key={c} onClick={() => setKid(i, { color: c })}
                            className={`w-8 h-8 rounded-xl bg-gradient-to-br ${c} transition-all ${k.color === c ? "ring-2 ring-foreground scale-110" : ""}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addKid} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/50 py-3 font-bold text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors active:scale-[0.99]">
                  <Plus className="w-5 h-5" /> إضافة طفل آخر
                </button>
              </div>
            </div>
          )}

          {cur === "pin" && (
            <div className="space-y-4 text-center animate-fade-up">
              <div className="relative mx-auto w-20 h-20">
                <span aria-hidden className="absolute inset-0 rounded-3xl bg-accent/25 blur-xl" />
                <div className="relative w-20 h-20 rounded-3xl bg-secondary text-accent flex items-center justify-center shadow-soft"><Shield className="w-11 h-11" /></div>
              </div>
              <h2 className="text-xl font-extrabold text-accent">رمز وليّ الأمر <span className="text-muted-foreground font-bold">(اختياري)</span></h2>
              <p className="text-muted-foreground leading-relaxed text-sm">رمز من ٤ أرقام يحمي إعدادات الأهل والخروج من ركن الأطفال. <b className="text-foreground">اتركه فارغاً لتخطّيه</b> — يمكنك ضبطه لاحقاً.</p>
              <div className="space-y-2 max-w-[220px] mx-auto">
                <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" placeholder="••••"
                  className="w-full text-center tracking-[0.6em] text-2xl font-extrabold rounded-xl bg-muted border border-border px-3 py-3 text-foreground focus:border-accent outline-none transition-colors" />
                <input value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" placeholder="تأكيد الرمز"
                  className="w-full text-center tracking-[0.6em] text-2xl font-extrabold rounded-xl bg-muted border border-border px-3 py-3 text-foreground focus:border-accent outline-none transition-colors" />
              </div>
              {pin && pin2 && pin !== pin2 && <p className="text-xs text-destructive">الرمزان غير متطابقين</p>}
              {pinValid && <p className="text-xs text-success flex items-center justify-center gap-1"><KeyRound className="w-3.5 h-3.5" /> الرمز جاهز</p>}
            </div>
          )}

          {cur === "parent_style" && (
            <div className="space-y-4 animate-fade-up">
              <div className="text-center space-y-1.5">
                <h2 className="text-2xl font-extrabold text-gradient-gold">تخصيص وضع الاستماع</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  اختر طريقة عرض الواجهة المفضلة لك — يمكنك تغييرها لاحقاً من الإعدادات.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                {/* الخيار الأول: وضع عادي خالي من الأطفال */}
                <button
                  type="button"
                  onClick={() => setParentStyle("pure")}
                  className={`w-full text-right p-4 rounded-2xl border transition-all active:scale-[0.99] flex flex-col gap-3 ${
                    parentStyle === "pure"
                      ? "border-accent bg-accent/15 shadow-gold ring-1 ring-accent/50"
                      : "border-border bg-card hover:border-accent/40 shadow-soft"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-black flex items-center justify-center shrink-0 shadow-soft">
                      <Headphones className="w-6 h-6" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-foreground text-base">وضع عادي (استماع وتلاوات فقط)</span>
                        {parentStyle === "pure" && (
                          <span className="w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      <span className="block text-[12px] text-muted-foreground leading-relaxed mt-0.5">
                        واجهة مخصصة لك فقط، خالية تماماً من أزرار أو ركن الأطفال.
                      </span>
                    </div>
                  </div>

                  <div className="w-full py-2 px-3 rounded-xl bg-background/60 border border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Headphones className="w-4 h-4 text-accent" /> تلاوات واستماع بدون أطفال
                    </span>
                    <span className="text-[11px] bg-secondary px-2 py-0.5 rounded-md text-secondary-foreground font-semibold">
                      ركن الأطفال مخفي
                    </span>
                  </div>
                </button>

                {/* الخيار الثاني: وضع مرن مع إمكانية التنقل */}
                <button
                  type="button"
                  onClick={() => setParentStyle("flexible")}
                  className={`w-full text-right p-4 rounded-2xl border transition-all active:scale-[0.99] flex flex-col gap-3 ${
                    parentStyle === "flexible"
                      ? "border-accent bg-accent/15 shadow-gold ring-1 ring-accent/50"
                      : "border-border bg-card hover:border-accent/40 shadow-soft"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-soft">
                      <ArrowLeftRight className="w-6 h-6" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-foreground text-base">وضع التنقل المرن</span>
                        {parentStyle === "flexible" && (
                          <span className="w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      <span className="block text-[12px] text-muted-foreground leading-relaxed mt-0.5">
                        تصفح التلاوات مع إبقاء زر ركن الأطفال متاحاً للتنقل والتبديل متى أردت.
                      </span>
                    </div>
                  </div>

                  <div className="w-full py-2 px-3 rounded-xl bg-background/60 border border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Sparkles className="w-4 h-4 text-sky-400" /> كبار + إمكانية التبديل
                    </span>
                    <span className="text-[11px] bg-secondary px-2 py-0.5 rounded-md text-secondary-foreground font-semibold">
                      ركن الأطفال متاح
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}


        </div>

        {/* أزرار التنقّل */}
        <div className="flex items-center gap-2 pt-6">
          {step > 0 && <button onClick={() => setStep(s => s - 1)} className="px-5 py-3 rounded-xl bg-secondary text-secondary-foreground font-bold hover:brightness-95 transition-all active:scale-95">السابق</button>}
          {step < lastIdx ? (
            cur === "who" ? null : (
              <button onClick={() => setStep(s => s + 1)} disabled={(cur === "kids" && !kidsValid) || (cur === "pin" && !pinOk)}
                className="btn-gold flex-1 px-5 py-3 disabled:opacity-40">{cur === "pin" && !pin && !pin2 ? "تخطّي" : "التالي"}</button>
            )
          ) : (
            <button onClick={finish}
              className="welcome-start-button btn-gold flex-1 px-5 py-3 disabled:opacity-40">
              <Check className="w-5 h-5" />
              {cur === "parent_style" ? "ابدأ التلاوة" : "ابدأ"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
