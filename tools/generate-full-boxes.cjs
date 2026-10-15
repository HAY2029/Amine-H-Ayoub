const fs = require('fs');
const path = require('path');

const PAGE_IMAGE_SIZE = { width: 1260, height: 1929 };
const CONTENT_X = 140;
const CONTENT_W = 980;
const CONTENT_Y = 220;
const CONTENT_H = 1530;

const PAGE_SECTIONS = {
  0: [{ surah: 1, startAyah: 1, endAyah: 7, hasBasmalah: true }],
  1: [{ surah: 1, startAyah: 1, endAyah: 7, hasBasmalah: true }],
  581: [{ surah: 78, startAyah: 1, endAyah: 30, hasBasmalah: true }],
  582: [{ surah: 78, startAyah: 1, endAyah: 30, hasBasmalah: true }],
  583: [
    { surah: 78, startAyah: 31, endAyah: 40, hasBasmalah: false },
    { surah: 79, startAyah: 1, endAyah: 15, hasBasmalah: true }
  ],
  584: [{ surah: 79, startAyah: 16, endAyah: 46, hasBasmalah: false }],
  585: [{ surah: 80, startAyah: 1, endAyah: 42, hasBasmalah: true }],
  586: [
    { surah: 81, startAyah: 1, endAyah: 29, hasBasmalah: true },
    { surah: 82, startAyah: 1, endAyah: 5, hasBasmalah: true }
  ],
  587: [
    { surah: 82, startAyah: 6, endAyah: 19, hasBasmalah: false },
    { surah: 83, startAyah: 1, endAyah: 6, hasBasmalah: true }
  ],
  588: [{ surah: 83, startAyah: 7, endAyah: 36, hasBasmalah: false }],
  589: [{ surah: 84, startAyah: 1, endAyah: 25, hasBasmalah: true }],
  590: [
    { surah: 85, startAyah: 1, endAyah: 22, hasBasmalah: true },
    { surah: 86, startAyah: 1, endAyah: 5, hasBasmalah: true }
  ],
  591: [
    { surah: 86, startAyah: 6, endAyah: 17, hasBasmalah: false },
    { surah: 87, startAyah: 1, endAyah: 15, hasBasmalah: true }
  ],
  592: [
    { surah: 87, startAyah: 16, endAyah: 19, hasBasmalah: false },
    { surah: 88, startAyah: 1, endAyah: 26, hasBasmalah: true }
  ],
  593: [{ surah: 89, startAyah: 1, endAyah: 30, hasBasmalah: true }],
  594: [
    { surah: 90, startAyah: 1, endAyah: 20, hasBasmalah: true },
    { surah: 91, startAyah: 1, endAyah: 15, hasBasmalah: true }
  ],
  595: [
    { surah: 92, startAyah: 1, endAyah: 21, hasBasmalah: true },
    { surah: 93, startAyah: 1, endAyah: 11, hasBasmalah: true },
    { surah: 94, startAyah: 1, endAyah: 8, hasBasmalah: true }
  ],
  596: [
    { surah: 95, startAyah: 1, endAyah: 8, hasBasmalah: true },
    { surah: 96, startAyah: 1, endAyah: 19, hasBasmalah: true }
  ],
  597: [
    { surah: 97, startAyah: 1, endAyah: 5, hasBasmalah: true },
    { surah: 98, startAyah: 1, endAyah: 5, hasBasmalah: true }
  ],
  598: [
    { surah: 98, startAyah: 6, endAyah: 8, hasBasmalah: false },
    { surah: 99, startAyah: 1, endAyah: 8, hasBasmalah: true },
    { surah: 100, startAyah: 1, endAyah: 11, hasBasmalah: true }
  ],
  599: [
    { surah: 101, startAyah: 1, endAyah: 11, hasBasmalah: true },
    { surah: 102, startAyah: 1, endAyah: 8, hasBasmalah: true },
    { surah: 103, startAyah: 1, endAyah: 3, hasBasmalah: true }
  ],
  600: [
    { surah: 104, startAyah: 1, endAyah: 9, hasBasmalah: true },
    { surah: 105, startAyah: 1, endAyah: 5, hasBasmalah: true },
    { surah: 106, startAyah: 1, endAyah: 4, hasBasmalah: true }
  ],
  601: [
    { surah: 107, startAyah: 1, endAyah: 7, hasBasmalah: true },
    { surah: 108, startAyah: 1, endAyah: 3, hasBasmalah: true },
    { surah: 109, startAyah: 1, endAyah: 6, hasBasmalah: true }
  ],
  602: [
    { surah: 110, startAyah: 1, endAyah: 3, hasBasmalah: true },
    { surah: 111, startAyah: 1, endAyah: 5, hasBasmalah: true },
    { surah: 112, startAyah: 1, endAyah: 4, hasBasmalah: true }
  ],
  603: [
    { surah: 112, startAyah: 1, endAyah: 4, hasBasmalah: true },
    { surah: 113, startAyah: 1, endAyah: 5, hasBasmalah: true },
    { surah: 114, startAyah: 1, endAyah: 6, hasBasmalah: true }
  ],
  604: [
    { surah: 112, startAyah: 1, endAyah: 4, hasBasmalah: true },
    { surah: 113, startAyah: 1, endAyah: 5, hasBasmalah: true },
    { surah: 114, startAyah: 1, endAyah: 6, hasBasmalah: true }
  ]
};

