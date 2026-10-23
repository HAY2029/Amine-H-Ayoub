import React, { useState, useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { RefreshCw, Trash2, HeartHandshake, WifiOff, Wifi, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./ui/button";
import WhatsAppIcon from "./WhatsAppIcon";
import { openWhatsAppSupport, SUPPORT_WHATSAPP_DISPLAY } from "@/services/resendService";
import { getProfile } from "@/data/kidsProfile";
import { CURRENT_VERSION } from "@/utils/updateChecker";
import { classifyAppError } from "@/utils/errorClassification";

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  const [showTechDetails, setShowTechDetails] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const rawErrMsg = error ? (error.message || String(error)) : "";
  const errorKind = classifyAppError(error, isOnline);

  // استماع مباشر لتغير حالة الشبكة (أونلاين / أوفلاين)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (errorKind === "offline") {
        setIsReconnecting(true);
        setTimeout(() => resetErrorBoundary(), 1200);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [errorKind, resetErrorBoundary]);

  // استعادة تلقائية فورية إذا كان الخطأ مجرد توقف مؤقت أثناء تحميل صفحة (React Suspense Transition)
  useEffect(() => {
    if (
      rawErrMsg.toLowerCase().includes("suspended while responding") ||
      rawErrMsg.toLowerCase().includes("updates that suspend")
    ) {
      const timer = setTimeout(() => {
        resetErrorBoundary();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [rawErrMsg, resetErrorBoundary]);

  const isConnectionIssue = errorKind !== "application";

  const handleWhatsAppContact = () => {
    const activeProfile = getProfile();
    const profileName = activeProfile?.name || "مستخدم التطبيق";
    const msg =
      `السلام عليكم ورحمة الله وبركاته،\n` +
      `أحتاج مساعدة من الدعم الفني لتطبيق القرآن للأطفال:\n` +
      `• اسم المستخدم: ${profileName}\n` +
      `• إصدار التطبيق: ${CURRENT_VERSION}\n` +
      `• نوع الحالة: ${errorKind === "offline" ? "الجهاز غير متصل بالإنترنت" : errorKind === "service" ? "تعذّر الوصول إلى خدمة الشبكة" : "خطأ داخل التطبيق"}\n` +
      `• التفاصيل: ${rawErrMsg.slice(0, 200) || "توقف مؤقت"}\n` +
      `أرجو المساعدة والمتابعة، بارك الله فيكم.`;

    void openWhatsAppSupport(msg);
  };

  const handleManualRetry = () => {
    setIsReconnecting(true);
    setTimeout(() => {
      resetErrorBoundary();
    }, 600);
  };

  const handleHardReset = () => {
    try {
      sessionStorage.clear();
      // مسح الكاشات المؤقتة فقط دون مسح نجوم الطفل ومحفوظاته
      Object.keys(localStorage).forEach((key) => {
        if (key.includes("cache") || key.includes("temp") || key.includes("v-runtime")) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      /* ignore */
    }
    window.location.href = "/";
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-950 via-slate-950 to-teal-950 p-4 font-sans text-right select-none"
      dir="rtl"
    >
      <div className="max-w-md w-full bg-[#121816]/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-emerald-500/20 flex flex-col items-center text-center gap-6 animate-in zoom-in-95 duration-300">
        
        {/* أيقونة الحالة الدالة */}
        {isConnectionIssue ? (
          <div className="relative">
            <div className="w-20 h-20 bg-amber-500/15 text-amber-400 rounded-3xl flex items-center justify-center ring-8 ring-amber-500/10 shadow-inner">
              <WifiOff className="w-10 h-10 animate-pulse" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-black text-xs font-bold shadow-md">
              !
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="w-20 h-20 bg-emerald-500/15 text-emerald-400 rounded-3xl flex items-center justify-center ring-8 ring-emerald-500/10 shadow-inner">
              <HeartHandshake className="w-10 h-10" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-black shadow-md">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
        )}

        {/* الرسالة التوضيحية */}
        <div className="space-y-2.5">
          <h2 className="text-xl sm:text-2xl font-black text-white">
            {errorKind === "offline" ? "لا يوجد اتصال بالإنترنت 📡" : errorKind === "service" ? "تعذّر الوصول إلى الخدمة" : "حدث خطأ داخل التطبيق"}
          </h2>
          <p className="text-stone-300 text-xs sm:text-sm leading-relaxed max-w-xs mx-auto font-medium">
            {errorKind === "offline"
              ? "جهازك غير متصل بالشبكة حالياً. عند عودة الاتصال سنحاول استعادة التطبيق تلقائياً."
              : errorKind === "service"
                ? "الجهاز متصل بالإنترنت، لكن تعذّر الوصول إلى الخدمة. قد يكون السبب عطلاً مؤقتاً في الخادم أو بطئاً في الشبكة."
                : "يبدو أن المشكلة من التطبيق وليست من اتصال الإنترنت. بياناتك المحفوظة آمنة؛ أعد المحاولة أو أرسل التفاصيل للدعم الفني."}
          </p>
        </div>

        {/* مؤشر الحالة الحية */}
        <div className="w-full bg-black/40 border border-white/5 rounded-2xl p-3 flex items-center justify-between text-xs">
          <span className="text-stone-400 flex items-center gap-1.5 font-bold">
            {isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-amber-400" />}
            <span>حالة الشبكة:</span>
          </span>
          <span className={`font-bold flex items-center gap-1.5 ${isOnline ? "text-emerald-400" : "text-amber-400"}`}>
            <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400 animate-ping"}`} />
            <span>{isOnline ? "متصل بالإنترنت" : "غير متصل حالياً"}</span>
          </span>
        </div>

        {/* الأزرار والإجراءات المباشرة */}
        <div className="flex flex-col w-full gap-2.5">
          {/* زر إعادة المحاولة الفوري */}
          <Button
            onClick={handleManualRetry}
            disabled={isReconnecting}
            className="w-full h-13 text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isReconnecting ? "animate-spin" : ""}`} />
            <span>{isReconnecting ? "جاري إعادة الاتصال والتحديث..." : "إعادة المحاولة وتحديث الصفحة 🔄"}</span>
          </Button>

          {/* زر واتساب للدعم الفني المباشر */}
          <button
            type="button"
            onClick={handleWhatsAppContact}
            className="w-full h-12 text-xs sm:text-sm bg-[#25D366] hover:bg-[#20bd5a] active:scale-[0.98] transition-all rounded-2xl text-white font-extrabold shadow-md shadow-[#25D366]/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            <WhatsAppIcon className="w-5 h-5 text-white shrink-0" />
            <span>تواصل مع الدعم الفني ({SUPPORT_WHATSAPP_DISPLAY})</span>
          </button>

          {/* زر إصلاح سريع والعودة للرئيسية */}
          <Button
            onClick={handleHardReset}
            variant="ghost"
            className="w-full h-10 text-xs text-stone-400 hover:text-white hover:bg-white/5 rounded-xl font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-stone-500" />
            <span>إصلاح سريع وتنظيف الذاكرة المؤقتة</span>
          </Button>
        </div>

        {/* تفاصيل تقنية قابلة للطي للمطور / ولي الأمر */}
        {rawErrMsg && (
          <div className="w-full border-t border-white/5 pt-3">
            <button
              onClick={() => setShowTechDetails((v) => !v)}
              className="text-[11px] text-stone-500 hover:text-stone-300 flex items-center justify-center gap-1 mx-auto transition-colors"
            >
              <span>{showTechDetails ? "إخفاء التفاصيل الفنية" : "عرض التفاصيل الفنية"}</span>
              {showTechDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showTechDetails && (
              <div className="mt-2.5 p-3 rounded-xl bg-black/60 border border-white/5 text-[10px] text-stone-400 font-mono text-left dir-ltr max-h-24 overflow-y-auto break-all">
                {rawErrMsg}
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-stone-500 font-medium">
          تطبيق القرآن للأطفال • دعم فني مستمر لخدمتكم 💖
        </p>
      </div>
    </div>
  );
}

export function SupportErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        window.location.reload();
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
