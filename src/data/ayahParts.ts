import type { AyahBox, AyahPart } from "./ayahCoordinates";

/**
 * ayahParts.ts — دعم الآيات الطويلة المقسومة بين المعلم والطفل داخل الآية الواحدة.
 *
 * في التسجيلات الحقيقية (مثل سورة البينة) لا يستطيع المعلم قراءة الآية الطويلة
 * دفعة واحدة، فيقرأها على أجزاء: المعلم الجزء 1 ← الطفل الجزء 1 ← المعلم الجزء 2 …
 *
 * كل جزء يُحفظ داخل مربّع الآية في `parts`، وتبقى `audioStart/audioEnd` و
 * `kidsStart/kidsEnd` محدَّثة كمدى كامل للآية حتى تعمل بقية الأدوات القديمة.
 */

export type Speaker = "teacher" | "kids";

const validRange = (start?: number, end?: number): boolean =>
  start !== undefined && end !== undefined && isFinite(start) && isFinite(end) && end > start + 0.05;

/** أجزاء المربّع المحفوظة، أو جزء واحد مبني على توقيت الآية الكامل */
export const boxParts = (box?: AyahBox | null): AyahPart[] => {
  if (!box) return [];
  const saved = (box.parts || [])
    .filter((p) => validRange(p.tStart, p.tEnd) || validRange(p.kStart, p.kEnd))
    .slice()
    .sort((a, b) => (a.tStart || 0) - (b.tStart || 0));
  if (saved.length > 0) return saved;
  if (validRange(box.audioStart, box.audioEnd)) {
    return [{
      id: `${box.surah}-${box.ayah}-single`,
      tStart: box.audioStart!,
      tEnd: box.audioEnd!,
      kStart: validRange(box.kidsStart, box.kidsEnd) ? box.kidsStart : undefined,
      kEnd: validRange(box.kidsStart, box.kidsEnd) ? box.kidsEnd : undefined,
      label: box.label,
    }];
  }
  return [];
};

export const hasMultipleParts = (box?: AyahBox | null): boolean => {
  if (!box) return false;
  if ((box.parts || []).length > 1) return true;
  return box.parts !== undefined && box.parts.length === 1 && validRange(box.parts[0].kStart, box.parts[0].kEnd);
};

/** مدى تلاوة متحدث واحد داخل جزء */
export const partRange = (part: AyahPart, speaker: Speaker): { start: number; end: number } | null => {
  if (speaker === "kids") {
    return validRange(part.kStart, part.kEnd) ? { start: part.kStart!, end: part.kEnd! } : null;
  }
  return validRange(part.tStart, part.tEnd) ? { start: part.tStart, end: part.tEnd } : null;
};

/** خطوة تشغيل واحدة: متحدث + مدى + رقم الجزء */
export interface PartStep {
  speaker: Speaker;
  start: number;
  end: number;
  partIndex: number;
}

/**
 * ترتيب التشغيل المتناوب لأجزاء الآية:
 * معلم(1) ← طفل(1) ← معلم(2) ← طفل(2) …
 * يُستثنى المتحدث الذي لا يوجد له مدى في الجزء، ويُستثنى الطفل إن لم يُطلب.
 */
export const partSequence = (
  box: AyahBox | null | undefined,
  options: { kids?: boolean } = {},
): PartStep[] => {
  const withKids = options.kids !== false;
  const steps: PartStep[] = [];
  boxParts(box).forEach((part, index) => {
    const teacher = partRange(part, "teacher");
    if (teacher) steps.push({ speaker: "teacher", ...teacher, partIndex: index });
    if (!withKids) return;
    const kids = partRange(part, "kids");
    if (kids) steps.push({ speaker: "kids", ...kids, partIndex: index });
  });
  return steps;
};

/** موضع الخطوة داخل خط تشغيل الأجزاء لمربّع معيّن */
export const findPartStep = (
  box: AyahBox | null | undefined,
  speaker: Speaker,
  partIndex: number | undefined,
  options: { kids?: boolean } = {},
): PartStep | null => {
  if (!box || partIndex === undefined) return null;
  const steps = partSequence(box, options);
  return steps.find((s) => s.partIndex === partIndex && s.speaker === speaker) || null;
};

