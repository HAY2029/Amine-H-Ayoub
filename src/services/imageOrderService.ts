import { supabase, hasValidSupabaseKey } from "../lib/supabase";

const ORDER_STORAGE_KEY = "mushaf:imageOrder:v1";

export interface ImageOrder {
  order: string[]; // مصفوفة من أسماء الملفات بالترتيب
}

export const syncImageOrderFromServer = async (): Promise<string[]> => {
  if (typeof window === "undefined") return [];
  if (typeof navigator !== "undefined" && !navigator.onLine) return getLocalImageOrder();
  if (!hasValidSupabaseKey()) return getLocalImageOrder();

  try {
    const { data } = await supabase.from("store").select("value").eq("key", ORDER_STORAGE_KEY).maybeSingle();
    if (data && data.value && (data.value as ImageOrder).order) {
      const order = (data.value as ImageOrder).order;
      localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify({ order }));
      return order;
    }
    return getLocalImageOrder();
  } catch (e) {
    console.debug("Supabase sync info:", e);
    return getLocalImageOrder();
  }
};

export const getLocalImageOrder = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ImageOrder;
      return parsed.order || [];
    }
  } catch {
    //
  }
  return [];
};

export const saveImageOrder = async (order: string[]) => {
  if (typeof window === "undefined") return;
  const data: ImageOrder = { order };
  localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(data));
  try {
    await supabase.from("store").upsert({ key: ORDER_STORAGE_KEY, value: data });
  } catch (e) {
    console.error("Supabase save error:", e);
  }
};
