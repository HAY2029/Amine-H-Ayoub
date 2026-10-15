import { useState } from "react";
import { X, Smartphone, Monitor, Apple, Download, CheckCircle2, Sparkles, ExternalLink } from "lucide-react";
import { openExternalUrl } from "../utils/tauriUtils";

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RELEASE_BASE = "https://github.com/HAY2023/Amine-H-Ayoub/releases/download/v1.0.0";
const RELEASE_VERSION = "1.0.0";

export const DOWNLOAD_PACKAGES = [
  {
    id: "android",
    name: "طھط·ط¨ظٹظ‚ ط£ظ†ط¯ط±ظˆظٹط¯ ظ„ظ„ظ‡ظˆط§طھظپ (APK)",
    platform: "Android Phone & Tablet",
    desc: "ظ…ظ„ظپ طھط«ط¨ظٹطھ APK ظ…ط¨ط§ط´ط± ظ„ط¬ظ…ظٹط¹ ظ‡ظˆط§طھظپ ط£ظ†ط¯ط±ظˆظٹط¯ (ط³ط§ظ…ط³ظˆظ†ط¬طŒ ط´ط§ظˆظ…ظٹطŒ ظ‡ظˆط§ظˆظٹ...)",
    version: "1.0.0",
    size: "45 MB",
    icon: <Smartphone className="w-7 h-7 text-emerald-400" />,
    color: "from-emerald-600/30 to-emerald-950/40 border-emerald-500/40 hover:border-emerald-400",
    btnColor: "bg-emerald-600 hover:bg-emerald-500 text-white",
    url: `${RELEASE_BASE}/Quran_1.0.0_Android_Mobile.apk`,
    isDirect: true,
  },
  {
    id: "android-aab",
    name: "ط­ط²ظ…ط© ط£ظ†ط¯ط±ظˆظٹط¯ ظ„ظ„ظ…طھط¬ط± (AAB)",
    platform: "Google Play - Android Mobile",
    desc: "ط­ط²ظ…ط© Google Play ط§ظ„ط±ط³ظ…ظٹط© ظ„ظ‡ظˆط§طھظپ ط£ظ†ط¯ط±ظˆظٹط¯",
    version: RELEASE_VERSION,
    size: "AAB",
    icon: <Smartphone className="w-7 h-7 text-emerald-400" />,
    color: "from-teal-600/30 to-teal-950/40 border-teal-500/40 hover:border-teal-400",
    btnColor: "bg-teal-600 hover:bg-teal-500 text-white",
    url: `${RELEASE_BASE}/Quran_${RELEASE_VERSION}_Android_Mobile.aab`,
    isDirect: true,
  },
  {
    id: "windows",
    name: "ط¨ط±ظ†ط§ظ…ط¬ ظˆظٹظ†ط¯ظˆط² ظ„ظ„ظƒظ…ط¨ظٹظˆطھط± (EXE)",
    platform: "Windows 10 / 11",
    desc: "ط¨ط±ظ†ط§ظ…ط¬ ط³ط·ط­ ط§ظ„ظ…ظƒطھط¨ ط§ظ„ظ…ط³طھظ‚ظ„ ط®ظپظٹظپ ظˆط³ط±ظٹط¹ ظٹط¹ظ…ظ„ ط¯ظˆظ† ط§طھطµط§ظ„ ط¨ط§ظ„ط¥ظ†طھط±ظ†طھ",
    version: "1.0.0",
    size: "75 MB",
    icon: <Monitor className="w-7 h-7 text-blue-400" />,
    color: "from-blue-600/30 to-blue-950/40 border-blue-500/40 hover:border-blue-400",
    btnColor: "bg-blue-600 hover:bg-blue-500 text-white",
    url: `${RELEASE_BASE}/Quran-Amine-H-Ayoub_${RELEASE_VERSION}_Setup.exe`,
    isDirect: true,
  },
  {
    id: "windows-msi",
    name: "ط¨ط±ظ†ط§ظ…ط¬ ظˆظٹظ†ط¯ظˆط² ظ„ظ„ظ…طھط¬ط± (MSI)",
    platform: "Microsoft Store - Windows 10 / 11",
    desc: "ط­ط²ظ…ط© MSI ظ„طھط«ط¨ظٹطھ ط§ظ„طھط·ط¨ظٹظ‚ ط¹ظ„ظ‰ ط£ط¬ظ‡ط²ط© ظˆظٹظ†ط¯ظˆط²",
    version: RELEASE_VERSION,
    size: "MSI",
    icon: <Monitor className="w-7 h-7 text-cyan-400" />,
    color: "from-cyan-600/30 to-cyan-950/40 border-cyan-500/40 hover:border-cyan-400",
    btnColor: "bg-cyan-600 hover:bg-cyan-500 text-white",
    url: `${RELEASE_BASE}/Quran-Amine-H-Ayoub_${RELEASE_VERSION}_Microsoft_Store.msi`,
    isDirect: true,
  },
  {
    id: "ios",
    name: "طھط«ط¨ظٹطھ ط¹ظ„ظ‰ ط¢ظٹظپظˆظ† ظˆط¢ظٹط¨ط§ط¯ (PWA)",
    platform: "iOS / Safari",
    desc: "ط£ط¶ظپ ط§ظ„ظ…ظˆظ‚ط¹ ط¥ظ„ظ‰ ط´ط§ط´طھظƒ ط§ظ„ط±ط¦ظٹط³ظٹط© ظ…ظ† ط²ط± ط§ظ„ظ…ط´ط§ط±ظƒط© (Share âژک â‍” Add to Home Screen)",
    version: "1.0.0",
    size: "ظپظˆط±ظٹ",
    icon: <Apple className="w-7 h-7 text-amber-300" />,
    color: "from-amber-600/20 to-amber-950/40 border-amber-500/40 hover:border-amber-400",
    btnColor: "bg-amber-600 hover:bg-amber-500 text-white",
    url: "https://amine-h-ayoub.vercel.app/",
    isDirect: false,
  }
];

