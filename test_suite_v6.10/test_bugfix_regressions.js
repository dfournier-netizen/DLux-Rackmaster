// v6.5 — regression coverage for the 8 findings in bug_report.md (2 high, 4 medium, 2 low).
// H1/H2 (render-in-oninput) have their own dedicated test file (test_search_no_rebuild.js);
// this file covers M1-M4 and L1 (L2 was "no action needed" per the diagnosis, nothing to regress).
const fs = require("fs");
const { JSDOM } = require("jsdom");
const htmlPath = process.argv[2] || "build.html";
const html = fs.readFileSync(htmlPath, "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await new Promise(r => setTimeout(r, 150));
  const S = win.eval("S");

  // ---------- M1: --rm-amber bridge (not aliased to --rm-accent anymore) ----------
  assert(html.includes("--rm-amber:var(--amber)"), "M1: outer :root bridges --rm-amber:var(--amber)");
  assert(!/--amber:var\(--rm-accent/.test(html), "M1: RIGPOWER's --amber is no longer aliased to --rm-accent (the hijack bug)");
  assert(/--amber:var\(--rm-amber/.test(html), "M1: RIGPOWER's shadow --amber references var(--rm-amber, ...)");
  // both themes define a real (non-blue) amber value
  const lightAmberMatch = html.match(/:root\{[\s\S]*?--amber:(#[0-9a-fA-F]{6});/);
  const darkAmberMatch = html.match(/\[data-theme="dark"\]\{[\s\S]*?--amber:(#[0-9a-fA-F]{6});/);
  assert(!!lightAmberMatch, "M1: light theme defines a literal --amber hex value");
  assert(!!darkAmberMatch, "M1: dark theme defines a literal --amber hex value");
  if (lightAmberMatch) assert(lightAmberMatch[1].toLowerCase() !== "#1d4ed8", "M1: light --amber is not the app's blue accent color");
  if (darkAmberMatch) assert(darkAmberMatch[1].toLowerCase() !== "#8ab0ff", "M1: dark --amber is not the app's blue accent color");

  // ---------- M2: S.lighting.state sub-array migration + renderSummary defensiveness ----------
  S.lighting = { state: { positions: undefined, fixtures: undefined, instances: undefined, devices: undefined }, stockLengths: {} };
  win.eval("migrate()");
  assert(Array.isArray(S.lighting.state.positions), "M2: migrate() backfills S.lighting.state.positions to []");
  assert(Array.isArray(S.lighting.state.fixtures), "M2: migrate() backfills S.lighting.state.fixtures to []");
  assert(Array.isArray(S.lighting.state.instances), "M2: migrate() backfills S.lighting.state.instances to []");
  assert(Array.isArray(S.lighting.state.devices), "M2: migrate() backfills S.lighting.state.devices to []");
  // renderSummary is now wrapped defensively (try/catch) per the same pattern renderCalc already used
  assert(/function renderSummary\(\)\{\s*try\{/.test(html.replace(/\r/g, "")), "M2: renderSummary() opens with a try{ block");
  assert(/renderSummary error/.test(html), "M2: renderSummary() has a catch that reports 'renderSummary error'");

  // ---------- M3: no "per-jack" in user-facing copy (push dialog) ----------
  assert(html.includes("per-port labels/fields, notes, and existing field values are always preserved"),
    "M3: push dialog copy now says 'per-port'");
  assert(!html.includes("per-jack labels/fields, notes"),
    "M3: the push-dialog sentence no longer says 'per-jack' (a code comment elsewhere legitimately still says 'per-jack labels & fields' as a section header, which is fine per bug_report.md M3)");

  // ---------- M4: t.fields / d.fields backfilled in migrate() ----------
  S.library = [{ id: "t1", name: "NoFields", cat: "Misc", u: 1, w: "full", color: "#111", isContainer: false,
    contents: [], notes: "", img: null, imgRear: null, ports: [], depth: null }]; // fields intentionally omitted
  delete S.library[0].fields;
  S.racks = [{ id: "r1", name: "R", sizeU: 12, depth: 20, color: "#222", notes: "", devices: [
    { id: "d1", tplId: "t1", name: "Dev", cat: "Misc", u: 1, w: "full", side: "L", mount: "front", depth: null,
      inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], ports: [], img: null, imgRear: null,
      notes: "", rx: 0, ry: 0, hideInRouting: null, pushProtect: false } // fields omitted
  ] }];
  S.edges = [{ id: "e1", tplId: null, name: "Edge", cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: null, color: "#444", isContainer: false, contents: [], ports: [], img: null,
    imgRear: null, notes: "", rx: 0, ry: 0, hideInRouting: null, pushProtect: false }]; // fields omitted
  win.eval("migrate()");
  assert(Array.isArray(S.library[0].fields), "M4: migrate() backfills library template .fields to []");
  assert(Array.isArray(S.racks[0].devices[0].fields), "M4: migrate() backfills rack device .fields to []");
  assert(Array.isArray(S.edges[0].fields), "M4: migrate() backfills edge device .fields to []");

  // ---------- L1: distro Outputs/Inputs fields get an onchange that refreshes the stale "adds N…" label ----------
  assert(html.includes("out.onchange=()=>renderDevices();"), "L1: .d-out gets an onchange handler calling renderDevices()");
  assert(html.includes("inp.onchange=()=>renderDevices();"), "L1: .d-in gets an onchange handler calling renderDevices() (symmetry fix)");

  // ---------- terminology sweep: "ports" not "jacks", "BiDi" not "Bi" in user-facing copy ----------
  assert(html.includes("dirLabel"), "terminology: dirLabel() helper (maps bi -> 'BiDi') still present");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
