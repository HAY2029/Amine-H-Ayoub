import { SurahItem } from "@/hooks/useSurahData";
import { useEffect, useRef, useState } from "react";

interface Props {
  surahs: SurahItem[];
  currentPlaying: number | null;
  onSelect: (surah: SurahItem) => void;
  className?: string;
}

const SurahList = ({
  surahs,
  currentPlaying,
  onSelect,
  className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5",
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());

  // Intersection Observer for staggered entrance
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.idx);
            if (!isNaN(idx)) {
              setVisibleItems((prev) => new Set(prev).add(idx));
            }
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "50px" }
    );

    const items = container.querySelectorAll("[data-idx]");
    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, [surahs]);

  return (
    <div className={className} ref={containerRef}>
      {surahs.map((surah, index) => {
        const isActive = currentPlaying === surah.number;
        const isVisible = visibleItems.has(index);

        return (
          <button
            key={surah.number}
            data-idx={index}
            onClick={() => onSelect(surah)}
            className={`surah-card group relative flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300 text-right focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              isActive
                ? "bg-amber-100/90 dark:bg-amber-950/60 border-amber-500 shadow-lg ring-2 ring-amber-400/50 scale-[1.01]"
                : "bg-white/80 dark:bg-card/85 backdrop-blur-xs border-amber-400/30 hover:border-amber-500 hover:shadow-lg hover:bg-white dark:hover:bg-card hover:scale-[1.02]"
            }`}
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible
                ? isActive
                  ? "scale(1.01)"
                  : "translateY(0) scale(1)"
                : "translateY(20px) scale(0.97)",
              transition: `opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${Math.min(index * 0.04, 0.4)}s, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${Math.min(index * 0.04, 0.4)}s, box-shadow 0.3s ease, border-color 0.3s ease, background-color 0.3s ease`,
            }}
          >
            {/* Active glow effect */}
            {isActive && (
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400/10 to-amber-600/10 animate-breathe pointer-events-none" />
            )}

            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold shrink-0 shadow-sm transition-all duration-300 ${
                isActive
                  ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-amber-500/40 shadow-md scale-110"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300 group-hover:bg-amber-500/25 group-hover:scale-105 group-hover:shadow-md"
              }`}
            >
              {surah.revelationType === "custom" ? "🎤" : surah.number}
            </div>

            {/* Surah name */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-bold font-amiri text-stone-900 dark:text-stone-100 leading-snug truncate">
                {surah.revelationType === "custom" ? surah.name : `سورة ${surah.name}`}
              </h3>
              {surah.ayahCount ? (
                <p className="text-[11px] text-stone-600 dark:text-stone-300 mt-0.5 font-sans flex items-center gap-1.5">
                  <span>{surah.ayahCount} آيات</span>
                  {surah.type && (
                    <>
                      <span className="opacity-40">•</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          surah.type === "مكية"
                            ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30"
                            : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                        }`}
                      >
                        {surah.type}
                      </span>
                    </>
                  )}
                </p>
              ) : null}
            </div>

            {/* Wave animation for active */}
            {isActive && (
              <div className="flex items-center gap-[3px] h-6 shrink-0">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="w-[3px] bg-amber-600 dark:bg-amber-400 rounded-full animate-wave"
                    style={{
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Hover play icon */}
            {!isActive && (
              <div className="shrink-0 w-8 h-8 rounded-full bg-amber-500/0 group-hover:bg-amber-500/15 flex items-center justify-center transition-all duration-300 opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0">
                <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 mr-[-2px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default SurahList;
