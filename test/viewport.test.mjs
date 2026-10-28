import assert from "node:assert/strict";
import test from "node:test";
import {
  SAFARI_CHROME_GAP,
  boardShouldPreventTouchMove,
  isIOSDevice,
  isIphone,
  isStandaloneDisplay,
  safariChromeOpen,
  shouldKeepSafariScroll,
  shouldOfferChromeCollapse,
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
