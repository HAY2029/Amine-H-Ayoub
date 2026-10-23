import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Scissors, Link2, Loader2, Zap, Sparkles, UploadCloud, Save, CheckCircle2, FileAudio2 } from "lucide-react";
import { getAllSurahs } from "../data/quranData";
import { getPageAyahBoxes, savePageAyahBoxes, getAllPageSources } from "../data/ayahCoordinates";
import { getCustomPages } from "../data/customPages";
import { saveSurahTimings, AudioSegment } from "../data/ayahTimings";
import { toast } from "../hooks/use-toast";
import { supabase } from "../integrations/supabase/client";
import { setCustomAudioUrl } from "../data/audioUrls";
import { saveCalibrationCjsSnapshot, downloadCalibrationCjsSnapshot } from "../data/calibrationBackup";

const DEFAULT_SERVICE_URL = "https://hammoualiyoucef20-quran-audio.hf.space";
const SERVICE_URL_KEY = "quran:splitServiceUrl";
const SERVICE_API_KEY_STORAGE = "quran:splitServiceKey";

/** مفتاح المصادقة لـ Gemini (إن ضُبط) — يُرسل كترويسة X-API-Key ولا يظهر في الرابط. */
const getServiceApiKey = (): string => {
  try {
    return localStorage.getItem(SERVICE_API_KEY_STORAGE) || "";
  } catch {
    return "";
  }
};

