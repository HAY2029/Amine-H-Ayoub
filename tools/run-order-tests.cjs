// tools/_run-tests.cjs — يشغّل الاختبار ويكتب الناتج UTF-8 (لتجاوز تشويش PowerShell)
const { execFileSync } = require("child_process");
const fs = require("fs");
try {
  const out = execFileSync(process.execPath, [__dirname + "/test-order-logic.cjs"], { encoding: "utf8" });
  fs.writeFileSync(__dirname + "/../test-result.txt", out, "utf8");
  console.log("EXIT=0");
} catch (e) {
  fs.writeFileSync(__dirname + "/../test-result.txt", String(e.stdout || "") + "\n--- STDERR ---\n" + String(e.stderr || ""), "utf8");
  console.log("EXIT=" + (e.status ?? 1));
}