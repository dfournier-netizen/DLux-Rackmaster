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

  s.racks = [{ id:"R1", name:"Rack A", sizeU:20, depth:20, color:"#111", notes:"", devices:[
    { id:"pdu", tplId:null, name:"PDU", cat:"Power", u:1, w:"full", side:"L", mount:"front", depth:5, inOff:null, pos:1, color:"#333", isContainer:false, contents:[], notes:"", img:null, imgRear:null,
      ports:[{id:"g1",name:"Out",type:"Edison",dir:"out",count:1,face:"rear",jacks:[]}], fields:[] },
    { id:"node", tplId:null, name:"DMX Node", cat:"Lighting", u:1, w:"full", side:"L", mount:"front", depth:5, inOff:null, pos:3, color:"#333", isContainer:false, contents:[], notes:"", img:null, imgRear:null,
      ports:[{id:"g2",name:"Power In",type:"TRUE1",dir:"in",count:1,face:"rear",jacks:[]}], fields:[] },
    { id:"sw1", tplId:null, name:"Switch", cat:"Network", u:1, w:"full", side:"L", mount:"front", depth:5, inOff:null, pos:5, color:"#333", isContainer:false, contents:[], notes:"", img:null, imgRear:null,
      ports:[{id:"g3",name:"Data",type:"RJ45",dir:"bi",count:1,face:"rear",jacks:[]}], fields:[] },
    { id:"dev4", tplId:null, name:"Stage Box", cat:"Audio", u:1, w:"full", side:"L", mount:"front", depth:5, inOff:null, pos:7, color:"#333", isContainer:false, contents:[], notes:"", img:null, imgRear:null,
      ports:[{id:"g4",name:"Net",type:"EtherCON",dir:"bi",count:1,face:"rear",jacks:[]}], fields:[] }
  ]}];
  s.edges = [];
  s.connections = [
    { id:"c1", a:{dev:"pdu",g:"g1",i:0}, b:{dev:"node",g:"g2",i:0}, label:"", color:"#f00", type:"Edison", notes:"", len:60, adapter:"" },
    { id:"c2", a:{dev:"sw1",g:"g3",i:0}, b:{dev:"dev4",g:"g4",i:0}, label:"", color:"#0f0", type:"RJ45", notes:"", len:60, adapter:"" }
  ];
  s.ui.selRack = "R1"; s.ui.view = "routing";
  win.render();

  let findings = win.rigCheck();
  const mismatchWarn = findings.find(f => /port types differ/.test(f.msg));
  assert(!!mismatchWarn && mismatchWarn.sev === "warn", "Edison vs TRUE1 with no adapter -> still warns (got: " + JSON.stringify(mismatchWarn) + ")");
  const rjEcFinding = findings.find(f => /RJ45|EtherCON/.test(f.msg) && /differ/.test(f.msg));
  assert(!rjEcFinding, "RJ45 <-> EtherCON never flagged as a mismatch");

  // now set the adapter on the Edison/TRUE1 cable
  s.connections[0].adapter = "Edison → TRUE1 adapter";
  findings = win.rigCheck();
  const infoNote = findings.find(f => /via adapter/.test(f.msg));
  assert(!!infoNote && infoNote.sev === "info", "Edison vs TRUE1 WITH adapter set -> becomes an info note, not a warning (got: " + JSON.stringify(infoNote) + ")");
  const stillWarn = findings.find(f => /port types differ/.test(f.msg));
  assert(!stillWarn, "no more 'port types differ' warning once adapter is set");

  // UI: connection editor shows the Adapter field and datalist suggestions
  s.ui.selConn = "c1"; win.render();
  const adapterInput = doc.querySelector('#connEditor input[data-k="adapter"]');
  assert(!!adapterInput, "connection editor has an Adapter input");
  assert(adapterInput.value === "Edison → TRUE1 adapter", "Adapter input reflects the saved value");
  const dl = doc.querySelector("#adapterSugg");
  assert(!!dl && dl.querySelectorAll("option").length >= 3, "adapter suggestions datalist populated");

  // CSV schedule includes the Adapter column + value
  const csv = win.eval("scheduleCSV()");
  assert(csv.split("\n")[0].includes("Adapter"), "CSV header includes Adapter column");
  assert(csv.includes("Edison → TRUE1 adapter") || csv.includes('Edison → TRUE1 adapter'), "CSV row includes the adapter label");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
