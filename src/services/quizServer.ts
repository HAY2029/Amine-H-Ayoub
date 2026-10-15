export interface ServerQuestion {
  id: string;
  type: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correct_answer: string;
}

const LOCAL_STORAGE_POOL_KEY = "mushaf:quiz_pool_v1";
const LOCAL_STORAGE_ANSWERED_KEY = "mushaf:quiz_answered_v1";

// ⚠️ عندما ترفع السيرفر على HuggingFace قم بتبديل هذا الرابط برابط الـ Space الخاص بك
const HUGGINGFACE_API_URL = "https://your-username-your-spacename.hf.space/api/questions";

const FALLBACK_QUESTIONS: ServerQuestion[] = [
  { id: "f1", type: "multiple_choice", question: "كم عدد سور القرآن الكريم؟", options: ["114 سورة", "110 سورة", "120 سورة", "100 سورة"], correct_answer: "114 سورة" },
  { id: "f2", type: "multiple_choice", question: "ما هي أطول سورة في القرآن الكريم؟", options: ["سورة البقرة", "سورة آل عمران", "سورة النساء", "سورة الأعراف"], correct_answer: "سورة البقرة" },
  { id: "f3", type: "multiple_choice", question: "ما هي السورة التي لا تبدأ ببسم الله الرحمن الرحيم؟", options: ["سورة التوبة", "سورة النمل", "سورة الأنفال", "سورة محمد"], correct_answer: "سورة التوبة" },
  { id: "f4", type: "multiple_choice", question: "ما هي السورة التي تسمى قلب القرآن؟", options: ["سورة يس", "سورة الرحمن", "سورة الملك", "سورة الكهف"], correct_answer: "سورة يس" },
  { id: "f5", type: "multiple_choice", question: "ما هي السورة التي تعادل قراءتها ثلث القرآن؟", options: ["سورة الإخلاص", "سورة الفلق", "سورة الناس", "سورة الكافرون"], correct_answer: "سورة الإخلاص" },
  { id: "f6", type: "multiple_choice", question: "في أي سورة ذُكرت البسملة مرتين؟", options: ["سورة النمل", "سورة التوبة", "سورة النحل", "سورة القصص"], correct_answer: "سورة النمل" },
  { id: "f7", type: "multiple_choice", question: "كم عدد أجزاء القرآن الكريم؟", options: ["30 جزءاً", "60 جزءاً", "20 جزءاً", "114 جزءاً"], correct_answer: "30 جزءاً" },
  { id: "f8", type: "multiple_choice", question: "ما هي أعظم آية في القرآن الكريم؟", options: ["آية الكرسي", "أواخر سورة البقرة", "أول سورة الكهف", "سورة الفاتحة"], correct_answer: "آية الكرسي" }
];

// استرجاع الأسئلة المجابة من التخزين المحلي
export function getAnsweredQuestions(): string[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_ANSWERED_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// إضافة سؤال إلى قائمة المجاب عليها
export function markQuestionAsAnswered(id: string) {
  try {
    const answered = getAnsweredQuestions();
    if (!answered.includes(id)) {
      answered.push(id);
      localStorage.setItem(LOCAL_STORAGE_ANSWERED_KEY, JSON.stringify(answered));
    }
  } catch (e) {
    console.error("Failed to mark question as answered", e);
  }
}

// مسح قائمة الأسئلة المجابة للبدء من جديد
export function clearAnsweredQuestions() {
  localStorage.removeItem(LOCAL_STORAGE_ANSWERED_KEY);
}

// الحصول على أسئلة المخزن المحلي الحالية
export function getLocalQuizPool(): ServerQuestion[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_POOL_KEY);
    const parsed = data ? JSON.parse(data) : [];
    return parsed.length > 0 ? parsed : FALLBACK_QUESTIONS;
  } catch {
    return FALLBACK_QUESTIONS;
  }
}


// جلب وتحديث الأسئلة من السيرفر في الخلفية
export async function syncQuestionsFromServer() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.log("No internet connection. Using cached quiz pool.");
    const local = getLocalQuizPool();
    return local.length > 0 ? local : FALLBACK_QUESTIONS;
  }

  try {
    const answered = getAnsweredQuestions();
    const excludeParam = answered.length > 0 ? `?exclude=${answered.join(",")}` : "";
    
    // Check if placeholder URL is still in use to prevent 404 errors
    if (HUGGINGFACE_API_URL.includes("your-username-your-spacename")) {
      const local = getLocalQuizPool();
      return local.length > 0 ? local : FALLBACK_QUESTIONS;
    }

    // جلب الأسئلة مع تجنب الكاش المؤقت لضمان أحدث نسخة
    const response = await fetch(`${HUGGINGFACE_API_URL}${excludeParam}`, {
      cache: "no-store",
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    const questions: ServerQuestion[] = data.questions || [];
    const remaining: number = data.remaining || 0;

    // إذا نفدت جميع الأسئلة في السيرفر، نمسح الكاش ونبدأ من جديد
    if (questions.length === 0 && remaining === 0 && answered.length > 0) {
      console.log("All questions answered! Resetting answered list...");
      clearAnsweredQuestions();
      // نحاول مرة أخرى بعد تصفير القائمة
      return syncQuestionsFromServer();
    }

    if (questions.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_POOL_KEY, JSON.stringify(questions));
      return questions;
    }

    const local = getLocalQuizPool();
    return local.length > 0 ? local : FALLBACK_QUESTIONS;
  } catch (error) {
    console.error("Failed to sync quiz from HuggingFace server:", error);
    // العودة لاستخدام المسبح المحلي إذا فشل الاتصال بالسيرفر
    const local = getLocalQuizPool();
    return local.length > 0 ? local : FALLBACK_QUESTIONS;
  }
}

