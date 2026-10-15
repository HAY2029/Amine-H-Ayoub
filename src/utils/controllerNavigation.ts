/**
 * ط§ظ„طھظ†ظ‚ظ„ ط¨ظ„ظˆط­ط© ط§ظ„ظ…ظپط§طھظٹط­ ظ„ظ„ظ…ظˆظ‚ط¹ (Keyboard Navigation)
 *
 * ظ…ظ„ط§ط­ط¸ط©: طھظ…طھ ط¥ط²ط§ظ„ط© ط¯ط¹ظ… Android TV / ط±ظٹظ…ظˆطھ ط§ظ„طھظ„ظپط§ط² / ط£ط°ط±ط¹ ط§ظ„ط£ظ„ط¹ط§ط¨ (Gamepads)
 * ط¨ط´ظƒظ„ ظƒط§ظ…ظ„ â€” ط§ظ„طھط·ط¨ظٹظ‚ ظ…ظˆط¬ظژظ‘ظ‡ ظ„ظ„ظ‡ط§طھظپ ظˆط§ظ„ط£ط¬ظ‡ط²ط© ط§ظ„ظ„ظˆط­ظٹط© ظˆط§ظ„ظƒظ…ط¨ظٹظˆطھط±.
 * ظ…ط§ ط¨ظ‚ظٹ ظ‡ظˆ ط§ظ„طھظ†ظ‚ظ„ ط§ظ„ظ…ظƒط§ظ†ظٹ ط¨ط§ظ„ط£ط³ظ‡ظ… ظˆط¯ط¹ظ… ط²ط± ط§ظ„ط±ط¬ظˆط¹ (Backspace) ظˆEscape.
 */

type Direction = "up" | "down" | "left" | "right";

// ظ‚ط§ط¦ظ…ط© ط§ظ„ط¹ظ†ط§طµط± ط§ظ„ظ‚ط§ط¨ظ„ط© ظ„ظ„طھط±ظƒظٹط²
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
  // ط¥ط°ط§ ظƒط§ظ† ظ‡ظ†ط§ظƒ ظ†ط§ظپط°ط© ظ…ظ†ط¨ط«ظ‚ط© ظ…ظپطھظˆط­ط© ط­ظ‚ظٹظ‚ظٹط©طŒ ظ†ط­طµط± ط§ظ„طھظ†ظ‚ظ„ ط¯ط§ط®ظ„ظ‡ط§ ظپظ‚ط·.
  // ظ…ظ‡ظ…: ظ„ط§ ظ†ط³طھط®ط¯ظ… [data-state='open'] ظˆط­ط¯ظ‡ ظ„ط£ظ†ظ‡ ظٹط·ط§ط¨ظ‚ ط¹ظ†ط§طµط± ط¯ط§ط®ظ„ظٹط© ظƒط«ظٹط±ط©
  // ظپظٹط­طµط± ط§ظ„طھظ†ظ‚ظ„ ط®ط·ط£ظ‹ ظˆظٹظ…ظ†ط¹ ط§ظ„ط£ط³ظ‡ظ… ظ…ظ† ط§ظ„ط¹ظ…ظ„ ط¯ط§ط®ظ„ ط±ظƒظ† ط§ظ„ط£ط·ظپط§ظ„.
  const activeDialog = document.querySelector<HTMLElement>(
    "[role='dialog'][aria-modal='true'], [aria-modal='true'], .dialog-content"
  );
  const root = activeDialog && isVisible(activeDialog) ? activeDialog : container;

  const elements = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return elements.filter(isVisible);
}

