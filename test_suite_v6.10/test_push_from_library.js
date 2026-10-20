const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(process.argv[2] || require("path").join(__dirname, "build.html"), "utf-8");
let pass=0, fail=0;
function assert(c,l){ if(c){pass++;} else {fail++; console.log("FAIL:",l);} }

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 80));
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const S = () => win.eval("S");
  const s = S();

  const tpl = { id: "T1", name: "Amp Rack Unit", cat: "Audio", u: 2, w: "full", color: "#111111", isContainer: false,
    ports: [
      { id: "tg1", name: "Input", type: "XLR3", dir: "in", count: 2, face: "rear", color: "", jacks: [] },
      { id: "tg2", name: "Output", type: "XLR3", dir: "out", count: 2, face: "rear", color: "", jacks: [] }
    ],
    fields: [{ id: "tf1", key: "Power (W)", value: "" }], notes: "", contents: [], depth: 10, img: null, imgRear: null };
  s.library = [tpl];

  const mkInst = (id, pos, extra) => Object.assign({
    id, tplId: "T1", name: "Amp #" + id, cat: "Audio", u: 2, w: "full", side: "L", mount: "front", depth: 10, inOff: null,
    pos, color: "#456", isContainer: false, contents: [], notes: "custom note " + id, img: null, imgRear: null,
    fields: [{ id: "f" + id, key: "IP", value: "10.0.0." + id }], hideInRouting: null, pushProtect: false,
    ports: [
      { id: "g1" + id, name: "Input", type: "XLR3", dir: "in", count: 2, face: "rear", color: "", jacks: [{ label: "Kick In", fields: [] }, { label: "", fields: [] }] },
      { id: "g2" + id, name: "Output", type: "XLR3", dir: "out", count: 2, face: "rear", color: "", jacks: [] }
    ]
  }, extra || {});

  s.racks = [{ id: "R1", name: "Rack A", sizeU: 20, depth: 20, color: "#111", notes: "", devices: [
    mkInst("1", 1), mkInst("2", 5, { pushProtect: true }) // #2 is protected
  ]}];
  s.edges = [];
  s.connections = [];
  s.ui.view = "library"; s.ui.selTpl = "T1"; s.ui.selRack = "R1";
  win.render();

  // ---- template editor no longer has the removed Mount field (regression from task 9), and shows Push button ----
  const pushBtn = doc.getElementById("pushTpl");
  assert(!!pushBtn, "Library template editor has a 'Push to instances' button");

  // ---- change the template: add a port, bump height, recolor, rename ----
  tpl.u = 3;
  tpl.color = "#ff0000";
  tpl.ports.push({ id: "tg3", name: "Sidechain", type: "TRS 1/4\"", dir: "in", count: 1, face: "front", color: "", jacks: [] });
  tpl.fields.push({ id: "tf2", key: "Circuit", value: "" });
  tpl.name = "Amp Rack Unit V2";

  pushBtn.click();
  const dlg = doc.getElementById("pickerDlg");
  assert(dlg.open === true, "clicking Push opens the options dialog");
  const nameCb = doc.querySelector('[data-po="name"]');
  assert(nameCb && !nameCb.checked, "Name checkbox defaults UNCHECKED (renaming instances is opt-in)");
  const portsCb = doc.querySelector('[data-po="ports"]');
  assert(portsCb && portsCb.checked, "Ports checkbox defaults checked");

  doc.getElementById("pushApply").click();

  const inst1 = s.racks[0].devices.find(d => d.id === "1");
  const inst2 = s.racks[0].devices.find(d => d.id === "2");

  assert(inst1.name === "Amp #1", "unprotected instance keeps its custom name (Name was unchecked)");
  assert(inst1.color === "#ff0000", "unprotected instance picks up the new color");
  assert(inst1.u === 3, "unprotected instance picks up the new height (no collision here)");
  assert(inst1.ports.length === 3, "unprotected instance gains the new 3rd port group");
  assert(inst1.ports[0].id === "g11", "existing port group #1 keeps its own id (in-place sync, not replaced)");
  assert(inst1.ports[0].jacks[0].label === "Kick In", "per-jack custom label on port 1 survives the push");
  assert(inst1.fields.some(f => f.key === "IP" && f.value === "10.0.0.1"), "existing field VALUE (IP) is untouched by the push");
  assert(inst1.fields.some(f => f.key === "Circuit"), "new field KEY (Circuit) from the template is added");
  assert(inst1.notes === "custom note 1", "instance notes are never touched by push");

  assert(inst2.pushProtect === true, "protected instance flag unchanged");
  assert(inst2.color !== "#ff0000", "protected instance is skipped entirely by the push");
  assert(inst2.u === 2, "protected instance's height is untouched");

  // ---- Inspector shows the Protect from push checkbox for template-derived instances ----
  s.ui.view = "racks"; s.ui.selDev = "1"; win.render();
  const protectCb = doc.querySelector('.sidebar.right input[data-k="pushProtect"]');
  assert(!!protectCb, "Inspector shows the Protect from push checkbox for a template-derived instance");
  assert(!protectCb.checked, "checkbox reflects unprotected state for instance #1");
  protectCb.checked = true;
  protectCb.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(s.racks[0].devices.find(d => d.id === "1").pushProtect === true, "toggling the checkbox sets pushProtect on the instance");

  // ---- dimension-collision case: pushing a height increase that would collide should skip that instance only ----
  s.racks[0].devices.find(d => d.id === "1").pushProtect = false;
  s.racks[0].devices.find(d => d.id === "1").u = 2; // reset
  s.racks[0].devices.push(mkInst("3", 3)); // occupies U3-4, right above inst1 (U1-2) -> growing inst1 to 3U (U1-3) would collide
  tpl.u = 3;
  s.ui.view = "library"; win.render();
  doc.getElementById("pushTpl").click();
  doc.getElementById("pushApply").click(); // all checkboxes still at their prior (checked-by-default, minus name) state
  const inst1b = s.racks[0].devices.find(d => d.id === "1");
  const inst3 = s.racks[0].devices.find(d => d.id === "3");
  assert(inst1b.u === 2, "instance whose growth would collide keeps its old height (dimension push skipped for it)");
  assert(inst3.color === "#ff0000", "meanwhile the newly-added instance still gets non-dimension pushes applied");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
