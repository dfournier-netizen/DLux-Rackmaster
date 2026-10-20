// v6.11.6 — standalone Signal Flow export (SVG/PNG at a chosen scale) from the Export dialog.
// The dialog item (#sfExpItem: scope + scale selects, SVG/PNG buttons) is injected dynamically by
// openExportDlg() (same convention as #rgSections — the static dialog markup stays untouched), and
// the export functions reuse the v6.5 elevation-export pipeline (downloadBlob / blob-URL -> <Image>
// -> canvas -> PNG).
//
// KNOWN JSDOM GAP (same as test_elevation_export.js, handoff §7 convention): jsdom has no
// URL.createObjectURL, no image decoder, and no canvas rasterizer. This file stubs
// createObjectURL/revokeObjectURL, HTMLAnchorElement.click, Image (to capture the instance and fire
// onload by hand), HTMLCanvasElement.getContext (recording 2D context), and canvas.toBlob — so the
// full PNG code path (white background fill -> drawImage -> toBlob -> downloadBlob) is structurally
// exercised even though no real pixels exist. Actual raster output must be spot-checked in a browser.
const fs = require("fs");
const { JSDOM } = require("jsdom");
const path = require("path");
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, "build.html"), "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await new Promise(r => setTimeout(r, 150));
  const S = win.eval("S");

  const mkDev = (id, name, pos, rx, ry, ports) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos, color: "#333333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx, ry, hideInRouting: null, pushProtect: false, draw: null, circuit: null, ports });
  const outPorts = () => [{ id: "go", name: "Out", type: "XLR3", dir: "out", count: 1, face: "front", jacks: [] }];
  const inPorts = () => [{ id: "gi", name: "In", type: "XLR3", dir: "in", count: 1, face: "front", jacks: [] }];

  S.meta.name = "My Rig";
  S.racks = [
    { id: "r1", name: "Rack One", sizeU: 12, depth: 20, color: "#123", notes: "", circuits: [], devices: [mkDev("dA", "Console", 1, 100, 100, outPorts())] },
    { id: "r2", name: "Rack Two", sizeU: 12, depth: 20, color: "#123", notes: "", circuits: [], devices: [mkDev("dB", "Amp", 1, 500, 100, inPorts())] },
  ];
  S.edges = [];
  S.connections = [{ id: "c1", a: { dev: "dA", g: "go", i: 0 }, b: { dev: "dB", g: "gi", i: 0 }, label: "Feed", color: "#111111", type: "XLR3", len: 10, notes: "", adapter: "" }];

  // ---- 1. dialog item injected by openExportDlg() ----
  win.eval("openExportDlg()");
  assert(doc.querySelector("#exportDlg").open === true, "1: openExportDlg() opens the dialog");
  const item = doc.querySelector("#sfExpItem");
  assert(!!item, "2: #sfExpItem is injected into the export dialog");
  assert(!!item && item.classList.contains("exp-item"), "3: injected item uses the standard .exp-item structure");
  assert(!!item && item.querySelector(".exp-item-name") && item.querySelector(".exp-item-name").textContent === "Signal flow diagram",
    "4: item name is 'Signal flow diagram'");
  assert(!!item && /routing diagram/.test((item.querySelector(".exp-item-desc") || {}).textContent || ""),
    "5: item carries a .exp-item-desc description");
  const scopeSel = doc.querySelector("#sfScope"), scaleSel = doc.querySelector("#sfScale");
  assert(!!scopeSel && !!scaleSel, "6: scope (#sfScope) and scale (#sfScale) selects are present");
  assert(!!doc.querySelector("#sfExpSvg") && !!doc.querySelector("#sfExpPng"), "7: both SVG (#sfExpSvg) and PNG (#sfExpPng) buttons are present");
  const scopeOpts = scopeSel ? [...scopeSel.options].map(o => o.textContent) : [];
  assert(scopeOpts.length === 3 && scopeOpts[0] === "All racks" && scopeOpts[1] === "Rack One" && scopeOpts[2] === "Rack Two",
    `8: scope select lists All racks + one option per rack (got ${JSON.stringify(scopeOpts)})`);
  const scaleVals = scaleSel ? [...scaleSel.options].map(o => o.value) : [];
  assert(scaleVals.join(",") === "1,2,3,4", `9: scale select offers 1x-4x (got ${scaleVals})`);
  // static chassis untouched — the item exists only after injection, and re-opening doesn't duplicate it
  doc.querySelector("#exportDlg").close();
  S.racks.push({ id: "r3", name: "Rack Three", sizeU: 8, depth: 20, color: "#123", notes: "", circuits: [], devices: [] });
  win.eval("openExportDlg()");
  assert(doc.querySelectorAll("#sfExpItem").length === 1, "10: re-opening the dialog does not duplicate the item");
  const scopeOpts2 = [...doc.querySelector("#sfScope").options].map(o => o.textContent);
  assert(scopeOpts2.length === 4 && scopeOpts2[3] === "Rack Three",
    `11: scope select is repopulated from S.racks on every open (got ${JSON.stringify(scopeOpts2)})`);
  S.racks.pop();
  doc.querySelector("#exportDlg").close();

  // ---- 2. signalFlowSVGString(): standalone SVG structure ----
  const sf = win.eval("signalFlowSVGString(null)");
  assert(typeof sf === "string" && /^<svg/.test(sf) && sf.trim().endsWith("</svg>"), "12: signalFlowSVGString() returns an <svg>...</svg> string");
  assert(sf.includes('xmlns="http://www.w3.org/2000/svg"'), "13: standalone SVG keeps the xmlns declaration");
  const vb = sf.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
  const wh = sf.match(/width="([\d.]+)" height="([\d.]+)"/);
  assert(!!vb && !!wh, "14: standalone SVG has both a viewBox and explicit width/height attributes");
  assert(!!vb && !!wh && +wh[1] === Math.round(+vb[1]) && +wh[2] === Math.round(+vb[2]),
    `15: width/height match the viewBox span (viewBox ${vb && vb[1]}x${vb && vb[2]}, attrs ${wh && wh[1]}x${wh && wh[2]})`);
  const rootTag = sf.slice(0, sf.indexOf(">") + 1);
  assert(!/max-width|border|style="/.test(rootTag), "16: embedding chrome (style attr with max-width/border) is stripped from the root tag");
  assert(sf.includes("Console") && sf.includes("Amp"), "17: unscoped export contains devices from every rack");
  // the embedded (in-guide) variant still carries its styling — the standalone string is a distinct product
  assert(win.eval("routingSVG()").includes("max-width"), "18: routingSVG() itself still returns the embedded (styled) variant for the Rack Guide");

  // ---- 3. scoped variant ----
  const sfScoped = win.eval("signalFlowSVGString('r1')");
  assert(sfScoped.includes("Console") && !sfScoped.includes("Amp"), "19: scoped call contains only that rack's devices");

  // ---- 4. jsdom-gap stubs, then the export functions ----
  assert(typeof win.eval("exportSignalFlowSVG") === "function" && typeof win.eval("exportSignalFlowPNG") === "function",
    "20: exportSignalFlowSVG/exportSignalFlowPNG are defined");
  win.URL.createObjectURL = () => "blob:mock-url";
  win.URL.revokeObjectURL = () => {};
  let capturedName = null;
  win.HTMLAnchorElement.prototype.click = function () { capturedName = this.download; };
  // capture Image instances so the PNG path's onload can be fired by hand (no decoder in jsdom)
  win.eval(`window.__imgs = []; window.Image = function () { const o = {}; window.__imgs.push(o); return o; };`);
  const ctxCalls = { fillRects: [], drawImages: [], fillStyleAtFillRect: [] };
  win.HTMLCanvasElement.prototype.getContext = function () {
    const rec = {
      fillStyle: null,
      fillRect(...a) { ctxCalls.fillRects.push(a); ctxCalls.fillStyleAtFillRect.push(this.fillStyle); },
      drawImage(...a) { ctxCalls.drawImages.push(a); },
    };
    return rec;
  };
  win.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new win.Blob(["fake-png"], { type: "image/png" })); };

  // SVG export: filename + no throw
  let threw = false;
  try { win.eval("exportSignalFlowSVG(null)"); } catch (e) { threw = true; console.log("exportSignalFlowSVG threw:", e.message); }
  assert(!threw, "21: exportSignalFlowSVG(null) does not throw with the jsdom gaps stubbed");
  assert(capturedName === "My Rig - signal flow.svg", `22: all-racks SVG filename is "<rig> - signal flow.svg" (got "${capturedName}")`);
  capturedName = null;
  win.eval("exportSignalFlowSVG('r1')");
  assert(capturedName === "My Rig - signal flow - Rack One.svg", `23: rack-scoped SVG filename appends the rack name (got "${capturedName}")`);

  // PNG export: structural walk of the async pipeline at 3x
  capturedName = null;
  threw = false;
  try { win.eval("exportSignalFlowPNG(null, 3)"); } catch (e) { threw = true; console.log("exportSignalFlowPNG threw:", e.message); }
  assert(!threw, "24: exportSignalFlowPNG() does not throw synchronously");
  const img = win.eval("window.__imgs[window.__imgs.length - 1]");
  assert(!!img && img.src === "blob:mock-url" && typeof img.onload === "function", "25: PNG path wires an Image to the SVG blob URL with an onload handler");
  if (img && typeof img.onload === "function") img.onload();
  const sfAll = win.eval("signalFlowSVGString(null)");
  const whAll = sfAll.match(/width="([\d.]+)" height="([\d.]+)"/);
  const expW = Math.round(+whAll[1] * 3), expH = Math.round(+whAll[2] * 3);
  assert(ctxCalls.fillRects.length === 1 && ctxCalls.fillStyleAtFillRect[0] === "#fff",
    `26: canvas gets a white background fill before the diagram (fillStyle "${ctxCalls.fillStyleAtFillRect[0]}")`);
  assert(ctxCalls.fillRects[0] && ctxCalls.fillRects[0][2] === expW && ctxCalls.fillRects[0][3] === expH,
    `27: the white fill covers the full scaled canvas ${expW}x${expH} (got ${ctxCalls.fillRects[0] && ctxCalls.fillRects[0].slice(2)})`);
  assert(ctxCalls.drawImages.length === 1 && ctxCalls.drawImages[0][3] === expW && ctxCalls.drawImages[0][4] === expH,
    `28: drawImage rasterizes at viewBox-span x 3 (got ${ctxCalls.drawImages[0] && ctxCalls.drawImages[0].slice(1)})`);
  assert(capturedName === "My Rig - signal flow.png", `29: all-racks PNG filename is "<rig> - signal flow.png" (got "${capturedName}")`);
  capturedName = null;
  win.eval("exportSignalFlowPNG('r2', 1)");
  const img2 = win.eval("window.__imgs[window.__imgs.length - 1]");
  if (img2 && typeof img2.onload === "function") img2.onload();
  assert(capturedName === "My Rig - signal flow - Rack Two.png", `30: rack-scoped PNG filename appends the rack name (got "${capturedName}")`);

  // ---- 5. buttons: read scope/scale, close the dialog, export ----
  win.eval("openExportDlg()");
  doc.querySelector("#sfScope").value = "r1";
  capturedName = null;
  doc.querySelector("#sfExpSvg").click();
  assert(doc.querySelector("#exportDlg").open === false, "31: SVG button closes the dialog");
  assert(capturedName === "My Rig - signal flow - Rack One.svg", `32: SVG button exports the selected scope (got "${capturedName}")`);
  win.eval("openExportDlg()");
  doc.querySelector("#sfScope").value = "";
  doc.querySelector("#sfScale").value = "4";
  capturedName = null;
  ctxCalls.drawImages.length = 0;
  doc.querySelector("#sfExpPng").click();
  assert(doc.querySelector("#exportDlg").open === false, "33: PNG button closes the dialog");
  const img3 = win.eval("window.__imgs[window.__imgs.length - 1]");
  if (img3 && typeof img3.onload === "function") img3.onload();
  assert(ctxCalls.drawImages[0] && ctxCalls.drawImages[0][3] === Math.round(+whAll[1] * 4),
    `34: PNG button honors the selected 4x scale (got ${ctxCalls.drawImages[0] && ctxCalls.drawImages[0][3]}, expected ${Math.round(+whAll[1] * 4)})`);
  assert(capturedName === "My Rig - signal flow.png", `35: PNG button exports with the all-racks filename (got "${capturedName}")`);

  // ---- 6. empty-project guard ----
  S.racks = []; S.edges = []; S.connections = [];
  assert(win.eval("signalFlowSVGString(null)") === null, "36: signalFlowSVGString() returns null when nothing is visible (placeholder guard)");
  capturedName = null; threw = false;
  try { win.eval("exportSignalFlowSVG(null)"); win.eval("exportSignalFlowPNG(null, 2)"); } catch (e) { threw = true; console.log("empty-project export threw:", e.message); }
  assert(!threw, "37: empty-project exports do not throw");
  assert(capturedName === null, "38: empty-project exports download nothing");
  assert(doc.querySelector("#toast").textContent === "Nothing to export", `39: empty-project export toasts "Nothing to export" (got "${doc.querySelector("#toast").textContent}")`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
