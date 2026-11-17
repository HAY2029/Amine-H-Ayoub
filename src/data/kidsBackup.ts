/**
 * نسخ احتياطي واستعادة لتقدّم الطفل.
 *
 * المشكلة التي يحلّها هذا الملف: تقدّم الطفل موزّع على مفاتيح localStorage كثيرة
 * (الملفات، النجوم، الآيات المسموعة، الشارات، السلسلة اليومية، الشخصية، المتجر،
 * الجدول…). أي نسخة تُصدّر مفتاحاً واحداً تُشعِر الوالد بالأمان زوراً، لذلك يعمل
 * العقد هنا على **كل** المفاتيح ذات الصلة دفعة واحدة، مع استثناء صريح واحد:
 * الأسرار (رموز الدخول) والكاشات الضخمة التي لا معنى لنقلها بين الأجهزة.
 */

export const BACKUP_APP = "haj-amine-kids-backup";
export const BACKUP_VERSION = 1;

/** أقصى حجم مقبول لملف النسخة عند الاستعادة (حماية من ملفات تالفة/ضخمة). */
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

/** مفاتيح لا تُصدَّر إطلاقاً: أسرار الجهاز، رموز خارجية، حالة جلسة ولي الأمر. */
const EXCLUDED_EXACT = new Set<string>([
  "hf_token",
  "groq_token",
  "upload-desk:serverUrl",
  "mushaf:deviceId",
  "mushaf:metaUploadSig:v1",
  // رمز ولي الأمر وسؤاله السري: نقلها لجهاز آخر قد يُقفل الوالد خارج الإعدادات
  "mushaf:kidsPin",
  "mushaf:kidsSecurityQuestion",
  "mushaf:kidsSecurityAnswer",
  "mushaf:parentSessionUntil",
]);

/** كاشات ضخمة/خاصة بالجهاز: الصور المرفوعة والروابط المؤقتة. */
const EXCLUDED_PREFIXES = [
  "mushaf:cachedCustomImgs",
  "mushaf:hfImageSrcs",
  "mushaf:customPageImage:",
  "mushaf:customAudio:",
];

const COINS_FALLBACK_KEY = "mushaf:coins";
const PROFILES_KEY = "mushaf:profiles:v1";
const PROGRESS_KEY = "quran-progress";
const STREAK_KEY = "mushaf:dailyRewards:streaks";

export interface KidsBackupFile {
  app: string;
  version: number;
  exportedAt: string;
  entries: Record<string, string>;
}

export interface KidsBackupSummary {
  keyCount: number;
  sizeKb: number;
  profiles: number;
  coins: number;
  listenedAyahs: number;
  streakDays: number;
}

export type KidsBackupParseResult =
  | { ok: true; file: KidsBackupFile }
  | { ok: false; error: string };

const isExcluded = (key: string): boolean =>
  EXCLUDED_EXACT.has(key) || EXCLUDED_PREFIXES.some((prefix) => key.startsWith(prefix));

/** يجمع كل مفاتيح التطبيق القابلة للنقل من localStorage. */
function collectEntries(): Record<string, string> {
  const entries: Record<string, string> = {};
  if (typeof localStorage === "undefined") return entries;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || isExcluded(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return entries;
}

function safeParse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** أرقام ملخّصة تُعرض للوالد قبل التصدير وبعد اختيار ملف الاستعادة. */
export function summarizeBackupEntries(entries: Record<string, string>): KidsBackupSummary {
  const profilesRaw = safeParse<unknown>(entries[PROFILES_KEY], []);
  const profiles = Array.isArray(profilesRaw) ? profilesRaw : [];

  let coins = 0;
  for (const profile of profiles) {
    const value = (profile as { coins?: unknown }).coins;
    if (typeof value === "number" && Number.isFinite(value)) coins += value;
  }
  if (coins === 0) {
    const fallback = Number(entries[COINS_FALLBACK_KEY]);
    if (Number.isFinite(fallback) && fallback > 0) coins = fallback;
  }

  const progress = safeParse<{ listenedAyahs?: Record<string, number[]> }>(entries[PROGRESS_KEY], {});
  let listenedAyahs = 0;
  for (const list of Object.values(progress.listenedAyahs ?? {})) {
    if (Array.isArray(list)) listenedAyahs += list.length;
  }

  const streakRaw = safeParse<unknown>(entries[STREAK_KEY], 0);
  let streakDays = 0;
  if (typeof streakRaw === "number" && Number.isFinite(streakRaw)) streakDays = streakRaw;
  else if (streakRaw && typeof streakRaw === "object") {
    const candidate = streakRaw as { count?: unknown; current?: unknown; streak?: unknown };
    const value = candidate.count ?? candidate.current ?? candidate.streak;
    if (typeof value === "number" && Number.isFinite(value)) streakDays = value;
  }

  const sizeKb = Math.max(
    1,
    Math.round(
      Object.entries(entries).reduce((total, [key, value]) => total + key.length + value.length, 0) / 1024,
    ),
  );

  return {
    keyCount: Object.keys(entries).length,
    sizeKb,
    profiles: profiles.length,
    coins: Math.round(coins),
    listenedAyahs,
    streakDays,
  };
}

/** يبني ملف نسخة احتياطية كاملاً من الحالة الحالية. */
export function buildKidsBackup(): KidsBackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: collectEntries(),
  };
}

