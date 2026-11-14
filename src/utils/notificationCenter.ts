/**
 * مركز الإشعارات الداخلي.
 *
 * المشكلة التي يحلّها: محرّك التذكيرات الخلفي كان يعرض كل تنبيهاته كـ Toast
 * فور الإقلاع (درس الورد + الكهف + أذكار الصباح/المساء + وقت اللعب)، فيرى
 * المستخدم عند أول فتح دفعة إشعارات قديمة معاً. نُبقي عرضاً واحداً على الشاشة
 * ونحفظ الباقي هنا ليقرأه المستخدم من مركز الإشعارات متى شاء.
 */
export interface CenterNotification {
  id: string;
  title: string;
  body: string;
  type: "reminder" | "announcement" | "badge" | "support";
  created_at: string;
  read?: boolean;
}

const CENTER_KEY = "mushaf:notifcenter:v1";
const INSTALL_KEY = "mushaf:install_at:v1";
const MAX_ITEMS = 60;
const DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 ساعات

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* التخزين ممتلئ أو محجوب: نتجاهل بهدوء */
  }
}

/** تاريخ أول تشغيل للتطبيق على هذا الجهاز (يُثبَّت مرة واحدة) */
export function getInstallTimestamp(): number {
  try {
    const raw = localStorage.getItem(INSTALL_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const now = Date.now();
    localStorage.setItem(INSTALL_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

/** هل ما زال المستخدم في أول يوم من استخدام التطبيق؟ */
export function isNewUser(): boolean {
  return Date.now() - getInstallTimestamp() < 24 * 60 * 60 * 1000;
}

export function getCenterNotifications(): CenterNotification[] {
  return safeRead<CenterNotification[]>(CENTER_KEY, []);
}

/** يضيف إشعاراً للمركز مع منع التكرار خلال 6 ساعات وتحديد العدد الأقصى */
export function pushCenterNotification(
  item: Omit<CenterNotification, "id" | "created_at"> & { created_at?: string },
): void {
  const now = Date.now();
  const created_at = item.created_at ?? new Date(now).toISOString();
  const recent = safeRead<CenterNotification[]>(CENTER_KEY, []);

  const duplicate = recent.some(
    (n) => n.title === item.title && now - new Date(n.created_at).getTime() < DEDUPE_WINDOW_MS,
  );
  if (duplicate) return;

  const next: CenterNotification[] = [
    {
      id: `center-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: item.title,
      body: item.body,
      type: item.type,
      created_at,
      read: false,
    },
    ...recent,
  ].slice(0, MAX_ITEMS);

  safeWrite(CENTER_KEY, next);
  window.dispatchEvent(new CustomEvent("mushaf:notifcenter"));
}

export function markCenterNotificationsRead(): void {
  const items = getCenterNotifications();
  if (items.every((n) => n.read)) return;
  safeWrite(
    CENTER_KEY,
    items.map((n) => ({ ...n, read: true })),
  );
  window.dispatchEvent(new CustomEvent("mushaf:notifcenter"));
}

export function getUnreadCenterCount(): number {
  return getCenterNotifications().filter((n) => !n.read).length;
}

/** يحذف ما تجاوز 30 يوماً حتى لا يتضخّم التخزين المحلي */
export function pruneCenterNotifications(maxAgeDays = 30): void {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const kept = getCenterNotifications().filter(
    (n) => new Date(n.created_at).getTime() >= cutoff,
  );
  safeWrite(CENTER_KEY, kept);
}
