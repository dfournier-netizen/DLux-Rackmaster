const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(process.argv[2] || require("path").join(__dirname, "build.html"), "utf-8");
let pass=0, fail=0;
function assert(c,l){ if(c){pass++;} else {fail++; console.log("FAIL:",l);} }
(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, url: "http://localhost/rack.html" });
  const win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 80));
  const btn = doc.getElementById("btnSaveNow");
  assert(!!btn, "Save button exists in topbar");
  win.eval("S.meta.name = 'Saved-Name-Test'");
  win.localStorage.removeItem("dlux-rackmaster-v1");
  btn.click();
  const raw = win.localStorage.getItem("dlux-rackmaster-v1");
  assert(!!raw && JSON.parse(raw).meta.name === "Saved-Name-Test", "clicking Save persists current state to localStorage immediately");
  const toastEl = doc.getElementById("toast");
  assert(toastEl.classList.contains("show") && /saved/i.test(toastEl.textContent), "shows a 'Saved' confirmation toast");
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e.stack || e.message); process.exit(1); });
