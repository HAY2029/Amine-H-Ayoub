import { useState, useEffect } from "react";
import {
  X,
  Trophy,
  Flame,
  Award,
  Crown,
  ShieldCheck,
  Star,
  BookOpen,
  Sparkles,
  Gamepad2,
  Zap,
  Headphones,
  CheckCircle2,
  Lock,
  Download,
} from "lucide-react";
import { getBadgesList, calculateStreak, checkAndUnlockBadges, Badge } from "@/data/kidsBadges";
import { getProfile, getProgress, getCoins } from "@/data/kidsProfile";
import { downloadStreakCertificate } from "@/utils/certificateGenerator";
import { getAvatarSrc } from "@/components/Avatar";
import { toast } from "@/hooks/use-toast";

interface Props {
  onClose: () => void;
}

const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  Flame,
  Trophy,
  ShieldCheck,
  Award,
  Crown,
  BookOpen,
  Sparkles,
  Gamepad2,
  Star,
  Zap,
  Headphones,
};

function formatDaysCount(count: number): string {
  if (count <= 0) return "0 يوم";
  if (count === 1) return "يوم واحد";
  if (count === 2) return "يومان";
  if (count >= 3 && count <= 10) return `${count} أيام`;
  return `${count} يوماً`;
}

export default function BadgesModal({ onClose }: Props) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [filter, setFilter] = useState<"all" | "unlocked" | "streak">("all");
  const [streakInfo, setStreakInfo] = useState({
    currentStreak: 0,
    longestStreak: 0,
    thisWeekDays: [false, false, false, false, false, false, false],
    dayNamesArr: ["", "", "", "", "", "", ""],
    monthActiveCount: 0,
  });
  const [isDownloading, setIsDownloading] = useState(false);

  const profile = getProfile();

  const refresh = () => {
    checkAndUnlockBadges();
    setBadges(getBadgesList());
    setStreakInfo(calculateStreak());
  };

  const handleDownloadCertificate = async () => {
    setIsDownloading(true);
    try {
      const prog = getProgress();
      const c = getCoins();
      await downloadStreakCertificate({
        studentName: profile.name || "بطل القرآن الصغير",
        avatarName: getAvatarSrc(profile.avatar || "img-boy-1").split("/").pop()?.replace(/\.jpg$/i, "") || "img-boy-1",
        currentStreak: streakInfo.currentStreak,
        longestStreak: streakInfo.longestStreak,
        minutes: prog.minutes || 0,
        coins: c || 0,
      });
      toast({
        title: "🎉 تم تحميل شهادة الإنجاز والحماس بنجاح!",
        description: "تم حفظ الصورة بجودة عالية في جهازك.",
      });
    } catch {
      toast({
        title: "تعذر إنشاء الشهادة حالياً",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    refresh();
    const handleUnlock = () => refresh();
    window.addEventListener("mushaf:badge_unlocked", handleUnlock);
    window.addEventListener("mushaf:coins", handleUnlock);
    return () => {
      window.removeEventListener("mushaf:badge_unlocked", handleUnlock);
      window.removeEventListener("mushaf:coins", handleUnlock);
    };
  }, []);

  const unlockedCount = badges.filter((b) => b.unlocked).length;

  const filteredBadges = badges.filter((b) => {
    if (filter === "unlocked") return b.unlocked;
    if (filter === "streak") return b.category === "streak";
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-card border border-border shadow-2xl p-5 space-y-4 max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* زر الإغلاق */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors z-20"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* رأس النافذة */}
        <div className="flex items-center gap-3 pr-1">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center ring-2 ring-amber-500/25 shadow-inner">
            <Trophy className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-extrabold text-xl text-foreground flex items-center gap-2">
              لوحة الأوسمة والإنجازات
            </h3>
            <p className="text-xs text-muted-foreground">
              {profile.name ? `أوسمة البطل ${profile.name}` : "أوسمتك القرآنية والتحديات"} ({unlockedCount} / {badges.length})
            </p>
          </div>
        </div>

        {/* كرت سلسلة الالتزام (Streak Banner) - تم تطويره ليكون مليئاً بالحماس */}
        <div className="shrink-0 rounded-3xl p-5 bg-gradient-to-br from-stone-900 via-stone-950 to-black border border-amber-500/20 space-y-5 shadow-[0_0_25px_rgba(245,158,11,0.15)] relative mt-2 overflow-hidden">
          {/* تأثيرات إضاءة خلفية للنار */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 blur-[40px] rounded-full -mr-10 -mt-10 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-orange-600/10 blur-[30px] rounded-full -ml-10 -mb-10 pointer-events-none"></div>

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <span className={`flex items-center justify-center ${streakInfo.currentStreak > 0 ? "animate-pulse" : "opacity-50"}`}>
                <Flame 
                  className={`transition-all duration-500 ease-out ${
                    streakInfo.currentStreak >= 7 ? "w-12 h-12 text-red-500 fill-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.9)] scale-110" :
                    streakInfo.currentStreak >= 5 ? "w-10 h-10 text-orange-500 fill-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.8)] scale-105" :
                    streakInfo.currentStreak >= 3 ? "w-9 h-9 text-amber-500 fill-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.7)]" :
                    streakInfo.currentStreak >= 1 ? "w-8 h-8 text-yellow-500 fill-yellow-500 drop-shadow-[0_0_6px_rgba(234,179,8,0.6)]" :
                    "w-8 h-8 text-zinc-700 fill-zinc-800"
                  }`} 
                />
              </span>
              <div>
                <span className="block font-black text-lg text-white tracking-wide drop-shadow-md">
                  سلسلة الحماس: <span className="text-amber-400">{formatDaysCount(streakInfo.currentStreak)}</span> 🔥
                </span>
                <span className="block text-[11px] text-amber-200/60 font-medium mt-0.5">
                  أطول سلسلة حققتها: {formatDaysCount(streakInfo.longestStreak)}
                </span>
              </div>
            </div>
            <span className="text-xs font-black text-amber-950 bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1.5 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.4)] animate-pulse shrink-0">
              واظب يومياً
            </span>
          </div>

          {/* دوائر أيام الأسبوع (مسار يبدأ من اليمين [السبت] وينتهي في اليسار [اليوم]) */}
          <div className="pt-2 pb-2 relative z-10 w-full">
            {/* خط المسار الخلفي الثابت الشامل بين مراكز الدوائر */}
            <div 
              className="absolute top-[26px] -translate-y-1/2 left-[7.14%] right-[7.14%] h-1 bg-zinc-800/80 rounded-full shadow-inner pointer-events-none"
            />
            
            {/* مقاطع المسار النشط المتوهج بين الأيام المتتالية المنجزة */}
            <div 
              className="absolute top-[26px] -translate-y-1/2 left-[7.14%] right-[7.14%] h-1 flex pointer-events-none z-0" 
              dir="rtl"
            >
              {[0, 1, 2, 3, 4, 5].map((segIdx) => {
                const isSegmentActive =
                  Boolean(streakInfo.thisWeekDays[segIdx]) &&
                  Boolean(streakInfo.thisWeekDays[segIdx + 1]);
                return (
                  <div
                    key={segIdx}
                    className={`flex-1 h-full transition-all duration-500 ${
                      isSegmentActive
                        ? "bg-gradient-to-l from-amber-400 via-orange-500 to-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.7)]"
                        : "bg-transparent"
                    }`}
                  />
                );
              })}
            </div>
            
            <div className="grid grid-cols-7 relative z-10 w-full" dir="rtl">
              {[0, 1, 2, 3, 4, 5, 6].map((idx) => {
                const active = streakInfo.thisWeekDays[idx];
                const isToday = idx === 6;
                return (
                  <div key={idx} className="flex flex-col items-center gap-2 group">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                        active
                          ? "bg-gradient-to-br from-amber-400 to-orange-600 ring-4 ring-stone-900 shadow-[0_0_15px_rgba(245,158,11,0.7)] scale-110"
                          : "bg-zinc-900 ring-2 ring-zinc-800 shadow-inner group-hover:bg-zinc-800"
                      }`}
                    >
                      {active ? (
                        <Flame className="w-5 h-5 fill-white text-white drop-shadow-md" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-zinc-700/50"></div>
                      )}
                    </div>
                    <span className={`text-[11px] font-bold truncate w-full text-center transition-colors ${
                      isToday 
                        ? "text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)] scale-110" 
                        : active 
                          ? "text-amber-200/90" 
                          : "text-zinc-500"
                    }`}>
                      {isToday ? "اليوم" : (streakInfo.dayNamesArr[idx] || "")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* شريط إحصائية أيام الحماس في الشهر وزر تحميل الشهادة الفاخرة */}
          <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2.5 relative z-10">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-sm border border-amber-500/30">
                📅
              </span>
              <div>
                <span className="text-xs font-black text-white block">
                  أيام الحماس هذا الشهر: <span className="text-amber-400">{formatDaysCount(Math.max(streakInfo.monthActiveCount, streakInfo.currentStreak, 1))}</span> 🔥
                </span>
                <span className="text-[10px] text-zinc-400 font-medium">
                  {streakInfo.monthActiveCount >= 20 ? "همة قرآنية أسطورية متميزة! 🌟" : "واصل التلاوة لزيادة أيام همتك وحماسك"}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  if (isDownloading) return;
                  setIsDownloading(true);
                  try {
                    const { downloadLegendaryCertificate } = await import("../utils/certificateGenerator");
                    
                    // حساب إحصائيات القرآن مثل الموجودة في الإعدادات
                    let totalAyahs = 0;
                    let surahsCompleted = 0;
                    if (profile.stats?.history) {
                      const uniqueAyahs = new Set<string>();
                      const surahCounts: Record<number, number> = {};
                      Object.values(profile.stats.history).forEach(day => {
                        day.ayahs?.forEach(a => {
                          uniqueAyahs.add(a);
                          const surahNum = parseInt(a.split(':')[0]);
                          surahCounts[surahNum] = (surahCounts[surahNum] || 0) + 1;
                        });
                      });
                      totalAyahs = uniqueAyahs.size;
                      surahsCompleted = Object.values(surahCounts).filter(count => count >= 3).length; // تقدير بسيط
                    }

                    await downloadLegendaryCertificate({
                      studentName: profile.name,
                      avatarName: profile.avatar,
                      totalAyahs: totalAyahs,
                      surahsCompleted: surahsCompleted,
                      coins: profile.coins || 0,
                      streakDays: Math.max(streakInfo.currentStreak, 1)
                    });
                    toast({
                      title: "🎉 تم تحميل الشهادة الأسطورية بنجاح!",
                      description: "تجدها في مجلد التنزيلات بجهازك",
                    });
                  } catch (e) {
                    toast({
                      title: "تعذر إنشاء الشهادة حالياً",
                      description: "يرجى المحاولة مرة أخرى لاحقاً",
                      variant: "destructive"
                    });
                  } finally {
                    setIsDownloading(false);
                  }
                }}
                disabled={isDownloading}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-stone-950 font-black text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer shrink-0 w-full justify-center"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isDownloading ? "جاري التجهيز..." : "تحميل الشهادة الأسطورية 👑"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* فلاتر الأوسمة */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl">
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filter === "all"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            الكل ({badges.length})
          </button>
          <button
            onClick={() => setFilter("unlocked")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filter === "unlocked"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            المكتسبة 🏆 ({unlockedCount})
          </button>
          <button
            onClick={() => setFilter("streak")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filter === "streak"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            سلسلة الأيام 🔥
          </button>
        </div>

        {/* قائمة الأوسمة */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 -mr-1">
          {filteredBadges.map((badge) => {
            const IconComponent = ICON_COMPONENTS[badge.icon] || Award;
            return (
              <div
                key={badge.id}
                className={`p-3 rounded-2xl border transition-all flex items-center gap-3 ${
                  badge.unlocked
                    ? "bg-card border-amber-500/40 shadow-sm ring-1 ring-amber-500/20"
                    : "bg-muted/40 border-border opacity-75"
                }`}
              >
                {/* الأيقونة */}
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
                    badge.unlocked
                      ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-500/30"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <IconComponent className="w-6 h-6" />
                </div>

                {/* التفاصيل */}
                <div className="flex-1 min-w-0 text-right">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="font-extrabold text-sm text-foreground truncate">
                      {badge.title}
                    </span>
                    <span className="text-[11px] font-extrabold text-amber-500 flex items-center gap-0.5 shrink-0">
                      <Star className="w-3 h-3 fill-current" /> +{badge.rewardCoins}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-1 mb-1.5">
                    {badge.description}
                  </p>

                  {/* شريط التقدم */}
                  {badge.unlocked ? (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>تم تحقيقه بنجاح</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${badge.progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
                        <span className="flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" /> مقفل
                        </span>
                        <span>{badge.progressLabel}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
