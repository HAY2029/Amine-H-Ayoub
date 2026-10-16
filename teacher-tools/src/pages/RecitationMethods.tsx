import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, ArrowLeft, Play, Pause, Volume2, StopCircle,
  Wand2, RotateCcw, Zap, Link2, Brain, BarChart3, AlertTriangle,
  CheckCircle2, Info, ImagePlus, ZoomIn, ZoomOut, X, Plus, Minus, Trash2, Scissors, UserPlus, Maximize,
  Undo2, Redo2, BookOpen, Mic, Baby
} from "lucide-react";
import { AYAH_COUNTS, getSavedTimings, saveSurahTimings, clearSavedSurahTimings, SurahTimings, AudioSegment } from "../data/ayahTimings";
import { getPageAyahBoxes, savePageAyahBoxes, getAllPageSources } from "../data/ayahCoordinates";
import { getCustomPages } from "../data/customPages";
import { getSurahAudioUrl, hasCloudAudio, getFallbackAudioUrl } from "../data/audioUrls";
import { getSurahName, getSurahAyahCount, getAllSurahs } from "../data/quranData";
import { toast } from "../hooks/use-toast";
import { loadProfiles, diarize, decodeAudioFromUrl, type SpeakerProfile } from "../ai/speakerRecognition";

/* ═══════════════════════════════════════════════════════════════════════ */

const audioPath = (n: number) => (hasCloudAudio(n) ? getSurahAudioUrl(n) : getFallbackAudioUrl(n));

// Fallback for backward compatibility
const SURAH_NAMES: Record<number, string> = getAllSurahs().reduce((acc, s) => {
  acc[s.number] = s.name;
  return acc;
}, {} as Record<number, string>);

/** صور المصحف الموجودة محلياً */
const SURAH_PAGE_IMAGES: Record<number, string> = {
  1: "/pages/fatiha.jpg",
  14: "/pages/600.jpg",
  13: "/pages/601.jpg", 12: "/pages/601.jpg", 11: "/pages/601.jpg",
  10: "/pages/602.jpg", 9: "/pages/602.jpg", 8: "/pages/602.jpg",
  7: "/pages/603.jpg", 6: "/pages/603.jpg", 5: "/pages/603.jpg",
  4: "/pages/604.jpg", 3: "/pages/604.jpg", 2: "/pages/604.jpg",
};

const fmt = (s: number) => {
  if (!isFinite(s)) return "0:00.000";
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(3).padStart(6, "0");
  return `${m}:${sec}`;
};

/* ═══════════════════════════════════════════════════════════════════════
   HYBRID SPLITTING ENGINE
   
   يجمع قوة الطريقة القديمة (كشف الصمت) مع الطريقة الجديدة 
   (Boundary Likelihood) للأماكن بدون صمت.
   
   المخطط:
   ① استخراج الميزات (Energy, ZCR, Spectral Flux, Pitch, Centroid)
   ② كشف الصمت بـ Schmitt Trigger → مناطق كلام أولية
   ③ حساب Boundary Likelihood داخل المناطق الطويلة
   ④ مطابقة العدد: دمج أصغر فواصل / فصل بـ Boundary Likelihood  
   ⑤ ضبط الحواف بـ Zero-Crossing
   ⑥ تحقق وتصحيح
   ═══════════════════════════════════════════════════════════════════════ */

function computeRMS(data: Float32Array, start: number, len: number): number {
  let sum = 0;
  const end = Math.min(start + len, data.length);
  const n = end - start;
  if (n <= 0) return 0;
  for (let i = start; i < end; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / n);
}

function computeZCR(data: Float32Array, start: number, len: number): number {
  let c = 0;
  const end = Math.min(start + len, data.length);
  for (let i = start + 1; i < end; i++) {
    if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) c++;
  }
  return c / Math.max(1, end - start);
}

function computeSpectralCentroid(data: Float32Array, start: number, len: number, sr: number): number {
  const end = Math.min(start + len, data.length);
  const n = end - start;
  if (n < 4) return 0;
  const nfft = Math.min(256, n);
  let wSum = 0, tMag = 0;
  for (let k = 1; k < nfft / 2; k++) {
    let re = 0, im = 0;
    for (let j = 0; j < nfft && start + j < end; j++) {
      const a = (2 * Math.PI * k * j) / nfft;
      re += data[start + j] * Math.cos(a);
      im -= data[start + j] * Math.sin(a);
    }
    const mag = Math.sqrt(re * re + im * im);
    wSum += (k * sr / nfft) * mag;
    tMag += mag;
  }
  return tMag > 0 ? wSum / tMag : 0;
}

function detectPitch(data: Float32Array, start: number, len: number, sr: number): number {
  const end = Math.min(start + len, data.length);
  const n = end - start;
  if (n < sr / 85) return 0;
  const minLag = Math.floor(sr / 500);
  const maxLag = Math.min(Math.floor(sr / 85), Math.floor(n / 2));
  let e0 = 0;
  for (let i = start; i < end; i++) e0 += data[i] * data[i];
  if (e0 < 1e-10) return 0;
  let bestC = -1, bestL = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0, e1 = 0;
    const ce = Math.min(end, start + n - lag);
    for (let i = start; i < ce; i++) { corr += data[i] * data[i + lag]; e1 += data[i + lag] * data[i + lag]; }
    const norm = corr / Math.sqrt(e0 * (e1 || 1e-10));
    if (norm > bestC) { bestC = norm; bestL = lag; }
  }
  return (bestC < 0.3 || bestL === 0) ? 0 : sr / bestL;
}

function findNearestZC(data: Float32Array, idx: number, radius: number): number {
  let best = idx, bestD = radius + 1;
  for (let i = Math.max(0, idx - radius); i < Math.min(data.length - 1, idx + radius); i++) {
    if ((data[i] >= 0 && data[i + 1] < 0) || (data[i] < 0 && data[i + 1] >= 0)) {
      const d = Math.abs(i - idx);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best;
}

interface SegmentQuality {
  snr: number;
  boundaryScore: number;
  pitchValid: boolean;
  edgeClean: boolean;
}

async function extractWaveformOnly(audioUrl: string): Promise<Float32Array> {
  try {
    const res = await fetch(audioUrl);
    const buf = await res.arrayBuffer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const ab = await ctx.decodeAudioData(buf);
    const data = ab.getChannelData(0);
    
    // Dynamic resolution: 50 points per second, clamped [800, 16000]
    const wfSize = Math.max(800, Math.min(16000, Math.ceil(ab.duration * 50)));
    const wf = new Float32Array(wfSize);
    const chunk = Math.floor(data.length / wfSize);
    for (let i = 0; i < wfSize; i++) {
      let mx = 0;
      for (let j = 0; j < chunk && i * chunk + j < data.length; j++) {
        const v = Math.abs(data[i * chunk + j]);
        if (v > mx) mx = v;
      }
      wf[i] = mx;
    }
    ctx.close();
    return wf;
  } catch (e) {
    console.error("Failed to extract waveform automatically:", e);
    return new Float32Array(0);
  }
}

function mergeRegionsToTarget(
  regions: { s: number; e: number }[],
  target: number,
  hop: number,
  sr: number
): { s: number; e: number }[] {
  const result = regions.map(r => ({ ...r }));
  while (result.length > target) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < result.length - 1; i++) {
      const gap = ((result[i + 1].s - result[i].e) * hop) / sr;
      const dur1 = ((result[i].e - result[i].s) * hop) / sr;
      const dur2 = ((result[i + 1].e - result[i + 1].s) * hop) / sr;
      const maxDur = Math.max(dur1, dur2);
      // We prefer merging regions with smaller gaps and shorter durations
      const score = -gap * 3.0 - maxDur;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx !== -1) {
      result[bestIdx].e = result[bestIdx + 1].e;
      result.splice(bestIdx + 1, 1);
    } else {
      break;
    }
  }
  return result;
}

function splitRegionsToTarget(
  regions: { s: number; e: number }[],
  target: number,
  smoothE: Float32Array,
  hop: number,
  sr: number
): { s: number; e: number }[] {
  const result = regions.map(r => ({ ...r }));
  const minFrames = Math.floor((0.25 * sr) / hop); // 250ms buffer at start/end
  
  while (result.length < target) {
    let longestIdx = -1;
    let maxDur = -1;
    for (let i = 0; i < result.length; i++) {
      const dur = result[i].e - result[i].s;
      if (dur > maxDur) {
        maxDur = dur;
        longestIdx = i;
      }
    }
    
    if (longestIdx === -1) break;
    
    const r = result[longestIdx];
    let startSearch = r.s + minFrames;
    let endSearch = r.e - minFrames;
    
    // Fallback if the segment is too short for 250ms buffers
    if (endSearch <= startSearch) {
      const buffer = Math.floor(0.20 * (r.e - r.s));
      startSearch = r.s + buffer;
      endSearch = r.e - buffer;
    }
    
    if (endSearch <= startSearch) {
      // Split in the middle if still invalid
      const mid = Math.floor((r.s + r.e) / 2);
      const r1 = { s: r.s, e: mid };
      const r2 = { s: mid, e: r.e };
      result.splice(longestIdx, 1, r1, r2);
      continue;
    }
    
    // Find point with minimum energy in the search range
    let minE = Infinity;
    let bestSplit = Math.floor((r.s + r.e) / 2);
    for (let t = startSearch; t <= endSearch; t++) {
      if (smoothE[t] < minE) {
        minE = smoothE[t];
        bestSplit = t;
      }
    }
    
    const r1 = { s: r.s, e: bestSplit };
    const r2 = { s: bestSplit, e: r.e };
    result.splice(longestIdx, 1, r1, r2);
  }
  return result;
}

function computeLocalZCR(data: Float32Array, start: number, len: number): number {
  let c = 0;
  const end = Math.min(start + len, data.length);
  for (let i = start + 1; i < end; i++) {
    if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) c++;
  }
  return c / Math.max(1, end - start);
}

