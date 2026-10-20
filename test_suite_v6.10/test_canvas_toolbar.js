// v6.8 Part 1 -- floating canvas toolbar (Figma/Miro-style pill, bottom-center of the Routing/Rig
// canvas). Replaces/absorbs the old zoom-ctl pill there plus the topbar's standalone Undo/Redo/Trace/
// wire-style controls into one unified toolbar: Undo/Redo, a Select/Pan tool-mode segmented pair,
// Trace, the Curved/Orthogonal wire-style segmented pair, and a Zoom group (-/%/+/Fit). New behavior
// covered here: marquee multi-select in Select mode (drag on empty canvas -> rectangular selection,
// shift-adds, never starts from a node/port/cable), Pan tool mode (drag anywhere pans instead of
// dragging nodes), space-hold temporary pan, middle-mouse-drag pan (always available), Ctrl+A
// select-all, zoom-to-fit math, and Esc cancelling an in-progress marquee. The Racks view keeps its own
// separate zoomCtl("zoomRack") pill untouched -- this toolbar is Routing/Rig-canvas-only, per spec.
//
// Per handoff §7, jsdom has no real layout engine -- getBoundingClientRect() on freshly-appended
// elements returns all zeros. Marquee/zoom-to-fit hit-testing is therefore split into pure, unit-testable
// math (rectsIntersect/computeMarqueeHits/computeFitZoomScroll, tested directly with hand-built rects)
// plus a DOM-wiring layer tested by stubbing getBoundingClientRect() on the specific elements involved
// (a standard, precedented jsdom technique) to simulate a known on-screen layout.
const fs = require("fs");
const { JSDOM } = require("jsdom");
const path = require("path");
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, "build.html"), "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

const mkDev = (id, name, dir, rx, ry) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
  depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
  notes: "", rx, ry, hideInRouting: null, pushProtect: false, draw: null, circuit: null,
  ports: [{ id: "g1", name: "P", type: "XLR3", dir, count: 1, face: "front", jacks: [] }] });
