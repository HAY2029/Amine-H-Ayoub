import { useAudioContext } from "./contexts/audioContext";
import CustomPlayer from "./components/CustomPlayer";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function GlobalPlayerWrapper() {
  const { 
    currentTrack, 
    setCurrentTrack, 
    globalAudioRef, 
    autoNext, 
    setAutoNext, 
    playNext, 
    playPrev 
  } = useAudioContext();

  const location = useLocation();

  useEffect(() => {
    // إخفاء المشغل وإيقاف الصوت تلقائياً عند الدخول لأي صفحة أخرى (مثل الألعاب أو الإعدادات)
    const allowedPaths = ["/audio", "/"];
    if (!allowedPaths.includes(location.pathname) && currentTrack) {
      setCurrentTrack(null);
    }
  }, [location.pathname, currentTrack, setCurrentTrack]);

  if (!currentTrack) return null;

  return (
    <CustomPlayer
      // Note: we can't easily pass a ref to a forwardRef component directly from context,
      // but CustomPlayer exposes its handle. We need to pass the *actual HTML element*.
      // We will modify CustomPlayer to accept an audioRef prop or we can just let CustomPlayer 
      // set the globalAudioRef itself. We'll modify CustomPlayer to do this.
      surahName={currentTrack.surahName}
      surahNumber={currentTrack.surahNumber}
      audioSrc={currentTrack.audioSrc}
      isCustom={currentTrack.isCustom}
      initialTime={currentTrack.initialTime}
      mode={currentTrack.source} // We need to add this prop to CustomPlayer
      onClose={() => {
        try {
          localStorage.removeItem("audio:lastSurah");
          localStorage.removeItem("audio:lastTime");
        } catch { /* ignore */ }
        setCurrentTrack(null);
      }}
      autoNext={autoNext}
      onToggleAutoNext={() => setAutoNext(!autoNext)}
      onPlayNext={playNext}
      onPlayPrev={playPrev}
    />
  );
}
