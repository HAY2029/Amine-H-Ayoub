import { supabase } from "../integrations/supabase/client";

const BACKUP_KEY = "mushaf:calibrationBackupCjs:v1";
const COORDINATES_KEY = "mushaf:ayahCoordinates:v1";
const REGIONS_KEY = "mushaf:surahRegions:v1";

const readLocalStorage = (key: string): Record<string, unknown> => {
  if (typeof window === "undefined") return {};

  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};

const createSnapshot = (options: {
  coordinates?: Record<string, unknown>;
  regions?: Record<string, unknown>;
  savedAt?: string;
} = {}): string => {
  const payload = {
    app: "learn-quran-kids",
    version: 1,
    generatedAt: options.savedAt || new Date().toISOString(),
    keys: {
      coordinates: COORDINATES_KEY,
      regions: REGIONS_KEY,
    },
    coordinates: options.coordinates || {},
    regions: options.regions || {},
  };

  return `module.exports = ${JSON.stringify(payload, null, 2)};\n`;
};

export const saveCalibrationCjsSnapshot = async (): Promise<string> => {
  if (typeof window === "undefined") return "";

  const coordinates = readLocalStorage(COORDINATES_KEY);
  const regions = readLocalStorage(REGIONS_KEY);
  const savedAt = new Date().toISOString();
  const snapshot = createSnapshot({ coordinates, regions, savedAt });

  try {
    localStorage.setItem(BACKUP_KEY, snapshot);
  } catch {
    // Continue with the server backup if local storage is unavailable.
  }

  try {
    await supabase.from("store").upsert({
      key: BACKUP_KEY,
      value: { snapshot, savedAt, coordinates, regions },
    });
  } catch (error) {
    console.debug("Calibration backup save info:", error);
  }

  return snapshot;
};

export const downloadCalibrationCjsSnapshot = (snapshot?: string): void => {
  if (typeof window === "undefined") return;

  const content = snapshot || localStorage.getItem(BACKUP_KEY) || "module.exports = {};\n";
  const blob = new Blob([content], { type: "application/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mushaf-calibration-backup-${Date.now()}.cjs`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};