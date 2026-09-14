const FRAME_MS = 10;
const SMOOTH_WIN = 3;
const WINDOW_SEC = 30;
const NOISE_PCT = 5;
const MARGIN_DB = 4;
const DEFAULT_MIN_SIL_MS = 120;
const DEFAULT_MIN_WEAK_MS = 60;
const SENSITIVITY_FLOOR_MS = 18;
const MIN_SEG_MS = 700;
const BATCH_CHUNK_SIZE = 10;
const PITCH_CLUSTER_MIN_GAP_HZ = 45;
const PITCH_SWITCH_MARGIN_RATIO = 0.35;
const PITCH_EVAL_WINDOW_SEC = 0.45;
const PITCH_EVAL_GUARD_SEC = 0.08;
const PITCH_DOWNSAMPLE = 4;
const PITCH_FRAME_MS = 40;
const PITCH_HOP_MS = 30;
const PITCH_FMIN = 70;
const PITCH_FMAX = 450;
const PITCH_CONF_MIN = 0.28;
const PITCH_MIN_VOICED = 4;
const PITCH_MIN_GAP_HZ = 40;

let curMinSil = DEFAULT_MIN_SIL_MS;
let curMinWeak = DEFAULT_MIN_WEAK_MS;

let audioCtx, audioBuffer, monoData, sampleRate;
let rms = [];
let threshArr = null;
let segments = [];
let weakDips = [];
let pitchF0 = null, pitchHopSec = 0;
let pitchClusterHz = null;
let segmentRoles = [];
let resultOnlyMode = false;
let history = [];
let audioEls = [];
let reviewIndex = -1;
let diagnosticIssueMap = new Map();

const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const folderBtn = document.getElementById('folderBtn');
const directoryPickerBtn = document.getElementById('directoryPickerBtn');
const surahSelect = document.getElementById('surahSelect');
const folderNote = document.getElementById('folderNote');
const batchBtn = document.getElementById('batchBtn');
const batchStatus = document.getElementById('batchStatus');
let selectedFolderFiles = [];
const tool = document.getElementById('tool');
const statusEl = document.getElementById('status');
const waveWrap = document.getElementById('waveWrap');
const canvas = document.getElementById('wave');
const ctx2d = canvas.getContext('2d');
const ayahList = document.getElementById('ayahList');
const ayahCount = document.getElementById('ayahCount');
const sensMeta = document.getElementById('sensMeta');
const diagnoseMeta = document.getElementById('diagnoseMeta');
const focusBtn = document.getElementById('focusBtn');
const bestBtn = document.getElementById('bestBtn');
const fileNameEl = document.getElementById('fileName');
const fileMetaEl = document.getElementById('fileMeta');
const reviewBtn = document.getElementById('reviewBtn');
const diagnoseBtn = document.getElementById('diagnoseBtn');

drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('hover'); });
drop.addEventListener('dragleave', () => drop.classList.remove('hover'));
drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('hover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});
folderBtn.addEventListener('click', () => folderInput.click());
directoryPickerBtn.addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    folderBtn.click();
    return;
  }

  try {
    const dirHandle = await window.showDirectoryPicker();
    const files = [];

    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file') continue;
      if (!/\.(mp3|wav|m4a|ogg|webm)$/i.test(entry.name)) continue;
      const file = await entry.getFile();
      file._entryName = entry.name;
      files.push(file);
    }

    if (!files.length) {
      folderNote.textContent = 'لم يتم العثور على ملفات صوتية داخل المجلد المحدد';
      folderNote.style.display = 'inline';
      return;
    }

    handleFolderFiles(files);
  } catch (error) {
    folderNote.textContent = 'تم إلغاء اختيار المجلد أو تعذر الوصول إليه';
    folderNote.style.display = 'inline';
  }
});
folderInput.addEventListener('change', e => {
  const files = Array.from(e.target.files)
    .filter(file => /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name));
  handleFolderFiles(files);
});

function handleFolderFiles(files){
  const sorted = files
    .filter(file => /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name))
    .sort((a, b) => numericFileOrder(a.name) - numericFileOrder(b.name));

  if (!sorted.length) return;

  selectedFolderFiles = sorted;
  batchBtn.disabled = false;
  surahSelect.innerHTML = '';
  sorted.forEach(file => {
    const option = document.createElement('option');
    option.value = file.name;
    option.textContent = 'السورة ' + file.name.replace(/\.[^.]+$/, '');
    surahSelect.appendChild(option);
  });
  surahSelect._files = sorted;
  surahSelect.style.display = 'inline-block';
  folderNote.textContent = 'تم العثور على ' + sorted.length + ' تسجيلًا';
  folderNote.style.display = 'inline';
  handleFile(sorted[0]);
}

