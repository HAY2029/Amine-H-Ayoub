import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(__dirname, "../src/pages/SetMushafPage.tsx");

const src = `import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Trash2, RotateCcw, Image as ImageIcon, Layers, Palette, Save, Upload, FileText } from "lucide-react";
import { getAllSurahs } from "../data/quranData";
import { savePageAyahBoxes, getPageAyahBoxes, PAGE_IMAGE_SIZE } from "../data/ayahCoordinates";
import { savePageSurahRegions, getPageSurahRegions } from "../data/surahRegions";
import { addCustomPage } from "../data/customPages";
import { upsertPageImage } from "../services/imageOrderService";
import { toast } from "../hooks/use-toast";
import { syncShadingFromServer } from "../services/shadingSyncService";

type Tab = "upload" | "surahs" | "shading";

const COLS = 2;
const BOX_W = 440, BOX_H = 200, GAP_X = 20, GAP_Y = 20;
const START_X = 120, START_Y = 180;
const PAGE_H = 1929;

export default function SetMushafPage() {
  const surahs = getAllSurahs();
  const [tab, setTab] = useState<Tab>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [ss, setSs] = useState<Record<number, { enabled: boolean; ayahCount: number }>>({});
  const [regions, setRegions] = useState<ReturnType<typeof getPageSurahRegions>[number][]>([]);
  const [boxes, setBoxes] = useState<ReturnType<typeof getPageAyahBoxes>>([]);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imgKey, setImgKey] = useState<string | null>(null);

  // init surah list
  useState(() => {
    const acc: typeof ss = {};
    for (const s of surahs) acc[s.number] = { enabled: true, ayahCount: s.ayahs?.length ?? 0 };
    setSs(acc);
  });

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) {
      const u = URL.createObjectURL(f);
      setPreviewUrl(u);
      const i = new Image();
      i.onload = () => {
        upsertPageImage("mushaf-new-" + Date.now(), f)
          .then(k => setImgKey(k))
          .catch(() => {});
      };
      i.src = u;
    } else {
      setPreviewUrl(null);
      setImgKey(null);
    }
  }, []);

  const addRegion = () => {
    setRegions(r => [...r, { name: "سورة " + (r.length + 1), x: START_X, y: START_Y + r.length * 80, width: 920, height: 280 }]);
  };

  const saveRegions = () => {
    if (!imgKey) return toast({ title: "⚠️ أرفع صورة أولاً" });
    savePageSurahRegions(imgKey, regions);
    toast({ title: "✅ مناطق السور وُظّفت على السيرفر" });
  };

  const generateBoxes = useCallback(() => {
    const sns = Object.keys(ss).map(Number).filter(n => ss[n].enabled);
    if (sns.length === 0) return toast({ title: "⚠️ فعّل سورة على الأقل" });
    let ai = 0;
    const nb: typeof boxes = [];
    let cx = START_X, cy = START_Y;
    for (const sn of sns) {
      const count = ss[sn].ayahCount || 1;
      const rows = Math.ceil(count / COLS);
      for (let r = 0; r < rows; r++) {
        const inRow = Math.min(COLS, count - r * COLS);
        const w = BOX_W / inRow;
        for (let k = 0; k < inRow; k++) {
          nb.push({
            surah: sn,
            ayah: ai + 1,
            x: cx + k * (w + GAP_X),
            y: cy + r * (BOX_H + GAP_Y),
            width: w,
            height: BOX_H,
          });
          ai++;
        }
      }
      cy += rows * (BOX_H + GAP_Y);
    }
    setBoxes(prev => {
      const merged = [...prev, ...nb];
      if (imgKey) savePageAyahBoxes(imgKey, merged);
      return merged;
    });
    toast({ title: "✅ أُضيف " + nb.length + " مربع آية" });
  }, [imgKey, ss]);

  const quickShading = () => {
    if (!imgKey) return;
    const base = getPageAyahBoxes("/pages/600.jpg");
    const filtered = base.filter(b => ss[b.surah]?.enabled);
    if (filtered.length === 0) return toast({ title: "⚠️ لا توجد مربعات مرجعية" });
    const mapped = filtered.map(b => ({ ...b }));
    savePageAyahBoxes(imgKey, mapped);
    setBoxes(mapped);
    setOk(true);
    toast({ title: "✅ نُقل التظليل", description: mapped.length + " مربع → الصفحة الجديدة" });
  };

  const clearShading = () => {
    if (!imgKey) return;
    savePageAyahBoxes(imgKey, []);
    setBoxes([]);
    toast({ title: "🧹 حُذف التظليل" });
  };

  const deploy = async () => {
    if (!file) return toast({ title: "⚠️ اختر صورة أولاً" });
    if (!imgKey) return toast({ title: "⚠️ لم يتم تحضير الصورة" });
    if (boxes.length === 0 && regions.length === 0) {
      return toast({ title: "⚠️ أضف تظليل أو مناطق السور أولاً" });
    }
    setBusy(true);
    try {
      const suffix = String(Date.now());
      const src = "custom:" + suffix;
      await upsertPageImage(src, file);
      addCustomPage({ src, name: customName || "صفحة " + suffix.slice(-6) });
      if (boxes.length) await savePageAyahBoxes(src, boxes);
      if (regions.length) await savePageSurahRegions(src, regions);
      await syncShadingFromServer();
      toast({
        title: "✅ مصحف جديد",
        description: src + " + " + boxes.length + " مربع تظليل → السيرفر",
      });
      setOk(false);
    } catch (e) {
      toast({
        title: "❌ فشل الرفع",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen page-nour text-foreground" dir="rtl">
      <div className="mx-auto max-w-lg px-4 py-5 space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="font-extrabold text-xl text-gradient-gold flex items-center gap-2">
