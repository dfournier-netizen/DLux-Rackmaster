// v6.11.7 -- label legibility over cables. Two surfaces.
//
// (A) Routing/Rig canvas. A new --label-scrim theme var (50%-alpha of each theme's --panel) backs a
// scrim "chip" behind every canvas label, and the five label spans are lifted out of the cable layer
// with position:relative;z-index:2. Because .node has NO stacking-context property of its own, that
// z-index:2 resolves against #routeInner, so the text escapes above svg#wires. Every chip's
// padding/negative-margin nets to ZERO measured width -- .node is width:max-content, so any net
// widening would silently break the hand-computed fixtures in test_align_distribute / test_minimap /
// test_canvas_autosize. Cable labels moved out of .wire-grp into a single #wireLabelLayer <g> appended
// last to #wires, each in its own data-id'd .wire-lbl-grp with a rect.wire-label-bg behind the text.
//
// (B) Static export routingSVG(). Emission restructured into three z-ordered passes -- device geometry,
// then cable <path>s, then every <text> with a 50%-opacity backdrop <rect> immediately before it.
// All pre-existing coordinates/fonts/fills/path d's are byte-identical to the pre-change build.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function newestBuild() { // suite convention: default to the newest "DLux Rackmaster *.html" in the parent dir
  const dir = path.join(__dirname, "..");
  const hits = fs.readdirSync(dir).filter(f => /^DLux[ _]Rackmaster[ _].*\.html$/.test(f))
    .map(f => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
  return hits.length ? path.join(dir, hits[0].f) : path.join(dir, "build.html");
}
const buildPath = process.argv[2] || newestBuild();
const html = fs.readFileSync(buildPath, "utf-8");
let pass = 0, fail = 0;
function assert(c, l) { if (c) { pass++; } else { fail++; console.log("FAIL:", l); } }

