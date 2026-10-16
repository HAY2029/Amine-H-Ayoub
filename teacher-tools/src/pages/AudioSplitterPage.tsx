import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { toast } from "../hooks/use-toast";
import { saveSurahTimings, SurahTimings, AudioSegment } from "../data/ayahTimings";
import { getPageAyahBoxes, savePageAyahBoxes, getAllPageSources } from "../data/ayahCoordinates";
import { getCustomPages } from "../data/customPages";
import { supabase } from "../lib/supabase";
import { getSurahName } from "../data/quranData";

function normSeg(s: any): AudioSegment | null {
  if (!s || typeof s.start !== "number" || typeof s.end !== "number") return null;
  const speaker = s.speaker === "kids" || s.speaker === "child" ? "kids" : "teacher";
  return {
    id: String(s.id || `seg-${Math.round(s.start * 1000)}`),
    start: s.start,
    end: s.end,
    speaker,
    ayah: typeof s.ayah === "number" && s.ayah > 0 ? s.ayah : undefined,
    label: s.label,
  };
}

// يكتب وقت كل آية (معلم/طفل) داخل مربّع تظليلها المطابق عبر كل الصفحات
async function linkToShading(surahNum: number, segs: AudioSegment[]): Promise<number> {
  const tByAyah = new Map<number, AudioSegment>();
  const kByAyah = new Map<number, AudioSegment>();
  segs.forEach((s) => {
    if (!s.ayah || s.ayah < 1) return;
    if (s.speaker === "kids") { if (!kByAyah.has(s.ayah)) kByAyah.set(s.ayah, s); }
    else { if (!tByAyah.has(s.ayah)) tByAyah.set(s.ayah, s); }
  });
  if (tByAyah.size === 0 && kByAyah.size === 0) return 0;
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
      return { ...b, audioStart: t ? t.start : b.audioStart, audioEnd: t ? t.end : b.audioEnd, kidsStart: k ? k.start : b.kidsStart, kidsEnd: k ? k.end : b.kidsEnd };
    });
    if (changed) await savePageAyahBoxes(src, next);
  }
  return linked;
}

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || "audio/mpeg" });
}

