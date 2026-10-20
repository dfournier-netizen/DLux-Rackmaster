// v6.11.3 -- routingSVG() (the Rack Guide's static Signal-flow diagram) rework: (A) mirrors the
// canvas's devVisibleInCanvas() rule so portless devices (drawers/blank panels) and hideInRouting:true
// devices no longer clutter the print export, with connections to hidden endpoints skipped cleanly;
// (B) cables reuse the canvas's own orthogonal router (wirePath + assignWireLanes + this diagram's own
// WIRE_OBSTACLES rects) instead of the old hardcoded Bezier; (C) the viewBox/max-width fit the visible
// devices' bounding box (60px margin) instead of anchoring at 0,0.
const fs = require("fs");
const { JSDOM } = require("jsdom");
const path = require("path");
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, "build.html"), "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

// -- path helpers (simplified from test_orthogonal_wires.js section 14) --
function parseCmds(d) {
  const re = /([MLQC])([^MLQC]*)/g; let m; const out = [];
  while ((m = re.exec(d))) {
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    out.push({ cmd: m[1], pts });
  }
  return out;
}
function waypointsOf(d) { // original pre-rounding corners: M start, each Q's first (true-corner) point, final L endpoint
  const cmds = parseCmds(d); const wp = [];
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
function corridorXOf(wp) { // x of the longest vertical run (the mid-run corridor)
  let best = null, bestLen = 0;
  for (let i = 0; i + 1 < wp.length; i++) {
    const dx = Math.abs(wp[i][0] - wp[i + 1][0]), dy = Math.abs(wp[i][1] - wp[i + 1][1]);
    if (dx < 0.05 && dy > bestLen) { bestLen = dy; best = wp[i][0]; }
  }
  return best;
}
function wirePathsOf(svg) { // the connection paths (stroke-width 2.2, v6.11.6), in document order, with their stroke color
  const out = [];
  const re = /<path d="([^"]+)" fill="none" stroke="([^"]+)" stroke-width="2.2"[^>]*\/>/g;
  let m; while ((m = re.exec(svg))) out.push({ d: m[1], stroke: m[2] });
  return out;
}

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await new Promise(r => setTimeout(r, 150));
  const S = win.eval("S");

  const mkDev = (id, name, pos, rx, ry, ports, hideInRouting) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos, color: "#333333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx, ry, hideInRouting: hideInRouting === undefined ? null : hideInRouting, pushProtect: false, draw: null, circuit: null, ports });
  const outPorts = n => [{ id: "go", name: "Out", type: "XLR3", dir: "out", count: n, face: "front", jacks: [] }];
  const inPorts = n => [{ id: "gi", name: "In", type: "XLR3", dir: "in", count: n, face: "front", jacks: [] }];

  // fixture deliberately far from the origin (rx/ry ~ 1500/900) to prove the viewBox anchors to content
  const dA = mkDev("dA", "Console", 1, 1500, 900, outPorts(2));               // 2 out pins, right edge x = 1700
  const dB = mkDev("dB", "Amp", 3, 1900, 1050, inPorts(2));                    // 2 in pins, left edge x = 1900
  const dDrawer = mkDev("dDrawer", "Drawer", 5, 1500, 700, []);                // portless, auto-hidden (v6.4 rule)
  const dBlank = mkDev("dBlank", "Blank Panel", 6, 2000, 700, [], false);      // portless but hideInRouting:false -> forced visible
  const dHidden = mkDev("dHidden", "Patch Panel", 7, 1500, 1200, inPorts(1), true); // has ports but hideInRouting:true -> forced hidden
  S.racks = [{ id: "r1", name: "Rack One", sizeU: 20, depth: 20, color: "#123", notes: "", circuits: [],
    devices: [dA, dB, dDrawer, dBlank, dHidden] }];
  S.edges = [];
  S.connections = [
    { id: "c1", a: { dev: "dA", g: "go", i: 0 }, b: { dev: "dB", g: "gi", i: 0 }, label: "Feed 1", color: "#111111", type: "XLR3", len: 10, notes: "", adapter: "" },
    { id: "c2", a: { dev: "dA", g: "go", i: 1 }, b: { dev: "dB", g: "gi", i: 1 }, label: "", color: "#222222", type: "XLR3", len: 10, notes: "", adapter: "" },
    { id: "c3", a: { dev: "dA", g: "go", i: 0 }, b: { dev: "dHidden", g: "gi", i: 0 }, label: "Ghost", color: "#333399", type: "XLR3", len: 10, notes: "", adapter: "" },
  ];

  // ---- WIRE_OBSTACLES must be restored after the call (sentinel before, unchanged after) ----
  win.eval(`WIRE_OBSTACLES = [{ id: "sentinel", x1: 1, y1: 2, x2: 3, y2: 4 }];`);
  let threw = false, svg = "";
  try { svg = win.eval("routingSVG()"); } catch (e) { threw = true; console.log("routingSVG threw:", e.message); }
  assert(!threw, "1: routingSVG() does not throw with hidden devices and a connection to a hidden endpoint");
  assert(win.eval(`WIRE_OBSTACLES.length === 1 && WIRE_OBSTACLES[0].id === "sentinel" && WIRE_OBSTACLES[0].x2 === 3`),
    "2: module-level WIRE_OBSTACLES is restored (sentinel intact) after routingSVG() returns");

  // ---- Fix A: visibility filter ----
  assert(svg.includes(">Console<") && svg.includes(">Amp<"), "3: ported devices render in the diagram");
  assert(!svg.includes("Drawer"), "4: portless device (Drawer) is auto-hidden from the diagram");
  assert(svg.includes(">Blank Panel<"), "5: portless device with hideInRouting:false is force-included");
  assert(!svg.includes("Patch Panel"), "6: ported device with hideInRouting:true is force-excluded");
  const wires = wirePathsOf(svg);
  assert(wires.length === 2, `7: exactly the 2 resolvable connections render wire paths (c3 to the hidden device is skipped; got ${wires.length})`);
  assert(!svg.includes(">Ghost<"), "8: the skipped connection's label does not render either");

  // ---- Fix C: viewBox fits the visible devices ----
  // visible bounds: minX=1500 (Console), minY=700 (Blank Panel), maxX=2000+200=2200 (Blank Panel), maxY=1050+64=1114 (v6.11.6: headH 24 + 2*rowH 17 + 6 = 64)
  const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1];
  assert(!!vb, "9: svg has a viewBox");
  const [vx, vy, vw, vh] = (vb || "").split(/\s+/).map(Number);
  assert(vx === 1440 && vy === 640, `10: viewBox anchors near the content (60px margin: expected 1440 640, got ${vx} ${vy})`);
  assert(vw === 820 && vh === 534, `11: viewBox spans the content bounds + 120px (expected 820x534, got ${vw}x${vh})`);
  assert(svg.includes(`max-width:${vw}px`), "12: max-width style matches the fitted span, not the absolute extent");

  // ---- Fix B: orthogonal wires via the canvas router ----
  for (const [i, wp] of wires.map(w => waypointsOf(w.d)).entries()) {
    assert(wp.length >= 2, `13: wire ${i} parses into waypoints`);
    assert(isAxisAligned(wp), `14: wire ${i} is axis-aligned (orthogonal, no diagonals)`);
  }
  assert(wires.every(w => !/ C /.test(w.d)), "15: no cubic Bezier (' C ') commands remain in any wire path");
  // expected pin coords (v6.11.6 metrics rowH=17/headH=24): out pins on Console's right edge x=1700, y=900+24+i*17+10.5; in pins on Amp's left edge x=1900, y=1050+24+i*17+10.5
  const byStroke = Object.fromEntries(wires.map(w => [w.stroke, waypointsOf(w.d)]));
  const near = (p, x, y) => p && Math.abs(p[0] - x) < 0.05 && Math.abs(p[1] - y) < 0.05;
  const wp1 = byStroke["#111111"], wp2 = byStroke["#222222"];
  assert(near(wp1 && wp1[0], 1700, 934.5), `16: c1 starts at its out pin (Console right edge 1700,934.5; got ${wp1 && wp1[0]})`);
  assert(near(wp1 && wp1[wp1.length - 1], 1900, 1084.5), `17: c1 ends at its in pin (Amp left edge 1900,1084.5; got ${wp1 && wp1[wp1.length - 1]})`);
  assert(near(wp2 && wp2[0], 1700, 951.5), `18: c2 starts at its out pin (1700,951.5; got ${wp2 && wp2[0]})`);
  assert(near(wp2 && wp2[wp2.length - 1], 1900, 1101.5), `19: c2 ends at its in pin (1900,1101.5; got ${wp2 && wp2[wp2.length - 1]})`);

  // ---- lanes: two parallel same-corridor connections get distinct corridor x's ----
  const cx1 = corridorXOf(wp1 || []), cx2 = corridorXOf(wp2 || []);
  assert(cx1 != null && cx2 != null, "20: both parallel connections route through a mid-run vertical corridor");
  assert(cx1 != null && cx2 != null && Math.abs(cx1 - cx2) >= 10, `21: parallel connections get distinct lane x's (got ${cx1} vs ${cx2})`);

  // ---- labels ----
  assert(svg.includes(">Feed 1<"), "22: connection label renders");
  const lblX = Number((svg.match(/<text x="([-\d.]+)"[^>]*>Feed 1</) || [])[1]);
  assert(isFinite(lblX) && Math.abs(lblX - cx1) < 0.05, `23: corridor connection's label sits at its corridor/lane x (got ${lblX}, corridor ${cx1})`);

  // ---- determinism ----
  assert(win.eval("routingSVG()") === svg, "24: two routingSVG() calls produce byte-identical output");

  // ---- empty-after-filter keeps the placeholder early return ----
  const savedRacks = S.racks;
  S.racks = [{ id: "r2", name: "Rack Two", sizeU: 10, depth: 20, color: "#123", notes: "", circuits: [], devices: [mkDev("dOnly", "Drawer 2", 1, 100, 100, [])] }];
  assert(win.eval("routingSVG()") === "<p>No devices placed yet.</p>", "25: all-devices-filtered-out yields the 'No devices placed yet.' placeholder, not an empty SVG");
  S.racks = savedRacks;

  // ---- v6.11.4: single-rack scope ----
  // two racks, one device each, plus a cross-rack connection; scoped diagram shows only its rack
  const dScA = mkDev("scA", "Scoped A", 1, 60, 60, [{ id: "g1", name: "Out", type: "XLR3", dir: "out", count: 1 }]);
  const dScB = mkDev("scB", "Scoped B", 1, 460, 60, [{ id: "g1", name: "In", type: "XLR3", dir: "in", count: 1 }]);
  S.racks = [
    { id: "sr1", name: "Scope Rack One", sizeU: 10, depth: 20, color: "#123", notes: "", circuits: [], devices: [dScA] },
    { id: "sr2", name: "Scope Rack Two", sizeU: 10, depth: 20, color: "#123", notes: "", circuits: [], devices: [dScB] },
  ];
  S.connections = [{ id: "scc1", a: { dev: "scA", g: "g1", i: 0 }, b: { dev: "scB", g: "g1", i: 0 },
    label: "XRack", color: "#c33", type: "XLR3", len: 24, notes: "", adapter: "" }];
  const scoped = win.eval("routingSVG('sr1')");
  assert(scoped.includes("Scoped A") && !scoped.includes("Scoped B"), "27: routingSVG(scopeRackId) renders only that rack's devices");
  assert(!scoped.includes(">XRack<"), "28: a connection leaving the scoped rack is skipped (no dangling wire/label)");
  const both = win.eval("routingSVG()");
  assert(both.includes("Scoped A") && both.includes("Scoped B") && both.includes(">XRack<"), "29: unscoped call still renders everything incl. the cross-rack run");
  // single-rack Rack Guide now carries the scoped diagram, gated by the `signal` toggle
  S.ui.reportSections = Object.assign(win.eval("reportSectionDefaults()"), { signal: true });
  let doc1 = win.eval("reportHTML('sr1')");
  assert(/\d+\. Signal flow — Scope Rack One/.test(doc1), "30: single-rack Rack Guide includes a numbered scoped signal-flow section (number is dynamic since v6.11.5)");
  const sigPart = doc1.slice(doc1.indexOf("Signal flow — Scope Rack One")); // slice from the scoped heading so the elevation SVGs earlier in the doc don't confuse the check
  const svgPart = sigPart.slice(sigPart.indexOf("<svg"), sigPart.indexOf("</svg>")); // Scoped B legitimately appears in the cabling checklist (cross-rack run's far end) -- only the DIAGRAM must exclude it
  assert(svgPart.includes("Scoped A") && !svgPart.includes("Scoped B"), "31: the single-rack guide's diagram shows only that rack's devices");
  S.ui.reportSections.signal = false;
  doc1 = win.eval("reportHTML('sr1')");
  assert(!doc1.includes("Signal flow — Scope Rack One"), "32: the `signal` toggle removes the scoped diagram from the single-rack guide");
  // v6.11.5: explicit numbering case -- with every system-level block off, the rack build is "1." and
  // the scoped signal flow renumbers to "2." right behind it
  S.ui.reportSections = Object.assign(win.eval("reportSectionDefaults()"), { overview: false, trunks: false, network: false, edges: false });
  doc1 = win.eval("reportHTML('sr1')");
  assert(doc1.includes("1. Rack build — Scope Rack One") && doc1.includes("2. Signal flow — Scope Rack One"), "33: system blocks off -> rack build is 1, scoped signal flow is 2");
  S.ui.reportSections = win.eval("reportSectionDefaults()");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
