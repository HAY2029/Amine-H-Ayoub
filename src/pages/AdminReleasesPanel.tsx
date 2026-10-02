import React, { useState, useEffect, useCallback } from "react";
import { supabase, hasValidSupabaseKey } from "@/lib/supabase";

// ════════════════════════════════════════════════════════════════
// لوحة تحكم الإصدارات — Admin Releases Panel
// تتواصل مع GitHub API حصرياً عبر Supabase Edge Function
// لا يوجد أي توكن GitHub في هذا الملف
// ════════════════════════════════════════════════════════════════

interface Release {
  version: string;
  date: string;
  url: string;
  size: string;
  changelog: string[];
  active: boolean;
}

interface PlatformData {
  latest_version: string;
  active: boolean;
  min_supported_version: string;
  force_update: boolean;
  rollout_percentage: number;
  releases: Release[];
}

interface ReleasesData {
  site_settings: {
    site_title: string;
    auto_detect_platform: boolean;
    show_qr_for_mobile: boolean;
    maintenance_mode: boolean;
  };
  platforms: {
    windows?: PlatformData;
    macos?: PlatformData;
    android?: PlatformData;
    android_aab?: PlatformData;
    ios?: PlatformData;
    linux?: PlatformData;
  };
}

const PLATFORM_LABELS: Record<string, { name: string; icon: string }> = {
  windows: { name: "Windows (EXE)", icon: "💻" },
  android: { name: "Android (APK)", icon: "📱" },
  android_aab: { name: "Google Play Bundle (AAB)", icon: "📦" },
  ios: { name: "iOS (iPhone/iPad IPA)", icon: "🍏" },
  macos: { name: "macOS (DMG)", icon: "🍎" },
  linux: { name: "Linux (AppImage)", icon: "🐧" },
};