surahSelect.addEventListener('change', () => {
  const file = surahSelect._files && surahSelect._files.find(item => item.name === surahSelect.value);
  if (file) handleFile(file);
});
document.getElementById('resetBtn').addEventListener('click', () => {
  stopReview();
  resultOnlyMode = false;
  curMinSil = DEFAULT_MIN_SIL_MS;
  curMinWeak = DEFAULT_MIN_WEAK_MS;
  segments = runDetection(curMinSil, curMinWeak);
  render();
});
bestBtn.addEventListener('click', () => {
  stopReview();
  resultOnlyMode = true;
  curMinSil = 220;
  curMinWeak = 120;
  segments = runDetection(curMinSil, curMinWeak);
  render();
});
focusBtn.addEventListener('click', () => {
  stopReview();
  resultOnlyMode = false;
  curMinSil = curMinWeak;
  curMinWeak = Math.max(SENSITIVITY_FLOOR_MS, Math.round(curMinWeak/2));
  segments = runDetection(curMinSil, curMinWeak);
  render();
});
reviewBtn.addEventListener('click', () => {
  if (reviewIndex===-1) startReview(); else stopReview();
});
diagnoseBtn.addEventListener('click', () => {
  stopReview();
  const issues = analyzeSegmentsForIssues();
  renderList();

  if (issues.length) {
    diagnoseMeta.style.display = 'block';
    diagnoseMeta.textContent = 'كشف أخطاء: ' + issues.map(item => '#' + (item.index + 1) + ' — ' + item.reason).join(' • ');
    requestAnimationFrame(() => {
      const firstIssue = issues[0].index;
      if (audioEls[firstIssue]) {
        audioEls[firstIssue].currentTime = 0;
        audioEls[firstIssue].play().catch(() => {});
      }
    });
  } else {
    diagnoseMeta.style.display = 'block';
    diagnoseMeta.textContent = 'كشف أخطاء: لا توجد أخطاء واضحة في التقسيم الحالي.';
  }
});
document.getElementById('downloadAllBtn').addEventListener('click', downloadAll);
batchBtn.addEventListener('click', downloadBatch);

function numericFileOrder(name){
  const number = Number.parseInt(name, 10);
  return Number.isNaN(number) ? Number.MAX_SAFE_INTEGER : number;
}

async function handleFile(file){
  reviewIndex = -1;
  reviewBtn.textContent = 'تدقيق ▶';
  resultOnlyMode = false;
  curMinSil = DEFAULT_MIN_SIL_MS;
  curMinWeak = DEFAULT_MIN_WEAK_MS;
  tool.classList.add('show');
  waveWrap.style.display = 'none';
  statusEl.style.display = 'flex';
  fileNameEl.textContent = file.name;
  fileMetaEl.textContent = (file.size/1024/1024).toFixed(1) + ' MB';

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuf = await file.arrayBuffer();
  audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
  sampleRate = audioBuffer.sampleRate;

  const ch0 = audioBuffer.getChannelData(0);
  if (audioBuffer.numberOfChannels > 1){
    const ch1 = audioBuffer.getChannelData(1);
    monoData = new Float32Array(ch0.length);
    for (let i=0;i<ch0.length;i++) monoData[i] = (ch0[i]+ch1[i])/2;
  } else {
    monoData = ch0;
  }

  computeRMS();
  threshArr = computeLocalThreshold(rms);
  computePitchTrack();
  segments = runDetection(curMinSil, curMinWeak);
  render();

  statusEl.style.display = 'none';
  waveWrap.style.display = 'block';
}

function computeRMS(){
  const frameLen = Math.floor(sampleRate * FRAME_MS/1000);
  const nFrames = Math.floor(monoData.length / frameLen);
  const raw = new Float32Array(nFrames);
  for (let f=0; f<nFrames; f++){
    let sum=0;
    const off = f*frameLen;
    for (let i=0;i<frameLen;i++){
      const v = monoData[off+i];
      sum += v*v;
    }
    raw[f] = Math.sqrt(sum/frameLen + 1e-9);
  }

  const w = SMOOTH_WIN;
  const half = Math.floor(w/2);
  rms = new Float32Array(nFrames);
  for (let f=0; f<nFrames; f++){
    const lo = Math.max(0, f-half);
    const hi = Math.min(nFrames-1, f+half);
    let s=0;
    for (let i=lo;i<=hi;i++) s += raw[i];
    rms[f] = s/(hi-lo+1);
  }
}

function computeLocalThreshold(rms){
  const n = rms.length;
  const winFrames = Math.max(10, Math.round(WINDOW_SEC*1000/FRAME_MS));
  const half = Math.floor(winFrames/2);
  const step = Math.max(1, Math.floor(winFrames/4));

  const idxs = [];
  for (let i=0; i<n; i+=step) idxs.push(i);
  if (idxs[idxs.length-1] !== n-1) idxs.push(n-1);

  const blockThresh = idxs.map(i => {
    const lo = Math.max(0, i-half);
    const hi = Math.min(n, i+half);
    const seg = Array.from(rms.subarray(lo, hi)).sort((a,b)=>a-b);
    const noise = seg[Math.floor(seg.length*NOISE_PCT/100)];
    return noise * Math.pow(10, MARGIN_DB/20);
  });

  const thresh = new Float32Array(n);
  let seg0 = 0;
  for (let f=0; f<n; f++){
    while (seg0 < idxs.length-2 && idxs[seg0+1] < f) seg0++;
    const x0 = idxs[seg0], x1 = idxs[seg0+1];
    const y0 = blockThresh[seg0], y1 = blockThresh[seg0+1];
    thresh[f] = x1===x0 ? y0 : y0 + (y1-y0) * (f-x0)/(x1-x0);
  }
  return thresh;
}

