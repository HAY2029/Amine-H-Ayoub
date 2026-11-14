/**
 * تفضيلات قارئ المصحف — تُحفظ محلياً لتبقى تجربة القراءة كما تركها المستخدم:
 *  - immersive: وضع القراءة الغامر (ملء الشاشة بلا أشرطة) — مفعّل افتراضياً.
 *  - autoPlay: استئناف التلاوة تلقائياً عند الدخول حين يوجد مدى محفوظ.
 *  - speed: سرعة التلاوة المختارة.
 *  - range: آخر مدى «من آية ← إلى آية» شغّله المستخدم.
 */
export interface ReaderRange {
  surah: number;
  from: number;
  to: number;
}

export interface ReaderPrefs {
  immersive: boolean;
  autoPlay: boolean;
  speed: number;
  range: ReaderRange | null;
}

const KEY = "mushaf:readerPrefs:v1";

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  immersive: true, // يبدأ المصحف على شاشة قراءة نظيفة بلا أشرطة مشتتة
  autoPlay: true,
  speed: 1,
  range: null,
};

const clampSpeed = (v: number): number => {
  if (!isFinite(v) || v <= 0) return 1;
  return Math.min(3, Math.max(0.5, v));
};

export function getReaderPrefs(): ReaderPrefs {
  if (typeof window === "undefined") return DEFAULT_READER_PREFS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_READER_PREFS;
    const p = JSON.parse(raw) as Partial<ReaderPrefs>;

    let range: ReaderRange | null = null;
    const r = p.range;
    if (r && typeof r.surah === "number" && typeof r.from === "number" && typeof r.to === "number") {
      const from = Math.max(1, Math.floor(r.from));
      const to = Math.max(from, Math.floor(r.to));
      range = { surah: r.surah, from, to };
    }

    return {
      immersive: typeof p.immersive === "boolean" ? p.immersive : DEFAULT_READER_PREFS.immersive,
      autoPlay: typeof p.autoPlay === "boolean" ? p.autoPlay : DEFAULT_READER_PREFS.autoPlay,
      speed: clampSpeed(typeof p.speed === "number" ? p.speed : 1),
      range,
    };
  } catch {
    return DEFAULT_READER_PREFS;
  }
}

export function saveReaderPrefs(patch: Partial<ReaderPrefs>): ReaderPrefs {
  const next: ReaderPrefs = { ...getReaderPrefs(), ...patch };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}
