// v6.11.8 / v6.12.2 -- per-bus same-colour SHADE VARIATION for cable wires (RENDER-ONLY).
//
// Complaint the feature answers: even after the x-lane pass (assignWireLanes) spreads a bunch of
// same-colour cables into distinct vertical corridors, they still all draw in the identical hex and
// stay hard to tell apart. Fix: give each same-colour cable IN THE SAME BUS a small, deterministic
// LIGHTNESS step so each strand reads individually while still obviously the same colour/category.
// "Bus" == the x-corridor lane group (assignWireLanes' wireCorridorKey(prefX) bucket); within a bus we
// subdivide by the TRUE base c.color and only vary a colour-subgroup of size >= 2. A cable alone in its
// bus -- or the lone cable of its colour in its bus -- keeps EXACTLY its base c.color (byte-identical
// stroke to the pre-feature build). The middle cable of an odd same-colour subgroup keeps the base
// colour verbatim (frac 0). It is RENDER-ONLY: the pass returns a stroke hex map only; c.color and all
// state are NEVER mutated (Export JSON / CSV / legend / inspector still show the true colour). It is
// deterministic: the L step is a pure function of a cable's index within its colour-subgroup (sorted by
// the SAME destY,srcY,id key assignWireLanes uses) and the subgroup size -- never iteration/draw order.
// drawWires() (canvas) and routingSVG() (export) share the same assignWireShades().
//
// This file boots the BUILD UNDER TEST (process.argv[2], defaulting to the newest "DLux Rackmaster
// *.html" in the parent dir -- suite convention) AND the pre-feature reference base_A.html (../base_A.html,
// byte-identical to work.html except this shade feature) so byte-identity can be diffed directly.
// Feature-specific assertions run against the build under test and are expected to FAIL when it is
// pointed at base_A.html; the byte-identity / determinism assertions stay green on both.
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
const BASE = path.join(__dirname, "..", "base_A.html");         // pre-feature reference for byte-identity diffs
const buildHtml = fs.readFileSync(BUILD, "utf-8");
const baseHtml = fs.readFileSync(BASE, "utf-8");
const project = JSON.parse(fs.readFileSync(path.join(__dirname, "LX Network racks.dlux.json"), "utf-8"));

const WIRE_SHADE_MAX_L = 0.06; // max lightness deviation from the group centre (0..1 L units) -- module const in the feature build
const TEAL = "#3fa46c";        // the Unifi Flex -> Custom Patch Panel bus colour in the real project
const HS_EPS = 0.02;           // hue/sat drift budget (8-bit round-trip through HSL loses ~0.005)
const L_EPS = 0.012;           // lightness drift budget for the same 8-bit hex quantization (targets set in HSL, then rounded to #rrggbb)

let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

// ---- local (app-independent) hex<->HSL so hue/sat/lightness claims are checked against our own math ----
function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
const hslOf = hex => rgbToHsl(...hexToRgb(hex));
const hueClose = (a, b) => { let d = Math.abs(hslOf(a)[0] - hslOf(b)[0]); d = Math.min(d, 1 - d); return d < HS_EPS; };
const satClose = (a, b) => Math.abs(hslOf(a)[1] - hslOf(b)[1]) < HS_EPS;
const isHex6 = s => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);

// ---- boot / geometry-mock helpers (cribbed from test_ylane_separation.js + validate_real_project.js) ----
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
  if (inner) inner.getBoundingClientRect = () => ({ top: 0, left: 0, right: 8000, bottom: 8000, width: 8000, height: 8000 });
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
// every connection is on screen, then mock geometry + drawWires().
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
// seed an arbitrary S, render(), mock geometry, drawWires(), return [{id,d,stroke}] for every wire path
function renderWires(win, doc, devById) {
  win.eval("render()");
  mockRoutingGeom(doc, devById);
  win.eval("drawWires()");
  return [...doc.querySelectorAll("path.wire")].map(p => ({ id: p.dataset.id, d: p.getAttribute("d"), stroke: p.getAttribute("stroke") }));
}
const strokeMapOf = doc => { const m = {}; doc.querySelectorAll("path.wire").forEach(p => m[p.dataset.id] = p.getAttribute("stroke")); return m; };