function autoDetect(minSilMs, minWeakMs){
  const framesPerMinSil = Math.max(1, Math.round(minSilMs/FRAME_MS));
  const framesPerMinWeak = Math.max(1, Math.round(minWeakMs/FRAME_MS));

  const segs = [];
  weakDips = [];
  let speechStart = null;
  let silStart = null;
  let silCount = 0;
  for (let i=0;i<rms.length;i++){
    if (rms[i] > threshArr[i]){
      if (speechStart===null) speechStart = i;
      if (silStart!==null && silCount>=framesPerMinWeak && silCount<framesPerMinSil){
        weakDips.push(Math.round((silStart+i-1)/2));
      }
      silStart = null;
      silCount = 0;
    } else {
      if (speechStart!==null){
        if (silStart===null) silStart = i;
        silCount++;
        if (silCount >= framesPerMinSil){
          segs.push([speechStart, i-silCount]);
          speechStart = null;
          silStart = null;
          silCount = 0;
        }
      }
    }
  }
  if (speechStart!==null) segs.push([speechStart, rms.length-1]);
  if (!segs.length) return [[0, rms.length-1]];
  return mergeShortSegments(segs);
}

function mergeShortSegments(segs){
  const minSegFrames = Math.round(MIN_SEG_MS/FRAME_MS);
  const merged = [];
  for (const s of segs){
    if (merged.length && (s[1]-s[0]) < minSegFrames){
      merged[merged.length-1][1] = s[1];
    } else {
      merged.push(s.slice());
    }
  }
  while (merged.length > 1 && (merged[0][1]-merged[0][0]) < minSegFrames){
    merged[1][0] = merged[0][0];
    merged.shift();
  }
  return merged;
}

function computePitchTrack(){
  const dsRate = sampleRate / PITCH_DOWNSAMPLE;
  const dsLen = Math.floor(monoData.length / PITCH_DOWNSAMPLE);
  const ds = new Float32Array(dsLen);
  for (let i=0;i<dsLen;i++){
    const off = i*PITCH_DOWNSAMPLE;
    let s = 0;
    for (let k=0;k<PITCH_DOWNSAMPLE;k++) s += monoData[off+k];
    ds[i] = s/PITCH_DOWNSAMPLE;
  }

  const frameLen = Math.round(dsRate*PITCH_FRAME_MS/1000);
  const hopLen = Math.round(dsRate*PITCH_HOP_MS/1000);
  const lagMin = Math.max(1, Math.floor(dsRate/PITCH_FMAX));
  const lagMax = Math.min(frameLen-1, Math.ceil(dsRate/PITCH_FMIN));
  const nFrames = Math.max(0, 1 + Math.floor((dsLen-frameLen)/hopLen));

  const win = new Float32Array(frameLen);
  for (let i=0;i<frameLen;i++) win[i] = 0.5 - 0.5*Math.cos(2*Math.PI*i/(frameLen-1));

  const f0 = new Float32Array(nFrames);
  const frame = new Float64Array(frameLen);
  for (let fi=0; fi<nFrames; fi++){
    const offDs = fi*hopLen;
    const tSec = offDs/dsRate;
    const rmsIdx = Math.min(rms.length-1, Math.max(0, Math.round(tSec*1000/FRAME_MS)));
    if (rms[rmsIdx] <= threshArr[rmsIdx]){ f0[fi] = 0; continue; }

    let sum0 = 0;
    for (let i=0;i<frameLen;i++){
      const v = ds[offDs+i]*win[i];
      frame[i] = v;
      sum0 += v*v;
    }
    if (sum0 < 1e-9){ f0[fi] = 0; continue; }

    let bestLag = -1, bestVal = -Infinity;
    for (let lag=lagMin; lag<=lagMax; lag++){
      let s = 0;
      const lim = frameLen-lag;
      for (let i=0;i<lim;i++) s += frame[i]*frame[i+lag];
      if (s > bestVal){ bestVal = s; bestLag = lag; }
    }
    const conf = bestLag>0 ? (bestVal/sum0) : 0;
    f0[fi] = (bestLag>0 && conf>=PITCH_CONF_MIN) ? dsRate/bestLag : 0;
  }
  pitchF0 = f0;
  pitchHopSec = hopLen/dsRate;
}

function medianF0Range(t0Sec, t1Sec){
  if (!pitchF0 || pitchHopSec<=0) return NaN;
  const i0 = Math.max(0, Math.floor(t0Sec/pitchHopSec));
  const i1 = Math.min(pitchF0.length, Math.ceil(t1Sec/pitchHopSec));
  const vals = [];
  for (let i=i0;i<i1;i++) if (pitchF0[i] > 0) vals.push(pitchF0[i]);
  if (vals.length < PITCH_MIN_VOICED) return NaN;
  vals.sort((a,b)=>a-b);
  const mid = Math.floor(vals.length/2);
  return vals.length%2 ? vals[mid] : (vals[mid-1]+vals[mid])/2;
}

