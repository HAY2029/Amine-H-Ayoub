import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchToggleProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  color?: "emerald" | "blue" | "purple" | "gold" | "red";
  label?: React.ReactNode;
}

export const SwitchToggle = React.forwardRef<HTMLInputElement, SwitchToggleProps>(
  ({ className, color = "emerald", label, id, ...props }, ref) => {
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

    const switchNode = (
      <span className={cn("switch", colorClass, className)}>
        <input ref={ref} id={id} type="checkbox" {...props} />
        <span className="slider"></span>
      </span>
    );

    if (label) {
      return (
        <label className="inline-flex items-center gap-3 cursor-pointer select-none text-sm font-bold text-foreground/80">
          {switchNode}
          <span>{label}</span>
        </label>
      );
    }

    return switchNode;
  }
);
SwitchToggle.displayName = "SwitchToggle";
