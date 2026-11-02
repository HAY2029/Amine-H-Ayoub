/**
 * أدوات تحليل الصوت لكشف الصمت وتقسيم التلاوة إلى آيات.
 * تعمل على «منحنى الطاقة» (RMS) فقط حتى تبقى قابلة للاختبار بدون متصفح.
 *
 * مستوى متقدّم (VAD ثنائي العتبة + محاذاة أدق):
 *  - بوابة طاقة بعتبتين (Hysteresis): عتبة أعلى لبدء الكلام وأدنى لاستمراره،
 *    فلا تُقطع الكلمات حين تهدأ نبرة القارئ لحظة. (double-threshold energy VAD)
 *  - تثبيت حدود المقاطع على أخفض نقطة طاقة في نافذة قريبة (snap to quietest frame)
 *    بدل حدود تقريبية، فلا تدخل أنفاس في بداية الآية ولا تُقصّ آخر الكلمة.
 *  - دالة تقييم ثقة لكل مقطع (Score) لعرض جودة التقسيم قبل الحفظ.
 */

export interface SpeechSegment {
  start: number;
  end: number;
}

export interface SilenceOptions {
  /** مدة النافذة الواحدة بالثواني (افتراضي 20ms) */
  frameSec?: number;
  /** أقل فاصل صمت يُعتبر حداً بين آيتين (افتراضي 0.16s) */
  minGapSec?: number;
  /** أقل مدة مقطع يُعتبر تلاوة حقيقية (افتراضي 0.25s) */
  minSpeechSec?: number;
  /** دمج المقاطع الأقرب من هذه المدة مع ما قبلها (افتراضي 0.12s) */
  mergeGapSec?: number;
  /** مضروب أرضية الضوضاء (افتراضي 2.2) */
  noiseFloorFactor?: number;
  /** نسبة من ذروة الصوت للحد الأدنى للعتبة (افتراضي 0.055) */
  peakFactor?: number;
  /** النسبة المئوية المستخدمة كأرضية ضوضاء (افتراضي 0.2) */
  noiseFloorPercentile?: number;
  /** مضروب بدء الكلام فوق العتبة (افتراضي 1.35) — العتبة الثانية للـ VAD */
  hysteresisFactor?: number;
  /** مضروب استمرار الكلام تحت العتبة (افتراضي 0.8) */
  continuationFactor?: number;
  /** أقصى إزاحة لتثبيت الحدود على أخفض طاقة بالثواني (افتراضي 0.14) */
  snapWindowSec?: number;
}

/** العتبة التي تحتّها يُعتبر الصوت صمتاً */
export const computeSilenceThreshold = (rms: number[], options: SilenceOptions = {}): number => {
  const noiseFloorFactor = options.noiseFloorFactor ?? 2.2;
  const peakFactor = options.peakFactor ?? 0.055;
  const percentile = options.noiseFloorPercentile ?? 0.2;
  if (rms.length === 0) return 0;
  const sorted = [...rms].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * percentile)] || 0;
  const peak = sorted[sorted.length - 1] || 0;
  // لا تتجاوز العتبة نصف الذروة حتى لا يُعتبر تسجيل هادئ كله صمتاً
  return Math.min(Math.max(noiseFloor * noiseFloorFactor, peak * peakFactor), peak * 0.5);
};

/**
 * يحرّك حدّ المقطع إلى أخفض نقطة طاقة داخل نافذة صغيرة.
 * - للبداية: نبحث عن آخر إطار صامت قبل البداية ليقف الحدّ قبله مباشرة.
 * - للنهاية: نبحث عن أول إطار صامت بعد النهاية ليقف الحدّ عنده.
 */
const snapBoundary = (
  rms: number[],
  frame: number,
  direction: "start" | "end",
  threshold: number,
  windowFrames: number,
): number => {
  if (windowFrames <= 0) return frame;
  if (direction === "start") {
    let best = -1;
    for (let f = frame; f >= Math.max(0, frame - windowFrames); f--) {
      if (rms[f] <= threshold) {
        best = f;
        break;
      }
    }
    return best >= 0 ? best + 1 : frame;
  }
  for (let f = frame; f < Math.min(rms.length, frame + windowFrames); f++) {
    if (rms[f] <= threshold) return f;
  }
  return frame;
};

