const fs = require('fs');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 576 });
  const imgBase64 = fs.readFileSync('public/quran-kids-frame.jpg').toString('base64');
  
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body>
      <img id="img" src="data:image/jpeg;base64,${imgBase64}" />
      <canvas id="c" width="1024" height="576"></canvas>
    </body>
    </html>
  `);

  await page.waitForSelector('#img');
  
  const result = await page.evaluate(() => {
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    const img = document.getElementById('img');
    ctx.drawImage(img, 0, 0, 1024, 576);
    const data = ctx.getImageData(0, 0, 1024, 576).data;
    
    // Find bounds of light parchment/cream area
    let minX = 1024, maxX = 0, minY = 576, maxY = 0;
    for (let y = 60; y < 500; y++) {
      for (let x = 120; x < 900; x++) {
        const i = (y * 1024 + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // cream color is high R, high G, slightly lower B
        if (r > 245 && g > 235 && b > 215) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  });

  console.log('Result:', JSON.stringify(result));
  await browser.close();
})();