function refineSegmentEdges(
  startS: number,
  endS: number,
  data: Float32Array,
  sr: number,
  threshold: number
): { startS: number; endS: number } {
  const winSize = Math.floor(sr * 0.015); // 15ms window
  const step = Math.floor(sr * 0.005);    // 5ms step
  
  let newStartS = startS;
  let newEndS = endS;
  
  // 1. Trim Start (ZCR protected for soft onsets like f, s, th)
  let consecutiveAbove = 0;
  for (let j = startS; j < endS - winSize; j += step) {
    const rms = computeRMS(data, j, winSize);
    const localZCR = computeLocalZCR(data, j, winSize);
    const isSpeech = rms >= threshold || (rms >= threshold * 0.4 && localZCR > 0.15);
    
    if (isSpeech) {
      consecutiveAbove++;
      if (consecutiveAbove >= 2) {
        newStartS = Math.max(startS, j - Math.floor(sr * 0.015));
        break;
      }
    } else {
      consecutiveAbove = 0;
    }
  }
  
  // 2. Trim End (ZCR protected for soft offsets like s, t, d, h)
  consecutiveAbove = 0;
  for (let j = endS - winSize; j > newStartS; j -= step) {
    const rms = computeRMS(data, j, winSize);
    const localZCR = computeLocalZCR(data, j, winSize);
    const isSpeech = rms >= threshold || (rms >= threshold * 0.4 && localZCR > 0.15);
    
    if (isSpeech) {
      consecutiveAbove++;
      if (consecutiveAbove >= 2) {
        newEndS = Math.min(endS, j + winSize + Math.floor(sr * 0.025));
        break;
      }
    } else {
      consecutiveAbove = 0;
    }
  }
  
  if (newEndS - newStartS < Math.floor(sr * 0.2)) {
    return { startS, endS };
  }
  
  return { startS: newStartS, endS: newEndS };
}

async function hybridSplit(
  audioUrl: string,
  surahNum: number,
  recitationStyle: "interleaved" | "consecutive",
  leadingSegments: number,
  onProgress?: (msg: string, pct?: number) => void,
): Promise<{
  segments: AudioSegment[];
  duration: number;
  waveform: Float32Array;
  qualities: SegmentQuality[];
  boundaryScores: Float32Array;
}> {
  /* ─── ① تحميل واستخراج الميزات ─── */
  onProgress?.("تحميل الصوت...", 3);
  const res = await fetch(audioUrl);
  const buf = await res.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const ab = await ctx.decodeAudioData(buf);
  const data = ab.getChannelData(0);
  const sr = ab.sampleRate;
  const totalDur = ab.duration;

  const hop = Math.floor(sr * 0.01);     // 10ms
  const win = Math.floor(sr * 0.03);     // 30ms
  const pitchWin = Math.floor(sr * 0.04);
  const N = Math.floor((data.length - win) / hop);

  onProgress?.("استخراج الميزات (طاقة + ZCR + طيف + نغمة)...", 8);

  const energies = new Float32Array(N);
  const zcrs = new Float32Array(N);
  const centroids = new Float32Array(N);
  const pitches = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const off = i * hop;
    energies[i] = computeRMS(data, off, win);
    zcrs[i] = computeZCR(data, off, win);
    centroids[i] = computeSpectralCentroid(data, off, win, sr);
  }

  onProgress?.("كشف النغمة (F0)...", 15);
  for (let i = 0; i < N; i += 4) {
    const p = detectPitch(data, i * hop, pitchWin, sr);
    for (let j = 0; j < 4 && i + j < N; j++) pitches[i + j] = p;
  }

  /* ─── ② كشف الصمت (Schmitt Trigger مُحسَّن) ─── */
  onProgress?.("كشف مناطق الكلام (Schmitt Trigger مُحسَّن)...", 22);

  // ─── تنعيم خفيف للطاقة (120ms) ───
  const smR = Math.floor(0.06 / (hop / sr));
  const smoothE = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - smR); j <= Math.min(N - 1, i + smR); j++) { s += energies[j]; c++; }
    smoothE[i] = s / c;
  }



  const sortE = [...Array.from(smoothE)].sort((a, b) => a - b);
  const noiseFloor = sortE[Math.floor(sortE.length * 0.05)];
  const sigPeak = sortE[Math.floor(sortE.length * 0.90)]; // 90th percentile to ignore transient noise clicks
  const eRange = sigPeak - noiseFloor;

  // Dynamic threshold scaling based on file SNR
  const snrDB = 20 * Math.log10(sigPeak / (noiseFloor || 1e-10));
  let upCoef = 0.08;
  let downCoef = 0.035;
  if (snrDB > 26) {
    // High SNR (studio/clean room): very sensitive to catch soft sounds
    upCoef = 0.05;
    downCoef = 0.022;
  } else if (snrDB < 16) {
    // Low SNR (noisy/hissy mic): higher thresholds to filter background hum
    upCoef = 0.12;
    downCoef = 0.06;
  }

  const thUp = noiseFloor + eRange * upCoef;
  const thDown = noiseFloor + eRange * downCoef;

  let inSp = false, spStart = 0;
  let regions: { s: number; e: number }[] = [];
  for (let i = 0; i < N; i++) {
    const threshold = inSp ? thDown : thUp;
    // Schmitt trigger hysteresis + sibilant protector (high ZCR & Centroid) to capture soft Arabic letters (س, ش, ت, ف)
    const isSpeechFrame = smoothE[i] > threshold || (smoothE[i] > thDown * 0.8 && zcrs[i] > 0.16 && centroids[i] > 2200);

    if (!inSp && isSpeechFrame) {
      inSp = true;
      spStart = i;
    }
    else if (inSp && !isSpeechFrame) {
      inSp = false;
      regions.push({ s: spStart, e: i });
    }
  }
  if (inSp) regions.push({ s: spStart, e: N - 1 });

  const minSilence = Math.floor(0.12 / (hop / sr));
  for (let i = 0; i < regions.length - 1; i++) {
    if (regions[i + 1].s - regions[i].e < minSilence) {
      regions[i].e = regions[i + 1].e;
      regions.splice(i + 1, 1);
      i--;
    }
  }

  regions = regions.filter(r => ((r.e - r.s) * hop) / sr > 0.10);

  const zcrTh = 0.06;
  regions.forEach(r => {
    let ss = r.s, ee = r.e;
    const maxExp = 20; 
    while (ss > 0 && ss > r.s - maxExp) {
      ss--;
      if (energies[ss] < noiseFloor * 1.5 && zcrs[ss] < zcrTh) break;
    }
    while (ee < N - 1 && ee < r.e + maxExp) {
      ee++;
      if (energies[ee] < noiseFloor * 1.5 && zcrs[ee] < zcrTh) break;
    }
    r.s = ss;
    r.e = ee;
  });

  onProgress?.(`كشف ${regions.length} منطقة كلام طبيعية (تقسيم ذكي بلا عدد مُسبق)`, 35);

  /* ─── ③ Boundary Likelihood (للعرض البصري فقط) ─── */
  onProgress?.("حساب Boundary Likelihood...", 40);

  const compR = Math.floor(0.12 / (hop / sr));
  const halfC = Math.floor(compR / 2);
  const boundaryL = new Float32Array(N);

  for (let i = compR; i < N - compR; i++) {
    let leftE = 0, rightE = 0;
    for (let j = i - halfC; j < i; j++) leftE += energies[j];
    for (let j = i; j < i + halfC; j++) rightE += energies[j];
    leftE /= halfC; rightE /= halfC;
    const eDip = 1 - Math.min(energies[i], leftE, rightE) / (Math.max(leftE, rightE) || 1e-10);
    const eChange = Math.abs(leftE - rightE) / (Math.max(leftE, rightE) || 1e-10);

    let lP = 0, rP = 0, lC = 0, rC = 0;
    for (let j = Math.max(0, i - compR); j < i; j++) { if (pitches[j] > 0) { lP += pitches[j]; lC++; } }
    for (let j = i; j < Math.min(N, i + compR); j++) { if (pitches[j] > 0) { rP += pitches[j]; rC++; } }
    lP = lC > 0 ? lP / lC : 0; rP = rC > 0 ? rP / rC : 0;
    const pJump = (lP > 0 && rP > 0) ? Math.abs(lP - rP) / Math.max(lP, rP) : 0;

    let lCen = 0, rCen = 0;
    for (let j = Math.max(0, i - halfC); j < i; j++) lCen += centroids[j];
    for (let j = i; j < Math.min(N, i + halfC); j++) rCen += centroids[j];
    lCen /= halfC || 1; rCen /= halfC || 1;
    const cenChange = Math.abs(lCen - rCen) / (Math.max(lCen, rCen) || 1);

    boundaryL[i] = eDip * 0.30 + eChange * 0.15 + pJump * 0.30 + cenChange * 0.25;
  }

  const blSmR = Math.floor(0.04 / (hop / sr));
  const smoothBL = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0, w = 0;
    for (let j = Math.max(0, i - blSmR); j <= Math.min(N - 1, i + blSmR); j++) {
      const d = Math.abs(j - i);
      const wt = Math.exp(-0.5 * (d / (blSmR / 2 || 1)) ** 2);
      s += boundaryL[j] * wt; w += wt;
    }
    smoothBL[i] = s / (w || 1);
  }
  let maxBL = 0;
  for (let i = 0; i < N; i++) if (smoothBL[i] > maxBL) maxBL = smoothBL[i];
  if (maxBL > 0) for (let i = 0; i < N; i++) smoothBL[i] /= maxBL;

  /* ─── ④ اعتماد المقاطع الطبيعية كما هي (بلا إجبار على عدد مخزّن) ─── */
  // التقسيم لا يعتمد على AYAH_COUNTS — البنية تُكتشف لاحقاً بالطبقة والتكرار.
  let targetRegions = regions.map(r => ({ ...r }));
  if (targetRegions.length === 0) targetRegions = [{ s: 0, e: N - 1 }];
  onProgress?.(`${targetRegions.length} مقطع طبيعي`, 55);


  /* ─── ⑤ ضبط الحواف في أعمق نقطة صمت (Perfect Snap) ─── */
  onProgress?.("ضبط الحواف في أعمق نقطة صمت...", 72);

  interface Refined { start: number; end: number; startS: number; endS: number; }
  const refined: Refined[] = targetRegions.map(r => ({
    start: r.s * hop / sr, end: r.e * hop / sr,
    startS: Math.floor(r.s * hop), endS: Math.floor(r.e * hop)
  }));

  // المسح للبحث عن أقل نقطة طاقة (أعمق صمت)
  for (let i = 0; i < refined.length - 1; i++) {
    const current = refined[i];
    const next = refined[i + 1];
    
    // الفجوة بين نهاية المقطع الحالي وبداية التالي
    const gapStart = current.endS;
    const gapEnd = next.startS;

    let minE = Infinity;
    let minIdx = gapStart;
    const winSize = Math.floor(sr * 0.02); // 20ms
    const step = Math.floor(sr * 0.005);   // 5ms step for high precision

    if (gapEnd > gapStart) {
      // إذا كان هناك فجوة، نبحث عن أعمق صمت بداخلها
      for (let j = gapStart; j < gapEnd - winSize; j += step) {
        const e = computeRMS(data, j, winSize);
        if (e < minE) { minE = e; minIdx = j; }
      }
    } else {
      // إذا كان هناك تداخل، نبحث حول نقطة التداخل (±150ms)
      const searchS = Math.max(0, gapEnd - Math.floor(sr * 0.15));
      const searchE = Math.min(data.length, gapStart + Math.floor(sr * 0.15));
      for (let j = searchS; j < searchE - winSize; j += step) {
        const e = computeRMS(data, j, winSize);
        if (e < minE) { minE = e; minIdx = j; }
      }
    }

    // تثبيت الحد الفاصل بالضبط في المنتصف المرئي للصمت
    current.endS = minIdx;
    current.end = minIdx / sr;
    next.startS = minIdx;
    next.start = minIdx / sr;
  }

  // تمديد المقطع الأول ليلتقط بداية الصمت
  if (refined.length > 0) {
    const first = refined[0];
    const winSize = Math.floor(sr * 0.02);
    let minE = Infinity;
    let minIdx = first.startS;
    const searchS = Math.max(0, first.startS - Math.floor(sr * 0.3));
    for (let j = searchS; j < first.startS; j += Math.floor(sr * 0.01)) {
      const e = computeRMS(data, j, winSize);
      if (e < minE) { minE = e; minIdx = j; }
    }
    first.startS = minIdx;
    first.start = minIdx / sr;

    // تمديد المقطع الأخير
    const last = refined[refined.length - 1];
    minE = Infinity;
    minIdx = last.endS;
    const searchE = Math.min(data.length - winSize, last.endS + Math.floor(sr * 0.3));
    for (let j = last.endS; j < searchE; j += Math.floor(sr * 0.01)) {
      const e = computeRMS(data, j, winSize);
      if (e < minE) { minE = e; minIdx = j; }
    }
    last.endS = minIdx;
    last.end = minIdx / sr;
  }

  // ─── ⑤.٥ تشذيب حواف عالي الدقة لكل مقطع ───
  onProgress?.("تشذيب الحواف لإزالة الفراغات الفائضة...", 76);
  const overallRMS = computeRMS(data, 0, data.length);
  for (let i = 0; i < refined.length; i++) {
    const isTeacher = i % 2 === 0;
    const threshold = isTeacher
      ? Math.max(0.0012, overallRMS * 0.07)
      : Math.max(0.0016, overallRMS * 0.09);

    const trimmed = refineSegmentEdges(refined[i].startS, refined[i].endS, data, sr, threshold);
    refined[i].startS = trimmed.startS;
    refined[i].start = Number((trimmed.startS / sr).toFixed(4));
    refined[i].endS = trimmed.endS;
    refined[i].end = Number((trimmed.endS / sr).toFixed(4));
  }

  /* ─── ⑥ تمييز المتحدث بالذكاء (طبقة الصوت F0) + ربط الآيات بالتكرار ─── */
  // لا يعتمد على عدد آيات مخزّن. المعلم نبرته منخفضة (~100-160Hz)،
  // الطفل نبرته عالية (~250-400Hz). نصنّف بالطبقة، نكتشف النمط، ثم نرقّم بالتكرار.
  onProgress?.("تمييز المعلم/الطفل بطبقة الصوت...", 80);

  const sortedE2 = [...Array.from(energies)].sort((a, b) => a - b);
  const noiseE = sortedE2[Math.floor(sortedE2.length * 0.1)] || 1e-6;
  const surahName = SURAH_NAMES[surahNum] || `سورة ${surahNum}`;

  // طبقة صوت متوسطة (median F0) لكل مقطع من إطارات النغمة المحسوبة مسبقاً
  const segPitch: number[] = refined.map(r => {
    const fs = Math.floor(r.startS / hop);
    const fe = Math.floor(r.endS / hop);
    const vals: number[] = [];
    for (let f = fs; f <= fe && f < N; f++) if (pitches[f] > 0) vals.push(pitches[f]);
    if (vals.length === 0) return 0;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  });

  // عتبة تصنيف ديناميكية: أكبر فجوة بين قيم الطبقة المرتّبة تفصل المعلم عن الطفل
  const validP = segPitch.filter(p => p > 0).sort((a, b) => a - b);
  let pitchTh = 200; // افتراضي بين البالغ والطفل
  if (validP.length >= 2) {
    let maxGap = -1;
    for (let i = 1; i < validP.length; i++) {
      const gap = validP[i] - validP[i - 1];
      if (gap > maxGap) { maxGap = gap; pitchTh = (validP[i] + validP[i - 1]) / 2; }
    }
    if (maxGap < 40) pitchTh = validP[Math.floor(validP.length / 2)] + 1; // متحدث واحد: لا تقسيم زائف
  }

  const spk: ("teacher" | "kids")[] = refined.map((_, i) =>
    segPitch[i] <= 0 ? "teacher" : (segPitch[i] < pitchTh ? "teacher" : "kids")
  );

  // كشف النمط تلقائياً: متتابع (كل المعلم ثم كل الطفل) أم متناوب
  const half = Math.floor(refined.length / 2);
  const fhKids = spk.slice(0, half).filter(s => s === "kids").length / Math.max(1, half);
  const shKids = spk.slice(half).filter(s => s === "kids").length / Math.max(1, refined.length - half);
  let isConsecutive = fhKids < 0.3 && shKids > 0.7;
  // إن كان التمييز غير حاسم، عُد لاختيار المستخدم
  if (fhKids > 0.35 && fhKids < 0.65) isConsecutive = recitationStyle === "consecutive";

  // وسم المقاطع التمهيدية (بسملة/استعاذة): أول leadingSegments وحدة ليست آية
  const lead = Math.max(0, Math.floor(leadingSegments));
  const leadLabel = (u: number) => (lead >= 2 && u === 1) ? "الاستعاذة" : "البسملة";

  const segs: AudioSegment[] = [];
  const quals: SegmentQuality[] = [];
  let tU = 0, kU = 0, interU = 0;

  for (let i = 0; i < refined.length; i++) {
    const r = refined[i];
    const isTeacher = spk[i] === "teacher";

    // رقم الوحدة (1-based) عبر التكرار
    let unit: number;
    if (isConsecutive) {
      unit = isTeacher ? ++tU : ++kU;
    } else {
      if (isTeacher) { interU++; unit = interU; }
      else { unit = interU > 0 ? interU : 1; }
    }

    const ayahNum = unit - lead;            // ≤0 ⇒ تمهيد، ≥1 ⇒ آية حقيقية
    const isLead = ayahNum < 1;
    const ayah = isLead ? 0 : ayahNum;
    const unitLabel = isLead ? leadLabel(unit) : `آية ${ayahNum}`;

    segs.push({
      id: `hyb-${Date.now()}-${i}`,
      start: Number(r.start.toFixed(4)),
      end: Number(r.end.toFixed(4)),
      speaker: isTeacher ? "teacher" : "kids",
      ayah,
      label: `${surahName} - ${unitLabel} (${isTeacher ? "معلم" : "طفل"})`,
    });

    const segE = computeRMS(data, r.startS, r.endS - r.startS);
    const snr = 20 * Math.log10(segE / noiseE);
    const bFrame = Math.floor(r.start * sr / hop);
    const bScore = bFrame > 0 && bFrame < N ? smoothBL[bFrame] : 1;
    quals.push({
      snr,
      boundaryScore: i === 0 ? 1 : bScore,
      pitchValid: segPitch[i] > 0,
      edgeClean: Math.abs(data[r.startS] || 0) < 0.02 && Math.abs(data[Math.min(r.endS, data.length - 1)] || 0) < 0.02,
    });
  }

  onProgress?.(`${segs.length} مقطع (${isConsecutive ? "متتابع" : "متناوب"})`, 85);

  // Anomaly removal: مقاطع قصيرة جداً بـ SNR منخفض
  for (let i = segs.length - 1; i >= 0; i--) {
    if ((segs[i].end - segs[i].start) < 0.15 && quals[i].snr < 3) {
      if (i > 0) { segs[i - 1].end = segs[i].end; }
      segs.splice(i, 1);
      quals.splice(i, 1);
    }
  }

  /* ─── Waveform ─── */
  onProgress?.("توليد الرسم البياني...", 93);
  // Dynamic resolution: 50 points per second, clamped [800, 16000]
  const wfSize = Math.max(800, Math.min(16000, Math.ceil(totalDur * 50)));
  const wf = new Float32Array(wfSize);
  const chunk = Math.floor(data.length / wfSize);
  for (let i = 0; i < wfSize; i++) {
    let mx = 0;
    for (let j = 0; j < chunk && i * chunk + j < data.length; j++) {
      const v = Math.abs(data[i * chunk + j]);
      if (v > mx) mx = v;
    }
    wf[i] = mx;
  }

  const blViz = new Float32Array(wfSize);
  const blChunk = Math.max(1, Math.floor(N / wfSize));
  for (let i = 0; i < wfSize; i++) {
    let mx = 0;
    for (let j = 0; j < blChunk && i * blChunk + j < N; j++) {
      if (smoothBL[i * blChunk + j] > mx) mx = smoothBL[i * blChunk + j];
    }
    blViz[i] = mx;
  }

  ctx.close();

  const teacherN = segs.filter(s => s.speaker === "teacher").length;
  const kidsN = segs.filter(s => s.speaker === "kids").length;
  onProgress?.(`تم: ${segs.length} مقطع (معلم ${teacherN} · طفل ${kidsN})`, 100);

  return { segments: segs, duration: totalDur, waveform: wf, qualities: quals, boundaryScores: blViz };
}


