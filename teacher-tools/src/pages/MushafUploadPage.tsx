import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2, Trash2, BookOpen, Crosshair, ImageOff } from "lucide-react";
import {
  getCustomPages,
  addCustomPage,
  removeCustomPage,
  savePageImage,
  getAllPageImages,
  deletePageImage,
  compressImageFile,
  type CustomPage,
} from "../data/customPages";
import { supabase, hasValidSupabaseKey } from "../lib/supabase";
import { toast } from "../hooks/use-toast";

/**
 * صفحة رفع صور صفحات المصحف يدوياً.
 * - ترفع عدة صور دفعة واحدة مع استخراج الاسم/الرقم من اسم الملف تلقائياً
 * - تحفظ محلياً (IndexedDB) + على السيرفر (Supabase store) عبر savePageImage
 * - تتحقق فعلياً من نجاح الرفع على السيرفر وتعرض الحالة لكل ملف
 */
type ItemStatus = "queued" | "saving" | "local" | "server_ok" | "server_fail" | "error";

interface UploadItem {
  file: File;
  name: string;
  dataUrl?: string;
  status: ItemStatus;
  message?: string;
}

// ملاحظة: الرفع للسيرفر يستخدم compressImageFile من customPages
// (ضغط JPEG تحت حد store الآمن ~160KB — فوقه يفشل السيرفر بخطأ 500)

/** استخراج اسم/رقم الصفحة من اسم الملف: "587.jpg" → "587" */
const nameFromFile = (file: File): string => file.name.replace(/\.[^.]+$/, "").trim() || file.name;

/** التحقق من وصول الصورة إلى السيرفر فعلياً (بعد الحفظ) */
const verifyOnServer = async (src: string): Promise<boolean> => {
  if (!hasValidSupabaseKey()) return false;
  try {
    const { data, error } = await supabase
      .from("store")
      .select("value")
      .eq("key", `mushaf:pageImg:${src}`)
      .maybeSingle();
    return !error && !!data?.value;
  } catch {
    return false;
  }
};

