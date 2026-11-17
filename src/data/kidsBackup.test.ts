import { describe, it, expect, beforeEach } from "vitest";
import {
  buildKidsBackup,
  parseKidsBackup,
  restoreKidsBackup,
  undoRestore,
  summarizeBackupEntries,
  downloadKidsBackup,
  backupFileName,
} from "./kidsBackup";

const seed = (key: string, value: string) => localStorage.setItem(key, value);

const realisticChildData = () => {
  const profiles = [
    {
      id: "kid-1",
      name: "أحمد",
      age: 7,
      avatar: "img-boy-2",
      color: "from-sky-400 to-blue-500",
      goalMinutes: 10,
      playMinutes: 15,
      reward: "رحلة عائلية",
      lessonTime: "17:00",
      coins: 340,
      inventory: ["av-img-boy-2", "color-gold"],
      currentSurah: 2,
      gender: "boy",
    },
    {
      id: "kid-2",
      name: "مريم",
      age: 5,
      avatar: "img-girl-1",
      color: "from-rose-400 to-pink-500",
      goalMinutes: 5,
      playMinutes: 10,
      reward: "قصة قبل النوم",
      lessonTime: "",
      coins: 120,
      inventory: [],
      currentSurah: 1,
      gender: "girl",
    },
  ];
  seed("mushaf:profiles:v1", JSON.stringify(profiles));
  seed("mushaf:activeProfile:v1", JSON.stringify({ id: "kid-1" }));
  seed("mushaf:coins", "340");
  seed("quran-progress", JSON.stringify({ points: 340, listenedAyahs: { "1": [1, 2, 3], "2": [1, 2, 3, 4, 5] } }));
  seed("mushaf:kidsProgress:v1:kid-1", JSON.stringify({ date: "2026-11-16", minutes: 12, unlocked: true, played: 8, playExpired: false }));
  seed("mushaf:kidsHistory:v1:kid-1", JSON.stringify([{ date: "2026-11-15", minutes: 9, played: 6 }]));
  seed("kids:achievements:v1", JSON.stringify({ unlocked: ["first-surah", "five-days"], meta: { last: "2026-11-16" } }));
  seed("mushaf:dailyRewards:streaks", JSON.stringify({ count: 7, lastClaim: "2026-11-16" }));
  seed("mushaf:badge_unlocked", JSON.stringify(["surah-1-complete"]));
  seed("mushaf:games_unlocked", "kid-1");
  seed("mushaf:kidsSchedule", JSON.stringify({ start: "16:00", end: "19:00" }));
  // أسرار وكاشات يجب ألا تُصدَّر
  seed("hf_token", "hf_secret_123");
  seed("groq_token", "groq_secret_456");
  seed("mushaf:kidsPin", "1234");
  seed("mushaf:deviceId", "device-xyz");
  seed("mushaf:customAudio:1", "https://files.example.com/audio/1.mp3");
};

beforeEach(() => localStorage.clear());

