// jsdom smoke/assertion suite for DLux Rackmaster v6.3
// Usage: node test_suite_v6.3.js [path-to-build.html]
// Requires `npm install jsdom` (run from wherever this file lives, or point NODE_PATH at a jsdom install).
// Defaults to the v6.3 build shipped alongside this file; pass a path to test a later build instead.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const target = process.argv[2] || path.join(__dirname, "build.html");
const html = fs.readFileSync(target, "utf-8");

let pass = 0, fail = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { pass++; }
  else { fail++; failures.push(label); console.log("FAIL:", label); }
}

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 80));

  const S = () => win.eval("S");
  const MSEL = () => win.eval("MSEL");
  const setMselDevs = (arr) => win.eval(`MSEL.devs = ${JSON.stringify(arr)}`);

  assert(typeof S() === "object" && S(), "boot: global state S exists");
  assert(!!doc.getElementById("view"), "boot: #view mounted");
  assert(typeof win.render === "function", "boot: render() exposed");
  assert(!!win.RP && typeof win.RP.getState === "function", "boot: RP lighting bridge exposed");

  S().ui.view = "racks"; win.render();
  assert(doc.querySelector("#view .center") || doc.querySelector("#view .empty-note"), "views: racks view renders");
  S().ui.view = "routing"; win.render();
  assert(doc.querySelector("#routeCanvas"), "views: routing view renders #routeCanvas");
  S().ui.view = "rig"; win.render();
  assert(doc.querySelector("#routeCanvas"), "views: rig view renders #routeCanvas");
  S().ui.view = "lighting"; win.render();
  assert(doc.getElementById("rpRoot").style.display !== "none", "views: lighting view shows rpRoot");

  function freshRig() {
    const s = S();
    s.racks = [];
    s.edges = [];
    s.connections = [];
    const rack = { id: "R1", name: "Rack A", sizeU: 20, depth: 20, color: "#111", notes: "", devices: [] };
    s.racks.push(rack);
    const mkDev = (id, pos, u) => ({
      id, tplId: null, name: "Dev " + id, cat: "Misc", u, w: "full", side: "L",
      mount: "front", depth: 10, inOff: null, pos, color: "#4a5568", isContainer: false,
      contents: [], ports: [{ id: "p" + id, name: "Port", type: "XLR3", dir: "bi", count: 1, face: "rear", jacks: [] }],
      fields: [], img: null, imgRear: null, notes: "", rx: 40 + (pos * 5), ry: 40 + (pos * 5)
    });
    rack.devices.push(mkDev("d1", 1, 2));
    rack.devices.push(mkDev("d2", 4, 2));
    rack.devices.push(mkDev("d3", 8, 2));
    s.ui.selRack = "R1";
    s.ui.selDev = null;
    win.eval('MSEL = { conns: [], ports: [], devs: [] }');
    return rack;
  }

  // ---- Racks multi-select ----
  freshRig();
  S().ui.view = "racks"; win.render();
  let devEls = doc.querySelectorAll(".dev");
  assert(devEls.length === 3, "racks-msel: 3 device elements rendered");
  const clickDev = (el, shift) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, shiftKey: !!shift }));
  clickDev(doc.querySelector('.dev[data-dev="d1"]'), true);
  clickDev(doc.querySelector('.dev[data-dev="d2"]'), true);
  assert(MSEL().devs.length === 2 && MSEL().devs.includes("d1") && MSEL().devs.includes("d2"), "racks-msel: shift-click selects d1+d2");
  win.render();
  assert(doc.querySelector('.dev[data-dev="d1"]').classList.contains("msel"), "racks-msel: msel class applied to d1");
  assert(doc.querySelector('.dev[data-dev="d2"]').classList.contains("msel"), "racks-msel: msel class applied to d2");
  clickDev(doc.querySelector('.dev[data-dev="d1"]'), true);
  assert(MSEL().devs.length === 1 && MSEL().devs[0] === "d2", "racks-msel: shift-click toggles d1 off");
  clickDev(doc.querySelector('.dev[data-dev="d3"]'), false);
  assert(MSEL().devs.length === 0 && S().ui.selDev === "d3", "racks-msel: plain click clears group, selects single dev");

  // ---- Group nudge (all-or-nothing) ----
  freshRig();
  S().ui.view = "racks"; win.render();
  setMselDevs(["d1", "d2"]);
  let rack = S().racks[0];
  const before = rack.devices.map(d => ({ id: d.id, pos: d.pos }));
  win.nudgeDevs(["d1", "d2"], +1);
  let d1 = rack.devices.find(d => d.id === "d1"), d2 = rack.devices.find(d => d.id === "d2");
  assert(d1.pos === before.find(x => x.id === "d1").pos + 1 && d2.pos === before.find(x => x.id === "d2").pos + 1,
    "group-nudge: both devices move together when unblocked");
  rack.devices.find(d => d.id === "d2").pos = 6;
  win.nudgeDevs(["d1", "d2"], +2);
  d1 = rack.devices.find(d => d.id === "d1"); d2 = rack.devices.find(d => d.id === "d2");
  assert(d2.pos === 6, "group-nudge: blocked move leaves BOTH devices untouched (all-or-nothing)");

  // ---- Bulk clipboard ----
  freshRig();
  S().ui.view = "racks"; win.render();
  win.copyDevs(["d1", "d2"]);
  assert(Array.isArray(win.eval("CLIP_MULTI")) && win.eval("CLIP_MULTI").length === 2, "bulk-clip: copyDevs populates CLIP_MULTI");
  setMselDevs(["d1", "d2"]);
  const nBefore = S().racks[0].devices.length;
  ["d1", "d2"].forEach(id => win.removeDevice(id));
  setMselDevs([]);
  assert(S().racks[0].devices.length === nBefore - 2, "bulk-clip: bulk delete removes both devices");
  win.pasteDevs();
  assert(S().racks[0].devices.length === nBefore, "bulk-clip: pasteDevs re-adds the copied group");
  assert(MSEL().devs.length === 2, "bulk-clip: pasteDevs selects the newly placed clones");

  // ---- Rig: shift-click node selection + group-drag math ----
  freshRig();
  S().ui.view = "rig"; win.render();
  let nodeD1 = doc.querySelector('.node[data-dev="d1"] .node-head');
  let nodeD2 = doc.querySelector('.node[data-dev="d2"] .node-head');
  assert(nodeD1 && nodeD2, "rig: node headers render for d1/d2");
  const pdown = (el, x, y, shift) => el.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, button: 0, shiftKey: !!shift }));
  pdown(nodeD1, 0, 0, true);
  pdown(nodeD2, 0, 0, true);
  assert(MSEL().devs.includes("d1") && MSEL().devs.includes("d2"), "rig: shift-click on node headers multi-selects");
  const rd1 = win.findDev("d1").dev, rd2 = win.findDev("d2").dev;
  const rx1 = rd1.rx, ry1 = rd1.ry, rx2 = rd2.rx, ry2 = rd2.ry;
  win.render();
  nodeD1 = doc.querySelector('.node[data-dev="d1"] .node-head');
  nodeD1.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100, button: 0 }));
  doc.dispatchEvent(new win.PointerEvent("pointermove", { bubbles: true, clientX: 140, clientY: 130 }));
  doc.dispatchEvent(new win.PointerEvent("pointerup", { bubbles: true, clientX: 140, clientY: 130 }));
  assert(Math.abs((rd1.rx - rx1) - 40) < 0.5 && Math.abs((rd1.ry - ry1) - 30) < 0.5, "rig-group-drag: dragged node (d1) moved by delta");
  assert(Math.abs((rd2.rx - rx2) - 40) < 0.5 && Math.abs((rd2.ry - ry2) - 30) < 0.5, "rig-group-drag: co-selected node (d2) moved by the same delta");

  // ---- Rig: collapsed rack-node + edge device group-drag ----
  freshRig();
  S().ui.view = "rig"; win.render();
  const s2 = S();
  s2.ui.rigCollapsed = s2.ui.rigCollapsed || {};
  s2.ui.rigCollapsed["R1"] = true;
  s2.edges.push({ id: "e1", name: "Console", cat: "Edge", u: 1, color: "#333", isContainer: false,
    ports: [{ id: "eg1", name: "Port", type: "EtherCON", dir: "bi", count: 1, face: "rear", jacks: [] }], // v6.4: devices with zero ports are now auto-hidden from Routing/Rig, so this fixture needs at least one
    fields: [], notes: "", contents: [], w: "full", side: "L", mount: "front", depth: null, inOff: null, rx: 300, ry: 300 });
  win.render();
  const rackNodeHead = doc.querySelector('.rack-node[data-rack="R1"] .rg-head');
  const edgeHead = doc.querySelector('.node[data-dev="e1"] .node-head');
  assert(rackNodeHead && edgeHead, "rig-collapsed: rack-node + edge node render");
  pdown(rackNodeHead, 0, 0, true);
  pdown(edgeHead, 0, 0, true);
  assert(MSEL().devs.includes("rack:R1") && MSEL().devs.includes("e1"), "rig-collapsed: shift-click selects rack container + edge device together");
  const rackObj = S().racks[0], edgeObj = S().edges[0];
  const grx0 = rackObj.grx, gry0 = rackObj.gry, erx0 = edgeObj.rx;
  win.render();
  const rnHead2 = doc.querySelector('.rack-node[data-rack="R1"] .rg-head');
  rnHead2.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, clientX: 50, clientY: 50, button: 0 }));
  doc.dispatchEvent(new win.PointerEvent("pointermove", { bubbles: true, clientX: 70, clientY: 90 }));
  doc.dispatchEvent(new win.PointerEvent("pointerup", { bubbles: true, clientX: 70, clientY: 90 }));
  assert(Math.abs((rackObj.grx - grx0) - 20) < 0.5, "rig-collapsed-group-drag: dragging collapsed rack moves the rack");
  assert(Math.abs((edgeObj.rx - erx0) - 20) < 0.5, "rig-collapsed-group-drag: co-selected edge device moves with it");

  // ---- Zoom / viewport scroll preservation ----
  freshRig();
  S().ui.view = "racks"; S().ui.zoomRack = 1;
  win.render();
  let centerEl = doc.querySelector("#view .center");
  Object.defineProperty(centerEl, "scrollLeft", { value: 120, writable: true });
  Object.defineProperty(centerEl, "scrollTop", { value: 80, writable: true });
  S().ui.zoomRack = 1.5;
  win.render();
  centerEl = doc.querySelector("#view .center");
  assert(Math.abs(centerEl.scrollLeft - 120 * 1.5) < 0.01, "zoom-fix: racks scrollLeft rescaled by zoom ratio, not reset to 0");
  assert(Math.abs(centerEl.scrollTop - 80 * 1.5) < 0.01, "zoom-fix: racks scrollTop rescaled by zoom ratio, not reset to 0");

  Object.defineProperty(centerEl, "scrollLeft", { value: 200, writable: true });
  Object.defineProperty(centerEl, "scrollTop", { value: 60, writable: true });
  S().ui.showLabels = !S().ui.showLabels;
  win.render();
  centerEl = doc.querySelector("#view .center");
  assert(Math.abs(centerEl.scrollLeft - 200) < 0.01 && Math.abs(centerEl.scrollTop - 60) < 0.01,
    "zoom-fix: an unrelated commit (label toggle) preserves exact scroll position");

  S().ui.view = "rig"; S().ui.zoomRoute = 1; win.render();
  let rcEl = doc.querySelector("#routeCanvas");
  Object.defineProperty(rcEl, "scrollLeft", { value: 90, writable: true });
  Object.defineProperty(rcEl, "scrollTop", { value: 40, writable: true });
  S().ui.zoomRoute = 0.5;
  win.render();
  rcEl = doc.querySelector("#routeCanvas");
  assert(Math.abs(rcEl.scrollLeft - 90 * 0.5) < 0.01, "zoom-fix: rig/routing scrollLeft rescaled on zoom-out");
  assert(Math.abs(rcEl.scrollTop - 40 * 0.5) < 0.01, "zoom-fix: rig/routing scrollTop rescaled on zoom-out");

  S().ui.view = "racks"; win.render();
  assert(!!doc.querySelector("#view .center"), "zoom-fix: view switch away from rig renders racks cleanly (no stale scroll crash)");

  // ---- Regression: autosave + import round-trip via load() ----
  freshRig();
  win.save();
  const raw = win.localStorage.getItem("dlux-rackmaster-v1");
  assert(!!raw && JSON.parse(raw).racks.length === 1, "regression: save() persists state to localStorage");
  win.load(); // re-reads localStorage into a fresh S + migrate()
  win.render();
  assert(S().racks.length === 1 && S().racks[0].devices.length === 3, "regression: load()+migrate() round-trips saved state");

  // ---- Regression: Rig Check ----
  freshRig();
  const findings = win.rigCheck ? win.rigCheck() : null;
  assert(Array.isArray(findings), "regression: rigCheck() still returns a findings array");

  // ---- Lighting Devices: shift-click multi-select + bulk delete ----
  S().ui.view = "lighting"; win.render();
  const rpWrap = win.RP.getState();
  rpWrap.state.devices = [
    { id: "ld1", kind: "node", name: "Node 1", x: 0, y: 0, z: 1500, placed: true, inputs: 1, outputs: 2 },
    { id: "ld2", kind: "node", name: "Node 2", x: 0, y: 0, z: 1500, placed: true, inputs: 1, outputs: 2 },
    { id: "ld3", kind: "node", name: "Node 3", x: 0, y: 0, z: 1500, placed: true, inputs: 1, outputs: 2 }
  ];
  win.RP.setState(rpWrap);
  const shadow = doc.getElementById("rpRoot").shadowRoot;
  const devTabBtn = [...shadow.querySelectorAll(".tab")].find(b => /device/i.test(b.textContent));
  if (devTabBtn) devTabBtn.click();
  if (win.RP.refresh) win.RP.refresh();
  let headEls = shadow.querySelectorAll("#devicesList .panel-head");
  assert(headEls.length === 3, "lighting-msel: 3 device panels render in the Devices tab");
  const shiftClick = el => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, shiftKey: true }));
  shiftClick(headEls[0]); shiftClick(headEls[1]);
  const bulkBar = shadow.getElementById("devicesBulkBar");
  assert(bulkBar && bulkBar.style.display !== "none", "lighting-msel: bulk bar appears after shift-selecting 2 devices");
  const delBtn = shadow.getElementById("devicesBulkDel");
  win.confirm = () => true;
  delBtn.click();
  const st2 = win.RP.getState().state;
  assert(st2.devices.length === 1 && st2.devices[0].id === "ld3", "lighting-msel: bulk delete removes only the 2 selected devices");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("Failures:", failures.join(" | ")); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error("SUITE CRASHED:", e && e.stack || e && e.message || e); process.exit(1); });
