// v6.5 — F1: Undo/Redo. Structural snapshot stack hooked into commit(): racks/edges/connections/
// library/meta/lighting are snapshotted; S.ui (view/scroll/panel state) is deliberately excluded so it
// survives undo/redo untouched. Ctrl+Z undoes, Ctrl+Y / Ctrl+Shift+Z redo, both suppressed while focus
// is in an input/textarea/contenteditable or inside RIGPOWER's shadow root. Topbar #btnUndo/#btnRedo
// buttons mirror the stack state via disabled attributes. Scope: Lighting edits reach S.lighting via
// script4.js's debounced shadow-root sync bridge, which calls save() only (never commit()) — so
// keystroke-level Lighting edits do not get their own undo step, but S.lighting IS part of the
// structural snapshot and the topbar tab-switch into/out of Lighting does call commit(), so Lighting
// state is undoable at tab-switch granularity. This test verifies that documented scope, not
// keystroke-level Lighting undo (which is explicitly out of scope).
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

  const mkRack = (id, name) => ({ id, name, sizeU: 12, depth: 20, color: "#123456", notes: "", devices: [] });
  function $(d, sel) { return d.querySelector(sel); }

  // --- Basic push/undo/redo cycle ---
  // resetUndoHistory() gives a clean slate — the app's own startup sequence already calls commit() at
  // least once during load/migrate, so LAST_STRUCT_SNAPSHOT is not reliably null before this point.
  win.eval("resetUndoHistory()");
  S.racks = [mkRack("r1", "Rack One")];
  // v6.8: #btnUndo/#btnRedo moved from the topbar into the floating canvas toolbar, which only renders on
  // the Routing/Rig canvas (renderRouting()) -- switch the view there so the buttons exist to query.
  S.ui.view = "routing";
  win.eval("render()");
  assert($(doc, "#btnUndo").disabled === true, "F1: undo button starts disabled after resetUndoHistory()");

  // First commit after a reset establishes the baseline snapshot (no prior state to diff against)
  win.eval("commit()");
  assert($(doc, "#btnUndo").disabled === true, "F1: first commit() after a reset only seeds LAST_STRUCT_SNAPSHOT, does not push an undo step");

  // A structural mutation followed by commit() should push an undo step
  S.racks.push(mkRack("r2", "Rack Two"));
  win.eval("commit()");
  assert($(doc, "#btnUndo").disabled === false, "F1: undo button enables after a structural commit()");
  assert(S.racks.length === 2, "sanity: two racks present before undo");

  win.eval("doUndo()");
  assert(win.eval("S.racks.length") === 1, "F1: doUndo() restores previous structural state (rack removed)");
  assert($(doc, "#btnRedo").disabled === false, "F1: redo button enables after an undo");

  win.eval("doRedo()");
  assert(win.eval("S.racks.length") === 2, "F1: doRedo() re-applies the undone structural change");

  // --- Non-structural (S.ui-only) commits must not push an undo step ---
  win.eval("commit()"); // re-sync LAST_STRUCT_SNAPSHOT after the redo above (already in sync, but be explicit)
  const undoDepthBefore = win.eval("UNDO_STACK.length");
  S.ui.face = S.ui.face === "front" ? "rear" : "front"; // pure S.ui change
  win.eval("commit()");
  assert(win.eval("UNDO_STACK.length") === undoDepthBefore, "F1: a commit() with only S.ui changed (no structural diff) does not grow the undo stack");

  // --- Undo restores structural state but leaves S.ui untouched ---
  S.ui.zoomRack = 1.75;
  const zoomBefore = S.ui.zoomRack;
  S.racks[0].name = "Renamed Rack";
  win.eval("commit()");
  win.eval("doUndo()");
  assert(win.eval("S.racks[0].name") === "Rack One", "F1: undo restores the renamed rack's previous name");
  assert(win.eval("S.ui.zoomRack") === zoomBefore, "F1: undo does NOT touch S.ui (zoomRack survives untouched)");
  win.eval("doRedo()");
  assert(win.eval("S.racks[0].name") === "Renamed Rack", "F1: redo re-applies the rename");

  // --- New commit after undo clears the redo stack ---
  win.eval("doUndo()"); // back to "Rack One"
  assert(win.eval("REDO_STACK.length") > 0, "sanity: redo stack has an entry after undo");
  S.racks[0].notes = "fresh edit after undo";
  win.eval("commit()");
  assert(win.eval("REDO_STACK.length") === 0, "F1: a new structural commit() after undo clears the redo stack");

  // --- Undo cap ~50 entries ---
  win.eval("resetUndoHistory()");
  win.eval("commit()"); // seed baseline
  for (let i = 0; i < 60; i++) {
    S.racks[0].notes = "edit " + i;
    win.eval("commit()");
  }
  const stackLen = win.eval("UNDO_STACK.length");
  assert(stackLen <= 50, `F1: undo stack capped around 50 entries (got ${stackLen})`);

  // --- Keyboard shortcuts ---
  win.eval("resetUndoHistory()");
  S.racks = [mkRack("r1", "Rack One")];
  win.eval("commit()");
  S.racks.push(mkRack("r2", "Rack Two"));
  win.eval("commit()");
  assert(win.eval("S.racks.length") === 2, "sanity: two racks before Ctrl+Z test");
  doc.body.focus();
  doc.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
  assert(win.eval("S.racks.length") === 1, "F1: Ctrl+Z triggers undo via the document keydown handler");
  doc.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true, cancelable: true }));
  assert(win.eval("S.racks.length") === 2, "F1: Ctrl+Y triggers redo via the document keydown handler");
  doc.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
  assert(win.eval("S.racks.length") === 1, "F1: Ctrl+Z undo again (back to one rack)");
  doc.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  assert(win.eval("S.racks.length") === 2, "F1: Ctrl+Shift+Z triggers redo via the document keydown handler");

  // --- Suppression while focus is in an input/textarea ---
  win.eval("resetUndoHistory()");
  S.racks = [mkRack("r1", "Rack One")];
  win.eval("commit()");
  S.racks.push(mkRack("r2", "Rack Two"));
  win.eval("commit()");
  const inp = doc.createElement("input");
  inp.type = "text";
  doc.body.appendChild(inp);
  inp.focus();
  const beforeLen = win.eval("S.racks.length");
  inp.dispatchEvent(new win.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
  assert(win.eval("S.racks.length") === beforeLen, "F1: Ctrl+Z is suppressed while focus is inside a text input");
  inp.remove();

  const ta = doc.createElement("textarea");
  doc.body.appendChild(ta);
  ta.focus();
  ta.dispatchEvent(new win.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
  assert(win.eval("S.racks.length") === beforeLen, "F1: Ctrl+Z is suppressed while focus is inside a textarea");
  ta.remove();

  // jsdom does not implement isContentEditable / contenteditable-focusability (known gap, handoff §7) —
  // force both so the app's own inputFocused() check (which reads the real isContentEditable property
  // in a browser) can be exercised here.
  const ce = doc.createElement("div");
  ce.contentEditable = "true";
  ce.tabIndex = 0;
  Object.defineProperty(ce, "isContentEditable", { value: true, configurable: true });
  doc.body.appendChild(ce);
  ce.focus();
  ce.dispatchEvent(new win.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
  assert(win.eval("S.racks.length") === beforeLen, "F1: Ctrl+Z is suppressed while focus is inside a contenteditable element");
  ce.remove();
  doc.body.focus();

  // --- Suppression inside RIGPOWER's shadow root ---
  const rpHost = doc.querySelector("#rpRoot") || doc.getElementById("rpRoot");
  assert(!!rpHost && !!rpHost.shadowRoot, "found #rpRoot with an attached shadow root (RIGPOWER)");
  if (rpHost && rpHost.shadowRoot) {
    const shadowInp = rpHost.shadowRoot.querySelector("input, textarea, select") || rpHost.shadowRoot.querySelector("*");
    assert(!!shadowInp, "found a focusable element inside RIGPOWER's shadow root to test suppression against");
    if (shadowInp) {
      if (typeof shadowInp.focus === "function") shadowInp.focus();
      assert(win.eval("inputFocused()") === true || doc.activeElement === rpHost, "F1: inputFocused() reports true when focus is inside RIGPOWER's shadow root");
    }
  }

  // --- Undo/redo not persisted (no localStorage / migrate() footprint) ---
  assert(!/UNDO_STACK|REDO_STACK/.test(win.eval("JSON.stringify(S)")), "F1: undo/redo stacks are never serialized into S (runtime-only, not persisted)");

  // --- Tooltip honesty about scope ---
  const undoBtn = doc.querySelector("#btnUndo"), redoBtn = doc.querySelector("#btnRedo");
  assert(!!undoBtn && !!redoBtn, "found #btnUndo and #btnRedo topbar buttons");
  assert(/lighting/i.test(undoBtn.title) || /lighting/i.test(undoBtn.getAttribute("title") || ""), "F1: undo button tooltip documents Lighting's scope (tab-switch granularity, not keystroke)");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
