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

  const tpl = { id: "T1", name: "Amp", cat: "Audio", u: 2, w: "full", color: "#456", isContainer:false,
    ports: [{id:"pg1",name:"XLR",type:"XLR3",dir:"bi",count:2,face:"rear",jacks:[]}], fields:[], notes:"", contents:[], depth: 10 };
  s.library.push(tpl);
  s.racks = [{ id:"R1", name:"Rack A", sizeU:20, depth:20, color:"#111", notes:"", devices:[] }];
  s.edges = []; s.connections = [];
  s.ui.selRack = "R1"; s.ui.selDev = null; s.ui.view = "racks"; s.ui.face = "front";
  win.render();

  // ---- 1. palette item has no dblclick/dragstart requirement — a plain tap (click) arms it ----
  const palItem = doc.querySelector('.palette-item[data-tpl="T1"]');
  assert(!!palItem, "palette item for T1 renders");
  palItem.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(palItem.classList.contains("armed"), "tapping a palette item arms it (visual highlight)");

  // ---- 2. tapping an empty rack slot places the armed template ----
  const inner = doc.querySelector(".rack-inner");
  const rect = { top: 0, left: 0, width: 400 };
  inner.getBoundingClientRect = () => rect;
  inner.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, clientY: 100, clientX: 50 }));
  assert(s.racks[0].devices.length === 1, "tapping an empty slot places the armed device");
  assert(s.racks[0].devices[0].mount === "front", "placed device gets mount from the current face view, same as drag-and-drop");

  // template should now be disarmed
  const palItemAfter = doc.querySelector('.palette-item[data-tpl="T1"]');
  assert(!palItemAfter.classList.contains("armed"), "template auto-disarms after a successful placement");

  // ---- 3. arm again, then Escape cancels without placing ----
  const palItem2 = doc.querySelector('.palette-item[data-tpl="T1"]');
  palItem2.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(doc.querySelector('.palette-item[data-tpl="T1"]').classList.contains("armed"), "re-armed for test 3");
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(s.racks[0].devices.length === 1, "Escape cancels the armed template (no extra device placed)");
  assert(!doc.querySelector('.palette-item[data-tpl="T1"]').classList.contains("armed"), "Escape clears the armed visual state");

  // ---- 4. side view (right): tap an armed template places it as inside+R, same as dblclick did ----
  s.racks[0].devices = [];
  s.ui.face = "right"; win.render();
  const palItem3 = doc.querySelector('.palette-item[data-tpl="T1"]');
  palItem3.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  const holder = doc.querySelector(".rack-wrap > div");
  const svg = holder.querySelector("svg");
  svg.getBoundingClientRect = () => ({ top: 0, left: 0 });
  holder.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, clientY: 24 + 40, clientX: 50 }));
  const placed = s.racks[0].devices[0];
  assert(!!placed && placed.mount === "inside" && placed.side === "R", "side-view tap-to-place -> mount inside, side R (got " + JSON.stringify(placed && {mount:placed.mount, side:placed.side}) + ")");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
