import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./Intro3DCarousel.css";
import { Sparkles, BookOpen } from "lucide-react";

export const INTRO_SEEN_KEY = "app_intro_seen_session_v3";
export const INTRO_SEEN_PERMANENT_KEY = "app_intro_seen_device_v3";

export const hasSeenIntro = (): boolean => {
  try {
    // ⚡ فتح فوري للمستخدمين العائدين: تخطي شاشة البداية إن شوهدت مسبقاً على هذا الجهاز
    if (localStorage.getItem(INTRO_SEEN_PERMANENT_KEY) === "true") return true;
    return sessionStorage.getItem(INTRO_SEEN_KEY) === "true";
  } catch {
    return false;
  }
};

export const markIntroSeen = () => {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, "true");
    localStorage.setItem(INTRO_SEEN_PERMANENT_KEY, "true");
  } catch {
    /* ignore */
  }
};

export const resetIntroSeen = () => {
  try {
    sessionStorage.removeItem(INTRO_SEEN_KEY);
    localStorage.removeItem(INTRO_SEEN_PERMANENT_KEY);
    localStorage.removeItem("app_intro_seen_v1");
  } catch {
    /* ignore */
  }
};

export interface CardConfig {
  index: number;
  colorCard: string; // RGB string "r, g, b"
  name: string;
  targetTag: string; // matches [data-color-target="..."]
  fallback: { xRatio: number; yRatio: number };
}

// 🌈 البطاقات العشر بألوانها وأهدافها الدقيقة في واجهة التطبيق
export const CARDS_DATA: CardConfig[] = [
  { index: 0, colorCard: "34, 211, 238", name: "سماوي - تلاوات", targetTag: "cyan-audio", fallback: { xRatio: 0.62, yRatio: 0.22 } },
  { index: 1, colorCard: "52, 211, 153", name: "أخضر نعناعي - مكية", targetTag: "green-meccan", fallback: { xRatio: 0.53, yRatio: 0.34 } },
  { index: 2, colorCard: "16, 185, 129", name: "زمردي - المصحف", targetTag: "emerald-mushaf", fallback: { xRatio: 0.56, yRatio: 0.22 } },
  { index: 3, colorCard: "245, 158, 11",  name: "ذهبي - جزء عمّ", targetTag: "gold-filter", fallback: { xRatio: 0.59, yRatio: 0.34 } },
  // 🌟 اللون الأصفر الساطع: يطير مباشرة للزر الأصفر الذهبي (زر الترتيب العشوائي الأصفر)!
  { index: 4, colorCard: "250, 204, 21",  name: "أصفر ذهبي - زر أصفر", targetTag: "yellow-shuffle", fallback: { xRatio: 0.41, yRatio: 0.29 } },
  { index: 5, colorCard: "251, 146, 60",  name: "برتقالي - الكل", targetTag: "yellow-filter", fallback: { xRatio: 0.65, yRatio: 0.34 } },
  { index: 6, colorCard: "244, 63, 94",   name: "مرجاني - الإعدادات", targetTag: "orange-settings", fallback: { xRatio: 0.38, yRatio: 0.22 } },
  { index: 7, colorCard: "217, 70, 239",  name: "فوشيا - المتجر", targetTag: "pink-shop", fallback: { xRatio: 0.50, yRatio: 0.22 } },
  { index: 8, colorCard: "168, 85, 247",  name: "بنفسجي - الألعاب", targetTag: "purple-games", fallback: { xRatio: 0.51, yRatio: 0.22 } },
  { index: 9, colorCard: "59, 130, 246",   name: "أزرق ياقوتي - مدنية", targetTag: "blue-medinan", fallback: { xRatio: 0.49, yRatio: 0.34 } },
];

interface FlyingItem {
  index: number;
  colorCard: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  targetTag: string;
}

