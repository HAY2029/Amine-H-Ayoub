import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Bell,
  Baby,
  Check,
  Gift,
  Plus,
  Trash2,
  Minus,
  Star,
  X,
  TrendingUp,
  Award,
  Zap,
  Target,
  Trophy,
  Shield,
  Lock,
  Calendar,
  Sliders,
  Sparkles,
  Headphones,
  Settings,
  KeyRound,
  HelpCircle,
  RefreshCw,
  Gamepad2,
  MessageSquare,
  Scale,
  Eye,
  EyeOff,
  Download,
  BarChart3,
  Filter,
  CheckCircle2,
  Moon,
  Info,
  Printer,
  Share2,
  Crown,
  HeartHandshake,
  Flame,
  Palette,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { showLocalNotification, requestNotificationPermission, saveReminderSettings } from "../utils/notifications";
import {
  getProfile,
  updateProfile,
  getProgress,
  getHistory,
  getProfiles,
  getActiveId,
  setActiveProfile,
  addProfile,
  removeProfile,
  getAppMode,
  setAppMode,
  grantMorePlay,
  resetProgress,
  KID_AVATARS_BOY,
  KID_AVATARS_GIRL,
  SHOP_AVATARS_BOY,
  SHOP_AVATARS_GIRL,
  SHOP_AVATARS,
  isAvatarOwnedByProfile,
  KID_COLORS,
  KidsProfile,
  KidsProgress,
  DayLog,
  formatCoins,
  isPureMode,
  setPureMode,
  setKidsHidden,
  AppMode,
} from "../data/kidsProfile";
import { getKidsSchedule, saveKidsSchedule, KidsSchedule } from "../data/kidsSchedule";
import {
  isKidsMode,
  setKidsLocked,
  hasKidsPin,
  setKidsPin,
  removeKidsPin,
  getSecurityQuestion,
  setSecurityQuestion,
  DEFAULT_SECURITY_QUESTIONS,
} from "../data/kidsLock";
import { calculateStreak } from "../data/kidsBadges";
import { SURAHS, getSurahByNumber } from "../data/quranData";
import {
  getGameCatalog,
  hideRemoteGame,
  showRemoteGame,
  getHiddenRemoteIds,
  type GameDef,
} from "../data/gameCatalog";
import Avatar from "../components/Avatar";
import BadgesModal from "../components/BadgesModal";
import ParentalGateModal from "../components/ParentalGateModal";
import SupportModal from "../components/SupportModal";
import WhatsAppIcon from "../components/WhatsAppIcon";
import AppNav from "../components/AppNav";
import {
  getLocalSupportMessages,
  deleteLocalSupportMessage,
  clearLocalSupportMessages,
  SupportReportData,
  openWhatsAppSupport,
  SUPPORT_WHATSAPP_DISPLAY,
} from "../services/resendService";

type DashboardTab = "overview" | "certificate" | "rewards" | "goals" | "games_safety";

interface FamilyReward {
  id: string;
  title: string;
  targetStars: number;
  completed: boolean;
  rewardType: "stars" | "streak";
}

