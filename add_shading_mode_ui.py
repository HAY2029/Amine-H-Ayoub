lines = open(r'h:\Amine-H-Ayoub\src\pages\MushafShadingPage.tsx', 'r', encoding='utf-8').readlines()

# Find the line with "نوع الصوت:" and add shading mode interface after it
# Looking for line 325 which has "نوع الصوت:"

# Find where the speaker buttons section ends (after the speaker type buttons)
# Add shading mode UI after the speaker type section

speaker_section_end = None
for i, line in enumerate(lines):
    if 'bg-purple-500' in line and 'كلا' in line:
        speaker_section_end = i
        break

if speaker_section_end:
    # Add shading mode interface after the speaker buttons
    shading_ui = '''
            {/* وضع التظليل - فصل الفاتحة عن آخر سورة */}
            <div className="mb-4 border-t border-white/10 pt-4">
              <label className="block text-xs font-bold text-stone-400 mb-2">وضع التظليل</label>
              <div className="flex gap-2">
                {[
                  ["fatiha", "سورة الفاتحة فقط", "bg-amber-500"],
                  ["last", "آخر سورة فقط", "bg-emerald-500"],
                  ["both", "كليهما معاً", "bg-violet-500"]
                ] as [string, string, string][]}.map(([value, label, color]) => (
                  <button
                    key={value}
                    onClick={() => setShadingMode(value as "fatiha" | "last" | "both")}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${shadingMode === value ? \`bg-${color.split('-')[1]}-500 text-white\` : 'bg-white/5 text-stone-400 hover:bg-white/10'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-stone-500">
                {shadingMode === "fatiha" ? "سيتم تظليل سورة الفاتحة فقط (الآية 1-7)" : shadingMode === "last" ? "سيتم تظليل آخر سورة فقط" : "سيتم تظليل كل من الفاتحة وآخر سورة بشكل منفصل"}
              </div>
            </div>

'''
    lines.insert(speaker_section_end + 1, shading_ui)
    open(r'h:\Amine-H-Ayoub\src\pages\MushafShadingPage.tsx', 'w', encoding='utf-8').writelines(lines)
    print('Added shading mode UI')
else:
    print('Could not find speaker section end')