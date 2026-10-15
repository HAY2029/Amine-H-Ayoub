import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { SupportErrorBoundary } from "./components/SupportErrorBoundary";
// @ts-ignore - virtual module
// @ts-ignore - virtual:pwa-register is provided by vite-plugin-pwa at build time
import { registerSW } from "virtual:pwa-register";
import { initCloudAudioAvailability } from "./data/audioUrls";
import { warmUpGameVoices } from "./utils/gameVoice";

// PWA: Guard against iframe/preview contexts
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}

// Register service worker in production
if ('serviceWorker' in navigator && !isPreviewHost && !isInIframe) {
  registerSW({ immediate: true });
}

/** تُنفّذ عمليات التهيئة الخلفية دون حجب العرض / الاستجابة للواجهة. */
function runBackgroundWarmup() {
  // صوت التشجيع في الخلفية من أول دخول — بهدوء وبلا أي رسالة خطأ
  try { warmUpGameVoices(); } catch { /* ignore */ }

  // جلب قائمة التلاوات المتوفرة من السيرفر يجري في الخلفية دون حجب فتح التطبيق
  initCloudAudioAvailability().catch(() => { /* ignore */ });
}

async function bootstrap() {
  // ⚡ الأداء: عرض التطبيق فوراً بدون أي انتظار
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <SupportErrorBoundary>
        <App />
      </SupportErrorBoundary>
    </React.StrictMode>,
  );

  // تنفيذ التسخين الخلفية في إطار تبديل الرسوم (idle) أو في الخلفية،
  // دون حجب الإطلاق وإظهار شاشة فارغة للشاشة الأولى.
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(runBackgroundWarmup, { timeout: 3000 });
  } else {
    // fallback: صغيرة لتجنّب تعليق الواجهة
    setTimeout(runBackgroundWarmup, 0);
  }
}

bootstrap();
