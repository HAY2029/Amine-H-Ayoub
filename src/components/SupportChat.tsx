import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { X, MessageSquare, Send, Loader2, Paperclip, UploadCloud, CheckCheck, RefreshCw, Image as ImageIcon, Mail } from "lucide-react";
import { hasValidSupabaseKey, supabase } from "@/lib/supabase";
import { getDeviceId } from "@/utils/deviceInfo";
import { toast } from "@/hooks/use-toast";
import { sendSupportReportEmail, openWhatsAppSupport, SUPPORT_WHATSAPP_DISPLAY } from "@/services/resendService";
import { getProfile } from "@/data/kidsProfile";
import WhatsAppIcon from "./WhatsAppIcon";
import ModalLayer from "./ui/ModalLayer";

export type SupportMessage = {
  id: string;
  sender: "user" | "admin";
  body: string;
  created_at: string;
};

const CACHE_KEY = "mushaf:support_cache_v3";

export default function SupportChat({
  pageMode = false,
  onClose,
}: {
  pageMode?: boolean;
  onClose?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [convId, setConvId] = useState<string>(() => {
    try {
      return getDeviceId() || "user_device";
    } catch {
      return "user_device";
    }
  });
  const convIdRef = useRef(convId);

  const [messages, setMessages] = useState<SupportMessage[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* ignore */
    }
    return [];
  });

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [adminTyping, setAdminTyping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    const t = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(t);
  }, [messages, adminTyping]);

  useEffect(() => {
    let subscription: RealtimeChannel | null = null;

    async function initChat() {
      try {
        setLoading(true);
        setConnectionError(null);
        if (!hasValidSupabaseKey()) {
          throw new Error("Supabase غير مُعدّ في إعدادات التطبيق");
        }
        const deviceId = getDeviceId() || `device_${Date.now()}`;

        let conv;
        const { data, error: conversationError } = await supabase
          .from("support_conversations")
          .select("id")
          .eq("device_id", deviceId)
          .maybeSingle();
        if (conversationError) throw conversationError;
        conv = data;

        if (!conv) {
          const { data, error } = await supabase
            .from("support_conversations")
            .insert({ device_id: deviceId, user_name: "مستخدم التطبيق" })
            .select("id")
            .maybeSingle();

          if (error) throw error;
          if (data) conv = data;
        }

        if (conv?.id) {
          setConvId(conv.id);
          convIdRef.current = conv.id;

          const { data: msgs, error: messagesError } = await supabase
            .from("support_messages")
            .select("id, sender, body, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true });
          if (messagesError) throw messagesError;

          if (msgs && msgs.length > 0) {
            setMessages(msgs as SupportMessage[]);
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify(msgs));
            } catch {
              /* ignore */
            }
          }

          const channelName = `support_${conv.id}`;
          const channel = supabase.channel(channelName);
          channel
            .on(
              "postgres_changes",
              { event: "INSERT", schema: "public", table: "support_messages", filter: `conversation_id=eq.${conv.id}` },
              (payload) => {
                const newMsg = payload.new as SupportMessage;
                if (newMsg.sender === "admin") setAdminTyping(false);
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id || (m.body === newMsg.body && m.sender === newMsg.sender))) {
                    return prev;
                  }
                  const next = [...prev, newMsg];
                  try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
                  } catch {
                    /* ignore */
                  }
                  return next;
                });
              }
            );
          subscription = channel.subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setConnectionError("تعذر الاتصال المباشر، ستتم محاولة تحديث الرسائل تلقائيًا.");
            }
          });
        } else {
          throw new Error("تعذر إنشاء محادثة الدعم الفني");
        }
      } catch (err) {
        setConnectionError(err instanceof Error ? err.message : "تعذر الاتصال بالدعم الفني");
        console.debug("Support init info:", err);
      } finally {
        setLoading(false);
      }
    }

    const pollInterval = setInterval(async () => {
      const activeConvId = convIdRef.current;
      if (!activeConvId || activeConvId === "user_device") return;
      try {
        const { data: latestMsgs, error } = await supabase
          .from("support_messages")
          .select("id, sender, body, created_at")
          .eq("conversation_id", activeConvId)
          .order("created_at", { ascending: true });
        if (error) throw error;

        if (latestMsgs && latestMsgs.length > 0) {
          setMessages((prev) => {
            const map = new Map();
            prev.forEach((m) => map.set(m.id, m));
            latestMsgs.forEach((m) => map.set(m.id, m));
            const merged = Array.from(map.values());
            if (merged.length !== prev.length) {
              try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
              } catch {
                /* ignore */
              }
              return merged;
            }
            return prev;
          });
        }
      } catch {
        setConnectionError("تعذر تحديث رسائل الدعم، تحقق من اتصال الإنترنت.");
      }
    }, 2500);

    return () => {
      clearInterval(pollInterval);
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);

  const handleImageUpload = async (file: File) => {
    if (sending) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "تنبيه", description: "يرجى اختيار ملف صورة صالح", variant: "destructive" });
      return;
    }

    setSending(true);
    const tempId = `optimistic-${Date.now()}`;
    try {
      const toBase64 = (f: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
      const base64 = await toBase64(file);

      const tempMsg: SupportMessage = {
        id: tempId,
        sender: "user",
        body: `[IMAGE] ${base64}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev, tempMsg];
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });

      if (convId && convId !== "user_device") {
        const { error: messageError } = await supabase.from("support_messages").insert({
          conversation_id: convId,
          sender: "user",
          body: `[IMAGE] ${base64}`,
        });
        if (messageError) throw messageError;
        const { error: conversationError } = await supabase
          .from("support_conversations")
          .update({ last_message: "📷 صورة مرفقة", last_message_at: new Date().toISOString() })
          .eq("id", convId);
        if (conversationError) throw conversationError;
        setConnectionError(null);
      } else {
        throw new Error("لم يتم إنشاء محادثة الدعم الفني");
      }

      setConnectionError(null);
      toast({ title: "تم إرسال الصورة بنجاح ✅", description: "وصلت لقطة الشاشة إلى المشرف." });
    } catch (err) {
      console.debug("Upload note:", err);
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      toast({ title: "تعذر إرسال الصورة", description: "تحقق من اتصال الدعم وحاول مرة أخرى.", variant: "destructive" });
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const sendMessage = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setSending(true);

    const tempId = `optimistic-${Date.now()}`;
    const userMsg: SupportMessage = {
      id: tempId,
      sender: "user",
      body: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => {
      const next = [...prev, userMsg];
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

    try {
      if (convId && convId !== "user_device") {
        const { error: messageError } = await supabase
          .from("support_messages")
          .insert({ conversation_id: convId, sender: "user", body: text });
        if (messageError) throw messageError;
        const { error: conversationError } = await supabase
          .from("support_conversations")
          .update({ last_message: text, last_message_at: new Date().toISOString() })
          .eq("id", convId);
        if (conversationError) throw conversationError;

        // إرسال إشعار فوري إلى البريد hammoualiyoucef20@gmail.com
        void sendSupportReportEmail({
          type: "inquiry",
          typeLabel: "رسالة دردشة دعم فني",
          description: text,
          profileName: getProfile()?.name || "مستخدم التطبيق",
          appVersion: "1.0.0",
          platform: typeof navigator !== "undefined" ? navigator.userAgent : "Web",
          timestamp: new Date().toLocaleString("ar-SA"),
        });
      } else {
        throw new Error("لم يتم إنشاء محادثة الدعم الفني");
      }
      setConnectionError(null);
    } catch (err) {
      console.debug("Send note:", err);
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      setInput(text);
      setConnectionError("تعذر إرسال الرسالة. تحقق من إعدادات Supabase أو اتصال الإنترنت.");
      toast({ title: "تعذر إرسال الرسالة", description: "حاول مرة أخرى بعد التحقق من الاتصال.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  };

  const isImageBody = (body: string) => body.startsWith("[IMAGE] ");
  const getImageSrc = (body: string) => body.replace("[IMAGE] ", "").trim();

  const chatUI = (
    <div
      className={`flex flex-col h-full bg-card text-card-foreground border-l border-border/50 shadow-2xl relative select-text ${
        isDragging ? "ring-2 ring-accent" : ""
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-card/95 backdrop-blur z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-accent text-accent-foreground flex items-center justify-center shadow-soft">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-card" />
          </div>
          <div>
            <h2 className="font-extrabold text-base text-foreground">الدعم الفني المباشر</h2>
            <p className="text-[11px] text-muted-foreground">تواصل مباشر مع مشرف التطبيق</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void openWhatsAppSupport()}
            className="flex items-center gap-1.5 text-xs bg-[#25D366] hover:bg-[#20bd5a] text-white font-black px-3 py-1.5 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
            title={`تواصل مباشر عبر واتساب (${SUPPORT_WHATSAPP_DISPLAY})`}
          >
            <WhatsAppIcon className="w-4 h-4 text-white" />
            <span className="hidden sm:inline">واتساب {SUPPORT_WHATSAPP_DISPLAY}</span>
            <span className="sm:hidden">واتساب</span>
          </button>
          <a
            href="mailto:hammoualiyoucef20@gmail.com?subject=%D8%AF%D8%B9%D9%85%20%D8%AA%D8%B7%D8%A8%D9%8A%D9%82%20%D8%A7%D9%84%D9%82%D8%B1%D8%A2%D9%86"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 text-[11px] bg-secondary text-secondary-foreground font-bold px-2 py-1.5 rounded-xl hover:bg-muted transition-all"
            title="إرسال رسالة مباشرة عبر البريد الإلكتروني (Gmail)"
          >
            <Mail className="w-3.5 h-3.5" />
          </a>
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:brightness-95 active:scale-95 text-secondary-foreground transition-all cursor-pointer"
              title="إغلاق النافذة"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-30 bg-accent/20 backdrop-blur-sm border-2 border-dashed border-accent flex flex-col items-center justify-center text-accent gap-2">
          <UploadCloud className="w-12 h-12 animate-bounce" />
          <p className="font-bold text-sm">أفلت لقطة الشاشة هنا للإرسال</p>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="mx-4 mt-3 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/25 p-2.5 flex items-center justify-between gap-2 text-right shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#25D366] text-white flex items-center justify-center shrink-0 shadow-sm">
            <WhatsAppIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <b className="text-xs font-bold text-foreground block">تواصل فوري ومباشر عبر واتساب ({SUPPORT_WHATSAPP_DISPLAY})</b>
            <span className="text-[10px] text-muted-foreground">للحصول على استجابة سريعة ومباشرة من المشرف</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void openWhatsAppSupport()}
          className="text-xs font-bold px-2.5 py-1 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-lg active:scale-95 transition-all shrink-0 cursor-pointer shadow-sm"
        >
          مراسلة 💬
        </button>
      </div>

      {connectionError && (
        <div className="mx-4 mt-2 rounded-xl border border-amber-300/60 bg-amber-500/10 p-2.5 text-xs text-foreground space-y-1.5" role="status">
          <p className="text-amber-800 dark:text-amber-300 font-medium">{connectionError}</p>
          <button
            type="button"
            onClick={() => void openWhatsAppSupport()}
            className="flex items-center gap-1.5 text-xs bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold px-2.5 py-1 rounded-lg active:scale-95 transition-all cursor-pointer shadow-sm w-fit"
          >
            <WhatsAppIcon className="w-3.5 h-3.5 text-white" />
            <span>فتح واتساب للدعم المباشر ({SUPPORT_WHATSAPP_DISPLAY})</span>
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-muted/20">
        {loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
            <span className="text-xs">جاري تحميل المحادثة...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-foreground text-base">مرحباً بك في الدعم الفني!</h3>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              اكتب استفسارك أو ملاحظتك وسيرد عليك المشرف في أقرب وقت. يمكنك أيضاً إرفاق صور ولقطات شاشة.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.sender === "user";
            const isImg = isImageBody(m.body);

            return (
              <div key={m.id} className={`flex flex-col ${isUser ? "items-start" : "items-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm transition-all ${
                    isUser
                      ? "bg-accent text-accent-foreground rounded-br-none shadow-accent/15"
                      : "bg-card border border-border/60 text-foreground rounded-bl-none"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[11px] opacity-85 font-bold">
                    <span>{isUser ? "أنت" : "المشرف"}</span>
                  </div>

                  {isImg ? (
                    <div className="mt-1 rounded-xl overflow-hidden cursor-pointer" onClick={() => setSelectedImage(getImageSrc(m.body))}>
                      <img
                        src={getImageSrc(m.body)}
                        alt="مرفق صورة"
                        className="max-h-56 max-w-full rounded-xl object-contain bg-black/20 hover:opacity-95 transition-opacity"
                      />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap select-text">{m.body}</p>
                  )}

                  <div className="flex items-center justify-end gap-1 mt-1 text-[10px] opacity-70">
                    <span>
                      {new Date(m.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {isUser && <CheckCheck className="w-3 h-3 text-current" />}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {adminTyping && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border/40 px-3 py-1.5 rounded-full w-fit animate-pulse">
            <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
            <span>المشرف يكتب الآن...</span>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-3 border-t border-border/40 bg-card/95 backdrop-blur shrink-0">
        <form onSubmit={sendMessage} className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleImageUpload(e.target.files[0]);
              }
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="w-10 h-10 rounded-xl bg-secondary text-secondary-foreground hover:bg-accent/15 hover:text-accent flex items-center justify-center shrink-0 transition-colors active:scale-95 disabled:opacity-50"
            title="إرفاق صورة أو لقطة شاشة"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اكتب رسالتك للمشرف... (Enter للإرسال)"
            rows={1}
            disabled={sending}
            className="flex-1 max-h-28 min-h-[42px] py-2.5 px-3.5 rounded-xl bg-muted/60 border border-border/60 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none leading-relaxed"
          />

          <button
            type="button"
            onClick={() => {
              const text = input.trim();
              const profile = getProfile();
              const msg =
                `السلام عليكم ورحمة الله تعالى وبركاته\n` +
                `أنا أواجه مشكلة في ` + (text ? text : "");
              void openWhatsAppSupport(msg);
            }}
            className="w-10 h-10 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white flex items-center justify-center shrink-0 transition-all active:scale-95 cursor-pointer shadow-sm"
            title={`إرسال المحادثة إلى واتساب (${SUPPORT_WHATSAPP_DISPLAY})`}
          >
            <WhatsAppIcon className="w-5 h-5 text-white" />
          </button>

          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-xl bg-accent text-accent-foreground flex items-center justify-center shrink-0 transition-all hover:brightness-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none shadow-soft"
            title="إرسال الرسالة"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 rtl:rotate-180" />}
          </button>
        </form>
      </div>

      {/* Fullscreen Image Lightbox Modal */}
      {selectedImage && (
        <ModalLayer>
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-3xl max-h-[85vh]">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 left-0 bg-white/20 hover:bg-white/40 text-white rounded-full p-1.5 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img src={selectedImage} alt="عرض الصورة المكبرة" className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl" />
          </div>
        </div>
        </ModalLayer>
      )}
    </div>
  );

  if (pageMode) {
    return <div className="h-full w-full">{chatUI}</div>;
  }

  return (
    <ModalLayer>
    <div className="fixed inset-0 z-[150] flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" dir="rtl">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg md:max-w-md h-full shadow-2xl animate-in slide-in-from-right duration-300 z-10">
        {chatUI}
      </div>
    </div>
    </ModalLayer>
  );
}
