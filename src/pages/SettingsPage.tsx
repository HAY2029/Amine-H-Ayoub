import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Moon, Sun, Baby, ChevronLeft, X, BarChart3, Wrench, Pencil, User, GraduationCap, BookOpen, Lock, Settings as SettingsIcon, MessageSquare, Delete, Headphones, Power, Check, Bell, Clock, Star, Gift, Palette, Eye, EyeOff, RotateCcw, Sparkles, Mic } from "lucide-react";
import { isMushafDevEnabled, setMushafDev, closeTauriApp } from "../utils/tauriUtils";
import { getAppMode, setAppMode, getProfiles, addProfile, kidsHidden, setKidsHidden, setPureMode, isPureMode, getCoins, addCoins, type AppMode } from "../data/kidsProfile";
import { redeemOneTimeCode, syncAdminDataFromServer } from "../data/titles";
import { getReminderSettings, saveReminderSettings, showLocalNotification, requestNotificationPermission, type ReminderSettings } from "../utils/notifications";
import {
  getLocalShadingSettings,
  saveShadingToServer,
  applyAndSaveShading,
  syncShadingFromServer,
  PRESET_SHADING_COLORS,
  getAyahShadingStyle,
  DEFAULT_SETTINGS,
  type ShadingSettings
} from "../services/shadingSyncService";


import PinModal from "../components/PinModal";
import ParentalGateModal from "../components/ParentalGateModal";
import AdminGamesModal from "../components/AdminGamesModal";
import SupportModal from "../components/SupportModal";
import WhatsAppIcon from "../components/WhatsAppIcon";
import { openWhatsAppSupport, SUPPORT_WHATSAPP_DISPLAY } from "../services/resendService";
import { toast } from "../hooks/use-toast";

import { hasKidsPin, setKidsPin, removeKidsPin, setKidsLocked, isKidsMode } from "../data/kidsLock";
import AppFooter from "../components/AppFooter";
import AppNav from "../components/AppNav";
import { isBackgroundAudioEnabled, setBackgroundAudioEnabled } from "../utils/backgroundAudio";
import { applyTheme, getTheme } from "../utils/theme";
const THEME_KEY = "mushaf:theme";

/** عنوان قسم صغير فوق مجموعة مرتّبة. */
const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section className="space-y-1.5">
    <h2 className="px-1.5 text-xs font-extrabold text-muted-foreground">{label}</h2>
    <div className="card-nour overflow-hidden divide-y divide-border">{children}</div>
  </section>
);

