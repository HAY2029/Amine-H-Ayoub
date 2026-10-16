import React, { useState, useEffect } from "react";
import { fetchHuggingFaceImages, HFImage, getHFToken, setHFToken } from "../services/huggingFaceService";
import { syncImageOrderFromServer, saveImageOrder } from "../services/imageOrderService";
import { ArrowUp, ArrowDown, Save, RefreshCw, Key } from "lucide-react";
import { toast } from "sonner";

export default function ImageManager() {
  const [images, setImages] = useState<HFImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tokenInput, setTokenInput] = useState(() => getHFToken() || "");
  const [showTokenInput, setShowTokenInput] = useState(false);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    setLoading(true);
    try {
      const [hfImages, order] = await Promise.all([
        fetchHuggingFaceImages(), // تُرجع الآن: HF + Supabase + المحلي مدموجة مع source
        syncImageOrderFromServer()
      ]);

      let finalImages = [...hfImages];

      // إذا كان هناك ترتيب محفوظ مسبقاً، رتّب الصور بناءً عليه
      if (order && order.length > 0) {
        const orderedMap = new Map<string, HFImage>();
        const unordered: HFImage[] = [];
        
        finalImages.forEach(img => {
          if (order.includes(img.name)) {
            orderedMap.set(img.name, img);
          } else {
            unordered.push(img);
          }
        });

        const sortedImages: HFImage[] = [];
        order.forEach(name => {
          const img = orderedMap.get(name);
          if (img) sortedImages.push(img);
        });

        finalImages = [...sortedImages, ...unordered];
      }

      setImages(finalImages);
      const bySource = {
        huggingface: finalImages.filter(i => i.source === "huggingface").length,
        supabase: finalImages.filter(i => i.source === "supabase").length,
        local: finalImages.filter(i => !i.source || i.source === "local").length,
      };
      if (finalImages.length > 0) {
        toast.success(`تم تحميل ${finalImages.length} صورة (HF: ${bySource.huggingface} · سيرفر: ${bySource.supabase} · محلي: ${bySource.local})`);
      }
      if (finalImages.length === 0) {
        const { diagnoseImageSources } = await import("../services/huggingFaceService");
        const d = await diagnoseImageSources().catch(() => null);
        const hint = d
          ? `التشخيص: مستودع ${d.hfRepo} → API=${d.hfApiStatus} · توكن=${d.hfTokenPresent ? "موجود" : "مفقود"} · HF=${d.hf} · سيرفر=${d.supabase} · محلي=${d.local}`
          : "تعذّر التشخيص";
        toast.error(`لا توجد صور. ${hint}`, { duration: 8000 });
        setShowTokenInput(true);
      } else if (!getHFToken()) {
        // صور ظاهرة لكن بلا توكن → ذكّر بإضافة التوكن لرؤية صور HF الخاصة أيضاً
        const { diagnoseImageSources } = await import("../services/huggingFaceService");
        const d = await diagnoseImageSources().catch(() => null);
        if (d && (d.hfApiStatus === 401 || d.hfApiStatus === 403) && d.hf === 0) {
          toast.info("ملاحظة: مستودع HuggingFace خاص — أدخل التوكن لرؤية صوره أيضاً", { duration: 6000 });
          setShowTokenInput(true);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("فشل في تحميل الصور");
      if (!getHFToken()) setShowTokenInput(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToken = () => {
    setHFToken(tokenInput);
    setShowTokenInput(false);
    loadImages();
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newImages = [...images];
    const temp = newImages[index];
    newImages[index] = newImages[index - 1];
    newImages[index - 1] = temp;
    setImages(newImages);
  };

  const moveDown = (index: number) => {
    if (index === images.length - 1) return;
    const newImages = [...images];
    const temp = newImages[index];
    newImages[index] = newImages[index + 1];
    newImages[index + 1] = temp;
    setImages(newImages);
  };

  const saveOrder = async () => {
    setSaving(true);
    try {
      const order = images.map(img => img.name);
      await saveImageOrder(order);
      toast.success("تم حفظ الترتيب بنجاح");
    } catch (err) {
      toast.error("فشل في حفظ الترتيب");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-black text-white">
        <RefreshCw className="animate-spin w-10 h-10 text-gold-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 pb-24">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8 bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl">
          <div>
            <h1 className="text-2xl font-bold text-gold-400 font-amiri mb-2">مدير ترتيب الصور</h1>
            <p className="text-gray-400 text-sm">استخدم الأزرار لتغيير ترتيب ظهور الصفحات في الموقع</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTokenInput(!showTokenInput)}
              className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors text-gray-300"
              title="إعدادات الرمز (Token)"
            >
              <Key className="w-5 h-5" />
            </button>
            <button
              onClick={saveOrder}
              disabled={saving}
              className="bg-gold-500 hover:bg-gold-400 text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all"
            >
              {saving ? <RefreshCw className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
              {saving ? "جاري الحفظ..." : "حفظ الترتيب"}
            </button>
          </div>
        </div>

        {showTokenInput && (
          <div className="mb-8 bg-gray-900/80 p-6 rounded-2xl border border-gold-500/30">
            <h2 className="text-lg font-bold text-gold-300 mb-2">رمز الوصول (HuggingFace Token)</h2>
            <p className="text-sm text-gray-400 mb-4">
              إذا كان مستودعك خاصاً، يرجى إدخال Access Token الخاص بك للتمكن من قراءة الصور.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="hf_..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 focus:outline-none focus:border-gold-500 text-left"
                dir="ltr"
              />
              <button
                onClick={handleSaveToken}
                className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-xl font-bold transition-colors"
              >
                حفظ وإعادة تحميل
              </button>
            </div>
            <button
              onClick={async () => {
                const { clearHFImagesCache } = await import("../services/huggingFaceService");
                clearHFImagesCache();
                loadImages();
              }}
              className="mt-3 w-full bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 text-gold-300 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> تحديث قائمة الصور من السيرفر
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {images.map((img, idx) => (
            <div key={img.name} className="flex items-center justify-between bg-gray-900/50 p-4 rounded-xl border border-gray-800/50 hover:border-gold-500/30 transition-all">
              <div className="flex items-center gap-4">
                <span className="text-gray-500 font-mono w-8 text-center">{idx + 1}</span>
                <img src={img.url} alt={img.name} className="w-16 h-24 object-cover rounded-md border border-gray-700" loading="lazy" />
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-medium" dir="ltr">{img.name}</span>
                  <span className={`text-[11px] font-bold w-fit px-2 py-0.5 rounded-full ${img.source === "huggingface" ? "bg-amber-500/15 text-amber-300" : img.source === "supabase" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300"}`}>
                    {img.source === "huggingface" ? "☁️ سيرفر HuggingFace" : img.source === "supabase" ? "🗄️ سيرفر التطبيق" : "📁 محلي"}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp className="w-5 h-5 text-gray-300" />
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === images.length - 1}
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDown className="w-5 h-5 text-gray-300" />
                </button>
              </div>
            </div>
          ))}
          {images.length === 0 && (
            <div className="text-center p-12 text-gray-500 bg-gray-900/50 rounded-2xl border border-gray-800/50">
              لا توجد صور. تأكد من إعداد مستودع Hugging Face بشكل صحيح.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
