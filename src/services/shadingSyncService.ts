import { supabase, hasValidSupabaseKey } from "../lib/supabase";

const SHADING_STORAGE_KEY = "mushaf:shadingSettings:v2";

export interface PresetColor {
  key: string;
  label: string;
  hex: string;
  glowHex: string;
}

export const PRESET_SHADING_COLORS: PresetColor[] = [
  { key: "gold", label: "ذهبي", hex: "#f59e0b", glowHex: "#d97706" },
  { key: "sky", label: "سماوي", hex: "#0ea5e9", glowHex: "#0284c7" },
  { key: "mint", label: "نعناعي", hex: "#10b981", glowHex: "#059669" },
  { key: "rose", label: "وردي", hex: "#ec4899", glowHex: "#db2777" },
  { key: "violet", label: "بنفسجي", hex: "#8b5cf6", glowHex: "#7c3aed" },
  { key: "orange", label: "برتقالي", hex: "#f97316", glowHex: "#ea580c" },
  { key: "emerald", label: "زمردي", hex: "#059669", glowHex: "#047857" },
  { key: "coral", label: "مرجاني", hex: "#ef4444", glowHex: "#dc2626" },
];

export interface ShadingSettings {
  theme: string;           // "gold" | "mint" | "pink" | "custom"
  opacity: number;         // 0.3 - 1.0
  hidden: boolean;         // إخفاء التظليل بالكامل
  speaker: string;         // "teacher" | "kids"
  teacherColor: string;    // اللون المخصص للمعلّم (hex أو اسم)
  kidsColor: string;       // اللون المخصص للطفل (hex أو اسم)
  updatedAt?: string;      // ISO timestamp
}

export const DEFAULT_SETTINGS: ShadingSettings = {
  theme: "gold",
  opacity: 0.6,
  hidden: false,
  speaker: "teacher",
  teacherColor: "#f59e0b", // ذهبي كهرماني مشرق
  kidsColor: "#0ea5e9",    // سماوي مبهج ومريح للطفل
};

