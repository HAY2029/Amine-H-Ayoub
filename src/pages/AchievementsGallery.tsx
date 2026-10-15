import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, ImagePlus, ArrowRight, Trophy, Star, Loader2, Trash2 } from "lucide-react";
import { toast } from "../hooks/use-toast";
import {
  Achievement,
  getAchievementsMeta,
  addAchievementMeta,
  deleteAchievement,
  getAllAchievementImages,
  saveAchievementImageLocal,
  uploadAchievementToCloud
} from "../data/achievements";

export default function AchievementsGallery() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [imagesMap, setImagesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const meta = getAchievementsMeta();
      setAchievements(meta);
      const imgs = await getAllAchievementImages();
      setImagesMap(imgs);
    } catch (e) {
      console.error("Failed to load achievements", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCaptureClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      toast({ title: "خطأ", description: "الرجاء اختيار صورة (JPG أو PNG)", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      // 1. تحويل الصورة إلى Base64 للحفظ المحلي السريع
      const toBase64 = (f: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      const base64 = await toBase64(file);

      // 2. إنشاء معرّف فريد وتجهيز الإنجاز
      const id = `ach_${Date.now()}`;
      const newAchievement: Achievement = {
        id,
        date: new Date().toISOString(),
        title: "إنجاز جديد 🌟",
      };

      // 3. الحفظ المحلي فوراً
      await saveAchievementImageLocal(id, base64);
      const updatedMeta = addAchievementMeta(newAchievement);
      
      setAchievements(updatedMeta);
      setImagesMap(prev => ({ ...prev, [id]: base64 }));
      
      toast({ title: "رائع!", description: "تم حفظ الإنجاز بنجاح 🏆" });

      // 4. الرفع إلى السحابة في الخلفية
      uploadAchievementToCloud(file, id).then((res) => {
        if (!res.success && !res.localOnly) {
          console.warn("Cloud upload failed, but saved locally.");
        }
      });
      
    } catch (error) {
      console.error(error);
      toast({ title: "حدث خطأ", description: "لم نتمكن من حفظ الصورة", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الإنجاز؟")) {
      await deleteAchievement(id);
      setAchievements(prev => prev.filter(a => a.id !== id));
      setImagesMap(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      toast({ title: "تم الحذف", description: "تم حذف الإنجاز" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-foreground pb-20" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-border shadow-sm p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate("/games")}
              className="p-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-95 transition-all"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-foreground flex items-center gap-2">
                <Trophy className="w-6 h-6 text-amber-500" />
                معرض إنجازاتي
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 pt-8">
        
        {/* Upload Action */}
        <div className="mb-8">
          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={onFileSelected} 
          />
          <button 
            onClick={handleCaptureClick}
            disabled={uploading}
            className="w-full bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white shadow-lg p-6 rounded-3xl flex flex-col items-center justify-center gap-3 transition-all active:scale-95 border-4 border-white"
          >
            {uploading ? (
              <Loader2 className="w-12 h-12 animate-spin opacity-80" />
            ) : (
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <Camera className="w-8 h-8 text-white" />
              </div>
            )}
            <div className="text-center">
              <span className="block text-2xl font-black drop-shadow-sm">التقط صورة لإنجازك!</span>
              <span className="text-white/80 font-bold text-sm">احفظ لحظاتك الرائعة هنا 🌟</span>
            </div>
          </button>
        </div>

        {/* Gallery Grid */}
        {loading ? (
          <div className="flex justify-center p-12">
            <div className="step-loader sm" />
          </div>
        ) : achievements.length === 0 ? (
          <div className="text-center py-12 px-4 bg-white rounded-3xl border border-dashed border-border shadow-sm">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Star className="w-10 h-10 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">لا توجد إنجازات بعد</h3>
            <p className="text-muted-foreground">التقط صورتك الأولى لتزيّن معرضك!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {achievements.map((ach) => {
              const imgSrc = imagesMap[ach.id];
              const dateStr = new Date(ach.date).toLocaleDateString("ar-EG", { month: "short", day: "numeric" });
              return (
                <div key={ach.id} className="relative group bg-white rounded-2xl p-2 shadow-sm border border-border animate-fade-up overflow-hidden">
                  <div className="aspect-square rounded-xl bg-secondary overflow-hidden relative">
                    {imgSrc ? (
                      <img src={imgSrc} alt={ach.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                        <ImagePlus className="w-8 h-8 opacity-50" />
                      </div>
                    )}
                    {/* Delete button (shows on hover/always on mobile via touch) */}
                    <button 
                      onClick={() => handleDelete(ach.id)}
                      className="absolute top-2 left-2 w-8 h-8 bg-black/50 hover:bg-destructive/80 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="pt-3 pb-1 px-1 flex justify-between items-center">
                    <span className="font-bold text-foreground text-sm truncate">{ach.title}</span>
                    <span className="text-xs text-muted-foreground font-medium bg-secondary px-2 py-1 rounded-full">{dateStr}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