/** صفّ داخل مجموعة (بلا بطاقة منفصلة — تفصلها خطوط المجموعة). */
const Item = ({ icon, title, desc, onClick, right }: { icon: React.ReactNode; title: string; desc?: string; onClick?: () => void; right?: React.ReactNode }) => (
  <button onClick={onClick} className="w-full flex items-center gap-3 p-3 text-right hover:bg-muted/60 active:scale-[0.99] transition-colors">
    <span className="w-10 h-10 rounded-xl bg-secondary text-accent flex items-center justify-center shrink-0">{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block font-bold text-foreground">{title}</span>
      {desc && <span className="block text-[11px] text-muted-foreground leading-relaxed">{desc}</span>}
    </span>
    {right ?? <ChevronLeft className="w-5 h-5 text-muted-foreground" />}
  </button>
);

export default function SettingsPage() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<"dark" | "light">(getTheme);
  const [appMode, setMode] = useState<AppMode>(getAppMode);
  const [showPin, setShowPin] = useState(false);
  const [showGate, setShowGate] = useState(false);

  const [owner, setOwner] = useState(isMushafDevEnabled);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  useEffect(() => { const h = () => setOwner(isMushafDevEnabled()); window.addEventListener("mushaf:ownermode", h); return () => window.removeEventListener("mushaf:ownermode", h); }, []);
  const disableOwner = () => { setMushafDev(false); setOwner(false); toast({ title: "أُوقف وضع المالك", description: "عادت رسالة التطوير للمستخدمين" }); };
  const [hideKids, setHideKids] = useState(kidsHidden);
  const [showSplash, setShowSplash] = useState<AppMode | false>(false);
  const toggleHideKids = () => { 
    const next = !kidsHidden(); 
    setKidsHidden(next); 
    setPureMode(next); // تفعيل الوضع العادي الصارم عند إخفاء الأطفال
    setHideKids(next); 
    if (next) {
      toast({ title: "أُخفي ركن الأطفال والألعاب بالكامل" });
    } else {
      setShowSplash("kids");
      setTimeout(() => navigate("/games"), 2500);
    }
  };
  // كلمة المرور (رمز وليّ الأمر): تعيين/تغيير/إزالة من الإعدادات
  const [hasPin, setHasPin] = useState(hasKidsPin);
  const [pinFlow, setPinFlow] = useState<null | "verifyOld" | "setNew">(null);
  const [pendingMode, setPendingMode] = useState<AppMode | null>(null);
  const [bgAudio, setBgAudio] = useState(isBackgroundAudioEnabled);
  const [coins, setCoins] = useState(getCoins);
  const [rewardCode, setRewardCode] = useState("");
  const [rewardCodeMessage, setRewardCodeMessage] = useState("");
  const [reminders, setReminders] = useState<ReminderSettings>(getReminderSettings);
  const updateReminders = (patch: Partial<ReminderSettings>) => {
    const next = saveReminderSettings(patch);
    setReminders(next);
  };
  const changePin = () => setPinFlow(hasKidsPin() ? "verifyOld" : "setNew");
  const removePin = () => { removeKidsPin(); setHasPin(false); toast({ title: "أُزيلت كلمة المرور" }); };
  const redeemRewardCode = async () => {
    await syncAdminDataFromServer();
    const amount = redeemOneTimeCode(rewardCode);
    if (amount < 0) {
      setRewardCodeMessage("الكود غير صالح أو استُخدم من قبل");
      return;
    }
    addCoins(amount);
    setCoins(getCoins());
    setRewardCode("");
    setRewardCodeMessage(`تمت إضافة ${amount} نجمة إلى الملف النشط`);
    toast({ title: `تمت إضافة ${amount} ⭐` });
  };

  // إعدادات تظليل الآيات (المعلّم وحده والطفل وحده وتعيين يدوي)
  const [shadingSettings, setShadingSettings] = useState<ShadingSettings>(getLocalShadingSettings);
  const [previewSpeaker, setPreviewSpeaker] = useState<"teacher" | "kids">("teacher");
  const [showShadingSettings, setShowShadingSettings] = useState(false);

  useEffect(() => {
    syncShadingFromServer().then(setShadingSettings).catch(() => {});
    const handleShadingChanged = (e: Event) => {
      const detail = (e as CustomEvent<ShadingSettings>).detail;
      if (detail) setShadingSettings(detail);
    };
    window.addEventListener("mushaf:shading_changed", handleShadingChanged);
    return () => window.removeEventListener("mushaf:shading_changed", handleShadingChanged);
  }, []);

  const updateShading = (patch: Partial<ShadingSettings>) => {
    const updated = applyAndSaveShading(patch);
    if (updated) {
      setShadingSettings(updated);
    }
  };

  const changeMode = (m: AppMode, style?: "pure" | "flexible") => {
    if (m === "kids" && kidsHidden()) {
      setKidsHidden(false);
      setPureMode(false); // تعطيل الوضع العادي عند التبديل للأطفال
      setHideKids(false);
    }
    // تحديد النمط لوليّ الأمر: مرن (ألعاب متاحة) أو صارم (بلا ألعاب)
    if (m === "parent") {
      const parentStyle = style ?? (kidsHidden() ? "pure" : "flexible");
      setPureMode(parentStyle === "pure");
      setKidsHidden(parentStyle === "pure");
      setHideKids(parentStyle === "pure");
    }
    setShowSplash(m);
    setTimeout(() => {
      setShowSplash(false);
      if (m === "kids" && !hasKidsPin()) {
         setPendingMode("kids");
         setPinFlow("setNew");
      } else {
         setMode(m); setAppMode(m);
         if (m === "kids") setKidsLocked(true);
         if (m === "parent") setKidsLocked(false);
         if (m === "kids" && getProfiles().length === 0) addProfile({ name: "طفلي" });
         const parentLabel = kidsHidden() ? "وضع صارم — تلاوات فقط" : "وضع مرن — تلاوات مع الألعاب";
         toast({ title: m === "parent" ? parentLabel : "وضع الأطفال" });
         if (m === "kids") navigate("/games");     // الانتقال لركن الأطفال بعد تجهيز الوضع
         if (m === "parent") navigate("/audio");   // الانتقال لواجهة وليّ الأمر (التلاوات)
      }
    }, 4000);
  };

  useEffect(() => { applyTheme(theme); try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ } }, [theme]);
  useEffect(() => {
    const handleAppMode = () => setMode(getAppMode());
    window.addEventListener("mushaf:appmode", handleAppMode);
    return () => window.removeEventListener("mushaf:appmode", handleAppMode);
  }, []);
  // حماية: إذا كان التطبيق في وضع الأطفال نطلب التحقق (رمز أو تحدي حسابي) قبل عرض الإعدادات.
  useEffect(() => {
    if (!isKidsMode()) return;
    // إذا تم التحقق للتوّ من رمز وليّ الأمر في صفحة أخرى (السماع/المصحف) لا نكرّر السؤال.
    try {
      if (sessionStorage.getItem("mushaf:settingsUnlocked") === "1") {
        sessionStorage.removeItem("mushaf:settingsUnlocked");
        return;
      }
    } catch { /* ignore */ }
    if (!hasKidsPin()) {
      setShowGate(true);
      return;
    }
    setShowPin(true);
  }, [navigate]);





  return (
    <div className="min-h-screen page-nour text-foreground" dir="rtl">
      {showSplash && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md animate-in fade-in duration-500">
          <div className="w-24 h-24 mb-6 relative">
            <div className="absolute inset-0 rounded-full border-4 border-accent border-t-transparent animate-spin" />
            <div className="absolute inset-2 rounded-full bg-accent/20 flex items-center justify-center">
              {showSplash === "kids" ? <Baby className="w-10 h-10 text-accent animate-pulse" /> : <User className="w-10 h-10 text-accent animate-pulse" />}
            </div>
          </div>
          <h2 className="text-2xl font-extrabold text-foreground mb-2">
            {showSplash === "kids" ? "جاري تجهيز ركن الأطفال..." : "جاري التبديل لوضع وليّ الأمر..."}
          </h2>
          <p className="text-muted-foreground">
            {showSplash === "kids" ? "لحظات ونبدأ المرح والتعلم" : "جاري إعداد واجهة الاستخدام"}
          </p>
        </div>
      )}
      {/* وهج ذهبي زخرفي علوي */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-accent/10 to-transparent" aria-hidden="true" />

      <div className="relative mx-auto max-w-md px-4 py-5 space-y-5">
        <AppNav />
        <header className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex h-10 items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-4 text-sm font-bold border border-border hover:brightness-95 active:scale-95 transition-all shadow-soft">
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <span className="w-16" />
        </header>

        {/* بطاقة العنوان */}
        <div className="card-nour relative overflow-hidden p-5 text-center animate-fade-up">
          <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-accent/10 blur-2xl" aria-hidden="true" />
          <span className="mx-auto mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-soft"><SettingsIcon className="h-6 w-6" /></span>
          <h1 className="font-extrabold text-2xl text-gradient-gold">الإعدادات</h1>
          <p className="mt-1 text-xs text-muted-foreground">خصّص المظهر وأدوات الأهل</p>
        </div>

        {/* ===== وضع الاستخدام — تصميم راقي ومنظم وبطاقات واضحة ===== */}
        <Section label="وضع استخدام التطبيق">
          <div className="p-3 sm:p-4 space-y-2.5">
            {[
              {
                key: "flex",
                title: "الوضع الشامل (تلاوات وألعاب)",
                badge: "تلاوات + ألعاب",
                description: "الواجهة المتكاملة المناسبة لجميع أفراد الأسرة؛ تلاوات القرآن الكريم مع بقاء ركن الألعاب متاحاً.",
                Icon: BookOpen,
                isActive: () => !isPureMode() && appMode === "parent" && !hideKids,
                onClick: () => changeMode("parent", "flexible"),
              },
              {
                key: "pure",
                title: "الوضع الهادئ (تلاوات فقط)",
                badge: "تلاوات فقط",
                description: "واجهة استماع وقراءة خاشعة وهادئة للكبار، مع إخفاء ركن الأطفال والألعاب بالكامل.",
                Icon: Headphones,
                isActive: () => (isPureMode() || hideKids) && appMode === "parent",
                onClick: () => changeMode("parent", "pure"),
              },
              {
                key: "kids",
                title: "ركن الأطفال الآمن والمحمي",
                badge: "مقفل برمز PIN",
                description: "بيئة تعليمية وترفيهية مخصصة للأطفال، مقفلة برمز حماية لمنع خروج الطفل إلى باقي أقسام التطبيق.",
                Icon: Baby,
                isActive: () => appMode === "kids",
                onClick: () => changeMode("kids"),
              },
            ].map((o) => {
              const active = o.isActive();
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={o.onClick}
                  className={`w-full p-3 sm:p-3.5 rounded-2xl border text-right transition-all flex items-center justify-between gap-3 group active:scale-[0.99] ${
                    active
                      ? "border-accent bg-accent/15 ring-2 ring-accent/30 shadow-sm"
                      : "border-border/70 bg-card/60 hover:bg-card hover:border-accent/40"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                        active
                          ? "bg-accent text-accent-foreground shadow-md shadow-accent/20"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      <o.Icon className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-xs sm:text-sm text-foreground">{o.title}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            active
                              ? "bg-accent/25 text-accent border border-accent/40"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {o.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {o.description}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 mr-1">
                    <div
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center border transition-all ${
                        active
                          ? "border-accent bg-accent text-accent-foreground shadow-sm"
                          : "border-border/80 bg-transparent text-transparent"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section label="حماية وركن الأطفال">
          <Item
            icon={<Baby className="w-5 h-5 text-accent" />}
            title={hideKids ? "إظهار ركن الأطفال والألعاب" : "إخفاء ركن الأطفال والألعاب"}
            desc={hideKids ? "ركن الأطفال مخفيّ حالياً عن الواجهة — اضغط لإظهاره" : "تفعيل/إخفاء ركن الأطفال والألعاب من جميع الواجهات"}
            onClick={toggleHideKids}
            right={<span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${hideKids ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>{hideKids ? "مخفيّ" : "ظاهر"}</span>}
          />
          <Item
            icon={<Lock className="w-5 h-5 text-accent" />}
            title={hasPin ? "تغيير رمز وليّ الأمر" : "تعيين رمز وليّ الأمر"}
            desc={hasPin ? "غير رمز الوصول إلى إعدادات ولي الأمر." : "عيّن رمزاً لحماية الإعدادات والانتقال إلى وضع الأطفال."}
            onClick={changePin}
          />
          {hasPin && (
            <Item
              icon={<Delete className="w-5 h-5 text-destructive" />}
              title="إزالة رمز وليّ الأمر"
              desc="لن يُطلب الرمز بعد ذلك للوصول إلى الإعدادات." 
              onClick={removePin}
            />
          )}
          <Item
            icon={<User className="w-5 h-5 text-accent" />}
            title="لوحة ولي الأمر"
            desc="اطّلع على تقدّم الأطفال وإعداداتهم." 
            onClick={() => navigate("/parent")}
          />
          <Item
            icon={<Mic className="w-5 h-5 text-fuchsia-500" />}
            title="مصحح التلاوة الذكي (آخر إصدار - V3)"
            desc="اختبار تقنية الذكاء الاصطناعي (Hugging Face) لتصحيح التلاوة."
            onClick={() => window.open("/ai-test-3.html", "_blank")}
          />
        </Section>

        <Section label="النجوم والمكافآت">
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-accent/10 border border-accent/20 p-3">
              <span className="flex items-center gap-2 text-sm font-extrabold"><Star className="w-5 h-5 fill-current text-amber-500" /> رصيد الملف النشط</span>
              <span className="text-lg font-black text-accent">{coins.toLocaleString("en-US")} ⭐</span>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">أدخل كود المكافأة لإضافة النجوم مباشرة، دون طلب تفعيل التطبيق.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={rewardCode}
                  onChange={(event) => { setRewardCode(event.target.value.toUpperCase()); setRewardCodeMessage(""); }}
                  placeholder="مثال: ABC12345"
                  aria-label="كود النجوم"
                  dir="ltr"
                  className="min-w-0 flex-1 rounded-xl bg-background border border-border px-3 py-3 text-center text-sm font-bold tracking-wider"
                />
                <button type="button" onClick={() => void redeemRewardCode()} disabled={!rewardCode.trim()} className="w-full shrink-0 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-accent-foreground disabled:opacity-40 flex items-center justify-center gap-1 sm:w-auto">
                  <Gift className="w-4 h-4" /> إضافة
                </button>
              </div>
              {rewardCodeMessage && <p className="text-xs font-bold text-center text-accent">{rewardCodeMessage}</p>}
            </div>
          </div>
        </Section>

        {/* ===== المظهر ===== */}
        <Section label="المظهر">
          <div className="flex items-center gap-3 p-3">
            <span className="w-10 h-10 rounded-xl bg-secondary text-accent flex items-center justify-center">{theme === "dark" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}</span>
            <span className="flex-1"><span className="block font-bold">المظهر</span><span className="block text-[11px] text-muted-foreground">ليل / نهار</span></span>
            <div className="flex rounded-xl bg-secondary p-1">
              <button onClick={() => setTheme("light")} className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${theme === "light" ? "bg-card text-accent shadow-soft" : "text-muted-foreground"}`}><Sun className="w-3.5 h-3.5" /> نهار</button>
              <button onClick={() => setTheme("dark")} className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${theme === "dark" ? "bg-card text-accent shadow-soft" : "text-muted-foreground"}`}><Moon className="w-3.5 h-3.5" /> ليل</button>
            </div>
          </div>
        </Section>

        {/* ===== مظهر تظليل الآيات (المعلّم والطفل) ===== */}
        <Section label="مظهر تظليل الآيات (المعلّم والطفل)">
          <Item
            icon={<Palette className="w-5 h-5 text-accent" />}
            title="إعدادات المظهر والتظليل"
            desc="تخصيص ألوان التظليل، الشفافية، إظهار وإخفاء"
            onClick={() => setShowShadingSettings(prev => !prev)}
            right={<ChevronLeft className={`w-5 h-5 text-muted-foreground transition-transform ${showShadingSettings ? "-rotate-90" : ""}`} />}
          />
          {showShadingSettings && (
            <div className="bg-background/50 border-t border-border animate-fade-in pb-3">
              {/* حالة التظليل العامة: مفعّل / مخفي */}
          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-secondary text-accent flex items-center justify-center">
                <Palette className="w-5 h-5" />
              </span>
              <div>
                <span className="block font-bold text-foreground">تظليل الآيات أثناء التلاوة</span>
                <span className="block text-[11px] text-muted-foreground">
                  تظليل متحرك يتبع صوت المعلم وترديد الطفل على الآيات
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                const next = !shadingSettings.hidden;
                updateShading({ hidden: next });
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95 ${
                !shadingSettings.hidden
                  ? "bg-accent text-accent-foreground shadow-soft"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {!shadingSettings.hidden ? <><Eye className="w-3.5 h-3.5" /> مفعّل ✓</> : <><EyeOff className="w-3.5 h-3.5" /> مخفي ✗</>}
            </button>
          </div>

          {/* المعاينة الحية للآية الكريمة */}
          <div className="p-3.5 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Sparkles className="w-4 h-4 text-accent animate-pulse" />
                <span>معاينة حية لشكل التظليل على المصحف:</span>
              </div>
              {/* مفتاح التبديل للمعاينة: المعلم أو الطفل */}
              <div className="flex rounded-xl bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => setPreviewSpeaker("teacher")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                    previewSpeaker === "teacher"
                      ? "bg-amber-500 text-amber-950 shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" /> صوت المعلّم
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSpeaker("kids")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                    previewSpeaker === "kids"
                      ? "bg-sky-500 text-sky-950 shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Baby className="w-3.5 h-3.5" /> صوت الطفل
                </button>
              </div>
            </div>

            {/* صندوق عرض الآية المحاكي لصفحة المصحف */}
            {(() => {
              const activeColor = previewSpeaker === "teacher"
                ? (shadingSettings.teacherColor || "#f59e0b")
                : (shadingSettings.kidsColor || "#0ea5e9");
              const style = getAyahShadingStyle(activeColor, shadingSettings.opacity);
              return (
                <div
                  className="rounded-2xl p-4 text-center transition-all duration-300 relative overflow-hidden"
                  style={{
                    backgroundColor: shadingSettings.hidden ? "transparent" : style.fill,
                    borderWidth: "2px",
                    borderStyle: "solid",
                    borderColor: shadingSettings.hidden ? "var(--border)" : style.stroke,
                    boxShadow: shadingSettings.hidden ? "none" : `0 4px 20px ${style.glow}`,
                  }}
                >
                  <p className="font-quran text-lg md:text-xl text-foreground select-none leading-loose">
                    بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾
                  </p>
                  <div className="mt-1 flex items-center justify-center gap-2 text-[11px] font-bold text-muted-foreground">
                    <span>التظليل الحالي:</span>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-white text-[10px]"
                      style={{ backgroundColor: activeColor }}
                    >
                      {previewSpeaker === "teacher" ? "🎓 المعلّم" : "👶 الطفل"}: {activeColor}
                    </span>
                    <span>قوة الشفافية: {Math.round(shadingSettings.opacity * 100)}%</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 🎓 لون تظليل المعلّم وحده */}
          <div className="p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center font-bold">
                  <Mic className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-foreground">لون تظليل المعلّم</h3>
                  <p className="text-[11px] text-muted-foreground">يظهر على الآية عند قراءة أو شرح المعلّم</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-full border border-black/20 shadow-sm"
                  style={{ backgroundColor: shadingSettings.teacherColor || "#f59e0b" }}
                />
                <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-secondary text-foreground">
                  {shadingSettings.teacherColor || "#f59e0b"}
                </span>
              </div>
            </div>

            {/* باليت الألوان الجاهزة للمعلّم */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {PRESET_SHADING_COLORS.map(c => {
                const isSelected = (shadingSettings.teacherColor || "#f59e0b").toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={`teacher-${c.key}`}
                    type="button"
                    onClick={() => {
                      updateShading({ teacherColor: c.hex });
                      setPreviewSpeaker("teacher");
                    }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all active:scale-95 ${
                      isSelected
                        ? "border-amber-500 bg-amber-500/10 shadow-sm scale-105"
                        : "border-border/40 bg-secondary/30 hover:border-border"
                    }`}
                  >
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center shadow-inner"
                      style={{ backgroundColor: c.hex }}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3] drop-shadow" />}
                    </span>
                    <span className="text-[10px] font-bold text-foreground/80">{c.label}</span>
                  </button>
                );
              })}
            </div>

            {/* التعيين اليدوي للون المعلّم */}
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-secondary/50 border border-border/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <label
                  htmlFor="settings-teacher-color-picker"
                  className="relative cursor-pointer group shrink-0"
                  title="انقر لفتح منتقي الألوان اليدوي"
                >
                  <input
                    id="settings-teacher-color-picker"
                    type="color"
                    value={shadingSettings.teacherColor || "#f59e0b"}
                    onChange={(e) => {
                      updateShading({ teacherColor: e.target.value });
                      setPreviewSpeaker("teacher");
                    }}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  />
                  <div
                    className="w-9 h-9 rounded-xl border-2 border-white shadow-md flex items-center justify-center transition-transform group-hover:scale-105"
                    style={{ backgroundColor: shadingSettings.teacherColor || "#f59e0b" }}
                  >
                    <Palette className="w-4 h-4 text-white drop-shadow" />
                  </div>
                </label>
                <div className="min-w-0">
                  <span className="block font-bold text-xs text-foreground">تعيين يدوي للون المعلّم</span>
                  <span className="block text-[10px] text-muted-foreground">اختر أي درجة لون مخصصة بدقة</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground font-mono">#</span>
                <input
                  type="text"
                  maxLength={7}
                  value={shadingSettings.teacherColor || "#f59e0b"}
                  onChange={(e) => {
                    const val = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                    if (val.length <= 7) {
                      updateShading({ teacherColor: val });
                      setPreviewSpeaker("teacher");
                    }
                  }}
                  className="w-24 px-2.5 py-1.5 text-center text-xs font-mono font-bold rounded-lg border border-border bg-background text-foreground uppercase tracking-wider"
                  placeholder="#f59e0b"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* 👶 لون تظليل الطفل وحده */}
          <div className="p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-600 flex items-center justify-center font-bold">
                  <Baby className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-foreground">لون تظليل الطفل</h3>
                  <p className="text-[11px] text-muted-foreground">يظهر على الآية عند ترديد الطفل أو دوره في القراءة</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-full border border-black/20 shadow-sm"
                  style={{ backgroundColor: shadingSettings.kidsColor || "#0ea5e9" }}
                />
                <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-secondary text-foreground">
                  {shadingSettings.kidsColor || "#0ea5e9"}
                </span>
              </div>
            </div>

            {/* باليت الألوان الجاهزة للطفل */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {PRESET_SHADING_COLORS.map(c => {
                const isSelected = (shadingSettings.kidsColor || "#0ea5e9").toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={`kids-${c.key}`}
                    type="button"
                    onClick={() => {
                      updateShading({ kidsColor: c.hex });
                      setPreviewSpeaker("kids");
                    }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all active:scale-95 ${
                      isSelected
                        ? "border-sky-500 bg-sky-500/10 shadow-sm scale-105"
                        : "border-border/40 bg-secondary/30 hover:border-border"
                    }`}
                  >
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center shadow-inner"
                      style={{ backgroundColor: c.hex }}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3] drop-shadow" />}
                    </span>
                    <span className="text-[10px] font-bold text-foreground/80">{c.label}</span>
                  </button>
                );
              })}
            </div>

            {/* التعيين اليدوي للون الطفل */}
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-secondary/50 border border-border/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <label
                  htmlFor="settings-kids-color-picker"
                  className="relative cursor-pointer group shrink-0"
                  title="انقر لفتح منتقي الألوان اليدوي"
                >
                  <input
                    id="settings-kids-color-picker"
                    type="color"
                    value={shadingSettings.kidsColor || "#0ea5e9"}
                    onChange={(e) => {
                      updateShading({ kidsColor: e.target.value });
                      setPreviewSpeaker("kids");
                    }}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  />
                  <div
                    className="w-9 h-9 rounded-xl border-2 border-white shadow-md flex items-center justify-center transition-transform group-hover:scale-105"
                    style={{ backgroundColor: shadingSettings.kidsColor || "#0ea5e9" }}
                  >
                    <Palette className="w-4 h-4 text-white drop-shadow" />
                  </div>
                </label>
                <div className="min-w-0">
                  <span className="block font-bold text-xs text-foreground">تعيين يدوي للون الطفل</span>
                  <span className="block text-[10px] text-muted-foreground">اختر أي درجة لون مخصصة بدقة</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground font-mono">#</span>
                <input
                  type="text"
                  maxLength={7}
                  value={shadingSettings.kidsColor || "#0ea5e9"}
                  onChange={(e) => {
                    const val = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                    if (val.length <= 7) {
                      updateShading({ kidsColor: val });
                      setPreviewSpeaker("kids");
                    }
                  }}
                  className="w-24 px-2.5 py-1.5 text-center text-xs font-mono font-bold rounded-lg border border-border bg-background text-foreground uppercase tracking-wider"
                  placeholder="#0ea5e9"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* قوة وشفافية التظليل */}
          <div className="p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="block font-bold text-sm text-foreground">قوة وشفافية التظليل</span>
                <span className="block text-[11px] text-muted-foreground">التحكم في وضوح وبروز التظليل فوق الكلمات القرآنية</span>
              </div>
              <span className="text-sm font-extrabold text-accent bg-accent/10 px-2.5 py-1 rounded-full tabular-nums">
                {Math.round(shadingSettings.opacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={30}
              max={100}
              step={5}
              value={Math.round(shadingSettings.opacity * 100)}
              onChange={(e) => updateShading({ opacity: Number(e.target.value) / 100 })}
              className="w-full h-3 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--accent) ${((shadingSettings.opacity - 0.3) / 0.7) * 100}%, rgba(0,0,0,0.08) ${((shadingSettings.opacity - 0.3) / 0.7) * 100}%)`,
              }}
              aria-label="قوة التظليل"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-bold px-0.5">
              <span>أهدأ وأخف (30%)</span>
              <span>أبرز وأوضح (100%)</span>
            </div>
          </div>

          {/* أزرار الإجراءات: استعادة الافتراضي + الانتقال للمصحف */}
          <div className="p-3.5 flex flex-wrap items-center justify-between gap-2 bg-muted/20">
            <button
              type="button"
              onClick={() => {
                updateShading({
                  teacherColor: DEFAULT_SETTINGS.teacherColor,
                  kidsColor: DEFAULT_SETTINGS.kidsColor,
                  opacity: DEFAULT_SETTINGS.opacity,
                  hidden: false,
                });
                toast({ title: "تمت استعادة إعدادات التظليل الافتراضية 🔄" });
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 flex items-center gap-1.5 transition-all active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" /> استعادة الألوان الافتراضية
            </button>

            <button
              type="button"
              onClick={() => navigate("/mushaf")}
              className="px-4 py-2 rounded-xl text-xs font-extrabold text-accent bg-accent/15 hover:bg-accent/25 flex items-center gap-1.5 transition-all active:scale-95"
            >
              <BookOpen className="w-3.5 h-3.5" /> تجربة التظليل في المصحف الآن
            </button>
          </div>
          </div>
          )}
        </Section>

        {/* ===== الصوت والتلاوة ===== */}
        <Section label="الصوت والتلاوة">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-secondary text-accent flex items-center justify-center">
                <Headphones className="w-5 h-5" />
              </span>
              <div>
                <span className="block font-bold">تشغيل في الخلفية</span>
                <span className="block text-[11px] text-muted-foreground">مواصلة التلاوة عند قفل الشاشة أو الخروج من التطبيق</span>
              </div>
            </div>
            <button
              onClick={() => {
                const next = !bgAudio;
                setBgAudio(next);
                setBackgroundAudioEnabled(next);
                toast({ title: next ? "تم تفعيل التشغيل في الخلفية ✅" : "تم تعطيل التشغيل في الخلفية" });
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all active:scale-95 ${
                bgAudio ? "bg-accent text-accent-foreground shadow-soft" : "bg-secondary text-muted-foreground"
              }`}
            >
              {bgAudio ? "مفعّل ✓" : "معطّل ✗"}
            </button>
          </div>
        </Section>

        {/* ===== الإشعارات والتذكيرات الذكية ===== */}
        <Section label="الإشعارات والتذكيرات الذكية">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-secondary text-accent flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </span>
              <div>
                <span className="block font-bold">نظام التذكيرات اليومية</span>
                <span className="block text-[11px] text-muted-foreground">تنبيهات الورد القرآني، سنن الجمعة، وأذكار اليوم</span>
              </div>
            </div>
            <button
              onClick={async () => {
                const next = !reminders.enabled;
                if (next) {
                  await requestNotificationPermission();
                }
                updateReminders({ enabled: next });
                toast({ title: next ? "تم تفعيل التذكيرات الذكية 🔔" : "تم إيقاف التذكيرات مؤقتاً" });
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all active:scale-95 ${
                reminders.enabled ? "bg-accent text-accent-foreground shadow-soft" : "bg-secondary text-muted-foreground"
              }`}
            >
              {reminders.enabled ? "مفعّل ✓" : "معطّل ✗"}
            </button>
          </div>

          {reminders.enabled && (
            <div className="p-3 space-y-3 bg-secondary/20">
              {/* وقت تذكير الورد القرآني */}
              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-accent" />
                  <div>
                    <span className="text-xs font-bold block">موعد تذكير القرآن اليومي</span>
                    <span className="text-[10px] text-muted-foreground">تنبيه تشجيعي يومي لتلاوة كتاب الله</span>
                  </div>
                </div>
                <input
                  type="time"
                  value={reminders.dailyLessonTime}
                  onChange={(e) => updateReminders({ dailyLessonTime: e.target.value })}
                  className="rounded-lg bg-secondary border border-border px-2.5 py-1 text-xs font-bold text-foreground focus:border-accent outline-none"
                />
              </div>

              {/* أزرار السنن والأذكار والتنبيهات */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateReminders({ fridayKahfEnabled: !reminders.fridayKahfEnabled })}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                    reminders.fridayKahfEnabled ? "bg-accent/15 border-accent text-accent" : "bg-secondary/40 border-border text-muted-foreground"
                  }`}
                >
                  <span className="text-right">⛰️ سورة الكهف (الجمعة)</span>
                  <span className="text-[10px]">{reminders.fridayKahfEnabled ? "✓" : "✗"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => updateReminders({ soundEnabled: !reminders.soundEnabled })}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                    reminders.soundEnabled ? "bg-accent/15 border-accent text-accent" : "bg-secondary/40 border-border text-muted-foreground"
                  }`}
                >
                  <span className="text-right">🔊 رنين التنبيه الهادئ</span>
                  <span className="text-[10px]">{reminders.soundEnabled ? "✓" : "✗"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => updateReminders({ morningAthkarEnabled: !reminders.morningAthkarEnabled })}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                    reminders.morningAthkarEnabled ? "bg-accent/15 border-accent text-accent" : "bg-secondary/40 border-border text-muted-foreground"
                  }`}
                >
                  <span className="text-right">☀️ أذكار الصباح</span>
                  <span className="text-[10px]">{reminders.morningAthkarEnabled ? "✓" : "✗"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => updateReminders({ eveningAthkarEnabled: !reminders.eveningAthkarEnabled })}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                    reminders.eveningAthkarEnabled ? "bg-accent/15 border-accent text-accent" : "bg-secondary/40 border-border text-muted-foreground"
                  }`}
                >
                  <span className="text-right">🌙 أذكار المساء</span>
                  <span className="text-[10px]">{reminders.eveningAthkarEnabled ? "✓" : "✗"}</span>
                </button>
              </div>

              {/* زر تجربة الإشعار الفوري */}
              <button
                type="button"
                onClick={async () => {
                  const granted = await requestNotificationPermission();
                  await showLocalNotification(
                    "تذكير القرآن الكريم 🌟",
                    "نظام التذكيرات الذكية يعمل بامتياز! ستصلك تنبيهات الورد والأذكار في مواعيدها."
                  );
                  if (!granted) {
                    toast({
                      title: "تنبيه الصلاحيات ⚠️",
                      description: "يرجى التأكد من السماح بالإشعارات في إعدادات جهازك لاستلام تنبيهات النظام الخارجية.",
                      variant: "destructive",
                    });
                  }
                }}
                className="w-full mt-2 p-2.5 rounded-xl bg-accent/20 hover:bg-accent/30 text-accent font-black text-xs flex items-center justify-center gap-2 border border-accent/30 active:scale-95 transition-all shadow-sm"
              >
                <Bell className="w-4 h-4" />
                <span>تجربة إرسال إشعار تذكير الآن 🔔</span>
              </button>
            </div>
          )}
        </Section>

        {/* ===== التطبيق ===== */}
        <Section label="التطبيق">
          <Item
            icon={<WhatsAppIcon className="w-5 h-5 text-[#25D366]" />}
            title={`تواصل مع الدعم الفني عبر واتساب (${SUPPORT_WHATSAPP_DISPLAY})`}
            desc="مراسلة مباشرة فورية أو الإبلاغ عن مشكلة واقتراح"
            onClick={() => {
              void openWhatsAppSupport();
              toast({
                title: "جاري فتح واتساب الدعم الفني 💬",
                description: `مراسلة فورية مباشرة على الرقم (${SUPPORT_WHATSAPP_DISPLAY})`,
              });
            }}
          />
          <Item icon={<Power className="w-5 h-5 text-destructive" />} title="إغلاق التطبيق والخروج" desc="إغلاق نافذة التطبيق بالكامل وحفظ الجلسة" onClick={() => closeTauriApp()} />
        </Section>

        {/* ===== أدوات المعلّم والمصحف (ظاهرة دائماً — بلا رمز) ===== */}
        <Section label="أدوات المعلّم (إعداد المحتوى)">
          <Item icon={<Wrench className="w-5 h-5" />} title="أدوات المعلّم" desc="المعايرة والتظليل وتقسيم الصوت وربطه بالآيات" onClick={() => navigate("/teacher-tools")} />
          <Item icon={<Pencil className="w-5 h-5" />} title="معايرة التظليل مباشرة" desc="ضبط مواضع الآيات والسور — ورفع صفحات المصحف إلى السيرفر" onClick={() => navigate("/calibrate")} />
          <Item icon={<Clock className="w-5 h-5" />} title="توقيت الآيات" desc="تسجيل بداية كل آية في الصوت (معايرة التوقيت)" onClick={() => navigate("/timings")} />
        </Section>

        {/* ===== أدوات المالك (تظهر فقط في وضع المالك) ===== */}
        {owner && (
          <Section label="أدوات المالك (قيد التطوير)">
            <Item icon={<Wrench className="w-5 h-5" />} title="أدمن الألعاب" desc="إدارة ألعاب السيرفر: الرابط، الإخفاء، والتحميل للأجهزة" onClick={() => setShowAdmin(true)} />
            <Item icon={<Lock className="w-5 h-5" />} title="إيقاف وضع المالك" desc="إظهار رسالة التطوير للمستخدمين" onClick={disableOwner} />
          </Section>
        )}



        <p className="text-[11px] text-muted-foreground text-center pt-1 leading-relaxed">العمل الكامل دون إنترنت قيد التوسعة تدريجياً.</p>
      </div>

      {showGate && (
        <ParentalGateModal
          title="منطقة الوالدين — الدخول إلى الإعدادات"
          onSuccess={() => setShowGate(false)}
          onCancel={() => { setShowGate(false); navigate("/audio"); }}
        />
      )}

      {showPin && (
        <PinModal
          mode="verify"
          title="رمز وليّ الأمر"
          onSuccess={() => {
            setShowPin(false);
          }}
          onCancel={() => {
            setShowPin(false);
            navigate("/audio");
          }}
        />
      )}

      {pinFlow === "verifyOld" && (
        <PinModal mode="verify" title="أدخل كلمة المرور الحالية" onSuccess={() => setPinFlow("setNew")} onCancel={() => setPinFlow(null)} />
      )}
      {pinFlow === "setNew" && (
        <PinModal mode="set" title="اختر كلمة مرور جديدة (٤ أرقام)" onSuccess={() => { 
          setHasPin(true); 
          setPinFlow(null); 
          toast({ title: "تم حفظ كلمة المرور" });
          if (pendingMode === "kids") {
             setMode("kids"); setAppMode("kids");
             setKidsLocked(true);
             if (getProfiles().length === 0) addProfile({ name: "طفلي" });
             setPendingMode(null);
             toast({ title: "وضع الأطفال" });
          }
        }} onCancel={() => { setPinFlow(null); setPendingMode(null); }} />
      )}

      {showSupport && <SupportModal onClose={() => setShowSupport(false)} />}
      {showAdmin && <AdminGamesModal onClose={() => setShowAdmin(false)} />}
      <AppFooter />
    </div>
  );
}
