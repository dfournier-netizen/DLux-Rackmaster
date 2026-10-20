// v6.9 Part 1 -- Align/Distribute contextual toolbar cluster (Routing/Rig canvas).
// Pure geometry (bboxOfItems/computeAlignPositions/computeDistributePositions) is tested first against
// hand-computed fixtures (no DOM at all), then the DOM-wiring layer (alignQualifyingKeys/getAlignItems/
// doAlign/doDistribute) is tested against a small rack+edge scenario, per handoff §7's pure-math-first
// convention (same split as rectsIntersect/computeMarqueeHits and computeFitZoomScroll, both v6.8).
const fs = require("fs");
const { JSDOM } = require("jsdom");
const path = require("path");
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, "build.html"), "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }
function close(a, b, eps) { return Math.abs(a - b) < (eps == null ? 1e-6 : eps); }

const mkDev = (id, name, rx, ry, ports) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
  depth: null, inOff: null, pos: 1, color: "#336699", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
  notes: "", rx, ry, hideInRouting: false, pushProtect: false, draw: null, circuit: null, ports: ports || [] });
const mkRack = (id, name, devices, extra) => Object.assign({ id, name, sizeU: 20, depth: 20, color: "#aa5522", notes: "", circuits: [], devices }, extra || {});

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
  // 1. Pure math -- bboxOfItems + computeAlignPositions, hand-computed fixture
  // ============================================================
  // item1: x0,y0,w100,h50 | item2: x200,y80,w60,h40 | item3: x50,y150,w150,h30
  // bbox: x1=0,y1=0,x2=260,y2=180
  const F1 = [
    { key: "a", x: 0, y: 0, w: 100, h: 50 },
    { key: "b", x: 200, y: 80, w: 60, h: 40 },
    { key: "c", x: 50, y: 150, w: 150, h: 30 }
  ];
  const bb1 = win.bboxOfItems(F1);
  assert(bb1.x1 === 0 && bb1.y1 === 0 && bb1.x2 === 260 && bb1.y2 === 180, `bboxOfItems computes the tight bounding box of all 3 items (got ${JSON.stringify(bb1)})`);

  let pos = win.computeAlignPositions("left", F1);
  assert(pos.a === 0 && pos.b === 0 && pos.c === 0, "Align Left: every item's x becomes the bbox's left edge (0)");

  pos = win.computeAlignPositions("right", F1);
  assert(pos.a === 160 && pos.b === 200 && pos.c === 110, `Align Right: x = bbox.x2 - w per item (got a=${pos.a},b=${pos.b},c=${pos.c})`);

  pos = win.computeAlignPositions("hcenter", F1);
  assert(pos.a === 80 && pos.b === 100 && pos.c === 55, `Align Center (horizontal): x = bboxCenterX - w/2 (got a=${pos.a},b=${pos.b},c=${pos.c})`);

  pos = win.computeAlignPositions("top", F1);
  assert(pos.a === 0 && pos.b === 0 && pos.c === 0, "Align Top: every item's y becomes the bbox's top edge (0)");

  pos = win.computeAlignPositions("bottom", F1);
  assert(pos.a === 130 && pos.b === 140 && pos.c === 150, `Align Bottom: y = bbox.y2 - h per item (got a=${pos.a},b=${pos.b},c=${pos.c})`);

  pos = win.computeAlignPositions("vmiddle", F1);
  assert(pos.a === 65 && pos.b === 70 && pos.c === 75, `Align Middle (vertical): y = bboxCenterY - h/2 (got a=${pos.a},b=${pos.b},c=${pos.c})`);

  // ============================================================
  // 2. Pure math -- computeDistributePositions, gap-based, unequal widths
  // ============================================================
  // A: x0,w100 (center50) | B: x250,w80 (center290) | C: x500,w50 (center525)
  // span=(500+50)-0=550, sumSize=230, gapTotal=320, gap=160
  // expected: A.x=0 (fixed), B.x = 0+100+160 = 260, C.x=500 (fixed)
  const F2 = [
    { key: "A", x: 0, y: 0, w: 100, h: 20 },
    { key: "B", x: 250, y: 0, w: 80, h: 20 },
    { key: "C", x: 500, y: 0, w: 50, h: 20 }
  ];
  let dpos = win.computeDistributePositions("h", F2);
  assert(dpos.A === 0, "Distribute Horizontally: first item (by sorted center) stays fixed at its own x");
  assert(dpos.C === 500, "Distribute Horizontally: last item stays fixed at its own x");
  assert(close(dpos.B, 260), `Distribute Horizontally: middle item's gap-based x is exactly 260 (got ${dpos.B})`);
  // verify equal gaps between bounding boxes: A-right=100, B-left=260 -> gap=160; B-right=340, C-left=500 -> gap=160
  assert(close(dpos.B - (F2[0].x + F2[0].w), 160) && close(F2[2].x - (dpos.B + F2[1].w), 160),
    "Distribute Horizontally: the gap between A/B and between B/C's bounding boxes are exactly equal (gap-based, not center-based)");

  // vertical mirror of the same fixture
  const F2v = [
    { key: "A", x: 0, y: 0, w: 20, h: 100 },
    { key: "B", x: 0, y: 250, w: 20, h: 80 },
    { key: "C", x: 0, y: 500, w: 20, h: 50 }
  ];
  dpos = win.computeDistributePositions("v", F2v);
  assert(dpos.A === 0 && dpos.C === 500 && close(dpos.B, 260), `Distribute Vertically mirrors the same gap-based math on y (got A=${dpos.A},B=${dpos.B},C=${dpos.C})`);

  // ============================================================
  // 3. Pure math -- fallback to equal center-spacing when items overflow the span
  // ============================================================
  // A: x0,w100 (center50) | B: x50,w400 (center250) | C: x400,w50 (center425)
  // span=(400+50)-0=450, sumSize=100+400+50=550, gapTotal=450-550=-100 (negative -> fallback)
  // firstC=50, lastC=425, step=(425-50)/2=187.5, B expected center = 50+187.5=237.5 -> x = 237.5-400/2=37.5
  const F3 = [
    { key: "A", x: 0, y: 0, w: 100, h: 20 },
    { key: "B", x: 50, y: 0, w: 400, h: 20 },
    { key: "C", x: 400, y: 0, w: 50, h: 20 }
  ];
  dpos = win.computeDistributePositions("h", F3);
  assert(dpos.A === 0 && dpos.C === 400, "Fallback distribute: first/last still stay fixed at their own x");
  assert(close(dpos.B, 37.5), `Fallback distribute: overflowing items fall back to equal CENTER spacing (expected B.x=37.5, got ${dpos.B})`);

  // ============================================================
  // 4. Pure math -- distribute requires >=3 items
  // ============================================================
  assert(JSON.stringify(win.computeDistributePositions("h", F1.slice(0, 2))) === "{}", "computeDistributePositions returns {} (no-op) for fewer than 3 items");
  assert(JSON.stringify(win.computeDistributePositions("h", [])) === "{}", "computeDistributePositions returns {} for an empty selection (no crash)");

  // ============================================================
  // 5. DOM wiring -- build a scenario, verify getAlignItems()/doAlign()/doDistribute() against S
  // ============================================================
  S.racks = [mkRack("r1", "Rack One", [
    mkDev("d1", "Dev A", 0, 0),
    mkDev("d2", "Dev B", 400, 100),
    mkDev("d3", "Dev C", 200, 250)
  ])];
  S.edges = [];
  S.ui.view = "routing";
  S.ui.routingRackOnly = "r1";
  win.eval("resetUndoHistory()");
  win.eval("render()");
  win.eval("commit()"); // seed a baseline snapshot so the next commit() has something to diff against

  // no ports -> nodeEstH() fallback height is 36 + 1*25 + 8 = 69 (v6.10 clarity-pass row metrics); fallback width (no DOM rect) is 190
  win.eval("MSEL.devs = ['d1','d2','d3']");
  let items = win.eval("getAlignItems()");
  assert(items.length === 3, "getAlignItems() resolves all 3 selected devices");
  assert(items.every(it => it.w === 190 && it.h === 69), `fallback size (no DOM rect available) is w=190,h=nodeEstH()=69 for a portless device (got ${JSON.stringify(items.map(it => [it.w, it.h]))})`);

  const undoBefore = win.eval("UNDO_STACK.length");
  win.eval("doAlign('left')");
  assert(S.racks[0].devices[0].rx === 0 && S.racks[0].devices[1].rx === 0 && S.racks[0].devices[2].rx === 0, "doAlign('left') sets every selected device's rx to the selection bbox's left edge");
  const undoAfter = win.eval("UNDO_STACK.length");
  assert(undoAfter === undoBefore + 1, `doAlign() pushes exactly ONE undo entry (single commit(), single undo step) -- before=${undoBefore}, after=${undoAfter}`);

  // reset positions, test align top/right/bottom/hcenter/vmiddle via the DOM path too
  S.racks[0].devices[0].rx = 0; S.racks[0].devices[0].ry = 0;
  S.racks[0].devices[1].rx = 400; S.racks[0].devices[1].ry = 100;
  S.racks[0].devices[2].rx = 200; S.racks[0].devices[2].ry = 250;
  win.eval("render()"); win.eval("commit()");
  win.eval("MSEL.devs = ['d1','d2','d3']");
  win.eval("doAlign('top')");
  assert(S.racks[0].devices.every(d => d.ry === 0), "doAlign('top') sets every selected device's ry to the bbox top (0)");

  // ============================================================
  // 6. Distribute via the DOM path -- gap-based with real (fallback) sizes
  // ============================================================
  S.racks[0].devices[0].rx = 0;
  S.racks[0].devices[1].rx = 300;
  S.racks[0].devices[2].rx = 700; // all w=190 (fallback) -- equal-size gap distribute is simple to hand-verify
  win.eval("render()"); win.eval("commit()");
  win.eval("MSEL.devs = ['d1','d2','d3']");
  const undoBefore2 = win.eval("UNDO_STACK.length");
  win.eval("doDistribute('h')");
  // span=(700+190)-0=890, sumSize=570, gapTotal=320, gap=160, middle.x = 0+190+160=350
  assert(S.racks[0].devices[0].rx === 0 && S.racks[0].devices[2].rx === 700, "doDistribute('h') keeps first/last device rx fixed");
  assert(S.racks[0].devices[1].rx === 350, `doDistribute('h') places the middle device at the gap-based x (expected 350, got ${S.racks[0].devices[1].rx})`);
  assert(win.eval("UNDO_STACK.length") === undoBefore2 + 1, "doDistribute() also pushes exactly ONE undo entry");

  // ============================================================
  // 7. Distribute requires >=3 qualifying items -- DOM path no-op with only 2 selected
  // ============================================================
  win.eval("MSEL.devs = ['d1','d2']");
  const rxSnapshot = S.racks[0].devices.map(d => d.rx);
  const undoBefore3 = win.eval("UNDO_STACK.length");
  win.eval("doDistribute('h')");
  assert(JSON.stringify(S.racks[0].devices.map(d => d.rx)) === JSON.stringify(rxSnapshot), "doDistribute() is a no-op with only 2 qualifying items selected (positions unchanged)");
  assert(win.eval("UNDO_STACK.length") === undoBefore3, "doDistribute() no-op does not push an undo entry");

  // ============================================================
  // 8. No-op safety on empty selection
  // ============================================================
  win.eval("MSEL.devs = []");
  const snap = JSON.stringify(S.racks[0].devices.map(d => [d.rx, d.ry]));
  const undoBefore4 = win.eval("UNDO_STACK.length");
  win.eval("doAlign('left')"); win.eval("doDistribute('h')"); win.eval("doDistribute('v')");
  assert(JSON.stringify(S.racks[0].devices.map(d => [d.rx, d.ry])) === snap, "doAlign/doDistribute with an empty MSEL.devs selection mutate nothing");
  assert(win.eval("UNDO_STACK.length") === undoBefore4, "no-op empty-selection calls push no undo entries");

  // ============================================================
  // 9. Rack-container inclusion (Rig view) -- collapsed racks qualify, expanded racks do not
  // ============================================================
  S.racks = [
    mkRack("rA", "Rack A", [mkDev("da1", "A1", 0, 0)]),
    mkRack("rB", "Rack B", [mkDev("db1", "B1", 0, 0)])
  ];
  S.edges = [mkDev("eX", "Edge X", 900, 900)];
  S.ui.view = "rig";
  S.ui.rigCollapsed = { rA: true }; // rA collapsed (qualifies), rB expanded (does not)
  S.racks[0].grx = 10; S.racks[0].gry = 20;
  win.eval("resetUndoHistory()");
  win.eval("render()"); win.eval("commit()");

  win.eval("MSEL.devs = ['rack:rA', 'rack:rB', 'eX']");
  const qk = win.eval("alignQualifyingKeys()");
  assert(JSON.stringify(qk.slice().sort()) === JSON.stringify(["eX", "rack:rA"].sort()), `alignQualifyingKeys() includes the collapsed rack ("rack:rA") and the edge device, but excludes the expanded rack ("rack:rB") which has no position of its own (got ${JSON.stringify(qk)})`);

  items = win.eval("getAlignItems()");
  const rAItem = items.find(it => it.key === "rack:rA");
  assert(!!rAItem && rAItem.x === 10 && rAItem.y === 20, `getAlignItems() reads a collapsed rack's grx/gry as its position (got ${JSON.stringify(rAItem)})`);

  // moving a collapsed rack container via doAlign actually mutates rack.grx/gry
  win.eval("MSEL.devs = ['rack:rA', 'eX']");
  win.eval("doAlign('left')");
  assert(S.racks[0].grx === Math.min(10, 900), "doAlign('left') on a mixed rack-container + device selection moves the rack container by its own grx/gry");

  // ============================================================
  // 10. Toolbar UI -- cluster hidden below 2 qualifying items, distribute disabled below 3
  // ============================================================
  S.racks = [mkRack("r1", "Rack One", [
    mkDev("d1", "Dev A", 0, 0), mkDev("d2", "Dev B", 400, 100), mkDev("d3", "Dev C", 200, 250)
  ])];
  S.edges = [];
  S.ui.view = "routing";
  S.ui.routingRackOnly = "r1";
  win.eval("MSEL.devs = []");
  win.eval("render()");
  assert(!doc.querySelector("#alignCluster"), "align cluster is entirely absent from the toolbar with 0 selected items");

  win.eval("MSEL.devs = ['d1']");
  win.eval("render()");
  assert(!doc.querySelector("#alignCluster"), "align cluster is absent with only 1 selected item (align needs >=2)");

  win.eval("MSEL.devs = ['d1','d2']");
  win.eval("render()");
  let cluster = doc.querySelector("#alignCluster");
  assert(!!cluster, "align cluster appears once 2 items are selected");
  assert(!!doc.querySelector("#btnAlignLeft") && !!doc.querySelector("#btnAlignHCenter") && !!doc.querySelector("#btnAlignRight")
    && !!doc.querySelector("#btnAlignTop") && !!doc.querySelector("#btnAlignVMiddle") && !!doc.querySelector("#btnAlignBottom"), "all 6 align buttons are present");
  assert(!!doc.querySelector("#btnDistributeH") && !!doc.querySelector("#btnDistributeV"), "both distribute buttons are present");
  assert(doc.querySelector("#btnDistributeH").disabled === true && doc.querySelector("#btnDistributeV").disabled === true, "distribute buttons are disabled with only 2 items selected (needs >=3)");
  assert(doc.querySelector("#btnAlignLeft").disabled !== true, "align buttons stay enabled with 2 items selected");

  win.eval("MSEL.devs = ['d1','d2','d3']");
  win.eval("render()");
  assert(doc.querySelector("#btnDistributeH").disabled === false && doc.querySelector("#btnDistributeV").disabled === false, "distribute buttons enable once 3+ items are selected");

  // tooltips document the action names (spec: "Tooltips with names")
  assert(/align left/i.test(doc.querySelector("#btnAlignLeft").title), "Align Left button has a descriptive tooltip");
  assert(/align center/i.test(doc.querySelector("#btnAlignHCenter").title), "Align Center button has a descriptive tooltip");
  assert(/distribute horizontally/i.test(doc.querySelector("#btnDistributeH").title), "Distribute Horizontally button has a descriptive tooltip");

  // ============================================================
  // 11. Clicking the toolbar buttons actually invokes the actions (end-to-end DOM click)
  // ============================================================
  S.racks[0].devices[0].rx = 0; S.racks[0].devices[1].rx = 500; S.racks[0].devices[2].rx = 250;
  win.eval("render()");
  win.eval("MSEL.devs = ['d1','d2','d3']");
  win.eval("render()");
  doc.querySelector("#btnAlignLeft").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.racks[0].devices[0].rx === 0 && S.racks[0].devices[1].rx === 0 && S.racks[0].devices[2].rx === 0, "clicking #btnAlignLeft in the real DOM performs doAlign('left')");

  // ============================================================
  // 12. getAlignItems() prefers a live DOM rect (converted out of the zoom transform) when available
  // ============================================================
  S.ui.zoomRoute = 2;
  win.eval("render()");
  win.eval("MSEL.devs = ['d1']");
  const nodeEl = doc.querySelector('.node[data-dev="d1"]');
  nodeEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 });
  items = win.eval("getAlignItems()");
  assert(items.length === 1 && items[0].w === 200 && items[0].h === 100, `getAlignItems() converts a stubbed 400x200 DOM rect at zoom=2 down to content-space 200x100 (got ${JSON.stringify(items[0])})`);
  S.ui.zoomRoute = 1;
  win.eval("render()");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
