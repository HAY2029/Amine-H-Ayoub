import { Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

const SearchBar = ({ value, onChange, className = "" }: Props) => {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-amber-700/60 dark:text-amber-400/60 pointer-events-none" />
      <input
        type="text"
        placeholder="ابحث عن سورة..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/90 dark:bg-card/90 border border-amber-400/40 rounded-xl pr-9 sm:pr-10 pl-4 py-2 sm:py-2.5 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-amiri text-base sm:text-lg shadow-xs transition-colors"
      />
    </div>
  );
};

export default SearchBar;
