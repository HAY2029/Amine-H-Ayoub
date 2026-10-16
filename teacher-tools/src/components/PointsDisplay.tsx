import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { formatCoins, getCoins } from "@/data/kidsProfile";

interface Props {
  points?: number;
}

const PointsDisplay = ({ points }: Props) => {
  const [coins, setCoins] = useState(() => getCoins());

  useEffect(() => {
    const sync = () => setCoins(getCoins());
    sync();
    window.addEventListener("mushaf:coins", sync);
    window.addEventListener("mushaf:activeprofile", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("mushaf:coins", sync);
      window.removeEventListener("mushaf:activeprofile", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const displayValue = points !== undefined ? points : coins;

  return (
    <div className="bg-card/90 backdrop-blur-sm rounded-full shadow-md px-4 sm:px-5 py-1.5 sm:py-2 border border-border flex items-center gap-2 text-sm md:text-base transition-all">
      <div className="flex items-center gap-1.5">
        <Star className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 fill-amber-500" />
        <span className="font-extrabold text-foreground">{formatCoins(displayValue)}</span>
        <span className="text-muted-foreground font-bold text-xs sm:text-sm">نجمة</span>
      </div>
    </div>
  );
};

export default PointsDisplay;
