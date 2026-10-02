import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bell, BellOff, Info, Megaphone, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AppNav from "@/components/AppNav";

interface Announcement {
  id: string;
  title: string;
  body: string;
  type?: string;
  link?: string;
  created_at: string;
}

export default function AnnouncementsPage() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchAnnouncements() {
      try {
        const { data, error } = await supabase
          .from("announcements")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.debug("Announcements fetch:", error);
        }

        if (isMounted && data && Array.isArray(data)) {
          const active = data.filter((a: any) => a.is_active !== false);
          setAnnouncements(active.length > 0 ? active : data);
        }
      } catch (err) {
        console.debug("Failed to fetch announcements", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchAnnouncements();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen page-nour text-foreground" dir="rtl">
      <AppNav />
      <div className="mx-auto max-w-md px-4 py-4 space-y-4">
        <header className="flex items-center justify-between gap-2">
          <button
            onClick={() => navigate(-1)}
            className="flex h-10 items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-4 text-sm font-bold hover:brightness-95 active:scale-95"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <h1 className="font-extrabold text-lg text-gradient-gold">الإعلانات والتنبيهات</h1>
          <span className="w-16" />
        </header>

        {loading ? (
          <div className="card-nour p-8 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">جاري جلب الإعلانات...</p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="card-nour p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
              <BellOff className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="font-bold text-foreground">لا توجد إعلانات حالياً</p>
            <p className="text-xs text-muted-foreground">ستظهر هنا أي تنبيهات أو تحديثات مهمة من المشرف.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <article key={a.id} className="card-nour p-4 space-y-2 border border-border/50">
                <div className="flex items-start gap-3">
                  <span className="p-2 rounded-xl bg-accent/15 text-accent shrink-0">
                    {a.type === "alert" ? <Megaphone className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-bold text-sm text-foreground">{a.title}</h2>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(a.created_at).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1 whitespace-pre-wrap">{a.body}</p>
                    {a.link && (
                      <div className="pt-2">
                        <a
                          href={a.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
                        >
                          عرض التفاصيل ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
