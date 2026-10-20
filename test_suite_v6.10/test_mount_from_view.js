const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(process.argv[2] || require("path").join(__dirname, "build.html"), "utf-8");
let pass=0, fail=0;
function assert(c,l){ if(c){pass++;} else {fail++; console.log("FAIL:",l);} }

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 80));
  const S = () => win.eval("S");
  // jsdom doesn't implement <dialog> show/close — stub it so the app's real dialog code runs untouched
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };

  const s = S();
  s.library = s.library.length ? s.library : [];
  const tpl = { id: "T1", name: "Amp", cat: "Audio", u: 2, w: "full", color: "#456", isContainer:false,
    ports: [{id:"pg1",name:"XLR",type:"XLR3",dir:"bi",count:2,face:"rear",jacks:[]}], fields:[], notes:"",
    contents:[], depth: 10 };
  s.library.push(tpl);
  s.racks = [{ id:"R1", name:"Rack A", sizeU:20, depth:20, color:"#111", notes:"", devices:[] }];
  s.edges = []; s.connections = [];
  s.ui.selRack = "R1"; s.ui.selDev = null; s.ui.view = "racks";

  // ---- 1. drop on FRONT panel -> mount front ----
  s.ui.face = "front"; win.render();
  win.eval(`DRAG.payload = "tpl:T1"`);
  let inner = doc.querySelector(".rack-inner");
  let rect = { top: 0, left: 0, width: 400 };
  inner.getBoundingClientRect = () => rect;
  inner.dispatchEvent(new win.MouseEvent("dragover", { bubbles: true, cancelable: true, clientY: 100, clientX: 50 }));
  inner.dispatchEvent(new win.MouseEvent("drop", { bubbles: true, cancelable: true }));
  win.eval(`DRAG.payload = null`);
  let dev = s.racks[0].devices[0];
  assert(dev && dev.mount === "front", "front-panel drop -> mount front (got " + (dev&&dev.mount) + ")");

  // ---- 2. drop on REAR panel while viewing "both" -> mount rear ----
  s.racks[0].devices = [];
  s.ui.face = "both"; win.render();
  const panels = doc.querySelectorAll(".rack-inner");
  assert(panels.length === 2, "both view renders two rack-inner panels (front+rear), got " + panels.length);
  const rearInner = panels[1];
  rearInner.getBoundingClientRect = () => rect;
  win.eval(`DRAG.payload = "tpl:T1"`);
  rearInner.dispatchEvent(new win.MouseEvent("dragover", { bubbles: true, cancelable: true, clientY: 100, clientX: 50 }));
  rearInner.dispatchEvent(new win.MouseEvent("drop", { bubbles: true, cancelable: true }));
  win.eval(`DRAG.payload = null`);
  dev = s.racks[0].devices[0];
  assert(dev && dev.mount === "rear", "rear-panel drop (both view) -> mount rear (got " + (dev&&dev.mount) + ")");

  // ---- 3. double-click empty slot in front view -> opens picker -> choosing tpl -> mount front ----
  s.racks[0].devices = [];
  s.ui.face = "front"; win.render();
  inner = doc.querySelector(".rack-inner");
  inner.getBoundingClientRect = () => rect;
  inner.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true, cancelable: true, clientY: 100, clientX: 50 }));
  let libItem = doc.querySelector("#pickerBody .lib-item[data-id='T1']");
  assert(!!libItem, "picker dialog opened with the template listed");
  libItem.dispatchEvent(new win.Event("click", { bubbles: true }));
  dev = s.racks[0].devices[0];
  assert(dev && dev.mount === "front", "dblclick-picker (front view) -> mount front (got " + (dev&&dev.mount) + ")");

  // ---- 4. side view (right) double-click empty space -> mount inside, side R ----
  s.racks[0].devices = [];
  s.ui.face = "right"; win.render();
  const holder = doc.querySelector(".rack-wrap > div"); // the side-view holder div
  const svg = holder.querySelector("svg");
  svg.getBoundingClientRect = () => ({ top: 0, left: 0 });
  holder.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true, cancelable: true, clientY: 24 + 40, clientX: 50 }));
  libItem = doc.querySelector("#pickerBody .lib-item[data-id='T1']");
  assert(!!libItem, "picker opened from right side-view double-click");
  libItem.dispatchEvent(new win.Event("click", { bubbles: true }));
  dev = s.racks[0].devices[0];
  assert(dev && dev.mount === "inside" && dev.side === "R", "right side-view dblclick -> mount inside, side R (got " + (dev&&dev.mount) + "/" + (dev&&dev.side) + ")");

  // ---- 5. side view (left) ----
  s.racks[0].devices = [];
  s.ui.face = "left"; win.render();
  const holder2 = doc.querySelector(".rack-wrap > div");
  const svg2 = holder2.querySelector("svg");
  svg2.getBoundingClientRect = () => ({ top: 0, left: 0 });
  holder2.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true, cancelable: true, clientY: 24 + 40, clientX: 50 }));
  libItem = doc.querySelector("#pickerBody .lib-item[data-id='T1']");
  libItem.dispatchEvent(new win.Event("click", { bubbles: true }));
  dev = s.racks[0].devices[0];
  assert(dev && dev.mount === "inside" && dev.side === "L", "left side-view dblclick -> mount inside, side L (got " + (dev&&dev.mount) + "/" + (dev&&dev.side) + ")");

  // ---- 6. Library template editor no longer offers a Mount field ----
  s.ui.view = "library"; s.ui.selTpl = "T1"; win.render();
  const mountField = [...doc.querySelectorAll(".frm label")].find(l => l.textContent.trim() === "Mount");
  assert(!mountField, "Library template editor no longer shows a Mount field");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
