const fetch = require("node-fetch");

async function main() {
  try {
    const r = await fetch("https://hay2023.github.io/Amine-H-Ayoub/shading");
    const t = await r.text();
    console.log("MAIN_STATUS=" + r.status);
    console.log("HAS_FILE_INPUT=" + t.includes('type="file"'));
    console.log("HAS_SHADING_TITLE=" + t.includes("التظليل"));
    console.log("LEN=" + t.length);
  } catch (e) {
    console.log("ERR=" + e.message);
  }
}
main();

