/**
 * مولّد تظليل المصحف الكامل من صور الصفحات نفسها.
 * ------------------------------------------------------------------
 * لكل صفحة:
 *  1) يفصل سطور النص الحقيقية (ويستبعد شريط عنوان السورة).
 *  2) يكتشف «الميداليات» (أرقام الآيات) — كل آية تنتهي بميدالية،
 *     فتصبح حدود الآية مقاسة من الصورة بدقة لا تعتمد على أي تخمين.
 *  3) يبني مربعاً لكل آية على سطرها الحقيقي، ومربعاً للبسملة على سطرها.
 *
 * Usage: node scripts/build-mushaf-shading.mjs [--write] [--page 590]
 */
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";

const ROOT = process.cwd();
const PAGES_DIR = path.join(ROOT, "صفحة قران");
const WRITE = process.argv.includes("--write");

// ── قراءة جدول أقسام الصفحات (سور/آيات) من كود التطبيق ──────────────────────
function loadSections() {
  const src = fs.readFileSync(path.join(ROOT, "src/data/ayahCoordinates.ts"), "utf8");
  const m = src.match(/JUZ_AMMA_PAGE_SECTIONS[^=]*=\s*(\{[\s\S]*?\n\});/);
  if (!m) throw new Error("لم أجد JUZ_AMMA_PAGE_SECTIONS");
  return new Function(`return (${m[1]});`)();
}

// ── تحليل صورة الصفحة ───────────────────────────────────────────────────────
function analyzePage(file) {
  const img = jpeg.decode(fs.readFileSync(file), { useTArray: true });
  const { width: W, height: H, data } = img;

  const ink = new Uint8Array(W * H);
  const rowInk = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    for (let x = 40; x < W - 40; x++) {
      const p = (y * W + x) * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const lum = (r * 30 + g * 59 + b * 11) / 100;
      if (lum < 170 || (mx - mn > 70 && lum < 220)) {
        ink[y * W + x] = 1;
        rowInk[y]++;
      }
    }
  }

  const contentW = W - 80;

  // شريط عنوان السورة: صفوف عريضة ممتلئة بالحبر (إطار الزخرفة)
  const denseRow = new Uint8Array(H);
  for (let y = 0; y < H; y++) if (rowInk[y] > contentW * 0.82) denseRow[y] = 1;
  // توسيع الشريط ليشمل ما بين حدّي الإطار
  for (let y = 0; y < H; y++) {
    if (!denseRow[y]) continue;
    let up = y, down = y;
    while (up > 0 && rowInk[up - 1] > contentW * 0.02) up--;
    while (down < H - 1 && rowInk[down + 1] > contentW * 0.02) down++;
    if (down - up < 160) for (let k = up; k <= down; k++) denseRow[k] = 1;
    y = down;
  }

  // مراكز السطور عبر قمم إسقاط الصفوف
  const sm = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    const a = Math.max(0, y - 4), b = Math.min(H - 1, y + 4);
    let s = 0;
    for (let k = a; k <= b; k++) s += denseRow[k] ? 0 : rowInk[k];
    sm[y] = s / (b - a + 1) / contentW;
  }
  const peaks = [];
  for (let y = 80; y < H - 60; y++) {
    if (sm[y] < 0.06) continue;
    let isPeak = true;
    for (let d = 1; d <= 30 && isPeak; d++) {
      if (y - d >= 0 && sm[y - d] > sm[y]) isPeak = false;
      if (y + d < H && sm[y + d] > sm[y]) isPeak = false;
    }
    if (!isPeak) continue;
    if (peaks.length && y - peaks[peaks.length - 1] < 55) {
      if (sm[y] > sm[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = y;
    } else peaks.push(y);
  }

  // مكوّنات الحبر المتصلة + الفراغات المغلقة (لُبّ الميداليات)
  const label = new Int32Array(W * H).fill(-1);
  const stack = new Int32Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (!ink[start] || label[start] >= 0) continue;
    const id = start;
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp > 0) {
      const p = stack[--sp];
      const y = (p / W) | 0, x = p - y * W;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          const q = ny * W + nx;
          if (ink[q] && label[q] < 0) { label[q] = id; stack[sp++] = q; }
        }
      }
    }
  }

  const bgSeen = new Uint8Array(W * H);
  const bgStack = new Int32Array(W * H);
  const holes = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (ink[p] || bgSeen[p]) continue;
      let sp = 0;
      bgStack[sp++] = p;
      bgSeen[p] = 1;
      let x0 = W, x1 = 0, y0 = H, y1 = 0, area = 0, border = false;
      while (sp > 0) {
        const q = bgStack[--sp];
        const qy = (q / W) | 0, qx = q - qy * W;
        if (qx === 0 || qx === W - 1 || qy === 0 || qy === H - 1) border = true;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
        if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        area++;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = qy + dy;
          if (ny < 0 || ny >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = qx + dx;
            if (nx < 0 || nx >= W) continue;
            const r = ny * W + nx;
            if (!ink[r] && !bgSeen[r]) { bgSeen[r] = 1; bgStack[sp++] = r; }
          }
        }
      }
      if (!border) holes.push({ x0, x1, y0, y1, area });
    }
  }

  const medallions = [];
  for (const h of holes) {
    const hw = h.x1 - h.x0 + 1, hh = h.y1 - h.y0 + 1;
    if (h.area < 700 || h.area > 2600) continue;
    if (hw < 28 || hw > 62 || hh < 40 || hh > 82) continue;
    const cx = Math.round((h.x0 + h.x1) / 2);
    const cy = Math.round((h.y0 + h.y1) / 2);
    medallions.push({ cx, cy, x0: cx - 36, x1: cx + 36, y0: cy - 47, y1: cy + 47 });
  }
  medallions.sort((a, b) => a.cy - b.cy || b.cx - a.cx);

  // بناء السطور بالمدى الحقيقي للحبر
  const lines = [];
  peaks.forEach((center, i) => {
    const top = i === 0 ? center - 45 : Math.floor((peaks[i - 1] + center) / 2);
    const bot = i === peaks.length - 1 ? center + 45 : Math.floor((center + peaks[i + 1]) / 2);
    let y0 = -1, y1 = -1;
    for (let y = Math.max(0, top); y <= Math.min(H - 1, bot); y++) {
      if (rowInk[y] > 2) { if (y0 < 0) y0 = y; y1 = y; }
    }
    if (y0 < 0) return;
    let x0 = -1, x1 = -1;
    for (let x = 40; x < W - 40; x++) {
      let c = 0;
      for (let y = y0; y <= y1; y++) if (ink[y * W + x]) c++;
      if (c >= 2) { if (x0 < 0) x0 = x; x1 = x; }
    }
    const isHeader = denseRow[Math.round((y0 + y1) / 2)] === 1;
    const meds = medallions.filter(m => m.cy >= y0 - 8 && m.cy <= y1 + 8);
    lines.push({ y0, y1, x0, x1, isHeader, meds });
  });

  return { W, H, lines, medallions };
}

