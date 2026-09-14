/**
 * محرك تحليل التلاوة — يقارن قراءة الطفل بالنص القرآني كلمة بكلمة
 * ويصنّف الأخطاء: ناقصة/خاطئة/زائدة/نطق غير دقيق + نصيحة تجويدية لكل خطأ
 */
import { normalizeArabic } from "../data/quranText";

export interface TajweedIssue {
  wordIndex: number;
  word: string;
  spoken?: string;
  type: "missing" | "wrong" | "extra" | "pronunciation";
  rule?: string;
  message: string;
  tip: string;
}

export interface AyahAnalysis {
  score: number; // 0..100
  issues: TajweedIssue[];
  correct: number; // مطابقة تامة
  soft: number;    // نطق غير دقيق (قريب من الصواب)
  total: number;
}

/** مسافة تحرير بين كلمتين (حرف-بحرف بعد التطبيع) */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;
  const dp = new Array(m + 1);
  for (let j = 0; j <= m; j++) dp[j] = j;
  for (let i = 1; i <= n; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

/** هل الكلمة المنطوقة قريبة من المتوقعة (نطق غير دقيق وليست كلمة أخرى)؟ */
function isNear(expected: string, spoken: string): boolean {
  const d = editDistance(expected, spoken);
  const tol = Math.max(1, Math.floor(expected.length / 3));
  return d > 0 && d <= tol;
}

type Op = { t: "match" | "near" | "sub" | "del" | "ins"; ei: number; gi: number };

/** محاذاة كلمات المتحدث مع المتوقع عبر برمجة ديناميكية (أدق من البحث الأمامي) */
function alignWords(exp: string[], got: string[]): Op[] {
  const n = exp.length, m = got.length;
  const INF = 1e9;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const bt: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  dp[0][0] = 0;
  for (let i = 1; i <= n; i++) { dp[i][0] = i; bt[i][0] = 0; } // 0=حذف (فوت كلمة)
  for (let j = 1; j <= m; j++) { dp[0][j] = j; bt[0][j] = 1; } // 1=إضافة (زيادة)
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = exp[i - 1] === got[j - 1] ? 0 : isNear(exp[i - 1], got[j - 1]) ? 1 : 2;
      let best = dp[i - 1][j - 1] + sub, dir = 2; // 2=قطري (مطابقة/بديل)
      if (dp[i - 1][j] + 1 < best) { best = dp[i - 1][j] + 1; dir = 0; }
      if (dp[i][j - 1] + 1 < best) { best = dp[i][j - 1] + 1; dir = 1; }
      dp[i][j] = best; bt[i][j] = dir;
    }
  }
  const ops: Op[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && bt[i][j] === 2) {
      const sub = exp[i - 1] === got[j - 1] ? 0 : isNear(exp[i - 1], got[j - 1]) ? 1 : 2;
      ops.push({ t: sub === 0 ? "match" : sub === 1 ? "near" : "sub", ei: i - 1, gi: j - 1 });
      i--; j--;
    } else if (i > 0 && (j === 0 || bt[i][j] === 0)) {
      ops.push({ t: "del", ei: i - 1, gi: -1 });
      i--;
    } else {
      ops.push({ t: "ins", ei: -1, gi: j - 1 });
      j--;
    }
  }
  ops.reverse();
  return ops;
}