/**
 * ط®ظˆط§ط±ط²ظ…ظٹط© ط§ظ„طھظ†ظ‚ظ„ ط§ظ„ظ…ظƒط§ظ†ظٹ ط«ظ†ط§ط¦ظٹ ط§ظ„ط£ط¨ط¹ط§ط¯ (2D Spatial Navigation)
 * طھط­ط³ط¨ ط£ظ‚ط±ط¨ ط¹ظ†طµط± ط¨طµط±ظٹط§ظ‹ ظپظٹ ط§ظ„ط§طھط¬ط§ظ‡ ط§ظ„ظ…ط·ظ„ظˆط¨ ظ…ط¹ ظ…ط±ط§ط¹ط§ط© ظ…ظˆظ‚ط¹ظ‡ ظˆط²ط§ظˆظٹطھظ‡ ط¹ظ„ظ‰ ط§ظ„ط´ط§ط´ط©
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

    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط£ظ† ط§ظ„ط¹ظ†طµط± ظٹظ‚ط¹ ظپظٹ ط§ظ„ط§طھط¬ط§ظ‡ ط§ظ„ظ…ط·ظ„ظˆط¨
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

    // ط¥ط¹ط·ط§ط، ط£ظˆظ„ظˆظٹط© ظ„ظ„ظ…ط­ط§ط°ط§ط© ط§ظ„ظ…ط¨ط§ط´ط±ط©طŒ ظˆظ…ط¹ط§ظ‚ط¨ط© ط§ظ„ط§ظ†ط­ط±ط§ظپ ط§ظ„ط¬ط§ظ†ط¨ظٹ
    const totalScore = mainDist + crossDist * 2.2;

    if (totalScore < minDistance) {
      minDistance = totalScore;
      bestElement = el;
    }
  }

  return bestElement;
}

export function getFocusableElementsForNav(container?: HTMLElement): HTMLElement[] {
  return getFocusableElements(container);
}

/**
 * ظٹط±ظƒظ‘ط² ط£ظˆظ„ ط¹ظ†طµط± ظ‚ط§ط¨ظ„ ظ„ظ„طھط±ظƒظٹط² ط¯ط§ط®ظ„ ط­ط§ظˆظٹط© ظ…ط¹ظٹظ‘ظ†ط© (ط£ظˆ ط§ظ„طµظپط­ط© ظƒط§ظ…ظ„ط©).
 * طھظڈط³طھط¯ط¹ظ‰ ط¹ظ†ط¯ ظپطھط­ ط±ظƒظ† ط§ظ„ط£ط·ظپط§ظ„ ط£ظˆ ط§ظ„ط¯ط®ظˆظ„ ظ„ط£ظٹ ظ„ط¹ط¨ط©طŒ ط­طھظ‰ طھط¹ظ…ظ„ ط§ظ„ط£ط³ظ‡ظ…/ط§ظ„ط±ظٹظ…ظˆطھ
 * ظپظˆط±ط§ظ‹ ط¨ظ„ط§ ط­ط§ط¬ط© ظ„ط£ظٹ طھظپط§ط¹ظ„ ظ…ط³ط¨ظ‚ ظ…ظ† ط§ظ„ظ…ط³طھط®ط¯ظ….
 */
export function focusFirst(container?: HTMLElement | null, selector?: string): boolean {
  const root = container || (typeof document !== "undefined" ? document.body : null);
  if (!root) return false;
  const list = selector
    ? Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(isVisible)
    : getFocusableElements(root);
  const first = list[0];
  if (!first) return false;
  try {
    first.focus({ preventScroll: true });
    first.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return true;
  } catch {
    return false;
  }
}

/**
 * ظٹط±ظƒظ‘ط² ط¹ظ†طµط±ط§ظ‹ ظ…ط­ط¯ط¯ط§ظ‹ ط¨ط§ظ„ظ…ط¹ط±ظ‘ظپ ط£ظˆ ط§ظ„ظ…ط­ط¯ظگظ‘ط¯ (ظٹظڈط³طھط®ط¯ظ… ظ„ط¥ط¹ط§ط¯ط© ط§ظ„طھط±ظƒظٹط² ط¨ط¹ط¯ طھط؛ظٹظٹط± ط§ظ„ط´ط§ط´ط©).
 */
export function focusSelector(selector: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el || !isVisible(el)) return false;
  try {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return true;
  } catch {
    return false;
  }
}