function computePitchClusterThreshold(segs){
  const meds = [];
  segs.forEach(s => {
    const m = medianF0Range(s[0]*FRAME_MS/1000, s[1]*FRAME_MS/1000);
    if (!isNaN(m)) meds.push(m);
  });

  if (meds.length < 6) return null;
  meds.sort((a,b)=>a-b);

  let bestGap = -1, bestIdx = -1;
  for (let i=1;i<meds.length;i++){
    const gap = meds[i]-meds[i-1];
    if (gap > bestGap){ bestGap = gap; bestIdx = i; }
  }

  if (bestGap < PITCH_CLUSTER_MIN_GAP_HZ) return null;
  if (bestIdx <= 0 || bestIdx >= meds.length) return null;

  return (meds[bestIdx] + meds[bestIdx-1]) / 2;
}

function promoteWeakDipsByVoice(segs){
  if (pitchClusterHz===null || !weakDips.length) return segs;

  const promote = new Set();
  const minGapHz = Math.max(35, pitchClusterHz * PITCH_SWITCH_MARGIN_RATIO);

  weakDips.forEach(f => {
    const tSec = f*FRAME_MS/1000;
    const before = medianF0Range(Math.max(0, tSec-PITCH_EVAL_WINDOW_SEC), Math.max(0, tSec-PITCH_EVAL_GUARD_SEC));
    const after  = medianF0Range(tSec+PITCH_EVAL_GUARD_SEC, tSec+PITCH_EVAL_WINDOW_SEC);

    if (isNaN(before) || isNaN(after)) return;

    const beforeNearBoundary = Math.abs(before - pitchClusterHz) < 18;
    const afterNearBoundary = Math.abs(after - pitchClusterHz) < 18;
    if (beforeNearBoundary || afterNearBoundary) return;

    const beforeRole = before < pitchClusterHz ? 'معلم' : 'طفل';
    const afterRole = after < pitchClusterHz ? 'معلم' : 'طفل';
    if (beforeRole === afterRole) return;
    if (Math.abs(before - after) < minGapHz) return;

    promote.add(f);
  });

  if (!promote.size) return segs;

  const result = [];
  segs.forEach(s => {
    const cuts = weakDips.filter(f => promote.has(f) && f > s[0] && f < s[1]).sort((a,b)=>a-b);
    let start = s[0];
    cuts.forEach(f => {
      result.push([start, f]);
      start = f + 1;
    });
    result.push([start, s[1]]);
  });

  weakDips = weakDips.filter(f => !promote.has(f));
  return result;
}

function classifySegmentRoles(segs){
  let lastKnownRole = null;
  segmentRoles = segs.map((s, idx) => {
    if (pitchClusterHz!==null){
      const med = medianF0Range(s[0]*FRAME_MS/1000, s[1]*FRAME_MS/1000);
      if (!isNaN(med)) {
        lastKnownRole = med < pitchClusterHz ? 'معلم' : 'طفل';
        return lastKnownRole;
      }
    }

    if (lastKnownRole) return lastKnownRole;
    return (idx % 2 === 0) ? 'معلم' : 'طفل';
  });
}

function runDetection(minSil, minWeak){
  let segs = autoDetect(minSil, minWeak);

  if (resultOnlyMode){
    segs = mergeShortSegments(segs);
    pitchClusterHz = null;
    segmentRoles = segs.map((_, idx) => (idx % 2 === 0) ? 'معلم' : 'طفل');
    return segs;
  }

  pitchClusterHz = computePitchClusterThreshold(segs);
  segs = mergeShortSegments(promoteWeakDipsByVoice(segs));
  classifySegmentRoles(segs);
  return segs;
}

function frameToSample(f){ return f * Math.floor(sampleRate*FRAME_MS/1000); }
function frameToSec(f){ return frameToSample(f)/sampleRate; }

function render(){
  drawWave();
  renderList();
}