export const Intro3DCarousel: React.FC<{
  forceShow?: boolean;
  onFinish?: () => void;
}> = ({ forceShow = false, onFinish }) => {
  const [visible, setVisible] = useState(() => {
    if (forceShow) return true;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px), (prefers-reduced-motion: reduce)").matches) return false;
    return !hasSeenIntro();
  });

  const [phase, setPhase] = useState<"rotating" | "flying" | "done">("rotating");
  const [animatingFlight, setAnimatingFlight] = useState(false);
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState<FlyingItem[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ⚡ تسريع دوران الألوان إلى 1.6 ثانية لإعطاء تجربة إقلاع خاطفة وسريعة
  useEffect(() => {
    if (!visible || phase !== "rotating") return;

    const totalMs = 1600; // مدة دوران الألوان السريعة والنشطة
    const intervalMs = 40;
    const step = (intervalMs / totalMs) * 100;

    const pTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(pTimer);
          return 100;
        }
        return Math.min(100, prev + step);
      });
    }, intervalMs);

    // بعد 1.6 ثانية تنطلق الألوان لأماكنها بدقة
    flightTimerRef.current = setTimeout(() => {
      triggerFlight();
    }, totalMs);

    // تمكين تخطي شاشة البداية بالضغط على أي زر في لوحة المفاتيح
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        triggerFlight();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearInterval(pTimer);
      if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, phase]);

  // انطلاق حركة الألوان نحو أماكنها وأزرارها
  const triggerFlight = () => {
    if (phase !== "rotating") return;
    markIntroSeen();

    const newItems: FlyingItem[] = [];

    CARDS_DATA.forEach((card, idx) => {
      const cardEl = cardRefs.current[idx];
      let startX = window.innerWidth / 2;
      let startY = window.innerHeight / 2;

      if (cardEl) {
        const r = cardEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          startX = r.left + r.width / 2;
          startY = r.top + r.height / 2;
        }
      }

      // البحث عن الزر الحقيقي في الشاشة بالوسم المخصص
      let targetX = window.innerWidth * card.fallback.xRatio;
      let targetY = window.innerHeight * card.fallback.yRatio;
      let targetW = 44;
      let targetH = 44;

      const targetEl = document.querySelector(`[data-color-target="${card.targetTag}"]`) as HTMLElement | null;
      if (targetEl) {
        const tr = targetEl.getBoundingClientRect();
        if (tr.width > 0 && tr.height > 0) {
          targetX = tr.left + tr.width / 2;
          targetY = tr.top + tr.height / 2;
          targetW = tr.width;
          targetH = tr.height;
        }
      }

      newItems.push({
        index: card.index,
        colorCard: card.colorCard,
        startX,
        startY,
        targetX,
        targetY,
        targetW,
        targetH,
        targetTag: card.targetTag,
      });
    });

    setItems(newItems);
    setPhase("flying");

    // في الإطار التالي، نبدأ حركة الانتقال بالـ CSS Transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimatingFlight(true);
      });
    });

    // بعد انتهاء الطيران السريع (0.75 ثانية)، نحدث وميض على الأزرار
    setTimeout(() => {
      newItems.forEach((item) => {
        const targetEl = document.querySelector(`[data-color-target="${item.targetTag}"]`) as HTMLElement | null;
        if (targetEl) {
          targetEl.classList.add("color-target-impact");
          setTimeout(() => targetEl.classList.remove("color-target-impact"), 600);
        }
      });

      // اختفاء الشاشة بالكامل
      setTimeout(() => {
        setPhase("done");
        setVisible(false);
        if (onFinish) onFinish();
      }, 200);
    }, 750);
  };

  if (!visible || phase === "done") return null;

  return (
    <>
      <div
        onClick={phase === "rotating" ? triggerFlight : undefined}
        className={`intro-3d-overlay ${phase === "flying" ? "flying-out" : ""}`}
        title="انقر لتسريع الدخول"
      >
        {/* هالات إسلامية متلألئة في الخلفية */}
        <div className="intro-stars-backdrop">
          <div className="intro-glow-orb intro-glow-gold" />
          <div className="intro-glow-orb intro-glow-emerald" />
        </div>

        {/* 📖 نصوص تدل بوضوح وفخامة على تطبيق القرآن الكريم */}
        <div className={`intro-quran-header ${phase === "flying" ? "header-fade-out" : ""}`}>
          <div className="intro-badge-pill">
            <BookOpen className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>تطبيق القرآن الكريم والتلاوات المباركة</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </div>

          <div className="intro-bismillah">
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </div>

          <h1 className="intro-quran-title">
            الْقُرْآنُ الْكَرِيمُ
          </h1>

          <div className="intro-ayah">
            ﴿ وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا ﴾
          </div>
        </div>

        {/* الأسطوانة ثلاثية الأبعاد الدوارة الحاملة للبطاقات الملونة العشر */}
        <div className={`intro-3d-container ${phase === "flying" ? "cylinder-fade-out" : ""}`}>
          <div className="wrapper">
            <div
              className={`inner ${phase === "flying" ? "inner-paused" : ""}`}
              style={{ "--quantity": 10 } as React.CSSProperties}
            >
              {CARDS_DATA.map((card) => (
                <div
                  key={card.index}
                  ref={(el) => (cardRefs.current[card.index] = el)}
                  className="card"
                  style={
                    {
                      "--index": card.index,
                      "--color-card": card.colorCard,
                    } as React.CSSProperties
                  }
                >
                  <div className="img">
                    <div className="card-shine" />
                    <div className="card-core-glow" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* مؤشر شاشة التحميل والشريط الذهبي في الأسفل */}
        <div className={`intro-loading-footer ${phase === "flying" ? "footer-fade-out" : ""}`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-xs sm:text-sm font-semibold text-amber-200/90 tracking-wide">
              جارٍ فتح آيات الذكر الحكيم وتجهيز التطبيق...
            </span>
          </div>

          {/* شريط التحميل */}
          <div className="intro-progress-track">
            <div
              className="intro-progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>

          <button
            type="button"
            onClick={triggerFlight}
            className="mt-3 text-[11px] sm:text-xs text-amber-300/80 hover:text-amber-200 transition-colors underline underline-offset-4 cursor-pointer"
          >
            انقر في أي مكان للدخول المباشر ⚡
          </button>
        </div>
      </div>

      {/* 🚀 طبقة الطيران المباشرة المنفصلة عبر Portal فوق كل العناصر تماماً */}
      {phase === "flying" && typeof document !== "undefined" && createPortal(
        <div className="intro-direct-flight-portal">
          {items.map((item) => {
            const isYellow = item.index === 4;
            const currentX = animatingFlight ? item.targetX : item.startX;
            const currentY = animatingFlight ? item.targetY : item.startY;
            const currentW = animatingFlight ? Math.min(item.targetW || 44, 46) : 74;
            const currentH = animatingFlight ? Math.min(item.targetH || 44, 46) : 108;
            const currentRadius = animatingFlight ? "9999px" : "14px";
            const currentScale = animatingFlight ? (isYellow ? 1.05 : 0.95) : 1;

            return (
              <div
                key={item.index}
                className={`flying-color-card ${isYellow ? "flying-yellow-card" : ""}`}
                style={{
                  left: `${currentX}px`,
                  top: `${currentY}px`,
                  width: `${currentW}px`,
                  height: `${currentH}px`,
                  borderRadius: currentRadius,
                  transform: `translate(-50%, -50%) scale(${currentScale})`,
                  backgroundColor: `rgb(${item.colorCard})`,
                  border: `2.5px solid ${isYellow ? "#ffffff" : "rgba(255, 255, 255, 0.85)"}`,
                  boxShadow: isYellow
                    ? "0 0 35px 12px rgba(250, 204, 21, 0.95), 0 0 70px 20px rgba(245, 158, 11, 0.7)"
                    : `0 0 25px 6px rgba(${item.colorCard}, 0.85), 0 0 45px 12px rgba(${item.colorCard}, 0.5)`,
                }}
              >
                {/* بريق داخلي */}
                <div className="card-shine" style={{ opacity: animatingFlight ? 0.2 : 0.6 }} />
                {isYellow && (
                  <div className="absolute inset-0 rounded-full animate-ping opacity-35 bg-yellow-300" />
                )}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};

export default Intro3DCarousel;