// -- CSS helpers: pull a single rule body out of the MAIN <style> block --
const mainCSS = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
function ruleOf(sel) { // exact-selector rule body; anchored so ".node" never matches ".node-head"
  const re = new RegExp("(?:^|[\\n;}])\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}", "m");
  const m = re.exec(mainCSS); return m ? m[1] : null;
}
function themeBlock(sel) { // theme blocks are multi-line and contain comments -- take sel{ .. \n}
  const i = mainCSS.indexOf(sel + "{"); if (i < 0) return null;
  const j = mainCSS.indexOf("\n}", i); return j < 0 ? null : mainCSS.slice(i, j + 2);
}
function decl(body, prop) { // last-wins value of a longhand/shorthand declaration in a rule body
  const m = new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)").exec(body || ""); return m ? m[1].trim() : null;
}
const px = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
function boxX(body) { // net horizontal width delta a chip adds: padding-x + margin-x ("auto" contributes 0)
  const pad = (decl(body, "padding") || "0").trim().split(/\s+/);
  const mar = (decl(body, "margin") || "0").trim().split(/\s+/);
  const sides = a => a.length === 1 ? [a[0], a[0]] : a.length === 2 ? [a[1], a[1]]
    : a.length === 3 ? [a[1], a[1]] : [a[1], a[3]]; // [right, left]
  const [pr, pl] = sides(pad), [mr, ml] = sides(mar);
  return { padX: px(pr) + px(pl), marX: px(mr) + px(ml), net: px(pr) + px(pl) + px(mr) + px(ml),
           marAuto: [mr, ml].filter(v => v === "auto") };
}

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  win.addEventListener("error", e => console.error("WINDOW ERROR:", (e.error && e.error.stack) || e.message));
  await new Promise(r => setTimeout(r, 150));
  const S = win.eval("S");

  // ================= 1. --label-scrim in all three theme blocks =================
  const THEMES = [
    { sel: ":root", scrim: "rgba(255,255,255,.5)", panel: "#ffffff", who: "light" },
    { sel: '[data-theme="dark"]', scrim: "rgba(27,27,31,.5)", panel: "#1b1b1f", who: "dark" },
    { sel: '[data-theme="evergreen"]', scrim: "rgba(21,33,26,.5)", panel: "#15211a", who: "evergreen" },
  ];
  for (const t of THEMES) {
    const blk = themeBlock(t.sel);
    assert(!!blk, `${t.who} theme block found in the main stylesheet`);
    const got = blk && (/--label-scrim:\s*([^;}]+)/.exec(blk) || [])[1];
    assert(got && got.trim() === t.scrim, `${t.who} theme defines --label-scrim:${t.scrim} (got ${got})`);
    // the scrim is the theme's own --panel at 50% alpha -- that is what makes the chip read as
    // "the node surface showing through the cable" rather than an arbitrary grey.
    const rgb = /rgba\((\d+),(\d+),(\d+),\.5\)/.exec(t.scrim);
    const hex = "#" + [1, 2, 3].map(i => (+rgb[i]).toString(16).padStart(2, "0")).join("");
    assert(hex === t.panel, `${t.who} --label-scrim is exactly 50% alpha of that theme's --panel (${t.panel})`);
  }

  // ================= 2. the five lifted label selectors =================
  // Each: position:relative + z-index:2 (escape the cable layer) + the right scrim colour + a
  // padding/negative-margin pair whose NET horizontal contribution is unchanged from the pre-scrim
  // build. netExpected is that pre-existing contribution: 0 for chips that had no margin before,
  // 2 for .bidi-zone-label which already carried margin-right:2px as a gap before the first pin.
  const LIFTED = [
    { sel: ".pin-label", scrim: "var(--label-scrim)", netExpected: 0, who: "port label" },
    { sel: ".node-head .node-title", scrim: "rgba(0,0,0,.5)", netExpected: 0, who: "device name (white on the coloured header)" },
    { sel: ".node-head .rk", scrim: "rgba(0,0,0,.5)", netExpected: 0, who: "rack tag", wantAutoMargin: true },
    { sel: ".bidi-zone-label", scrim: "var(--label-scrim)", netExpected: 2, who: "BiDi zone label" },
    { sel: ".rg-head .rg-title", scrim: "rgba(0,0,0,.5)", netExpected: 0, who: "rack-group name" },
  ];
  for (const L of LIFTED) {
    const body = ruleOf(L.sel);
    assert(!!body, `${L.sel} rule exists (${L.who})`);
    if (!body) continue;
    assert(decl(body, "position") === "relative", `${L.sel} is position:relative`);
    assert(decl(body, "z-index") === "2", `${L.sel} is z-index:2 (lifts the text above svg#wires)`);
    assert(decl(body, "background") === L.scrim, `${L.sel} scrim is ${L.scrim}`);
    const b = boxX(body);
    assert(b.padX > 0, `${L.sel} has real horizontal padding (the chip is wider than the glyphs)`);
    assert(b.net === L.netExpected,
      `${L.sel} padding/negative-margin nets to ${L.netExpected}px -- .node is width:max-content, so any ` +
      `net widening would break the hand-computed fixtures in test_align_distribute / test_minimap / ` +
      `test_canvas_autosize (got padX=${b.padX} marX=${b.marX})`);
    if (L.wantAutoMargin) {
      // .rk is the flex row's right-aligned tag: margin-left:auto absorbs the free space and MUST be
      // kept. The -6px lives entirely on the right and cancels BOTH 3px padding sides on its own.
      assert(b.marAuto.length === 1 && (decl(body, "margin") || "").includes("auto"),
        ".node-head .rk keeps its margin-left:auto (preserves right-alignment in the flex header)");
      assert(px((decl(body, "margin") || "").trim().split(/\s+/)[1]) === -b.padX,
        `.node-head .rk's single -6px right margin cancels both 3px padding sides (padX=${b.padX})`);
    }
  }
  assert(!!ruleOf(".pin-label") && ruleOf(".pin-label").includes("border-radius"), ".pin-label chip is rounded (reads as a chip, not a block)");

  // ================= 3. stacking contract on the containers =================
  const nodeRule = ruleOf(".node");
  assert(!!nodeRule && nodeRule.includes("width:max-content"), ".node base rule found (and is still width:max-content)");
  // THIS is what lets the lifted text escape: any of these properties on .node would make it a
  // stacking context, trapping its z-index:2 children inside the node and back under svg#wires.
  for (const prop of ["z-index", "transform", "opacity", "filter", "isolation", "will-change", "contain"]) {
    assert(!new RegExp("(?:^|;)\\s*" + prop + "\\s*:").test(nodeRule || ""),
      `.node's BASE rule declares no ${prop} -- it must NOT form a stacking context, or the z-index:2 label chips get trapped under #wires`);
  }
  const wiresRule = ruleOf("#wires");
  assert(!!wiresRule && wiresRule.includes("pointer-events:none"), "#wires rule found");
  // REGRESSION GUARD (do not "helpfully" re-add): an earlier draft put z-index:1 on #wires. That
  // promotes the cable layer into CSS2.1 step 9, above .rack-node (z-index:1, appended earlier), so
  // cables would paint OVER collapsed rack boxes. #wires must keep relying on DOM-last paint order.
  assert(!/(?:^|;)\s*z-index\s*:/.test(wiresRule || ""),
    "#wires declares NO z-index (it relies on being the last child of #routeInner; z-index:1 here would flip cables above collapsed rack boxes)");
  const rgRule = ruleOf(".rack-group");
  assert(!!rgRule, ".rack-group rule found");
  assert(!/(?:^|;)\s*z-index\s*:/.test(rgRule || ""),
    ".rack-group dropped its z-index:0 so its .rg-title can escape (no-op for layering: z-index:0 and auto both paint in CSS2.1 step 8, in tree order, and rack-groups are appended first)");
  const rnRule = ruleOf(".rack-node");
  assert(!!rnRule && decl(rnRule, "z-index") === "1",
    ".rack-node INTENTIONALLY keeps z-index:1 -- it is appended before every .node, and step 9 already puts it above both the nodes and #wires (z-index:auto, step 8), so collapsed rack boxes and their header text were ALREADY above the cables. Deliberate non-change, not an omission.");

  // ================= 4. cable-label layer CSS =================
  assert(/\.wire-label-bg\{[^}]*fill:var\(--label-scrim\)/.test(mainCSS), ".wire-label-bg fills with var(--label-scrim)");
  assert(/\.wire-label-bg\{[^}]*pointer-events:none/.test(mainCSS), ".wire-label-bg is pointer-events:none (never steals a cable click)");
  assert(/\.wire-label-bg\{[^}]*rx:\s*\d/.test(mainCSS), ".wire-label-bg has a small rx (rounded chip)");
  assert(mainCSS.includes("#wires #wireLabelLayer .wire-lbl-grp.trace-dim{opacity:.2}"),
    "label groups dim with their cable: #wires #wireLabelLayer .wire-lbl-grp.trace-dim{opacity:.2}");
  assert(/\.wire-label\{[^}]*paint-order:stroke/.test(mainCSS),
    ".wire-label KEEPS its paint-order:stroke halo -- halo AND backdrop rect, deliberately (the halo carries the label over its own casing, the rect over everything else)");

  // ================= 5. builders emit the new hook classes =================
  assert(/buildNode[\s\S]{0,4000}?class="node-title"/.test(html), "buildNode() gives the device-name span class=\"node-title\"");
  assert(/buildRackGroup[\s\S]{0,2000}?class="rg-title"/.test(html), "buildRackGroup() gives the rack-name span class=\"rg-title\"");

  // ================= 6. canvas fixture: rack group + collapsed rack + labelled cables =================
  const mk = (id, name, rx, ry, ports) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 1, color: "#334455", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx, ry, hideInRouting: null, pushProtect: false, draw: null, circuit: null, ports });
  const P = (id, name, type, dir, count) => ({ id, name, type, dir, count, face: "front", jacks: [] });
  S.racks = [
    { id: "r1", name: "Rack One", sizeU: 12, depth: 20, color: "#123456", notes: "", circuits: [], devices: [
      mk("dA", "Console", 300, 200, [P("go", "Out", "XLR3", "out", 3)]),
      mk("dB", "Switch", 700, 420, [P("gi", "In", "XLR3", "in", 3), P("gb", "Net", "ETH", "bi", 4)]) ] },
    { id: "r2", name: "Rack Two", sizeU: 8, depth: 20, color: "#654321", notes: "", circuits: [], devices: [
      mk("dD", "Spare", 1400, 700, [P("gi3", "In", "XLR3", "in", 1)]) ] },
  ];
  S.edges = [mk("dC", "Edge Amp", 1100, 260, [P("gi2", "Amp In", "XLR3", "in", 2)])];
  S.connections = [
    { id: "c1", a: { dev: "dA", g: "go", i: 0 }, b: { dev: "dB", g: "gi", i: 0 }, label: "MAIN L", color: "#cc3333", type: "XLR3", len: 10, notes: "", adapter: "" },
    { id: "c2", a: { dev: "dA", g: "go", i: 1 }, b: { dev: "dB", g: "gi", i: 1 }, label: "", color: "#33cc33", type: "XLR3", len: 10, notes: "", adapter: "" },
    { id: "c3", a: { dev: "dA", g: "go", i: 2 }, b: { dev: "dC", g: "gi2", i: 0 }, label: "TRUNK 12", color: "#3333cc", type: "XLR3", len: 50, notes: "", adapter: "" },
  ];
  S.ui.view = "rig"; S.ui.rigHideInternal = false; S.ui.wireLabels = true; S.ui.selConn = null; S.ui.connType = null;
  S.ui.rigCollapsed = { r2: true }; // r1 renders as a .rack-group, r2 as a collapsed .rack-node
  win.eval("resetUndoHistory()");
  win.eval("render()"); win.eval("drawWires()");

  const svg = () => doc.querySelector("#wires");
  assert(!!doc.querySelector(".node-head .node-title"), "a rendered device node carries .node-head .node-title");
  assert(doc.querySelector(".node-head .node-title").textContent.includes("Console"), "the .node-title span holds the device name");
  assert(!!doc.querySelector(".rack-group .rg-head .rg-title"), "the rack-group header carries .rg-head .rg-title");
  assert(doc.querySelector(".rack-group .rg-head .rg-title").textContent.includes("Rack One"), "the .rg-title span holds the rack name");
  const rn = doc.querySelector(".rack-node");
  assert(!!rn, "the collapsed rack rendered as a .rack-node");
  assert(!rn.querySelector(".rg-title"),
    "buildRackNode() deliberately does NOT emit .rg-title -- .rack-node's own z-index:1 already floats it (and its header text) above #wires, so it needs no scrim chip");

  // ================= 7. #wireLabelLayer structure =================
  // drawWires() rebuilds svg.innerHTML wholesale, so #wireLabelLayer must be RE-QUERIED after every
  // redraw -- a captured reference silently goes stale (detached, still queryable, old classes).
  const layerEl = () => doc.querySelector("#wireLabelLayer");
  const layer = layerEl();
  assert(!!layer, "#wireLabelLayer exists after drawWires()");
  assert(layer.parentElement === svg(), "#wireLabelLayer is a direct child of #wires");
  assert(svg().lastElementChild === layer, "#wireLabelLayer is the LAST element child of #wires (paints above every cable)");
  const kids = [...svg().children];
  const ghost = doc.querySelector("#ghostWire");
  assert(!!ghost && kids.indexOf(layer) > kids.indexOf(ghost), "#wireLabelLayer comes after path#ghostWire (labels stay legible over the drag ghost too)");
  const lastGrp = [...svg().querySelectorAll(".wire-grp")].pop();
  assert(!!lastGrp && kids.indexOf(layer) > kids.indexOf(lastGrp), "#wireLabelLayer comes after every .wire-grp");
  assert(!svg().querySelector(".wire-grp text.wire-label"), "NO text.wire-label remains inside any .wire-grp");

  // .wire-grp is now exactly casing -> wire -> hit
  const grps = [...svg().querySelectorAll(".wire-grp")];
  assert(grps.length === 3, `one .wire-grp per cable (got ${grps.length})`);
  grps.forEach((g, i) => {
    const cls = [...g.children].map(c => c.getAttribute("class").trim().split(/\s+/)[0]);
    assert(cls.join(">") === "wire-casing>wire>wire-hit",
      `.wire-grp #${i} contains exactly casing>wire>hit (got ${cls.join(">") || "empty"})`);
  });

  // one .wire-lbl-grp per LABELLED cable (c2 has no label -> falls back to its type, so all three)
  const lgrps = [...layer.querySelectorAll("g.wire-lbl-grp")];
  assert(lgrps.length === 3, `one .wire-lbl-grp per labelled cable (got ${lgrps.length})`);
  const ids = new Set(lgrps.map(g => g.dataset.id));
  assert(ids.size === 3 && ids.has("c1") && ids.has("c2") && ids.has("c3"), "each .wire-lbl-grp carries its own cable's data-id");
  for (const g of lgrps) {
    const r = g.querySelector("rect.wire-label-bg"), t = g.querySelector("text.wire-label");
    assert(!!r && !!t, `${g.dataset.id}: label group holds a rect.wire-label-bg and a text.wire-label`);
    assert(r && t && r.nextElementSibling === t, `${g.dataset.id}: the rect is painted BEFORE (under) the text`);
    // jsdom has no getBBox, so the character-count fallback path is what runs here; both the measured
    // and the estimated path must still yield finite numeric geometry.
    for (const a of ["x", "y", "width", "height"]) {
      assert(r && Number.isFinite(parseFloat(r.getAttribute(a))), `${g.dataset.id}: rect ${a} is a finite number (getBBox-less fallback still sizes the chip)`);
    }
    assert(r && parseFloat(r.getAttribute("width")) > 0 && parseFloat(r.getAttribute("height")) > 0,
      `${g.dataset.id}: rect has positive width and height`);
    assert(!!svg().querySelector(`path.wire[data-id="${g.dataset.id}"]`), `${g.dataset.id}: the label group's data-id resolves to a real cable`);
  }
  const lblOf = id => layer.querySelector(`.wire-lbl-grp[data-id="${id}"] text.wire-label`);
  assert(lblOf("c1").textContent === "MAIN L", "labelled cable renders its label text");
  assert(lblOf("c2").textContent === "XLR3", "an unlabelled cable still falls back to its cable type");
  // the estimate widens with the string, so the chip tracks its text
  assert(parseFloat(lblOf("c3").closest(".wire-lbl-grp").querySelector("rect").getAttribute("width")) >
         parseFloat(lblOf("c1").closest(".wire-lbl-grp").querySelector("rect").getAttribute("width")),
    "a longer label gets a wider backdrop rect (the character-count estimate tracks the text)");

  // ================= 8. trace class baking =================
  win.eval("if (!TRACE_ARMED) toggleTrace();");
  win.eval("traceFromCable('c1')");
  win.eval("drawWires()");
  assert(win.eval("TRACE_MEMBERS !== null"), "a trace is active");
  const clsOf = el => el.getAttribute("class") || "";
  for (const id of ["c1", "c2", "c3"]) {
    const wg = doc.querySelector(`path.wire[data-id="${id}"]`).closest(".wire-grp");
    const lg = layerEl().querySelector(`.wire-lbl-grp[data-id="${id}"]`);
    if (!lg) continue;
    const traceCls = c => /trace-hi/.test(c) ? "trace-hi" : /trace-dim/.test(c) ? "trace-dim" : "none";
    assert(traceCls(clsOf(wg)) !== "none", `${id}: the cable group carries a trace class while a trace is active`);
    assert(traceCls(clsOf(lg)) === traceCls(clsOf(wg)),
      `${id}: the label group is baked with the SAME trace class as its cable (${traceCls(clsOf(wg))}) -- labels dim/highlight with their own cable`);
  }
  win.eval("TRACE_ARMED = false; TRACE_MEMBERS = null; updateTraceButton(); render(); drawWires();");

  // ================= 9. the wireLabels toggle still governs the whole layer =================
  S.ui.wireLabels = false; win.eval("drawWires()");
  assert(!doc.querySelector("text.wire-label"), "S.ui.wireLabels=false removes every label chip");
  assert(!doc.querySelector("rect.wire-label-bg"), "...and every backdrop rect with it (no orphan chips left behind)");
  assert(!!doc.querySelector("#wireLabelLayer"), "the (empty) #wireLabelLayer <g> is still emitted, keeping the DOM shape stable");
  S.ui.wireLabels = true; win.eval("drawWires()");
  assert(doc.querySelectorAll("text.wire-label").length === 3, "S.ui.wireLabels=true brings all three chips back");

  // ================= 10. static export: three-pass z-order =================
  const out = win.eval("routingSVG(null)");
  assert(typeof out === "string" && out.startsWith("<svg"), "routingSVG(null) returned an SVG string");
  const firstPath = out.indexOf("<path"), firstText = out.indexOf("<text");
  const lastGeo = Math.max(out.lastIndexOf("<circle"), out.lastIndexOf("<line"), out.lastIndexOf('rx="5"'));
  assert(lastGeo > 0 && firstPath > 0 && firstText > 0, "the export emits geometry, cable paths and text");
  assert(lastGeo < firstPath, "pass 1 before pass 2: the LAST device-geometry element precedes the FIRST cable <path>");
  assert(firstPath < firstText, "pass 2 before pass 3: the FIRST cable <path> precedes the FIRST <text>");
  assert(out.lastIndexOf("<path") < firstText, "EVERY cable <path> precedes every <text> (cables can never paint over a label)");

  // every <text> is immediately preceded by its own 50%-opacity backdrop rect, with the right polarity
  const toks = [...out.matchAll(/<(rect|text|circle|line|path)\b([^>]*)>/g)];
  const fillOf = a => (/fill="([^"]*)"/.exec(a) || [])[1];
  let nText = 0, unbacked = 0, badPolarity = 0;
  const WHITE_ON_COLOUR = ["#fff", "rgba(255,255,255,.85)"]; // device name + rack tag: white type on the coloured header
  toks.forEach((t, i) => {
    if (t[1] !== "text") return;
    nText++;
    const prev = toks[i - 1];
    if (!prev || prev[1] !== "rect" || !/opacity="0\.5"/.test(prev[2])) { unbacked++; return; }
    const want = WHITE_ON_COLOUR.includes(fillOf(t[2])) ? "#000" : "#fff";
    if (fillOf(prev[2]) !== want) badPolarity++;
  });
  assert(nText > 0, `the export contains <text> runs (${nText})`);
  assert(unbacked === 0, `every <text> is immediately preceded by a <rect ... opacity="0.5"> backdrop (${unbacked} unbacked)`);
  assert(badPolarity === 0,
    `backdrop polarity is correct everywhere: white-on-colour type (device name, rack tag) gets fill="#000", everything else fill="#fff" (${badPolarity} wrong)`);
  assert(/paint-order="stroke" stroke="#fff" stroke-width="2\.5"/.test(out),
    "connection labels KEEP their paint-order stroke halo in the export (halo AND rect, deliberately)");

  // svgTextBg(): estimated, sized from the string it is handed, anchor-aware
  assert(win.eval("typeof svgTextBg") === "function", "svgTextBg() helper exists");
  const bg = (txt, x, y, fs, anchor, dark) => win.eval(`svgTextBg(${JSON.stringify(txt)},${x},${y},${fs},${JSON.stringify(anchor)},${dark})`);
  const attr = (s, k) => parseFloat((new RegExp(k + '="([^"]*)"').exec(s) || [])[1]);
  const w4 = bg("ABCD", 100, 50, 10, "middle", false), w8 = bg("ABCDEFGH", 100, 50, 10, "middle", false);
  assert(attr(w8, "width") > attr(w4, "width"), "svgTextBg width grows with the string it is handed (sized from the rendered/sliced text, not the source value)");
  assert(Math.abs((attr(w8, "width") - attr(w4, "width")) - 4 * 10 * 0.58) < 1e-6, "svgTextBg width is 0.58 x font-size per character");
  assert(Math.abs(attr(w4, "height") - 10 * 1.25) < 1e-6, "svgTextBg height is font-size x 1.25");
  assert(Math.abs(attr(w4, "y") - (50 - 10 * 0.95)) < 1e-6, "svgTextBg rect y is baseline - font-size x 0.95");
  assert(/rx="2"/.test(w4), "svgTextBg rect uses rx=2");
  assert(/opacity="0\.5"/.test(w4), "svgTextBg rect is 50% opacity");
  assert(/fill="#000"/.test(bg("X", 0, 0, 10, "start", true)) && /fill="#fff"/.test(bg("X", 0, 0, 10, "start", false)), "svgTextBg's dark flag picks #000 vs #fff");
  const mid = attr(bg("ABCD", 100, 50, 10, "middle", false), "x"), end = attr(bg("ABCD", 100, 50, 10, "end", false), "x"),
        start = attr(bg("ABCD", 100, 50, 10, "start", false), "x");
  assert(start > end && mid > end && start > mid, "svgTextBg is anchor-aware: start/middle/end place the rect differently");
  // The width is an ESTIMATE, not a measurement -- string-generated SVG has no DOM to measure against.
  // That caveat must stay documented at the helper, so nobody later derives layout positions from it.
  const helperSrc = html.slice(html.indexOf("function svgTextBg"), html.indexOf("function routingSVG"));
  assert(/ESTIMATED|NOT measured|estimate/i.test(helperSrc), "svgTextBg documents that its width is ESTIMATED, not measured (no DOM in a string-generated SVG)");
  assert(/ALREADY-SLICED|slice/i.test(helperSrc), "svgTextBg documents that callers must pass the already-.slice()d rendered string");

  // ================= 11. coordinate-identity guard vs the pre-change build =================
  // The whole point of v6.11.7 is that it ADDS backdrops without moving anything. These two sets were
  // captured from base.html (the pristine pre-change build) with this exact fixture and compared: both
  // are byte-identical between base and work. If a future edit nudges a coordinate, font-size, fill,
  // text-anchor or a cable's path d, one of these two assertions fires.
  const crypto = require("crypto");
  const hash = arr => crypto.createHash("sha256").update(arr.join("\n")).digest("hex").slice(0, 16);
  const textTuples = [...out.matchAll(/<text\b([^>]*)>/g)].map(m => {
    const a = k => { const r = new RegExp(k + '="([^"]*)"').exec(m[1]); return r ? r[1] : ""; };
    return [a("x"), a("y"), a("font-size"), a("fill"), a("text-anchor")].join("|");
  }).sort();
  const pathDs = [...out.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]).sort();
  assert(textTuples.length === 24, `export emits 24 <text> runs for this fixture (got ${textTuples.length})`);
  assert(hash(textTuples) === "0cebb9d013bd482e",
    `the sorted set of <text> x|y|font-size|fill|text-anchor tuples is UNCHANGED from base.html (got ${hash(textTuples)})`);
  assert(pathDs.length === 3, `export emits 3 cable paths for this fixture (got ${pathDs.length})`);
  assert(hash(pathDs) === "89b995eb7617f048",
    `the sorted set of cable path d values is UNCHANGED from base.html (got ${hash(pathDs)})`);
  // a couple of exact coordinates spelled out, so a hash mismatch is debuggable without re-deriving
  assert(textTuples.includes("1107|274|10.5|#fff|"), "spot check: the Edge Amp device-name text still sits at x=1107 y=274 font-size=10.5 fill=#fff");
  assert(pathDs.includes("M 500 234.5 L 580 234.5 Q 586 234.5 586 240.5 L 586 448.5 Q 586 454.5 592 454.5 L 700 454.5"),
    "spot check: cable c1's orthogonal path d is byte-identical to the pre-change build");

  console.log(`\ntest_label_legibility: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
