// v6.11.8 / v6.12.1 -- Y-lane horizontal-run separation for BiDi (down/up-exit) cables.
//
// The orthogonal router already separates parallel cables' VERTICAL corridors via the x-lane pass
// (assignWireLanes, WIRE_LANE_GAP=28). What it could NOT separate: two BiDi cables whose ports both
// exit "down" (portExitDir(dir==="bi")==="down") and share a device edge -- their horizontal legs
// sit at the same y (portY + STUB) and draw right on top of each other. The new Y-lane pass
// (wireStubBandKey / buildWireStubEnds / assignWireStubLanes, run by drawWires() after the x-lane
// pass) staggers the *stub length* of each down/up-exit end so those co-y legs fan WIRE_LANE_GAP
// apart. It is GROW-ONLY (laneIndex 0 -> exactly STUB, so a solo end is byte-identical to the
// pre-feature build), per-END (source and dest independent), order-independent (keyed off geometry +
// connection id, never array/iteration order), and touches ONLY the normal single-corridor branch
// (direct same-y runs and inverted-range Z-routes keep base stubs).
//
// This file boots the BUILD UNDER TEST (process.argv[2], defaulting to the newest "DLux Rackmaster
// *.html" in the parent dir -- suite convention) AND the pre-feature reference base.html (../base.html)
// so byte-identity can be diffed directly. Fix-specific assertions (the leg separation, the unit
// helpers) run against the build under test and are expected to FAIL when it is pointed at base.html;
// the byte-identity / determinism / base-coincidence assertions stay green on both.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function newestBuild() { // suite convention: default to the newest "DLux Rackmaster *.html" in the parent dir
  const dir = path.join(__dirname, "..");
  const hits = fs.readdirSync(dir).filter(f => /^DLux[ _]Rackmaster[ _].*\.html$/.test(f))
    .map(f => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
  return hits.length ? path.join(dir, hits[0].f) : path.join(dir, "work.html");
}
const BUILD = process.argv[2] || newestBuild();                 // build under test (has the feature)
const BASE = path.join(__dirname, "..", "base.html");           // pre-feature reference for byte-identity diffs
const buildHtml = fs.readFileSync(BUILD, "utf-8");
const baseHtml = fs.readFileSync(BASE, "utf-8");
const project = JSON.parse(fs.readFileSync(path.join(__dirname, "LX Network racks.dlux.json"), "utf-8"));

const STUB = 42;            // px -- base port-exit stub length (v6.12.1 lifted to module scope in the feature build)
const WIRE_LANE_GAP = 28;   // px -- spacing between adjacent lanes

let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

