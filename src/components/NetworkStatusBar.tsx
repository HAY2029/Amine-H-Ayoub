import React, { useState, useEffect } from "react";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";

export default function NetworkStatusBar() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      const timer = setTimeout(() => {
        setJustReconnected(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      // محاولة فحص حقيقي عبر اتصال خفيف بالخادم
      await fetch("/", { method: "HEAD", cache: "no-store" });
      setIsOnline(true);
      setJustReconnected(true);
      setTimeout(() => setJustReconnected(false), 3500);
    } catch {
      setIsOnline(false);
    } finally {
      setIsChecking(false);
    }
  };

  // في حالة الاتصال الطبيعي ولا يوجد إشعار عودة حديث: لا يظهر شيء
  if (isOnline && !justReconnected) {
    return null;
  }

  return (
    <aside
      aria-label="حالة الاتصال بالإنترنت"
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-[9999] max-w-lg w-[92%] sm:w-auto px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-3 transition-all duration-300 animate-in fade-in slide-in-from-top-4 select-none ${
        justReconnected
          ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/40 shadow-emerald-500/20"
          : "bg-stone-950/95 text-amber-200 border-amber-500/40 shadow-amber-500/20"
      }`}
      dir="rtl"
    >
      <div className="flex items-center gap-2.5">
        {justReconnected ? (
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Wifi className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <WifiOff className="w-4 h-4 animate-pulse" />
          </div>
        )}
        <div className="flex flex-col">
          <span>
            {justReconnected
              ? "عادت الشبكة بحمد الله! 🌐"
              : "انقطاع مؤقت في الاتصال بالإنترنت 📡"}
          </span>
          <span className="text-[11px] font-normal opacity-80">
            {justReconnected
              ? "تم استئناف الاستماع للمصحف وتحميل المحتوى بنجاح."
              : "بانتظار عودة الشبكة... سيعاود التطبيق العمل تلقائياً."}
          </span>
        </div>
      </div>

      {!justReconnected && (
        <button
          onClick={handleManualCheck}
          disabled={isChecking}
          className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-black flex items-center gap-1.5 border border-amber-500/30 transition-all active:scale-95 cursor-pointer shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin" : ""}`} />
          <span>{isChecking ? "جاري الفحص..." : "فحص"}</span>
        </button>
      )}
    </aside>
  );
}
