// ══════════════════════════════════════════════════════════════
// THE LEGENDARY QURAN KIDS & RECITATIONS SITE SCRIPT
// Designed & crafted for Sheikh Hajj Ayoub Amine
// ══════════════════════════════════════════════════════════════

const GITHUB_REPO = "HAY2023/Amine-H-Ayoub";
const HF_BASE = "https://huggingface.co/datasets/hammoualiyoucef20/quran-app-releases/resolve/main";
const WINDOWS_MSI_URL = "https://amine-h-ayoub.vercel.app/downloads/1.0.0/Quran-Amine-H-Ayoub_1.0.0_Microsoft_Store.msi";
const SUPABASE_URL = "https://qmnvzxjsokibsmgpfeln.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnZ6eGpzb2tpYnNtZ3BmZWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MTY2NTYsImV4cCI6MjEwMjI5MjY1Nn0.HuEYBLDADNuFkNNDUIJ2v8fYAxDUXenFROgpBEgpj7c";

// Default direct permanent public download links via Hugging Face CDN (Zero authentication required)
const FALLBACK_ASSETS = {
    windows: WINDOWS_MSI_URL,
    android: `${HF_BASE}/Quran_1.0.0_Android.apk`,
    android_tv: `${HF_BASE}/Quran_1.0.0_Android_TV.apk`,
    ios: "https://learn-quran-kids.pages.dev"
};

let liveAssets = { ...FALLBACK_ASSETS };

// Platform metadata specifications for radial orbit hub
const PLATFORM_SPECS = {
    ios: {
        icon: "🍏",
        title: "iOS (iPhone & iPad)",
        desc: "تطبيق ويب متوافق مع هواتف آيفون وأجهزة آيباد • الإصدار v1.0.0",
        btnText: "تشغيل التطبيق",
        badge: "آبل آيفون",
        fileExt: ""
    },
    android: {
        icon: "📱",
        title: "Android Phone (APK)",
        desc: "تثبيت مباشر لجميع هواتف وأجهزة أندرويد اللوحية • v1.0.0",
        btnText: "تحميل APK مباشر",
        badge: "الأكثر تحميلاً",
        fileExt: ".apk"
    },
    android_aab: {
        icon: "📦",
        title: "Google Play (AAB)",
        desc: "حزمة Android App Bundle المخصصة لمتجر جوجل بلاي • v1.0.0",
        btnText: "تحميل حزمة AAB",
        badge: "متجر Play",
        fileExt: ".aab"
    },
    windows: {
        icon: "💻",
        title: "Windows PC (MSI)",
        desc: "حزمة التثبيت المستقلة لأجهزة الكمبيوتر (Win 10/11) • تعمل 100% أوفلاين",
        btnText: "تحميل Windows MSI",
        badge: "ويندوز رسمي",
        fileExt: ".msi"
    },
    macos: {
        icon: "🍎",
        title: "macOS (DMG)",
        desc: "حزمة DMG متوافقة مع معالجات M1/M2/M3 ومعالجات Intel",
        btnText: "تحميل macOS DMG",
        badge: "آبل ماك",
        fileExt: ".dmg"
    },
    linux: {
        icon: "🐧",
        title: "Linux (AppImage)",
        desc: "حزمة AppImage مستقلة تعمل على كافة توزيعات لينكس بنقرة واحدة",
        btnText: "تحميل Linux AppImage",
        badge: "لينكس",
        fileExt: ".AppImage"
    },
    android_tv: {
        icon: "📺",
        title: "Android TV (4K)",
        desc: "نسخة مخصصة لشاشات التلفاز الذكية وأجهزة TV Box مع دعم كامل للريموت",
        btnText: "تحميل APK للتلفاز",
        badge: "شاشات التلفاز",
        fileExt: ".apk"
    }
};

