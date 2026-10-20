// v6.8 Part 2 -- Export dialog (<dialog id="exportDlg">), replacing the v6.7 topbar dropdown
// (#btnExportMenu/#exportMenuPanel). Same grouped sections (Guides & Summaries / Schedules / Rack
// elevations / Project), but a centered modal instead of an anchored dropdown: Esc-close and
// backdrop-click-close come from the app's existing <dialog> conventions (same pattern as pickerDlg),
// not bespoke menu logic. The old separate Rack Guide scope picker (<dialog id="rackGuideScopeDlg">) is
// absorbed inline as a <select> on the Rack Guide PDF item itself -- one less hop. Covers: dialog
// opens/closes (button click, Esc, backdrop click), every action is present and wired (incl. the inline
// scope picker), the old dropdown is completely gone (no orphaned markup/JS), and Save/Rig Check stayed
// on the topbar while Undo/Redo/Trace/wire-style moved into the new canvas toolbar (see
// test_canvas_toolbar.js for that side of the move).
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

  // ---- 1. the old v6.7 dropdown is entirely gone -- no orphaned markup, no orphaned JS entry points ----
  assert(!doc.querySelector("#exportMenuPanel"), "old #exportMenuPanel dropdown panel is gone");
  assert(!doc.querySelector("#exportMenu"), "old #exportMenu dropmenu wrapper div is gone");
  assert(!doc.querySelector("#rackGuideScopeDlg"), "old separate #rackGuideScopeDlg dialog is gone (absorbed inline)");
  assert(win.eval("typeof openExportMenu") === "undefined", "old openExportMenu() function no longer exists");
  assert(win.eval("typeof closeExportMenu") === "undefined", "old closeExportMenu() function no longer exists");
  assert(win.eval("typeof isExportMenuOpen") === "undefined", "old isExportMenuOpen() function no longer exists");
  assert(win.eval("typeof openRackGuideScopeDlg") === "undefined", "old openRackGuideScopeDlg() function no longer exists");
  // also gone from the topbar entirely (moved into the canvas toolbar, not just relocated within the topbar)
  assert(!doc.querySelector("#topbar #btnTrace"), "old standalone topbar #btnTrace is gone (now canvas-toolbar-only)");
  assert(!doc.querySelector("#topbar #wireStyleSeg"), "old standalone topbar #wireStyleSeg is gone (now canvas-toolbar-only)");
  assert(!doc.querySelector("#topbar #btnUndo"), "old standalone topbar #btnUndo is gone (now canvas-toolbar-only)");
  assert(!doc.querySelector("#topbar #btnRedo"), "old standalone topbar #btnRedo is gone (now canvas-toolbar-only)");

  // ---- 2. the new Export button + <dialog> exist, dialog starts closed ----
  const btn = doc.querySelector("#btnExportMenu");
  const dlg = doc.querySelector("#exportDlg");
  assert(!!btn, "#btnExportMenu (the topbar Export button) exists");
  assert(dlg && dlg.tagName === "DIALOG", "#exportDlg is a real <dialog> element");
  assert(!dlg.open, "the Export dialog starts closed");
  assert(!/▾|•/.test(btn.textContent), "Export button no longer carries a dropdown-caret glyph (it opens a modal, not an anchored menu)");

  // ---- 3. every action is present in the dialog, grouped Guides & Summaries / Schedules / Rack elevations / Project ----
  const miRackGuide = doc.querySelector("#miRackGuide");
  const miLighting = doc.querySelector("#miLightingSummary");
  const miSchedule = doc.querySelector("#miScheduleCsv");
  const miLabels = doc.querySelector("#miCableLabelsCsv");
  const miProject = doc.querySelector("#miExportProject");
  const scopeSel = doc.querySelector("#expRackGuideScope");
  for (const [el, name] of [[miRackGuide, "miRackGuide"], [miLighting, "miLightingSummary"], [miSchedule, "miScheduleCsv"],
                             [miLabels, "miCableLabelsCsv"], [miProject, "miExportProject"], [scopeSel, "expRackGuideScope"]]) {
    assert(!!el && dlg.contains(el), `${name} is present inside the Export dialog`);
  }
  const labels = [...dlg.querySelectorAll(".dropmenu-label")].map(l => l.textContent);
  assert(labels.some(l => /guide|summary/i.test(l)), "a 'Guides & Summaries' section label exists");
  assert(labels.some(l => /schedule/i.test(l)), "a 'Schedules' section label exists");
  assert(labels.some(l => /elevation/i.test(l)), "a 'Rack elevations' section label exists");
  assert(labels.some(l => /project/i.test(l)), "a 'Project' section label exists");
  // each actionable item has a name + one-line description + action button (per spec: name, description, action)
  const itemBodies = [...dlg.querySelectorAll(".exp-item")];
  assert(itemBodies.length >= 5, `at least 5 actionable items in the dialog (got ${itemBodies.length})`);
  for (const item of itemBodies) {
    assert(!!item.querySelector(".exp-item-name"), "an exp-item has a name element");
    assert(!!item.querySelector(".exp-item-desc"), "an exp-item has a one-line description element");
    assert(!!item.querySelector("button"), "an exp-item has an action button");
  }
  // Rack elevations section is hint text only, no duplicate SVG/PNG buttons
  assert(!dlg.querySelector("#rkExpSvg") && !dlg.querySelector("#rkExpPng"), "elevation SVG/PNG export is not duplicated into the Export dialog (per-rack buttons live in the Racks panel)");
  assert(/racks panel|rack.s panel/i.test(dlg.textContent), "Rack elevations section points users at the per-rack panel buttons via hint text");

  // ---- 4. clicking the Export button opens the dialog (showModal) ----
  btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(dlg.open === true, "clicking the Export button opens the dialog via showModal()");

  // ---- 5. backdrop click closes it (same currentTarget-click pattern as every other <dialog> in this app) ----
  dlg.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, view: win })); // target === currentTarget === dlg itself simulates a backdrop click
  assert(dlg.open === false, "clicking the dialog backdrop (target === currentTarget) closes it");

  // ---- 6. Escape closes it (the app's existing generic 'close the topmost open <dialog>' handler) ----
  btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(dlg.open === true, "dialog re-opened for the Escape test");
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(dlg.open === false, "pressing Escape closes the Export dialog");

  // ---- 7. opening the dialog (re)populates the inline rack-guide scope <select> from current S.racks ----
  S.racks = [
    { id: "rA", name: "FOH Rack", sizeU: 12, depth: 20, color: "#123", notes: "", circuits: [], devices: [] },
    { id: "rB", name: "Stage Rack", sizeU: 12, depth: 20, color: "#456", notes: "", circuits: [], devices: [] }
  ];
  btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  const opts = [...doc.querySelector("#expRackGuideScope").options];
  assert(opts.length === 3, `scope select has 'All racks' + one option per rack (got ${opts.length})`);
  assert(opts[0].value === "", "first option ('All racks') has an empty value");
  assert(opts.some(o => o.value === "rA" && /FOH Rack/.test(o.textContent)), "FOH Rack appears as a scope option");
  assert(opts.some(o => o.value === "rB" && /Stage Rack/.test(o.textContent)), "Stage Rack appears as a scope option");
  dlg.close();

  // ---- 8. each action still performs its underlying function when clicked from the dialog ----
  S.connections = [{ id: "cx1", a: { dev: "dA", g: "g1", i: 0 }, b: { dev: "dB", g: "g1", i: 0 },
    label: "L1", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" }];
  S.racks = [{ id: "rA", name: "Rack A", sizeU: 12, depth: 20, color: "#123", notes: "", circuits: [], devices: [
    { id: "dA", tplId: null, name: "Dev A", cat: "Misc", u: 1, w: "full", side: "L", mount: "front", depth: null,
      inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
      notes: "", rx: 20, ry: 20, hideInRouting: null, pushProtect: false, draw: null, circuit: null,
      ports: [{ id: "g1", name: "P", type: "XLR3", dir: "out", count: 1, face: "front", jacks: [] }] },
    { id: "dB", tplId: null, name: "Dev B", cat: "Misc", u: 1, w: "full", side: "L", mount: "front", depth: null,
      inOff: null, pos: 3, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
      notes: "", rx: 20, ry: 20, hideInRouting: null, pushProtect: false, draw: null, circuit: null,
      ports: [{ id: "g1", name: "P", type: "XLR3", dir: "in", count: 1, face: "front", jacks: [] }] },
  ] }];
  win.eval("render()");
  let openedDocs = [];
  win.open = function () {
    const chunks = [];
    return { document: { write: h => chunks.push(h), close: () => openedDocs.push(chunks.join("")) } };
  };
  win.URL.createObjectURL = () => "blob:mock-url";
  win.URL.revokeObjectURL = () => {};

  doc.querySelector("#btnExportMenu").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  doc.querySelector("#miScheduleCsv").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  const toastEl = doc.getElementById("toast");
  assert(/exported/i.test(toastEl.textContent), "clicking Cable Schedule CSV in the dialog still triggers exportCSV() (toast confirms)");
  assert(!doc.querySelector("#exportDlg").open, "clicking an action item closes the Export dialog");

  doc.querySelector("#btnExportMenu").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  doc.querySelector("#miCableLabelsCsv").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(/exported/i.test(toastEl.textContent), "clicking Cable Labels CSV in the dialog still triggers exportCableLabelsCSV() (toast confirms)");

  doc.querySelector("#btnExportMenu").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  doc.querySelector("#miLightingSummary").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(openedDocs.length === 1 && /Lighting Summary/.test(openedDocs[0]), "clicking Lighting Summary in the dialog opens a print window with the Lighting Summary doc");

  doc.querySelector("#btnExportMenu").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  doc.querySelector("#expRackGuideScope").value = ""; // All racks
  doc.querySelector("#miRackGuide").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(openedDocs.length === 2 && /Rack A/.test(openedDocs[1]), "clicking Rack Guide PDF (All racks scope) opens a print window covering it");

  doc.querySelector("#btnExportMenu").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  doc.querySelector("#miExportProject").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(/exported/i.test(toastEl.textContent), "clicking Export Project in the dialog still triggers exportProjectFile() (toast confirms)");

  // ---- 9. Save/Rig Check stayed on the topbar untouched ----
  assert(!!doc.querySelector("#btnSaveNow"), "Save button stayed on the topbar");
  assert(!!doc.querySelector("#btnCheck"), "Rig Check button stayed on the topbar");
  assert(!!doc.querySelector("#btnNew"), "New button stayed on the topbar");
  assert(!!doc.querySelector("#btnImport"), "Import button stayed on the topbar");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
