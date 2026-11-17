import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getSurahAudioUrl, initCloudAudioAvailability, readCachedAvailableSurahs } from '../data/audioUrls';

interface CloudAudioContextType {
  availableSurahs: Set<number>;
  isLoading: boolean;
  hasCloudAudio: (number: number) => boolean;
  getAudioPath: (number: number) => string;
}

const CloudAudioContext = createContext<CloudAudioContextType | null>(null);

export function CloudAudioProvider({ children }: { children: ReactNode }) {
  const [availableSurahs, setAvailableSurahs] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // 1) من الذاكرة المحلية فوراً — بلا شبكة ولا انتظار، فيعمل الصوت بلا تأخير
    const cached = readCachedAvailableSurahs();
    if (cached.length > 0) {
      setAvailableSurahs(new Set(cached));
      setIsLoading(false);
    }

    // 2) تحميل/تحديث القائمة من الشبكة في الخلفية عبر الوعد المشترك مع main.tsx
    //    (نفس الطلب مرّة واحدة فقط بدل طلبين متوازيين حجمهما ~٢ ميجابايت)
    initCloudAudioAvailability()
      .then((available) => {
        if (isMounted && available.size > 0) setAvailableSurahs(new Set(available));
      })
      .catch((err) => {
        console.error("Failed to load available audio from cloud:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // التحقق من توفر الصوت على سيرفر التطبيق (Hugging Face) بالترقيم القياسي مباشرة
  const hasCloudAudio = (number: number) => availableSurahs.has(number);
  // مسار الصوت — دائماً من سيرفر التطبيق (Hugging Face) فقط، لا سيرفرات خارجية
  const getAudioPath = (number: number) => getSurahAudioUrl(number);

  return (
    <CloudAudioContext.Provider value={{ availableSurahs, isLoading, hasCloudAudio, getAudioPath }}>
      {children}
    </CloudAudioContext.Provider>
  );
}

export function useCloudAudio() {
  const context = useContext(CloudAudioContext);
  if (!context) {
    throw new Error('useCloudAudio must be used within a CloudAudioProvider');
  }
  return context;
}

