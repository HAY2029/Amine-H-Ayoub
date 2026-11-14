/**
 * قفل ركن الأطفال — أمان صارم يعتمد على رمز مرور الوالدين الإلزامي (Mandatory PIN).
 * لا يمكن تفعيل وضع الأطفال إطلاقاً ما لم يقم ولي الأمر بتعيين رمز مرور مخصص غير افتراضي.
 */
const PIN_KEY = "mushaf:kidsPin";
const MODE_KEY = "mushaf:kidsMode";
const APP_MODE_KEY = "mushaf:appMode:v1";
const QUESTION_KEY = "mushaf:kidsSecurityQuestion";
const ANSWER_KEY = "mushaf:kidsSecurityAnswer";

export const DEFAULT_SECURITY_QUESTIONS = [
  "ما هو اسم مدينتك المفضلة أو مسقط رأسك؟",
  "ما هو اسم أول معلم أو مدرسة لك؟",
  "ما هو اسم جدك أو لقب العائلة؟",
  "ما هي كلمتك أو سنتك السرية المفضلة؟",
];

export const getSecurityQuestion = (): string => {
  try {
    return localStorage.getItem(QUESTION_KEY) || DEFAULT_SECURITY_QUESTIONS[0];
  } catch {
    return DEFAULT_SECURITY_QUESTIONS[0];
  }
};

export const setSecurityQuestion = (question: string, answer: string) => {
  try {
    localStorage.setItem(QUESTION_KEY, question.trim());
    localStorage.setItem(ANSWER_KEY, answer.trim().toLowerCase());
  } catch {
    /* ignore */
  }
};

export const hasSecurityQuestion = (): boolean => {
  try {
    const ans = localStorage.getItem(ANSWER_KEY);
    return !!ans && ans.length > 0;
  } catch {
    return false;
  }
};

export const verifySecurityAnswer = (inputAnswer: string): boolean => {
  try {
    const stored = localStorage.getItem(ANSWER_KEY);
    if (!stored) return false;
    return inputAnswer.trim().toLowerCase() === stored.trim().toLowerCase();
  } catch {
    return false;
  }
};

export const removeSecurityQuestion = () => {
  try {
    localStorage.removeItem(QUESTION_KEY);
    localStorage.removeItem(ANSWER_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * استرجاع رمز ولي الأمر المخصص.
 * يعود بـ null إذا لم يتم تعيين رمز مخصص مسبقاً (تم إلغاء الرمز الافتراضي تماماً).
 */
export const getKidsPin = (): string | null => {
  try {
    const pin = localStorage.getItem(PIN_KEY);
    return pin && pin.length >= 4 ? pin : null;
  } catch {
    return null;
  }
};

export const setKidsPin = (p: string) => {
  try {
    if (p && p.length >= 4) {
      localStorage.setItem(PIN_KEY, p);
    }
  } catch {
    /* ignore */
  }
};

export const removeKidsPin = () => {
  try {
    localStorage.removeItem(PIN_KEY);
    removeSecurityQuestion();
    // إلغاء وضع الأطفال أيضاً عند إزالة الرمز
    setKidsLocked(false);
  } catch {
    /* ignore */
  }
};

/**
 * التحقق من وجود رمز مخصص تم تعيينه من قبل الوالدين.
 */
export const hasCustomKidsPin = (): boolean => {
  return getKidsPin() !== null;
};

export const hasKidsPin = hasCustomKidsPin;

/**
 * التحقق من صحة الرمز المدخل مقارنة برمز الوالدين.
 */
export const verifyKidsPin = (inputPin: string): boolean => {
  const currentPin = getKidsPin();
  if (!currentPin) return false;
  return inputPin.trim() === currentPin;
};

export const isKidsMode = (): boolean => {
  try {
    return localStorage.getItem(MODE_KEY) === "1";
  } catch {
    return false;
  }
};

// ── جلسة وليّ الأمر داخل وضع الأطفال ──
// بعد إدخال الرمز تُفتح صفحات الوالدين (الإعدادات، لوحة وليّ الأمر، أدوات المعلّم)
// لمدة محدودة ثم تُقفل تلقائياً، بدل أن تكون هذه الصفحات متاحة للأطفال من الأساس.
const PARENT_SESSION_KEY = "mushaf:parentSessionUntil";
const PARENT_SESSION_MINUTES = 10;

/** فتح جلسة وليّ الأمر (افتراضياً ١٠ دقائق) بعد نجاح التحقق من الرمز */
export const unlockParentSession = (minutes: number = PARENT_SESSION_MINUTES): void => {
  try {
    sessionStorage.setItem(PARENT_SESSION_KEY, String(Date.now() + Math.max(1, minutes) * 60_000));
  } catch {
    /* ignore */
  }
};

/** هل جلسة وليّ الأمر ما زالت سارية؟ */
export const isParentSessionUnlocked = (): boolean => {
  try {
    const until = Number(sessionStorage.getItem(PARENT_SESSION_KEY) || 0);
    if (!until || Date.now() >= until) {
      if (until) sessionStorage.removeItem(PARENT_SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

/** إغلاق جلسة وليّ الأمر فوراً (عند الرجوع لركن الأطفال) */
export const lockParentSession = (): void => {
  try {
    sessionStorage.removeItem(PARENT_SESSION_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * محاولة تفعيل أو تعطيل وضع الأطفال.
 * يمنع التفعيل تماماً إذا لم يكن هناك رمز PIN مخصص.
 */
export const setKidsLocked = (on: boolean): boolean => {
  if (on && !hasKidsPin()) {
    console.warn("Blocking Kids Mode activation: No parent PIN has been configured!");
    return false;
  }

  try {
    localStorage.setItem(MODE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  // تفعيل الوضع: مهلة قصيرة جداً تكفي وليّ الأمر لتسليم الجهاز ثم تُقفل صفحات الوالدين.
  // تعطيل الوضع (رجوع وليّ الأمر): تُغلق الجلسة لأن الوضع الشامل لا يحتاجها.
  if (on) unlockParentSession(1);
  else lockParentSession();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("mushaf:kidsmode"));
  }
  return true;
};

/**
 * فحص دعم بصمة الجهاز أو قفل الشاشة
 */
export async function isDeviceAuthAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * طلب فتح القفل عبر مصادقة الجهاز / البصمة
 */
export async function requestDeviceUnlock(): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.credentials) return false;
  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: "preferred",
        rpId: window.location.hostname || "localhost",
        allowCredentials: [],
      },
    });
    return !!credential;
  } catch (e) {
    console.log("Device credential verification fallback:", e);
    return false;
  }
}