/* ═══════════════════════════════════════════════════════════════════════
   Waveform Visualization
   ═══════════════════════════════════════════════════════════════════════ */

function WaveformDisplay({
  waveform, boundaryScores, segments, duration, currentTime, onSeek, onBoundaryChange, onDeleteSegment, zoomLevel = 1
}: {
  waveform: Float32Array; boundaryScores?: Float32Array;
  segments: AudioSegment[]; duration: number; currentTime: number;
  onSeek: (t: number) => void;
  onBoundaryChange: (index: number, field: "start" | "end", newVal: number) => void;
  onDeleteSegment: (index: number) => void;
  zoomLevel?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [dragInfo, setDragInfo] = useState<{ index: number, field: "start" | "end", startX: number, startVal: number } | null>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      wrapperRef.current?.requestFullscreen().catch(e => console.error(e));
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    if (!dragInfo) return;
    const handleMove = (e: PointerEvent) => {
      const cv = contRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const deltaX = e.clientX - dragInfo.startX;
      const deltaT = (deltaX / rect.width) * duration;
      const newVal = dragInfo.startVal + deltaT;
      onBoundaryChange(dragInfo.index, dragInfo.field, newVal);
    };
    const handleUp = () => setDragInfo(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragInfo, duration, onBoundaryChange]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const c = cv.getContext("2d");
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    c.scale(dpr, dpr);

    // 1. Deep Space/Mars Premium Background
    const bgGrad = c.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#0b0510"); // Very dark purple/black
    bgGrad.addColorStop(0.5, "#150a1a"); // Deep void
    bgGrad.addColorStop(1, "#260d14"); // Mars deep red at the bottom
    c.fillStyle = bgGrad;
    c.fillRect(0, 0, W, H);

    // 2. Futuristic Grid
    c.strokeStyle = "rgba(255, 255, 255, 0.03)";
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < W; i += 40) { c.moveTo(i, 0); c.lineTo(i, H); }
    for (let i = 0; i < H; i += 20) { c.moveTo(0, i); c.lineTo(W, i); }
    c.stroke();

    const cy = H * 0.5;
    const hasWaveform = waveform.length > 0;
    const mxA = hasWaveform ? Math.max(...Array.from(waveform)) || 1 : 1;

    // 3. Segment Backgrounds (Subtle glowing areas)
    for (const seg of segments) {
      const x1 = (seg.start / duration) * W, x2 = (seg.end / duration) * W;
      
      const segGrad = c.createLinearGradient(0, 0, 0, H);
      if (seg.speaker === "teacher") {
        segGrad.addColorStop(0, "rgba(255, 87, 34, 0.08)");
        segGrad.addColorStop(1, "rgba(255, 87, 34, 0.02)");
      } else {
        segGrad.addColorStop(0, "rgba(0, 212, 255, 0.08)");
        segGrad.addColorStop(1, "rgba(0, 212, 255, 0.02)");
      }
      c.fillStyle = segGrad;
      c.fillRect(x1, 0, x2 - x1, H);

      // Glowing border lines
      c.strokeStyle = seg.speaker === "teacher" ? "rgba(255, 87, 34, 0.5)" : "rgba(0, 212, 255, 0.5)";
      c.lineWidth = 1; 
      c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(x1, 0); c.lineTo(x1, H); c.stroke();
      c.setLineDash([]);
    }

    // 4. Neon Waveform Bars — center-aligned on time coordinate
    const wLen = hasWaveform ? waveform.length : 800;
    const bW = W / wLen;
    for (let i = 0; i < wLen; i++) {
      const xCenter = (i + 0.5) * bW; // center of this time bin
      const amp = hasWaveform ? (waveform[i] / mxA) * (H * 0.4) : 2;
      const t = ((i + 0.5) / wLen) * duration; // use bin center for time lookup
      
      const seg = segments.find(s => t >= s.start && t <= s.end);

      const barGrad = c.createLinearGradient(0, cy - amp, 0, cy + amp);
      
      if (seg && seg.speaker === "teacher") {
        barGrad.addColorStop(0, "#ffb74d");
        barGrad.addColorStop(0.5, "#f57c00");
        barGrad.addColorStop(1, "#ff7043");
        c.shadowColor = "transparent";
      } else if (seg && seg.speaker === "kids") {
        barGrad.addColorStop(0, "#80d8ff");
        barGrad.addColorStop(0.5, "#0288d1");
        barGrad.addColorStop(1, "#29b6f6");
        c.shadowColor = "transparent";
      } else {
        barGrad.addColorStop(0, "rgba(255,255,255,0.2)");
        barGrad.addColorStop(1, "rgba(255,255,255,0.1)");
        c.shadowColor = "transparent";
      }

      c.shadowBlur = 0;
      c.fillStyle = barGrad;
      const barWidth = Math.max(bW - 0.5, 1);
      
      c.beginPath();
      c.roundRect(xCenter - barWidth / 2, cy - amp, barWidth, amp * 2, 2);
      c.fill();
    }
    c.shadowBlur = 0;

    // 5. Boundary Likelihood Curve (Neon Purple)
    if (boundaryScores && boundaryScores.length > 0) {
      const blMx = Math.max(...Array.from(boundaryScores)) || 1;
      const baseY = H - 5, blH = H * 0.25;
      
      c.beginPath();
      for (let i = 0; i < boundaryScores.length; i++) {
        const x = (i / boundaryScores.length) * W;
        const y = baseY - (boundaryScores[i] / blMx) * blH;
        if (i === 0) {
          c.moveTo(x, y);
        } else {
          c.lineTo(x, y);
        }
      }
      
      c.shadowColor = "#e040fb";
      c.shadowBlur = 8;
      c.strokeStyle = "#e040fb"; 
      c.lineWidth = 2; 
      c.stroke();
      c.shadowBlur = 0;

      c.lineTo(W, baseY);
      c.lineTo(0, baseY);
      c.closePath();
      const fillGrad = c.createLinearGradient(0, baseY - blH, 0, baseY);
      fillGrad.addColorStop(0, "rgba(224, 64, 251, 0.15)");
      fillGrad.addColorStop(1, "rgba(224, 64, 251, 0.01)");
      c.fillStyle = fillGrad;
      c.fill();
    }
    c.fill();
    c.shadowBlur = 0;

  }, [waveform, boundaryScores, segments, duration, zoomLevel]);

  // Auto-scroll to playhead when playing
  useEffect(() => {
    if (zoomLevel > 1 && scrollRef.current && currentTime > 0) {
      const scrollCont = scrollRef.current;
      const px = (currentTime / duration) * scrollCont.scrollWidth;
      // Continuous smooth tracking to keep playhead exactly in center
      scrollCont.scrollLeft = px - scrollCont.clientWidth / 2;
    }
  }, [currentTime, duration, zoomLevel]);

  return (
    <div ref={wrapperRef} className="relative rounded-2xl overflow-hidden border border-border shadow-soft bg-background group/fs flex flex-col justify-center">
      <button onClick={toggleFullscreen} className="absolute top-2 right-2 z-50 p-2 bg-card rounded-lg hover:brightness-95 text-muted-foreground opacity-0 group-hover/fs:opacity-100 transition-opacity border border-border shadow-xl" title="وضع ملء الشاشة">
        <Maximize className="w-4 h-4" />
      </button>
      <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden custom-scrollbar h-full w-full relative" dir="ltr">
        <div className="relative group min-h-[120px]" style={{ width: `${zoomLevel * 100}%`, minWidth: '100%' }}>
        <div ref={contRef} className="cursor-pointer"
          onClick={(e) => { 
            if (dragInfo) return; // Prevent clicking while dragging
            const r = contRef.current?.getBoundingClientRect(); 
            if (r && duration) onSeek(((e.clientX - r.left) / r.width) * duration); 
          }}>
          <canvas ref={canvasRef} className="w-full" style={{ height: 120 }} />
        </div>

        {/* DOM Laser Playhead for high performance */}
        <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: `${(currentTime / duration) * 100}%` }}>
          <div className="absolute top-0 bottom-0 w-[2px] -ml-[1px] bg-[#69f0ae] shadow-[0_0_12px_#00e676]" />
          <div className="absolute top-[60px] -mt-1 w-2 h-2 -ml-1 bg-white rounded-full shadow-[0_0_8px_#ffffff]" />
        </div>

        {/* Drag Overlays */}
        <div className="absolute inset-x-0 top-0 h-[120px] pointer-events-none">
          {segments.map((seg, i) => (
            <div key={seg.id} className="absolute h-full group/seg transition-colors hover:bg-white/5" style={{ left: `${(seg.start / duration) * 100}%`, width: `${((seg.end - seg.start) / duration) * 100}%` }}>
              {/* Delete Button */}
              <button 
                onClick={(e) => { e.stopPropagation(); onDeleteSegment(i); }}
                className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded opacity-0 group-hover/seg:opacity-100 hover:bg-red-500 transition-all pointer-events-auto z-30 shadow-lg"
                title="حذف المقطع"
              ><Trash2 className="w-3 h-3" /></button>
            {/* Left handle (start) */}
            <div 
              className="absolute left-0 top-0 bottom-0 w-4 -ml-2 cursor-ew-resize flex items-center justify-center pointer-events-auto opacity-40 group-hover/seg:opacity-100 transition-opacity z-20"
              onPointerDown={(e) => { e.stopPropagation(); setDragInfo({ index: i, field: "start", startX: e.clientX, startVal: seg.start }); }}
            >
              <div className="w-1 h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)] rounded-full group-hover/seg:w-1.5 group-hover/seg:shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all" />
            </div>
            
            {/* Right handle (end) */}
            <div 
              className="absolute right-0 top-0 bottom-0 w-4 -mr-2 cursor-ew-resize flex items-center justify-center pointer-events-auto opacity-40 group-hover/seg:opacity-100 transition-opacity z-20"
              onPointerDown={(e) => { e.stopPropagation(); setDragInfo({ index: i, field: "end", startX: e.clientX, startVal: seg.end }); }}
            >
              <div className="w-1 h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)] rounded-full group-hover/seg:w-1.5 group-hover/seg:shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all" />
            </div>
          </div>
        ))}
      </div>

        <div className="flex justify-between px-3 py-1 text-[10px] font-bold text-muted-foreground bg-background/90 border-t border-border relative z-0 sticky left-0 bottom-0 w-full" dir="rtl">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_#ff9800]"></span> المعلم (المريخ)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_8px_#00b0ff]"></span> الطفل (الفضاء)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_#e040fb]"></span> Boundary Likelihood</span>
        </div>
      </div>
    </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Quran Page Image Component
   ═══════════════════════════════════════════════════════════════════════ */

