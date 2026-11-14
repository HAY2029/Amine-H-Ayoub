import { toast } from "@/hooks/use-toast";
import { requestPermission, sendNotification, isPermissionGranted } from "@tauri-apps/plugin-notification";
import { isTauri } from "./tauriUtils";

/** نغمة تنبيه لطيفة ومريحة عند صدور أي إشعار (Web Audio API) */
export function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // النغمة الأولى: نغمة دافئة هادئة
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // النغمة الثانية: رنين متناغم أعلى
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch {
    // تجاهل أخطاء قيود تشغيل الصوت التلقائي
  }
}

/** واجهة إعدادات التذكيرات */
export interface ReminderSettings {
  enabled: boolean;                 // تفعيل التذكيرات عموماً
  soundEnabled: boolean;            // تشغيل صوت التنبيه
  dailyLessonEnabled: boolean;      // تذكير الدرس / الورد القرآني اليومي
  dailyLessonTime: string;          // وقت التذكير بالصيغة "HH:MM"
  fridayKahfEnabled: boolean;       // تذكير سورة الكهف كل جمعة
  morningAthkarEnabled: boolean;    // تذكير أذكار الصباح
  eveningAthkarEnabled: boolean;    // تذكير أذكار المساء
  playtimeWarningsEnabled: boolean; // تنبيهات اقتراب وانتهاء وقت اللعب
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  soundEnabled: true,
  dailyLessonEnabled: true,
  dailyLessonTime: "17:00",
  fridayKahfEnabled: true,
  morningAthkarEnabled: true,
  eveningAthkarEnabled: true,
  playtimeWarningsEnabled: true,
};

const REMINDER_SETTINGS_KEY = "mushaf:reminder_settings:v2";

export function getReminderSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(REMINDER_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    console.error(e);
  }
  return DEFAULT_REMINDER_SETTINGS;
}

export function saveReminderSettings(settings: Partial<ReminderSettings>): ReminderSettings {
  const current = getReminderSettings();
  const updated = { ...current, ...settings };
  try {
    localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mushaf:reminder_settings_changed", { detail: updated }));
  }
  return updated;
}

// طلب إذن الإشعارات لكافة المنصات
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (await isTauri()) {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      return granted;
    }
  } catch (err) {
    console.error("Tauri permission error:", err);
  }

  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") {
    try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * إرسال إشعار فوري: يعمل على نظام التشغيل مباشرة (Windows/Android عبر Tauri أو المتصفح)
 * مع تشغيل صوت تنبيه نقي وإظهار تنبيه داخلي (Toast) مرئي لضمان وصول التنبيه بكل الأحوال.
 */
export async function showLocalNotification(
  title: string,
  body: string,
  options?: { skipToast?: boolean; sound?: boolean }
) {
  const settings = getReminderSettings();
  const shouldPlaySound = options?.sound !== false && settings.soundEnabled;

  if (shouldPlaySound) {
    playNotificationChime();
  }

  let nativeSuccess = false;

  // 1. نظام تشغيل Tauri (تطبيقات سطح المكتب و Android المجمعة)
  try {
    if (await isTauri()) {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      if (granted) {
        sendNotification({ title, body });
        nativeSuccess = true;
      }
    }
  } catch (err) {
    console.error("Tauri notification error:", err);
  }

  // 2. نظام المتصفح أو ServiceWorker في بيئة الويب
  if (!nativeSuccess && typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      await requestNotificationPermission();
    }

    if (Notification.permission === "granted") {
      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (reg && reg.showNotification) {
            await reg.showNotification(title, {
              body,
              icon: "/pwa-192x192.png",
              badge: "/pwa-192x192.png",
              tag: title,
            });
            nativeSuccess = true;
          }
        }
        if (!nativeSuccess) {
          new Notification(title, { body, icon: "/pwa-192x192.png", tag: title });
          nativeSuccess = true;
        }
      } catch (err) {
        console.error("Native notification display failed", err);
      }
    }
  }

  // 3. تنبيه داخلي فوري (Toast) لضمان رؤية الإشعار حتى لو كان المستخدم يتنقل داخل التطبيق
  if (!options?.skipToast) {
    toast({ title, description: body });
  }

  return nativeSuccess;
}

/**
 * المحرّك الخلفي الشامل للإشعارات والتذكيرات الذكية
 * يعمل في الخلفية طوال فترة تشغيل التطبيق
 */
/** علامة تُثبَّت بعد أول إقلاع حتى لا يُعاد عرض دفعة الإشعارات القديمة */
const FIRST_RUN_KEY = "mushaf:notif:firstrun_done";

/** يكتب مفتاح اليوم حتى لا ينطلق تذكير اليوم بعد فوات وقته */
const suppressReminder = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
};