function drawWave(){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 140 * dpr;
  ctx2d.setTransform(dpr,0,0,dpr,0,0);
  const W = rect.width, H = 140;
  ctx2d.clearRect(0,0,W,H);

  segments.forEach((s, idx) => {
    const x1 = (s[0]/rms.length)*W;
    const x2 = (s[1]/rms.length)*W;
    ctx2d.fillStyle = idx%2===0 ? 'rgba(28,74,65,0.06)' : 'rgba(180,134,58,0.08)';
    ctx2d.fillRect(x1, 0, x2-x1, H);
  });

  if (reviewIndex>=0 && reviewIndex<segments.length){
    const s = segments[reviewIndex];
    const x1 = (s[0]/rms.length)*W;
    const x2 = (s[1]/rms.length)*W;
    ctx2d.fillStyle = 'rgba(180,134,58,0.22)';
    ctx2d.fillRect(x1, 0, x2-x1, H);
  }

  ctx2d.fillStyle = '#2E6E5F';
  const step = Math.max(1, Math.floor(rms.length / W));
  let max = 0;
  for (let i=0;i<rms.length;i++) if (rms[i]>max) max = rms[i];
  for (let x=0; x<W; x++){
    const idx = Math.floor(x/W*rms.length);
    const v = rms[idx]/ (max||1);
    const h = Math.max(1, v*H*0.85);
    ctx2d.fillRect(x, (H-h)/2, 1, h);
  }

  ctx2d.strokeStyle = '#B4863A';
  ctx2d.lineWidth = 2;
  segments.forEach(s => {
    const x1 = (s[0]/rms.length)*W;
    const x2 = (s[1]/rms.length)*W;
    ctx2d.beginPath(); ctx2d.moveTo(x1,0); ctx2d.lineTo(x1,H); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.moveTo(x2,0); ctx2d.lineTo(x2,H); ctx2d.stroke();
  });

  ctx2d.save();
  ctx2d.strokeStyle = 'rgba(91,83,70,0.55)';
  ctx2d.lineWidth = 1.5;
  ctx2d.setLineDash([3,3]);
  weakDips.forEach(f => {
    const x = (f/rms.length)*W;
    ctx2d.beginPath(); ctx2d.moveTo(x, H*0.22); ctx2d.lineTo(x, H*0.78); ctx2d.stroke();
  });
  ctx2d.restore();
}

canvas.addEventListener('click', e => {
  stopReview();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const frac = x / rect.width;
  let frame = Math.round(frac * rms.length);

  const snapTolFrames = Math.round((10/rect.width) * rms.length);
  let nearest = null, nearestDist = Infinity;
  weakDips.forEach(f => {
    const d = Math.abs(f-frame);
    if (d < nearestDist){ nearestDist = d; nearest = f; }
  });
  if (nearest!==null && nearestDist <= snapTolFrames) frame = nearest;

  let segIdx = -1;
  for (let i=0;i<segments.length;i++){
    if (frame >= segments[i][0] && frame <= segments[i][1]){ segIdx = i; break; }
  }

  saveHistory();

  if (segIdx >= 0){
    const s = segments[segIdx];
    if (frame - s[0] > 10 && s[1] - frame > 10){
      segments.splice(segIdx, 1, [s[0], frame], [frame, s[1]]);
    }
  } else {
    let left = -1, right = -1;
    for (let i=0;i<segments.length;i++){
      if (segments[i][1] <= frame) left = i;
      if (segments[i][0] >= frame && right===-1) right = i;
    }
    if (left>=0 && right>=0 && right===left+1){
      segments.splice(left, 2, [segments[left][0], segments[right][1]]);
    } else {
      history.pop();
    }
  }
  classifySegmentRoles(segments);
  render();
});

function saveHistory(){
  history.push(JSON.stringify(segments));
  if (history.length > 30) history.shift();
}

function startReview(){
  if (!segments.length) return;
  reviewBtn.textContent = 'إيقاف ⏸';
  playReviewIndex(0);
}

function stopReview(){
  if (reviewIndex===-1) return;
  const el = audioEls[reviewIndex];
  if (el){ el.pause(); }
  reviewIndex = -1;
  reviewBtn.textContent = 'تدقيق ▶';
  highlightReviewRow(-1);
}

function playReviewIndex(idx){
  if (idx<0 || idx>=segments.length){ stopReview(); return; }
  reviewIndex = idx;
  highlightReviewRow(idx);
  const el = audioEls[idx];
  el.currentTime = 0;
  el.play();
}

function highlightReviewRow(idx){
  document.querySelectorAll('.ayah-row.reviewing').forEach(el => el.classList.remove('reviewing'));
  if (idx>=0){
    const row = document.getElementById('ayah-row-'+idx);
    if (row){
      row.classList.add('reviewing');
      row.scrollIntoView({behavior:'smooth', block:'nearest'});
    }
  }
  if (rms.length) drawWave();
}

function roleOf(idx){
  return (segmentRoles && segmentRoles[idx]) || ((idx % 2 === 0) ? 'معلم' : 'طفل');
}
function segmentFileName(idx){
  const role = roleOf(idx);
  let n = 0;
  for (let i=0;i<idx;i++) if (roleOf(i) === role) n++;
  return n === 0 ? role : (role + '-' + n);
}

function analyzeSegmentsForIssues(){
  const issues = [];
  diagnosticIssueMap = new Map();

  segments.forEach((s, idx) => {
    const dur = Math.max(0, frameToSec(s[1]) - frameToSec(s[0]));
    let reason = '';

    if (dur < 0.8) {
      reason = 'مقطع قصير جدًا';
    } else if (dur > 15) {
      reason = 'مقطع طويل جدًا قد يجمع أكثر من آية';
    } else {
      let silentFrames = 0;
      for (let i=s[0]; i<=s[1]; i++) {
        if (rms[i] <= threshArr[i]) silentFrames++;
      }
      const silentRatio = silentFrames / Math.max(1, s[1] - s[0] + 1);
      if (silentRatio > 0.22) reason = 'توقف داخل المقطع';
    }

    if (reason) {
      const issue = { index: idx, reason, duration: dur };
      diagnosticIssueMap.set(idx, issue);
      issues.push(issue);
    }
  });

  if (!issues.length) {
    diagnoseMeta.textContent = 'كشف أخطاء: لا توجد أخطاء واضحة في التقسيم الحالي.';
    diagnoseMeta.style.display = 'block';
  }

  return issues;
}