export function moveFocus(direction: Direction): boolean {
  const focusables = getFocusableElements();
  if (focusables.length === 0) return false;
  const current = document.activeElement as HTMLElement | null;

  // ط¥ط°ط§ ظ„ظ… ظٹظƒظ† ط£ظٹ ط¹ظ†طµط± ظ…ط­ط¯ط¯ط§ظ‹ ط­ط§ظ„ظٹط§ظ‹طŒ ظ†ط±ظƒط² ط¹ظ„ظ‰ ط£ظˆظ„ ط¹ظ†طµط± ظ…ظ†ط·ظ‚ظٹ
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
  if (current && current !== document.body && current !== document.documentElement) {
    current.click();
    return true;
  }
  // ظ„ط§ ظٹظˆط¬ط¯ ط¹ظ†طµط± ظ…ظڈط±ظƒظژظ‘ط² (ظ…ط«ظ„ ط¨ط¯ط§ظٹط© ط§ظ„طھط´ط؛ظٹظ„) â€” ظ†ط±ظƒظ‘ط² ط£ظˆظ„ ط¹ظ†طµط± ط«ظ… ظ†ط¶ط؛ط·ظ‡
  const first = getFocusableElements()[0];
  if (first) {
    first.focus({ preventScroll: true });
    first.click();
    return true;
  }
  return false;
}

export function handleControllerBack(): boolean {
  // 1. ظپط­طµ ظ…ط§ ط¥ط°ط§ ظƒط§ظ†طھ ظ‡ظ†ط§ظƒ ظ†ط§ظپط°ط© ظ…ظپطھظˆط­ط© ظ„ط¥ط؛ظ„ط§ظ‚ظ‡ط§
  const closeBtn = document.querySelector<HTMLElement>(
    "[role='dialog'] [aria-label*='ط¥ط؛ظ„ط§ظ‚'], [aria-modal='true'] [aria-label*='ط¥ط؛ظ„ط§ظ‚'], [role='dialog'] button.close, [role='dialog'] button[aria-label*='Close'], [role='dialog'] [aria-label*='close']"
  );
  if (closeBtn && isVisible(closeBtn)) {
    closeBtn.click();
    return true;
  }

  // 2. ط£ظٹ ظ†ط§ظپط°ط© ظ…ظ†ط¨ط«ظ‚ط© ط£ط®ط±ظ‰ ظ…ط؛ظ„ظ‚ط© ط¨ط§ظ„ظ†ظ‚ط± ط¹ظ„ظ‰ ط§ظ„ط®ظ„ظپظٹط© â€” ظ†ط؛ظ„ظ‚ظ‡ط§
  const scrim = document.querySelector<HTMLElement>("[data-overlay-close], .overlay-close");
  if (scrim && isVisible(scrim)) {
    scrim.click();
    return true;
  }

  // 3. ط¥ط°ط§ ظ„ظ… طھظƒظ† ظ‡ظ†ط§ظƒ ظ†ط§ظپط°ط©طŒ ظ†ط±ط¬ط¹ ط®ط·ظˆط© ظ„ظ„ظˆط±ط§ط،
  if (window.history.length > 1) {
    window.history.back();
    return true;
  }

  return false;
}

/**
 * طھظ‡ظٹط¦ط© ظ…ط³طھظ…ط¹ط§طھ ظ„ظˆط­ط© ط§ظ„ظ…ظپط§طھظٹط­ (ط§ظ„ط£ط³ظ‡ظ… + ط§ظ„ط±ط¬ظˆط¹)
 */
