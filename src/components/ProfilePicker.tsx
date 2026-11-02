import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Plus, Settings, Sparkles } from "lucide-react";
import { getProfiles, getAppMode, setAppMode, setActiveProfile, kidsRouteBlocked, getProgress, getActiveId, setKidsHidden, setPureMode, isPureMode, type KidsProfile } from "../data/kidsProfile";
import { hasKidsPin, setKidsLocked } from "../data/kidsLock";
import PinModal from "./PinModal";
import Avatar from "./Avatar";
import { captureEvent, identifyActiveProfile } from "../utils/posthog";

const PICKED_FLAG = "mushaf:pickedSession";

/** يُعلِّم أنّ ملفّاً اختير في هذه الجلسة (حتى لا تتكرّر شاشة الاختيار). */
export const markPicked = () => { try { sessionStorage.setItem(PICKED_FLAG, "1"); } catch { /* ignore */ } };
export const isPicked = (): boolean => { try { return sessionStorage.getItem(PICKED_FLAG) === "1"; } catch { return true; } };

/**
 * شاشة "من يتعلّم الآن؟" على غرار يوتيوب على التلفاز.
 * تُستخدم كطبقة عند فتح التطبيق (gate) أو كصفحة لتبديل الطفل (/profiles).
 */
export default function ProfilePicker({ onPicked }: { onPicked?: () => void }) {
  const navigate = useNavigate();
  const profiles: KidsProfile[] = getProfiles();
  const appMode = getAppMode();
  const activeIdFallback = getActiveId();
  const [showPin, setShowPin] = useState(false);
  // إذا أخفى المالك ركن الأطفال: هذه الصفحة (لا كطبقة فتح) تُحوَّل للسماع
  useEffect(() => { if (kidsRouteBlocked() && !onPicked) navigate("/audio", { replace: true }); }, [navigate, onPicked]);

  const close = () => { markPicked(); onPicked?.(); };
  const pickChild = (id: string) => {
    setActiveProfile(id);
    setAppMode("kids");
    setKidsHidden(false);
    setPureMode(false); // تعطيل الوضع العادي عند اختيار طفل
    setKidsLocked(true);
    identifyActiveProfile();
    captureEvent("profile_selected", { role: "child" });
    close();

    const profile = profiles.find(p => p.id === id);
    const progress = getProgress();
    
    // إذا كان هناك وقت دراسة مطلوب ولم يُنجز بعد، وجّه الطفل للقرآن، وإلا للألعاب
    if (profile && profile.goalMinutes > 0 && !progress.unlocked) {
      navigate("/audio");
    } else {
      navigate("/games");
    }
  };
    const asParent = () => {
    setAppMode("parent");
    // في وضع التنقل المرن: نعيد تعيين إخفاء الأطفال لكي يظهر ركن الأطفال والألعاب للمالك
    // لا نغير وضع pureMode - نترك كما هو (flexible أو pure حسب اختيار المستخدم السابق)
    if (!isPureMode()) setKidsHidden(false);
    setKidsLocked(false);
    identifyActiveProfile();
    captureEvent("profile_selected", { role: "parent" });
    close();
    navigate("/audio");
  };
  const goParent = () => { close(); navigate("/parent"); };
  // إدارة الملفّات (لوحة وليّ الأمر) — بنافذة رمز أنيقة إن وُجد رمز، وإلّا دخول مباشر
  const manage = () => { if (hasKidsPin()) setShowPin(true); else goParent(); };
  const goSettings = () => { close(); navigate("/settings"); };

  return (
    <div className="fixed inset-0 z-[95] page-nour text-foreground overflow-y-auto" dir="rtl">
      {/* وهج ذهبي زخرفيّ خلفيّ */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full bg-accent/15 blur-3xl animate-breathe" />
        <div className="absolute bottom-[-10rem] right-[-6rem] w-[420px] h-[420px] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 py-12 min-h-full flex flex-col items-center justify-center">
        {/* شارة علوية رقيقة */}
        <div className="animate-fade-up mb-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-bold text-accent shadow-soft">
          <Sparkles className="w-3.5 h-3.5" /> نور
        </div>

        <h1 className="animate-fade-up text-3xl sm:text-4xl font-extrabold text-gradient-gold text-center mb-2 tracking-tight">من يتعلّم الآن؟</h1>
        <p className="animate-fade-up text-muted-foreground text-sm sm:text-base text-center mb-10">اختر ملفّك للمتابعة في رحلة النور</p>

        <div className="animate-fade-up flex flex-wrap items-start justify-center gap-6 sm:gap-8">
          {/* خيار: لي نفسي (المعلم/الوالد) */}
          <button onClick={asParent} className="group flex flex-col items-center gap-3 w-24 sm:w-28 active:scale-95 transition-transform">
            <span className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-secondary border border-border flex items-center justify-center ring-2 ring-transparent ring-offset-2 ring-offset-background group-hover:ring-accent shadow-soft transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl"><User className="w-12 h-12 text-accent" /></span>
            <span className="font-bold text-center text-foreground group-hover:text-accent transition-colors">لي نفسي</span>
          </button>

          {/* خيارات: كل الأطفال المسجّلون (وليس الأول فقط) */}
          {profiles.length > 0 ? (
            profiles.map((p, idx) => (
              <button key={p.id} onClick={() => pickChild(p.id)} className="group flex flex-col items-center gap-3 w-24 sm:w-28 active:scale-95 transition-transform">
                <span className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center ring-2 ring-transparent ring-offset-2 ring-offset-background group-hover:ring-accent rounded-full transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
                  <Avatar name={p.avatar} className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-md" />
                  {p.id === activeIdFallback && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-[9px] font-bold px-2 py-0.5 rounded-full shadow">الآن</span>
                  )}
                </span>
                <span className="font-bold text-center truncate w-full text-foreground group-hover:text-accent transition-colors">
                  {p.name || (profiles.length === 1 ? "لي طفلي" : `الطفل ${idx + 1}`)}
                </span>
              </button>
            ))
          ) : (
            <button onClick={() => { manage(); }} className="group flex flex-col items-center gap-3 w-24 sm:w-28 active:scale-95 transition-transform">
              <span className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-muted border border-dashed border-border flex items-center justify-center ring-2 ring-transparent ring-offset-2 ring-offset-background group-hover:ring-accent/60 shadow-soft transition-all duration-300 group-hover:-translate-y-1"><Plus className="w-12 h-12 text-muted-foreground group-hover:text-accent transition-colors" /></span>
              <span className="font-bold text-center text-muted-foreground group-hover:text-accent transition-colors">لي طفلي</span>
            </button>
          )}
        </div>

        <button onClick={goSettings} className="animate-fade-up mt-12 inline-flex items-center gap-2 rounded-full bg-secondary border border-border px-5 py-2.5 text-sm font-bold text-secondary-foreground hover:brightness-95 shadow-soft active:scale-95 transition-all">
          <Settings className="w-4 h-4 text-accent" /> الإعدادات
        </button>
      </div>

      {showPin && (
        <PinModal mode="verify" title="رمز وليّ الأمر" onSuccess={() => { setShowPin(false); goParent(); }} onCancel={() => setShowPin(false)} />
      )}
    </div>
  );
}