/** أول موضع يُشغَّل عند الضغط على الآية (أول جزء للمتحدث المطلوب) */
export const firstPartIndex = (box: AyahBox | null | undefined, speaker: Speaker): number | undefined => {
  const steps = partSequence(box, { kids: true }).filter((s) => s.speaker === speaker);
  return steps.length > 0 ? steps[0].partIndex : undefined;
};

let partIdSeed = 0;
const nextPartId = () => `part_${Date.now().toString(36)}_${(partIdSeed += 1)}`;

/** يعيد ضبط المدى الكامل للمربّع من أجزائه (لتوافق الأدوات القديمة) */
export const boxWithParts = (box: AyahBox, parts: AyahPart[]): AyahBox => {
  const clean = parts
    .filter((p) => validRange(p.tStart, p.tEnd) || validRange(p.kStart, p.kEnd))
    .map((p) => ({ ...p, label: p.label }))
    .sort((a, b) => a.tStart - b.tStart);
  if (clean.length === 0) {
    const rest: AyahBox = { ...box };
    delete rest.parts;
    return rest;
  }
  const teacherParts = clean.filter((p) => validRange(p.tStart, p.tEnd));
  const kidsParts = clean.filter((p) => validRange(p.kStart, p.kEnd));
  return {
    ...box,
    parts: clean,
    audioStart: teacherParts.length ? teacherParts[0].tStart : box.audioStart,
    audioEnd: teacherParts.length ? teacherParts[teacherParts.length - 1].tEnd : box.audioEnd,
    kidsStart: kidsParts.length ? kidsParts[0].kStart : box.kidsStart,
    kidsEnd: kidsParts.length ? kidsParts[kidsParts.length - 1].kEnd : box.kidsEnd,
  };
};

/** يقسم مدى الآية (معلم وطفل) إلى عدد أجزاء متساوية — تقسيم سريع بنقرة واحدة */
export const splitBoxParts = (box: AyahBox, count = 2): AyahPart[] => {
  const current = boxParts(box);
  const teacherFrom = current.length ? current[0].tStart : box.audioStart;
  const teacherTo = current.length ? current[current.length - 1].tEnd : box.audioEnd;
  const kidsFrom = current.find((p) => p.kStart !== undefined)?.kStart ?? box.kidsStart;
  const kidsTo = [...current].reverse().find((p) => p.kEnd !== undefined)?.kEnd ?? box.kidsEnd;

  const teacherOk = validRange(teacherFrom, teacherTo);
  const kidsOk = validRange(kidsFrom, kidsTo);
  if (!teacherOk && !kidsOk) return current;

  const parts: AyahPart[] = [];
  for (let i = 0; i < count; i++) {
    const part: AyahPart = {
      id: nextPartId(),
      tStart: teacherOk ? Number((teacherFrom! + ((teacherTo! - teacherFrom!) / count) * i).toFixed(2)) : 0,
      tEnd: teacherOk ? Number((teacherFrom! + ((teacherTo! - teacherFrom!) / count) * (i + 1)).toFixed(2)) : 0,
      label: undefined,
    };
    if (kidsOk) {
      part.kStart = Number((kidsFrom! + ((kidsTo! - kidsFrom!) / count) * i).toFixed(2));
      part.kEnd = Number((kidsFrom! + ((kidsTo! - kidsFrom!) / count) * (i + 1)).toFixed(2));
    }
    parts.push(part);
  }
  return parts;
};

/** جزء جديد يبدأ من نهاية آخر جزء */
export const appendBoxPart = (box: AyahBox, atTime: number): AyahPart[] => {
  const current = boxParts(box);
  const last = current[current.length - 1];
  const start = Number((last?.tEnd ?? atTime).toFixed(2));
  return [
    ...current,
    {
      id: nextPartId(),
      tStart: start,
      tEnd: Number((start + 3).toFixed(2)),
      label: undefined,
    },
  ];
};
