import { useState } from "react";
import { Lock, Delete, ShieldCheck, Check } from "lucide-react";
import ModalLayer from "./ui/ModalLayer";
import { getKidsPin, setKidsPin, setSecurityQuestion, DEFAULT_SECURITY_QUESTIONS } from "../data/kidsLock";

/** لوحة رمز رقمية (٤ أرقام). mode="set" لتعيين الرمز مع سؤال الأمان، "verify" للتحقق. */
export default function PinModal({ mode, title, onSuccess, onCancel }: {
  mode: "set" | "verify";
  title?: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"pin" | "security">("pin");
  const [pin, setPin] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState(DEFAULT_SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [err, setErr] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const press = (d: string) => {
    if (pin.length >= 4) return;
    const np = pin + d;
    setPin(np);
    setErr(false);
    if (np.length === 4) {
      window.setTimeout(() => {
        if (mode === "set") {
          setStep("security");
        } else if (np === getKidsPin()) {
          onSuccess();
        } else {
          setErr(true);
          setPin("");
        }
      }, 120);
    }
  };

  const handleSaveSecurity = () => {
    if (!securityAnswer.trim()) {
      setErr(true);
      setErrMsg("يرجى إدخال الإجابة السرية الاحتياطية");
      return;
    }
    setKidsPin(pin);
    setSecurityQuestion(selectedQuestion, securityAnswer.trim());
    onSuccess();
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

  return (
    <ModalLayer>
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto overscroll-contain bg-background/70 backdrop-blur-sm p-4 sm:items-center animate-fade-in" dir="rtl">
      <div className="relative my-auto w-full max-w-xs max-h-[calc(100dvh-2rem)] overflow-y-auto glass-nour shadow-soft p-6 pb-safe space-y-4 text-center custom-scrollbar animate-scale-up">
        {/* وهج ذهبي زخرفي خلف البطاقة */}
        <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative mx-auto w-14 h-14 rounded-full bg-accent/15 text-accent flex items-center justify-center ring-1 ring-accent/30 animate-glow">
          {step === "security" ? <ShieldCheck className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
        </div>

        <h3 className="relative font-extrabold text-lg text-gradient-gold">
          {step === "security"
            ? "سؤال الأمان الاحتياطي"
            : title || (mode === "set" ? "اختر رمزاً من ٤ أرقام" : "أدخل رمز ولي الأمر")}
        </h3>

        {step === "pin" ? (
          <>
            <div className={`relative flex justify-center gap-3 ${err ? "animate-pulse" : ""}`}>
              {[0, 1, 2, 3].map(i => (
                <span
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                    err ? "bg-destructive scale-110" : i < pin.length ? "bg-accent scale-110 shadow-[0_0_10px_hsl(var(--gold)/0.6)]" : "bg-muted"
                  }`}
                />
              ))}
            </div>

            {err && <p className="relative text-xs text-destructive font-medium">رمز خاطئ، حاول مجدداً</p>}

            <div className="relative grid grid-cols-3 gap-2.5">
              {keys.map((k, i) => k === "" ? <span key={i} /> : (
                <button
                  key={i}
                  onClick={() => (k === "back" ? setPin(p => p.slice(0, -1)) : press(k))}
                  className="h-14 rounded-2xl bg-secondary border border-border text-secondary-foreground text-xl font-bold flex items-center justify-center transition-all active:scale-95 hover:border-accent/50 hover:text-accent"
                >
                  {k === "back" ? <Delete className="w-5 h-5" /> : k}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="relative space-y-3 text-right animate-fade-up">
            <p className="text-xs text-muted-foreground text-center">
              حدد سؤال أمان لاستعادة الرمز في حال نسيانه
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">سؤال الأمان:</label>
              <select
                value={selectedQuestion}
                onChange={(e) => setSelectedQuestion(e.target.value)}
                className="w-full text-xs p-2 rounded-xl bg-muted border border-border text-foreground focus:border-accent outline-none"
              >
                {DEFAULT_SECURITY_QUESTIONS.map((q, i) => (
                  <option key={i} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">الإجابة السرية:</label>
              <input
                type="text"
                value={securityAnswer}
                onChange={(e) => {
                  setSecurityAnswer(e.target.value);
                  setErr(false);
                }}
                placeholder="اكتب الإجابة هنا..."
                className="w-full text-xs p-2.5 rounded-xl bg-muted border border-border text-foreground placeholder-muted-foreground focus:border-accent outline-none"
              />
            </div>

            {err && <p className="text-xs text-destructive font-medium">{errMsg}</p>}

            <button
              onClick={handleSaveSecurity}
              className="btn-gold w-full p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"
            >
              <Check className="w-4 h-4" /> حفظ الرمز والأمان
            </button>
          </div>
        )}

        <button
          onClick={onCancel}
          className="relative w-full p-2.5 rounded-2xl bg-secondary border border-border text-muted-foreground font-bold transition-all hover:brightness-95"
        >
          إلغاء
        </button>
      </div>
    </div>
    </ModalLayer>
  );
}
