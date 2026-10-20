// v6.6 G2(a) -- long-press touch-drag repositioning of an already-placed rack device.
// Per handoff §7, real touch "feel" (timing, accidental scroll) can't be meaningfully verified under
// jsdom -- flagging that explicitly here. What CAN be verified headlessly is the gesture state machine
// itself (createRepositionFSM): arm/cancel-on-move/lift/drop thresholds, driven synchronously with
// coordinates that stand in for synthesized PointerEvents (no real setTimeout waits needed, since the
// FSM's timerFire() is caller-driven rather than owning its own timer -- see script0.js's comment on
// wireDevReposition()). A DOM-level smoke test at the bottom exercises the real PointerEvent wiring
// (wireDevReposition via buildDevEl) as far as jsdom's non-layout-engine allows (no real
// getBoundingClientRect geometry, so the full arm->lift->drop->commit DOM path needs a manual check in
// a real touch browser -- flagged, not skipped).
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(process.argv[2] || "build.html", "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await new Promise(r => setTimeout(r, 150));
  const S = win.eval("S");

  // ======== Part 1: pure gesture state machine (createRepositionFSM) ========
  assert(typeof win.createRepositionFSM === "function", "createRepositionFSM is exposed");

  // -- defaults --
  const f0 = win.createRepositionFSM({});
  assert(f0.longPressMs === 350, "default long-press threshold is ~350ms");
  assert(f0.moveThresholdPx === 8, "default move-cancel threshold is 8px");
  assert(f0.getState() === "idle", "starts idle");

  // -- arm on down --
  const f1 = win.createRepositionFSM({});
  const r1 = f1.down(100, 100);
  assert(r1.action === "arm" && f1.getState() === "armed", "pointerdown arms the gesture");

  // -- cancel-on-move-before-timer (i.e. a scroll, not a long-press) --
  const rMoveSmall = f1.move(104, 101); // dist ~4.1px, under the 8px threshold
  assert(rMoveSmall.action === "none" && f1.getState() === "armed", "small movement under threshold stays armed (still could become a long-press)");
  const rMoveBig = f1.move(112, 100); // dist 12px from origin, over threshold
  assert(rMoveBig.action === "cancel" && rMoveBig.reason === "moved", "movement past the 8px threshold before the timer fires cancels (treated as a scroll)");
  assert(f1.getState() === "idle", "cancelled gesture returns to idle");
  const rTimerAfterCancel = f1.timerFire();
  assert(rTimerAfterCancel.action === "none", "a timerFire() after an already-cancelled gesture is a no-op");

  // -- exact-threshold boundary: 8.00px exactly should NOT cancel (only strictly greater than) --
  const f1b = win.createRepositionFSM({});
  f1b.down(0, 0);
  const rBoundary = f1b.move(8, 0); // exactly 8px
  assert(rBoundary.action === "none" && f1b.getState() === "armed", "movement of exactly the threshold distance does not cancel");
  const rOverBoundary = f1b.move(8.01, 0);
  assert(rOverBoundary.action === "cancel", "movement just past the threshold does cancel");

  // -- long-press fires -> lift --
  const f2 = win.createRepositionFSM({});
  f2.down(50, 50);
  f2.move(51, 51); // tiny jitter, still under threshold
  const rLift = f2.timerFire();
  assert(rLift.action === "lift" && f2.getState() === "lifted", "timerFire() while armed (and under the move threshold) lifts the device");

  // -- after lift, move() reports drag position instead of arm/cancel logic --
  const rDragMove = f2.move(200, 300);
  assert(rDragMove.action === "move" && rDragMove.x === 200 && rDragMove.y === 300, "once lifted, move() reports live drag coordinates");
  assert(f2.getState() === "lifted", "still lifted while dragging");

  // -- drop while lifted --
  const rDrop = f2.up(210, 310);
  assert(rDrop.action === "drop" && rDrop.x === 210 && rDrop.y === 310, "pointerup while lifted reports a drop with final coordinates");
  assert(f2.getState() === "idle", "drop returns to idle");

  // -- release-early (a quick tap, shorter than the long-press) --
  const f3 = win.createRepositionFSM({});
  f3.down(0, 0);
  const rEarlyUp = f3.up(1, 1);
  assert(rEarlyUp.action === "cancel" && rEarlyUp.reason === "released-early", "releasing before the long-press timer fires is a cancel, not a drop (this is a plain tap)");
  assert(f3.getState() === "idle", "released-early returns to idle");

  // -- a stray timerFire() firing after a manual up/cancel is a no-op (setTimeout wasn't cleared in time) --
  const rStaleTimer = f3.timerFire();
  assert(rStaleTimer.action === "none", "a stale timerFire() after the gesture already ended is a no-op, doesn't resurrect it");

  // -- external cancel (e.g. Escape key) while lifted --
  const f4 = win.createRepositionFSM({});
  f4.down(0, 0);
  f4.timerFire();
  assert(f4.getState() === "lifted", "lifted, ready to be externally cancelled");
  const rExtCancel = f4.cancel("escape");
  assert(rExtCancel.action === "cancel" && rExtCancel.reason === "escape" && f4.getState() === "idle", "external cancel() (Escape) drops out of a lift back to idle");

  // -- external cancel while already idle is a no-op --
  const f5 = win.createRepositionFSM({});
  const rIdleCancel = f5.cancel("escape");
  assert(rIdleCancel.action === "none", "cancel() on an already-idle gesture is a no-op (nothing to undo)");

  // -- custom thresholds are honored --
  const f6 = win.createRepositionFSM({ longPressMs: 500, moveThresholdPx: 20 });
  assert(f6.longPressMs === 500 && f6.moveThresholdPx === 20, "custom longPressMs/moveThresholdPx are respected");
  f6.down(0, 0);
  assert(f6.move(15, 0).action === "none", "custom (wider) move threshold doesn't cancel at a distance that would've cancelled the default");
  assert(f6.move(25, 0).action === "cancel", "custom move threshold does cancel once actually exceeded");

  // ======== Part 2: DOM wiring smoke test (arm/cancel plumbing reachable; full geometry needs a real device) ========
  // NOTE: jsdom has no real layout engine, so getBoundingClientRect()/elementFromPoint() used inside
  // wireDevReposition()'s onMove/onUp handlers to resolve a drop target won't return meaningful rack
  // geometry here. This section only confirms the touch-gated pointerdown listener is wired onto placed
  // .dev elements and doesn't throw / doesn't fire on non-touch pointers -- the full arm->lift->drag->
  // drop-validates-with-canPlace()->commit() path must be spot-checked by hand on a real touch device or
  // Chrome DevTools' touch emulation, per handoff §7's documented jsdom gap for touch feel.
  S.racks = [{ id: "r1", name: "Rack One", sizeU: 12, depth: 20, color: "#123", notes: "", circuits: [], devices: [
    { id: "d1", tplId: null, name: "Amp", cat: "Audio", u: 1, w: "full", side: "L", mount: "front",
      depth: null, inOff: null, pos: 3, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
      notes: "", rx: null, ry: null, hideInRouting: null, pushProtect: false, draw: null, circuit: null, ports: [] }
  ] }];
  S.edges = [];
  S.ui.view = "racks"; S.ui.selRack = "r1"; S.ui.face = "front";
  win.eval("render()");
  const devEl = doc.querySelector('.dev[data-dev="d1"]');
  assert(!!devEl, "placed device renders a .dev element in the Racks view");

  // A mouse pointerdown must NOT engage the reposition gesture (desktop HTML5 dnd + click-select stay untouched)
  let threw = false;
  try {
    devEl.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", clientX: 10, clientY: 10 }));
  } catch (e) { threw = true; console.log("mouse pointerdown threw:", e.message); }
  assert(!threw, "mouse pointerdown on a placed device doesn't throw (reposition gesture correctly ignores non-touch pointers)");
  assert(S.racks[0].devices[0].pos === 3, "mouse pointerdown alone never mutates device position (no accidental move)");

  // A touch pointerdown should be accepted without throwing (arms the gesture; timer/geometry resolution
  // is the part that needs a real browser, per the note above)
  let threw2 = false;
  try {
    devEl.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", clientX: 10, clientY: 10 }));
    doc.dispatchEvent(new win.PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "touch", clientX: 10, clientY: 10 }));
  } catch (e) { threw2 = true; console.log("touch pointerdown/up threw:", e.message); }
  assert(!threw2, "touch pointerdown+quick pointerup (a plain tap, under the long-press threshold) doesn't throw");
  assert(S.racks[0].devices[0].pos === 3, "a quick tap (released before the long-press timer) never mutates device position");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
