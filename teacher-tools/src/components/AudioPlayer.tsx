import { Play, Pause, Square } from "lucide-react";

interface Props {
  isPlaying: boolean;
  progress: number;
  currentRepetition: number;
  totalRepetitions: number;
  canPlay: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  fullSurahMode?: boolean;
  currentAyah?: number | null;
  totalAyahs?: number;
}

const AudioPlayer = ({
  isPlaying,
  progress,
  currentRepetition,
  totalRepetitions,
  canPlay,
  onPlayPause,
  onStop,
  fullSurahMode,
  currentAyah,
  totalAyahs,
}: Props) => {
  return (
    <div className="bg-card rounded-lg shadow-md p-6 border border-border space-y-5">
      {/* Progress bar */}
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status text */}
      {fullSurahMode && currentAyah && totalAyahs ? (
        <p className="text-center text-muted-foreground text-lg">
          الآية {currentAyah} من {totalAyahs}
        </p>
      ) : currentRepetition > 0 ? (
        <p className="text-center text-muted-foreground text-lg">
          التكرار {currentRepetition} من {totalRepetitions}
        </p>
      ) : null}

      {/* Controls */}
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={onStop}
          disabled={!isPlaying}
          className="w-14 h-14 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
        >
          <Square className="w-6 h-6" />
        </button>

        {!fullSurahMode && (
          <button
            onClick={onPlayPause}
            disabled={!canPlay}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
              isPlaying
                ? "bg-accent text-accent-foreground"
                : "bg-primary text-primary-foreground"
            } ${canPlay && !isPlaying ? "animate-pulse-glow" : ""}`}
          >
            {isPlaying ? (
              <Pause className="w-10 h-10" />
            ) : (
              <Play className="w-10 h-10 mr-[-4px]" />
            )}
          </button>
        )}

        {!fullSurahMode && <div className="w-14 h-14" />}
      </div>
    </div>
  );
};

export default AudioPlayer;
