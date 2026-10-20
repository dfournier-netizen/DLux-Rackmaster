// v6.11 -- Rack Guide per-section export toggles (S.ui.reportSections) + per-port settings table in the
// device configuration sheets. Covers: migrate() backfill/healing; every toggle removes exactly its
// content from reportHTML(); dynamic section renumbering (incl. the schedule getting its own heading
// number when the signal diagram is off); whole-first-section and whole-final-section removal; single-rack
// scope obeying rack-internal toggles; the per-port settings table (columns, label-only, fields-only,
// no-override omission, portDetail-off renders nothing incl. no legacy "Port labels:" paragraph); and the
// export dialog's dynamically injected #rgSections checkbox grid (state reflection, persistence without
// closing the dialog, reopen reflection).
const fs = require("fs");
const { JSDOM } = require("jsdom");
const path = require("path");
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, "build.html"), "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await new Promise(r => setTimeout(r, 150));
  const S = win.eval("S");
  const KEYS = ["overview", "trunks", "network", "edges", "stats", "elevations", "build", "cabling", "sheets", "portDetail", "signal", "schedule"];

  // ---- 1. migrate() backfill: fresh boot has every key true ----
  assert(S.ui.reportSections && typeof S.ui.reportSections === "object", "fresh boot: S.ui.reportSections exists");
  assert(KEYS.every(k => S.ui.reportSections[k] === true), "fresh boot: all 12 section keys default to true");
  assert(Object.keys(S.ui.reportSections).length === 12, "fresh boot: exactly the 12 known keys");

  // ---- 2. migrate() healing: partial stored object merges, stored choices and unknown keys survive ----
  win.eval('S.ui.reportSections = { overview: false, bogusFutureKey: "keep" }; migrate();');
  assert(S.ui.reportSections.overview === false, "migrate(partial): stored overview:false is preserved");
  assert(KEYS.filter(k => k !== "overview").every(k => S.ui.reportSections[k] === true), "migrate(partial): every missing key heals to true");
  assert(S.ui.reportSections.bogusFutureKey === "keep", "migrate(partial): unknown keys are not dropped");
  win.eval("delete S.ui.reportSections; migrate();");
  assert(KEYS.every(k => S.ui.reportSections[k] === true), "migrate(missing object): backfills all-true defaults");

  // ---- fixture: 2 racks, per-port overrides, network fields, an edge device, inter- + intra-rack cables ----
  const mkDev = (id, name, dir, pos, jacks, fields) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos, color: "#333", isContainer: false, contents: [], fields: fields || [], img: null, imgRear: null,
    notes: "", rx: 20, ry: 20, hideInRouting: null, pushProtect: false, draw: null, circuit: null,
    ports: [{ id: "g1", name: "Out", type: "XLR3", dir, count: 3, face: "front", jacks: jacks || [] }] });
  S.racks = [
    { id: "rA", name: "FOH Rack", sizeU: 12, depth: 20, color: "#123", notes: "FOH notes here", circuits: [], devices: [
      mkDev("dA", "Console", "out", 1,
        [{ label: "Main L", fields: [] },                       // label-only override
         { label: "", fields: [{ key: "Gain", value: "+4" }] }, // fields-only override
         {}],                                                   // no override -> omitted from the table
        [{ key: "IP Address", value: "10.0.0.5" }]),
      mkDev("dB", "Amp", "in", 3)] },
    { id: "rB", name: "Stage Rack", sizeU: 12, depth: 20, color: "#456", notes: "Stage notes here", circuits: [], devices: [mkDev("dC", "Splitter", "in", 1)] },
  ];
  S.edges = [mkDev("eA", "FOH Laptop", "bidi", 0, null, [{ key: "Owner", value: "LD" }])];
  S.edges[0].cat = "Video";
  S.connections = [
    { id: "c1", a: { dev: "dA", g: "g1", i: 0 }, b: { dev: "dB", g: "g1", i: 0 }, label: "L1", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" },
    { id: "c2", a: { dev: "dA", g: "g1", i: 1 }, b: { dev: "dC", g: "g1", i: 0 }, label: "T1", color: "#d33", type: "XLR3", len: 240, notes: "", adapter: "" },
  ];
  const setRS = ov => { S.ui.reportSections = Object.assign(win.eval("reportSectionDefaults()"), ov || {}); };

  // ---- 3. baseline (all toggles on): everything renders, numbered 1..4 ----
  setRS();
  let h = win.reportHTML();
  assert(/<h2>1\. System overview<\/h2>/.test(h), "all-on: '1. System overview' heading");
  assert(/System integration — cables that leave a rack/.test(h), "all-on: inter-rack trunks block present");
  assert(/Network &amp; addressing quick reference/.test(h), "all-on: network block present");
  assert(/Edge devices \(outside the racks\)/.test(h) && /FOH Laptop/.test(h), "all-on: edge devices block present");
  assert(/<h2>2\. Rack build — FOH Rack/.test(h) && /<h2>3\. Rack build — Stage Rack/.test(h), "all-on: rack sections numbered 2 and 3");
  assert(/<h2>4\. Signal flow diagram<\/h2>/.test(h), "all-on: signal flow numbered 4");
  assert(/<h3>Full cable schedule<\/h3>/.test(h), "all-on: schedule is an h3 inside the signal section");
  assert(/Space: <b>/.test(h) && /LEFT SIDE/.test(h) && /Build order/.test(h) && /Cabling checklist/.test(h) && /Device configuration sheets/.test(h), "all-on: every rack-internal block present");

  // ---- 4. per-port settings table (Feature 2) ----
  assert(/<b>Per-port settings<\/b>/.test(h), "per-port: 'Per-port settings' heading present");
  assert(/<th>Port<\/th><th>Label<\/th><th>Settings<\/th>/.test(h), "per-port: Port / Label / Settings columns");
  assert(/<td>Out 1<\/td><td><b>Main L<\/b><\/td><td><i>—<\/i><\/td>/.test(h), "per-port: label-only override row (Settings shows em dash)");
  assert(/<td>Out 2<\/td><td><i>—<\/i><\/td><td>Gain: \+4<\/td>/.test(h), "per-port: fields-only override row (Label shows em dash)");
  assert(!/<td>Out 3<\/td>/.test(h), "per-port: port with no override is omitted");
  assert(!/Port labels:/.test(h), "per-port: old inline 'Port labels:' paragraph is gone");
  assert(/<b>Ports:<\/b>/.test(h), "per-port: one-line 'Ports:' summary retained above the table");
  assert(!/jack/i.test(h), "terminology: generated guide never says 'jack'");

  // ---- 5. each toggle removes exactly its content ----
  setRS({ overview: false });
  h = win.reportHTML();
  assert(!/System overview/.test(h) && !/Totals:/.test(h), "overview off: overview table + totals line gone");
  assert(/<h2>1\. System integration — cables that leave a rack<\/h2>/.test(h), "overview off: first section survives, next block promoted to the numbered h2");
  assert(/<h2>2\. Rack build — FOH Rack/.test(h), "overview off (others on): rack numbering unchanged at 2");
  setRS({ trunks: false });
  h = win.reportHTML();
  assert(!/System integration/.test(h), "trunks off: inter-rack table gone");
  assert(/<h2>1\. System overview<\/h2>/.test(h), "trunks off: overview keeps the section heading");
  setRS({ network: false });
  assert(!/Network &amp; addressing/.test(win.reportHTML()), "network off: network table gone");
  setRS({ edges: false });
  h = win.reportHTML();
  assert(!/Edge devices \(outside the racks\)/.test(h) && !/<th>Dept<\/th>/.test(h), "edges off: edge devices table gone (name may still appear as a signal-flow node)");
  setRS({ stats: false });
  h = win.reportHTML();
  assert(!/Space: <b>/.test(h) && !/Est\. weight: <b>/.test(h), "stats off: rack stats line gone");
  assert(/Est\. power<\/th>/.test(h), "stats off: overview table's own power column untouched");
  setRS({ elevations: false });
  h = win.reportHTML();
  assert(!/class="elevs"/.test(h) && !/LEFT SIDE/.test(h), "elevations off: FRONT/REAR/LEFT SIDE block gone");
  setRS({ build: false });
  assert(!/Build order/.test(win.reportHTML()), "build off: build order list gone");
  setRS({ cabling: false });
  assert(!/Cabling checklist/.test(win.reportHTML()), "cabling off: cabling checklist gone");
  setRS({ sheets: false });
  h = win.reportHTML();
  assert(!/Device configuration sheets/.test(h) && !/class="sheet"/.test(h), "sheets off: device configuration sheets gone");
  assert(!/Per-port settings/.test(h), "sheets off: per-port table gone with them");
  setRS({ portDetail: false });
  h = win.reportHTML();
  assert(!/Per-port settings/.test(h) && !/<td>Out 1<\/td>/.test(h), "portDetail off: per-port table gone");
  assert(!/Port labels:/.test(h), "portDetail off: no fallback to the old inline 'Port labels:' paragraph");
  assert(/<b>Ports:<\/b>/.test(h), "portDetail off: 'Ports:' summary line (gated by sheets) still present");

  // ---- 6. final section: signal/schedule combos + renumbering ----
  setRS({ signal: false });
  h = win.reportHTML();
  assert(!/Signal flow diagram/.test(h), "signal off: diagram gone");
  assert(/<h2>4\. Full cable schedule<\/h2>/.test(h), "signal off + schedule on: schedule gets its own numbered h2 (4)");
  assert(/Lengths are auto-estimated/.test(h) && /<th>Length<\/th>/.test(h), "signal off + schedule on: schedule note + table still render");
  setRS({ schedule: false });
  h = win.reportHTML();
  assert(/<h2>4\. Signal flow diagram<\/h2>/.test(h), "schedule off: signal section still numbered 4");
  assert(!/Full cable schedule/.test(h) && !/Lengths are auto-estimated/.test(h), "schedule off: schedule heading + table gone");
  setRS({ signal: false, schedule: false });
  h = win.reportHTML();
  assert(!/Signal flow diagram/.test(h) && !/Full cable schedule/.test(h), "signal+schedule off: final section gone entirely");
  assert(/<h2>3\. Rack build — Stage Rack/.test(h) && !/<h2>4\./.test(h), "signal+schedule off: last rack (3) is the last numbered section");

  // ---- 7. whole first section disappears only when ALL four system toggles are off; racks renumber from 1 ----
  setRS({ overview: false, trunks: false, network: false, edges: false });
  h = win.reportHTML();
  assert(!/System overview/.test(h) && !/System integration/.test(h) && !/Network &amp; addressing/.test(h) && !/Edge devices/.test(h), "all four system toggles off: first section gone entirely");
  assert(/<h2>1\. Rack build — FOH Rack/.test(h), "renumbering: first rack section becomes 1");
  assert(/<h2>2\. Rack build — Stage Rack/.test(h), "renumbering: second rack section becomes 2");
  assert(/<h2>3\. Signal flow diagram<\/h2>/.test(h), "renumbering: signal flow becomes 3");

  // ---- 8. single-rack scope: every system toggle renders its block SCOPED to the rack (v6.11.5),
  // with the same running numbering as the all-racks guide; rack-internal toggles still obeyed ----
  setRS();
  h = win.reportHTML("rA");
  assert(/<h2>1\. System overview<\/h2>/.test(h), "scoped all-on: System overview present, numbered 1");
  const ovS = h.slice(h.indexOf("System overview"), h.indexOf("System integration"));
  assert(/FOH Rack/.test(ovS) && !/Stage Rack/.test(ovS), "scoped: overview table holds only this rack's row");
  assert(h.includes("Totals: <b>1</b> rack · <b>2</b> devices · <b>2</b> documented cables."), "scoped: totals line counts 1 rack / its devices / its touching cables");
  const trS = h.slice(h.indexOf("System integration"), h.indexOf("Network &amp;"));
  assert(trS.includes("<b>T1</b>") && !trS.includes("<b>L1</b>"), "scoped: trunks table lists the inter-rack run touching this rack, not the intra-rack one");
  const netS = h.slice(h.indexOf("Network &amp;"), h.indexOf("<h2>2"));
  assert(netS.includes("10.0.0.5"), "scoped: network table lists this rack's networked device");
  assert(!/Edge devices \(outside the racks\)/.test(h) && !/FOH Laptop/.test(h), "scoped: an edge device with no cable into this rack is omitted (block and all)");
  assert(/<h2>2\. Rack build — FOH Rack/.test(h), "scoped all-on: rack build follows the system section at 2 (not 1)");
  assert(/<h2>3\. Signal flow — FOH Rack<\/h2>/.test(h) && /<h3>Full cable schedule<\/h3>/.test(h), "scoped all-on: final section numbered 3, schedule as h3");
  assert(/Build order/.test(h) && /Device configuration sheets/.test(h) && /Per-port settings/.test(h), "scoped all-on: internal blocks render");
  setRS({ overview: false, trunks: false, network: false, edges: false });
  h = win.reportHTML("rA");
  assert(!/System overview/.test(h) && !/System integration/.test(h) && !/Network &amp; addressing/.test(h), "scoped: system toggles off remove their scoped blocks");
  assert(/<h2>1\. Rack build — FOH Rack/.test(h) && /<h2>2\. Signal flow — FOH Rack<\/h2>/.test(h), "scoped: all system toggles off -> rack build renumbers to 1, signal to 2");
  setRS({ build: false, sheets: false, stats: false });
  h = win.reportHTML("rA");
  assert(!/Build order/.test(h) && !/Device configuration sheets/.test(h) && !/Space: <b>/.test(h), "scoped: build/sheets/stats toggles remove their blocks");
  assert(/Cabling checklist/.test(h) && /LEFT SIDE/.test(h), "scoped: still-on blocks (cabling, elevations) unaffected");
  setRS({ portDetail: false });
  h = win.reportHTML("rA");
  assert(!/Per-port settings/.test(h) && !/Port labels:/.test(h), "scoped: portDetail off removes the table with no inline fallback");

  // ---- 9. export dialog: dynamically injected #rgSections checkbox grid ----
  setRS();
  win.eval("render()");
  const openDlg = () => doc.querySelector("#btnExportMenu").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  openDlg();
  const dlg = doc.querySelector("#exportDlg");
  assert(dlg.open, "dialog opens");
  let grid = doc.querySelector("#rgSections");
  assert(!!grid && dlg.contains(grid), "#rgSections grid is injected inside the export dialog");
  assert(grid.classList.contains("rg-sections"), "grid carries the .rg-sections class");
  let cbs = [...grid.querySelectorAll("input[type=checkbox]")];
  assert(cbs.length === 12, "grid has one checkbox per section key (12)");
  assert(cbs.every(cb => cb.checked), "all-true state: every checkbox checked");
  assert(KEYS.every(k => cbs.some(cb => cb.dataset.rgsec === k)), "every section key has a checkbox");
  assert(/Per-port settings/.test(grid.textContent) && /Cable schedule/.test(grid.textContent) && /Network & addressing/.test(grid.textContent), "checkbox labels use the human names");
  assert(!/jack/i.test(grid.textContent), "checkbox labels never say 'jack'");

  // reflect pre-set state on open
  dlg.close();
  S.ui.reportSections.elevations = false;
  openDlg();
  grid = doc.querySelector("#rgSections");
  cbs = [...grid.querySelectorAll("input[type=checkbox]")];
  assert(cbs.find(cb => cb.dataset.rgsec === "elevations").checked === false, "reopen: pre-set elevations:false shows unchecked");
  assert(cbs.filter(cb => cb.checked).length === 11, "reopen: the other 11 stay checked");

  // toggling writes state + persists WITHOUT closing the dialog
  const buildCb = cbs.find(cb => cb.dataset.rgsec === "build");
  buildCb.checked = false;
  buildCb.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(S.ui.reportSections.build === false, "unchecking a box writes S.ui.reportSections[key]=false");
  assert(dlg.open, "toggling a box does not close (or rebuild away) the open dialog");
  const stored = JSON.parse(win.localStorage.getItem("dlux-rackmaster-v1"));
  assert(stored.ui.reportSections.build === false && stored.ui.reportSections.elevations === false, "toggle persists to localStorage via save()");

  // reopening reflects the persisted change; re-checking writes true back
  dlg.close();
  openDlg();
  cbs = [...doc.querySelectorAll("#rgSections input[type=checkbox]")];
  const buildCb2 = cbs.find(cb => cb.dataset.rgsec === "build");
  assert(buildCb2.checked === false, "reopen: persisted build:false reflected");
  buildCb2.checked = true;
  buildCb2.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(S.ui.reportSections.build === true, "re-checking writes true back");

  // ---- 10. Generate flow end-to-end: toggles applied at build time, Generate wiring unchanged ----
  S.ui.reportSections.build = false;
  let openedDocs = [];
  win.open = function () {
    const chunks = [];
    return { document: { write: x => chunks.push(x), close: () => openedDocs.push(chunks.join("")) } };
  };
  doc.querySelector("#expRackGuideScope").value = "";
  doc.querySelector("#miRackGuide").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(openedDocs.length === 1 && !/Build order/.test(openedDocs[0]) && /FOH Rack/.test(openedDocs[0]) && /Stage Rack/.test(openedDocs[0]), "Generate honors the toggles (build off) across all racks");
  assert(!doc.querySelector("#exportDlg").open, "Generate still closes the dialog");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