const CUSTOM_IMAGE_KEY = "mushaf:customPageImage:";

function QuranPageViewer({ surahNum }: { surahNum: number }) {
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // تحميل الصورة المخصصة من localStorage
  useEffect(() => {
    const saved = localStorage.getItem(CUSTOM_IMAGE_KEY + surahNum);
    setCustomImage(saved);
  }, [surahNum]);

  const defaultImage = SURAH_PAGE_IMAGES[surahNum];
  const displayImage = customImage || defaultImage;

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "حجم الصورة كبير جداً", description: "الحد الأقصى 5 ميجا", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      localStorage.setItem(CUSTOM_IMAGE_KEY + surahNum, base64);
      setCustomImage(base64);
      toast({ title: "تم رفع الصورة بنجاح!" });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const clearCustom = () => {
    localStorage.removeItem(CUSTOM_IMAGE_KEY + surahNum);
    setCustomImage(null);
  };

  if (!displayImage) return null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-bold text-accent"><BookOpen className="w-3.5 h-3.5 inline-block" /> صفحة المصحف</span>
        <div className="flex items-center gap-2">
          {customImage && (
            <button onClick={clearCustom} className="text-[10px] text-destructive hover:brightness-110 flex items-center gap-1">
              <X className="w-3 h-3" /> حذف المخصصة
            </button>
          )}
          <button onClick={() => setZoomed(true)} className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1">
            <ZoomIn className="w-3 h-3" /> تكبير
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-[10px] text-success hover:brightness-110 flex items-center gap-1"
          >
            <ImagePlus className="w-3 h-3" /> رفع صورة
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      <div className="relative">
        <img
          src={displayImage}
          alt={`صفحة سورة ${SURAH_NAMES[surahNum]}`}
          className="w-full max-h-[280px] object-contain cursor-pointer"
          onClick={() => setZoomed(true)}
        />
      </div>

      {/* Full-screen zoom modal */}
      {zoomed && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setZoomed(false)}>
          <button className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
            onClick={() => setZoomed(false)}>
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={displayImage}
            alt={`صفحة سورة ${SURAH_NAMES[surahNum]}`}
            className="max-w-[95vw] max-h-[95vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */

const RecitationMethods = ({ onBack }: { onBack?: () => void }) => {
  const [surahNum, setSurahNum] = useState<number>(1);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [zoomLevel, setZoomLevel] = useState<number>(3);
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [linkResult, setLinkResult] = useState<{ linked: number; pages: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [splitting, setSplitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [playingSegId, setPlayingSegId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAtRef = useRef<{ end: number; id: string } | null>(null);
  const isSeekingRef = useRef(false);
  const expectedStartTimeRef = useRef(0);
  const [aiProfiles, setAiProfiles] = useState<SpeakerProfile[]>([]);
  const [aiSplitting, setAiSplitting] = useState(false);
  const [waveform, setWaveform] = useState<Float32Array>(new Float32Array(0));
  const [recitationStyle, setRecitationStyle] = useState<"interleaved" | "consecutive">("interleaved");
  // عدد المقاطع التمهيدية قبل الآية الأولى (1 = البسملة، 2 = استعاذة + بسملة، 0 = بلا)
  const [leadingSegments, setLeadingSegments] = useState<number>(1);
  // رابط خدمة التقسيم (Python على Hugging Face Spaces) — يُحفظ محلياً
  const SERVICE_URL_KEY = "quran:splitServiceUrl";
  const DEFAULT_SERVICE_URL = "https://hammoualiyoucef20-quran-audio.hf.space";
  const [serviceUrl, setServiceUrl] = useState<string>(() => {
    try { return localStorage.getItem(SERVICE_URL_KEY) || DEFAULT_SERVICE_URL; } catch { return DEFAULT_SERVICE_URL; }
  });
  const [boundaryScores, setBoundaryScores] = useState<Float32Array>(new Float32Array(0));
  const [qualities, setQualities] = useState<SegmentQuality[]>([]);

  const [history, setHistory] = useState<AudioSegment[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isInternalChangeRef = useRef(false);
  const historyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedSegmentsRef = useRef<AudioSegment[]>([]);

  useEffect(() => { loadProfiles().then(setAiProfiles); }, []);

  useEffect(() => {
    const saved = getSavedTimings()[surahNum];
    const initialSegs = saved?.segments || [];
    isInternalChangeRef.current = true;
    setSegments(initialSegs);
    setHistory([initialSegs]);
    setHistoryIndex(0);
    lastSavedSegmentsRef.current = initialSegs;
    setPlayingSegId(null);
    stopAtRef.current = null;
    setWaveform(new Float32Array(0));
    setBoundaryScores(new Float32Array(0));
    setQualities([]);

    // Default Surah 1 (Al-Fatiha) to consecutive, others to interleaved
    setRecitationStyle(surahNum === 1 ? "consecutive" : "interleaved");

    // Automatically load real waveform on surah change
    const url = audioPath(surahNum);
    extractWaveformOnly(url).then(wf => {
      if (wf.length > 0) setWaveform(wf);
    });
  }, [surahNum]);

  const persistSegments = useCallback((sNum: number, segs: AudioSegment[]) => {
    if (segs.length === 0) return;
    const teacher = segs.filter(s => s.speaker === "teacher").map(s => s.start);
    const kids = segs.filter(s => s.speaker === "kids").map(s => s.start);
    const payload: SurahTimings = { teacher, segments: segs };
    if (kids.length > 0) { payload.kids = kids; payload.kidsStart = kids[0]; }
    saveSurahTimings(sNum, payload);
  }, []);

  // الحفظ التلقائي المباشر عند أي تعديل
  useEffect(() => {
    if (segments.length > 0) {
      persistSegments(surahNum, segments);
    }
  }, [segments, surahNum, persistSegments]);

  // تتبع تاريخ التعديلات لدعم التراجع والإعادة بدقة
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      lastSavedSegmentsRef.current = segments;
      return;
    }

    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);

    historyTimeoutRef.current = setTimeout(() => {
      if (JSON.stringify(lastSavedSegmentsRef.current) === JSON.stringify(segments)) return;

      setHistory(prev => {
        const nextHistory = prev.slice(0, historyIndex + 1);
        return [...nextHistory, segments];
      });
      setHistoryIndex(prev => prev + 1);
      lastSavedSegmentsRef.current = segments;
    }, 300);

    return () => {
      if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
    };
  }, [segments, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      isInternalChangeRef.current = true;
      const prevSegs = history[prevIndex];
      setSegments(prevSegs);
      setHistoryIndex(prevIndex);
      lastSavedSegmentsRef.current = prevSegs;
      toast({ title: "تم التراجع" });
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      isInternalChangeRef.current = true;
      const nextSegs = history[nextIndex];
      setSegments(nextSegs);
      setHistoryIndex(nextIndex);
      lastSavedSegmentsRef.current = nextSegs;
      toast({ title: "تم الإعادة" });
    }
  }, [history, historyIndex]);

  // اختصارات لوحة المفاتيح للتراجع والإعادة (Ctrl+Z / Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const handleSplit = async () => {
    const a = audioRef.current;
    if (!a || !duration) { toast({ title: "انتظر تحميل الصوت", variant: "destructive" }); return; }
    setSplitting(true); setProgress(""); setProgressPct(0);
    try {
      const r = await hybridSplit(a.src, surahNum, recitationStyle, leadingSegments, (msg, pct) => {
        setProgress(msg);
        if (pct !== undefined) setProgressPct(pct);
      });
      setSegments(r.segments); setWaveform(r.waveform);
      setBoundaryScores(r.boundaryScores); setQualities(r.qualities);
      persistSegments(surahNum, r.segments);
      toast({ title: "تم التقسيم!", description: `${r.segments.length} مقطع — المحرك الهجين` });
      await linkSegsToShading(r.segments);   // ربط تلقائي بالآيات بعد التقسيم
    } catch (e) {
      toast({ title: "فشل", description: e instanceof Error ? e.message : "خطأ", variant: "destructive" });
    } finally { setSplitting(false); setProgress(""); setProgressPct(0); }
  };

  // ── تقسيم على السيرفر (دقة عالية) ──
  // السور السحابية: السيرفر يجلب الصوت برابطه العام بنفسه (أسرع، بلا رفع).
  // السور المحلية: نرفع بايتات الصوت من المتصفّح — فيعمل على localhost أيضاً
  // (لأن خدمة Hugging Face لا تستطيع الوصول إلى http://localhost).
  const runServiceSplit = async (engine: "vad" | "gemini") => {
    const base = serviceUrl.trim().replace(/\/$/, "");
    if (!base) { toast({ title: "أدخل رابط الخدمة أولاً", description: "انشر الخدمة على Hugging Face والصق رابطها", variant: "destructive" }); return; }

    const label = SURAH_NAMES[surahNum] || `سورة ${surahNum}`;
    const urlPath = engine === "gemini" ? "/split-gemini-url" : "/split-url";
    const filePath = engine === "gemini" ? "/split-gemini" : "/split";
    const engName = engine === "gemini" ? "Gemini" : "الخدمة";
    setSplitting(true); setProgressPct(30);
    try {
      let res: Response;
      if (hasCloudAudio(surahNum)) {
        // صوت عام على السحابة → السيرفر يجلبه بنفسه
        setProgress(`${engName}: جلب الصوت السحابي وتقسيمه...`);
        res = await fetch(`${base}${urlPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioUrl: getSurahAudioUrl(surahNum), leading: leadingSegments, surahLabel: label, style: recitationStyle, ayahCount: getSurahAyahCount(surahNum) }),
        });
      } else {
        // صوت محلي (لا يصله السيرفر) → نرفع البايتات من المتصفّح
        setProgress(`${engName}: رفع الصوت وتقسيمه...`);
        const audioSrc = audioRef.current?.src || audioPath(surahNum);
        const blob = await (await fetch(audioSrc)).blob();
        const form = new FormData();
        form.append("file", blob, `${surahNum}.mp3`);
        form.append("leading", String(leadingSegments));
        form.append("surahLabel", label);
        form.append("style", recitationStyle);
        form.append("ayahCount", String(getSurahAyahCount(surahNum)));
        res = await fetch(`${base}${filePath}`, { method: "POST", body: form });
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`الخدمة ردّت ${res.status} ${txt.slice(0, 120)}`);
      }
      const data = await res.json();
      const segs: AudioSegment[] = (data.segments || []).map((s: AudioSegment) => ({ ...s }));
      if (segs.length === 0) throw new Error("لم تُرجِع الخدمة أي مقاطع");

      setSegments(segs);
      persistSegments(surahNum, segs);
      setProgressPct(100);
      toast({ title: `تم التقسيم (${engName})!`, description: `${segs.length} مقطع · ${data.processingTimeMs || 0}ms` });
      await linkSegsToShading(segs);   // ربط تلقائي بالآيات بعد التقسيم
    } catch (e) {
      toast({ title: "فشل التقسيم", description: e instanceof Error ? e.message : "خطأ", variant: "destructive" });
    } finally { setSplitting(false); setProgress(""); setProgressPct(0); }
  };
  const handleServiceSplit = () => runServiceSplit("vad");
  const handleGeminiSplit = () => runServiceSplit("gemini");

  // ربط المقاطع المقسّمة بمربعات التظليل: يكتب وقت كل آية (معلم/طفل) داخل مربعها فتظهر في المصحف
  const linkSegsToShading = useCallback(async (segs: AudioSegment[]) => {
    if (segs.length === 0) { toast({ title: "لا توجد مقاطع — قسّم الصوت أولاً", variant: "destructive" }); return; }
    const tByAyah = new Map<number, AudioSegment>();
    const kByAyah = new Map<number, AudioSegment>();
    segs.forEach(s => {
      if (!s.ayah || s.ayah < 1) return;
      if (s.speaker === "kids") { if (!kByAyah.has(s.ayah)) kByAyah.set(s.ayah, s); }
      else { if (!tByAyah.has(s.ayah)) tByAyah.set(s.ayah, s); }
    });
    const allSrcs = [...getAllPageSources(), ...getCustomPages().map(p => p.src)];
    let linked = 0, pagesTouched = 0;
    for (const src of allSrcs) {
      const boxes = getPageAyahBoxes(src);
      if (!boxes.some(b => b.surah === surahNum)) continue;
      let changed = false;
      const next = boxes.map(b => {
        if (b.surah !== surahNum) return b;
        const t = tByAyah.get(b.ayah), k = kByAyah.get(b.ayah);
        if (!t && !k) return b;
        changed = true; linked++;
        return {
          ...b,
          audioStart: t ? t.start : b.audioStart,
          audioEnd: t ? t.end : b.audioEnd,
          kidsStart: k ? k.start : b.kidsStart,
          kidsEnd: k ? k.end : b.kidsEnd,
        };
      });
      if (changed) { await savePageAyahBoxes(src, next); pagesTouched++; }
    }
    setLinkResult({ linked, pages: pagesTouched });
    if (linked === 0) {
      toast({ title: "لا توجد مربعات لهذه السورة", description: "أنشئ تظليل السورة في المعايرة أولاً، ثم اربط.", variant: "destructive" });
    } else {
      toast({ title: "تم الربط بالتظليل", description: `${linked} آية على ${pagesTouched} صفحة — يظهر التوقيت في المصحف.` });
    }
  }, [surahNum]);
  // غلاف للزرّ اليدوي (يستعمل المقاطع من الحالة)
  const linkToShading = useCallback(() => linkSegsToShading(segments), [segments, linkSegsToShading]);

  const togglePlay = () => {
    const a = audioRef.current; if (!a) return;
    if (isPlaying) { a.pause(); setPlayingSegId(null); stopAtRef.current = null; }
    else a.play().catch(() => {});
  };

  const playSegment = useCallback((seg: AudioSegment) => {
    const a = audioRef.current; if (!a) return;
    if (playingSegId === seg.id) { a.pause(); setPlayingSegId(null); stopAtRef.current = null; return; }
    isSeekingRef.current = true;
    expectedStartTimeRef.current = seg.start;
    a.currentTime = seg.start;
    stopAtRef.current = { end: seg.end, id: seg.id };
    setPlayingSegId(seg.id);
    a.play().catch(() => {});
  }, [playingSegId]);

  const onTimeUpdate = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    setCurrent(a.currentTime);
    if (a.seeking) return;
    if (isSeekingRef.current) {
      if (Math.abs(a.currentTime - expectedStartTimeRef.current) < 0.15) {
        isSeekingRef.current = false;
      } else {
        return;
      }
    }
    if (stopAtRef.current && a.currentTime >= stopAtRef.current.end - 0.02) {
      a.pause(); setPlayingSegId(null); stopAtRef.current = null;
    }
  }, []);

  const clearAll = () => {
    clearSavedSurahTimings(surahNum); setSegments([]); setPlayingSegId(null);
    stopAtRef.current = null; setWaveform(new Float32Array(0));
    setBoundaryScores(new Float32Array(0)); setQualities([]);
    const a = audioRef.current; if (a) { a.pause(); a.currentTime = 0; }
  };

  const seekTo = (t: number) => { const a = audioRef.current; if (a) a.currentTime = t; };

  const recalculateSegments = useCallback((segs: AudioSegment[]): AudioSegment[] => {
    const sorted = [...segs].sort((a, b) => a.start - b.start);
    const sn = SURAH_NAMES[surahNum] || `سورة ${surahNum}`;
    const lead = Math.max(0, Math.floor(leadingSegments));
    const leadLabel = (u: number) => (lead >= 2 && u === 1) ? "الاستعاذة" : "البسملة";
    // نحافظ على تصنيف المتحدث المكتشف بالطبقة (لا نعيد فرضه بالموضع)،
    // ونرقّم الوحدات بالتكرار مع طرح المقاطع التمهيدية.
    let tU = 0, kU = 0, interU = 0;
    return sorted.map((s) => {
      const isT = s.speaker === "teacher";
      let unit: number;
      if (recitationStyle === "consecutive") {
        unit = isT ? ++tU : ++kU;
      } else {
        if (isT) { interU++; unit = interU; } else { unit = interU > 0 ? interU : 1; }
      }
      const ayahNum = unit - lead;
      const isLead = ayahNum < 1;
      const unitLabel = isLead ? leadLabel(unit) : `آية ${ayahNum}`;
      return {
        ...s,
        ayah: isLead ? 0 : ayahNum,
        label: `${sn} - ${unitLabel} (${isT ? "معلم" : "طفل"})`
      };
    });
  }, [surahNum, recitationStyle, leadingSegments]);

  const setSegmentBoundary = useCallback((index: number, field: "start" | "end", newVal: number) => {
    setSegments(prev => {
      const newSegs = [...prev];
      const s = newSegs[index];
      if (!s) return prev;
      
      const v = Number(Math.max(0, Math.min(duration, newVal)).toFixed(3));
      
      // Validation to prevent overlapping or invalid boundaries
      if (field === "start") {
        if (v >= s.end - 0.05) return prev; // min 50ms length
        if (index > 0 && v < newSegs[index - 1].end) return prev; // prevent overlap with previous
      } else {
        if (v <= s.start + 0.05) return prev; 
        if (index < newSegs.length - 1 && v > newSegs[index + 1].start) return prev; // prevent overlap with next
      }
      
      s[field] = v;
      return newSegs;
    });
  }, [duration]);

  const updateSegmentBoundaries = (index: number, field: "start" | "end", delta: number) => {
    const s = segments[index];
    if (s) setSegmentBoundary(index, field, s[field] + delta);
  };

  // ── إسناد يدوي: تعيين المتحدّث ورقم الآية لكل مقطع بنفسك (يتجاوز الكشف التلقائي) ──
  const segLabel = useCallback((speaker: "teacher" | "kids", ayah: number) => {
    const sn = SURAH_NAMES[surahNum] || `سورة ${surahNum}`;
    const spk = speaker === "teacher" ? "معلم" : "طفل";
    return ayah >= 1 ? `${sn} - آية ${ayah} (${spk})` : `${sn} - تمهيد (${spk})`;
  }, [surahNum]);
  const setSegmentSpeaker = useCallback((index: number, speaker: "teacher" | "kids") => {
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, speaker, label: segLabel(speaker, s.ayah ?? 0) } : s));
  }, [segLabel]);
  const setSegmentAyah = useCallback((index: number, ayah: number) => {
    const a = Math.max(0, Math.floor(ayah) || 0);
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, ayah: a, label: segLabel(s.speaker, a) } : s));
  }, [segLabel]);

  const deleteSegment = useCallback((index: number) => {
    setSegments(prev => {
      const newSegs = [...prev];
      newSegs.splice(index, 1);
      return recalculateSegments(newSegs);
    });
  }, [recalculateSegments]);

  const addSegment = useCallback(() => {
    if (!duration) return;
    const start = current;
    
    // Find nearest next segment
    let nextStart = duration;
    for (const s of segments) {
      if (s.start > start && s.start < nextStart) {
        nextStart = s.start;
      }
    }
    
    const end = Math.min(nextStart, start + 2); // default 2 seconds or up to next segment
    if (end - start < 0.2) return;

    const newSeg: AudioSegment = {
      id: `manual-${Date.now()}`,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      speaker: "teacher", // temp
      ayah: 1 // temp
    };

    setSegments(prev => {
      const newSegs = [...prev, newSeg];
      return recalculateSegments(newSegs);
    });
  }, [current, duration, segments, recalculateSegments]);

  const splitSegment = useCallback(() => {
    const segIdx = segments.findIndex(s => current >= s.start && current <= s.end);
    if (segIdx === -1) return; // not inside any segment
    
    setSegments(prev => {
      const newSegs = [...prev];
      const s = newSegs[segIdx];
      
      if (current - s.start < 0.2 || s.end - current < 0.2) return prev; // Too small to split

      const firstHalf: AudioSegment = { ...s, end: Number(current.toFixed(3)) };
      const secondHalf: AudioSegment = { 
        ...s, 
        id: `split-${Date.now()}`,
        start: Number(current.toFixed(3)),
      };

      newSegs.splice(segIdx, 1, firstHalf, secondHalf);
      return recalculateSegments(newSegs);
    });
  }, [current, segments, recalculateSegments]);

  const activeSegIndex = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--)
      if (current >= segments[i].start && current < segments[i].end) return i;
    return -1;
  }, [current, segments]);

  const stats = useMemo(() => {
    if (segments.length === 0) return null;
    const tC = segments.filter(s => s.speaker === "teacher").length;
    const kC = segments.filter(s => s.speaker === "kids").length;
    const durs = segments.map(s => s.end - s.start);
    const total = durs.reduce((a, b) => a + b, 0);
    const avg = total / durs.length;
    // مقاييس الجودة تُحسب فقط في التقسيم داخل المتصفّح (qualities)؛ التقسيم بالخدمة لا يُرجعها.
    const avgBnd = qualities.length > 0 ? qualities.reduce((s, q) => s + q.boundaryScore, 0) / qualities.length : 0;
    const pValid = qualities.filter(q => q.pitchValid).length;
    const eClean = qualities.filter(q => q.edgeClean).length;
    return { tC, kC, avg, total, min: Math.min(...durs), max: Math.max(...durs), avgBnd, pValid, eClean };
  }, [segments, qualities]);

  return (
    <div className="min-h-screen page-nour text-foreground pb-8" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 space-y-4">

        {/* Header */}
        <header className="pt-5 pb-2">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/" className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-all active:scale-95">
              <ArrowRight className="w-5 h-5" />
            </Link>
            <div className="flex-1 text-center">
              <h1 className="text-2xl font-bold font-amiri text-gradient-gold">
                تقسيم ذكي هجين
              </h1>
              <p className="text-xs text-muted-foreground mt-1">كشف الصمت + Boundary Likelihood = أعلى دقة</p>
            </div>
            <div className="w-10" />
          </div>
        </header>

        {/* اختيار السورة */}
        <div className="card-nour backdrop-blur p-4 space-y-4 animate-fade-up shadow-soft">
          <div>
            <label className="text-sm font-bold text-muted-foreground block mb-2">اختر السورة:</label>
            <select value={surahNum} onChange={(e) => setSurahNum(parseInt(e.target.value, 10))}
              className="w-full p-3 rounded-xl bg-secondary border border-border text-secondary-foreground font-amiri text-lg focus:border-accent/50 focus:ring-2 focus:ring-accent/20 outline-none transition-all">
              {Object.entries(SURAH_NAMES).map(([n, name]) => (
                <option key={n} value={n}>{n} — {name} ({AYAH_COUNTS[parseInt(n, 10)]} آيات)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-bold text-muted-foreground block mb-2">بنية الصوت (يُكتشف تلقائياً — للتجاوز فقط):</label>
            <select value={recitationStyle} onChange={(e) => setRecitationStyle(e.target.value as "interleaved" | "consecutive")}
              className="w-full p-3 rounded-xl bg-secondary border border-border text-secondary-foreground text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/20 outline-none transition-all">
              <option value="interleaved">متناوب آية بآية (معلم ← طفل ← معلم ← طفل)</option>
              <option value="consecutive">متتالي (المعلم كامل السورة ثم الطفل كامل السورة)</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-bold text-muted-foreground block mb-2">المقاطع التمهيدية قبل الآية الأولى:</label>
            <select value={leadingSegments} onChange={(e) => setLeadingSegments(parseInt(e.target.value, 10))}
              className="w-full p-3 rounded-xl bg-secondary border border-border text-secondary-foreground text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/20 outline-none transition-all">
              <option value={1}>بسملة فقط (الافتراضي)</option>
              <option value={2}>استعاذة + بسملة</option>
              <option value={0}>بلا تمهيد (تبدأ بالآية مباشرة)</option>
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">تُحسَب البسملة/الاستعاذة كمقاطع تمهيدية فلا تُرقَّم كآيات.</p>
          </div>
        </div>

        {/* صورة المصحف */}
        <QuranPageViewer surahNum={surahNum} />

        {/* اسم السورة */}
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-accent/30 rounded-2xl p-5 text-center shadow-soft">
          <p className="text-xs text-accent mb-1">السورة المختارة</p>
          <h2 className="text-4xl font-bold font-amiri bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 bg-clip-text text-transparent">
            سورة {SURAH_NAMES[surahNum]}
          </h2>
          <div className="flex items-center justify-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="bg-muted px-3 py-1 rounded-full">{AYAH_COUNTS[surahNum]} آيات</span>
            {segments.length > 0 && <span className="bg-success/15 px-3 py-1 rounded-full text-success">{segments.length} مقطع</span>}
          </div>
        </div>

        {/* مشغل الصوت */}
        <div className="card-nour backdrop-blur p-4 space-y-3">
          <audio ref={audioRef} src={audioPath(surahNum)} crossOrigin="anonymous"
            onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
            onTimeUpdate={onTimeUpdate}
            onSeeked={() => { isSeekingRef.current = false; }}
            onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)} />

          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 mr-[-2px]" />}
            </button>
            <div className="flex-1">
              <input type="range" min={0} max={duration || 0} step={0.001} value={current}
                onChange={(e) => { const a = audioRef.current; if (a) a.currentTime = parseFloat(e.target.value); }}
                className="w-full accent-emerald-500" dir="ltr" />
              <div className="flex justify-between text-xs tabular-nums text-muted-foreground mt-1" dir="ltr">
                <span className="font-bold text-success">{fmt(current)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>
          </div>

          {duration > 0 && (
            <div className="space-y-3">
              {/* Timeline Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-muted p-2 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground ml-2">التكبير (Zoom):</span>
                  <button onClick={() => setZoomLevel(Math.max(1, zoomLevel - 1))} className="p-1.5 rounded-lg bg-secondary text-secondary-foreground hover:brightness-95 transition-colors" title="تصغير">
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-mono w-6 text-center text-success">{zoomLevel}x</span>
                  <button onClick={() => setZoomLevel(Math.min(10, zoomLevel + 1))} className="p-1.5 rounded-lg bg-secondary text-secondary-foreground hover:brightness-95 transition-colors" title="تكبير">
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground ml-2">أدوات:</span>
                  <button onClick={() => splitSegment()} className="px-3 py-1.5 rounded-lg bg-violet-600/20 text-violet-400 hover:bg-violet-600/40 border border-violet-500/30 transition-colors flex items-center gap-1.5 text-xs font-bold" title="قص المقطع الحالي من المنتصف (عند مؤشر التشغيل)">
                    <Scissors className="w-3.5 h-3.5" /> تقسيم
                  </button>
                  <button onClick={() => addSegment()} className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 border border-emerald-500/30 transition-colors flex items-center gap-1.5 text-xs font-bold" title="إضافة مقطع جديد هنا وتحديد لونه تلقائياً حسب ترتيبه">
                    <Plus className="w-3.5 h-3.5" /> إضافة مقطع
                  </button>
                  
                  {/* تراجع / إعادة */}
                  <div className="flex items-center gap-1 border-r border-border pr-2 mr-1">
                    <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 rounded-lg bg-secondary text-secondary-foreground hover:brightness-95 disabled:opacity-30 disabled:hover:brightness-100 transition-all flex items-center justify-center" title="تراجع (Ctrl+Z)">
                      <Undo2 className="w-4 h-4" />
                    </button>
                    <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 rounded-lg bg-secondary text-secondary-foreground hover:brightness-95 disabled:opacity-30 disabled:hover:brightness-100 transition-all flex items-center justify-center" title="إعادة (Ctrl+Y)">
                      <Redo2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              
              <WaveformDisplay waveform={waveform} boundaryScores={boundaryScores} segments={segments}
                duration={duration} currentTime={current} onSeek={seekTo} onBoundaryChange={setSegmentBoundary} onDeleteSegment={deleteSegment} zoomLevel={zoomLevel} />
            </div>
          )}
        </div>

        {/* زر التقسيم */}
        <div className="bg-gradient-to-br from-violet-500/10 via-fuchsia-500/10 to-purple-500/10 border border-violet-500/30 rounded-2xl p-5 space-y-4">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-bold text-foreground font-amiri">المحرك الهجين</h2>
            </div>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              يجمع <b className="text-emerald-300">كشف الصمت</b> (الطريقة المجرّبة) + <b className="text-violet-300">Boundary Likelihood</b> (للأماكن بدون صمت)
            </p>
          </div>

          {splitting && (
            <div className="space-y-2">
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 via-violet-500 to-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }} />
              </div>
              {progress && <div className="bg-background/50 rounded-xl p-3 text-center">
                <p className="text-sm text-accent font-bold animate-pulse">{progress}</p>
              </div>}
            </div>
          )}

          {/* ── التقسيم عبر خدمة Python (أعلى دقة) ── */}
          <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/30 p-3 space-y-2 mb-2">
            <label className="text-xs font-bold text-violet-300 flex items-center gap-1">خدمة التقسيم (دقة عالية)</label>
            <input
              type="url"
              dir="ltr"
              placeholder="https://hammoualiyoucef20-quran-audio.hf.space"
              value={serviceUrl}
              onChange={(e) => { setServiceUrl(e.target.value); try { localStorage.setItem(SERVICE_URL_KEY, e.target.value); } catch { /* ignore */ } }}
              className="w-full p-2 rounded-lg bg-secondary border border-border text-secondary-foreground text-xs outline-none focus:border-violet-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleServiceSplit} disabled={splitting || aiSplitting || !duration || !serviceUrl.trim()}
                className="p-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-1 active:scale-[0.98] transition-all">
                {splitting ? "جارٍ..." : "بالخدمة"}
              </button>
              <button onClick={handleGeminiSplit} disabled={splitting || aiSplitting || !duration || !serviceUrl.trim()}
                className="p-3 rounded-xl bg-gradient-to-r from-sky-600 to-emerald-600 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-1 active:scale-[0.98] transition-all">
                {splitting ? "جارٍ..." : "بـ Gemini"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">متصلة تلقائياً على Hugging Face. <b>بالخدمة</b>: تحليل صوتي سريع. <b>Gemini</b>: ذكاء يفهم المعلم/الطفل (و٣ أصوات) — أبطأ قليلاً. أول طلب بعد الخمول ~٣٠ ثانية.</p>
          </div>

          {segments.length > 0 && (
            <button onClick={linkToShading}
              className="btn-gold w-full p-3 rounded-xl font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] mb-2 shadow-lg">
              <Link2 className="w-5 h-5" /> ربط المقاطع بالتظليل (تظهر في المصحف)
            </button>
          )}

          {/* نتيجة الربط — تظهر بوضوح بعد الربط */}
          {linkResult && (
            <div className={`rounded-xl p-3 mb-2 text-sm font-bold ${linkResult.linked > 0 ? "bg-emerald-500/10 border border-emerald-500/40 text-success" : "bg-amber-500/10 border border-amber-500/40 text-accent"}`}>
              {linkResult.linked > 0 ? (
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-5 h-5" /> نتيجة الربط: رُبطت {linkResult.linked} آية على {linkResult.pages} صفحة</span>
                  <Link to="/" className="inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2"><Volume2 className="w-3.5 h-3.5" /> افتح المصحف لتسمع النتيجة</Link>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <span className="flex items-center gap-1.5"><AlertTriangle className="w-5 h-5" /> لم يُربط شيء — لا توجد مربعات تظليل لهذه السورة</span>
                  <Link to="/calibrate" className="inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2">أنشئ تظليل السورة في المعايرة أولاً ثم اربط</Link>
                </div>
              )}
            </div>
          )}

          <button onClick={handleSplit} disabled={splitting || aiSplitting || !duration}
            className="w-full p-4 rounded-xl bg-gradient-to-r from-emerald-600 via-violet-600 to-fuchsia-600 text-white font-bold text-lg disabled:opacity-40 flex items-center justify-center gap-3 shadow-xl shadow-violet-500/20 hover:shadow-violet-500/40 active:scale-[0.98] transition-all">
            <Wand2 className="w-6 h-6" />
            {splitting ? "جاري التحليل الهجين..." : "تقسيم هجين — في المتصفّح"}
          </button>

          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 h-px bg-border" /><span className="text-xs text-muted-foreground font-bold">أو</span><div className="flex-1 h-px bg-border" />
          </div>

          {aiProfiles.length >= 2 ? (
            <button
              onClick={async () => {
                const a = audioRef.current;
                if (!a || !duration) { toast({ title: "انتظر", variant: "destructive" }); return; }
                setAiSplitting(true); setProgress("");
                try {
                  const { samples, sampleRate } = await decodeAudioFromUrl(a.src);
                  const dr = diarize(samples, sampleRate, aiProfiles, setProgress);
                  const sn = SURAH_NAMES[surahNum] || `سورة ${surahNum}`;
                  let tA = 0, kA = 0;
                  const aiS: AudioSegment[] = dr.map((r, i) => {
                    const ay = r.speaker === "teacher" ? ++tA : ++kA;
                    return { id: `ai-${Date.now()}-${i}`, start: Number(r.start.toFixed(3)), end: Number(r.end.toFixed(3)),
                      speaker: r.speaker, ayah: ay,
                      label: `${sn} - آية ${ay} (${r.speaker === "teacher" ? "معلم" : "طفل"}) [${Math.round(r.confidence * 100)}%]` };
                  });
                  setSegments(aiS); persistSegments(surahNum, aiS);
                  toast({ title: "تم!", description: `${aiS.length} مقطع` });
                } catch (e) { toast({ title: "فشل", description: e instanceof Error ? e.message : "خطأ", variant: "destructive" }); }
                finally { setAiSplitting(false); setProgress(""); }
              }}
              disabled={aiSplitting || splitting || !duration}
              className="w-full p-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white font-bold text-lg disabled:opacity-40 flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-all">
              <Brain className="w-6 h-6" />
              {aiSplitting ? "جاري..." : "تقسيم بالبصمة الصوتية (AI)"}
            </button>
          ) : (
            <div className="w-full p-4 rounded-xl bg-card border-2 border-dashed border-border text-muted-foreground font-bold text-sm flex items-center justify-center gap-3">
              <Brain className="w-5 h-5" /><span>البصمات غير مسجلة — استخدم المحرك الهجين</span>
            </div>
          )}
        </div>

        {/* إحصائيات */}
        {stats && (
          <div className="card-nour backdrop-blur p-4 space-y-4">
            <p className="text-sm font-bold text-success flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> نتائج التقسيم الهجين
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-muted rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{segments.length}</div>
                <div className="text-muted-foreground mt-0.5">مقطع</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">{stats.tC}</div>
                <div className="text-muted-foreground mt-0.5">معلم</div>
              </div>
              <div className="bg-sky-500/10 border border-sky-500/25 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-sky-600">{stats.kC}</div>
                <div className="text-muted-foreground mt-0.5">طفل</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-muted rounded-xl p-2.5 text-center">
                <div className="text-xl font-bold text-violet-400">{stats.avg.toFixed(1)}ث</div><div className="text-muted-foreground">متوسط المقطع</div>
              </div>
              <div className="bg-muted rounded-xl p-2.5 text-center">
                <div className="text-xl font-bold text-fuchsia-400">{stats.min.toFixed(1)}-{stats.max.toFixed(1)}ث</div><div className="text-muted-foreground">نطاق المدة</div>
              </div>
              <div className="bg-muted rounded-xl p-2.5 text-center">
                <div className="text-xl font-bold text-success">{stats.total.toFixed(0)}ث</div><div className="text-muted-foreground">إجمالي</div>
              </div>
            </div>
            {qualities.length > 0 && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-muted rounded-xl p-2.5 flex items-center gap-2">
                  {stats.avgBnd >= 0.2 ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" /> : <AlertTriangle className="w-4 h-4 text-accent shrink-0" />}
                  <div><div className="font-bold text-foreground">حدود</div><div className="text-muted-foreground">{(stats.avgBnd * 100).toFixed(0)}%</div></div>
                </div>
                <div className="bg-muted rounded-xl p-2.5 flex items-center gap-2">
                  {stats.pValid >= qualities.length * 0.6 ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" /> : <Info className="w-4 h-4 text-sky-400 shrink-0" />}
                  <div><div className="font-bold text-foreground">F0</div><div className="text-muted-foreground">{stats.pValid}/{qualities.length}</div></div>
                </div>
                <div className="bg-muted rounded-xl p-2.5 flex items-center gap-2">
                  {stats.eClean >= qualities.length * 0.6 ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" /> : <Info className="w-4 h-4 text-sky-400 shrink-0" />}
                  <div><div className="font-bold text-foreground">ZC</div><div className="text-muted-foreground">{stats.eClean}/{qualities.length}</div></div>
                </div>
              </div>
            )}
            <Link to="/calibrate" onClick={() => persistSegments(surahNum, segments)}
              className="block w-full mt-4 p-4 rounded-xl bg-gradient-to-r from-violet-600/20 via-fuchsia-600/20 to-amber-600/20 border border-violet-500/30 text-center hover:border-violet-400 transition-all active:scale-[0.98]">
              <div className="flex items-center justify-center gap-2 text-violet-300 font-bold">
                <Link2 className="w-5 h-5" /><span>حفظ وربط في صفحة المعايرة</span><ArrowLeft className="w-4 h-4" />
              </div>
            </Link>
          </div>
        )}

        {/* قائمة المقاطع */}
        {segments.length > 0 && (
          <div className="card-nour backdrop-blur p-4">
            <p className="font-bold mb-1 text-sm text-muted-foreground">المقاطع ({segments.length}):</p>
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">صحّح يدوياً: اضغط زرّ <b className="text-amber-600">معلم/طفل</b> للتبديل، وعدّل <b className="text-foreground">رقم الآية</b> بالأسهم لكل مقطع — ثم اضغط «ربط المقاطع بالتظليل» في الأعلى.</p>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {segments.map((seg, i) => {
                const isAct = i === activeSegIndex;
                const isSegP = playingSegId === seg.id;
                const q = qualities[i];
                return (
                  <div key={seg.id} className={`rounded-xl p-3.5 transition-all border ${
                    isAct ? "bg-emerald-500/15 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                      : isSegP ? "bg-violet-500/15 border-violet-500/50"
                      : seg.speaker === "teacher" ? "bg-amber-500/10 border-amber-500/25 hover:border-amber-500/50"
                      : "bg-sky-500/10 border-sky-500/25 hover:border-sky-500/50"
                  }`}>
                    <div className="flex items-center gap-3">
                      <button onClick={() => playSegment(seg)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                        isSegP ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
                          : seg.speaker === "teacher" ? "bg-amber-600/20 text-amber-400 hover:bg-amber-600 hover:text-white"
                          : "bg-sky-600/20 text-sky-400 hover:bg-sky-600 hover:text-white"
                      }`}>
                        {isSegP ? <StopCircle className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={seg.speaker === "teacher" ? "text-amber-400" : "text-sky-400"}>{seg.speaker === "teacher" ? <Mic className="w-4 h-4" /> : <Baby className="w-4 h-4" />}</span>
                          <span className="text-sm font-bold text-foreground truncate block">{seg.label || `مقطع ${i + 1}`}</span>
                        </div>
                        <div className="text-xs font-mono mt-2 flex items-center gap-2 text-muted-foreground">
                          {/* Start Controls */}
                          <div className="flex items-center bg-muted rounded border border-border overflow-hidden">
                            <button onClick={() => updateSegmentBoundaries(i, "start", -0.05)} className="px-1.5 py-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="-50ms"><Minus className="w-3 h-3" /></button>
                            <span className="px-2 py-0.5 text-emerald-400 font-bold min-w-[50px] text-center">{fmt(seg.start)}</span>
                            <button onClick={() => updateSegmentBoundaries(i, "start", 0.05)} className="px-1.5 py-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="+50ms"><Plus className="w-3 h-3" /></button>
                          </div>
                          
                          <span className="text-muted-foreground">→</span>
                          
                          {/* End Controls */}
                          <div className="flex items-center bg-muted rounded border border-border overflow-hidden">
                            <button onClick={() => updateSegmentBoundaries(i, "end", -0.05)} className="px-1.5 py-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="-50ms"><Minus className="w-3 h-3" /></button>
                            <span className="px-2 py-0.5 text-rose-400 font-bold min-w-[50px] text-center">{fmt(seg.end)}</span>
                            <button onClick={() => updateSegmentBoundaries(i, "end", 0.05)} className="px-1.5 py-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="+50ms"><Plus className="w-3 h-3" /></button>
                          </div>
                          
                          <span className="text-[10px] text-muted-foreground ml-1">({(seg.end - seg.start).toFixed(2)}ث)</span>
                        </div>
                        {q && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                              q.snr >= 15 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                                : q.snr >= 8 ? "bg-amber-500/10 border-amber-500/30 text-amber-700"
                                : "bg-red-500/10 border-red-500/30 text-red-700"
                            }`}>SNR {q.snr.toFixed(0)}dB</span>
                            {q.pitchValid && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-700">F0 ✓</span>}
                            {q.edgeClean && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-700">ZC ✓</span>}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-stretch gap-1.5">
                        {/* المتحدّث — اضغط للتبديل يدوياً */}
                        <button onClick={() => setSegmentSpeaker(i, seg.speaker === "teacher" ? "kids" : "teacher")} title="تبديل المتحدّث (معلم/طفل)"
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold text-center border active:scale-95 flex items-center justify-center gap-1 ${
                            seg.speaker === "teacher" ? "bg-amber-500/15 border-amber-500/40 text-amber-700 hover:bg-amber-500/25"
                              : "bg-sky-500/15 border-sky-500/40 text-sky-700 hover:bg-sky-500/25"
                          }`}>
                          {seg.speaker === "teacher" ? <Mic className="w-3 h-3" /> : <Baby className="w-3 h-3" />}
                          {seg.speaker === "teacher" ? "معلم" : "طفل"}
                        </button>
                        {/* رقم الآية — يدوي */}
                        <div className="flex items-center justify-center bg-muted rounded border border-border overflow-hidden">
                          <button onClick={() => setSegmentAyah(i, (seg.ayah ?? 0) - 1)} className="px-1.5 py-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="آية أقل"><Minus className="w-3 h-3" /></button>
                          <span className="px-1 text-[11px] font-bold text-foreground min-w-[44px] text-center">{(seg.ayah ?? 0) < 1 ? "تمهيد" : `آية ${seg.ayah}`}</span>
                          <button onClick={() => setSegmentAyah(i, (seg.ayah ?? 0) + 1)} className="px-1.5 py-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="آية أكثر"><Plus className="w-3 h-3" /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button onClick={clearAll} className="w-full p-3 rounded-xl bg-secondary border border-border text-muted-foreground font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <RotateCcw className="w-4 h-4" /> إعادة من الصفر
        </button>

        {/* شرح */}
        <div className="card-nour p-4 space-y-3">
          <h3 className="text-sm font-bold text-violet-300 flex items-center gap-2">
            <Wand2 className="w-4 h-4" /> كيف يعمل المحرك الهجين؟
          </h3>
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <div className="flex gap-2">
              <span className="text-emerald-400 font-bold shrink-0">①</span>
              <span><b className="text-foreground">كشف الصمت</b> — Schmitt Trigger بعتبات ديناميكية + ZCR + توسيع حواف (الطريقة المجرّبة التي تعمل ممتاز عند وجود فواصل)</span>
            </div>
            <div className="flex gap-2">
              <span className="text-violet-400 font-bold shrink-0">②</span>
              <span><b className="text-foreground">Boundary Likelihood</b> — لتقسيم المناطق الطويلة عند تغيّرات الطيف والنغمة (يعمل حتى بدون صمت)</span>
            </div>
            <div className="flex gap-2">
              <span className="text-amber-400 font-bold shrink-0">③</span>
              <span><b className="text-foreground">ضبط دقيق</b> — Zero-Crossing + SNR + F0 + تصحيح تلقائي</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecitationMethods;