export function setupRemoteControlListeners(): () => void {
  // ط¥ط¨ط±ط§ط² ظˆط§ط¶ط­ ظ„ظ„ط¹ظ†طµط± ط§ظ„ظ…ط­ط¯ط¯ ط¨ظ„ظˆط­ط© ط§ظ„ظ…ظپط§طھظٹط­
  const style = document.createElement("style");
  style.textContent = `
    button:focus-visible, a:focus-visible, [tabindex]:focus-visible,
    input:focus-visible, select:focus-visible, textarea:focus-visible {
      outline: 3px solid #f59e0b !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(style);

  const handleKeyDown = (e: KeyboardEvent) => {
    // طھط¬ط§ظ‡ظ„ ط§ظ„ط£ط­ط¯ط§ط« ط¥ط°ط§ ظƒط§ظ† ط§ظ„ظ…ط³طھط®ط¯ظ… ظٹظƒطھط¨ ظپظٹ ط­ظ‚ظ„ ظ†طµظٹ
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    const isInput = tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable;

    // Backspace ط®ط§ط±ط¬ ط§ظ„ط­ظ‚ظˆظ„ = ط±ط¬ظˆط¹
    if (e.key === "Backspace" && !isInput) {
      e.preventDefault();
      handleControllerBack();
      return;
    }

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
      case " ": 
      case "Spacebar":
        // زر OK في الريموت — يعمل من أي عنصر مُركَّز (أزرار حقيقية + role="button")
        if (!isInput && document.activeElement && document.activeElement !== document.body) {
          const ae = document.activeElement as HTMLElement;
          if (ae.tagName === "BUTTON" || ae.getAttribute("role") === "button" || ae.getAttribute("data-nav-click") !== null) {
            e.preventDefault();
            ae.click();
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
    }
  };

  window.addEventListener("keydown", handleKeyDown, { passive: false });

  // 🧭 دليل الزر المرئي: إطار ذهبي متحرك يوضّح أي عنصر سيُضغط (زر OK/الأسهم).
  // يظهر فقط عندما يكون هناك تركيز فعلي، ويتحرك مع التركيز بسلاسة.
  const guideId = "tv-focus-guide";
  let guide = document.getElementById(guideId) as HTMLDivElement | null;
  if (!guide) {
    guide = document.createElement("div");
    guide.id = guideId;
    guide.setAttribute("aria-hidden", "true");
    guide.style.cssText =
      "position:fixed;z-index:99999;pointer-events:none;border:3px solid #f59e0b;border-radius:14px;box-shadow:0 0 0 4px rgba(245,158,11,.25),0 0 22px rgba(245,158,11,.65);transition:top .14s ease,left .14s ease,width .14s ease,height .14s ease,opacity .2s ease;opacity:0;display:none";
    document.body.appendChild(guide);
  }
  const syncGuide = () => {
    if (!guide) return;
    const el = document.activeElement as HTMLElement | null;
    if (
      !el ||
      el === document.body ||
      el === document.documentElement ||
      !el.isConnected ||
      !isVisible(el)
    ) {
      guide.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) {
      guide.style.display = "none";
      return;
    }
    guide.style.display = "block";
    guide.style.opacity = "1";
    guide.style.top = `${Math.max(4, r.top - 4)}px`;
    guide.style.left = `${Math.max(4, r.left - 4)}px`;
    guide.style.width = `${r.width + 8}px`;
    guide.style.height = `${r.height + 8}px`;
  };
  // نرسم بعد كل حركة سهم/تركيز، وعند تغيّر التركيز بأي طريقة
  const guideRaf = () => requestAnimationFrame(syncGuide);
  window.addEventListener("keydown", guideRaf, { passive: true });
  window.addEventListener("keyup", guideRaf, { passive: true });
  document.addEventListener("focusin", guideRaf);
  document.addEventListener("focusout", guideRaf);
  window.addEventListener("resize", guideRaf, { passive: true });
  window.addEventListener("scroll", guideRaf, { passive: true, capture: true });

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keydown", guideRaf);
    window.removeEventListener("keyup", guideRaf);
    document.removeEventListener("focusin", guideRaf);
    document.removeEventListener("focusout", guideRaf);
    window.removeEventListener("resize", guideRaf);
    window.removeEventListener("scroll", guideRaf, { capture: true } as EventListenerOptions);
    guide?.remove();
  };
}

