'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app.js');
const HTML = path.join(ROOT, 'index.html');
const CSS = path.join(ROOT, 'style.css');
const TESTS = path.join(__dirname, 'sandbox-tests.js');
let pass = 0, failN = 0;
function ok(n){ pass++; console.log('  PASS ' + n); }
function bad(n, e){ failN++; console.log('  FAIL ' + n + (e ? ' -- ' + e : '')); }
function extractFunction(src, name){
  const key = 'function ' + name + '(';
  const k = src.indexOf(key);
  if (k === -1) throw new Error('not found: ' + name);
  let i = src.indexOf('{', k);
  if (i === -1) throw new Error('no brace: ' + name);
  let depth = 0, quote = null, lineC = false, blockC = false;
  for (let j = i; j < src.length; j++){
    const c = src[j], nx = src[j + 1];
    if (lineC){ if (c === '\n') lineC = false; continue; }
    if (blockC){ if (c === '*' && nx === '/'){ blockC = false; j++; } continue; }
    if (quote){ if (c === '\\'){ j++; continue; } if (c === quote) quote = null; continue; }
    if (c === '/' && nx === '/'){ lineC = true; j++; continue; }
    if (c === '/' && nx === '*'){ blockC = true; j++; continue; }
    if (c === '"' || c === "'" || c === '`'){ quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}'){ depth--; if (depth === 0) return src.slice(k, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

function main(){
  console.log('--- miqsam tests ---\n');
  [['app.js', APP], ['index.html', HTML], ['style.css', CSS], ['sandbox-tests.js', TESTS]].forEach(function(x){
    if (fs.existsSync(x[1]) && fs.statSync(x[1]).size > 0) ok('file: ' + x[0]);
    else bad('file: ' + x[0]);
  });
  const appSrc = fs.readFileSync(APP, 'utf8');
  const htmlSrc = fs.readFileSync(HTML, 'utf8');
  const cssSrc = fs.readFileSync(CSS, 'utf8');
  try { new vm.Script(appSrc, { filename: 'app.js' }); ok('app.js syntax OK'); }
  catch (e){ bad('app.js syntax', e.message); }
  if (appSrc.indexOf('+$m[') !== -1) bad('typo +$m[');
  else ok('no +$m[ typo');
  const constNames = ['FRAME_MS','SMOOTH_WIN','WINDOW_SEC','NOISE_PCT','MARGIN_DB','DEFAULT_MIN_SIL_MS','DEFAULT_MIN_WEAK_MS','SENSITIVITY_FLOOR_MS','MIN_SEG_MS','BATCH_CHUNK_SIZE','PITCH_CLUSTER_MIN_GAP_HZ','PITCH_SWITCH_MARGIN_RATIO','PITCH_EVAL_WINDOW_SEC','PITCH_EVAL_GUARD_SEC','PITCH_DOWNSAMPLE','PITCH_FRAME_MS','PITCH_HOP_MS','PITCH_FMIN','PITCH_FMAX','PITCH_CONF_MIN','PITCH_MIN_VOICED','PITCH_MIN_GAP_HZ'];
  let constsSrc = '', constsOk = true;
  constNames.forEach(function(n){
    const m = appSrc.match(new RegExp('^const\\s+' + n + '\\s*=\\s*[^;]+;', 'm'));
    if (!m){ constsOk = false; bad('missing const ' + n); }
    else constsSrc += m[0] + '\n';
  });
  if (constsOk) ok('23 consts in sync');
  const funcNames = ['numericFileOrder','computeRMS','computeLocalThreshold','autoDetect','mergeShortSegments','computePitchTrack','medianF0Range','computePitchClusterThreshold','promoteWeakDipsByVoice','classifySegmentRoles','runDetection','frameToSample','frameToSec','roleOf','segmentFileName','analyzeSegmentsForIssues','sliceToWavBlob','encodeWav','writeStr'];
  let funcsSrc = '', funcsOk = true;
  funcNames.forEach(function(n){
    try { funcsSrc += extractFunction(appSrc, n) + '\n'; }
    catch (e){ funcsOk = false; bad('extract ' + n, e.message); }
  });
  if (funcsOk) ok('19 real functions extracted');
  if (constsOk && funcsOk){
    const testsSrc = fs.readFileSync(TESTS, 'utf8');
    const genPath = path.join(__dirname, '.sandbox.gen.js');
    const prelude = 'let sampleRate=0, monoData=null, rms=new Float32Array(0), threshArr=new Float32Array(0), segments=[], weakDips=[], pitchF0=null, pitchHopSec=0, pitchClusterHz=null, segmentRoles=[], resultOnlyMode=false, diagnosticIssueMap=new Map(), curMinSil=120, curMinWeak=60;\nconst diagnoseMeta={textContent:"",style:{}};\n';
    fs.writeFileSync(genPath, prelude + constsSrc + '\n' + funcsSrc + '\n' + testsSrc, 'utf8');
    try {
      const out = execFileSync(process.execPath, [genPath], { encoding: 'utf8', timeout: 90000 });
      const line = out.split('\n').filter(function(l){ return l.indexOf('__RESULTS__') === 0; })[0];
      if (!line) throw new Error('no results. head: ' + out.slice(0, 1500));
      JSON.parse(line.replace('__RESULTS__', '')).forEach(function(r){
        if (r.ok) ok(r.name); else bad(r.name, r.err);
      });
    } catch (e){ bad('sandbox run', String((e && e.message) || e).slice(0, 400)); }
    try { fs.unlinkSync(genPath); } catch (e){}
  }
  const ids = ['drop','fileInput','folderInput','folderBtn','directoryPickerBtn','surahSelect','batchBtn','batchStatus','batchProgress','tool','status','waveWrap','wave','waveTime','ayahList','ayahCount','sensMeta','diagnoseMeta','focusBtn','bestBtn','resetBtn','diagnoseBtn','reviewBtn','downloadAllBtn','fileName','fileMeta','undoBtn','exportJsonBtn','searchInput','roleFilter','statMini','themeToggle','helpBtn','helpDialog','helpClose','toasts','topProgress'];
  const missing = ids.filter(function(id){ return htmlSrc.indexOf('id="' + id + '"') === -1; });
  if (!missing.length) ok('HTML ids present');
  else bad('HTML ids missing', missing.join(','));
  if (htmlSrc.indexOf('./app.js') !== -1 && htmlSrc.indexOf('./style.css') !== -1) ok('HTML links app+css');
  else bad('HTML links');
  if (/jszip/i.test(htmlSrc)) ok('JSZip linked');
  else bad('JSZip missing');
  const opens = (cssSrc.match(/\{/g) || []).length, closes = (cssSrc.match(/\}/g) || []).length;
  if (opens === closes && opens > 0) ok('CSS braces balanced');
  else bad('CSS braces', opens + ' vs ' + closes);
  ['.toast', '.card', '[data-theme', '.batch-progress', '@media'].forEach(function(s){
    if (cssSrc.indexOf(s) !== -1) ok('CSS has ' + s);
    else bad('CSS missing ' + s);
  });
  console.log('TOTAL: ' + pass + ' passed, ' + failN + ' failed');
  if (failN){ console.log('RESULT: FAIL'); process.exitCode = 1; }
  else console.log('RESULT: LEGENDARY ALL GREEN');
}
main();
