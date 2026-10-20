// v6.11 -- #routeInner content-driven sizing. The inner canvas used to be a HARD 3000x2200 box:
// nodes dragged near x~2800+ got squeezed against the containing block's right edge (auto-width
// .node port columns wrap/overlap) and anything past 3000x2200 fell outside the #wires SVG box
// (cables clip/disappear). Now CSS gives a 3000x2200 FLOOR (min-width/min-height) and
// sizeRouteInner() sets an explicit content-space width/height = max(floor, extent + 400px pad),
// state-driven via minimapItems() (deterministic, per-view filtered, jsdom-safe). Full render may
// shrink back to content; mid-drag growth is grow-only.
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
  const px = v => parseFloat(v) || 0; // "5590px" -> 5590
  const innerEl = () => doc.getElementById("routeInner");

  // ============================================================
  // 1. Pure math -- computeRouteInnerSize
  // ============================================================
  let sz = win.computeRouteInnerSize([]);
  assert(sz.w === 3000 && sz.h === 2200, `empty item list -> floor 3000x2200 (got ${JSON.stringify(sz)})`);
  sz = win.computeRouteInnerSize([{ x: 100, y: 100, w: 190, h: 69 }]);
  assert(sz.w === 3000 && sz.h === 2200, `small content stays at the floor (got ${JSON.stringify(sz)})`);
  sz = win.computeRouteInnerSize([{ x: 5000, y: 4000, w: 190, h: 69 }]);
  assert(sz.w === 5000 + 190 + 400 && sz.h === 4000 + 69 + 400, `far item -> maxRight+PAD / maxBottom+PAD (got ${JSON.stringify(sz)})`);
  sz = win.computeRouteInnerSize([{ x: 5000, y: 100, w: 190, h: 69 }, { x: 100, y: 4000, w: 190, h: 69 }]);
  assert(sz.w === 5590 && sz.h === 4469, `extent is per-axis max across items (got ${JSON.stringify(sz)})`);
  sz = win.computeRouteInnerSize([{ x: 9000, y: 9000, w: 190, h: 69 }], 100, 100, 10);
  assert(sz.w === 9200 && sz.h === 9079, `floor/pad params are overridable for testing (got ${JSON.stringify(sz)})`);

  // ============================================================
  // 2. Floor size on a small canvas (Routing view) + structural CSS checks
  // ============================================================
  S.racks = [mkRack("r1", "Rack One", [mkDev("d1", "Dev A", 20, 20), mkDev("d2", "Dev B", 300, 300)])];
  S.edges = [];
  S.ui.view = "routing";
  S.ui.routingRackOnly = "r1";
  win.eval("render()");
  let inner = innerEl();
  assert(px(inner.style.width) === 3000 && px(inner.style.height) === 2200,
    `small content -> explicit style size equals the 3000x2200 floor (got ${inner.style.width} x ${inner.style.height})`);
  const cssText = [...doc.querySelectorAll("style")].map(s => s.textContent).join("\n");
  assert(/#routeInner\{[^}]*min-width:3000px/.test(cssText) && /#routeInner\{[^}]*min-height:2200px/.test(cssText),
    "#routeInner CSS now declares min-width:3000px/min-height:2200px (a floor)");
  assert(!/#routeInner\{[^}]*[^-]width:3000px/.test(cssText) && !/#routeInner\{[^}]*[^-]height:2200px/.test(cssText),
    "#routeInner CSS no longer hard-codes width/height (the old smush/clip cause)");
  assert(/#routeInner\{[^}]*position:relative/.test(cssText), "#routeInner keeps position:relative (nodes are absolutely positioned in it)");
  assert(/#wires\{[^}]*position:absolute;inset:0;width:100%;height:100%/.test(cssText),
    "#wires SVG still fills the (now growable) container via inset:0/100% -- no change needed there");
  assert(!!inner.querySelector("svg#wires"), "the wires SVG is present inside #routeInner");

  // ============================================================
  // 3. A far device grows the canvas; moving it back shrinks it (full-render shrink policy)
  // ============================================================
  S.racks[0].devices[1].rx = 5000; S.racks[0].devices[1].ry = 4000;
  win.eval("render()");
  inner = innerEl();
  const estH = win.eval('nodeEstH(S.racks[0].devices[1])');
  assert(px(inner.style.width) === 5000 + 190 + 400, `device at rx=5000 -> width 5000+190+400=5590 (got ${inner.style.width})`);
  assert(px(inner.style.height) === 4000 + estH + 400, `device at ry=4000 -> height 4000+nodeEstH+400 (got ${inner.style.height})`);
  assert(px(inner.style.width) >= 5000 + 400 && px(inner.style.height) >= 4000 + 400,
    "grown size clears the far node by at least the 400px pad on both axes");
  S.racks[0].devices[1].rx = 300; S.racks[0].devices[1].ry = 300;
  win.eval("render()");
  inner = innerEl();
  assert(px(inner.style.width) === 3000 && px(inner.style.height) === 2200,
    `moving the far device back left shrinks the canvas to the floor on the next full render (got ${inner.style.width} x ${inner.style.height})`);

  // ============================================================
  // 4. Routing view is per-rack: a far device in ANOTHER rack must NOT grow this rack's canvas
  // ============================================================
  S.racks.push(mkRack("r2", "Rack Two", [mkDev("dFar", "Far Dev", 8000, 7000)]));
  S.ui.view = "routing"; S.ui.routingRackOnly = "r1";
  win.eval("render()");
  inner = innerEl();
  assert(px(inner.style.width) === 3000 && px(inner.style.height) === 2200,
    `Routing (rack r1) ignores r2's far device -- mirrors minimapItems()' per-view filtering (got ${inner.style.width} x ${inner.style.height})`);
  S.ui.routingRackOnly = "r2";
  win.eval("render()");
  inner = innerEl();
  assert(px(inner.style.width) === 8000 + 190 + 400, `switching Routing to rack r2 sizes for its far device (got ${inner.style.width})`);

  // ============================================================
  // 5. Rig view counts racks + edge devices
  // ============================================================
  S.ui.view = "rig";
  S.ui.rigCollapsed = {};
  win.eval("render()");
  inner = innerEl();
  // r2's expanded rack-group box: x2 = max(rx+205)+pad = 8000+205+14 = 8219 -> width 8219+400
  assert(px(inner.style.width) === 8000 + 205 + 14 + 400,
    `Rig view sizes for the expanded rack-group box around the far device (buildRackGroup pad/w formula) (got ${inner.style.width})`);
  S.edges = [mkDev("eA", "Edge A", 9500, 200)];
  win.eval("render()");
  inner = innerEl();
  assert(px(innerEl().style.width) === 9500 + 190 + 400, `an edge device farther right wins the extent in Rig view (got ${inner.style.width})`);
  S.edges = [];

  // collapsed rack at far coords grows it (200x60 rack-node box)
  S.ui.rigCollapsed = { r1: true, r2: true };
  S.racks[0].grx = 60; S.racks[0].gry = 40;
  S.racks[1].grx = 12000; S.racks[1].gry = 6000;
  win.eval("render()");
  inner = innerEl();
  assert(px(inner.style.width) === 12000 + 200 + 400 && px(inner.style.height) === 6000 + 60 + 400,
    `a COLLAPSED rack at grx=12000/gry=6000 grows the canvas by its 200x60 box + pad (got ${inner.style.width} x ${inner.style.height})`);

  // ============================================================
  // 6. Determinism + no feedback loop: same state -> same size across repeated renders
  // ============================================================
  const w1 = inner.style.width, h1 = inner.style.height;
  win.eval("render()"); win.eval("render()");
  inner = innerEl();
  assert(inner.style.width === w1 && inner.style.height === h1,
    `repeated renders of the same state keep the same size -- no feedback loop from measuring #routeInner itself (got ${inner.style.width} vs ${w1})`);

  // ============================================================
  // 7. Live grow during a pointer drag past the edge (grow-only mid-drag)
  // ============================================================
  S.racks = [mkRack("r1", "Rack One", [mkDev("d1", "Dev A", 2500, 100)])];
  S.racks[0].devices[0].ports = [];
  S.ui.view = "routing"; S.ui.routingRackOnly = "r1"; S.ui.rigCollapsed = {};
  S.ui.zoomRoute = 1; S.ui.toolMode = "select";
  win.eval("MSEL.devs = []; MSEL.conns = []; MSEL.ports = [];");
  win.eval("render()");
  inner = innerEl();
  assert(px(inner.style.width) === 3090, `drag fixture starts slightly grown: 2500+190+400=3090 wide (got ${inner.style.width})`);
  const head = inner.querySelector('.node[data-dev="d1"] .node-head');
  assert(!!head, "drag fixture node-head found");
  const wBefore = px(inner.style.width);
  head.dispatchEvent(new PE("pointerdown", { clientX: 100, clientY: 100, button: 0, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointermove", { clientX: 1600, clientY: 120, bubbles: true, cancelable: true })); // dx=+1500 -> rx=4000
  let midW = px(innerEl().style.width);
  assert(midW === 4000 + 190 + 400, `mid-drag the canvas grows LIVE to rx+190+400=4590 (got ${midW})`);
  assert(S.racks[0].devices[0].rx === 4000, `drag updated state live (rx=4000, got ${S.racks[0].devices[0].rx})`);
  doc.dispatchEvent(new PE("pointermove", { clientX: 700, clientY: 120, bubbles: true, cancelable: true })); // back left, dx=+600 -> rx=3100
  midW = px(innerEl().style.width);
  assert(midW === 4590, `dragging back left mid-drag does NOT shrink the canvas (grow-only during a drag) (got ${midW})`);
  doc.dispatchEvent(new PE("pointerup", { clientX: 700, clientY: 120, bubbles: true, cancelable: true }));
  win.eval("render()");
  assert(px(innerEl().style.width) === 3100 + 190 + 400,
    `the next full render after the drag re-sizes to the real content extent (rx=3100 -> 3690) (got ${innerEl().style.width})`);
  assert(wBefore === 3090, "sanity: pre-drag width was the fixture's 3090");

  // zoom independence: the style size is UNSCALED content-space; the transform carries the zoom
  S.ui.zoomRoute = 0.4;
  win.eval("render()");
  inner = innerEl();
  assert(px(inner.style.width) === 3690 && /scale\(0\.4\)/.test(inner.style.transform),
    `at 40% zoom the style width stays unscaled (3690) and the zoom lives in transform:scale(0.4) (got ${inner.style.width} / ${inner.style.transform})`);
  S.ui.zoomRoute = 1;

  // ============================================================
  // 8. Minimap composition unaffected: viewport math still composes from the same pure pieces
  // ============================================================
  const vis = win.computeVisibleContentRect(100, 50, 800, 600, 2);
  const vprect = win.computeViewportRectOnMinimap({ x1: 0, y1: 0, x2: 1000, y2: 500 }, 0.18, vis);
  assert(close(vprect.left, 9) && close(vprect.top, 4.5) && close(vprect.width, 72) && close(vprect.height, 54),
    `minimap viewport math (computeVisibleContentRect -> computeViewportRectOnMinimap) is unchanged by the sizing feature (got ${JSON.stringify(vprect)})`);
  win.eval("render()");
  assert(!!doc.getElementById("minimapBox"), "minimap still renders alongside the auto-sized canvas");

  // ============================================================
  // 9. v6.11.2 -- click-away re-squeeze regression: width:max-content + live-DOM measurement
  // ============================================================
  assert(/\.node\{[^}]*width:max-content/.test(cssText) && /\.node\{[^}]*min-width:190px/.test(cssText),
    ".node declares width:max-content (absolutely-positioned nodes size to content, never squeeze at the canvas edge) and keeps min-width:190px");
  assert(/\.rack-node\{[^}]*width:max-content/.test(cssText),
    ".rack-node declares width:max-content too (collapsed racks can't squeeze either)");
  assert(!html.includes("wire-grp:hover) .wire-grp:not"), "cross-check: hover fade-others rule removed (v6.11.2)");

  // Fixture: one node at rx=2600 whose REAL rendered width (stubbed rect) is 520px, far wider than the
  // 190px state estimate. sizeRouteInner must take the per-axis max of state floor and measured extent.
  S.racks = [mkRack("r1", "Rack One", [mkDev("d1", "Wide Dev", 2600, 100)])];
  S.racks.length = 1; S.edges = []; S.connections = [];
  S.ui.view = "routing"; S.ui.routingRackOnly = "r1"; S.ui.zoomRoute = 1;
  const origGBCR = win.Element.prototype.getBoundingClientRect;
  // Prototype-level stub so it survives render()'s DOM rebuild (sizeRouteInner runs DURING render):
  // the d1 node measures 2600..3120 x 100..240; everything else keeps jsdom's zero rects.
  win.Element.prototype.getBoundingClientRect = function () {
    if (this.classList && this.classList.contains("node") && this.dataset && this.dataset.dev === "d1")
      return { left: 2600, top: 100, right: 3120, bottom: 240, width: 520, height: 140, x: 2600, y: 100 };
    return origGBCR.call(this);
  };
  win.eval("render()");
  inner = innerEl();
  const measuredW = 3120 + 400; // measured right edge + pad -- beats the 2600+190+400=3190 estimate
  assert(px(inner.style.width) === measuredW,
    `sizeRouteInner honors the stubbed live rect: width = measured 3120 + 400 = ${measuredW}, not the 190px-estimate 3190 (got ${inner.style.width})`);
  assert(px(inner.style.height) === 2200, `measured bottom (240+400) stays under the floor -> height keeps 2200 (got ${inner.style.height})`);

  // Click-away scenario: select the device, then click the canvas background -> commit() -> render().
  // The full render may shrink, but only to the TRUE (measured) extent -- never back to the underestimate.
  S.ui.selDev = "d1";
  win.eval("render()");
  inner = innerEl();
  assert(px(inner.style.width) === measuredW, `after the selection render the width still honors the measurement (got ${inner.style.width})`);
  inner.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  inner = innerEl();
  assert(S.ui.selDev === null, "background click cleared the selection (the regression's trigger path ran)");
  assert(px(inner.style.width) === measuredW,
    `click-away's full render does NOT re-shrink below the measured content extent (got ${inner.style.width}, want ${measuredW})`);
  assert(px(inner.style.width) >= 3120 + 400, "inner remains >= measured node right edge + 400px pad after click-away");
  win.Element.prototype.getBoundingClientRect = origGBCR;
  // and with the stub gone (zero rects, i.e. jsdom/no-layout), the deterministic state floor stands again
  win.eval("render()");
  assert(px(innerEl().style.width) === 2600 + 190 + 400,
    `without live rects the state-driven estimate is the (deterministic) size again (got ${innerEl().style.width})`);

  console.log(`\ntest_canvas_autosize: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
