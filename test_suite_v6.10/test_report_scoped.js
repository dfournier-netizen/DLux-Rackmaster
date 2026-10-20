// v6.11.5 -- single-rack Rack Guide scope: every RS-gated section now renders in the scoped doc,
// filtered to the scoped rack, with the same running section numbering and order as the all-racks
// guide (system blocks -> rack build -> signal/schedule). Covers each scoping rule: overview shows
// only this rack's row + scoped totals; trunks only lists runs touching the rack; network only this
// rack's devices; edges only edge devices actually cabled into the rack (empty -> whole block
// omitted); schedule only cables touching the rack; dynamic renumbering in scoped mode. Also a
// byte-identity guard: the ALL-RACKS doc (synthetic fixture + real project, fixed clock) must be
// byte-identical to the pre-change captures. Regenerate captures with:
//   node test_report_scoped.js <build.html> --capture   (only valid against a known-good build)
const fs = require("fs");
const { JSDOM } = require("jsdom");
const path = require("path");
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, "build.html"), "utf-8");
const CAPTURE = process.argv.includes("--capture");
const FIX_SYNTH = path.join(__dirname, "fixture_rackguide_allracks_synth.html");
const FIX_REAL = path.join(__dirname, "fixture_rackguide_allracks_real.html");
const REAL_JSON = path.join(__dirname, "..", "LX Network racks.dlux.json");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

async function boot() {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  await new Promise(r => setTimeout(r, 150));
  // fixed clock so the "Generated <date> <time>" cover line is identical between capture and compare
  win.eval("(function(){ const RD = Date; Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(2026, 0, 15, 12, 34, 56); } }; })()");
  return win;
}