export const summarizeCurrentBackup = (): KidsBackupSummary =>
  summarizeBackupEntries(collectEntries());

const pad = (value: number) => String(value).padStart(2, "0");

/** اسم مقروء للملف: kids-backup-YYYY-MM-DD-HHMM.json */
export function backupFileName(date = new Date()): string {
  return `kids-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}.json`;
}

/** ينزّل الملف على الجهاز ويعيد اسمه (أو null عند تعذّر الإنشاء). */
export function downloadKidsBackup(): string | null {
  if (typeof document === "undefined") return null;
  const file = buildKidsBackup();
  const name = backupFileName();
  try {
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return name;
  } catch {
    return null;
  }
}

/** يتحقق من صحة ملف نسخة قادم من المستخدم قبل لمس أي بيانات. */
export function parseKidsBackup(raw: string): KidsBackupParseResult {
  if (!raw || raw.trim().length === 0) return { ok: false, error: "الملف فارغ." };
  if (raw.length > MAX_BACKUP_BYTES) return { ok: false, error: "حجم الملف أكبر من الحد المسموح." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "الملف ليس JSON صالحاً." };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "صيغة الملف غير معروفة." };

  const candidate = parsed as Partial<KidsBackupFile>;
  if (candidate.app !== BACKUP_APP) return { ok: false, error: "هذا الملف لا يخصّ نسخ تقدّم الأطفال." };
  if (typeof candidate.version !== "number" || !Number.isFinite(candidate.version)) {
    return { ok: false, error: "إصدار النسخة غير معروف." };
  }
  if (candidate.version > BACKUP_VERSION) {
    return { ok: false, error: "النسخة أحدث من إصدار التطبيق الحالي." };
  }
  if (!candidate.entries || typeof candidate.entries !== "object" || Array.isArray(candidate.entries)) {
    return { ok: false, error: "لا توجد بيانات قابلة للاستعادة داخل الملف." };
  }

  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidate.entries as Record<string, unknown>)) {
    if (typeof value !== "string") return { ok: false, error: `قيمة غير صالحة للمفتاح: ${key}` };
    if (!isExcluded(key)) entries[key] = value;
  }
  if (Object.keys(entries).length === 0) {
    return { ok: false, error: "الملف لا يحتوي أي بيانات يمكن استعادتها." };
  }

  return {
    ok: true,
    file: {
      app: BACKUP_APP,
      version: candidate.version,
      exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "",
      entries,
    },
  };
}

export interface KidsRestoreResult {
  restored: number;
  skipped: number;
  /** الحالة السابقة كاملة — للتراجع الفوري عن الاستعادة. */
  snapshot: Record<string, string>;
}

/**
 * يستعيد النسخة فوق الحالة الحالية، ويعيد لقطة من الحالة السابقة
 * حتى يمكن التراجع (فالاستعادة إجراء مدمّر بلا تراجع).
 */
export function restoreKidsBackup(file: KidsBackupFile): KidsRestoreResult {
  const snapshot = collectEntries();
  let restored = 0;
  let skipped = 0;

  for (const [key, value] of Object.entries(file.entries)) {
    if (isExcluded(key)) {
      skipped++;
      continue;
    }
    try {
      localStorage.setItem(key, value);
      restored++;
    } catch {
      skipped++;
    }
  }

  window.dispatchEvent(new Event("mushaf:kidsBackupRestored"));
  return { restored, skipped, snapshot };
}

/** يلغي استعادة سابقة بإرجاع الحالة التي كانت قبلها. */
export function undoRestore(snapshot: Record<string, string>): number {
  const current = collectEntries();
  for (const key of Object.keys(current)) {
    if (!(key in snapshot)) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }
  let written = 0;
  for (const [key, value] of Object.entries(snapshot)) {
    try {
      localStorage.setItem(key, value);
      written++;
    } catch {
      /* ignore */
    }
  }
  window.dispatchEvent(new Event("mushaf:kidsBackupRestored"));
  return written;
}

/** يقرأ ملفاً مختاراً من الجهاز ويعيد نتيجة التحقق. */
export async function readKidsBackupFile(file: File): Promise<KidsBackupParseResult> {
  try {
    if (file.size > MAX_BACKUP_BYTES) return { ok: false, error: "حجم الملف أكبر من الحد المسموح." };
    const text = await file.text();
    return parseKidsBackup(text);
  } catch {
    return { ok: false, error: "تعذّر قراءة الملف." };
  }
}