// ---- SVG path "d" helpers (same M/L/Q grammar the rest of the suite parses) ----
function parsePath(d) {
  const tokens = d.match(/[MLCQ][^MLCQ]*/g) || [];
  return tokens.map(t => {
    const cmd = t[0];
    const nums = t.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const pts = [];
    for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    return { cmd, pts };
  });
}
// reconstruct the original polyline waypoints (the Q's first pair is the true corner, not its arc exit)
function waypointsOf(d) {
  const cmds = parsePath(d); const wp = [];
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (c.cmd === "M") wp.push(c.pts[0]);
    else if (c.cmd === "Q") wp.push(c.pts[0]);
    else if (c.cmd === "L" && i === cmds.length - 1) wp.push(c.pts[c.pts.length - 1]);
  }
  return wp;
}
function isAxisAligned(wp) {
  for (let i = 0; i + 1 < wp.length; i++) {
    const dx = Math.abs(wp[i][0] - wp[i + 1][0]), dy = Math.abs(wp[i][1] - wp[i + 1][1]);
    if (dx > 0.05 && dy > 0.05) return false;
  }
  return true;
}
function findReversals(wp) {
  let n = 0;
  for (let i = 0; i + 2 < wp.length; i++) {
    const dx1 = wp[i + 1][0] - wp[i][0], dy1 = wp[i + 1][1] - wp[i][1];
    const dx2 = wp[i + 2][0] - wp[i + 1][0], dy2 = wp[i + 2][1] - wp[i + 1][1];
    const l1 = Math.hypot(dx1, dy1), l2 = Math.hypot(dx2, dy2);
    if (l1 < 0.05 || l2 < 0.05) continue;
    if ((dx1 / l1) * (dx2 / l2) + (dy1 / l1) * (dy2 / l2) < -0.95) n++;
  }
  return n;
}
// horizontal "legs" (a segment whose two ends share y and differ a lot in x), in path order
function horizLegs(d) {
  const wp = waypointsOf(d); const out = [];
  for (let i = 0; i + 1 < wp.length; i++) {
    const [x1, y1] = wp[i], [x2, y2] = wp[i + 1];
    if (Math.abs(y1 - y2) < 0.05 && Math.abs(x1 - x2) > 20) out.push({ y: y1, len: Math.abs(x1 - x2) });
  }
  return out;
}
// the mid-run vertical corridor x: the longest purely-vertical segment
function corridorXOf(d) {
  const wp = waypointsOf(d); let best = null, bestLen = -1;
  for (let i = 0; i + 1 < wp.length; i++) {
    const [x1, y1] = wp[i], [x2, y2] = wp[i + 1];
    if (Math.abs(x1 - x2) < 0.05 && Math.abs(y1 - y2) > bestLen) { bestLen = Math.abs(y1 - y2); best = x1; }
  }
  return best;
}
// the first purely-vertical segment's length (the source port-exit stub)
function firstStubLen(d) {
  const wp = waypointsOf(d);
  for (let i = 0; i + 1 < wp.length; i++) {
    const [x1, y1] = wp[i], [x2, y2] = wp[i + 1];
    if (Math.abs(x1 - x2) < 0.05 && Math.abs(y1 - y2) > 0.05) return Math.abs(y1 - y2);
  }
  return null;
}
function noNaN(d) { return !/NaN|undefined/.test(d) && (d.match(/-?\d+(\.\d+)?/g) || []).every(n => Number.isFinite(parseFloat(n))); }
const spacedBy = (vals, gap) => { const s = [...vals].sort((a, b) => a - b); return s.slice(1).every((v, i) => Math.abs(v - s[i] - gap) < 0.5); };
const coincident = vals => (Math.max(...vals) - Math.min(...vals)) < 0.5;

// ---- boot / geometry-mock helpers (cribbed from test_orthogonal_wires.js + validate_real_project.js) ----
async function boot(html) {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await new Promise(r => setTimeout(r, 150));
  return { win, doc };
}
// jsdom has no layout engine -- mock each device node + pin rect from the device's own rx/ry, exactly
// like validate_real_project.js does (bi ports on the bottom edge, in on the left, out on the right).
function mockRoutingGeom(doc, devById, W = 190) {
  const estH = d => Math.max(60, 30 + (d.ports || []).length * 24);
  const inner = doc.querySelector("#routeInner");
  if (!inner) return;
  inner.getBoundingClientRect = () => ({ top: 0, left: 0, right: 8000, bottom: 8000, width: 8000, height: 8000 });
  const wsvg = doc.querySelector("#wires");
  if (wsvg) wsvg.getBoundingClientRect = () => ({ top: 0, left: 0 });
  doc.querySelectorAll(".node").forEach(n => {
    const dv = devById[n.dataset.dev]; if (!dv) return;
    const h = estH(dv);
    n.getBoundingClientRect = () => ({ top: dv.ry, left: dv.rx, right: dv.rx + W, bottom: dv.ry + h, width: W, height: h });
  });
  doc.querySelectorAll(".pin").forEach(p => {
    const dv = devById[p.dataset.dev]; if (!dv) return;
    const h = estH(dv);
    const gi = Math.max(0, (dv.ports || []).findIndex(g => g.id === p.dataset.g));
    const dir = p.dataset.dir;
    const i = +p.dataset.i || 0;
    let x, y;
    if (dir === "bi") { x = dv.rx + 20 + ((gi * 7 + i * 3) % Math.max(1, W - 40)); y = dv.ry + h; }
    else { x = dir === "out" ? dv.rx + W : dv.rx; y = dv.ry + Math.min(h - 6, 24 + gi * 20 + i * 3); }
    p.getBoundingClientRect = () => ({ top: y - 1, left: x - 1, right: x + 1, bottom: y + 1, width: 2, height: 2 });
  });
}
const mkDev = (id, name, ports, rx, ry) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
  depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
  notes: "", rx, ry, hideInRouting: null, pushProtect: false, draw: null, circuit: null, ports });

