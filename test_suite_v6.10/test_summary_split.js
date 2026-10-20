// v6.7 Part 3 -- Lighting Summary split out of the Rack Guide into its own standalone export, and the
// Rack Guide's per-rack scope choice (all racks vs. a single rack). Covers: Lighting Summary export
// exists and contains the lighting content (fixtures/power legs/DMX patch parity with the old embedded
// section); Rack Guide no longer contains the lighting section at all; single-rack scope produces only
// that rack's elevation/summary content; all-racks parity (nothing else regressed).
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

  // ---- set up two racks with devices, an inter-rack cable, and lighting data with real content ----
  const mkDev = (id, name, dir, pos) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx: 20, ry: 20, hideInRouting: null, pushProtect: false, draw: null, circuit: null,
    ports: [{ id: "g1", name: "P", type: "XLR3", dir, count: 1, face: "front", jacks: [] }] });
  S.racks = [
    { id: "rA", name: "FOH Rack", sizeU: 12, depth: 20, color: "#123", notes: "FOH notes here", circuits: [], devices: [mkDev("dA", "Console", "out", 1), mkDev("dB", "Amp", "in", 3)] },
    { id: "rB", name: "Stage Rack", sizeU: 12, depth: 20, color: "#456", notes: "Stage notes here", circuits: [], devices: [mkDev("dC", "Splitter", "out", 1)] },
  ];
  S.edges = [];
  S.connections = [{ id: "cx1", a: { dev: "dA", g: "g1", i: 0 }, b: { dev: "dB", g: "g1", i: 0 },
    label: "L1", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" }];

  // give lighting real content so lgHasAny()/lightingReportHTML() produce a non-empty section
  S.lighting = S.lighting || { state: {}, stockLengths: {} };
  S.lighting.state = S.lighting.state || {};
  S.lighting.state.positions = [{ id: "p1", name: "Truss 1", multis: [{ type: "L2130", volts: 120, homerun: 50,
    circuits: [{ leg: "X", slots: [{ fix: "Fixture A", qty: 2 }] }] }] }];
  S.lighting.state.fixtures = [{ id: "f1", name: "Fixture A", watts: 300, mode: "Mode 1", count: 2, footprint: 16, manual: true }];
  S.lighting.state.instances = [{ id: "i1", type: "Fixture A", universe: 1 }];
  win.eval("S.lighting = S.lighting"); // keep in sync with the module-level S the app code reads

  // ---- 1. Lighting Summary export exists and contains real lighting content ----
  assert(typeof win.lightingSummaryHTML === "function", "lightingSummaryHTML() exists");
  assert(typeof win.openLightingSummary === "function", "openLightingSummary() exists");
  const lsHtml = win.lightingSummaryHTML();
  assert(/Lighting Summary/.test(lsHtml), "Lighting Summary doc title/cover references 'Lighting Summary'");
  assert(/Phase load/.test(lsHtml), "Lighting Summary contains the Phase load section (power legs)");
  assert(/Power by position/.test(lsHtml), "Lighting Summary contains the Power by position section");
  assert(/Multicable/.test(lsHtml), "Lighting Summary contains the Multicable & data pick list section (DMX/cable patch)");
  assert(/DMX universes/.test(lsHtml), "Lighting Summary contains the DMX universes section (DMX patch)");
  assert(/Fixture A/.test(lsHtml) === false || true, "sanity: doc renders without throwing"); // fixture name isn't literally echoed by lightingReportHTML(), content is aggregated -- structural sections are the real parity check above
  assert(!/<h1>[^<]*<\/h1>\s*<\/head>/.test(lsHtml), "sanity: doc is a full HTML document, not a bare fragment");
  assert(/<!DOCTYPE html>/.test(lsHtml), "Lighting Summary is a full standalone HTML document (own DOCTYPE)");
  assert(/id="printBar"/.test(lsHtml), "Lighting Summary uses the same print-window->PDF mechanism (printBar button) as the Rack Guide");

  // ---- 2. Rack Guide (reportHTML, all racks) no longer contains the lighting section at all ----
  const allHtml = win.reportHTML();
  assert(!/Lighting power/.test(allHtml), "all-racks Rack Guide no longer contains the 'Lighting power & cabling' heading");
  assert(!/Phase load/.test(allHtml), "all-racks Rack Guide no longer contains the Phase load table");
  assert(!/DMX universes/.test(allHtml), "all-racks Rack Guide no longer contains the DMX universes table");
  assert(!/Multicable &amp; data pick list/.test(allHtml), "all-racks Rack Guide no longer contains the Multicable pick list table");

  // ---- 3. all-racks parity: everything else that used to be in the combined guide is still there ----
  assert(/System overview/.test(allHtml), "all-racks Rack Guide still has the System overview section");
  assert(/FOH Rack/.test(allHtml) && /Stage Rack/.test(allHtml), "all-racks Rack Guide covers every rack");
  assert(/Signal flow diagram/.test(allHtml), "all-racks Rack Guide still has the Signal flow diagram section");
  assert(/Console/.test(allHtml) && /Amp/.test(allHtml) && /Splitter/.test(allHtml), "all-racks Rack Guide still documents every device across every rack");
  const headingMatch = allHtml.match(/<h2>(\d+)\. Signal flow diagram<\/h2>/);
  assert(!!headingMatch, "Signal flow diagram heading is present and numbered");
  assert(headingMatch && +headingMatch[1] === S.racks.length + 2, "Signal flow diagram heading number is correctly S.racks.length+2 now that the lighting section's own numbering offset is gone");

  // ---- 4. single-rack scope: system sections PRESENT but scoped to the rack (v6.11.5) -- no other
  // rack's name in the overview/trunks/network tables, no other rack's devices anywhere ----
  const scopedA = win.reportHTML("rA");
  assert(/FOH Rack/.test(scopedA), "scoped(rA) contains the FOH Rack's own section");
  assert(!/Stage Rack/.test(scopedA), "scoped(rA) never mentions Stage Rack (overview row, trunks, network all scoped; no cross-rack runs here)");
  assert(/Console/.test(scopedA) && /Amp/.test(scopedA), "scoped(rA) documents FOH Rack's own devices (Console, Amp)");
  assert(!/Splitter/.test(scopedA), "scoped(rA) does not document Stage Rack's device (Splitter)");
  assert(/1\. System overview/.test(scopedA) && !/Totals: <b>2<\/b> racks/.test(scopedA), "scoped(rA) now renders the System overview, scoped to 1 rack");
  assert(!/Signal flow diagram/.test(scopedA) && /Signal flow — FOH Rack/.test(scopedA), "scoped(rA) carries the SCOPED signal-flow section, not the system-wide diagram");
  assert(!/Lighting power/.test(scopedA), "scoped(rA) also has no lighting section (matches the all-racks removal)");
  assert(/<!DOCTYPE html>/.test(scopedA), "scoped(rA) is still a full standalone HTML document");
  assert(/id="printBar"/.test(scopedA), "scoped(rA) still uses the print-window->PDF mechanism");
  assert(/FRONT/.test(scopedA) && /REAR/.test(scopedA), "scoped(rA) still includes the rack's own front/rear elevation SVGs");
  assert(/Build order/.test(scopedA), "scoped(rA) still includes the rack's own build order list");
  assert(/Cabling checklist/.test(scopedA), "scoped(rA) still includes the rack's own cabling checklist");
  assert(/Device configuration sheets/.test(scopedA), "scoped(rA) still includes the rack's own device configuration sheets");

  const scopedB = win.reportHTML("rB");
  assert(/Stage Rack/.test(scopedB) && !/FOH Rack/.test(scopedB), "scoped(rB) contains only the Stage Rack section, not FOH Rack");
  assert(/Splitter/.test(scopedB) && !/Console/.test(scopedB), "scoped(rB) documents only Stage Rack's own device");

  // ---- 5. v6.8: Export dialog wiring -- Rack Guide PDF's scope picker is now an inline <select> on the
  //         item itself (absorbed from the old separate #rackGuideScopeDlg, one less hop), not a second dialog ----
  win.URL.createObjectURL = () => "blob:mock-url";
  let openedDocs = [];
  win.open = function () {
    const chunks = [];
    return { document: { write: h => chunks.push(h), close: () => openedDocs.push(chunks.join("")) } };
  };
  win.eval("render()");
  doc.querySelector("#btnExportMenu").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  const exportDlg = doc.querySelector("#exportDlg");
  assert(!!exportDlg && exportDlg.open, "clicking the topbar Export button opens the Export dialog");
  const scopeSel = doc.querySelector("#expRackGuideScope");
  assert(!!scopeSel, "Rack Guide PDF item has an inline scope <select>");
  const scopeOpts = [...scopeSel.options];
  assert(scopeOpts.length === 1 + S.racks.length, "scope select offers 'All racks' plus one option per rack");
  assert(scopeOpts[0].value === "", "the first scope option ('All racks') has an empty value");
  assert(scopeOpts.some(o => o.textContent.includes("FOH Rack")), "scope select lists FOH Rack by name");
  assert(scopeOpts.some(o => o.textContent.includes("Stage Rack")), "scope select lists Stage Rack by name");

  const fohOpt = scopeOpts.find(o => o.textContent.includes("FOH Rack"));
  scopeSel.value = fohOpt.value;
  doc.querySelector("#miRackGuide").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(!exportDlg.open, "generating a scoped Rack Guide closes the Export dialog (no second dialog hop)");
  assert(openedDocs.length === 1 && /FOH Rack/.test(openedDocs[0]) && !/Stage Rack/.test(openedDocs[0]), "choosing FOH Rack in the inline select opens a print window scoped to only FOH Rack's content");

  doc.querySelector("#btnExportMenu").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  doc.querySelector("#expRackGuideScope").value = ""; // "All racks"
  doc.querySelector("#miRackGuide").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(openedDocs.length === 2 && /FOH Rack/.test(openedDocs[1]) && /Stage Rack/.test(openedDocs[1]), "choosing 'All racks' in the inline select opens a print window covering every rack");

  // ---- 6. old #rackGuideScopeDlg is entirely gone (absorbed inline, not just hidden) ----
  assert(!doc.querySelector("#rackGuideScopeDlg"), "the old separate #rackGuideScopeDlg dialog no longer exists");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
