// v6.5 — Part C regression: BiDi ports render in their own bottom-edge zone (.node-ports-bottom),
// not bucketed into the left ("in") column as before. UI copy must say "BiDi", never "Bi".
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

  const dev = { id: "d1", tplId: null, name: "Multi-port Dev", cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 1, color: "#222222", isContainer: false, contents: [], fields: [],
    ports: [
      { id: "g1", name: "In1", type: "XLR3", dir: "in", count: 2, face: "front", jacks: [] },
      { id: "g2", name: "Out1", type: "XLR3", dir: "out", count: 1, face: "front", jacks: [] },
      { id: "g3", name: "Bi1", type: "XLR3", dir: "bi", count: 3, face: "front", jacks: [] }
    ], img: null, imgRear: null, notes: "", rx: 40, ry: 40, hideInRouting: null, pushProtect: false };
  S.racks = [{ id: "r1", name: "R1", sizeU: 12, depth: 20, color: "#123456", notes: "", devices: [dev] }];
  S.ui.view = "routing";
  S.ui.routingRackOnly = "r1";
  win.eval("render()");

  const node = doc.querySelector('.node[data-dev="d1"]');
  assert(!!node, "device node rendered");

  const bottomZone = node.querySelector(".node-ports-bottom");
  assert(!!bottomZone, "Part C: .node-ports-bottom zone exists for a device with BiDi ports");
  const bottomPins = bottomZone ? [...bottomZone.querySelectorAll(".pin")] : [];
  assert(bottomPins.length === 3, `Part C: all 3 BiDi ports render inside the bottom zone (got ${bottomPins.length})`);
  assert(bottomPins.every(p => p.dataset.dir === "bi"), "Part C: every pin in the bottom zone has data-dir=bi");

  const leftCol = node.querySelector(".np-col:not(.outs)");
  const rightCol = node.querySelector(".np-col.outs");
  assert(!!leftCol && !!rightCol, "found left (in) and right (out) columns");
  const leftPins = [...leftCol.querySelectorAll(".pin")];
  const rightPins = [...rightCol.querySelectorAll(".pin")];
  assert(leftPins.length === 2 && leftPins.every(p => p.dataset.dir === "in"), "Part C: left column holds only the 2 'in' ports, no 'bi'");
  assert(rightPins.length === 1 && rightPins.every(p => p.dataset.dir === "out"), "Part C: right column holds only the 'out' port");
  assert(!leftCol.querySelector('.pin[data-dir="bi"]'), "Part C: no BiDi pin leaked into the left column (the old bug)");
  assert(!rightCol.querySelector('.pin[data-dir="bi"]'), "Part C: no BiDi pin leaked into the right column");

  // UI copy: "BiDi", never "Bi"
  const zoneLabel = bottomZone.querySelector(".bidi-zone-label");
  assert(!!zoneLabel, "bottom zone has a label");
  assert(zoneLabel && zoneLabel.textContent.trim() === "BiDi", `Part C copy: bottom zone label says "BiDi" (got "${zoneLabel && zoneLabel.textContent}")`);

  // pin-rename / click-to-connect data attributes preserved on bottom-zone pins (unchanged interaction contract)
  const firstBiPin = bottomPins[0];
  assert(firstBiPin.dataset.dev === "d1" && firstBiPin.dataset.g === "g3", "Part C: bottom-zone pin keeps data-dev/data-g for click-to-connect + pinCenter()");
  const pinRow = firstBiPin.closest(".pin-row");
  assert(!!pinRow, "Part C: bottom-zone pin still wrapped in .pin-row (dblclick-rename target selector unchanged)");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
