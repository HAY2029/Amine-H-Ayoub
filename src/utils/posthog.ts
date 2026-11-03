import type { PostHog } from "posthog-js";
import { getAppMode, getProfile, getProfiles } from "@/data/kidsProfile";

/**
 * تحليلات المنتج و«تسجيل الجلسات» (Session Replay) عبر PostHog.
 * - المفتاح العام يُقرأ من البيئة (VITE_POSTHOG_KEY) ولا يُكتب أبداً داخل الكود.
 * - لا يُحمَّل الـ SDK قبل موافقة المستخدم، والموافقة قابلة للإيقاف من الإعدادات،
 *   ويبدأ/يتوقف تسجيل الجلسات معها.
 * - لا تُرسل بيانات شخصية: معرّف الملف ووضع الاستخدام فقط (بدون أسماء أو أعمار).
 * - تُخفى كل حقول الإدخال في التسجيل، ويمكن إخفاء أي نص حسّاس بإضافة data-ph-mask إليه.
 * - كل حدث يُسجَّل من هنا يحمل معرّف الجلسة نفسه، فتظهر الأحداث المحورية
 *   (فتح التطبيق، اختيار الملف، بدء التلاوة، إكمال الجلسة) مرتبطة بتسجيلها.
 */

const API_KEY = String(import.meta.env.VITE_POSTHOG_KEY ?? "").trim();
const API_HOST = String(import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com").trim();

/** موافقة المستخدم على التحليلات — مفعّلة افتراضياً كما في تحليلات التطبيق الحالية. */
const CONSENT_KEY = "mushaf:analyticsConsent";
const DEVICE_KEY = "mushaf:deviceId";

type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

let client: PostHog | null = null;
let loading: Promise<void> | null = null;
const pending: Array<(ph: PostHog) => void> = [];

/** ينفّذ العملية على الـ SDK إن كان جاهزاً، وإلّا يؤجّلها حتى يجهز. */
const run = (op: (ph: PostHog) => void) => {
  // لا أحداث بلا مفتاح أو بلا موافقة — ولا إرسال لاحق لأحداث جرت قبل الموافقة
  if (!API_KEY || !hasAnalyticsConsent()) return;
  if (client) {
    try {
      op(client);
    } catch {
      /* التحليلات لا تُعطّل التطبيق أبداً */
    }
    return;
  }
  pending.push(op);
};

export const hasAnalyticsConsent = (): boolean => {
  try {
    return localStorage.getItem(CONSENT_KEY) !== "0";
  } catch {
    return true;
  }
};

const getDeviceId = (): string => {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return "device-unknown";
  }
};

/** يبدأ تحميل PostHog وتشغيله — يُستدعى مرة واحدة عند الإقلاع أو عند منح الموافقة. */
export function initAnalytics(): void {
  if (!API_KEY || typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  if (loading) return;

  loading = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(API_KEY, {
        api_host: API_HOST,
        // أحداث صفحة أساسية فقط + أوتوكابتشر مطفأ لخفة التطبيق وحماية خصوصية الأطفال
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false,
        // تسجيل الجلسات مفعّل لأن التهيئة لا تجري إلا بموافقة المستخدم
        disable_session_recording: !hasAnalyticsConsent(),
        session_recording: {
          // إخفاء قيم كل حقول الإدخال (الأسماء، البريد، كلمة المرور…) بلا استثناء
          maskAllInputs: true,
          // إخفاء أي نص موسوم بـ data-ph-mask (وأصناف ph-mask الافتراضية)
          maskTextSelector: "[data-ph-mask]",
          // حجم تسجيل معقول: بلا حركة مؤشر مكثّفة
          sampling: { mousemove: 100 },
        },
        // لا نُنشئ ملفات شخصية إلا بعد تعريف المستخدم صراحةً
        person_profiles: "identified_only",
        persistence: "localStorage",
      });
      client = posthog;
      while (pending.length > 0) {
        const op = pending.shift();
        if (op) {
          try {
            op(posthog);
          } catch {
            /* ignore */
          }
        }
      }
    })
    .catch(() => {
      // بلا مفتاح/شبكة: تبقى التحليلات معطّلة بهدوء دون أي أثر على التطبيق
      loading = null;
    });
}

/** تسجيل حدث منتج (no-op بهدوء إن لم يُضبط المفتاح أو لم تُمنح الموافقة). */
export function captureEvent(event: string, properties: AnalyticsProps = {}): void {
  if (!API_KEY || typeof window === "undefined") return;
  run((posthog) => posthog.capture(event, properties));
}

/** تعريف المستخدم بمعرّف ثابت حتى تعمل مسارات التحويل (funnels) والاحتفاظ (retention). */
export function identifyUser(distinctId: string, properties: AnalyticsProps = {}): void {
  if (!API_KEY || !distinctId || typeof window === "undefined") return;
  run((posthog) => posthog.identify(distinctId, properties));
}

/**
 * تعريف صاحب الجلسة الحالية: الطفل النشِط أو ولي الأمر (بمعرّف الجهاز).
 * يُستدعى عند الإقلاع وعند تبديل الملف حتى تبقى الأحداث مرتبطة بشخص واحد.
 */
export function identifyActiveProfile(): void {
  try {
    const mode = getAppMode();
    const profilesCount = getProfiles().length;
    // معرّف التثبيت يُضاف لكل معرّف حتى لا يندمج مستخدمون مختلفون في شخص واحد بنفس المعرّف
    const deviceId = getDeviceId();
    if (mode === "parent") {
      identifyUser(`parent_${deviceId}`, { role: "parent", app_mode: mode, profiles_count: profilesCount });
      return;
    }
    // قبل إنشاء ملف الطفل (أول تشغيل) لا يوجد معرّف ملف بعد، فنستخدم الجهاز نفسه
    const childId = profilesCount > 0 ? `child_${deviceId}_${getProfile().id}` : `child_${deviceId}`;
    identifyUser(childId, { role: "child", app_mode: mode, profiles_count: profilesCount });
  } catch {
    /* ignore */
  }
}

/** يفعّل/يوقف التحليلات حسب موافقة المستخدم ويحفظ اختياره. */
export function setAnalyticsConsent(granted: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (granted) {
    initAnalytics();
    if (client) {
      client.opt_in_capturing();
      // تسجيل الجلسات يعود مع الموافقة (قد يكون أُوقف سابقاً)
      try {
        client.startSessionRecording();
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (client) {
    try {
      client.stopSessionRecording();
    } catch {
      /* ignore */
    }
    client.opt_out_capturing();
  }
  pending.length = 0;
}