export default function DownloadModal({ isOpen, onClose }: DownloadModalProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownload = async (pkg: typeof DOWNLOAD_PACKAGES[0]) => {
    if (pkg.isDirect) {
      setDownloadingId(pkg.id);
      setTimeout(() => setDownloadingId(null), 3000);
      await openExternalUrl(pkg.url);
    } else {
      await openExternalUrl(pkg.url);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" dir="rtl">
      <div className="relative w-full max-w-2xl bg-card border-2 border-gold/40 rounded-3xl p-6 md:p-8 shadow-[0_0_50px_rgba(212,175,55,0.25)] overflow-hidden max-h-[90vh] flex flex-col">
        {/* Background glow */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-gold/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-accent/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gold/15 border border-gold/40 flex items-center justify-center text-gold shadow-md">
              <Download className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl md:text-2xl font-bold text-gold">طھط­ظ…ظٹظ„ طھط·ط¨ظٹظ‚ طھظ„ط§ظˆط§طھ ط§ظ„ظ‚ط±ط¢ظ†</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-gold/20 text-gold border border-gold/30 font-mono font-bold">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                ط§ظ„ظ‚ط§ط±ط¦ ط§ظ„ط´ظٹط® ط­ط§ط¬ ط£ظٹظˆط¨ ط£ظ…ظٹظ† â€” ط§ظ„ظ…طµط­ظپ ط§ظ„ظ…ط±طھظ„ ط¨ط±ظˆط§ظٹط© ظˆط±ط´
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
            title="ط¥ط؛ظ„ط§ظ‚"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Packages List */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3.5 pr-1">
          {DOWNLOAD_PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={`p-4 rounded-2xl bg-gradient-to-r ${pkg.color} border transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}
            >
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                <div className="p-3 rounded-2xl bg-background/60 border border-white/10 shrink-0">
                  {pkg.icon}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-foreground text-sm md:text-base leading-tight">
                      {pkg.name}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-background/70 text-muted-foreground border border-border/40 font-mono">
                      {pkg.size}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {pkg.desc}
                  </p>
                </div>
              </div>

              <div className="w-full sm:w-auto shrink-0">
                <button
                  onClick={() => handleDownload(pkg)}
                  className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 ${pkg.btnColor}`}
                >
                  {downloadingId === pkg.id ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      <span>ط¬ط§ط±ظٹ ط¨ط¯ط، ط§ظ„طھط­ظ…ظٹظ„...</span>
                    </>
                  ) : (
                    <>
                      {pkg.isDirect ? <Download className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
                      <span>{pkg.isDirect ? "طھط­ظ…ظٹظ„ ط§ظ„ط¢ظ†" : "ظپطھط­ ط§ظ„ظ…ظˆظ‚ط¹"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
          <span className="flex items-center gap-1.5 text-gold font-medium">
            <Sparkles className="w-4 h-4" />
            ط¬ظ…ظٹط¹ ط§ظ„ظ†ط³ط® ظ…ط¬ط§ظ†ظٹط© 100% ظˆطھط¹ظ…ظ„ ط¯ظˆظ† ط¥ظ†طھط±ظ†طھ
          </span>
          <span className="font-mono">ط§ظ„ط¥طµط¯ط§ط±: 1.0.0</span>
        </div>
      </div>
    </div>
  );
}
