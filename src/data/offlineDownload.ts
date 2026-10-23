/**
 * تنزيل كل المحتوى إلى الجهاز للعمل دون إنترنت.
 * يجلب صوت كل السور وصور الصفحات؛ يخزّنها مخبأ الخدمة (PWA runtimeCaching)
 * فتعمل دون اتصال بعد التنزيل. (الصور المرفوعة محفوظة أصلاً في IndexedDB.)
 */
import { getAllSurahs } from "./quranData";
import { fetchAudioWithRetry, fetchSurahAudio, getSurahAudioCandidates, reportHuggingFaceFailure } from "./audioUrls";
import { isAudioCachedOffline, saveAudioToCache } from "./offlineAudioCache";
import { downloadSurah as downloadTauriSurah, isTauri, listenToDownloadProgress } from "@/utils/tauriUtils";

const DONE_KEY = "mushaf:offlineDownloaded";

export interface AssetDownloadItem {
  type: "audio" | "page";
  url: string;
  surahNumber?: number;
}

export interface SurahDownloadProgress {
  progress: number;
  status: "downloading" | "completed" | "error";
  receivedBytes?: number;
  totalBytes?: number;
  speed?: number; // bytes per second
  serverName?: string;
  error?: string;
}

/** Explicit, durable single-Surah download using the currently selected provider and fallback. */
export async function downloadSurahOffline(
  surahNumber: number,
  preferredUrl?: string,
  onProgress?: (progress: SurahDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const candidateUrl = preferredUrl || getSurahAudioCandidates(surahNumber)[0];
  if (await isAudioCachedOffline(surahNumber, candidateUrl)) {
    onProgress?.({ progress: 100, status: "completed" });
    return;
  }

  const candidates = getSurahAudioCandidates(surahNumber);
  const customAudio = preferredUrl && !preferredUrl.includes("huggingface.co/datasets/hammoualiyoucef20/quran-audio")
    && !preferredUrl.includes("archive.org") && !preferredUrl.includes("ia803201.us.archive.org");
  const urls = customAudio ? [preferredUrl, ...candidates] : candidates;
  let lastError: unknown;

  for (const url of urls) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const serverName = url.includes("huggingface.co")
      ? "سيرفر Hugging Face فائق السرعة"
      : "سيرفر الأرشيف (Internet Archive)";

    try {
      if (isTauri()) {
        const unsub = listenToDownloadProgress((p) => {
          if (p.surah_number === surahNumber) {
            onProgress?.({
              progress: Math.round(p.progress),
              status: p.status,
              receivedBytes: p.downloaded_bytes,
              totalBytes: p.total_bytes,
              serverName,
            });
          }
        });
        try {
          const path = await downloadTauriSurah(url, surahNumber);
          if (path) {
            onProgress?.({ progress: 100, status: "completed", serverName });
            return;
          }
          if (url.includes("huggingface.co/datasets/hammoualiyoucef20/quran-audio")) reportHuggingFaceFailure();
          throw new Error(`Download failed from ${new URL(url).hostname}`);
        } finally {
          unsub();
        }
      }

      let resolvedUrl = url;
      let response: Response;
      if (url === candidates[0] && (url.includes("huggingface.co/datasets/hammoualiyoucef20/quran-audio") || url.includes("ia803201.us.archive.org"))) {
        const resolved = await fetchSurahAudio(surahNumber, signal);
        response = resolved.response;
        resolvedUrl = resolved.url;
      } else {
        response = await fetchAudioWithRetry(url, signal, 2);
      }
      if (!response.ok) {
        if (response.status === 404 || response.status === 429 || response.status >= 500) {
          lastError = new Error(`Audio server returned HTTP ${response.status}`);
          continue;
        }
        throw new Error(`Audio download failed: HTTP ${response.status}`);
      }

      const total = Number(response.headers.get("Content-Length")) || 0;
      const chunks: Uint8Array[] = [];
      let received = 0;
      const startTime = performance.now();
      let lastReportTime = 0;

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          if (signal?.aborted) {
            await reader.cancel();
            throw new DOMException("Aborted", "AbortError");
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.byteLength;
            const now = performance.now();
            if (now - lastReportTime > 50 || (total > 0 && received >= total)) {
              lastReportTime = now;
              const elapsedSec = (now - startTime) / 1000;
              const speed = elapsedSec > 0 ? received / elapsedSec : 0;
              const progressVal = total > 0
                ? Math.min(99, Math.round((received / total) * 100))
                : Math.min(95, Math.round((received / (3.5 * 1024 * 1024)) * 100));

              onProgress?.({
                progress: progressVal,
                status: "downloading",
                receivedBytes: received,
                totalBytes: total > 0 ? total : undefined,
                speed,
                serverName,
              });
            }
          }
        }
      } else {
        const buf = await response.arrayBuffer();
        chunks.push(new Uint8Array(buf));
        received = buf.byteLength;
      }
      const blobParts = chunks.map(chunk => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
      const blob = new Blob(blobParts, { type: "audio/mpeg" });
      if (!blob.size) throw new Error("Downloaded audio file is empty");
      await saveAudioToCache(resolvedUrl, surahNumber, blob);
      onProgress?.({
        progress: 100,
        status: "completed",
        receivedBytes: received,
        totalBytes: received,
        serverName,
      });
      return;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }

  const errMessage = lastError instanceof Error ? lastError.message : "تعذر التحميل من جميع السيرفرات المتوفرة";
  onProgress?.({ progress: 0, status: "error", error: errMessage });
  throw lastError instanceof Error ? lastError : new Error(errMessage);
}

export const collectAssets = (): AssetDownloadItem[] => {
  const items: AssetDownloadItem[] = [];
  const surahs = getAllSurahs();
  for (const s of surahs) {
    items.push({
      type: "audio",
      url: getSurahAudioCandidates(s.number)[0],
      surahNumber: s.number,
    });
  }
  // ملاحظة: نُحمّل الملفات الصوتية فقط — صور صفحات المصحف مُستبعدة حالياً
  return items;
};

export const isDownloaded = (): boolean => {
  try { return !!localStorage.getItem(DONE_KEY); } catch { return false; }
};

/** ينزّل التلاوات الصوتية ويحفظها في الكاش وIndexedDB وقرص Tauri للعمل التام دون إنترنت */
export const downloadEverything = async (
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ ok: number; fail: number; total: number; aborted?: boolean }> => {
  const items = collectAssets();
  let done = 0, ok = 0, fail = 0;

  for (const item of items) {
    if (signal?.aborted) break;
    try {
      await downloadSurahOffline(item.surahNumber!, item.url, undefined, signal);
      ok++;
    } catch (error) {
      if (signal?.aborted) break;
      fail++;
    }
    done++;
    onProgress?.(done, items.length);
  }

  if (ok > 0) {
    try { localStorage.setItem(DONE_KEY, new Date().toISOString()); } catch { /* ignore */ }
  }
  return { ok, fail, total: items.length, aborted: signal?.aborted };
};