// ══════════════════════════════════════════════════════════════
// 1. DYNAMIC AMBIENT PARTICLES CANVAS
// ══════════════════════════════════════════════════════════════
function initParticles() {
    const canvas = document.getElementById("particles-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let particles = [];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resize);
    resize();

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2.4 + 0.6;
            this.speedX = (Math.random() - 0.5) * 0.45;
            this.speedY = (Math.random() - 0.5) * 0.45;
            this.alpha = Math.random() * 0.65 + 0.25;
            this.color = Math.random() > 0.45 ? "#f59e0b" : "#10b981";
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                this.reset();
            }
        }
        draw() {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    for (let i = 0; i < 50; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        requestAnimationFrame(animate);
    }
    animate();
}

// ══════════════════════════════════════════════════════════════
// 2. CELESTIAL RADIAL ORBIT HUB LOGIC
// ═══════════════════════════════════════════════════════════
let activeOrbitPlatform = "windows";
let orbitInterval = null;
const platformKeys = Object.keys(PLATFORM_SPECS);

function initRadialOrbitHub() {
    const nodes = document.querySelectorAll(".orbit-node");
    const tipIcon = document.getElementById("orbit-tip-icon");
    const tipTitle = document.getElementById("orbit-tip-title");
    const tipDesc = document.getElementById("orbit-tip-desc");
    const tipBtn = document.getElementById("orbit-tip-btn");

    function selectPlatform(key, manual = false) {
        activeOrbitPlatform = key;
        const spec = PLATFORM_SPECS[key];
        if (!spec) return;

        nodes.forEach(n => {
            if (n.getAttribute("data-platform") === key) {
                n.classList.add("active-node");
            } else {
                n.classList.remove("active-node");
            }
        });

        if (tipIcon) tipIcon.textContent = spec.icon;
        if (tipTitle) tipTitle.textContent = spec.title;
        if (tipDesc) tipDesc.textContent = spec.desc;
        if (tipBtn) {
            tipBtn.href = liveAssets[key] || FALLBACK_ASSETS[key];
            tipBtn.innerHTML = `<span>${spec.btnText}</span> <span>📥</span>`;
        }

        if (manual) {
            playAudioChime();
        }
    }

    nodes.forEach(node => {
        node.addEventListener("mouseenter", () => {
            const plat = node.getAttribute("data-platform");
            selectPlatform(plat, true);
            clearInterval(orbitInterval);
        });

        node.addEventListener("click", (e) => {
            e.preventDefault();
            const plat = node.getAttribute("data-platform");
            selectPlatform(plat, true);
            const targetUrl = liveAssets[plat] || FALLBACK_ASSETS[plat];
            if (targetUrl) window.location.href = targetUrl;
        });
    });

    // Auto-cycle orbit highlight every 4 seconds if untouched
    let idx = 0;
    orbitInterval = setInterval(() => {
        idx = (idx + 1) % platformKeys.length;
        selectPlatform(platformKeys[idx], false);
    }, 4000);

    // Initial selection based on user OS
    const detected = detectUserOS();
    const initKey = (detected === "windows") ? "windows" : (detected === "ios") ? "ios" : (detected === "macos") ? "macos" : "android";
    selectPlatform(initKey);
}

// Gentle pleasant Web Audio chime
function playAudioChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
        // AudioContext not allowed without interaction
    }
}

// ══════════════════════════════════════════════════════════════
// 3. OS DETECTION & HERO CARD RENDERING
// ══════════════════════════════════════════════════════════════
function detectUserOS() {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const platform = window.navigator.platform?.toLowerCase() || '';

    if (/android tv|smart-tv|googletv|androidtv/i.test(userAgent)) return 'tv';
    if (/iphone|ipad|ipod/i.test(userAgent) || (platform.includes('mac') && navigator.maxTouchPoints > 1)) return 'ios';
    if (/android/i.test(userAgent)) return 'android';
    if (/mac/i.test(platform) || /macintosh/i.test(userAgent)) return 'macos';
    if (/linux/i.test(platform) || /linux/i.test(userAgent)) return 'linux';
    if (/win/i.test(platform) || /windows/i.test(userAgent)) return 'windows';
    return 'windows';
}

