import * as React from "react";
import { cn } from "@/lib/utils";

export interface WifiLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Text shown below loader with sweeping animated wipe */
  text?: string;
  /** Force original vivid blue/violet colors (default: true) */
  originalColors?: boolean;
  /** Custom color overrides */
  frontColor?: string;
  backColor?: string;
  bgColor?: string;
  textColor?: string;
  /** Size multiplier scale (e.g. 1, 1.2, 0.85) */
  scale?: number;
}

/**
 * محمل الواي فاي الدائري الملون ثلاثي الحلقات (Wifi Orbital Radar Loader)
 * حلقات نابضة ملونة مع مسح ضوئي للنص (text-animation wipe)
 */
export const WifiLoader: React.FC<WifiLoaderProps> = ({
  text = "جارٍ التحميل...",
  originalColors = true,
  frontColor,
  backColor,
  bgColor,
  textColor,
  scale = 1,
  className,
  style,
  id = "wifi-loader",
  ...props
}) => {
  const customStyles: React.CSSProperties = {
    ...style,
    ...(frontColor && { "--front-color": frontColor }),
    ...(backColor && { "--back-color": backColor }),
    ...(bgColor && { "--background": bgColor }),
    ...(textColor && { "--text-color": textColor }),
    ...(scale !== 1 && { transform: `scale(${scale})`, transformOrigin: "center" }),
  } as React.CSSProperties;

  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className={cn(
        "wifi-loader select-none",
        originalColors && "original",
        className
      )}
      style={customStyles}
      {...props}
    >
      <svg className="circle-outer" viewBox="0 0 86 86">
        <circle className="back" cx={43} cy={43} r={40} />
        <circle className="front" cx={43} cy={43} r={40} />
        <circle className="new" cx={43} cy={43} r={40} />
      </svg>
      <svg className="circle-middle" viewBox="0 0 60 60">
        <circle className="back" cx={30} cy={30} r={27} />
        <circle className="front" cx={30} cy={30} r={27} />
      </svg>
      <svg className="circle-inner" viewBox="0 0 34 34">
        <circle className="back" cx={17} cy={17} r={14} />
        <circle className="front" cx={17} cy={17} r={14} />
      </svg>
      {text && <div className="text" data-text={text} />}
    </div>
  );
};

export default WifiLoader;
