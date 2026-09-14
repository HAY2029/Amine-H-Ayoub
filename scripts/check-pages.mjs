import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:5173";

async function collectErrors(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 500));
  });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 700)));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (/huggingface|supabase/.test(u)) errors.push("REQFAIL: " + u.slice(0, 200) + " -> " + (r.failure()?.errorText || ""));
  });
  return errors;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // 1) الصفحة الرئيسية
  const errHome = collectErrors(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => errHome.push("NAV: " + e));
  await page.waitForTimeout(6000);
  console.log("=== HOME ===");
  console.log((await errHome).slice(0, 10).join("\n") || "(لا أخطاء)");
  console.log("title:", await page.title());

  // 2) قارئ المصحف
  const errMushaf = collectErrors(page);
  await page.goto(BASE + "/mushaf", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => errMushaf.push("NAV: " + e));
  await page.waitForTimeout(9000);
  console.log("\n=== MUSHAF ===");
  const pageCount = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img")).filter((i) => (i.src || "").includes("pages"));
    return { imgs: imgs.length, firstSrcs: imgs.slice(0, 8).map((i) => i.src) };
  }).catch((e) => ({ err: String(e) }));
  console.log("pages images:", JSON.stringify(pageCount, null, 2));
  console.log("errors:", (await errMushaf).slice(0, 15).join("\n") || "(لا أخطاء)");

  // 3) مدير الصور
  const errIm = collectErrors(page);
  await page.goto(BASE + "/image-manager", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => errIm.push("NAV: " + e));
  await page.waitForTimeout(9000);
  console.log("\n=== IMAGE MANAGER ===");
  const imInfo = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img")).map((i) => i.src).filter(Boolean);
    const bodyText = document.body.innerText.slice(0, 300);
    return { imgCount: imgs.length, imgs: imgs.slice(0, 12), bodyText };
  }).catch((e) => ({ err: String(e) }));
  console.log(JSON.stringify(imInfo, null, 2));
  console.log("errors:", (await errIm).slice(0, 15).join("\n") || "(لا أخطاء)");

  await browser.close();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
