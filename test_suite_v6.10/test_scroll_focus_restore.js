// v6.5 — Part D regression: render()'s capture/restore wrapper. render() fully wipes and rebuilds
// #view on every commit; beyond the primary canvas (already handled since v6.3), this checks that
// OTHER scrollable containers (e.g. the library list) keep their scroll position, and that a
// focused input + its caret survive a full re-render, not just the targeted search-box updates.
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

  assert(win.eval("typeof captureUIState") === "function", "Part D: captureUIState() helper exists");
  assert(win.eval("typeof restoreUIState") === "function", "Part D: restoreUIState() helper exists");
  assert(win.eval("typeof renderInner") === "function", "Part D: render() is now a capture/restore wrapper around renderInner()");

  // ---- scroll restore: #libList (a side-panel scrollable container, not the primary canvas) ----
  S.ui.view = "library";
  win.eval("render()");
  const libList = doc.querySelector("#libList");
  assert(!!libList, "found #libList");
  libList.scrollTop = 77;
  win.eval("render()"); // a full re-render, e.g. from an unrelated commit() elsewhere
  const libList2 = doc.querySelector("#libList");
  assert(libList2 !== libList, "sanity: render() really did rebuild the node (new element instance)");
  assert(libList2.scrollTop === 77, `Part D: #libList scrollTop restored across a full render() (got ${libList2.scrollTop})`);

  // ---- focus + caret restore ----
  const libSearch = doc.querySelector("#libSearch");
  libSearch.focus();
  libSearch.value = "hello";
  libSearch.dispatchEvent(new win.Event("input", { bubbles: true })); // sync S.ui.libSearch so the rebuilt input's value isn't empty
  if (typeof libSearch.setSelectionRange === "function") libSearch.setSelectionRange(2, 2);
  assert(doc.activeElement === libSearch, "sanity: #libSearch is focused before render()");
  win.eval("render()");
  const libSearch2 = doc.querySelector("#libSearch");
  assert(doc.activeElement === libSearch2, "Part D: focus restored to the (rebuilt) #libSearch element after a full render()");
  if (typeof libSearch2.selectionStart === "number" && libSearch2.selectionStart != null) {
    assert(libSearch2.selectionStart === 2 && libSearch2.selectionEnd === 2, `Part D: caret position restored (got ${libSearch2.selectionStart})`);
  }

  // ---- floating panel gets a stable data-panel-key for the capture/restore + Escape-hide logic ----
  const floating = doc.querySelector(".floating");
  assert(!!floating, "found a floating side panel");
  assert(!!(floating && floating.dataset.panelKey), "Part D: floating panel carries data-panel-key");

  // ---- Escape hides the focused-within floating panel ----
  S.ui.panelHidden = {};
  const btnInPanel = floating.querySelector("button, input, select");
  if (btnInPanel) btnInPanel.focus();
  const escEvt = new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  (doc.activeElement || floating).dispatchEvent(escEvt);
  const key = floating.dataset.panelKey;
  assert(S.ui.panelHidden && S.ui.panelHidden[key] === true, `Part D: Escape hid the focused-within floating panel (key="${key}")`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
