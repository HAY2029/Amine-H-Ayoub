import * as React from "react";
import { cn } from "@/lib/utils";

export interface GlowButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: "emerald" | "blue" | "purple" | "gold" | "red";
}

export const GlowButton = React.forwardRef<HTMLButtonElement, GlowButtonProps>(
  ({ className, color = "emerald", children, ...props }, ref) => {
    const colorClass =
      color === "blue"
        ? "blue"
        : color === "purple"
        ? "purple"
        : color === "gold"
        ? "gold"
        : color === "red"
        ? "red"
        : "";

    return (
      <button
        ref={ref}
        className={cn("glow-btn", colorClass, className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
GlowButton.displayName = "GlowButton";
