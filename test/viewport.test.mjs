import assert from "node:assert/strict";
import test from "node:test";
import {
  SAFARI_CHROME_GAP,
  boardShouldPreventTouchMove,
  createFullscreenSwipeTracker,
  enterLandscapeFullscreen,
  installViewport,
  isAndroid,
  isDocumentFullscreen,
  isFullscreenSwipeTarget,
  isIOSDevice,
  isIphone,
  isStandaloneDisplay,
  safariChromeOpen,
  shouldKeepSafariScroll,
  shouldOfferChromeCollapse,
  shouldOfferFullscreenSwipe,
  shouldPinVisualViewport,
  visualFrame,
} from "../js/viewport.js";

const iphone = {
  standalone: false,
  width: 844,
  height: 390,
  screenWidth: 390,
  screenHeight: 844,
};

test("an expanded landscape Safari toolbar counts as open", () => {
  assert.equal(safariChromeOpen({ ...iphone, vvHeight: 300, vvOffsetTop: 0 }), true);
  assert.equal(safariChromeOpen({ ...iphone, vvHeight: 280, vvOffsetTop: 20 }), true);
});

test("a collapsed toolbar, including the leftover domain strip, counts as closed", () => {
  const limit = 390 - SAFARI_CHROME_GAP;
  assert.equal(safariChromeOpen({ ...iphone, vvHeight: limit, vvOffsetTop: 0 }), false);
  assert.equal(safariChromeOpen({ ...iphone, vvHeight: limit - 1, vvOffsetTop: 0 }), true);
  assert.equal(safariChromeOpen({ ...iphone, vvHeight: 370, vvOffsetTop: 0 }), false);
});

test("portrait and standalone never ask the player to dismiss Safari chrome", () => {
  assert.equal(safariChromeOpen({ ...iphone, width: 390, height: 700, vvHeight: 620 }), false);
  assert.equal(safariChromeOpen({ ...iphone, standalone: true, vvHeight: 320 }), false);
  assert.equal(safariChromeOpen({ ...iphone, screenWidth: 0, screenHeight: 0, vvHeight: 200 }), false);
});

test("only an iPhone tab in landscape keeps a scroll runway for the toolbar", () => {
  assert.equal(shouldKeepSafariScroll({ iphone: true, standalone: false, width: 800, height: 390 }), true);
  assert.equal(shouldKeepSafariScroll({ iphone: true, standalone: true, width: 800, height: 390 }), false);
  assert.equal(shouldKeepSafariScroll({ iphone: true, standalone: false, width: 390, height: 800 }), false);
  assert.equal(shouldKeepSafariScroll({ iphone: false, standalone: false, width: 800, height: 390 }), false);
});

test("the collapse hint follows the iPhone toolbar, not an iPad or a web app", () => {
  assert.equal(shouldOfferChromeCollapse({ iphone: true, standalone: false, chromeOpen: true }), true);
  assert.equal(shouldOfferChromeCollapse({ iphone: true, standalone: false, chromeOpen: false }), false);
  assert.equal(shouldOfferChromeCollapse({ iphone: true, standalone: true, chromeOpen: true }), false);
  assert.equal(shouldOfferChromeCollapse({ iphone: false, standalone: false, chromeOpen: true }), false);
});

test("the visual viewport pin is for a browser tab, not the installed app", () => {
  const frame = { top: 0, left: 0, width: 800, height: 340 };
  assert.equal(shouldPinVisualViewport({ ios: true, standalone: false, frame }), true);
  assert.equal(shouldPinVisualViewport({ ios: true, standalone: true, frame }), false);
  assert.equal(shouldPinVisualViewport({ ios: false, standalone: false, frame }), false);
  assert.equal(shouldPinVisualViewport({ ios: true, standalone: false, frame: null }), false);
});

test("visual viewport frames round to pixels and reject an empty box", () => {
  assert.deepEqual(
    visualFrame({ width: 390.4, height: 700.5, offsetTop: 12.2, offsetLeft: 0.4 }),
    { top: 12, left: 0, width: 390, height: 701 },
  );
  assert.equal(visualFrame(null), null);
  assert.equal(visualFrame({ width: 0, height: 100, offsetTop: 0, offsetLeft: 0 }), null);
});

test("battlefield touches scroll only while the toolbar swipe is in progress", () => {
  const root = (names) => ({ classList: { contains: (name) => names.includes(name) } });
  assert.equal(boardShouldPreventTouchMove(root([])), true);
  assert.equal(boardShouldPreventTouchMove(root(["chrome-open"])), false);
  assert.equal(boardShouldPreventTouchMove(root(["chrome-gesture"])), false);
});

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

