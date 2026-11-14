import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * طبقة موحّدة لكل النوافذ/اللوحات التي تُعرض فوق الشاشة.
 *
 * لماذا Portal؟ بعض النوافذ تُفتح من داخل عناصر مُحوَّلة (transform) مثل
 * `quran-kids-frame`، وعندها يُحصر `position: fixed` داخل الإطار بدل الشاشة،
 * فتخرج البطاقة عن حدود الهاتف وتُقتطع من الأعلى والأسفل. الـ Portal يرسمها
 * مباشرة تحت `document.body` فتصبح دائماً بعرض الشاشة وارتفاعها الحقيقي.
 *
 * ويقوم أيضاً بقفل تمرير الخلفية أثناء فتح النافذة (بدون قفزة عند الإغلاق).
 */
export default function ModalLayer({
  children,
  lockScroll = true,
}: {
  children: ReactNode;
  lockScroll?: boolean;
}) {
  useEffect(() => {
    if (!lockScroll) return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev;
    };
  }, [lockScroll]);

  if (typeof document === "undefined") return null;
  return createPortal(<>{children}</>, document.body);
}