describe("kidsBackup: عقد النسخ الاحتياطي لتقدّم الطفل", () => {
  it("تصدير ثم استعادة على جهاز ثانٍ يعيد كل بيانات الطفل كما هي", () => {
    realisticChildData();
    const before: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      before[key] = localStorage.getItem(key)!;
    }

    const backup = buildKidsBackup();
    expect(backup.app).toBe("haj-amine-kids-backup");

    // محاكاة جهاز ثانٍ: مسح كامل ثم استعادة من الملف
    localStorage.clear();
    const outcome = restoreKidsBackup(backup);
    expect(outcome.restored).toBeGreaterThan(0);

    // التحقق من التطابق 100% لكل مفتاح منقول (باستثناء المستثنيات المعلنة)
    const restoredKeys = new Set(Object.keys(backup.entries));
    for (const [key, value] of Object.entries(before)) {
      if (restoredKeys.has(key)) expect(localStorage.getItem(key)).toBe(value);
    }
    expect(localStorage.getItem("mushaf:profiles:v1")).toBe(before["mushaf:profiles:v1"]);
    expect(localStorage.getItem("quran-progress")).toBe(before["quran-progress"]);
    expect(localStorage.getItem("kids:achievements:v1")).toBe(before["kids:achievements:v1"]);
    expect(localStorage.getItem("mushaf:dailyRewards:streaks")).toBe(before["mushaf:dailyRewards:streaks"]);
    expect(localStorage.getItem("mushaf:kidsHistory:v1:kid-1")).toBe(before["mushaf:kidsHistory:v1:kid-1"]);
  });

  it("لا تصدّر الأسرار ولا الكاشات الخاصة بالجهاز", () => {
    realisticChildData();
    const backup = buildKidsBackup();
    const keys = Object.keys(backup.entries);
    expect(keys).not.toContain("hf_token");
    expect(keys).not.toContain("groq_token");
    expect(keys).not.toContain("mushaf:kidsPin");
    expect(keys).not.toContain("mushaf:kidsSecurityAnswer");
    expect(keys).not.toContain("mushaf:deviceId");
    expect(keys.some((k) => k.startsWith("mushaf:customAudio:"))).toBe(false);
    expect(keys.some((k) => k.startsWith("mushaf:customPageImage:"))).toBe(false);
  });

  it("ملخّص النسخة يعرض أرقاماً صحيحة", () => {
    realisticChildData();
    const summary = summarizeBackupEntries(buildKidsBackup().entries);
    expect(summary.profiles).toBe(2);
    expect(summary.coins).toBe(460); // مجموع نجوم الملفين: 340 + 120
    expect(summary.listenedAyahs).toBe(8);
    expect(summary.streakDays).toBe(7);
    expect(summary.keyCount).toBeGreaterThan(5);
  });

  it("يرفض الملفات غير الصالحة قبل لمس أي بيانات", () => {
    realisticChildData();
    expect(parseKidsBackup("").ok).toBe(false);
    expect(parseKidsBackup("not-json").ok).toBe(false);
    expect(parseKidsBackup(JSON.stringify({ app: "other-app", version: 1, entries: {} })).ok).toBe(false);
    expect(
      parseKidsBackup(JSON.stringify({ app: "haj-amine-kids-backup", version: 999, entries: { a: "1" } })).ok,
    ).toBe(false);
    expect(
      parseKidsBackup(JSON.stringify({ app: "haj-amine-kids-backup", version: 1, entries: {} })).ok,
    ).toBe(false);
    expect(
      parseKidsBackup(JSON.stringify({ app: "haj-amine-kids-backup", version: 1, entries: { a: 42 } })).ok,
    ).toBe(false);
    const valid = parseKidsBackup(JSON.stringify(buildKidsBackup()));
    expect(valid.ok).toBe(true);
  });

  it("التراجع عن الاستعادة يعيد الحالة السابقة كاملة", () => {
    realisticChildData();
    const before = localStorage.getItem("mushaf:coins");
    const backup = buildKidsBackup();

    // تغيير الحالة ثم الاستعادة
    localStorage.setItem("mushaf:coins", "9999");
    localStorage.setItem("key-only-in-new-state", "x");
    const outcome = restoreKidsBackup(backup);
    expect(localStorage.getItem("mushaf:coins")).toBe(before);

    // التراجع يعيد الحالة التي سبقت الاستعادة
    const written = undoRestore(outcome.snapshot);
    expect(written).toBeGreaterThan(0);
    expect(localStorage.getItem("mushaf:coins")).toBe("9999");
    expect(localStorage.getItem("key-only-in-new-state")).toBe("x");
  });

  it("اسم الملف ووظيفة التنزيل تعملان", () => {
    realisticChildData();
    // jsdom لا يملك URL.createObjectURL — نزوّده لاختبار مسار التنزيل نفسه
    const original = URL.createObjectURL;
    URL.createObjectURL = () => "blob:fake";
    URL.revokeObjectURL = () => {};
    try {
      const name = backupFileName(new Date(2026, 10, 17, 8, 5));
      expect(name).toBe("kids-backup-2026-11-17-0805.json");
      const downloaded = downloadKidsBackup();
      expect(downloaded).toMatch(/^kids-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    } finally {
      URL.createObjectURL = original;
    }
  });
});
