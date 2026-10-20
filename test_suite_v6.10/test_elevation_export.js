// v6.5 — F3: Rack elevation PNG/SVG export. Front/rear elevations are plain HTML/CSS (buildRackEl),
// so "export as SVG" means: build the elevation off-screen, bake every element's *computed* style into
// an inline style attribute (inlineComputedStyles — CSS custom properties/theme vars don't resolve
// inside a standalone .svg opened outside this document), then wrap the cloned markup in an SVG
// <foreignObject> (rackElevationSVGString). Left/Right side views are already real SVG (sideSVG) and
// are used as-is. PNG export (exportRackPNG) loads that SVG into an <Image>, draws it onto a canvas at
// 2x scale, and reads back a PNG blob.
//
// KNOWN JSDOM GAP (documented per handoff §7 convention): canvas rasterization (Image onload ->
// drawImage -> toBlob) cannot be meaningfully unit-tested under jsdom — there is no real image decoder/
// rasterizer, and jsdom does not implement URL.createObjectURL at all. This file verifies the SVG
// serialization path in full (structure, computed-style inlining, foreignObject round-trip, filename
// format) and confirms exportRackSVG/exportRackPNG/downloadBlob exist and do not throw synchronously
// when invoked (with URL.createObjectURL/HTMLAnchorElement.click stubbed, since jsdom lacks the former).
// Actual pixel output of the PNG must be spot-checked by hand in a real browser.
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

  const dev = { id: "d1", tplId: null, name: "Power Amp", cat: "Amps", u: 2, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 3, color: "#2a5", isContainer: false, contents: [], fields: [
      { id: "f1", key: "Model", value: "PA-4000" }
    ], img: null, imgRear: null, notes: "", rx: 0, ry: 0, hideInRouting: null, pushProtect: false, ports: [] };
  const rack = { id: "r1", name: "Rack One", sizeU: 12, depth: 20, color: "#123456", notes: "", devices: [dev] };
  S.racks = [rack];
  S.ui.selRack = "r1";
  S.ui.view = "racks";
  S.ui.face = "front";
  win.eval("render()");

  // --- rackElevationSVGString: front/rear path (HTML->foreignObject wrap) ---
  const svgStrFront = win.eval(`rackElevationSVGString(S.racks[0], "front")`);
  assert(typeof svgStrFront === "string" && svgStrFront.length > 0, "F3: rackElevationSVGString() returns a non-empty string for the front face");
  assert(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svgStrFront), "F3: front-face SVG string starts with a proper <svg> root element");
  assert(/width="[\d.]+" height="[\d.]+"/.test(svgStrFront), "F3: front-face SVG has explicit numeric width/height attributes");
  assert(svgStrFront.includes("<foreignObject"), "F3: front-face export wraps the cloned rack markup in a <foreignObject>");
  assert(svgStrFront.includes("Power Amp"), "F3: front-face SVG contains the device's name text (elevation content preserved)");
  assert(svgStrFront.trim().endsWith("</svg>"), "F3: front-face SVG string is well-formed (ends with </svg>)");

  // --- computed styles are baked in as inline style attributes (CSS vars don't resolve standalone) ---
  assert(/style="[^"]*"/.test(svgStrFront), "F3: cloned elements inside the foreignObject carry inline style=\"...\" attributes (inlineComputedStyles baked in)");

  // --- rear face ---
  const svgStrRear = win.eval(`rackElevationSVGString(S.racks[0], "rear")`);
  assert(typeof svgStrRear === "string" && svgStrRear.includes("<foreignObject"), "F3: rear-face export also produces a foreignObject-wrapped SVG string");

  // --- left/right path delegates to the existing sideSVG() (already real SVG, used as-is) ---
  const svgStrLeft = win.eval(`rackElevationSVGString(S.racks[0], "left")`);
  const sideSVGDirect = win.eval(`sideSVG(S.racks[0], "left", UH || 40)`);
  assert(svgStrLeft === sideSVGDirect, "F3: left-face export delegates directly to sideSVG() rather than the foreignObject path");
  assert(/^<svg/.test(svgStrLeft.trim()), "F3: left-face export is a real <svg> (not HTML-wrapped)");

  // --- inlineComputedStyles(): direct unit test against two small trees ---
  const inlineResult = win.eval(`(() => {
    const src = document.createElement("div");
    src.innerHTML = '<span id="probe" style="color:rgb(18, 52, 86);display:inline-block;">hi</span>';
    document.body.appendChild(src);
    const clone = src.cloneNode(true);
    inlineComputedStyles(src, clone);
    document.body.removeChild(src);
    const probe = clone.querySelector("#probe");
    return { hasStyle: probe.hasAttribute("style"), styleStr: probe.getAttribute("style") };
  })()`);
  assert(inlineResult.hasStyle, "F3: inlineComputedStyles() sets a style attribute on the cloned element");
  assert(/color/.test(inlineResult.styleStr), "F3: inlineComputedStyles() bakes computed 'color' into the inline style");

  // --- resolveExportFace(): "both"/undefined collapse to "front"; specific faces pass through ---
  assert(win.eval(`resolveExportFace("both")`) === "front", 'F3: resolveExportFace("both") resolves to "front"');
  assert(win.eval(`resolveExportFace(undefined)`) === "front", "F3: resolveExportFace(undefined) resolves to \"front\"");
  assert(win.eval(`resolveExportFace("rear")`) === "rear", 'F3: resolveExportFace("rear") passes through unchanged');
  assert(win.eval(`resolveExportFace("left")`) === "left", 'F3: resolveExportFace("left") passes through unchanged');

  // --- safeFileName(): strips filesystem-illegal characters ---
  assert(win.eval(`safeFileName('Rack "A"/B:C*?<>|')`) === "Rack _A_B_C_", "F3: safeFileName() collapses each run of illegal \\/:*?\"<>| characters to a single underscore");
  assert(win.eval(`safeFileName("Rack One")`) === "Rack One", "F3: safeFileName() leaves an already-clean name untouched");

  // --- exportRackSVG/exportRackPNG/downloadBlob exist as functions ---
  assert(typeof win.eval("exportRackSVG") === "function", "F3: exportRackSVG() is defined");
  assert(typeof win.eval("exportRackPNG") === "function", "F3: exportRackPNG() is defined");
  assert(typeof win.eval("downloadBlob") === "function", "F3: downloadBlob() is defined");

  // --- Filename format "<rack name> <face>.svg/.png" — captured via a stubbed anchor click ---
  // jsdom has no URL.createObjectURL at all (known gap) — stub the minimum needed so downloadBlob()
  // can run its real code path without throwing, then intercept .click() to read back a.download.
  win.URL.createObjectURL = () => "blob:mock-url";
  win.URL.revokeObjectURL = () => {};
  let capturedName = null;
  win.HTMLAnchorElement.prototype.click = function () { capturedName = this.download; };

  win.eval(`exportRackSVG(S.racks[0], "front")`);
  assert(capturedName === "Rack One front.svg", `F3: exportRackSVG() downloads with filename "<rack name> <face>.svg" (got "${capturedName}")`);

  capturedName = null;
  win.eval(`exportRackSVG(S.racks[0], "both")`); // "both" should resolve to "front" in the filename too
  assert(capturedName === "Rack One front.svg", `F3: exportRackSVG() with face="both" resolves to the front-face filename (got "${capturedName}")`);

  // --- exportRackPNG(): synchronous setup must not throw, even though jsdom can't actually rasterize ---
  let pngThrew = false;
  try { win.eval(`exportRackPNG(S.racks[0], "rear")`); } catch (e) { pngThrew = true; console.log("exportRackPNG threw:", e.message); }
  assert(!pngThrew, "F3: exportRackPNG() does not throw synchronously when invoked (canvas rasterization itself is a documented jsdom gap, not tested here)");

  // --- F5 (deferred item from phase 2): routingSVG() — the static Rack Guide PDF port-layout renderer.
  // Folded in here rather than a dedicated file since both this and the elevation export above are
  // non-interactive/static SVG rendering paths (as opposed to the live Routing/Rig canvas, which
  // Part C of the phase-2 rework already covered in test_bidi_bottom_edge.js). Previously routingSVG()
  // bucketed dir==="bi" ports together with "in" ports (same bug the canvas's buildNode() had before
  // Part C); it now gives BiDi ports their own bottom band on each device box, labeled "BiDi", mirroring
  // the canvas's .node-ports-bottom zone semantics.
  S.racks = [{ id: "r1", name: "R1", sizeU: 12, depth: 20, color: "#123456", notes: "", devices: [
    { id: "d1", tplId: null, name: "Multi-port Dev", cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
      depth: null, inOff: null, pos: 1, color: "#222222", isContainer: false, contents: [], fields: [],
      ports: [
        { id: "g1", name: "In1", type: "XLR3", dir: "in", count: 2, face: "front", jacks: [] },
        { id: "g2", name: "Out1", type: "XLR3", dir: "out", count: 1, face: "front", jacks: [] },
        { id: "g3", name: "Bi1", type: "XLR3", dir: "bi", count: 3, face: "front", jacks: [] }
      ], img: null, imgRear: null, notes: "", rx: null, ry: null, hideInRouting: null, pushProtect: false }
  ] }];
  S.edges = [];
  S.connections = [];
  const rsvg = win.eval("routingSVG()");
  assert(typeof rsvg === "string" && rsvg.includes("<svg"), "F5: routingSVG() returns an SVG string for placed devices");
  // BiDi ports must NOT appear as green ("in", stroke #3fa46c) or orange ("out", stroke #e08c3c) circles —
  // they get their own blue (#5b82e8) circles in a separate band, consistent with the canvas's bi border color.
  const biCircles = (rsvg.match(/<circle[^>]*stroke="#5b82e8"[^>]*\/>/g) || []);
  assert(biCircles.length === 3, `F5: all 3 BiDi ports render as their own #5b82e8 circles, not bucketed with "in" (got ${biCircles.length})`);
  const inCircles = (rsvg.match(/<circle[^>]*stroke="#3fa46c"[^>]*\/>/g) || []);
  assert(inCircles.length === 2, `F5: exactly the 2 real "in" ports render as #3fa46c circles (BiDi ports no longer inflate this count, got ${inCircles.length})`);
  assert(rsvg.includes(">BiDi<"), 'F5: the BiDi band is labeled "BiDi" (never "Bi") in the static port-layout SVG');
  // dashed separator line marks the top of the BiDi band, distinguishing it from the in/out column pins
  assert(/stroke-dasharray="2,2"/.test(rsvg), "F5: a dashed separator visually distinguishes the BiDi band from the in/out ports");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
