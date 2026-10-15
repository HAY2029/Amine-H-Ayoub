import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isKidsMode, hasKidsPin } from "@/data/kidsLock";

export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

// ── وضع المالك (المطوّر): يفتح لصاحب التطبيق المصحفَ وأدوات المحتوى لإكمال العمل ──
const OWNER_KEY = "mushaf:devReader";
/** هل وضع المالك مُفعَّل على هذا الجهاز؟ */
export const isMushafDevEnabled = (): boolean => {
  try { return localStorage.getItem(OWNER_KEY) === "1"; } catch { return false; }
};
export const setMushafDev = (on: boolean): void => {
  try { localStorage.setItem(OWNER_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mushaf:ownermode"));
};
/** المصحف مُتاح لجميع المستخدمين الآن. */
export const shouldHideMushaf = (): boolean => false;

export interface DownloadProgressPayload {
  surah_number: number;
  progress: number;
  status: "downloading" | "completed" | "error";
  downloaded_bytes?: number;
  total_bytes?: number;
}

/**
 * Checks if a Surah audio is downloaded locally.
 */
export async function checkOfflineStatus(surahNumber: number): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("check_offline_status", { surahNumber });
  } catch (e) {
    console.error("check_offline_status error:", e);
    return false;
  }
}

/**
 * Gets the local asset URL for a downloaded Surah audio.
 */
export async function getOfflineAudioUrl(surahNumber: number): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const path = await invoke<string>("get_offline_audio_url", { surahNumber });
    return convertFileSrc(path);
  } catch (e) {
    console.error("get_offline_audio_url error:", e);
    return null;
  }
}

/**
 * Initiates the download of a Surah audio in the Rust backend.
 */
export async function downloadSurah(audioUrl: string, surahNumber: number): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>("download_surah", { audioUrl, surahNumber });
  } catch (e) {
    console.error("download_surah error:", e);
    return null;
  }
}

/**
 * Listens to download progress events emitted by the Rust backend.
 */
export function listenToDownloadProgress(
  onProgress: (payload: DownloadProgressPayload) => void
): () => void {
  if (!isTauri()) return () => {};

  let unsubscribe: () => void = () => {};

  listen<DownloadProgressPayload>("download-progress", (event) => {
    onProgress(event.payload);
  }).then((unsub) => {
    unsubscribe = unsub;
  });

  return () => {
    unsubscribe();
  };
}

let bypassCloseLock = false;

/**
 * Intercepts Tauri window close requests when Kids Mode is active.
 */
export async function setupTauriCloseHandler(onRequestUnlock: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    const unlisten = await appWindow.onCloseRequested(async (event) => {
      if (bypassCloseLock) {
        // Legitimate close confirmed by user/parent - do not intercept!
        return;
      }
      if (isKidsMode() && hasKidsPin()) {
        event.preventDefault();
        onRequestUnlock();
      }
    });
    return unlisten;
  } catch (e) {
    console.warn("Tauri close handler setup:", e);
    return () => {};
  }
}

/**
 * Closes the application completely (Tauri native exit / window destroy).
 */
export async function closeTauriApp(): Promise<void> {
  bypassCloseLock = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("mushaf:flush_time"));
  }
  if (isTauri()) {
    try {
      await invoke("exit_app");
      return;
    } catch {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        await appWindow.destroy();
        return;
      } catch (e) {
        console.error("Failed to destroy Tauri window:", e);
      }
    }
  }
  if (typeof window !== "undefined") {
    try {
      window.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Opens an external URL safely in default system browser across Tauri desktop, mobile, and web.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  // الخروج من وضع ملء الشاشة أولاً لضمان فتح الروابط الخارجية بشكل صحيح (للويندوز والويب)
  if (typeof document !== "undefined" && document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }
  
  if (isTauri()) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      const isFs = await appWindow.isFullscreen();
      if (isFs) {
        await appWindow.setFullscreen(false);
      }
    } catch (e) {
      console.error("Failed to exit Tauri fullscreen:", e);
    }
    
    try {
      await invoke("plugin:opener|open_url", { url });
      return;
    } catch {
      try {
        await invoke("open_url", { url });
        return;
      } catch {
        // محاولة أخيرة داخل بيئة Tauri: window.open يفتح عبر نافذة النظام
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
    }
  }
  if (typeof window !== "undefined") {
    // استخدام عنصر a خفي لفرض فتح الرابط في تبويب خارجي/تطبيق خارجي لتجاوز بعض قيود المتصفحات
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Saves a base64 image string to the user's Downloads folder on Tauri.
 */
export async function saveBase64Image(base64Data: string, filename: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>("save_base64_image", { base64Data, filename });
  } catch (e) {
    console.error("Failed to save image via Tauri:", e);
    return null;
  }
}

/** Saves a generated image natively when available, with a browser download fallback. */
export async function saveImageDataUrl(dataUrl: string, filename: string): Promise<string | null> {
  if (isTauri()) {
    const savedPath = await saveBase64Image(dataUrl.split(",")[1] || "", filename);
    if (savedPath) return savedPath;
  }

  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return null;
}