test("android fullscreen is a landscape browser tab, never an iPhone or an installed app", () => {
  const open = {
    android: true,
    ios: false,
    standalone: false,
    landscape: true,
    fullscreen: false,
    api: true,
  };
  assert.equal(shouldOfferFullscreenSwipe(open), true);
  assert.equal(shouldOfferFullscreenSwipe({ ...open, android: false }), false);
  assert.equal(shouldOfferFullscreenSwipe({ ...open, ios: true }), false);
  assert.equal(shouldOfferFullscreenSwipe({ ...open, standalone: true }), false);
  assert.equal(shouldOfferFullscreenSwipe({ ...open, landscape: false }), false);
  assert.equal(shouldOfferFullscreenSwipe({ ...open, fullscreen: true }), false);
  assert.equal(shouldOfferFullscreenSwipe({ ...open, api: false }), false);
  assert.equal(isAndroid(ANDROID_UA), true);
  assert.equal(isAndroid(IPHONE_UA), false);
  assert.equal(isDocumentFullscreen({ fullscreenElement: null }), false);
  assert.equal(isDocumentFullscreen({ fullscreenElement: {} }), true);
  assert.equal(isDocumentFullscreen({ webkitFullscreenElement: {} }), true);
});

test("a fullscreen swipe ignores controls and scrolling menus", () => {
  const open = { closest: () => null };
  const button = { closest: () => button };
  const text = { parentElement: open };
  assert.equal(isFullscreenSwipeTarget(open), true);
  assert.equal(isFullscreenSwipeTarget(text), true);
  assert.equal(isFullscreenSwipeTarget(button), false);
  assert.equal(isFullscreenSwipeTarget(null), false);
});

test("only a mostly upward swipe is a fullscreen gesture, and its move is cancelled", () => {
  const tracker = createFullscreenSwipeTracker({ minPx: 64 });
  tracker.start(100, 220, true);
  assert.equal(tracker.move(), true);
  assert.equal(tracker.end(110, 140), true);

  tracker.start(100, 220, true);
  assert.equal(tracker.end(100, 180), false);

  tracker.start(100, 220, true);
  assert.equal(tracker.end(240, 100), false);

  tracker.start(100, 220, true);
  assert.equal(tracker.end(100, 320), false);

  tracker.start(100, 220, false);
  assert.equal(tracker.move(), false);
  assert.equal(tracker.end(100, 40), false);

  tracker.start(100, 220, true);
  tracker.cancel();
  assert.equal(tracker.end(100, 40), false);
});

test("fullscreen hides Android navigation, then locks landscape", async () => {
  const calls = [];
  const doc = {
    fullscreenElement: null,
    documentElement: {
      requestFullscreen(options) {
        calls.push(["fullscreen", options ?? null]);
        doc.fullscreenElement = doc.documentElement;
        return Promise.resolve();
      },
    },
  };
  const win = {
    screen: {
      orientation: {
        lock(value) {
          calls.push(["lock", value]);
          return Promise.resolve();
        },
      },
    },
  };
  assert.equal(await enterLandscapeFullscreen(doc, win), true);
  assert.deepEqual(calls, [
    ["fullscreen", { navigationUI: "hide" }],
    ["lock", "landscape"],
  ]);
});

test("a failed fullscreen request does not lock orientation", async () => {
  let locked = false;
  const doc = {
    fullscreenElement: null,
    documentElement: {
      requestFullscreen() {
        return Promise.reject(new Error("gesture"));
      },
    },
  };
  const win = { screen: { orientation: { lock() { locked = true; return Promise.resolve(); } } } };
  assert.equal(await enterLandscapeFullscreen(doc, win), false);
  assert.equal(locked, false);
});

test("orientation lock can fail without giving fullscreen back", async () => {
  const doc = {
    fullscreenElement: null,
    documentElement: {
      requestFullscreen() {
        doc.fullscreenElement = doc.documentElement;
        return Promise.resolve();
      },
    },
  };
  const win = { screen: { orientation: { lock() { return Promise.reject(new Error("unsupported")); } } } };
  assert.equal(await enterLandscapeFullscreen(doc, win), true);
});

test("an implementation that throws on fullscreen options is retried without them", async () => {
  const calls = [];
  const doc = {
    fullscreenElement: null,
    documentElement: {
      requestFullscreen(options) {
        calls.push(options ?? null);
        if (options) throw new TypeError("options");
        doc.fullscreenElement = doc.documentElement;
        return Promise.resolve();
      },
    },
  };
  const win = { screen: { orientation: { lock() { return Promise.resolve(); } } } };
  assert.equal(await enterLandscapeFullscreen(doc, win), true);
  assert.deepEqual(calls, [{ navigationUI: "hide" }, null]);
});

test("an element that is already fullscreen is left alone", async () => {
  let called = false;
  const doc = {
    fullscreenElement: {},
    documentElement: { requestFullscreen() { called = true; return Promise.resolve(); } },
  };
  assert.equal(await enterLandscapeFullscreen(doc, {}), true);
  assert.equal(called, false);
  assert.equal(await enterLandscapeFullscreen({ documentElement: {} }, {}), false);
});

