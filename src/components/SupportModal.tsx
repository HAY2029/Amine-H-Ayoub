import { useState } from "react";
import {
  X,
  Send,
  Loader2,
  CheckCircle2,
  Bug,
  Lightbulb,
  HelpCircle,
  Heart,
  AlertCircle,
  Mail,
  MessageSquare,
} from "lucide-react";
import WhatsAppIcon from "./WhatsAppIcon";
import {
  sendSupportReportEmail,
  SupportReportData,
  createMailtoSupportLink,
  openWhatsAppSupport,
  SUPPORT_WHATSAPP_DISPLAY,
  saveSupportMessageLocally,
} from "@/services/resendService";
import { getProfile } from "@/data/kidsProfile";
import { CURRENT_VERSION } from "@/utils/updateChecker";
import { toast } from "@/hooks/use-toast";
import ModalLayer from "@/components/ui/ModalLayer";

interface Props {
  onClose: () => void;
}

type ReportType = "bug" | "suggestion" | "inquiry" | "thanks" | "other";

const REPORT_TYPES: Array<{
  id: ReportType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "bug", label: "مشكلة تقنية", icon: Bug },
  { id: "suggestion", label: "اقتراح فكرة", icon: Lightbulb },
  { id: "inquiry", label: "استفسار", icon: HelpCircle },
  { id: "thanks", label: "شكر وتقدير", icon: Heart },
];