export default function LinkAudioPage() {
  const surahs = getAllSurahs();
  const [surahNum, setSurahNum] = useState<number>(surahs[0]?.number ?? 1);
  const [surahName, setSurahName] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [engine, setEngine] = useState<"vad" | "gemini">("vad");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [linkedCount, setLinkedCount] = useState(0);
  const [savedServer, setSavedServer] = useState(false);

  const serviceUrl = (() => { try { return localStorage.getItem(SERVICE_URL_KEY) || DEFAULT_SERVICE_URL; } catch { return DEFAULT_SERVICE_URL; } })();

  const persist = async (segs: AudioSegment[]) => {
    const teacher = segs.filter((s) => s.speaker === "teacher").map((s) => s.start);
    const kids = segs.filter((s) => s.speaker === "kids").map((s) => s.start);
    const payload: { teacher: number[]; segments: AudioSegment[]; kids?: number[]; kidsStart?: number } = { teacher, segments: segs };
    if (kids.length > 0) { payload.kids = kids; payload.kidsStart = kids[0]; }
    await saveSurahTimings(surahNum, payload);
    try {
      await saveCalibrationCjsSnapshot();
      setSavedServer(true);
    } catch {
      setSavedServer(false);
    }
  };

  const linkToShading = async (segs: AudioSegment[]): Promise<number> => {
    const tByAyah = new Map<number, AudioSegment>();
    const kByAyah = new Map<number, AudioSegment>();
    segs.forEach((s) => {
      if (!s.ayah || s.ayah < 1) return;
      if (s.speaker === "kids") { if (!kByAyah.has(s.ayah)) kByAyah.set(s.ayah, s); }
      else { if (!tByAyah.has(s.ayah)) tByAyah.set(s.ayah, s); }
    });

    const allSrcs = [...getAllPageSources(), ...getCustomPages().map((p) => p.src)];
    let linked = 0;
    for (const src of allSrcs) {
      const boxes = getPageAyahBoxes(src);
      if (!boxes.some((b) => b.surah === surahNum)) continue;
      let changed = false;
      const next = boxes.map((b) => {
        if (b.surah !== surahNum) return b;
        const t = tByAyah.get(b.ayah), k = kByAyah.get(b.ayah);
        if (!t && !k) return b;
        changed = true; linked++;
        return {
          ...b,
          audioStart: t ? t.start : b.audioStart,
          audioEnd: t ? t.end : b.audioEnd,
          kidsStart: k ? k.start : b.kidsStart,
          kidsEnd: k ? k.end : b.kidsEnd,
        };
      });
      if (changed) await savePageAyahBoxes(src, next);
    }
    return linked;
  };

  const exportBackup = async () => {
    try {
      const snapshot = await saveCalibrationCjsSnapshot();
      if (snapshot) {
        downloadCalibrationCjsSnapshot(snapshot);
        toast({ title: "✅ نسخة .cjs محفوظة", description: "تم حفظ نسخة التظليل/الصوت على السيرفر وبدأ تنزيل الملف .cjs" });
      }
    } catch (e) {
      toast({ title: "⚠️ لم يتم حفظ النسخة", description: e instanceof Error ? e.message : "خطأ", variant: "destructive" });
    }
  };

  const run = async () => {
    if (!file) {
      toast({ title: "⚠️ ارفع ملف الصوت أولاً", variant: "destructive" });
      return;
    }

    const base = serviceUrl.trim().replace(/\/$/, "");
    const label = surahName.trim() || `سورة ${surahNum}`;
    setBusy(true);
    setSegments([]);
    setLinkedCount(0);
    setSavedServer(false);

    try {
      setStatus("رفع الصوت إلى السيرفر...");
      const sessionId = `session_${Date.now()}`;
      const filename = `${sessionId}_${file.name}`;
      const filepath = `audio-uploads/${sessionId}/${filename}`;

      const { error: uploadError } = await supabase.storage.from("quran-audio").upload(filepath, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw new Error(`فشل الرفع: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from("quran-audio").getPublicUrl(filepath);
      const storageUrl = urlData?.publicUrl;
      if (!storageUrl) throw new Error("فشل الحصول على رابط التخزين");

      setCustomAudioUrl(surahNum, storageUrl);

      setStatus(engine === "gemini" ? "Gemini يقسّم الصوت..." : "الخدمة تقسم الصوت...");
      const form = new FormData();
      form.append("file", file, file.name || `${surahNum}.mp3`);
      form.append("leading", "1");
      form.append("surahLabel", label);

      const headers: Record<string, string> = {};
      const apiKey = engine === "gemini" ? getServiceApiKey() : "";
      if (apiKey) headers["X-API-Key"] = apiKey;

      const res = await fetch(`${base}${engine === "gemini" ? "/split-gemini" : "/split"}`, {
        method: "POST",
        headers,
        body: form,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`الخدمة ردّت ${res.status} ${t.slice(0, 120)}`);
      }

      const data = await res.json();
      const segs: AudioSegment[] = (data.segments || []).map((s: AudioSegment) => ({ ...s }));
      if (segs.length === 0) throw new Error("لم تُرجِع الخدمة أي مقاطع");

      setSegments(segs);
      await persist(segs);
      setStatus("ربط المقاطع بالتظليل...");
      const linked = await linkToShading(segs);
      setLinkedCount(linked);

      if (linked === 0) {
        toast({ title: "✅ تم التقسيم", description: `قُسّم ${segs.length} مقطع، لكن لا توجد مربعات تظليل لهذه السورة — أنشئها أولاً في المعايرة.`, variant: "default" });
      } else {
        toast({ title: "✅ تم الربط والحفظ", description: `${segs.length} مقطع · ${linked} آية رُبطت بالتظليل وحُفظت على السيرفر.` });
      }
    } catch (e) {
      toast({ title: "❌ فشل", description: e instanceof Error ? e.message : "خطأ", variant: "destructive" });
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  return (
    <div className="min-h-screen page-nour text-foreground" dir="rtl">
      <div className="mx-auto max-w-5xl px-4 py-5 space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-300/80">Studio</p>
              <h1 className="text-xl font-black text-gradient-gold">رفع الصوت وربطه بالتظليل</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => { window.location.hash = "/calibrate"; }} className="flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground">
              <ArrowRight className="h-3.5 w-3.5" /> المعايرة
            </button>
            <button onClick={exportBackup} className="flex items-center gap-1 rounded-full bg-violet-600 px-3 py-2 text-xs font-black text-white">
              <Save className="h-3.5 w-3.5" /> .cjs
            </button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-4">
            <div className="flex items-center gap-2 text-sm font-black text-foreground">
              <FileAudio2 className="h-4 w-4 text-violet-300" />
              رفع الصوت وتوزيع التوقيتات
            </div>

            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">السورة</span>
              <select value={surahNum} onChange={(e) => setSurahNum(parseInt(e.target.value, 10))} className="w-full rounded-xl border border-border bg-secondary p-2.5 text-sm text-secondary-foreground outline-none focus:border-violet-500">
                {surahs.map((s) => <option key={s.number} value={s.number}>{s.number} — {s.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">اسم السورة (اختياري)</span>
              <input value={surahName} onChange={(e) => setSurahName(e.target.value)} placeholder="مثل: النبأ" className="w-full rounded-xl border border-border bg-secondary p-2.5 text-sm text-secondary-foreground outline-none focus:border-violet-500" />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">ملف الصوت</span>
              <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full rounded-xl border border-dashed border-border bg-secondary p-2.5 text-[12px] text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white" />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEngine("vad")} className={`rounded-xl p-2.5 text-xs font-black ${engine === "vad" ? "bg-violet-600 text-white" : "bg-secondary text-secondary-foreground"}`}>
                <span className="flex items-center justify-center gap-1"><Zap className="h-3.5 w-3.5" /> الخدمة</span>
              </button>
              <button onClick={() => setEngine("gemini")} className={`rounded-xl p-2.5 text-xs font-black ${engine === "gemini" ? "bg-emerald-600 text-white" : "bg-secondary text-secondary-foreground"}`}>
                <span className="flex items-center justify-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Gemini</span>
              </button>
            </div>

            <button onClick={run} disabled={busy || !file} className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 p-3 text-sm font-black text-white shadow-lg shadow-violet-900/20 disabled:opacity-40">
              <span className="flex items-center justify-center gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                {busy ? status || "جارٍ..." : "قسّم الصوت واربطه بالتظليل"}
              </span>
            </button>

            <div className="flex items-center justify-between rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
              <span>حالة السيرفر</span>
              <span className="font-black">{savedServer ? "تم الحفظ" : "قيد المعالجة"}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-4">
            <div className="flex items-center gap-2 text-sm font-black text-foreground">
              <Link2 className="h-4 w-4 text-emerald-300" />
              النتيجة والربط
            </div>

            {segments.length > 0 ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
                  <div className="text-3xl font-black text-emerald-300">{segments.length}</div>
                  <div className="text-xs text-muted-foreground">مقطع صوتي تم اكتشافه</div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-secondary p-3">
                    <div className="text-muted-foreground">المعلم</div>
                    <div className="mt-1 text-lg font-black text-emerald-300">{segments.filter((s) => s.speaker === "teacher").length}</div>
                  </div>
                  <div className="rounded-xl bg-secondary p-3">
                    <div className="text-muted-foreground">الطفل</div>
                    <div className="mt-1 text-lg font-black text-amber-300">{segments.filter((s) => s.speaker === "kids").length}</div>
                  </div>
                </div>

                <div className="rounded-xl bg-secondary p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">تم الربط بالتظليل</span>
                    <strong className="text-emerald-300">{linkedCount}</strong>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                  <div className="flex items-center gap-2 font-black">
                    <CheckCircle2 className="h-4 w-4" />
                    البيانات محفوظة في السيرفر
                  </div>
                  <div className="mt-1">سيظهر التظليل في المصحف مباشرة عند فتح السورة.</div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-secondary/40 p-6 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/10 text-violet-300">
                  <UploadCloud className="h-7 w-7" />
                </div>
                <div className="text-sm font-black text-foreground">لا توجد بيانات بعد</div>
                <div className="mt-2 text-xs text-muted-foreground">رفع ملف صوتي، ثم سيظهر هنا التقسيم والربط التلقائي.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
