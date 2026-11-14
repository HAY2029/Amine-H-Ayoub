// فحص المفتاح فقط من وحدة خفيفة؛ حزمة Supabase تُجلب عند إرسال التقرير فقط
// (هذا الملف يُستورد مع حاجز الأخطاء في الشاشة الأولى، فلا يجوز أن يجرّها معه).
import { hasValidSupabaseKey } from "@/lib/supabaseEnv";
import { getDeviceId } from "@/utils/deviceInfo";
import { openExternalUrl } from "@/utils/tauriUtils";

export interface SupportReportData {
  id?: string;
  type: "bug" | "suggestion" | "inquiry" | "thanks" | "other";
  typeLabel: string;
  description: string;
  senderEmail?: string;
  profileName?: string;
  appVersion: string;
  platform: string;
  timestamp: string;
  read?: boolean;
}

export const SUPPORT_EMAILS = ["hammoualiyoucef20@gmail.com", "Amine.hyoub@gmail.com"];
export const SUPPORT_WHATSAPP_NUMBER = "213658188644";
export const SUPPORT_WHATSAPP_DISPLAY = "0658188644";
export const LOCAL_INBOX_KEY = "mushaf:support_inbox_v1";

function isMobileDevice(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** إنشاء رابط بريد إلكتروني مباشر لفتح تطبيق البريد بنقرة واحدة */
export function createMailtoSupportLink(report: Partial<SupportReportData>): string {
  const to = SUPPORT_EMAILS.join(",");
  const subject = encodeURIComponent(`[دعم تطبيق القرآن] ${report.typeLabel || "تقرير"} - ${report.profileName || "مستخدم"}`);
  const body = encodeURIComponent(
    `السلام عليكم ورحمة الله وبركاته،\n\n` +
    `نوع الرسالة: ${report.typeLabel || "مشكلة تقنية"}\n` +
    `المرسل: ${report.profileName || "مستخدم التطبيق"}\n` +
    `البريد أو الهاتف للرد: ${report.senderEmail || "لم يُحدد"}\n` +
    `إصدار التطبيق: ${report.appVersion || "1.0.0"}\n` +
    `الجهاز / النظام: ${report.platform || "Web"}\n` +
    `وقت الإرسال: ${report.timestamp || new Date().toLocaleString("ar-SA")}\n\n` +
    `=========================================\n` +
    `نص الرسالة / البلاغ:\n${report.description || ""}\n` +
    `=========================================\n`
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

/** إنشاء رابط واتساب مباشر لإرسال الرسالة إلى الدعم الفني فوراً (0658188644) */
export function createWhatsAppSupportLink(report?: Partial<SupportReportData> | string): string {
  let message = "السلام عليكم ورحمة الله تعالى وبركاته . أنا أواجه مشكلة في ";
  
  if (typeof report === "string") {
    if (report && !report.startsWith("السلام عليكم")) {
      message += report;
    } else if (report) {
      message = report;
    }
  } else if (report && report.typeLabel) {
    message += report.typeLabel;
  }

  const encodedMessage = encodeURIComponent(message);
  // الهاتف يفتح تطبيق واتساب، والحاسوب يفتح WhatsApp Web/المتصفح.
  return isMobileDevice()
    ? `whatsapp://send?phone=${SUPPORT_WHATSAPP_NUMBER}&text=${encodedMessage}`
    : `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodedMessage}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 2500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** فتح محادثة واتساب المباشرة مع الدعم الفني على رقم 0658188644 في المتصفح أو التطبيق */
export async function openWhatsAppSupport(report?: Partial<SupportReportData> | string): Promise<void> {
  const url = createWhatsAppSupportLink(report);
  await openExternalUrl(url);
}

/** حفظ الرسالة في صندوق وارد الإدارة المحلي على الجهاز */
export function saveSupportMessageLocally(report: SupportReportData) {
  try {
    const raw = localStorage.getItem(LOCAL_INBOX_KEY);
    const list: SupportReportData[] = raw ? JSON.parse(raw) : [];
    const item: SupportReportData = {
      ...report,
      id: report.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: report.timestamp || new Date().toLocaleString("ar-SA"),
      read: false,
    };
    list.unshift(item);
    // Keep max 100 messages locally
    localStorage.setItem(LOCAL_INBOX_KEY, JSON.stringify(list.slice(0, 100)));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("mushaf:support_inbox_updated"));
    }
  } catch (err) {
    console.debug("Local support inbox save error:", err);
  }
}

/** قراءة جميع رسائل الدعم المخزنة في صندوق الوارد للإدارة */
export function getLocalSupportMessages(): SupportReportData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_INBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** حذف رسالة من صندوق الوارد */
export function deleteLocalSupportMessage(id: string) {
  try {
    const list = getLocalSupportMessages().filter((m) => m.id !== id);
    localStorage.setItem(LOCAL_INBOX_KEY, JSON.stringify(list));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("mushaf:support_inbox_updated"));
    }
  } catch {
    /* ignore */
  }
}

/** مسح جميع رسائل صندوق الوارد */
export function clearLocalSupportMessages() {
  try {
    localStorage.removeItem(LOCAL_INBOX_KEY);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("mushaf:support_inbox_updated"));
    }
  } catch {
    /* ignore */
  }
}

/**
 * إرسال تقرير الدعم الفني عبر قنوات متعددة ومؤكدة:
 * 1. الحفظ الفوري الدائم في صندوق الإدارة المحلي.
 * 2. الحفظ في قاعدة بيانات Supabase.
 * 3. الإرسال البريدي الخارجي مع إتاحة روابط Mailto و WhatsApp المباشرة فوراً.
 */
export async function sendSupportReportEmail(
  report: SupportReportData,
): Promise<{ success: boolean; error?: string; mailtoLink?: string; whatsappLink?: string }> {
  let emailDelivered = false;
  let dbSaved = false;

  const mailtoLink = createMailtoSupportLink(report);
  const whatsappLink = createWhatsAppSupportLink(report);

  // 1. القناة الأولى المضمونة: حفظ الرسالة في صندوق وارد الإدارة المحلي
  saveSupportMessageLocally(report);

  // 2. القناة الثانية: حفظ الرسالة في سوبابيز
  if (hasValidSupabaseKey()) {
    try {
      const { supabase } = await import("@/lib/supabase");
      const deviceId = getDeviceId();
      const { data: conversation } = await supabase
        .from("support_conversations")
        .upsert(
          { device_id: deviceId, user_name: report.profileName || "مستخدم التطبيق" },
          { onConflict: "device_id" }
        )
        .select("id")
        .single();

      if (conversation?.id) {
        const body = [
          `[${report.typeLabel}]`,
          report.description,
          `البريد: ${report.senderEmail || "غير محدد"}`,
          `الإصدار: ${report.appVersion}`,
          `الجهاز: ${report.platform}`,
          `الوقت: ${report.timestamp}`,
        ].join("\n");

        const { error: msgErr } = await supabase
          .from("support_messages")
          .insert({ conversation_id: conversation.id, sender: "user", body });

        if (!msgErr) {
          dbSaved = true;
        }
      }
    } catch {
      /* ignore db error */
    }

    // محاولة استدعاء دالة Edge Function إن وُجدت
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data, error } = await supabase.functions.invoke("send-support-report", {
        body: report,
      });
      if (!error && data?.success) {
        emailDelivered = true;
      }
    } catch {
      /* ignore edge error */
    }
  }

  // 3. القناة الثالثة: محاولة إرسال بريدي عبر FormSubmit
  try {
    const payload = {
      name: report.profileName || "مستخدم التطبيق",
      email: report.senderEmail || "noreply@learn-quran.app",
      _subject: `[تطبيق القرآن] ${report.typeLabel} من: ${report.profileName || "مستخدم"}`,
      _replyto: report.senderEmail || undefined,
      نوع_الرسالة: report.typeLabel,
      المرسل: report.profileName || "مستخدم التطبيق",
      البريد: report.senderEmail || "غير محدد",
      الإصدار: report.appVersion,
      النظام: report.platform,
      الوقت: report.timestamp,
      نص_الرسالة: report.description,
    };

    const requests = SUPPORT_EMAILS.map((targetEmail) =>
      fetchWithTimeout(`https://formsubmit.co/ajax/${targetEmail}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .catch(() => null)
    );

    const responses = await Promise.allSettled(requests);
    emailDelivered = responses.some(
      (r) => r.status === "fulfilled" && r.value && (r.value.success === "true" || r.value.success === true)
    );
  } catch (err) {
    console.debug("FormSubmit delivery:", err);
  }

  return {
    success: true, // Saved in local inbox and/or DB
    mailtoLink,
    whatsappLink,
  };
}
