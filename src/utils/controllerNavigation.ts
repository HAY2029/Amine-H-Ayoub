/**
 * نظام الملاحة الذكي لأجهزة التحكم (الريموت كنترول + أذرع التحكم بالألعاب Gamepads)
 * Smart Spatial & Controller Navigation for Android TV Remotes, Gamepads & Keyboards
 */

type Direction = "up" | "down" | "left" | "right";

// قائمة العناصر القابلة للتركيز
const FOCUSABLE_SELECTOR = [
  "button:not([disabled]):not([aria-hidden='true'])",
  "a[href]:not([aria-hidden='true'])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1']):not([disabled])",
  "[role='button']:not([aria-hidden='true'])",
].join(", ");

function isVisible(el: HTMLElement): boolean {
  if (!el.offsetParent && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getFocusableElements(container: HTMLElement = document.body): HTMLElement[] {
  // إذا كان هناك نافذة منبثقة مفتوحة، نحصر التنقل داخلها فقط
  const activeDialog = document.querySelector<HTMLElement>(
    "[role='dialog'], [aria-modal='true'], .dialog-content, [data-state='open']"
  );
  const root = activeDialog && isVisible(activeDialog) ? activeDialog : container;

  const elements = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return elements.filter(isVisible);
}

/**
 * خوارزمية التنقل المكاني ثنائي الأبعاد (2D Spatial Navigation)
 * تحسب أقرب عنصر بصرياً في الاتجاه المطلوب مع مراعاة موقعه وزاويته على الشاشة
 */
function findBestCandidate(current: HTMLElement, direction: Direction, candidates: HTMLElement[]): HTMLElement | null {
  const cRect = current.getBoundingClientRect();
  const cCenter = {
    x: cRect.left + cRect.width / 2,
    y: cRect.top + cRect.height / 2,
  };

  let bestElement: HTMLElement | null = null;
  let minDistance = Infinity;

  for (const el of candidates) {
    if (el === current || el.contains(current) || current.contains(el)) continue;

    const eRect = el.getBoundingClientRect();
    const eCenter = {
      x: eRect.left + eRect.width / 2,
      y: eRect.top + eRect.height / 2,
    };

    const dx = eCenter.x - cCenter.x;
    const dy = eCenter.y - cCenter.y;

    // التحقق من أن العنصر يقع في الاتجاه المطلوب
    let inDirection = false;
    let mainDist = 0;
    let crossDist = 0;

    switch (direction) {
      case "up":
        inDirection = dy < -4;
        mainDist = -dy;
        crossDist = Math.abs(dx);
        break;
      case "down":
        inDirection = dy > 4;
        mainDist = dy;
        crossDist = Math.abs(dx);
        break;
      case "left":
        inDirection = dx < -4;
        mainDist = -dx;
        crossDist = Math.abs(dy);
        break;
      case "right":
        inDirection = dx > 4;
        mainDist = dx;
        crossDist = Math.abs(dy);
        break;
    }

    if (!inDirection) continue;

    // إعطاء أولوية للمحاذاة المباشرة، ومعاقبة الانحراف الجانبي
    const totalScore = mainDist + crossDist * 2.2;

    if (totalScore < minDistance) {
      minDistance = totalScore;
      bestElement = el;
    }
  }

  return bestElement;
}

export function moveFocus(direction: Direction): boolean {
  const focusables = getFocusableElements();
  if (focusables.length === 0) return false;

  const current = document.activeElement as HTMLElement | null;

  // إذا لم يكن أي عنصر محدداً حالياً، نركز على أول عنصر منطقي
  if (!current || current === document.body || !focusables.includes(current)) {
    const first = focusables[0];
    if (first) {
      first.focus();
      first.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      return true;
    }
    return false;
  }

  const next = findBestCandidate(current, direction, focusables);
  if (next) {
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return true;
  }

  return false;
}

export function triggerActiveClick(): boolean {
  const current = document.activeElement as HTMLElement | null;
  if (current && current !== document.body) {
    current.click();
    return true;
  }
  return false;
}

export function handleControllerBack(): boolean {
  // 1. فحص ما إذا كانت هناك نافذة مفتوحة لإغلاقها
  const closeBtn = document.querySelector<HTMLElement>(
    "[role='dialog'] [aria-label*='إغلاق'], [role='dialog'] button.close, [data-state='open'] button[aria-label*='Close']"
  );
  if (closeBtn && isVisible(closeBtn)) {
    closeBtn.click();
    return true;
  }

  // 2. إذا لم تكن هناك نافذة، نرجع خطوة للوراء
  if (window.history.length > 1) {
    window.history.back();
    return true;
  }

  return false;
}

/**
 * تشغيل/إيقاف الوسائط الحالية (زر تشغيل بالريموت أو أذرع التحكم)
 */
function toggleMediaPlayback(): void {
  const media = Array.from(document.querySelectorAll<HTMLMediaElement>("audio, video"));
  const playing = media.find(m => !m.paused && !m.ended);
  if (playing) {
    playing.pause();
    return;
  }
  media[0]?.play().catch(() => { /* ignore */ });
}

/**
 * تهيئة مستمعات الريموت كنترول ولوحة المفاتيح
 */
export function setupRemoteControlListeners(): () => void {
  // إبراز واضح للعنصر المحدد بالريموت/لوحة المفاتيح (يُفعَّل عند أول استخدام للأسهم)
  const style = document.createElement("style");
  style.textContent = `
    html.tv-nav button:focus, html.tv-nav a:focus, html.tv-nav [tabindex]:focus,
    html.tv-nav input:focus, html.tv-nav select:focus, html.tv-nav textarea:focus,
    button:focus-visible, a:focus-visible, [tabindex]:focus-visible {
      outline: 3px solid #f59e0b !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(style);

  const handleKeyDown = (e: KeyboardEvent) => {
    // تجاهل الأحداث إذا كان المستخدم يكتب في حقل نصي
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    const isInput = tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable;

    // أزرار الرجوع الخاصة بأجهزة التلفاز (keyCodes مخصصة للعلامات الكبرى)
    if (e.keyCode === 10009 || e.keyCode === 461 || e.keyCode === 4) {
      e.preventDefault();
      handleControllerBack();
      return;
    }
    // Backspace خارج الحقول = رجوع
    if (e.key === "Backspace" && !isInput) {
      e.preventDefault();
      handleControllerBack();
      return;
    }

    // الأسهم تُفعّل نمط إبراز التحديد بالريموت
    if (e.key.startsWith("Arrow")) document.documentElement.classList.add("tv-nav");

    switch (e.key) {
      case "ArrowUp":
      case "Up":
        if (!isInput || (e.target as HTMLElement).tagName === "BUTTON") {
          e.preventDefault();
          moveFocus("up");
        }
        break;
      case "ArrowDown":
      case "Down":
        if (!isInput || (e.target as HTMLElement).tagName === "BUTTON") {
          e.preventDefault();
          moveFocus("down");
        }
        break;
      case "ArrowLeft":
      case "Left":
        if (!isInput) {
          e.preventDefault();
          moveFocus("left");
        }
        break;
      case "ArrowRight":
      case "Right":
        if (!isInput) {
          e.preventDefault();
          moveFocus("right");
        }
        break;
      case "Enter":
      case "Select":
        // زر OK في الريموت
        if (!isInput && document.activeElement && document.activeElement !== document.body) {
          // المتصفح يضغط الأزرار تلقائياً عند Enter، ولكن نضمن تفعيل العناصر ذات الدور button
          if (document.activeElement.getAttribute("role") === "button") {
            e.preventDefault();
            (document.activeElement as HTMLElement).click();
          }
        }
        break;
      case "Escape":
      case "Back":
      case "BrowserBack":
      case "GoBack":
        e.preventDefault();
        handleControllerBack();
        break;
      case "MediaPlayPause":
        e.preventDefault();
        toggleMediaPlayback();
        break;
    }
  };

  window.addEventListener("keydown", handleKeyDown, { passive: false });
  return () => window.removeEventListener("keydown", handleKeyDown);
}

/**
 * حلقة مراقبة ذراع التحكم بالألعاب (Gamepad Polling Loop)
 * تدعم أجهزة Xbox, PlayStation, وأذرع البلوتوث على التلفاز والكمبيوتر
 */
export function setupGamepadListener(): () => void {
  let animationFrameId: number | null = null;
  let lastActionTime = 0;
  const REPEAT_DELAY = 180; // مللي ثانية بين الحركات المتكررة
  let prevButtonA = false;
  let prevButtonB = false;

  const pollGamepads = (now: number) => {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads.find((g) => g && g.connected);

    if (gp) {
      const canRepeat = now - lastActionTime > REPEAT_DELAY;

      // 1. الاتجاهات: D-pad أو عصا التحكم اليسرى (Analog Stick)
      const dpadUp = gp.buttons[12]?.pressed || gp.axes[1] < -0.5;
      const dpadDown = gp.buttons[13]?.pressed || gp.axes[1] > 0.5;
      const dpadLeft = gp.buttons[14]?.pressed || gp.axes[0] < -0.5;
      const dpadRight = gp.buttons[15]?.pressed || gp.axes[0] > 0.5;

      if (canRepeat) {
        if (dpadUp) {
          moveFocus("up");
          lastActionTime = now;
        } else if (dpadDown) {
          moveFocus("down");
          lastActionTime = now;
        } else if (dpadLeft) {
          moveFocus("left");
          lastActionTime = now;
        } else if (dpadRight) {
          moveFocus("right");
          lastActionTime = now;
        }
      }

      // 2. زر A (تأكيد / نقر) — Button 0
      const btnA = gp.buttons[0]?.pressed;
      if (btnA && !prevButtonA) {
        triggerActiveClick();
      }
      prevButtonA = !!btnA;

      // 3. زر B (رجوع) — Button 1
      const btnB = gp.buttons[1]?.pressed;
      if (btnB && !prevButtonB) {
        handleControllerBack();
      }
      prevButtonB = !!btnB;

      // 4. زر X أو Y (تشغيل/إيقاف مؤقت للتلاوة) — Button 2 أو 3
      if (gp.buttons[2]?.pressed || gp.buttons[3]?.pressed) {
        if (canRepeat) {
          toggleMediaPlayback();
          lastActionTime = now + 200;
        }
      }
    }

    animationFrameId = requestAnimationFrame(pollGamepads);
  };

  animationFrameId = requestAnimationFrame(pollGamepads);

  const onConnected = (e: GamepadEvent) => {
    console.log("🎮 Gamepad connected:", e.gamepad.id);
  };

  window.addEventListener("gamepadconnected", onConnected);

  return () => {
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    window.removeEventListener("gamepadconnected", onConnected);
  };
}
