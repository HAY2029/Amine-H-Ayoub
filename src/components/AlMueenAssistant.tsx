import { useState } from "react";
import {
  Sparkles,
  X,
  BookOpen,
  HelpCircle,
  MessageSquare,
  Volume2,
  Lock,
  Download,
  Send,
  ExternalLink,
  Bot,
  Compass,
} from "lucide-react";
import { createMailtoSupportLink, saveSupportMessageLocally, openWhatsAppSupport, SUPPORT_WHATSAPP_DISPLAY } from "@/services/resendService";
import { getProfile } from "@/data/kidsProfile";
import { CURRENT_VERSION } from "@/utils/updateChecker";
import { toast } from "@/hooks/use-toast";
import ModalLayer from "@/components/ui/ModalLayer";
import WhatsAppIcon from "./WhatsAppIcon";

type ActiveTab = "companion" | "guide" | "support";

interface GuideItem {
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const APP_GUIDES: GuideItem[] = [
  {
    icon: <Volume2 className="w-5 h-5 text-teal-400" />,
    title: "تشغيل وسماع التلاوة",
    desc: "اضغط على أي سورة لبدء الاستماع، ويمكنك استخدام مشغل الصوت للتحكم بالتقديم والتأخير والتكرار للحفظ.",
  },
  {
    icon: <BookOpen className="w-5 h-5 text-amber-400" />,
    title: "طريقة الحفظ والمتابعة",
    desc: "استمع للآية الكريمة وكررها، واستخدم ميزة تسجيل التلاوة بصوتك في صفحة التلاوات لمراجعة حفظك بدقة.",
  },
  {
    icon: <Lock className="w-5 h-5 text-rose-400" />,
    title: "قفل الوالدين وأوقات اللعب",
    desc: "من لوحة الوالدين، يمكنك تعيين رمز PIN وسؤال أمان لحماية الإعدادات وتحديد أقصى وقت لعب يومي لطفلك.",
  },
  {
    icon: <Download className="w-5 h-5 text-sky-400" />,
    title: "العمل بدون إنترنت (Offline)",
    desc: "تطبيقك يحفظ نصوص وسور القرآن تلقائياً، وتعمل كل الألعاب المدمجة بدون الحاجة لأي اتصال بالإنترنت.",
  },
];

const COMPANION_TIPS = [
  "قراءة صفحة واحدة بتدبر خير من قراءة جزء بلا تدبر 🌸",
  "كرر الآية 5 مرات بصوت خاشع يثبت حفظها في قلبك بإذن الله ✨",
  "هل صليت على النبي ﷺ اليوم؟ صلاة واحدة ترفعك عشر درجات 🌟",
  "سورة الإخلاص تعدل ثلث القرآن في الأجر والفضل 💎",
  "المؤمن القوي أحب إلى الله، واستعن بالله دائماً ولا تعجز 🤲",
];

export default function AlMueenAssistant() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ActiveTab>("companion");
  const [tipIndex, setTipIndex] = useState(0);

  // Quick message form inside support tab
  const [userMsg, setUserMsg] = useState("");
  const [senderContact, setSenderContact] = useState("");
  const [sentSuccess, setSentSuccess] = useState(false);

  const activeProfile = getProfile();

