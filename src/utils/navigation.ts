import { startTransition } from "react";
import { NavigateOptions, To, useNavigate as useRRNavigate } from "react-router-dom";

/**
 * useSafeNavigate
 * يلتف حول useNavigate من react-router-dom باستخدام React.startTransition
 * لمنع تعليق واجهة المستخدم وتفادي خطأ:
 * "A component suspended while responding to synchronous input. This will cause the UI to be replaced with a loading indicator."
 */
export function useSafeNavigate() {
  const navigate = useRRNavigate();

  return (to: To | number, options?: NavigateOptions) => {
    startTransition(() => {
      if (typeof to === "number") {
        navigate(to);
      } else {
        navigate(to, options);
      }
    });
  };
}

/**
 * safeNavigate
 * دالة مساعدة لتغليف أي استدعاء navigate عادي بـ startTransition
 */
export function safeNavigate(navigateFn: (to: any, options?: any) => void, to: To | number, options?: NavigateOptions) {
  startTransition(() => {
    if (typeof to === "number") {
      navigateFn(to);
    } else {
      navigateFn(to, options);
    }
  });
}
