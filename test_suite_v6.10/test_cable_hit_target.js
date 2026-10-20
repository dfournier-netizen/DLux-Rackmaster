// v6.11.2 -- bigger cable click target. Each .wire-grp gains a THIRD, invisible path.wire-hit
// (16px stroke, stroke-opacity:0, pointer-events:stroke) painted LAST in the group so the thin 3px
// run is easy to click. CRITICAL pin-safety property: the hit d spans only stub-end..stub-end (the
// two pin-endpoint points are dropped), because #wires paints ABOVE device nodes (v6.5) and a fat
// stroke over a pin would steal click-to-connect. Click behavior on the hit path must match the
// wire path exactly: select, shift-multiselect, trace-armed type-filtered trace.
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(process.argv[2] || "build.html", "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }
const firstM = d => { const m = /^M\s+([\d.\-]+)\s+([\d.\-]+)/.exec(d || ""); return m ? { x: +m[1], y: +m[2] } : null; };

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  win.addEventListener("error", e => console.error("WINDOW ERROR:", (e.error && e.error.stack) || e.message));
  await new Promise(r => setTimeout(r, 150));
  const S = win.eval("S");

  // ---- 1. CSS contract ----
  assert(html.includes("#wires path.wire-hit{fill:none;stroke:#000;stroke-opacity:0;stroke-width:16;pointer-events:stroke;cursor:pointer}"),
    "stylesheet defines the invisible 16px hit stroke (stroke-opacity:0, pointer-events:stroke, cursor:pointer)");
  assert(/#wires path\.wire\{[^}]*pointer-events:stroke/.test(html), "the visible wire keeps its own pointer-events:stroke (both are clickable)");

  // ---- 2. fixture: two nodes, one XLR3 cable, pin centers stubbed to real positions ----
  const mkDev = (id, name, dir, rx, ry) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx, ry, hideInRouting: null, pushProtect: false,
    ports: [{ id: "g1", name: "P", type: "XLR3", dir, count: 1, face: "front", jacks: [] }] });
  S.racks = [{ id: "r1", name: "Rack One", sizeU: 12, depth: 20, color: "#123", notes: "", circuits: [], devices: [
    mkDev("d1", "Console", "out", 20, 20), mkDev("d2", "Amp", "in", 600, 400)
  ] }];
  S.edges = [];
  S.connections = [{ id: "c1", a: { dev: "d1", g: "g1", i: 0 }, b: { dev: "d2", g: "g1", i: 0 },
    label: "MAIN L", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" }];
  S.ui.view = "routing"; S.ui.routingRackOnly = "r1"; S.ui.zoomRoute = 1; S.ui.wireLabels = true; S.ui.connType = null;
  // jsdom has no layout -> every pin would sit at (0,0) and the route degenerates. Stub pin rects at
  // the prototype level (survives every render()/drawWires() rebuild) so the route has real geometry.
  const origGBCR = win.Element.prototype.getBoundingClientRect;
  win.Element.prototype.getBoundingClientRect = function () {
    if (this.classList && this.classList.contains("pin") && this.dataset) {
      if (this.dataset.dev === "d1") return { left: 210, top: 60, right: 220, bottom: 70, width: 10, height: 10, x: 210, y: 60 };
      if (this.dataset.dev === "d2") return { left: 600, top: 400, right: 610, bottom: 410, width: 10, height: 10, x: 600, y: 400 };
    }
    return origGBCR.call(this);
  };
  win.eval("render()"); win.eval("drawWires()");
  const svg = () => doc.querySelector("#wires");
  const grp = () => svg().querySelector(".wire-grp");

  // ---- 3. structure: casing -> wire -> hit, hit painted LAST; label lives in #wireLabelLayer ----
  let g = grp();
  assert(!!g, "cable rendered as a .wire-grp");
  const casing = g.querySelector("path.wire-casing"), wire = g.querySelector("path.wire"),
        hit = g.querySelector("path.wire-hit");
  // v6.11.7: the label no longer sits inside the cable's own <g> -- it lives in the shared
  // #wireLabelLayer appended last to #wires, so no other cable's path can paint over it.
  const label = svg().querySelector('#wireLabelLayer .wire-lbl-grp[data-id="c1"] text.wire-label');
  assert(!!casing && !!wire && !!hit, "group contains casing, wire AND the new hit path");
  assert(casing.nextElementSibling === wire, "paint order preserved: casing still immediately under the colored wire (test_wires_paint_order contract)");
  assert(!!label && !label.closest("g.wire-grp"), "v6.11.7: the wire label is NOT inside the .wire-grp any more");
  assert(!!label && !!label.closest("#wireLabelLayer"), "v6.11.7: the wire label lives in #wireLabelLayer instead");
  assert(!g.querySelector("text.wire-label"), "no text.wire-label remains anywhere inside the .wire-grp");
  assert(g.lastElementChild === hit, "hit path is the LAST child of the group (painted above casing/wire)");
  assert(hit.getAttribute("data-id") === "c1" && wire.getAttribute("data-id") === "c1", "hit path carries the same data-id as the wire");

  // ---- 4. pin safety: hit d spans stub-to-stub, NOT pin-to-pin ----
  const dWire = wire.getAttribute("d"), dHit = hit.getAttribute("d");
  assert(!!dWire && !!dHit && dHit !== dWire, "hit d differs from the wire d (trimmed variant, not a copy)");
  const mW = firstM(dWire), mH = firstM(dHit);
  assert(!!mW && !!mH, "both path d strings parse to an initial M x y");
  // pin a center = (215,65) exiting right -> stub end at (257,65): the wire starts AT the pin, the hit at the STUB
  assert(mW && Math.abs(mW.x - 215) < 0.6 && Math.abs(mW.y - 65) < 0.6, `wire d starts at the pin center (215,65) (got ${JSON.stringify(mW)})`);
  assert(mH && !(Math.abs(mH.x - mW.x) < 0.01 && Math.abs(mH.y - mW.y) < 0.01), "hit d does NOT start at the pin endpoint");
  assert(mH && Math.abs(mH.x - 257) < 0.6 && Math.abs(mH.y - 65) < 0.6, `hit d starts at the 42px stub end (257,65) -- can never cover the pin (got ${JSON.stringify(mH)})`);

  // ---- 5. plain click on the hit path selects the connection ----
  S.ui.selConn = null; win.eval("MSEL.conns = []; MSEL.ports = []; MSEL.devs = [];");
  g = grp(); g.querySelector("path.wire-hit").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.selConn === "c1", "clicking the invisible hit path selects the connection");

  // ---- 6. shift-click on the hit path toggles multi-select ----
  S.ui.selConn = null; win.eval("MSEL.conns = [];"); win.eval("render()"); win.eval("drawWires()");
  g = grp(); g.querySelector("path.wire-hit").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
  assert(win.eval("MSEL.conns.includes('c1')"), "shift-clicking the hit path adds the cable to MSEL.conns");
  win.eval("drawWires()"); // the commit()'d render redraws wires on rAF -- force it before re-querying
  g = grp(); g.querySelector("path.wire-hit").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
  assert(win.eval("MSEL.conns.length") === 0, "second shift-click on the hit path toggles it back off");

  // ---- 7. trace-armed click on the hit path runs the type-filtered trace ----
  win.eval("MSEL.conns = [];"); win.eval("render()"); win.eval("drawWires()");
  win.eval("if (!TRACE_ARMED) toggleTrace();");
  assert(win.eval("TRACE_ARMED") === true, "trace mode armed");
  win.eval("drawWires()"); // toggleTrace()'s render redraws wires on rAF -- force it before querying
  g = grp(); g.querySelector("path.wire-hit").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(win.eval("TRACE_MEMBERS !== null"), "trace-armed click on the hit path produced a trace");
  assert(win.eval("TRACE_MEMBERS && TRACE_MEMBERS.conns.has('c1')"), "the trace includes the clicked cable");
  assert(win.eval("TRACE_MEMBERS && TRACE_MEMBERS.devs.has('d1') && TRACE_MEMBERS.devs.has('d2')"), "the trace spans both endpoint devices (XLR3 type-filtered flow)");
  win.eval("TRACE_ARMED = false; TRACE_MEMBERS = null; updateTraceButton();");

  // ---- 8. every cable gets its own hit path (multi-cable sanity) ----
  S.connections.push({ id: "c2", a: { dev: "d1", g: "g1", i: 0 }, b: { dev: "d2", g: "g1", i: 0 },
    label: "MAIN R", color: "#fa3d6b", type: "XLR3", len: 24, notes: "", adapter: "" });
  win.eval("render()"); win.eval("drawWires()");
  const hits = [...svg().querySelectorAll("path.wire-hit")];
  assert(hits.length === 2, `one hit path per cable (got ${hits.length})`);
  assert(new Set(hits.map(p => p.getAttribute("data-id"))).size === 2, "each hit path carries its own cable's data-id");
  hits.forEach(p => assert(p.parentElement.classList.contains("wire-grp") && p.parentElement.lastElementChild === p,
    "every hit path sits last inside its own .wire-grp"));

  win.Element.prototype.getBoundingClientRect = origGBCR;
  console.log(`\ntest_cable_hit_target: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
