const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const INPUT_IMAGE = path.resolve('public/quran-kids-frame.jpg');
const OUTPUT_DIR = path.resolve('public/surah-frames');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load local corpus
const corpus = JSON.parse(fs.readFileSync(path.resolve('src/data/localQuranCorpus.json'), 'utf8'));

// Tajweed color enhancer
function applyTajweedStyling(rawText) {
  let text = rawText;

  // Tafkheem for Lafz Al-Jalalah
  text = text.replace(/(اللَّهِ|اللَّهَ|اللَّهُ|لِلَّهِ)/g, "<span class='tajweed-tafkheem'>$1</span>");

  // Qalqalah letters: ق ط ب ج د with sukun or at end
  text = text.replace(/([قطبجد]ْ|[قطبجد]ٍ|[قطبجد]ٌ)(?=\s|$|﴿)/g, "<span class='tajweed-qalqalah'>$1</span>");

  // Ghunnah: Noon/Meem Mushaddadah, Noon Sakinah + Ikhfa
  text = text.replace(/([نم]ّ[َُِ])/g, "<span class='tajweed-ghunnah'>$1</span>");
  text = text.replace(/(مِن شَرِّ|مَن يَقُولُ|عَن صَلَاتِهِمْ)/g, "<span class='tajweed-ghunnah'>$1</span>");

  // Madd Lazim / Muttasil
  text = text.replace(/(الضَّالِّينَ|الصَّاخَّةُ|الطَّامَّةُ)/g, "<span class='tajweed-madd-6'>$1</span>");
  text = text.replace(/(جَاءَ|سُوءَ|شَاءَ|إِذَا جَاءَ)/g, "<span class='tajweed-madd-246'>$1</span>");

  return text;
}

