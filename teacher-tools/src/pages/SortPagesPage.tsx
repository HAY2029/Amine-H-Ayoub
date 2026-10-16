import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Crosshair,
  GripVertical,
  ImageOff,
  ListOrdered,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  UploadCloud,
  WifiOff,
} from "lucide-react";
import {
  CustomPage,
  getCustomPages,
  savePageOrder,
  clearPageOrder,
  normalizeImageKey,
  sanitizePageOrder,
  auditPageOrder,
  pageNumForKey,
} from "../data/customPages";
import { supabase, hasValidSupabaseKey } from "../lib/supabase";
import { getSavedSurahRegions } from "../data/surahRegions";
import { AYAH_COORDINATES, getSavedAyahCoordinates } from "../data/ayahCoordinates";
import { getSurahName } from "../data/quranData";
import { toast } from "../hooks/use-toast";

/** صورة مصغّرة للصفحة — مع بديل عند فشل التحميل */
function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-10 h-14 rounded-md border border-border bg-muted flex items-center justify-center shrink-0">
        <ImageOff className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-10 h-14 rounded-md border border-border object-cover shrink-0"
    />
  );
}

interface PageMeta {
  label: string;
  surahs: string[];
  firstSurah: number;
  pageNum: number;
}

const normKey = (src: string) => normalizeImageKey(src) || src;

// مفاتيح التخزين على السيرفر (جدول store في Supabase)
const ORDER_KEY = "mushaf:pageOrder:v1";
const META_KEY = "mushaf:customPages:v1";
const IMG_PREFIX = "mushaf:pageImg:";
const PAGE_NAMES_KEY = "mushaf:pageNames:v1";
const BACKUP_KEY = "mushaf:pageOrderBackup:v1";
const IMG_EXT_RE = /\.(jpe?g|png|webp|gif|bmp)$/i;

/** رقم الصفحة من المسار — الفاتحة = 1 (أولاً)، ثم الرقم الحقيقي؛ بلا رقم → النهاية.
 *  مأخوذ من customPages.pageNumForKey حتى يكون المنطق واحداً في كل الصفحات:
 *  الفاتحة = 1، "0" خاطئة = 0 (تُستبعد)، بلا رقم = النهاية. */
const pageNumOf = (src: string) => pageNumForKey(src);

/** هل هذا المصدر خاطئ (صفحة "0")؟ — منطق موحّد مع القارئ و customPages */
const isBogusSrc = (src: string): boolean => {
  const noExt = String(src || "").replace(IMG_EXT_RE, "");
  const digits = noExt.replace(/\D/g, "");
  if (digits === "") return false;
  return parseInt(digits, 10) === 0;
};

/** حالة الاتصال بالسيرفر */
type ServerStatus = "idle" | "connecting" | "online" | "offline";

/**
 * جلب صور السيرفر فقط (بلا أي ملفات محلية/IndexedDB):
 * 1) صفوف جدول store بالمفتاح mushaf:pageImg:<src> → base64 مباشرة
 * 2) ملفات bucket mushaf-images (الجذر + المجلدات الفرعية) → رابط عام
 * نُرجع كل صورة على أكثر من طريقة مميّزة بـ src + url (URL علني أو data: base64).
 */
