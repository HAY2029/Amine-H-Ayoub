const fs = require("fs");
const s = fs.readFileSync("src/pages/ShadingPage.tsx", "utf8");
console.log("SRC_LEN=" + s.length);
console.log("SRC_HAS_FILE_INPUT=" + s.includes('type=\\"file\\"'));
console.log("SRC_HAS_UPLOAD=" + s.includes("upload"));
console.log("SRC_HAS_LINK=" + s.includes("linkToCalibrateShading"));
console.log("SRC_HAS_FILEINPUT_REF=" + s.includes("fileInputRef"));