// a corridor-sharing bunch of same-coloured (or same-distinct) cables -- one source fanning to N dests,
// all in the one rack so they bucket into a single vertical corridor (needsCorridor === true).
function seedFan(win, colors) { // colors: array of hex, one per dest cable
  const S = win.eval("S");
  const src = mkDev("s1", "Switch", [{ id: "g1", name: "OUT", type: "RJ45", dir: "out", count: colors.length, face: "front", jacks: [] }], 100, 100);
  const dsts = colors.map((_, i) => mkDev("d" + i, "Node" + i, [{ id: "g1", name: "IN", type: "RJ45", dir: "in", count: 1, face: "front", jacks: [] }], 560, 60 + i * 110));
  S.racks = [{ id: "r1", name: "R", sizeU: 60, depth: 20, color: "#123", notes: "", circuits: [], devices: [src, ...dsts] }];
  S.edges = [];
  S.connections = colors.map((col, i) => ({ id: "f" + i, a: { dev: "s1", g: "g1", i }, b: { dev: "d" + i, g: "g1", i: 0 }, label: "", color: col, type: "RJ45", len: 24, notes: "", adapter: "" }));
  S.ui.view = "routing"; S.ui.routingRackOnly = "r1"; S.ui.wireStyle = "orthogonal";
  const devById = { s1: src }; dsts.forEach(d => devById[d.id] = d); return devById;
}

// synthetic entries in the exact shape drawWires()/routingSVG() feed assignWireShades()
const mkEntry = (id, prefX, destY, needsCorridor = true, srcY = 10) => ({ id, prefX, srcY, destY, needsCorridor });
// call the app's assignWireShades and resolve the EFFECTIVE stroke for each id (absent => true base colour)
function shadesFor(win, entries, colorById) {
  const cmap = new Map(Object.entries(colorById));
  const m = win.assignWireShades(entries, cmap);
  const out = {};
  for (const e of entries) out[e.id] = (m && m.get(e.id)) || colorById[e.id];
  return { effective: out, varied: m };
}

