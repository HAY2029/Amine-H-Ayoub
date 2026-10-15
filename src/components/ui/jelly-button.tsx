import * as React from "react";
import { cn } from "@/lib/utils";

export interface JellyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: "purple" | "emerald" | "gold" | "blue" | "red";
}

export const JellyButton = React.forwardRef<HTMLButtonElement, JellyButtonProps>(
  ({ className, color = "purple", children, ...props }, ref) => {
    const colorClass =
      color === "emerald"
        ? "emerald"
        : color === "gold"
        ? "gold"
        : color === "blue"
        ? "blue"
        : color === "red"
        ? "red"
        : "";

    return (
      <button
        ref={ref}
        className={cn("jelly-btn", colorClass, className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
JellyButton.displayName = "JellyButton";

export default JellyButton;