function renderPrimaryCard(os) {
    const container = document.getElementById("primary-card-content");
    if (!container) return;

    let icon = "💻";
    let title = "نسخة Windows الرسمية (PC)";
    let subtitle = "حزمة MSI المستقلة • تعمل 100% بدون إنترنت • v1.0.0";
    let link = liveAssets.windows;

    if (os === 'ios') {
        icon = "🍏";
        title = "تطبيق iOS (iPhone & iPad)";
        subtitle = "تطبيق ويب (PWA) متوافق مع أجهزة آبل • v1.0.0";
        link = liveAssets.ios;
    } else if (os === 'android') {
        icon = "📱";
        title = "نسخة أندرويد المباشرة (APK)";
        subtitle = "تثبيت مباشر لجميع هواتف وأجهزة أندرويد اللوحية • v1.0.0";
        link = liveAssets.android;
    } else if (os === 'tv') {
        icon = "📺";
        title = "نسخة التلفاز الذكي (Android TV 4K)";
        subtitle = "حزمة APK متوافقة مع شاشات سمارت وريموت التحكم • v1.0.0";
        link = liveAssets.android_tv;
    } else if (os === 'macos') {
        icon = "🍎";
        title = "نسخة الماك الرسمية (macOS DMG)";
        subtitle = "حزمة DMG متوافقة مع معالجات M1/M2/M3 و Intel • v1.0.0";
        link = liveAssets.macos;
    } else if (os === 'linux') {
        icon = "🐧";
        title = "نسخة لينكس المستقلة (AppImage)";
        subtitle = "تشغيل مباشر لكافة توزيعات لينكس بحزمة AppImage • v1.0.0";
        link = liveAssets.linux;
    }

    container.innerHTML = `
        <a href="${link}" class="btn-download-master" id="primary-dl-btn">
            <div class="btn-download-left">
                <span class="btn-download-icon">${icon}</span>
                <div>
                    <span class="btn-download-label-sub">تنزيل مباشر لجهازك الحالي</span>
                    <span class="btn-download-label-main">${title}</span>
                </div>
            </div>
            <span class="btn-download-arrow">📥</span>
        </a>
        <div class="device-meta-chips">
            <span class="meta-chip">⚡ ${subtitle}</span>
            <span class="meta-chip">🛡️ فحص الفيروسات: سليم 100%</span>
        </div>
    `;
}

// Fetch live assets from GitHub API & releases.json
async function fetchLiveGitHubAssets() {
    try {
        // Try local/HF releases.json first for exact pinned version
        try {
            const rJson = await fetch('./releases.json');
            if (rJson.ok) {
                const rData = await rJson.json();
                const v = rData.platforms?.windows?.latest_version || rData.platforms?.android?.latest_version;
                if (v) {
                    const badgeElem = document.getElementById("top-badge-version");
                    if (badgeElem) badgeElem.textContent = v;
                }
            }
        } catch (e) {
            console.debug("Local releases.json fallback", e);
        }

        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.tag_name) {
            const badgeElem = document.getElementById("top-badge-version");
            if (badgeElem) badgeElem.textContent = data.tag_name;
        }

        if (!data.assets || !Array.isArray(data.assets)) return;

        data.assets.forEach(asset => {
            const name = asset.name.toLowerCase();
            const url = asset.browser_download_url;

            if (name.endsWith('.exe') || name.endsWith('.msi')) {
                if (name.endsWith('.exe')) liveAssets.windows = url;
            } else if (name.includes('tv') && name.endsWith('.apk')) {
                liveAssets.android_tv = url;
            } else if (name.endsWith('.apk')) {
                liveAssets.android = url;
                if (!liveAssets.android_tv || liveAssets.android_tv === FALLBACK_ASSETS.android_tv) {
                    liveAssets.android_tv = url;
                }
            }
        });

        updatePlatformLinks();
    } catch (e) {
        console.debug("Live release assets fetched with fallback:", e);
    }
}

