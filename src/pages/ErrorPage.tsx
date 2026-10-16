import { useState, useEffect } from "react";
import { useNavigate, useRouteError } from "react-router-dom";
import { RefreshCw, HeartHandshake, Home, WifiOff, Wifi } from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { openWhatsAppSupport, SUPPORT_WHATSAPP_DISPLAY } from "@/services/resendService";
import { getProfile } from "@/data/kidsProfile";
import { CURRENT_VERSION } from "@/utils/updateChecker";

export default function ErrorPage() {
  const navigate = useNavigate();
  const routeError = useRouteError() as Error;
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const rawMsg = routeError ? (routeError.message || String(routeError)) : "";
  const isNetworkIssue = !isOnline || rawMsg.toLowerCase().includes("fetch") || rawMsg.toLowerCase().includes("network");

  const handleWhatsAppContact = () => {
    const profile = getProfile();
    const errMsg = rawMsg || (isNetworkIssue ? "انقطاع اتصال بالإنترنت" : "توقف غير متوقع");
    const msg =
      `السلام عليكم ورحمة الله تعالى وبركاته\n` +
      `أنا أواجه مشكلة في شاشة الخطأ وتوقف التطبيق مؤقتاً.\n` +
      `الإصدار: ${CURRENT_VERSION}\n` +
      `الحالة: ${isNetworkIssue ? "انقطاع شبكة" : "توقف مؤقت"}\n` +
      `وصف الخطأ: ${errMsg}`;
    void openWhatsAppSupport(msg);
  };

  return (
    <div className="page-nour relative flex min-h-screen items-center justify-center overflow-hidden px-4 text-foreground font-quran" dir="rtl">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-accent/15 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-accent/15 to-transparent"
      />

      <div className="card-nour relative z-10 w-full max-w-lg px-8 py-10 text-center shadow-2xl border border-emerald-100/80 rounded-3xl bg-white/95 backdrop-blur-md space-y-6 animate-in zoom-in-95 duration-200">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-600 ring-8 ring-emerald-500/5 shadow-inner">
          {isNetworkIssue ? <WifiOff className="w-10 h-10 text-amber-600 animate-pulse" /> : <HeartHandshake className="w-10 h-10 text-emerald-600" />}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800">
            {isNetworkIssue ? "انقطاع مؤقت في الاتصال بالإنترنت 📡" : "نعتذر منك، حدث توقف مؤقت 🌸"}
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed font-medium max-w-sm mx-auto">
            {isNetworkIssue
              ? "يبدو أن اتصال الإنترنت ضعيف أو منقطع مؤقتاً. التطبيق سيستأنف العمل تلقائياً فور توفر الشبكة."
              : "لا تقلق، جميع محفوظاتك وبياناتك في أمان تام. يمكنك مراسلة الدعم الفني فوراً عبر واتساب أو إعادة المحاولة."}
          </p>
        </div>

        {/* زر واتساب المباشر لرقم 0658188644 */}
        <button
          type="button"
          onClick={handleWhatsAppContact}
          className="w-full h-14 text-base bg-[#25D366] hover:bg-[#20bd5a] active:scale-[0.98] transition-all rounded-2xl text-white font-extrabold shadow-lg shadow-[#25D366]/25 flex items-center justify-center gap-3 cursor-pointer"
        >
          <WhatsAppIcon className="w-6 h-6 text-white shrink-0" />
          <span>تواصل مع الدعم الفني عبر واتساب ({SUPPORT_WHATSAPP_DISPLAY})</span>
        </button>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full h-12 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>إعادة تحميل الصفحة</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full h-12 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            <Home className="w-4 h-4" />
            <span>العودة للرئيسية</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground pt-1">
          رقم واتساب المباشر للدعم الفني والمساعدة: <span className="font-bold text-emerald-700 font-mono" dir="ltr">{SUPPORT_WHATSAPP_DISPLAY}</span>
        </p>
      </div>
    </div>
  );
}
