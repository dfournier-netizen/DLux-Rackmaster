// v6.6 G3 -- per-rack power circuits + load.
// Covers: migrate() backfill (rack.circuits[], device draw/circuit, library template draw, dangling
// circuit-ref healing), circuit CRUD in the Rack panel (add/rename/delete), delete-unassigns-devices +
// toast, load math (circuitLoad/circuitCapacityW/circuitPct) incl. the 80%/100% thresholds, both Device
// Inspector surfaces' Power draw (oninput mutate-only / onchange render) + Circuit dropdown (edge
// devices get no circuit control), Rig Check overload/warning/info messages, and the schedule CSV's
// new columns.
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(process.argv[2] || "build.html", "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

function mkDev(id, name, opts) {
  return Object.assign({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx: null, ry: null, hideInRouting: null, pushProtect: false, draw: null, circuit: null,
    ports: [] }, opts || {});
}

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await new Promise(r => setTimeout(r, 150));
  const S = win.eval("S");

  // ======== 1. migrate() defaults & backfill ========
  assert(Array.isArray(S.racks[0].circuits), "migrate() backfills rack.circuits[] to [] on a fresh project");
  assert(S.library[0].draw === null, "migrate() backfills a library template's draw to null (unknown)");

  S.racks[0].devices.push(mkDev("legacy1", "Legacy Device"));
  delete S.racks[0].circuits;
  delete S.racks[0].devices[S.racks[0].devices.length - 1].draw;
  delete S.racks[0].devices[S.racks[0].devices.length - 1].circuit;
  delete S.edges;
  win.eval("migrate()");
  assert(Array.isArray(S.racks[0].circuits), "migrate() re-backfills a missing rack.circuits[] on a pre-v6.6 project");
  const legacy = S.racks[0].devices.find(d => d.id === "legacy1");
  assert(legacy.draw === null, "migrate() backfills a missing device.draw to null");
  assert(legacy.circuit === null, "migrate() backfills a missing device.circuit to null");
  assert(Array.isArray(S.edges), "migrate() re-backfills S.edges too");

  S.racks[0].circuits = [{ id: "realC", name: "Real", amps: 20, volts: 120 }];
  legacy.circuit = "ghostCircuitId";
  win.eval("migrate()");
  assert(legacy.circuit === null, "migrate() heals a dangling circuit reference (deleted circuit in an old save) back to null");

  // ======== 2. load math ========
  const rack = { id: "rX", name: "Test Rack", sizeU: 20, depth: 20, color: "#111", notes: "", circuits: [
    { id: "cA", name: "A", amps: 20, volts: 120 }, { id: "cB", name: "B", amps: 15, volts: 120 }
  ], devices: [
    mkDev("d1", "Amp1", { draw: 1000, circuit: "cA" }),
    mkDev("d2", "Amp2", { draw: 900, circuit: "cA" }),
    mkDev("d3", "Amp3", { draw: null, circuit: "cA" }),
    mkDev("d4", "Console", { draw: 500, circuit: null })
  ] };
  assert(win.circuitCapacityW(rack.circuits[0]) === 2400, "circuitCapacityW = amps * volts (20A * 120V = 2400W)");
  assert(win.circuitLoad(rack, "cA") === 1900, "circuitLoad sums draw of every device assigned to the circuit (null draw contributes 0)");
  assert(win.circuitLoad(rack, "cB") === 0, "circuitLoad is 0 for a circuit with no assigned devices");
  assert(Math.abs(win.circuitPct(rack, rack.circuits[0]) - 1900 / 2400) < 1e-9, "circuitPct = load / capacity");
  assert(win.circuitLoadClass(0.79) === "ok", "circuitLoadClass: under 80% is ok");
  assert(win.circuitLoadClass(0.8) === "warn", "circuitLoadClass: exactly 80% is warn (>= threshold)");
  assert(win.circuitLoadClass(0.99) === "warn", "circuitLoadClass: 99% is still warn, not over");
  assert(win.circuitLoadClass(1.0) !== "over", "circuitLoadClass: exactly 100% is not over (over is strictly >100%)");
  assert(win.circuitLoadClass(1.01) === "over", "circuitLoadClass: just past 100% is over");
  assert(win.circuitLoadClass(1.5) === "over", "circuitLoadClass: well past 100% is over");

  // ======== 3. Rack panel UI: circuit CRUD ========
  S.racks = [rack];
  S.edges = [];
  S.ui.view = "racks"; S.ui.selRack = "rX"; S.ui.face = "front"; S.ui.selDev = null;
  win.eval("render()");
  assert(!!doc.querySelector("#circuitsSection"), "Rack panel renders a Power circuits section");
  const rows = doc.querySelectorAll("#circuitList .circuit-row");
  assert(rows.length === 2, "Power circuits section lists both existing circuits");
  const fillA = doc.querySelector('#circuitList [data-id="cA"] .circuit-load-fill');
  assert(!!fillA && fillA.classList.contains("ok"), "circuit A's load bar (79.2%) gets the ok class");

  doc.querySelector("#addCircuit").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(rack.circuits.length === 3, "+ Circuit adds a new circuit (default 20A/120V)");
  const added = rack.circuits[2];
  assert(added.amps === 20 && added.volts === 120, "new circuit defaults to 20A/120V");

  win.eval("render()");
  const nameInput = doc.querySelector('#circuitList [data-id="' + added.id + '"] [data-k="name"]');
  nameInput.value = "Renamed Circuit";
  nameInput.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(rack.circuits[2].name === "Renamed Circuit", "renaming a circuit via the list editor updates its name");

  win.eval("render()");
  const delBtn = doc.querySelector('#circuitList [data-id="cA"] [data-del]');
  delBtn.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(!rack.circuits.some(c => c.id === "cA"), "deleting circuit cA removes it from rack.circuits");
  assert(rack.devices.find(d => d.id === "d1").circuit === null, "deleting a circuit unassigns devices that referenced it (d1)");
  assert(rack.devices.find(d => d.id === "d2").circuit === null, "deleting a circuit unassigns devices that referenced it (d2)");
  const toastEl = doc.querySelector("#toast");
  assert(toastEl && /unassigned/i.test(toastEl.textContent), "deleting a circuit with assigned devices shows an unassigned toast");

  // ======== 4a. Racks-view Inspector: Power draw + Circuit dropdown (rack devices only) ========
  rack.circuits = [{ id: "cA", name: "A", amps: 20, volts: 120 }];
  rack.devices = [mkDev("d1", "Amp1", { draw: 250, circuit: "cA" })];
  S.ui.selDev = "d1";
  win.eval("render()");
  const drawInput = doc.querySelector('[data-k="draw"]');
  assert(!!drawInput, "Racks-view Inspector shows a Power draw (W) field for a rack device");
  assert(drawInput.value === "250", "Power draw field reflects the device's current draw");
  const circuitSel = doc.querySelector('[data-k="circuit"]');
  assert(!!circuitSel, "Racks-view Inspector shows a Circuit dropdown for a rack device");
  assert(circuitSel.value === "cA", "Circuit dropdown reflects the device's current assignment");

  const inputBefore = doc.querySelector('[data-k="draw"]');
  inputBefore.value = "300";
  inputBefore.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(rack.devices[0].draw === 300, "typing in Power draw (oninput) mutates the device's draw value immediately");
  const inputAfter = doc.querySelector('[data-k="draw"]');
  assert(inputBefore === inputAfter, "oninput on Power draw does NOT trigger a re-render (same DOM node survives)");

  inputAfter.value = "400";
  inputAfter.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(rack.devices[0].draw === 400, "onchange (blur/Enter) on Power draw commits the final value");

  const drawInput2 = doc.querySelector('[data-k="draw"]');
  drawInput2.value = "";
  drawInput2.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(rack.devices[0].draw === null, "clearing the Power draw field sets draw back to null (unknown), not 0");

  win.eval("render()");
  const circuitSel2 = doc.querySelector('[data-k="circuit"]');
  circuitSel2.value = "";
  circuitSel2.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(rack.devices[0].circuit === null, "selecting Unassigned in the Circuit dropdown clears the device's circuit");

  // ======== 4b. Routing/Rig side-panel device editor (#rtDevEd) -- the OTHER inspector surface, and the
  //             only one that ever shows an edge device. Same fields; edge exclusion enforced there. ========
  S.racks = [rack];
  S.edges = [mkDev("e1", "Edge Console", { draw: 50 })];
  S.ui.view = "rig";
  S.ui.selDev = "d1";
  win.eval("render()");
  assert(!!doc.querySelector("#rtDevDraw"), "Routing/Rig side panel shows a Power draw (W) field for a rack device");
  assert(!!doc.querySelector("#rtDevCircuit"), "Routing/Rig side panel shows a Circuit dropdown for a rack device");
  const rtDraw = doc.querySelector("#rtDevDraw");
  rtDraw.value = "777";
  rtDraw.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(rack.devices.find(d => d.id === "d1").draw === 777, "Routing/Rig panel's Power draw oninput mutates immediately");
  assert(doc.querySelector("#rtDevDraw") === rtDraw, "Routing/Rig panel's Power draw oninput does not re-render (same node survives)");
  rtDraw.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(rack.devices.find(d => d.id === "d1").draw === 777, "Routing/Rig panel's Power draw onchange commits without losing the value");

  S.ui.selDev = "e1";
  win.eval("render()");
  assert(!!doc.querySelector("#rtDevDraw"), "edge devices still get a Power draw field in the Routing/Rig panel");
  assert(!doc.querySelector("#rtDevCircuit"), "edge devices do NOT get a Circuit dropdown (no parent rack) in the Routing/Rig panel");
  S.ui.view = "racks"; S.ui.selDev = null;

  // ======== 5. Rig Check integration ========
  rack.circuits = [
    { id: "over", name: "Overloaded", amps: 15, volts: 120 },
    { id: "warnC", name: "Near-limit", amps: 20, volts: 120 },
    { id: "fineC", name: "Fine", amps: 20, volts: 120 }
  ];
  rack.devices = [
    mkDev("dOver1", "Big Amp", { draw: 2000, circuit: "over" }),
    mkDev("dWarn1", "Med Amp", { draw: 2100, circuit: "warnC" }),
    mkDev("dFine1", "Small Amp", { draw: 200, circuit: "fineC" }),
    mkDev("dNoCirc", "Unassigned Powered", { draw: 75, circuit: null })
  ];
  S.racks = [rack]; S.edges = [];
  S.connections = [];
  const probs = win.rigCheck();
  const rackPower = probs.filter(p => p.scope === "Rack Power");
  assert(rackPower.some(p => p.sev === "err" && /Overloaded/.test(p.msg)), "Rig Check flags an overloaded circuit (>100%) as an error");
  assert(rackPower.some(p => p.sev === "warn" && /Near-limit/.test(p.msg)), "Rig Check flags a near-limit circuit (>=80%, <=100%) as a warning");
  assert(!rackPower.some(p => /Fine/.test(p.msg)), "Rig Check says nothing about a circuit well under 80%");
  assert(rackPower.some(p => p.sev === "info" && /Unassigned Powered/.test(p.msg) && /no circuit/i.test(p.msg)),
    "Rig Check flags a powered device (draw>0) with no circuit as info");
  const fineDeviceProbs = rackPower.filter(p => /Small Amp/.test(p.msg));
  assert(fineDeviceProbs.length === 0, "a device with an assigned circuit and low load isn't flagged");

  // ======== 6. Schedule CSV columns ========
  rack.circuits = [{ id: "cA", name: "House A", amps: 20, volts: 120 }];
  rack.devices = [
    mkDev("dA", "Source", { draw: 300, circuit: "cA", ports: [{ id: "g1", name: "Out", type: "XLR3", dir: "out", count: 1, face: "rear", jacks: [] }] }),
    mkDev("dB", "Sink", { draw: null, circuit: null, ports: [{ id: "g2", name: "In", type: "XLR3", dir: "in", count: 1, face: "rear", jacks: [] }] })
  ];
  S.racks = [rack]; S.edges = [];
  S.connections = [{ id: "cX", a: { dev: "dA", g: "g1", i: 0 }, b: { dev: "dB", g: "g2", i: 0 },
    label: "", color: "#333", type: "XLR3", len: 24, notes: "", adapter: "" }];
  const csv = win.eval("scheduleCSV()");
  const headerLine = csv.split("\n")[0];
  assert(/From Circuit/.test(headerLine) && /From Draw/.test(headerLine), "schedule CSV header gains From Circuit / From Draw columns");
  assert(/To Circuit/.test(headerLine) && /To Draw/.test(headerLine), "schedule CSV header gains To Circuit / To Draw columns");
  const dataLine = csv.split("\n")[1];
  assert(/House A/.test(dataLine), "schedule CSV data row includes the From device's circuit name");
  assert(/300/.test(dataLine), "schedule CSV data row includes the From device's draw value");

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