function renderList(){
  ayahCount.textContent = segments.length + ' آية';

  const atFloor = curMinSil <= SENSITIVITY_FLOOR_MS && curMinWeak <= SENSITIVITY_FLOOR_MS;
  sensMeta.textContent = 'حد فصل السكتات الحالي: ' + curMinSil + 'ms — سكتات محتملة لم تُقسَّم بعد: ' + weakDips.length;
  focusBtn.disabled = atFloor;
  focusBtn.textContent = atFloor ? 'دقّق أكثر (بلغ أقصى دقّة)' : 'دقّق أكثر';

  ayahList.innerHTML = '';
  audioEls = [];
  if (!segments.length){
    ayahList.innerHTML = '<div class="empty-note">لا توجد مقاطع مكتشفة</div>';
    return;
  }
  segments.forEach((s, idx) => {
    const startSec = frameToSec(s[0]);
    const endSec = frameToSec(s[1]);
    const dur = endSec - startSec;
    const issue = diagnosticIssueMap.get(idx);

    const row = document.createElement('div');
    row.className = 'ayah-row';
    row.id = 'ayah-row-' + idx;

    const num = document.createElement('div');
    num.className = 'ayah-num';
    num.textContent = idx+1;

    const roleEl = document.createElement('div');
    roleEl.className = 'ayah-role';
    roleEl.textContent = roleOf(idx);

    const issueEl = document.createElement('div');
    issueEl.className = 'ayah-issue';
    issueEl.textContent = issue ? issue.reason : '';
    if (!issue) issueEl.style.display = 'none';

    const durEl = document.createElement('div');
    durEl.className = 'ayah-dur';
    durEl.textContent = dur.toFixed(1) + ' ث';

    const audioEl = document.createElement('audio');
    audioEl.controls = true;
    audioEl.src = URL.createObjectURL(sliceToWavBlob(startSec, endSec));
    audioEl.addEventListener('play', () => { if (reviewIndex!==idx) stopReview(); });
    audioEl.addEventListener('ended', () => { if (reviewIndex===idx) playReviewIndex(idx+1); });
    audioEls.push(audioEl);

    const dlBtn = document.createElement('button');
    dlBtn.className = 'icon-btn';
    dlBtn.title = 'تنزيل: ' + segmentFileName(idx) + '.wav';
    dlBtn.textContent = '⬇';
    dlBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = audioEl.src;
      a.download = segmentFileName(idx) + '.wav';
      a.click();
    });

    row.appendChild(num);
    row.appendChild(roleEl);
    row.appendChild(issueEl);
    row.appendChild(durEl);
    row.appendChild(audioEl);
    row.appendChild(dlBtn);
    ayahList.appendChild(row);
  });
}

function sliceToWavBlob(startSec, endSec){
  const startSample = Math.floor(startSec*sampleRate);
  const endSample = Math.min(monoData.length, Math.floor(endSec*sampleRate));
  const slice = monoData.subarray(startSample, endSample);
  return encodeWav(slice, sampleRate);
}

function encodeWav(samples, sr){
  const buffer = new ArrayBuffer(44 + samples.length*2);
  const view = new DataView(buffer);
  writeStr(view,0,'RIFF');
  view.setUint32(4, 36+samples.length*2, true);
  writeStr(view,8,'WAVE');
  writeStr(view,12,'fmt ');
  view.setUint32(16,16,true);
  view.setUint16(20,1,true);
  view.setUint16(22,1,true);
  view.setUint32(24,sr,true);
  view.setUint32(28,sr*2,true);
  view.setUint16(32,2,true);
  view.setUint16(34,16,true);
  writeStr(view,36,'data');
  view.setUint32(40, samples.length*2, true);
  let off=44;
  for (let i=0;i<samples.length;i++,off+=2){
    let v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, v<0 ? v*0x8000 : v*0x7FFF, true);
  }
  return new Blob([view], {type:'audio/wav'});
}
function writeStr(view, offset, str){
  for (let i=0;i<str.length;i++) view.setUint8(offset+i, str.charCodeAt(i));
}