(async () => {
  const { win, doc } = await boot(buildHtml);        // build under test (feature)
  const B = await boot(baseHtml);                     // pre-feature reference (base_A.html)
  const bwin = B.win, bdoc = B.doc;
  const hasFeature = win.eval("typeof assignWireShades === 'function' && typeof shadeHexLightness === 'function'");

  // =====================================================================================
  // 1. FEATURE PRESENT (probed, not thrown -- so this file fails LOUDLY on base_A instead of crashing).
  // =====================================================================================
  assert(hasFeature, "feature present: assignWireShades() and shadeHexLightness() are both defined functions in the app scope");
  const L_MIN = hasFeature ? win.eval("WIRE_SHADE_L_MIN") : 0.12;
  const L_MAX = hasFeature ? win.eval("WIRE_SHADE_L_MAX") : 0.88;

  // =====================================================================================
  // 2. UNIT -- shadeHexLightness(hex, dl): hue+sat preserved, L nudged & clamped, no-op guards.
  // =====================================================================================
  {
    const sh = (h, dl) => hasFeature ? win.shadeHexLightness(h, dl) : h;
    assert(hasFeature && sh(TEAL, 0) === TEAL, "shadeHexLightness: dl=0 returns the input hex byte-identical (no-op guard for byte-identity)");
    const lighter = sh(TEAL, +0.05), darker = sh(TEAL, -0.05);
    assert(hasFeature && hslOf(lighter)[2] > hslOf(TEAL)[2] + 1e-6, `shadeHexLightness: +dl lightens (L ${hslOf(TEAL)[2].toFixed(3)} -> ${hslOf(lighter)[2].toFixed(3)}, ${lighter})`);
    assert(hasFeature && hslOf(darker)[2] < hslOf(TEAL)[2] - 1e-6, `shadeHexLightness: -dl darkens (L ${hslOf(TEAL)[2].toFixed(3)} -> ${hslOf(darker)[2].toFixed(3)}, ${darker})`);
    assert(hasFeature && hueClose(lighter, TEAL) && hueClose(darker, TEAL), "shadeHexLightness: hue is preserved through both a lighten and a darken (H within epsilon)");
    assert(hasFeature && satClose(lighter, TEAL) && satClose(darker, TEAL), "shadeHexLightness: saturation is preserved through both a lighten and a darken (S within epsilon)");
    const wayUp = sh(TEAL, +1), wayDown = sh(TEAL, -1);
    assert(hasFeature && hslOf(wayUp)[2] <= L_MAX + L_EPS, `shadeHexLightness: an extreme +dl clamps L to <= WIRE_SHADE_L_MAX (${L_MAX}) -- got L=${hslOf(wayUp)[2].toFixed(3)}`);
    assert(hasFeature && hslOf(wayDown)[2] >= L_MIN - L_EPS, `shadeHexLightness: an extreme -dl clamps L to >= WIRE_SHADE_L_MIN (${L_MIN}) -- got L=${hslOf(wayDown)[2].toFixed(3)}`);
    assert(hasFeature && sh("rgb(1,2,3)", 0.05) === "rgb(1,2,3)", "shadeHexLightness: a non-#rrggbb input (rgb()) is returned unchanged");
    assert(hasFeature && sh("#abc", 0.05) === "#abc", "shadeHexLightness: a 3-digit shorthand (#abc) is not #rrggbb -> returned unchanged");
  }

  // =====================================================================================
  // 3. UNIT -- assignWireShades(entries, colorById): grouping by bus x colour, symmetric even spread,
  //    middle==base, all-distinct bus untouched, lone cable untouched, order-independence.
  // =====================================================================================
  if (hasFeature) {
    // (a) one bus (identical prefX), three SAME-colour cables -> three distinct near-base hexes.
    const same = [mkEntry("s_lo", 200, 100), mkEntry("s_mid", 200, 200), mkEntry("s_hi", 200, 300)];
    const sameCols = { s_lo: TEAL, s_mid: TEAL, s_hi: TEAL };
    const r = shadesFor(win, same, sameCols);
    const eff = r.effective;
    const distinct = new Set([eff.s_lo, eff.s_mid, eff.s_hi]);
    assert(distinct.size === 3, `assignWireShades: a bus of 3 same-colour cables yields 3 DISTINCT effective hexes (${eff.s_lo}, ${eff.s_mid}, ${eff.s_hi})`);
    assert([eff.s_lo, eff.s_mid, eff.s_hi].every(h => isHex6(h) && hueClose(h, TEAL) && satClose(h, TEAL)), "assignWireShades: all three shades preserve the base hue & saturation (still clearly the same colour)");
    assert(eff.s_mid === TEAL, "assignWireShades: the MIDDLE cable of the odd same-colour group returns the true colour verbatim (frac 0 -> base, byte-identity)");
    const Ls = [eff.s_lo, eff.s_mid, eff.s_hi].map(h => hslOf(h)[2]);
    assert(Ls.every(l => Math.abs(l - hslOf(TEAL)[2]) <= WIRE_SHADE_MAX_L + L_EPS), `assignWireShades: every shade's L stays within +/-WIRE_SHADE_MAX_L (${WIRE_SHADE_MAX_L}) of base`);
    const dLo = hslOf(TEAL)[2] - Math.min(...Ls), dHi = Math.max(...Ls) - hslOf(TEAL)[2];
    assert(Math.abs(dLo - dHi) < L_EPS, `assignWireShades: the spread is symmetric -- lightest & darkest are equidistant in L from base (dark ${dLo.toFixed(4)} vs light ${dHi.toFixed(4)})`);
    const sortedL = [...Ls].sort((a, b) => a - b);
    assert(Math.abs((sortedL[1] - sortedL[0]) - (sortedL[2] - sortedL[1])) < L_EPS, "assignWireShades: the three lightness steps are evenly spaced (equal gaps in L)");

    // (b) one bus, three cables of ALL-DIFFERENT colours -> none varied (each renders its own base).
    const diffCols = { d0: "#3d6bfa", d1: "#e05252", d2: "#e3c22e" };
    const diff = [mkEntry("d0", 200, 100), mkEntry("d1", 200, 200), mkEntry("d2", 200, 300)];
    const rd = shadesFor(win, diff, diffCols);
    assert(["d0", "d1", "d2"].every(id => rd.effective[id] === diffCols[id]) && rd.varied.size === 0, "assignWireShades: a bus whose cables are all DIFFERENT colours varies none of them (every cable renders its own base colour exactly)");

    // (c) a lone cable in its bus -> exact base colour.
    const lone = [mkEntry("only", 400, 100)];
    const rl = shadesFor(win, lone, { only: TEAL });
    assert(rl.effective.only === TEAL && rl.varied.size === 0, "assignWireShades: a lone cable (size-1 bus) keeps EXACTLY its base colour");

    // (d) the lone cable of its colour within a mixed bus -> exact base colour.
    const mixedCols = { m0: TEAL, m1: TEAL, m2: "#e05252" };
    const mixed = [mkEntry("m0", 600, 100), mkEntry("m1", 600, 200), mkEntry("m2", 600, 300)];
    const rm = shadesFor(win, mixed, mixedCols);
    assert(rm.effective.m2 === "#e05252", "assignWireShades: the lone cable of its colour inside a mixed bus keeps EXACTLY its base colour (only the >=2 same-colour subgroup varies)");
    assert(rm.effective.m0 !== TEAL && rm.effective.m1 !== TEAL, "assignWireShades: the two same-colour cables in that mixed bus ARE both varied off base");

    // (e) determinism / order-independence: shuffling the entries yields an identical id->hex map.
    const shuffled = [same[2], same[0], same[1]];
    const rs = shadesFor(win, shuffled, sameCols);
    assert(["s_lo", "s_mid", "s_hi"].every(id => rs.effective[id] === eff[id]), "assignWireShades: shuffling the entries array yields an IDENTICAL id->hex map (order-independent, keyed off destY,srcY,id)");
  } else {
    // record the missing-feature fails explicitly so the count is stable across builds
    for (let i = 0; i < 11; i++) assert(false, "assignWireShades unit assertion #" + (i + 1) + " (feature absent on this build)");
  }

  // =====================================================================================
  // 4. REAL PROJECT -- the teal (#3fa46c) Unifi Flex -> Custom Patch Panel bus now emits distinct
  //    near-shades; each shade keeps the teal hue/sat and steps L within the spread.
  // =====================================================================================
  const trio = ["k212tlghb1", "k26fpdejd4", "k2c954xxh2"]; // the three Unifi Flex -> Custom Patch Panel teal cables
  {
    hydrateReal(win, doc);
    const sm = strokeMapOf(doc);
    const hexes = trio.map(id => sm[id]);
    assert(hexes.every(isHex6), `real project: all three teal trio cables render a valid hex stroke (${hexes.join(", ")})`);
    const distinct = new Set(hexes.map(h => (h || "").toLowerCase()));
    assert(distinct.size >= 2, `real project: the teal bus now emits >= 2 DISTINCT stroke hexes -- measured ${distinct.size} (${hexes.join(", ")})`);
    assert(hexes.every(h => hueClose(h, TEAL)), `real project: every teal stroke keeps the base hue within epsilon (${hexes.join(", ")})`);
    assert(hexes.every(h => satClose(h, TEAL)), "real project: every teal stroke keeps the base saturation within epsilon");
    assert(hexes.every(h => Math.abs(hslOf(h)[2] - hslOf(TEAL)[2]) <= WIRE_SHADE_MAX_L + L_EPS), "real project: every teal stroke's L stays within +/-WIRE_SHADE_MAX_L of base (subtle, category still reads)");
    assert(sm["k26fpdejd4"] === TEAL, `real project: the middle teal cable (k26fpdejd4) renders EXACTLY the base ${TEAL} (odd-group centre keeps base)`);
    console.log("  measured teal trio strokes:", trio.map((id, i) => `${id}=${hexes[i]}`).join("  "));
  }

  // =====================================================================================
  // 5. BYTE-IDENTITY vs base_A -- (a) an all-distinct-colour bus renders strokes identical to base,
  //    and (b) a real-project cable alone-in-its-colour-in-its-bus renders its exact base colour.
  // =====================================================================================
  {
    const cols = ["#3d6bfa", "#e05252", "#e3c22e", "#7a7a7a", "#3fa46c"]; // all distinct -> nothing varies
    const wk = renderWires(win, doc, seedFan(win, cols));
    const bs = renderWires(bwin, bdoc, seedFan(bwin, cols));
    assert(wk.length === cols.length && bs.length === cols.length, "byte-identity: the all-distinct-colour fan renders every cable on both builds");
    assert(wk.every((p, i) => p.id === bs[i].id && p.stroke === bs[i].stroke), "byte-identity: an all-distinct-colour bus emits strokes byte-identical to base_A (no same-colour subgroup -> zero variation)");
    assert(wk.every(p => cols.includes((p.stroke || "").toLowerCase())), "byte-identity: each all-distinct cable's stroke is exactly its own base colour (not a shade)");
  }
  {
    hydrateReal(win, doc);
    const sm = strokeMapOf(doc);
    // jbm0fdqlce is teal but on a DIFFERENT bus than the Unifi->Patch trio -> lone teal in its bus -> base.
    assert(sm["jbm0fdqlce"] === TEAL, `byte-identity (real): a cable alone-in-its-colour-in-its-bus (jbm0fdqlce, teal) renders its EXACT base ${TEAL}`);
  }

  // =====================================================================================
  // 6. NO STATE MUTATION -- the shade pass is render-only; c.color must survive render() AND routingSVG().
  // =====================================================================================
  {
    const S = hydrateReal(win, doc);
    const snap = {}; S.connections.forEach(c => snap[c.id] = c.color); // colours BEFORE any further render
    win.eval("render(); drawWires();");
    const afterRender = {}; S.connections.forEach(c => afterRender[c.id] = c.color);
    const tealStill = trio.every(id => S.connections.find(c => c.id === id).color === TEAL);
    assert(tealStill, `no mutation: after render()/drawWires() the teal connections' .color is still exactly ${TEAL} in S.connections`);
    win.eval("routingSVG();");
    const afterExport = {}; S.connections.forEach(c => afterExport[c.id] = c.color);
    assert(trio.every(id => S.connections.find(c => c.id === id).color === TEAL), `no mutation: after routingSVG() the teal connections' .color is STILL exactly ${TEAL}`);
    assert(Object.keys(snap).every(id => afterRender[id] === snap[id] && afterExport[id] === snap[id]), "no mutation: the entire S.connections colour set is byte-unchanged vs the pre-render snapshot (render-only)");
  }

  // =====================================================================================
  // 7. DETERMINISM AT RENDER LEVEL -- redraw is stable; reordering S.connections leaves per-id strokes.
  // =====================================================================================
  {
    hydrateReal(win, doc);
    win.eval("drawWires();"); const a = strokeMapOf(doc);
    win.eval("drawWires();"); const b = strokeMapOf(doc);
    assert(Object.keys(a).length > 0 && Object.keys(a).every(id => a[id] === b[id]), "determinism: two back-to-back drawWires() on an unchanged topology produce byte-identical strokes");
    win.eval("S.connections.reverse(); drawWires();"); const c = strokeMapOf(doc);
    assert(Object.keys(a).every(id => c[id] === a[id]), "determinism: reversing S.connections leaves every per-connection-id stroke unchanged (order-independent shade assignment)");
    win.eval("S.connections.reverse();"); // restore
  }

  // =====================================================================================
  // 8. EXPORT PARITY -- routingSVG() shares assignWireShades(). The export's analytic layout may bucket
  //    DIFFERENTLY from the canvas, so we do NOT assert the teal trio is varied there. Instead: (a) the
  //    same assignWireShades() the export calls varies a synthetic same-colour bus, and (b) SOME
  //    same-colour bus in the real export actually emits >= 2 distinct near-shades.
  // =====================================================================================
  if (hasFeature) {
    // (a) direct -- the exact function routingSVG() invokes varies a same-colour export bus.
    const ex = [mkEntry("x0", 300, 120), mkEntry("x1", 300, 240), mkEntry("x2", 300, 360), mkEntry("x3", 300, 480)];
    const exCols = { x0: "#e05252", x1: "#e05252", x2: "#e05252", x3: "#e05252" };
    const rex = shadesFor(win, ex, exCols);
    const exDistinct = new Set(Object.values(rex.effective).map(h => h.toLowerCase()));
    assert(exDistinct.size >= 2 && [...exDistinct].every(h => hueClose(h, "#e05252") && satClose(h, "#e05252")), `export parity: assignWireShades() (shared by routingSVG) varies a synthetic same-colour export bus into >= 2 distinct near-shades (${[...exDistinct].join(", ")})`);
  } else {
    assert(false, "export parity: assignWireShades varies a synthetic same-colour export bus (feature absent)");
  }
  {
    // (b) scan the real export SVG's cable strokes (the exact "<path ... fill=none stroke=# stroke-width=2.2>"
    //     signature) for a same-colour family with >= 2 distinct rendered hexes. Robust to layout divergence:
    //     asserts SOME bus varies, never that the teal trio specifically does.
    win.__proj2 = JSON.parse(JSON.stringify(project));
    win.eval("S = __proj2; migrate(); ensureRoutingLayout();");
    const svg = win.eval("typeof routingSVG === 'function' ? routingSVG() : ''");
    const cableStrokes = [...svg.matchAll(/fill="none" stroke="(#[0-9a-fA-F]{6})" stroke-width="2\.2"/g)].map(m => m[1].toLowerCase());
    const baseCols = [...new Set(win.eval("S").connections.map(c => (c.color || "").toLowerCase()))].filter(isHex6);
    const distinctStrokes = [...new Set(cableStrokes)];
    // group each distinct rendered stroke under the base colour it is a near-shade of (hue+sat match)
    const families = {};
    for (const s of distinctStrokes) {
      const owner = baseCols.find(bc => hueClose(s, bc) && satClose(s, bc));
      if (owner) (families[owner] = families[owner] || new Set()).add(s);
    }
    const variedFamily = Object.entries(families).find(([, set]) => set.size >= 2);
    assert(hasFeature && !!variedFamily, `export parity: some same-colour bus in the real routingSVG() emits >= 2 distinct near-shades${variedFamily ? ` (base ${variedFamily[0]} -> ${[...variedFamily[1]].join(", ")})` : ""}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
