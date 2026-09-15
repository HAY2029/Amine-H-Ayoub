import localCorpus from "../data/localQuranCorpus.json";

export interface SpeechRegion {
  start: number;
  end: number;
}

export async function alignAyahsViterbi(
  rawRegions: SpeechRegion[],
  data: Float32Array,
  sr: number,
  surahId: number,
  ayahCount: number,
  onProgress?: (msg: string) => void
): Promise<{ teacherRegions: SpeechRegion[]; kidsRegions: SpeechRegion[] }> {
  // 1. Get text locally to estimate durations
  const localMatch = (localCorpus as Array<{
    std: number;
    ayahs: Array<{ n?: number; number?: number; text: string }>;
  }>).find(s => s.std === surahId);
  let ayahs = localMatch ? localMatch.ayahs : [];
  
  if (!ayahs.length) {
    try {
      const response = await fetch(`https://api.alquran.cloud/v1/surah/${surahId}`);
      if (response.ok) {
        const surahData = await response.json();
        ayahs = surahData?.data?.ayahs || [];
      }
    } catch {
      // ignore network errors
    }
  }

  // Calculate character length of each ayah to estimate expected relative duration
  const ayahLengths = ayahs.length >= ayahCount 
    ? ayahs.slice(0, ayahCount).map((a: { text: string }) => a.text.length)
    : Array(ayahCount).fill(30);
  
  // We assume the audio format is: Teacher Ayah 1, Kids Ayah 1, Teacher Ayah 2, Kids Ayah 2...
  // Or Teacher entire Surah, then Kids entire Surah.
  // Viterbi will find the best path. To simplify, we will group the raw regions into exactly `ayahCount * 2` segments based on duration.

  // Clean raw regions: merge micro gaps (< 0.2s)
  const merged: SpeechRegion[] = [];
  if (rawRegions.length > 0) {
    let current = { ...rawRegions[0] };
    for (let i = 1; i < rawRegions.length; i++) {
      const next = rawRegions[i];
      if (next.start - current.end < 0.2) {
        current.end = next.end;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
  }

  if (onProgress) {
    onProgress(`Viterbi Debug: raw=${rawRegions.length}, merged=${merged.length}, target=${ayahCount * 2}`);
  }

  // If we have fewer regions than ayahCount * 2, we just return them split evenly (fallback)
  if (merged.length < ayahCount * 2) {
      if (onProgress) onProgress(`تحذير: عدد المقاطع المكتشفة (${merged.length}) أقل من المطلوب (${ayahCount * 2}). سنستخدم التقسيم الاحتياطي.`);
      // Fallback
      return fallbackSplit(merged, ayahCount);
  }

  // Dynamic Programming (Viterbi-like) to group `merged` into exactly `ayahCount * 2` blocks
  // We want to partition `merged` into `K = ayahCount * 2` contiguous partitions.
  // The cost of a partition for Ayah i (Teacher or Kids) is how much its duration deviates from the expected duration.
  
  const K = ayahCount * 2;
  const N = merged.length;
  
  // expected base duration for 1 character (roughly 0.1s in slow recitation)
  const charDuration = 0.15; 
  const expectedDurations: number[] = [];
  for (let i = 0; i < K; i++) {
    const ayahIdx = Math.floor(i / 2); // 0,0, 1,1, 2,2... (Teacher, Kids interleaved)
    expectedDurations.push(ayahLengths[ayahIdx] * charDuration);
  }

  // dp[k][i] = min cost to form k partitions using first i regions
  const dp: number[][] = Array(K + 1).fill(0).map(() => Array(N + 1).fill(Infinity));
  const parent: number[][] = Array(K + 1).fill(0).map(() => Array(N + 1).fill(0));
  
  dp[0][0] = 0;

  for (let k = 1; k <= K; k++) {
    for (let i = k; i <= N; i++) {
      // Try all valid previous boundaries j
      for (let j = k - 1; j < i; j++) {
        // Calculate duration of partition merging regions j to i-1
        const partitionStart = merged[j].start;
        const partitionEnd = merged[i - 1].end;
        const actualDur = partitionEnd - partitionStart;
        const expectedDur = expectedDurations[k - 1];
        
        // Cost is squared difference of durations + a penalty for large gaps inside the partition
        let gapPenalty = 0;
        for(let m = j; m < i - 1; m++) {
           gapPenalty += (merged[m+1].start - merged[m].end);
        }

        const cost = Math.pow(actualDur - expectedDur, 2) + gapPenalty * 2;

        if (dp[k - 1][j] + cost < dp[k][i]) {
          dp[k][i] = dp[k - 1][j] + cost;
          parent[k][i] = j;
        }
      }
    }
  }

  // Backtrack
  const boundaries = [];
  let curr = N;
  for (let k = K; k > 0; k--) {
    const prev = parent[k][curr];
    boundaries.unshift({ startIdx: prev, endIdx: curr - 1 });
    curr = prev;
  }

  const teacherRegions: SpeechRegion[] = [];
  const kidsRegions: SpeechRegion[] = [];

  for (let k = 0; k < K; k++) {
    const b = boundaries[k];
    const region = {
      start: merged[b.startIdx].start,
      end: merged[b.endIdx].end
    };
    if (k % 2 === 0) {
      teacherRegions.push(region);
    } else {
      kidsRegions.push(region);
    }
  }

  return { teacherRegions, kidsRegions };
}

function fallbackSplit(regions: SpeechRegion[], ayahCount: number) {
  const teacherRegions = [];
  const kidsRegions = [];
  for(let i=0; i < regions.length; i++) {
      if (i % 2 === 0) teacherRegions.push(regions[i]);
      else kidsRegions.push(regions[i]);
  }
  return { teacherRegions, kidsRegions };
}
