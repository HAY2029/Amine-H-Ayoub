import { useEffect, useState } from "react";
import { RefreshCw, Eye, EyeOff, Save, Download, Mic } from "lucide-react";
import { getRemoteGames, getRemoteGamesUrl, setRemoteGamesUrl, fetchRemoteGames, precacheRemoteGames } from "../data/remoteGames";
import { hideRemoteGame, showRemoteGame, getHiddenRemoteIds } from "../data/gameCatalog";
import { getSurahAudioUrl } from "../data/audioUrls";
import { toast } from "../hooks/use-toast";
import ModalLayer from "./ui/ModalLayer";

/**
 * لوحة أدمن الألعاب — تظهر في أدوات المالك فقط:
 * تغيير رابط ملف الألعاب + تحديث فوري + إخفاء/إظهار ألعاب بعيدة + تحميل الأكواد للجهاز.
 */
export default function AdminGamesModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(getRemoteGamesUrl());
  const [list, setList] = useState(getRemoteGames());
  const [hidden, setHidden] = useState<string[]>(getHiddenRemoteIds());
  const [busy, setBusy] = useState(false);
  const [audioStatus, setAudioStatus] = useState<Record<number, boolean>>({});
  const [checkingAudio, setCheckingAudio] = useState(false);

  // فحص أرقام التلاوات الموجودة فعلياً على السيرفر (من 1 إلى 114) — الناقص يظهر أحمر ليعمل عليه
  const checkAudio = async () => {
    setCheckingAudio(true);
    const st: Record<number, boolean> = {};
    for (let n = 1; n <= 114; n++) {
      try {
        const r = await fetch(getSurahAudioUrl(n), { method: "HEAD" });
        st[n] = r.ok;
      } catch { st[n] = false; }
      if (n % 10 === 0) setAudioStatus({ ...st });   // تحديث تدريجي كل 10 أرقام
    }
    setAudioStatus(st);
    setCheckingAudio(false);
    toast({ title: "تم فحص التلاوات — الناقص يظهر أحمر ✗" });
  };

  const refresh = async () => {
    setBusy(true);
    await fetchRemoteGames();
    setList(getRemoteGames());
    setHidden(getHiddenRemoteIds());
    setBusy(false);
    toast({ title: "تم تحديث فهرس الألعاب من السيرفر" });
  };

  const saveUrl = () => {
    if (!/^https?:\/\//.test(url.trim())) { toast({ title: "رابط غير صالح", variant: "destructive" }); return; }
    setRemoteGamesUrl(url);
    toast({ title: "تم حفظ الرابط وجلب الألعاب" });
    setTimeout(refresh, 400);
  };

  const downloadAll = async () => {
    setBusy(true);
    const n = await precacheRemoteGames();
    setBusy(false);
    toast({ title: n > 0 ? `تم تحميل ${n} لعبة إلى الجهاز` : "كل الألعاب محمَّلة مسبقاً" });
  };

  return (
    <ModalLayer>
    <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto overscroll-contain bg-background/70 backdrop-blur-sm p-4 sm:items-center" onClick={onClose}>
      <div className="my-auto card-nour w-full max-w-lg p-5 pb-safe space-y-4 animate-fade-up max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-lg text-gradient-gold">أدمن الألعاب</h2>
          <button onClick={onClose} className="px-3 py-1 rounded-full bg-secondary text-sm font-bold">إغلاق ✕</button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-extrabold text-muted-foreground">رابط ملف الألعاب (JSON على السيرفر)</label>
          <input dir="ltr" value={url} onChange={e => setUrl(e.target.value)}
            className="w-full p-2.5 rounded-xl bg-secondary border border-border text-xs font-bold" />
          <div className="flex gap-2">
            <button onClick={saveUrl} className="btn-gold flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1"><Save className="w-4 h-4" /> حفظ الرابط</button>
            <button onClick={refresh} disabled={busy} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-secondary border border-border flex items-center justify-center gap-1"><RefreshCw className="w-4 h-4" /> تحديث الآن</button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold text-muted-foreground flex items-center gap-1"><Mic className="w-3.5 h-3.5" /> حالة التلاوات (١ → ١١٤)</label>
            <button onClick={checkAudio} disabled={checkingAudio} className="text-xs font-bold text-accent flex items-center gap-1"><RefreshCw className={`w-3.5 h-3.5 ${checkingAudio ? "animate-spin" : ""}`} /> {checkingAudio ? "جارٍ الفحص..." : "فحص السيرفر"}</button>
          </div>
          {Object.keys(audioStatus).length > 0 && (
            <>
              <div className="grid grid-cols-12 gap-1">
                {Array.from({ length: 114 }, (_, i) => i + 1).map(n => {
                  const st = audioStatus[n];
                  return (
                    <span key={n} title={`سورة رقم ${n}: ${st === undefined ? "لم يُفحص" : st ? "موجود ✓" : "ناقص ✗"}`}
                      className={`text-[10px] font-extrabold text-center rounded-md py-1 border ${
                        st === undefined ? "bg-secondary border-border text-muted-foreground"
                        : st ? "bg-success/15 border-success/40 text-success"
                        : "bg-destructive/15 border-destructive/40 text-destructive"}`}>
                      {n}
                    </span>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                <span className="text-success font-bold">أخضر ✓ موجود</span> — <span className="text-destructive font-bold">أحمر ✗ ناقص</span> — ارفع الناقص بالسكربت <b>tools\رفع-التلاوات.cmd</b> ثم أعد الفحص.
              </p>
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold text-muted-foreground">الألعاب البعيدة ({list.length})</label>
            <button onClick={downloadAll} disabled={busy} className="text-xs font-bold text-accent flex items-center gap-1"><Download className="w-3.5 h-3.5" /> تحميل الكل للجهاز</button>
          </div>
          {list.length === 0 && <p className="text-xs text-muted-foreground p-3 bg-secondary rounded-xl">لا توجد ألعاب بعد — تأكد من الرابط واضغط تحديث.</p>}
          {list.map(g => {
            const isHidden = hidden.includes(g.id);
            return (
              <div key={g.id} className="flex items-center justify-between p-2.5 rounded-xl bg-secondary border border-border">
                <span className="font-bold text-sm">{g.title} <span className="text-muted-foreground text-xs">({g.cost ?? 20} ⭐)</span></span>
                <button onClick={() => { isHidden ? showRemoteGame(g.id) : hideRemoteGame(g.id); setHidden(getHiddenRemoteIds()); }}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 ${isHidden ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
                  {isHidden ? <><Eye className="w-3.5 h-3.5" /> مخفية — إظهار</> : <><EyeOff className="w-3.5 h-3.5" /> ظاهرة — إخفاء</>}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">تُحمَّل أكواد الألعاب تلقائياً للجهاز في الخلفية عند فتح ركن الأطفال والاتصال متوفر، فتعمل لاحقاً دون إنترنت.</p>
      </div>
    </div>
    </ModalLayer>
  );
}