(async () => {
  console.log('Starting Batch Surah Frame Generator...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const imgBase64 = fs.readFileSync(INPUT_IMAGE).toString('base64');

  // Short Surahs list to generate pre-rendered high-res images for
  const targetSurahs = [
    { name: "الفاتحة", num: 1, type: "مَكِّيَّةٌ", ayahsCount: 7 },
    { name: "الناس", num: 114, type: "مَكِّيَّةٌ", ayahsCount: 6 },
    { name: "الفلق", num: 113, type: "مَكِّيَّةٌ", ayahsCount: 5 },
    { name: "الإخلاص", num: 112, type: "مَكِّيَّةٌ", ayahsCount: 4 },
    { name: "المسد", num: 111, type: "مَكِّيَّةٌ", ayahsCount: 5 },
    { name: "النصر", num: 110, type: "مَدَنِيَّةٌ", ayahsCount: 3 },
    { name: "الكافرون", num: 109, type: "مَكِّيَّةٌ", ayahsCount: 6 },
    { name: "الكوثر", num: 108, type: "مَكِّيَّةٌ", ayahsCount: 3 },
    { name: "الماعون", num: 107, type: "مَكِّيَّةٌ", ayahsCount: 7 },
    { name: "قريش", num: 106, type: "مَكِّيَّةٌ", ayahsCount: 4 },
    { name: "الفيل", num: 105, type: "مَكِّيَّةٌ", ayahsCount: 5 },
    { name: "الهمزة", num: 104, type: "مَكِّيَّةٌ", ayahsCount: 9 },
    { name: "العصر", num: 103, type: "مَكِّيَّةٌ", ayahsCount: 3 },
    { name: "التكاثر", num: 102, type: "مَكِّيَّةٌ", ayahsCount: 8 },
    { name: "القدر", num: 97, type: "مَكِّيَّةٌ", ayahsCount: 5 },
    { name: "التين", num: 95, type: "مَكِّيَّةٌ", ayahsCount: 8 },
    { name: "الشرح", num: 94, type: "مَكِّيَّةٌ", ayahsCount: 8 },
    { name: "الضحى", num: 93, type: "مَكِّيَّةٌ", ayahsCount: 11 }
  ];

  const generatedManifest = [];

  for (const target of targetSurahs) {
    const sData = corpus.find(c => c.name === target.name || c.app === target.num || c.std === target.num);
    if (!sData) {
      console.warn(`Surah not found in corpus: ${target.name}`);
      continue;
    }

    const surahAyahs = (sData.ayahs || []).map(a => ({
      text: applyTajweedStyling(a.text)
    }));

    const isFatiha = target.name === "الفاتحة";
    const basmala = isFatiha ? "" : "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";

    // Dynamic sizing based on total text length
    const totalChars = surahAyahs.reduce((sum, a) => sum + a.text.length, 0);
    let fontSize = '36px';
    let lineHeight = '2.2';

    if (totalChars > 450) {
      fontSize = '24px';
      lineHeight = '1.85';
    } else if (totalChars > 280) {
      fontSize = '28px';
      lineHeight = '1.95';
    } else if (totalChars > 160) {
      fontSize = '32px';
      lineHeight = '2.1';
    }

    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@700;800;900&family=Reem+Kufi:wght@600;700&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            width: 1920px;
            height: 1080px;
            overflow: hidden;
            background: #000;
            font-family: 'Amiri Quran', 'Amiri', serif;
            position: relative;
          }
          .base-frame {
            position: absolute;
            inset: 0;
            width: 1920px;
            height: 1080px;
            object-fit: cover;
            z-index: 1;
          }
          .soft-backdrop {
            position: absolute;
            inset: 0;
            width: 1920px;
            height: 1080px;
            z-index: 2;
            background-image: url('data:image/jpeg;base64,${imgBase64}');
            background-size: 1920px 1080px;
            filter: blur(8px) saturate(0.88) brightness(0.98);
            mask-image: radial-gradient(ellipse 65% 58% at 50% 48%, transparent 40%, rgba(0,0,0,0.6) 80%, black 100%);
            -webkit-mask-image: radial-gradient(ellipse 65% 58% at 50% 48%, transparent 40%, rgba(0,0,0,0.6) 80%, black 100%);
            pointer-events: none;
          }
          .inner-watermark {
            position: absolute;
            left: 310px;
            top: 175px;
            width: 1300px;
            height: 670px;
            z-index: 3;
            border-radius: 200px 200px 70px 70px;
            pointer-events: none;
            background-image: 
              radial-gradient(circle at center, rgba(255,255,255,0.45) 0%, rgba(253, 248, 237, 0.15) 75%),
              url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23b8860b' stroke-width='0.75' stroke-opacity='0.08'%3E%3Cpath d='M40 0 L80 40 L40 80 L0 40 Z'/%3E%3Ccircle cx='40' cy='40' r='25'/%3E%3Ccircle cx='40' cy='40' r='14'/%3E%3Cpath d='M0 0 L80 80 M80 0 L0 80'/%3E%3C/g%3E%3C/svg%3E");
            background-repeat: repeat;
          }
          .surah-container {
            position: absolute;
            left: 330px;
            top: 170px;
            width: 1260px;
            height: 670px;
            z-index: 10;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 16px 40px;
            text-align: center;
            direction: rtl;
          }
          .surah-header-badge {
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 4px 34px 6px 34px;
            background: linear-gradient(180deg, #ffffff 0%, #fbf6ea 100%);
            border: 2px solid #d4af37;
            border-radius: 40px;
            box-shadow: 0 4px 15px rgba(184, 134, 11, 0.16), inset 0 0 0 2px rgba(255, 255, 255, 0.9);
            margin-bottom: 8px;
            position: relative;
          }
          .surah-header-badge::before,
          .surah-header-badge::after {
            content: '❖';
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            color: #c59b27;
            font-size: 16px;
          }
          .surah-header-badge::before { right: 12px; }
          .surah-header-badge::after { left: 12px; }
          .surah-title {
            font-family: 'Cairo', 'Reem Kufi', sans-serif;
            font-weight: 900;
            font-size: 28px;
            color: #1b4332;
            letter-spacing: 0.5px;
            line-height: 1.2;
          }
          .surah-meta {
            font-family: 'Cairo', sans-serif;
            font-size: 13px;
            font-weight: 700;
            color: #8c6a23;
          }
          .basmala-text {
            font-family: 'Amiri Quran', 'Amiri', serif;
            font-size: 30px;
            color: #2c3e50;
            margin-bottom: 10px;
            line-height: 1.3;
          }
          .ayahs-box {
            width: 100%;
            max-height: 490px;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 4px 10px;
            line-height: ${lineHeight};
          }
          .ayah-phrase {
            font-size: ${fontSize};
            color: #1a252f;
            font-weight: 400;
            display: inline;
          }
          .ayah-num {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin: 0 4px;
            color: #b8860b;
            font-family: 'Amiri', serif;
            font-weight: 700;
            font-size: 0.9em;
            vertical-align: middle;
          }
          .tajweed-ghunnah { color: #27ae60; font-weight: 600; }
          .tajweed-madd-6 { color: #8e24aa; font-weight: 600; }
          .tajweed-madd-246 { color: #d35400; font-weight: 600; }
          .tajweed-madd-2 { color: #b78103; font-weight: 600; }
          .tajweed-qalqalah { color: #0288d1; font-weight: 600; }
          .tajweed-tafkheem { color: #1a365d; font-weight: 700; }
        </style>
      </head>
      <body>
        <img class="base-frame" src="data:image/jpeg;base64,${imgBase64}" alt="Quran Frame" />
        <div class="soft-backdrop"></div>
        <div class="inner-watermark"></div>
        <div class="surah-container">
          <div class="surah-header-badge">
            <div class="surah-title">سُورَةُ ${target.name}</div>
            <div class="surah-meta">آيَاتُهَا ${target.ayahsCount} — ${target.type}</div>
          </div>
          ${basmala ? `<div class="basmala-text">${basmala}</div>` : ''}
          <div class="ayahs-box">
            ${surahAyahs.map((a, i) => `
              <span class="ayah-phrase">${a.text}</span>
              <span class="ayah-num">﴿${i + 1}﴾</span>
            `).join('')}
          </div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 300));

    const fileName = `surah-${String(target.num).padStart(3, '0')}-${target.name}.png`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    await page.screenshot({ path: filePath, type: 'png' });
    console.log(`Generated: ${fileName}`);

    generatedManifest.push({
      number: target.num,
      name: target.name,
      file: `/surah-frames/${fileName}`,
      ayahCount: target.ayahsCount,
      type: target.type
    });
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(generatedManifest, null, 2),
    'utf8'
  );

  await browser.close();
  console.log(`Batch complete! Generated ${generatedManifest.length} Surahs.`);
})();