export default function AudioSplitterPage() {
  const navigate = useNavigate();
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      // Ensure we only process messages that have our specific type
      if (!e.data || e.data.type !== 'SAVE_AUDIO_SPLIT') return;
      const payload = e.data.payload || {};
      const iframe = document.getElementById('audio-splitter-iframe') as HTMLIFrameElement;
      const ack = (ok: boolean, message: string) => {
        try { iframe?.contentWindow?.postMessage({ type: 'SAVE_AUDIO_SPLIT_ACK', ok, message }, '*'); } catch { /* ignore */ }
      };

      const surahNumber = parseInt(payload.surahNumber, 10);
      const rawSegs = Array.isArray(payload.timings?.segments) ? payload.timings.segments : [];
      const segs: AudioSegment[] = rawSegs.map(normSeg).filter((s): s is AudioSegment => !!s);
      // إن لم تصل segments صالحة، ابنِها من teacher/kids
      if (segs.length === 0) {
        const t = Array.isArray(payload.timings?.teacher) ? payload.timings.teacher : [];
        const k = Array.isArray(payload.timings?.kids) ? payload.timings.kids : [];
        t.forEach((st: number, i: number) => { if (typeof st === "number") segs.push({ id: `seg-t${i}`, start: st, end: st + 1, speaker: "teacher", ayah: i + 1, label: `آية ${i + 1}` }); });
        k.forEach((st: number, i: number) => { if (typeof st === "number") segs.push({ id: `seg-k${i}`, start: st, end: st + 1, speaker: "kids", ayah: i + 1, label: `آية ${i + 1}` }); });
      }
        
      if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
        toast({
          title: "تنبيه",
          description: "لم يتم التعرف على رقم السورة — اكتبه في حقل (السورة) داخل المقسّم ثم أعد الحفظ",
          variant: "destructive",
        });
        ack(false, "رقم السورة غير صالح");
        return;
      }
      if (segs.length === 0) {
        toast({ title: "لا توجد مقاطع صالحة للحفظ", variant: "destructive" });
        ack(false, "لا توجد مقاطع صالحة");
        return;
      }

      setSaving(true);
      try {
        // 1) توقيتات الآيات
        const teacherStarts = segs.filter(s => s.speaker === "teacher").sort((a, b) => a.start - b.start).map(s => s.start);
        const kidsStarts = segs.filter(s => s.speaker === "kids").sort((a, b) => a.start - b.start).map(s => s.start);
        const timings: SurahTimings = {
          teacher: teacherStarts.length ? teacherStarts : [segs[0].start],
          segments: segs.sort((a, b) => a.start - b.start),
        };
        if (kidsStarts.length > 0) { timings.kids = kidsStarts; timings.kidsStart = kidsStarts[0]; }
        await saveSurahTimings(surahNumber, timings);

        // 2) ربط تلقائي بالتظليل (يكتب audioStart/End داخل مربعات الآيات)
        const linked = await linkToShading(surahNumber, segs).catch(() => 0);

        // 3) رفع مباشر للصوت المرفق (إن أُرسل base64) إلى Supabase Storage
        let audioMsg = "";
        if (payload.audioBase64 && typeof payload.audioBase64 === "string") {
          try {
            const blob = b64ToBlob(payload.audioBase64, payload.audioMime || "audio/mpeg");
            const ext = (payload.audioMime || "").includes("wav") ? "wav" : "mp3";
            const path = `surahs/${surahNumber}.${ext}`;
            const { error } = await supabase.storage.from("quran-audio").upload(path, blob, { upsert: true, contentType: payload.audioMime || "audio/mpeg" });
            audioMsg = error ? " (تعذّر رفع الصوت: " + error.message + ")" : " + رُفع الصوت";
          } catch (err: any) {
            audioMsg = " (تعذّر رفع الصوت)";
          }
        }

        const msg = `سورة ${getSurahName(surahNumber)}: حفظ ${segs.length} مقطع${linked ? ` وربط ${linked} آية بالتظليل` : ""}${audioMsg}`;
        setLastSaved(msg);
        toast({ title: "تم الحفظ بنجاح ✅", description: msg });
        ack(true, msg);
      } catch (error) {
        console.error("Error saving audio split:", error);
        toast({
          title: "خطأ في الحفظ",
          description: "حدث مشكلة أثناء محاولة الحفظ في السيرفر.",
          variant: "destructive",
        });
        ack(false, "حدث خطأ أثناء الحفظ");
      } finally {
        setSaving(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div className="flex flex-col h-screen page-nour" dir="rtl">
      <header className="flex-none p-4 flex items-center justify-between border-b border-border/40 bg-background/50 backdrop-blur">
        <button 
          onClick={() => navigate("/teacher-tools")} 
          className="flex h-10 items-center gap-2 rounded-full bg-secondary text-secondary-foreground px-4 text-sm font-bold border border-border hover:brightness-95 active:scale-95 transition-all shadow-soft"
        >
          <ArrowRight className="h-4 w-4" /> 
          العودة للأدوات
        </button>
        <h1 className="text-xl font-bold text-gradient-gold">مقسِّم التلاوة المتقدم</h1>
        <div className="w-24"></div> {/* Spacer to center title */}
      </header>

      {(saving || lastSaved) && (
        <div className="flex-none px-4 pt-3">
          <div className="card-nour p-3 text-center text-sm">
            {saving ? "⏳ جاري الحفظ والربط بالتظليل والرفع..." : `✅ ${lastSaved}`}
          </div>
        </div>
      )}

      <div className="flex-1 w-full bg-black/5 relative">
        <iframe
          id="audio-splitter-iframe"
          src="/audio-splitter.html"
          className="w-full h-full border-none absolute inset-0"
          title="Audio Splitter"
          allow="autoplay; fullscreen"
        />
      </div>
    </div>
  );
}
