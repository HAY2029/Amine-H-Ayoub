import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");

// These assets are not requested by the web application: installers are hosted
// on GitHub, store archives are source materials, and avatar originals are not
// used by the app. Keep the originals in public/ for project workflows.
const unusedDistAssets = [
  "downloads/1.0.0",
  "avatars/_originals",
  "google-play-assets-framed.zip",
  "google-play-assets.zip",
  "sample-fatiha-framed.png",
  "sample-ikhlas-framed.png",
  "fatiha-kids-framed.png",
  "ikhlas-kids-framed.png",
  "falaq-kids-framed.png",
  "nas-kids-framed.png",
  "surah-frames/surah-001-الفاتحة.png",
  "quran-kids-frame-enhanced.png",
];

let removedBytes = 0;
for (const relativePath of unusedDistAssets) {
  const target = path.resolve(distRoot, relativePath);
  if (!target.startsWith(`${distRoot}${path.sep}`)) continue;

  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      const measure = async (directory) => {
        let total = 0;
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const entryPath = path.join(directory, entry.name);
          total += entry.isDirectory() ? await measure(entryPath) : (await stat(entryPath)).size;
        }
        return total;
      };
      removedBytes += await measure(target);
    } else {
      removedBytes += info.size;
    }
    await rm(target, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log(`Removed ${ (removedBytes / 1024 / 1024).toFixed(1) } MB of unused files from dist/.`);
