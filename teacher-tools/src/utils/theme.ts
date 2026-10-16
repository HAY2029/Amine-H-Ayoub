/**
 * أدوات المظهر (الثيم) — تدعم الوضع النهاري والليلي في كامل التطبيق
 */

export const THEME_KEY = "mushaf:theme";

export const getTheme = (): "dark" | "light" => {
  try {
    return (localStorage.getItem(THEME_KEY) as "dark" | "light") || "light";
  } catch {
    return "light";
  }
};

export const applyTheme = (t: "dark" | "light") => {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.setAttribute("data-theme", t);
  if (t === "light") {
    el.classList.remove("dark");
  } else {
    el.classList.add("dark");
  }
};

export const setTheme = (t: "dark" | "light") => {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* ignore */
  }
  applyTheme(t);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mushaf:theme", { detail: t }));
  }
};

export const toggleTheme = (): "dark" | "light" => {
  const current = getTheme();
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
};
