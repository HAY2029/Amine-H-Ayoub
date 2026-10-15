const fs = require('fs');

const cssPath = 'src/index.css';
let css = fs.readFileSync(cssPath, 'utf8');

const startMarker = '/* التكيف مع الشاشات الطولية (الهواتف المحمولة / Portrait) */';
const endMarker = '/* ============================================================';

const startIdx = css.indexOf(startMarker);
const endIdx = css.indexOf(endMarker, startIdx);

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find markers');
  process.exit(1);
}

const replacement = `/* التكيف مع الشاشات الطولية (الهواتف المحمولة / Portrait) */
@media (max-width: 768px), (max-aspect-ratio: 1.15/1) {
  .quran-kids-page {
    position: fixed;
    inset: 0;
    width: 100vw;
    width: 100dvw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: transparent;
    padding: 0;
    margin: 0;
    display: block;
  }
  .quran-kids-frame {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    aspect-ratio: auto;
    margin: 0;
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .quran-kids-frame-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    object-position: center center;
    pointer-events: none;
    user-select: none;
    z-index: 1;
  }
  /* إزالة أي طبقة معتمة أو ملونة خارجية */
  .quran-kids-overlay {
    display: none !important;
  }
  /* المكان المخصص لقائمة السور يقع بدقة داخل القوس الذهبي الكريمي */
  .quran-kids-white-area {
    position: absolute;
    top: 24.5%;
    bottom: 24.5%;
    left: 7.5%;
    right: 7.5%;
    margin: 0;
    height: auto;
    border-radius: 28px 28px 22px 22px;
    background: rgba(255, 252, 245, 0.65);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1.5px solid rgba(212, 175, 55, 0.45);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12), inset 0 1px 3px rgba(255, 255, 255, 0.7);
    z-index: 10;
    transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .quran-kids-white-area .quran-kids-scroll {
    -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 25px), transparent 100%);
    mask-image: linear-gradient(to bottom, black calc(100% - 25px), transparent 100%);
  }
  /* الوضع الموسّع للهاتف إن اختاره المستخدم */
  .quran-kids-white-area.expanded-mode {
    top: calc(7% + env(safe-area-inset-top, 0px));
    bottom: calc(8% + env(safe-area-inset-bottom, 0px));
    left: 3.5%;
    right: 3.5%;
    background: rgba(255, 252, 245, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-radius: 30px;
    box-shadow: 0 16px 45px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(212, 175, 55, 0.4);
  }
  /* شريط التنقل السفلي يطفو فوق شريط التجويد مباشرة ليبقى كلاهما ظاهراً */
  .mobile-bottom-nav {
    bottom: calc(7.8% + env(safe-area-inset-bottom, 0px));
    max-width: 315px;
    left: 0;
    right: 0;
    margin: 0 auto;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1.5px solid rgba(212, 175, 55, 0.45);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.18);
    padding: 3px 8px;
  }
}\n\n`;

const isCRLF = css.includes('\r\n');
const newCss = css.slice(0, startIdx) + (isCRLF ? replacement.replace(/\n/g, '\r\n') : replacement) + css.slice(endIdx);

fs.writeFileSync(cssPath, newCss, 'utf8');
console.log('Successfully updated index.css with edge-to-edge styles');
