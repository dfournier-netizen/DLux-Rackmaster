// v6.5 — Part B regression: svg#wires must paint ABOVE device nodes (last child of #routeInner,
// not first), while staying click-through except on a cable's own stroke, and cable click-to-select
// must still work. Also checks the casing+wire pairing used for legibility over node colors.
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

  const mkDev = (id, name, dir) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx: 20, ry: 20, hideInRouting: null, pushProtect: false,
    ports: [{ id: "g1", name: "P", type: "XLR3", dir, count: 1, face: "front", jacks: [] }] });
  S.racks = [{ id: "r1", name: "Rack One", sizeU: 12, depth: 20, color: "#123", notes: "", devices: [
    mkDev("d1", "Console", "out"), mkDev("d2", "Amp", "in")
  ] }];
  S.connections = [{ id: "c1", a: { dev: "d1", g: "g1", i: 0 }, b: { dev: "d2", g: "g1", i: 0 },
    label: "MAIN L", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" }];
  S.ui.view = "routing";
  S.ui.routingRackOnly = "r1";
  win.eval("render()");
  win.eval("drawWires()");

  const inner = doc.querySelector("#routeInner");
  const svg = doc.querySelector("#wires");
  assert(!!inner && !!svg, "found #routeInner and #wires");
  assert(inner.lastElementChild === svg, "Part B: svg#wires is the LAST child of #routeInner (paints above device nodes)");
  const nodeEls = [...inner.querySelectorAll(".node")];
  assert(nodeEls.length === 2, "both device nodes rendered");
  nodeEls.forEach(n => {
    const idx1 = [...inner.children].indexOf(n);
    const idxSvg = [...inner.children].indexOf(svg);
    assert(idxSvg > idx1, "Part B: #wires comes after device node '" + n.dataset.dev + "' in DOM order");
  });

  // pointer-events: svg itself none, but the clickable wire stroke keeps pointer-events (via CSS)
  assert(html.includes("#wires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}"),
    "Part B: #wires has pointer-events:none in the stylesheet");
  assert(/#wires path\.wire\{[^}]*pointer-events:stroke/.test(html), "Part B: #wires path.wire keeps pointer-events:stroke");

  // casing + wire pair, casing painted first (underneath)
  const grp = svg.querySelector(".wire-grp");
  assert(!!grp, "Part B: cable rendered as a .wire-grp (casing+wire pair)");
  const casing = grp ? grp.querySelector(".wire-casing") : null;
  const wire = grp ? grp.querySelector(".wire") : null;
  assert(!!casing && !!wire, "Part B: both casing and colored wire paths present");
  assert(casing && wire && casing.nextElementSibling === wire, "Part B: casing painted before (under) the colored wire");
  assert(html.includes("--wire-casing"), "Part B: --wire-casing theme var referenced in stylesheet");
  assert(/:root\{[^}]*--wire-casing:/.test(html) || html.includes("--wire-casing:#111111"), "Part B: --wire-casing defined in light theme");
  assert(html.includes("--wire-casing:#f4f4f2"), "Part B: --wire-casing defined in dark theme");

  // wirePath now includes a straight exit stub before the Bézier (an "L" segment right after the initial M)
  const d = wire.getAttribute("d");
  assert(/^M [\d.\-]+ [\d.\-]+ L /.test(d) && !/ C /.test(d), "Part B/v6.10.1: wire path starts with the straight port stub (M..L..) and contains no Bezier (orthogonal only)");

  // click-to-select still works on the colored wire path
  S.ui.selConn = null;
  wire.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.selConn === "c1", "Part B: clicking the wire path still selects the connection");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
