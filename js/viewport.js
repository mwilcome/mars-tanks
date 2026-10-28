// iPhone Safari still has no Element.requestFullscreen for a page (iPad only).
// A normal tab can only fill the visual viewport, and the toolbars collapse
// when the document actually scrolls. An installed web app is a different box:
// with viewport-fit=cover, 100dvh / visualViewport are short of the screen
// (WebKit bugs 254868 and 313800), so standalone keeps the large viewport.

export const SAFARI_CHROME_GAP = 40;
const COLLAPSE_QUIET_MS = 600;

export function isIphone(ua = "") {
  return /iPhone|iPod/.test(ua);
}

export function isIOSDevice(ua = "", { maxTouchPoints = 0, platform = "" } = {}) {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return platform === "MacIntel" && maxTouchPoints > 1;
}

export function isStandaloneDisplay({ standalone = false, displayMode = "browser" } = {}) {
  return standalone === true || displayMode === "standalone" || displayMode === "fullscreen";
}

export function visualFrame(viewport) {
  if (!viewport) return null;
  const width = Math.round(Number(viewport.width) || 0);
  const height = Math.round(Number(viewport.height) || 0);
  if (width < 2 || height < 2) return null;
  return {
    top: Math.round(Number(viewport.offsetTop) || 0),
    left: Math.round(Number(viewport.offsetLeft) || 0),
    width,
    height,
  };
}

// Landscape only. A collapsed Safari tab still keeps a thin domain strip, so a
// gap under ~40 CSS px is "as hidden as a tab gets". Standalone is never this:
// its short visual viewport is the status-bar bug, not a toolbar.
export function safariChromeOpen({
  standalone = false,
  width = 0,
  height = 0,
  vvHeight = 0,
  vvOffsetTop = 0,
  screenWidth = 0,
  screenHeight = 0,
} = {}) {
  if (standalone) return false;
  if (!(width > height)) return false;
  const shortSide = Math.min(Number(screenWidth) || 0, Number(screenHeight) || 0);
  const visible = (Number(vvHeight) || 0) + (Number(vvOffsetTop) || 0);
  if (shortSide <= 0 || visible <= 0) return false;
  return visible < shortSide - SAFARI_CHROME_GAP;
}

export function shouldPinVisualViewport({ ios = false, standalone = false, frame = null } = {}) {
  return Boolean(ios && !standalone && frame);
}

export function shouldKeepSafariScroll({ iphone = false, standalone = false, width = 0, height = 0 } = {}) {
  return Boolean(iphone && !standalone && width > height);
}

export function shouldOfferChromeCollapse({ iphone = false, standalone = false, chromeOpen = false } = {}) {
  return Boolean(iphone && !standalone && chromeOpen);
}

export function boardShouldPreventTouchMove(root = typeof document !== "undefined" ? document.documentElement : { classList: { contains: () => false } }) {
  const contains = root.classList?.contains?.bind(root.classList);
  if (!contains) return true;
  return !contains("chrome-open") && !contains("chrome-gesture");
}

function displayMode(win) {
  const match = (query) => Boolean(win.matchMedia && win.matchMedia(query).matches);
  if (match("(display-mode: fullscreen)")) return "fullscreen";
  if (match("(display-mode: standalone)")) return "standalone";
  return "browser";
}

function readStandalone(win) {
  return isStandaloneDisplay({
    standalone: win.navigator?.standalone === true,
    displayMode: displayMode(win),
  });
}

export function installViewport(doc = typeof document !== "undefined" ? document : null, win = typeof window !== "undefined" ? window : null) {
  if (!doc || !win) return;
  const root = doc.documentElement;
  const ua = win.navigator?.userAgent || "";
  const iphone = isIphone(ua);
  const ios = isIOSDevice(ua, {
    maxTouchPoints: win.navigator?.maxTouchPoints || 0,
    platform: win.navigator?.platform || "",
  });

  let wasOpen = false;
  let quietUntil = 0;
  let lastVars = "";

  const apply = () => {
    const standalone = readStandalone(win);
    root.classList.toggle("standalone", standalone);
    const vv = win.visualViewport;
    const frame = vv ? visualFrame(vv) : null;
    const pin = shouldPinVisualViewport({ ios, standalone, frame });
    root.classList.toggle("vv", pin);
    const nextVars = pin ? `${frame.top}|${frame.left}|${frame.width}|${frame.height}` : "";
    if (nextVars !== lastVars) {
      lastVars = nextVars;
      if (!pin) {
        root.style.removeProperty("--vv-top");
        root.style.removeProperty("--vv-left");
        root.style.removeProperty("--vv-width");
        root.style.removeProperty("--vv-height");
      } else {
        root.style.setProperty("--vv-top", `${frame.top}px`);
        root.style.setProperty("--vv-left", `${frame.left}px`);
        root.style.setProperty("--vv-width", `${frame.width}px`);
        root.style.setProperty("--vv-height", `${frame.height}px`);
      }
    }

    const width = win.innerWidth || 0;
    const height = win.innerHeight || 0;
    root.classList.toggle("ios-scroll", shouldKeepSafariScroll({ iphone, standalone, width, height }));
    const rawOpen = shouldOfferChromeCollapse({
      iphone,
      standalone,
      chromeOpen: safariChromeOpen({
        standalone,
        width,
        height,
        vvHeight: frame?.height ?? height,
        vvOffsetTop: frame?.top ?? 0,
        screenWidth: win.screen?.width || 0,
        screenHeight: win.screen?.height || 0,
      }),
    });
    const now = win.performance?.now?.() ?? Date.now();
    if (wasOpen && !rawOpen) quietUntil = now + COLLAPSE_QUIET_MS;
    wasOpen = rawOpen;
    root.classList.toggle("chrome-open", rawOpen && now >= quietUntil);
  };

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    const pump = () => {
      raf = 0;
      apply();
    };
    if (win.requestAnimationFrame) raf = win.requestAnimationFrame(pump);
    else pump();
  };

  const onTouchStart = () => {
    if (root.classList.contains("chrome-open")) root.classList.add("chrome-gesture");
  };
  const onTouchEnd = (event) => {
    if (event.type === "touchcancel" || !event.touches || event.touches.length === 0) {
      root.classList.remove("chrome-gesture");
    }
  };

  // Two thumbs on the drive and aim buttons are a pinch. Cancelling the
  // gesture keeps the page put; user-scalable=no is ignored on iOS.
  const blockPinch = (event) => event.preventDefault();

  apply();
  win.addEventListener("resize", schedule);
  win.addEventListener("orientationchange", schedule);
  win.addEventListener("pageshow", schedule);
  if (win.visualViewport) {
    win.visualViewport.addEventListener("resize", schedule);
    win.visualViewport.addEventListener("scroll", schedule);
  }
  for (const query of ["(display-mode: standalone)", "(display-mode: fullscreen)"]) {
    const media = win.matchMedia?.(query);
    if (!media) continue;
    if (media.addEventListener) media.addEventListener("change", schedule);
    else if (media.addListener) media.addListener(schedule);
  }
  doc.addEventListener("touchstart", onTouchStart, { passive: true });
  doc.addEventListener("touchend", onTouchEnd, { passive: true });
  doc.addEventListener("touchcancel", onTouchEnd, { passive: true });
  doc.addEventListener("gesturestart", blockPinch, { passive: false });
  doc.addEventListener("gesturechange", blockPinch, { passive: false });
}
