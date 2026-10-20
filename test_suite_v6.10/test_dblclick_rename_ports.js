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
  const s = S();

  s.racks = [{ id:"R1", name:"Rack A", sizeU:10, depth:20, color:"#111", notes:"", devices:[
    { id:"d1", tplId:null, name:"Snake", cat:"Audio", u:2, w:"full", side:"L", mount:"front", depth:10, inOff:null, pos:1,
      color:"#456", isContainer:false, contents:[], fields:[], img:null, imgRear:null, notes:"", rx:40, ry:40,
      ports:[{id:"g1",name:"XLR",type:"XLR3",dir:"out",count:2,face:"rear",jacks:[]}] }
  ]}];
  s.edges = []; s.connections = [];
  s.ui.selRack = "R1";

  for (const view of ["routing", "rig"]) {
    s.ui.view = view; win.render();
    const row = doc.querySelector(".node[data-dev='d1'] .pin-row");
    assert(!!row, `${view}: pin-row renders`);
    row.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    const input = row.querySelector(".pin-rename");
    assert(!!input, `${view}: double-click swaps the label for an inline input`);
    input.value = "Vocal 1";
    input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    const label = win.eval(`portList(findDev("d1").dev)[0].label`);
    assert(label === "Vocal 1", `${view}: Enter commits the new label (got "${label}")`);
    const pinRowAfter = doc.querySelector(".node[data-dev='d1'] .pin-row");
    assert(pinRowAfter.textContent.includes("Vocal 1"), `${view}: canvas re-renders showing the new label`);

    // Escape cancels without saving
    s.racks[0].devices[0].ports[0].jacks[0].label = "";
    win.render();
    const row2 = doc.querySelector(".node[data-dev='d1'] .pin-row");
    row2.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    const input2 = row2.querySelector(".pin-rename");
    input2.value = "Should Not Save";
    input2.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    const labelAfterEsc = win.eval(`portList(findDev("d1").dev)[0].label`);
    assert(labelAfterEsc !== "Should Not Save", `${view}: Escape cancels without saving (got "${labelAfterEsc}")`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
