// v6.10 — reworked signal flow trace (replaces the v6.5 whole-component trace test in place).
// New semantics: trace mode is CABLE-first. Clicking a cable while armed traces only cables of the
// SAME TYPE as the clicked one: upstream, the direct feed chain back to the origin (expanding each
// upstream device through its INCOMING same-type cables only — sibling outputs of upstream devices
// are excluded); downstream, every same-type branch transitively. Clicking a device while armed no
// longer traces (hint toast instead). traceComponent()/traceFrom() are gone.
//
// render() fully wipes #view (handoff §3) — always re-query DOM after render()-triggering actions;
// drawWires() is called explicitly since requestAnimationFrame doesn't fire synchronously in jsdom.
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
  const q = sel => doc.querySelector(sel);

  const mkDev = (id, name, ports) => ({ id, tplId: null, name, cat: "Misc", u: 1, w: "full", side: "L", mount: "front",
    depth: null, inOff: null, pos: 1, color: "#333", isContainer: false, contents: [], fields: [], img: null, imgRear: null,
    notes: "", rx: 20, ry: 20, hideInRouting: null, pushProtect: false,
    ports: ports.map((p, i) => ({ id: "g" + i, name: p.name, type: p.type, dir: p.dir, count: p.count || 1, face: "front", jacks: [] })) });
  const conn = (id, aDev, aG, bDev, bG, type) => ({ id, a: { dev: aDev, g: aG, i: 0 }, b: { dev: bDev, g: bG, i: 0 },
    label: "", color: "#c33", type: type, notes: "", len: null, adapter: "" });

  // Topology (XLR3 unless noted). Selected cable: c2 (A.out1 -> B.in).
  //   c7: Q -> SRC   (upstream feed chain — INCLUDED)
  //   c1: SRC -> A   (upstream feed chain — INCLUDED)
  //   c8: SRC -> F   (sibling output of an upstream device — EXCLUDED)
  //   c3: A -> C     (sibling output of the source device — EXCLUDED)
  //   c6: P -> A     (IEC power feed into A — different type — EXCLUDED)
  //   c4: B -> D, c5: B -> E   (downstream branches — INCLUDED)
  const outX = { name: "Out", type: "XLR3", dir: "out" }, inX = { name: "In", type: "XLR3", dir: "in" };
  S.racks = [];
  S.edges = [
    mkDev("Q", "Q Feed", [outX]),
    mkDev("SRC", "Source", [inX, outX, { name: "Out2", type: "XLR3", dir: "out" }]),
    mkDev("A", "Dev A", [inX, { name: "PwrIn", type: "IEC", dir: "in" }, outX, { name: "Out2", type: "XLR3", dir: "out" }]),
    mkDev("B", "Dev B", [inX, outX, { name: "Out2", type: "XLR3", dir: "out" }]),
    mkDev("C", "Dev C", [inX]), mkDev("D", "Dev D", [inX]), mkDev("E", "Dev E", [inX]),
    mkDev("F", "Dev F", [inX]), mkDev("P", "PSU", [{ name: "PwrOut", type: "IEC", dir: "out" }]),
  ];
  S.connections = [
    conn("c7", "Q", "g0", "SRC", "g0", "XLR3"),
    conn("c1", "SRC", "g1", "A", "g0", "XLR3"),
    conn("c8", "SRC", "g2", "F", "g0", "XLR3"),
    conn("c2", "A", "g2", "B", "g0", "XLR3"),
    conn("c3", "A", "g3", "C", "g0", "XLR3"),
    conn("c6", "P", "g0", "A", "g1", "IEC"),
    conn("c4", "B", "g1", "D", "g0", "XLR3"),
    conn("c5", "B", "g2", "E", "g0", "XLR3"),
  ];
  S.ui.view = "rig"; S.ui.rigHideInternal = false;
  win.eval("resetUndoHistory()");
  win.eval("render()"); win.eval("drawWires()");

  // ---- 1. pure logic: traceCableFlow() ----
  assert(win.eval("typeof traceComponent") === "undefined", "old traceComponent() is removed");
  assert(win.eval("typeof traceFrom") === "undefined", "old traceFrom() is removed");
  const res = win.eval("(() => { const r = traceCableFlow('c2'); return { devs: [...r.devs].sort(), conns: [...r.conns].sort(), type: r.type }; })()");
  assert(res.type === "XLR3", "trace result carries the selected cable's type");
  assert(JSON.stringify(res.conns) === JSON.stringify(["c1", "c2", "c4", "c5", "c7"]),
    `included cables = selected + direct upstream chain + all downstream branches (got ${res.conns})`);
  assert(JSON.stringify(res.devs) === JSON.stringify(["A", "B", "D", "E", "Q", "SRC"]),
    `included devices follow the same rule (got ${res.devs})`);
  assert(!res.conns.includes("c3"), "sibling output of the SOURCE device (upstream branch) excluded");
  assert(!res.conns.includes("c8"), "sibling output of an UPSTREAM device excluded");
  assert(!res.conns.includes("c6"), "different-type (IEC) upstream feed excluded");
  assert(win.eval("traceCableFlow('nope')") === null, "unknown connection id returns null, no throw");

  // selecting the most-downstream cable: only its own chain upstream, nothing downstream past it
  const res4 = win.eval("(() => { const r = traceCableFlow('c4'); return [...r.conns].sort(); })()");
  assert(JSON.stringify(res4) === JSON.stringify(["c1", "c2", "c4", "c7"]),
    `tracing a leaf cable walks the full direct chain upstream, no sibling branches (got ${res4})`);

  // untyped cables trace together as their own type
  S.connections.push(conn("u1", "C", "g0", "D", "g0", ""), conn("u2", "D", "g0", "E", "g0", null));
  // (C has only an in port; direction data is what matters to the algorithm, not port dirs)
  const resU = win.eval("(() => { const r = traceCableFlow('u1'); return { conns: [...r.conns].sort(), type: r.type }; })()");
  assert(resU.type === "", "untyped cable traces as the '' type");
  assert(JSON.stringify(resU.conns) === JSON.stringify(["u1", "u2"]), `untyped trace follows only untyped cables (got ${resU.conns})`);
  assert(!resU.conns.includes("c4"), "typed cables excluded from an untyped trace");
  S.connections = S.connections.filter(c => !["u1", "u2"].includes(c.id));

  // cycle safety
  S.connections.push(conn("y1", "D", "g0", "E", "g0", "XLR3"), conn("y2", "E", "g0", "D", "g0", "XLR3"));
  const resY = win.eval("(() => { const r = traceCableFlow('y1'); return [...r.conns].sort(); })()");
  assert(resY.includes("y1") && resY.includes("y2"), "cyclic same-type topology terminates and includes the loop");
  S.connections = S.connections.filter(c => !["y1", "y2"].includes(c.id));

  // ---- 2. UI wiring ----
  win.eval("render()"); win.eval("drawWires()");
  const bTrace = q("#btnTrace");
  assert(!!bTrace, "canvas toolbar has #btnTrace on the Rig view");
  assert(/cable/i.test(bTrace.title) && !/device or cable/i.test(bTrace.title), "Trace tooltip describes the cable-first workflow");
  bTrace.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(win.eval("TRACE_ARMED") === true, "clicking Trace arms trace mode");

  // clicking a DEVICE while armed does NOT trace
  win.eval("drawWires()");
  const nodeA = doc.querySelector('.node[data-dev="A"]');
  nodeA.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(win.eval("TRACE_MEMBERS") === null, "clicking a device while armed does not trace (cable-first workflow)");
  assert(win.eval("TRACE_ARMED") === true, "…and trace mode stays armed");

  // clicking a CABLE traces it
  win.eval("drawWires()");
  doc.querySelector('path.wire[data-id="c2"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(win.eval("TRACE_MEMBERS !== null"), "clicking a cable while armed sets TRACE_MEMBERS");
  assert(win.eval("TRACE_MEMBERS && TRACE_MEMBERS.conns.has('c2') && TRACE_MEMBERS.conns.has('c5') && !TRACE_MEMBERS.conns.has('c3')"),
    "cable click applies the directional type-filtered result");
  win.eval("drawWires()");
  const grpOf = id => { const p = doc.querySelector(`path.wire[data-id="${id}"]`); return p && p.closest(".wire-grp"); };
  assert(grpOf("c2").classList.contains("trace-hi") && grpOf("c4").classList.contains("trace-hi"), "included cables get trace-hi");
  assert(grpOf("c3").classList.contains("trace-dim") && grpOf("c6").classList.contains("trace-dim"), "excluded cables get trace-dim");
  assert(doc.querySelector('.node[data-dev="B"]').classList.contains("trace-hi"), "included device gets trace-hi");
  assert(doc.querySelector('.node[data-dev="C"]').classList.contains("trace-dim"), "excluded device gets trace-dim");
  assert(doc.querySelector('.node[data-dev="P"]').classList.contains("trace-dim"), "different-type feeder device gets trace-dim");

  // classes survive a redraw (drag tick)
  win.eval("drawWires()");
  assert(grpOf("c5").classList.contains("trace-hi") && grpOf("c8").classList.contains("trace-dim"), "trace classes survive a drawWires() redraw");

  // retrace: clicking another cable replaces the set
  doc.querySelector('path.wire[data-id="c6"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(win.eval("TRACE_MEMBERS && TRACE_MEMBERS.type === 'IEC' && TRACE_MEMBERS.conns.size === 1"), "clicking another cable retraces (IEC power run stands alone)");

  // Esc clears and disarms
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(win.eval("TRACE_ARMED") === false && win.eval("TRACE_MEMBERS") === null, "Escape clears the trace and disarms");

  // T shortcut arms; leaving the canvas views auto-disarms
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "t", bubbles: true, cancelable: true }));
  assert(win.eval("TRACE_ARMED") === true, "T shortcut arms trace mode");
  S.ui.view = "racks"; win.eval("render()");
  assert(win.eval("TRACE_ARMED") === false, "switching off Routing/Rig auto-disarms trace");
  S.ui.view = "rig"; win.eval("render()"); win.eval("drawWires()");

  // ---- 3. normal click behavior unaffected when disarmed ----
  doc.querySelector('path.wire[data-id="c2"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(S.ui.selConn === "c2", "cable click-to-select works normally when trace is off");
  assert(win.eval("TRACE_MEMBERS") === null, "…and does not create a trace");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
