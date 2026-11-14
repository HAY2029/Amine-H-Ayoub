/**
 * إعدادات Supabase العامة فقط — بلا استيراد لحزمة @supabase/supabase-js.
 *
 * السبب: كل من يستورد `@/lib/supabase` يجذب معه الحزمة كاملة (~210 كيلوبايت خام)،
 * وكان ذلك يحدث في الشاشة الأولى. أما الوحدات التي تحتاج «هل المفتاح صالح؟»
 * فقط فتقدر تستورد من هنا بلا أي تكلفة في التحميل الأول.
 */
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

/** True when a real Supabase anon key is configured. */
export const hasValidSupabaseKey = (): boolean =>
  !!supabaseUrl && !!supabaseAnonKey && supabaseAnonKey !== "placeholder";