export default function SupportModal({ onClose }: Props) {
  const activeProfile = getProfile();
  const [type, setType] = useState<ReportType>("bug");
  const [description, setDescription] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSendWhatsApp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!description.trim()) {
      setErrorMessage("يرجى كتابة نص الرسالة أو وصف المشكلة أولاً");
      return;
    }

    setSending(true);
    setErrorMessage("");

    const typeItem = REPORT_TYPES.find((t) => t.id === type);

    const reportData: SupportReportData = {
      type,
      typeLabel: typeItem ? typeItem.label : "رسالة عامة",
      description: description.trim(),
      senderEmail: senderEmail.trim() || undefined,
      profileName: activeProfile?.name || "مستخدم التطبيق",
      appVersion: CURRENT_VERSION,
      platform: typeof navigator !== "undefined" ? navigator.userAgent : "Web",
      timestamp: new Date().toLocaleString("ar-SA"),
    };

    // حفظ محلي وإرسال تقرير خلفي للأرشفة
    saveSupportMessageLocally(reportData);
    void sendSupportReportEmail(reportData);

    // فتح واتساب فوراً للرقم المحدد 0658188644
    await openWhatsAppSupport(reportData);

    setSending(false);
    setSentSuccess(true);
    toast({
      title: "جاري فتح واتساب 💬",
      description: `تم تجهيز رسالتك للإرسال إلى الدعم الفني (${SUPPORT_WHATSAPP_DISPLAY}).`,
    });
  };

  const handleDirectQuickWhatsApp = () => {
    const msg =
      `السلام عليكم ورحمة الله وبركاته،\n` +
      `أحتاج مساعدة وتواصلاً مع الدعم الفني لتطبيق القرآن للأطفال:\n` +
      `• الإصدار: ${CURRENT_VERSION}` +
      (description.trim() ? `\n• الرسالة: ${description.trim()}` : "");

    void openWhatsAppSupport(msg);
  };

  return (
    <ModalLayer>
    <div
      className="fixed inset-0 z-[250] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/70 backdrop-blur-md p-4 sm:items-center animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="relative my-auto w-full max-w-md rounded-3xl bg-card border border-border shadow-2xl p-6 pb-safe space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200">
        {/* زر الإغلاق */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* رأس النافذة */}
        <div className="text-center space-y-1 pt-1">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[#25D366]/15 text-[#25D366] flex items-center justify-center mb-1">
            <WhatsAppIcon className="w-7 h-7" />
          </div>
          <h3 className="font-extrabold text-xl text-foreground">الدعم الفني المباشر</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            تواصل سريع ومباشر مع فريق الدعم الفني عبر واتساب
          </p>
        </div>

        {/* بطاقة فتح واتساب الفورية */}
        <button
          type="button"
          onClick={handleDirectQuickWhatsApp}
          className="w-full p-3 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 transition-all text-right flex items-center justify-between gap-3 group cursor-pointer shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#25D366] text-white flex items-center justify-center shrink-0 shadow-sm">
              <WhatsAppIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <b className="text-xs font-bold text-foreground block">محادثة واتساب مباشرة ({SUPPORT_WHATSAPP_DISPLAY})</b>
              <span className="text-[11px] text-muted-foreground">انقر هنا لفتح واتساب ومراسلة الدعم فوراً</span>
            </div>
          </div>
          <span className="text-xs font-bold text-[#25D366] group-hover:translate-x-[-2px] transition-transform">
            فتح 💬
          </span>
        </button>

        {sentSuccess ? (
          <div className="py-6 text-center space-y-4 animate-in fade-in zoom-in duration-300">
            <div className="mx-auto w-16 h-16 rounded-full bg-[#25D366]/15 text-[#25D366] flex items-center justify-center ring-4 ring-[#25D366]/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-lg text-foreground">تم توجيه رسالتك إلى واتساب!</h4>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                شكراً لتواصلك معنا على الرقم <span className="font-bold text-[#25D366]">{SUPPORT_WHATSAPP_DISPLAY}</span>، وسنحرص على الرد عليك ومساعدتك بأسرع وقت إن شاء الله.
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={handleDirectQuickWhatsApp}
                className="px-5 py-2.5 rounded-xl bg-[#25D366] text-white font-bold text-xs flex items-center gap-1.5 shadow cursor-pointer active:scale-95 transition-all"
              >
                <WhatsAppIcon className="w-4 h-4 text-white" />
                <span>إعادة فتح واتساب</span>
              </button>
              <button
                onClick={onClose}
                className="btn-gold px-6 py-2.5 rounded-xl font-bold text-xs shadow-md active:scale-95 transition-transform cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendWhatsApp} className="space-y-3.5">
            {/* نوع الرسالة */}
            <div className="space-y-1.5 text-right">
              <label className="text-xs font-bold text-foreground block">نوع الموضوع</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {REPORT_TYPES.map((item) => {
                  const Icon = item.icon;
                  const isSelected = type === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setType(item.id)}
                      className={`h-16 rounded-2xl p-1.5 flex flex-col items-center justify-center gap-1 border transition-all text-xs font-bold cursor-pointer ${
                        isSelected
                          ? "border-[#25D366] bg-[#25D366]/10 text-emerald-700 dark:text-emerald-400 shadow-sm ring-1 ring-[#25D366]/30 scale-[1.02]"
                          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${
                          isSelected
                            ? "text-[#25D366]"
                            : "text-muted-foreground"
                        }`}
                      />
                      <span className="text-[11px] truncate w-full text-center">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>


            {/* نص الرسالة أو البلاغ */}
            <div className="space-y-1 text-right">
              <label className="text-xs font-bold text-foreground block">
                نص الرسالة أو الاستفسار <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <textarea
                  value={description}
                  onChange={(e) => {
                    if (e.target.value.length <= 600) {
                      setDescription(e.target.value);
                      setErrorMessage("");
                    }
                  }}
                  placeholder="اكتب هنا ما تحتاجه أو المشكلة التي واجهتك وسيرد عليك الدعم الفني فوراً على واتساب..."
                  rows={4}
                  className="w-full text-xs p-3 rounded-2xl bg-muted/60 border border-border text-foreground placeholder-muted-foreground focus:border-accent outline-none transition-colors resize-none leading-relaxed"
                />
                <span className="absolute bottom-2 left-3 text-[10px] text-muted-foreground font-mono">
                  {description.length}/600
                </span>
              </div>
            </div>

            {/* رسالة التنبيه إن وُجدت */}
            {errorMessage && (
              <div className="flex items-center gap-1.5 text-xs text-destructive font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* زر الإرسال الرئيسي عبر واتساب */}
            <button
              type="submit"
              disabled={sending || !description.trim()}
              className="w-full h-13 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-[#25D366]/20 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              {sending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري فتح واتساب...</span>
                </>
              ) : (
                <>
                  <WhatsAppIcon className="w-5 h-5 text-white" />
                  <span>إرسال الرسالة عبر واتساب ({SUPPORT_WHATSAPP_DISPLAY})</span>
                </>
              )}
            </button>

            {/* خيارات إضافية */}
            <div className="pt-2 text-center border-t border-border/50 flex items-center justify-center gap-3 text-xs">
              <a
                href={createMailtoSupportLink({
                  typeLabel: REPORT_TYPES.find((t) => t.id === type)?.label || "رسالة",
                  description: description.trim(),
                  profileName: activeProfile?.name || "مستخدم التطبيق",
                  appVersion: CURRENT_VERSION,
                })}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px] font-medium transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>أو الإرسال عبر البريد الإلكتروني</span>
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
    </ModalLayer>
  );
}
