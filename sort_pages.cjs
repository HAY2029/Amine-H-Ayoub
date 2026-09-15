const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseKey = envVars.VITE_SUPABASE_PUBLISHABLE_KEY || envVars.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const normalizeImageKey = (raw) => {
  if (!raw) return null;
  const trimmed = raw.replace(/^\/+/, "");
  if (trimmed.startsWith("custom:") || trimmed.startsWith("custom/")) {
    const rest = trimmed.startsWith("custom:") ? trimmed.slice("custom:".length) : trimmed.slice("custom/".length);
    return `custom:${rest}`;
  }
  const name = trimmed.replace(/^pages\//, "");
  return name ? `/pages/${name}` : null;
};

let customPagesCache = [];
const pageNumForKey = (src) => {
  if (/fatiha/i.test(src)) return 1;
  if (/^custom:/i.test(String(src || ""))) {
    const cp = customPagesCache.find(p => p.src === src);
    if (cp && cp.name) {
      if (/fatiha|فاتحة/i.test(cp.name)) return 1;
      const m = cp.name.match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
    return Number.MAX_SAFE_INTEGER;
  }
  const m = String(src || "").match(/(\d+)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(m[1], 10);
  return n;
};

async function run() {
  console.log("Fetching custom pages meta...");
  const { data: metaData } = await supabase.from("store").select("value").eq("key", "mushaf:customPages:v1").maybeSingle();
  if (metaData && Array.isArray(metaData.value)) {
    customPagesCache = metaData.value;
  }

  console.log("Fetching bucket images...");
  const allSrcs = new Set();

  const { data: root } = await supabase.storage.from("mushaf-images").list();
  if (root) {
    const dirs = [];
    root.forEach(f => {
      if (f.metadata && f.metadata.size) {
        if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)) allSrcs.add(normalizeImageKey(f.name));
      } else {
        dirs.push(f.name);
      }
    });
    
    for (const d of dirs) {
      const { data: files } = await supabase.storage.from("mushaf-images").list(d);
      if (files) {
        files.forEach(f => {
          if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)) allSrcs.add(normalizeImageKey(`${d}/${f.name}`));
        });
      }
    }
  }
  
  console.log("Fetching store images...");
  const { data: storeImgs } = await supabase.from("store").select("key").like("key", "mushaf:pageImg:%");
  if (storeImgs) {
      storeImgs.forEach(r => {
          const id = r.key.replace("mushaf:pageImg:", "");
          allSrcs.add(normalizeImageKey(id));
      });
  }

  // Also include the local default pages just in case
  const LOCAL_PAGES = [
    "fatiha.jpg",
    ...[581, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598].map(n => `${n}.jpg`),
    ...[600, 601, 602, 603, 604].map(n => `${n}.jpg`),
  ];
  LOCAL_PAGES.forEach(p => allSrcs.add(`/pages/${p}`));

  let srcs = Array.from(allSrcs).filter(Boolean);
  
  const seen = new Set();
  const seenNums = new Set();
  const out = [];
  
  srcs.forEach(raw => {
      const key = normalizeImageKey(String(raw || ""));
      if (!key || seen.has(key)) return;
      
      const num = pageNumForKey(key);
      if (num !== Number.MAX_SAFE_INTEGER) {
          if (seenNums.has(num)) return; // Deduplicate by number
          seenNums.add(num);
      }
      
      seen.add(key);
      out.push(key);
  });
  
  out.sort((a, b) => {
      const numA = pageNumForKey(a);
      const numB = pageNumForKey(b);
      const d = numA - numB;
      return d !== 0 ? d : a.localeCompare(b);
  });
  
  console.log(`Sorted ${out.length} pages.`);
  console.log(out);
  
  const { error } = await supabase.from("store").upsert({ key: "mushaf:pageOrder:v1", value: out });
  if (error) {
      console.error("Failed to update Supabase:", error);
  } else {
      console.log("Successfully updated Supabase!");
  }
}

run().catch(console.error);
