'use strict';
function near(a, b, eps){ return Math.abs(a - b) <= eps; }
function assert(c, m){ if (!c) throw new Error(m || 'assert'); }
function mkSine(sr, dur, fq, am){
  const n = Math.floor(sr * dur), a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = am * Math.sin(2 * Math.PI * fq * i / sr);
  return a;
}
function mkSil(sr, dur){ return new Float32Array(Math.floor(sr * dur)); }
function mkCat(parts){
  let n = 0, i;
  for (i = 0; i < parts.length; i++) n += parts[i].length;
  const o = new Float32Array(n); let p = 0;
  for (i = 0; i < parts.length; i++){ o.set(parts[i], p); p += parts[i].length; }
  return o;
}
async function runAllTests(){
  const R = [];
  async function check(name, fn){
    try { await fn(); R.push({ name: name, ok: true }); }
    catch (e){ R.push({ name: name, ok: false, err: String((e && e.message) || e) }); }
  }
  await check('FILEORDER', async function(){
    const files = ['10.mp3', '2.mp3', '1.mp3', 'x.mp3'];
    files.sort(function(a, b){ return numericFileOrder(a) - numericFileOrder(b); });
    assert(files.join(',') === '1.mp3,2.mp3,10.mp3,x.mp3', 'order');
    assert(numericFileOrder('abc') === Number.MAX_SAFE_INTEGER, 'nan');
  });
  await check('MERGE', async function(){
    const mf = Math.round(MIN_SEG_MS / FRAME_MS);
    const long1 = 100 + mf + 10;
    let out = mergeShortSegments([[0, 10], [11, 15], [100, long1]]);
    assert(out.length === 1 && out[0][0] === 0 && out[0][1] === long1, 'chain=' + JSON.stringify(out));
    out = mergeShortSegments([[0, 5], [200, 200 + mf + 20]]);
    assert(out.length === 1 && out[0][0] === 0, 'first-short=' + JSON.stringify(out));
    out = mergeShortSegments([[0, mf + 5], [500, 505], [900, 900 + mf + 5]]);
    assert(out.length === 2 && out[0][1] === 505, 'middle=' + JSON.stringify(out));
  });
  await check('THRESH', async function(){
    const r = new Float32Array(400); r.fill(0.5);
    const th = computeLocalThreshold(r);
    let s = 0, i;
    for (i = 0; i < th.length; i++) s += th[i];
    s /= th.length;
    assert(th.length === 400 && near(s, 0.5 * Math.pow(10, 4 / 20), 0.06), 'th=' + s);
  });
  await check('SILENCE', async function(){
    rms = new Float32Array(300); rms.fill(0.5);
    let i;
    for (i = 100; i < 120; i++) rms[i] = 0.01;
    for (i = 200; i < 208; i++) rms[i] = 0.01;
    threshArr = new Float32Array(300); threshArr.fill(0.1);
    const segs = autoDetect(120, 60);
    assert(segs.length === 2, 'segs=' + JSON.stringify(segs));
    assert(weakDips.length === 1 && weakDips[0] === 204, 'weak');
  });
  await check('RMS', async function(){
    sampleRate = 8000;
    monoData = mkSine(8000, 1.0, 100, 0.5);
    computeRMS();
    let s = 0, i;
    for (i = 0; i < rms.length; i++) s += rms[i];
    s /= rms.length;
    assert(rms.length === 100 && s > 0.30 && s < 0.42, 'rms=' + s);
  });
  await check('PITCH-GATE', async function(){
    sampleRate = 8000;
    monoData = mkCat([mkSil(8000, 1.0), mkSine(8000, 1.5, 150, 0.5)]);
    computeRMS(); threshArr = computeLocalThreshold(rms);
    computePitchTrack();
    assert(pitchF0 && pitchF0.length > 10, 'track');
    let voiced = 0;
    for (let i = 0; i < pitchF0.length; i++) if (pitchF0[i] > 0) voiced++;
    assert(voiced >= 10, 'voiced-pure=' + voiced);
    const med = medianF0Range(1.2, 2.0);
    assert(Math.abs(med - 150) < 40, 'med=' + med);
  });
  await check('PITCHSIL', async function(){
    sampleRate = 16000;
    monoData = mkSil(16000, 1.0);
    computeRMS(); threshArr = computeLocalThreshold(rms);
    computePitchTrack();
    let voiced = 0;
    for (let i = 0; i < pitchF0.length; i++) if (pitchF0[i] > 0) voiced++;
    assert(voiced <= 2, 'voiced=' + voiced);
    assert(isNaN(medianF0Range(0, 0.9)), 'nan');
  });
  await check('PIPELINE', async function(){
    sampleRate = 8000; resultOnlyMode = false;
    monoData = mkCat([mkSine(8000, 1.5, 130, 0.5), mkSil(8000, 0.5), mkSine(8000, 1.5, 260, 0.5)]);
    computeRMS(); threshArr = computeLocalThreshold(rms);
    computePitchTrack();
    const segs = runDetection(120, 60);
    assert(segs.length === 2, 'segs=' + JSON.stringify(segs));
    const d0 = frameToSec(segs[0][1]) - frameToSec(segs[0][0]);
    const d1 = frameToSec(segs[1][1]) - frameToSec(segs[1][0]);
    assert(d0 > 1.0 && d1 > 1.0, 'dur=' + d0 + '/' + d1);
  });
  await check('FALLBACK', async function(){
    pitchF0 = null; pitchHopSec = 0; pitchClusterHz = null;
    classifySegmentRoles([[0, 10], [11, 20], [21, 30]]);
    assert(segmentRoles.length === 3, 'len');
    assert(roleOf(0) !== roleOf(1), 'alt');
    assert(segmentFileName(2).length > 0, 'name');
  });
  await check('WAV', async function(){
    if (typeof Blob === 'undefined') return;
    sampleRate = 8000;
    monoData = mkSine(8000, 0.1, 440, 0.5);
    computeRMS(); threshArr = computeLocalThreshold(rms);
    const blob = sliceToWavBlob(0, 0.1);
    assert(blob.size === 44 + 800 * 2, 'size=' + blob.size);
    const buf = Buffer.from(await blob.arrayBuffer());
    assert(buf.toString('ascii', 0, 4) === 'RIFF', 'riff');
    assert(buf.toString('ascii', 8, 12) === 'WAVE', 'wave');
    assert(buf.readUInt32LE(24) === 8000, 'sr');
    assert(buf.readUInt16LE(34) === 16, 'bits');
  });
  await check('FRAMES', async function(){
    sampleRate = 8000;
    assert(frameToSample(100) === 100 * Math.floor(8000 * FRAME_MS / 1000), 'fs=' + frameToSample(100));
    assert(near(frameToSec(100), frameToSample(100) / 8000, 0.0001), 'sec=' + frameToSec(100));
    sampleRate = 16000;
    assert(frameToSample(100) === 100 * Math.floor(16000 * FRAME_MS / 1000), 'fs2');
  });
  return R;
}
runAllTests().then(function(R){ console.log('__RESULTS__' + JSON.stringify(R)); }).catch(function(e){ console.log('__RESULTS__' + JSON.stringify([{ name: 'HARNESS', ok: false, err: String((e && e.message) || e) }])); });
