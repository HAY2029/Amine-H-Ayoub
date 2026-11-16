import { useToast } from "@/hooks/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastIcon,
  ToastProgress,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

/** مدة قصيرة كي لا يبقى الإشعار ويحجب المحتوى (الأخطاء أطول قليلاً فقط) */
const DURATION_SUCCESS = 2600;
const DURATION_ERROR = 4000;

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider swipeDirection="down">
      {toasts.map(function ({ id, title, description, action, variant, duration, ...props }) {
        const ms = duration ?? (variant === "destructive" ? DURATION_ERROR : DURATION_SUCCESS);
        return (
          <Toast
            key={id}
            variant={variant}
            duration={ms}
            style={{ ["--toast-duration" as string]: `${ms}ms` }}
            {...props}
          >
            <ToastIcon variant={variant} />
            <div className="min-w-0 flex-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
              {action && <div className="pt-2">{action}</div>}
            </div>
            <ToastClose />
            <ToastProgress variant={variant} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
