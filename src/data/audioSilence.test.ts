import { describe, expect, it } from "vitest";
import { alignSegmentsToCount, computeSilenceThreshold, detectSpeechSegments } from "./audioSilence";

/** يبني منحنى طاقة: نطاقات كلام بقوة 1 ونطاقات صمت بقوة 0 */
const buildEnvelope = (pattern: Array<{ seconds: number; loud: boolean }>, frameSec = 0.02): number[] => {
  const frames: number[] = [];
  for (const part of pattern) {
    const count = Math.round(part.seconds / frameSec);
    for (let i = 0; i < count; i++) frames.push(part.loud ? 1 : 0);
  }
  return frames;
};

describe("detectSpeechSegments", () => {
  it("finds one speech segment per recitation burst separated by silence", () => {
    const rms = buildEnvelope([
      { seconds: 1.0, loud: true },
      { seconds: 0.6, loud: false },
      { seconds: 1.2, loud: true },
      { seconds: 0.5, loud: false },
      { seconds: 0.8, loud: true },
    ]);
    const segments = detectSpeechSegments(rms, { frameSec: 0.02 });
    expect(segments).toHaveLength(3);
    expect(segments[0].start).toBeCloseTo(0, 1);
    expect(segments[0].end).toBeCloseTo(1, 1);
    expect(segments[1].start).toBeCloseTo(1.6, 1);
    expect(segments[2].end).toBeCloseTo(4.1, 1);
  });

  it("does not split on a pause shorter than the minimum gap", () => {
    const rms = buildEnvelope([
      { seconds: 1.0, loud: true },
      { seconds: 0.06, loud: false },
      { seconds: 1.0, loud: true },
    ]);
    expect(detectSpeechSegments(rms, { frameSec: 0.02 })).toHaveLength(1);
  });

  it("keeps silence out of the segments", () => {
    const rms = buildEnvelope([
      { seconds: 0.4, loud: false },
      { seconds: 1.0, loud: true },
      { seconds: 0.4, loud: false },
    ]);
    const [seg] = detectSpeechSegments(rms, { frameSec: 0.02 });
    expect(seg.start).toBeCloseTo(0.4, 1);
    expect(seg.end).toBeCloseTo(1.4, 1);
  });
});

describe("computeSilenceThreshold", () => {
  it("stays above a noisy floor and below the recitation peak", () => {
    const rms = [0.01, 0.01, 0.02, 0.8, 0.9, 1.0];
    const threshold = computeSilenceThreshold(rms);
    expect(threshold).toBeGreaterThan(0.02);
    expect(threshold).toBeLessThan(0.8);
  });
});

describe("alignSegmentsToCount", () => {
  it("snaps ayah boundaries to the nearest real pause when there are extra segments", () => {
    // 4 مقاطع قصيرة بينها 3 صمتات؛ نريد آيتين فقط → الحد الفاصل عند منتصف
    // الصمت الأقرب لنصف المدة (وليس عند أكبر صمت)
    const aligned = alignSegmentsToCount(
      [
        { start: 0, end: 1.8 },
        { start: 2.0, end: 3.8 },
        { start: 6.0, end: 7.8 },
        { start: 8.0, end: 10 },
      ],
      2,
    );
    expect(aligned).toHaveLength(2);
    expect(aligned[0].start).toBeCloseTo(0, 3);
    expect(aligned[0].end).toBeCloseTo(4.9, 3); // منتصف الصمت (3.8 → 6.0)
    expect(aligned[1].start).toBeCloseTo(4.9, 3);
    expect(aligned[1].end).toBeCloseTo(10, 3);
  });

  it("splits the recitation evenly when there are fewer segments than ayahs", () => {
    const aligned = alignSegmentsToCount([{ start: 10, end: 16 }], 3);
    expect(aligned).toHaveLength(3);
    expect(aligned[0].start).toBeCloseTo(10, 3);
    expect(aligned[2].end).toBeCloseTo(16, 3);
    expect(aligned[1].start).toBeCloseTo(12, 3);
  });

  it("returns the same segments when counts match", () => {
    const input = [
      { start: 0, end: 1 },
      { start: 1.5, end: 3 },
    ];
    expect(alignSegmentsToCount(input, 2)).toEqual(input);
  });
});
