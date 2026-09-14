/**
 * قواعد التجويد لرواية ورش عن نافع — مبنية على طريق الأزرق
 */
export interface TajweedRule {
  id: string;
  name: string;
  nameAr: string;
  color: string;
  bgColor: string;
  category: string;
  description: string;
  pattern?: RegExp;
  examples?: string[];
}

export const TAJWEED_CATEGORIES = [
  { id: 'ghunnah', name: 'الغنة', color: '#9333EA', bgColor: '#F3E8FF' },
  { id: 'qalqalah', name: 'القلقلة', color: '#DC2626', bgColor: '#FEE2E2' },
  { id: 'madd', name: 'المدود', color: '#2563EB', bgColor: '#DBEAFE' },
  { id: 'idgham', name: 'الإدغام', color: '#059669', bgColor: '#D1FAE5' },
  { id: 'ikhfaa', name: 'الإخفاء', color: '#D97706', bgColor: '#FEF3C7' },
  { id: 'ithhar', name: 'الإظهار', color: '#7C3AED', bgColor: '#EDE9FE' },
  { id: 'iqlab', name: 'الإقلاب', color: '#0891B2', bgColor: '#CFFAFE' },
  { id: 'tafkheem', name: 'التفخيم والترقيق', color: '#BE185D', bgColor: '#FCE7F3' },
  { id: 'hamz', name: 'الهمز والوصل', color: '#4F46E5', bgColor: '#E0E7FF' },
  { id: 'laam', name: 'اللامات', color: '#065F46', bgColor: '#A7F3D0' },
] as const;

