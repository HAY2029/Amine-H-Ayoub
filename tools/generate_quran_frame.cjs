const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const INPUT_IMAGE = path.resolve('public/quran-kids-frame.jpg');

// Let's create an ultra-high quality HTML/CSS renderer
async function renderSurahFrame(surahTitle, basmala, ayahs, surahMeta, outputPath) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const imgBase64 = fs.readFileSync(INPUT_IMAGE).toString('base64');

  // Tajweed coloration helper
  function colorizeAyah(text) {
    let t = text;
    // Replace ayah brackets or end marks if any
    return t;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@700;800;900&family=Reem+Kufi:wght@600;700&display=swap" rel="stylesheet">
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

        /* 1. Base Image */
        .base-frame {
          position: absolute;
          inset: 0;
          width: 1920px;
          height: 1080px;
          object-fit: cover;
          z-index: 1;
        }

        /* 2. Softened Outer Background ("تنعيم الخلفية الخارجية") */
        /* We apply a soft blur layer with a cutout mask for the main frame & characters so they stay super crisp! */
        .soft-backdrop {
          position: absolute;
          inset: 0;
          width: 1920px;
          height: 1080px;
          z-index: 2;
          background-image: url('data:image/jpeg;base64,${imgBase64}');
          background-size: 1920px 1080px;
          filter: blur(8px) saturate(0.85) brightness(0.98);
          /* Cutout mask keeping the central arch, the boy, girl, reciter and Tajweed guide sharp */
          mask-image: radial-gradient(ellipse 65% 58% at 50% 48%, transparent 40%, rgba(0,0,0,0.6) 80%, black 100%);
          -webkit-mask-image: radial-gradient(ellipse 65% 58% at 50% 48%, transparent 40%, rgba(0,0,0,0.6) 80%, black 100%);
          pointer-events: none;
        }

        /* 3. Subtle Inner Watermark/Pattern ("خلفية خفيفة ناعمة خلف نص السورة") */
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
            radial-gradient(circle at center, rgba(255,255,255,0.4) 0%, rgba(253, 248, 237, 0.1) 70%),
            url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23b8860b' stroke-width='0.75' stroke-opacity='0.08'%3E%3Cpath d='M40 0 L80 40 L40 80 L0 40 Z'/%3E%3Ccircle cx='40' cy='40' r='25'/%3E%3Ccircle cx='40' cy='40' r='14'/%3E%3Cpath d='M0 0 L80 80 M80 0 L0 80'/%3E%3C/g%3E%3C/svg%3E");
          background-repeat: repeat;
        }

        /* 4. Surah Content Area in Center */
        .surah-container {
          position: absolute;
          left: 330px;
          top: 175px;
          width: 1260px;
          height: 660px;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px 40px;
          text-align: center;
          direction: rtl;
        }

        /* Ornate Surah Header */
        .surah-header-badge {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 6px 36px 8px 36px;
          background: linear-gradient(180deg, #ffffff 0%, #fbf6ea 100%);
          border: 2px solid #d4af37;
          border-radius: 40px;
          box-shadow: 0 4px 15px rgba(184, 134, 11, 0.18), inset 0 0 0 2px rgba(255, 255, 255, 0.9);
          margin-bottom: 12px;
          position: relative;
        }

        .surah-header-badge::before,
        .surah-header-badge::after {
          content: '❖';
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          color: #c59b27;
          font-size: 18px;
        }
        .surah-header-badge::before { right: 14px; }
        .surah-header-badge::after { left: 14px; }

        .surah-title {
          font-family: 'Cairo', 'Reem Kufi', sans-serif;
          font-weight: 900;
          font-size: 32px;
          color: #1b4332; /* Deep noble forest green */
          letter-spacing: 0.5px;
          line-height: 1.2;
          text-shadow: 0 1px 2px rgba(0,0,0,0.06);
        }

        .surah-meta {
          font-family: 'Cairo', sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: #8c6a23;
          margin-top: -2px;
        }

        /* Basmala */
        .basmala-text {
          font-family: 'Amiri Quran', 'Amiri', serif;
          font-size: 34px;
          color: #2c3e50;
          margin-bottom: 14px;
          text-shadow: 0 1px 1px rgba(0,0,0,0.05);
          line-height: 1.4;
        }

        /* Ayahs Container */
        .ayahs-box {
          width: 100%;
          max-height: 480px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 6px 12px;
          line-height: 2.1;
        }

        .ayah-phrase {
          font-size: ${ayahs.length <= 4 ? '38px' : (ayahs.length <= 7 ? '32px' : '26px')};
          color: #1a252f;
          font-weight: 400;
          display: inline;
          letter-spacing: 0.3px;
        }

        /* Ornamental Golden Ayah Number Symbol */
        .ayah-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin: 0 6px;
          color: #b8860b;
          font-family: 'Amiri', serif;
          font-weight: 700;
          font-size: 0.9em;
          vertical-align: middle;
          white-space: nowrap;
        }

        /* Tajweed Highlights */
        .tajweed-ghunnah { color: #27ae60; font-weight: 600; } /* أخضر - إخفاء وغنة */
        .tajweed-madd-6 { color: #8e24aa; font-weight: 600; } /* بنفسجي - مد لازم */
        .tajweed-madd-246 { color: #d35400; font-weight: 600; } /* برتقالي - مد جائز */
        .tajweed-madd-2 { color: #b78103; font-weight: 600; } /* أصفر ذهبي - مد حركتان */
        .tajweed-qalqalah { color: #0288d1; font-weight: 600; } /* أزرق - قلقلة */
        .tajweed-tafkheem { color: #1a365d; font-weight: 700; } /* كحلي - تفخيم */
      </style>
    </head>
    <body>
      <!-- 1. Original Image Frame -->
      <img class="base-frame" src="data:image/jpeg;base64,${imgBase64}" alt="Quran Frame" />

      <!-- 2. Softened Ambient Backdrop ("تنعيم الخلفية الخارجية") -->
      <div class="soft-backdrop"></div>

      <!-- 3. Gentle Warm Islamic Watermark ("خلفية خفيفة ناعمة خلف نص السورة") -->
      <div class="inner-watermark"></div>

      <!-- 4. The Surah in the White Space ("مكان ابيض فيه سورة") -->
      <div class="surah-container">
        ${surahTitle ? `
          <div class="surah-header-badge">
            <div class="surah-title">${surahTitle}</div>
            ${surahMeta ? `<div class="surah-meta">${surahMeta}</div>` : ''}
          </div>
        ` : ''}

        ${basmala ? `<div class="basmala-text">${basmala}</div>` : ''}

        <div class="ayahs-box">
          ${ayahs.map((a, i) => `
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

  // Wait a moment for web fonts
  await new Promise(r => setTimeout(r, 600));

  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();
  console.log('Saved rendered Surah frame to:', outputPath);
}

// Generate Surat Al-Fatiha, Al-Ikhlas, Al-Falaq, An-Nas
(async () => {
  console.log('Rendering Surahs with pristine DOM typography & Tajweed aesthetics...');

  // 1. Surat Al-Fatiha
  await renderSurahFrame(
    "سُورَةُ الفَاتِحَةِ",
    "", // Basmala is ayah 1
    [
      { text: "بِسْمِ <span class='tajweed-tafkheem'>اللَّهِ</span> الرَّحْمَٰنِ الرَّحِيمِ" },
      { text: "الْحَمْدُ <span class='tajweed-tafkheem'>لِلَّهِ</span> رَبِّ الْعَالَمِينَ" },
      { text: "الرَّحْمَٰنِ الرَّحِيمِ" },
      { text: "مَالِكِ يَوْمِ الدِّينِ" },
      { text: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ" },
      { text: "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ" },
      { text: "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا <span class='tajweed-madd-6'>الضَّالِّينَ</span>" }
    ],
    "آيَاتُهَا ٧ — مَكِّيَّةٌ",
    path.resolve('public/fatiha-kids-framed.png')
  );

  // 2. Surat Al-Ikhlas
  await renderSurahFrame(
    "سُورَةُ الإِخْلَاصِ",
    "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    [
      { text: "قُلْ هُوَ <span class='tajweed-tafkheem'>اللَّهُ</span> أَحَدٌ" },
      { text: "<span class='tajweed-tafkheem'>اللَّهُ</span> الصَّمَدُ" },
      { text: "لَمْ يَلِ<span class='tajweed-qalqalah'>دْ</span> وَلَمْ يُولَ<span class='tajweed-qalqalah'>دْ</span>" },
      { text: "وَلَمْ يَكُ<span class='tajweed-ghunnah'>ن لَّهُ</span> كُفُوًا أَحَدٌ" }
    ],
    "آيَاتُهَا ٤ — مَكِّيَّةٌ",
    path.resolve('public/ikhlas-kids-framed.png')
  );

  // 3. Surat An-Nas
  await renderSurahFrame(
    "سُورَةُ النَّاسِ",
    "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    [
      { text: "قُلْ أَعُوذُ بِرَبِّ <span class='tajweed-ghunnah'>النَّاسِ</span>" },
      { text: "مَلِكِ <span class='tajweed-ghunnah'>النَّاسِ</span>" },
      { text: "إِلَٰهِ <span class='tajweed-ghunnah'>النَّاسِ</span>" },
      { text: "مِ<span class='tajweed-ghunnah'>ن شَ</span>رِّ الْوَسْوَاسِ الْخَ<span class='tajweed-ghunnah'>نَّاسِ</span>" },
      { text: "الَّذِي يُوَسْوِسُ فِي صُدُورِ <span class='tajweed-ghunnah'>النَّاسِ</span>" },
      { text: "مِنَ الْجِ<span class='tajweed-ghunnah'>نَّةِ</span> وَ<span class='tajweed-ghunnah'>النَّاسِ</span>" }
    ],
    "آيَاتُهَا ٦ — مَكِّيَّةٌ",
    path.resolve('public/nas-kids-framed.png')
  );

  // 4. Surat Al-Falaq
  await renderSurahFrame(
    "سُورَةُ الفَلَقِ",
    "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    [
      { text: "قُلْ أَعُوذُ بِرَبِّ الْفَلَ<span class='tajweed-qalqalah'>قِ</span>" },
      { text: "مِ<span class='tajweed-ghunnah'>ن شَ</span>رِّ مَا خَلَ<span class='tajweed-qalqalah'>قَ</span>" },
      { text: "وَمِ<span class='tajweed-ghunnah'>ن شَ</span>رِّ غَاسِ<span class='tajweed-ghunnah'>قٍ إِ</span>ذَا وَقَ<span class='tajweed-qalqalah'>بَ</span>" },
      { text: "وَمِ<span class='tajweed-ghunnah'>ن شَ</span>رِّ <span class='tajweed-ghunnah'>النَّ</span>فَّاثَاتِ فِي الْعُقَ<span class='tajweed-qalqalah'>دِ</span>" },
      { text: "وَمِ<span class='tajweed-ghunnah'>ن شَ</span>رِّ حَاسِ<span class='tajweed-ghunnah'>دٍ إِ</span>ذَا حَسَ<span class='tajweed-qalqalah'>دَ</span>" }
    ],
    "آيَاتُهَا ٥ — مَكِّيَّةٌ",
    path.resolve('public/falaq-kids-framed.png')
  );

  console.log('All Surah frames rendered successfully!');
})();
