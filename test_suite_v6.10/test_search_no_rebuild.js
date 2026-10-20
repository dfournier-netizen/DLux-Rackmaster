// v6.5 — H1/H2 regression: search-filter inputs must NOT be rebuilt while typing.
// (render()-in-oninput was fixed by targeted re-render of just the results container; the input
// element itself is never destroyed, so the DOM node reference + focus + caret must survive.)
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

  // ---------- H1: Library search (#libSearch / #libList) ----------
  S.library = S.library && S.library.length ? S.library : [];
  S.library.push({ id: "t1", name: "Alpha Amp", cat: "Amps", u: 1, w: "full", color: "#111", isContainer: false,
    contents: [], notes: "", img: null, imgRear: null, fields: [], ports: [], depth: null });
  S.library.push({ id: "t2", name: "Beta Box", cat: "Misc", u: 1, w: "full", color: "#222", isContainer: false,
    contents: [], notes: "", img: null, imgRear: null, fields: [], ports: [], depth: null });
  S.ui.view = "library";
  S.ui.libSearch = "";
  win.eval("render()");

  const libSearch = doc.querySelector("#libSearch");
  assert(!!libSearch, "found #libSearch");
  const libSearchRef = libSearch;
  libSearch.focus();

  const libListBefore = doc.querySelector("#libList");
  assert(!!libListBefore, "found #libList");

  libSearch.value = "Alpha";
  libSearch.dispatchEvent(new win.Event("input", { bubbles: true }));

  assert(doc.querySelector("#libSearch") === libSearchRef, "H1: #libSearch DOM node reference unchanged after typing (not rebuilt)");
  assert(doc.activeElement === libSearchRef, "H1: focus retained on #libSearch after typing");
  assert(S.ui.libSearch === "Alpha", "H1: S.ui.libSearch mutated correctly");
  const libListAfter = doc.querySelector("#libList");
  const items = [...libListAfter.querySelectorAll(".lib-item .nm")].map(n => n.textContent);
  assert(items.includes("Alpha Amp") && !items.includes("Beta Box"), "H1: #libList content re-filtered to match the typed query");

  // caret position must NOT be forced to end-of-string (old bug: setSelectionRange(len,len) on every keystroke)
  if (typeof libSearch.setSelectionRange === "function") {
    libSearch.setSelectionRange(1, 1);
    libSearch.value = "Axlpha";
    libSearch.dispatchEvent(new win.Event("input", { bubbles: true }));
    assert(typeof libSearch.selectionStart === "number", "H1: caret position API still usable (no forced full rebuild resetting it)");
  }

  // ---------- H2: Routing/Rig cable search (#connSearch / #connList) ----------
  const mkDev = (id, name, dir) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx: 20, ry: 20, hideInRouting: null, pushProtect: false,
    ports: [{ id: "g1", name: "P", type: "XLR3", dir, count: 1, face: "front", jacks: [] }] });
  S.racks = [{ id: "r1", name: "Rack One", sizeU: 12, depth: 20, color: "#123", notes: "", devices: [
    mkDev("d1", "Console", "out"), mkDev("d2", "Amp", "in")
  ] }];
  S.connections = [{ id: "c1", a: { dev: "d1", g: "g1", i: 0 }, b: { dev: "d2", g: "g1", i: 0 },
    label: "MAIN L", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" }];
  S.ui.view = "routing";
  S.ui.routingRackOnly = "r1";
  S.ui.connSearch = "";
  win.eval("render()");

  const connSearch = doc.querySelector("#connSearch");
  assert(!!connSearch, "found #connSearch");
  const connSearchRef = connSearch;
  connSearch.focus();

  connSearch.value = "MAIN";
  connSearch.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(doc.querySelector("#connSearch") === connSearchRef, "H2: #connSearch DOM node reference unchanged after typing (not rebuilt)");
  assert(doc.activeElement === connSearchRef, "H2: focus retained on #connSearch after typing");
  assert(S.ui.connSearch === "MAIN", "H2: S.ui.connSearch mutated correctly");
  let rows = [...doc.querySelectorAll("#connList .conn-row")];
  assert(rows.length === 1, "H2: #connList re-filtered down to the matching cable");

  connSearch.value = "nomatch12345";
  connSearch.dispatchEvent(new win.Event("input", { bubbles: true }));
  rows = [...doc.querySelectorAll("#connList .conn-row")];
  assert(rows.length === 0, "H2: #connList shows no rows for a non-matching filter");
  assert(doc.querySelector("#connSearch") === connSearchRef, "H2: #connSearch still the same node after a second keystroke round");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
