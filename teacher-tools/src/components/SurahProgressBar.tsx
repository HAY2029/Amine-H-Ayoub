interface Props {
  listened: number;
  total: number;
}

const SurahProgressBar = ({ listened, total }: Props) => {
  if (total === 0) return null;
  const pct = Math.round((listened / total) * 100);

  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground font-bold min-w-[3ch] text-left">{pct}%</span>
    </div>
  );
};

export default SurahProgressBar;