const mkRack = (id, name, devices) => ({ id, name, sizeU: 20, depth: 20, color: "#123456", notes: "", circuits: [], devices });

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  win.addEventListener("error", e => console.error("WINDOW ERROR:", (e.error && e.error.stack) || e.message));
  await new Promise(r => setTimeout(r, 150));
  const S = win.eval("S");
  const PE = win.PointerEvent;

  // ============================================================
  // 1. Presence only on Routing/Rig, topbar cleansed, migrate() default
  // ============================================================
  assert(S.ui.toolMode === "select", "migrate() backfills S.ui.toolMode to 'select' by default");
  assert(!doc.querySelector(".canvas-toolbar"), "canvas toolbar does not render on the initial (Library) view");

  S.ui.view = "racks";
  win.eval("render()");
  assert(!doc.querySelector(".canvas-toolbar"), "canvas toolbar does not render on the Racks view");
  assert(!!doc.querySelector(".zoom-ctl"), "Racks view keeps its own separate zoom-ctl pill untouched");

  S.racks = [mkRack("r1", "Rack One", [mkDev("d1", "Dev A", "out", 20, 20), mkDev("d2", "Dev B", "in", 300, 300)])];
  S.ui.view = "routing";
  S.ui.routingRackOnly = "r1";
  win.eval("render()");
  const bar = doc.querySelector(".canvas-toolbar");
  assert(!!bar, "canvas toolbar renders on the Routing view");
  assert(!doc.querySelector(".zoom-ctl"), "the old standalone zoom-ctl pill is gone from Routing (absorbed into the toolbar)");

  S.ui.view = "rig";
  win.eval("render()");
  assert(!!doc.querySelector(".canvas-toolbar"), "canvas toolbar also renders on the Rig view");

  S.ui.view = "routing";
  win.eval("render()");

  // topbar no longer hosts these controls at all (not just moved within the topbar)
  assert(!doc.querySelector("#topbar #btnTrace"), "topbar no longer has #btnTrace");
  assert(!doc.querySelector("#topbar #wireStyleSeg"), "topbar no longer has #wireStyleSeg");
  assert(!doc.querySelector("#topbar #btnUndo"), "topbar no longer has #btnUndo");
  assert(!doc.querySelector("#topbar #btnRedo"), "topbar no longer has #btnRedo");
  // topbar end state: view tabs | theme | Save | New | Import | Rig Check | Export
  const topbarBtnIds = [...doc.querySelectorAll("#topbar .actions > *")].map(el => el.id).filter(Boolean);
  assert(JSON.stringify(topbarBtnIds) === JSON.stringify(["btnTheme", "btnSaveNow", "btnNew", "btnImport", "btnCheck", "btnExportMenu"]),
    `topbar actions are exactly theme/Save/New/Import/RigCheck/Export, in order (got ${JSON.stringify(topbarBtnIds)})`);

  // ============================================================
  // 2. Toolbar contains undo/redo/select/pan/trace/wire-style/zoom/fit
  // ============================================================
  assert(!!bar.querySelector("#btnUndo"), "toolbar contains #btnUndo");
  assert(!!bar.querySelector("#btnRedo"), "toolbar contains #btnRedo");
  const seg = bar.querySelector("#toolModeSeg");
  assert(!!seg, "toolbar contains the Select/Pan tool-mode segmented control");
  assert(!!seg.querySelector('[data-mode="select"]') && !!seg.querySelector('[data-mode="pan"]'), "tool-mode segment has both Select and Pan buttons");
  assert(!!bar.querySelector("#btnTrace"), "toolbar contains #btnTrace");
  assert(!bar.querySelector("#wireStyleSeg"), "v6.10.1: the Curved/Orthogonal wire-style segment is gone (orthogonal only)");
  assert(!!bar.querySelector(".ct-zoom"), "toolbar contains the zoom group");
  assert(!!bar.querySelector(".ct-zoom [data-z='-']") && !!bar.querySelector(".ct-zoom [data-z='+']"), "zoom group has - and + buttons");
  assert(!!bar.querySelector("#btnZoomFit"), "toolbar contains the new Fit button");
  assert(/shift.*1/i.test(bar.querySelector("#btnZoomFit").title), "Fit button's tooltip documents the Shift+1 shortcut");

  // ============================================================
  // 3. Disabled states (undo/redo) track the stacks and rebuild correctly on render()
  // ============================================================
  win.eval("resetUndoHistory()");
  win.eval("render()");
  assert(doc.querySelector("#btnUndo").disabled === true, "undo starts disabled with an empty stack");
  win.eval("commit()"); // seed baseline
  S.racks[0].name = "Renamed";
  win.eval("commit()");
  assert(doc.querySelector("#btnUndo").disabled === false, "undo enables after a structural commit()");
  doc.querySelector("#btnUndo").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.racks[0].name === "Rack One", "clicking the toolbar's #btnUndo performs the same doUndo() as the old topbar button");
  assert(doc.querySelector("#btnRedo").disabled === false, "redo enables after an undo");
  doc.querySelector("#btnRedo").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.racks[0].name === "Renamed", "clicking the toolbar's #btnRedo performs the same doRedo() as the old topbar button");

  // Trace toggle (T) -- same behavior as before, now sourced from the toolbar button
  doc.querySelector("#btnTrace").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(win.eval("TRACE_ARMED") === true, "clicking the toolbar's Trace button arms trace mode");
  doc.querySelector("#btnTrace").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(win.eval("TRACE_ARMED") === false, "clicking it again disarms trace mode");

  // v6.10.1: no wire-style toggle -- routing is always orthogonal
  assert(S.ui.wireStyle === "orthogonal", "S.ui.wireStyle is pinned to orthogonal");

  // zoom group -- same behavior as the old pill
  const zoomBefore = S.ui.zoomRoute || 1;
  doc.querySelector(".ct-zoom [data-z='+']").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(Math.abs((S.ui.zoomRoute || 1) - (zoomBefore + 0.1)) < 1e-9, "clicking + increases S.ui.zoomRoute by 0.1");
  doc.querySelector(".ct-zoom [data-z='-']").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(Math.abs((S.ui.zoomRoute || 1) - zoomBefore) < 1e-9, "clicking - brings it back down");

  // ============================================================
  // 4. Tool-mode switching + persistence + migrate() default
  // ============================================================
  doc.querySelector('#toolModeSeg [data-mode="pan"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.toolMode === "pan", "clicking Pan in the tool-mode segment sets S.ui.toolMode");
  assert(doc.querySelector('#toolModeSeg [data-mode="pan"]').classList.contains("active"), "Pan button gets the active class");
  assert(doc.querySelector("#routeCanvas").classList.contains("pan-mode"), "#routeCanvas gets the pan-mode class while S.ui.toolMode is 'pan'");
  const raw = win.localStorage.getItem("dlux-rackmaster-v1");
  assert(raw && JSON.parse(raw).ui.toolMode === "pan", "tool mode choice persists to localStorage");

  doc.querySelector('#toolModeSeg [data-mode="select"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.toolMode === "select", "clicking Select switches back");
  assert(!doc.querySelector("#routeCanvas").classList.contains("pan-mode"), "pan-mode class is removed when switching back to Select");

  // keyboard shortcuts V/H (suppressed while typing)
  doc.body.focus();
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "h", bubbles: true, cancelable: true }));
  assert(S.ui.toolMode === "pan", "H key switches to Pan mode");
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "v", bubbles: true, cancelable: true }));
  assert(S.ui.toolMode === "select", "V key switches back to Select mode");
  const inp = doc.createElement("input"); inp.type = "text"; doc.body.appendChild(inp); inp.focus();
  inp.dispatchEvent(new win.KeyboardEvent("keydown", { key: "h", bubbles: true, cancelable: true }));
  assert(S.ui.toolMode === "select", "H key is suppressed while typing in a text input (same guard as T/Ctrl+Z)");
  inp.remove(); doc.body.focus();

  // migrate() heals a bad/missing toolMode on an old/hand-edited project
  win.eval('S.ui.toolMode = undefined; migrate();');
  assert(S.ui.toolMode === "select", "migrate() backfills a missing toolMode to 'select'");
  win.eval('S.ui.toolMode = "bogus"; migrate();');
  assert(S.ui.toolMode === "select", "migrate() heals an invalid/unrecognized toolMode value to 'select'");
  win.eval('S.ui.toolMode = "pan"; migrate();');
  assert(S.ui.toolMode === "pan", "migrate() preserves an existing valid 'pan' toolMode");
  S.ui.toolMode = "select";
  win.eval("render()");

  // ============================================================
  // 5. Marquee selection: pure math
  // ============================================================
  assert(typeof win.rectsIntersect === "function", "rectsIntersect is exposed");
  assert(typeof win.computeMarqueeHits === "function", "computeMarqueeHits is exposed");
  assert(win.rectsIntersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 5, top: 5, right: 15, bottom: 15 }) === true, "overlapping rects intersect");
  assert(win.rectsIntersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 20, top: 20, right: 30, bottom: 30 }) === false, "disjoint rects do not intersect");
  assert(win.rectsIntersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 10, right: 20, bottom: 20 }) === false, "edge-touching rects (no area overlap) do not intersect");
  const cands = [
    { key: "a", rect: { left: 0, top: 0, right: 10, bottom: 10 } },
    { key: "b", rect: { left: 100, top: 100, right: 110, bottom: 110 } },
    { key: "rack:r9", rect: { left: 5, top: 5, right: 8, bottom: 8 } }
  ];
  assert(JSON.stringify(win.computeMarqueeHits(cands, { left: -5, top: -5, right: 50, bottom: 50 })) === JSON.stringify(["a", "rack:r9"]),
    "computeMarqueeHits returns every candidate whose rect intersects the marquee rect, in candidate order");
  assert(win.computeMarqueeHits(cands, { left: 200, top: 200, right: 210, bottom: 210 }).length === 0, "computeMarqueeHits returns nothing when the marquee touches no candidates");

  // ============================================================
  // 6. Marquee selection: DOM wiring (stubbed getBoundingClientRect simulates a known layout)
  // ============================================================
  const nodeD1 = doc.querySelector('.node[data-dev="d1"]');
  const nodeD2 = doc.querySelector('.node[data-dev="d2"]');
  const canvasEl = doc.querySelector("#routeCanvas");
  const inner = doc.querySelector("#routeInner");
  nodeD1.getBoundingClientRect = () => ({ left: 50, top: 50, right: 150, bottom: 100, width: 100, height: 50 });
  nodeD2.getBoundingClientRect = () => ({ left: 500, top: 500, right: 600, bottom: 550, width: 100, height: 50 });
  canvasEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 });

  MSELCheck: {
    win.eval("MSEL.devs = []");
    inner.dispatchEvent(new PE("pointerdown", { clientX: 0, clientY: 0, button: 0, bubbles: true, cancelable: true }));
    doc.dispatchEvent(new PE("pointermove", { clientX: 200, clientY: 200, bubbles: true, cancelable: true }));
    doc.dispatchEvent(new PE("pointerup", { clientX: 200, clientY: 200, bubbles: true, cancelable: true }));
  }
  assert(JSON.stringify(win.eval("MSEL.devs")) === JSON.stringify(["d1"]), "dragging a marquee over d1's rect (not d2's) selects only d1 into MSEL.devs");

  // shift+marquee adds to the existing selection instead of replacing it
  inner.dispatchEvent(new PE("pointerdown", { clientX: 480, clientY: 480, button: 0, shiftKey: true, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointermove", { clientX: 650, clientY: 650, shiftKey: true, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointerup", { clientX: 650, clientY: 650, shiftKey: true, bubbles: true, cancelable: true }));
  const afterShift = win.eval("MSEL.devs").slice().sort();
  assert(JSON.stringify(afterShift) === JSON.stringify(["d1", "d2"]), "shift-marquee over d2 adds it to the existing selection (d1 stays selected)");

  // a non-shift marquee replaces the selection
  win.eval("render()"); // MSEL classes baked in during render -- re-fetch canvasEl/inner/nodes after
  const inner2 = doc.querySelector("#routeInner");
  const canvasEl2b = doc.querySelector("#routeCanvas");
  canvasEl2b.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 });
  doc.querySelector('.node[data-dev="d1"]').getBoundingClientRect = () => ({ left: 50, top: 50, right: 150, bottom: 100, width: 100, height: 50 });
  inner2.dispatchEvent(new PE("pointerdown", { clientX: 0, clientY: 0, button: 0, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointermove", { clientX: 60, clientY: 60, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointerup", { clientX: 60, clientY: 60, bubbles: true, cancelable: true }));
  assert(JSON.stringify(win.eval("MSEL.devs")) === JSON.stringify(["d1"]), "a plain (non-shift) marquee replaces the previous selection rather than adding to it");

  // marquee must not fire when the drag starts on a node/port/cable
  win.eval("MSEL.devs = []; render();");
  const headD1 = doc.querySelector('.node[data-dev="d1"] .node-head');
  headD1.getBoundingClientRect = () => ({ left: 50, top: 50, right: 150, bottom: 65, width: 100, height: 15 });
  headD1.dispatchEvent(new PE("pointerdown", { clientX: 60, clientY: 55, button: 0, bubbles: true, cancelable: true }));
  assert(win.eval("MARQUEE") === null, "pointerdown on a node-head does not start a marquee (MARQUEE stays null)");
  doc.dispatchEvent(new PE("pointerup", { clientX: 60, clientY: 55, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointermove", { clientX: 200, clientY: 200, bubbles: true, cancelable: true })); // no-op, nothing armed
  assert(JSON.stringify(win.eval("MSEL.devs")) === JSON.stringify([]), "no stray marquee selection resulted from a drag that started on a node");

  // a plain click (no movement) on empty canvas does not start a marquee selection (moved === false -> no-op)
  win.eval("MSEL.devs = ['d1']; render();");
  const inner3 = doc.querySelector("#routeInner");
  inner3.dispatchEvent(new PE("pointerdown", { clientX: 300, clientY: 300, button: 0, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointerup", { clientX: 300, clientY: 300, bubbles: true, cancelable: true }));
  assert(JSON.stringify(win.eval("MSEL.devs")) === JSON.stringify(["d1"]), "a plain unmoved click on empty canvas does not itself clear MSEL via the marquee path (the existing click-to-deselect listener owns that separately)");

  // ============================================================
  // 7. Esc cancels an in-progress marquee
  // ============================================================
  win.eval("render()");
  const inner4 = doc.querySelector("#routeInner");
  inner4.dispatchEvent(new PE("pointerdown", { clientX: 10, clientY: 10, button: 0, bubbles: true, cancelable: true }));
  assert(win.eval("MARQUEE") !== null, "MARQUEE is active mid-drag");
  assert(!!doc.querySelector(".marquee"), "a visible .marquee element exists mid-drag");
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(win.eval("MARQUEE") === null, "Escape clears MARQUEE (cancels the in-progress drag)");
  assert(!doc.querySelector(".marquee"), "the visible .marquee element is removed on Escape-cancel");

  // ============================================================
  // 8. Pan mode blocks node drag; middle-mouse and space-hold pan are always available
  // ============================================================
  win.eval("render()");
  S.ui.toolMode = "pan";
  win.eval("render()");
  const canvasEl3 = doc.querySelector("#routeCanvas");
  canvasEl3.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 });
  canvasEl3.scrollLeft = 0; canvasEl3.scrollTop = 0;
  const headD1b = doc.querySelector('.node[data-dev="d1"] .node-head');
  const rxBefore = S.racks[0].devices[0].rx;
  headD1b.dispatchEvent(new PE("pointerdown", { clientX: 60, clientY: 55, button: 0, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointermove", { clientX: 100, clientY: 95, bubbles: true, cancelable: true }));
  assert(S.racks[0].devices[0].rx === rxBefore, "dragging from a node-head in Pan mode does not reposition the device");
  assert(canvasEl3.scrollLeft !== 0 || canvasEl3.scrollTop !== 0, "dragging from a node-head in Pan mode pans the canvas instead");
  doc.dispatchEvent(new PE("pointerup", { clientX: 100, clientY: 95, bubbles: true, cancelable: true }));
  S.ui.toolMode = "select";
  win.eval("render()");

  // middle-mouse drag pans regardless of tool mode (Select mode here)
  const canvasEl4 = doc.querySelector("#routeCanvas");
  canvasEl4.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 });
  canvasEl4.scrollLeft = 0; canvasEl4.scrollTop = 0;
  canvasEl4.dispatchEvent(new PE("pointerdown", { clientX: 100, clientY: 100, button: 1, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointermove", { clientX: 60, clientY: 70, bubbles: true, cancelable: true }));
  assert(canvasEl4.scrollLeft === 40 && canvasEl4.scrollTop === 30, "middle-mouse drag pans the canvas even while in Select mode");
  doc.dispatchEvent(new PE("pointerup", { clientX: 60, clientY: 70, bubbles: true, cancelable: true }));

  // space-hold temporary pan
  canvasEl4.scrollLeft = 0; canvasEl4.scrollTop = 0;
  assert(win.eval("SPACE_HELD") === false, "SPACE_HELD starts false");
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true }));
  assert(win.eval("SPACE_HELD") === true, "holding Space sets SPACE_HELD");
  assert(doc.querySelector("#routeCanvas").classList.contains("space-pan"), "#routeCanvas gets the space-pan class while Space is held");
  canvasEl4.dispatchEvent(new PE("pointerdown", { clientX: 100, clientY: 100, button: 0, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointermove", { clientX: 80, clientY: 90, bubbles: true, cancelable: true }));
  assert(canvasEl4.scrollLeft === 20 && canvasEl4.scrollTop === 10, "dragging while Space is held pans the canvas (temporary pan override) even in Select mode");
  doc.dispatchEvent(new PE("pointerup", { clientX: 80, clientY: 90, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new win.KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true, cancelable: true }));
  assert(win.eval("SPACE_HELD") === false, "releasing Space clears SPACE_HELD");
  assert(!doc.querySelector("#routeCanvas").classList.contains("space-pan"), "space-pan class is removed on keyup");

  // ============================================================
  // 9. Ctrl+A select-all + typing suppression
  // ============================================================
  win.eval("MSEL.devs = []; S.ui.selDev = null; render();");
  doc.body.focus();
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
  const selAll = win.eval("MSEL.devs").slice().sort();
  assert(JSON.stringify(selAll) === JSON.stringify(["d1", "d2"]), "Ctrl+A in Select mode selects every visible device into MSEL.devs");

  win.eval("MSEL.devs = []; render();");
  const inp2 = doc.createElement("input"); inp2.type = "text"; doc.body.appendChild(inp2); inp2.focus();
  inp2.dispatchEvent(new win.KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
  assert(JSON.stringify(win.eval("MSEL.devs")) === JSON.stringify([]), "Ctrl+A is suppressed while focus is inside a text input (same guard as T/Ctrl+Z/V/H)");
  inp2.remove(); doc.body.focus();

  // Ctrl+A does nothing in Pan mode (nothing to "select" while panning)
  win.eval("MSEL.devs = []; S.ui.toolMode = 'pan'; render();");
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
  assert(JSON.stringify(win.eval("MSEL.devs")) === JSON.stringify([]), "Ctrl+A does not select-all while in Pan tool mode");
  S.ui.toolMode = "select";
  win.eval("render()");

  // ============================================================
  // 10. Zoom-to-fit math: pure function, known bounding box -> expected zoom/scroll
  // ============================================================
  assert(typeof win.computeFitZoomScroll === "function", "computeFitZoomScroll is exposed");
  // content 1000x500, viewport 800x600, pad 40: availW=720 availH=520 -> z=min(0.72,1.04)=0.72; content fits width-bound
  let fit = win.computeFitZoomScroll({ x1: 0, y1: 0, x2: 1000, y2: 500 }, 800, 600, 40);
  assert(fit.zoom === 0.72, `width-bound layout fits to zoom 0.72 (got ${fit.zoom})`);
  assert(fit.scrollLeft === 0 && fit.scrollTop === 0, "a bbox starting at the origin that exactly fits centers with zero scroll offset");
  // a bbox NOT starting at the origin -- scroll should track its offset
  fit = win.computeFitZoomScroll({ x1: 200, y1: 100, x2: 1200, y2: 600 }, 800, 600, 40);
  assert(fit.zoom === 0.72, "zoom is unaffected by the bbox's absolute position, only its size");
  assert(Math.abs(fit.scrollLeft - (200 * 0.72 - 40)) < 1e-6, "scrollLeft accounts for the bbox's x1 offset at the computed zoom");
  // zoom is clamped to the [0.4, 2] range
  fit = win.computeFitZoomScroll({ x1: 0, y1: 0, x2: 10, y2: 10 }, 800, 600, 40);
  assert(fit.zoom === 2, "an extremely small bbox clamps zoom to the 2.0 (200%) ceiling, not an absurd magnification");
  fit = win.computeFitZoomScroll({ x1: 0, y1: 0, x2: 100000, y2: 100000 }, 800, 600, 40);
  assert(fit.zoom === 0.4, "an extremely large bbox clamps zoom to the 0.4 (40%) floor");
  // degenerate/empty inputs are a safe no-op (null), matching "no-op on empty canvas"
  assert(win.computeFitZoomScroll({ x1: 0, y1: 0, x2: 0, y2: 0 }, 800, 600, 40) === null, "a zero-area bbox returns null (no-op)");
  assert(win.computeFitZoomScroll({ x1: 0, y1: 0, x2: 100, y2: 100 }, 0, 0, 40) === null, "a zero-size viewport returns null (no-op)");

  // zoom-to-fit wiring: stub a known 2-node layout and confirm zoomToFit() drives S.ui.zoomRoute + scroll via the pure math above
  S.ui.zoomRoute = 1;
  win.eval("render()");
  const canvasEl5 = doc.querySelector("#routeCanvas");
  const n1 = doc.querySelector('.node[data-dev="d1"]');
  const n2 = doc.querySelector('.node[data-dev="d2"]');
  canvasEl5.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 });
  canvasEl5.scrollLeft = 0; canvasEl5.scrollTop = 0;
  n1.getBoundingClientRect = () => ({ left: 20, top: 20, right: 70, bottom: 70, width: 50, height: 50 });
  n2.getBoundingClientRect = () => ({ left: 1020, top: 520, right: 1070, bottom: 570, width: 50, height: 50 });
  // content bbox (unscaled, zoom=1, scroll=0): x1=20,y1=20,x2=1070,y2=570 -> w=1050,h=550; availW=720,availH=520 -> z=min(0.686,0.945)~0.69 (rounded to 2dp)
  win.eval("zoomToFit()");
  assert(Math.abs(S.ui.zoomRoute - 0.69) < 0.02, `zoomToFit() computed a plausible fit zoom from the stubbed layout (got ${S.ui.zoomRoute})`);

  // zoom-to-fit is a no-op on an empty canvas
  S.racks = [mkRack("rEmpty", "Empty Rack", [])];
  S.ui.zoomRoute = 1;
  win.eval("render()");
  const zoomBeforeEmpty = S.ui.zoomRoute;
  win.eval("zoomToFit()");
  assert(S.ui.zoomRoute === zoomBeforeEmpty, "zoomToFit() is a no-op when the canvas has nothing visible on it");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