(async () => {
  // ================= synthetic fixture =================
  const win = await boot();
  const S = win.eval("S");
  const mkDev = (id, name, dir, pos, fields) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos, color: "#333", isContainer: false, contents: [], fields: fields || [], img: null, imgRear: null,
    notes: "", rx: 20 + pos * 60, ry: 20 + pos * 50, hideInRouting: null, pushProtect: false, draw: null, circuit: null,
    ports: [{ id: "g1", name: "IO", type: "XLR3", dir, count: 4, face: "rear", jacks: [] }] });
  S.racks = [
    { id: "rA", name: "Alpha Rack", sizeU: 12, depth: 20, color: "#123", notes: "", circuits: [], devices: [
      mkDev("dA", "Console", "bidi", 1, [{ key: "IP Address", value: "10.0.0.5" }]),
      mkDev("dB", "Amp", "bidi", 3)] },
    { id: "rB", name: "Beta Rack", sizeU: 12, depth: 20, color: "#456", notes: "", circuits: [], devices: [
      mkDev("dC", "Splitter", "bidi", 1, [{ key: "IP Address", value: "10.0.0.9" }]),
      mkDev("dD", "Dimmer", "bidi", 3)] },
  ];
  S.edges = [mkDev("eA", "Edge Connected", "bidi", 0, [{ key: "Owner", value: "LD" }]),
             mkDev("eB", "Edge Lonely", "bidi", 0, [{ key: "Owner", value: "FOH" }])];
  S.connections = [
    { id: "c1", a: { dev: "dA", g: "g1", i: 0 }, b: { dev: "dB", g: "g1", i: 0 }, label: "INTRA-A", color: "#3d6bfa", type: "XLR3", len: 24, notes: "", adapter: "" },
    { id: "c2", a: { dev: "dA", g: "g1", i: 1 }, b: { dev: "dC", g: "g1", i: 0 }, label: "TRUNK-AB", color: "#d33", type: "Cat6", len: 240, notes: "", adapter: "" },
    { id: "c3", a: { dev: "eA", g: "g1", i: 0 }, b: { dev: "dA", g: "g1", i: 2 }, label: "EDGE-A", color: "#3a3", type: "XLR3", len: 120, notes: "", adapter: "" },
    { id: "c4", a: { dev: "dC", g: "g1", i: 1 }, b: { dev: "dD", g: "g1", i: 0 }, label: "INTRA-B", color: "#a3a", type: "XLR3", len: 18, notes: "", adapter: "" },
  ];
  const setRS = ov => { S.ui.reportSections = Object.assign(win.eval("reportSectionDefaults()"), ov || {}); };

  // ---- all-racks byte-identity guard (synthetic) ----
  setRS();
  const allH = win.reportHTML();
  if (CAPTURE) {
    fs.writeFileSync(FIX_SYNTH, allH);
    console.log("captured", FIX_SYNTH, allH.length, "bytes");
  } else {
    assert(fs.existsSync(FIX_SYNTH) && fs.readFileSync(FIX_SYNTH, "utf-8") === allH,
      "guard: all-racks reportHTML() is byte-identical to the pre-change capture (synthetic fixture)");
  }

  if (!CAPTURE) {
    // ---- scoped(rA), all toggles on: every system section present, scoped, numbered ----
    setRS();
    let h = win.reportHTML("rA");
    assert(/<h2>1\. System overview<\/h2>/.test(h), "scoped all-on: System overview section present, numbered 1");
    const ovSlice = h.slice(h.indexOf("System overview"), h.indexOf("System integration"));
    assert(/Alpha Rack/.test(ovSlice), "scoped: overview table has this rack's row");
    assert(!/Beta Rack/.test(ovSlice), "scoped: overview table has NO other rack's row");
    assert(h.includes("Totals: <b>1</b> rack · <b>2</b> devices · <b>3</b> documented cables."),
      "scoped: totals line counts 1 rack, its 2 devices, the 3 cables touching it");
    const trSlice = h.slice(h.indexOf("System integration"), h.indexOf("Network &amp;"));
    assert(trSlice.includes("<b>TRUNK-AB</b>") && trSlice.includes("<b>EDGE-A</b>"), "scoped: trunks table lists the inter-rack + edge runs touching this rack");
    assert(!trSlice.includes("INTRA-A") && !trSlice.includes("INTRA-B"), "scoped: trunks table excludes intra-rack and other-rack runs");
    const netSlice = h.slice(h.indexOf("Network &amp;"), h.indexOf("Edge devices"));
    assert(netSlice.includes("10.0.0.5") && netSlice.includes("Console"), "scoped: network table lists this rack's networked device");
    assert(!netSlice.includes("10.0.0.9"), "scoped: network table excludes the other rack's networked device");
    assert(/Edge devices \(outside the racks\)/.test(h) && h.includes("Edge Connected"), "scoped: edges table includes the edge device cabled into this rack");
    assert(!h.includes("Edge Lonely"), "scoped: an edge device with no connection to this rack is absent everywhere");
    assert(/<h2>2\. Rack build — Alpha Rack/.test(h), "scoped all-on: rack build follows the system section at 2");
    assert(/<h2>3\. Signal flow — Alpha Rack<\/h2>/.test(h), "scoped all-on: scoped signal-flow section numbered 3");
    assert(h.includes("<h3>Full cable schedule</h3>"), "scoped all-on: schedule shares the final section as an h3");
    const schedSlice = h.slice(h.indexOf("Full cable schedule"));
    assert(schedSlice.includes("<b>INTRA-A</b>") && schedSlice.includes("<b>TRUNK-AB</b>") && schedSlice.includes("<b>EDGE-A</b>"),
      "scoped: schedule lists every cable touching this rack (intra, trunk, edge)");
    assert(!schedSlice.includes("INTRA-B"), "scoped: schedule excludes other-rack-only cables");
    assert(!h.includes("Dimmer"), "scoped: a device only ever cabled inside the other rack never appears");

    // ---- scoped(rB): edge block omitted entirely; trunks/totals from rB's perspective ----
    h = win.reportHTML("rB");
    assert(!/Edge devices \(outside the racks\)/.test(h) && !/<th>Dept<\/th>/.test(h), "scoped(rB): no edge device cables into it -> whole edges block omitted");
    assert(h.includes("<b>TRUNK-AB</b>") && !h.slice(h.indexOf("System integration"), h.indexOf("Network &amp;")).includes("EDGE-A"),
      "scoped(rB): trunks lists the shared trunk but not the other rack's edge run");
    assert(h.includes("Totals: <b>1</b> rack · <b>2</b> devices · <b>2</b> documented cables."), "scoped(rB): totals count its own 2 touching cables");

    // ---- scoped toggles: each system checkbox controls its scoped block ----
    setRS({ overview: false });
    h = win.reportHTML("rA");
    assert(!/System overview/.test(h) && !/Totals:/.test(h), "scoped overview off: overview table + totals gone");
    assert(/<h2>1\. System integration — cables that leave a rack<\/h2>/.test(h), "scoped overview off: next block promoted to the numbered h2");
    assert(/<h2>2\. Rack build — Alpha Rack/.test(h), "scoped overview off: rack build still 2 (system section survives)");
    setRS({ trunks: false });
    assert(!/System integration/.test(win.reportHTML("rA")), "scoped trunks off: trunks block gone");
    setRS({ network: false });
    assert(!/Network &amp; addressing/.test(win.reportHTML("rA")), "scoped network off: network block gone");
    setRS({ edges: false });
    h = win.reportHTML("rA");
    assert(!/Edge devices \(outside the racks\)/.test(h) && !/<th>Dept<\/th>/.test(h), "scoped edges off: edges block gone");
    setRS({ overview: false, trunks: false, network: false, edges: false });
    h = win.reportHTML("rA");
    assert(/<h2>1\. Rack build — Alpha Rack/.test(h), "scoped, all system toggles off: rack build renumbers to 1");
    assert(/<h2>2\. Signal flow — Alpha Rack<\/h2>/.test(h), "scoped, all system toggles off: signal flow is 2");
    setRS({ signal: false });
    h = win.reportHTML("rA");
    assert(!/Signal flow — Alpha Rack/.test(h), "scoped signal off: scoped diagram gone");
    assert(/<h2>3\. Full cable schedule<\/h2>/.test(h), "scoped signal off: schedule gets its own numbered h2 (3)");
    setRS({ schedule: false });
    h = win.reportHTML("rA");
    assert(/<h2>3\. Signal flow — Alpha Rack<\/h2>/.test(h) && !/Full cable schedule/.test(h), "scoped schedule off: signal keeps 3, schedule gone");
    setRS({ signal: false, schedule: false });
    h = win.reportHTML("rA");
    assert(!/Signal flow/.test(h) && !/Full cable schedule/.test(h) && !/<h2>3\./.test(h), "scoped signal+schedule off: no final section at all");
  }

  // ================= real project byte-identity guard =================
  if (fs.existsSync(REAL_JSON)) {
    const win2 = await boot();
    win2.__proj = JSON.parse(fs.readFileSync(REAL_JSON, "utf-8"));
    win2.eval("S = __proj; migrate(); ensureRoutingLayout(); S.ui.reportSections = reportSectionDefaults();");
    const realH = win2.reportHTML();
    if (CAPTURE) {
      fs.writeFileSync(FIX_REAL, realH);
      console.log("captured", FIX_REAL, realH.length, "bytes");
    } else {
      assert(fs.existsSync(FIX_REAL) && fs.readFileSync(FIX_REAL, "utf-8") === realH,
        "guard: all-racks reportHTML() is byte-identical to the pre-change capture (real project)");
      const S2 = win2.eval("S");
      const scoped = win2.reportHTML(S2.racks[0].id);
      assert(/1\. System overview/.test(scoped) && /Rack build — /.test(scoped) && /Signal flow — /.test(scoped),
        "real project scoped smoke: system section, rack build and scoped signal flow all render");
    }
  } else {
    console.log("note: real project JSON not found, skipping real-project guard");
  }

  if (CAPTURE) { console.log("capture complete"); process.exit(0); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