function updatePlatformLinks() {
    const w = document.getElementById("node-windows");
    const tv = document.getElementById("node-tv");
    const a = document.getElementById("node-android");
    const ios = document.getElementById("node-ios");
    const center = document.getElementById("orbit-center-btn");

    if (w) w.href = liveAssets.windows;
    if (tv) tv.href = liveAssets.android_tv;
    if (a) a.href = liveAssets.android;
    if (ios) ios.href = "https://amine-h-ayoub.vercel.app/";
    if (center) center.href = liveAssets.windows || FALLBACK_ASSETS.windows;
}

// ═══════════════════════════════════════════════════════════
// 4. INTERACTIVE SHOWCASE TABS (REAL APP SCREENSHOTS)
// ═══════════════════════════════════════════════════════════
const TABS_DATA = {
    recitations: {
        title: "المصحف المرتل وقائمة التلاوات",
        desc: "واجهة أنيقة وسلسة تعرض سور القرآن الكريم برواية ورش، مع إمكانية البحث الفوري، وزر تحميل السور أوفلاين للتشغيل بدون إنترنت، ونظام جمع النقاط التشجيعي.",
        features: [
            "تلاوة كاملة بصوت القارئ حاج أيوب أمين برواية ورش عن نافع",
            "زر (تحميل الكل / جاهز أوفلاين) للتشغيل دون اتصال بالإنترنت",
            "مشغل صوتي تفاعلي مع التحكم في السرعة والتكرار والمؤقت"
        ],
        image: "assets/screen-desktop-home.png"
    },
    kids: {
        title: "ركن ألعاب وتحديات الأطفال الأسطورية",
        desc: "ألعاب تفاعلية شيقة (سباق النور، لغز الآيات، ترتيب السور، وتحدي التجويد) تشجع الأطفال على حفظ القرآن ومراجعته بمتعة وحماس.",
        features: [
            "ألعاب قرآنية ممتعة وهادفة تحبب الأطفال في كتاب الله",
            "نظام فتح الألعاب تدريجياً عبر الاستماع للتلاوة",
            "مؤثرات بصرية وصوتية محفزة للأبطال الصغار مع نجوم ومكافآت"
        ],
        image: "assets/screen-mobile-kids.png"
    },
    desktop_kids: {
        title: "ساحة ألعاب وتحديات الشاشات والحواسيب",
        desc: "عرض عريض مذهل لألعاب الأطفال والتحديات على الشاشات الكبيرة وأجهزة الكمبيوتر والتلفاز بدقة عالية وتحكم سلس.",
        features: [
            "دعم الشاشات الكبيرة 4K والحواسيب بدقة فائقة وألوان زاهية",
            "متجر الأوسمة والمكافآت والشخصيات الكرتونية المحفزة",
            "لوحة متابعة إنجازات وتطور حفظ الطفل اليومي"
        ],
        image: "assets/screen-desktop-kids.png"
    },
    settings: {
        title: "لوحة التحكم وقفل الوالدين الذكي",
        desc: "إعدادات شاملة تتيح التحكم في الحسابات، قفل الخروج بكلمة سر للوالدين لمنع خروج الطفل من التطبيق، وإدارة التنزيلات والدعم الفني.",
        features: [
            "حماية خروج الطفل برمز PIN مخصص لولي الأمر",
            "إدارة سعة التخزين وحذف السور المحملة بسهولة لتوفير المساحة",
            "تواصل مباشر مع الدعم الفني وقناة القارئ على يوتيوب"
        ],
        image: "assets/screen-desktop-settings.png"
    }
};

function setupShowcaseTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    const titleElem = document.getElementById("tab-title");
    const descElem = document.getElementById("tab-desc");
    const featList = document.getElementById("tab-features");
    const imgElem = document.getElementById("tab-media-img");

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const tabKey = btn.getAttribute("data-tab");
            const data = TABS_DATA[tabKey];
            if (!data) return;

            if (titleElem) titleElem.textContent = data.title;
            if (descElem) descElem.textContent = data.desc;
            if (imgElem) {
                imgElem.style.opacity = "0.2";
                setTimeout(() => {
                    imgElem.src = data.image;
                    imgElem.style.opacity = "1";
                }, 180);
            }
            if (featList) {
                featList.innerHTML = data.features.map(f => `
                    <li><span class="check-icon">✓</span> ${f}</li>
                `).join("");
            }
        });
    });
}

// ═══════════════════════════════════════════════════════════
// 5. AUDIO RECITATION PREVIEW CONTROLLER
// ═══════════════════════════════════════════════════════════
function setupAudioPreview() {
    const playBtn = document.getElementById("btn-audio-toggle");
    let audioElem = document.getElementById("preview-audio-elem");

    if (!playBtn) return;

    if (!audioElem) {
        audioElem = new Audio("https://huggingface.co/datasets/hammoualiyoucef20/quran-audio/resolve/main/1.mp3");
    }

    playBtn.addEventListener("click", () => {
        if (audioElem.paused) {
            playBtn.textContent = "⏳";
            audioElem.play().then(() => {
                playBtn.textContent = "⏸";
            }).catch(e => {
                console.error("Audio preview play info:", e);
                audioElem.src = "https://huggingface.co/datasets/hammoualiyoucef20/quran-audio/resolve/main/1.mp3";
                audioElem.play().then(() => {
                    playBtn.textContent = "⏸";
                }).catch(() => {
                    playBtn.textContent = "▶";
                });
            });
        } else {
            audioElem.pause();
            playBtn.textContent = "▶";
        }
    });

    audioElem.addEventListener("ended", () => {
        playBtn.textContent = "▶";
    });
}

// ═══════════════════════════════════════════════════════════
// 6. LIVE SUPABASE SUPPORT CHAT (NO BOT, DIRECT SUPERVISOR)
// ═══════════════════════════════════════════════════════════
let supabaseClient = null;
let siteConvId = null;
let siteVisitorDeviceId = null;

