import { describe, it, expect } from "vitest";
import { detectSpeechSegments, alignSegmentsToCount, computeSilenceThreshold } from "./audioSilence";

/**
 * قياس دقة كشف الصمت على «تلاوة» اصطناعية بحدود حقيقية معروفة بدقة:
 * ٧ آيات (كأمثال الفاتحة) بينها فواصل صمت، وداخل كل آية نَفَس قصير
 * يجب ألا يقسّم الآية (اختبار الـ hysteresis). الأرضية المرجعية = مواقع
 * بداية/نهاية كل آية ومراكز الفواصل، والمقياس = متوسط الخطأ بالمللي ثانية.
 */

const FRAME = 0.02;

/** مولّد حتمي (LCG) حتى يكون السيناريو قابلاً لإعادة الإنتاج في كل تشغيل */
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

interface Recitation {
  rms: number[];
  truthStarts: number[];
  truthEnds: number[];
  gapCenters: number[];
}

function synthesizeRecitation(
  ayahDurations: number[],
  gapDurations: number[],
  opts: { breathFrames?: number; breathAyahs?: Set<number> } = {},
): Recitation {
  const noise = 0.004;
  const speechLow = 0.05;
  const speechHigh = 0.16;
  const breathFrames = opts.breathFrames ?? 2; // 40ms — أقصر من minGapSec فلا يقسم الآية
  seed = 42; // بذرة ثابتة لكل توليفة حتى لا يتأثر الاختبار بترتيب تشغيل الاختبارات
  const rms: number[] = [];
  const truthStarts: number[] = [];
  const truthEnds: number[] = [];
  const gapCenters: number[] = [];
  const jitter = () => 1 + (rand() * 0.6 - 0.3);

  for (let i = 0; i < 10; i++) rms.push(noise * jitter()); // صمت رأس الملف

  for (let a = 0; a < ayahDurations.length; a++) {
    const frames = Math.round(ayahDurations[a] / FRAME);
    const hasLongBreath = opts.breathAyahs?.has(a) ?? false;
    truthStarts.push(rms.length * FRAME);
    for (let i = 0; i < frames; i++) {
      const env = 0.65 + 0.35 * Math.sin((i / frames) * Math.PI * 3 + a);
      let isBreath = false;
      if (hasLongBreath) {
        // نَفَس واحد طويل في منتصف الآية فقط
        const center = Math.floor(frames / 2);
        isBreath = i >= center && i < center + breathFrames;
      } else if (breathFrames > 0 && frames >= 6) {
        // أنفاس قصيرة موزعة لا تقسّم الآية (إطاران = 40ms أياً كان خيار النَفَس الطويل)
        const period = Math.floor(frames / 3);
        isBreath = period > 0 && i % period < 2;
      }
      rms.push(isBreath ? noise * 2.2 : (speechLow + (speechHigh - speechLow) * env) * jitter());
    }
    truthEnds.push(rms.length * FRAME);

    if (a < ayahDurations.length - 1) {
      const gapFrames = Math.round(gapDurations[a] / FRAME);
      const middle = Math.floor(gapFrames / 2);
      const gapStart = rms.length * FRAME;
      for (let i = 0; i < gapFrames; i++) {
        rms.push(i === middle ? noise * 0.3 : noise * jitter());
      }
      gapCenters.push(gapStart + middle * FRAME);
    }
  }
  return { rms, truthStarts, truthEnds, gapCenters };
}

const meanAbs = (values: number[]) =>
  values.reduce((sum, v) => sum + Math.abs(v), 0) / Math.max(1, values.length);

describe("دقة كشف الصمت مقابل مرجع أرضي (متوسط الخطأ بالمللي ثانية)", () => {
  it("تلاوة سليمة: ٧ مقاطع = ٧ آيات، والنَّفَس الداخلي لا يقسم الآية", () => {
    const ayahDurations = [2.6, 3.1, 2.4, 3.4, 2.8, 3.2, 3.6];
    const gaps = [0.3, 0.34, 0.28, 0.32, 0.3, 0.36];
    const { rms, truthStarts, truthEnds } = synthesizeRecitation(ayahDurations, gaps);

    const segments = detectSpeechSegments(rms, { frameSec: FRAME });
    expect(segments.length).toBe(7);

    const startErrors = segments.slice(1).map((s, i) => Math.abs(s.start - truthStarts[i + 1]) * 1000);
    const endErrors = segments.map((s, i) => Math.abs(s.end - truthEnds[i]) * 1000);
    expect(meanAbs(startErrors)).toBeLessThan(100);
    expect(Math.max(...startErrors)).toBeLessThan(250);
    expect(meanAbs(endErrors)).toBeLessThan(150);
  });

  it("محاذاة المقاطع الزائدة مع عدد الآيات: كل حدّ يقع داخل فاصل صمت حقيقي", () => {
    const ayahDurations = [2.6, 2.9, 2.5, 3.0, 2.7, 2.9, 3.2];
    const gaps = [0.3, 0.34, 0.28, 0.32, 0.3, 0.36];
    // نَفَس طويل (0.2s) داخل آيتين فقط (الثالثة والخامسة) → مقطعان زائدان (9 لـ 7 آيات)
    const { rms, truthEnds, truthStarts, gapCenters } = synthesizeRecitation(ayahDurations, gaps, {
      breathFrames: 10,
      breathAyahs: new Set([2, 4]),
    });

    const segments = detectSpeechSegments(rms, { frameSec: FRAME });
    expect(segments.length).toBeGreaterThan(7);

    const aligned = alignSegmentsToCount(segments, 7, FRAME, rms);
    expect(aligned.length).toBe(7);

    // كل حدّ بين آيتين يجب أن يقع داخل الفاصل الحقيقي قرب مركزه (أخفض طاقة)
    const boundaryErrors: number[] = [];
    for (let k = 0; k < 6; k++) {
      const boundary = aligned[k + 1].start;
      expect(boundary).toBeGreaterThan(truthEnds[k] - 0.02);
      expect(boundary).toBeLessThan(truthStarts[k + 1] + 0.02);
      boundaryErrors.push(Math.abs(boundary - gapCenters[k]) * 1000);
    }
    expect(meanAbs(boundaryErrors)).toBeLessThan(80);
    expect(Math.max(...boundaryErrors)).toBeLessThan(200);
  });

  it("الأرضية اليدوية للعتبة ترفع العتبة المحسوبة آلياً ولا تخفضها", () => {
    // منحنى حتمي: 60% ضوضاء ثابتة ثم 40% كلام ثابت → العتبة التلقائية معروفة بدقة
    const rms = [...Array(60).fill(0.004), ...Array(40).fill(0.12)];
    const auto = computeSilenceThreshold(rms);
    expect(auto).toBeCloseTo(0.0088, 3);

    const withFloor = computeSilenceThreshold(rms, { thresholdFloor: 0.04 });
    expect(withFloor).toBeCloseTo(0.04, 3);
    expect(withFloor).toBeGreaterThan(auto);

    // أرضية أدنى من التلقائي لا تغيّر شيئاً
    const lowerFloor = computeSilenceThreshold(rms, { thresholdFloor: 0.001 });
    expect(lowerFloor).toBeCloseTo(auto, 6);
  });
});