/**
 * يستخرج مقاطع التلاوة من منحنى الطاقة: كل مقطع هو كلام محصور بين فترتي صمت.
 */
export const detectSpeechSegments = (rms: number[], options: SilenceOptions = {}): SpeechSegment[] => {
  const frameSec = options.frameSec ?? 0.02;
  const minGapSec = options.minGapSec ?? 0.16;
  const minSpeechSec = options.minSpeechSec ?? 0.25;
  const mergeGapSec = options.mergeGapSec ?? 0.12;
  const hysteresis = options.hysteresisFactor ?? 1.35;
  const continuation = options.continuationFactor ?? 0.8;
  const snapWindowSec = options.snapWindowSec ?? 0.14;
  if (rms.length === 0) return [];

  const threshold = computeSilenceThreshold(rms, options);
  const peak = rms.reduce((max, v) => (v > max ? v : max), 0);
  const startThreshold = Math.min(threshold * hysteresis, peak * 0.5);
  const lowThreshold = threshold * continuation;

  const raw: SpeechSegment[] = [];
  let runStart = -1;
  let lastLoud = -1;

  for (let i = 0; i < rms.length; i++) {
    // بدء الكلام بعتبة أعلى، والاستمرار بعتبة أدنى (hysteresis)
    const loud = runStart < 0 ? rms[i] > startThreshold : rms[i] > lowThreshold;
    if (loud) {
      if (runStart < 0) runStart = i;
      lastLoud = i;
    } else if (runStart >= 0 && (i - lastLoud) * frameSec >= minGapSec) {
      raw.push({ start: runStart * frameSec, end: (lastLoud + 1) * frameSec });
      runStart = -1;
    }
  }
  if (runStart >= 0) raw.push({ start: runStart * frameSec, end: (lastLoud + 1) * frameSec });

  // تثبيت الحدود على أخفض طاقة (يمنع دخول نَفَس في البداية أو قطع آخر حرف)
  const windowFrames = Math.max(0, Math.round(snapWindowSec / frameSec));
  const snapped = raw.map((seg) => {
    const startFrame = Math.round(seg.start / frameSec);
    const endFrame = Math.round(seg.end / frameSec);
    const s = snapBoundary(rms, startFrame, "start", lowThreshold, windowFrames);
    const e = snapBoundary(rms, endFrame, "end", lowThreshold, windowFrames);
    const start = Math.max(0, Math.min(s, endFrame - 1)) * frameSec;
    const end = Math.max(start + frameSec, Math.min(e, rms.length)) * frameSec;
    return { start, end };
  });

  // دمج الأنفاس/الهمسات القصيرة مع المقطع السابق
  const merged: SpeechSegment[] = [];
  for (const seg of snapped) {
    const prev = merged[merged.length - 1];
    if (prev && (seg.start - prev.end < mergeGapSec || seg.end - seg.start < minSpeechSec)) {
      prev.end = seg.end;
    } else if (seg.end - seg.start >= minSpeechSec) {
      merged.push({ ...seg });
    }
  }
  return merged;
};

/**
 * درجة ثقة (0..1) لكل مقطع: كم كان الصمت قبله عميقاً، وكم طوله قريب من المتوسط.
 * تُستخدم لعرض جودة التقسيم للمستخدم قبل الاعتماد عليه.
 */