// hydrate the real project into a window (same path an Import takes), rig view / all racks expanded so
// every one of the 31 connections is on screen, then mock geometry + drawWires().
function hydrateReal(win, doc) {
  win.__proj = JSON.parse(JSON.stringify(project));
  win.eval("S = __proj; migrate(); ensureRoutingLayout();");
  const S = win.eval("S");
  win.eval(`S.ui.view = "rig"; S.ui.rigHideInternal = false; S.ui.rigCollapsed = {}; S.ui.routeFilter = { rack: "", cat: "", u: "" }; S.ui.connType = ""; S.ui.selConn = null; render();`);
  const devById = {};
  for (const r of S.racks) for (const d of r.devices) devById[d.id] = d;
  mockRoutingGeom(doc, devById);
  win.eval("drawWires();");
  return S;
}
// seed an arbitrary S, render(), mock geometry, drawWires(), return id->d for every wire path
function renderPaths(win, doc, devById) {
  win.eval("render()");
  mockRoutingGeom(doc, devById);
  win.eval("drawWires()");
  return [...doc.querySelectorAll("path.wire")].map(p => ({ id: p.dataset.id, d: p.getAttribute("d") }));
}

// ---- seed builders (return devById; caller sets them on both windows identically) ----
function seedNoBidi(win) { // three in/out cables sharing a corridor -- NO down/up ends, so the y-pass is a no-op
  const S = win.eval("S");
  const src = mkDev("s1", "Console", [{ id: "g1", name: "OUT", type: "XLR3", dir: "out", count: 3, face: "front", jacks: [] }], 100, 100);
  const dsts = [0, 1, 2].map(i => mkDev("d" + i, "Amp" + i, [{ id: "g1", name: "IN", type: "XLR3", dir: "in", count: 1, face: "front", jacks: [] }], 500, 80 + i * 120));
  S.racks = [{ id: "r1", name: "R", sizeU: 44, depth: 20, color: "#123", notes: "", circuits: [], devices: [src, ...dsts] }];
  S.edges = [];
  S.connections = [0, 1, 2].map(i => ({ id: "c" + i, a: { dev: "s1", g: "g1", i }, b: { dev: "d" + i, g: "g1", i: 0 }, label: "", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" }));
  S.ui.view = "routing"; S.ui.routingRackOnly = "r1"; S.ui.wireStyle = "orthogonal";
  const devById = { s1: src }; dsts.forEach(d => devById[d.id] = d); return devById;
}
function seedLoneBidi(win) { // a single BiDi (down-exit both ends) cable -- laneIndex 0 -> exactly STUB -> byte-identical to base
  const S = win.eval("S");
  const src = mkDev("s1", "Hub", [{ id: "g1", name: "NET", type: "RJ45", dir: "bi", count: 1, face: "rear", jacks: [] }], 100, 500);
  const dst = mkDev("d0", "Switch", [{ id: "g1", name: "NET", type: "RJ45", dir: "bi", count: 1, face: "rear", jacks: [] }], 500, 100);
  S.racks = [{ id: "r1", name: "R", sizeU: 44, depth: 20, color: "#123", notes: "", circuits: [], devices: [src, dst] }];
  S.edges = [];
  S.connections = [{ id: "c0", a: { dev: "s1", g: "g1", i: 0 }, b: { dev: "d0", g: "g1", i: 0 }, label: "", color: "#3d6bfa", type: "RJ45", len: 24, notes: "", adapter: "" }];
  S.ui.view = "routing"; S.ui.routingRackOnly = "r1"; S.ui.wireStyle = "orthogonal";
  return { s1: src, d0: dst };
}
function seedLeftRight(win) { // a cable strictly between a left-facing (in) and right-facing (out) port -- ends never participate in the y-pass
  const S = win.eval("S");
  const src = mkDev("s1", "Console", [{ id: "g1", name: "OUT", type: "XLR3", dir: "out", count: 1, face: "front", jacks: [] }], 100, 100);
  const dst = mkDev("d0", "Amp", [{ id: "g1", name: "IN", type: "XLR3", dir: "in", count: 1, face: "front", jacks: [] }], 600, 260);
  S.racks = [{ id: "r1", name: "R", sizeU: 44, depth: 20, color: "#123", notes: "", circuits: [], devices: [src, dst] }];
  S.edges = [];
  S.connections = [{ id: "lr0", a: { dev: "s1", g: "g1", i: 0 }, b: { dev: "d0", g: "g1", i: 0 }, label: "", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" }];
  S.ui.view = "routing"; S.ui.routingRackOnly = "r1"; S.ui.wireStyle = "orthogonal";
  return { s1: src, d0: dst };
}

(async () => {
  const { win, doc } = await boot(buildHtml);       // build under test (feature)
  const B = await boot(baseHtml);                    // pre-feature reference
  const bwin = B.win, bdoc = B.doc;
  const hasStubFns = win.eval("typeof buildWireStubEnds === 'function' && typeof assignWireStubLanes === 'function' && typeof wireStubBandKey === 'function'");

  // =====================================================================================
  // 1. BYTE-IDENTITY for solo / unbunched cables (most important -- the feature must be a
  //    pure no-op wherever no down/up-exit legs actually collide).
  // =====================================================================================
  {
    const wk = renderPaths(win, doc, seedNoBidi(win));
    const bs = renderPaths(bwin, bdoc, seedNoBidi(bwin));
    assert(wk.length === 3 && bs.length === 3, "no-BiDi corridor: both builds render all 3 wire paths");
    assert(wk.length === bs.length && wk.every((p, i) => p.id === bs[i].id && p.d === bs[i].d),
      "no-BiDi corridor (in/out ports only): every path d is byte-identical to base (y-pass is a no-op with no down/up legs)");
  }
  {
    const wk = renderPaths(win, doc, seedLoneBidi(win));
    const bs = renderPaths(bwin, bdoc, seedLoneBidi(bwin));
    assert(wk.length === 1 && bs.length === 1, "lone BiDi cable: rendered on both builds");
    assert(wk[0].d === bs[0].d, "a single lone BiDi cable is byte-identical to base (laneIndex 0 => base STUB, no stagger)");
    assert(Math.abs(firstStubLen(wk[0].d) - STUB) < 0.01, "lone BiDi cable's source stub is exactly STUB (42px) -- confirms it really is the down-exit single-corridor branch, so the byte-identity above is not vacuous");
  }

  // =====================================================================================
  // 2/3/7. THE FIX, on the real project: the teal (#3fa46c) "Unifi Flex" -> "Custom Patch
  //    Panel" cables (all BiDi/down-exit both ends) now fan their co-y horizontal legs apart,
  //    on BOTH source and dest side, ~WIRE_LANE_GAP; base leaves them coincident. Corridors
  //    stay ~28 apart (x-pass unaffected). Paths stay clean axis-aligned M/L/Q.
  // =====================================================================================
  const tealIds = ["k212tlghb1", "k26fpdejd4", "k2c954xxh2"]; // the three Unifi Flex -> Custom Patch Panel teal BiDi cables
  {
    hydrateReal(win, doc);                 // build under test
    hydrateReal(bwin, bdoc);               // pre-feature reference
    const dOf = (dc, id) => { const el = dc.querySelector(`path.wire[data-id="${id}"]`); return el ? el.getAttribute("d") : null; };
    const wkD = tealIds.map(id => dOf(doc, id));
    const bsD = tealIds.map(id => dOf(bdoc, id));
    assert(wkD.every(d => d) && bsD.every(d => d), "real project: all three teal Unifi Flex -> Custom Patch Panel cables rendered on both builds");

    // per cable: legs[0] = source-side horizontal leg, legs[last] = dest-side horizontal leg
    const wkSrc = wkD.map(d => horizLegs(d)[0].y);
    const wkDst = wkD.map(d => { const l = horizLegs(d); return l[l.length - 1].y; });
    const bsSrc = bsD.map(d => horizLegs(d)[0].y);
    const bsDst = bsD.map(d => { const l = horizLegs(d); return l[l.length - 1].y; });

    // --- the fix (build under test) ---
    assert(new Set(wkSrc.map(y => y.toFixed(2))).size === 3, `fix: the three source-side horizontal legs are DISTINCT (${wkSrc.map(y => y.toFixed(1)).join(", ")})`);
    assert(spacedBy(wkSrc, WIRE_LANE_GAP), `fix: the three source-side legs are spaced ~${WIRE_LANE_GAP}px apart (${[...wkSrc].sort((a, b) => a - b).map(y => y.toFixed(1)).join(", ")})`);
    assert(new Set(wkDst.map(y => y.toFixed(2))).size === 3, `fix: the three dest-side horizontal legs are DISTINCT (${wkDst.map(y => y.toFixed(1)).join(", ")})`);
    assert(spacedBy(wkDst, WIRE_LANE_GAP), `fix: the three dest-side legs are spaced ~${WIRE_LANE_GAP}px apart (${[...wkDst].sort((a, b) => a - b).map(y => y.toFixed(1)).join(", ")})`);

    // --- the contrast (pre-feature base): coincident on both sides ---
    assert(coincident(bsSrc), `base contrast: the three source-side legs are COINCIDENT in base (all y=${bsSrc[0].toFixed(1)})`);
    assert(coincident(bsDst), `base contrast: the three dest-side legs are COINCIDENT in base (all y=${bsDst[0].toFixed(1)})`);

    // --- corridors still separated (x-lane pass still works alongside the y-pass) ---
    const wkCx = wkD.map(corridorXOf);
    const bsCx = bsD.map(corridorXOf);
    assert(new Set(wkCx.map(x => x.toFixed(2))).size === 3, "corridors: the three teal cables' vertical corridor x's are distinct");
    assert(spacedBy(wkCx, WIRE_LANE_GAP), `corridors: vertical corridor x's remain ~${WIRE_LANE_GAP}px apart (${[...wkCx].sort((a, b) => a - b).map(x => x.toFixed(1)).join(", ")})`);
    assert(wkCx.map(x => x.toFixed(2)).sort().join() === bsCx.map(x => x.toFixed(2)).sort().join(), "corridors: the corridor x's are unchanged from base -- the y-pass never perturbs the x-pass");

    // --- guard integrity: the fixed paths are still valid axis-aligned M/L/Q, no NaN, no reversal ---
    for (let k = 0; k < tealIds.length; k++) {
      const wp = waypointsOf(wkD[k]);
      assert(isAxisAligned(wp) && findReversals(wp) === 0 && noNaN(wkD[k]),
        `guard: teal cable ${tealIds[k]} parses as a clean axis-aligned M/L/Q path (no diagonal, no reversal, no NaN)`);
    }
  }

  // =====================================================================================
  // 4. DETERMINISM (real-project state still loaded in the build under test)
  // =====================================================================================
  {
    const snap = () => { const m = {}; doc.querySelectorAll("path.wire").forEach(p => m[p.dataset.id] = p.getAttribute("d")); return m; };
    win.eval("drawWires();"); const a = snap();
    win.eval("drawWires();"); const b = snap();
    assert(Object.keys(a).length > 0 && Object.keys(a).every(id => a[id] === b[id]), "determinism: two back-to-back drawWires() on an unchanged topology produce byte-identical paths");
    // reorder S.connections and redraw -- per-connection-id d must not change (y-lane assignment is order-independent)
    win.eval("S.connections.reverse();");
    win.eval("drawWires();"); const c = snap();
    const idsUnchanged = Object.keys(a).every(id => c[id] === a[id]);
    assert(idsUnchanged, "determinism: reversing S.connections order leaves every per-connection-id path d unchanged (order-independent y-lane assignment)");
    win.eval("S.connections.reverse();"); // restore
  }

  // =====================================================================================
  // 5/6. Unit-level y-lane pass: buildWireStubEnds / assignWireStubLanes (grow-only, min==STUB,
  //    even spacing, order-independence, down/up-only participation). These are the FEATURE
  //    helpers -- absent from base.html, so each is gated on hasStubFns and fails (not throws)
  //    when the build under test lacks the feature.
  // =====================================================================================
  assert(hasStubFns, "feature present: buildWireStubEnds / assignWireStubLanes / wireStubBandKey are all defined");
  {
    // a controlled cluster: three down-exit source ends sharing a y-band and overlapping in x,
    // each cable's other end a left-facing (in) port -> ONLY the source end participates, so the
    // cluster is exactly these three and their laneIndexes are 0,1,2 (min == STUB).
    const items = [
      { c: { id: "z1" }, a: { x: 100, y: 100, dir: "down" }, b: { x: 600, y: 400, dir: "left" } },
      { c: { id: "z2" }, a: { x: 130, y: 100, dir: "down" }, b: { x: 600, y: 480, dir: "left" } },
      { c: { id: "z3" }, a: { x: 160, y: 100, dir: "down" }, b: { x: 600, y: 560, dir: "left" } },
    ];
    const lanesFor = arr => { // -> {id:{a?,b?}} plain object
      const m = win.assignWireStubLanes(win.buildWireStubEnds(arr, null));
      const o = {}; for (const id of ["z1", "z2", "z3"]) o[id] = m.get(id); return o;
    };
    const g = hasStubFns ? lanesFor(items) : {};
    assert(hasStubFns && g.z1 && Math.abs(g.z1.a - STUB) < 1e-9, "grow-only: the leftmost/first cluster member gets exactly STUB (laneIndex 0) -- minimum stub == base STUB");
    assert(hasStubFns && g.z2 && Math.abs(g.z2.a - (STUB + WIRE_LANE_GAP)) < 1e-9, "grow-only: the 2nd cluster member gets STUB + 1*WIRE_LANE_GAP");
    assert(hasStubFns && g.z3 && Math.abs(g.z3.a - (STUB + 2 * WIRE_LANE_GAP)) < 1e-9, "grow-only: the 3rd cluster member gets STUB + 2*WIRE_LANE_GAP");
    assert(hasStubFns && [g.z1, g.z2, g.z3].every(v => v && v.a >= STUB - 1e-9), "grow-only: every staggered stub is >= STUB (never shortened -- a shorter stub could pull a leg into the node body)");
    assert(hasStubFns && [g.z1, g.z2, g.z3].every(v => v && v.b == null), "per-end: only the down-exit source end (side 'a') is staggered; the left-facing dest end (side 'b') is untouched");
    const spac = hasStubFns ? [g.z1.a, g.z2.a, g.z3.a] : [];
    assert(hasStubFns && Math.abs((spac[1] - spac[0]) - WIRE_LANE_GAP) < 1e-9 && Math.abs((spac[2] - spac[1]) - WIRE_LANE_GAP) < 1e-9, "even spacing: adjacent stub lengths differ by exactly WIRE_LANE_GAP");

    // order-independence: shuffle the input array -> identical per-id assignment
    const shuffled = [items[2], items[0], items[1]];
    const g2 = hasStubFns ? lanesFor(shuffled) : {};
    assert(hasStubFns && ["z1", "z2", "z3"].every(id => g[id] && g2[id] && g[id].a === g2[id].a),
      "order-independent: shuffling the input array yields identical per-connection stub lengths");

    // a lone down-exit end (cluster size 1) -> laneIndex 0 -> exactly STUB (byte-identity guarantee at the unit level)
    const solo = hasStubFns ? win.assignWireStubLanes(win.buildWireStubEnds([{ c: { id: "solo" }, a: { x: 100, y: 100, dir: "down" }, b: { x: 600, y: 400, dir: "left" } }], null)) : null;
    assert(hasStubFns && solo.get("solo") && Math.abs(solo.get("solo").a - STUB) < 1e-9, "a down-exit end alone in its band gets exactly STUB (grow-only baseline)");

    // #6 left/right-only cable: neither end participates -> empty stub map
    const lrOnly = hasStubFns ? win.assignWireStubLanes(win.buildWireStubEnds([{ c: { id: "lr" }, a: { x: 100, y: 100, dir: "right" }, b: { x: 500, y: 300, dir: "left" } }], null)) : null;
    assert(hasStubFns && lrOnly.size === 0, "left/right-only cable (in->left, out->right): produces NO stub-lane entries -- its ends never participate in the y-pass");

    // two down-exit ends that share a y-band but do NOT overlap in x stay in separate size-1 clusters (both STUB)
    const disjoint = hasStubFns ? win.assignWireStubLanes(win.buildWireStubEnds([
      { c: { id: "L" }, a: { x: 100, y: 100, dir: "down" }, b: { x: 160, y: 400, dir: "left" } },
      { c: { id: "R" }, a: { x: 900, y: 100, dir: "down" }, b: { x: 960, y: 400, dir: "left" } },
    ], null)) : null;
    assert(hasStubFns && disjoint.get("L") && disjoint.get("R") && Math.abs(disjoint.get("L").a - STUB) < 1e-9 && Math.abs(disjoint.get("R").a - STUB) < 1e-9,
      "same y-band but x-disjoint down-exit legs stay in separate size-1 clusters (each keeps base STUB, no needless stagger)");
  }

  // =====================================================================================
  // 6 (end-to-end). A left/right cable rendered through the real pipeline is byte-identical to base.
  // =====================================================================================
  {
    const wk = renderPaths(win, doc, seedLeftRight(win));
    const bs = renderPaths(bwin, bdoc, seedLeftRight(bwin));
    assert(wk.length === 1 && wk[0].d === bs[0].d, "end-to-end: an in->left / out->right cable renders byte-identical to base (y-pass leaves left/right ends alone)");
  }

  // =====================================================================================
  // 8. Direct (same-y stub-to-stub) and inverted-range (Z-route) branches are UNAFFECTED --
  //    the y-pass must only touch the normal single-corridor branch. Verified two ways:
  //    (a) buildWireStubEnds skips both branches (no ends emitted), and
  //    (b) wirePathOrthogonal() output for those geometries is byte-identical to base.
  // =====================================================================================
  {
    win.eval("WIRE_OBSTACLES = []"); bwin.eval("WIRE_OBSTACLES = []");
    // two down-exit ports at the SAME y -> sa.y === sb.y -> direct horizontal run, no elbow -> skipped
    // (gated on hasStubFns so base.html, which lacks the helper, records a fail rather than throwing)
    assert(hasStubFns && win.buildWireStubEnds([{ c: { id: "dd" }, a: { x: 100, y: 200, dir: "down" }, b: { x: 500, y: 200, dir: "down" } }], null).length === 0,
      "branch guard: a direct same-y (sa.y===sb.y) down/down run emits NO stub ends -- the y-pass skips the direct branch");
    // byte-identity of the branch geometries themselves (wirePathOrthogonal exists in both builds)
    const direct = [{ x: 0, y: 0, dir: "right" }, { x: 200, y: 0, dir: "left" }, "directPair"];    // same-y direct stub-to-stub
    const inverted = [{ x: 300, y: 100, dir: "left" }, { x: 260, y: 260, dir: "left" }, "invPair"]; // two-lefts opposing geometry
    const wDirect = win.wirePathOrthogonal(direct[0], direct[1], direct[2]);
    const bDirect = bwin.wirePathOrthogonal(direct[0], direct[1], direct[2]);
    assert(wDirect === bDirect, "direct same-y stub-to-stub pair: wirePathOrthogonal output byte-identical to base");
    const wInv = win.wirePathOrthogonal(inverted[0], inverted[1], inverted[2]);
    const bInv = bwin.wirePathOrthogonal(inverted[0], inverted[1], inverted[2]);
    assert(wInv === bInv, "opposing-direction (two-lefts) pair: wirePathOrthogonal output byte-identical to base");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
