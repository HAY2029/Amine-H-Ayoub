import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const dir = 'C:/Users/ايمان/.gemini/antigravity-ide/brain/c4309d52-5d5c-45e3-b1ac-40bfdca36120';
const openPath = path.resolve(dir, 'final_edge_to_edge_open.png');
const collapsedPath = path.resolve(dir, 'final_edge_to_edge_collapsed.png');

async function snap() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox'],
    defaultViewport: { width: 500, height: 785, isMobile: true }
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:5173/#/audio', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.evaluate(() => {
    localStorage.setItem('mushaf:onboarded:v1', '1');
    sessionStorage.setItem('mushaf:pickedSession', '1');
    localStorage.setItem('app_intro_seen_device_v3', 'true');
    sessionStorage.setItem('app_intro_seen_session_v3', 'true');
    localStorage.setItem('mushaf:notif:lesson', new Date().toDateString());
  });
  await page.goto('http://localhost:5173/#/audio', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await new Promise(r => setTimeout(r, 2000));
  
  // 1. Capture with bar open (both picture & bar visible, no external colors)
  await page.screenshot({ path: openPath });
  console.log('Saved open view to', openPath);

  // 2. Click collapse chevron to test collapsed view
  const collapseBtn = await page.$('button[title*="إخفاء الشريط"]');
  if (collapseBtn) {
    await collapseBtn.click();
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: collapsedPath });
    console.log('Saved collapsed view to', collapsedPath);
  }

  await browser.close();
}

snap().catch((err) => {
  console.error(err);
  process.exit(1);
});