/** تحويل كود Hex أو اسم لون إلى صيغة rgba مدعومة */
export function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return `rgba(245, 158, 11, ${alpha})`;
  if (hex.startsWith("rgba")) {
    return hex.replace(/[\d\.]+\)$/, `${alpha})`);
  }
  if (hex.startsWith("rgb")) {
    return hex.replace("rgb", "rgba").replace(")", `, ${alpha})`);
  }
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map(c => c + c).join("");
  }
  if (clean.length !== 6) return `rgba(245, 158, 11, ${alpha})`;
  const num = parseInt(clean, 16);
  if (isNaN(num)) return `rgba(245, 158, 11, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** استخراج نمط التظليل (fill, stroke, glow) لأي لون وشفافية */
export function getAyahShadingStyle(colorHex: string, opacity: number) {
  const safeColor = colorHex || "#f59e0b";
  return {
    fill: hexToRgba(safeColor, Math.min(0.85, Math.max(0.18, opacity * 0.7))),
    stroke: hexToRgba(safeColor, Math.min(0.98, Math.max(0.45, opacity * 1.05))),
    glow: hexToRgba(safeColor, 0.9),
    text: safeColor,
  };
}

/** ─── قراءة محلية سريعة (بدون شبكة) ─── */
export const getLocalShadingSettings = (): ShadingSettings => {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SHADING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ShadingSettings>;
      // إذا كانت القيم القديمة لا تحوي ألوان المعلم/الطفل المنفصلة
      let teacherColor = parsed.teacherColor;
      let kidsColor = parsed.kidsColor;
      if (!teacherColor) {
        if (parsed.theme === "mint") teacherColor = "#10b981";
        else if (parsed.theme === "rose" || parsed.theme === "pink") teacherColor = "#ec4899";
        else teacherColor = DEFAULT_SETTINGS.teacherColor;
      }
      if (!kidsColor) {
        if (parsed.theme === "mint") kidsColor = "#f59e0b";
        else if (parsed.theme === "rose" || parsed.theme === "pink") kidsColor = "#8b5cf6";
        else kidsColor = DEFAULT_SETTINGS.kidsColor;
      }
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        teacherColor,
        kidsColor,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
};

/** ─── حفظ محلي فوري (بدون انتظار السيرفر) ─── */
export const saveLocalShadingSettings = (settings: Partial<ShadingSettings>): ShadingSettings => {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const current = getLocalShadingSettings();
  const updated: ShadingSettings = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(SHADING_STORAGE_KEY, JSON.stringify(updated));
    if (typeof updated.opacity === "number") localStorage.setItem("mushaf:shadingOpacity:v1", String(updated.opacity));
    if (typeof updated.hidden === "boolean") {
      if (updated.hidden) localStorage.setItem("mushaf:hideShading", "1");
      else localStorage.removeItem("mushaf:hideShading");
    }
    if (updated.theme) localStorage.setItem("mushaf:shadingTheme:v1", updated.theme);
  } catch { /* ignore */ }

  window.dispatchEvent(new CustomEvent("mushaf:shading_changed", { detail: updated }));
  window.dispatchEvent(new Event("mushaf:sync_complete"));
  return updated;
};

/** ─── مزامنة من السيرفر (جلب أحدث إعدادات التظليل) ─── */
export const syncShadingFromServer = async (): Promise<ShadingSettings> => {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  if (typeof navigator !== "undefined" && !navigator.onLine) return getLocalShadingSettings();
  if (!hasValidSupabaseKey()) return getLocalShadingSettings();

  try {
    const { data } = await supabase
      .from("store")
      .select("value")
      .eq("key", SHADING_STORAGE_KEY)
      .maybeSingle();

    if (data && data.value) {
      const serverSettings = data.value as ShadingSettings;
      // حفظ محلياً أيضاً
      localStorage.setItem(SHADING_STORAGE_KEY, JSON.stringify(serverSettings));
      return { ...DEFAULT_SETTINGS, ...serverSettings };
    }
    return getLocalShadingSettings();
  } catch (e) {
    console.debug("Shading sync from server info:", e);
    return getLocalShadingSettings();
  }
};

let shadingSyncTimer: any = null;

/** ─── حفظ فوري محلياً وعبر السيرفر في الخلفية (تحديث فوري لـ state بدون انتظار) ─── */
export const applyAndSaveShading = (settings: Partial<ShadingSettings>): ShadingSettings => {
  const updated = saveLocalShadingSettings(settings);
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.onLine && hasValidSupabaseKey()) {
    if (shadingSyncTimer) clearTimeout(shadingSyncTimer);
    shadingSyncTimer = setTimeout(() => {
      supabase
        .from("store")
        .upsert(
          { key: SHADING_STORAGE_KEY, value: updated },
          { onConflict: "key" }
        )
        .then(
          () => {},
          (err: unknown) => console.debug("Shading cloud sync:", err)
        );
    }, 1000);
  }
  return updated;
};

/** ─── حفظ على السيرفر (upsert) ─── */
export const saveShadingToServer = async (settings: Partial<ShadingSettings>) => {
  return applyAndSaveShading(settings);
};

/** ─── مزامنة ثنائية الاتجاه: سحب + رفع ─── */
export const syncShadingBidirectional = async (
  localSettings: ShadingSettings
): Promise<ShadingSettings> => {
  if (typeof window === "undefined") return localSettings;
  if (typeof navigator !== "undefined" && !navigator.onLine) return localSettings;
  if (!hasValidSupabaseKey()) return localSettings;

  try {
    // جلب من السيرفر
    const { data } = await supabase
      .from("store")
      .select("value")
      .eq("key", SHADING_STORAGE_KEY)
      .maybeSingle();

    const serverSettings = data?.value as ShadingSettings | undefined;

    // مقارنة: المحلي أحدث أم السيرفر؟
    if (serverSettings?.updatedAt && localSettings.updatedAt) {
      const serverTime = new Date(serverSettings.updatedAt).getTime();
      const localTime = new Date(localSettings.updatedAt).getTime();

      if (serverTime > localTime) {
        // السيرفر أحدث — استخدمه
        localStorage.setItem(SHADING_STORAGE_KEY, JSON.stringify(serverSettings));
        return { ...DEFAULT_SETTINGS, ...serverSettings };
      }
    }

    // المحلي أحدث أو لا يوجد سيرفر — رفعه
    if (localSettings.updatedAt) {
      await supabase.from("store").upsert(
        { key: SHADING_STORAGE_KEY, value: localSettings },
        { onConflict: "key" }
      );
    }

    return localSettings;
  } catch (e) {
    console.debug("Bidirectional shading sync info:", e);
    return localSettings;
  }
};

