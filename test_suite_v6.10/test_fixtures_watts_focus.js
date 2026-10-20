const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(process.argv[2] || "build.html", "utf-8");
let pass=0, fail=0;
function assert(c,l){ if(c){pass++;} else {fail++; console.log("FAIL:",l);} }

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  win.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
  win.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  await new Promise(r => setTimeout(r, 150));

  const RP = win.RP;
  assert(!!RP, "window.RP exists");

  win.eval(`S.ui.tab='lighting'; render();`);
  await new Promise(r => setTimeout(r, 50));

  const shadow = RP.host.shadowRoot;
  const fixturesTab = shadow.querySelector('button[data-view="fixtures"]');
  assert(!!fixturesTab, "found Fixtures tab button");
  fixturesTab.click();
  await new Promise(r=>setTimeout(r,50));

  const addBtn = [...shadow.querySelectorAll("button")].find(b=>/Add fixture/i.test(b.textContent||""));
  assert(!!addBtn, "found Add fixture button");
  addBtn.click();
  await new Promise(r=>setTimeout(r,50));

  let wattsInput = shadow.querySelector('input[data-k="watts"]');
  assert(!!wattsInput, "found a watts input in the Fixtures table");

  if (wattsInput) {
    const originalNode = wattsInput;
    for (const ch of ["1","2","3"]) {
      wattsInput.value = (wattsInput.value==="0"?"":wattsInput.value) + ch;
      wattsInput.dispatchEvent(new win.Event("input", { bubbles: true }));
    }
    const stillSameNode = shadow.contains(originalNode) && originalNode.isConnected;
    assert(stillSameNode, "watts input DOM node was NOT replaced/detached after multiple keystrokes (no focus loss)");
    assert(wattsInput.value === "123", `input retained all 3 keystrokes in its value (got "${wattsInput.value}")`);

    wattsInput.dispatchEvent(new win.Event("change", { bubbles: true }));
    await new Promise(r=>setTimeout(r,50));
    const committedState = RP.getState();
    const fx = committedState.state.fixtures[0];
    assert(fx && fx.watts === 123, `watts value committed correctly on change/blur (got ${fx&&fx.watts})`);
  }

  // sanity: also confirm the 'name' text input (a plain, non-numeric field) survives multi-char typing
  const nameInput = shadow.querySelector('input[data-k="name"]');
  if (nameInput) {
    const origName = nameInput;
    for (const ch of ["A","B","C"]) {
      nameInput.value = nameInput.value + ch;
      nameInput.dispatchEvent(new win.Event("input", { bubbles: true }));
    }
    assert(shadow.contains(origName) && origName.isConnected, "name input also survives multi-keystroke typing without being replaced");
    assert(nameInput.value === "ABC", `name input retained all keystrokes (got "${nameInput.value}")`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