export default function MushafUploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [pages, setPages] = useState<CustomPage[]>(() => getCustomPages());
  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const serverOk = hasValidSupabaseKey();

  const refreshList = useCallback(async () => {
    setPages(getCustomPages());
    try {
      setImgs(await getAllPageImages());
    } catch {
      /* تجاهل */
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...list.map((file) => ({ file, name: nameFromFile(file), status: "queued" as ItemStatus })),
    ]);
  };

  const updateItem = (index: number, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const startUpload = async () => {
    if (items.length === 0 || busy) return;
    setBusy(true);
    let okServer = 0;
    let onlyLocal = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === "server_ok") continue; // مرفوع مسبقاً
      try {
        updateItem(i, { status: "saving", message: undefined });
        const dataUrl = item.dataUrl ?? (await compressImageFile(item.file));
        updateItem(i, { dataUrl });
        const src = `custom:${Date.now()}-${i}`;
        await savePageImage(src, dataUrl);
        addCustomPage({ src, name: item.name });
        const reachedServer = await verifyOnServer(src);
        if (reachedServer) {
          okServer++;
          updateItem(i, { status: "server_ok", message: "محفوظة محلياً + مرفوعة للسيرفر" });
        } else {
          onlyLocal++;
          updateItem(i, {
            status: serverOk ? "server_fail" : "local",
            message: serverOk
              ? "حُفظت محلياً فقط — فشل الرفع للسيرفر (يُعاد المحاولة عند المزامنة)"
              : "حُفظت محلياً فقط — لا يوجد مفتاح Supabase صالح",
          });
        }
      } catch (err) {
        failed++;
        updateItem(i, { status: "error", message: `خطأ: ${err instanceof Error ? err.message : "غير معروف"}` });
      }
    }

    setBusy(false);
    await refreshList();
    const parts: string[] = [];
    if (okServer) parts.push(`${okServer} مرفوعة للسيرفر`);
    if (onlyLocal) parts.push(`${onlyLocal} محلية فقط`);
    if (failed) parts.push(`${failed} فشلت`);
    const msg = parts.length ? parts.join(" · ") : "لا تغييرات";
    if (failed || (onlyLocal && !okServer))
      toast({ title: `تم الحفظ: ${msg}`, variant: "destructive" });
    else toast({ title: `تم الحفظ: ${msg}` });
  };

  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const statusBadge = (st: ItemStatus) => {
    switch (st) {
      case "queued":
        return <span className="text-[10px] text-muted-foreground">في الانتظار</span>;
      case "saving":
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />;
      case "server_ok":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> على السيرفر
          </span>
        );
      case "local":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> محلية فقط
          </span>
        );
      case "server_fail":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" /> فشل رفع السيرفر
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" /> خطأ
          </span>
        );
    }
  };

  const removePage = async (page: CustomPage) => {
    removeCustomPage(page.src);
    try {
      await deletePageImage(page.src);
    } catch {
      /* تجاهل */
    }
    await refreshList();
    toast({ title: `تم حذف الصفحة: ${page.name}` });
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* العنوان */}
        <header className="text-center space-y-1">
          <h1 className="flex items-center justify-center gap-2 text-2xl font-bold">
            <UploadCloud className="h-7 w-7 text-emerald-600" /> رفع صفحات المصحف
          </h1>
          <p className="text-sm text-muted-foreground">
            ارفع صور الصفحات من جهازك — تُحفظ محلياً وتُرفع للسيرفر تلقائياً لتظهر على كل الأجهزة
          </p>
        </header>

        {/* حالة السيرفر */}
        <div
          className={`rounded-xl border p-3 text-xs flex items-center gap-2 ${
            serverOk
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700"
              : "border-amber-500/40 bg-amber-500/5 text-amber-700"
          }`}
        >
          {serverOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {serverOk
            ? "السيرفر متاح — الصور سترفع تلقائياً إلى Supabase"
            : "لا يوجد مفتاح Supabase صالح — الصور ستُحفظ على هذا الجهاز فقط"}
        </div>

        {/* منطقة الرفع */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? "border-emerald-500 bg-emerald-500/10" : "border-emerald-500/40 hover:bg-emerald-500/5"
          }`}
        >
          <UploadCloud className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
          <p className="font-medium">اسحب الصور هنا أو انقر للاختيار</p>
          <p className="mt-1 text-xs text-muted-foreground">
            يمكن اختيار عدة صور — يُستخرج رقم الصفحة من اسم الملف (مثل: 587.jpg → «587»)
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* قائمة الانتظار */}
        {items.length > 0 && (
          <section className="rounded-xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold">الملفات المختارة ({items.length})</h2>
            <ul className="space-y-2">
              {items.map((item, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg border bg-background/60 p-2">
                  {item.dataUrl ? (
                    <img src={item.dataUrl} alt={item.name} className="h-12 w-9 rounded object-cover" />
                  ) : (
                    <div className="flex h-12 w-9 items-center justify-center rounded bg-muted">
                      <ImageOff className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <input
                      value={item.name}
                      onChange={(e) => updateItem(i, { name: e.target.value })}
                      className="w-full rounded border bg-transparent px-2 py-1 text-sm"
                    />
                    {item.message && <p className="mt-0.5 text-[10px] text-muted-foreground">{item.message}</p>}
                  </div>
                  {statusBadge(item.status)}
                  <button
                    onClick={() => removeItem(i)}
                    disabled={busy}
                    className="rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                    aria-label="إزالة"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={startUpload}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {busy ? "جاري الرفع..." : `رفع ${items.length} صفحة`}
            </button>
          </section>
        )}

        {/* الصفحات المرفوعة سابقاً */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">الصفحات المرفوعة ({pages.length})</h2>
          {pages.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">لا توجد صفحات مرفوعة بعد</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {pages.map((p) => (
                <li key={p.src} className="overflow-hidden rounded-lg border bg-background/60">
                  {imgs[p.src] ? (
                    <img src={imgs[p.src]} alt={p.name} className="h-32 w-full object-cover" />
                  ) : (
                    <div className="flex h-32 items-center justify-center bg-muted">
                      <ImageOff className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="truncate text-xs font-medium">{p.name}</span>
                    <button
                      onClick={() => removePage(p)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                      aria-label="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* روابط */}
        <nav className="flex justify-center gap-3 text-sm">
          <Link to="/mushaf" className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2 hover:bg-accent">
            <BookOpen className="h-4 w-4 text-emerald-600" /> فتح المصحف
          </Link>
          <Link to="/calibrate" className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2 hover:bg-accent">
            <Crosshair className="h-4 w-4 text-emerald-600" /> معايرة الآيات
          </Link>
        </nav>
      </div>
    </div>
  );
}