export default function AdminReleasesPanel() {
  const [data, setData] = useState<ReleasesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // جلب البيانات من الـ Edge Function
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!hasValidSupabaseKey()) {
        throw new Error("Supabase غير مُهيّأ. أضف المفاتيح في ملف .env");
      }
      const { data: result, error: fnError } = await supabase.functions.invoke(
        "update-releases",
        { body: { action: "get" } }
      );
      if (fnError) throw fnError;
      setData(typeof result === "string" ? JSON.parse(result) : result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "فشل جلب البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // حفظ التعديلات عبر الـ Edge Function
  const saveData = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: fnError } = await supabase.functions.invoke(
        "update-releases",
        {
          body: {
            action: "update",
            releases_data: data,
            commit_message: `chore: admin panel update at ${new Date().toISOString()}`,
          },
        }
      );
      if (fnError) throw fnError;
      setSuccess("تم الحفظ بنجاح ✅");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  // ── دوال التعديل ──

  const toggleSiteField = (field: keyof ReleasesData["site_settings"]) => {
    if (!data) return;
    setData({
      ...data,
      site_settings: {
        ...data.site_settings,
        [field]: !data.site_settings[field],
      },
    });
  };

  const updatePlatformField = (
    platform: string,
    field: string,
    value: string | number | boolean | unknown
  ) => {
    if (!data) return;
    setData({
      ...data,
      platforms: {
        ...data.platforms,
        [platform]: {
          ...data.platforms[platform as keyof typeof data.platforms],
          [field]: value,
        },
      },
    });
  };

  const toggleReleaseActive = (platform: string, index: number) => {
    if (!data) return;
    const p = data.platforms[platform as keyof typeof data.platforms];
    const updated = [...p.releases];
    updated[index] = { ...updated[index], active: !updated[index].active };
    updatePlatformField(platform, "releases", updated);
  };

  // ── واجهة المستخدم ──

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-2xl mx-auto p-6 mt-10">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-red-800 font-bold text-xl mb-2">خطأ</h2>
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-4xl mx-auto p-4 pb-20" dir="rtl">
      {/* ── الرأس ── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">⚙️ لوحة تحكم الإصدارات</h1>
        <button
          onClick={saveData}
          disabled={saving}
          className="px-6 py-2 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-50 transition-all"
        >
          {saving ? "جاري الحفظ..." : "💾 حفظ التعديلات"}
        </button>
      </div>

      {/* ── رسائل النجاح والخطأ ── */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 text-emerald-700 text-center">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-center">
          {error}
        </div>
      )}

      {/* ── إعدادات الموقع العامة ── */}
      <section className="bg-white rounded-2xl border p-6 mb-6 shadow-sm">
        <h2 className="font-bold text-lg mb-4">🌐 إعدادات الموقع</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ToggleRow
            label="وضع الصيانة"
            description="يمنع أي تحميل ويعرض رسالة صيانة فقط"
            checked={data.site_settings.maintenance_mode}
            onChange={() => toggleSiteField("maintenance_mode")}
            danger
          />
          <ToggleRow
            label="اكتشاف المنصة تلقائياً"
            checked={data.site_settings.auto_detect_platform}
            onChange={() => toggleSiteField("auto_detect_platform")}
          />
          <ToggleRow
            label="عرض QR للموبايل"
            checked={data.site_settings.show_qr_for_mobile}
            onChange={() => toggleSiteField("show_qr_for_mobile")}
          />
        </div>
      </section>

      {/* ── لوحة كل منصة ── */}
      {Object.entries(data.platforms).map(([key, platform]) => {
        const info = PLATFORM_LABELS[key];
        return (
          <section
            key={key}
            className="bg-white rounded-2xl border p-6 mb-6 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">
                {info.icon} {info.name}
              </h2>
              <ToggleRow
                label="المنصة مفعّلة"
                checked={platform.active}
                onChange={() =>
                  updatePlatformField(key, "active", !platform.active)
                }
                inline
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <ToggleRow
                label="تحديث إجباري"
                checked={platform.force_update}
                onChange={() =>
                  updatePlatformField(
                    key,
                    "force_update",
                    !platform.force_update
                  )
                }
              />

              <div>
                <label className="text-sm font-medium text-gray-700">
                  الحد الأدنى المدعوم
                </label>
                <input
                  type="text"
                  value={platform.min_supported_version}
                  onChange={(e) =>
                    updatePlatformField(
                      key,
                      "min_supported_version",
                      e.target.value
                    )
                  }
                  placeholder="مثال: v1.0.0"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  أحدث إصدار (latest_version)
                </label>
                <input
                  type="text"
                  value={platform.latest_version}
                  onChange={(e) =>
                    updatePlatformField(key, "latest_version", e.target.value)
                  }
                  placeholder="مثال: v1.2.0"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  نسبة التوزيع التدريجي: {platform.rollout_percentage}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={platform.rollout_percentage}
                  onChange={(e) =>
                    updatePlatformField(
                      key,
                      "rollout_percentage",
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="mt-1 block w-full accent-emerald-500"
                />
              </div>
            </div>

            {/* ── قائمة الإصدارات ── */}
            {platform.releases.length > 0 ? (
              <div className="border-t pt-4">
                <h3 className="text-sm font-bold text-gray-500 mb-2">
                  الإصدارات ({platform.releases.length})
                </h3>
                <div className="space-y-2">
                  {platform.releases.map((rel, idx) => (
                    <div
                      key={rel.version}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        rel.active
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div>
                        <span className="font-mono font-bold text-sm">
                          {rel.version}
                        </span>
                        <span className="text-xs text-gray-500 mr-2">
                          {rel.date}
                        </span>
                        {rel.active && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            مفعّل
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => toggleReleaseActive(key, idx)}
                        className={`text-sm px-3 py-1 rounded-lg font-medium transition-all ${
                          rel.active
                            ? "bg-red-100 text-red-700 hover:bg-red-200"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        }`}
                      >
                        {rel.active ? "تعطيل" : "تفعيل"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4 border-t">
                لا توجد إصدارات بعد. ستظهر هنا بعد أول عملية بناء ناجحة.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── مكوّن Toggle مساعد ──
function ToggleRow({
  label,
  description,
  checked,
  onChange,
  danger = false,
  inline = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  danger?: boolean;
  inline?: boolean;
}) {
  return (
    <div
      className={`flex items-center ${
        inline ? "gap-2" : "justify-between gap-4"
      }`}
    >
      <div>
        <span className={`text-sm font-medium ${danger ? "text-red-600" : ""}`}>
          {label}
        </span>
        {description && (
          <p className="text-xs text-gray-400">{description}</p>
        )}
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked
            ? danger
              ? "bg-red-500"
              : "bg-emerald-500"
            : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-1" : "translate-x-6"
          }`}
        />
      </button>
    </div>
  );
}