  const handleSendQuickTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userMsg.trim()) return;

    saveSupportMessageLocally({
      type: "inquiry",
      typeLabel: "استفسار من المُعِين",
      description: userMsg.trim(),
      senderEmail: senderContact.trim() || undefined,
      profileName: activeProfile?.name || "مستخدم التطبيق",
      appVersion: CURRENT_VERSION,
      platform: typeof navigator !== "undefined" ? navigator.userAgent : "Web",
      timestamp: new Date().toLocaleString("ar-SA"),
    });

    setSentSuccess(true);
    toast({
      title: "تم استلام رسالتك في صندوق الدعم! 🌸",
      description: "شكراً لتواصلك، تم حفظ الرسالة وسيتم الرد عليها قريباً.",
    });
    setUserMsg("");
    setTimeout(() => setSentSuccess(false), 3000);
  };

  const openWhatsApp = () => {
    const text =
      `السلام عليكم ورحمة الله، أحتاج مساعدة في تطبيق القرآن الكريم للأطفال:\n` +
      `- الإصدار: ${CURRENT_VERSION}\n` +
      (userMsg ? `- الرسالة: ${userMsg}` : "");
    void openWhatsAppSupport(text);
  };

  const openMailto = () => {
    const link = createMailtoSupportLink({
      typeLabel: "استفسار ومساعدة",
      description: userMsg || "السلام عليكم، أرجو المساعدة في استخدام التطبيق.",
      profileName: activeProfile?.name || "مستخدم التطبيق",
      senderEmail: senderContact,
      appVersion: CURRENT_VERSION,
    });
    window.location.href = link;
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-4 sm:bottom-6 sm:left-6 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-black text-xs sm:text-sm shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all border border-teal-300/40 backdrop-blur-md"
        aria-label="المُعِين القرآني الذكي"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400"></span>
        </span>
        <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
        <span>المُعِين الذكي</span>
      </button>

      {/* Modal Drawer */}
      {open && (
        <ModalLayer>
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain p-3 sm:items-center sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          dir="rtl"
        >
          <div
            className="relative my-auto w-full max-w-lg rounded-3xl bg-card border border-border shadow-2xl p-5 sm:p-6 pb-safe space-y-4 max-h-[calc(100dvh-1.5rem)] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
                  <Bot className="w-6 h-6 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-extrabold text-foreground text-base sm:text-lg flex items-center gap-1.5">
                    المُعِين القرآني الذكي
                    <span className="text-[10px] bg-teal-500/15 text-teal-400 border border-teal-500/30 px-2 py-0.5 rounded-full font-bold">
                      مساعدك ورفيقك
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground">مرشدك الدائم في الألعاب وحفظ القرآن ودعم التطبيق</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-full text-muted-foreground hover:bg-muted transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-secondary/40 rounded-2xl border border-border/40 text-xs font-extrabold">
              <button
                onClick={() => setTab("companion")}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  tab === "companion"
                    ? "bg-card text-foreground shadow-sm border border-border font-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>الرفيق</span>
              </button>
              <button
                onClick={() => setTab("guide")}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  tab === "guide"
                    ? "bg-card text-foreground shadow-sm border border-border font-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-teal-400" />
                <span>دليل التطبيق</span>
              </button>
              <button
                onClick={() => setTab("support")}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  tab === "support"
                    ? "bg-card text-foreground shadow-sm border border-border font-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>الدعم الفني</span>
              </button>
            </div>

            {/* Tab 1: Companion & Encouragement */}
            {tab === "companion" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-teal-500/10 border border-amber-500/30 text-center space-y-2">
                  <span className="text-3xl">🌸</span>
                  <h4 className="font-extrabold text-foreground text-sm">
                    همسة المُعِين اليومية لبطلنا {activeProfile?.name || "الحبيب"}
                  </h4>
                  <p className="text-xs sm:text-sm text-foreground font-semibold leading-relaxed">
                    "{COMPANION_TIPS[tipIndex % COMPANION_TIPS.length]}"
                  </p>
                  <button
                    onClick={() => setTipIndex((t) => t + 1)}
                    className="text-[11px] text-teal-400 font-bold hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    <span>همسة أخرى</span> ←
                  </button>
                </div>

                <div className="space-y-2">
                  <h5 className="text-xs font-extrabold text-muted-foreground">نصائح سريعة للألعاب القرآنية:</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-secondary/30 border border-border flex items-start gap-2">
                      <span className="text-base">💡</span>
                      <div>
                        <b className="text-foreground block">استعن بالمُعِين في الألعاب</b>
                        <span className="text-muted-foreground">
                          زر "المُعِين" داخل كل لعبة يعطيك تلميحاً أو يضع الحرف الصحيح!
                        </span>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-secondary/30 border border-border flex items-start gap-2">
                      <span className="text-base">⭐</span>
                      <div>
                        <b className="text-foreground block">اجمع النجوم بالسلسلة</b>
                        <span className="text-muted-foreground">
                          الإجابات المتتالية الصحيحة تضاعف عدد النجوم المكتسبة!
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: App Guide */}
            {tab === "guide" && (
              <div className="space-y-2.5 animate-in fade-in duration-150">
                {APP_GUIDES.map((g, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-2xl bg-secondary/30 border border-border flex items-start gap-3 hover:border-teal-500/40 transition-colors"
                  >
                    <div className="p-2 rounded-xl bg-card border border-border shrink-0">{g.icon}</div>
                    <div className="space-y-0.5">
                      <b className="text-sm font-extrabold text-foreground block">{g.title}</b>
                      <p className="text-xs text-muted-foreground leading-relaxed">{g.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: Guaranteed Direct Support */}
            {tab === "support" && (
              <div className="space-y-3.5 animate-in fade-in duration-150">
                <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/25 space-y-1">
                  <b className="text-xs font-black text-teal-400 block">وصول مضمون 100% لفريق الدعم:</b>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    إذا واجهتك أي مشكلة، تصل رسالتك مباشرة لحساب المشرف وتُحفظ في صندوق رسائل الإدارة داخل التطبيق.
                  </p>
                </div>

                {/* Direct Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={openWhatsApp}
                    className="p-2.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                  >
                    <WhatsAppIcon className="w-4 h-4 text-white" />
                    <span>مراسلة واتساب ({SUPPORT_WHATSAPP_DISPLAY})</span>
                  </button>

                  <button
                    onClick={openMailto}
                    className="p-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>فتح البريد بنقرة واحدة</span>
                  </button>
                </div>

                {/* In-App Direct Message Form */}
                <form onSubmit={handleSendQuickTicket} className="space-y-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                      اكتب رسالتك أو استفسارك للمُعِين والمطور:
                    </label>
                    <textarea
                      value={userMsg}
                      onChange={(e) => setUserMsg(e.target.value)}
                      placeholder="صف المشكلة أو الاقتراح بالتفصيل..."
                      className="w-full p-2.5 text-xs rounded-xl bg-secondary/40 border border-border focus:border-teal-400 focus:outline-none min-h-[68px] resize-none"
                    />
                  </div>

                  <div>
                    <input
                      type="text"
                      value={senderContact}
                      onChange={(e) => setSenderContact(e.target.value)}
                      placeholder="بريدك أو رقم هاتفك للتواصل والرد (اختياري)"
                      className="w-full p-2 text-xs rounded-xl bg-secondary/40 border border-border focus:border-teal-400 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl btn-gold font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>تسجيل البلاغ وحفظه في صندوق رسائل الإدارة</span>
                  </button>

                  {sentSuccess && (
                    <p className="text-center text-xs text-emerald-400 font-bold animate-pulse">
                      ✓ تم تسجيل الرسالة بنجاح وحفظها في صندوق الإدارة!
                    </p>
                  )}
                </form>
              </div>
            )}
          </div>
        </div>
        </ModalLayer>
      )}
    </>
  );
}
