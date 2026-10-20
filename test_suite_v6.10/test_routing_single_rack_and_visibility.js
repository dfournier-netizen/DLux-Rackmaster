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

  const mk = (id, name, ports) => ({ id, tplId:null, name, cat:"Misc", u:1, w:"full", side:"L", mount:"front", depth:5, inOff:null,
    pos:1, color:"#333", isContainer:false, contents:[], notes:"", img:null, imgRear:null, fields:[], hideInRouting:null,
    ports: ports || [] });

  s.racks = [
    { id:"R1", name:"Rack A", sizeU:20, depth:20, color:"#111", notes:"", devices:[
      mk("d1","Amp (has ports)",[{id:"g1",name:"XLR",type:"XLR3",dir:"bi",count:1,face:"rear",jacks:[]}]),
      mk("d2","Blank Panel (no ports)",[])
    ]},
    { id:"R2", name:"Rack B", sizeU:20, depth:20, color:"#222", notes:"", devices:[
      mk("d3","Other Rack Device",[{id:"g3",name:"XLR",type:"XLR3",dir:"bi",count:1,face:"rear",jacks:[]}])
    ]}
  ];
  s.edges = [mk("e1","Console",[{id:"ge",name:"XLR",type:"XLR3",dir:"bi",count:1,face:"rear",jacks:[]}])];
  s.connections = [];
  s.ui.selRack = "R1"; s.ui.routingRackOnly = null; s.ui.routeFilter = { rack:"", cat:"", u:"" };

  // ---- Routing view: locked to one rack, edges excluded, portless auto-hidden ----
  s.ui.view = "routing"; win.render();
  let nodes = [...doc.querySelectorAll(".node")].map(n => n.dataset.dev);
  assert(nodes.includes("d1"), "Routing (rack A default): shows d1 (has ports)");
  assert(!nodes.includes("d2"), "Routing: auto-hides d2 (no ports, default)");
  assert(!nodes.includes("d3"), "Routing: excludes other rack's device (d3) while locked to Rack A");
  assert(!nodes.includes("e1"), "Routing: excludes edge device e1 even though it has ports");

  const rackSel = doc.querySelector("#routingRackSel");
  assert(!!rackSel, "Routing side panel shows the single-rack select");
  assert(![...rackSel.options].some(o => o.value === ""), "Routing rack select has no blank/All-racks option");
  assert(rackSel.value === "R1", "Routing rack select defaults to first rack");

  // switch to Rack B via the dropdown
  rackSel.value = "R2";
  rackSel.dispatchEvent(new win.Event("change", { bubbles: true }));
  nodes = [...doc.querySelectorAll(".node")].map(n => n.dataset.dev);
  assert(nodes.includes("d3") && !nodes.includes("d1"), "Routing: switching the dropdown shows only Rack B's devices now");

  // ---- Rig view: unaffected — still shows all racks + edges (portless still auto-hidden though) ----
  s.ui.view = "rig"; win.render();
  nodes = [...doc.querySelectorAll(".node")].map(n => n.dataset.dev);
  assert(nodes.includes("d1") && nodes.includes("d3") && nodes.includes("e1"), "Rig: shows devices across all racks + edge devices");
  assert(!nodes.includes("d2"), "Rig: also auto-hides portless d2 by default");

  // ---- Inspector override: force-show a portless device ----
  s.ui.view = "racks"; s.ui.selRack = "R1"; s.ui.selDev = "d2"; win.render();
  const visSel = doc.querySelector('.sidebar.right select[data-k="hideInRouting"]');
  assert(!!visSel, "Inspector shows the Show in Routing/Rig select for the selected device");
  visSel.value = "show";
  visSel.dispatchEvent(new win.Event("change", { bubbles: true }));
  const d2 = s.racks[0].devices.find(d => d.id === "d2");
  assert(d2.hideInRouting === false, "Inspector 'Always show' sets hideInRouting = false");
  s.ui.view = "rig"; win.render();
  nodes = [...doc.querySelectorAll(".node")].map(n => n.dataset.dev);
  assert(nodes.includes("d2"), "Rig: portless device now shows after 'Always show' override");

  // force-hide a device that DOES have ports
  s.ui.view = "racks"; s.ui.selDev = "d1"; win.render();
  const visSel2 = doc.querySelector('.sidebar.right select[data-k="hideInRouting"]');
  visSel2.value = "hide";
  visSel2.dispatchEvent(new win.Event("change", { bubbles: true }));
  s.ui.view = "rig"; win.render();
  nodes = [...doc.querySelectorAll(".node")].map(n => n.dataset.dev);
  assert(!nodes.includes("d1"), "Rig: device with ports now hidden after 'Always hide' override");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
