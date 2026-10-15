import * as React from "react";
import { cn } from "@/lib/utils";
import { WifiLoader } from "@/components/ui/wifi-loader";
import QuranLoading from "@/components/QuranLoading";

export { WifiLoader, QuranLoading };

export interface AppLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  variant?: "theme" | "bw" | "dark" | "wifi";
  label?: string;
  fullScreen?: boolean;
}

export const StepLoader: React.FC<{
  size?: "sm" | "md" | "lg";
  variant?: "theme" | "bw" | "dark";
  className?: string;
}> = ({ size = "md", variant = "theme", className }) => {
  return (
    <div
      className={cn(
        "step-loader",
        size === "sm" && "sm",
        size === "md" && "md",
        size === "lg" && "lg",
        variant === "bw" && "bw",
        variant === "dark" && "dark",
        className
      )}
    />
  );
};

export const AppLoader: React.FC<AppLoaderProps> = ({
  size = "md",
  variant = "wifi",
  label = "جارٍ التحميل...",
  fullScreen = false,
  className,
  ...props
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-4 select-none",
        fullScreen ? "fixed inset-0 z-50 bg-background/90 backdrop-blur-sm" : "py-8 w-full",
        className
      )}
      {...props}
    >
      {variant === "wifi" ? (
        <WifiLoader text={label} />
      ) : (
        <>
          <StepLoader size={size} variant={variant} />
          {label && (
            <p className="text-sm font-bold text-foreground/80 tracking-wide animate-pulse">
              {label}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default AppLoader;