// ── بناء المربعات ───────────────────────────────────────────────────────────
function buildBoxes(sections, analysis) {
  const expected = [];
  for (const s of sections) {
    if (s.hasBasmalah) expected.push({ surah: s.surah, ayah: 0 });
    for (let a = s.startAyah; a <= s.endAyah; a++) expected.push({ surah: s.surah, ayah: a });
  }

  const PAD_Y = 7;
  const boxes = [];
  let ptr = 0;
  const nextAyah = () => {
    while (ptr < expected.length && expected[ptr].ayah === 0) return null; // بسملة لم تُستهلك
    return expected[ptr];
  };

  const lines = analysis.lines.filter(l => !l.isHeader);
  // استبعاد سطر البسملة من الاستهلاك: نكتشفه لاحقاً
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const isBasmalah =
      line.meds.length === 0 &&
      line.x0 > 120 && line.x0 < 320 && line.x1 > 840 && line.x1 < 1120;

    if (isBasmalah) {
      if (ptr < expected.length && expected[ptr].ayah === 0) {
        const e = expected[ptr++];
        boxes.push({
          surah: e.surah, ayah: 0,
          x: Math.max(0, line.x0 - 8),
          y: Math.max(0, line.y0 - 8),
          width: Math.min(analysis.W - Math.max(0, line.x0 - 8), line.x1 - line.x0 + 16),
          height: line.y1 - line.y0 + 16,
          label: "البسملة",
        });
      }
      continue;
    }

    const meds = line.meds; // مرتبة يمين → يسار
    if (ptr < expected.length && expected[ptr].ayah === 0) {
      // بسملة متوقعة لكن السطر ليس بسملة → نستهلكها بدون مربع (حماية)
      ptr++;
    }
    if (meds.length === 0) continue;

    let rightEdge = line.x1;
    for (let mi = 0; mi < meds.length; mi++) {
      if (ptr >= expected.length) break;
      const m = meds[mi];
      const ayah = expected[ptr++];
      const isLastOnLine = mi === meds.length - 1;
      // الآية السابقة انتهت على سطر أسبق؟ نغلق الأسطر الكاملة بينهما
      boxes.push({
        surah: ayah.surah, ayah: ayah.ayah,
        x: Math.max(0, m.x0),
        y: Math.max(0, line.y0 - PAD_Y),
        width: Math.min(analysis.W - Math.max(0, m.x0), rightEdge - m.x0),
        height: line.y1 - line.y0 + PAD_Y * 2,
        label: `الآية ${ayah.ayah}`,
      });
      rightEdge = m.x0 - 10;
      if (!isLastOnLine) continue;
      // لا شيء بعد آخر ميدالية على السطر
    }
  }

  return { boxes, leftover: expected.length - ptr };
}

// ── التنفيذ ────────────────────────────────────────────────────────────────
const sectionsTable = loadSections();
const files = fs.readdirSync(PAGES_DIR).filter(f => /\.jpe?g$/i.test(f));
const out = {};
const report = [];

for (const f of files) {
  const num = parseInt(f, 10);
  if (isNaN(num)) continue;
  const pageKeyNum = num === 0 ? 0 : num;
  const sections = sectionsTable[pageKeyNum];
  if (!sections) { report.push(`${f}: بلا أقسام معروفة — تُخطّى`); continue; }

  const analysis = analyzePage(path.join(PAGES_DIR, f));
  const expectedCount = sections.reduce(
    (n, s) => n + (s.hasBasmalah ? 1 : 0) + (s.endAyah - s.startAyah + 1), 0);
  const medCount = analysis.medallions.length;
  const { boxes, leftover } = buildBoxes(sections, analysis);
  out[`/pages/${f}`] = boxes;
  report.push(
    `${f}: سطور=${analysis.lines.length} ميداليات=${medCount} متوقع=${expectedCount} ` +
    `مربعات=${boxes.length} متبقٍ=${leftover}`,
  );
}

console.log(report.join("\n"));
const total = Object.values(out).reduce((n, b) => n + b.length, 0);
console.log("pages:", Object.keys(out).length, "boxes:", total);

if (WRITE) {
  const json = JSON.stringify(out, null, 0);
  for (const target of ["src/data/shading/boxes-dump.json"]) {
    fs.writeFileSync(path.join(ROOT, target), json);
    console.log("wrote", target, (json.length / 1024).toFixed(1) + "KB");
  }
}
