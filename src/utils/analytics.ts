import { supabase } from "@/lib/supabase";
import { captureEvent } from "@/utils/posthog";

export async function logAppOpen() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const lastOpenDay = localStorage.getItem("mushaf:lastOpenDay");
    
    // We only want to log 'app_opens' once per session, but to avoid spamming the DB, 
    // we can log it once per day per user for 'active_users' metric.
    if (lastOpenDay === today) {
      return; // Already logged today
    }
    
    localStorage.setItem("mushaf:lastOpenDay", today);
    
    const isNewUser = !localStorage.getItem("mushaf:isNotNewUser");
    if (isNewUser) {
      localStorage.setItem("mushaf:isNotNewUser", "true");
    }

    // أول حدث في مسار الاستخدام: فتح التطبيق (مع تحليلات Supabase الحالية)
    captureEvent("app_open", { is_new_user: isNewUser });

    const { data: row, error } = await supabase
      .from("app_analytics")
      .select("*")
      .eq("day", today)
      .maybeSingle();

    if (error) {
      // Table doesn't exist or offline - skip silently
      return;
    }

    if (row) {
      await supabase
        .from("app_analytics")
        .update({ 
          app_opens: (row.app_opens || 0) + 1, 
          active_users: (row.active_users || 0) + 1,
          new_users: (row.new_users || 0) + (isNewUser ? 1 : 0),
          downloads: (row.downloads || 0) + (isNewUser ? 1 : 0)
        })
        .eq("day", today);
    } else {
      await supabase.from("app_analytics").insert({
        day: today,
        app_opens: 1,
        active_users: 1,
        downloads: isNewUser ? 1 : 0,
        new_users: isNewUser ? 1 : 0,
      });
    }
  } catch (error) {
    // Silent fail for non-critical analytics
  }
}
