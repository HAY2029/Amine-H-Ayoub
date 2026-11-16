/**
 * أعلام خفيفة للتهيئة واختيار الملف — في وحدة مستقلة صغيرة كي لا يضطر التطبيق
 * إلى تحميل شاشتي الترحيب واختيار الطفل (أكثر من ألف سطر) في الحزمة الأولى.
 */

const ONBOARD_KEY = "mushaf:onboarded:v1";
const PICKED_FLAG = "mushaf:pickedSession";

export const isOnboarded = (): boolean => {
  try {
    return localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    return true;
  }
};

export const markOnboarded = (): void => {
  try {
    localStorage.setItem(ONBOARD_KEY, "1");
  } catch {
    /* ignore */
  }
};

/** يُعلِّم أنّ ملفّاً اختير في هذه الجلسة (حتى لا تتكرّر شاشة الاختيار). */
export const markPicked = (): void => {
  try {
    sessionStorage.setItem(PICKED_FLAG, "1");
  } catch {
    /* ignore */
  }
};

export const isPicked = (): boolean => {
  try {
    return sessionStorage.getItem(PICKED_FLAG) === "1";
  } catch {
    return true;
  }
};