function generateBoxes(pageNum) {
  const sections = PAGE_SECTIONS[pageNum];
  if (!sections) return [];
  if (pageNum === 0 || pageNum === 1) {
    return [
      { surah: 1, ayah: 0, x: 340, y: 516, width: 580, height: 95, label: 'البسملة', color: '#eab308' },
      { surah: 1, ayah: 1, x: 330, y: 660, width: 600, height: 95, label: 'الآية 1', color: '#eab308' },
      { surah: 1, ayah: 2, x: 330, y: 800, width: 600, height: 95, label: 'الآية 2', color: '#eab308' },
      { surah: 1, ayah: 3, x: 330, y: 940, width: 600, height: 95, label: 'الآية 3', color: '#eab308' },
      { surah: 1, ayah: 4, x: 310, y: 1080, width: 640, height: 95, label: 'الآية 4', color: '#eab308' },
      { surah: 1, ayah: 5, x: 310, y: 1220, width: 640, height: 95, label: 'الآية 5', color: '#eab308' },
      { surah: 1, ayah: 6, x: 290, y: 1360, width: 680, height: 95, label: 'الآية 6', color: '#eab308' },
      { surah: 1, ayah: 7, x: 250, y: 1500, width: 760, height: 95, label: 'الآية 7', color: '#eab308' },
    ];
  }

  const boxes = [];
  const totalWeight = sections.reduce((acc, s) => acc + (s.endAyah - s.startAyah + 1) + (s.hasBasmalah ? 2.5 : 0), 0);
  let currentY = CONTENT_Y;

  sections.forEach((sec) => {
    const ayahCount = sec.endAyah - sec.startAyah + 1;
    const weight = ayahCount + (sec.hasBasmalah ? 2.5 : 0);
    const secH = Math.round((weight / totalWeight) * CONTENT_H);

    let startY = currentY;
    let availableH = secH;

    if (sec.hasBasmalah && sec.startAyah === 1) {
      const bHeight = Math.min(85, Math.max(55, Math.round(secH * 0.15)));
      boxes.push({
        surah: sec.surah,
        ayah: 0,
        x: CONTENT_X + 100,
        y: Math.round(startY + 5),
        width: CONTENT_W - 200,
        height: bHeight,
        label: 'البسملة',
        color: '#eab308'
      });
      startY += bHeight + 12;
      availableH -= (bHeight + 12);
    }

    let cols = 1;
    if (ayahCount > 18) cols = 3;
    else if (ayahCount > 4) cols = 2;
    else cols = 1;

    const rows = Math.ceil(ayahCount / cols);
    const rowH = Math.max(36, Math.floor(availableH / rows));

    for (let i = 0; i < ayahCount; i++) {
      const ayahNum = sec.startAyah + i;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const itemsInRow = Math.min(cols, ayahCount - r * cols);
      const gap = 12;
      const bWidth = Math.floor((CONTENT_W - (itemsInRow - 1) * gap) / itemsInRow);
      // RTL: right column is first ayah
      const bX = CONTENT_X + CONTENT_W - (c + 1) * bWidth - c * gap;
      const bY = startY + r * rowH;

      boxes.push({
        surah: sec.surah,
        ayah: ayahNum,
        x: Math.round(bX),
        y: Math.round(bY + 2),
        width: Math.round(bWidth),
        height: Math.round(rowH - 4),
        label: `الآية ${ayahNum}`,
        color: '#eab308'
      });
    }

    currentY += secH;
  });

  return boxes;
}

const fullDump = {};
for (const p of Object.keys(PAGE_SECTIONS)) {
  const pNum = parseInt(p, 10);
  fullDump['/pages/' + p + '.jpg'] = generateBoxes(pNum);
}
fullDump['/pages/fatiha.jpg'] = generateBoxes(0);

const jsonStr = JSON.stringify(fullDump, null, 2);
fs.writeFileSync('boxes-dump.json', jsonStr, 'utf8');
fs.writeFileSync('src/data/shading/boxes-dump.json', jsonStr, 'utf8');

const cjsStr = 'module.exports = ' + JSON.stringify(fullDump) + ';\n';
fs.writeFileSync('src/data/shading/boxes-dump.cjs', cjsStr, 'utf8');

console.log('✅ Successfully wrote fullDump to boxes-dump.json, src/data/shading/boxes-dump.json, and src/data/shading/boxes-dump.cjs');
console.log('Total pages:', Object.keys(fullDump).length);
let boxCount = 0;
for (const v of Object.values(fullDump)) boxCount += v.length;
console.log('Total boxes:', boxCount);