function installHarness({ ua, width = 844, height = 390, standalone = false, viewportHeight = 300 } = {}) {
  const listeners = [];
  const classes = new Set();
  const root = {
    classList: {
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    style: { setProperty() {}, removeProperty() {} },
    requestFullscreen() { return Promise.resolve(); },
  };
  const doc = {
    documentElement: root,
    fullscreenElement: null,
    addEventListener(type, fn, options) {
      listeners.push({ type, fn, options });
    },
  };
  const win = {
    navigator: { userAgent: ua, maxTouchPoints: 1, platform: "", standalone },
    innerWidth: width,
    innerHeight: height,
    screen: { width: 390, height: 844 },
    matchMedia(query) {
      return {
        matches: standalone && query.includes("standalone"),
        addEventListener() {},
      };
    },
    addEventListener() {},
    requestAnimationFrame(fn) {
      fn();
      return 1;
    },
    visualViewport: {
      width,
      height: viewportHeight,
      offsetTop: 0,
      offsetLeft: 0,
      addEventListener() {},
    },
    performance: { now: () => 0 },
  };
  installViewport(doc, win);
  const ofType = (type) => listeners.filter((entry) => entry.type === type);
  return { listeners, classes, doc, win, root, ofType };
}

test("android chrome shows the swipe hint and cancels the swipe so fullscreen can run", async () => {
  const harness = installHarness({ ua: ANDROID_UA });
  assert.equal(harness.classes.has("fullscreen-offer"), true);
  assert.equal(harness.classes.has("chrome-open"), false);
  assert.equal(harness.classes.has("ios-scroll"), false);
  const move = harness.ofType("touchmove").at(-1);
  assert.ok(move);
  assert.equal(move.options.passive, false);

  const locks = [];
  let options = null;
  harness.root.requestFullscreen = (value) => {
    options = value;
    harness.doc.fullscreenElement = harness.root;
    return Promise.resolve();
  };
  harness.win.screen.orientation = {
    lock(value) {
      locks.push(value);
      return Promise.resolve();
    },
  };

  const target = { closest: () => null };
  for (const start of harness.ofType("touchstart")) {
    start.fn({ touches: [{ clientX: 200, clientY: 240 }], target });
  }
  let prevented = false;
  move.fn({
    touches: [{ clientX: 200, clientY: 200 }],
    cancelable: true,
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  const endEvent = { changedTouches: [{ clientX: 190, clientY: 120 }], touches: [] };
  for (const end of harness.ofType("touchend")) end.fn(endEvent);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(options, { navigationUI: "hide" });
  assert.deepEqual(locks, ["landscape"]);
});

test("android does not take a swipe that starts on a control", () => {
  const harness = installHarness({ ua: ANDROID_UA });
  let prevented = false;
  let requested = false;
  harness.root.requestFullscreen = () => {
    requested = true;
    return Promise.resolve();
  };
  const target = { closest: () => target };
  for (const start of harness.ofType("touchstart")) {
    start.fn({ touches: [{ clientX: 40, clientY: 200 }], target });
  }
  harness.ofType("touchmove").at(-1).fn({
    touches: [{ clientX: 40, clientY: 40 }],
    cancelable: true,
    preventDefault() { prevented = true; },
  });
  for (const end of harness.ofType("touchend")) {
    end.fn({ changedTouches: [{ clientX: 40, clientY: 40 }], touches: [] });
  }
  assert.equal(prevented, false);
  assert.equal(requested, false);
});

test("iphone safari keeps the toolbar swipe and never requests fullscreen", () => {
  const harness = installHarness({ ua: IPHONE_UA });
  assert.equal(harness.classes.has("chrome-open"), true);
  assert.equal(harness.classes.has("ios-scroll"), true);
  assert.equal(harness.classes.has("fullscreen-offer"), false);
  assert.equal(harness.ofType("touchmove").length, 0);
  let requested = false;
  harness.root.requestFullscreen = () => {
    requested = true;
    return Promise.resolve();
  };
  const target = { closest: () => null };
  for (const start of harness.ofType("touchstart")) {
    start.fn({ touches: [{ clientX: 80, clientY: 200 }], target });
  }
  assert.equal(harness.classes.has("chrome-gesture"), true);
  for (const end of harness.ofType("touchend")) {
    end.fn({ changedTouches: [{ clientX: 80, clientY: 40 }], touches: [] });
  }
  assert.equal(harness.classes.has("chrome-gesture"), false);
  assert.equal(requested, false);
});

test("an installed android app does not offer the browser swipe", () => {
  const harness = installHarness({ ua: ANDROID_UA, standalone: true, viewportHeight: 390 });
  assert.equal(harness.classes.has("fullscreen-offer"), false);
  assert.equal(harness.classes.has("standalone"), true);
  assert.equal(harness.ofType("touchmove").length, 0);
});

test("iPhone and iPad are the devices that get the Safari viewport treatment", () => {
  assert.equal(isIphone("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"), true);
  assert.equal(isIphone("Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X)"), false);
  assert.equal(isIphone("Mozilla/5.0 (Macintosh)"), false);
  assert.equal(isIOSDevice("Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X)"), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (Macintosh)", { platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (Macintosh)", { platform: "MacIntel", maxTouchPoints: 0 }), false);
  assert.equal(isStandaloneDisplay({ standalone: true }), true);
  assert.equal(isStandaloneDisplay({ displayMode: "fullscreen" }), true);
  assert.equal(isStandaloneDisplay({ displayMode: "standalone" }), true);
  assert.equal(isStandaloneDisplay({ displayMode: "browser" }), false);
});