export default function ParentDashboard() {
  const navigate = useNavigate();

  // الحالة العامة
  const [profiles, setProfiles] = useState<KidsProfile[]>(getProfiles);
  const [activeId, setActiveId] = useState<string>(getActiveId);
  const [profile, setProfile] = useState<KidsProfile>(getProfile);
  const [draft, setDraft] = useState<KidsProfile>(getProfile);
  const [progress, setProgress] = useState<KidsProgress>(getProgress);
  const [schedule, setSchedule] = useState<KidsSchedule>(getKidsSchedule);
  const [appMode, setAppModeState] = useState<AppMode>(getAppMode);
  const [pureMode, setPureModeState] = useState(isPureMode);
  const [kidsLocked, setKidsLockedState] = useState(isKidsMode);
  const [catalog, setCatalog] = useState<GameDef[]>(getGameCatalog);
  const [hiddenGameIds, setHiddenGameIds] = useState<string[]>(getHiddenRemoteIds);

  // التبويب النشط في اللوحة
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  // قسم الإعدادات الفرعي للتنظيم السريع والتركيز
  const [settingsFilter, setSettingsFilter] = useState<"all" | "profile" | "quran" | "screen" | "security" | "alerts">("all");
  const [avatarGenderTab, setAvatarGenderTab] = useState<"all" | "boy" | "girl">("all");

  // النوافذ المنبثقة
  const [showAddChild, setShowAddChild] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showGateCheck, setShowGateCheck] = useState(() => isKidsMode() && hasKidsPin());
  const [inboxMessages, setInboxMessages] = useState<SupportReportData[]>(getLocalSupportMessages);

  // ميثاق المكافآت العائلية (ميزة جديدة حصرية)
  const [familyRewards, setFamilyRewards] = useState<FamilyReward[]>(() => {
    try {
      const saved = localStorage.getItem(`kids_family_rewards_${getActiveId()}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: "1", title: "مكافأة خاصة ونزهة عائلية مميزة", targetStars: 150, completed: false, rewardType: "stars" },
      { id: "2", title: "كتاب قصص الأنبياء المصور للأطفال", targetStars: 300, completed: false, rewardType: "stars" },
      { id: "3", title: "وجبة مفضلة في المطعم تكريماً للإتقان", targetStars: 500, completed: false, rewardType: "stars" },
    ];
  });
  const [newRewardTitle, setNewRewardTitle] = useState("");
  const [newRewardStars, setNewRewardStars] = useState(200);

  useEffect(() => {
    try {
      localStorage.setItem(`kids_family_rewards_${profile.id}`, JSON.stringify(familyRewards));
    } catch {}
  }, [familyRewards, profile.id]);

  useEffect(() => {
    const handleInboxUpdate = () => setInboxMessages(getLocalSupportMessages());
    window.addEventListener("mushaf:support_inbox_updated", handleInboxUpdate);
    return () => window.removeEventListener("mushaf:support_inbox_updated", handleInboxUpdate);
  }, []);

  // بيانات طفل جديد
  const [newKid, setNewKid] = useState({
    name: "",
    age: 7,
    gender: "boy" as "boy" | "girl",
    avatar: KID_AVATARS_BOY[0],
    color: KID_COLORS[0],
  });

  // إدارة رمز الـ PIN من اللوحة
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [newPinInput, setNewPinInput] = useState("");
  const [secQuestion, setSecQuestionState] = useState(getSecurityQuestion);
  const [secAnswer, setSecAnswer] = useState("");

  const getFullHistory = (): DayLog[] => {
    const past = getHistory();
    const cur = getProgress();
    const todayDate = cur.date || new Date().toISOString().split("T")[0];
    const pastFiltered = past.filter((d) => d.date !== todayDate).slice().reverse();
    const todayLog: DayLog = {
      date: todayDate,
      minutes: cur.minutes || 0,
      played: cur.played || 0,
    };
    return [...pastFiltered, todayLog].slice(-7);
  };

  const [history, setHistory] = useState<DayLog[]>(getFullHistory);

  const refresh = () => {
    setProfiles(getProfiles());
    setActiveId(getActiveId());
    const p = getProfile();
    setProfile(p);
    setDraft(p);
    setProgress(getProgress());
    setHistory(getFullHistory());
    setSchedule(getKidsSchedule());
    setAppModeState(getAppMode());
    setPureModeState(isPureMode());
    setKidsLockedState(isKidsMode());
    setCatalog(getGameCatalog());
    setHiddenGameIds(getHiddenRemoteIds());

    try {
      const saved = localStorage.getItem(`kids_family_rewards_${p.id}`);
      if (saved) setFamilyRewards(JSON.parse(saved));
    } catch {}
  };

  useEffect(() => {
    refresh();
    const evts = [
      "focus",
      "mushaf:games_unlocked",
      "mushaf:coins",
      "mushaf:activeprofile",
      "mushaf:reading_progress",
      "mushaf:kidsmode",
      "mushaf:appmode",
      "mushaf:gamecatalog",
      "storage",
    ];
    evts.forEach((e) => window.addEventListener(e, refresh));
    return () => evts.forEach((e) => window.removeEventListener(e, refresh));
  }, []);

  // قراءة سجل الآيات والسور التفصيلي من الذاكرة
  const getQuranProgressDetails = () => {
    try {
      const raw = localStorage.getItem("quran-progress");
      if (!raw) return { totalAyahs: 0, surahsCompleted: 0, juzAmmaCompleted: 0, listenedSurahNumbers: [] as number[], listenedAyahs: {} as Record<string, number[]> };
      const parsed = JSON.parse(raw);
      const listened = parsed.listenedAyahs || {};
      let totalAyahs = 0;
      const listenedSurahNumbers = Object.keys(listened).map(Number).filter(n => !isNaN(n));
      for (const k in listened) {
        if (Array.isArray(listened[k])) totalAyahs += listened[k].length;
      }
      const juzAmmaCompleted = listenedSurahNumbers.filter(id => id >= 78 && id <= 114).length;
      return {
        totalAyahs,
        surahsCompleted: listenedSurahNumbers.length,
        juzAmmaCompleted,
        listenedSurahNumbers,
        listenedAyahs: listened,
      };
    } catch {
      return { totalAyahs: 0, surahsCompleted: 0, juzAmmaCompleted: 0, listenedSurahNumbers: [], listenedAyahs: {} };
    }
  };

  const quranDetails = getQuranProgressDetails();
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => Math.max(0, history.length - 1));

  // حساب الإحصائيات الدقيقة الموسعة
  const stats = {
    totalMinutes: history.reduce((sum, d) => sum + (d.minutes || 0), 0),
    avgMinutes: Math.round(
      history.reduce((sum, d) => sum + (d.minutes || 0), 0) / Math.max(1, history.length)
    ),
    bestDay: Math.max(0, ...history.map((d) => d.minutes || 0)),
    consecutiveDays: calculateStreak().currentStreak,
    percentComplete: Math.min(
      100,
      Math.round(((progress.minutes || 0) / Math.max(1, profile.goalMinutes || 1)) * 100)
    ),
  };
  const playPct = Math.min(
    100,
    Math.round(((progress.played || 0) / Math.max(1, profile.playMinutes || 1)) * 100)
  );

  const totalPlayMinutes = history.reduce((sum, d) => sum + (d.played || 0), 0);
  const quranToPlayRatio = totalPlayMinutes > 0 
    ? (stats.totalMinutes / totalPlayMinutes).toFixed(1)
    : stats.totalMinutes > 0 ? "100%" : "0";
  const consistencyDays = history.filter(d => (d.minutes || 0) >= (profile.goalMinutes || 1)).length;
  const consistencyRate = Math.round((consistencyDays / Math.max(1, history.length)) * 100);
  const remainingTodayGoal = Math.max(0, (profile.goalMinutes || 5) - (progress.minutes || 0));
  const juzAmmaTotal = 37; // من 78 إلى 114
  const juzAmmaPercent = Math.min(100, Math.round((quranDetails.juzAmmaCompleted / juzAmmaTotal) * 100));

  // رتبة الطفل القرآنية
  const getChildRank = (coins: number) => {
    if (coins >= 1000) return { title: "حافظ القرآن الذهبي", level: 5, icon: "👑", bg: "from-amber-400 to-amber-600" };
    if (coins >= 500) return { title: "نجم التلاوة المتميز", level: 4, icon: "🌟", bg: "from-purple-500 to-indigo-600" };
    if (coins >= 200) return { title: "بطل القرآن الصاعد", level: 3, icon: "💎", bg: "from-blue-500 to-cyan-600" };
    if (coins >= 50) return { title: "حافظ ناشئ", level: 2, icon: "🌿", bg: "from-emerald-500 to-teal-600" };
    return { title: "براعم القرآن الكريم", level: 1, icon: "🌱", bg: "from-emerald-400 to-emerald-500" };
  };
  const childRank = getChildRank(profile.coins || 0);

  // اختيار طفل
  const switchTo = (id: string) => {
    setActiveProfile(id);
    refresh();
  };

  // حفظ بيانات الطفل
  const saveChild = () => {
    // التحقق الصارم من أن الشخصية مملوكة للطفل وليست شخصية مقفلة تم تفعيلها مجاناً
    const finalAvatar = isAvatarOwnedByProfile(draft.avatar, profile)
      ? draft.avatar
      : profile.avatar;

    updateProfile(draft.id, {
      name: draft.name,
      avatar: finalAvatar,
      color: draft.color,
      age: draft.age,
      goalMinutes: draft.goalMinutes,
      playMinutes: draft.playMinutes,
      reward: draft.reward,
      // رصيد النجوم والمال لا يمكن تعديله يدويًا من لوحة الولي بل يُكتسب فقط بالجهد القرآني
      coins: profile.coins,
      currentSurah: draft.currentSurah,
    });
    refresh();
    toast({ title: "✓ تم حفظ إعدادات وضوابط الوقت والورد بنجاح" });
  };

  // إضافة طفل جديد
  const createChild = () => {
    const name = newKid.name.trim();
    if (!name) {
      toast({ title: "يرجى كتابة اسم الطفل", variant: "destructive" });
      return;
    }
    const p = addProfile({
      name,
      age: newKid.age,
      gender: newKid.gender,
      avatar: newKid.avatar,
      color: newKid.color,
    });
    setActiveProfile(p.id);
    if (getAppMode() === "parent") setAppMode("kids");
    setShowAddChild(false);
    refresh();
    toast({ title: `🎉 تم إضافة ${name} إلى أبطال القرآن!` });
  };

  // حذف طفل
  const delChild = (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف ملف «${name || "الطفل"}» وكل إنجازاته؟`)) return;
    removeProfile(id);
    refresh();
    toast({ title: "تم حذف الملف" });
  };

  // تذكير الدرس
  const saveLesson = async (t: string) => {
    updateProfile(profile.id, { lessonTime: t });
    saveReminderSettings({ dailyLessonTime: t || "17:00", dailyLessonEnabled: !!t });
    refresh();
    if (t) {
      void requestNotificationPermission();
    }
    toast({ title: t ? `🔔 تم ضبط تذكير الدرس: ${t}` : "تم إلغاء تذكير الدرس" });
  };

  // تبديل أوضاع التطبيق
  const handleModeChange = (mode: "flexible" | "kids" | "pure") => {
    if (mode === "flexible") {
      setPureMode(false);
      setKidsHidden(false);
      setAppMode("parent");
      setKidsLocked(false);
      refresh();
      toast({
        title: "🔄 تم التبديل إلى وضع التنقل المرن",
        description: "كامل ميزات التطبيق وركن الأطفال متاحة ومفتوحة",
      });
    } else if (mode === "kids") {
      if (!hasKidsPin()) {
        setShowPinDialog(true);
        toast({
          title: "🔐 يُرجى تعيين رمز مرور لولي الأمر أولاً",
          description: "رمز المرور ضروري لحماية الطفل ومنعه من الخروج",
        });
        return;
      }
      setPureMode(false);
      setKidsHidden(false);
      setAppMode("kids");
      setKidsLocked(true);
      refresh();
      toast({
        title: "👶 تم تفعيل وضع الأطفال المقفل",
        description: "التطبيق مقفل الآن داخل ركن الأطفال ولا يمكن الخروج إلا بالرمز",
      });
      navigate("/games");
    } else if (mode === "pure") {
      setPureMode(true);
      setKidsHidden(true);
      setAppMode("parent");
      setKidsLocked(false);
      refresh();
      toast({
        title: "🎧 تم التفعيل: الوضع العادي الصارم (تلاوات ومصحف فقط)",
        description: "تم إخفاء ركن الأطفال بالكامل للبالغين",
      });
    }
  };

  // حفظ رمز PIN جديد
  const saveNewPin = () => {
    if (newPinInput.length !== 4 || !/^\d{4}$/.test(newPinInput)) {
      toast({ title: "يجب أن يتكون الرمز من 4 أرقام", variant: "destructive" });
      return;
    }
    setKidsPin(newPinInput);
    if (secAnswer.trim()) {
      setSecurityQuestion(secQuestion, secAnswer.trim());
    }
    setShowPinDialog(false);
    setNewPinInput("");
    setSecAnswer("");
    refresh();
    toast({ title: "✓ تم تعيين رمز مرور الوالدين بنجاح!" });
  };

  // إظهار/إخفاء لعبة من ركن الأطفال
  const toggleGameVisibility = (game: GameDef) => {
    const hidden = hiddenGameIds.includes(game.id);
    if (hidden) {
      showRemoteGame(game.id);
    } else {
      hideRemoteGame(game.id);
    }
    setHiddenGameIds(getHiddenRemoteIds());
    toast({
      title: hidden ? `✓ تم إظهار «${game.title}»` : `تم إخفاء «${game.title}» عن الطفل`,
    });
  };

  // تفعيل/تعطيل كل الألعاب
  const toggleAllGames = (show: boolean) => {
    for (const g of catalog) {
      if (g.id === "surahaudio") continue;
      if (show) showRemoteGame(g.id);
      else hideRemoteGame(g.id);
    }
    setHiddenGameIds(getHiddenRemoteIds());
    toast({ title: show ? "✓ تم تفعيل جميع الألعاب" : "تم تعطيل جميع الألعاب باستثناء الاستماع" });
  };

  // تصدير تقرير بيانات الطفل (نسخة احتياطية)
  const exportChildReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      child: {
        name: profile.name || "البطل",
        age: profile.age,
        goalMinutes: profile.goalMinutes,
        playMinutes: profile.playMinutes,
        currentSurah: profile.currentSurah || 0,
        coins: profile.coins || 0,
        rank: childRank.title,
      },
      progress,
      stats,
      history,
      schedule,
      appMode,
      pureMode,
      kidsLocked,
      quranDetails,
      familyRewards,
      games: {
        total: catalog.length,
        hidden: hiddenGameIds.length,
      },
    };
    try {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `تقرير-مصحف-التبيان-${profile.name || "الطفل"}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "✓ تم تصدير تقرير الطفل بنجاح" });
    } catch {
      toast({ title: "تعذّر تصدير التقرير", variant: "destructive" });
    }
  };

  // مشاركة الشهادة التقديرية عبر واتساب
  const shareCertificateWhatsApp = () => {
    const childName = profile.name || "بطل القرآن";
    const currentSurahObj = SURAHS.find(s => s.number === (profile.currentSurah || 38));
    const text = `📜 *شهادة فخر وتفوق قرآني* 🌟\n\nنبارك للبطل القرآني المبارك: *${childName}*\nبمناسبة تميزه واجتهاده في تطبيق *مصحف التبيان*!\n\n👑 *الرتبة القرآنية:* ${childRank.title} (${childRank.icon})\n📖 *الآيات الكريمة المنجزة:* ${quranDetails.totalAyahs} آية\n🕌 *السور المتقنة:* ${quranDetails.surahsCompleted} سورة (منها ${quranDetails.juzAmmaCompleted} من جزء عمّ)\n🎯 *سورة الحفظ الحالية:* سورة ${currentSurahObj?.name || "الشمس"}\n⭐ *رصيد النجوم الكلي:* ${formatCoins(profile.coins || 0)} نجمة\n🔥 *أيام الالتزام المتواصلة:* ${stats.consecutiveDays} أيام\n\nاللهم بارك فيه واجعله من أهل القرآن وخاصته ومن حفظة كتابك العظيم! 🤲💐`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  // طباعة الشهادة
  const printCertificate = () => {
    window.print();
  };

  // إضافة مكافأة عائلية جديدة
  const handleAddFamilyReward = () => {
    if (!newRewardTitle.trim()) {
      toast({ title: "يرجى كتابة عنوان الجائزة أو النشاط", variant: "destructive" });
      return;
    }
    const r: FamilyReward = {
      id: Date.now().toString(),
      title: newRewardTitle.trim(),
      targetStars: Number(newRewardStars) || 100,
      completed: false,
      rewardType: "stars",
    };
    setFamilyRewards([r, ...familyRewards]);
    setNewRewardTitle("");
    toast({ title: "🎉 تم إضافة التحدي والمكافأة العائلية بنجاح!" });
  };

  const toggleRewardCompleted = (id: string) => {
    setFamilyRewards(prev =>
      prev.map(r => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
    toast({ title: "✓ تم تحديث حالة استلام الجائزة" });
  };

  const deleteReward = (id: string) => {
    setFamilyRewards(prev => prev.filter(r => r.id !== id));
    toast({ title: "تم حذف الجائزة العائلية" });
  };

  return (
    <div className="min-h-screen page-nour text-foreground pb-16" dir="rtl">
      {/* فحص بوابة الوالدين إذا كان وضع الأطفال مفعلاً */}
      {showGateCheck && (
        <ParentalGateModal
          title="الدخول للوحة تحكم ولي الأمر"
          onSuccess={() => {
            setShowGateCheck(false);
            setKidsLocked(false);
            refresh();
          }}
          onCancel={() => {
            setShowGateCheck(false);
            navigate("/games");
          }}
        />
      )}

      {/* شريط التنقل الرئيسي الدائري الفاخر للموقع */}
      <AppNav />

      <div className="mx-auto max-w-4xl px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* ═══════════════════════════════════════════════════════════════
            التاج الأندلسي الملكي الفاخر (Imperial Grand Canopy)
            ═══════════════════════════════════════════════════════════════ */}
        <header className="relative rounded-3xl border-2 border-amber-400/40 bg-gradient-to-b from-amber-50/95 via-white to-amber-50/60 dark:from-stone-900/95 dark:to-stone-900/85 backdrop-blur-xl shadow-xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 via-amber-400 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/30 shrink-0 border-2 border-white/80 dark:border-stone-800">
                <Crown className="w-7 h-7" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-extrabold text-xl sm:text-2xl text-stone-900 dark:text-amber-100 font-amiri leading-tight">
                    لوحة تحكم وليّ الأمر
                  </h1>
                  <span className="text-xs font-black px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-500/30 flex items-center gap-1 shadow-xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    قيادة وتوجيه قرآني
                  </span>
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-300 mt-1 flex items-center gap-2">
                  <span>البطل المتابع: <b>{profile.name || "الطفل"}</b></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-amber-700 dark:text-amber-300 font-bold">{childRank.icon} {childRank.title}</span>
                </p>
              </div>
            </div>

            {/* أزرار الإجراءات السريعة في التاج */}
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                onClick={() => {
                  void openWhatsAppSupport();
                  toast({
                    title: "جاري فتح واتساب الدعم الفني 💬",
                    description: `مراسلة فورية مباشرة على الرقم (${SUPPORT_WHATSAPP_DISPLAY})`,
                  });
                }}
                className="h-10 px-3.5 rounded-full bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] text-xs font-black active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border border-[#25D366]/30"
                title={`تواصل مع الدعم الفني عبر واتساب (${SUPPORT_WHATSAPP_DISPLAY})`}
              >
                <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                <span className="hidden sm:inline">واتساب الدعم</span>
                <span className="sm:hidden">واتساب</span>
              </button>

              <button
                onClick={() => navigate("/games")}
                className="h-10 px-3.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200 text-xs font-black hover:bg-amber-500/25 active:scale-95 transition-all flex items-center gap-1.5 border border-amber-400/40 shadow-xs"
                title="الذهاب إلى ركن الأطفال"
              >
                <Gamepad2 className="w-4 h-4 text-amber-600" />
                <span>ركن الألعاب</span>
              </button>

              <button
                onClick={() => navigate("/settings")}
                className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 flex items-center justify-center active:scale-95 transition-all border border-stone-300 dark:border-stone-700 shadow-xs"
                title="الإعدادات العامة"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* شريط التحفيز السريع والتكريم */}
          <div className="pt-3 border-t border-amber-400/25 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-amber-900/90 dark:text-amber-200/90 flex items-center gap-1 ml-1">
                <Zap className="w-4 h-4 text-amber-600" /> تحفيز ومكافأة سريعة:
              </span>

              <button
                onClick={() => {
                  grantMorePlay(15);
                  refresh();
                  toast({ title: "⏱️ تم منح 15 دقيقة لعب إضافية للطفل!" });
                }}
                className="px-3.5 py-1.5 rounded-full bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
                title="إضافة 15 دقيقة لعب إضافية"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600" />
                <span>+15 دقيقة لعب</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("certificate")}
                className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-amber-500/20"
                title="عرض شهادة التقدير الملكية للطفل"
              >
                <Award className="w-3.5 h-3.5 text-amber-200" />
                <span>الشهادة التقديرية</span>
              </button>

              <button
                onClick={exportChildReport}
                className="px-3 py-1.5 rounded-full bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
                title="تصدير تقرير شامل لإنجازات الطفل"
              >
                <Download className="w-3.5 h-3.5 text-purple-600" />
                <span>تصدير التقرير</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── شريط اختيار الطفل بأقراص دائرية فاخرة ورتب قرآنية ── */}
        <div className="card-nour p-4 rounded-3xl space-y-3 shadow-md border border-amber-400/30 animate-fade-up">
          <div className="flex items-center justify-between">
            <p className="font-extrabold text-stone-900 dark:text-amber-100 text-sm flex items-center gap-2">
              <Baby className="w-4 h-4 text-amber-600" /> أبطال القرآن في العائلة
            </p>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20">
              {profiles.length} {profiles.length === 1 ? "طفل" : "أطفال"} مسجلون
            </span>
          </div>

          <div className="flex items-stretch gap-3 overflow-x-auto pb-2 no-scrollbar">
            {profiles.map((p) => {
              const r = getChildRank(p.coins || 0);
              const isSelected = p.id === activeId;
              return (
                <div key={p.id} className="relative shrink-0">
                  <button
                    onClick={() => switchTo(p.id)}
                    className={`w-28 sm:w-32 flex flex-col items-center gap-1.5 rounded-3xl p-3 border transition-all ${
                      isSelected
                        ? "border-amber-500 bg-amber-500/15 ring-2 ring-amber-400 shadow-md scale-105"
                        : "border-border/70 bg-card hover:border-amber-400/50"
                    }`}
                  >
                    <div
                      className={`relative w-16 h-16 rounded-full bg-gradient-to-br ${p.color} flex items-center justify-center shadow-inner overflow-hidden border-2 border-white/80 dark:border-stone-800`}
                    >
                      <Avatar name={p.avatar} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-white dark:bg-stone-900 shadow-xs flex items-center justify-center text-[10px]">
                        {r.icon}
                      </span>
                    </div>

                    <span className="text-xs font-black truncate w-full text-center text-foreground">
                      {p.name || "البطل"}
                    </span>

                    <span className="text-[10px] text-amber-700 dark:text-amber-300 font-bold truncate">
                      {r.title}
                    </span>

                    <div className="flex items-center justify-between w-full text-[10px] text-muted-foreground px-1 border-t border-amber-400/20 pt-1">
                      <span>{p.age} سنوات</span>
                      <span className="text-amber-600 dark:text-amber-400 font-black">
                        {formatCoins(p.coins || 0)} ⭐
                      </span>
                    </div>
                  </button>

                  {profiles.length > 1 && (
                    <button
                      onClick={() => delChild(p.id, p.name)}
                      className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center shadow-md active:scale-90 transition-transform"
                      title="حذف هذا الطفل"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* زر إضافة طفل جديد */}
            <button
              onClick={() => setShowAddChild(true)}
              className="w-28 sm:w-32 shrink-0 flex flex-col items-center justify-center gap-2 rounded-3xl p-3 border-2 border-dashed border-amber-400/50 bg-amber-500/5 hover:bg-amber-500/15 active:scale-95 transition-all text-amber-700 dark:text-amber-300"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center shadow-xs">
                <Plus className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xs font-black">إضافة طفل</span>
            </button>
          </div>
        </div>

        {/* ── لافتة صلاحيات وضوابط ولي الأمر (تعديل الوقت والإحصائيات - المال والصور مقفلة) ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-stone-800 dark:text-stone-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold block text-amber-950 dark:text-amber-100">
                صلاحيات وضوابط ولي الأمر:
              </span>
              <span className="text-[11px] text-stone-600 dark:text-stone-300">
                صلاحياتك تشمل <b>تعديل الوقت</b> (الورد القرآني وسقف اللعب) و<b>متابعة الإحصائيات</b>، بينما <b>النجوم والشخصيات</b> يكسبها الطفل بجهده ولا تُفتح مجاناً.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto text-[10px] font-black">
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <Clock className="w-3 h-3" /> تعديل الوقت ✓
            </span>
            <span className="px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> الإحصائيات ✓
            </span>
            <span className="px-2.5 py-1 rounded-full bg-stone-500/15 text-stone-700 dark:text-stone-300 border border-stone-500/30 flex items-center gap-1">
              <Lock className="w-3 h-3" /> المال والصور مقفلة 🔒
            </span>
          </div>
        </div>

        {/* ── التبويبات الخمسة المنظمة في كبسولة دائرية كاملة ── */}
        <nav className="flex items-center gap-2 p-1.5 rounded-full bg-white/95 dark:bg-stone-900/95 border-2 border-amber-400/40 shadow-sm text-xs font-bold overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full transition-all shrink-0 ${
              activeTab === "overview"
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md font-black"
                : "text-stone-700 dark:text-stone-300 hover:text-amber-700 hover:bg-amber-500/10"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>نظرة عامة والإحصائيات</span>
          </button>

          <button
            onClick={() => setActiveTab("certificate")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full transition-all shrink-0 ${
              activeTab === "certificate"
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md font-black"
                : "text-stone-700 dark:text-stone-300 hover:text-amber-700 hover:bg-amber-500/10"
            }`}
          >
            <Award className="w-4 h-4" />
            <span>الشهادة والتكريم</span>
          </button>

          <button
            onClick={() => setActiveTab("rewards")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full transition-all shrink-0 ${
              activeTab === "rewards"
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md font-black"
                : "text-stone-700 dark:text-stone-300 hover:text-amber-700 hover:bg-amber-500/10"
            }`}
          >
            <HeartHandshake className="w-4 h-4" />
            <span>ميثاق الجوائز العائلية</span>
          </button>

          <button
            onClick={() => setActiveTab("goals")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full transition-all shrink-0 ${
              activeTab === "goals"
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md font-black"
                : "text-stone-700 dark:text-stone-300 hover:text-amber-700 hover:bg-amber-500/10"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>تعديل الوقت والورد</span>
          </button>

          <button
            onClick={() => setActiveTab("games_safety")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full transition-all shrink-0 ${
              activeTab === "games_safety"
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md font-black"
                : "text-stone-700 dark:text-stone-300 hover:text-amber-700 hover:bg-amber-500/10"
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>الألعاب والأمان</span>
          </button>
        </nav>

        {/* ═══════════════════════════════════════════════════════════════
            التبويب 1: نظرة عامة وإحصائيات دقيقة متطورة
            ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-5 animate-fade-in">
            {/* 1. بطاقة تقدم اليوم الحية */}
            <div className="card-nour p-4 sm:p-6 rounded-3xl space-y-4 shadow-md border border-amber-400/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-600">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-extrabold text-stone-900 dark:text-amber-100 text-base leading-tight">
                      سجل اليوم الحي: {profile.name || "بطل القرآن"}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      متابعة دقيقة وفورية للدقائق المستهلكة والإنجاز القرآني
                    </p>
                  </div>
                </div>

                <span
                  className={`self-start sm:self-auto text-xs font-black px-3.5 py-1.5 rounded-full border shadow-xs ${
                    progress.unlocked
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30"
                  }`}
                >
                  {progress.unlocked ? "✓ الألعاب مفتوحة بالإنجاز" : `🔒 الألعاب مقفلة (متبقي ${remainingTodayGoal} دقيقة قراءة)`}
                </span>
              </div>

              {/* أشرطة التقدم الدقيقة */}
              <div className="space-y-3 pt-1">
                {/* دقائق القراءة والاستماع */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300">
                      <BookOpen className="w-4 h-4 text-emerald-600" /> وقت الاستماع والقراءة القرآني
                    </span>
                    <span className="font-extrabold text-stone-900 dark:text-amber-200">
                      {progress.minutes} / {profile.goalMinutes} دقيقة ({stats.percentComplete}%)
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden p-0.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 shadow-xs transition-all duration-500"
                      style={{ width: `${stats.percentComplete}%` }}
                    />
                  </div>
                </div>

                {/* دقائق اللعب المستهلكة */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300">
                      <Clock className="w-4 h-4 text-rose-500" /> وقت اللعب المستهلك اليوم
                    </span>
                    <span className="font-extrabold text-stone-900 dark:text-amber-200">
                      {progress.played || 0} / {profile.playMinutes > 0 ? `${profile.playMinutes} دقيقة` : "بلا حد"} ({playPct}%)
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden p-0.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 shadow-xs transition-all duration-500"
                      style={{ width: `${playPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* كبسولات إحصاء اليوم السريعة */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-amber-400/20">
                <div className="p-3 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 font-bold">قراءة اليوم</p>
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{progress.minutes} د</p>
                </div>
                <div className="p-3 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 font-bold">المتبقي للورد</p>
                  <p className="text-lg font-black text-amber-600 dark:text-amber-400">{remainingTodayGoal} د</p>
                </div>
                <div className="p-3 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-center">
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 font-bold">لعب اليوم</p>
                  <p className="text-lg font-black text-rose-600 dark:text-rose-400">{progress.played || 0} د</p>
                </div>
                <div className="p-3 rounded-3xl bg-purple-500/10 border border-purple-500/20 text-center">
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 font-bold">الرصيد الكلي</p>
                  <p className="text-lg font-black text-purple-600 dark:text-purple-400">{formatCoins(profile.coins || 0)} ⭐</p>
                </div>
              </div>
            </div>

            {/* 2. مصفوفة المؤشرات الاستراتيجية الشاملة */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="font-extrabold text-stone-900 dark:text-amber-100 text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-600" /> المؤشرات التحليلية الاستراتيجية
                </p>
                <span className="text-xs text-stone-500 dark:text-stone-400">آخر 7 أيام</span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {/* 1. إجمالي وقت القرآن التراكمي */}
                <div className="card-nour p-4 rounded-3xl border border-amber-400/25 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                    <span>إجمالي القرآن</span>
                    <Clock className="w-4 h-4 text-blue-500" />
                  </div>
                  <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
                    {stats.totalMinutes} دقيقة
                  </p>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    تساوي {Math.floor(stats.totalMinutes / 60)} س و {stats.totalMinutes % 60} د
                  </p>
                </div>

                {/* 2. مؤشر التوازن القرآني */}
                <div className="card-nour p-4 rounded-3xl border border-amber-400/25 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                    <span>التوازن (قرآن/لعب)</span>
                    <Scale className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {quranToPlayRatio}x
                  </p>
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 truncate">
                    {Number(quranToPlayRatio) >= 1 ? "✓ متفوق ومثالي ⭐" : "يحتاج تشجيعاً للقراءة"}
                  </p>
                </div>

                {/* 3. الآيات المستمع إليها */}
                <div className="card-nour p-4 rounded-3xl border border-amber-400/25 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                    <span>الآيات المنجزة</span>
                    <BookOpen className="w-4 h-4 text-amber-500" />
                  </div>
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {quranDetails.totalAyahs} آية
                  </p>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    في {quranDetails.surahsCompleted} سورة مختلفة
                  </p>
                </div>

                {/* 4. إنجاز سور جزء عمّ */}
                <div className="card-nour p-4 rounded-3xl border border-amber-400/25 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                    <span>إنجاز جزء عمّ</span>
                    <Sparkles className="w-4 h-4 text-purple-500" />
                  </div>
                  <p className="text-2xl font-black text-purple-600 dark:text-purple-400">
                    {quranDetails.juzAmmaCompleted} / {juzAmmaTotal}
                  </p>
                  <p className="text-[11px] text-purple-600 dark:text-purple-400 font-bold">
                    {juzAmmaPercent}% من قصار السور
                  </p>
                </div>

                {/* 5. معدل الالتزام والانتظام */}
                <div className="card-nour p-4 rounded-3xl border border-amber-400/25 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                    <span>معدل الالتزام</span>
                    <Target className="w-4 h-4 text-teal-500" />
                  </div>
                  <p className="text-2xl font-black text-teal-600 dark:text-teal-400">
                    {consistencyRate}%
                  </p>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    {consistencyDays} من {history.length} أيام مكتملة
                  </p>
                </div>

                {/* 6. السلسلة المتواصلة وأفضل يوم */}
                <div className="card-nour p-4 rounded-3xl border border-amber-400/25 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                    <span>السلسلة الحالية</span>
                    <Flame className="w-4 h-4 text-orange-500" />
                  </div>
                  <p className="text-2xl font-black text-orange-600 dark:text-orange-400">
                    {stats.consecutiveDays} أيام
                  </p>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    أفضل يوم: {stats.bestDay} دقيقة
                  </p>
                </div>
              </div>
            </div>

            {/* 3. الرسم البياني المزدوج التفاعلي للأسبوع مع مفتش الأيام */}
            <div className="card-nour p-4 sm:p-6 rounded-3xl space-y-4 shadow-md border border-amber-400/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-extrabold text-stone-900 dark:text-amber-100 text-sm sm:text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-600" /> الرسم البياني التحليلي المزدوج (قرآن مقابل لعب)
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    انقر على أي يوم لعرض تفاصيله الدقيقة أسفل الرسم
                  </p>
                </div>

                {/* دليل الألوان */}
                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" /> استماع وقراءة
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                    <span className="w-3 h-3 rounded-full bg-rose-500" /> ألعاب
                  </span>
                </div>
              </div>

              {/* أعمدة الرسم البياني التفاعلية */}
              <div className="pt-4 pb-2">
                <div className="flex items-end justify-between gap-2 sm:gap-3 h-36 px-1 border-b border-stone-200 dark:border-stone-800 pb-2 relative">
                  {/* خط الهدف المنقط */}
                  {profile.goalMinutes > 0 && stats.bestDay > 0 && (
                    <div
                      className="absolute left-0 right-0 border-b border-dashed border-amber-400/50 pointer-events-none z-0"
                      style={{
                        bottom: `${Math.min(95, Math.max(10, ((profile.goalMinutes) / Math.max(1, stats.bestDay)) * 100))}%`
                      }}
                    >
                      <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-white/90 dark:bg-stone-900/90 px-1.5 py-0.5 rounded-full absolute -top-3 right-0 shadow-xs">
                        هدف: {profile.goalMinutes} د
                      </span>
                    </div>
                  )}

                  {history.map((d, i) => {
                    const isSelected = selectedDayIndex === i;
                    const isToday = i === history.length - 1;
                    const maxVal = Math.max(1, stats.bestDay || 1, profile.goalMinutes || 1);
                    const quranPct = Math.min(100, Math.max(6, ((d.minutes || 0) / maxVal) * 100));
                    const playPctVal = Math.min(100, Math.max(4, ((d.played || 0) / maxVal) * 100));

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedDayIndex(i)}
                        className={`flex-1 flex flex-col items-center gap-1.5 group cursor-pointer transition-all ${
                          isSelected ? "scale-105" : "hover:opacity-90"
                        }`}
                        title={`${d.date}: قرآن ${d.minutes || 0} د | لعب ${d.played || 0} د`}
                      >
                        {/* عمودين متجاورين لكل يوم */}
                        <div className={`w-full flex items-end justify-center gap-1 h-28 p-1 rounded-2xl transition-all ${
                          isSelected ? "bg-amber-500/15 ring-2 ring-amber-400" : "bg-stone-100/80 dark:bg-stone-800/50 hover:bg-stone-200/60"
                        }`}>
                          {/* عمود القرآن */}
                          <div
                            className="w-1/2 rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-400 transition-all duration-500 shadow-xs"
                            style={{ height: `${quranPct}%` }}
                          />
                          {/* عمود اللعب */}
                          <div
                            className="w-1/2 rounded-t-lg bg-gradient-to-t from-rose-600 to-amber-400 transition-all duration-500 shadow-xs opacity-85"
                            style={{ height: `${playPctVal}%` }}
                          />
                        </div>

                        {/* تسمية اليوم */}
                        <span className={`text-[10px] font-bold block ${isSelected ? "text-amber-600 dark:text-amber-300 font-black" : "text-stone-500"}`}>
                          {isToday ? "اليوم" : d.date.slice(5)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* بطاقة المفتش الدقيق لليوم المحدد */}
              {history[selectedDayIndex] && (
                <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold text-stone-900 dark:text-amber-100">
                        تفاصيل يوم: {history[selectedDayIndex].date} {selectedDayIndex === history.length - 1 ? "(اليوم الحالي)" : ""}
                      </span>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        استماع قرآني: <b>{history[selectedDayIndex].minutes || 0} دقيقة</b> | وقت لعب: <b>{history[selectedDayIndex].played || 0} دقيقة</b>
                      </p>
                    </div>
                  </div>

                  <div className="self-end sm:self-auto">
                    {(history[selectedDayIndex].minutes || 0) >= (profile.goalMinutes || 1) ? (
                      <span className="inline-flex items-center gap-1 font-black text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-3 py-1.5 rounded-full border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5" /> تم تحقيق الهدف اليومي بنجاح
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-black text-amber-700 dark:text-amber-300 bg-amber-500/15 px-3 py-1.5 rounded-full border border-amber-500/30">
                        <Info className="w-3.5 h-3.5" /> متبقي {Math.max(0, (profile.goalMinutes || 5) - (history[selectedDayIndex].minutes || 0))} دقيقة للورد
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 4. خريطة إتقان سور جزء عمّ التفاعلية */}
            <div className="card-nour p-4 sm:p-6 rounded-3xl space-y-4 shadow-md border border-amber-400/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-extrabold text-stone-900 dark:text-amber-100 text-sm sm:text-base flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-600" /> خريطة إنجاز سور جزء عمّ (٣٧ سورة)
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    السور المظللة بالأخضر استمع إليها الطفل وتعلّمها بنجاح
                  </p>
                </div>
                <span className="font-black text-xs px-3.5 py-1.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  {quranDetails.juzAmmaCompleted} من ٣٧ سورة منجزة ({juzAmmaPercent}%)
                </span>
              </div>

              {/* شريط نسبة إنجاز جزء عمّ */}
              <div className="h-3 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-500 transition-all duration-500 rounded-full"
                  style={{ width: `${juzAmmaPercent}%` }}
                />
              </div>

              {/* شبكة سور جزء عمّ الكبسولية */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-60 overflow-y-auto no-scrollbar p-1">
                {Array.from({ length: 37 }).map((_, idx) => {
                  const sNum = 78 + idx;
                  const isDone = quranDetails.listenedSurahNumbers.includes(sNum);
                  const sInfo = getSurahByNumber(sNum);
                  const sName = sInfo?.name || `سورة ${sNum}`;

                  return (
                    <div
                      key={sNum}
                      className={`flex items-center justify-between gap-1 p-2.5 rounded-2xl border text-xs font-bold transition-all ${
                        isDone
                          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/35 shadow-xs"
                          : "bg-stone-100/70 dark:bg-stone-800/40 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700/60"
                      }`}
                      title={`${sName}: ${isDone ? "تم الاستماع" : "لم يُستمع إليها بعد"}`}
                    >
                      <span className="truncate">{sName}</span>
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <span className="text-[10px] text-stone-400 shrink-0">{sNum}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. سجل الجلسات اللحظي لآيات القرآن الكريم */}
            <div className="card-nour p-4 sm:p-6 rounded-3xl space-y-3.5 shadow-md border border-amber-400/30">
              <div className="flex items-center justify-between">
                <p className="font-extrabold text-stone-900 dark:text-amber-100 text-sm sm:text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" /> سجل الجلسات والآيات القرآنية الحديثة
                </p>
                <span className="text-xs font-bold text-stone-500 dark:text-stone-400">
                  {quranDetails.surahsCompleted} سور متفاعلة
                </span>
              </div>

              {quranDetails.surahsCompleted === 0 ? (
                <div className="text-center py-6 text-stone-500 text-xs">
                  لم يبدأ الطفل بعد في جلسات الاستماع أو التلاوة اليوم. شجعه على قراءة ورده لفتح الألعاب!
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
                  {quranDetails.listenedSurahNumbers.slice(0, 10).map((sNum) => {
                    const sInfo = getSurahByNumber(sNum);
                    const ayahsCount = quranDetails.listenedAyahs[String(sNum)]?.length || 0;
                    return (
                      <div
                        key={sNum}
                        className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/5 dark:bg-stone-800/40 border border-amber-400/20 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center font-bold text-[11px]">
                            {sNum}
                          </div>
                          <div>
                            <span className="font-black text-stone-900 dark:text-amber-100">سورة {sInfo?.name || sNum}</span>
                            <p className="text-[10px] text-stone-500">تم الاستماع إلى {ayahsCount} آيات كريمة</p>
                          </div>
                        </div>

                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] flex items-center gap-1">
                          <Check className="w-3 h-3" /> تم بنجاح
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* زر الأوسمة والتحديات */}
            <button
              onClick={() => setShowBadges(true)}
              className="w-full p-4 rounded-3xl bg-amber-500/15 border-2 border-amber-500/30 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25 font-black flex items-center justify-center gap-2 active:scale-95 transition-all text-sm shadow-sm cursor-pointer"
            >
              <Trophy className="w-5 h-5 text-amber-600" /> عرض خزانة الأوسمة والإنجازات المكتسبة ({profile.name || "الطفل"})
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            التبويب 2: الشهادة الملكية الفاخرة والتكريم (ميزة جديدة اسطورية)
            ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "certificate" && (
          <div className="space-y-5 animate-fade-in">
            {/* الشهادة التقديرية الفاخرة بطابع إسلامي ملكي */}
            <div className="relative rounded-3xl border-4 border-double border-amber-500/60 bg-gradient-to-b from-amber-50/95 via-white to-amber-50/90 dark:from-stone-900 dark:via-stone-900/90 dark:to-stone-950 p-6 sm:p-10 shadow-2xl text-center space-y-6 overflow-hidden">
              {/* زخارف أركان إسلامية دائرية */}
              <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-amber-500/10 pointer-events-none blur-xl" />
              <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-emerald-500/10 pointer-events-none blur-xl" />

              {/* رأس البسملة والتاج */}
              <div className="space-y-2">
                <span className="text-3xl block filter drop-shadow">👑</span>
                <p className="font-amiri text-lg text-amber-800 dark:text-amber-200 font-bold">
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </p>
                <div className="inline-block px-5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-stone-950 font-black text-sm sm:text-base tracking-wide shadow-md">
                  شَهَادَةُ فَخْرٍ وَإِتْقَانٍ قُرْآنِيّ
                </div>
              </div>

              {/* متن الشهادة */}
              <div className="space-y-3 max-w-xl mx-auto">
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300">
                  تَشْهَدُ إِدَارَةُ رِعَايَةِ القُرْآنِ الكَرِيمِ لِلطِّفْلِ بِأَنَّ البَطَلَ المُبَارَكَ:
                </p>

                <div className="py-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-gradient-gold font-amiri underline decoration-amber-400 decoration-wavy underline-offset-8">
                    {profile.name || "بطل القرآن الكريم"}
                  </h2>
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mt-2">
                    {childRank.icon} حاصل على رتبة: {childRank.title}
                  </p>
                </div>

                <p className="text-xs sm:text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                  قَدْ تَمَيَّزَ بِحُسْنِ الاسْتِمَاعِ وَالمُوَاظَبَةِ عَلَى تِلَاوَةِ كِتَابِ اللَّهِ عَزَّ وَجَلَّ، وَأَنْجَزَ وِرْدَهُ اليَوْمِيَّ بِجِدٍّ وَنَشَاطٍ، فَنَالَ هَذِهِ الشَّهَادَةَ تَكْرِيمَاً لَهُ وَتَشْجِيعَاً لِمَزِيدٍ مِنَ التَّفَوُّقِ.
                </p>
              </div>

              {/* أرقام الإنجاز المطبوعة في الشهادة */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto pt-2">
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-[10px] text-stone-500 font-bold">الآيات المنجزة</p>
                  <p className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-300">{quranDetails.totalAyahs} آية</p>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                  <p className="text-[10px] text-stone-500 font-bold">السور المتقنة</p>
                  <p className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-300">{quranDetails.surahsCompleted} سورة</p>
                </div>
                <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30">
                  <p className="text-[10px] text-stone-500 font-bold">النجوم المكتسبة</p>
                  <p className="text-base sm:text-lg font-black text-purple-700 dark:text-purple-300">{formatCoins(profile.coins || 0)} ⭐</p>
                </div>
                <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/30">
                  <p className="text-[10px] text-stone-500 font-bold">الالتزام المتواصل</p>
                  <p className="text-base sm:text-lg font-black text-orange-700 dark:text-orange-300">{stats.consecutiveDays} أيام</p>
                </div>
              </div>

              {/* توقيع وتاريخ */}
              <div className="flex items-center justify-between max-w-md mx-auto pt-6 text-xs border-t border-amber-400/30">
                <div className="text-right">
                  <p className="text-stone-500 text-[10px]">تاريخ المنح والتكريم:</p>
                  <p className="font-bold text-stone-800 dark:text-stone-200">{new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
                </div>
                <div className="text-left">
                  <p className="text-stone-500 text-[10px]">اعتماد وليّ الأمر:</p>
                  <p className="font-bold font-amiri text-amber-700 dark:text-amber-300 text-sm">✓ معتمد وموثق</p>
                </div>
              </div>
            </div>

            {/* أزرار الإجراءات للشهادة */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={shareCertificateWhatsApp}
                className="p-3.5 rounded-full bg-[#25D366] hover:bg-[#20ba59] text-white font-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md text-xs sm:text-sm cursor-pointer"
              >
                <WhatsAppIcon className="w-5 h-5 text-white" />
                <span>مشاركة إنجاز البطل عبر واتساب 💬</span>
              </button>

              <button
                onClick={printCertificate}
                className="p-3.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md text-xs sm:text-sm cursor-pointer"
              >
                <Printer className="w-5 h-5" />
                <span>طباعة أو حفظ الشهادة كـ PDF 🖨️</span>
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            التبويب 3: ميثاق الجوائز والتحديات العائلية (ميزة جديدة اسطورية)
            ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "rewards" && (
          <div className="space-y-5 animate-fade-in">
            {/* بطاقة شرح الميثاق */}
            <div className="card-nour p-5 rounded-3xl space-y-3 shadow-md border border-amber-400/30">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md">
                  <HeartHandshake className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-stone-900 dark:text-amber-100">
                    ميثاق الجوائز العائلية الحقيقية
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    ضع أهدافاً وجوائز واقعية يتفق عليها الوالدان مع الطفل (نزهات، هدايا، كتب، مطاعم) عند الوصول لرصيد نجوم محدد.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
                🌟 رصيد نجوم البطل الحالي: <b>{formatCoins(profile.coins || 0)} نجمة</b>. كلما استمع وقرأ القرآن أكثر، اقترب من جائزته الواقعية!
              </div>
            </div>

            {/* إضافة جائزة عائلية جديدة */}
            <div className="card-nour p-4 sm:p-5 rounded-3xl space-y-3 shadow-md border border-amber-400/30">
              <p className="font-bold text-sm text-stone-900 dark:text-amber-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-600" /> إضافة تحدٍّ وجائزة جديدة للبطل
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={newRewardTitle}
                    onChange={(e) => setNewRewardTitle(e.target.value)}
                    placeholder="مثال: رحلة لمدينة الألعاب، شراء هدية مفضلة..."
                    className="w-full rounded-2xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 p-2.5 text-xs font-bold text-foreground outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={10}
                      step={50}
                      value={newRewardStars}
                      onChange={(e) => setNewRewardStars(Number(e.target.value))}
                      className="w-full rounded-2xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 p-2.5 text-xs font-bold text-foreground outline-none text-center focus:border-amber-400"
                    />
                    <span className="text-xs font-black text-amber-600 shrink-0">⭐ نجمة</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleAddFamilyReward}
                className="w-full p-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" /> حفظ التحدي في الميثاق العائلي
              </button>
            </div>

            {/* قائمة الجوائز العائلية الحالية */}
            <div className="space-y-3">
              {familyRewards.map((reward) => {
                const childCoins = profile.coins || 0;
                const isEarned = childCoins >= reward.targetStars;
                const progressPct = Math.min(100, Math.round((childCoins / reward.targetStars) * 100));

                return (
                  <div
                    key={reward.id}
                    className={`card-nour p-4 rounded-3xl border transition-all space-y-2.5 shadow-sm ${
                      reward.completed
                        ? "border-emerald-500/40 bg-emerald-500/5 opacity-80"
                        : isEarned
                        ? "border-amber-500/50 bg-amber-500/10 shadow-md ring-1 ring-amber-400"
                        : "border-border/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                            reward.completed
                              ? "bg-emerald-500/20 text-emerald-600"
                              : isEarned
                              ? "bg-amber-500/20 text-amber-600"
                              : "bg-stone-200 dark:bg-stone-800 text-stone-500"
                          }`}
                        >
                          <Gift className="w-4 h-4" />
                        </div>
                        <div>
                          <p className={`text-xs sm:text-sm font-black ${reward.completed ? "line-through text-stone-400" : "text-foreground"}`}>
                            {reward.title}
                          </p>
                          <p className="text-[10px] text-stone-500">
                            الهدف: <b>{reward.targetStars} نجمة</b> | التقدم: <b>{progressPct}%</b>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => toggleRewardCompleted(reward.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${
                            reward.completed
                              ? "bg-emerald-500 text-white"
                              : isEarned
                              ? "bg-amber-500 hover:bg-amber-600 text-white shadow-xs"
                              : "bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
                          }`}
                        >
                          {reward.completed ? "✓ تم التسليم" : isEarned ? "🎉 تسليم الجائزة الآن" : "قيد السعي"}
                        </button>

                        <button
                          onClick={() => deleteReward(reward.id)}
                          className="w-7 h-7 rounded-full bg-destructive/15 text-destructive flex items-center justify-center active:scale-90 transition-transform"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* شريط الإنجاز للجائزة */}
                    <div className="h-2 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          reward.completed
                            ? "bg-emerald-500"
                            : isEarned
                            ? "bg-gradient-to-r from-amber-500 to-amber-600"
                            : "bg-amber-400"
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            التبويب 4: الإعدادات والورد القرآني الشامل (Master Settings & Wird)
            ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "goals" && (
          <div className="space-y-6 animate-fade-in">
            {/* ── 0. لوحة المؤشرات الحية التفاعلية وقمرة قيادة الإعدادات (HUD) ── */}
            <div className="relative rounded-3xl border-2 border-amber-400/40 bg-gradient-to-br from-amber-50/95 via-stone-50/90 to-amber-100/40 dark:from-stone-900/95 dark:via-stone-900/85 dark:to-stone-950 p-5 sm:p-7 shadow-xl overflow-hidden space-y-5">
              {/* زخرفة إسلامية خفيفة في الخلفية */}
              <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-12 -right-12 w-48 h-48 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />

              {/* شريط اختيار الطفل السريع إن وجد أكثر من طفل */}
              {profiles.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <span className="text-[11px] font-black text-stone-500 dark:text-stone-400 shrink-0">
                    التبديل بين الأبطال:
                  </span>
                  {profiles.map((p) => {
                    const isCurrent = p.id === draft.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => switchTo(p.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                          isCurrent
                            ? "bg-amber-500 text-stone-950 shadow-md ring-2 ring-amber-400 scale-102"
                            : "bg-white/80 dark:bg-stone-800/80 text-foreground hover:bg-amber-500/15 border border-stone-200 dark:border-stone-700"
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                          <Avatar name={p.avatar} className="w-full h-full object-cover" />
                        </div>
                        <span>{p.name || "بطل"}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAddChild(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 transition-all shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> إضافة بطل
                  </button>
                </div>
              )}

              {/* بطاقة الطفل الرئيسية */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* الأفاتار الدائري مع هالة الرتبة الذهبية المتألقة */}
                  <div className="relative shrink-0">
                    <div
                      className={`w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-gradient-to-br ${draft.color} p-1.5 shadow-2xl flex items-center justify-center overflow-hidden border-2 border-white dark:border-stone-800 ring-4 ring-amber-400/40`}
                    >
                      <Avatar name={draft.avatar} className="w-full h-full rounded-full object-cover" />
                    </div>
                    <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white dark:bg-stone-900 shadow-md flex items-center justify-center text-sm border-2 border-amber-400/50">
                      {childRank.icon}
                    </span>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-extrabold text-xl sm:text-2xl text-stone-900 dark:text-amber-100 font-amiri leading-tight">
                        إعدادات وضوابط: {draft.name || "الطفل"}
                      </h2>
                      <span className="text-xs font-black px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-800 dark:text-amber-200 border border-amber-500/30 shadow-xs">
                        المستوى {childRank.level} • {childRank.title}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 dark:text-stone-300 mt-1 font-medium">
                      منظومة تربوية متكاملة لضبط الورد القرآني، وقت الشاشة، الأمان، وتحديات الحفظ
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={saveChild}
                    className="px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> حفظ التغييرات
                  </button>
                </div>
              </div>

              {/* كبسولات الملخص السريع المباشر (Live Status Chips) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                <div className="p-3 rounded-2xl bg-white/70 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/80 shadow-xs flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400">الورد القرآني</p>
                    <p className="text-xs font-black text-stone-900 dark:text-stone-100 truncate">
                      {draft.goalMinutes > 0 ? `${draft.goalMinutes} دقيقة يومياً` : "مفتوح بلا قيد"}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-white/70 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/80 shadow-xs flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400">سقف اللعب</p>
                    <p className="text-xs font-black text-stone-900 dark:text-stone-100 truncate">
                      {draft.playMinutes > 0 ? `${draft.playMinutes} دقيقة لعب` : "بلا حد"}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-white/70 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/80 shadow-xs flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Crown className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400">سورة التحدي</p>
                    <p className="text-xs font-black text-stone-900 dark:text-stone-100 truncate">
                      سورة {SURAHS.find((s) => s.number === (draft.currentSurah || profile.currentSurah || 38))?.name || "الشمس"}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-white/70 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/80 shadow-xs flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400">وضع التطبيق</p>
                    <p className="text-xs font-black text-stone-900 dark:text-stone-100 truncate">
                      {pureMode ? "الوضع الصارم" : kidsLocked ? "أطفال مقفل" : "تنقل مرن"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── شريط التنقل والتصفية السريعة بين فئات الإعدادات ── */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar p-1.5 rounded-3xl bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
              {[
                { id: "all", label: "عرض كل الإعدادات", icon: Sliders },
                { id: "profile", label: "هوية بطل القرآن", icon: Baby },
                { id: "quran", label: "الورد القرآني والسورة", icon: BookOpen },
                { id: "screen", label: "وقت الشاشة واللعب", icon: Clock },
                { id: "security", label: "الأمان ونمط التطبيق", icon: Shield },
                { id: "alerts", label: "التنبيهات وإدارة الجلسة", icon: Bell },
              ].map(({ id, label, icon: Icon }) => {
                const isActive = settingsFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSettingsFilter(id as any)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 font-black shadow-md ring-2 ring-amber-400/50 scale-102"
                        : "text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* ── 1. هوية بطل القرآن والملف الشخصي ── */}
            {(settingsFilter === "all" || settingsFilter === "profile") && (
              <div className="card-nour p-5 sm:p-7 rounded-3xl space-y-5 shadow-lg border border-amber-400/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Baby className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-stone-900 dark:text-amber-100 font-amiri">
                        هوية بطل القرآن والملف الشخصي
                      </h3>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400">
                        تخصيص اسم الطفل، عمره، لونه المفضل، والشخصية الرمزية (الأفاتار)
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-black px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                    رصيد النجوم: {formatCoins(draft.coins || 0)} ⭐
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {/* اسم الطفل */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                      اسم بطل القرآن:
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        className="w-full rounded-2xl bg-white dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700 px-4 py-3 text-foreground font-bold focus:border-amber-400 outline-none text-xs transition-colors shadow-xs"
                        placeholder="اسم الطفل..."
                      />
                      <Baby className="w-4 h-4 text-stone-400 absolute left-3.5 top-3.5 pointer-events-none" />
                    </div>
                  </div>

                  {/* عمر الطفل والمرحلة التربوية */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                      العمر والمرحلة التربوية:
                    </label>
                    <div className="flex items-center justify-between px-4 py-2 rounded-2xl bg-white dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700 shadow-xs">
                      <div>
                        <span className="text-xs font-black text-amber-600 block">
                          {draft.age} سنوات
                        </span>
                        <span className="text-[10px] text-stone-500 font-bold">
                          {draft.age <= 6
                            ? "مرحلة التأسيس والتحبيب (٣-٦)"
                            : draft.age <= 10
                            ? "مرحلة الترتيل والإتقان (٧-١٠)"
                            : "مرحلة التدبر والحفظ المتقدم (١١+)"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, age: Math.max(3, draft.age - 1) })}
                          className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-700 text-foreground flex items-center justify-center active:scale-95 border border-stone-200 dark:border-stone-600 shadow-xs cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center font-black text-sm text-foreground">
                          {draft.age}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, age: Math.min(16, draft.age + 1) })}
                          className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-700 text-foreground flex items-center justify-center active:scale-95 border border-stone-200 dark:border-stone-600 shadow-xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* لون الثيم الملكي المفضل */}
                  <div className="sm:col-span-2 space-y-2 pt-2">
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2">
                      <Palette className="w-3.5 h-3.5 text-amber-600" />
                      <span>اختر الثيم اللوني للطفل:</span>
                    </label>
                    <div className="flex items-center gap-3">
                      {KID_COLORS.map((col, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setDraft({ ...draft, color: col })}
                          className={`w-10 h-10 rounded-full bg-gradient-to-br ${col} shadow-md transition-all cursor-pointer relative ${
                            draft.color === col
                              ? "ring-4 ring-amber-400 scale-110 shadow-amber-400/30"
                              : "opacity-70 hover:opacity-100 hover:scale-105"
                          }`}
                        >
                          {draft.color === col && (
                            <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-black">
                              ✓
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* معرض الشخصيات الرمزية (الأفاتار) مع ضوابط النزاهة */}
                  <div className="sm:col-span-2 space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                        الشخصية الرمزية (الأفاتار):
                      </label>
                      <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-full text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => setAvatarGenderTab("all")}
                          className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer ${
                            avatarGenderTab === "all" ? "bg-amber-500 text-stone-950 font-black shadow-xs" : "text-stone-500"
                          }`}
                        >
                          الكل
                        </button>
                        <button
                          type="button"
                          onClick={() => setAvatarGenderTab("boy")}
                          className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer ${
                            avatarGenderTab === "boy" ? "bg-amber-500 text-stone-950 font-black shadow-xs" : "text-stone-500"
                          }`}
                        >
                          الأولاد 👦
                        </button>
                        <button
                          type="button"
                          onClick={() => setAvatarGenderTab("girl")}
                          className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer ${
                            avatarGenderTab === "girl" ? "bg-amber-500 text-stone-950 font-black shadow-xs" : "text-stone-500"
                          }`}
                        >
                          البنات 👧
                        </button>
                      </div>
                    </div>

                    {/* لافتة ضوابط النزاهة وصلاحيات الولي (تعديل وقت وإحصائيات - ليس مال ولا صور) */}
                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5">
                      <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-xs text-stone-800 dark:text-stone-200">
                        <span className="font-extrabold block text-amber-900 dark:text-amber-200">
                          صلاحيات ولي الأمر وضوابط النزاهة:
                        </span>
                        <p className="text-[11px] text-stone-600 dark:text-stone-300 leading-relaxed">
                          • <b>صلاحياتك كولي أمر:</b> تعديل وضبط أوقات الورد وسقف اللعب ومتابعة الإحصائيات الشاملة.<br />
                          • <b>ليس مالاً ولا صوراً مجانية:</b> شخصيات المتجر المقفلة 🔒 لا يمكن تفعيلها مجاناً من هنا؛ بل يجب على الطفل كسب نجومها بنفسه من تلاوة القرآن وشرائها من المتجر لترسيخ دافعية الإنجاز.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 overflow-x-auto pb-3 pt-1 no-scrollbar">
                      {(avatarGenderTab === "all"
                        ? [...KID_AVATARS_BOY, ...SHOP_AVATARS_BOY.map((s) => s.value), ...KID_AVATARS_GIRL, ...SHOP_AVATARS_GIRL.map((s) => s.value)]
                        : avatarGenderTab === "boy"
                        ? [...KID_AVATARS_BOY, ...SHOP_AVATARS_BOY.map((s) => s.value)]
                        : [...KID_AVATARS_GIRL, ...SHOP_AVATARS_GIRL.map((s) => s.value)]
                      ).map((av) => {
                        const isOwned = isAvatarOwnedByProfile(av, profile);
                        const shopItem = SHOP_AVATARS.find((s) => s.value === av);
                        const isSelected = draft.avatar === av;

                        return (
                          <div key={av} className="relative flex flex-col items-center shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (isOwned) {
                                  setDraft({ ...draft, avatar: av });
                                } else {
                                  toast({
                                    title: "🔒 شخصية مقفلة في متجر الأبطال",
                                    description: `هذه الشخصية تتطلب ${formatCoins(shopItem?.cost || 15000)} ⭐ يجمعها الطفل بنفسه من تلاوة القرآن وحفظه. لا يمكن تفعيلها مجاناً في ركن الولي.`,
                                    variant: "destructive",
                                  });
                                }
                              }}
                              className={`relative w-14 h-14 rounded-full p-0.5 border-2 transition-all cursor-pointer ${
                                isSelected
                                  ? "border-amber-500 ring-4 ring-amber-400/50 scale-110 shadow-lg bg-amber-500/20"
                                  : isOwned
                                  ? "border-emerald-500/60 opacity-90 hover:opacity-100 hover:scale-105"
                                  : "border-stone-300 dark:border-stone-700 opacity-40 hover:opacity-60 grayscale hover:grayscale-0 cursor-not-allowed"
                              }`}
                              title={isOwned ? "شخصية مفتوحة ومملوكة" : `مقفلة — تتطلب ${formatCoins(shopItem?.cost || 0)} ⭐`}
                            >
                              <Avatar name={av} className="w-full h-full rounded-full object-cover" />

                              {/* علامة الاختيار للمملوك المحدد */}
                              {isSelected && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center text-[9px] shadow-sm font-black z-10">
                                  ✓
                                </span>
                              )}

                              {/* قفل على الشخصيات غير المملوكة */}
                              {!isOwned && (
                                <div className="absolute inset-0 bg-stone-950/60 rounded-full flex flex-col items-center justify-center text-white backdrop-blur-[0.5px]">
                                  <Lock className="w-3.5 h-3.5 text-amber-300" />
                                </div>
                              )}
                            </button>

                            {/* شارة الثمن للشخصيات المقفلة أو علامة "مملوك" */}
                            <span className="text-[9px] font-black mt-1 text-center truncate max-w-[60px]">
                              {isOwned ? (
                                <span className="text-emerald-600 dark:text-emerald-400">مفتوحة</span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-0.5 justify-center">
                                  {formatCoins(shopItem?.cost || 0)} ⭐
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 2. هندسة الورد القرآني وسورة الحفظ ── */}
            {(settingsFilter === "all" || settingsFilter === "quran") && (
              <div className="card-nour p-5 sm:p-7 rounded-3xl space-y-5 shadow-lg border border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-stone-900 dark:text-amber-100 font-amiri">
                        خطة الورد القرآني وسورة الحفظ والتسميع
                      </h3>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400">
                        تحديد الهدف اليومي من القراءة والاستماع لفتح الألعاب ومتابعة سورة التحدي
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-500/30">
                    {draft.goalMinutes > 0 ? `${draft.goalMinutes} دقيقة يومياً` : "مفتوح دائماً"}
                  </span>
                </div>

                {/* بطاقات خيارات دقائق الورد اليومي التفاعلية */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    اختر وقت الورد القرآني اليومي المطلوب لفتح الألعاب:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
                    {[
                      { m: 0, title: "مفتوحة دائماً", badge: "بلا قيد", icon: "🔓" },
                      { m: 5, title: "٥ دقائق", badge: "ورد ميسر", icon: "🌱" },
                      { m: 10, title: "١٠ دقائق", badge: "موصى به ⭐", icon: "⭐" },
                      { m: 15, title: "١٥ دقيقة", badge: "إتقان وترتيل", icon: "💎" },
                      { m: 20, title: "٢٠ دقيقة", badge: "حفظ متقدم", icon: "🌟" },
                      { m: 30, title: "٣٠ دقيقة", badge: "ورد الحُفّاظ", icon: "👑" },
                    ].map(({ m, title, badge, icon }) => {
                      const isSelected = draft.goalMinutes === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDraft({ ...draft, goalMinutes: m })}
                          className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            isSelected
                              ? "border-emerald-500 bg-gradient-to-b from-emerald-500/20 to-teal-500/10 ring-2 ring-emerald-400 shadow-md scale-102 font-black"
                              : "border-stone-200 dark:border-stone-700/80 bg-white/70 dark:bg-stone-800/40 hover:border-emerald-400/50"
                          }`}
                        >
                          <span className="text-xl">{icon}</span>
                          <span className="text-xs font-extrabold text-foreground">{title}</span>
                          <span
                            className={`text-[10px] px-2.5 py-0.5 rounded-full ${
                              isSelected ? "bg-emerald-600 text-white font-bold shadow-xs" : "text-stone-500"
                            }`}
                          >
                            {badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* سورة الحفظ الحالية وبطاقتها التوضيحية */}
                <div className="space-y-3 pt-2 border-t border-emerald-500/20">
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    سورة الحفظ والتسميع الحالية للبطل:
                  </label>
                  <select
                    value={draft.currentSurah || profile.currentSurah || 38}
                    onChange={(e) => setDraft({ ...draft, currentSurah: Number(e.target.value) })}
                    className="w-full rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 p-3.5 text-xs font-bold text-foreground focus:border-emerald-400 outline-none shadow-xs cursor-pointer"
                  >
                    {SURAHS.map((s) => (
                      <option key={s.number} value={s.number}>
                        سورة {s.name} ({s.ayahCount} آية) — ترتيب المصحف #{s.number}
                      </option>
                    ))}
                  </select>

                  {/* بطاقة معلومات السورة المختارة الحية الفاخرة */}
                  {(() => {
                    const currS = SURAHS.find((s) => s.number === (draft.currentSurah || profile.currentSurah || 38));
                    if (!currS) return null;
                    return (
                      <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-black shadow-xs text-sm">
                            {currS.number}
                          </div>
                          <div>
                            <p className="font-extrabold text-stone-900 dark:text-amber-100 text-sm font-amiri">
                              سورة {currS.name}
                            </p>
                            <p className="text-[11px] text-stone-500 dark:text-stone-400">
                              عدد الآيات: <b>{currS.ayahCount} آية مباركة</b> • ترتيب المصحف الشريف: <b>#{currS.number}</b>
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-black px-3.5 py-1 rounded-full bg-white dark:bg-stone-800 text-emerald-700 dark:text-emerald-300 shadow-xs border border-emerald-500/20">
                          سورة التحدي المعتمدة لحصد النجوم ✓
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* رسالة التحفيز والدعاء اليومي */}
                <div className="space-y-2 pt-2 border-t border-emerald-500/20">
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    رسالة التحفيز والدعاء اليومي للطفل (تظهر له عند إتمام الورد القرآني):
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={draft.reward || ""}
                      onChange={(e) => setDraft({ ...draft, reward: e.target.value })}
                      placeholder="أحسنت يا بطل القرآن! استحققت وقتاً ممتعاً"
                      className="w-full rounded-2xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 p-3.5 text-xs text-foreground focus:border-emerald-400 outline-none font-bold shadow-xs"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[
                      "أحسنت يا بطل القرآن! استحققت وقتاً ممتعاً 🌟",
                      "اللهم اجعل القرآن ربيع قلبك ونور صدرك 🤲",
                      "ما شاء الله! خطوة مباركة نحو حفظ كتاب الله 🕌",
                      "فخورون بك وبهمتك العالية في الترتيل 💎",
                    ].map((phrase, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setDraft({ ...draft, reward: phrase })}
                        className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-emerald-500/15 hover:text-emerald-800 dark:hover:text-emerald-200 border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer"
                      >
                        + {phrase}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── 3. انضباط وقت الشاشة وجدولة اللعب الصارمة ── */}
            {(settingsFilter === "all" || settingsFilter === "screen") && (
              <div className="card-nour p-5 sm:p-7 rounded-3xl space-y-5 shadow-lg border border-amber-400/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-stone-900 dark:text-amber-100 font-amiri">
                        انضباط وقت اللعب والجدول الصارم
                      </h3>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400">
                        تحديد سقف اللعب اليومي وجدول الحظر الصارم لمنع الإدمان على الشاشات
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-black text-rose-700 dark:text-rose-300 bg-rose-500/15 px-3 py-1 rounded-full border border-rose-500/30">
                    {draft.playMinutes > 0 ? `${draft.playMinutes} دقيقة لعب` : "مفتوح بلا حد"}
                  </span>
                </div>

                {/* بطاقات وقت اللعب التفاعلية */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    الحد اليومي المسموح به للعب (يُفتح فقط بعد إتمام الورد القرآني):
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
                    {[
                      { m: 0, title: "بلا حد", badge: "مفتوح", icon: "♾️" },
                      { m: 15, title: "١٥ دقيقة", badge: "قصير ومحدد", icon: "⚡" },
                      { m: 30, title: "٣٠ دقيقة", badge: "متوازن وذكي", icon: "🎯" },
                      { m: 45, title: "٤٥ دقيقة", badge: "وقت كافٍ", icon: "⏳" },
                      { m: 60, title: "٦٠ دقيقة", badge: "ساعة واحدة", icon: "🕐" },
                      { m: 90, title: "٩٠ دقيقة", badge: "ساعة ونصف", icon: "🕹️" },
                    ].map(({ m, title, badge, icon }) => {
                      const isSelected = draft.playMinutes === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDraft({ ...draft, playMinutes: m })}
                          className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            isSelected
                              ? "border-rose-500 bg-gradient-to-b from-rose-500/20 to-amber-500/10 ring-2 ring-rose-400 shadow-md scale-102 font-black"
                              : "border-stone-200 dark:border-stone-700/80 bg-white/70 dark:bg-stone-800/40 hover:border-rose-400/50"
                          }`}
                        >
                          <span className="text-xl">{icon}</span>
                          <span className="text-xs font-extrabold text-foreground">{title}</span>
                          <span
                            className={`text-[10px] px-2.5 py-0.5 rounded-full ${
                              isSelected ? "bg-rose-600 text-white font-bold shadow-xs" : "text-stone-500"
                            }`}
                          >
                            {badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* جدول أوقات اللعب الصارم (Curfew Timetable) */}
                <div className="space-y-3 pt-3 border-t border-amber-400/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-stone-900 dark:text-amber-100 text-xs sm:text-sm flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-amber-600" /> تفعيل جدول حظر وساعات اللعب المحددة
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        تحديد ساعات وأيام محددة يُسمح فيها فقط بالدخول لركن الألعاب
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const s = { ...schedule, enabled: !schedule.enabled };
                        setSchedule(s);
                        saveKidsSchedule(s);
                        toast({ title: s.enabled ? "✓ تم تفعيل جدول اللعب" : "تم تعطيل جدول اللعب" });
                      }}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                        schedule.enabled ? "bg-amber-500" : "bg-stone-300 dark:bg-stone-700"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${
                          schedule.enabled ? "left-0.5" : "left-[26px]"
                        }`}
                      />
                    </button>
                  </div>

                  {schedule.enabled && (
                    <div className="p-4 rounded-3xl bg-amber-500/5 border border-amber-400/25 space-y-3.5 animate-fade-down">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-muted-foreground font-bold mb-1.5 block">
                            مسموح باللعب من الساعة:
                          </label>
                          <input
                            type="time"
                            value={schedule.startTime}
                            onChange={(e) => {
                              const s = { ...schedule, startTime: e.target.value };
                              setSchedule(s);
                              saveKidsSchedule(s);
                            }}
                            className="w-full rounded-2xl bg-card border border-border p-2.5 text-xs font-bold text-foreground outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground font-bold mb-1.5 block">
                            إلى الساعة:
                          </label>
                          <input
                            type="time"
                            value={schedule.endTime}
                            onChange={(e) => {
                              const s = { ...schedule, endTime: e.target.value };
                              setSchedule(s);
                              saveKidsSchedule(s);
                            }}
                            className="w-full rounded-2xl bg-card border border-border p-2.5 text-xs font-bold text-foreground outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] text-muted-foreground font-bold mb-2 block">
                          الأيام المسموح فيها باللعب:
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((day, idx) => {
                            const isAllowed = schedule.allowedDays.includes(idx);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  const days = isAllowed
                                    ? schedule.allowedDays.filter((d) => d !== idx)
                                    : [...schedule.allowedDays, idx];
                                  const s = { ...schedule, allowedDays: days };
                                  setSchedule(s);
                                  saveKidsSchedule(s);
                                }}
                                className={`px-4 py-2 rounded-full text-xs font-black border transition-all cursor-pointer ${
                                  isAllowed
                                    ? "bg-amber-500 text-stone-950 border-amber-500 shadow-sm"
                                    : "bg-stone-100 dark:bg-stone-800 text-stone-500 border-stone-200 dark:border-stone-700"
                                }`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 4. منظومة الأمان ونمط التطبيق ── */}
            {(settingsFilter === "all" || settingsFilter === "security") && (
              <div className="card-nour p-5 sm:p-7 rounded-3xl space-y-5 shadow-lg border border-amber-400/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-stone-900 dark:text-amber-100 font-amiri">
                        منظومة الأمان ونمط التطبيق
                      </h3>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400">
                        قفل التطبيق برمز ولي الأمر (PIN) واختيار الوضع التشغيلي المناسب للأسرة
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-black px-3.5 py-1 rounded-full flex items-center gap-1.5 ${
                      pureMode
                        ? "bg-indigo-500/15 text-indigo-500 border border-indigo-500/30"
                        : kidsLocked
                        ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {pureMode ? "وضع تلاوات فقط" : kidsLocked ? "أطفال مقفل" : "تنقل مرن"}
                  </span>
                </div>

                {/* بطاقات اختيار وضع التطبيق الثلاثية */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleModeChange("flexible")}
                    className={`p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                      !kidsLocked && !pureMode
                        ? "border-amber-500 bg-amber-500/10 shadow-md ring-2 ring-amber-400/30"
                        : "border-stone-200 dark:border-stone-700/80 bg-white/70 dark:bg-stone-800/40 hover:border-amber-400/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-600">
                        <RefreshCw className="w-5 h-5" />
                      </div>
                      {!kidsLocked && !pureMode && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-stone-950">
                          النشط الآن
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-black text-foreground">وضع التنقل المرن</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        كل الميزات متاحة للجميع: المصحف، التلاوات، وركن الأطفال بلا قيود.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleModeChange("kids")}
                    className={`p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                      kidsLocked
                        ? "border-emerald-500 bg-emerald-500/10 shadow-md ring-2 ring-emerald-400/30"
                        : "border-stone-200 dark:border-stone-700/80 bg-white/70 dark:bg-stone-800/40 hover:border-emerald-400/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-500/20 text-emerald-500">
                        <Baby className="w-5 h-5" />
                      </div>
                      {kidsLocked && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                          النشط الآن
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-black text-foreground">وضع الأطفال المقفل</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        التطبيق مقفل داخل ركن الأطفال، والخروج برمز ولي الأمر فقط.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleModeChange("pure")}
                    className={`p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                      pureMode
                        ? "border-indigo-500 bg-indigo-500/10 shadow-md ring-2 ring-indigo-400/30"
                        : "border-stone-200 dark:border-stone-700/80 bg-white/70 dark:bg-stone-800/40 hover:border-indigo-400/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-indigo-500/20 text-indigo-500">
                        <Headphones className="w-5 h-5" />
                      </div>
                      {pureMode && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-500 text-white">
                          النشط الآن
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-black text-foreground">الوضع الصارم (تلاوات)</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        مخصص للبالغين: إخفاء تام لركن الأطفال، تلاوات واستماع ومصحف فقط.
                      </p>
                    </div>
                  </button>
                </div>

                {/* بطاقة قفل ولي الأمر (PIN) */}
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-400/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-foreground">
                        {hasKidsPin() ? "رمز مرور ولي الأمر مفعّل ومحمي ✓" : "لا يوجد رمز مرور مُعيّن بعد"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {hasKidsPin()
                          ? "مطلوب للخروج من وضع الأطفال والدخول للوحة ولي الأمر"
                          : "عيّن رمزاً مكوناً من 4 أرقام لمنع الطفل من مغادرة ركنه"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowPinDialog(true)}
                      className="px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-black text-xs active:scale-95 shadow-sm cursor-pointer"
                    >
                      {hasKidsPin() ? "تغيير رمز المرور" : "تعيين رمز المرور"}
                    </button>
                    {hasKidsPin() && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("هل أنت متأكد من إزالة رمز الحماية؟ سيصبح التطبيق مفتوحاً للجميع.")) {
                            removeKidsPin();
                            refresh();
                            toast({ title: "تم إزالة رمز الحماية" });
                          }
                        }}
                        className="px-3.5 py-2 rounded-full bg-destructive/15 text-destructive font-black text-xs hover:bg-destructive/25 transition-all cursor-pointer"
                      >
                        إزالة الرمز
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── 5. التنبيهات الذكية وإدارة جلسة اليوم ── */}
            {(settingsFilter === "all" || settingsFilter === "alerts") && (
              <div className="card-nour p-5 sm:p-7 rounded-3xl space-y-5 shadow-lg border border-amber-400/30">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-stone-900 dark:text-amber-100 font-amiri">
                      التنبيهات الذكية وإدارة جلسة اليوم
                    </h3>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      ضبط مواعيد تذكير الدروس اليومية، فحص الإشعارات، وإعادة ضبط الدقائق عند الحاجة
                    </p>
                  </div>
                </div>

                {/* موعد الدرس اليومي */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-foreground">
                    موعد الدرس القرآني اليومي (إشعار تذكير يومي للطفل):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={profile.lessonTime || ""}
                      onChange={(e) => saveLesson(e.target.value)}
                      className="flex-1 rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 p-3 text-foreground font-bold text-xs outline-none"
                    />
                    {profile.lessonTime && (
                      <button
                        type="button"
                        onClick={() => saveLesson("")}
                        className="px-4 py-3 rounded-2xl bg-destructive/15 text-destructive font-bold text-xs hover:bg-destructive/25 transition-colors cursor-pointer"
                      >
                        إلغاء التذكير
                      </button>
                    )}
                  </div>
                </div>

                {/* أزرار الإجراءات السريعة: اختبار الإشعار + إعادة ضبط اليوم */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-400/20">
                  <button
                    type="button"
                    onClick={async () => {
                      const granted = await requestNotificationPermission();
                      await showLocalNotification(
                        "تذكير القرآن الكريم 🌟",
                        `حان موعد درس القرآن للبطل ${draft.name || "الطفل"}! بارك الله فيك.`
                      );
                      if (!granted) {
                        toast({
                          title: "تنبيه صلاحيات النظام ℹ️",
                          description: "يعمل بتنبيهات التطبيق، ويمكنك السماح بالإشعارات من إعدادات النظام لتظهر على الهاتف أو سطح المكتب.",
                        });
                      }
                    }}
                    className="p-3.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-200 font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all border border-amber-400/30 shadow-xs cursor-pointer"
                  >
                    <Bell className="w-4 h-4 text-amber-600" />
                    <span>تجربة إرسال إشعار تذكير 🔔</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`هل تريد إعادة ضبط دقائق قراءة ولعب اليوم فقط للطفل «${draft.name || "الطفل"}»؟`)) {
                        resetProgress();
                        refresh();
                        toast({ title: "✓ تم إعادة ضبط سجل اليوم بنجاح" });
                      }
                    }}
                    className="p-3.5 rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all border border-stone-200 dark:border-stone-700 shadow-xs cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 text-stone-500" />
                    <span>إعادة ضبط سجل اليوم فقط</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── 6. شريط الحفظ والتطبيق الملكي المزدوج الموحد ── */}
            <div className="sticky bottom-4 z-20 p-3 sm:p-4 rounded-3xl bg-stone-900/90 dark:bg-stone-900/95 backdrop-blur-md border-2 border-amber-400/40 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-amber-200 text-xs font-bold text-center sm:text-right">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>جميع تعديلات إعدادات {draft.name || "الطفل"} جاهزة للحفظ والتطبيق الفوري</span>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(profile);
                    toast({ title: "تم التراجع عن التغييرات واستعادة الإعدادات السابقة" });
                  }}
                  className="flex-1 sm:flex-none px-4 py-3 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs transition-colors cursor-pointer"
                >
                  استعادة الأصل
                </button>
                <button
                  type="button"
                  onClick={saveChild}
                  className="flex-1 sm:flex-none px-6 py-3 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-black flex items-center justify-center gap-2 active:scale-95 shadow-xl shadow-amber-500/25 transition-all text-xs sm:text-sm cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ وتطبيق الإعدادات بنجاح</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            التبويب 5: مركز حماية الألعاب والأمان
            ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "games_safety" && (
          <div className="space-y-5 animate-fade-in">
            {/* أوضاع التطبيق — بطاقة الحالة */}
            <div
              className={`rounded-3xl p-5 border-2 shadow-sm transition-all ${
                pureMode
                  ? "border-indigo-500/40 bg-gradient-to-br from-indigo-500/10 to-transparent"
                  : kidsLocked
                  ? "border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-transparent"
                  : "border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-transparent"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
                      pureMode
                        ? "bg-indigo-500/20 text-indigo-500"
                        : kidsLocked
                        ? "bg-emerald-500/20 text-emerald-500"
                        : "bg-amber-500/20 text-amber-600"
                    }`}
                  >
                    {pureMode ? (
                      <Headphones className="w-6 h-6" />
                    ) : kidsLocked ? (
                      <Baby className="w-6 h-6" />
                    ) : (
                      <RefreshCw className="w-6 h-6" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                      الوضع الحالي للتطبيق
                    </p>
                    <p className="text-base font-black text-foreground truncate">
                      {pureMode
                        ? "الوضع الصارم (تلاوات فقط)"
                        : kidsLocked
                        ? "وضع الأطفال المقفل"
                        : "وضع التنقل المرن"}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-black px-3 py-1.5 rounded-full shrink-0 flex items-center gap-1 ${
                    pureMode
                      ? "bg-indigo-500/15 text-indigo-500"
                      : kidsLocked
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-amber-500/15 text-amber-700"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> مُفعّل
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                {pureMode
                  ? "ركن الأطفال مخفيٌّ تماماً. التطبيق مخصّص للبالغين: المصحف والتلاوات والاستماع فقط."
                  : kidsLocked
                  ? "التطبيق مقفلٌ داخل ركن الأطفال. لا يمكن الخروج إلا بإدخال رمز ولي الأمر."
                  : "كامل ميزات التطبيق وركن الأطفال متاحة ومفتوحة للجميع دون قيود."}
              </p>
            </div>

            {/* أوضاع التطبيق — بطاقات الاختيار */}
            <div className="card-nour p-4 sm:p-5 rounded-3xl space-y-3 shadow-md border border-amber-400/30">
              <div className="flex items-center justify-between">
                <p className="font-extrabold text-stone-900 dark:text-amber-100 text-sm flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-600" /> اختيار وضع التطبيق
                </p>
                <span className="text-[11px] text-muted-foreground">اضغط للتبديل فوراً</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                <button
                  onClick={() => handleModeChange("flexible")}
                  className={`group relative p-3.5 rounded-2xl border-2 transition-all text-right active:scale-[0.98] flex items-start gap-3 ${
                    !kidsLocked && !pureMode
                      ? "border-amber-500 bg-amber-500/10 shadow-sm"
                      : "border-border/60 bg-card hover:border-amber-400/50"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-amber-500/20 text-amber-600">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-foreground">وضع التنقل المرن</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      كل الميزات مفتوحة: المصحف + التلاوات + ركن الأطفال والألعاب.
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => handleModeChange("kids")}
                  className={`group relative p-3.5 rounded-2xl border-2 transition-all text-right active:scale-[0.98] flex items-start gap-3 ${
                    kidsLocked
                      ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
                      : "border-border/60 bg-card hover:border-emerald-500/50"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-emerald-500/20 text-emerald-500">
                    <Baby className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-foreground">وضع الأطفال المقفل</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      التطبيق مقفل داخل ركن الأطفال، والخروج برمز ولي الأمر فقط.
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => handleModeChange("pure")}
                  className={`group relative p-3.5 rounded-2xl border-2 transition-all text-right active:scale-[0.98] flex items-start gap-3 ${
                    pureMode
                      ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
                      : "border-border/60 bg-card hover:border-indigo-500/50"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-indigo-500/20 text-indigo-500">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-foreground">الوضع الصارم (تلاوات فقط)</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      للبالغين: إخفاء تام لركن الأطفال. المصحف والتلاوات فقط.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* رمز الحماية لولي الأمر */}
            <div className="card-nour p-4 sm:p-5 rounded-3xl space-y-3 shadow-md border border-amber-400/30">
              <p className="font-extrabold text-stone-900 dark:text-amber-100 text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" /> رمز حماية ولي الأمر (PIN)
              </p>
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/5 border border-amber-400/20">
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-5 h-5 text-amber-600" />
                  <div>
                    <p className="text-xs font-black text-foreground">
                      {hasKidsPin() ? "رمز المرور مفعّل ✓" : "لا يوجد رمز مرور بعد"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {hasKidsPin()
                        ? "مطلوب للخروج من وضع الأطفال والدخول للوحة ولي الأمر"
                        : "عيّن رمزاً لحماية طفلك من الخروج العشوائي"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPinDialog(true)}
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-black active:scale-95 shadow-sm"
                >
                  {hasKidsPin() ? "تغيير الرمز" : "تعيين الرمز"}
                </button>
              </div>

              {hasKidsPin() && (
                <button
                  onClick={() => {
                    if (window.confirm("هل أنت متأكد من إزالة رمز الحماية؟ سيتم فتح التطبيق للجميع.")) {
                      removeKidsPin();
                      refresh();
                      toast({ title: "تم إزالة رمز الحماية" });
                    }
                  }}
                  className="w-full p-2.5 rounded-full bg-destructive/15 hover:bg-destructive/25 text-destructive font-black text-xs active:scale-95 transition-all"
                >
                  إزالة رمز الحماية
                </button>
              )}
            </div>

            {/* التحكم في ألعاب الطفل */}
            <div className="card-nour p-4 sm:p-5 rounded-3xl space-y-3 shadow-md border border-amber-400/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-extrabold text-stone-900 dark:text-amber-100 text-sm flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4 text-amber-600" /> إدارة ألعاب {profile.name || "الطفل"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    الألعاب المخفية لا تظهر نهائياً للطفل في ركن الأطفال.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAllGames(true)}
                    className="px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-xs border border-emerald-500/30 active:scale-95"
                  >
                    تفعيل الكل
                  </button>
                  <button
                    onClick={() => toggleAllGames(false)}
                    className="px-3 py-1.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold text-xs border border-rose-500/30 active:scale-95"
                  >
                    تعطيل الكل
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto no-scrollbar pt-1">
                {catalog.map((g) => {
                  const isHidden = hiddenGameIds.includes(g.id);
                  const isCore = g.id === "surahaudio";
                  return (
                    <div
                      key={g.id}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-2xl border transition-all ${
                        isHidden
                          ? "bg-secondary/40 border-border/40 opacity-70"
                          : "bg-card border-border/70"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${g.tint}`}
                        >
                          <Gamepad2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-foreground truncate">{g.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {g.cost > 0 ? `${formatCoins(g.cost)} ⭐` : "مجانية"} · {g.ageMin}+ سنوات
                          </p>
                        </div>
                      </div>

                      {isCore ? (
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-500/15 px-2.5 py-1 rounded-full shrink-0">
                          أساسية دائماً
                        </span>
                      ) : (
                        <button
                          onClick={() => toggleGameVisibility(g)}
                          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all ${
                            isHidden
                              ? "bg-rose-500/15 text-rose-500"
                              : "bg-emerald-500/15 text-emerald-500"
                          }`}
                          title={isHidden ? "إظهار اللعبة" : "إخفاء اللعبة"}
                        >
                          {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* صندوق رسائل الدعم الفني الواردة */}
            {inboxMessages.length > 0 && (
              <div className="card-nour p-4 rounded-3xl space-y-2.5 shadow-md border border-amber-400/30">
                <p className="font-bold text-stone-900 dark:text-amber-100 flex items-center gap-2 text-xs sm:text-sm">
                  <MessageSquare className="w-4 h-4 text-amber-600" /> رسائل الدعم الفني
                  <span className="text-[10px] font-black text-white bg-amber-500 px-2 py-0.5 rounded-full">
                    {inboxMessages.length}
                  </span>
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
                  {inboxMessages.map((m, i) => (
                    <div
                      key={m.id || i}
                      className="p-3 rounded-2xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-foreground truncate">
                          {m.typeLabel || "رسالة دعم"}
                        </span>
                        <button
                          onClick={() => {
                            deleteLocalSupportMessage(m.id || "");
                            setInboxMessages(getLocalSupportMessages());
                          }}
                          className="w-6 h-6 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0"
                          title="حذف الرسالة"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{m.description}</p>
                      <span className="text-[9px] text-muted-foreground/70">{m.timestamp}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("هل أنت متأكد من مسح كل رسائل الدعم؟")) {
                      clearLocalSupportMessages();
                      setInboxMessages(getLocalSupportMessages());
                      toast({ title: "تم مسح كل الرسائل" });
                    }
                  }}
                  className="w-full p-2.5 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive font-bold text-[11px] active:scale-95 transition-all"
                >
                  مسح كل الرسائل
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* نافذة إضافة طفل جديد */}
      {showAddChild && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
          dir="rtl"
          onClick={() => setShowAddChild(false)}
        >
          <div
            className="relative w-full max-w-sm glass-nour shadow-2xl p-5 space-y-4 rounded-3xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-gradient-gold">إضافة بطل قرآني جديد</h3>
              <button
                onClick={() => setShowAddChild(false)}
                className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-20 h-20 rounded-full bg-gradient-to-br ${newKid.color} flex items-center justify-center shadow-lg overflow-hidden border-2 border-white`}
              >
                <Avatar name={newKid.avatar} className="w-full h-full object-cover" />
              </div>
              <input
                value={newKid.name}
                onChange={(e) => setNewKid({ ...newKid, name: e.target.value })}
                placeholder="اسم الطفل (مثال: يوسف، سارة)"
                autoFocus
                className="w-full text-center rounded-2xl bg-secondary border border-border px-3 py-2 text-foreground font-bold focus:border-amber-400 outline-none text-xs"
              />
            </div>

            <div className="flex items-center justify-between p-2 rounded-2xl bg-secondary/40">
              <span className="text-xs font-bold text-foreground">العمر</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewKid({ ...newKid, age: Math.max(3, newKid.age - 1) })}
                  className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center active:scale-95 border"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center font-black text-lg text-amber-600">
                  {newKid.age}
                </span>
                <button
                  onClick={() => setNewKid({ ...newKid, age: Math.min(16, newKid.age + 1) })}
                  className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center active:scale-95 border"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <span className="block text-[11px] text-muted-foreground mb-1.5 font-bold">
                جنس الطفل:
              </span>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setNewKid({ ...newKid, gender: "boy", avatar: KID_AVATARS_BOY[0] })}
                  className={`flex-1 py-2 rounded-full text-xs font-bold transition-all border ${
                    newKid.gender === "boy" ? "bg-amber-500/20 border-amber-500 text-amber-700" : "bg-card text-muted-foreground"
                  }`}
                >
                  ولد
                </button>
                <button
                  onClick={() => setNewKid({ ...newKid, gender: "girl", avatar: KID_AVATARS_GIRL[0] })}
                  className={`flex-1 py-2 rounded-full text-xs font-bold transition-all border ${
                    newKid.gender === "girl" ? "bg-pink-500/20 border-pink-500 text-pink-500" : "bg-card text-muted-foreground"
                  }`}
                >
                  بنت
                </button>
              </div>

              <span className="block text-[11px] text-muted-foreground mb-1.5 font-bold">
                اختر شخصية الأفاتار:
              </span>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1.5 border rounded-2xl bg-secondary/40">
                {(newKid.gender === 'girl' ? KID_AVATARS_GIRL : KID_AVATARS_BOY).map((a) => (
                  <button
                    key={a}
                    onClick={() => setNewKid({ ...newKid, avatar: a })}
                    className={`w-10 h-10 rounded-full p-0.5 transition-all flex items-center justify-center ${
                      newKid.avatar === a
                        ? "ring-2 ring-amber-500 scale-105 bg-amber-500/20"
                        : "bg-card hover:bg-secondary"
                    }`}
                  >
                    <Avatar name={a} className="w-full h-full rounded-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={createChild}
              className="w-full p-3 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black flex items-center justify-center gap-2 active:scale-95 shadow-md text-xs cursor-pointer"
            >
              <Check className="w-5 h-5" /> إنشاء ملف الطفل
            </button>
          </div>
        </div>
      )}

      {/* نافذة تعيين رمز PIN وسؤال الأمان */}
      {showPinDialog && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in"
          dir="rtl"
          onClick={() => setShowPinDialog(false)}
        >
          <div
            className="w-full max-w-sm glass-nour p-5 rounded-3xl shadow-2xl space-y-4 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gradient-gold flex items-center gap-1.5">
                <KeyRound className="w-5 h-5 text-amber-600" /> رمز حماية ولي الأمر
              </h3>
              <button
                onClick={() => setShowPinDialog(false)}
                className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">
                أدخل رمز المرور المكون من 4 أرقام:
              </label>
              <input
                type="password"
                maxLength={4}
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                autoFocus
                className="w-full text-center tracking-[1em] text-2xl font-black rounded-2xl bg-secondary border border-border p-3 text-foreground focus:border-amber-400 outline-none"
              />
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border/50">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600" /> السؤال السري للاسترجاع (عند نسيان الرمز):
              </label>
              <select
                value={secQuestion}
                onChange={(e) => setSecQuestionState(e.target.value)}
                className="w-full rounded-2xl bg-secondary border border-border p-2 text-xs text-foreground font-medium"
              >
                {DEFAULT_SECURITY_QUESTIONS.map((q, idx) => (
                  <option key={idx} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={secAnswer}
                onChange={(e) => setSecAnswer(e.target.value)}
                placeholder="إجابتك السرية..."
                className="w-full rounded-2xl bg-secondary border border-border p-2 text-xs text-foreground focus:border-amber-400 outline-none"
              />
            </div>

            <button
              onClick={saveNewPin}
              className="w-full p-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white font-black flex items-center justify-center gap-2 active:scale-95 shadow-md text-xs cursor-pointer"
            >
              <Check className="w-4 h-4" /> حفظ الرمز وتفعيله
            </button>
          </div>
        </div>
      )}

      {/* نافذة الأوسمة والإنجازات */}
      {showBadges && <BadgesModal onClose={() => setShowBadges(false)} />}

      {/* نافذة الدعم الفني والمساعدة */}
      {showSupportModal && <SupportModal onClose={() => setShowSupportModal(false)} />}
    </div>
  );
}