async function fetchServerImages(): Promise<{ src: string; url: string }[]> {
  const out: { src: string; url: string }[] = [];
  if (!hasValidSupabaseKey()) return out;
  // 1) من جدول store (base64)
  try {
    const { data } = await supabase.from("store").select("key, value").like("key", `${IMG_PREFIX}%`);
    (data || []).forEach((r: { key: string; value: unknown }) => {
      const id = String(r.key).replace(IMG_PREFIX, "");
      const key = normalizeImageKey(id);
      if (key) {
        const v = r.value as { d?: string } | null;
        const d = v && typeof v === "object" && typeof v.d === "string" ? v.d : null;
        out.push({ src: key, url: d || "data:image/png;base64," });
      }
    });
  } catch (e) {
    console.debug("[sort] store image keys failed:", e);
  }
  // 2) من bucket mushaf-images (روابط عامة — أسرع ويصلها CDN)
  try {
    const { data: root } = await supabase.storage.from("mushaf-images").list();
    const dirs: string[] = [];
    (root || []).forEach((f) => {
      if (f.metadata && f.metadata.size) {
        if (IMG_EXT_RE.test(f.name)) {
          const k = normalizeImageKey(f.name);
          if (k && !out.some(o => o.src === k)) {
            const { data: { publicUrl } } = supabase.storage.from("mushaf-images").getPublicUrl(f.name);
            out.push({ src: k, url: publicUrl });
          }
        }
      } else dirs.push(f.name);
    });
    for (const d of dirs) {
      try {
        const { data: files } = await supabase.storage.from("mushaf-images").list(d);
        (files || []).forEach((f) => {
          if (IMG_EXT_RE.test(f.name)) {
            const k = normalizeImageKey(`${d}/${f.name}`);
            if (k && !out.some(o => o.src === k)) {
              const { data: { publicUrl } } = supabase.storage.from("mushaf-images").getPublicUrl(`${d}/${f.name}`);
              out.push({ src: k, url: publicUrl });
            }
          }
        });
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    console.debug("[sort] bucket list failed:", e);
  }
  return out;
}

/** جلب قائمة الصفحات المخصصة (الأسماء) من السيرفر مباشرة */
async function fetchServerCustomPages(): Promise<CustomPage[]> {
  if (!hasValidSupabaseKey()) return [];
  try {
    const { data } = await supabase.from("store").select("value").eq("key", META_KEY).maybeSingle();
    if (data?.value && Array.isArray(data.value)) return data.value as CustomPage[];
  } catch (e) {
    console.debug("[sort] server meta failed:", e);
  }
  return [];
}

/** جلب ترتيب الصفحات المحفوظ على السيرفر مباشرة (src[]) */
async function fetchServerOrderSrcs(): Promise<string[]> {
  if (!hasValidSupabaseKey()) return [];
  try {
    const { data, error } = await supabase
      .from("store")
      .select("value")
      .eq("key", ORDER_KEY)
      .maybeSingle();
    if (!error && data?.value && Array.isArray(data.value)) {
      return (data.value as unknown[]).filter((v): v is string => typeof v === "string");
    }
  } catch (e) {
    console.debug("[sort] server order fetch failed:", e);
  }
  return [];
}

/** التحقق أن الترتيب وصل للسيرفر فعلاً (مع إعادة محاولات) */
async function verifyOrderOnServer(order: string[], retries = 3): Promise<boolean> {
  if (!hasValidSupabaseKey()) return false;
  for (let i = 0; i < retries; i++) {
    try {
      const { data, error } = await supabase.from("store").select("value").eq("key", ORDER_KEY).maybeSingle();
      if (!error && data?.value && Array.isArray(data.value) && JSON.stringify(data.value) === JSON.stringify(order)) {
        return true;
      }
    } catch (e) {
      console.debug("[sort] verify failed:", e);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

export default function SortPagesPage() {
  const [serverImgSrcs, setServerImgSrcs] = useState<Set<string>>(new Set());
  const [imgUrlMap, setImgUrlMap] = useState<Record<string, string>>({});
  const [metaList, setMetaList] = useState<CustomPage[]>([]);
  const [rows, setRows] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("idle");
  const dragSrc = useRef<number | null>(null);

  // ─────────── تحميل صور السيرفر فقط (بلا أي ملفات محلية/IndexedDB) ───────────
  const reload = useCallback(async () => {
    if (!hasValidSupabaseKey()) {
      setServerStatus("offline");
      toast({
        title: "⚠️ السيرفر غير متصل",
        description: "أضف VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY في ملف .env ثم أعد المحاولة",
        variant: "destructive",
      });
      return;
    }
    setServerStatus("connecting");
    setLoading(true);
    try {
      // 1) صور السيرفر فقط — لا نلمس IndexedDB أو localStorage للصور
      const serverImgs = await fetchServerImages();
      const srcSet = new Set<string>();
      const urlMap: Record<string, string> = {};
      serverImgs.forEach(({ src, url }) => {
        srcSet.add(src);
        urlMap[src] = url;
      });
      setServerImgSrcs(srcSet);
      setImgUrlMap(urlMap);

      // 2) أسماء الصفحات المخصصة من السيرفر مباشرة (مع بديل محلي إن لم يُعثر)
      const serverMeta = await fetchServerCustomPages();
      setMetaList(serverMeta.length ? serverMeta : getCustomPages());

      // 3) الترتيب المحفوظ: جلبه من السيرفر أولاً، ثم خليط باقي صور السيرفر بالأرقام
      const saved = await fetchServerOrderSrcs();
      // تنظيف موحّد: احذف الخاطئ (0.jpg) والمكرّر + الفاتحة أولاً — سبب ظهور صفحة "0" أو مكرّرات
      const savedClean = sanitizePageOrder(saved.map(normKey));
      const savedNorm = savedClean.filter(s => srcSet.has(s));
      const seen = new Set(savedNorm);
      const rest = Array.from(srcSet)
        .filter(s => !seen.has(s) && !isBogusSrc(s))
        .sort((a, b) => pageNumOf(a) - pageNumOf(b));

      // ترتيب نهائي موحّد (بلا مكرّرات، بلا "0"، الفاتحة أولاً) — نفس ما سيُحفظ ويُرسل للسيرفر
      const finalRows = sanitizePageOrder([...savedNorm, ...rest]);
      const audit = auditPageOrder([...savedNorm, ...rest]);
      // احفظ النسخة المحلية كاحتياطي سريع (يستخدمه القارئ فورًا قبل المزامنة)
      try { localStorage.setItem("mushaf:pageOrder:v1", JSON.stringify(finalRows)); } catch { /* ignore */ }

      setRows(finalRows);
      setServerStatus("online");

      // إبلاغ المستخدم بما نُظّف فعلاً (مكرّر/خاطئ) — شفافية بدل حذف صامت
      if (audit.duplicates.length || audit.bogus.length) {
        const parts: string[] = [];
        if (audit.duplicates.length) parts.push(`${audit.duplicates.length} صفحة مكرّرة`);
        if (audit.bogus.length) parts.push(`${audit.bogus.length} صفحة خاطئة (رقم 0)`);
        toast({
          title: `🧹 نُظّف الترتيب: ${parts.join(" و ")}`,
          description: `العدد النهائي ${finalRows.length} صفحة — الفاتحة أولاً. اضغط «حفظ الترتيب» لتثبيت الإصلاح على السيرفر.`,
        });
      }
    } catch (e) {
      console.error("[sort] reload failed:", e);
      setServerStatus("offline");
      toast({ title: "❌ فشل تحميل صور السيرفر", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
    }, []);
    useEffect(() => { reload(); }, [reload]);

  // ─────────── بيانات كل صفحة (الاسم + سورها + رقمها) ───────────
  const infoMap = useMemo(() => {
    const regionsAll = getSavedSurahRegions();
    const boxesAll = getSavedAyahCoordinates();
    const altKey = (k: string) => k.replace(/^\//, "");
    const pageNames: Record<string, string> = (() => {
      try { return JSON.parse(localStorage.getItem(PAGE_NAMES_KEY) || "{}"); } catch { return {}; }
    })();
    const map: Record<string, PageMeta> = {};
    rows.forEach(src => {
      // الاسم: اسم مخصّص من القارئ ← اسم الصفحة المرفوعة (من السيرفر) ← الرقم من المسار
      let label = pageNames[src] || "";
      if (!label) {
        const cp = metaList.find(p => normKey(p.src) === src);
        if (cp?.name) label = cp.name;
      }
      if (!label) label = src.replace("/pages/", "").replace(/\.[a-z0-9]+$/i, "") || src;

      // السور: مناطق السور من المعايرة (مرتبة من أعلى الصفحة لأسفلها) ← وإلا من مربعات الآيات
      const surahs: string[] = [];
      const seen = new Set<string>();
      let firstSurah = Number.MAX_SAFE_INTEGER;
      (regionsAll[src] || regionsAll[altKey(src)] || [])
        .slice()
        .sort((a, b) => a.y - b.y)
        .forEach(r => {
          const key = r.surah ? `s${r.surah}` : `n${r.name || r.y}`;
          if (seen.has(key)) return;
          seen.add(key);
          if (r.surah && firstSurah === Number.MAX_SAFE_INTEGER) firstSurah = r.surah;
          const name = r.name || (r.surah ? getSurahName(r.surah) : "");
          if (name) surahs.push(name);
        });
      if (surahs.length === 0) {
        const boxes = boxesAll[src] || boxesAll[altKey(src)] || AYAH_COORDINATES[src] || AYAH_COORDINATES[altKey(src)] || [];
        Array.from(new Set(boxes.map(b => b.surah))).sort((a, b) => a - b).forEach(n => {
          if (firstSurah === Number.MAX_SAFE_INTEGER) firstSurah = n;
          surahs.push(getSurahName(n));
        });
      }

      const nameDigits = label.match(/(\d+)/);
      map[src] = {
        label,
        surahs,
        firstSurah,
        pageNum: nameDigits ? parseInt(nameDigits[1], 10) : pageNumOf(src),
      };
    });
    return map;
  }, [rows, metaList]);

    const thumbOf = (src: string): string | null => imgUrlMap[src] || null;

  const withSurahCount = useMemo(
    () => rows.reduce((acc, r) => acc + ((infoMap[r]?.surahs.length || 0) > 0 ? 1 : 0), 0),
    [rows, infoMap]
  );

  // ─────────── إعادة الترتيب (سحب/إفلات + أسهم) ───────────
  const move = (from: number, to: number) => {
    setRows(prev => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const moveBy = (pos: number, dir: -1 | 1) => move(pos, pos + dir);

  const filterActive = filter.trim().length > 0;

  /** ترتيب تلقائي حسب رقم الصفحة (من الاسم أو المسار) */
  const autoSortByPageNum = () => {
    if (filterActive) return;
    setRows(prev => [...prev].sort((a, b) =>
      (infoMap[a]?.pageNum ?? Number.MAX_SAFE_INTEGER) - (infoMap[b]?.pageNum ?? Number.MAX_SAFE_INTEGER) ||
      a.localeCompare(b)
    ));
  };

  /** ترتيب تلقائي حسب ترتيب السور في المصحف (أول سورة في كل صفحة) */
  const autoSortBySurah = () => {
    if (filterActive) return;
    setRows(prev => [...prev].sort((a, b) =>
      (infoMap[a]?.firstSurah ?? Number.MAX_SAFE_INTEGER) - (infoMap[b]?.firstSurah ?? Number.MAX_SAFE_INTEGER) ||
      (infoMap[a]?.pageNum ?? Number.MAX_SAFE_INTEGER) - (infoMap[b]?.pageNum ?? Number.MAX_SAFE_INTEGER) ||
      a.localeCompare(b)
    ));
  };

  // ─────────── حفظ الترتيب مع تحقق فعلي من وصوله للسيرفر ───────────
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // تنظيف نهائي قبل الحفظ: بلا "0" وبلا مكرّرات والفاتحة أولاً
      const cleanRows = sanitizePageOrder(rows);
      setRows(cleanRows);

      // نسخة احتياطية محلية قبل الحفظ (يستخدمها سكربت tools/check-page-order.cjs للاستعادة)
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(cleanRows)); } catch { /* ignore */ }

      // حفظ محلي + رفع للسيرفر (نفس مفتاح القارئ)
      savePageOrder(cleanRows);

      if (!hasValidSupabaseKey()) {
        toast({
          title: "⚠️ حُفظ محلياً فقط — لا يوجد اتصال بالسيرفر",
          description: "أضف مفاتيح Supabase في ملف .env ثم أعد المحاولة",
          variant: "destructive",
        });
        return;
      }

      // التحقق الفعلي أن الترتيب وصل للسيرفر (مع إعادة محاولات) — نتحقق من النسخة النظيفة
      const ok = await verifyOrderOnServer(cleanRows);
      if (ok) {
        toast({ title: "✅ تم حفظ الترتيب على السيرفر (تم التحقق)", description: "افتح المصحف لرؤية الترتيب الجديد" });
      } else {
        toast({
          title: "⚠️ تعذّر التحقق من السيرفر",
          description: "حُفظ محلياً — أعد المحاولة أو استخدم سكربت الاستعادة",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.error("فشل حفظ الترتيب:", e);
      toast({ title: "❌ فشل حفظ الترتيب", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      clearPageOrder(); // يمسح الترتيب محلياً + على السيرفر
            // إعادة بناء القائمة الافتراضية من صور السيرفر: تنظيف موحّد + الفاتحة أولاً
      const rest = sanitizePageOrder(Array.from(serverImgSrcs));
      setRows(rest);
      toast({ title: "↩️ أُعيد الترتيب الأصلي" });
    } finally {
      setIsSaving(false);
    }
  };

  // ─────────── الصفحات الظاهرة (بعد البحث) ───────────
  const visible = useMemo(() => {
    const indexed = rows.map((src, i) => ({ src, i }));
    const q = filter.trim();
    if (!q) return indexed;
    return indexed.filter(({ src }) => {
      const meta = infoMap[src];
      return `${meta?.label || ""} ${(meta?.surahs || []).join(" ")} ${src}`.includes(q);
    });
  }, [rows, filter, infoMap]);

  return (
    <div className="min-h-screen page-nour text-foreground" dir="rtl">
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
                <header className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold text-gradient-gold flex items-center gap-2">
            <ListOrdered className="w-5 h-5" />
            ترتيب صفحات المصحف
          </h1>
          <div className="flex items-center gap-2">
            {serverStatus === "online" && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> متصل بالسيرفر
              </span>
            )}
            {serverStatus === "offline" && !hasValidSupabaseKey() && (
              <span className="inline-flex items-center gap-1 text-xs text-red-500">
                <WifiOff className="w-3 h-3" /> غير متصل
              </span>
            )}
            {serverStatus === "connecting" && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                <Loader2 className="w-3 h-3 animate-spin" /> جاري الاتصال...
              </span>
            )}
          </div>
          <Link to="/teacher-tools" className="text-sm text-muted-foreground hover:text-foreground">
            رجوع
          </Link>
        </header>

        <p className="text-sm text-muted-foreground leading-relaxed">
          يعرض هذا الجدول <strong>فقط صور السيرفر</strong> (Supabase store + bucket mushaf-images).
          اسحب الصفحة أو استخدم الأسهم ↑↓ لإعادة ترتيبها. اضغط "حفظ الترتيب" ليُطبَّق في القارئ —
          ويتحقّق من وصوله للسيرفر.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> جارٍ تحميل صور السيرفر...
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
          <span>📄 {rows.length} صفحة</span>
          <span>📗 {withSurahCount} معرّفة بسور</span>
          {!loading && hasValidSupabaseKey() && (
            <button
              onClick={reload}
              disabled={serverStatus === "connecting" || loading}
              title="إعادة تحميل صور السيرفر"
              className="p-1 rounded-md bg-muted text-foreground disabled:opacity-40 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${serverStatus === "connecting" || loading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        {/* أدوات: بحث + ترتيب تلقائي */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="ابحث باسم الصفحة أو اسم السورة…"
              className="w-full pr-9 p-2.5 rounded-xl bg-card border border-border text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-64">
            <button
              onClick={autoSortByPageNum}
              disabled={filterActive}
              title="ترتيب تلقائي حسب رقم الصفحة"
              className="p-2 rounded-xl bg-card border border-border text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40 active:scale-95"
            >
              <ArrowUp className="w-3.5 h-3.5" /> حسب الرقم
            </button>
            <button
              onClick={autoSortBySurah}
              disabled={filterActive}
              title="ترتيب تلقائي حسب ترتيب السور في المصحف"
              className="p-2 rounded-xl bg-card border border-border text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40 active:scale-95"
            >
              <ArrowDown className="w-3.5 h-3.5" /> حسب السور
            </button>
          </div>
        </div>

        {filterActive && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            🔍 أثناء البحث يكون السحب والأسهم معطّلين — امسح البحث لإعادة الترتيب.
          </p>
        )}

        {/* القائمة */}
        <div className="space-y-2">
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">لا نتائج مطابقة للبحث</p>
          )}
          {visible.map(({ src, i }) => {
            const meta = infoMap[src];
            return (
              <div
                key={src}
                draggable={!filterActive}
                onDragStart={() => { dragSrc.current = i; }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragSrc.current !== null) move(dragSrc.current, i);
                  dragSrc.current = null;
                }}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-card border border-border hover:border-accent transition-all cursor-move"
              >
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <Thumb src={thumbOf(src)} alt={meta?.label || src} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{meta?.label || src}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {meta?.surahs.length ? meta.surahs.join(" · ") : "بدون سور معرّفة"}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveBy(i, -1)}
                    disabled={filterActive || i === 0}
                    className="p-1 rounded-md bg-muted text-foreground disabled:opacity-30 active:scale-95"
                    aria-label="تحريك لأعلى"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveBy(i, 1)}
                    disabled={filterActive || i === rows.length - 1}
                    className="p-1 rounded-md bg-muted text-foreground disabled:opacity-30 active:scale-95"
                    aria-label="تحريك لأسفل"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* حفظ / إعادة الأصل */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="p-3 rounded-xl bg-secondary text-secondary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
          >
            <RotateCcw className="w-4 h-4" /> إعادة الأصل
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="p-3 rounded-xl btn-gold font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
          >
            <Save className="w-5 h-5" />
            {isSaving ? "يتم الحفظ..." : "حفظ الترتيب"}
          </button>
        </div>

        {/* روابط سريعة */}
        <nav className="flex flex-wrap justify-center gap-3 text-sm pt-2">
          <Link to="/mushaf" className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2 hover:bg-accent">
            <BookOpen className="h-4 w-4 text-emerald-600" /> فتح المصحف
          </Link>
          <Link to="/mushaf-upload" className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2 hover:bg-accent">
            <UploadCloud className="h-4 w-4 text-emerald-600" /> رفع صفحات
          </Link>
          <Link to="/calibrate" className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2 hover:bg-accent">
            <Crosshair className="h-4 w-4 text-emerald-600" /> معايرة السور
          </Link>
        </nav>
      </div>
    </div>
  );
}
