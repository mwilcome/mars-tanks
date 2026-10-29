// iPhone Safari still has no Element.requestFullscreen for a page (iPad only).
// A normal tab can only fill the visual viewport, and the toolbars collapse
// when the document actually scrolls. An installed web app is a different box:
// with viewport-fit=cover, 100dvh / visualViewport are short of the screen
// (WebKit bugs 254868 and 313800), so standalone keeps the large viewport.
//
// Android Chrome does have the Fullscreen API. screen.orientation.lock is
// allowed only while that fullscreen is active, and the browser drops the
// lock again when fullscreen ends. requestFullscreen has to run inside the
// swipe's touchend. Chrome forgets that user gesture if the swipe was allowed
// to become a scroll, so the touchmove is cancelled. iOS never takes this path.

export const SAFARI_CHROME_GAP = 40;
const COLLAPSE_QUIET_MS = 600;
export const FULLSCREEN_SWIPE_MIN_PX = 64;
// Scrollable menus and controls keep their own gestures. A swipe that starts
// on them must not be stolen for fullscreen.
export const FULLSCREEN_SWIPE_IGNORE =
  "button, input, textarea, select, a, label, .help-panel, .map-grid, #shop-list, #weapons";

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

export function isAndroid(ua = "") {
  return /Android/i.test(ua);
}

export function isDocumentFullscreen(doc) {
  if (!doc) return false;
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export function shouldOfferFullscreenSwipe({
  android = false,
  ios = false,
  standalone = false,
  landscape = false,
  fullscreen = false,
  api = false,
} = {}) {
  return Boolean(android && !ios && !standalone && landscape && !fullscreen && api);
}

export function isFullscreenSwipeTarget(target) {
  const el = typeof target?.closest === "function" ? target : target?.parentElement;
  if (!el || typeof el.closest !== "function") return false;
  return el.closest(FULLSCREEN_SWIPE_IGNORE) == null;
}

export function createFullscreenSwipeTracker({ minPx = FULLSCREEN_SWIPE_MIN_PX } = {}) {
  let armed = null;
  return {
    start(x, y, allowed) {
      armed = allowed ? { x: Number(x) || 0, y: Number(y) || 0 } : null;
    },
    // Every move of an armed swipe has to be cancelled. The first touchmove
    // is the one Chrome uses to decide the gesture is a scroll.
    move() {
      return armed != null;
    },
    end(x, y) {
      if (!armed) return false;
      const dx = (Number(x) || 0) - armed.x;
      const dy = armed.y - (Number(y) || 0);
      armed = null;
      return dy >= minPx && Math.abs(dx) <= dy;
    },
    cancel() {
      armed = null;
    },
  };
}

function lockLandscape(win) {
  const orientation = win?.screen?.orientation;
  if (!orientation || typeof orientation.lock !== "function") return true;
  try {
    const pending = orientation.lock("landscape");
    if (pending && typeof pending.then === "function") return pending.then(() => true, () => true);
    return true;
  } catch {
    return true;
  }
}

export function enterLandscapeFullscreen(doc, win) {
  const el = doc?.documentElement;
  if (!el || typeof el.requestFullscreen !== "function") return Promise.resolve(false);
  if (isDocumentFullscreen(doc)) return Promise.resolve(true);

  const start = (options) => {
    const pending = options === undefined ? el.requestFullscreen() : el.requestFullscreen(options);
    return pending && typeof pending.then === "function" ? pending : Promise.resolve();
  };

  // navigationUI: "hide" is what drops Android's navigation bar. Retry without
  // the bag only when the implementation throws on the argument. A rejected
  // promise has already spent the user gesture, so it is not retried.
  let pending;
  try {
    pending = start({ navigationUI: "hide" });
  } catch {
    try {
      pending = start();
    } catch {
      return Promise.resolve(false);
    }
  }
  return Promise.resolve(pending).then(() => {
    if (!isDocumentFullscreen(doc)) return false;
    return lockLandscape(win);
  }, () => false);
}

function installAndroidFullscreenSwipe(doc, win, offered) {
  const tracker = createFullscreenSwipeTracker();

  doc.addEventListener("touchstart", (event) => {
    if (!offered() || event.touches.length !== 1) {
      tracker.cancel();
      return;
    }
    const touch = event.touches[0];
    tracker.start(touch.clientX, touch.clientY, isFullscreenSwipeTarget(event.target));
  }, { passive: true });

  doc.addEventListener("touchmove", (event) => {
    if (!offered() || event.touches.length !== 1) {
      tracker.cancel();
      return;
    }
    if (tracker.move() && event.cancelable) event.preventDefault();
  }, { passive: false });

  doc.addEventListener("touchend", (event) => {
    const touch = event.changedTouches && event.changedTouches[0];
    const swipe = touch ? tracker.end(touch.clientX, touch.clientY) : false;
    if (!swipe || !offered()) return;
    // Synchronous on purpose. Chrome forgets the swipe's user gesture if this
    // waits for a timer or another turn of the event loop.
    void enterLandscapeFullscreen(doc, win);
  }, { passive: true });

  doc.addEventListener("touchcancel", () => tracker.cancel(), { passive: true });
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
    root.classList.toggle("fullscreen-offer", fullscreenSwipeOffered());
  };

  const fullscreenSwipeOffered = () => shouldOfferFullscreenSwipe({
    android: isAndroid(ua),
    ios,
    standalone: readStandalone(win),
    landscape: (win.innerWidth || 0) > (win.innerHeight || 0),
    fullscreen: isDocumentFullscreen(doc),
    api: typeof root.requestFullscreen === "function",
  });

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
  doc.addEventListener("fullscreenchange", schedule);
  doc.addEventListener("webkitfullscreenchange", schedule);
  doc.addEventListener("gesturestart", blockPinch, { passive: false });
  doc.addEventListener("gesturechange", blockPinch, { passive: false });
  // iPhone must not get this listener. Cancelling touchmove is what keeps
  // Android's user gesture alive, and it is also what would stop Safari from
  // collapsing its toolbars.
  if (isAndroid(ua) && !ios && typeof root.requestFullscreen === "function" && !readStandalone(win)) {
    installAndroidFullscreenSwipe(doc, win, fullscreenSwipeOffered);
  }
}