export const scoreSegments = (
  rms: number[],
  segments: SpeechSegment[],
  options: SilenceOptions = {},
): number[] => {
  if (segments.length === 0 || rms.length === 0) return [];
  const frameSec = options.frameSec ?? 0.02;
  const threshold = computeSilenceThreshold(rms, options);
  const lengths = segments.map((s) => s.end - s.start).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)] || 0;

  return segments.map((seg, i) => {
    const sF = Math.max(0, Math.round(seg.start / frameSec));
    const eF = Math.min(rms.length - 1, Math.round(seg.end / frameSec) - 1);
    let loudSum = 0;
    for (let f = sF; f <= eF; f++) loudSum += rms[f];
    const speechEnergy = loudSum / Math.max(1, eF - sF + 1);

    const prevEnd = i > 0 ? Math.round(segments[i - 1].end / frameSec) : 0;
    let gapSum = 0;
    let gapCount = 0;
    for (let f = Math.max(0, prevEnd); f < sF; f++) {
      gapSum += rms[f];
      gapCount++;
    }
    const gapEnergy = gapCount > 0 ? gapSum / gapCount : 0;

    const silenceProminence =
      speechEnergy > threshold ? Math.max(0, Math.min(1, 1 - gapEnergy / speechEnergy)) : 0.4;
    const len = seg.end - seg.start;
    const lenScore = median > 0 && len > 0 ? Math.min(1, Math.min(len, median) / Math.max(len, median)) : 1;

    return Math.max(0, Math.min(1, 0.68 * silenceProminence + 0.32 * lenScore));
  });
};

/** أخفض نقطة طاقة داخل فاصل صمت بين مقطعين (الحد الأمثل بين آيتين) */
export const quietestFrameInGap = (rms: number[], fromSec: number, toSec: number, frameSec = 0.02): number => {
  const a = Math.max(0, Math.round(fromSec / frameSec));
  const b = Math.min(rms.length - 1, Math.round(toSec / frameSec));
  if (b <= a) return (fromSec + toSec) / 2;
  let best = a;
  let bestVal = Number.POSITIVE_INFINITY;
  for (let f = a; f <= b; f++) {
    if (rms[f] < bestVal) {
      bestVal = rms[f];
      best = f;
    }
  }
  return best * frameSec;
};

/**
 * يجعل عدد المقاطع مساوياً لعدد الآيات.
 * - عدد مساوٍ: تُستخدم المقاطع كما هي (أدق حالة).
 * - عدد أكبر (تكرار/أنفاس كثيرة): تُختار حدود الآيات من **أخفض نقطة طاقة** في الصمت
 *   الأقرب لموقعها المتوقع بالتساوي الزمني، وهو أدق من منتصف الصمت.
 * - عدد أقل: توزيع تقديري متساوٍ على مدة التلاوة.
 *
 * مرّر `rms` للحصول على المحاذاة على أخفض طاقة؛ بدونها يُستخدم منتصف الصمت (توافقاً للخلف).
 */
export const alignSegmentsToCount = (
  segments: SpeechSegment[],
  count: number,
  frameSec = 0.02,
  rms?: number[],
): SpeechSegment[] => {
  if (count <= 0) return [];
  if (segments.length === 0) return [];

  if (segments.length === count) return segments.map((s) => ({ ...s }));

  const from = segments[0].start;
  const to = segments[segments.length - 1].end;
  const span = to - from;
  if (span <= 0) return segments.map((s) => ({ ...s }));

  if (segments.length > count) {
    // مرشح الحدود = أخفض طاقة في كل فاصل صمت بين مقطعين (أو منتصفه إن لم يتوفر المنحنى)
    const gapCandidates = segments.slice(0, -1).map((s, i) => {
      const gapFrom = s.end;
      const gapTo = segments[i + 1].start;
      if (rms && gapTo > gapFrom) return quietestFrameInGap(rms, gapFrom, gapTo, frameSec);
      return (gapFrom + gapTo) / 2;
    });
    const boundaries: number[] = [];
    let last = from;
    for (let k = 1; k < count; k++) {
      const target = from + (span * k) / count;
      let chosen = target;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const center of gapCandidates) {
        if (center <= last + 0.05) continue;
        const dist = Math.abs(center - target);
        if (dist < bestDist) {
          bestDist = dist;
          chosen = center;
        }
      }
      boundaries.push(chosen);
      last = chosen;
    }
    const points = [from, ...boundaries, to];
    return Array.from({ length: count }, (_, i) => ({ start: points[i], end: points[i + 1] }));
  }

  const step = span / count;
  return Array.from({ length: count }, (_, i) => ({ start: from + i * step, end: from + (i + 1) * step }));
};
