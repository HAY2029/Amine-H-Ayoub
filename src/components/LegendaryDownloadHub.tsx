import { useState } from "react";
import { Apple, Smartphone, Monitor, Download } from "lucide-react";
import { openExternalUrl } from "../utils/tauriUtils";

export default function LegendaryDownloadHub() {
  const [isOpen, setIsOpen] = useState(true);

  const RELEASE_BASE = "https://github.com/HAY2023/Amine-H-Ayoub/releases/download/v1.0.0";

  const platforms = [
    { name: "iOS", icon: <Apple className="w-6 h-6" />, desc: "iPhone & iPad", url: "https://amine-h-ayoub.vercel.app/", color: "from-gray-700 to-gray-900" },
    { name: "Android", icon: <Smartphone className="w-6 h-6" />, desc: "هواتف أندرويد (APK)", url: `${RELEASE_BASE}/Quran_1.0.0_Android_Mobile.apk`, color: "from-emerald-500 to-emerald-700" },
    { name: "Android AAB", icon: <Smartphone className="w-6 h-6" />, desc: "حزمة Google Play للهاتف", url: `${RELEASE_BASE}/Quran_1.0.0_Android_Mobile.aab`, color: "from-teal-500 to-teal-700" },
    { name: "Windows", icon: <Monitor className="w-6 h-6" />, desc: "كمبيوتر ولابتوب (EXE)", url: `${RELEASE_BASE}/Quran-Amine-H-Ayoub_1.0.0_Setup.exe`, color: "from-blue-500 to-blue-700" },
    { name: "Windows MSI", icon: <Monitor className="w-6 h-6" />, desc: "حزمة Microsoft Store (MSI)", url: `${RELEASE_BASE}/Quran-Amine-H-Ayoub_1.0.0_Microsoft_Store.msi`, color: "from-cyan-500 to-cyan-700" },
  ];

  return (
    <div className="relative min-h-[85vh] flex flex-col items-center justify-center p-4 overflow-hidden bg-background">
      {/* Premium glowing background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-background z-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold/10 blur-[100px] rounded-full pointer-events-none z-0" />

      <div className="relative z-10 flex flex-col items-center gap-16 max-w-4xl mx-auto w-full pt-10">
        {/* Header Section */}
        <div className="text-center space-y-4 animate-fade-in">
          <h1 className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gold via-amber-200 to-gold drop-shadow-sm">
            المصحف المرتل برواية ورش
          </h1>
          <p className="text-2xl md:text-3xl text-foreground font-bold mt-2">
            القارئ حاج أيوب أمين
          </p>
          <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-gold/10 border border-gold/30 text-gold text-sm font-bold mt-6 shadow-lg shadow-gold/5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-gold"></span>
            </span>
            الإصدار الجديد 1.0.0 متاح الآن للتحميل المباشر
          </div>
        </div>

        {/* Circular Interactive Hub */}
        <div className="relative w-80 h-80 md:w-96 md:h-96 flex items-center justify-center mt-10">
          
          {/* Platforms orbit (appears when open) */}
          <div
            className={`absolute inset-0 transition-all duration-700 ease-out ${
              isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {platforms.map((platform, index) => {
              // Calculate positions for a perfect circle around the center
              const angle = (index * (360 / platforms.length)) * (Math.PI / 180);
              const radius = 160; // Distance from center
              
              const x = Math.sin(angle) * radius;
              const y = -Math.cos(angle) * radius;

              return (
                <a
                  key={platform.name}
                  href={platform.url}
                  onClick={(event) => { event.preventDefault(); void openExternalUrl(platform.url); }}
                  className={`absolute top-1/2 left-1/2 flex flex-col items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br ${platform.color} shadow-[0_10px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:scale-110 transition-all duration-300 border border-white/20 group backdrop-blur-md z-10 ${isOpen ? 'scale-100' : 'scale-50'}`}
                  style={{
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                    transitionDelay: isOpen ? `${index * 100}ms` : '0ms'
                  }}
                  title={`تحميل نسخة ${platform.name}`}
                >
                  <div className="text-white mb-1 group-hover:-translate-y-1 transition-transform duration-300">{platform.icon}</div>
                  <span className="text-white text-xs font-bold drop-shadow-md">{platform.name}</span>
                </a>
              );
            })}
          </div>

          {/* Central Reciter Image Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={`relative z-20 w-56 h-56 md:w-64 md:h-64 rounded-full overflow-hidden border-4 transition-all duration-700 ease-in-out shadow-2xl ${
              isOpen 
                ? "border-gold shadow-[0_0_60px_rgba(234,179,8,0.4)] scale-75" 
                : "border-gold/60 hover:border-gold hover:shadow-[0_0_40px_rgba(234,179,8,0.3)] hover:scale-105"
            }`}
          >
            <div className={`absolute inset-0 bg-black/40 transition-colors z-10 ${isOpen ? 'bg-black/0' : 'group-hover:bg-black/20'}`} />
            <img
              src="/my-photo.png"
              alt="القارئ حاج أيوب أمين"
              className="w-full h-full object-cover"
              style={{ objectPosition: "center top" }}
            />
            
            {/* Click overlay hint */}
            <div className={`absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px] transition-all duration-500 z-20 ${isOpen ? "opacity-0 scale-150" : "opacity-100 hover:opacity-0"}`}>
              <div className="w-16 h-16 rounded-full bg-gold/20 flex items-center justify-center mb-3 animate-pulse border border-gold/50">
                <Download className="w-8 h-8 text-gold" />
              </div>
              <span className="text-gold font-bold text-xl tracking-wide drop-shadow-lg">اضغط للتحميل</span>
            </div>
          </button>
        </div>

        {/* Action Call */}
        <div className={`transition-all duration-700 transform mt-8 ${isOpen ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}>
          <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-2xl p-6 text-center max-w-lg shadow-xl">
            <p className="text-foreground text-lg font-medium">
              اختر نسختك المفضلة وانطلق في رحلة إيمانية مباركة. 
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              التطبيق متوفر الآن على جميع المنصات بجودة عالية وبدون إنترنت.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