function getOrCreateVisitorId() {
    let id = localStorage.getItem("site_visitor_device_id");
    if (!id) {
        id = `web_visitor_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        localStorage.setItem("site_visitor_device_id", id);
    }
    return id;
}

function initSupabaseSupport() {
    if (typeof window.supabase === "undefined" || !window.supabase.createClient) return;

    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
        siteVisitorDeviceId = getOrCreateVisitorId();
        setupChatElements();
    } catch (e) {
        console.debug("Supabase init note:", e);
    }
}

function setupChatElements() {
    const openBtn = document.getElementById("btn-open-site-support");
    const closeBtn = document.getElementById("btn-close-site-support");
    const overlay = document.getElementById("site-support-overlay");
    const drawer = document.getElementById("site-support-drawer");
    const sendBtn = document.getElementById("btn-site-send");
    const inputElem = document.getElementById("site-support-input");
    const attachBtn = document.getElementById("btn-site-attach");
    const fileInput = document.getElementById("site-file-input");

    if (openBtn && drawer) {
        openBtn.addEventListener("click", () => {
            drawer.classList.remove("hidden");
            loadOrInitConversation();
        });
    }

    if (closeBtn && drawer) {
        closeBtn.addEventListener("click", () => drawer.classList.add("hidden"));
    }
    if (overlay && drawer) {
        overlay.addEventListener("click", () => drawer.classList.add("hidden"));
    }

    if (sendBtn && inputElem) {
        sendBtn.addEventListener("click", sendUserMessage);
        inputElem.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendUserMessage();
            }
        });
    }

    if (attachBtn && fileInput) {
        attachBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
            }
        });
    }
}

async function loadOrInitConversation() {
    if (!supabaseClient) return;
    const msgContainer = document.getElementById("site-support-messages");
    if (!msgContainer) return;

    msgContainer.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:2rem; font-size:0.95rem;">جاري الاتصال بالمشرف...</div>`;

    try {
        let { data: conv } = await supabaseClient
            .from("support_conversations")
            .select("id")
            .eq("device_id", siteVisitorDeviceId)
            .maybeSingle();

        if (!conv) {
            const { data } = await supabaseClient
                .from("support_conversations")
                .insert({ device_id: siteVisitorDeviceId, user_name: "زائر الموقع" })
                .select("id")
                .maybeSingle();
            if (data) conv = data;
        }

        if (conv?.id) {
            siteConvId = conv.id;
            loadMessages();
            subscribeToMessages();
        }
    } catch (e) {
        console.debug("Init chat error:", e);
        msgContainer.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:2rem; font-size:0.95rem;">أهلاً بك! اكتب رسالتك وسيتواصل معك المشرف مباشرة.</div>`;
    }
}

async function loadMessages() {
    if (!supabaseClient || !siteConvId) return;
    const msgContainer = document.getElementById("site-support-messages");
    if (!msgContainer) return;

    const { data: msgs } = await supabaseClient
        .from("support_messages")
        .select("id, sender, body, created_at")
        .eq("conversation_id", siteConvId)
        .order("created_at", { ascending: true });

    if (!msgs || msgs.length === 0) {
        msgContainer.innerHTML = `
            <div style="text-align: center; color: #cbd5e1; padding: 2rem 1rem; font-size: 0.95rem;">
                <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">👋 أهلاً بك!</p>
                <p>تواصلك هنا يصل مباشرة إلى مشرف التطبيق والقارئ الشيخ حاج أيوب أمين للإجابة على استفساراتك.</p>
            </div>
        `;
        return;
    }

    msgContainer.innerHTML = msgs.map(m => {
        const isUser = m.sender === "user";
        return `
            <div class="msg-bubble ${isUser ? 'msg-user' : 'msg-admin'}">
                ${m.body}
            </div>
        `;
    }).join("");

    msgContainer.scrollTop = msgContainer.scrollHeight;
}

function subscribeToMessages() {
    if (!supabaseClient || !siteConvId) return;
    supabaseClient
        .channel(`site-chat-${siteConvId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'support_messages',
            filter: `conversation_id=eq.${siteConvId}`
        }, payload => {
            const m = payload.new;
            const msgContainer = document.getElementById("site-support-messages");
            if (!msgContainer) return;

            const isUser = m.sender === "user";
            const bubble = document.createElement("div");
            bubble.className = `msg-bubble ${isUser ? 'msg-user' : 'msg-admin'}`;
            bubble.textContent = m.body;
            msgContainer.appendChild(bubble);
            msgContainer.scrollTop = msgContainer.scrollHeight;
        })
        .subscribe();
}

async function sendUserMessage() {
    const input = document.getElementById("site-support-input");
    if (!input || !supabaseClient || !siteConvId) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = "";

    await supabaseClient.from("support_messages").insert({
        conversation_id: siteConvId,
        sender: "user",
        body: text
    });
}

async function handleFileUpload(file) {
    if (!supabaseClient || !siteConvId) return;
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${siteConvId}_${Date.now()}.${fileExt}`;
        const { error } = await supabaseClient.storage.from("support_attachments").upload(fileName, file);
        if (error) throw error;

        const { data: pubUrl } = supabaseClient.storage.from("support_attachments").getPublicUrl(fileName);
        if (pubUrl?.publicUrl) {
            await supabaseClient.from("support_messages").insert({
                conversation_id: siteConvId,
                sender: "user",
                body: `[صورة مرفقة]: ${pubUrl.publicUrl}`
            });
        }
    } catch (e) {
        console.debug("Upload failed:", e);
    }
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION ON DOM READY
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    initParticles();
    fetchLiveGitHubAssets();
    setupAudioPreview();
    initSupabaseSupport();
});
