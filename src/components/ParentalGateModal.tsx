import { useState } from "react";
import ModalLayer from "./ui/ModalLayer";
import { Lock, KeyRound, AlertCircle, X, ShieldCheck, HelpCircle, Check } from "lucide-react";
import {
  verifyKidsPin,
  hasCustomKidsPin,
  setKidsPin,
  getSecurityQuestion,
  setSecurityQuestion,
  verifySecurityAnswer,
  DEFAULT_SECURITY_QUESTIONS,
} from "@/data/kidsLock";

interface Props {
  title?: string;
  /** عند true: لا يمكن إغلاق النافذة بدون كلمة المرور — بدون زر ❌ */
  strictMode?: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ParentalGateModal({
  title = "منطقة الوالدين (حماية وضع الأطفال)",
  strictMode = false,
  onSuccess,
  onCancel,
}: Props) {
  const hasCustom = hasCustomKidsPin();
  const [mode, setMode] = useState<"pin" | "recovery" | "setup_pin">(
    hasCustom ? "pin" : "setup_pin"
  );
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [setupStep, setSetupStep] = useState<"enter" | "confirm" | "security">("enter");
  const [selectedQuestion, setSelectedQuestion] = useState(DEFAULT_SECURITY_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [recoveryAnswerInput, setRecoveryAnswerInput] = useState("");
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleKeyClick = (val: string) => {
    setError(false);
    setErrorMsg("");

    if (mode === "setup_pin") {
      if (setupStep === "enter") {
        if (val === "back") {
          setPin((p) => p.slice(0, -1));
          return;
        }
        if (pin.length < 4) {
          const next = pin + val;
          setPin(next);
          if (next.length === 4) {
            setTimeout(() => {
              setSetupStep("confirm");
            }, 150);
          }
        }
      } else if (setupStep === "confirm") {
        if (val === "back") {
          setConfirmPin((p) => p.slice(0, -1));
          return;
        }
        if (confirmPin.length < 4) {
          const next = confirmPin + val;
          setConfirmPin(next);
          if (next.length === 4) {
            if (next === pin) {
              setTimeout(() => {
                setSetupStep("security");
              }, 150);
            } else {
              setError(true);
              setErrorMsg("الرمزان غير متطابقين، حاول مجدداً");
              setConfirmPin("");
              setSetupStep("enter");
              setPin("");
            }
          }
        }
      }
      return;
    }

    // Verify mode
    if (val === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length < 4) {
      const next = pin + val;
      setPin(next);
      if (next.length === 4) {
        if (verifyKidsPin(next)) {
          onSuccess();
        } else {
          setError(true);
          setErrorMsg("كلمة المرور غير صحيحة، حاول مرة أخرى");
          setTimeout(() => {
            setPin("");
          }, 350);
        }
      }
    }
  };

  const handleManualSubmit = () => {
    if (verifyKidsPin(pin)) {
      onSuccess();
    } else {
      setError(true);
      setErrorMsg("كلمة المرور غير صحيحة، حاول مرة أخرى");
      setPin("");
    }
  };

  const handleSaveSetup = () => {
    const finalQuestion = customQuestion.trim() || selectedQuestion;
    const finalAnswer = securityAnswer.trim();
    if (!finalAnswer) {
      setError(true);
      setErrorMsg("يرجى إدخال إجابة سرية لسؤال الأمان الاحتياطي");
      return;
    }
    setKidsPin(pin);
    setSecurityQuestion(finalQuestion, finalAnswer);
    onSuccess();
  };

  const handleRecoverySubmit = () => {
    if (!recoveryAnswerInput.trim()) {
      setError(true);
      setErrorMsg("يرجى إدخال الإجابة");
      return;
    }
    if (verifySecurityAnswer(recoveryAnswerInput)) {
      onSuccess();
    } else {
      setError(true);
      setErrorMsg("إجابة سؤال الأمان غير صحيحة، حاول مجدداً");
    }
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

  // Portal إلى body حتى لا يُحصر position:fixed داخل أي إطار مُحوَّل (transform)
  return (
    <ModalLayer>
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center overflow-x-hidden bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="relative w-[min(24rem,calc(100vw-1.5rem))] max-w-full max-h-[92dvh] overflow-y-auto overflow-x-hidden rounded-[28px] bg-card border border-accent/25 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.6)] p-5 sm:p-6 pb-safe text-center space-y-4 animate-in zoom-in-95 duration-200">
        {/* هالة زخرفية علوية خفيفة تعطي الشاشة عمقاً بصرياً */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 -top-16 h-32 rounded-full bg-accent/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-accent/60 to-transparent"
        />
        {/* زر الإغلاق مخفي في الوضع الصارم — لا مخرج بدون كلمة المرور أو سؤال الأمان */}
        {!strictMode && (
          <button
            onClick={onCancel}
            className="absolute top-4 left-4 p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="relative mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/25 to-accent/5 text-accent flex items-center justify-center ring-1 ring-accent/40 shadow-lg shadow-accent/10">
          {mode === "setup_pin" ? (
            <ShieldCheck className="w-7 h-7" />
          ) : mode === "pin" ? (
            <Lock className="w-7 h-7" />
          ) : (
            <HelpCircle className="w-7 h-7" />
          )}
        </div>

        <div>
          <h3 className="font-extrabold text-lg text-foreground">
            {mode === "setup_pin"
              ? setupStep === "security"
                ? "سؤال الأمان الاحتياطي"
                : "إعداد رمز حماية وضع الأطفال"
              : mode === "pin"
              ? title
              : "استعادة الوصول عبر سؤال الأمان"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {mode === "setup_pin"
              ? setupStep === "enter"
                ? "اختر رمز مرور مخصصاً من 4 أرقام لحماية وضع الأطفال"
                : setupStep === "confirm"
                ? "أعد إدخال الرمز للتأكيد"
                : "حدد سؤال أمان وإجابة سرية لاسترداد الرمز عند نسيانه"
              : mode === "pin"
              ? strictMode
                ? "أدخل رمز الوالدين للخروج من التطبيق"
                : "أدخل رمز الوالدين للخروج من ركن الأطفال أو الدخول للإعدادات"
              : "أجب عن سؤال الأمان الذي حددته مسبقاً للتحقق من أنك ولي الأمر"}
          </p>
        </div>

        {/* ===== نمط إعداد الرمز وسؤال الأمان لأول مرة ===== */}
        {mode === "setup_pin" && setupStep !== "security" && (
          <div className="space-y-4">
            <div key={`setup-${error ? errorMsg : "ok"}-${setupStep}-${pin}-${confirmPin}`} className={`flex justify-center items-center gap-3 py-2 ${error ? "animate-shake" : ""}`} dir="ltr">
              {[0, 1, 2, 3].map((i) => {
                const currentVal = setupStep === "enter" ? pin : confirmPin;
                return (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full transition-all duration-200 ${
                      currentVal.length > i
                        ? "bg-accent scale-110 shadow-md shadow-accent/40"
                        : "bg-muted border border-border"
                    }`}
                  />
                );
              })}
            </div>

            {error && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-destructive font-bold animate-bounce">
                <AlertCircle className="w-4 h-4" />
                <span>{errorMsg || "رمز المرور غير مطابق"}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1">
              {keys.map((k, i) =>
                k === "" ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    onClick={() => handleKeyClick(k)}
                    className="h-14 rounded-2xl bg-secondary/80 hover:bg-secondary text-foreground text-xl font-extrabold flex items-center justify-center ring-1 ring-border/50 active:scale-95 active:bg-accent/15 transition-all select-none shadow-sm"
                  >
                    {k === "back" ? "⌫" : k}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* ===== خطوة تحديد سؤال الأمان الاحتياطي في الإعداد ===== */}
        {mode === "setup_pin" && setupStep === "security" && (
          <div className="space-y-3 text-right animate-fade-up">
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">اختر سؤال الأمان:</label>
              <select
                value={selectedQuestion}
                onChange={(e) => setSelectedQuestion(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl bg-muted border border-border text-foreground focus:border-accent outline-none"
              >
                {DEFAULT_SECURITY_QUESTIONS.map((q, i) => (
                  <option key={i} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">الإجابة السرية الاحتياطية:</label>
              <input
                type="text"
                value={securityAnswer}
                onChange={(e) => {
                  setSecurityAnswer(e.target.value);
                  setError(false);
                }}
                placeholder="اكتب إجابتك السرية هنا..."
                className="w-full text-sm p-3 rounded-xl bg-muted border border-border text-foreground placeholder-muted-foreground focus:border-accent outline-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-destructive font-bold">
                <AlertCircle className="w-4 h-4" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              onClick={handleSaveSetup}
              className="btn-gold w-full p-3 rounded-xl font-bold flex items-center justify-center gap-2 mt-2 shadow-md active:scale-95"
            >
              <Check className="w-5 h-5" /> حفظ وتفعيل الحماية
            </button>
          </div>
        )}

        {/* ===== نمط التحقق برمز الـ PIN ===== */}
        {mode === "pin" && (
          <div className="space-y-4">
            <div key={`mask-${error ? errorMsg : "ok"}-${pin}`} className={`flex justify-center items-center gap-3 py-2 ${error ? "animate-shake" : ""}`} dir="ltr">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full transition-all duration-200 ${
                    pin.length > i
                      ? "bg-accent scale-110 shadow-md shadow-accent/40"
                      : "bg-muted border border-border"
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-destructive font-bold animate-bounce">
                <AlertCircle className="w-4 h-4" />
                <span>{errorMsg || "رمز المرور غير صحيح، حاول مرة أخرى"}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1">
              {keys.map((k, i) =>
                k === "" ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    onClick={() => handleKeyClick(k)}
                    className="h-14 rounded-2xl bg-secondary/80 hover:bg-secondary text-foreground text-xl font-extrabold flex items-center justify-center ring-1 ring-border/50 active:scale-95 active:bg-accent/15 transition-all select-none shadow-sm"
                  >
                    {k === "back" ? "⌫" : k}
                  </button>
                )
              )}
            </div>

            <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  setError(false);
                  setErrorMsg("");
                  setRecoveryAnswerInput("");
                  setMode("recovery");
                }}
                className="text-accent hover:underline flex items-center gap-1 font-bold"
              >
                <HelpCircle className="w-4 h-4" />
                <span>نسيت الرمز؟ سؤال الأمان</span>
              </button>

              <button
                onClick={handleManualSubmit}
                disabled={pin.length < 4}
                className="text-accent font-bold disabled:opacity-40"
              >
                تأكيد
              </button>
            </div>
          </div>
        )}

        {/* ===== نمط الاسترداد عبر سؤال الأمان الاحتياطي (بدون أي عملية حسابية) ===== */}
        {mode === "recovery" && (
          <div className="space-y-4 text-right animate-fade-up">
            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border space-y-1">
              <span className="text-[11px] font-bold text-accent block">سؤال الأمان الاحتياطي:</span>
              <p className="text-sm font-bold text-foreground leading-relaxed">
                {getSecurityQuestion()}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">أدخل الإجابة السرية:</label>
              <input
                type="text"
                value={recoveryAnswerInput}
                onChange={(e) => {
                  setRecoveryAnswerInput(e.target.value);
                  setError(false);
                }}
                placeholder="اكتب إجابتك هنا..."
                className="w-full text-sm p-3 rounded-xl bg-muted border border-border text-foreground placeholder-muted-foreground focus:border-accent outline-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-destructive font-bold animate-bounce">
                <AlertCircle className="w-4 h-4" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setError(false);
                  setErrorMsg("");
                  setPin("");
                  setMode("pin");
                }}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-xs font-bold flex items-center justify-center gap-1"
              >
                <KeyRound className="w-4 h-4" />
                <span>العودة للرمز</span>
              </button>
              <button
                type="button"
                onClick={handleRecoverySubmit}
                className="btn-gold flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" />
                <span>تأكيد الإجابة</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </ModalLayer>
  );
}
