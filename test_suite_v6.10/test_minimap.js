// v6.9 Part 2 -- corner minimap (Routing/Rig canvas). The scene (minimapItems()) is fully state-driven
// (no getBoundingClientRect() dependency -- device rx/ry and rack grx/gry are already canvas-content-space
// coordinates), so it's directly testable against known S state with no DOM stubbing. Only the viewport
// rectangle and the click/drag interactions need scroll+zoom math, which is split into pure functions
// (computeMinimapScale/computeVisibleContentRect/computeViewportRectOnMinimap/computeCenterScroll/
// computeDragScrollDelta) tested first against hand-computed fixtures, then exercised via stubbed DOM rects
// (same technique as test_canvas_toolbar.js's marquee/zoom-to-fit DOM-wiring tests).
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
  // 1. migrate() default + persistence
  // ============================================================
  assert(S.ui.minimap === true, "migrate() backfills S.ui.minimap to true (default ON) on a fresh project");
  win.eval('S.ui.minimap = undefined; migrate();');
  assert(S.ui.minimap === true, "migrate() heals a missing S.ui.minimap back to true");
  win.eval('S.ui.minimap = false; migrate();');
  assert(S.ui.minimap === false, "migrate() preserves an existing false value (user turned it off)");
  win.eval('S.ui.minimap = true; migrate();');
  assert(S.ui.minimap === true, "migrate() preserves an existing true value");

  // ============================================================
  // 2. Pure math -- computeMinimapScale
  // ============================================================
  let dims = win.computeMinimapScale(400, 100, 180, 140);
  assert(dims.scale === 0.45 && dims.mmW === 180 && close(dims.mmH, 45), `wide content (400x100) is width-bound: scale=min(180/400,140/100)=0.45 -> 180x45 (got ${JSON.stringify(dims)})`);
  dims = win.computeMinimapScale(100, 400, 180, 140);
  assert(dims.scale === 0.35 && close(dims.mmW, 35) && dims.mmH === 140, `tall content (100x400) is height-bound: scale=min(180/100,140/400)=0.35 -> 35x140 (got ${JSON.stringify(dims)})`);
  assert(win.computeMinimapScale(0, 100, 180, 140) === null, "computeMinimapScale returns null (no-op) for a zero-width bbox");
  assert(win.computeMinimapScale(100, 0, 180, 140) === null, "computeMinimapScale returns null (no-op) for a zero-height bbox");

  // ============================================================
  // 3. Pure math -- computeVisibleContentRect / computeViewportRectOnMinimap
  // ============================================================
  let vis = win.computeVisibleContentRect(100, 50, 800, 600, 2);
  assert(vis.x1 === 50 && vis.y1 === 25 && vis.x2 === 450 && vis.y2 === 325, `computeVisibleContentRect divides scroll+viewport by zoom (got ${JSON.stringify(vis)})`);

  let vprect = win.computeViewportRectOnMinimap({ x1: 0, y1: 0, x2: 1000, y2: 500 }, 0.18, { x1: 50, y1: 25, x2: 450, y2: 325 });
  assert(close(vprect.left, 9) && close(vprect.top, 4.5) && close(vprect.width, 72) && close(vprect.height, 54),
    `computeViewportRectOnMinimap maps the visible content rect into minimap-local px at the given scale (got ${JSON.stringify(vprect)})`);

  // ============================================================
  // 4. Pure math -- computeCenterScroll (click-to-center)
  // ============================================================
  let cs = win.computeCenterScroll(300, 150, 800, 600, 2);
  assert(cs.scrollLeft === 200 && cs.scrollTop === 0, `computeCenterScroll(300,150,800,600,zoom2): scrollLeft=300*2-400=200, scrollTop=max(0,150*2-300)=0 (got ${JSON.stringify(cs)})`);
  cs = win.computeCenterScroll(10, 10, 800, 600, 1);
  assert(cs.scrollLeft === 0 && cs.scrollTop === 0, "computeCenterScroll clamps negative results to 0 (content point near the origin)");

  // ============================================================
  // 5. Pure math -- computeDragScrollDelta (drag the viewport rect)
  // ============================================================
  let dd = win.computeDragScrollDelta(36, 18, 0.18, 2);
  assert(close(dd.dScrollLeft, 400) && close(dd.dScrollTop, 200), `computeDragScrollDelta(36,18,scale0.18,zoom2): (36/0.18)*2=400, (18/0.18)*2=200 (got ${JSON.stringify(dd)})`);

  // ============================================================
  // 6. minimapItems() scene -- Routing view (single rack, edges excluded)
  // ============================================================
  S.racks = [mkRack("r1", "Rack One", [mkDev("d1", "Dev A", 20, 20), mkDev("d2", "Dev B", 300, 300)])];
  S.racks[0].color = "#ff0000";
  S.edges = [mkDev("eA", "Edge A", 900, 900)];
  S.ui.view = "routing";
  S.ui.routingRackOnly = "r1";
  win.eval("render()");
  let items = win.eval("minimapItems()");
  assert(items.length === 2, `minimapItems() on Routing includes only the current rack's 2 devices, not the edge device (got ${items.length})`);
  assert(items.every(it => !it.key.startsWith("rack:")), "Routing-view minimap items are individual devices, not rack containers (single-rack canvas)");
  const d1item = items.find(it => it.key === "d1");
  assert(!!d1item && d1item.x === 20 && d1item.y === 20 && d1item.w === 190 && d1item.h === 69 && d1item.color === "#336699",
    `minimapItems() reports d1's stored rx/ry directly and the nodeEstH()/190 fallback size (got ${JSON.stringify(d1item)})`);

  // ============================================================
  // 7. minimapItems() scene -- Rig view, expanded rack (group box + individual devices) + edge
  // ============================================================
  S.ui.view = "rig";
  S.ui.rigCollapsed = {};
  win.eval("render()");
  items = win.eval("minimapItems()");
  // 1 rack-group box + 2 individual devices (d1,d2) + 1 edge (eA) = 4
  assert(items.length === 4, `Rig view with an EXPANDED rack shows the rack-group box AND its individual devices, plus the edge device (expected 4, got ${items.length})`);
  const rackItem = items.find(it => it.key === "rack:r1");
  assert(!!rackItem && rackItem.color === "#ff0000", "the expanded rack's group-box item uses the rack's own color");
  // pad=14,headH=30,w=205; x1=min(20,300)-14=6; y1=min(20,20)-14-30=-24; x2=max(225,505)+14=519; y2=max(89,369)+14=383 (nodeEstH=69 as of v6.10)
  assert(rackItem.x === 6 && rackItem.y === -24 && rackItem.w === 513 && rackItem.h === 407,
    `rack-group bbox math matches buildRackGroup's own pad/headH/w formula (got ${JSON.stringify(rackItem)})`);
  const edgeItem = items.find(it => it.key === "eA");
  assert(!!edgeItem && edgeItem.x === 900 && edgeItem.y === 900, "edge device is included as its own item in the Rig scene");

  // ============================================================
  // 8. minimapItems() scene -- Rig view, COLLAPSED rack (rack-node box, members excluded)
  // ============================================================
  S.ui.rigCollapsed = { r1: true };
  S.racks[0].grx = 60; S.racks[0].gry = 40;
  win.eval("render()");
  items = win.eval("minimapItems()");
  assert(items.length === 2, `Rig view with a COLLAPSED rack shows just the rack-node box (its members are excluded) plus the edge (expected 2, got ${items.length})`);
  const collapsedItem = items.find(it => it.key === "rack:r1");
  assert(!!collapsedItem && collapsedItem.x === 60 && collapsedItem.y === 40 && collapsedItem.w === 200 && collapsedItem.h === 60,
    `collapsed rack item uses grx/gry and the fixed 200x60 rack-node size (got ${JSON.stringify(collapsedItem)})`);
  assert(!items.some(it => it.key === "d1" || it.key === "d2"), "a collapsed rack's member devices do not appear individually in the minimap scene");

  // ============================================================
  // 9. DOM presence -- only on Routing/Rig, absent elsewhere, hidden when toggled off
  // ============================================================
  S.ui.view = "library"; win.eval("render()");
  assert(!doc.querySelector("#minimapBox"), "minimap does not render on the Library view");
  S.ui.view = "racks"; win.eval("render()");
  assert(!doc.querySelector("#minimapBox"), "minimap does not render on the Racks view");
  S.ui.view = "settings"; win.eval("render()");
  assert(!doc.querySelector("#minimapBox"), "minimap does not render on the Settings view");

  S.ui.view = "routing"; S.ui.minimap = true;
  win.eval("render()");
  assert(!!doc.querySelector("#minimapBox"), "minimap renders on the Routing view when S.ui.minimap is true and there's content");
  S.ui.view = "rig";
  win.eval("render()");
  assert(!!doc.querySelector("#minimapBox"), "minimap also renders on the Rig view");

  S.ui.minimap = false;
  win.eval("render()");
  assert(!doc.querySelector("#minimapBox"), "minimap is hidden ENTIRELY (no DOM at all) when S.ui.minimap is false");
  S.ui.minimap = true;
  win.eval("render()");

  // empty canvas -> no-op, matches zoomToFit's own empty-canvas guard
  S.racks = [mkRack("rEmpty", "Empty", [])];
  S.edges = [];
  S.ui.view = "routing"; S.ui.routingRackOnly = "rEmpty";
  win.eval("render()");
  assert(!doc.querySelector("#minimapBox"), "minimap does not render when the canvas has nothing visible on it");

  // ============================================================
  // 10. Toggle button -- floating toolbar zoom group, persists to localStorage
  // ============================================================
  S.racks = [mkRack("r1", "Rack One", [mkDev("d1", "Dev A", 20, 20), mkDev("d2", "Dev B", 300, 300)])];
  S.ui.routingRackOnly = "r1";
  S.ui.minimap = true;
  win.eval("render()");
  const btn = doc.querySelector(".ct-zoom #btnMinimapToggle");
  assert(!!btn, "the minimap toggle button lives inside the toolbar's zoom group (.ct-zoom)");
  assert(btn.classList.contains("active"), "toggle button shows an active state while the minimap is on");
  btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.minimap === false, "clicking the toggle button turns S.ui.minimap off");
  assert(!doc.querySelector("#minimapBox"), "the minimap disappears immediately after toggling off");
  const raw = win.localStorage.getItem("dlux-rackmaster-v1");
  assert(raw && JSON.parse(raw).ui.minimap === false, "the toggle choice persists to localStorage");
  doc.querySelector(".ct-zoom #btnMinimapToggle").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.minimap === true, "clicking it again turns the minimap back on");
  assert(!!doc.querySelector("#minimapBox"), "the minimap reappears after toggling back on");

  // ============================================================
  // 11. DOM wiring -- node-rect count matches the scene, viewport rect reflects stubbed scroll/zoom
  // ============================================================
  win.eval("render()");
  let box = doc.querySelector("#minimapBox");
  const nodeRects = box.querySelectorAll(".mm-node");
  const sceneCount = win.eval("minimapItems()").length;
  assert(nodeRects.length === sceneCount, `#minimapBox contains exactly one .mm-node per scene item (${nodeRects.length} rects for ${sceneCount} items)`);
  assert(!!box.querySelector("#minimapViewport"), "#minimapBox contains a #minimapViewport rect");

  const canvasEl = doc.querySelector("#routeCanvas");
  Object.defineProperty(canvasEl, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(canvasEl, "clientHeight", { value: 600, configurable: true });
  Object.defineProperty(canvasEl, "scrollLeft", { value: 0, writable: true, configurable: true });
  Object.defineProperty(canvasEl, "scrollTop", { value: 0, writable: true, configurable: true });
  // recompute bbox/scale the same way renderMinimap() does, using the already-verified pure primitives,
  // so this section checks the WIRING (does the DOM correctly compose the primitives) rather than re-deriving the math
  const bbox = win.bboxOfItems(win.eval("minimapItems()"));
  const expDims = win.computeMinimapScale(bbox.x2 - bbox.x1, bbox.y2 - bbox.y1);
  assert(close(parseFloat(box.style.width), expDims.mmW) && close(parseFloat(box.style.height), expDims.mmH), "the #minimapBox element's own width/height match computeMinimapScale()'s output");

  // trigger a scroll -> only the viewport rect should update (not a full rebuild) per spec
  canvasEl.scrollLeft = 200; canvasEl.scrollTop = 100;
  canvasEl.dispatchEvent(new win.Event("scroll", { bubbles: true }));
  const vp = box.querySelector("#minimapViewport");
  const expVis = win.computeVisibleContentRect(200, 100, 800, 600, S.ui.zoomRoute || 1);
  const expVpRect = win.computeViewportRectOnMinimap(bbox, expDims.scale, expVis);
  assert(close(parseFloat(vp.style.left), expVpRect.left, 0.5) && close(parseFloat(vp.style.top), expVpRect.top, 0.5), `scrolling the canvas updates #minimapViewport's position to match computeViewportRectOnMinimap() (got left=${vp.style.left},top=${vp.style.top}, expected left=${expVpRect.left},top=${expVpRect.top})`);
  assert(box === doc.querySelector("#minimapBox"), "the scroll listener only repositions the viewport rect -- it does NOT trigger a full render()/rebuild of #minimapBox itself");

  // ============================================================
  // 12. Click-to-center: clicking the minimap body (not the viewport rect) centers the canvas there
  // ============================================================
  canvasEl.scrollLeft = 0; canvasEl.scrollTop = 0;
  box.getBoundingClientRect = () => ({ left: 0, top: 0, right: parseFloat(box.style.width), bottom: parseFloat(box.style.height), width: parseFloat(box.style.width), height: parseFloat(box.style.height) });
  const clickLocalX = 20, clickLocalY = 15;
  box.dispatchEvent(new PE("pointerdown", { clientX: clickLocalX, clientY: clickLocalY, button: 0, bubbles: true, cancelable: true }));
  const expContentX = bbox.x1 + clickLocalX / expDims.scale, expContentY = bbox.y1 + clickLocalY / expDims.scale;
  const expCS = win.computeCenterScroll(expContentX, expContentY, 800, 600, S.ui.zoomRoute || 1);
  assert(close(canvasEl.scrollLeft, expCS.scrollLeft, 0.5) && close(canvasEl.scrollTop, expCS.scrollTop, 0.5),
    `clicking the minimap body centers the canvas viewport on that content point (got scrollLeft=${canvasEl.scrollLeft},scrollTop=${canvasEl.scrollTop}, expected ${JSON.stringify(expCS)})`);

  // ============================================================
  // 13. Drag the viewport rect: live-pans the canvas
  // ============================================================
  canvasEl.scrollLeft = 100; canvasEl.scrollTop = 50;
  const vp2 = box.querySelector("#minimapViewport");
  const startScrollLeft = canvasEl.scrollLeft, startScrollTop = canvasEl.scrollTop;
  vp2.dispatchEvent(new PE("pointerdown", { clientX: 0, clientY: 0, button: 0, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointermove", { clientX: 10, clientY: 5, bubbles: true, cancelable: true }));
  const expDrag = win.computeDragScrollDelta(10, 5, expDims.scale, S.ui.zoomRoute || 1);
  assert(close(canvasEl.scrollLeft, startScrollLeft + expDrag.dScrollLeft, 0.5) && close(canvasEl.scrollTop, startScrollTop + expDrag.dScrollTop, 0.5),
    `dragging #minimapViewport pans the real canvas by computeDragScrollDelta()'s amount (got scrollLeft=${canvasEl.scrollLeft},scrollTop=${canvasEl.scrollTop})`);
  doc.dispatchEvent(new PE("pointerup", { clientX: 10, clientY: 5, bubbles: true, cancelable: true }));

  // ============================================================
  // 14. Minimap does not intercept events outside its own bounds
  // ============================================================
  const nodeBefore = doc.querySelector('.node[data-dev="d1"]');
  assert(!!nodeBefore, "a device node exists elsewhere on the canvas");
  // clicking the node itself (not the minimap) still works normally -- selects it
  nodeBefore.querySelector(".node-head").dispatchEvent(new PE("pointerdown", { clientX: 9999, clientY: 9999, button: 0, bubbles: true, cancelable: true }));
  doc.dispatchEvent(new PE("pointerup", { clientX: 9999, clientY: 9999, bubbles: true, cancelable: true }));
  assert(S.ui.selDev === "d1", "clicking a device node's header outside the minimap's own bounds still selects it normally (minimap does not globally intercept pointer events)");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
