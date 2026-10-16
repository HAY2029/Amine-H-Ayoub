import { surahs } from "@/data/surahs";
import { BookOpen, CheckCircle } from "lucide-react";
import SurahProgressBar from "@/components/SurahProgressBar";

interface Props {
  selectedSurah: number | null;
  selectedAyah: number | null;
  ayahCount: number;
  onSurahChange: (v: number | null) => void;
  onAyahChange: (v: number | null) => void;
  fullSurahMode: boolean;
  onPlayFullSurah: () => void;
  canPlayFull: boolean;
  getListenedCount: (surahNumber: number) => number;
  isSurahComplete: (surahNumber: number, totalAyahs: number) => boolean;
}

const SurahSelector = ({
  selectedSurah,
  selectedAyah,
  ayahCount,
  onSurahChange,
  onAyahChange,
  fullSurahMode,
  onPlayFullSurah,
  canPlayFull,
  getListenedCount,
  isSurahComplete,
}: Props) => {
  return (
    <div className="bg-card rounded-lg shadow-md p-6 space-y-4 border border-border">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Surah selector */}
        <div className="space-y-2">
          <label className="block text-lg font-bold text-foreground">
            اختر السورة
          </label>
          <select
            value={selectedSurah ?? ""}
            onChange={(e) =>
              onSurahChange(e.target.value ? Number(e.target.value) : null)
            }
            disabled={fullSurahMode}
            className="w-full p-4 text-lg rounded-lg border-2 border-input bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-ring/30 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">-- اختر السورة --</option>
            {surahs.map((s) => (
              <option key={s.number} value={s.number}>
                {isSurahComplete(s.number, s.ayahCount) ? "✅ " : ""}
                {s.number}. {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Ayah selector */}
        {!fullSurahMode && (
          <div className="space-y-2">
            <label className="block text-lg font-bold text-foreground">
              اختر الآية
            </label>
            <select
              value={selectedAyah ?? ""}
              onChange={(e) =>
                onAyahChange(e.target.value ? Number(e.target.value) : null)
              }
              disabled={!selectedSurah}
              className="w-full p-4 text-lg rounded-lg border-2 border-input bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-ring/30 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">-- اختر الآية --</option>
              {Array.from({ length: ayahCount }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  الآية {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Surah progress bar */}
      {selectedSurah && (
        <div className="flex items-center gap-2">
          {isSurahComplete(selectedSurah, ayahCount) && (
            <CheckCircle className="w-5 h-5 text-accent shrink-0" />
          )}
          <div className="flex-1">
            <SurahProgressBar listened={getListenedCount(selectedSurah)} total={ayahCount} />
          </div>
        </div>
      )}

      {/* Full Surah button */}
      {selectedSurah && !fullSurahMode && (
        <button
          onClick={onPlayFullSurah}
          disabled={!canPlayFull}
          className="w-full p-4 text-lg font-bold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          <BookOpen className="w-6 h-6" />
          استماع للسورة كاملة
        </button>
      )}

      {fullSurahMode && (
        <div className="text-center text-accent font-bold text-lg">
          ▶ جارٍ تشغيل السورة كاملة...
        </div>
      )}
    </div>
  );
};

export default SurahSelector;
