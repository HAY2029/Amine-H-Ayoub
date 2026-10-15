import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getSurahAudioUrl } from '../data/audioUrls';

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
    
    const fetchAvailableAudio = async () => {
      try {
        const res = await fetch("https://archive.org/metadata/quran-audio-files-for-kids");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        const available = new Set<number>();
        if (data && data.files) {
          data.files.forEach((item: any) => {
            if (item.name && item.name.endsWith('.mp3')) {
              const num = parseInt(item.name.replace('.mp3', ''), 10);
              if (!isNaN(num)) available.add(num);
            }
          });
        }
        
        if (isMounted) {
          setAvailableSurahs(available);
        }
      } catch (err) {
        console.error("Failed to load available audio from cloud:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchAvailableAudio();
    
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

