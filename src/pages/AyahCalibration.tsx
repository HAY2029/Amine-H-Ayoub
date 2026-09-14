import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Plus, RotateCcw, Save, Trash2, ZoomIn, ZoomOut, Copy, Link2, ListOrdered, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, X, Check, Square, Upload } from "lucide-react";
import { AyahBox, getAllPageSources, getPageAyahBoxes, PAGE_IMAGE_SIZE, resetPageAyahBoxes, savePageAyahBoxes } from "@/data/ayahCoordinates";
import { getPageSurahRegions, savePageSurahRegions, SurahRegion } from "@/data/surahRegions";
import { clearSavedSurahTimings } from "@/data/ayahTimings";
import { CustomPage, getCustomPages, addCustomPage, removeCustomPage, savePageImage, getAllPageImages, syncAllPageImagesFromServer, deletePageImage, getPageOrderSrcs, savePageOrder, clearPageOrder, compressImageFile } from "@/data/customPages";
import { fetchHuggingFaceImages, HFImage } from "@/services/huggingFaceService";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const step = 10;

const AyahCalibration = () => {
  const [customPages, setCustomPages] = useState<CustomPage[]>(() => getCustomPages());
  const [customImages, setCustomImages] = useState<Record<string, string>>({});
  const [hfImagesMap, setHfImagesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchHuggingFaceImages().catch(() => [] as HFImage[]),
      syncAllPageImagesFromServer().catch(() => ({} as Record<string, string>)),
    ]).then(([images, localImgs]) => {
      if (!alive) return;
      const map: Record<string, string> = {};
      const srcList: string[] = [];
      images.forEach(img => {
        // img.name قد يكون "pages/600.jpg" — نوحّد المفتاح إلى "/pages/600.jpg"
        const clean = img.name.replace(/^pages\//, "").replace(/^\/pages\//, "");
        const src = `/pages/${clean}`;
        map[src] = img.url;
        srcList.push(src);
      });
      setHfImagesMap(map);
      try { localStorage.setItem("mushaf:hfImageSrcs:v1", JSON.stringify(srcList)); } catch { /* ignore */ }
      // دمج صور السيرفر (Supabase base64 + bucket) + الصور المحلية — حتى تظهر كل الصور معاً
      const mergedImgs: Record<string, string> = { ...localImgs, ...map };
      setCustomImages(mergedImgs);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const pageSources = useMemo(() => {
    // كل المصادر: المدمجة + المخصصة + صور HuggingFace + صور السيرفر (بدون تكرار)
    const sources = new Set([
      ...getAllPageSources(),
      ...customPages.map(p => p.src),
      ...Object.keys(hfImagesMap),
      ...Object.keys(customImages),
    ]);
    return Array.from(sources);
  }, [customPages, hfImagesMap, customImages]);

  const [pageSrc, setPageSrc] = useState(pageSources[0]);
  const [boxes, setBoxes] = useState<AyahBox[]>(() => getPageAyahBoxes(pageSources[0]));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scale, setScale] = useState(() => typeof window === "undefined" ? 1 : clamp((window.innerWidth - 24) / PAGE_IMAGE_SIZE.width, 0.25, 1));
  const [isSaving, setIsSaving] = useState(false);
  // حالة المزامنة مع السيرفر (Supabase store) — لعرضها بصرياً في الرأس
  const [serverState, setServerState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState(() => {
    try { return parseInt(localStorage.getItem("mushaf:calibrationLastSync") || "0", 10) || 0; } catch { return 0; }
  });

  // مناطق السور (تعريف فقط، اسم + رقم لكل سورة)
  const [regions, setRegions] = useState<SurahRegion[]>(() => getPageSurahRegions(pageSources[0]));
  const [selectedRegion, setSelectedRegion] = useState(0);
  const [showRegions, setShowRegions] = useState(true);
  const [regionMoveTarget, setRegionMoveTarget] = useState("");   // صفحة هدف لنقل سورة واحدة

  // إضافة صفحة جديدة برفع صورة
  const [newSurahOpen, setNewSurahOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  // إنشاء تظليل سورة جديدة (اسم + رقم + عدد آيات)
  const [csOpen, setCsOpen] = useState(false);
  const [csName, setCsName] = useState("");
  const [csNumber, setCsNumber] = useState("");
  const [csCount, setCsCount] = useState("");

  // نقل التظليل إلى صفحة أخرى
  const [copyTarget, setCopyTarget] = useState("");

  // ترتيب الصفحات (يُحفظ على السيرفر بمعرّف المسار src ويقرؤه القارئ)
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [draftSrcOrder, setDraftSrcOrder] = useState<string[]>([]);

  const [history, setHistory] = useState<AyahBox[][]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const selected = boxes[selectedIndex];

  // ─────────── تحميل ومساعدات (مدمجة: لا تُحمّل الصور مرتين) ───────────

  const imgSrcFor = (src: string) => customImages[src] || hfImagesMap[src] || src;
  const pageLabel = (src: string) => {
    const cp = customPages.find(p => p.src === src);
    return cp ? `🟢 ${cp.name}` : src.replace("/pages/", "");
  };

  const saveHistory = useCallback((current: AyahBox[]) => {
    setHistory(prev => { const next = [...prev, current]; if (next.length > 20) next.shift(); return next; });
  }, []);

  const undo = () => {
    if (history.length === 0) { toast({ title: "⚠️ لا يوجد تراجع" }); return; }
    const previous = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setBoxes(previous);
    setSelectedIndex(i => Math.min(i, Math.max(0, previous.length - 1)));
  };

  const loadPage = (src: string) => {
    setPageSrc(src);
    setBoxes(getPageAyahBoxes(src));
    setRegions(getPageSurahRegions(src));
    setSelectedRegion(0);
    setSelectedIndex(0);
    setHistory([]);
  };

  // ─────────── تحرير مربعات الآيات ───────────
  const updateSelected = (patch: Partial<AyahBox>) =>
    setBoxes(current => current.map((b, i) => i === selectedIndex ? { ...b, ...patch } : b));

  const move = (dx: number, dy: number) => {
    if (!selected) return;
    updateSelected({
      x: clamp(selected.x + dx, 0, PAGE_IMAGE_SIZE.width - selected.width),
      y: clamp(selected.y + dy, 0, PAGE_IMAGE_SIZE.height - selected.height),
    });
  };

  const resize = (dw: number, dh: number) => {
    if (!selected) return;
    updateSelected({
      width: clamp(selected.width + dw, 30, PAGE_IMAGE_SIZE.width - selected.x),
      height: clamp(selected.height + dh, 25, PAGE_IMAGE_SIZE.height - selected.y),
    });
  };

  const addNewBox = () => {
    saveHistory(boxes);
    const ref = selected || boxes[boxes.length - 1];
    const box: AyahBox = {
      surah: ref?.surah ?? 1,
      ayah: (ref?.ayah ?? 0) + 1,
      x: ref?.x ?? 140,
      y: ref ? clamp(ref.y + ref.height + 10, 0, PAGE_IMAGE_SIZE.height - 100) : 300,
      width: ref?.width ?? 980,
      height: ref?.height ?? 100,
    };
    setBoxes(current => {
      if (selected) { const next = [...current.slice(0, selectedIndex + 1), box, ...current.slice(selectedIndex + 1)]; setSelectedIndex(selectedIndex + 1); return next; }
      setSelectedIndex(current.length); return [...current, box];
    });
  };

  const duplicateSelected = () => {
    if (!selected) return;
    saveHistory(boxes);
    const copy: AyahBox = { ...selected, ayah: selected.ayah + 1, y: clamp(selected.y + selected.height + 8, 0, PAGE_IMAGE_SIZE.height - selected.height) };
    setBoxes(current => { const next = [...current.slice(0, selectedIndex + 1), copy, ...current.slice(selectedIndex + 1)]; setSelectedIndex(selectedIndex + 1); return next; });
  };

  // جزء ثانٍ بنفس رقم الآية (لآية ممتدّة على سطرين) — يُظلَّل الجزآن كآية واحدة في القارئ
  const addLinkedPart = () => {
    if (!selected) return;
    saveHistory(boxes);
    const part: AyahBox = { ...selected, y: clamp(selected.y + selected.height + 8, 0, PAGE_IMAGE_SIZE.height - selected.height) };
    setBoxes(current => { const next = [...current.slice(0, selectedIndex + 1), part, ...current.slice(selectedIndex + 1)]; setSelectedIndex(selectedIndex + 1); return next; });
    toast({ title: "✅ جزء مرتبط", description: "نفس الآية — حرّكه للسطر الثاني." });
  };

  const deleteSelected = () => {
    if (boxes.length === 0) return;
    saveHistory(boxes);
    setBoxes(current => current.filter((_, i) => i !== selectedIndex));
    setSelectedIndex(i => Math.max(0, i - 1));
  };

  const applyHeightToAll = () => {
    if (!selected) return;
    saveHistory(boxes);
    setBoxes(current => current.map(b => ({ ...b, height: selected.height })));
    toast({ title: "✅ توحيد الارتفاع" });
  };

  const applyWidthAndXToAll = () => {
    if (!selected) return;
    saveHistory(boxes);
    setBoxes(current => current.map(b => ({ ...b, x: selected.x, width: selected.width })));
    toast({ title: "✅ محاذاة العرض والمكان" });
  };

  // توحيد بالموقع: يُسنِد كل مربّع آية إلى السورة التي يقع مركزه داخل منطقتها (بلا نقل يدوي)
  const unifyBySurahLocation = () => {
    const withSurah = regions.filter(r => r.surah);
    if (withSurah.length === 0) { toast({ title: "⚠️ أضف «منطقة سورة» باسم ورقم أولاً" }); return; }
    saveHistory(boxes);
    let changed = 0;
    setBoxes(cur => cur.map(b => {
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const reg = withSurah.find(r => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height);
      if (reg && reg.surah !== b.surah) { changed++; return { ...b, surah: reg.surah as number }; }
      return b;
    }));
    toast({ title: "✅ وُحّدت السور بالموقع", description: changed > 0 ? `${changed} مربّع أُسنِد للسورة التي يقع داخل منطقتها` : "كل المربّعات مطابقة لمناطقها" });
  };

  // نقل (نسخ) تظليل الصفحة الحالية إلى صفحة أخرى — مفيد لصورة فيها صفحتان أو لصفحات متشابهة
  const copyShadingTo = async (targetSrc: string) => {
    if (!targetSrc || targetSrc === pageSrc) return;
    await savePageAyahBoxes(targetSrc, boxes.map(b => ({ ...b })));
    await savePageSurahRegions(targetSrc, regions.map(r => ({ ...r })));
    toast({ title: "✅ نُقل التظليل", description: `${boxes.length} مربع + ${regions.length} منطقة → ${pageLabel(targetSrc)}` });
  };

  // تعديل رقم السورة يغيّر رقم كل مربعات نفس السورة على الصفحة
  const setSurahForGroup = (newSurah: number) => {
    if (!selected) return;
    const old = selected.surah;
    setBoxes(cur => cur.map(b => b.surah === old ? { ...b, surah: newSurah } : b));
  };

  const dragStart = (index: number, e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedIndex(index);
    saveHistory(boxes);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = e.clientX, startY = e.clientY, startBox = boxes[index];
    const onMove = (ev: PointerEvent) => {
      const rx = PAGE_IMAGE_SIZE.width / rect.width, ry = PAGE_IMAGE_SIZE.height / rect.height;
      setBoxes(cur => cur.map((b, i) => i === index ? {
        ...b,
        x: clamp(startBox.x + (ev.clientX - startX) * rx, 0, PAGE_IMAGE_SIZE.width - startBox.width),
        y: clamp(startBox.y + (ev.clientY - startY) * ry, 0, PAGE_IMAGE_SIZE.height - startBox.height),
      } : b));
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  // ─────────── مناطق السور ───────────
  const updateRegion = (patch: Partial<SurahRegion>) =>
    setRegions(cur => cur.map((r, i) => i === selectedRegion ? { ...r, ...patch } : r));

  const addRegion = () => {
    const r: SurahRegion = { name: "", x: 180, y: 220, width: 900, height: 320 };
    setRegions(cur => { const next = [...cur, r]; setSelectedRegion(next.length - 1); return next; });
    setShowRegions(true);
  };

  const deleteRegion = (i: number) => {
    setRegions(cur => cur.filter((_, idx) => idx !== i));
    setSelectedRegion(s => Math.max(0, s - (i <= s ? 1 : 0)));
  };

  // نقل سورة واحدة (منطقتها + مربّعات آياتها) إلى صفحة أخرى — يحافظ على رقم السورة فتبقى
  // سورة واحدة عبر الصفحتين (يدمج في الصفحة الهدف المخزّنة ويزيلها من الحالية، ثم يحفظ الصفحتين).
  const moveSurahToPage = async (i: number, targetSrc: string) => {
    const region = regions[i];
    if (!region || !targetSrc || targetSrc === pageSrc) return;
    const num = region.surah;
    const movingBoxes = num != null ? boxes.filter(b => b.surah === num) : [];
    const remainingBoxes = num != null ? boxes.filter(b => b.surah !== num) : boxes;
    const remainingRegions = regions.filter((_, idx) => idx !== i);
    await savePageAyahBoxes(targetSrc, [...getPageAyahBoxes(targetSrc), ...movingBoxes.map(b => ({ ...b }))]);
    await savePageSurahRegions(targetSrc, [...getPageSurahRegions(targetSrc), { ...region }]);
    setBoxes(remainingBoxes);
    setRegions(remainingRegions);
    setSelectedRegion(s => Math.max(0, Math.min(s, remainingRegions.length - 1)));
    setSelectedIndex(0);
    await savePageAyahBoxes(pageSrc, remainingBoxes);
    await savePageSurahRegions(pageSrc, remainingRegions);
    setRegionMoveTarget("");
    toast({ title: `نُقلت ${region.name || "السورة"} إلى ${pageLabel(targetSrc)}`, description: `${movingBoxes.length} مربع آية + المنطقة — بنفس رقم السورة فتبقى سورة واحدة` });
  };

  // حذف بيانات سورة نهائياً (كل المربعات + المناطق + التوقيت عبر كل الصفحات) — لإعادة بنائها من الصفر
  const deleteSurahData = async (num?: number) => {
    if (!num) return;
    if (typeof window !== "undefined" && !window.confirm(`حذف كل بيانات السورة رقم ${num} نهائياً (المربعات + المناطق + التوقيت) من كل الصفحات؟ هذا لا يمكن التراجع عنه.`)) return;
    for (const src of pageSources) {
      const bx = getPageAyahBoxes(src);
      const nbx = bx.filter(b => b.surah !== num);
      if (nbx.length !== bx.length) await savePageAyahBoxes(src, nbx);
      const rg = getPageSurahRegions(src);
      const nrg = rg.filter(r => r.surah !== num);
      if (nrg.length !== rg.length) await savePageSurahRegions(src, nrg);
    }
    await clearSavedSurahTimings(num);
    setBoxes(getPageAyahBoxes(pageSrc).filter(b => b.surah !== num));
    setRegions(getPageSurahRegions(pageSrc).filter(r => r.surah !== num));
    setSelectedRegion(0); setSelectedIndex(0); setHistory([]);
    toast({ title: "🗑️ حُذفت بيانات السورة نهائياً", description: `سورة ${num} — يمكنك إعادة بنائها من الصفر.` });
  };

  const regionMove = (dx: number, dy: number) => {
    const r = regions[selectedRegion]; if (!r) return;
    updateRegion({ x: clamp(r.x + dx, 0, PAGE_IMAGE_SIZE.width - r.width), y: clamp(r.y + dy, 0, PAGE_IMAGE_SIZE.height - r.height) });
  };

  const regionResize = (dw: number, dh: number) => {
    const r = regions[selectedRegion]; if (!r) return;
    updateRegion({ width: clamp(r.width + dw, 40, PAGE_IMAGE_SIZE.width - r.x), height: clamp(r.height + dh, 30, PAGE_IMAGE_SIZE.height - r.y) });
  };

  const regionDragStart = (index: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedRegion(index);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = e.clientX, startY = e.clientY, startR = regions[index];
    const onMove = (ev: PointerEvent) => {
      const rx = PAGE_IMAGE_SIZE.width / rect.width, ry = PAGE_IMAGE_SIZE.height / rect.height;
      setRegions(cur => cur.map((r, i) => i === index ? {
        ...r,
        x: clamp(startR.x + (ev.clientX - startX) * rx, 0, PAGE_IMAGE_SIZE.width - startR.width),
        y: clamp(startR.y + (ev.clientY - startY) * ry, 0, PAGE_IMAGE_SIZE.height - startR.height),
      } : r));
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  // ─────────── رفع صفحة جديدة ───────────
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const createPage = async () => {
    if (!newFile) { toast({ title: "⚠️ اختر صورة الصفحة أولاً", variant: "destructive" }); return; }
    if (!newName.trim()) { toast({ title: "⚠️ اكتب اسم/رقم الصفحة", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const dataUrl = await compressImageFile(newFile);
      const uniqueSrc = `custom:${Date.now()}`;
      await savePageImage(uniqueSrc, dataUrl);
      setCustomPages(addCustomPage({ src: uniqueSrc, name: newName.trim() }));
      setCustomImages(prev => ({ ...prev, [uniqueSrc]: dataUrl }));
      setPageSrc(uniqueSrc); setBoxes([]); setRegions(getPageSurahRegions(uniqueSrc));
      setSelectedIndex(0); setSelectedRegion(0); setHistory([]); setShowRegions(true);
      setNewSurahOpen(false); setNewName(""); setNewFile(null);
      toast({ title: "✅ أُضيفت الصفحة", description: `${newName.trim()} — أضف منطقة لكل سورة (اسم + رقم).` });
    } catch (e) {
      toast({ title: "❌ فشل رفع الصورة", description: e instanceof Error ? e.message : "خطأ", variant: "destructive" });
    } finally { setCreating(false); }
  };

  const deleteCustomPage = async (src: string) => {
    setCustomPages(removeCustomPage(src));
    await deletePageImage(src).catch(() => {});
    setCustomImages(prev => { const n = { ...prev }; delete n[src]; return n; });
    await resetPageAyahBoxes(src);
    loadPage(getAllPageSources()[0]);
    toast({ title: "🗑️ حُذفت الصفحة المرفوعة" });
  };

  // إنشاء تظليل سورة جديدة: يسجّل اسمها ورقمها (منطقة) ويولّد مربعات آياتها للتظليل
  const createSurahCalibration = () => {
    const num = parseInt(csNumber, 10);
    if (!csName.trim()) { toast({ title: "⚠️ اكتب اسم السورة", variant: "destructive" }); return; }
    if (!num || num < 1) { toast({ title: "⚠️ اكتب رقم السورة", variant: "destructive" }); return; }
    const count = parseInt(csCount, 10) || 0;
    // ① منطقة سورة تحمل الاسم والرقم
    setRegions(cur => { const next = [...cur, { name: csName.trim(), surah: num, x: 160, y: 200, width: 940, height: 340 }]; setSelectedRegion(next.length - 1); return next; });
    setShowRegions(true);
    // ② مربعات الآيات (إن حُدّد العدد) — مكدّسة جاهزة للتحريك على الأسطر
    if (count >= 1) {
      saveHistory(boxes);
      const h = 110, gap = 8, startY = 300;
      const generated: AyahBox[] = Array.from({ length: count }, (_, i) => ({
        surah: num, ayah: i + 1, x: 140, width: 980, height: h,
        y: clamp(startY + i * (h + gap), 0, PAGE_IMAGE_SIZE.height - h),
      }));
      setBoxes(cur => { const next = [...cur, ...generated]; setSelectedIndex(cur.length); return next; });
    }
    setCsOpen(false); setCsName(""); setCsNumber(""); setCsCount("");
    toast({ title: "✅ أُنشئ تظليل السورة", description: `${csName.trim()} (${num})${count ? ` · ${count} آية` : ""} — حرّك المربعات/المنطقة فوق السورة ثم احفظ.` });
  };

  // ─────────── ترتيب الصفحات ───────────
  const openArrange = useCallback(() => {
    const saved = getPageOrderSrcs();
    const valid = saved.filter(s => pageSources.includes(s));
    pageSources.forEach(s => { if (!valid.includes(s)) valid.push(s); });
    setDraftSrcOrder(valid);
    setArrangeOpen(true);
  }, [pageSources]);

  const moveInOrder = (pos: number, dir: -1 | 1) => {
    setDraftSrcOrder(cur => {
      const next = [...cur]; const t = pos + dir;
      if (t < 0 || t >= next.length) return cur;
      [next[pos], next[t]] = [next[t], next[pos]];
      return next;
    });
  };

  // ─────────── الحفظ ───────────
  const saveAll = useCallback(async (silent = false) => {
    if (serverState === "syncing") return;
    setServerState("syncing");
    const results = await Promise.all([
      savePageAyahBoxes(pageSrc, boxes).then(() => true).catch((e) => { console.warn("save boxes:", e); return false; }),
      savePageSurahRegions(pageSrc, regions).then(() => true).catch((e) => { console.warn("save regions:", e); return false; }),
    ]);
    const ok = results.every(Boolean);
    if (ok) {
      setServerState("done");
      const t = Date.now();
      setLastSyncedAt(t);
      try { localStorage.setItem("mushaf:calibrationLastSync", String(t)); } catch { /* ignore */ }
    } else {
      setServerState("error");
    }
    if (!silent) {
      setIsSaving(true);
      toast({
        title: ok ? "✅ حُفظت الصفحة ومزامَنت مع السيرفر" : "⚠️ حُفظت محلياً — تعذّر الوصول للسيرفر",
        description: `${boxes.length} مربع · ${regions.length} منطقة سورة`,
        variant: ok ? "default" : "destructive",
      });
      setTimeout(() => setIsSaving(false), 1500);
    }
    return ok;
  }, [pageSrc, boxes, regions, serverState]);

  // حفظ تلقائي عند الخروج
  const stateRef = useRef({ pageSrc, boxes, regions });
  useEffect(() => { stateRef.current = { pageSrc, boxes, regions }; }, [pageSrc, boxes, regions]);
  useEffect(() => () => {
    const s = stateRef.current;
    savePageAyahBoxes(s.pageSrc, s.boxes);
    savePageSurahRegions(s.pageSrc, s.regions);
  }, []);

  const isCustom = customPages.some(p => p.src === pageSrc);
  // رابط صورة صالح فقط: صفحة مرفوعة بلا صورة → فارغ (نعرض بديلاً موجّهاً بدل صورة مكسورة)
  const pageImgUrl = customImages[pageSrc] || hfImagesMap[pageSrc] || (pageSrc.startsWith("custom:") ? "" : pageSrc);

  // ─────────── الواجهة ───────────
  return (
    <div className="min-h-screen page-nour text-foreground" dir="rtl">
      <div className="mx-auto max-w-6xl px-3 py-3 space-y-3">
        {/* الرأس */}
        <header className="flex items-center justify-between gap-2 rounded-2xl bg-card backdrop-blur border border-border px-3 py-2 sticky top-2 z-20 shadow-soft">
          <Link to="/" className="flex h-10 items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-4 text-sm font-bold hover:brightness-95 active:scale-95 transition-all">
            <ArrowRight className="h-4 w-4" /> رجوع
          </Link>
          <h1 className="font-extrabold text-base sm:text-lg text-gradient-gold">📐 معايرة المصحف</h1>
          <div className="flex items-center gap-2">
            {/* شارة مزامنة السيرفر */}
            <span
              title={serverState === "syncing" ? "جارٍ الرفع إلى السيرفر..." : serverState === "error" ? "تعذّر الوصول للسيرفر — ستعيد المحاولة عند الحفظ" : lastSyncedAt > 0 ? `آخر مزامنة: ${new Date(lastSyncedAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}` : "لم تُحفظ بعد"}
              className="flex h-8 min-w-[92px] items-center justify-center gap-1 rounded-full px-2 text-[10px] font-bold transition-all"
              style={{ background: serverState === "syncing" ? "rgba(250,204,21,0.18)" : serverState === "error" ? "rgba(239,68,68,0.16)" : "rgba(16,185,129,0.14)", border: `1px solid ${serverState === "syncing" ? "rgba(250,204,21,0.45)" : serverState === "error" ? "rgba(239,68,68,0.45)" : "rgba(16,185,129,0.4)"}`, color: serverState === "syncing" ? "#b45309" : serverState === "error" ? "#b91c1c" : "#047857" }}
            >
              {serverState === "syncing" ? <span className="w-2.5 h-2.5 rounded-full border border-current border-t-transparent animate-spin" /> : <Check className="h-3 w-3" />}
              {serverState === "syncing" ? "يرفع..." : serverState === "error" ? "السيرفر؟" : "السيرفر ✓"}
            </span>
            <button onClick={undo} disabled={history.length === 0}
              className={`flex h-10 items-center gap-1 rounded-full px-3 text-sm font-bold active:scale-95 transition-all ${history.length === 0 ? "bg-secondary/50 text-muted-foreground" : "bg-secondary text-secondary-foreground hover:brightness-95"}`}>
              <RotateCcw className="h-4 w-4" />
            </button>
            <button onClick={() => saveAll(false)}
              className={`flex h-10 items-center gap-1 rounded-full px-5 text-sm font-extrabold active:scale-95 transition-all ${isSaving ? "btn-emerald" : "btn-gold"}`}>
              <Save className="h-4 w-4" /> {isSaving ? "✅" : "حفظ"}
            </button>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-[1fr_330px]">
          {/* اللوحة */}
          <div className="max-h-[82vh] overflow-auto rounded-2xl bg-card backdrop-blur border border-border p-2 touch-none shadow-soft">
            <div ref={canvasRef} className="relative mx-auto origin-top" style={{ width: PAGE_IMAGE_SIZE.width * scale, height: PAGE_IMAGE_SIZE.height * scale }}>
              {pageImgUrl ? (
                <img src={pageImgUrl} alt="صفحة المصحف" className="absolute inset-0 h-full w-full select-none object-fill" draggable={false} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted text-center px-8">
                  <Upload className="w-12 h-12 text-muted-foreground" />
                  <p className="font-extrabold text-foreground text-lg">لا توجد صورة لهذه الصفحة</p>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">تظليلك محفوظ — تنقصه صورة المصحف فقط. ارفع صورة الصفحة من زرّ «صفحة جديدة» في الأعلى، ثم ضع التظليل فوقها.</p>
                </div>
              )}
              {/* مربعات الآيات */}
              {boxes.map((box, index) => {
                const isSel = index === selectedIndex;
                return (
                  <button
                    key={`${box.surah}-${box.ayah}-${index}`}
                    onPointerDown={(e) => dragStart(index, e)}
                    className="absolute rounded-md border-2 transition-all touch-none"
                    style={{
                      left: box.x * scale, top: box.y * scale, width: box.width * scale, height: box.height * scale,
                      mixBlendMode: "multiply",
                      background: isSel ? "rgba(250,204,21,0.45)" : "rgba(148,163,184,0.18)",
                      borderColor: isSel ? "rgba(250,204,21,0.9)" : "rgba(148,163,184,0.5)",
                      borderStyle: isSel ? "solid" : "dashed",
                    }}
                  >
                    <span className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 text-[10px] font-bold text-white">
                      {box.surah}:{box.label || box.ayah}
                    </span>
                  </button>
                );
              })}
              {/* مناطق السور */}
              {showRegions && regions.map((r, index) => {
                const isSel = index === selectedRegion;
                return (
                  <div key={`region-${index}`} onPointerDown={(e) => regionDragStart(index, e)}
                    className="absolute rounded-lg border-2 touch-none cursor-move"
                    style={{
                      left: r.x * scale, top: r.y * scale, width: r.width * scale, height: r.height * scale,
                      background: isSel ? "rgba(34,197,94,0.28)" : "rgba(34,197,94,0.12)",
                      borderColor: isSel ? "rgba(34,197,94,0.95)" : "rgba(34,197,94,0.6)", borderStyle: "dashed",
                    }}>
                    <span className="absolute right-1 top-1 rounded-full bg-emerald-900/85 px-2 py-0.5 text-[11px] font-bold text-emerald-100">
                      🟩 {r.name || "سورة"}{r.surah ? ` (${r.surah})` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* الشريط الجانبي */}
          <aside className="space-y-3 max-h-[82vh] overflow-y-auto pb-2">
            {/* ① الصفحة + الرفع + الترتيب */}
            <div className="card-nour p-3 space-y-2 animate-fade-up">
              <label className="block text-xs font-bold text-muted-foreground">① الصفحة</label>
              <select value={pageSrc} onChange={(e) => loadPage(e.target.value)} className="w-full rounded-lg bg-secondary border-border p-2 text-sm text-secondary-foreground">
                {pageSources.map(src => <option key={src} value={src}>{pageLabel(src)}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setNewSurahOpen(v => !v)} className="p-2 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1 active:scale-95">
                  <Upload className="h-3.5 w-3.5" /> صفحة جديدة
                </button>
                <button onClick={openArrange} className="p-2 rounded-lg bg-violet-600/20 border border-violet-500/40 text-violet-300 font-bold text-xs flex items-center justify-center gap-1 active:scale-95">
                  <ListOrdered className="h-3.5 w-3.5" /> ترتيب
                </button>
              </div>
              {/* نقل التظليل إلى صفحة أخرى */}
              {pageSources.length > 1 && (
                <div className="flex items-center gap-1">
                  <select value={copyTarget} onChange={(e) => setCopyTarget(e.target.value)} className="flex-1 min-w-0 rounded-lg bg-secondary border-border p-1.5 text-xs text-secondary-foreground">
                    <option value="">📋 نقل التظليل إلى…</option>
                    {pageSources.filter(s => s !== pageSrc).map(s => <option key={s} value={s}>{pageLabel(s)}</option>)}
                  </select>
                  <button onClick={() => { if (copyTarget) { copyShadingTo(copyTarget); setCopyTarget(""); } }} disabled={!copyTarget}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-600/30 border border-sky-500/40 text-sky-200 font-bold text-xs disabled:opacity-40 active:scale-95">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {isCustom && (
                <button onClick={() => deleteCustomPage(pageSrc)} className="w-full p-2 rounded-lg bg-red-600/20 border border-red-500/40 text-red-300 font-bold text-xs flex items-center justify-center gap-1 active:scale-95">
                  <Trash2 className="h-3.5 w-3.5" /> حذف هذه الصفحة المرفوعة
                </button>
              )}
              {newSurahOpen && (
                <div className="rounded-lg bg-background/70 backdrop-blur-sm border border-emerald-500/30 p-2 space-y-2">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">ارفع صورة الصفحة واكتب اسمها/رقمها. الصفحة قد تحوي أكثر من سورة — عرّف كل سورة بأداة «مناطق السور».</p>
                  <input type="file" accept="image/*" onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                    className="w-full text-[11px] text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:px-2 file:py-1 file:text-xs" />
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم/رقم الصفحة (مثل: 587)"
                    className="w-full rounded-md bg-secondary border-border p-1.5 text-sm text-secondary-foreground outline-none focus:border-emerald-500" />
                  <button onClick={createPage} disabled={creating}
                    className="w-full p-2 rounded-md bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1 active:scale-95 disabled:opacity-50">
                    <Plus className="h-3.5 w-3.5" /> {creating ? "جارٍ الإنشاء..." : "إنشاء الصفحة"}
                  </button>
                </div>
              )}
              {/* التكبير */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-muted-foreground">التكبير</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setScale(s => clamp(s - 0.1, 0.25, 2))} className="p-1.5 rounded-md bg-secondary text-secondary-foreground active:scale-95"><ZoomOut className="h-4 w-4" /></button>
                  <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(scale * 100)}%</span>
                  <button onClick={() => setScale(s => clamp(s + 0.1, 0.25, 2))} className="p-1.5 rounded-md bg-secondary text-secondary-foreground active:scale-95"><ZoomIn className="h-4 w-4" /></button>
                </div>
              </div>
            </div>

            {/* ➕ إنشاء تظليل سورة جديدة */}
            <div className="rounded-2xl bg-amber-950/30 border border-amber-500/40 p-3 space-y-2">
              <button onClick={() => setCsOpen(v => !v)} className="w-full flex items-center justify-between text-accent font-bold text-sm">
                <span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> إنشاء تظليل سورة جديدة</span>
                <span className="text-xs">{csOpen ? "▲" : "▼"}</span>
              </button>
              {csOpen && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">اكتب اسم السورة ورقمها وعدد آياتها — يُنشأ تظليلها (منطقة باسمها + مربعات آياتها) جاهزاً للتحريك فوق الصفحة.</p>
                  <input value={csName} onChange={(e) => setCsName(e.target.value)} placeholder="اسم السورة (مثل: النبأ)"
                    className="w-full rounded-md bg-secondary border-border p-1.5 text-sm text-secondary-foreground outline-none focus:border-accent" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min={1} max={114} value={csNumber} onChange={(e) => setCsNumber(e.target.value)} placeholder="رقم السورة"
                      className="rounded-md bg-secondary border-border p-1.5 text-sm text-secondary-foreground outline-none focus:border-accent" />
                    <input type="number" min={0} value={csCount} onChange={(e) => setCsCount(e.target.value)} placeholder="عدد الآيات"
                      className="rounded-md bg-secondary border-border p-1.5 text-sm text-secondary-foreground outline-none focus:border-accent" />
                  </div>
                  <button onClick={createSurahCalibration}
                    className="w-full p-2 rounded-md btn-gold font-bold text-xs flex items-center justify-center gap-1 active:scale-95">
                    <Plus className="h-3.5 w-3.5" /> إنشاء التظليل
                  </button>
                </div>
              )}
            </div>

            {/* ② مناطق السور */}
            <div className="rounded-2xl bg-emerald-950/30 border border-emerald-500/30 p-3 space-y-2">
              <button onClick={() => setShowRegions(v => !v)} className="w-full flex items-center justify-between text-emerald-300 font-bold text-sm">
                <span className="flex items-center gap-1.5"><Square className="h-4 w-4" /> ② مناطق السور ({regions.length})</span>
                <span className="text-xs">{showRegions ? "▲" : "▼"}</span>
              </button>
              {showRegions && (
                <div className="space-y-2">
                  <button onClick={addRegion} className="w-full p-2 rounded-lg bg-emerald-600/30 border border-emerald-500/50 text-emerald-200 font-bold text-xs flex items-center justify-center gap-1 active:scale-95">
                    <Plus className="h-3.5 w-3.5" /> أضف سورة (منطقة)
                  </button>
                  {regions.length === 0 && <p className="text-[11px] text-muted-foreground text-center leading-relaxed">اضغط «أضف سورة»، اكتب الاسم والرقم، وحرّك المستطيل الأخضر فوق السورة.</p>}
                  {regions.map((r, i) => (
                    <div key={i} className={`rounded-lg p-2 border ${i === selectedRegion ? "border-emerald-400 bg-emerald-900/30" : "border-border bg-card"}`}>
                      <div className="flex items-center gap-1">
                        <input value={r.name} onChange={(e) => { setSelectedRegion(i); updateRegion({ name: e.target.value }); }} onFocus={() => setSelectedRegion(i)}
                          placeholder="اسم السورة" className="flex-1 min-w-0 rounded-md bg-secondary border-border p-1.5 text-sm text-secondary-foreground outline-none focus:border-emerald-500" />
                        <input type="number" min={1} max={114} value={r.surah ?? ""} onChange={(e) => { setSelectedRegion(i); updateRegion({ surah: parseInt(e.target.value, 10) || undefined }); }} onFocus={() => setSelectedRegion(i)}
                          placeholder="رقم" className="w-14 shrink-0 rounded-md bg-secondary border-border p-1.5 text-sm text-secondary-foreground outline-none focus:border-emerald-500" />
                        <button onClick={() => deleteRegion(i)} className="p-1.5 rounded-md bg-destructive/30 text-destructive active:scale-95 shrink-0" title="حذف"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      {i === selectedRegion && (
                        <>
                        <div className="mt-2 grid grid-cols-4 gap-1 text-sm">
                          <button onClick={() => regionMove(-step, 0)} className="p-1.5 rounded bg-secondary text-secondary-foreground active:scale-95">←</button>
                          <button onClick={() => regionMove(step, 0)} className="p-1.5 rounded bg-secondary text-secondary-foreground active:scale-95">→</button>
                          <button onClick={() => regionMove(0, -step)} className="p-1.5 rounded bg-secondary text-secondary-foreground active:scale-95">↑</button>
                          <button onClick={() => regionMove(0, step)} className="p-1.5 rounded bg-secondary text-secondary-foreground active:scale-95">↓</button>
                          <button onClick={() => regionResize(-step, 0)} className="p-1.5 rounded bg-muted text-foreground active:scale-95">◀▶−</button>
                          <button onClick={() => regionResize(step, 0)} className="p-1.5 rounded bg-muted text-foreground active:scale-95">◀▶+</button>
                          <button onClick={() => regionResize(0, -step)} className="p-1.5 rounded bg-muted text-foreground active:scale-95">▲▼−</button>
                          <button onClick={() => regionResize(0, step)} className="p-1.5 rounded bg-muted text-foreground active:scale-95">▲▼+</button>
                        </div>
                        {pageSources.length > 1 && (
                          <div className="mt-2 flex items-center gap-1">
                            <select value={regionMoveTarget} onChange={(e) => setRegionMoveTarget(e.target.value)} className="flex-1 min-w-0 rounded-md bg-secondary border-border p-1.5 text-xs text-secondary-foreground">
                              <option value="">انقل هذه السورة إلى…</option>
                              {pageSources.filter(s => s !== pageSrc).map(s => <option key={s} value={s}>{pageLabel(s)}</option>)}
                            </select>
                            <button onClick={() => { if (regionMoveTarget) moveSurahToPage(i, regionMoveTarget); }} disabled={!regionMoveTarget}
                              className="shrink-0 px-2.5 py-1.5 rounded-md bg-sky-600/30 border border-sky-500/40 text-sky-200 font-bold text-xs disabled:opacity-40 active:scale-95" title="نقل السورة لهذه الصفحة">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        {r.surah ? (
                          <button onClick={() => deleteSurahData(r.surah)} className="mt-2 w-full p-1.5 rounded-md bg-destructive/20 border border-destructive/40 text-destructive text-[11px] font-bold active:scale-95 flex items-center justify-center gap-1">
                            <Trash2 className="h-3.5 w-3.5" /> حذف بيانات هذه السورة نهائياً (كل الصفحات)
                          </button>
                        ) : null}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ③ مربعات الآيات */}
            <div className="card-nour p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-muted-foreground">③ مربعات الآيات ({boxes.length})</label>
                <button onClick={addNewBox} className="p-1.5 rounded-lg bg-accent/15 border border-accent/40 text-accent active:scale-95" title="أضف مربع آية"><Plus className="h-4 w-4" /></button>
              </div>
              {boxes.length === 0 && <p className="text-[11px] text-muted-foreground text-center leading-relaxed">لا مربعات. اضغط ＋ لإضافة مربع آية، أو اكتفِ بمناطق السور أعلاه.</p>}
              {selected && (
                <>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setSelectedIndex(i => Math.max(0, i - 1))} className="p-2 rounded-lg bg-secondary text-secondary-foreground active:scale-95"><ChevronRight className="h-4 w-4" /></button>
                    <select value={selectedIndex} onChange={(e) => setSelectedIndex(Number(e.target.value))} className="flex-1 rounded-lg bg-secondary border-border p-2 text-sm text-secondary-foreground">
                      {boxes.map((b, i) => <option key={i} value={i}>{b.label || `${b.surah}:${b.ayah}`}</option>)}
                    </select>
                    <button onClick={() => setSelectedIndex(i => Math.min(boxes.length - 1, i + 1))} className="p-2 rounded-lg bg-secondary text-secondary-foreground active:scale-95"><ChevronLeft className="h-4 w-4" /></button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] text-muted-foreground">رقم السورة (يغيّر كل آياتها)</span>
                      <input type="number" min={1} max={114} value={selected.surah} onChange={(e) => setSurahForGroup(parseInt(e.target.value) || 1)}
                        className="w-full rounded-lg bg-secondary border-border p-1.5 text-sm text-secondary-foreground" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-muted-foreground">رقم الآية</span>
                      <input type="number" min={0} value={selected.ayah} onChange={(e) => { const v = parseInt(e.target.value, 10); updateSelected({ ayah: isNaN(v) ? 0 : v }); }}
                        className="w-full rounded-lg bg-secondary border-border p-1.5 text-sm text-secondary-foreground" />
                    </label>
                    <label className="block col-span-2">
                      <span className="text-[10px] text-muted-foreground">اسم مخصص (اختياري — مثل: البسملة)</span>
                      <input value={selected.label || ""} onChange={(e) => updateSelected({ label: e.target.value || undefined })}
                        className="w-full rounded-lg bg-secondary border-border p-1.5 text-sm text-secondary-foreground" />
                    </label>
                  </div>

                  {/* تحريك وتحجيم */}
                  <div className="grid grid-cols-4 gap-1 text-sm">
                    <button onClick={() => move(-step, 0)} className="p-1.5 rounded bg-secondary text-secondary-foreground active:scale-95">←</button>
                    <button onClick={() => move(step, 0)} className="p-1.5 rounded bg-secondary text-secondary-foreground active:scale-95">→</button>
                    <button onClick={() => move(0, -step)} className="p-1.5 rounded bg-secondary text-secondary-foreground active:scale-95">↑</button>
                    <button onClick={() => move(0, step)} className="p-1.5 rounded bg-secondary text-secondary-foreground active:scale-95">↓</button>
                    <button onClick={() => resize(-step, 0)} className="p-1.5 rounded bg-muted text-foreground active:scale-95">◀▶−</button>
                    <button onClick={() => resize(step, 0)} className="p-1.5 rounded bg-muted text-foreground active:scale-95">◀▶+</button>
                    <button onClick={() => resize(0, -step)} className="p-1.5 rounded bg-muted text-foreground active:scale-95">▲▼−</button>
                    <button onClick={() => resize(0, step)} className="p-1.5 rounded bg-muted text-foreground active:scale-95">▲▼+</button>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    <button onClick={duplicateSelected} className="p-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-bold active:scale-95 flex items-center justify-center gap-1"><Copy className="h-3.5 w-3.5" /> نسخ</button>
                    <button onClick={addLinkedPart} className="p-2 rounded-lg bg-sky-600/30 border border-sky-500/40 text-sky-200 text-xs font-bold active:scale-95 flex items-center justify-center gap-1" title="جزء بنفس الآية (سطر ثانٍ)"><Link2 className="h-3.5 w-3.5" /> سطرين</button>
                    <button onClick={deleteSelected} className="p-2 rounded-lg bg-destructive/30 border border-destructive/40 text-destructive text-xs font-bold active:scale-95 flex items-center justify-center gap-1"><Trash2 className="h-3.5 w-3.5" /> حذف</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button onClick={applyHeightToAll} className="p-2 rounded-lg bg-secondary text-secondary-foreground text-[11px] font-bold active:scale-95">توحيد الارتفاع</button>
                    <button onClick={applyWidthAndXToAll} className="p-2 rounded-lg bg-secondary text-secondary-foreground text-[11px] font-bold active:scale-95">محاذاة العرض</button>
                  </div>
                  <button onClick={unifyBySurahLocation} className="w-full p-2 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold active:scale-95 flex items-center justify-center gap-1">
                    <Square className="h-3.5 w-3.5" /> وحّد السور بالموقع — أسنِد كل مربّع لمنطقة سورته
                  </button>
                </>
              )}
            </div>


            <button onClick={() => saveAll(false)} className="w-full p-3 rounded-2xl btn-gold font-extrabold flex items-center justify-center gap-2 active:scale-[0.98]">
              <Save className="h-5 w-5" /> حفظ الصفحة (مربعات + مناطق)
            </button>
          </aside>
        </section>
      </div>

      {/* نافذة ترتيب الصفحات */}
      {arrangeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setArrangeOpen(false)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-card border border-border p-4 space-y-2 shadow-soft" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-accent">ترتيب الصفحات في القارئ</h3>
              <button onClick={() => setArrangeOpen(false)} className="p-1.5 rounded-lg bg-secondary text-secondary-foreground"><X className="h-4 w-4" /></button>
            </div>
            {draftSrcOrder.map((src, pos) => (
              <div key={src} className="flex items-center gap-2 rounded-lg bg-muted p-2 border border-border">
                <span className="text-xs text-muted-foreground w-5">{pos + 1}</span>
                <img src={imgSrcFor(src)} alt={src} className="w-10 h-14 object-cover rounded-md border border-border shrink-0" loading="lazy" />
                <span className="flex-1 min-w-0 font-bold text-sm text-foreground truncate">{pageLabel(src)}</span>
                <button onClick={() => moveInOrder(pos, -1)} disabled={pos === 0} className="p-1.5 rounded-md bg-muted text-foreground disabled:opacity-30 active:scale-95"><ChevronUp className="h-4 w-4" /></button>
                <button onClick={() => moveInOrder(pos, 1)} disabled={pos === draftSrcOrder.length - 1} className="p-1.5 rounded-md bg-muted text-foreground disabled:opacity-30 active:scale-95"><ChevronDown className="h-4 w-4" /></button>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => { clearPageOrder(); setArrangeOpen(false); toast({ title: "↩️ أُعيد الترتيب الأصلي" }); }}
                className="p-2 rounded-lg bg-secondary text-secondary-foreground font-bold text-sm active:scale-95">إعادة الأصل</button>
              <button onClick={() => { savePageOrder(draftSrcOrder); setArrangeOpen(false); toast({ title: "✅ تم حفظ الترتيب على السيرفر", description: "افتح القارئ لرؤيته" }); }}
                className="p-2 rounded-lg btn-emerald font-bold text-sm flex items-center justify-center gap-1 active:scale-95"><Check className="h-4 w-4" /> حفظ الترتيب</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AyahCalibration;
