// v6.10 — clarity pass + evergreen theme. Covers: WIRE_LANE_GAP bump, curved-mode bus lanes,
// thicker wire/casing strokes, hover fade-others CSS, always-visible toggleable cable labels
// (S.ui.wireLabels + #btnWireLabels), cable-label markup (v6.11.7: moved out of .wire-grp into the
// shared #wireLabelLayer), port/node readability CSS,
// the third "evergreen" theme (CSS block, migrate heal, 3-way cycle button).
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
  const q = sel => doc.querySelector(sel);

  // ---- 1. stylesheet: evergreen theme block + clarity CSS ----
  assert(html.includes('[data-theme="evergreen"]'), "stylesheet defines the evergreen theme block");
  const evg = html.match(/\[data-theme="evergreen"\]\{[^}]*\}/s);
  assert(!!evg && evg[0].includes("--wire-casing"), "evergreen theme defines --wire-casing");
  assert(!!evg && evg[0].includes("--accent:#69b578"), "evergreen primary accent is the OD/evergreen green");
  assert(!!evg && evg[0].includes("--bg:#0c120e") && evg[0].includes("--panel:#15211a"), "evergreen surfaces are deep green-tinted darks");
  assert(!html.includes("wire-grp:hover) .wire-grp:not"), "v6.11.2: the hover-fade-others :has rule is GONE (user: hovering one cable must not grey out the rest)");
  assert(html.includes("#wires .wire-grp:hover path.wire-casing{opacity:1}") && html.includes("#wires .wire-grp:hover path.wire{opacity:1;stroke-width:4.5}"),
    "the hovered cable's OWN emphasis (casing + stroke-width bump) is kept");
  assert(html.includes(".pin-row{display:flex;align-items:center;gap:5px;padding:3px 0;font-size:12px"), "pin rows grew to 12px type with more breathing room");
  assert(html.includes(".pin{width:13px;height:13px"), "pins grew to 13px");
  assert(/\.node\{[^}]*border:1\.5px solid/.test(html), "node border strengthened to 1.5px");
  assert(/\.node-head\{[^}]*font-size:13\.5px/.test(html), "node header type grew to 13.5px");
  assert(/\.wire-label\{[^}]*font-size:11px/.test(html) && /\.wire-label\{[^}]*font-weight:600/.test(html), "wire labels grew to 11px semi-bold");

  // ---- 2. migrate(): wireLabels default + theme heal ----
  assert(S.ui.wireLabels === true, "migrate() defaults S.ui.wireLabels to true");
  assert(win.eval("(() => { const t = { meta:{name:'x'}, library:[], racks:[], edges:[], connections:[], ui:{ theme:'evergreen' } }; const keep = S; S = t; migrate(); const out = S.ui.theme; S = keep; return out; })()") === "evergreen",
    "migrate() preserves theme:'evergreen'");
  assert(win.eval("(() => { const t = { meta:{name:'x'}, library:[], racks:[], edges:[], connections:[], ui:{ theme:'banana' } }; const keep = S; S = t; migrate(); const out = S.ui.theme; S = keep; return out; })()") === "light",
    "migrate() heals an unknown theme value to light");
  assert(win.eval("(() => { const t = { meta:{name:'x'}, library:[], racks:[], edges:[], connections:[], ui:{} }; const keep = S; S = t; migrate(); const out = S.ui.wireLabels; S = keep; return out; })()") === true,
    "migrate() backfills wireLabels for pre-v6.10 projects");

  // ---- 3. theme cycle button ----
  S.ui.theme = "light"; win.eval("render()");
  const label = () => q("#btnTheme").textContent;
  assert(label().includes("Dark"), "on light theme the button offers Dark");
  q("#btnTheme").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.theme === "dark" && doc.documentElement.dataset.theme === "dark", "click 1: light -> dark (data-theme applied)");
  assert(label().includes("Evergreen"), "on dark theme the button offers Evergreen");
  q("#btnTheme").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.theme === "evergreen" && doc.documentElement.dataset.theme === "evergreen", "click 2: dark -> evergreen");
  assert(label().includes("Light"), "on evergreen theme the button offers Light");
  q("#btnTheme").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.theme === "light", "click 3: evergreen -> light (full cycle)");

  // ---- 4. canvas fixture for wires/labels ----
  const mkDev = (id, name, ports, rx, ry) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx, ry, hideInRouting: null, pushProtect: false,
    ports: ports.map((p, i) => ({ id: "g" + i, name: p.name, type: p.type, dir: p.dir, count: p.count || 1, face: "front", jacks: [] })) });
  const conn = (id, aDev, aG, ai, bDev, bG, bi, type, lbl) => ({ id, a: { dev: aDev, g: aG, i: ai }, b: { dev: bDev, g: bG, i: bi },
    label: lbl || "", color: "#c33", type, notes: "", len: null, adapter: "" });
  S.racks = [];
  S.edges = [
    mkDev("s1", "Console", [{ name: "Out", type: "XLR3", dir: "out", count: 3 }], 40, 40),
    mkDev("s2", "Amp", [{ name: "In", type: "XLR3", dir: "in", count: 3 }], 500, 300),
  ];
  S.connections = [
    conn("k1", "s1", "g0", 0, "s2", "g0", 0, "XLR3", "Main L"),
    conn("k2", "s1", "g0", 1, "s2", "g0", 1, "XLR3", ""),      // no label -> falls back to type
    conn("k3", "s1", "g0", 2, "s2", "g0", 2, "XLR3", "Main R"),
  ];
  S.ui.view = "rig"; S.ui.rigHideInternal = false; S.ui.wireLabels = true;
  win.eval("resetUndoHistory()");
  win.eval("render()"); win.eval("drawWires()");

  // labels: v6.11.7 they live in the shared #wireLabelLayer (NOT the cable's own <g>), keyed by data-id
  const grpOf = id => doc.querySelector(`path.wire[data-id="${id}"]`).closest(".wire-grp");
  const lblOf = id => doc.querySelector(`#wireLabelLayer .wire-lbl-grp[data-id="${id}"] text.wire-label`);
  assert(!!lblOf("k1") && lblOf("k1").textContent === "Main L", "labeled cable renders its label chip");
  assert(!!lblOf("k2") && lblOf("k2").textContent === "XLR3", "unlabeled cable falls back to its type");
  assert(!!lblOf("k1") && !lblOf("k1").closest("g.wire-grp") && !!lblOf("k1").closest("#wireLabelLayer"),
    "v6.11.7: label lives in #wireLabelLayer, NOT inside the wire-grp (so no other cable's path can cover it)");
  assert(!grpOf("k1").querySelector("text.wire-label") && !grpOf("k2").querySelector("text.wire-label"),
    "no .wire-grp still carries a label text node");
  assert(!!lblOf("k1").closest(".wire-lbl-grp") && lblOf("k1").closest(".wire-lbl-grp").dataset.id === "k1",
    "trace-dim/highlight still reaches the label: it has its own data-id'd .wire-lbl-grp");

  // stroke widths: casing 6.5 / wire 3 default; 8 / 4.5 selected
  assert(grpOf("k2").querySelector(".wire-casing").getAttribute("stroke-width") === "6.5", "default casing stroke is 6.5");
  assert(grpOf("k2").querySelector(".wire").getAttribute("stroke-width") === "3", "default wire stroke is 3");
  S.ui.selConn = "k1"; win.eval("drawWires()");
  assert(grpOf("k1").querySelector(".wire-casing").getAttribute("stroke-width") === "8", "selected casing stroke is 8");
  assert(grpOf("k1").querySelector(".wire").getAttribute("stroke-width") === "4.5", "selected wire stroke is 4.5");
  S.ui.selConn = null;

  // toggle off: no label chips at all
  S.ui.wireLabels = false; win.eval("drawWires()");
  assert(!doc.querySelector("text.wire-label"), "wireLabels=false removes every label chip");
  S.ui.wireLabels = true; win.eval("drawWires()");
  assert(doc.querySelectorAll("text.wire-label").length === 3, "wireLabels=true shows a chip on every cable");

  // toolbar toggle button
  const bl = q("#btnWireLabels");
  assert(!!bl && !!bl.closest(".ct-zoom"), "#btnWireLabels lives in the toolbar's zoom group");
  assert(bl.classList.contains("active"), "labels button reads active while labels are on");
  bl.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.wireLabels === false, "clicking the button toggles labels off");
  assert(JSON.parse(win.localStorage.getItem("dlux-rackmaster-v1")).ui.wireLabels === false, "the toggle persists via commit()/save()");
  q("#btnWireLabels").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.wireLabels === true, "clicking again toggles labels back on");

  // ---- 5. curved-mode bus lanes ----
  // jsdom has no layout engine: every getBoundingClientRect is 0x0, so all pins collapse onto one
  // point and the lane pass sees flat (needsCorridor=false) cables. Stub per-pin rects (standard
  // technique in this suite) so the three runs share a corridor with distinct src/dest heights.
  const stubPins = () => doc.querySelectorAll(".pin").forEach(pin => {
    const devId = pin.dataset.dev, i = +pin.dataset.i;
    const x = devId === "s1" ? 100 : 500, y = 50 + i * 30 + (devId === "s2" ? 40 : 0);
    pin.getBoundingClientRect = () => ({ left: x, right: x + 11, top: y, bottom: y + 11, width: 11, height: 11 });
  });
  stubPins();
  win.eval("drawWires()");
  const d1 = doc.querySelector('path.wire[data-id="k1"]').getAttribute("d");
  const d2 = doc.querySelector('path.wire[data-id="k2"]').getAttribute("d");
  const d3 = doc.querySelector('path.wire[data-id="k3"]').getAttribute("d");
  assert(d1 !== d2 && d2 !== d3 && d1 !== d3, "3 parallel cables sharing a corridor get distinct (fanned) lane paths");
  // v6.10.1: curved mode removed entirely
  assert(win.eval("typeof wirePathCurved") === "undefined", "wirePathCurved() removed (orthogonal only)");
  assert(!d1.includes("C "), "rendered cable paths contain no Bezier commands");
  // deterministic: identical redraw, identical paths
  win.eval("drawWires()");
  assert(doc.querySelector('path.wire[data-id="k1"]').getAttribute("d") === d1, "lane assignment is deterministic across redraws");
  // WIRE_LANE_GAP now 28
  assert(win.eval("WIRE_LANE_GAP") === 28, "WIRE_LANE_GAP widened to 28px");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
