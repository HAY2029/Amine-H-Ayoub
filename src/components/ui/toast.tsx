import * as React from "react";
import { createPortal } from "react-dom";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

/**
 * طبقة الإشعارات.
 *
 * تُرسم بـ Portal مباشرة تحت `document.body` وبأعلى z-index في التطبيق،
 * حتى لا يحجبها أي نافذة/لوحة مفتوحة، وحتى لا يُقيّدها عنصر أب مُحوَّل
 * (transform) فيخرج الإشعار عن حدود الشاشة.
 *
 * وتُعرض في الزاوية السفلية اليمنى: ظاهرة فوق كل شيء، بعرض الشاشة على
 * الهاتف وبعرض محدود ومُلتصقة باليمين على الحاسوب.
 */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(
    <ToastPrimitives.Viewport
      ref={ref}
      className={cn(
        "pointer-events-none fixed bottom-0 right-0 left-auto z-[2147483000] flex max-h-[100dvh] w-full flex-col items-end gap-2.5 p-3 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:w-auto sm:max-w-sm sm:p-4",
        className,
      )}
      {...props}
    />,
    document.body,
  );
});
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-2xl border p-3.5 pe-9 ps-3.5 text-start shadow-2xl backdrop-blur-xl data-[swipe=end]:animate-out data-[state=closed]:animate-out data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-2 data-[swipe=cancel]:translate-x-0",
  {
    variants: {
      variant: {
        default:
          "border-emerald-500/35 bg-card/95 text-foreground shadow-emerald-950/20",
        destructive:
          "border-rose-500/45 bg-card/95 text-foreground shadow-rose-950/25",
        info:
          "border-amber-500/40 bg-card/95 text-foreground shadow-amber-950/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      dir="rtl"
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

/** أيقونة الإشعار الملوّنة حسب نوعه */
const ToastIcon = ({ variant }: { variant?: ToastProps["variant"] }) => {
  const tone =
    variant === "destructive"
      ? { cls: "bg-rose-500/15 text-rose-500 ring-rose-500/25", Icon: AlertTriangle }
      : variant === "info"
      ? { cls: "bg-amber-500/15 text-amber-500 ring-amber-500/25", Icon: Info }
      : { cls: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/25", Icon: CheckCircle2 };
  const { Icon } = tone;
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
        tone.cls,
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
};

/** شريط العدّاد التنازلي أسفل الإشعار */
const ToastProgress = ({ variant }: { variant?: ToastProps["variant"] }) => (
  <span
    aria-hidden
    className={cn(
      "toast-countdown absolute inset-x-0 bottom-0 h-[3px]",
      variant === "destructive"
        ? "bg-rose-500/70"
        : variant === "info"
        ? "bg-amber-500/70"
        : "bg-emerald-500/70",
    )}
  />
);

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/70 px-3 text-xs font-bold text-foreground transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute end-2 top-2 rounded-lg p-1 text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
      className,
    )}
    toast-close=""
    aria-label="إغلاق الإشعار"
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-[13px] font-extrabold leading-snug tracking-tight", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastIcon,
  ToastProgress,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