export const TAJWEED_RULES: TajweedRule[] = [
  {
    id: "ghunnah-noon",
    name: "Ghunnah (Noon Mushaddadah)",
    nameAr: "غنة النون المشدّدة",
    color: "#9333EA",
    bgColor: "#F3E8FF",
    category: "ghunnah",
    description: "كمّل الغنّة نحو ثانيتين: إِنَّ، ثُمَّ لا — النون المشددة تحتاج غنّة واضحة",
    pattern: /نّ/u,
    examples: ["إِنَّ", "مِنَّ", "فَإِنَّهُ"],
  },
  {
    id: "ghunnah-meem",
    name: "Ghunnah (Meem Mushaddadah)",
    nameAr: "غنة الميم المشدّدة",
    color: "#9333EA",
    bgColor: "#F3E8FF",
    category: "ghunnah",
    description: "الميم المشددة لها غنّة كالنون: ثُمَّ، لَهُمَّ",
    pattern: /مّ/u,
    examples: ["ثُمَّ", "لَهُمَّ"],
  },
  {
    id: "idgham-bighunnah",
    name: "Idgham Bi Ghunnah",
    nameAr: "الإدغام بغنة (يرملون)",
    color: "#059669",
    bgColor: "#D1FAE5",
    category: "idgham",
    description: "تنون تلتقي (ي ن م و) فتُدغى بغنّة: مَن يَعمَل → مَييَعمَل",
    pattern: /ن[\u064B-\u0652]?[ينمو]/u,
    examples: ["مَن يَعْمَلْ", "مِنْ نِعْمَةٍ"],
  },
  {
    id: "iqlab",
    name: "Iqlab",
    nameAr: "الإقلاب",
    color: "#0891B2",
    bgColor: "#CFFAFE",
    category: "iqlab",
    description: "تنون قبل باء تُقلب ميمًا مع غنّة: مِن بَعْدِ → مِم بَعْدِ",
    pattern: /ن[\u064B-\u0652]?\s?ب/u,
    examples: ["مِن بَعْدِ", "أَنبِئْهُمْ"],
  },
  {
    id: "ikhfaa",
    name: "Ikhfaa Haqiqi",
    nameAr: "الإخفاء الحقيقي",
    color: "#D97706",
    bgColor: "#FEF3C7",
    category: "ikhfaa",
    description: "تنون قبل 15 حرفًا تُخفى بغنّة: مِن قَبْلِ — لا تُظهر النون",
    pattern: /ن[\u064B-\u0652]?\s?[تثجدذزسشصضطظفقك]/u,
    examples: ["مِن قَبْلِ", "أَنْتُمْ"],
  },
  {
    id: "ithhar",
    name: "Ithhar Halqi",
    nameAr: "الإظهار الحلقي",
    color: "#7C3AED",
    bgColor: "#EDE9FE",
    category: "ithhar",
    description: "تنون قبل (ء ه ع ح غ) تُظهَر بوضوح من الحلق: مَنْ آمَنَ",
    pattern: /ن[\u064B-\u0652]?\s?[ءعهغحخ]/u,
    examples: ["مَنْ آمَنَ", "عَنْ حَقٍّ"],
  },
  {
    id: "madd-tabiee",
    name: "Madd Tabiee (Warsh: 6 counts)",
    nameAr: "مدّ طبيعي (ورش: 6 حركات)",
    color: "#2563EB",
    bgColor: "#DBEAFE",
    category: "madd",
    description: "في ورش: المد الطبيعي 6 حركات (مقابل 2 في حفص) — قَالَ، كُتِبَتْ",
    pattern: /[\u0627\u0623\u0625\u0627\u0649و][\u064E\u064F\u0650]/u,
    examples: ["قَالَ", "يَقُولُ", "بِسْمِ"],
  },
  {
    id: "madd-muttasil",
    name: "Madd Muttasil (Warsh: 6 counts)",
    nameAr: "مدّ متصل (ورش: 6 حركات)",
    color: "#2563EB",
    bgColor: "#DBEAFE",
    category: "madd",
    description: "همزة بعد مدّ في كلمة واحدة — في ورش 6 حركات: جَاءَ، السَّمَاءِ",
    pattern: /[اوي][\u064B-\u0652]?\s?ء/u,
    examples: ["جَاءَ", "السَّمَاءِ", "سُوءَ"],
  },
  {
    id: "madd-monfasil",
    name: "Madd Monfasil (Warsh: strong lengthening)",
    nameAr: "مدّ منفصل (ورش: تشديد المد)",
    color: "#2563EB",
    bgColor: "#DBEAFE",
    category: "madd",
    description: "مدّ في نهاية كلمة وهمزة في التي تليها — ورش يطيل 6 حركات مع تشديد: بِأَيْ آيَةٍ",
    pattern: /[\u0627\u0648\u064A\u0649][\u064B-\u0652]?\s?\u0627[\u064B-\u0652]?/u,
    examples: ["بِأَيِ آيَةٍ", "إِنَّا أَعْطَيْنَاكَ"],
  },
  {
    id: "qalqalah-kubra",
    name: "Qalqalah Kubra",
    nameAr: "القلقلة الكبرى",
    color: "#DC2626",
    bgColor: "#FEE2E2",
    category: "qalqalah",
    description: "حرف قلقلة بسكون في وقف — ارتداد صوتي واضح: قُلْ هُوَ اللَّهُ أَحَدْ (الدال)",
    pattern: /[قطبجد][\u0652]/u,
    examples: ["أَحَدْ", "يَوَدُّ"],
  },
  {
    id: "qalqalah-sughra",
    name: "Qalqalah Sughra",
    nameAr: "القلقلة الصغرى",
    color: "#DC2626",
    bgColor: "#FEE2E2",
    category: "qalqalah",
    description: "حرف قلقلة (ق ط ب ج د) متحرك — اضغط عليه بارتداد خفيف: يُطْعِمُون",
    pattern: /[قطبجد]/u,
    examples: ["قُلْ", "أَطْعَمْتُمْ"],
  },
  {
    id: "laam-shamsiyyah",
    name: "Lam Shamsiyyah",
    nameAr: "اللام الشمسية",
    color: "#065F46",
    bgColor: "#A7F3D0",
    category: "laam",
    description: "ال التعريف قبل حرف شمسي — لا تُلفظ اللام، ويُشدّد ما بعدها: الشَّمْس",
    pattern: /ا?ل[\u064B-\u0652]?[تثدذرزسشصضطظلن]/u,
    examples: ["الشَّمْس", "الرَّحْمَٰن"],
  },
  {
    id: "tafkheem-sifat",
    name: "Tafkheem/Tarqeeq",
    nameAr: "التفخيم والترقيق",
    color: "#BE185D",
    bgColor: "#FCE7F3",
    category: "tafkheem",
    description: "راء مفتوحة أو مضمومة = تفخيم؛ راء مكسورة غالبًا ترقيق (ورش يفرّط في التفخيم)",
    pattern: /ر[\u064E\u064F\u0650]/u,
    examples: ["رَبُّ", "رِزْقًا"],
  },
  {
    id: "hamz-wasl",
    name: "Hamzat Wasl/Qat",
    nameAr: "همز الوصل والقطع",
    color: "#4F46E5",
    bgColor: "#E0E7FF",
    category: "hamz",
    description: "همزة وصل تُلفظ عند البدء وتسقط عند الوصل: وَاسْتَغْفِرُوا — انتبه للاسم المنقوص",
    pattern: /[\u0627\u0623\u0625][\u064B-\u0652]?/u,
    examples: ["اسْتَغْفِرُوا", "أَنْعَمْتَ"],
  },
] satisfies TajweedRule[];

/** امتداد نصي مُظلَّل بقاعدة تجويد */
export interface TajweedSpan {
  start: number;
  end: number;
  rule: TajweedRule;
}

/** قطعة نص مع القاعدة المطابقة لها (أو null إن كانت عادية) */
export interface TajweedSegment {
  text: string;
  rule: TajweedRule | null;
}

/** يستخرج مواضع قواعد التجويد من نص قرآني مُشكَّل */
export function extractTajweedFromText(text: string): TajweedSpan[] {
  const spans: TajweedSpan[] = [];
  for (const rule of TAJWEED_RULES) {
    if (!rule.pattern) continue;
    const re = new RegExp(rule.pattern.source, "gu");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length, rule });
      if (m.index === re.lastIndex) re.lastIndex++; // حماية من التكرار اللانهائي
    }
  }
  return spans.sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start)
  );
}

/** يقسّم النص إلى مقاطع مُظلَّلة جاهزة للعرض */
export function highlightTajweed(text: string, spans: TajweedSpan[]): TajweedSegment[] {
  const segments: TajweedSegment[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue; // تداخل — نُبقي الأول
    if (s.start > cursor) {
      segments.push({ text: text.slice(cursor, s.start), rule: null });
    }
    segments.push({ text: text.slice(s.start, s.end), rule: s.rule });
    cursor = s.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), rule: null });
  }
  return segments;
}
