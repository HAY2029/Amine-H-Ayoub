/**
 * 🎵 مؤثرات صوتية تفاعلية للألعاب بتقنية Web Audio API الخالصة
 * حجم الملف = 0 بايت (لا توجد ملفات MP3 مضمّنة في التطبيق)
 * تعمل بدون إنترنت وبأداء فوري فائق السرعة وبنغمات لطيفة للأطفال.
 */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedCtx || sharedCtx.state === "closed") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        sharedCtx = new AudioCtx();
      }
    }
    if (sharedCtx && sharedCtx.state === "suspended") {
      void sharedCtx.resume();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

/**
 * نقرة خفيفة عند قلب البطاقة أو لمس العنصر
 */
export function playCardFlipSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = "sine";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  } catch {
    /* ignore */
  }
}

/**
 * نغمة إجابة صحيحة / تطابق بطاقتين (أوتار مبهجة تصاعدية C5 - E5 - G5 - C6)
 */
export function playMatchSuccessSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = now + idx * 0.07;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.2, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.25);
    });
  } catch {
    /* ignore */
  }
}

/**
 * نغمة محاولة خاطئة لطيفة ومحفّزة (ليست منفرة للطفل)
 */
export function playMismatchSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = [330, 277]; // E4, C#4

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = now + idx * 0.1;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.12, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.16);
    });
  } catch {
    /* ignore */
  }
}

/**
 * رنين النجمة والمكافأة (رنين كريستالي متلألئ)
 */
export function playStarCollectSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.15); // E6

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    /* ignore */
  }
}

/**
 * احتفال الفوز باللعبة (فانفار مبهج بالنغمات الذهبية)
 */
export function playVictoryFanfareSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // C5, E5, G5, C6 (سريع) ثم G5 ثم C6 ممتد
    const chord = [
      { f: 523.25, t: 0, d: 0.15 },
      { f: 659.25, t: 0.12, d: 0.15 },
      { f: 783.99, t: 0.24, d: 0.2 },
      { f: 1046.5, t: 0.38, d: 0.6 },
    ];

    chord.forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + t;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, start);

      gain.gain.setValueAtTime(0.28, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + d);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + d);
    });
  } catch {
    /* ignore */
  }
}

/**
 * صوت تصاعدي متتالي يزداد حماساً حسب رقم السلسلة (Combo Streak)
 */
export function playComboStreakSfx(streak: number) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const baseFreq = 440; // A4
    // كل سلسلة ترفع النغمة نصف درجة حتى 12
    const semitones = Math.min(streak, 12);
    const freq = baseFreq * Math.pow(2, semitones / 12);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.12);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    /* ignore */
  }
}
