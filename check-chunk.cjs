const fs = require("fs");
const f = "dist/assets/ShadingPage-BIPF9zHi.js";
if (!fs.existsSync(f)) { console.log("NOT_FOUND"); process.exit(0); }
const t = fs.readFileSync(f, "utf8");
console.log("LEN=" + t.length);
console.log("FILE=" + t.includes('type=\\"file\\\"'));
console.log("ONFILE=" + t.includes("onFile"));
console.log("LINK=" + t.includes("linkToCalibrateShading"));
console.log("UPLOAD=" + t.includes("upload"));