/** ملامح تجويدية من الكلمة المشكولة لتحديد النصيحة الأنسب */
function tajweedHint(word: string): { rule: string; tip: string } | null {
  if (/نّ|مّ/.test(word)) return { rule: "ghunnah", tip: "الغنة: رخّم الصوت من الأنف عند النون/الميم المشددة 🐝" };
  if (/[قطبجد][\u0652]/.test(word)) return { rule: "qalqalah", tip: "القلقلة: اضرب الحرف الساكن (ق ط ب ج د) بارتجاج واضح 💥" };
  if (/[اوى][\u064E\u064F\u0650]/.test(word)) return { rule: "madd", tip: "المد: مدّ صوت حرف المد (ا/و/ي) حركتين على الأقل 🌊" };
  if (/[\u0651]/.test(word)) return { rule: "tashdid", tip: "التشديد: شدّ الحرف وكرّره كحرفين مدموجين 🔁" };
  if (/[خصضطظغق]/.test(word)) return { rule: "tafkheem", tip: "التفخيم: أثقِل الحروف القاطعة (خ ص ض ط ظ غ ق) من عمق الفم 🎯" };
  if (/[ءأإؤئ]/.test(word)) return { rule: "hamz", tip: "الهمزة: انطقها بوضوح من أقصى الحلق دون تحويلها 🗣️" };
  return null;
}

/** أول اختلاف حرفي بين الكلمتين — لوصف خطأ النطق */
function diffLetters(expected: string, spoken: string): string {
  const a = expected.split(""), b = spoken.split("");
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) return `${a[i]} ← ${b[i]}`;
  return a.length !== b.length ? `ناقص ${a[len] ?? ""}` : "طفيف";
}

/** تحليل مقطع التلاوة: محاذاة دقيقة + تصنيف النطق غير الدقيق */
export function analyzeAyah(expected: string, spoken: string): AyahAnalysis {
  const rawExp = expected.trim().split(/\s+/).filter(Boolean);
  const exp = rawExp.map(normalizeArabic);
  const got = normalizeArabic(spoken).trim().split(/\s+/).filter(Boolean);
  const issues: TajweedIssue[] = [];
  const ops = alignWords(exp, got);
  let correct = 0, soft = 0;

  for (const op of ops) {
    if (op.t === "match") { correct++; continue; }
    if (op.t === "near") {
      soft++;
      const w = rawExp[op.ei];
      const hint = tajweedHint(w);
      issues.push({
        wordIndex: op.ei, word: w, spoken: got[op.gi], type: "pronunciation",
        rule: hint?.rule,
        message: `نطقت «${got[op.gi]}» والصواب «${w}»`,
        tip: hint ? hint.tip : `ركّز على المخارج — الفرق: ${diffLetters(exp[op.ei], got[op.gi])}`,
      });
      continue;
    }
    if (op.t === "sub") {
      const w = rawExp[op.ei];
      const hint = tajweedHint(w);
      issues.push({
        wordIndex: op.ei, word: w, spoken: got[op.gi], type: "wrong",
        rule: hint?.rule,
        message: `قيل «${got[op.gi]}» والصواب «${w}»`,
        tip: hint ? hint.tip : "أعد قراءة الكلمة بتمهّل",
      });
      continue;
    }
    if (op.t === "del") {
      const w = rawExp[op.ei];
      const hint = tajweedHint(w);
      issues.push({
        wordIndex: op.ei, word: w, type: "missing", rule: hint?.rule,
        message: `فُاتت كلمة «${w}»`,
        tip: hint ? hint.tip : "اقرأ السطر مجدداً بلا استعجال",
      });
    } else {
      issues.push({
        wordIndex: op.ei, word: got[op.gi], type: "extra",
        message: `كلمة زائدة: «${got[op.gi]}»`,
        tip: "لا تُضِف كلمات — اقرأ كما هي",
      });
    }
  }

  const total = exp.length;
  const score = total === 0 ? 0 : Math.max(0, Math.min(100, Math.round(((correct + soft * 0.5) / total) * 100)));
  return { score, issues, correct, soft, total };
}

/** نصيب تشجيعي حسب الدرجة */
export function feedbackFor(score: number): { title: string; emoji: string } {
  if (score >= 95) return { title: "ما شاء الله! تلاوة متقنة", emoji: "🏆" };
  if (score >= 80) return { title: "رائع جداً! قريب من الإتقان", emoji: "🌟" };
  if (score >= 60) return { title: "جيد! واصل المحاولة", emoji: "💪" };
  return { title: "لا بأس، التدريب يجعلنا أقوى", emoji: "🌱" };
}