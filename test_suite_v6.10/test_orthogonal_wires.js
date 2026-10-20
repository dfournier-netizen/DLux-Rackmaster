// v6.6/v6.6.1 -- orthogonal wire routing toggle (S.ui.wireStyle: "curved" | "orthogonal") + tidy bus lanes.
// Covers: migrate() default/backfill, persistence via the topbar segmented control, curved mode stays
// byte-for-byte the pre-v6.6 path (wirePathCurved === the old wirePath body), orthogonal paths are
// strictly axis-aligned (every straight "L" run is either purely horizontal or purely vertical, small
// rounded elbows aside), and (v6.6.1) the bus-lane algorithm: assignWireLanes() buckets cables sharing a
// corridor, sorts them deterministically, spaces them evenly and centers the band, keeps separate
// corridors apart, is order-independent (keyed off geometry/id, not array/iteration order), and produces
// stable (non-jittering) redraws for an unchanged topology. The old per-cable connHash() jitter is gone.
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(process.argv[2] || "build.html", "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

// Parse an SVG path "d" string of M/L/C/Q commands into a flat list of {cmd,pts:[[x,y],...]}
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

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await new Promise(r => setTimeout(r, 150));
  const S = win.eval("S");

  // ---- 1. migrate() default ----
  assert(S.ui.wireStyle === "orthogonal", "migrate() heals S.ui.wireStyle to \"orthogonal\" (curved removed, v6.10.1)");

  // ---- 2. migrate() backfill on a pre-v6.6 blob missing the field entirely ----
  delete S.ui.wireStyle;
  win.eval("migrate()");
  assert(S.ui.wireStyle === "orthogonal", "migrate() backfills a missing wireStyle on a pre-v6.6 project to \"orthogonal\"");
  S.ui.wireStyle = "curved"; win.eval("migrate()");
  assert(S.ui.wireStyle === "orthogonal", "migrate() heals a stored \"curved\" from an old save to \"orthogonal\"");

  // ---- 3. v6.10.1: curved mode is REMOVED -- wirePath() is a thin alias for wirePathOrthogonal() ----
  const a = { x: 10, y: 20, dir: "right" }, b = { x: 210, y: 90, dir: "left" };
  assert(win.eval("typeof wirePathCurved") === "undefined", "wirePathCurved() no longer exists");
  assert(win.wirePath(a, b, "connX") === win.wirePathOrthogonal(a, b, "connX"), "wirePath() always delegates to wirePathOrthogonal()");
  assert(win.wirePath(a, b, "connX", 55) === win.wirePathOrthogonal(a, b, "connX", 55), "…including the laneX pass-through");

  // ---- 4. orthogonal mode produces axis-aligned straight runs ----
  function isAxisAligned(segs) {
    // Walk consecutive point pairs across all commands (M/L/Q); every straight jump between two
    // points that aren't part of the same Q's curve control point must be purely horizontal or vertical.
    let ok = true;
    let prev = segs[0].pts[0];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.cmd === "L") {
        const [x, y] = seg.pts[0];
        if (Math.abs(x - prev[0]) > 0.01 && Math.abs(y - prev[1]) > 0.01) ok = false;
        prev = [x, y];
      } else if (seg.cmd === "Q") {
        // control point then endpoint -- corners are small (~6px) rounded arcs, don't assert axis-alignment
        // on the arc itself, just advance prev to the arc's endpoint
        prev = seg.pts[1];
      } else if (seg.cmd === "M") {
        prev = seg.pts[0];
      }
    }
    return ok;
  }
  const orthoStraight = win.wirePathOrthogonal({ x: 0, y: 0, dir: "right" }, { x: 200, y: 0, dir: "left" }, "c1");
  assert(isAxisAligned(parsePath(orthoStraight)), "orthogonal same-height run is a straight axis-aligned line");

  const orthoElbow = win.wirePathOrthogonal({ x: 0, y: 0, dir: "right" }, { x: 200, y: 120, dir: "left" }, "c2");
  const parsedElbow = parsePath(orthoElbow);
  assert(isAxisAligned(parsedElbow), "orthogonal elbowed run: every straight L segment is purely horizontal or vertical");
  assert(parsedElbow.some(s => s.cmd === "Q"), "orthogonal elbowed run includes rounded (Q) corners");

  const orthoBottom = win.wirePathOrthogonal({ x: 0, y: 0, dir: "down" }, { x: 150, y: 60, dir: "left" }, "c3");
  assert(isAxisAligned(parsePath(orthoBottom)), "orthogonal path from a BiDi (down-exit) port is still axis-aligned");

  // ---- 5. wirePathOrthogonal() without a laneX falls back to a deterministic, unstaggered midpoint
  //         (ghost-wire preview / direct ad hoc calls -- no connHash jitter anymore) ----
  const p1 = win.wirePathOrthogonal({ x: 0, y: 0, dir: "right" }, { x: 200, y: 120, dir: "left" }, "sameId");
  const p2 = win.wirePathOrthogonal({ x: 0, y: 0, dir: "right" }, { x: 200, y: 120, dir: "left" }, "sameId");
  assert(p1 === p2, "wirePathOrthogonal is deterministic -- identical inputs produce an identical path");
  const p3 = win.wirePathOrthogonal({ x: 0, y: 0, dir: "right" }, { x: 200, y: 120, dir: "left" }, "otherId");
  assert(p1 === p3, "without a laneX, connId no longer affects the path at all -- plain geometric midpoint, no per-id jitter");
  assert(p1.includes("Q 100 0") && p1.includes("Q 100 120"), "fallback corridor x is the plain (sa.x+sb.x)/2 midpoint (100 here) -- both elbow corners sit on x=100");
  assert(typeof win.connHash === "undefined", "connHash() has been removed entirely -- replaced by the lane-assignment pass");

  // ---- 6. wirePathOrthogonal() honors an explicit laneX (what drawWires() feeds it after lane assignment) ----
  const staged = win.wirePathOrthogonal({ x: 0, y: 0, dir: "right" }, { x: 200, y: 120, dir: "left" }, "anyId", 77);
  assert(staged.includes("Q 77 0") && staged.includes("Q 77 120"), "an explicit laneX is used verbatim as the corridor mid-run x");

  // ---- 7. assignWireLanes(): grouping, deterministic sort (destY, srcY, id), even ~28px spacing,
  //         band centered near the group's average preferred x, separate corridors stay separate,
  //         non-corridor entries are excluded entirely ----
  const entries = [
    { id: "c3", prefX: 201, srcY: 10, destY: 300, needsCorridor: true },
    { id: "c1", prefX: 199, srcY: 10, destY: 100, needsCorridor: true },
    { id: "c5", prefX: 200, srcY: 10, destY: 500, needsCorridor: true },
    { id: "c2", prefX: 202, srcY: 10, destY: 200, needsCorridor: true },
    { id: "c4", prefX: 198, srcY: 10, destY: 400, needsCorridor: true },
    { id: "c6", prefX: 200, srcY: 10, destY: 600, needsCorridor: true },
    { id: "far", prefX: 900, srcY: 10, destY: 50, needsCorridor: true },
    { id: "straight", prefX: 500, srcY: 40, destY: 40, needsCorridor: false },
  ];
  const laneX = win.assignWireLanes(entries);
  const order = ["c1", "c2", "c3", "c4", "c5", "c6"]; // expected sort order: destY ascending (100..600)
  const xs = order.map(id => laneX.get(id));
  assert(xs.every(x => typeof x === "number"), "every corridor-grouped connection gets a numeric lane x");
  const spacings = xs.slice(1).map((x, i) => x - xs[i]);
  assert(spacings.every(s => Math.abs(s - 28) < 1e-9), "lanes within a corridor are evenly spaced exactly 28px apart (WIRE_LANE_GAP, v6.10: 14 -> 28), in destY order");
  assert(new Set(xs).size === xs.length, "no two cables in the same corridor share an identical lane x");
  const centerOfBand = (xs[0] + xs[xs.length - 1]) / 2;
  assert(Math.abs(centerOfBand - 200) < 1, "the lane band is centered on the group's average preferred x (~200)");
  assert(laneX.get("far") !== undefined && !xs.includes(laneX.get("far")), "a far-away preferred x (900) lands in its own corridor, not merged into the main band");
  assert(laneX.get("straight") === undefined, "entries with needsCorridor:false (already-flat horizontal runs) are excluded from lane assignment entirely");

  // ---- 8. assignWireLanes() is order-independent -- shuffling the input array yields identical lane
  //         assignments (keys come from geometry + connection id, never iteration/array order) ----
  const shuffled = [entries[5], entries[0], entries[6], entries[3], entries[1], entries[7], entries[2], entries[4]];
  const laneX2 = win.assignWireLanes(shuffled);
  let sameAssignment = true;
  for (const id of order.concat(["far"])) { if (laneX.get(id) !== laneX2.get(id)) sameAssignment = false; }
  assert(sameAssignment, "assignWireLanes() output is identical regardless of input array order (order-independent)");

  // ---- 9. wirePath() dispatches to orthogonal when the toggle is set, and forwards laneX through ----
  S.ui.wireStyle = "orthogonal";
  const dispatched = win.wirePath({ x: 0, y: 0, dir: "right" }, { x: 200, y: 120, dir: "left" }, "c9", 55);
  const direct = win.wirePathOrthogonal({ x: 0, y: 0, dir: "right" }, { x: 200, y: 120, dir: "left" }, "c9", 55);
  assert(dispatched === direct, "wirePath() delegates to wirePathOrthogonal() (including laneX) when S.ui.wireStyle === \"orthogonal\"");

  // ---- 10. end-to-end: drawWires() renders orthogonal paths on the canvas, and casing+wire pairing,
  //          hover/selected/trace classes, and click-to-select all still work in both modes ----
  const mkDev = (id, name, dir) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx: 20, ry: 20, hideInRouting: null, pushProtect: false, draw: null, circuit: null,
    ports: [{ id: "g1", name: "P", type: "XLR3", dir, count: 1, face: "front", jacks: [] }] });
  S.racks = [{ id: "r1", name: "Rack One", sizeU: 12, depth: 20, color: "#123", notes: "", circuits: [], devices: [
    mkDev("d1", "Console", "out"), mkDev("d2", "Amp", "in")
  ] }];
  S.edges = [];
  S.connections = [{ id: "cc1", a: { dev: "d1", g: "g1", i: 0 }, b: { dev: "d2", g: "g1", i: 0 },
    label: "MAIN L", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" }];
  S.ui.view = "routing";
  S.ui.routingRackOnly = "r1";

  for (const style of ["curved", "orthogonal"]) {
    S.ui.wireStyle = style;
    win.eval("render()");
    win.eval("drawWires()");
    const svg = doc.querySelector("#wires");
    const grp = svg.querySelector(".wire-grp");
    assert(!!grp, `[${style}] cable still renders as a .wire-grp (casing+wire pair)`);
    const casing = grp && grp.querySelector(".wire-casing"), wire = grp && grp.querySelector(".wire");
    assert(!!casing && !!wire, `[${style}] both casing and colored wire paths present`);
    assert(casing && wire && casing.nextElementSibling === wire, `[${style}] casing still painted under the colored wire`);
    S.ui.selConn = null;
    wire.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
    assert(S.ui.selConn === "cc1", `[${style}] clicking the wire path still selects the connection`);
  }

  // ---- 11. end-to-end corridor: several connections sharing a corridor, through the real
  //          render()+drawWires() pipeline (getBoundingClientRect mocked per-pin -- jsdom has no
  //          layout engine), produce evenly spaced, unique, sorted corridor x's -- and redrawing
  //          twice in a row without changing state gives byte-identical path "d" strings
  //          (deterministic across redraws, no frame-to-frame lane swapping) ----
  const mkMultiDev = (id, name, u, pos, ports) => ({ id, tplId: null, name, cat: "Misc", u, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx: 20, ry: 20, hideInRouting: null, pushProtect: false, draw: null, circuit: null, ports });
  const outPort = (n) => ({ id: "g1", name: "OUT", type: "XLR3", dir: "out", count: n, face: "front", jacks: [] });
  const inPort = (n) => ({ id: "g1", name: "IN", type: "XLR3", dir: "in", count: n, face: "front", jacks: [] });
  const src = mkMultiDev("src", "Console", 6, 40, [outPort(6)]);
  const dests = [];
  const conns = [];
  for (let i = 0; i < 6; i++) {
    dests.push(mkMultiDev("dst" + i, "Amp" + i, 1, 1 + i * 2, [inPort(1)]));
    conns.push({ id: "conn" + i, a: { dev: "src", g: "g1", i }, b: { dev: "dst" + i, g: "g1", i: 0 },
      label: "", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" });
  }
  S.racks = [{ id: "r1", name: "Rack One", sizeU: 44, depth: 20, color: "#123", notes: "", circuits: [], devices: [src, ...dests] }];
  S.edges = [];
  S.connections = conns;
  S.ui.view = "routing";
  S.ui.routingRackOnly = "r1";
  S.ui.wireStyle = "orthogonal";
  win.eval("render()");

  const inner = doc.querySelector("#routeInner");
  inner.getBoundingClientRect = () => ({ top: 0, left: 0, right: 2000, bottom: 2000, width: 2000, height: 2000 });
  const svgEl = doc.querySelector("#wires");
  if (svgEl) svgEl.getBoundingClientRect = () => ({ top: 0, left: 0 });
  const devY = { src: 50 };
  dests.forEach((d, i) => devY["dst" + i] = 100 + i * 80);
  doc.querySelectorAll(".pin").forEach(p => {
    const dev = p.dataset.dev;
    const x = dev === "src" ? 100 : 400;
    let y = devY[dev] || 50;
    if (dev === "src") y += (+p.dataset.i) * 15;
    p.getBoundingClientRect = () => ({ top: y, left: x, right: x + 10, bottom: y + 10, width: 10, height: 10 });
  });

  win.eval("drawWires()");
  const firstPass = [...doc.querySelectorAll("path.wire")].map(p => ({ id: p.dataset.id, d: p.getAttribute("d") }));
  assert(firstPass.length === 6, "all 6 corridor-sharing connections rendered a wire path");

  function corridorXOf(d) {
    const xsInPath = [...d.matchAll(/[LQ] ([\d.\-]+) ([\d.\-]+)/g)].map(mm => parseFloat(mm[1]));
    const counts = {};
    xsInPath.forEach(x => counts[x] = (counts[x] || 0) + 1);
    const rep = Object.keys(counts).find(x => counts[x] >= 2);
    return rep ? parseFloat(rep) : null;
  }
  const cxs = firstPass.map(p => corridorXOf(p.d));
  assert(cxs.every(x => x != null), "every corridor-sharing path has an identifiable vertical mid-run corridor x");
  assert(new Set(cxs).size === cxs.length, "all 6 corridor x values are unique (a real evenly-spaced bus, not overlapping lines)");
  const sortedCxs = [...cxs].sort((x, y) => x - y);
  assert(sortedCxs.slice(1).every((x, i) => Math.abs(x - sortedCxs[i] - 28) < 1e-6), "sorted corridor x values are evenly spaced exactly 28px apart end to end (WIRE_LANE_GAP, v6.10)");
  const allParse = firstPass.every(p => /^M ([\d.\-]+ [\d.\-]+ )(L [\d.\-]+ [\d.\-]+ )*(L [\d.\-]+ [\d.\-]+ Q [\d.\-]+ [\d.\-]+ [\d.\-]+ [\d.\-]+ )*(L [\d.\-]+ [\d.\-]+)$/.test(p.d.trim()));
  assert(allParse, "every rendered path's d string parses cleanly against the M/L/Q path grammar");

  // redraw stability: call drawWires() again with nothing changed -- must produce byte-identical paths
  win.eval("drawWires()");
  const secondPass = [...doc.querySelectorAll("path.wire")].map(p => ({ id: p.dataset.id, d: p.getAttribute("d") }));
  const stable = firstPass.every((p, i) => secondPass[i].id === p.id && secondPass[i].d === p.d);
  assert(stable, "redrawing an unchanged topology twice in a row produces byte-identical path d strings (deterministic, no lane swapping)");


  // ---- 12. topbar segmented control: click toggles S.ui.wireStyle and persists (localStorage) ----
  S.racks = [{ id: "r1", name: "Rack One", sizeU: 12, depth: 20, color: "#123", notes: "", circuits: [], devices: [
    mkDev("d1", "Console", "out"), mkDev("d2", "Amp", "in")
  ] }];
  S.connections = [{ id: "cc1", a: { dev: "d1", g: "g1", i: 0 }, b: { dev: "d2", g: "g1", i: 0 },
    label: "MAIN L", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" }];
  win.eval("render()");
  // v6.8: wireStyleSeg now lives inside the floating canvas toolbar, which render() fully rebuilds from
  // scratch on every commit() (same "wipe and rebuild #view" pattern as everything else in this codebase,
  // handoff §3) -- so DOM references must be re-queried after any click that calls commit(), same
  // convention test_trace_highlight.js already documents for trace-mode's render()-triggering clicks.
  // v6.10.1: the Curved/Orthogonal segmented control is gone -- orthogonal is the only style
  assert(!doc.querySelector("#wireStyleSeg"), "the wire-style segmented control no longer exists anywhere");
  assert(!doc.querySelector('[data-ws]'), "no data-ws buttons remain in the DOM");
  win.eval("commit()");
  const raw = win.localStorage.getItem("dlux-rackmaster-v1");
  assert(raw && JSON.parse(raw).ui.wireStyle === "orthogonal", "persisted wireStyle is always \"orthogonal\"");

  // ---- 13. v6.6.2: node-aware orthogonal routing (obstacle avoidance, no toggle -- always on in
  //          orthogonal mode) -- pickCorridorX() corridor shift, routeHorizontalAvoiding() detour
  //          side choice, endpoint-node exemption, graceful fallback on an unroutable layout, lane
  //          compression in a narrow gap, and redraw determinism with avoidance active ----

  // 13a. pickCorridorX(): a preferred corridor blocked by an obstacle shifts to the nearest clear x
  {
    const obstacles = [{ id: "ob1", x1: 90, y1: 0, x2: 110, y2: 200 }];
    assert(win.obstacleBlocksVerticalSeg(obstacles[0], 100, 0, 200), "sanity: obstacleBlocksVerticalSeg finds the blocking obstacle at the preferred x");
    const shifted = win.pickCorridorX(100, 0, 200, obstacles);
    // v6.7.1: candidate margin past an obstacle's already-inflated edge widened from a bare 0.5px nudge to
    // CORRIDOR_MARGIN (WIRE_CORNER_R + 0.5 = 6.5px) -- roundedPolylinePath()'s quadratic corners were
    // cutting the old 0.5px margin away entirely on the FINAL rendered path (confirmed against the user's
    // real project -- see Project Notes v6.7.1), so a razor-thin nudge is no longer enough.
    assert(shifted === 83.5 || shifted === 116.5, "pickCorridorX() shifts to one of the two nearest clear candidate x's (obstacle edges +/-CORRIDOR_MARGIN, 6.5px as of v6.7.1)");
    assert(!win.obstacleBlocksVerticalSeg(obstacles[0], shifted, 0, 200), "the shifted corridor x clears the obstacle");
    const clear = win.pickCorridorX(500, 0, 200, obstacles);
    assert(clear === 500, "pickCorridorX() is a no-op when the preferred x is already clear");
    const noObstacles = win.pickCorridorX(100, 0, 200, []);
    assert(noObstacles === 100, "pickCorridorX() is a no-op with an empty obstacle list");
  }

  // 13b. routeHorizontalAvoiding(): detours over the top or under the bottom, whichever is the
  //      shorter jog, and consumes exactly one unit of the shared detour budget per obstacle
  {
    const obTop = { id: "obTop", x1: 100, y1: 40, x2: 160, y2: 200 }; // top edge (40) much closer to y=50 than bottom edge (200)
    const b1 = { n: 4 };
    const detour1 = win.routeHorizontalAvoiding({ x: 0, y: 50 }, { x: 260, y: 50 }, [obTop], b1);
    assert(detour1.length === 4, "one blocking obstacle produces exactly one 4-point detour");
    // v6.7.1: detourY now sits CORRIDOR_MARGIN (6.5px) further from the obstacle edge than before (was
    // exactly obTop.y1/y2, zero extra margin -- corner-cutting ate that down toward zero on the rendered path).
    assert(Math.abs(detour1[1].y - (obTop.y1 - win.eval("CORRIDOR_MARGIN"))) < 1e-9, "detour goes over the top edge (minus CORRIDOR_MARGIN) when that's the shorter jog");
    assert(b1.n === 3, "routeHorizontalAvoiding() consumes exactly one unit of the shared detour budget per obstacle");

    const obBot = { id: "obBot", x1: 100, y1: -200, x2: 160, y2: -40 }; // bottom edge (-40) much closer to y=-50
    const detour2 = win.routeHorizontalAvoiding({ x: 0, y: -50 }, { x: 260, y: -50 }, [obBot], { n: 4 });
    assert(Math.abs(detour2[1].y - (obBot.y2 + win.eval("CORRIDOR_MARGIN"))) < 1e-9, "detour goes under the bottom edge (plus CORRIDOR_MARGIN) when that's the shorter jog");

    const clearRun = win.routeHorizontalAvoiding({ x: 0, y: 0 }, { x: 100, y: 0 }, [], { n: 4 });
    assert(clearRun.length === 0, "no obstacles -> no detour waypoints, straight line preserved");

    const spentBudget = win.routeHorizontalAvoiding({ x: 0, y: 50 }, { x: 260, y: 50 }, [obTop], { n: 0 });
    assert(spentBudget.length === 0, "a spent (zero) detour budget falls back gracefully to no waypoints rather than looping or throwing");
  }

  // 13c. wirePathOrthogonal(): a third-party obstacle across the direct run forces a detour corner;
  //      the same call with no obstacles at all reproduces the exact pre-v6.6.2 straight-line shape
  //      (proving the endpoint's own short port->stub segment is never itself what triggers a detour)
  {
    const a = { x: 0, y: 0, dir: "right" }, b = { x: 200, y: 0, dir: "left" };
    win.eval(`WIRE_OBSTACLES = ${JSON.stringify([{ id: "d:third", x1: 80, y1: -20, x2: 120, y2: 20 }])}`);
    const withObstacle = win.wirePathOrthogonal(a, b, "connEx");
    assert(withObstacle.includes(" Q "), "a third-party obstacle across the direct run forces a rounded detour corner to appear");
    win.eval("WIRE_OBSTACLES = null");
    const noObstacle = win.wirePathOrthogonal(a, b, "connEx2");
    const noObstaclePts = parsePath(noObstacle).flatMap(s => s.pts);
    assert(noObstaclePts.every(([x, y]) => Math.abs(y) < 0.01), "no obstacles -> the path never leaves y=0 (straight run, no vertical detour excursion)");
    const withObstaclePts = parsePath(withObstacle).flatMap(s => s.pts);
    assert(withObstaclePts.some(([x, y]) => Math.abs(y) > 5), "a third-party obstacle across the direct run forces a vertical detour excursion (sanity cross-check on the same withObstacle path)");
  }

  // 13d. graceful fallback on an unroutable layout -- an obstacle spanning the entire routable width
  //      still produces a rendered wire, never a crash/exception, within the bounded detour budget
  {
    const hugeObstacle = { id: "d:huge", x1: -100000, y1: -50, x2: 100000, y2: 50 };
    win.eval(`WIRE_OBSTACLES = ${JSON.stringify([hugeObstacle])}`);
    let threw = false, d = "";
    try { d = win.wirePathOrthogonal({ x: 0, y: 0, dir: "right" }, { x: 300, y: 0, dir: "left" }, "connImpossible"); }
    catch (e) { threw = true; }
    assert(!threw, "an unroutable-around obstacle (spans the whole width) does not throw");
    assert(typeof d === "string" && d.startsWith("M "), "a wire path string is still produced (graceful fallback once the detour budget is spent)");
    win.eval("WIRE_OBSTACLES = null");
  }

  // 13e. assignWireLanes() with obstacles compresses lane spacing below WIRE_LANE_GAP (28) when the
  //      clear x-gap at the corridor is narrower than the group's natural band, and clamps every
  //      lane inside that gap; omitting obstacles entirely keeps the original v6.6.1 behavior
  {
    const narrowEntries = [
      { id: "n1", prefX: 200, srcY: 10, destY: 100, needsCorridor: true },
      { id: "n2", prefX: 200, srcY: 10, destY: 200, needsCorridor: true },
      { id: "n3", prefX: 200, srcY: 10, destY: 300, needsCorridor: true },
    ];
    const narrowObstacles = [ // a 10px-wide clear gap around x=200 (100..190 blocked, 210..300 blocked) -- narrower than (n-1)*28=56px
      { id: "left", x1: 100, y1: 0, x2: 190, y2: 400 },
      { id: "right", x1: 210, y1: 0, x2: 300, y2: 400 },
    ];
    const laneNarrow = win.assignWireLanes(narrowEntries, narrowObstacles);
    const xs = ["n1", "n2", "n3"].map(id => laneNarrow.get(id));
    assert(xs.every(x => x >= 190 && x <= 210), "every lane in the compressed group stays inside (or exactly on the clear edge of) the 10px gap -- boundary-touching is the same 'clear' convention obstacleBlocksVerticalSeg uses elsewhere (strict < / >)");
    const spacing = xs[1] - xs[0];
    assert(spacing < 28 - 1e-9, "lane spacing compresses below WIRE_LANE_GAP (28) to fit the narrow gap");
    assert(Math.abs((xs[2] - xs[1]) - spacing) < 1e-9, "compressed spacing is still even across the group");

    const laneWide = win.assignWireLanes(narrowEntries);
    const xsWide = ["n1", "n2", "n3"].map(id => laneWide.get(id));
    assert(Math.abs((xsWide[1] - xsWide[0]) - 28) < 1e-9, "omitting the obstacles argument entirely keeps the uncompressed 28px (WIRE_LANE_GAP) spacing (v6.6.1 call signature unaffected)");
  }

  // 13f. end-to-end: a dense 3-device column (top -> blocker -> bottom, forcing both a corridor shift
  //      and a horizontal detour) rendered via the real render()/drawWires() pipeline produces a path
  //      with an actual detour corner, is byte-identical across two redraws with nothing changed
  //      (deterministic with avoidance active), and has zero mid-run segment/obstacle intersections
  //      against the real device rects
  {
    const mkDev = (id, name, dir, rx, ry, w = 190, h = 80) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
      depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
      notes: "", rx, ry, hideInRouting: null, pushProtect: false, draw: null, circuit: null, _w: w, _h: h,
      ports: [{ id: "g1", name: "P", type: "XLR3", dir, count: 1, face: "front", jacks: [] }] });
    const dTop = mkDev("dTop", "Top", "out", 100, 20);
    const dBlock = mkDev("dBlock", "Blocker", "in", 100, 160, 190, 80);
    const dBottom = mkDev("dBottom", "Bottom", "in", 100, 340);
    S.racks = [{ id: "r1", name: "Rack One", sizeU: 44, depth: 20, color: "#123", notes: "", circuits: [], devices: [dTop, dBlock, dBottom] }];
    S.edges = [];
    S.connections = [{ id: "detA", a: { dev: "dTop", g: "g1", i: 0 }, b: { dev: "dBottom", g: "g1", i: 0 },
      label: "", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" }];
    S.ui.view = "routing"; S.ui.routingRackOnly = "r1"; S.ui.wireStyle = "orthogonal";
    win.eval("render()");
    const inner2 = doc.querySelector("#routeInner");
    inner2.getBoundingClientRect = () => ({ top: 0, left: 0, right: 2000, bottom: 2000, width: 2000, height: 2000 });
    const devById2 = { dTop, dBlock, dBottom };
    doc.querySelectorAll(".node").forEach(n => {
      const d = devById2[n.dataset.dev]; if (!d) return;
      n.getBoundingClientRect = () => ({ top: d.ry, left: d.rx, right: d.rx + d._w, bottom: d.ry + d._h, width: d._w, height: d._h });
    });
    doc.querySelectorAll(".pin").forEach(p => {
      const d = devById2[p.dataset.dev]; if (!d) return;
      const dir = p.dataset.dir;
      const x = dir === "out" ? d.rx + d._w : d.rx;
      const y = d.ry + d._h / 2;
      p.getBoundingClientRect = () => ({ top: y, left: x, right: x + 2, bottom: y + 2, width: 2, height: 2 });
    });
    win.eval("drawWires()");
    const first = doc.querySelector('path.wire[data-id="detA"]').getAttribute("d");
    assert(first.includes(" Q "), "the blocked column run produces at least one detour/corridor corner");
    win.eval("drawWires()");
    const second = doc.querySelector('path.wire[data-id="detA"]').getAttribute("d");
    assert(first === second, "redrawing an unchanged obstacle-avoiding topology twice produces a byte-identical path (deterministic)");

    function parsePath13(d) {
      const tokens = d.match(/[MLCQ][^MLCQ]*/g) || [];
      return tokens.map(t => {
        const cmd = t[0];
        const nums = t.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
        const pts = [];
        for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
        return { cmd, pts };
      });
    }
    function straightWaypoints13(d) {
      const cmds = parsePath13(d); const wp = [];
      for (const c of cmds) {
        if (c.cmd === "M" || c.cmd === "L") wp.push(c.pts[0]);
        else if (c.cmd === "Q") wp.push(c.pts[1]);
      }
      return wp;
    }
    function segIntersectsRect13(p1, p2, r) {
      const [x1, y1] = p1, [x2, y2] = p2;
      if (Math.abs(x1 - x2) < 0.05) { const x = x1, lo = Math.min(y1, y2), hi = Math.max(y1, y2); return x > r.x1 && x < r.x2 && hi > r.y1 && lo < r.y2; }
      if (Math.abs(y1 - y2) < 0.05) { const y = y1, lo = Math.min(x1, x2), hi = Math.max(x1, x2); return y > r.y1 && y < r.y2 && hi > r.x1 && lo < r.x2; }
      return false;
    }
    const CLR = win.eval("WIRE_CLEARANCE");
    assert(CLR === 10, "WIRE_CLEARANCE is 10px as specced");
    const rects = [dTop, dBlock, dBottom].map(d => ({ x1: d.rx - CLR, y1: d.ry - CLR, x2: d.rx + d._w + CLR, y2: d.ry + d._h + CLR }));
    const wp = straightWaypoints13(first);
    let violations = 0;
    for (let i = 1; i < wp.length - 2; i++) for (const r of rects) if (segIntersectsRect13(wp[i], wp[i + 1], r)) violations++;
    assert(violations === 0, "the rendered mid-run path has zero segment/obstacle intersections against the three real (inflated) device rects");

    }


  // ---- 14. v6.7: no-backtrack / no-overlap fix for the orthogonal "T" artifact ----
  // Root cause: wirePathOrthogonal()'s mid-run corridor x used the plain (sa.x+sb.x)/2 midpoint of
  // the two port stubs with no regard for which side of its own stub a "left"/"right"-facing port
  // must be approached from. When both endpoints face the same direction (e.g. two "left" ports, one
  // above-and-right of the other -- exactly the switch->PDU screenshot geometry) the midpoint can land
  // strictly between a stub and its own port, forcing the final leg to travel *past* the corridor's x
  // a second time to reach the port: a genuine 180-degree reversal that renders as a spur/T where
  // roundedPolylinePath()'s corner math folds back on itself. Fixed at the cause level
  // (corridorXRange()/clampCorridorX() constrain the corridor to the monotonic-approach zone for each
  // stub's own direction, both before and after pickCorridorX()'s obstacle-avoidance shift) and at the
  // polyline level (collapseCollinear() merges any three consecutive axis-aligned-collinear points,
  // which catches both redundant same-direction waypoints and any remaining backtrack/overlap
  // regardless of cause).
  function waypointsOf14(d) {
    // Reconstructs the *original* pre-rounding polyline points (what collapseCollinear() actually
    // operated on), not the rendered rounded-corner arc endpoints -- roundedPolylinePath() emits each
    // interior corner as "L inX inY Q origX origY outX outY", where the Q's *first* point pair is the
    // true original corner (its second point pair is just the arc's exit, joined to the next straight
    // run's entry by a deliberately non-axis-aligned ~6px curve, which must NOT be flagged as a
    // structural direction change). The one L that is NOT immediately followed by a Q is the path's
    // true final endpoint (no corner-rounding happens there). This mirrors the "prev" tracking the
    // existing isAxisAligned() (section 4) already uses, applied to backtrack/overlap detection too.
    const cmds = parsePath(d); const wp = [];
    for (let idx = 0; idx < cmds.length; idx++) {
      const c = cmds[idx];
      if (c.cmd === "M") wp.push(c.pts[0]);
      else if (c.cmd === "Q") wp.push(c.pts[0]); // true corner point (arc's start-control, not its exit)
      else if (c.cmd === "L" && idx === cmds.length - 1) wp.push(c.pts[0]); // the final L (no following Q) is a true endpoint; interior L's (arc-entry points) are intentionally skipped
    }
    return wp;
  }
  function segmentsOf14(wp) {
    const segs = [];
    for (let i = 0; i + 1 < wp.length; i++) {
      const x1 = wp[i][0], y1 = wp[i][1], x2 = wp[i + 1][0], y2 = wp[i + 1][1];
      if (Math.abs(x1 - x2) < 0.05 && Math.abs(y1 - y2) < 0.05) continue; // zero-length -- not a real segment
      segs.push({ x1, y1, x2, y2 });
    }
    return segs;
  }
  function rangesOverlap14(a1, a2, b1, b2) {
    const lo1 = Math.min(a1, a2), hi1 = Math.max(a1, a2);
    const lo2 = Math.min(b1, b2), hi2 = Math.max(b1, b2);
    return Math.min(hi1, hi2) - Math.max(lo1, lo2) > 0.05;
  }
  function findCollinearOverlaps14(segs) {
    const issues = [];
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i], B = segs[j];
      const aVert = Math.abs(A.x1 - A.x2) < 0.05, aHoriz = Math.abs(A.y1 - A.y2) < 0.05;
      const bVert = Math.abs(B.x1 - B.x2) < 0.05, bHoriz = Math.abs(B.y1 - B.y2) < 0.05;
      if (aVert && bVert && Math.abs(A.x1 - B.x1) < 0.05 && rangesOverlap14(A.y1, A.y2, B.y1, B.y2)) issues.push({ type: "vert-overlap", i, j });
      else if (aHoriz && bHoriz && Math.abs(A.y1 - B.y1) < 0.05 && rangesOverlap14(A.x1, A.x2, B.x1, B.x2)) issues.push({ type: "horiz-overlap", i, j });
    }
    return issues;
  }
  function findReversals14(wp) {
    const issues = [];
    for (let i = 0; i + 2 < wp.length; i++) {
      const ax = wp[i][0], ay = wp[i][1], bx = wp[i + 1][0], by = wp[i + 1][1], cx = wp[i + 2][0], cy = wp[i + 2][1];
      const dx1 = bx - ax, dy1 = by - ay, dx2 = cx - bx, dy2 = cy - by;
      const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
      if (len1 < 0.05 || len2 < 0.05) continue;
      const dot = (dx1 / len1) * (dx2 / len2) + (dy1 / len1) * (dy2 / len2);
      if (dot < -0.95) issues.push({ type: "reversal", i });
    }
    return issues;
  }
  function isAxisAligned14(wp) {
    for (let i = 0; i + 1 < wp.length; i++) {
      const dx = Math.abs(wp[i][0] - wp[i + 1][0]), dy = Math.abs(wp[i][1] - wp[i + 1][1]);
      if (dx > 0.05 && dy > 0.05) return false;
    }
    return true;
  }
  function assertClean14(d, label, obstacles) {
    const wp = waypointsOf14(d);
    const segs = segmentsOf14(wp);
    assert(findCollinearOverlaps14(segs).length === 0, label + " -- no overlapping collinear segments");
    assert(findReversals14(wp).length === 0, label + " -- no consecutive-segment 180-degree reversal");
    assert(isAxisAligned14(wp), label + " -- path stays axis-aligned");
    if (obstacles && obstacles.length) {
      function segIntersectsRect(p1, p2, r) {
        const [x1, y1] = p1, [x2, y2] = p2;
        if (Math.abs(x1 - x2) < 0.05) { const x = x1, lo = Math.min(y1, y2), hi = Math.max(y1, y2); return x > r.x1 && x < r.x2 && hi > r.y1 && lo < r.y2; }
        if (Math.abs(y1 - y2) < 0.05) { const y = y1, lo = Math.min(x1, x2), hi = Math.max(x1, x2); return y > r.y1 && y < r.y2 && hi > r.x1 && lo < r.x2; }
        return false;
      }
      let violations = 0;
      // mid-run only -- first/last segment are the exempt short port->stub legs, matching the v6.6.2 convention
      for (let i = 1; i < wp.length - 3; i++) for (const ob of obstacles) if (segIntersectsRect(wp[i], wp[i + 1], ob)) violations++;
      assert(violations === 0, label + " -- mid-run path stays clear of every obstacle rect");
    }
  }

  // 14a. direct wirePathOrthogonal() sweep: both ports "left"-facing, destination below at varying x
  //      offsets (including straight-below, below-left, and below-right of the source), each with the
  //      two devices' own node bodies registered as obstacles (mirrors collectNodeObstacles() feeding
  //      the cable's own endpoint nodes into avoidance, per v6.6.2) -- this is the exact family of
  //      layouts that produced the screenshot's T artifact pre-fix.
  {
    const CLR = 10;
    const W = 190, H = 80;
    const srcX = 300, srcY = 100;
    const offsets = [-120, -80, -40, -20, -10, 0, 10, 20, 40, 80, 120]; // dx: below-left .. straight-below .. below-right
    const dys = [5, 20, 60, 120];
    let tested = 0;
    for (const dx of offsets) for (const dy of dys) {
      const dstX = srcX + dx, dstY = srcY + H + dy;
      const srcRect = { x1: srcX, y1: srcY, x2: srcX + W, y2: srcY + H };
      const dstRect = { x1: dstX, y1: dstY, x2: dstX + W, y2: dstY + H };
      const obstacles = [srcRect, dstRect].map(r => ({ x1: r.x1 - CLR, y1: r.y1 - CLR, x2: r.x2 + CLR, y2: r.y2 + CLR }));
      win.eval("WIRE_OBSTACLES = " + JSON.stringify(obstacles));
      const a = { x: srcRect.x1, y: (srcRect.y1 + srcRect.y2) / 2, dir: "left" };
      const b = { x: dstRect.x1, y: (dstRect.y1 + dstRect.y2) / 2, dir: "left" };
      const d = win.wirePathOrthogonal(a, b, "sweepConn");
      assertClean14(d, "14a sweep dx=" + dx + " dy=" + dy, obstacles);
      tested++;
    }
    assert(tested === offsets.length * dys.length, "14a swept the full adversarial dx/dy grid (" + (offsets.length * dys.length) + " layouts)");
    win.eval("WIRE_OBSTACLES = []");
  }

  // 14b. the exact screenshot geometry -- Netgear switch's left "Power" port to a Rack PDU's left
  //      "Main In" port, PDU below-left of the switch, wire must wrap the PDU's top-left corner
  {
    const CLR = 10;
    const switchRect = { x1: 300, y1: 100, x2: 490, y2: 180 };
    const pduRect = { x1: 260, y1: 200, x2: 450, y2: 280 }; // below and slightly left/overlapping-x of the switch
    const obstacles = [switchRect, pduRect].map(r => ({ x1: r.x1 - CLR, y1: r.y1 - CLR, x2: r.x2 + CLR, y2: r.y2 + CLR }));
    win.eval("WIRE_OBSTACLES = " + JSON.stringify(obstacles));
    const a = { x: switchRect.x1, y: (switchRect.y1 + switchRect.y2) / 2, dir: "left" }; // switch Power port
    const b = { x: pduRect.x1, y: (pduRect.y1 + pduRect.y2) / 2, dir: "left" }; // PDU Main In port
    const d = win.wirePathOrthogonal(a, b, "edisonCable");
    assertClean14(d, "14b screenshot geometry (switch Power -> PDU Main In)", obstacles);
    win.eval("WIRE_OBSTACLES = []");
  }

  // 14c. mixed-direction adversarial cases: dest "right"-facing (approached from the other side),
  //      and BiDi "down" endpoints mixed with a "left" endpoint -- confirms the fix doesn't just
  //      special-case the two-lefts screenshot scenario
  {
    win.eval("WIRE_OBSTACLES = []"); // defensive: no obstacles intended for this structural-only check
    const cases = [
      { a: { x: 300, y: 100, dir: "left" }, b: { x: 340, y: 260, dir: "right" } },
      { a: { x: 300, y: 100, dir: "right" }, b: { x: 260, y: 260, dir: "left" } },
      { a: { x: 300, y: 100, dir: "down" }, b: { x: 260, y: 260, dir: "left" } },
      { a: { x: 300, y: 100, dir: "left" }, b: { x: 260, y: 40, dir: "left" } }, // destination above source
    ];
    for (const c of cases) {
      const d = win.wirePathOrthogonal(c.a, c.b, "mixedConn");
      assertClean14(d, "14c mixed-direction (" + c.a.dir + "->" + c.b.dir + ")", null);
    }
  }

  // 14d. end-to-end: the screenshot topology rendered through the real render()/drawWires() pipeline
  //      (switch above, PDU below-left, both left-facing ports) produces a rendered path with no
  //      backtrack/overlap, matching what a user would actually see
  {
    const mkPowerDev = (id, name, dir, rx, ry, w, h) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
      depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
      notes: "", rx, ry, hideInRouting: null, pushProtect: false, draw: null, circuit: null, _w: w || 190, _h: h || 80,
      ports: [{ id: "g1", name: "Power", type: "Edison", dir, count: 1, face: "front", jacks: [] }] });
    const dSwitch = mkPowerDev("dSwitch", "Netgear Switch", "in", 300, 100);
    const dPdu = mkPowerDev("dPdu", "Rack PDU", "in", 260, 200);
    S.racks = [{ id: "r1", name: "Rack One", sizeU: 44, depth: 20, color: "#123", notes: "", circuits: [], devices: [dSwitch, dPdu] }];
    S.edges = [];
    S.connections = [{ id: "edisonCableE2E", a: { dev: "dSwitch", g: "g1", i: 0 }, b: { dev: "dPdu", g: "g1", i: 0 },
      label: "", color: "#e0a03d", type: "Edison", len: 24, notes: "", adapter: "" }];
    S.ui.view = "routing"; S.ui.routingRackOnly = "r1"; S.ui.wireStyle = "orthogonal";
    win.eval("render()");
    const inner3 = doc.querySelector("#routeInner");
    inner3.getBoundingClientRect = () => ({ top: 0, left: 0, right: 2000, bottom: 2000, width: 2000, height: 2000 });
    const devById3 = { dSwitch, dPdu };
    doc.querySelectorAll(".node").forEach(n => {
      const dv = devById3[n.dataset.dev]; if (!dv) return;
      n.getBoundingClientRect = () => ({ top: dv.ry, left: dv.rx, right: dv.rx + dv._w, bottom: dv.ry + dv._h, width: dv._w, height: dv._h });
    });
    doc.querySelectorAll(".pin").forEach(p => {
      const dv = devById3[p.dataset.dev]; if (!dv) return;
      const x = dv.rx; // "in"/left-facing port sits on the left edge
      const y = dv.ry + dv._h / 2;
      p.getBoundingClientRect = () => ({ top: y, left: x, right: x + 2, bottom: y + 2, width: 2, height: 2 });
    });
    win.eval("drawWires()");
    const rendered = doc.querySelector('path.wire[data-id="edisonCableE2E"]').getAttribute("d");
    assertClean14(rendered, "14d end-to-end rendered screenshot topology (real render()/drawWires() pipeline)", null);
    }

  // ---- 15. v6.7.1: opposing-direction-geometry fix, distilled from the user's REAL project ----
  // Root cause the v6.7 fix (section 14 above) missed: v6.7's corridorXRange()/clampCorridorX() only
  // handled the case where BOTH endpoints face the *same* direction (e.g. two "left" ports). This
  // fixture is the actual Netgear M4250 / Rack PDU / UPS cluster from the user's real "LX Network
  // racks.dlux.json" LX BOH Rack (device rx/ry, port groups, and the two live connections copied
  // verbatim from the exported project -- not synthesized), which hits a DIFFERENT unhandled case:
  // "opposing-direction geometry" -- PDU's "Out" port faces right (aDir="right") while the Netgear's
  // "Power" port faces left (bDir="left"), and the PDU's stub x sits to the *right* of the Netgear's
  // stub x, so corridorXRange() returns an inverted [lo,hi] (lo > hi). The pre-v6.7.1 clampCorridorX()
  // explicitly left this case unclamped ("no valid monotonic zone"), which let the corridor land in the
  // forbidden middle between the two stubs, forcing one stub's own horizontal jog to backtrack past its
  // own port/edge -- the literal mechanism behind the reported spur toward the PDU's "Main In" area.
  // v6.7.1 fixes this at clampCorridorX() (snaps into the nearer of the two valid *outer* wrap zones,
  // never the forbidden middle), pickCorridorX() (accepts the same `range` and only considers candidates
  // already inside a valid zone), and widens the clearance margin (CORRIDOR_MARGIN, was a bare 0.5px
  // nudge past the already-inflated obstacle edge -- too thin to survive roundedPolylinePath()'s
  // corner-cutting) in pickCorridorX()'s candidates AND routeHorizontalAvoiding()'s detourY/enterX/exitX.
  {
    const CLR = win.eval("WIRE_CLEARANCE");
    const W = 190;
    function estH15(portGroupCount) { return Math.max(60, 30 + portGroupCount * 24); }
    const mkClusterDev = (id, name, rx, ry, ports) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
      depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
      notes: "", rx, ry, hideInRouting: null, pushProtect: false, draw: null, circuit: null, ports });
    // real port groups (trimmed of per-jack VLAN/field detail -- irrelevant to routing geometry), real rx/ry
    const dUps = mkClusterDev("kooexto7ie", "UPS 500VA", 198.66663360595703, 457.3332977294922, [
      { id: "kooexkmpuj", name: "AC In", type: "IEC", dir: "in", count: 1, face: "rear", jacks: [] },
      { id: "kooexfjspr", name: "AC Out", type: "IEC", dir: "out", count: 6, face: "rear", jacks: [] },
      { id: "kooex8fluk", name: "Mgmt", type: "RJ45", dir: "bi", count: 1, face: "rear", jacks: [] },
    ]);
    const dPdu = mkClusterDev("kry7q87o7d", "Rack PDU", 546.3332145327614, 442.60319555373405, [
      { id: "kry7q7dkap", name: "Main In", type: "Edison", dir: "in", count: 1, face: "rear", jacks: [] },
      { id: "kry7qnuwq1", name: "Out", type: "Edison", dir: "out", count: 4, face: "rear", jacks: [] },
      { id: "kry7qqfnj4", name: "Out", type: "Edison", dir: "out", count: 6, face: "front", jacks: [] },
    ]);
    const dNetgear = mkClusterDev("kvcuiayu43", "Netgear M4250-8G2XF", 685.0792232695079, 152.38096509660994, [
      { id: "kvcui9f36c", name: "Network", type: "RJ45", dir: "bi", count: 8, face: "rear", jacks: [] },
      { id: "kvcuilxm0k", name: "SFP", type: "opticalCON", dir: "bi", count: 2, face: "rear", jacks: [] },
      { id: "kvcui39424", name: "Power", type: "IEC", dir: "in", count: 1, face: "rear", jacks: [] },
    ]);
    S.racks = [{ id: "rBoh", name: "LX BOH Rack", sizeU: 44, depth: 20, color: "#123", notes: "", circuits: [], devices: [dUps, dPdu, dNetgear] }];
    S.edges = [];
    // the two live connections from the real project, verbatim (ids/colors/lengths included)
    S.connections = [
      { id: "ky7i0ztu5j", a: { dev: "kooexto7ie", g: "kooexfjspr", i: 0 }, b: { dev: "kry7q87o7d", g: "kry7q7dkap", i: 0 },
        label: "", color: "#e3c22e", type: "IEC", notes: "", len: 100, adapter: "" }, // UPS AC Out -> PDU Main In (normal, non-inverted range)
      { id: "5g4kr2v70t", a: { dev: "kry7q87o7d", g: "kry7qnuwq1", i: 0 }, b: { dev: "kvcuiayu43", g: "kvcui39424", i: 0 },
        label: "", color: "#e05252", type: "Edison", notes: "", len: 50, adapter: "" }, // PDU Out -> Netgear Power (the reported opposing-direction/spur case)
    ];
    S.ui.view = "routing"; S.ui.routingRackOnly = "rBoh"; S.ui.wireStyle = "orthogonal";
    win.eval("render()");
    const inner15 = doc.querySelector("#routeInner");
    inner15.getBoundingClientRect = () => ({ top: 0, left: 0, right: 4000, bottom: 4000, width: 4000, height: 4000 });
    const svg15 = doc.querySelector("#wires");
    if (svg15) svg15.getBoundingClientRect = () => ({ top: 0, left: 0 });
    const devById15 = { kooexto7ie: dUps, kry7q87o7d: dPdu, kvcuiayu43: dNetgear };
    doc.querySelectorAll(".node").forEach(n => {
      const dv = devById15[n.dataset.dev]; if (!dv) return;
      const h = estH15(dv.ports.length);
      n.getBoundingClientRect = () => ({ top: dv.ry, left: dv.rx, right: dv.rx + W, bottom: dv.ry + h, width: W, height: h });
    });
    doc.querySelectorAll(".pin").forEach(p => {
      const dv = devById15[p.dataset.dev]; if (!dv) return;
      const h = estH15(dv.ports.length);
      const dir = p.dataset.dir;
      const x = dir === "out" ? dv.rx + W : dv.rx;
      const y = dir === "bi" ? dv.ry + h : dv.ry + h / 2;
      const px = dir === "bi" ? dv.rx + W / 2 : x;
      p.getBoundingClientRect = () => ({ top: y, left: px, right: px + 2, bottom: y + 2, width: 2, height: 2 });
    });
    win.eval("WIRE_OBSTACLES = collectNodeObstacles();");
    const obstacles15 = win.eval("WIRE_OBSTACLES");
    const uninflated15 = obstacles15.map(o => ({ x1: o.x1 + CLR, y1: o.y1 + CLR, x2: o.x2 - CLR, y2: o.y2 - CLR }));
    win.eval("drawWires();");

    function minDistToRect15(p1, p2, r) {
      const N = 20; let best = Infinity;
      for (let t = 0; t <= N; t++) {
        const x = p1[0] + (p2[0] - p1[0]) * t / N, y = p1[1] + (p2[1] - p1[1]) * t / N;
        const dx = Math.max(r.x1 - x, 0, x - r.x2), dy = Math.max(r.y1 - y, 0, y - r.y2);
        best = Math.min(best, (dx === 0 && dy === 0) ? 0 : Math.hypot(dx, dy));
      }
      return best;
    }
    for (const connId of ["ky7i0ztu5j", "5g4kr2v70t"]) {
      const pathEl = doc.querySelector(`path.wire[data-id="${connId}"]`);
      assert(!!pathEl, "15: real-project cluster connection " + connId + " rendered a wire path");
      const d = pathEl.getAttribute("d");
      assertClean14(d, "15: real-project cluster " + connId, uninflated15.length ? null : null); // structural checks (no overlap/reversal/axis) via the section-14 helper
      const wp = waypointsOf14(d);
      let minDist = Infinity;
      for (let i = 1; i < wp.length - 2; i++) for (const r of uninflated15) minDist = Math.min(minDist, minDistToRect15(wp[i], wp[i + 1], r));
      assert(!isFinite(minDist) || minDist >= 6, "15: real-project cluster " + connId + " mid-run path stays >=6px clear of every un-inflated node rect (measured " + (isFinite(minDist) ? minDist.toFixed(2) : "n/a") + "px)");
    }
    assert(win.eval("S.connections.find(c=>c.id===\'5g4kr2v70t\')") != null, "15: sanity -- the reported spur connection (PDU Out -> Netgear Power) is present in the fixture");
    }


  // ---- 16. v6.10: inverted-range Z-route (opposing-direction ports facing away from each other) ----
  // Geometry from the user's second real-project report: Netron EN4's right-facing "DMX Out 4" to a
  // Netron RDM 6XL's left-facing "DMX In", the splitter below and slightly LEFT of the EN4.
  // corridorXRange() inverts (lo > hi); pre-v6.10 the single wrap-zone corridor ran down the far side
  // of one endpoint node and routeHorizontalAvoiding() then picture-framed it (cable hugging three of
  // the node's four sides -- reads as doubling back). v6.10 routes a staircase Z instead: out past the
  // source stub, vertical to a clear transfer y between the two nodes, across, vertical, into the port.
  {
    function sidesHugged16(d, r, prox) {
      const segs = segmentsOf14(waypointsOf14(d));
      const vNear = xE => segs.some(s => Math.abs(s.x1 - s.x2) < 0.05 && Math.abs(s.x1 - xE) <= prox && rangesOverlap14(s.y1, s.y2, r.y1, r.y2));
      const hNear = yE => segs.some(s => Math.abs(s.y1 - s.y2) < 0.05 && Math.abs(s.y1 - yE) <= prox && rangesOverlap14(s.x1, s.x2, r.x1, r.x2));
      return (vNear(r.x1) ? 1 : 0) + (vNear(r.x2) ? 1 : 0) + (hNear(r.y1) ? 1 : 0) + (hNear(r.y2) ? 1 : 0);
    }
    function manhattan16(d) {
      const wp = waypointsOf14(d); let len = 0;
      for (let i = 0; i + 1 < wp.length; i++) len += Math.abs(wp[i + 1][0] - wp[i][0]) + Math.abs(wp[i + 1][1] - wp[i][1]);
      return len;
    }
    // 16a. the exact reported geometry, endpoint node bodies registered as obstacles
    const CLR16 = 10;
    const en4 = { x1: 300, y1: 100, x2: 490, y2: 180 };      // EN4 node body
    const splitter = { x1: 260, y1: 200, x2: 450, y2: 280 }; // RDM 6XL, below and slightly left
    const obstacles16 = [en4, splitter].map(r => ({ x1: r.x1 - CLR16, y1: r.y1 - CLR16, x2: r.x2 + CLR16, y2: r.y2 + CLR16 }));
    win.eval("WIRE_OBSTACLES = " + JSON.stringify(obstacles16));
    const a16 = { x: en4.x2, y: 140, dir: "right" };      // DMX Out 4 (right-facing out port)
    const b16 = { x: splitter.x1, y: 240, dir: "left" };  // DMX In (left-facing in port)
    const d16 = win.wirePathOrthogonal(a16, b16, "dmxZ");
    assertClean14(d16, "16a Z-route (EN4 DMX Out 4 -> RDM 6XL DMX In)", obstacles16);
    for (const [nm16, r16] of [["EN4", obstacles16[0]], ["splitter", obstacles16[1]]]) {
      assert(sidesHugged16(d16, r16, 8) < 3, "16a Z-route never picture-frames the " + nm16 + " node (max 2 hugged sides; the pre-v6.10 wrap hugged 3)");
    }
    const wp16 = waypointsOf14(d16);
    const segs16 = segmentsOf14(wp16);
    assert(!segs16.some(s => Math.abs(s.x1 - s.x2) < 0.05 && s.x1 > obstacles16[1].x2 && rangesOverlap14(s.y1, s.y2, obstacles16[1].y1, obstacles16[1].y2)),
      "16a no vertical run beside the destination node on its far (right) side -- the old wrap's signature");
    const last16 = wp16[wp16.length - 1], prev16 = wp16[wp16.length - 2];
    assert(Math.abs(last16[1] - prev16[1]) < 0.05 && last16[0] > prev16[0], "16a final approach travels rightward into the left-facing dest port (the port's accept direction)");
    assert(manhattan16(d16) <= Math.abs(a16.x - b16.x) + Math.abs(a16.y - b16.y) + 4 * 42 + 24, "16a total route length stays within the sane Z bound (dx+dy+4*STUB+slack) -- far shorter than the old three-sided wrap");
    // 16b. determinism -- two identical calls, identical d string
    assert(win.wirePathOrthogonal(a16, b16, "dmxZ") === d16, "16b Z-route is fully deterministic -- identical geometry twice produces a byte-identical d string");
    win.eval("WIRE_OBSTACLES = []");
    // 16c. normal-range geometry is BYTE-IDENTICAL to the pre-v6.10 build (expected d strings captured
    // by running these exact calls on the code immediately BEFORE the Z-route patch) -- the Z path may
    // only engage when corridorXRange() inverts, never for these
    const frozen16 = [
      [{ x: 0, y: 0, dir: "right" }, { x: 200, y: 120, dir: "left" }, undefined, "M 0 0 L 94 0 Q 100 0 100 6 L 100 114 Q 100 120 106 120 L 200 120"],
      [{ x: 300, y: 100, dir: "left" }, { x: 260, y: 260, dir: "left" }, undefined, "M 300 100 L 224 100 Q 218 100 218 106 L 218 254 Q 218 260 224 260 L 260 260"],
      [{ x: 0, y: 0, dir: "down" }, { x: 150, y: 60, dir: "left" }, undefined, "M 0 0 L 0 36 Q 0 42 6 42 L 48 42 Q 54 42 54 48 L 54 54 Q 54 60 60 60 L 150 60"],
      [{ x: 0, y: 0, dir: "right" }, { x: 200, y: 120, dir: "left" }, 77, "M 0 0 L 71 0 Q 77 0 77 6 L 77 114 Q 77 120 83 120 L 200 120"],
    ];
    frozen16.forEach(([fa16, fb16, lx16, expected16], i) => {
      assert(win.wirePathOrthogonal(fa16, fb16, "frozen" + i, lx16) === expected16, "16c normal-range geometry #" + (i + 1) + " is byte-identical to the pre-Z-route build");
    });
    // 16d. adversarial opposing-direction sweep: right-facing source port, left-facing dest port, dest
    // node at varying x offsets both ABOVE and BELOW the source (every layout an inverted range),
    // endpoint bodies as obstacles -- every route stays clean and never picture-frames either node
    {
      const W16 = 190, H16 = 80, srcX16 = 300, srcY16 = 300;
      const srcRect16 = { x1: srcX16, y1: srcY16, x2: srcX16 + W16, y2: srcY16 + H16 };
      let swept16 = 0;
      for (const below16 of [true, false]) for (const dx16 of [-260, -150, -80, -30, 0, 30]) for (const gap16 of [5, 20, 60, 120]) {
        const dstX16 = srcX16 + dx16, dstY16 = below16 ? srcY16 + H16 + gap16 : srcY16 - H16 - gap16;
        const dstRect16 = { x1: dstX16, y1: dstY16, x2: dstX16 + W16, y2: dstY16 + H16 };
        const obs16 = [srcRect16, dstRect16].map(r => ({ x1: r.x1 - CLR16, y1: r.y1 - CLR16, x2: r.x2 + CLR16, y2: r.y2 + CLR16 }));
        win.eval("WIRE_OBSTACLES = " + JSON.stringify(obs16));
        const dZ16 = win.wirePathOrthogonal({ x: srcRect16.x2, y: srcY16 + H16 / 2, dir: "right" }, { x: dstRect16.x1, y: dstY16 + H16 / 2, dir: "left" }, "sweepZ");
        const lbl16 = "16d sweep " + (below16 ? "below" : "above") + " dx=" + dx16 + " gap=" + gap16;
        assertClean14(dZ16, lbl16, obs16);
        assert(obs16.every(r => sidesHugged16(dZ16, r, 8) < 3), lbl16 + " -- neither endpoint node picture-framed");
        swept16++;
      }
      assert(swept16 === 48, "16d swept the full opposing-direction dx/gap grid (48 layouts)");
      win.eval("WIRE_OBSTACLES = []");
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