async function downloadAll(){
  const zip = new JSZip();
  segments.forEach((s, idx) => {
    const blob = sliceToWavBlob(frameToSec(s[0]), frameToSec(s[1]));
    zip.file(segmentFileName(idx) + '.wav', blob);
  });
  const content = await zip.generateAsync({type:'blob'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = 'ayat.zip';
  a.click();
}

async function downloadBatch(){
  if (!selectedFolderFiles.length || batchBtn.disabled) return;
  stopReview();
  batchBtn.disabled = true;
  batchStatus.style.display = 'block';
  batchStatus.textContent = 'جارٍ تقسيم السور...';

  const totalFiles = selectedFolderFiles.length;
  const chunks = [];
  for (let i=0; i<totalFiles; i += BATCH_CHUNK_SIZE) {
    chunks.push(selectedFolderFiles.slice(i, i + BATCH_CHUNK_SIZE));
  }

  const allFailures = [];

  try {
    for (let chunkIndex=0; chunkIndex<chunks.length; chunkIndex++){
      const chunkFiles = chunks[chunkIndex];
      const zip = new JSZip();
      const failures = [];

      batchStatus.textContent = 'جارٍ معالجة مجموعة ' + (chunkIndex + 1) + ' من ' + chunks.length + ' (' + chunkFiles.length + ' ملفًا)';

      for (let i=0; i<chunkFiles.length; i++){
        const file = chunkFiles[i];
        const globalIndex = selectedFolderFiles.indexOf(file);
        batchStatus.textContent = 'جارٍ تحليل ' + (globalIndex + 1) + ' من ' + totalFiles + ': ' + file.name;

        try {
          await handleFile(file);
          const folderName = 'surah_' + String(numericFileOrder(file.name)).padStart(3, '0');
          const folder = zip.folder(folderName);
          segments.forEach((segment, idx) => {
            const blob = sliceToWavBlob(frameToSec(segment[0]), frameToSec(segment[1]));
            folder.file(segmentFileName(idx) + '.wav', blob);
          });
        } catch (error){
          failures.push(file.name);
        }
      }

      if (Object.keys(zip.files).length) {
        if (failures.length) {
          zip.file('failed-files.txt', failures.join('\n'));
        }

        batchStatus.textContent = 'جارٍ إنشاء ZIP المجموعة ' + (chunkIndex + 1) + ' من ' + chunks.length + '...';
        const content = await zip.generateAsync({type:'blob'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = 'quran-segments-' + (chunkIndex + 1).toString().padStart(2, '0') + '.zip';
        a.click();
      }

      allFailures.push(...failures);
    }

    batchStatus.textContent = allFailures.length
      ? 'اكتمل تقسيم المجموعات مع تعذّر معالجة ' + allFailures.length + ' ملفًا.'
      : 'اكتمل تقسيم ' + totalFiles + ' ملفًا في مجموعات ZIP متعددة.';
  } catch (error){
    batchStatus.textContent = 'تعذّر إنشاء أحد ملفات ZIP.';
  } finally {
    batchBtn.disabled = false;
  }
}

window.addEventListener('resize', () => { if (segments.length) drawWave(); });
/* ===== Legendary UX upgrade (appended) ===== */
(function(){
"use strict";
const gid=id=>document.getElementById(id);
function toast(m,gold){try{const b=gid('toasts');if(!b)return;const d=document.createElement('div');d.className='toast'+(gold?' gold':'');d.textContent=m;b.appendChild(d);setTimeout(()=>{d.style.opacity='0';d.style.transition='opacity .4s';setTimeout(()=>d.remove(),450);},2600);}catch(e){}}
window.legendToast=toast;
try{const al0=document.getElementById('ayahList');}catch(e){}
const fmtT=t=>{t=Math.max(0,Math.floor(t));return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');};
try{
const ex2=document.getElementById('exportJsonBtn');
if(ex2)ex2.onclick=()=>{
 if(!segments.length){(window.legendToast||alert)('لا توجد مقاطع بعد');return;}
 const fr=10/1000;
 const data=segments.map((s,i)=>({ayah:i+1,start_sec:+(s[0]*fr).toFixed(2),end_sec:+(s[1]*fr).toFixed(2),role:(segmentRoles[i]||''),file:segmentFileName(i)+'.wav'}));
 const blob=new Blob([JSON.stringify({surah:(typeof surahNum!=='undefined'?surahNum:null),count:data.length,segments:data},null,2)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='timestamps.json';a.click();
 (window.legendToast||(()=>{}))('⏱ تم تصدير الطوابع الزمنية',true);
};
}catch(e){}
try{
const cvT=document.getElementById('wave'),wtT=document.getElementById('waveTime');
if(cvT&&wtT){
 const updT=()=>{
  let cur=0,dur=0;
  const act=document.querySelector('.ayah-row audio');
  if(audioBuffer)dur=audioBuffer.duration;
  document.querySelectorAll('.ayah-row audio').forEach(a=>{if(!a.paused){cur=a.currentTime||0;}});
  wtT.textContent=fmtT(cur)+' / '+fmtT(dur);
 };
 setInterval(updT,500);
}
}catch(e){}
try{
const origRender=window.renderList;
}catch(e){}
const obs2=new MutationObserver(()=>{try{if(window.legendApplyFilter)window.legendApplyFilter();}catch(e){}});
try{const al2=document.getElementById('ayahList');if(al2)obs2.observe(al2,{childList:true});}catch(e){}
try{
const bp2=document.getElementById('batchProgress'),bb2=document.getElementById('batchProgressBar'),bs2=document.getElementById('batchStatus');
if(bs2&&bp2){
 const mo2=new MutationObserver(()=>{
  const t2=bs2.textContent||'';
  const m2=t2.match(/(\d+)\s*من\s*(\d+)/);
  if(m2&&+m2[2]>0){bp2.hidden=false;if(bb2)bb2.style.width=Math.round(+m2[1]/+m2[2]*100)+'%';}
  else if(/اكتمل|تعذّر/.test(t2)){if(bb2)bb2.style.width='100%';setTimeout(()=>{bp2.hidden=true;},2500);}
  else if(/جارٍ/.test(t2)){bp2.hidden=false;}
 });
 mo2.observe(bs2,{childList:true,characterData:true,subtree:true});
}
}catch(e){}
try{
const tp2=document.getElementById('topProgress'),st2=document.getElementById('status');
if(tp2&&st2){new MutationObserver(()=>{tp2.style.display=st2.style.display==='block'?'block':'none';}).observe(st2,{attributes:true,attributeFilter:['style']});}
}catch(e){}
try{
const dr2=document.getElementById('drop');
if(dr2){dr2.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();document.getElementById('fileInput').click();}});}
document.addEventListener('keydown',e=>{
 if(e.key===' '&&/BODY|CANVAS|BUTTON/.test((document.activeElement||{}).tagName||'')&&!/INPUT|SELECT|TEXTAREA/.test((document.activeElement||{}).tagName||'')){e.preventDefault();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){const uZ=document.getElementById('undoBtn');if(uZ&&!uZ.disabled){e.preventDefault();uZ.click();}}
 if(e.key.toLowerCase()==='f'&&!/INPUT|SELECT|TEXTAREA/.test((document.activeElement||{}).tagName||'')){const fF=document.getElementById('focusBtn');if(fF&&fF.offsetParent){fF.click();}}
});
}catch(e){}
try{
const si2=document.getElementById('searchInput'),rf2=document.getElementById('roleFilter'),sm2=document.getElementById('statMini');
function applyFilter2(){
 const q2=(si2&&si2.value||'').trim();const r2=rf2?rf2.value:'';let vis2=0,tot2=0;
 document.querySelectorAll('.ayah-row').forEach(row2=>{
  tot2++;const n2=row2.querySelector('.ayah-num');const num2=n2?n2.textContent.trim():'';
  const roleEl2=row2.querySelector('.ayah-role');const role2=roleEl2?roleEl2.textContent:'';
  const iss2=row2.querySelector('.ayah-issue');
  let ok2=true;if(q2&&!num2.includes(q2))ok2=false;
  if(r2==='issue'&&!iss2)ok2=false;else if(r2&&r2!=='issue'&&!role2.includes(r2))ok2=false;
  row2.style.display=ok2?'':'none';if(ok2)vis2++;
 });
 if(sm2)sm2.textContent=tot2?('عرض '+vis2+' من '+tot2):'';
}
if(si2)si2.addEventListener('input',applyFilter2);
if(rf2)rf2.addEventListener('change',applyFilter2);
window.legendApplyFilter=applyFilter2;
}catch(e){}
window.legendToastB=toast;
try{
const rootB=document.documentElement,ttB=document.getElementById('themeToggle');
const savedB=localStorage.getItem('miqsam-theme');if(savedB)rootB.setAttribute('data-theme',savedB);
if(ttB){ttB.textContent=rootB.getAttribute('data-theme')==='dark'?'☀️':'🌙';ttB.onclick=()=>{const n=rootB.getAttribute('data-theme')==='dark'?'light':'dark';rootB.setAttribute('data-theme',n);localStorage.setItem('miqsam-theme',n);ttB.textContent=n==='dark'?'☀️':'🌙';toast(n==='dark'?'🌙 وضع ليلي مريح':'☀️ وضع نهاري مشرق');if(segments.length)drawWave();};}
const hdB=document.getElementById('helpDialog');const hbB=document.getElementById('helpBtn');const hcB=document.getElementById('helpClose');if(hbB&&hdB){hbB.onclick=()=>{try{hdB.showModal();}catch(e){hdB.setAttribute('open','');}};}if(hcB&&hdB){hcB.onclick=()=>hdB.close();}
}catch(e){}
window.addEventListener('error',e=>{if(/JSZip|jszip/i.test(String(e.message||'')))toast('تعذّر تحميل مكتبة ZIP — تحقق من الإنترنت');});
let undoStackB=[];
function snapB(){try{if(!segments||!segments.length)return;undoStackB.push(JSON.stringify(segments));if(undoStackB.length>60)undoStackB.shift();const uB=document.getElementById('undoBtn');if(uB)uB.disabled=false;}catch(e){}}
window.legendSnap=snapB;
try{
const cvB=document.getElementById('wave');
if(cvB)cvB.addEventListener('click',()=>snapB(),true);
['focusBtn','bestBtn','resetBtn','diagnoseBtn'].forEach(id=>{const bB=document.getElementById(id);if(bB)bB.addEventListener('click',()=>snapB(),true);});
const uB2=document.getElementById('undoBtn');if(uB2)uB2.onclick=()=>{if(!undoStackB.length){toast('لا يوجد ما تتراجع عنه');return;}try{segments=JSON.parse(undoStackB.pop());if(!undoStackB.length)uB2.disabled=true;labelAndRender('تم التراجع');toast('تم التراجع');}catch(e2){}};
}catch(e){}
})();
