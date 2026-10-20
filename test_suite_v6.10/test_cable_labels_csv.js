// v6.5 — F4: Cable Labels CSV export (alongside the existing schedule CSV), for Brother P-touch
// Editor's CSV import. One row per S.connections entry: Label, From, To, Type, Length, Color, where
// From/To are "Rack/Device:Port" (or "Edge/Device:Port") strings resolved from each connection's
// {dev,g,i} refs. Label = the connection's own label if set, else "From → To". Dangling refs
// (deleted device) are skipped, with a count reported in the export toast rather than silently dropped.
// CRLF line endings, every field quoted, UTF-8 with a leading BOM (P-touch's CSV import wants UTF-8
// reliably auto-detected rather than falling back to a legacy codepage).
// Scope decision (documented in script0.js above cableLabelsCSV() and here): rack/routing connections
// only — RIGPOWER's lighting-side data model has no per-cable-run {dev,g,i} connection object to
// resolve the same way as S.connections, so lighting runs are intentionally NOT included here (unlike
// the unified schedule CSV, which can fold lighting in because lightingCSVRows() already emits rows in
// the same column shape).
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

  const mkDev = (id, name, dir, count) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx: 20, ry: 20, hideInRouting: null, pushProtect: false,
    ports: [{ id: "g1", name: "Line", type: "XLR3", dir, count: count || 1, face: "front", jacks: [] }] });

  const console_ = mkDev("dCon", "Console", "out");
  const amp = mkDev("dAmp", "Amp", "in", 2);
  const edgeDev = mkDev("dEdge", "Field Console", "in");
  S.racks = [{ id: "r1", name: "Rack A", sizeU: 12, depth: 20, color: "#123", notes: "", devices: [console_, amp] }];
  S.edges = [edgeDev];
  S.connections = [
    // labeled connection, rack-to-rack (same rack) — should use the explicit label
    { id: "c1", a: { dev: "dCon", g: "g1", i: 0 }, b: { dev: "dAmp", g: "g1", i: 0 },
      label: "MAIN L", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" },
    // unlabeled connection, second amp jack — should synthesize "From → To"
    { id: "c2", a: { dev: "dCon", g: "g1", i: 0 }, b: { dev: "dAmp", g: "g1", i: 1 },
      label: "", color: "#e08c3c", type: "XLR3", len: 30, notes: "", adapter: "" },
    // edge-device endpoint — From/To should say "Edge/..." not a rack name
    { id: "c3", a: { dev: "dCon", g: "g1", i: 0 }, b: { dev: "dEdge", g: "g1", i: 0 },
      label: "", color: "#5b82e8", type: "XLR3", len: null, notes: "", adapter: "" },
    // dangling connection — 'b' references a device id that doesn't exist anywhere
    { id: "c4", a: { dev: "dCon", g: "g1", i: 0 }, b: { dev: "ghost-device", g: "g1", i: 0 },
      label: "", color: "#999", type: "XLR3", len: 12, notes: "", adapter: "" }
  ];
  win.eval("render()");

  // --- cableLabelsCSV(): shape ---
  const result = win.eval("cableLabelsCSV()");
  assert(typeof result === "object" && typeof result.csv === "string", "F4: cableLabelsCSV() returns { csv, skipped }");
  assert(result.skipped === 1, `F4: dangling connection (c4) is counted in 'skipped' (got ${result.skipped})`);

  const csv = result.csv;
  const rows = csv.split("\r\n").filter(r => r.length);
  assert(rows[0] === '"Label","From","To","Type","Length","Color"', `F4: header row is exactly Label/From/To/Type/Length/Color, all quoted (got ${rows[0]})`);
  // 4 connections total, 1 dangling skipped -> 3 data rows + header
  assert(rows.length === 4, `F4: one row per resolvable connection (3 data rows + 1 header, got ${rows.length})`);

  // --- CRLF line endings ---
  assert(csv.includes("\r\n"), "F4: CSV uses CRLF line endings");
  assert(!/[^\r]\n/.test(csv), "F4: no bare LF line endings (every \\n is preceded by \\r)");
  assert(csv.endsWith("\r\n"), "F4: CSV ends with a trailing CRLF");

  // --- every field quoted ---
  rows.forEach(r => assert(/^"([^"]|"")*"(,"([^"]|"")*")*$/.test(r), `F4: row is fully quoted, field-by-field: ${r}`));

  // --- From/To resolution: "Rack/Device:Port" ---
  const row1 = rows[1].split('","').map(s => s.replace(/^"|"$/g, ""));
  assert(row1[0] === "MAIN L", `F4: explicit connection label used as-is when set (got "${row1[0]}")`);
  assert(row1[1] === "Rack A/Console:Line", `F4: From resolves to "Rack/Device:Port" (got "${row1[1]}")`);
  assert(row1[2] === "Rack A/Amp:Line 1", `F4: To resolves to "Rack/Device:Port" with per-jack index label for a multi-count port (got "${row1[2]}")`);
  assert(row1[3] === "XLR3", "F4: Type column carries the connection's cable type");
  assert(row1[4] === "24″", `F4: Length column uses fmtIn() formatting (got "${row1[4]}")`);
  assert(row1[5] === "#3d6bfa", "F4: Color column carries the connection's color");

  // --- unlabeled connection synthesizes "From → To" ---
  const row2 = rows[2].split('","').map(s => s.replace(/^"|"$/g, ""));
  assert(row2[0] === "Rack A/Console:Line → Rack A/Amp:Line 2", `F4: unlabeled connection's Label synthesizes "From \\u2192 To" (got "${row2[0]}")`);

  // --- edge device shows "Edge/..." not a rack name ---
  const row3 = rows[3].split('","').map(s => s.replace(/^"|"$/g, ""));
  assert(row3[2] === "Edge/Field Console:Line" || row3[1] === "Edge/Field Console:Line", `F4: an edge-device endpoint resolves to "Edge/Device:Port" (row: ${rows[3]})`);
  // c3's Length is null -> Length field should be empty, not "null"/"undefined"
  assert(row3[4] === "", `F4: a connection with len=null renders an empty Length field, not "null" (got "${row3[4]}")`);

  // --- exportCableLabelsCSV(): download filename, BOM, toast wording (skipped count) ---
  win.URL.createObjectURL = () => "blob:mock-url";
  win.URL.revokeObjectURL = () => {};
  let capturedBlob = null, capturedName = null;
  const OrigBlob = win.Blob;
  win.Blob = function (parts, opts) { capturedBlob = { parts, opts }; return new OrigBlob(parts, opts); };
  win.HTMLAnchorElement.prototype.click = function () { capturedName = this.download; };
  S.meta.name = "My Rig";

  win.eval("exportCableLabelsCSV()");
  assert(capturedName === "My Rig - cable labels.csv", `F4: exportCableLabelsCSV() downloads "<rig name> - cable labels.csv" (got "${capturedName}")`);
  assert(capturedBlob && capturedBlob.parts[0].startsWith("﻿"), "F4: exported CSV Blob is prefixed with a UTF-8 BOM (\\uFEFF)");
  assert(capturedBlob && capturedBlob.opts && /csv/.test(capturedBlob.opts.type) && /utf-8/i.test(capturedBlob.opts.type), "F4: Blob MIME type declares text/csv;charset=utf-8");

  const toastEl = doc.querySelector("#toast");
  assert(!!toastEl && /1 dangling connection.*skipped/i.test(toastEl.textContent), `F4: export toast reports the skipped-dangling-connection count (got "${toastEl && toastEl.textContent}")`);

  // --- no dangling connections -> plain success toast, no "skipped" mention ---
  S.connections = S.connections.filter(c => c.id !== "c4");
  win.eval("exportCableLabelsCSV()");
  assert(/exported/i.test(toastEl.textContent) && !/skipped/i.test(toastEl.textContent), `F4: with no dangling refs, the toast is a plain success message (got "${toastEl.textContent}")`);

  // --- "Nothing to export" guard when there are no connections at all ---
  S.connections = [];
  win.eval("exportCableLabelsCSV()");
  assert(/nothing to export/i.test(toastEl.textContent), `F4: exportCableLabelsCSV() with zero connections shows a "Nothing to export" toast (got "${toastEl.textContent}")`);

  // --- Export menu item wired (v6.7: relocated from the standalone #btnCableLabels topbar button
  //     into the Export dropdown's Schedules group -- see test_export_menu.js for the menu's own
  //     open/close/keyboard-nav coverage; this just confirms the action is still reachable and labeled) ---
  const btn = doc.querySelector("#miCableLabelsCsv");
  assert(!!btn, "F4: #miCableLabelsCsv Export-menu item exists (v6.7: replaces the old standalone #btnCableLabels topbar button)");
  // v6.8: the action button itself is now deliberately generic ("Export") -- name + one-line description
  // live in sibling .exp-item-name/.exp-item-desc elements inside the same .exp-item row (see the Export
  // dialog's item layout). Check the whole item's text, not just the button's own title/textContent.
  const itemRow = btn.closest(".exp-item") || btn.parentElement;
  const itemText = (itemRow ? itemRow.textContent : "") + " " + (btn.title || "");
  assert(/cable label/i.test(itemText) || /p-touch/i.test(itemText), "F4: #miCableLabelsCsv's item references cable labels / P-touch");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
